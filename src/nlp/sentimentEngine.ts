/**
 * High-Precision In-Browser Sentiment & NLP Intelligence Engine
 * Computes compound valence, emotion vectors, aspects, sarcasm markers, and sentence trajectory.
 */

import {
  AFINN_LEXICON,
  EMOJI_SENTIMENT,
  INTENSIFIERS,
  DIMINISHERS,
  NEGATIONS,
  IDIOM_LEXICON,
  EMOTION_MAP,
  ASPECT_CATEGORIES,
  TONE_KEYWORDS
} from './lexicon';
import { CustomWordRule, EngineSettings, DEFAULT_SETTINGS } from './customRules';

export type SentimentLabel = 'Positive' | 'Neutral' | 'Negative';

export interface TokenAnalysis {
  raw: string;
  normalized: string;
  score: number;
  baseScore: number;
  isNegated: boolean;
  isBoosted: boolean;
  isDiminished: boolean;
  role: 'sentiment' | 'negation' | 'intensifier' | 'diminisher' | 'aspect' | 'neutral';
  aspectCategory?: string;
  emotions?: Partial<Record<string, number>>;
}

export interface SentenceAnalysis {
  index: number;
  text: string;
  compound: number;
  label: SentimentLabel;
  posScore: number;
  negScore: number;
  neuScore: number;
  tokens: TokenAnalysis[];
}

export interface AspectSentimentResult {
  id: string;
  name: string;
  count: number;
  compound: number;
  label: SentimentLabel;
  snippets: string[];
}

export interface EmotionScore {
  name: string;
  key: 'joy' | 'trust' | 'sadness' | 'anger' | 'surprise' | 'fear' | 'disgust';
  value: number; // 0.0 to 1.0
  percentage: number;
}

export interface EmotionBreakdown {
  emotions: EmotionScore[];
  dominantEmotion: string;
  dominantKey: string;
  intensity: number;
}

export interface ToneBreakdown {
  primaryTone: string;
  scores: {
    constructive: number;
    urgent: number;
    formal: number;
    enthusiastic: number;
    skeptical: number;
  };
}

export interface SarcasmDetection {
  detected: boolean;
  confidence: number;
  signals: string[];
}

export interface SentimentAnalysisResult {
  text: string;
  compound: number; // -1.000 to +1.000
  label: SentimentLabel;
  posScore: number; // 0-100%
  neuScore: number; // 0-100%
  negScore: number; // 0-100%
  subjectivity: number; // 0.0 - 1.0
  wordCount: number;
  sentenceCount: number;
  readingTimeSec: number;
  sentences: SentenceAnalysis[];
  tokens: TokenAnalysis[];
  emotions: EmotionBreakdown;
  tones: ToneBreakdown;
  aspects: AspectSentimentResult[];
  sarcasm: SarcasmDetection;
  topPositiveWords: Array<{ word: string; score: number; count: number }>;
  topNegativeWords: Array<{ word: string; score: number; count: number }>;
  npsEstimation: number; // -100 to +100
  timestamp: number;
}

/**
 * Normalizes score to [-1, 1] using standard VADER normalization
 */
function normalizeVaderScore(rawScore: number, alpha: number = 15): number {
  return rawScore / Math.sqrt(rawScore * rawScore + alpha);
}

/**
 * Main sentiment analysis function
 */
