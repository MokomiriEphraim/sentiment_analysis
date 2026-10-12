import React from 'react';
import { Sparkles, Activity, FileText, GitBranch, Zap } from 'lucide-react';

export type NavTab = 'workbench' | 'stream' | 'causal';

interface HeaderProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onOpenReport: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenReport,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white font-semibold text-sm shadow-sm">
            C
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-semibold tracking-tight text-zinc-900 leading-none">
              Cloud Sentiment
            </span>
            <span className="text-[10px] text-zinc-400 font-medium tracking-wide uppercase mt-0.5">
              Causal & Predictive AI
            </span>
          </div>
        </div>

        {/* Zone 2: 4-6 clean text navigation links (functional segmented tabs) */}
        <nav className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200/80">
          <button
            onClick={() => setActiveTab('workbench')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'workbench'
                ? 'bg-white text-zinc-950 shadow-xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Workbench</span>
          </button>

          <button
            onClick={() => setActiveTab('stream')}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeTab === 'stream'
                ? 'bg-white text-zinc-950 shadow-xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Live Comments</span>
          </button>

          <button
            onClick={() => setActiveTab('causal')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
              activeTab === 'causal'
                ? 'bg-rose-600 text-white shadow-xs font-bold'
                : 'text-rose-700 bg-rose-50/60 hover:bg-rose-100/80 hover:text-rose-900'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${activeTab === 'causal' ? 'fill-white' : 'text-rose-600'}`} />
            <span>Causal & Predictive Engine</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded-full font-extrabold uppercase bg-rose-700/80 text-white ml-0.5">
              4-Agent
            </span>
          </button>
        </nav>

        {/* Zone 3: Primary action button */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenReport}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-zinc-900 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 active:bg-zinc-100 transition-colors shadow-2xs whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-zinc-600" />
            <span>Full Report</span>
          </button>
        </div>

      </div>
    </header>
  );
};
