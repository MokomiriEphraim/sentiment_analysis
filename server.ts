import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { Resend } from 'resend';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// OpenAI config (set OPENAI_API_KEY in .env; model/base URL are overridable)
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';

// Resend (email) — key name in the user's .env is RESEND_API; RESEND_API_KEY
// accepted too. `from` must be a verified sender in the Resend dashboard.
const RESEND_KEY = process.env.RESEND_API || process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';

// ── MongoDB (optional): device registry + scraped-comment storage ──
// Lazy, degrade-gracefully like the sidecar: no URI → feature off; connect
// failure → cooldown retry, and scrapes still succeed with saved:false.
let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let mongoRetryAfter = 0;

async function getMongoDb(): Promise<Db | null> {
  const uri = process.env.MONGO_URI;
  if (!uri) return mongoDb;
  if (mongoDb) return mongoDb;
  if (Date.now() < mongoRetryAfter) return null;
  try {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 3000,
      ...(process.env.MONGO_DB ? { dbName: process.env.MONGO_DB } : {}),
    });
    await client.connect();
    mongoClient = client;
    mongoDb = client.db(process.env.MONGO_DB || undefined);
    // Best-effort indexes for the query patterns this app implies.
    await mongoDb.collection('devices').createIndex({ lastSeen: -1 });
    await mongoDb.collection('pulls').createIndex({ deviceId: 1, createdAt: -1 });
    await mongoDb.collection('comments').createIndex({ pullId: 1 });
    await mongoDb.collection('comments').createIndex({ deviceId: 1, createdAt: -1 });
    console.log('MongoDB connected:', process.env.MONGO_DB || '(URI default db)');
    return mongoDb;
  } catch (error: any) {
    console.warn('MongoDB unavailable:', error?.message || String(error));
    mongoRetryAfter = Date.now() + 30_000; // don't hang every request for 3s
    return null;
  }
}

interface PullComment {
  id: number;
  text: string;
  author: string;
}

/**
 * Persist one scrape pull: upsert the device (metadata of the machine that
 * ran it), insert the pull activity record, and insert every comment linked
 * to both. Returns the pull id (string) on success, null on any failure —
 * never breaks the scrape response.
 */
async function recordPull(opts: {
  deviceId: string;
  device: any;
  url: string;
  platform: string;
  provider: string;
  userAgent: string | undefined;
  comments: PullComment[];
}): Promise<string | null> {
  try {
    const db = await getMongoDb();
    if (!db) return null;
    const now = new Date();

    // 1) Device — one doc per browser install, metadata grows over time
    await db.collection<{ _id: string; [key: string]: any }>('devices').updateOne(
      { _id: opts.deviceId },
      {
        $set: {
          lastSeen: now,
          userAgent: opts.userAgent || opts.device?.userAgent || '',
          clientPlatform: opts.device?.platform || '',
          language: opts.device?.language || '',
          screen: opts.device?.screen || '',
          viewport: opts.device?.viewport || '',
          timezone: opts.device?.timezone || '',
        },
        $setOnInsert: { firstSeen: now },
        $inc: { pullCount: 1 },
      },
      { upsert: true }
    );

    // 2) The pull (one activity record per scrape)
    const pull = await db.collection('pulls').insertOne({
      deviceId: opts.deviceId,
      url: opts.url,
      platform: opts.platform,
      provider: opts.provider,
      commentCount: opts.comments.length,
      createdAt: now,
    });

    // 3) Every comment, linked to the pull and the device
    if (opts.comments.length > 0) {
      await db.collection('comments').insertMany(
        opts.comments.map(c => ({
          pullId: pull.insertedId,
          deviceId: opts.deviceId,
          platform: opts.platform,
          url: opts.url,
          text: c.text,
          author: c.author,
          createdAt: now,
        }))
      );
    }
    return String(pull.insertedId);
  } catch (error: any) {
    console.warn('MongoDB save failed:', error?.message || String(error));
    return null;
  }
}

