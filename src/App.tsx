/**
 * Cloud Sentiment - Sentiment Intelligence & NLP Workbench
 * 100% Client-side, High-Precision Sentiment & Emotion Engine
 */

import React, { useEffect, useState } from 'react';
import { Header, NavTab } from './components/Header';
import { Workbench } from './components/Workbench';
import { LiveStream } from './components/LiveStream';
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

  const [activeTab, setActiveTab] = useState<NavTab>('workbench');
  const [customWords] = useState<CustomWordRule[]>(() => loadCustomWords());
  const [engineSettings] = useState<EngineSettings>(() => loadEngineSettings());
  const [isReportOpen, setIsReportOpen] = useState(false);
  // Single source of truth for the Workbench editor — also feeds the report
  const [workbenchText, setWorkbenchText] = useState('');
  // Live Comments snapshot lifted for the help assistant's email-report flow.
  const [liveReport, setLiveReport] = useState<LiveReportData | null>(null);
  // The Workbench pushes its live result here so the report matches the screen
  const [workbenchResult, setWorkbenchResult] = useState<SentimentAnalysisResult | null>(null);

  const handleSendToWorkbench = (text: string) => {
    setWorkbenchText(text);
    setActiveTab('workbench');
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
        {activeTab === 'workbench' && (
          <Workbench
            customWords={customWords}
            engineSettings={engineSettings}
            text={workbenchText}
            onTextChange={setWorkbenchText}
            onResultChange={setWorkbenchResult}
          />
        )}

        {activeTab === 'stream' && (
          <LiveStream
            customWords={customWords}
            engineSettings={engineSettings}
            onSendToWorkbench={handleSendToWorkbench}
            onReportData={setLiveReport}
          />
        )}
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
