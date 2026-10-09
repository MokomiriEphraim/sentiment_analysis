import React, { useState, useEffect } from 'react';
import { Brain, Sparkles, X, ShieldAlert, Copy, Check, Loader2, Eye, Target } from 'lucide-react';

interface NeuralSenseModalProps {
  text: string;
  onClose: () => void;
}

interface NeuralData {
  unspokenSubtext: string;
  cognitiveBiases: string[];
  brandDamagePotential: string;
  executiveSummary: string;
  recommendedResolution: string;
}

type RiskTone = 'emerald' | 'amber' | 'rose';

const RISK_LEVEL_TEXT: Record<RiskTone, string> = {
  emerald: 'text-emerald-600',
  amber: 'text-amber-600',
  rose: 'text-rose-600',
};
const RISK_LEVEL_BG: Record<RiskTone, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
};
const RISK_PILL_DARK: Record<RiskTone, string> = {
  emerald: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40',
  amber: 'text-amber-300 bg-amber-500/15 border-amber-500/40',
  rose: 'text-rose-300 bg-rose-500/15 border-rose-500/40',
};

function riskToneOf(label: string): RiskTone {
  const s = label.toLowerCase();
  if (s.includes('severe') || s.includes('high')) return 'rose';
  if (s.includes('moderate')) return 'amber';
  return 'emerald';
}

