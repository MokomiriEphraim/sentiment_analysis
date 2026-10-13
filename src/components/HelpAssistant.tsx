import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react';
import { SentimentAnalysisResult } from '../nlp/sentimentEngine';
import { LiveReportData, buildWorkbenchReport, buildLiveReport, buildCausalReport } from '../lib/reportEmail';
import type { CausalAnalysisResponse } from '../nlp/causalEngine';
import { getDeviceId, getDeviceMeta } from '../lib/device';
import type { NavTab } from './Header';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface HelpAssistantProps {
  activeTab: NavTab;
  /** Workbench state (lifted in App) — what's on the Workbench screen. */
  workbench: { text: string; result: SentimentAnalysisResult };
  /** Live Comments snapshot — null until a pull/history load exists. */
  live: LiveReportData | null;
  /** Latest causal forecast — null until a pipeline run completes. */
  causal: CausalAnalysisResponse | null;
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    "Hi! I'm the Cloud Sentiment assistant — ask me anything: how to pull comments, read a score, use voice input, fix a sidecar error… You can also say e.g. \"send the report to name@gmail.com\" and I'll email it to you.",
};

const EMAIL_RE = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}/;
const EMAIL_GLOBAL_RE = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}/g;
// Send verbs in English + the SA languages (isiZulu thumela, Sesotho/Tswana
// romela, Venda rumela, Tsonga rhumela, Afrikaans stuur, …).
const SEND_VERB_RE = /thumela|romela|rumela|rhumela|rhumele|stuur|posta|\bsend|\bmail\b|\bemail\b|\bdeliver/i;

/**
 * Floating help assistant (bottom-right). Posts the visible history + a
 * snapshot of the on-screen analysis to POST /api/assistant. When the model
 * routes a "send the report to …" intent, the report is packaged from the
 * live app state and delivered via /api/send-report (Resend).
 */
