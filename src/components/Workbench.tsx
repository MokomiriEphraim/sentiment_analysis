import React, { useState, useEffect, useRef } from 'react';
import { 
  Copy, Check, Trash2, AlertCircle, 
  BarChart2, Brain, Volume2
} from 'lucide-react';
import { 
  analyzeSentiment, 
  SentimentAnalysisResult, 
  TokenAnalysis 
} from '../nlp/sentimentEngine';
import { CustomWordRule, EngineSettings } from '../nlp/customRules';
import { fetchVaderOverall, fetchVaderSentences, fetchVaderWords, fetchAiScores, subscribeVaderHealth, VaderEmoji } from '../nlp/vaderClient';

import { VoiceStudio } from './VoiceStudio';
import { NeuralSenseModal } from './NeuralSenseModal';
import { EmojiSentimentPanel } from './EmojiSentimentPanel';
import { SentimentPie } from './SentimentPie';

interface WorkbenchProps {
  customWords: CustomWordRule[];
  engineSettings: EngineSettings;
  text: string;
  onTextChange: (text: string) => void;
  onResultChange?: (result: SentimentAnalysisResult) => void;
}

export const Workbench: React.FC<WorkbenchProps> = ({
  customWords,
  engineSettings,
  text,
  onTextChange,
  onResultChange,
}) => {
  const inputText = text;
  const setInputText = onTextChange;
  const [result, setResult] = useState<SentimentAnalysisResult>(() =>
    analyzeSentiment('', customWords, engineSettings)
  );
  const [selectedToken, setSelectedToken] = useState<TokenAnalysis | null>(null);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [isNeuralModalOpen, setIsNeuralModalOpen] = useState(false);
  const [activeSubView, setActiveSubView] = useState<'analytics' | 'voice'>('analytics');
  const [engineState, setEngineState] = useState<'idle' | 'connecting' | 'vader' | 'fallback'>('idle');
  const [vaderEmoji, setVaderEmoji] = useState<{ emojis: VaderEmoji[]; compound: number } | null>(null);
  const vaderSeqRef = useRef(0);
  // Bumped by the health poller when the sidecar comes back while we're in
  // fallback — re-runs the effect below so scores/badge heal without typing.
  const [vaderRetry, setVaderRetry] = useState(0);

  useEffect(() => {
    if (engineState !== 'fallback') return;
    return subscribeVaderHealth(h => {
      if (h === 'up') setVaderRetry(t => t + 1);
    });
  }, [engineState]);

  // 1) Local rules fill the UI instantly (no waiting while typing).
  // 2) The VADER model (Python sidecar) then overwrites the scores —
  //    overall score, sentences, words, and emojis all come from the model.
  //    If the sidecar is down, the local numbers stay and the badge says "fallback".
  useEffect(() => {
    const localRes = analyzeSentiment(inputText, customWords, engineSettings);
    setResult(localRes);

    const trimmed = inputText.trim();
    const seq = ++vaderSeqRef.current;
    if (!trimmed) {
      setEngineState('idle');
      setVaderEmoji(null);
      return;
    }
    setEngineState('connecting');

    const timer = setTimeout(async () => {
      try {
        const [overall, sentences, wordScores] = await Promise.all([
          fetchVaderOverall(trimmed),
          fetchVaderSentences(trimmed),
          fetchVaderWords(localRes.tokens.map(t => t.normalized)),
        ]);
        if (seq !== vaderSeqRef.current) return;

        // VADER is English-only — exactly 0.00 usually means isiZulu/Sesotho/
        // Afrikaans/slang it can't read → one cheap cloud-AI call refines it.
        let finalCompound = overall.compound;
        let finalLabel = overall.label;
        if (overall.compound === 0) {
          try {
            const aiScores = await fetchAiScores([trimmed]);
            if (aiScores[0]) {
              finalCompound = aiScores[0].compound;
              finalLabel = aiScores[0].label;
            }
          } catch {
            // AI off (no key / error) — keep the neutral score
          }
          if (seq !== vaderSeqRef.current) return;
        }

        setResult(prev => ({
          ...prev,
          compound: finalCompound,
          label: finalLabel,
          posScore: Math.round(overall.pos * 100),
          neuScore: Math.round(overall.neu * 100),
          negScore: Math.round(overall.neg * 100),
          sentences: sentences.map(s => ({
            index: s.index,
            text: s.text,
            compound: s.compound,
            label: s.label,
            posScore: Math.round(s.pos * 100),
            neuScore: Math.round(s.neu * 100),
            negScore: Math.round(s.neg * 100),
            tokens: [],
          })),
          tokens: prev.tokens.map((t, i) => ({
            ...t,
            score: wordScores[i] ?? t.score,
            baseScore: wordScores[i] ?? t.baseScore,
          })),
        }));
        setVaderEmoji({ emojis: overall.emojis, compound: overall.emojiCompound });
        setEngineState('vader');
      } catch {
        if (seq !== vaderSeqRef.current) return;
        setVaderEmoji(null);
        setEngineState('fallback');
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [inputText, customWords, engineSettings, vaderRetry]);

  // Keep the Full Report showing exactly what the Workbench shows
  useEffect(() => {
    onResultChange?.(result);
  }, [result, onResultChange]);

  const handleCopy = () => {
    navigator.clipboard.writeText(inputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setInputText('');
    setSelectedToken(null);
    setActiveSentenceIndex(null);
  };

  const getCompoundColor = (val: number) => {
    if (val >= 0.2) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (val <= -0.2) return 'text-rose-700 bg-rose-50 border-rose-200';
    return 'text-zinc-700 bg-zinc-100 border-zinc-300';
  };

  const getCompoundBarColor = (val: number) => {
    if (val >= 0.2) return 'bg-emerald-600';
    if (val <= -0.2) return 'bg-rose-600';
    return 'bg-zinc-500';
  };

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh_-_9rem)]">
      
      {/* Top Section: compact one-line toolbar */}
      <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-zinc-200">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-base font-semibold text-zinc-900 tracking-tight shrink-0">
            Sentiment Workbench
          </h1>
          <p className="text-xs text-zinc-500 truncate hidden sm:block">
            Analyze one text — see scores by sentence, word, and emoji.
          </p>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsNeuralModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors shadow-xs"
          >
            <Brain className="w-3.5 h-3.5 text-zinc-100" />
            <span>AI Deep Analysis</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left editor & Right top-level metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Left Column: Text Input & Interactive Token Inspector (7 cols) */}
        <div className="lg:col-span-7 space-y-3 min-h-0 lg:overflow-y-auto lg:pr-1">
          
          {/* Editor Container */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden flex flex-col">
            
            {/* Action Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50/80 border-b border-zinc-200 text-xs text-zinc-600">
              <div className="flex items-center gap-3">
                <span>{result.wordCount} words</span>
                <span aria-hidden="true" className="text-zinc-300">·</span>
                <span>{result.sentenceCount} sentences</span>
                <span aria-hidden="true" className="text-zinc-300">·</span>
                <span>~{result.readingTimeSec}s read</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveSubView('voice')}
                  title="Voice input"
                  className={`p-1.5 rounded-md transition-colors ${
                    activeSubView === 'voice' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={handleCopy}
                  title="Copy text"
                  className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 rounded-md transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>

                <button
                  onClick={handleClear}
                  title="Clear text"
                  className="p-1.5 text-zinc-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Input Textarea */}
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste customer feedback, product review, email copy, or tweet to analyze..."
              rows={5}
              className="w-full p-4 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-hidden resize-y min-h-[120px] leading-relaxed font-sans"
            />

            {/* Interactive Token Highlighter View */}
            {result.tokens.length > 0 && (
              <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                    Word Inspector (click any word to check it)
                  </span>
                  <span className="text-xs text-zinc-500">
                    Colored by score
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 p-3 bg-white rounded-lg border border-zinc-200 max-h-40 overflow-y-auto leading-relaxed text-sm">
                  {result.tokens.map((token, i) => {
                    let bgClass = "text-zinc-700 hover:bg-zinc-100";
                    if (token.score > 0) {
                      bgClass = token.score >= 2 
                        ? "bg-emerald-100/80 text-emerald-950 font-medium border border-emerald-200" 
                        : "bg-emerald-50 text-emerald-900 border border-emerald-100";
                    } else if (token.score < 0) {
                      bgClass = token.score <= -2 
                        ? "bg-rose-100/80 text-rose-950 font-medium border border-rose-200" 
                        : "bg-rose-50 text-rose-900 border border-rose-100";
                    } else if (token.role === 'negation') {
                      bgClass = "bg-amber-50 text-amber-900 font-medium border border-amber-200";
                    } else if (token.role === 'intensifier') {
                      bgClass = "bg-indigo-50 text-indigo-900 border border-indigo-100";
                    } else if (token.role === 'aspect') {
                      bgClass = "bg-zinc-100 text-zinc-900 underline decoration-zinc-400 underline-offset-2";
                    }

                    const isSelected = selectedToken?.normalized === token.normalized && selectedToken?.raw === token.raw;

                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedToken(token)}
                        className={`inline-block px-1.5 py-0.5 rounded text-xs transition-all cursor-pointer ${bgClass} ${
                          isSelected ? 'ring-2 ring-zinc-900 ring-offset-1 font-semibold' : ''
                        }`}
                      >
                        {token.raw}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Token Deep-Dive Inspector Panel */}
          {selectedToken && (
            <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-200">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-zinc-900">
                    Word: &ldquo;{selectedToken.raw}&rdquo;
                  </span>
                  <span className="text-xs text-zinc-500 capitalize">
                    (Role: {selectedToken.role})
                  </span>
                </div>
                <div className="text-xs text-zinc-600 flex flex-wrap items-center gap-2">
                  <span>Base Score: <strong className="font-mono tabular-nums">{selectedToken.baseScore > 0 ? `+${selectedToken.baseScore}` : selectedToken.baseScore}</strong></span>
                  <span aria-hidden="true">·</span>
                  <span>Final Score: <strong className="font-mono tabular-nums text-zinc-900">{selectedToken.score > 0 ? `+${selectedToken.score}` : selectedToken.score}</strong></span>
                  {selectedToken.isNegated && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-700 font-medium">Flipped by Negation</span>
                    </>
                  )}
                  {selectedToken.isBoosted && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-indigo-700 font-medium">Boosted by Intensifier</span>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedToken(null)}
                className="text-xs text-zinc-500 hover:text-zinc-900 px-2.5 py-1 rounded border border-zinc-200 hover:bg-zinc-50 transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {/* Feature Sub-Navigation Tabs */}
          <div className="flex items-center gap-1 bg-zinc-200/70 p-1 rounded-xl">
            <button
              onClick={() => setActiveSubView('analytics')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeSubView === 'analytics' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Sentences</span>
            </button>

            <button
              onClick={() => setActiveSubView('voice')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                activeSubView === 'voice' ? 'bg-white text-zinc-900 shadow-2xs font-semibold' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Voice</span>
            </button>
          </div>

          {/* Active Sub-View Panels */}
          {activeSubView === 'analytics' && (
            <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-zinc-700" />
                  <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">
                    Sentence by Sentence
                  </h3>
                </div>
                <span className="text-xs text-zinc-500">
                  Score for each of your {result.sentences.length} sentences
                </span>
              </div>

              <div className="space-y-2">
                {result.sentences.map((sent) => {
                  const isActive = activeSentenceIndex === sent.index;
                  const comp = sent.compound;
                  return (
                    <div
                      key={sent.index}
                      onClick={() => setActiveSentenceIndex(isActive ? null : sent.index)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer ${
                        isActive
                          ? 'border-zinc-900 bg-zinc-50 shadow-2xs'
                          : 'border-zinc-200 hover:border-zinc-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs mb-1">
                        <span className="font-semibold text-zinc-900">
                          #{sent.index + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">
                            Compound: <strong className="font-mono tabular-nums text-zinc-900">{comp > 0 ? `+${comp.toFixed(3)}` : comp.toFixed(3)}</strong>
                          </span>
                          <span className={`px-2 py-0.5 rounded text-2xs font-semibold uppercase ${
                            sent.label === 'Positive' ? 'bg-emerald-100 text-emerald-800' :
                            sent.label === 'Negative' ? 'bg-rose-100 text-rose-800' : 'bg-zinc-100 text-zinc-700'
                          }`}>
                            {sent.label}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-700 leading-relaxed italic">
                        &ldquo;{sent.text}&rdquo;
                      </p>

                      {/* Mini Bar */}
                      <div className="w-full h-1.5 bg-zinc-100 rounded-full mt-2 overflow-hidden flex">
                        <div
                          style={{ width: `${Math.max(4, Math.min(100, (comp + 1) * 50))}%` }}
                          className={`h-full ${getCompoundBarColor(comp)} transition-all duration-300`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSubView === 'voice' && (
            <VoiceStudio
              onAppendTranscript={(spoken) => setInputText(inputText ? inputText + ' ' + spoken : spoken)}
            />
          )}

        </div>

        {/* Right Column: Key Scorecards & Deep Visuals (5 cols) */}
        <div className="lg:col-span-5 space-y-3 min-h-0 lg:overflow-y-auto lg:pr-1">
          
          {/* Primary Compound Scorecard */}
          <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs space-y-3">
            
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  Overall Score
                </span>
                {engineState !== 'idle' && (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-2xs font-medium shrink-0 ${
                    engineState === 'vader'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : engineState === 'fallback'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      engineState === 'vader'
                        ? 'bg-emerald-500'
                        : engineState === 'fallback'
                          ? 'bg-amber-500'
                          : 'bg-zinc-400 animate-pulse'
                    }`} />
                    {engineState === 'vader'
                      ? 'VADER model'
                      : engineState === 'fallback'
                        ? 'VADER offline — fallback'
                        : 'connecting to VADER…'}
                  </span>
                )}
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${getCompoundColor(result.compound)}`}>
                {result.label}
              </span>
            </div>

            {/* Score Big Display */}
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold font-mono tracking-tight text-zinc-900 tabular-nums">
                {result.compound > 0 ? `+${result.compound.toFixed(3)}` : result.compound.toFixed(3)}
              </span>
              <span className="text-xs text-zinc-500">
                From -1 to +1
              </span>
            </div>

            {/* Polar Distribution Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-zinc-600">
                <span className="text-emerald-700 font-medium">Positive {result.posScore}%</span>
                <span className="text-zinc-500 font-medium">Neutral {result.neuScore}%</span>
                <span className="text-rose-700 font-medium">Negative {result.negScore}%</span>
              </div>
              <div className="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden flex">
                <div style={{ width: `${result.posScore}%` }} className="bg-emerald-600 transition-all duration-500" />
                <div style={{ width: `${result.neuScore}%` }} className="bg-zinc-300 transition-all duration-500" />
                <div style={{ width: `${result.negScore}%` }} className="bg-rose-600 transition-all duration-500" />
              </div>
            </div>

            {/* Quick Diagnostic Metrics */}
            <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-zinc-100 text-xs">
              <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-100">
                <div className="text-zinc-500 mb-0.5">Subjectivity</div>
                <div className="text-sm font-semibold font-mono text-zinc-900 tabular-nums">
                  {(result.subjectivity * 100).toFixed(0)}%
                  <span className="text-xs font-normal text-zinc-500 ml-1">
                    ({result.subjectivity > 0.5 ? 'Subjective' : 'Objective'})
                  </span>
                </div>
              </div>

              <div className="p-2 rounded-lg bg-zinc-50 border border-zinc-100">
                <div className="text-zinc-500 mb-0.5">Would Recommend</div>
                <div className="text-sm font-semibold font-mono text-zinc-900 tabular-nums">
                  {result.npsEstimation > 0 ? `+${result.npsEstimation}` : result.npsEstimation}
                </div>
              </div>
            </div>

          </div>

          {/* Sarcasm & Irony Detector Warning */}
          {result.sarcasm.detected && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs uppercase tracking-wider">
                  <AlertCircle className="w-4 h-4 text-amber-700" />
                  Possible Sarcasm Detected
                </div>
                <span className="text-xs font-mono font-medium text-amber-800">
                  {Math.round(result.sarcasm.confidence * 100)}% Confidence
                </span>
              </div>
              <ul className="text-xs text-amber-800/90 space-y-1 pl-5 list-disc">
                {result.sarcasm.signals.map((sig, i) => (
                  <li key={i}>{sig}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Emoji-only sentiment breakdown for the active text */}
          <EmojiSentimentPanel
            text={inputText}
            settings={engineSettings}
            vader={vaderEmoji}
            emotionKey={result.emotions.dominantKey}
            onPickEmoji={e => setInputText(inputText + e)}
          />

          {/* Split of THIS text — sits under the emoji box (user request) */}
          <div className="bg-white rounded-xl border border-zinc-200 p-3 shadow-xs">
            <SentimentPie
              positive={result.posScore}
              neutral={result.neuScore}
              negative={result.negScore}
              title="Sentiment Split"
              subtitle="this text"
              height={160}
            />
          </div>

        </div>

      </div>

      {/* Neural AI Deep Sense Modal */}
      {isNeuralModalOpen && (
        <NeuralSenseModal
          text={inputText}
          onClose={() => setIsNeuralModalOpen(false)}
        />
      )}

    </div>
  );
};