export const NeuralSenseModal: React.FC<NeuralSenseModalProps> = ({ text, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NeuralData | null>(null);
  const [source, setSource] = useState<string>('cloud');
  const [copied, setCopied] = useState(false);
  const [briefCopied, setBriefCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchNeuralDecomposition() {
      setLoading(true);
      try {
        const response = await fetch('/api/neural-deep-sense', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        const res = await response.json();

        if (isMounted) {
          if (res.available && res.data) {
            setData(res.data);
            setSource(res.source || 'cloud');
          } else {
            // Algorithmic deep cognitive fallback
            setData(generateFallbackCognitiveData(text));
            setSource('deterministic_cognitive_heuristics');
          }
        }
      } catch (err) {
        if (isMounted) {
          setData(generateFallbackCognitiveData(text));
          setSource('deterministic_cognitive_heuristics');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchNeuralDecomposition();

    return () => {
      isMounted = false;
    };
  }, [text]);

  const handleCopyResolution = () => {
    if (data?.recommendedResolution) {
      navigator.clipboard.writeText(data.recommendedResolution);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyBrief = () => {
    if (!data) return;
    const brief = [
      'AI DEEP ANALYSIS',
      `Analyzed text: "${text}"`,
      `SUMMARY\n${data.executiveSummary}`,
      `HIDDEN MEANING & EMOTION\n${data.unspokenSubtext}`,
      `DETECTED THINKING PATTERNS\n${data.cognitiveBiases.join(', ') || 'None detected'}`,
      `RISK TO YOUR REPUTATION\n${data.brandDamagePotential}`,
      `WHAT YOU CAN DO\n${data.recommendedResolution}`,
    ].join('\n\n');
    navigator.clipboard.writeText(brief);
    setBriefCopied(true);
    setTimeout(() => setBriefCopied(false), 2000);
  };

  const riskLabel = data?.brandDamagePotential ?? '';
  const riskTone = riskToneOf(riskLabel);
  const riskLevel = riskLabel.split(/[—-]/)[0].trim() || '—';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-zinc-200 max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">

        {/* Executive header — dark band, risk visible at a glance */}
        <div className="bg-zinc-900 px-6 py-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Brain className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white tracking-tight">
                AI Deep Analysis
              </h2>
              <span className="text-2xs text-zinc-400 font-mono">
                {source.startsWith('deterministic') ? 'Source: built-in rules' : 'Source: cloud AI'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!loading && data && (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-2xs font-semibold ${RISK_PILL_DARK[riskTone]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${RISK_LEVEL_BG[riskTone]}`} />
                {riskLevel} risk
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Analyzed text */}
          <div className="border-l-2 border-zinc-300 pl-3.5">
            <span className="text-2xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
              Analyzed text
            </span>
            <p className="text-xs text-zinc-600 italic leading-relaxed max-h-20 overflow-y-auto">
              &ldquo;{text}&rdquo;
            </p>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-700" />
              <span className="text-xs text-zinc-500 font-medium">
                Reading your text for hidden meaning and patterns…
              </span>
            </div>
          ) : data ? (
            <>
              {/* Executive summary — the one box decision makers actually read */}
              <div className="bg-zinc-900 rounded-xl p-4 space-y-1.5 border border-zinc-800">
                <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-emerald-400">
                  <Sparkles className="w-3 h-3" />
                  Executive Summary
                </span>
                <p className="text-sm font-semibold text-zinc-100 leading-relaxed">
                  {data.executiveSummary}
                </p>
              </div>

              {/* Hidden meaning */}
              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1.5">
                <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-zinc-500">
                  <Eye className="w-3.5 h-3.5" />
                  Hidden Meaning &amp; Emotion
                </span>
                <p className="text-xs text-zinc-700 leading-relaxed">
                  {data.unspokenSubtext}
                </p>
              </div>

              {/* Patterns + reputation risk */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                  <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-zinc-500">
                    <Brain className="w-3.5 h-3.5" />
                    Detected Thinking Patterns
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.cognitiveBiases.length > 0 ? (
                      data.cognitiveBiases.map((bias, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 bg-white border border-zinc-200 rounded-full text-2xs font-medium text-zinc-800 shadow-xs"
                        >
                          {bias}
                        </span>
                      ))
                    ) : (
                      <span className="text-2xs text-zinc-400 italic">None detected</span>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
                  <span className={`flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider ${RISK_LEVEL_TEXT[riskTone]}`}>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Risk to Your Reputation
                  </span>
                  <div className={`text-lg font-bold leading-none ${RISK_LEVEL_TEXT[riskTone]}`}>
                    {riskLevel}
                  </div>
                  {riskLabel !== riskLevel && (
                    <p className="text-2xs text-zinc-500 leading-relaxed">{riskLabel}</p>
                  )}
                  <div className="flex gap-1 pt-0.5">
                    {(['Low', 'Moderate', 'High'] as const).map(seg => {
                      const active =
                        (riskTone === 'emerald' && seg === 'Low') ||
                        (riskTone === 'amber' && seg === 'Moderate') ||
                        (riskTone === 'rose' && seg === 'High');
                      return (
                        <span
                          key={seg}
                          className={`flex-1 text-center text-2xs font-semibold py-1 rounded ${
                            active ? `${RISK_LEVEL_BG[riskTone]} text-white` : 'bg-zinc-200 text-zinc-500'
                          }`}
                        >
                          {seg}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action plan */}
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-emerald-800">
                    <Target className="w-3.5 h-3.5" />
                    What You Can Do
                  </span>
                  <button
                    onClick={handleCopyResolution}
                    className="flex items-center gap-1 text-2xs font-medium text-emerald-800 hover:text-emerald-950 bg-white border border-emerald-300 px-2 py-1 rounded-md hover:bg-emerald-100 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'Copied' : 'Copy Action Plan'}</span>
                  </button>
                </div>
                <p className="text-xs text-zinc-800 leading-relaxed">
                  {data.recommendedResolution}
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-zinc-200 bg-zinc-50/70 shrink-0">
          <button
            onClick={handleCopyBrief}
            disabled={!data || loading}
            className="px-3.5 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-100 transition-colors shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {briefCopied ? 'Brief copied ✓' : 'Copy full brief'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg shadow-xs transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

function generateFallbackCognitiveData(text: string): NeuralData {
  const lower = text.toLowerCase();
  const isNegative = lower.includes('crash') || lower.includes('terrible') || lower.includes('horrible') || lower.includes('nightmare') || lower.includes('cancel');

  if (isNegative) {
    return {
      executiveSummary: "The customer feels ignored and is afraid of losing their money.",
      unspokenSubtext: "Behind the complaint about the problem is a fear of having no control, feeling unheard, and regret about the purchase.",
      cognitiveBiases: ["Unmet Expectations", "Focus on the Negative", "Don't Want to Waste Money"],
      brandDamagePotential: "High — they may warn others away",
      recommendedResolution: "First acknowledge how they feel. Then offer something concrete (a credit or fast-track support) within 60 minutes."
    };
  }

  return {
    executiveSummary: "The customer is proud of their choice and feels good about your brand.",
    unspokenSubtext: "They want their decision confirmed — and could easily recommend you to others.",
    cognitiveBiases: ["Looking for Confirmation", "Favoring Their Own Group", "Halo Effect"],
    brandDamagePotential: "Low — likely to recommend you",
    recommendedResolution: "Invite them to a private beta or advice group to keep them long-term."
  };
}
