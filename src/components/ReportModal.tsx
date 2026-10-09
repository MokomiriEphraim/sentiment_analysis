import React from 'react';
import { Printer, Download, X, CheckCircle, ShieldCheck } from 'lucide-react';
import { SentimentAnalysisResult } from '../nlp/sentimentEngine';

interface ReportModalProps {
  result: SentimentAnalysisResult;
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  result,
  onClose,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white rounded-2xl border border-zinc-300 max-w-3xl w-full p-8 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200 print:border-none print:shadow-none print:p-4">
        
        {/* Modal Top Actions (hidden during print) */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Report
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-900 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-100 transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Formal Header Sheet */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Sentiment Report
            </h1>
            <span className="text-xs font-mono text-zinc-400">
              {new Date().toISOString().split('T')[0]}
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Automatic check of tone, topics, and emotions in this text.
          </p>
        </div>

        {/* Analyzed Text Snippet */}
        <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-xs text-zinc-800 leading-relaxed italic">
          &ldquo;{result.text}&rdquo;
        </div>

        {/* Executive Score Summary Grid */}
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50">
            <div className="text-2xs text-zinc-500 uppercase font-medium">Overall Score</div>
            <div className="text-xl font-bold font-mono text-zinc-900 mt-0.5 tabular-nums">
              {result.compound > 0 ? `+${result.compound}` : result.compound}
            </div>
            <div className="text-2xs font-semibold text-zinc-600 mt-0.5">{result.label}</div>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50">
            <div className="text-2xs text-zinc-500 uppercase font-medium">Would Recommend</div>
            <div className="text-xl font-bold font-mono text-zinc-900 mt-0.5 tabular-nums">
              {result.npsEstimation > 0 ? `+${result.npsEstimation}` : result.npsEstimation}
            </div>
            <div className="text-2xs text-zinc-500 mt-0.5">From -100 to +100</div>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50">
            <div className="text-2xs text-zinc-500 uppercase font-medium">Primary Emotion</div>
            <div className="text-base font-bold text-zinc-900 mt-0.5 truncate">
              {result.emotions.dominantEmotion.split('&')[0]}
            </div>
            <div className="text-2xs text-zinc-500 mt-0.5">{Math.round(result.emotions.intensity * 100)}% strength</div>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50">
            <div className="text-2xs text-zinc-500 uppercase font-medium">Subjectivity</div>
            <div className="text-xl font-bold font-mono text-zinc-900 mt-0.5 tabular-nums">
              {Math.round(result.subjectivity * 100)}%
            </div>
            <div className="text-2xs text-zinc-500 mt-0.5">
              {result.subjectivity > 0.5 ? 'Subjective' : 'Objective'}
            </div>
          </div>
        </div>

        {/* Emotion Distribution Table */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">
            Emotions Detected
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {result.emotions.emotions.map(em => (
              <div key={em.key} className="flex items-center justify-between py-1 border-b border-zinc-100">
                <span className="text-zinc-700">{em.name}</span>
                <span className="font-mono font-medium text-zinc-900 tabular-nums">
                  {Math.round(em.value * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Aspect-Based Findings */}
        {result.aspects.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">
              Topics Mentioned
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {result.aspects.map(asp => (
                <div key={asp.id} className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs">
                  <div className="flex items-center justify-between font-semibold text-zinc-900 mb-1">
                    <span>{asp.name}</span>
                    <span className="font-mono tabular-nums">{asp.compound > 0 ? `+${asp.compound}` : asp.compound}</span>
                  </div>
                  {asp.snippets[0] && (
                    <p className="text-2xs text-zinc-500 line-clamp-1 italic">&ldquo;{asp.snippets[0]}&rdquo;</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sign-off footer */}
        <div className="pt-4 border-t border-zinc-200 text-2xs text-zinc-400 flex items-center justify-between">
          <span>Generated by Cloud Sentiment</span>
          <span>Automatic report</span>
        </div>

      </div>
    </div>
  );
};