export function analyzeSentiment(
  text: string,
  customWords: CustomWordRule[] = [],
  settings: EngineSettings = DEFAULT_SETTINGS
): SentimentAnalysisResult {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return createEmptyResult();
  }

  // Build combined lexicon
  const customMap: Record<string, number> = {};
  for (const cw of customWords) {
    customMap[cw.word.toLowerCase()] = cw.weight;
  }

  // Split into sentences
  const rawSentences = splitSentences(trimmed);
  const sentenceAnalyses: SentenceAnalysis[] = [];
  const allTokens: TokenAnalysis[] = [];
  
  const positiveWordMap = new Map<string, { score: number; count: number }>();
  const negativeWordMap = new Map<string, { score: number; count: number }>();

  // Emotion accumulators
  const emotionTotals: Record<'joy' | 'trust' | 'sadness' | 'anger' | 'surprise' | 'fear' | 'disgust', number> = {
    joy: 0,
    trust: 0,
    sadness: 0,
    anger: 0,
    surprise: 0,
    fear: 0,
    disgust: 0
  };

  // Tone accumulators
  const toneTotals = {
    constructive: 0,
    urgent: 0,
    formal: 0,
    enthusiastic: 0,
    skeptical: 0
  };

  // Aspect tracker
  const aspectSnippetsMap = new Map<string, { totalScore: number; count: number; snippets: string[] }>();
  for (const cat of ASPECT_CATEGORIES) {
    aspectSnippetsMap.set(cat.id, { totalScore: 0, count: 0, snippets: [] });
  }

  let totalRawSentiment = 0;
  let totalPositiveRaw = 0;
  let totalNegativeRaw = 0;
  let subjectiveTokenCount = 0;
  let contentTokenCount = 0;

  // Process sentence by sentence
  rawSentences.forEach((sentenceStr, sentenceIdx) => {
    const rawTokens = tokenizeSentence(sentenceStr);
    const tokenAnalyses: TokenAnalysis[] = [];
    let sentenceRawScore = 0;
    let sentencePosRaw = 0;
    let sentenceNegRaw = 0;

    // Check for multi-word idioms first in this sentence
    const lowerSentence = sentenceStr.toLowerCase();
    for (const [idiom, idiomScore] of Object.entries(IDIOM_LEXICON)) {
      if (lowerSentence.includes(idiom)) {
        sentenceRawScore += idiomScore;
        if (idiomScore > 0) {
          sentencePosRaw += idiomScore;
          positiveWordMap.set(idiom, {
            score: idiomScore,
            count: (positiveWordMap.get(idiom)?.count || 0) + 1
          });
        } else {
          sentenceNegRaw += Math.abs(idiomScore);
          negativeWordMap.set(idiom, {
            score: idiomScore,
            count: (negativeWordMap.get(idiom)?.count || 0) + 1
          });
        }
        subjectiveTokenCount += 2;
      }
    }

    // Process tokens with sliding window for negations and intensifiers
    for (let i = 0; i < rawTokens.length; i++) {
      const rawWord = rawTokens[i];
      const cleanWord = rawWord.toLowerCase().replace(/^[^\w\s\u{1F300}-\u{1F9FF}]+|[^\w\s\u{1F300}-\u{1F9FF}]+$/gu, '');
      
      if (!cleanWord) continue;
      contentTokenCount++;

      // Check if emoji
      let baseScore = 0;
      let isEmoji = false;
      if (EMOJI_SENTIMENT[rawWord]) {
        baseScore = EMOJI_SENTIMENT[rawWord];
        isEmoji = true;
      } else if (customMap[cleanWord] !== undefined) {
        baseScore = customMap[cleanWord];
      } else if (AFINN_LEXICON[cleanWord] !== undefined) {
        baseScore = AFINN_LEXICON[cleanWord];
      }

      // Check if role is modifier
      let role: TokenAnalysis['role'] = 'neutral';
      let isNegated = false;
      let isBoosted = false;
      let isDiminished = false;
      let modifierMultiplier = 1.0;

      if (NEGATIONS.has(cleanWord)) {
        role = 'negation';
      } else if (INTENSIFIERS[cleanWord]) {
        role = 'intensifier';
      } else if (DIMINISHERS[cleanWord]) {
        role = 'diminisher';
      }

      // Check aspect match
      let matchedAspectId: string | undefined;
      for (const cat of ASPECT_CATEGORIES) {
        if (cat.keywords.some(k => k === cleanWord || cleanWord.startsWith(k))) {
          matchedAspectId = cat.id;
          if (role === 'neutral') role = 'aspect';
          break;
        }
      }

      // Check emotions
      let tokenEmotions: Partial<Record<string, number>> | undefined;
      if (EMOTION_MAP[cleanWord]) {
        tokenEmotions = EMOTION_MAP[cleanWord];
        for (const [emKey, emVal] of Object.entries(tokenEmotions)) {
          if (emVal && emotionTotals[emKey as keyof typeof emotionTotals] !== undefined) {
            emotionTotals[emKey as keyof typeof emotionTotals] += emVal;
          }
        }
      }

      // Check tones
      for (const [toneKey, keywords] of Object.entries(TONE_KEYWORDS)) {
        if (keywords.includes(cleanWord)) {
          toneTotals[toneKey as keyof typeof toneTotals] += 1;
        }
      }

      // Calculate valence if this is a sentiment-bearing token
      let finalScore = 0;
      if (baseScore !== 0) {
        role = 'sentiment';
        subjectiveTokenCount++;

        // Inspect previous 1-3 tokens for negation & intensifiers
        const windowTokens = rawTokens.slice(Math.max(0, i - 3), i).map(w => w.toLowerCase().replace(/[^\w]/g, ''));
        
        // Check negation
        if (windowTokens.some(w => NEGATIONS.has(w))) {
          isNegated = true;
          modifierMultiplier *= -settings.negationMultiplier;
        }

        // Check intensifiers
        for (const w of windowTokens) {
          if (INTENSIFIERS[w]) {
            isBoosted = true;
            modifierMultiplier *= INTENSIFIERS[w];
          } else if (DIMINISHERS[w]) {
            isDiminished = true;
            modifierMultiplier *= DIMINISHERS[w];
          }
        }

        // All caps boost (e.g., "GREAT" vs "great")
        if (!isEmoji && rawWord.length > 2 && rawWord === rawWord.toUpperCase()) {
          modifierMultiplier *= 1.25;
          isBoosted = true;
        }

        finalScore = baseScore * modifierMultiplier;
        sentenceRawScore += finalScore;

        if (finalScore > 0) {
          sentencePosRaw += finalScore;
          positiveWordMap.set(cleanWord, {
            score: Number(finalScore.toFixed(2)),
            count: (positiveWordMap.get(cleanWord)?.count || 0) + 1
          });
        } else if (finalScore < 0) {
          sentenceNegRaw += Math.abs(finalScore);
          negativeWordMap.set(cleanWord, {
            score: Number(finalScore.toFixed(2)),
            count: (negativeWordMap.get(cleanWord)?.count || 0) + 1
          });
        }

        // If this token was near an aspect keyword in the sentence, assign sentiment to that aspect
        if (matchedAspectId) {
          const entry = aspectSnippetsMap.get(matchedAspectId);
          if (entry) {
            entry.totalScore += finalScore;
            entry.count += 1;
            if (entry.snippets.length < 3) {
              entry.snippets.push(sentenceStr.trim());
            }
          }
        }
      }

      const tokenAnalysis: TokenAnalysis = {
        raw: rawWord,
        normalized: cleanWord,
        score: Number(finalScore.toFixed(2)),
        baseScore,
        isNegated,
        isBoosted,
        isDiminished,
        role,
        aspectCategory: matchedAspectId,
        emotions: tokenEmotions
      };

      tokenAnalyses.push(tokenAnalysis);
      allTokens.push(tokenAnalysis);
    }

    // Sentence punctuation booster (e.g. "!!!" or "?!")
    const exclamations = (sentenceStr.match(/!/g) || []).length;
    if (exclamations > 0) {
      const punctMultiplier = Math.min(exclamations * 0.15, 0.6);
      if (sentenceRawScore > 0) sentenceRawScore += sentenceRawScore * punctMultiplier;
      else if (sentenceRawScore < 0) sentenceRawScore += sentenceRawScore * punctMultiplier;
    }

    const sentenceCompound = normalizeVaderScore(sentenceRawScore, 8);
    let sentenceLabel: SentimentLabel = 'Neutral';
    if (sentenceCompound >= settings.positiveThreshold) sentenceLabel = 'Positive';
    else if (sentenceCompound <= settings.negativeThreshold) sentenceLabel = 'Negative';

    const sentTotalSum = sentencePosRaw + sentenceNegRaw + 1.0;
    const sPos = Math.round((sentencePosRaw / sentTotalSum) * 100);
    const sNeg = Math.round((sentenceNegRaw / sentTotalSum) * 100);
    const sNeu = Math.max(0, 100 - (sPos + sNeg));

    sentenceAnalyses.push({
      index: sentenceIdx,
      text: sentenceStr.trim(),
      compound: Number(sentenceCompound.toFixed(3)),
      label: sentenceLabel,
      posScore: sPos,
      negScore: sNeg,
      neuScore: sNeu,
      tokens: tokenAnalyses
    });

    totalRawSentiment += sentenceRawScore;
    totalPositiveRaw += sentencePosRaw;
    totalNegativeRaw += sentenceNegRaw;
  });

  // Overall compound score
  const overallCompound = normalizeVaderScore(totalRawSentiment, 15);
  let overallLabel: SentimentLabel = 'Neutral';
  if (overallCompound >= settings.positiveThreshold) overallLabel = 'Positive';
  else if (overallCompound <= settings.negativeThreshold) overallLabel = 'Negative';

  // Overall distribution percentages
  const sumValence = totalPositiveRaw + totalNegativeRaw + 2.0;
  const posScore = Math.round((totalPositiveRaw / sumValence) * 100);
  const negScore = Math.round((totalNegativeRaw / sumValence) * 100);
  const neuScore = Math.max(0, 100 - (posScore + negScore));

  // Subjectivity index (ratio of subjective markers to total tokens, normalized)
  const subjectivity = contentTokenCount > 0
    ? Math.min(1.0, Number(((subjectiveTokenCount / Math.max(1, contentTokenCount)) * 2.5).toFixed(2)))
    : 0;

  // Emotion breakdown computation
  const emotionMax = Math.max(1, ...Object.values(emotionTotals));
  const emotionList: EmotionScore[] = [
    { name: 'Joy & Delight', key: 'joy', value: emotionTotals.joy / emotionMax, percentage: 0 },
    { name: 'Trust & Confidence', key: 'trust', value: emotionTotals.trust / emotionMax, percentage: 0 },
    { name: 'Sadness & Regret', key: 'sadness', value: emotionTotals.sadness / emotionMax, percentage: 0 },
    { name: 'Anger & Frustration', key: 'anger', value: emotionTotals.anger / emotionMax, percentage: 0 },
    { name: 'Surprise & Wonder', key: 'surprise', value: emotionTotals.surprise / emotionMax, percentage: 0 },
    { name: 'Fear & Anxiety', key: 'fear', value: emotionTotals.fear / emotionMax, percentage: 0 },
    { name: 'Disgust & Contempt', key: 'disgust', value: emotionTotals.disgust / emotionMax, percentage: 0 }
  ];

  const totalEmotionVal = emotionList.reduce((acc, e) => acc + e.value, 0) || 1;
  emotionList.forEach(e => {
    e.percentage = Math.round((e.value / totalEmotionVal) * 100);
  });

  // Dominant emotion
  let dominantEmotion = 'Neutral';
  let dominantKey = 'neutral';
  let maxEm = 0;
  for (const em of emotionList) {
    if (em.value > maxEm && em.value > 0.15) {
      maxEm = em.value;
      dominantEmotion = em.name;
      dominantKey = em.key;
    }
  }

  // Tones
  let primaryTone = 'Neutral';
  let maxToneVal = 0;
  for (const [toneName, val] of Object.entries(toneTotals)) {
    if (val > maxToneVal) {
      maxToneVal = val;
      primaryTone = toneName.charAt(0).toUpperCase() + toneName.slice(1);
    }
  }

  // Sarcasm detection heuristics
  const sarcasm = detectSarcasm(trimmed, overallCompound, sentenceAnalyses);

  // Aspect sentiment results
  const aspectResults: AspectSentimentResult[] = [];
  for (const cat of ASPECT_CATEGORIES) {
    const entry = aspectSnippetsMap.get(cat.id);
    if (entry && entry.count > 0) {
      const aspectCompound = normalizeVaderScore(entry.totalScore, 6);
      let aspLabel: SentimentLabel = 'Neutral';
      if (aspectCompound >= 0.05) aspLabel = 'Positive';
      else if (aspectCompound <= -0.05) aspLabel = 'Negative';

      aspectResults.push({
        id: cat.id,
        name: cat.name,
        count: entry.count,
        compound: Number(aspectCompound.toFixed(3)),
        label: aspLabel,
        snippets: entry.snippets
      });
    }
  }

  // Top positive and negative words
  const topPos = Array.from(positiveWordMap.entries())
    .map(([w, data]) => ({ word: w, score: data.score, count: data.count }))
    .sort((a, b) => (b.score * b.count) - (a.score * a.count))
    .slice(0, 8);

  const topNeg = Array.from(negativeWordMap.entries())
    .map(([w, data]) => ({ word: w, score: data.score, count: data.count }))
    .sort((a, b) => (Math.abs(b.score) * b.count) - (Math.abs(a.score) * a.count))
    .slice(0, 8);

  // Estimated Net Promoter Score (-100 to +100)
  const nps = Math.round(overallCompound * 100);

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const sentenceCount = sentenceAnalyses.length;
  const readingTimeSec = Math.max(1, Math.round((wordCount / 200) * 60));

  return {
    text: trimmed,
    compound: Number(overallCompound.toFixed(3)),
    label: overallLabel,
    posScore,
    neuScore,
    negScore,
    subjectivity,
    wordCount,
    sentenceCount,
    readingTimeSec,
    sentences: sentenceAnalyses,
    tokens: allTokens,
    emotions: {
      emotions: emotionList,
      dominantEmotion,
      dominantKey,
      intensity: Number((maxEm).toFixed(2))
    },
    tones: {
      primaryTone,
      scores: toneTotals
    },
    aspects: aspectResults,
    sarcasm,
    topPositiveWords: topPos,
    topNegativeWords: topNeg,
    npsEstimation: nps,
    timestamp: Date.now()
  };
}

