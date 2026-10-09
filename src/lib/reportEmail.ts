import { SentimentAnalysisResult } from '../nlp/sentimentEngine';

/** Snapshot of the Live Comments table, lifted to App for report packaging. */
export interface LiveReportData {
  platform: string;
  url: string;
  count: number;
  pos: number;
  neu: number;
  neg: number;
  items: Array<{ handle: string; source: string; text: string; label: string; compound: number }>;
}

export interface BuiltReport {
  subject: string;
  html: string;
  text: string;
}

const esc = (v: string) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const scoreColor = (comp: number) => (comp > 0.1 ? '#059669' : comp < -0.1 ? '#e11d48' : '#52525b');
const scoreBg = (comp: number) => (comp > 0.1 ? '#ecfdf5' : comp < -0.1 ? '#fff1f2' : '#f4f4f5');
const labelChip = (label: string, comp: number) => {
  const bg = label === 'Positive' ? '#d1fae5' : label === 'Negative' ? '#ffe4e6' : '#e4e4e7';
  const fg = label === 'Positive' ? '#065f46' : label === 'Negative' ? '#9f1239' : '#3f3f46';
  return `<span style="background:${bg};color:${fg};padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;">${esc(label)}</span>`;
};

const shell = (title: string, subtitle: string, inner: string) => `
<div style="background:#f4f4f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="background:#18181b;border-radius:14px 14px 0 0;padding:20px 24px;">
      <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#a1a1aa;margin-bottom:4px;">Cloud Sentiment</div>
      <div style="font-size:20px;font-weight:bold;color:#ffffff;">${esc(title)}</div>
      <div style="font-size:12px;color:#a1a1aa;margin-top:4px;">${esc(subtitle)}</div>
    </div>
    <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:24px;">
      ${inner}
    </div>
    <div style="text-align:center;font-size:11px;color:#a1a1aa;margin-top:14px;">
      Sent from Cloud Sentiment · sentiment analysis for South African voices
    </div>
  </div>
</div>`;

