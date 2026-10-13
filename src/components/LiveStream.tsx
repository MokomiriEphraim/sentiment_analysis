import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  RefreshCw, Search, ShieldAlert, ExternalLink, Link2,
  Loader2, AlertCircle, Radar, History, ArrowLeft, Trash2, Download, Zap
} from 'lucide-react';
import { analyzeSentiment, SentimentAnalysisResult } from '../nlp/sentimentEngine';
import { CustomWordRule, EngineSettings } from '../nlp/customRules';
import { fetchVaderBatch, fetchAiScores, subscribeVaderHealth } from '../nlp/vaderClient';
import { getDeviceId, getDeviceMeta } from '../lib/device';
import { LiveReportData } from '../lib/reportEmail';
import { SentimentPie } from './SentimentPie';

interface StreamItem {
  id: string;
  source: string;
  handle: string;
  timestamp: string;
  text: string;
  sentiment: SentimentAnalysisResult;
}

/** One saved scrape from this device's MongoDB pull history. */
interface HistoryPull {
  id: string;
  url: string;
  platform: string;
  provider: string;
  commentCount: number;
  createdAt: string | null;
}

interface LiveStreamProps {
  customWords: CustomWordRule[];
  engineSettings: EngineSettings;
  onSendToWorkbench: (text: string) => void;
  onSendToCausal?: (payload: { headline: string; averageSentiment: number; commentCount: number; platform: string; comments?: string[]; pageTitle?: string }) => void;
  /** Lifts a snapshot of the loaded comments to App (for the assistant's email report). */
  onReportData?: (data: LiveReportData | null) => void;
}

/** Fast live-feed reveal rhythm (250ms). */
const REVEAL_MS = 250;

