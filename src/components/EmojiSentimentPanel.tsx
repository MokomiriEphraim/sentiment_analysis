import React, { useMemo } from 'react';
import { Smile } from 'lucide-react';
import { analyzeEmojiSentiment, EmojiSentimentResult, EmojiDriver } from '../nlp/emojiSentiment';
import { VaderEmoji } from '../nlp/vaderClient';
import { SentimentPie } from './SentimentPie';
import { EngineSettings, DEFAULT_SETTINGS } from '../nlp/customRules';

interface EmojiSentimentPanelProps {
  text: string;
  settings?: EngineSettings;
  /** VADER & Hugging Face BERT model emoji scores (Workbench); null/undefined → local lexicon. */
  vader?: { emojis: VaderEmoji[]; compound: number; model?: string } | null;
  /** Dominant emotion key from the analysis — used for emoji suggestions when no emojis are typed. */
  emotionKey?: string;
  /** Called when the user taps a suggested emoji — append it to the text. */
  onPickEmoji: (emoji: string) => void;
}

/** Plain emoji suggestions per emotion — shown only when the text contains no emojis. */
const EMOJI_SUGGESTIONS: Record<string, string[]> = {
  joy: ['😊', '🎉', '❤️'],
  trust: ['🤝', '😌'],
  sadness: ['😢', '😞'],
  anger: ['😠', '😡', '💢'],
  surprise: ['😮', '🤯'],
  fear: ['😨', '😱'],
  disgust: ['🤢', '🤮'],
};

export const EmojiSentimentPanel: React.FC<EmojiSentimentPanelProps> = ({
  text,
  settings = DEFAULT_SETTINGS,
  vader = null,
  emotionKey,
  onPickEmoji,
}) => {
  const local = useMemo(() => analyzeEmojiSentiment(text, settings), [text, settings]);

  const analysis = useMemo<EmojiSentimentResult>(() => {
    if (!vader) return local;
    const drivers: EmojiDriver[] = vader.emojis.map(e => ({
      emoji: e.emoji,
      count: e.count,
      score: e.compound,
      known: true,
      label: e.label,
    }));
    const compound = vader.compound;
    return {
      total: drivers.reduce((n, d) => n + d.count, 0),
      unique: drivers.length,
      known: drivers.reduce((n, d) => n + d.count, 0),
      unknown: 0,
      compound,
      label: compound >= 0.05 ? 'Positive' : compound <= -0.05 ? 'Negative' : 'Neutral',
      positiveCount: drivers.filter(d => d.score > 0).reduce((n, d) => n + d.count, 0),
      negativeCount: drivers.filter(d => d.score < 0).reduce((n, d) => n + d.count, 0),
      neutralCount: drivers.filter(d => d.score === 0).reduce((n, d) => n + d.count, 0),
      drivers,
      topPositive: drivers.filter(d => d.score > 0),
      topNegative: drivers.filter(d => d.score < 0),
    };
  }, [vader, local]);

  const suggestions = EMOJI_SUGGESTIONS[emotionKey ?? ''] ?? [];

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smile className="w-4 h-4 text-zinc-700" />
          <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">
            Emoji Sentiment
          </h3>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            🤗 Hugging Face (BERT)
          </span>
        </div>
        <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${
          analysis.label === 'Positive' ? 'bg-emerald-100 text-emerald-800' :
          analysis.label === 'Negative' ? 'bg-rose-100 text-rose-800' : 'bg-zinc-100 text-zinc-700'
        }`}>
          {analysis.total > 0 ? `${analysis.compound > 0 ? '+' : ''}${analysis.compound.toFixed(3)}` : '—'}
        </span>
      </div>

      {analysis.total === 0 ? (
        <div className="space-y-2.5">
          <p className="text-2xs text-zinc-400 italic">
            {suggestions.length > 0
              ? 'No emojis in your text yet — tap one below or type your own; each one gets scored automatically.'
              : 'No emojis in your text yet — add some and each one gets scored automatically.'}
          </p>
          {suggestions.length > 0 && (
            <div>
              <span className="text-2xs font-semibold uppercase tracking-wider text-zinc-500 block mb-1.5">
                Your tone suggests — tap to add
              </span>
              <div className="flex gap-1.5">
                {suggestions.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => onPickEmoji(e)}
                    title="Add to your text"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-50 border border-zinc-200 text-lg leading-none hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <SentimentPie
            positive={analysis.positiveCount}
            neutral={analysis.neutralCount}
            negative={analysis.negativeCount}
            title="Emoji Breakdown"
            subtitle={`${analysis.total} found`}
            height={140}
          />

          <div className="space-y-3">
            {analysis.topPositive.length > 0 && (
              <div>
                <span className="text-2xs font-semibold text-emerald-800 uppercase tracking-wider block mb-1.5">
                  Positive Emojis (BERT Scored)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.topPositive.slice(0, 8).map(d => (
                    <span
                      key={d.emoji}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-xs font-medium"
                      title={`Hugging Face BERT score: +${d.score} × ${d.count}`}
                    >
                      <span className="text-base leading-none">{d.emoji}</span>
                      <span className="font-mono text-[10px] text-emerald-700 font-bold tabular-nums">+{d.score.toFixed(2)}</span>
                      {d.count > 1 && (
                        <span className="font-mono text-2xs text-emerald-600 tabular-nums">×{d.count}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.topNegative.length > 0 && (
              <div>
                <span className="text-2xs font-semibold text-rose-800 uppercase tracking-wider block mb-1.5">
                  Negative Emojis (BERT Scored)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.topNegative.slice(0, 8).map(d => (
                    <span
                      key={d.emoji}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-50 border border-rose-100 text-xs font-medium"
                      title={`Hugging Face BERT score: ${d.score} × ${d.count}`}
                    >
                      <span className="text-base leading-none">{d.emoji}</span>
                      <span className="font-mono text-[10px] text-rose-700 font-bold tabular-nums">{d.score.toFixed(2)}</span>
                      {d.count > 1 && (
                        <span className="font-mono text-2xs text-rose-600 tabular-nums">×{d.count}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysis.unknown > 0 && (
              <p className="text-2xs text-zinc-500">
                {analysis.unknown} emoji{analysis.unknown === 1 ? '' : 's'} neutral / uncategorized.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dual NLP Model Attribution */}
      <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px] text-zinc-500">
        <span>Dual-Model NLP Engine:</span>
        <span className="font-medium text-zinc-700">Text: VADER • Emojis: Hugging Face (BERT)</span>
      </div>
    </div>
  );
};