// ── Email a packaged report (Resend) ──
// Called by the help assistant flow: the client builds the report HTML from
// the analysis on screen (Workbench result or Live Comments pull) and posts it
// here with the recipient the user asked for in chat.
app.post('/api/send-report', async (req, res) => {
  try {
    const { subject, html, text } = req.body || {};
    // `to` = one address or an array (up to 5) for multi-recipient sends.
    const rawTo = Array.isArray(req.body?.to) ? req.body.to : [req.body?.to];
    const toList: string[] = rawTo
      .map((t: any) => String(t || '').trim())
      .filter((t: string) => t.length > 0)
      .slice(0, 5);
    const emailOk = (t: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
    if (toList.length === 0 || !toList.every(emailOk)) {
      return res.status(400).json({ available: false, message: 'A valid recipient email address is required.' });
    }
    if (!RESEND_KEY) {
      return res.json({
        available: false,
        message: 'Email is not configured — add RESEND_API to .env and restart the server.',
      });
    }
    if (typeof html !== 'string' || html.length < 50) {
      return res.status(400).json({ available: false, message: 'The report content is missing.' });
    }
    if (html.length > 700_000) {
      return res.json({ available: false, message: 'That report is too large to email.' });
    }

    const resend = new Resend(RESEND_KEY);
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: toList.map(t => t.slice(0, 254)),
      subject: String(subject || 'Cloud Sentiment report').slice(0, 200),
      html,
      text: typeof text === 'string' && text ? text.slice(0, 25000) : undefined,
    });

    if (error) {
      return res.json({ available: false, message: error.message || 'The email could not be sent.' });
    }
    return res.json({ available: true, id: data?.id || null });
  } catch (error: any) {
    console.error('Error in /api/send-report:', error);
    return res.json({
      available: false,
      message: 'The email could not be sent.',
      detail: error?.message || String(error),
    });
  }
});

// ── In-app help assistant ──
// Floating chat widget (bottom-right) — answers "how do I…" questions about
// the app from a curated knowledge-base prompt. Client sends full message
// history; we trim it server-side. Always 200 with available:false on failure.
app.post('/api/assistant', async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages = raw
      .filter(
        (m: any) =>
          m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
      )
      .slice(-14)
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 3000) }));

    // What's on screen right now (tab, scores, pull stats) — lets the
    // assistant answer "how did my analysis do?" and know if a report exists.
    const context =
      typeof req.body?.context === 'string' ? req.body.context.slice(0, 3000) : '';

    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ available: false, message: 'A user message is required.' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.json({ available: false, message: 'The assistant needs OPENAI_API_KEY in .env — add it and restart the server.' });
    }

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.5,
        max_tokens: 600,
        messages: [
          {
            role: 'system',
            content:
              'You are the in-app help assistant for "Cloud Sentiment", a South African sentiment-analysis web app. ' +
              'Answer clearly and concisely in plain English (reply in the user\'s language if they write in isiZulu, Afrikaans, Sesotho, etc.). ' +
              'Use short paragraphs or tight bullet points. Never mention underlying model or provider brand names — you are simply the Cloud Sentiment assistant. ' +
              'Do not invent features that do not exist.\n\n' +
              'App knowledge:\n' +
              '- Two tabs: "Sentiment Workbench" (analyze ONE text: compound scorecard, sentence-by-sentence scores, word scores, emoji panel, Sentiment Split pie, AI Deep Analysis modal, Voice sub-view) and "Live Comments" (paste a TikTok / YouTube / Instagram / Facebook post link → pulls real comments → table + Comment Breakdown pie + filters + negative-spike alert).\n' +
              '- Scoring is two-tier: local rules fill the UI instantly, then the Python VADER model (sidecar on port 8000, `npm run sidecar`) overwrites scores. Badge states: "VADER model" (normal), "connecting…", "VADER offline — fallback" (local rules only — restart the sidecar). Health is polled every 15s and the app re-scores automatically when it returns.\n' +
              '- South African languages: VADER is English-only, so text scoring exactly 0.00 (isiZulu, Sesotho, Setswana, Xitsonga, Afrikaans, slang like "eish") gets one batched cloud-AI re-score — all 11 official SA languages are supported for scoring, voice, and comments.\n' +
              '- Voice input: Workbench → Voice sub-view → pick spoken language (11 SA languages) → Start → talk → Stop & Add to Text. Chrome/Edge transcribe live in the browser (free); Firefox/Safari record and transcribe in the cloud on Stop. Recordings cap at 2 minutes; mic permission required.\n' +
              '- Live Comments extras: **CSV** button in the filter bar exports all loaded comments; **↗ arrow** on a comment loads it into the Workbench for full analysis; **Clear all** (circular arrow, top-right) resets the view; **Pull history** card (only when MongoDB is configured) lists this device\'s saved pulls with View + delete.\n' +
              '- Ports: the APP runs at http://localhost:3000 (`npm run dev`). The VADER sidecar is http://localhost:8000 — it has NO webpage, opening it shows 404 (users sometimes open the wrong port!). Restart `npm run dev` after any server change.\n' +
              '- .env keys (all optional except they enable their feature): OPENAI_API_KEY → AI Deep Analysis, cloud voice transcription, the language pass, and you. APIFY_API_KEY → TikTok/YouTube/Instagram comment scraping. FIRECRAWL_API_KEY → Facebook/X/Reddit scraping. MONGO_URI + MONGO_DB → pull history/persistence, RESEND_API → emailing reports. Missing keys show clear setup messages in the UI.\n' +
              '- Common fixes: scores stuck at 0.00/Neutral → sidecar down or the language pass needed a key; no comments scraped → platform key missing or the post is private/login-walled; microphone errors → allow mic permission in the browser; "nothing works" → confirm the user is on port 3000, not 8000, and that `npm run dev` was restarted.\n\n' +
              'CURRENT ANALYSIS CONTEXT (what is on screen right now):\n' +
              (context || 'No analysis yet.') +
              '\n\nEMAIL ROUTING: If the user\'s latest message clearly asks to send / email / mail the report (or this analysis) to someone, you MUST reply with ONLY a JSON object and absolutely no other text: {"action":"send_report","email":"recipient@domain.com"} — extract the email address from their message (in any language). The address can be anywhere in the message, even in short terse phrasings like \"send this to x@y.com\" or \"send report to mpho at x@y.com\" — if the user asks to send AND an address is present, ALWAYS return the JSON. If they asked to send but gave no email address, reply normally and ask them to include one. You cannot send email yourself — the app routes your JSON reply and delivers the report, then shows your confirmation in chat. Never output that JSON for any other request.',
          },
          ...messages,
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return res.json({ available: false, message: `Assistant error ${response.status}`, detail });
    }

    const completion = await response.json();
    const text = String(completion?.choices?.[0]?.message?.content || '').trim();

    // Intent routing: assistant recognised "email the report to X" → the
    // client builds the report from the on-screen analysis and calls
    // /api/send-report. Tolerate ```json fences around the object.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && parsed.action === 'send_report') {
        return res.json({ available: true, intent: 'send_report', email: String(parsed.email || '') });
      }
    } catch {
      /* not an intent — normal chat reply */
    }

    return res.json({ available: true, source: 'cloud AI', text });
  } catch (error: any) {
    console.error('Error in /api/assistant:', error);
    return res.json({
      available: false,
      message: 'The assistant is unavailable right now.',
      detail: error?.message || String(error),
    });
  }
});

