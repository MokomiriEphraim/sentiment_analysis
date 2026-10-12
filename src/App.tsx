/**
 * Cloud Sentiment - Sentiment Intelligence & NLP Workbench
 * 100% Client-side, High-Precision Sentiment & Emotion Engine
 */

import React, { useEffect, useState } from 'react';
import { Header, NavTab } from './components/Header';
import { Workbench } from './components/Workbench';
import { LiveStream } from './components/LiveStream';
import { CausalPredictiveStudio } from './components/CausalPredictiveStudio';
import { ReportModal } from './components/ReportModal';
import { HelpAssistant } from './components/HelpAssistant';
import { LiveReportData } from './lib/reportEmail';
import { 
  loadCustomWords, 
  loadEngineSettings, 
  CustomWordRule, 
  EngineSettings 
} from './nlp/customRules';
import { analyzeSentiment, SentimentAnalysisResult } from './nlp/sentimentEngine';
import { startVaderHealthPolling } from './nlp/vaderClient';

export default function App() {
  // 15s sidecar health poll — keeps the engine badge honest and lets it
  // auto-recover (via the tabs' fallback listeners) when the sidecar restarts.
  useEffect(() => {
    startVaderHealthPolling();
  }, []);

  const [activeTab, setActiveTab] = useState<NavTab>('causal');
  const [customWords] = useState<CustomWordRule[]>(() => loadCustomWords());
  const [engineSettings] = useState<EngineSettings>(() => loadEngineSettings());
  const [isReportOpen, setIsReportOpen] = useState(false);
  // Single source of truth for the Workbench editor — also feeds the report
  const [workbenchText, setWorkbenchText] = useState('');
  // Live Comments snapshot lifted for the help assistant's email-report flow.
  const [liveReport, setLiveReport] = useState<LiveReportData | null>(null);
  // The Workbench pushes its live result here so the report matches the screen
  const [workbenchResult, setWorkbenchResult] = useState<SentimentAnalysisResult | null>(null);
  // Real scraped comments context passed to the Causal Forecaster
  const [scrapedCausalContext, setScrapedCausalContext] = useState<{
    headline: string;
    averageSentiment: number;
    commentCount: number;
    platform: string;
  } | null>(null);

  const handleSendToWorkbench = (text: string) => {
    setWorkbenchText(text);
    setActiveTab('workbench');
  };

  const handleSendToCausal = (payload: {
    headline: string;
    averageSentiment: number;
    commentCount: number;
    platform: string;
  }) => {
    setScrapedCausalContext(payload);
    setActiveTab('causal');
  };

  const currentReportResult =
    workbenchResult ?? analyzeSentiment(workbenchText, customWords, engineSettings);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col antialiased">
      
      {/* Top Navigation Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenReport={() => setIsReportOpen(true)}
      />

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className={activeTab === 'causal' ? 'block' : 'hidden'}>
          <CausalPredictiveStudio
            initialScrapedContext={scrapedCausalContext}
            onClearScrapedContext={() => setScrapedCausalContext(null)}
          />
        </div>

        <div className={activeTab === 'workbench' ? 'block' : 'hidden'}>
          <Workbench
            customWords={customWords}
            engineSettings={engineSettings}
            text={workbenchText}
            onTextChange={setWorkbenchText}
            onResultChange={setWorkbenchResult}
          />
        </div>

        <div className={activeTab === 'stream' ? 'block' : 'hidden'}>
          <LiveStream
            customWords={customWords}
            engineSettings={engineSettings}
            onSendToWorkbench={handleSendToWorkbench}
            onSendToCausal={handleSendToCausal}
            onReportData={setLiveReport}
          />
        </div>
      </main>

      {/* Printable Executive Report Modal */}
      {isReportOpen && (
        <ReportModal
          result={currentReportResult}
          onClose={() => setIsReportOpen(false)}
        />
      )}

      {/* Floating help assistant — bottom-right, all tabs */}
      <HelpAssistant
        activeTab={activeTab}
        workbench={{ text: workbenchText, result: currentReportResult }}
        live={liveReport}
      />

    </div>
  );
}
