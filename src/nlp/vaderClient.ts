/**
 * Client for the Python VADER sidecar (via Express proxies).
 * When these throw, the Workbench falls back to the built-in rules engine.
 */

import { SentimentLabel } from './sentimentEngine';

export interface VaderEmoji {
  emoji: string;
  count: number;
  compound: number;
  label: SentimentLabel;
}

export interface VaderOverall {
  label: SentimentLabel;
  compound: number;
  pos: number;
  neu: number;
  neg: number;
  emojis: VaderEmoji[];
  emojiCompound: number;
  emojiModel?: string;
  hfTokenConfigured?: boolean;
}

export interface VaderSentence {
  index: number;
  text: string;
  compound: number;
  label: SentimentLabel;
  pos: number;
  neu: number;
  neg: number;
}

async function postJson(url: string, body: unknown): Promise<any> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${url} responded with ${res.status}`);
    const json = await res.json();
    return json;
  } catch (e) {
    setVaderHealth('down');
    throw e;
  }
}

/**
 * Sidecar health tracking. Every real fetch updates it, and a 15s poller
 * (started once in App.tsx) keeps it fresh — so the engine badge heals
 * automatically after `npm run sidecar` is restarted, without typing.
 */
export type VaderHealth = 'up' | 'down' | 'unknown';

let vaderHealth: VaderHealth = 'unknown';
const healthListeners = new Set<(h: VaderHealth) => void>();

function setVaderHealth(h: VaderHealth): void {
  vaderHealth = h;
  for (const cb of healthListeners) cb(h);
}

/** Listen to every health report (poll ticks + real fetches). Returns unsubscribe. */
export function subscribeVaderHealth(cb: (h: VaderHealth) => void): () => void {
  healthListeners.add(cb);
  return () => {
    healthListeners.delete(cb);
  };
}

/** One liveness probe against the Express health endpoint. */
export async function pingVader(): Promise<boolean> {
  try {
    const r = await fetch('/api/py-health');
    const j = await r.json();
    setVaderHealth(j.available ? 'up' : 'down');
    return !!j.available;
  } catch {
    setVaderHealth('down');
    return false;
  }
}

let pollTimer: number | null = null;

/** Start the 15s health poll (idempotent — safe to call from App mount). */
export function startVaderHealthPolling(): void {
  if (pollTimer !== null) return;
  void pingVader();
  pollTimer = window.setInterval(() => {
    void pingVader();
  }, 15000);
}

/** Unwrap an Express proxy response: mark health, throw when sidecar is down. */
function unwrap(r: any): any {
  if (!r.available) {
    setVaderHealth('down');
    throw new Error(r.message || 'VADER sidecar unavailable');
  }
  setVaderHealth('up');
  return r.data;
}

export async function fetchVaderOverall(text: string): Promise<VaderOverall> {
  const data = unwrap(await postJson('/api/py-analyze', { text }));
  return {
    label: data.label,
    compound: data.compound,
    pos: data.scores.pos,
    neu: data.scores.neu,
    neg: data.scores.neg,
    emojis: data.emojis || [],
    emojiCompound: data.emojiCompound ?? 0,
    emojiModel: data.emojiModel || 'Hugging Face (BERT Emoji Sentiment)',
    hfTokenConfigured: data.hfTokenConfigured ?? true,
  };
}

export async function fetchVaderSentences(text: string): Promise<VaderSentence[]> {
  const data = unwrap(await postJson('/api/py-sentences', { text }));
  return data.sentences || [];
}

export async function fetchVaderWords(words: string[]): Promise<number[]> {
  const data = unwrap(await postJson('/api/py-words', { words }));
  return data.scores || [];
}

export interface VaderLineScore {
  compound: number;
  label: SentimentLabel;
}

/** Score many short texts in one roundtrip (Live Comments pull). */
export async function fetchVaderBatch(texts: string[]): Promise<VaderLineScore[]> {
  const data = unwrap(await postJson('/api/py-batch', { texts }));
  return data.results || [];
}

export interface AiScore {
  compound: number;
  label: SentimentLabel;
}

/**
 * Multilingual AI scoring pass — VADER is English-only, so texts it scored
 * exactly 0.00 (South African languages, slang) go to the cheap cloud model
 * in one batched call. Throws when the key is missing or the call fails —
 * callers keep the VADER scores in that case.
 */
export async function fetchAiScores(texts: string[]): Promise<AiScore[]> {
  const r = await postJson('/api/ai-scores', { texts });
  if (!r.available) throw new Error(r.message || 'AI scoring unavailable');
  return r.scores || [];
}