// ── Voice → text (Whisper) ──
// Firefox/Safari have no live Web Speech API, so the client records with
// MediaRecorder and posts the audio here. Chrome/Edge transcribe live in the
// browser instead (free) and never hit this route.
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType, language } = req.body;
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      return res.status(400).json({ available: false, message: 'audioBase64 is required.' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.json({ available: false, message: 'OPENAI_API_KEY not set — voice transcription off.' });
    }

    const bytes = Buffer.from(audioBase64, 'base64');
    if (bytes.length === 0) {
      return res.json({ available: false, message: 'The recording was empty.' });
    }
    if (bytes.length > 9 * 1024 * 1024) {
      return res.json({ available: false, message: 'Recording too long — keep it under about 2 minutes.' });
    }

    const type = typeof mimeType === 'string' && mimeType.startsWith('audio/') ? mimeType : 'audio/webm';
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), `speech.${ext}`);
    form.append('model', TRANSCRIBE_MODEL);
    form.append('response_format', 'json');
    // ISO-639-1 of the language the user picked in the Voice panel (zu, af…)
    if (typeof language === 'string' && /^[a-z]{2,3}$/.test(language)) {
      form.append('language', language);
    }

    const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return res.json({ available: false, message: `Transcription error ${response.status}`, detail });
    }

    const parsed = await response.json().catch(() => ({}));
    const text = String(parsed?.text || '').trim();
    return res.json({ available: true, source: TRANSCRIBE_MODEL, text });
  } catch (error: any) {
    console.error('Error in /api/transcribe:', error);
    return res.json({
      available: false,
      message: 'Transcription failed.',
      detail: error?.message || String(error),
    });
  }
});

// ── Pull history: read back what this device scraped ──
// All three routes are device-scoped: a pull is only visible/deletable to the
// browser id that created it (the UUID in localStorage, sent by the client).

const DEVICE_ID_RE = /^[\w-]{8,64}$/;

// List this device's pulls, newest first (ids are client-side Mongo ObjectIds).
app.get('/api/pulls', async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || '');
    if (!DEVICE_ID_RE.test(deviceId)) {
      return res.json({ available: true, pulls: [] });
    }
    const db = await getMongoDb();
    if (!db) return res.json({ available: false, pulls: [] });
    const pulls = await db
      .collection('pulls')
      .find({ deviceId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return res.json({
      available: true,
      pulls: pulls.map(p => ({
        id: String(p._id),
        url: String(p.url || ''),
        platform: String(p.platform || 'Web'),
        provider: String(p.provider || ''),
        commentCount: Number(p.commentCount) || 0,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : null,
      })),
    });
  } catch (error: any) {
    console.error('Error in GET /api/pulls:', error);
    return res.json({ available: false, pulls: [] });
  }
});

