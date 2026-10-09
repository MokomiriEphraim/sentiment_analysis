/**
 * Emoji-only sentiment analysis.
 * Extracts emoji sequences from text and scores them against EMOJI_SENTIMENT,
 * producing a VADER-normalized compound plus a Positive/Negative/Neutral
 * occurrence split suitable for pie charts.
 */

import { EMOJI_SENTIMENT } from './lexicon';
import { SentimentLabel } from './sentimentEngine';
import { DEFAULT_SETTINGS, EngineSettings } from './customRules';

export interface EmojiDriver {
  emoji: string;
  count: number;
  score: number; // per-occurrence valence from the lexicon (0 = unknown)
  known: boolean;
  label: SentimentLabel;
}

export interface EmojiSentimentResult {
  total: number; // total emoji occurrences
  unique: number;
  known: number;
  unknown: number;
  compound: number; // -1..1, VADER-normalized
  label: SentimentLabel;
  positiveCount: number; // occurrence counts for pie chart
  neutralCount: number;
  negativeCount: number;
  drivers: EmojiDriver[]; // sorted by absolute impact (score * count)
  topPositive: EmojiDriver[];
  topNegative: EmojiDriver[];
}

/**
 * Matches single emoji, VS16 variation (e.g. ❤️), skin-tone modifiers,
 * and simple ZWJ sequences (e.g. 🤦‍♂️) — the shapes used in EMOJI_SENTIMENT.
 */
const EMOJI_PATTERN =
  /(?:\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)?)+/gu;

export function extractEmojis(text: string): string[] {
  return text.match(EMOJI_PATTERN) || [];
}

function normalize(rawScore: number, alpha: number): number {
  return rawScore / Math.sqrt(rawScore * rawScore + alpha);
}

export function analyzeEmojiSentiment(
  text: string,
  settings: EngineSettings = DEFAULT_SETTINGS
): EmojiSentimentResult {
  const occurrences = extractEmojis(text || '');
  const counts = new Map<string, number>();
  for (const e of occurrences) {
    counts.set(e, (counts.get(e) || 0) + 1);
  }

  let rawTotal = 0;
  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;
  let known = 0;
  let unknown = 0;
  const drivers: EmojiDriver[] = [];

  for (const [emoji, count] of counts) {
    const score = EMOJI_SENTIMENT[emoji] ?? 0;
    const isKnown = score !== 0;
    if (isKnown) known += count;
    else unknown += count;

    rawTotal += score * count;

    let label: SentimentLabel = 'Neutral';
    if (score > 0) {
      label = 'Positive';
      positiveCount += count;
    } else if (score < 0) {
      label = 'Negative';
      negativeCount += count;
    } else {
      neutralCount += count;
    }

    drivers.push({ emoji, count, score, known: isKnown, label });
  }

  drivers.sort((a, b) => Math.abs(b.score * b.count) - Math.abs(a.score * a.count));

  const compound = occurrences.length > 0 ? Number(normalize(rawTotal, 8).toFixed(3)) : 0;
  let label: SentimentLabel = 'Neutral';
  if (compound >= settings.positiveThreshold) label = 'Positive';
  else if (compound <= settings.negativeThreshold) label = 'Negative';

  return {
    total: occurrences.length,
    unique: drivers.length,
    known,
    unknown,
    compound,
    label,
    positiveCount,
    neutralCount,
    negativeCount,
    drivers,
    topPositive: drivers.filter(d => d.label === 'Positive'),
    topNegative: drivers.filter(d => d.label === 'Negative')
  };
}
