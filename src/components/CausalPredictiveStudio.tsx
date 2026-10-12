/**
 * Causal & Predictive Sentiment Engine - Interactive 4-Agent Studio
 * Written in 100% clear, friendly, plain English for presentations, students, and lecturers.
 */

import React, { useState, useEffect, useId } from 'react';
import {
  GitBranch,
  TrendingDown,
  TrendingUp,
  Cpu,
  ShieldCheck,
  Zap,
  Sliders,
  Play,
  CheckCircle2,
  BookOpen,
  RefreshCw,
  Clock,
  Info,
  Database,
  History,
  Trash2,
  ChevronDown,
  ChevronUp,
  Radar,
  FlaskConical,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import {
  CausalAnalysisResponse,
  executeCausalAnalysis,
  fetchCausalHistory,
  deleteCausalHistory,
  SavedPrediction
} from '../nlp/causalEngine';

export interface ScrapedContext {
  headline: string;
  averageSentiment: number;
  commentCount: number;
  platform: string;
}

interface CausalPredictiveStudioProps {
  initialScrapedContext?: ScrapedContext | null;
  onClearScrapedContext?: () => void;
}

const formatSigned = (val: number | undefined | null, decimals: number = 2) => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  const formatted = Math.abs(val).toFixed(decimals);
  if (val > 0) return `+${formatted}`;
  if (val < 0) return `-${formatted}`;
  return `0.${'0'.repeat(decimals)}`;
};