// Comments of one pull — ownership-checked against the device that pulled it.
app.get('/api/pull-comments', async (req, res) => {
  try {
    const pullId = String(req.query.pullId || '');
    const deviceId = String(req.query.deviceId || '');
    if (!DEVICE_ID_RE.test(deviceId) || !/^[0-9a-fA-F]{24}$/.test(pullId)) {
      return res.status(400).json({ available: false, message: 'pullId + deviceId required.' });
    }
    const db = await getMongoDb();
    if (!db) return res.json({ available: false, message: 'Database unreachable.' });

    const oid = new ObjectId(pullId);
    const pull = await db.collection('pulls').findOne({ _id: oid, deviceId });
    if (!pull) {
      return res.status(404).json({ available: false, message: 'Pull not found for this device.' });
    }
    const comments = await db
      .collection('comments')
      .find({ pullId: oid, deviceId })
      .sort({ createdAt: 1 })
      .limit(200)
      .toArray();
    return res.json({
      available: true,
      url: String(pull.url || ''),
      platform: String(pull.platform || 'Web'),
      createdAt: pull.createdAt instanceof Date ? pull.createdAt.toISOString() : null,
      comments: comments.map(c => ({
        id: String(c._id),
        text: String(c.text || ''),
        author: typeof c.author === 'string' && c.author ? c.author : 'Commenter',
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : null,
      })),
    });
  } catch (error: any) {
    console.error('Error in GET /api/pull-comments:', error);
    return res.json({ available: false, message: 'Could not load that pull.' });
  }
});

// Delete a pull + its comments (device-scoped too).
app.delete('/api/pulls/:id', async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || '');
    const pullId = String(req.params.id || '');
    if (!DEVICE_ID_RE.test(deviceId) || !/^[0-9a-fA-F]{24}$/.test(pullId)) {
      return res.status(400).json({ available: false, message: 'pullId + deviceId required.' });
    }
    const db = await getMongoDb();
    if (!db) return res.json({ available: false, message: 'Database unreachable.' });

    const oid = new ObjectId(pullId);
    const pull = await db.collection('pulls').findOne({ _id: oid, deviceId });
    if (!pull) {
      return res.status(404).json({ available: false, message: 'Pull not found for this device.' });
    }
    await db.collection('comments').deleteMany({ pullId: oid, deviceId });
    await db.collection('pulls').deleteOne({ _id: oid, deviceId });
    return res.json({ available: true });
  } catch (error: any) {
    console.error('Error in DELETE /api/pulls/:id:', error);
    return res.json({ available: false, message: 'Could not delete that pull.' });
  }
});

// DB liveness probe (same spirit as /api/py-health)
app.get('/api/db-health', async (_req, res) => {
  const configured = !!process.env.MONGO_URI;
  const db = configured ? await getMongoDb() : null;
  return res.json({
    configured,
    available: !!db,
    dbName: process.env.MONGO_DB || null,
  });
});

// Deep Neural Cognitive Sense API
app.post('/api/neural-deep-sense', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text string is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      // Fallback response if no API key is configured
      return res.json({
        available: false,
        source: 'client_fallback',
        message: 'OPENAI_API_KEY not configured. Add it to .env to enable neural analysis.',
      });
    }

    const prompt = `Analyze the psychological depth, unspoken subtext, cognitive biases, and customer retention impact of the following text:

"${text}"

Provide a structured, rigorous assessment.`;

    const systemInstruction =
      'You are an executive behavioral psychologist and brand sentiment scientist. Return your analysis strictly as JSON matching the requested schema.';

    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'neural_deep_sense',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                unspokenSubtext: {
                  type: 'string',
                  description: 'The real hidden frustration, fear, or desire beneath the literal words.',
                },
                cognitiveBiases: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Detected cognitive patterns (e.g. Negativity Bias, Sunk Cost Fallacy, Expectation Disconfirmation).',
                },
                brandDamagePotential: {
                  type: 'string',
                  description: 'Low, Moderate, High, or Severe brand reputational risk.',
                },
                executiveSummary: {
                  type: 'string',
                  description: 'One-sentence high-level executive takeaway.',
                },
                recommendedResolution: {
                  type: 'string',
                  description: 'Concrete, empathetic tactical action plan to neutralize grievances or maximize loyalty.',
                },
              },
              required: ['unspokenSubtext', 'cognitiveBiases', 'brandDamagePotential', 'executiveSummary', 'recommendedResolution'],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      throw new Error(`OpenAI API error ${response.status}: ${detail}`);
    }

    const completion = await response.json();
    const outputText = completion?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(outputText);

    return res.json({
      available: true,
      source: OPENAI_MODEL,
      data: parsed,
    });
  } catch (error: any) {
    console.error('Error in /api/neural-deep-sense:', error);
    return res.status(500).json({
      available: false,
      error: error.message || 'Internal neural analysis error',
    });
  }
});

