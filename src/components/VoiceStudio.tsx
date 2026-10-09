import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, AlertCircle, Loader2, Languages } from 'lucide-react';
import { analyzeSentiment, SentimentAnalysisResult } from '../nlp/sentimentEngine';

interface VoiceStudioProps {
  onAppendTranscript: (text: string) => void;
}

/**
 * All 11 SA languages. `code` = browser SpeechRecognition tag (Google STT
 * supports these in Chrome/Edge); `iso` = Whisper's ISO-639-1 language param
 * for the cloud fallback path (Firefox/Safari).
 */
const LANGS = [
  { code: 'en-ZA', iso: 'en', label: 'English (South Africa)' },
  { code: 'af-ZA', iso: 'af', label: 'Afrikaans' },
  { code: 'zu-ZA', iso: 'zu', label: 'isiZulu' },
  { code: 'xh-ZA', iso: 'xh', label: 'isiXhosa' },
  { code: 'st-ZA', iso: 'st', label: 'Sesotho' },
  { code: 'nso-ZA', iso: 'nso', label: 'Sepedi (Northern Sotho)' },
  { code: 'tn-ZA', iso: 'tn', label: 'Setswana' },
  { code: 'ss-ZA', iso: 'ss', label: 'siSwati' },
  { code: 've-ZA', iso: 've', label: 'Tshivenda' },
  { code: 'ts-ZA', iso: 'ts', label: 'Xitsonga' },
  { code: 'nr-ZA', iso: 'nr', label: 'isiNdebele' },
];

const liveSttSupported =
  typeof window !== 'undefined' &&
  Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
const canMediaRecord =
  typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof MediaRecorder !== 'undefined';