export const HelpAssistant: React.FC<HelpAssistantProps> = ({ activeTab, workbench, live, causal }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /** What's on screen — injected so the assistant knows the current analysis. */
  const buildContext = () => {
    if (activeTab === 'workbench') {
      const t = workbench.text.trim();
      if (!t) return 'Current tab: Sentiment Workbench. No text entered yet.';
      const r = workbench.result;
      return (
        `Current tab: Sentiment Workbench. Analyzed text (${r.wordCount} words): ` +
        `"${t.slice(0, 400)}${t.length > 400 ? '…' : ''}". ` +
        `Score: ${r.compound > 0 ? '+' : ''}${r.compound.toFixed(2)} (${r.label}). ` +
        `Emotion: ${r.emotions.dominantEmotion}. Tone: ${r.tones.primaryTone}. ` +
        `Sarcasm: ${r.sarcasm.detected ? 'detected' : 'no'}. Sentences: ${r.sentenceCount}. ` +
        `A report for this text is ready to email.`
      );
    }
    if (activeTab === 'causal') {
      if (!causal) return 'Current tab: Predictive Causal Forecaster. No forecast has been run yet.';
      const s = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}`;
      return (
        `Current tab: Predictive Causal Forecaster. Latest forecast: "${causal.scenario_title}" ` +
        `(treatment: ${causal.intervention_name}). Baseline ${s(causal.baseline_sentiment_at_zero)} ` +
        `→ predicted nadir ${s(causal.predicted_nadir_sentiment)}, mood shift ${s(causal.treatment_effect_ate)} pts ` +
        `over ${causal.forecast_horizon_hours}h, peak impact in ${causal.time_to_peak_impact_hours?.toFixed(1) ?? '?'}h, ` +
        `robustness ${causal.causal_robustness_score?.toFixed(0) ?? '?'}%. ` +
        `A forecast report for this scenario is ready to email.`
      );
    }
    if (!live) return 'Current tab: Live Comments. No comments loaded yet.';
    return (
      `Current tab: Live Comments. ${live.count} comments loaded from ${live.platform}` +
      `${live.url ? ` (${live.url})` : ''}: ${live.pos} positive, ${live.neu} neutral, ` +
      `${live.neg} negative. A report for this pull is ready to email.`
    );
  };

  const hasReport = () =>
    activeTab === 'causal'
      ? !!causal
      : activeTab === 'workbench'
        ? workbench.text.trim().length > 0
        : !!live && live.count > 0;

  /** Package the on-screen report and POST it to /api/send-report. */
  const deliverReport = async (emails: string[]) => {
    const to = emails.join(', ');
    if (!hasReport()) {
      setMessages(m => [
        ...m,
        {
          role: 'assistant',
          content:
            activeTab === 'causal'
              ? "There's no forecast to send yet — run the pipeline on the Predictive tab first, then ask me again."
              : "There's no completed analysis to send yet — analyze some text (or pull comments) first, then ask me again.",
        },
      ]);
      return;
    }
    const report =
      activeTab === 'causal' && causal
        ? buildCausalReport(causal)
        : activeTab === 'workbench'
          ? buildWorkbenchReport(workbench.result)
          : buildLiveReport(live!);
    setMessages(m => [
      ...m,
      { role: 'assistant', content: `Packaging the report and emailing it to ${to}…` },
    ]);
    try {
      const sendRes = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: emails.length === 1 ? emails[0] : emails,
          subject: report.subject,
          html: report.html,
          text: report.text,
          // Which screen this came from + the device that requested it —
          // the server stores every report in Mongo tied to this device.
          source: activeTab,
          deviceId: getDeviceId(),
          device: getDeviceMeta(),
        }),
      });
      const sendData = await sendRes.json().catch(() => null);
      setMessages(m => [
        ...m,
        {
          role: 'assistant',
          content: sendData?.available
            ? `✅ Report sent to ${to} — subject: "${report.subject}". Delivery usually lands within a few seconds (check spam if not).`
            : `I couldn't send the email: ${sendData?.message || 'unknown error — is the server running?'}`,
        },
      ]);
    } catch {
      setMessages(m => [
        ...m,
        { role: 'assistant', content: 'Could not reach the server — is `npm run dev` running?' },
      ]);
    }
  };

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      // Deterministic fast path: a send verb + at least one address → send
      // it, no model roundtrip (terse phrasings like "send this to x@y.com"
      // can never be misjudged). Skips clear questions ("can I send to…?")
      // which go to the model as normal chat instead.
      const looksLikeQuestion =
        question.includes('?') &&
        /^(can|could|will|would|do|does|did|is|are|should|how|what|why|when|where|if)\b/i.test(question);
      const emailHits = [...question.matchAll(EMAIL_GLOBAL_RE)]
        .map(m => m[0].replace(/[).,;:'"]+$/, '').toLowerCase())
        .filter(t => EMAIL_RE.test(t));
      const uniqueEmails = [...new Set(emailHits)].slice(0, 5);
      if (uniqueEmails.length > 0 && SEND_VERB_RE.test(question) && !looksLikeQuestion) {
        await deliverReport(uniqueEmails);
        return;
      }

      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-14), context: buildContext() }),
      });
      const data = await res.json().catch(() => null);

      if (data?.available && data.intent === 'send_report') {
        const email = String(data.email || '').trim().toLowerCase();
        if (!EMAIL_RE.test(email)) {
          setMessages(m => [
            ...m,
            { role: 'assistant', content: 'Which email address should I send it to? Please include a full address like name@gmail.com.' },
          ]);
          return;
        }
        await deliverReport([email]);
        return;
      }

      setMessages(m => [
        ...m,
        {
          role: 'assistant',
          content: data?.available
            ? data.text || 'Hmm, empty answer — try rephrasing.'
            : data?.message || 'The assistant is unavailable right now.',
        },
      ]);
    } catch {
      setMessages(m => [
        ...m,
        { role: 'assistant', content: 'Could not reach the server — is `npm run dev` running?' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 h-11 px-4 rounded-full shadow-lg border transition-all hover:scale-105 ${
          open
            ? 'bg-zinc-100 border-zinc-300 text-zinc-600'
            : 'bg-zinc-900 border-zinc-800 text-white hover:bg-zinc-800'
        }`}
        title="Help assistant"
        aria-label="Open help assistant"
      >
        {open ? <X className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
        <span className="text-xs font-semibold hidden sm:inline">{open ? 'Close' : 'Ask for help'}</span>
        {!open && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-[calc(100vw-2.5rem)] sm:w-[370px] h-[min(520px,calc(100vh-7rem))] bg-white rounded-2xl border border-zinc-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-200 bg-zinc-50">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-zinc-900 text-white flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-900 leading-tight">Help Assistant</p>
                <p className="text-2xs text-zinc-500 truncate">Scores · comments · voice · setup</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 rounded-lg"
              aria-label="Close assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-white">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-zinc-900 text-zinc-100 rounded-br-sm'
                      : 'bg-zinc-100 text-zinc-800 rounded-bl-sm border border-zinc-200'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl rounded-bl-sm bg-zinc-100 border border-zinc-200 text-xs text-zinc-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-zinc-200 p-2.5 flex items-center gap-2 bg-zinc-50">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) send();
              }}
              placeholder="Ask how to use the app…"
              disabled={loading}
              className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-zinc-300 rounded-lg focus:outline-hidden focus:border-zinc-500 disabled:opacity-60"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="p-2.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              aria-label="Send question"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