// ── Multilingual AI scoring pass ──
// VADER only understands English, so South African languages (isiZulu,
// Sesotho, Afrikaans, Xitsonga, slang…) come back 0.00/Neutral. The client
// batches exactly those zero-score texts into ONE cheap gpt-4o-mini call.
app.post('/api/ai-scores', async (req, res) => {
  try {
    const { texts } = req.body;
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ available: false, message: 'texts array is required.' });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.json({ available: false, message: 'OPENAI_API_KEY not set — AI scoring off.' });
    }

    const capped = texts.slice(0, 60).map(t => String(t).slice(0, 500));
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert multilingual sentiment analyst specializing in South African social media comments. ' +
              'You read English, Afrikaans, isiNdebele, isiXhosa, isiZulu, Sepedi (Northern Sotho), Sesotho, Setswana, ' +
              'siSwati, Tshivenda, Xitsonga, and South African slang/township lingo (e.g. eish, yoh, shap, mara, hai/haai, ' +
              'sawubona, molo, ndiyabonga, siyabonga, ke a go bona, re a go bona, ho ja, ska, o no feta, siyofa, sawubona). ' +
              'Judge each line the way a local would. Return one score per input line in the exact same order: ' +
              'compound from -1 (very negative) to +1 (very positive) — use 0 ONLY when the line is genuinely neutral; ' +
              'label must follow the compound (>= 0.05 Positive, <= -0.05 Negative, else Neutral).',
          },
          {
            role: 'user',
            content: capped.map((t, i) => `${i + 1}. ${t.replace(/\n/g, ' ')}`).join('\n'),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'sentiment_scores',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                scores: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      compound: { type: 'number', description: 'Score from -1 to +1' },
                      label: { type: 'string', enum: ['Positive', 'Neutral', 'Negative'] },
                    },
                    required: ['compound', 'label'],
                  },
                },
              },
              required: ['scores'],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return res.json({ available: false, message: `AI scoring error ${response.status}`, detail });
    }

    const completion = await response.json();
    const outputText = completion?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(outputText);
    const scores = (Array.isArray(parsed?.scores) ? parsed.scores : []).map((s: any) => {
      const compound = Math.max(-1, Math.min(1, Number(s?.compound) || 0));
      const label = s?.label === 'Positive' || s?.label === 'Negative' ? s.label : 'Neutral';
      return { compound, label };
    });

    return res.json({ available: true, source: OPENAI_MODEL, scores });
  } catch (error: any) {
    console.error('Error in /api/ai-scores:', error);
    return res.json({
      available: false,
      message: 'AI scoring failed.',
      detail: error?.message || String(error),
    });
  }
});

// Sidecar liveness probe — the client polls this every 15s so the engine
// badge auto-recovers after `npm run sidecar` is restarted. Any HTTP response
// (even a 404) means the process is alive; only a connection error means down.
app.get('/api/py-health', async (_req, res) => {
  const baseUrl = process.env.PYTHON_URL || 'http://127.0.0.1:8000';
  try {
    await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(1500) });
    return res.json({ available: true });
  } catch {
    return res.json({ available: false });
  }
});

// Python VADER sidecar proxy (optional; start with `npm run sidecar`)
app.post('/api/py-analyze', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text string is required' });
    }

    const baseUrl = process.env.PYTHON_URL || 'http://127.0.0.1:8000';
    const response = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      throw new Error(`Sidecar responded with status ${response.status}`);
    }

    const data = await response.json();
    return res.json({ available: true, source: 'python-vader', data });
  } catch (error: any) {
    return res.json({
      available: false,
      message: 'Python sidecar unreachable. Start it with `npm run sidecar` (needs: pip install -r python/requirements.txt).',
      detail: error.message || String(error),
    });
  }
});