/** Hard cap so nobody accidentally streams the mic forever. */
const MAX_RECORD_MS = 120_000;

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export const VoiceStudio: React.FC<VoiceStudioProps> = ({ onAppendTranscript }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [liveSentiment, setLiveSentiment] = useState<SentimentAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [langCode, setLangCode] = useState('en-ZA');
  const [elapsed, setElapsed] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // Finalized STT segments + the live interim echo, so results since
  // resultIndex never overwrite what was already heard.
  const finalRef = useRef('');
  const displayRef = useRef('');
  // True while the user wants to record — Chrome ends recognition after
  // silence, and onend restarts it while this stays true.
  const activeRef = useRef(false);
  const tickerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);

  const lang = LANGS.find(l => l.code === langCode) || LANGS[0];

  const stopTimers = () => {
    if (tickerRef.current !== null) {
      window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  const stopVisualizer = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.clearRect(0, 0, canvasRef.current?.width || 0, canvasRef.current?.height || 0);
  };

  // Unmount mid-recording (tab switch, navigation) — always release the mic.
  useEffect(
    () => () => {
      activeRef.current = false;
      stopTimers();
      try {
        recognitionRef.current?.stop();
      } catch {
        /* already stopped */
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          /* already stopped */
        }
      }
      stopVisualizer();
    },
    []
  );

  const startVisualizer = (stream: MediaStream) => {
    try {
      mediaStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      audioCtx.createMediaStreamSource(stream).connect(analyser);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 1.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
          ctx.fillStyle = dataArray[i] > 120 ? '#18181b' : '#71717a';
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
          x += barWidth;
        }
      };
      draw();
    } catch {
      setErrorMsg('Microphone waveform unavailable.');
    }
  };

  // ── Live path (Chrome/Edge): free in-browser transcription ──
  const startLiveRecognition = () => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = langCode;

    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        const piece = r[0]?.transcript || '';
        if (r.isFinal) {
          finalRef.current += (finalRef.current && piece ? ' ' : '') + piece.trim();
        } else {
          interim += piece;
        }
      }
      const text = [finalRef.current.trim(), interim.trim()].filter(Boolean).join(' ');
      displayRef.current = text;
      setTranscript(text);
      if (text) setLiveSentiment(analyzeSentiment(text));
    };

    rec.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMsg('Microphone blocked — allow microphone access in your browser settings.');
        void stopRecording();
      }
      // 'no-speech' / 'aborted' / 'network' → onend restarts while active
    };

    rec.onend = () => {
      if (activeRef.current) {
        // Chrome ends after silence — keep listening while the user records.
        try {
          rec.start();
        } catch {
          /* already restarted */
        }
      } else {
        setIsRecording(false);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      /* already started */
    }
  };

  // ── Cloud path (Firefox/Safari): MediaRecorder → /api/transcribe ──
  const startWhisperRecording = (stream: MediaStream) => {
    if (!canMediaRecord) {
      setErrorMsg('This browser can’t record audio — try Chrome or Edge.');
      void stopRecording();
      return;
    }
    const rec = new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      void transcribeRecording(rec.mimeType || 'audio/webm');
    };
    recorderRef.current = rec;
    rec.start();
  };

  const transcribeRecording = async (mimeType: string) => {
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    recorderRef.current = null;
    if (blob.size < 500) {
      setErrorMsg('Nothing was captured — check your microphone and try again.');
      return;
    }
    setTranscribing(true);
    setErrorMsg(null);
    try {
      const audioBase64 = await toBase64(blob);
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType: blob.type, language: lang.iso }),
      });
      const data = await res.json().catch(() => null);
      if (!data?.available) {
        setErrorMsg(data?.message || 'Transcription failed.');
      } else if (data.text) {
        displayRef.current = data.text;
        setTranscript(data.text);
        setLiveSentiment(analyzeSentiment(data.text));
        // Land in the Workbench editor → full pipeline (VADER + AI pass).
        onAppendTranscript(data.text);
      } else {
        setErrorMsg('No speech detected in that recording.');
      }
    } catch {
      setErrorMsg('Transcription request failed — is the dev server running?');
    } finally {
      setTranscribing(false);
    }
  };

  const stopRecording = () => {
    activeRef.current = false;
    stopTimers();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop(); // → onstop → cloud transcription
      } catch {
        /* already stopped */
      }
    }
    stopVisualizer();
    setIsRecording(false);
    // Live path: push what we heard into the Workbench editor now.
    if (liveSttSupported) {
      const text = displayRef.current.trim();
      if (text) onAppendTranscript(text);
    }
  };

  const startRecording = async () => {
    if (!liveSttSupported && !canMediaRecord) {
      setErrorMsg('Voice input isn’t supported in this browser — try Chrome or Edge.');
      return;
    }
    setErrorMsg(null);
    finalRef.current = '';
    displayRef.current = '';
    setTranscript('');
    setLiveSentiment(null);
    setElapsed(0);
    activeRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      startVisualizer(stream);
      setIsRecording(true);
      tickerRef.current = window.setInterval(() => setElapsed(e => e + 1), 1000);
      autoStopRef.current = window.setTimeout(() => stopRecording(), MAX_RECORD_MS);
      if (liveSttSupported) startLiveRecognition();
      else startWhisperRecording(stream);
    } catch {
      activeRef.current = false;
      stopVisualizer();
      stopTimers();
      setIsRecording(false);
      setErrorMsg('Microphone unavailable or blocked — check the browser’s mic permission.');
    }
  };

  const toggleRecording = () => {
    if (transcribing) return;
    if (isRecording) stopRecording();
    else void startRecording();
  };

  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-xs space-y-4">

      {/* Header + record button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-zinc-700" />
          <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">
            Voice Input
          </h3>
        </div>

        <button
          onClick={toggleRecording}
          disabled={transcribing}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shadow-xs disabled:opacity-60 ${
            isRecording
              ? 'bg-rose-600 text-white animate-pulse'
              : 'bg-zinc-900 text-white hover:bg-zinc-800'
          }`}
        >
          {transcribing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Transcribing…
            </>
          ) : isRecording ? (
            <>
              <MicOff className="w-3.5 h-3.5" />
              Stop &amp; Add to Text
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5" />
              Start
            </>
          )}
        </button>
      </div>

      {/* Language picker — all 11 SA languages */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-2xs text-zinc-500">
          <Languages className="w-3.5 h-3.5" />
          Spoken language
        </span>
        <select
          value={langCode}
          onChange={e => setLangCode(e.target.value)}
          disabled={isRecording || transcribing}
          className="text-xs border border-zinc-300 rounded-lg px-2 py-1 bg-white focus:outline-hidden disabled:opacity-50"
        >
          {LANGS.map(l => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-2xs text-zinc-400 -mt-2">
        {liveSttSupported
          ? 'Speech types out live as you talk (free, in your browser). Scores land when you press Stop.'
          : 'Live typing isn’t available in this browser — audio is transcribed in the cloud when you press Stop.'}
      </p>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {transcribing && (
        <div className="flex items-center gap-2 text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
          Transcribing your recording…
        </div>
      )}

      {/* Waveform */}
      <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-3 flex flex-col items-center justify-center min-h-[90px] relative overflow-hidden">
        <canvas ref={canvasRef} width={400} height={60} className="w-full h-[60px]" />
        {isRecording && (
          <span className="absolute right-3 top-2 text-2xs font-mono text-zinc-500 tabular-nums">
            {mmss} / 2:00
          </span>
        )}
        {!isRecording && !transcribing && (
          <div className="text-2xs text-zinc-400 absolute font-sans select-none text-center px-4">
            Click “Start” to talk —{' '}
            {liveSttSupported
              ? 'your speech will be typed out live and scored when you stop'
              : 'it will be transcribed and analyzed when you stop'}
          </div>
        )}
      </div>

      {/* Live transcript + instant score preview */}
      {transcript && (
        <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs font-semibold uppercase text-zinc-500">
              {liveSttSupported ? 'Live Transcript' : 'Transcript'}
            </span>
            {liveSentiment && (
              <span className={`px-2 py-0.5 rounded text-2xs font-bold font-mono ${
                liveSentiment.compound > 0.1 ? 'bg-emerald-100 text-emerald-800' :
                liveSentiment.compound < -0.1 ? 'bg-rose-100 text-rose-800' : 'bg-zinc-200 text-zinc-700'
              }`}>
                Instant: {liveSentiment.compound > 0 ? `+${liveSentiment.compound.toFixed(2)}` : liveSentiment.compound.toFixed(2)} ({liveSentiment.label})
              </span>
            )}
          </div>
          <p className="text-zinc-800 italic leading-relaxed">
            &ldquo;{transcript}&rdquo;
          </p>
          <p className="text-2xs text-zinc-400">
            Add to the text on Stop — the scorecard above runs the full model (incl. cloud AI for SA languages).
          </p>
        </div>
      )}

    </div>
  );
};