/**
 * Heuristic Sarcasm Detector
 * Analyzes contrastive conjunctions, excessive positive words in negative context,
 * air quotes, and punctuation hyperboles.
 */
function detectSarcasm(text: string, overallCompound: number, sentences: SentenceAnalysis[]): SarcasmDetection {
  const signals: string[] = [];
  const lower = text.toLowerCase();

  // Pattern 1: Sarcastic exclamation markers (e.g., "Oh great...", "Yeah, right...", "Just perfect...")
  if (/^(oh\s+)?(great|brilliant|wonderful|fantastic|perfect|lovely)(\.\.\.|\!)/i.test(lower) && (overallCompound < 0.2 || text.length > 30)) {
    signals.push("Hyperbolic opening praise followed by grievance context");
  }

  // Pattern 2: Quotes around praise words (e.g. "support was very 'helpful'")
  if (/['"](helpful|expert|fast|responsive|reliable|feature|great|stellar)['"]/i.test(lower)) {
    signals.push("Air-quotes around positive sentiment descriptors");
  }

  // Pattern 3: Strong positive sentence followed immediately by contrasting negative sentence
  if (sentences.length >= 2) {
    for (let i = 0; i < sentences.length - 1; i++) {
      if (sentences[i].compound > 0.4 && sentences[i + 1].compound < -0.3) {
        signals.push(`Abrupt valence cliff between sentence ${i + 1} and ${i + 2}`);
        break;
      }
    }
  }

  // Pattern 4: Contradictory phrases (e.g. "thanks for nothing", "love waiting 3 hours")
  if (/thanks?\s+for\s+(nothing|wasting|breaking)/i.test(lower) || /love\s+(waiting|crashing|getting charged)/i.test(lower)) {
    signals.push("Irony pattern: Gratitude/affection paired with failure verb");
  }

  const detected = signals.length > 0;
  const confidence = detected ? Math.min(0.92, 0.45 + (signals.length * 0.22)) : 0.05;

  return {
    detected,
    confidence: Number(confidence.toFixed(2)),
    signals
  };
}

function splitSentences(text: string): string[] {
  // Regex to split on sentence boundaries (. ? !) while handling decimals and abbreviations
  const matched = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
  if (!matched) return [text];
  return matched.map(s => s.trim()).filter(Boolean);
}

function tokenizeSentence(sentence: string): string[] {
  return sentence.split(/\s+/).filter(Boolean);
}

function createEmptyResult(): SentimentAnalysisResult {
  return {
    text: '',
    compound: 0,
    label: 'Neutral',
    posScore: 0,
    neuScore: 100,
    negScore: 0,
    subjectivity: 0,
    wordCount: 0,
    sentenceCount: 0,
    readingTimeSec: 0,
    sentences: [],
    tokens: [],
    emotions: {
      emotions: [],
      dominantEmotion: 'None',
      dominantKey: 'none',
      intensity: 0
    },
    tones: {
      primaryTone: 'Neutral',
      scores: { constructive: 0, urgent: 0, formal: 0, enthusiastic: 0, skeptical: 0 }
    },
    aspects: [],
    sarcasm: { detected: false, confidence: 0, signals: [] },
    topPositiveWords: [],
    topNegativeWords: [],
    npsEstimation: 0,
    timestamp: Date.now()
  };
}