const bigScore = (comp: number, label: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
  <tr>
    <td align="center" style="background:${scoreBg(comp)};border:1px solid #e4e4e7;border-radius:12px;padding:18px;">
      <div style="font-size:34px;font-weight:bold;color:${scoreColor(comp)};font-family:monospace;">
        ${comp > 0 ? '+' : ''}${comp.toFixed(2)}
      </div>
      <div style="margin-top:6px;">${labelChip(label, comp)}</div>
    </td>
  </tr>
</table>`;

const metaRow = (label: string, value: string) =>
  value
    ? `<tr>
        <td style="padding:6px 0;font-size:13px;color:#71717a;width:150px;">${esc(label)}</td>
        <td style="padding:6px 0;font-size:13px;color:#18181b;font-weight:bold;">${esc(value)}</td>
      </tr>`
    : '';

export function buildWorkbenchReport(result: SentimentAnalysisResult): BuiltReport {
  const comp = result.compound;
  const sign = comp > 0 ? '+' : '';
  const sentences = result.sentences.slice(0, 20);

  const inner = `
    <p style="font-size:13px;color:#52525b;margin:0 0 16px;">
      Analysis of your text (${result.wordCount} words · ${result.sentenceCount} sentences).
    </p>
    ${bigScore(comp, result.label)}
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:18px;">
      ${metaRow('Top emotion', result.emotions.dominantEmotion)}
      ${metaRow('Tone', result.tones.primaryTone)}
      ${metaRow('Sarcasm', result.sarcasm.detected ? 'Detected' : 'Not detected')}
      ${metaRow('Subjectivity', `${Math.round(result.subjectivity * 100)}%`)}
      ${metaRow('Positive / Neutral / Negative', `${Math.round(result.posScore)}% / ${Math.round(result.neuScore)}% / ${Math.round(result.negScore)}%`)}
    </table>
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#71717a;border-top:1px solid #e4e4e7;padding-top:14px;margin-bottom:8px;">
      Sentence scores
    </div>
    ${sentences
      .map(
        s => `
      <div style="border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px;margin-bottom:6px;">
        <div style="font-size:11px;color:#71717a;margin-bottom:3px;">
          #${s.index + 1} · <span style="color:${scoreColor(s.compound)};font-family:monospace;font-weight:bold;">${s.compound > 0 ? '+' : ''}${s.compound.toFixed(3)}</span>
          · ${esc(s.label)}
        </div>
        <div style="font-size:13px;color:#27272a;">${esc(s.text)}</div>
      </div>`
      )
      .join('')}
    ${result.sentences.length > 20 ? `<p style="font-size:11px;color:#a1a1aa;">…and ${result.sentences.length - 20} more sentences.</p>` : ''}
  `;

  return {
    subject: `Cloud Sentiment report — ${sign}${comp.toFixed(2)} ${result.label}`,
    html: shell('Sentiment Workbench Report', new Date().toLocaleString(), inner),
    text:
      `Cloud Sentiment — Workbench report\n` +
      `Score: ${sign}${comp.toFixed(2)} (${result.label})\n` +
      `Emotion: ${result.emotions.dominantEmotion} · Tone: ${result.tones.primaryTone}\n` +
      `Words: ${result.wordCount} · Sentences: ${result.sentenceCount}`,
  };
}

export function buildLiveReport(live: LiveReportData): BuiltReport {
  const rows = live.items.slice(0, 100);
  const spike = live.items.slice(-5).filter(i => i.label === 'Negative').length >= 3;
  const pct = (n: number) => (live.count ? Math.round((n / live.count) * 100) : 0);

  const inner = `
    <p style="font-size:13px;color:#52525b;margin:0 0 16px;">
      <strong>${esc(live.platform)}</strong> · ${live.count} comments analyzed
      ${live.url ? `<br/><span style="font-size:11px;color:#a1a1aa;word-break:break-all;">${esc(live.url)}</span>` : ''}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4f4f5;border-radius:12px;margin-bottom:18px;">
      <tr>
        <td align="center" style="padding:14px 6px;">
          <div style="font-size:22px;font-weight:bold;color:#059669;">${live.pos}</div>
          <div style="font-size:11px;color:#71717a;">Positive ${pct(live.pos)}%</div>
        </td>
        <td align="center" style="padding:14px 6px;">
          <div style="font-size:22px;font-weight:bold;color:#52525b;">${live.neu}</div>
          <div style="font-size:11px;color:#71717a;">Neutral ${pct(live.neu)}%</div>
        </td>
        <td align="center" style="padding:14px 6px;">
          <div style="font-size:22px;font-weight:bold;color:#e11d48;">${live.neg}</div>
          <div style="font-size:11px;color:#71717a;">Negative ${pct(live.neg)}%</div>
        </td>
      </tr>
    </table>
    ${spike ? `<div style="background:#fff1f2;border:1px solid #fecdd3;color:#9f1239;font-size:12px;font-weight:bold;padding:8px 12px;border-radius:8px;margin-bottom:14px;">⚠ Negative spike detected in the latest comments</div>` : ''}
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#71717a;border-top:1px solid #e4e4e7;padding-top:14px;margin-bottom:8px;">
      Comments
    </div>
    ${rows
      .map(
        i => `
      <div style="border-bottom:1px solid #f4f4f5;padding:7px 0;">
        <div style="font-size:12px;font-weight:bold;color:#18181b;">
          ${esc(i.handle)}
          <span style="color:#a1a1aa;font-weight:normal;">· ${esc(i.source)}</span>
          <span style="float:right;font-family:monospace;color:${scoreColor(i.compound)};">${i.compound > 0 ? '+' : ''}${i.compound.toFixed(2)}</span>
        </div>
        <div style="font-size:12px;color:#3f3f46;margin-top:2px;">${esc(i.text)}</div>
      </div>`
      )
      .join('')}
    ${live.items.length > 100 ? `<p style="font-size:11px;color:#a1a1aa;">…and ${live.items.length - 100} more comments.</p>` : ''}
  `;

  return {
    subject: `Cloud Sentiment report — ${live.platform}, ${live.count} comments (${live.pos}+ / ${live.neg}-)`,
    html: shell('Live Comments Report', new Date().toLocaleString(), inner),
    text:
      `Cloud Sentiment — Live Comments report\n` +
      `${live.platform} · ${live.count} comments\n` +
      `Positive ${live.pos} · Neutral ${live.neu} · Negative ${live.neg}`,
  };
}