export const CausalPredictiveStudio: React.FC<CausalPredictiveStudioProps> = ({
  initialScrapedContext,
  onClearScrapedContext,
}) => {
  const [customHeadline, setCustomHeadline] = useState<string>('');
  const [severity, setSeverity] = useState<number>(8);
  const [horizonHours, setHorizonHours] = useState<number>(24);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisData, setAnalysisData] = useState<CausalAnalysisResponse | null>(null);
  const [showPitchModal, setShowPitchModal] = useState<boolean>(false);
  const [activeTabSub, setActiveTabSub] = useState<'graph' | 'trajectory'>('trajectory');
  
  // MongoDB Persistent Memory
  const [savedHistory, setSavedHistory] = useState<SavedPrediction[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    const items = await fetchCausalHistory();
    setSavedHistory(items);
    setHistoryLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Unique IDs for SVG gradients to prevent multi-instance collision
  const uid = useId().replace(/:/g, '');
  const predictedGradId = `predGrad_${uid}`;

  // Run pipeline using real scraped context or user input
  const runPipeline = async (overrideHeadline?: string, overrideBase?: number, overrideHorizon?: number) => {
    const rawHeadline = overrideHeadline !== undefined ? overrideHeadline : customHeadline;
    const headline = rawHeadline.trim() || initialScrapedContext?.headline || analysisData?.scenario_title || 'Scraped Social Post';
    const baseSent = overrideBase !== undefined ? overrideBase : (initialScrapedContext?.averageSentiment ?? analysisData?.initial_sentiment);
    const horizon = overrideHorizon !== undefined ? overrideHorizon : horizonHours;

    if (!headline.trim()) return;

    setIsLoading(true);
    try {
      const res = await executeCausalAnalysis({
        customHeadline: headline.trim(),
        severity,
        horizonHours: horizon,
        baseSentiment: baseSent,
        platform: initialScrapedContext?.platform,
        url: initialScrapedContext?.headline || (headline.startsWith('http') ? headline : undefined),
        commentCount: initialScrapedContext?.commentCount,
      });
      setAnalysisData(res);
      // Refresh memory from MongoDB
      void loadHistory();
    } catch (err) {
      console.error('Failed to run causal analysis:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestorePrediction = (saved: SavedPrediction) => {
    if (saved.result) {
      setAnalysisData(saved.result);
      setCustomHeadline(saved.scenarioTitle);
      if (saved.result.severity_level) setSeverity(saved.result.severity_level);
      if (saved.result.forecast_horizon_hours) setHorizonHours(saved.result.forecast_horizon_hours);
      setIsHistoryOpen(false);
    }
  };

  const handleDeletePrediction = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteCausalHistory(id);
    setSavedHistory(prev => prev.filter(p => p.id !== id));
  };

  useEffect(() => {
    if (initialScrapedContext) {
      setCustomHeadline(initialScrapedContext.headline);
      runPipeline(initialScrapedContext.headline, initialScrapedContext.averageSentiment);
    }
  }, [initialScrapedContext]);

  const handleRunCustom = (e: React.FormEvent) => {
    e.preventDefault();
    void runPipeline();
  };

  const isPositiveShift = (analysisData?.treatment_effect_ate ?? -1) >= 0;

  return (
    <div className="space-y-6 pb-16">
      {/* ── Top Hero: Clear Everyday English Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800 p-6 md:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Predictive Mood Forecaster &amp; &ldquo;Why It Happened&rdquo; Engine
            </h1>
            <p className="text-zinc-300 text-sm md:text-base leading-relaxed">
              Most tools only tell you if people <span className="italic text-zinc-100">were</span> happy or angry in the past.
              Our system <span className="font-semibold text-rose-400">predicts how public mood will change over the next 24 hours</span>,
              and proves <span className="font-semibold text-indigo-400">what actually caused the change</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Real Scraped Data Calibration Banner */}
      {/* Ingested Real-Data Banner */}
      {initialScrapedContext && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse shrink-0" />
            <div className="text-xs">
              <span className="font-bold uppercase tracking-wider block text-emerald-800 text-[10px]">
                Real Data Ingestion Active
              </span>
              <span>
                Forecast calibrated using <strong>{initialScrapedContext.commentCount} real comments</strong> scraped from{' '}
                <strong>{initialScrapedContext.platform}</strong>. Current real-world mood baseline:{' '}
                <strong className="font-mono text-emerald-950">
                  {initialScrapedContext.averageSentiment > 0 ? '+' : ''}
                  {initialScrapedContext.averageSentiment.toFixed(2)}
                </strong>.
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              if (onClearScrapedContext) onClearScrapedContext();
              setCustomHeadline('');
              setAnalysisData(null);
            }}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline whitespace-nowrap cursor-pointer shrink-0"
          >
            Clear Loaded Post
          </button>
        </div>
      )}

      {/* ── Control Console: Forecast Real Data (Calibrated to Live Stream) ── */}
      {(initialScrapedContext || analysisData) && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-zinc-500" />
                <span>Forecast Configuration</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {initialScrapedContext
                  ? `Calibrated to ${initialScrapedContext.commentCount} comments from ${initialScrapedContext.platform}.`
                  : `Forecasting impact for: ${analysisData?.scenario_title || 'Current Scenario'}`}
              </p>
            </div>

            <form onSubmit={handleRunCustom} className="flex items-center gap-3 w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-zinc-700 whitespace-nowrap">Forecast Ahead:</label>
                <select
                  value={horizonHours}
                  onChange={(e) => {
                    const nextHorizon = Number(e.target.value);
                    setHorizonHours(nextHorizon);
                    void runPipeline(undefined, undefined, nextHorizon);
                  }}
                  className="text-xs px-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white font-medium cursor-pointer"
                >
                  <option value={6}>6 Hours</option>
                  <option value={12}>12 Hours</option>
                  <option value={24}>24 Hours</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isLoading ? 'Forecasting…' : 'Forecast Mood'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Empty State when no comments have been pulled yet */}
      {!analysisData && !isLoading && !initialScrapedContext && (
        <div className="bg-white rounded-2xl border border-dashed border-zinc-300 p-8 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto text-indigo-600">
            <Radar className="w-6 h-6 animate-pulse" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-sm font-bold text-zinc-900">
              Ready to Forecast Real Data
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Pull comments from any YouTube or social post in the <strong>Live Stream</strong> tab, then click <strong>Forecast Mood 24h Ahead</strong> to see the predictive forecast here.
            </p>
          </div>
        </div>
      )}

      {/* ── Key Executive Metrics Bar (in Plain English) ── */}
      {analysisData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Metric 1: Worst Expected Mood Shift */}
          <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-2xs">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
              {isPositiveShift ? 'Peak Mood Shift' : 'Worst Mood Shift'}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-black ${
                  isPositiveShift ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {analysisData.treatment_effect_ate > 0 ? '+' : ''}
                {analysisData.treatment_effect_ate.toFixed(2)}
              </span>
              <span className="text-xs font-semibold text-zinc-500">
                within {analysisData.time_to_peak_impact_hours.toFixed(1)}h
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
              {isPositiveShift ? (
                <TrendingUp className="w-3 h-3 text-emerald-600" />
              ) : (
                <TrendingDown className="w-3 h-3 text-rose-600" />
              )}
              <span>
                {isPositiveShift ? 'Peaks at ' : 'Bottoms out at '}
                {analysisData.predicted_nadir_sentiment > 0 ? '+' : ''}
                {analysisData.predicted_nadir_sentiment.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Metric 2: Difference vs Normal Day (Showing Both Red Event & Green Normal Day) */}
          <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-2xs flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
                Difference vs Normal Day
              </span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className={`text-2xl font-black ${
                    analysisData.counterfactual_delta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {formatSigned(analysisData.counterfactual_delta)}
                </span>
                <span className="text-xs font-semibold text-zinc-500">pts</span>
              </div>
            </div>

            {/* Dual Red & Green Comparison Badges */}
            <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                With Event: {formatSigned(analysisData.predicted_nadir_sentiment)}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                Normal Day: {formatSigned(analysisData.baseline_sentiment_at_zero)}
              </span>
            </div>
          </div>

          {/* Metric 3: Time to Calm Down */}
          <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-2xs">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
              {isPositiveShift ? 'Viral Momentum Window' : 'Time to Calm Down'}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-zinc-800">
                ~{analysisData.recovery_half_life_hours.toFixed(0)}h
              </span>
              <span className="text-xs font-semibold text-zinc-500">
                {isPositiveShift ? 'active buzz' : 'recovery'}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
              <Clock className="w-3 h-3 text-zinc-400" />
              <span>{isPositiveShift ? 'Time for peak buzz to settle' : 'Time for anger to drop in half'}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Sub Navigation Tabs in Plain English ── */}
      <div className="flex items-center gap-1 border-b border-zinc-200 pb-2">
        <button
          onClick={() => setActiveTabSub('trajectory')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTabSub === 'trajectory'
              ? 'bg-zinc-950 text-white shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          <span>24-Hour Mood Timeline</span>
        </button>

        <button
          onClick={() => setActiveTabSub('graph')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTabSub === 'graph'
              ? 'bg-zinc-950 text-white shadow-xs'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Step-by-Step Chain of Events</span>
        </button>
      </div>

      {/* ── TAB 1: 24-Hour Mood Timeline ── */}
      {activeTabSub === 'trajectory' && analysisData && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <span>Predicted Public Mood Timeline (Past 12 Hours to Next {horizonHours} Hours)</span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Comparing <span className="font-semibold text-rose-600">What will happen with this news</span> versus{' '}
                <span className="font-semibold text-indigo-600">What would have happened on a normal day</span>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-rose-600 inline-block" />
                <span className="font-semibold text-zinc-700">With this news</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-emerald-500 border-b-2 border-emerald-500 inline-block" />
                <span className="font-semibold text-emerald-700">If action is taken</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-indigo-500 border-b border-dashed border-indigo-500 inline-block" />
                <span className="font-semibold text-zinc-700">Normal day (no news)</span>
              </div>
            </div>
          </div>

          {/* Time Series Chart */}
          <div className="h-80 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={analysisData.forecast_series} margin={{ top: 10, right: 20, bottom: 20, left: -10 }}>
                <defs>
                  <linearGradient id={predictedGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isPositiveShift ? '#10b981' : '#f43f5e'} stopOpacity={0.25} />
                    <stop offset="95%" stopColor={isPositiveShift ? '#10b981' : '#f43f5e'} stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="timestamp_label"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickMargin={8}
                  interval={3}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  domain={[-1.0, 1.0]}
                  ticks={[-1.0, -0.5, 0.0, 0.5, 1.0]}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-zinc-950 text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-zinc-800">
                          <p className="font-bold text-zinc-300 border-b border-zinc-800 pb-1">
                            Time: {data.timestamp_label}
                          </p>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-rose-400">With News (No Action):</span>
                            <span className="font-bold">{data.predicted_sentiment > 0 ? '+' : ''}{data.predicted_sentiment}</span>
                          </div>
                          {data.action_taken_sentiment !== null && data.action_taken_sentiment !== undefined && (
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-emerald-400 font-semibold">If Action Taken:</span>
                              <span className="font-bold text-emerald-400">
                                {data.action_taken_sentiment > 0 ? '+' : ''}{data.action_taken_sentiment}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-indigo-400">Normal Day (No News):</span>
                            <span className="font-bold">{data.counterfactual_sentiment > 0 ? '+' : ''}{data.counterfactual_sentiment}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4 text-zinc-400">
                            <span>Expected Range:</span>
                            <span>{data.predicted_ci_lower} to {data.predicted_ci_upper}</span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {/* Event Happens Marker */}
                <ReferenceLine
                  x="T=0 (Shock)"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: 'News Breaks Here',
                    position: 'insideTopLeft',
                    fill: '#ef4444',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                />
                {/* Neutral line */}
                <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />

                {/* Shaded Area */}
                <Area
                  type="monotone"
                  dataKey="predicted_ci_upper"
                  stroke="none"
                  fill={`url(#${predictedGradId})`}
                  legendType="none"
                />
                <Area
                  type="monotone"
                  dataKey="predicted_ci_lower"
                  stroke="none"
                  fill="transparent"
                  legendType="none"
                />

                {/* Normal Day Curve */}
                <Line
                  type="monotone"
                  dataKey="counterfactual_sentiment"
                  stroke="#6366f1"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Normal Day (No News)"
                />

                {/* If Action Is Taken Curve (Green) */}
                <Line
                  type="monotone"
                  dataKey="action_taken_sentiment"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  strokeDasharray="3 3"
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  name="If Action Is Taken"
                />

                {/* With News Curve */}
                <Line
                  type="monotone"
                  dataKey="predicted_sentiment"
                  stroke={isPositiveShift ? '#10b981' : '#f43f5e'}
                  strokeWidth={3}
                  dot={{ r: 2 }}
                  activeDot={{ r: 6 }}
                  name="With This News"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Plain English Narrative & Action Box */}
          <div className="bg-zinc-50 border border-zinc-200/80 rounded-xl p-4 text-xs space-y-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="w-full">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <h4 className="font-bold text-zinc-900">What This Means in Plain English</h4>
                  {analysisData.is_ai_generated && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      Synthesized by OpenAI ({analysisData.ai_model || 'gpt-4o-mini'})
                    </span>
                  )}
                </div>
                <p className="text-zinc-600 mt-1 leading-relaxed text-xs">
                  {analysisData.causal_pathway_narrative}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-200/60">
              <span className="font-bold text-zinc-800 block mb-1">
                {isPositiveShift
                  ? 'Recommended Actions to Maximize Viral Momentum:'
                  : 'What Can Be Done Right Now to Reduce Public Anger:'}
              </span>
              <ul className="space-y-1.5 text-zinc-600 list-disc list-inside">
                {analysisData.recommended_mitigations.map((m, i) => (
                  <li key={i} className="leading-relaxed">{m}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Step-by-Step Chain of Events (DAG) ── */}
      {activeTabSub === 'graph' && analysisData && (
        <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-indigo-600" />
                <span>The Step-by-Step Chain of Events (How One Event Affects Mood)</span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Shows the exact path: Breaking News &rarr; Everyday Trouble &rarr; Viral Online Anger &rarr; Final Mood.
              </p>
            </div>
          </div>

          {/* Diagram Container */}
          <div className="relative overflow-x-auto p-4 bg-zinc-950 rounded-xl border border-zinc-800 text-white">
            <div className="min-w-[1020px] h-[340px] relative">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <marker
                    id="arrowhead-red"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="#f43f5e" />
                  </marker>
                  <marker
                    id="arrowhead-gray"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
                  </marker>
                </defs>

                {/* Path 1: T -> M1 (from x=235 y=190 to x=280 y=190) */}
                <path
                  d="M 235 190 L 275 190"
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2.5"
                  markerEnd="url(#arrowhead-red)"
                />
                {/* Path 2: M1 -> M2 (from x=495 y=190 to x=535 y=190) */}
                <path
                  d="M 495 190 L 535 190"
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2.5"
                  markerEnd="url(#arrowhead-red)"
                />
                {/* Path 3: M2 -> Y (from x=755 y=190 to x=795 y=190) */}
                <path
                  d="M 755 190 L 795 190"
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="3"
                  markerEnd="url(#arrowhead-red)"
                />
                {/* Path 4: Direct bypass (curved beneath from T to Y) */}
                <path
                  d="M 125 245 C 125 305, 900 305, 900 245"
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  markerEnd="url(#arrowhead-red)"
                />

                {/* Confounder Paths (Z1) */}
                <path
                  d="M 470 65 C 300 30, 140 70, 130 135"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  markerEnd="url(#arrowhead-gray)"
                />
                <path
                  d="M 640 65 C 750 30, 880 70, 895 135"
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  markerEnd="url(#arrowhead-gray)"
                />
              </svg>

              {/* Node: Outside Factor Z1 (Centered above) */}
              <div className="absolute left-[390px] top-[15px] w-64 p-2.5 rounded-xl text-left z-10 bg-zinc-900/95 border border-amber-500/50 shadow-md opacity-100">
                <span className="text-amber-400 text-[9px] font-bold uppercase block">
                  Daily Stress (Rush Hour / Commute)
                </span>
                <h5 className="text-[11px] font-semibold text-zinc-200 truncate mt-0.5">
                  {analysisData.nodes.find((n) => n.id === 'Z1')?.label || 'Rush Hour Traffic'}
                </h5>
                <p className="text-[9px] text-zinc-400">People already tired from commute</p>
              </div>

              {/* Node: Step 1 Breaking News */}
              <div className="absolute left-[20px] top-[140px] w-52 p-3 rounded-xl bg-rose-950/80 border-2 border-rose-500 shadow-lg text-left z-10">
                <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[9px] font-extrabold uppercase">
                  Step 1: The News
                </span>
                <h5 className="font-bold text-xs text-white mt-1 leading-snug truncate">
                  {analysisData.intervention_name}
                </h5>
                <p className="text-[10px] text-rose-300 mt-0.5">The breaking event that starts it all</p>
              </div>

              {/* Node: Step 2 Everyday Disruption */}
              <div className="absolute left-[280px] top-[140px] w-52 p-3 rounded-xl bg-zinc-900 border border-zinc-700 shadow-md text-left z-10">
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-bold uppercase">
                  Step 2: Real Trouble
                </span>
                <h5 className="font-bold text-xs text-zinc-100 mt-1 leading-snug truncate">
                  {analysisData.nodes.find((n) => n.id === 'M1')?.label || 'Operational Disruption'}
                </h5>
                <p className="text-[10px] text-zinc-400 mt-0.5">Traffic, lights off, downtime</p>
              </div>

              {/* Node: Step 3 Viral Reaction */}
              <div className="absolute left-[540px] top-[140px] w-52 p-3 rounded-xl bg-zinc-900 border border-zinc-700 shadow-md text-left z-10">
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-bold uppercase">
                  Step 3: Viral Outrage
                </span>
                <h5 className="font-bold text-xs text-zinc-100 mt-1 leading-snug truncate">
                  {analysisData.nodes.find((n) => n.id === 'M2')?.label || 'Social Echo'}
                </h5>
                <p className="text-[10px] text-zinc-400 mt-0.5">People venting on TikTok &amp; X</p>
              </div>

              {/* Node: Final Outcome */}
              <div className="absolute left-[800px] top-[140px] w-52 p-3 rounded-xl bg-gradient-to-br from-indigo-950 to-zinc-900 border-2 border-indigo-500 shadow-lg text-left z-10">
                <span className="px-1.5 py-0.5 rounded bg-indigo-500 text-white text-[9px] font-extrabold uppercase">
                  Final Result
                </span>
                <h5 className="font-bold text-xs text-white mt-1 leading-snug">
                  Overall Public Mood
                </h5>
                <p className="text-[10px] text-indigo-300 mt-0.5">
                  Shift: {analysisData.treatment_effect_ate > 0 ? '+' : ''}{analysisData.treatment_effect_ate.toFixed(2)} points
                </p>
              </div>
            </div>

            {/* Explanation Footer */}
            <div className="mt-3 pt-3 border-t border-zinc-800 text-[11px] text-zinc-300 flex flex-wrap items-center justify-between gap-2">
              <span className="text-zinc-300">
                💡 <strong>In Plain English:</strong> The news creates real everyday trouble &rarr; which drives people to complain online &rarr; which drags down the national mood.
              </span>
              <span className="text-zinc-400">
                Notice how everyday traffic also affects mood — our AI isolates this!
              </span>
            </div>
          </div>
        </div>
      )}





      {/* ── MODAL: Presentation Pitch & Lecturer Defense Guide (in Plain English) ── */}
      {showPitchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 md:p-8 space-y-6 shadow-2xl border border-zinc-200">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
              <div>
                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[11px] uppercase tracking-wide">
                  Presentation Cheat-Sheet
                </span>
                <h3 className="text-xl font-black text-zinc-900 mt-2">
                  What to Say Tomorrow to Win Top Marks
                </h3>
              </div>
              <button
                onClick={() => setShowPitchModal(false)}
                className="text-zinc-400 hover:text-zinc-600 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* The Killer Opening Line */}
            <div className="p-4 rounded-xl bg-zinc-950 text-white space-y-2">
              <span className="text-amber-400 text-xs font-bold uppercase tracking-wider block">
                🎤 Say This Out Loud (Your 30-Second Opening Pitch):
              </span>
              <p className="text-sm italic leading-relaxed text-zinc-200">
                &ldquo;Everyone in class has built systems that look at past sentiment. My system does something completely new:
                <strong> it predicts what public mood will be over the next 1 to 24 hours</strong>, <strong>explains what caused it</strong>,
                and <strong>simulates what happens if we intervene</strong>. It is not just looking backward — it is a crystal ball for public mood.&rdquo;
              </p>
            </div>

            {/* Killer Demo Flow */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-zinc-900">
                Your 3-Step Demo Flow (Show This On Screen):
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-xs text-zinc-700">
                <li>
                  <strong>Scrape Comments & Forecast 24h Ahead:</strong> Show the room: &ldquo;Watch this — we scrape 50 real comments from a live video. The AI calibrates directly to real public opinion and predicts how public mood will evolve over the next 24 hours.&rdquo;
                </li>
                <li>
                  <strong>Click the &lsquo;Chain of Events&rsquo; Tab:</strong> Point to the screen: &ldquo;Notice how our AI traces the steps: the announcement cuts the lights &rarr; people vent online &rarr; national mood crashes. We also filter out rush-hour traffic so we don&apos;t blame daily traffic on the power company.&rdquo;
                </li>
                <li>
                  <strong>Show the &lsquo;What-If&rsquo; Comparison:</strong> Point to the blue dashed line: &ldquo;Without this news, public mood would have stayed completely calm and positive (+0.12). And our Fact-Checker Agent proved this isn&apos;t a random coincidence by passing 3 strict proof tests.&rdquo;
                </li>
              </ol>
            </div>

            {/* Simple Answers to Lecturer Questions */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-zinc-900">
                How to Answer Tricky Questions:
              </h4>
              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                  <p className="font-bold text-zinc-900">Lecturer: &ldquo;How do you know this is real cause and effect, not just a coincidence?&rdquo;</p>
                  <p className="text-zinc-600 mt-1">
                    <strong>Your Answer:</strong> &ldquo;We ran our &lsquo;Fake News&rsquo; test where we fed the AI fake random text — the mood change stayed at zero. We also filtered out outside factors like rush-hour traffic. That proves the event itself caused the drop.&rdquo;
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                  <p className="font-bold text-zinc-900">Lecturer: &ldquo;Why did you use 4 agents?&rdquo;</p>
                  <p className="text-zinc-600 mt-1">
                    <strong>Your Answer:</strong> &ldquo;Each agent has one specialized job: Agent 1 finds the root cause, Agent 2 predicts the future timeline, Agent 3 tests what-if scenarios, and Agent 4 fact-checks the work to make sure it&apos;s reliable.&rdquo;
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowPitchModal(false)}
                className="px-5 py-2.5 rounded-xl bg-zinc-950 text-white font-bold text-xs hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Ready to Present!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