export const LiveStream: React.FC<LiveStreamProps> = ({
  customWords,
  engineSettings,
  onSendToWorkbench,
  onSendToCausal,
  onReportData,
}) => {
  const [postUrl, setPostUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeInfo, setScrapeInfo] = useState<string | null>(null);
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'Positive' | 'Negative'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [streamProgress, setStreamProgress] = useState<number | null>(null);
  // Real video/post title from the scrape — fed to the causal engine so the
  // Chain of Events names the actual topic, not a generic placeholder.
  const [pageTitle, setPageTitle] = useState<string>('');

  // Pull history — past scrapes persisted in MongoDB for THIS device
  // (list loads on mount; "View" re-scores a saved pull into the table).
  const [history, setHistory] = useState<HistoryPull[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingPull, setViewingPull] = useState<HistoryPull | null>(null);
  const [loadingPullId, setLoadingPullId] = useState<string | null>(null);

  // Two-tier engine: the whole pull is scored with VADER up-front, so every
  // comment slides into the stream already carrying its final model score.
  // Local rules only show if the sidecar is down (fallback badge).
  const [engineState, setEngineState] = useState<'idle' | 'connecting' | 'vader' | 'fallback'>('idle');
  // Progressive reveal: comments are real (one pull), then streamed into the
  // list one-by-one so the pie/counters update live like a feed.
  const revealTimerRef = useRef<number | null>(null);
  // The whole pull (revealed or not) — the reveal interval reads from it and
  // the health-recovery handler re-scores it in place when the sidecar returns.
  const pullRef = useRef<StreamItem[] | null>(null);

  // Sidecar died during the pull (fallback badge) → when the health poller
  // sees it come back, re-score every comment already shown (and still queued).
  useEffect(() => {
    if (engineState !== 'fallback') return;
    return subscribeVaderHealth(h => {
      if (h !== 'up') return;
      const pull = pullRef.current;
      if (!pull || pull.length === 0) return;
      void (async () => {
        try {
          const scores = await fetchVaderBatch(pull.map(i => i.text));
          const byId = new Map(scores.map((s, i) => [pull[i].id, s] as const));
          const patch = (items: StreamItem[]) =>
            items.map(it => {
              const s = byId.get(it.id);
              return s
                ? { ...it, sentiment: { ...it.sentiment, compound: s.compound, label: s.label } }
                : it;
            });
          if (!pullRef.current) return; // cleared mid-flight
          pullRef.current = patch(pullRef.current);
          setStreamItems(prev => patch(prev));
          setEngineState('vader');
        } catch {
          // still failing — the next health tick retries
        }
      })();
    });
  }, [engineState]);

  const stopReveal = () => {
    if (revealTimerRef.current !== null) {
      window.clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  };

  const showAllImmediately = () => {
    stopReveal();
    if (pullRef.current && pullRef.current.length > 0) {
      setStreamItems(pullRef.current);
    }
    setStreamProgress(null);
    setScrapeInfo('Done');
  };

  useEffect(() => stopReveal, []);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/pulls?deviceId=${encodeURIComponent(getDeviceId())}`);
      const data = await res.json().catch(() => null);
      setHistory(data?.available && Array.isArray(data.pulls) ? data.pulls : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // This device's saved pulls, on mount (Mongo off → empty → card stays hidden).
  useEffect(() => {
    void loadHistory();
  }, []);

  /**
   * Score a whole batch: VADER first, then ONE cheap cloud-AI pass for the
   * exactly-0.00 items (VADER is English-only — isiZulu/Sesotho/Afrikaans/
   * slang always come back 0.00). Failures degrade to local-rule scores.
   */
  const scoreBatch = async (
    items: StreamItem[]
  ): Promise<{ scored: StreamItem[]; aiCount: number; engine: 'vader' | 'fallback' }> => {
    let scored = items;
    let engine: 'vader' | 'fallback' = 'fallback';
    try {
      const scores = await fetchVaderBatch(items.map(i => i.text));
      scored = items.map((it, i) =>
        scores[i]
          ? { ...it, sentiment: { ...it.sentiment, compound: scores[i].compound, label: scores[i].label } }
          : it
      );
      engine = 'vader';
    } catch {
      // sidecar down — keep the local-rule scores (fallback badge)
    }
    let aiCount = 0;
    const zeroIdx = scored.reduce<number[]>((acc, it, i) => {
      if (it.sentiment.compound === 0) acc.push(i);
      return acc;
    }, []);
    if (zeroIdx.length > 0) {
      try {
        const aiScores = await fetchAiScores(zeroIdx.map(i => scored[i].text));
        scored = scored.map((it, i) => {
          const j = zeroIdx.indexOf(i);
          const s = j >= 0 ? aiScores[j] : undefined;
          return s
            ? { ...it, sentiment: { ...it.sentiment, compound: s.compound, label: s.label } }
            : it;
        });
        aiCount = aiScores.filter(Boolean).length;
      } catch {
        // AI off (no key / error) — keep the neutral scores
      }
    }
    return { scored, aiCount, engine };
  };

  /** Open a saved pull from this device's history and re-score it in place. */
  const viewPull = async (pull: HistoryPull) => {
    if (loadingPullId || scraping) return;
    stopReveal();
    setViewingPull(pull);
    setScrapeError(null);
    setScrapeInfo(null);
    setStreamProgress(null);
    setStreamItems([]);
    pullRef.current = null;
    setFilterType('all');
    setSearchQuery('');
    setEngineState('connecting');
    setLoadingPullId(pull.id);
    try {
      const res = await fetch(
        `/api/pull-comments?pullId=${encodeURIComponent(pull.id)}&deviceId=${encodeURIComponent(getDeviceId())}`
      );
      const data = await res.json().catch(() => null);
      if (!data?.available) {
        setScrapeError(data?.message || 'Could not load that pull.');
        setViewingPull(null);
        setEngineState('idle');
        return;
      }
      const comments = Array.isArray(data.comments) ? data.comments : [];
      if (comments.length === 0) {
        setScrapeError('That pull has no stored comments.');
        setViewingPull(null);
        setEngineState('idle');
        return;
      }
      const when = data.createdAt ? new Date(data.createdAt) : null;
      const whenLabel = when
        ? when.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
      const base: StreamItem[] = comments.map((c: any, i: number) => ({
        id: String(c.id || `h-${pull.id}-${i}`),
        source: pull.platform,
        handle: typeof c.author === 'string' && c.author ? c.author : 'Commenter',
        timestamp: when
          ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '',
        text: String(c.text),
        sentiment: analyzeSentiment(String(c.text), customWords, engineSettings),
      }));
      // Same pipeline as a live pull — VADER + one AI pass for the 0.00s.
      const { scored, aiCount, engine } = await scoreBatch(base);
      pullRef.current = scored;
      setStreamItems(scored);
      setEngineState(engine);
      setScrapeInfo(
        `Loaded ${scored.length} saved comments from ${pull.platform}` +
          (aiCount > 0 ? ` · ${aiCount} scored with cloud AI` : '') +
          (whenLabel ? ` · pulled ${whenLabel}` : '') + '.'
      );
    } catch {
      setScrapeError('Could not load that pull — is the dev server running?');
      setViewingPull(null);
      setEngineState('idle');
    } finally {
      setLoadingPullId(null);
    }
  };

  const backToList = () => {
    stopReveal();
    setViewingPull(null);
    setStreamItems([]);
    pullRef.current = null;
    setStreamProgress(null);
    setScrapeInfo(null);
    setScrapeError(null);
    setPageTitle('');
    setEngineState('idle');
    void loadHistory();
  };

  const deletePull = async (pull: HistoryPull) => {
    try {
      const res = await fetch(
        `/api/pulls/${pull.id}?deviceId=${encodeURIComponent(getDeviceId())}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => null);
      if (data?.available) {
        setHistory(prev => prev.filter(p => p.id !== pull.id));
        if (viewingPull?.id === pull.id) backToList();
      }
    } catch {
      // network hiccup — the row stays, user can retry
    }
  };

  const scrapeComments = async () => {
    const u = postUrl.trim();
    if (!u || scraping) return;
    setScraping(true);
    setScrapeError(null);
    setScrapeInfo(null);
    setStreamProgress(null);
    setViewingPull(null);
    setPageTitle('');
    setEngineState('idle');
    try {
      const res = await fetch('/api/scrape-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u, deviceId: getDeviceId(), device: getDeviceMeta() }),
      });
      const data = await res.json().catch(() => null);
      if (!data || !data.available) {
        setScrapeError(data?.message || 'Scraping failed — check the link and try again.');
        return;
      }
      const comments = Array.isArray(data.comments) ? data.comments : [];
      if (comments.length === 0) {
        setScrapeError(
          'No comments found on that page — some platforms hide comments behind login. Try a public YouTube video or TikTok post.'
        );
        return;
      }
      setPageTitle(typeof data.pageTitle === 'string' ? data.pageTitle : '');
      const now = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const newItems: StreamItem[] = comments.map((c: any, i: number) => ({
        id: `c-${Date.now()}-${i}`,
        source: data.platform || 'Web',
        handle: typeof c.author === 'string' && c.author ? c.author : 'Commenter',
        timestamp: now,
        text: String(c.text),
        sentiment: analyzeSentiment(String(c.text), customWords, engineSettings),
      }));
      stopReveal();
      setStreamItems([]);
      pullRef.current = null;
      setStreamProgress(null);
      setEngineState('connecting');

      // Score the WHOLE pull with VADER up-front (+ one AI pass for the
      // exactly-0.00 isiZulu/Afrikaans/etc. comments) so every streamed
      // comment lands with its final model score.
      const { scored, aiCount, engine } = await scoreBatch(newItems);
      setEngineState(engine);
      // Reveal + health recovery both read from this (recovery rewrites it).
      pullRef.current = scored;
      // The server just persisted this pull — refresh the history list so it
      // shows up the moment the user clears the stream.
      void loadHistory();

      // Reveal one comment at a time; pie/counts/spike-alert update per tick.
      let idx = 0;
      revealTimerRef.current = window.setInterval(() => {
        const next = pullRef.current?.[idx++];
        if (!next) {
          stopReveal();
          setStreamProgress(null);
          setScrapeInfo('Done');
          return;
        }
        setStreamProgress(idx);
        setStreamItems(prev => [...prev, next]);
      }, REVEAL_MS);
    } catch {
      setScrapeError('Request failed — is the dev server running?');
    } finally {
      setScraping(false);
    }
  };

  // Live distribution of buffered events (drives the pie chart)
  const distribution = useMemo(() => {
    let pos = 0;
    let neu = 0;
    let neg = 0;
    for (const item of streamItems) {
      if (item.sentiment.label === 'Positive') pos++;
      else if (item.sentiment.label === 'Negative') neg++;
      else neu++;
    }
    return { pos, neu, neg };
  }, [streamItems]);

  // Lift a serializable snapshot to App so the help assistant can package an
  // email report from whatever is loaded right now (null when the view is empty).
  useEffect(() => {
    onReportData?.(
      streamItems.length === 0
        ? null
        : {
            platform: streamItems[0].source,
            url: viewingPull?.url || '',
            count: streamItems.length,
            pos: distribution.pos,
            neu: distribution.neu,
            neg: distribution.neg,
            items: streamItems.map(i => ({
              handle: i.handle,
              source: i.source,
              text: i.text,
              label: i.sentiment.label,
              compound: i.sentiment.compound,
            })),
          }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamItems]);

  const filteredItems = useMemo(() => {
    return streamItems.filter(item => {
      if (filterType !== 'all' && item.sentiment.label !== filterType) return false;
      if (searchQuery.trim() && !item.text.toLowerCase().includes(searchQuery.toLowerCase()) && !item.handle.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [streamItems, filterType, searchQuery]);

  // Spike Alert Check — most recent 5 streamed comments
  const recentNegativeSpike = useMemo(() => {
    const last5 = streamItems.slice(-5);
    const negs = last5.filter(i => i.sentiment.label === 'Negative');
    return negs.length >= 3;
  }, [streamItems]);

  // Export every loaded comment as CSV (UTF-8 BOM so Excel reads isiZulu /
  // Afrikaans characters correctly; fields are quote-escaped).
  const downloadCsv = () => {
    if (streamItems.length === 0) return;
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[][] = [
      ['Source', 'Time', 'Author', 'Comment', 'Score', 'Label', 'Top Emotion', 'Tone', 'Sarcastic'],
      ...streamItems.map(it => [
        it.source,
        it.timestamp,
        it.handle,
        it.text,
        (it.sentiment.compound > 0 ? '+' : '') + it.sentiment.compound.toFixed(2),
        it.sentiment.label,
        it.sentiment.emotions.dominantEmotion,
        it.sentiment.tones.primaryTone,
        it.sentiment.sarcasm.detected ? 'yes' : 'no',
      ]),
    ];
    const csv = rows.map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloud-sentiment-comments-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">

      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-zinc-200">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">
              Live Comments
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Paste a post link — pull its real comments and see the sentiment mix.
            </p>
          </div>
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

        {streamItems.length > 0 && (
          <button
            onClick={() => {
              stopReveal();
              setStreamItems([]);
              pullRef.current = null;
              setStreamProgress(null);
              setScrapeInfo(null);
              setScrapeError(null);
              setViewingPull(null);
              setEngineState('idle');
              void loadHistory();
            }}
            className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg border border-zinc-200"
            title="Clear all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Link input — the scraper */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs space-y-2.5">
        <label className="text-xs font-semibold text-zinc-900 uppercase tracking-wider flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-zinc-500" />
          Post link — TikTok · YouTube · Instagram · Facebook
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            value={postUrl}
            onChange={e => setPostUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') scrapeComments(); }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="flex-1 px-3 py-2 text-xs font-mono bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-hidden focus:border-zinc-400"
            disabled={scraping}
          />
          <button
            onClick={scrapeComments}
            disabled={scraping || !postUrl.trim()}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {scraping ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Scraping…
              </>
            ) : (
              <>
                <Radar className="w-3.5 h-3.5" />
                Pull comments
              </>
            )}
          </button>
        </div>

        {scraping && (
          <p className="text-2xs text-zinc-500">
            Loading the page and extracting comments — first scrape of a link can take up to a minute.
          </p>
        )}
        {scrapeError && (
          <div className="flex items-start gap-2 text-2xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{scrapeError}</span>
          </div>
        )}
        {streamProgress !== null ? (
          <div className="flex items-center justify-between py-2 px-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs" role="status">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
              <span className="font-semibold text-emerald-800">
                Streaming comments ({streamProgress} of {pullRef.current?.length || 50})…
              </span>
            </div>
            <button
              type="button"
              onClick={showAllImmediately}
              className="px-2.5 py-1 text-2xs font-bold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-2xs cursor-pointer shrink-0"
            >
              ⚡ Show All {pullRef.current?.length || 50} Now
            </button>
          </div>
        ) : scrapeInfo && (
          <div className="flex items-start gap-2 text-2xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-medium">
            <Radar className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
            <span>{scrapeInfo}</span>
          </div>
        )}
      </div>

      {/* Viewing a saved pull from this device's history */}
      {viewingPull && (
        <div className="flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0 text-xs text-zinc-600">
            <History className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <span className="font-semibold text-zinc-900 shrink-0">Saved pull</span>
            <span className="truncate">{viewingPull.url}</span>
            <span className="text-zinc-400 shrink-0">· {viewingPull.commentCount} comments</span>
          </div>
          <button
            onClick={backToList}
            className="flex items-center gap-1.5 px-2.5 py-1 text-2xs font-semibold rounded-md border border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:bg-white shrink-0"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to history
          </button>
        </div>
      )}

      {/* Pull history — this device's saved scrapes (MongoDB) */}
      {!viewingPull && streamItems.length === 0 && history.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-xs space-y-1">
          <h2 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider flex items-center gap-2 pb-1">
            <History className="w-3.5 h-3.5 text-zinc-500" />
            Pull history — this device
            <span className="text-2xs font-normal text-zinc-400 normal-case">
              ({history.length} saved{historyLoading ? ' · refreshing…' : ''})
            </span>
          </h2>
          <div className="divide-y divide-zinc-100 max-h-48 overflow-y-auto">
            {history.map(p => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-600 flex items-center justify-center font-bold text-2xs shrink-0">
                  {p.platform.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-800 truncate">{p.url}</p>
                  <p className="text-2xs text-zinc-400 tabular-nums">
                    {p.commentCount} comments
                    {p.createdAt
                      ? ` · ${new Date(p.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                  </p>
                </div>
                <button
                  onClick={() => viewPull(p)}
                  disabled={scraping || loadingPullId !== null}
                  className="flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold rounded-md bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50 shrink-0"
                >
                  {loadingPullId === p.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  View
                </button>
                <button
                  onClick={() => deletePull(p)}
                  disabled={loadingPullId !== null}
                  className="p-1 text-zinc-400 hover:text-rose-600 rounded disabled:opacity-50 shrink-0"
                  title="Delete this pull"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical Alert Banner if Spike */}
      {recentNegativeSpike && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-700" />
            <div>
              <div className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                Negative Spike Detected
              </div>
              <p className="text-xs text-rose-800">
                Several strongly negative comments in a row.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-rose-800 bg-rose-100 px-2.5 py-1 rounded">
            Check Now
          </span>
        </div>
      )}

      {/* Causal & Predictive Forecaster Bridge for Scraped Comments */}
      {(streamItems.length > 0 || (pullRef.current && pullRef.current.length > 0)) && (() => {
        const activeList = pullRef.current && pullRef.current.length > 0 ? pullRef.current : streamItems;
        const avg = Number((activeList.reduce((acc, it) => acc + it.sentiment.compound, 0) / activeList.length).toFixed(2));
        return (
          <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-rose-950 border border-rose-500/30 rounded-xl p-4 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                  Real-Data Predictive Engine Ready
                </span>
                {streamProgress !== null && (
                  <span className="text-[10px] bg-rose-900/60 text-rose-200 px-2 py-0.5 rounded-full font-semibold border border-rose-700/50">
                    Live Stream ({streamProgress}/{activeList.length})
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-200">
                Scraped <strong>{activeList.length} real comments</strong> · Average Mood:{' '}
                <span className="font-bold text-white">
                  {avg > 0 ? `+${avg.toFixed(2)}` : avg.toFixed(2)}
                </span>
                . See what will happen to this public reaction over the next 24 hours.
              </p>
            </div>
            <button
              onClick={() => {
                if (onSendToCausal) {
                  onSendToCausal({
                    headline: viewingPull?.url || postUrl || 'Scraped Social Media Post',
                    averageSentiment: avg,
                    commentCount: activeList.length,
                    platform: viewingPull?.platform || 'Social Post',
                    comments: activeList.slice(0, 40).map(it => it.text),
                    pageTitle,
                  });
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all whitespace-nowrap cursor-pointer shrink-0"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Forecast Mood 24h Ahead</span>
            </button>
          </div>
        );
      })()}

      {/* Comments table (left) + live Comment Breakdown pie (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden lg:col-span-2">

          {/* Filter Bar */}
          <div className="p-3 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search comments..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-2xs text-zinc-500 font-mono tabular-nums shrink-0">
                {streamItems.length} comments
              </span>
              <div className="flex items-center gap-1 bg-zinc-200/70 p-0.5 rounded-lg">
                {(['all', 'Positive', 'Negative'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFilterType(mode)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      filterType === mode
                        ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    {mode === 'all' ? 'All' : mode}
                  </button>
                ))}
              </div>
              <button
                onClick={downloadCsv}
                disabled={streamItems.length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                title="Download all loaded comments as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
            </div>
          </div>

          {/* List Items — one slides in per tick while streaming */}
          <div className="divide-y divide-zinc-100 max-h-[560px] overflow-y-auto">
            {filteredItems.map((item) => {
              const comp = item.sentiment.compound;
              const em = item.sentiment.emotions.dominantEmotion;
              const tone = item.sentiment.tones.primaryTone;
              const sarc = item.sentiment.sarcasm.detected;
              return (
                <div
                  key={item.id}
                  className="p-4 hover:bg-zinc-50 transition-colors flex items-start justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {item.source.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-zinc-900">{item.handle}</span>
                        <span className="text-zinc-400">·</span>
                        <span className="text-zinc-500">{item.source}</span>
                        <span className="text-zinc-400">·</span>
                        <span className="text-2xs text-zinc-400 font-mono tabular-nums">{item.timestamp}</span>
                      </div>

                      <p className="text-xs text-zinc-800 leading-relaxed max-w-2xl">
                        {item.text}
                      </p>

                      {(em !== 'Neutral' || tone !== 'Neutral' || sarc) && (
                        <div className="flex items-center gap-3 text-2xs text-zinc-500 pt-0.5">
                          {em !== 'Neutral' && (
                            <>
                              <span>Top emotion: <strong className="text-zinc-700">{em}</strong></span>
                              {(tone !== 'Neutral' || sarc) && <span className="text-zinc-300">·</span>}
                            </>
                          )}
                          {tone !== 'Neutral' && (
                            <>
                              <span>Tone: <strong className="text-zinc-700">{tone}</strong></span>
                              {sarc && <span className="text-zinc-300">·</span>}
                            </>
                          )}
                          {sarc && (
                            <span className="text-amber-700 font-medium">Sarcastic Tone</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className={`font-mono text-xs font-bold tabular-nums ${
                        comp > 0.1 ? 'text-emerald-700' : comp < -0.1 ? 'text-rose-700' : 'text-zinc-600'
                      }`}>
                        {comp > 0 ? `+${comp.toFixed(2)}` : comp.toFixed(2)}
                      </div>
                      <span className={`inline-block px-1.5 py-0.2 rounded text-2xs font-semibold ${
                        item.sentiment.label === 'Positive' ? 'bg-emerald-100 text-emerald-800' :
                        item.sentiment.label === 'Negative' ? 'bg-rose-100 text-rose-800' : 'bg-zinc-100 text-zinc-700'
                      }`}>
                        {item.sentiment.label}
                      </span>
                    </div>

                    <button
                      onClick={() => onSendToWorkbench(item.text)}
                      className="p-1.5 text-zinc-400 hover:text-zinc-800 rounded hover:bg-zinc-200/60 transition-colors"
                      title="Load in Workbench"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>

                </div>
              );
            })}

            {streamItems.length === 0 && (
              <div className="p-8 text-center text-xs text-zinc-400 space-y-1">
                <p>No comments yet.</p>
                <p>Paste a TikTok / YouTube / Instagram / Facebook post link above and hit “Pull comments”.</p>
              </div>
            )}
            {streamItems.length > 0 && filteredItems.length === 0 && (
              <div className="p-8 text-center text-xs text-zinc-400">
                No comments match this filter.
              </div>
            )}
          </div>
        </div>

        {/* Live pie — re-slices as every streamed comment lands */}
        <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-xs">
          <SentimentPie
            positive={distribution.pos}
            neutral={distribution.neu}
            negative={distribution.neg}
            title="Comment Breakdown"
            subtitle={streamItems.length > 0 ? `${streamItems.length} comments` : 'no comments yet'}
            height={190}
          />
        </div>
      </div>

    </div>
  );
};