// Python VADER per-sentence scores proxy (used by the Workbench sentence view)
app.post('/api/py-sentences', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text string is required' });
    }

    const baseUrl = process.env.PYTHON_URL || 'http://127.0.0.1:8000';
    const response = await fetch(`${baseUrl}/sentences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      throw new Error(`Sidecar responded with status ${response.status}`);
    }

    const data = await response.json();
    return res.json({ available: true, source: 'python-vader', data });
  } catch (error: any) {
    return res.json({
      available: false,
      message: 'Python service not reachable.',
      detail: error.message || String(error),
    });
  }
});

// Python VADER per-word scores proxy (used by the Workbench word inspector)
app.post('/api/py-words', async (req, res) => {
  try {
    const { words } = req.body;
    if (!Array.isArray(words)) {
      return res.status(400).json({ error: 'words array is required' });
    }

    const baseUrl = process.env.PYTHON_URL || 'http://127.0.0.1:8000';
    const response = await fetch(`${baseUrl}/words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words }),
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      throw new Error(`Sidecar responded with status ${response.status}`);
    }

    const data = await response.json();
    return res.json({ available: true, source: 'python-vader', data });
  } catch (error: any) {
    return res.json({
      available: false,
      message: 'Python service not reachable.',
      detail: error.message || String(error),
    });
  }
});

// Python VADER batch proxy (Live Comments: score the whole pull in one call)
app.post('/api/py-batch', async (req, res) => {
  try {
    const { texts } = req.body;
    if (!Array.isArray(texts)) {
      return res.status(400).json({ error: 'texts array is required' });
    }

    const baseUrl = process.env.PYTHON_URL || 'http://127.0.0.1:8000';
    const response = await fetch(`${baseUrl}/analyze-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      throw new Error(`Sidecar responded with status ${response.status}`);
    }

    const data = await response.json();
    return res.json({ available: true, source: 'python-vader', data });
  } catch (error: any) {
    return res.json({
      available: false,
      message: 'Python service not reachable.',
      detail: error.message || String(error),
    });
  }
});

// Firecrawl comment scraper (LiveStream): pull real comments from a social post URL
function detectPlatform(url: URL): string {
  const host = url.hostname.replace(/^www\./, '');
  if (host.includes('tiktok')) return 'TikTok';
  if (host.includes('youtube') || host === 'youtu.be') return 'YouTube';
  if (host.includes('instagram')) return 'Instagram';
  if (host.includes('facebook') || host === 'fb.watch') return 'Facebook';
  if (host.includes('twitter') || host.includes('x.com')) return 'X';
  if (host.includes('reddit')) return 'Reddit';
  return host;
}

// Runs an Apify actor synchronously and returns its dataset items (or a
// user-friendly error — 402/credit problems are mapped to a clear message).
async function runApifyActor(
  actorId: string,
  input: unknown
): Promise<{ items: any[] } | { error: string }> {
  const token = process.env.APIFY_API_KEY;
  if (!token) {
    return { error: 'Apify is not configured — add APIFY_API_KEY to .env and restart the server.' };
  }
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=170`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(175000),
    }
  );
  const items = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = items?.error || items?.message || `Apify responded with ${res.status}`;
    const isCredits = res.status === 402 || /credit|payment|billing|insufficient/i.test(String(msg));
    return {
      error: isCredits
        ? 'Apify is out of credits — check your Apify Console billing page.'
        : `Apify error: ${msg}`,
    };
  }
  if (!Array.isArray(items)) {
    return { error: 'Apify returned an unexpected response — try again.' };
  }
  return { items };
}

function mapComments(
  raw: any[],
  getText: (item: any) => unknown,
  getAuthor: (item: any) => unknown
) {
  return raw
    .filter(it => it && typeof getText(it) === 'string' && String(getText(it)).trim().length > 0)
    .slice(0, 100)
    .map((it, i) => ({
      id: i + 1,
      text: String(getText(it)).trim().slice(0, 1000),
      author:
        typeof getAuthor(it) === 'string' && getAuthor(it) ? String(getAuthor(it)).slice(0, 80) : 'Commenter',
    }));
}

app.post('/api/scrape-comments', async (req, res) => {
  try {
    const { url, deviceId, device } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ available: false, message: 'A post URL is required.' });
    }
    // Device that ran this pull — links the pull + comments to its Mongo doc
    const devId =
      typeof deviceId === 'string' && /^[\w-]{8,64}$/.test(deviceId)
        ? deviceId
        : `device-${globalThis.crypto.randomUUID()}`;

    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      return res.status(400).json({ available: false, message: 'That does not look like a valid URL.' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ available: false, message: 'Only http/https links are supported.' });
    }

    const platform = detectPlatform(parsed);

    // ── TikTok / Instagram / YouTube → Apify ──
    // (Firecrawl refuses tiktok.com, can't log into IG, and returns 0 YT
    // comments — each platform has a dedicated Apify actor instead.)
    if (platform === 'TikTok' || platform === 'Instagram' || platform === 'YouTube') {
      const token = process.env.APIFY_API_KEY;
      if (!token) {
        return res.json({
          available: false,
          message: `${platform} comments run through Apify — add APIFY_API_KEY to .env (free account: Console → Settings → Integrations) and restart the server.`,
        });
      }

      let actorId: string;
      let input: unknown;
      if (platform === 'TikTok') {
        actorId = 'GdWCkxBtKWOsKjdch';
        input = {
          postURLs: [parsed.toString()],
          resultsPerPage: 1,
          commentsPerPost: 50,
          topLevelCommentsPerPost: 50,
          maxRepliesPerComment: 0,
          profileScrapeSections: ['videos'],
          profileSorting: 'latest',
          excludePinnedPosts: false,
          searchSection: '',
          maxProfilesPerQuery: 10,
          videoSearchSorting: 'MOST_RELEVANT',
          videoSearchDateFilter: 'ALL_TIME',
          scrapeRelatedSearchWords: false,
          scrapeRelatedVideos: false,
          scrapeAdditionalAuthorMeta: false,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSlideshowImages: false,
          shouldDownloadAvatars: false,
          shouldDownloadMusicCovers: false,
          downloadSubtitlesOptions: 'NEVER_DOWNLOAD_SUBTITLES',
          aiVideoDescription: false,
          aiVideoSummary: false,
          proxyCountryCode: 'None',
        };
      } else if (platform === 'Instagram') {
        actorId = 'shu8hvrXbJbY3Eb9W';
        input = {
          directUrls: [parsed.toString()],
          resultsType: 'comments',
          resultsLimit: 50,
          addParentData: false,
        };
      } else {
        actorId = 'p7UMdpQnjKmmpR21D';
        input = {
          startUrls: [{ url: parsed.toString() }],
          maxComments: 50,
        };
      }

      const run = await runApifyActor(actorId, input);
      if ('error' in run) return res.json({ available: false, message: run.error });
      const items = run.items;
      if (items.length === 0) {
        return res.json({ available: false, message: 'Apify found nothing for that link — check the URL.' });
      }

      if (platform === 'Instagram') {
        const comments = mapComments(
          items,
          it => it.text,
          it => it.ownerUsername
        );
        if (comments.length === 0) {
          return res.json({
            available: false,
            message:
            'Instagram returned no comments — the post may be private or have comments disabled. (Free Apify plans get ~15 comments per post.)',
        });
      }
      const igPullId = await recordPull({
        deviceId: devId, device, url: parsed.toString(), platform, provider: 'apify',
        userAgent: req.headers['user-agent'], comments,
      });
      return res.json({ available: true, platform, comments, pullId: igPullId, saved: igPullId !== null });
      }

      if (platform === 'YouTube') {
        const friendly: Record<string, string> = {
          NO_COMMENTS: 'That video has no comments — comments may be turned off for it.',
          VIDEO_UNAVAILABLE: 'That video is unavailable (deleted, private, or region-blocked).',
          AGE_RESTRICTED: 'That video is age-restricted and can’t be read without a login.',
          NOT_FOUND: 'That link does not match a YouTube video.',
          NO_VALID_START_URLS: 'That does not look like a YouTube video URL.',
          INVALID_INPUT: 'That does not look like a valid YouTube video URL.',
        };
        if (items.every(it => it && it.error)) {
          const first = items.find(it => it && it.error);
          return res.json({
            available: false,
            message: friendly[String(first.error)] || `Apify could not read that video: ${first.error}`,
          });
        }
        const comments = mapComments(
          items,
          it => it.comment,
          it => it.author
        );
        if (comments.length === 0) {
          return res.json({
            available: false,
          message: 'That video has no readable comments — try another one.',
        });
      }
      const ytPullId = await recordPull({
        deviceId: devId, device, url: parsed.toString(), platform, provider: 'apify',
        userAgent: req.headers['user-agent'], comments,
      });
      return res.json({ available: true, platform, comments, pullId: ytPullId, saved: ytPullId !== null });
      }

      // ── TikTok: comments live in a separate dataset linked from the video item ──
      const video: any = items[0];
      if (video.errorCode || video.error) {
        const friendly: Record<string, string> = {
          POST_NOT_FOUND_OR_PRIVATE: 'That post was not found — it may be private or deleted.',
          POST_SENSITIVE: 'That post is flagged as sensitive content.',
          NOT_FOUND: 'That link does not match a TikTok video.',
          INVALID_URLS: 'That does not look like a valid TikTok video URL.',
        };
        return res.json({
          available: false,
          message: friendly[video.errorCode] || `Apify could not read that post: ${video.error}`,
        });
      }

      // Comments live in a separate dataset linked from the video item
      let rawComments: any[] = Array.isArray(video.comments) ? video.comments : [];
      if (rawComments.length === 0 && typeof video.commentsDatasetUrl === 'string') {
        try {
          const dsRes = await fetch(video.commentsDatasetUrl, { signal: AbortSignal.timeout(25000) });
          const dsItems = await dsRes.json().catch(() => null);
          if (dsRes.ok && Array.isArray(dsItems)) rawComments = dsItems;
        } catch {
          // fall through → friendly empty message below
        }
      }

      const comments = rawComments
        .filter((c: any) => c && typeof c.text === 'string' && c.text.trim().length > 0)
        .slice(0, 100)
        .map((c: any, i: number) => ({
          id: i + 1,
          text: c.text.trim().slice(0, 1000),
          author:
            typeof c.uniqueId === 'string' && c.uniqueId ? c.uniqueId.slice(0, 80) : 'Commenter',
        }));

      if (comments.length === 0) {
        return res.json({
          available: false,
          message: `Video found (${video.commentCount ?? 0} comments on TikTok) but no comments came back — try again.`,
        });
      }

      const ttPullId = await recordPull({
        deviceId: devId, device, url: parsed.toString(), platform: 'TikTok', provider: 'apify',
        userAgent: req.headers['user-agent'], comments,
      });
      return res.json({
        available: true,
        platform: 'TikTok',
        pageTitle: typeof video.text === 'string' ? video.text : '',
        comments,
        pullId: ttPullId,
        saved: ttPullId !== null,
      });
    }

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return res.json({
        available: false,
        message: 'Firecrawl is not configured — add FIRECRAWL_API_KEY to .env and restart the server.',
      });
    }

    const response = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: parsed.toString(),
        onlyMainContent: false,
        timeout: 90000,
        maxAge: 0, // always fetch fresh — the user wants real-time comments
        // comments lazy-load below the fold — wait, then scroll three times
        actions: [
          { type: 'wait', milliseconds: 3000 },
          { type: 'scroll', direction: 'down' },
          { type: 'wait', milliseconds: 1500 },
          { type: 'scroll', direction: 'down' },
          { type: 'wait', milliseconds: 1500 },
          { type: 'scroll', direction: 'down' },
          { type: 'wait', milliseconds: 2000 },
        ],
        formats: [
          {
            type: 'json',
            prompt:
              'Extract every user comment/reply visible on this social media page (comments section of a TikTok, YouTube, Instagram or Facebook post). For each comment return its full text and the author display name if shown. Skip the post description, likes counts, UI labels, buttons and ads. If no comments are visible, return an empty comments array.',
            schema: {
              type: 'object',
              properties: {
                comments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', description: 'The comment text' },
                      author: { type: 'string', description: 'The commenter display name' },
                    },
                    required: ['text'],
                  },
                },
              },
              required: ['comments'],
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(100000),
    });

    const raw = await response.json().catch(() => null);

    if (!response.ok || !raw?.success) {
      const msg = raw?.error || `Firecrawl responded with ${response.status}`;
      const isCredits =
        response.status === 402 || /credit|payment|billing/i.test(String(msg));
      return res.json({
        available: false,
        message: isCredits
          ? 'Firecrawl is out of credits or needs a paid plan — check your Firecrawl dashboard.'
          : `Firecrawl error: ${msg}`,
      });
    }

    const extracted = raw?.data?.json ?? raw?.data?.extract ?? null;
    const rawComments = Array.isArray(extracted?.comments) ? extracted.comments : [];
    const comments = rawComments
      .filter((c: any) => c && typeof c.text === 'string' && c.text.trim().length > 0)
      .slice(0, 100)
      .map((c: any, i: number) => ({
        id: i + 1,
        text: c.text.trim().slice(0, 1000),
        author:
          typeof c.author === 'string' && c.author.trim() ? c.author.trim().slice(0, 80) : 'Commenter',
      }));

    const fcPullId = await recordPull({
      deviceId: devId, device, url: parsed.toString(), platform: detectPlatform(parsed), provider: 'firecrawl',
      userAgent: req.headers['user-agent'], comments,
    });
    return res.json({
      available: true,
      platform: detectPlatform(parsed),
      pageTitle: typeof raw?.data?.metadata?.title === 'string' ? raw.data.metadata.title : '',
      comments,
      pullId: fcPullId,
      saved: fcPullId !== null,
    });
  } catch (error: any) {
    return res.json({
      available: false,
      message: 'Could not reach Firecrawl (request timed out or network error).',
      detail: error?.message || String(error),
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server listening on port ${port} (mode: ${isDev ? 'development' : 'production'})`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;

