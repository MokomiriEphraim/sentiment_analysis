import { SentimentAnalysisResult } from '../nlp/sentimentEngine';
import type { CausalAnalysisResponse } from '../nlp/causalEngine';

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

/** Key metrics tile in the causal report — one cell of the 2×3 grid. */
const metricTile = (label: string, value: string, color: string) => `
  <td align="center" style="padding:12px 6px;width:33%;">
    <div style="font-size:18px;font-weight:bold;color:${color};font-family:monospace;">${esc(value)}</div>
    <div style="font-size:11px;color:#71717a;margin-top:2px;">${esc(label)}</div>
  </td>`;

export function buildCausalReport(data: CausalAnalysisResponse): BuiltReport {
  const sign = (n: number | undefined | null) =>
    n === undefined || n === null || isNaN(n) ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}`;

  // Direction of the shift — drives every conditional phrase so nothing is
  // hardcoded to the negative case ("dip", "low point", red, …).
  const ate = data.treatment_effect_ate ?? 0;
  const dir = ate < -0.02 ? 'down' : ate > 0.02 ? 'up' : 'flat';
  const dirColor = dir === 'down' ? '#e11d48' : dir === 'up' ? '#059669' : '#52525b';
  const extremeNoun = dir === 'up' ? 'peak' : 'low point';
  const extremeVerb = dir === 'up' ? 'climb' : dir === 'down' ? 'drop' : 'move';
  const peakH = data.time_to_peak_impact_hours;
  const halfH = data.recovery_half_life_hours;
  const rob = data.causal_robustness_score;
  const narr = (data.causal_pathway_narrative || '').trim();
  const firstAction = (data.recommended_mitigations || []).find(m => m && m.trim());

  // Human names for the DAG nodes (e.g. "Implementation of Stage 6
  // load-shedding") so the email never shows bare T / M1 / Z1 codes.
  const nodeLabel: Record<string, string> = {};
  for (const n of data.nodes) nodeLabel[n.id] = n.label || n.id;
  const strengthWord = (b: number | undefined) => {
    const a = Math.abs(b ?? 0);
    return a >= 0.6 ? 'strong' : a >= 0.3 ? 'moderate' : 'small';
  };
  const edges = data.edges.slice(0, 8);
  const tests = data.refutation_tests.slice(0, 6);

  // ── Mood journey chart (plain table cells — renders in Gmail/Outlook, no SVG) ──
  const series = Array.isArray(data.forecast_series) ? data.forecast_series : [];
  const stripColor = (v: number) =>
    v <= -0.5 ? '#991b1b' : v <= -0.25 ? '#dc2626' : v <= -0.05 ? '#fca5a5'
    : v < 0.15 ? '#e4e4e7' : v < 0.4 ? '#86efac' : '#15803d';
  let strip = '';
  if (series.length > 0) {
    const step = Math.max(1, Math.ceil(series.length / 16));
    const picked = series.filter((_, i) => i % step === 0);
    if (atZeroMissing(picked, series)) picked.push(series.find(p => p.hour === 0)!);
    picked.sort((a, b) => a.hour - b.hour);
    strip = `
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#71717a;border-top:1px solid #e4e4e7;padding-top:14px;margin-bottom:10px;">
      Mood journey — ${data.forecast_horizon_hours} hours ahead
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:6px;">
      <tr>
        ${picked
          .map(p => {
            const isNow = p.hour === 0;
            return `<td style="width:18px;height:36px;background:${stripColor(p.predicted_sentiment)};${
              isNow ? 'outline:2px solid #18181b;outline-offset:-2px;' : 'border-right:1px solid #fff;'
            }" title="${esc(p.timestamp_label)}: ${sign(p.predicted_sentiment)}"></td>`;
          })
          .join('')}
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
      <tr>
        <td align="left" style="font-size:10px;color:#a1a1aa;">12h before</td>
        <td align="center" style="font-size:10px;color:#18181b;font-weight:bold;">▲ the event</td>
        <td align="right" style="font-size:10px;color:#a1a1aa;">+${data.forecast_horizon_hours}h after</td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">
      <tr>
        <td style="padding-right:6px;"><span style="color:#dc2626;">■</span> <span style="font-size:10px;color:#71717a;">worse</span></td>
        <td style="padding-right:6px;"><span style="color:#e4e4e7;">■</span> <span style="font-size:10px;color:#71717a;">steady</span></td>
        <td><span style="color:#15803d;">■</span> <span style="font-size:10px;color:#71717a;">better</span></td>
      </tr>
    </table>`;
  }

  // ── Before / extreme comparison bars (proportional to the -1…+1 scale) ──
  const bar = (label: string, value: number, color: string) => `
    <tr>
      <td style="padding:6px 10px 6px 0;font-size:12px;color:#3f3f46;white-space:nowrap;">${esc(label)}</td>
      <td style="padding:6px 0;width:100%;">
        <div style="background:#f4f4f5;border-radius:9999px;height:14px;">
          <div style="background:${color};height:14px;border-radius:9999px;width:${Math.min(100, Math.abs(value) * 100).toFixed(0)}%;"></div>
        </div>
      </td>
      <td style="padding:6px 0 6px 10px;font-size:13px;font-weight:bold;font-family:monospace;color:${color};white-space:nowrap;">${sign(value)}</td>
    </tr>`;
  const beforeVal = data.baseline_sentiment_at_zero ?? 0;
  const extremeVal = data.predicted_nadir_sentiment ?? 0;
  const extremeColor = extremeVal < -0.1 ? '#e11d48' : extremeVal > 0.1 ? '#059669' : '#52525b';
  const bars = series.length > 0 ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:16px;">
      ${bar('Mood before the event', beforeVal, '#52525b')}
      ${bar(`Mood at the ${extremeNoun}`, extremeVal, extremeColor)}
    </table>` : '';

  // ── In-short box: the decision-maker's summary, written from the numbers ──
  const inShort =
    dir === 'flat'
      ? `Public mood is expected to stay roughly where it is over the next ${data.forecast_horizon_hours} hours — no significant shift predicted.`
      : `Public mood is expected to ${extremeVerb} by about ${Math.abs(ate).toFixed(2)} points (the scale runs from -1 very negative to +1 very positive), reaching its ${extremeNoun} around ${
          peakH !== undefined && peakH !== null ? `${peakH.toFixed(1)} hours` : 'a few hours'
        } after the event.` +
        (halfH !== undefined && halfH !== null
          ? ` After that it should start recovering — roughly halfway back to normal in about ${halfH.toFixed(0)} hours.`
          : '');
  const confidenceLine =
    rob !== undefined && rob !== null
      ? ` Confidence in this forecast: ${rob.toFixed(0)}% (the higher, the more dependable the pattern).`
      : '';

  const inner = `
    <p style="font-size:13px;color:#52525b;margin:0 0 14px;">
      <strong style="color:#18181b;font-size:15px;">${esc(data.scenario_title)}</strong><br/>
      What happened: ${esc(data.intervention_name)} · looking ${data.forecast_horizon_hours} hours ahead
    </p>

    <div style="background:#f4f4f5;border-left:4px solid ${dirColor};border-radius:0 10px 10px 0;padding:12px 14px;margin-bottom:8px;">
      <div style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#71717a;margin-bottom:4px;">In short</div>
      <div style="font-size:13px;color:#18181b;line-height:1.55;margin:0;">${esc(inShort + confidenceLine)}</div>
    </div>
    ${firstAction ? `
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:10px 14px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#71717a;margin-bottom:4px;">What to do now</div>
      <div style="font-size:13px;color:#18181b;line-height:1.5;margin:0;">${esc(firstAction)}</div>
    </div>` : ''}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f4f4f5;border-radius:12px;margin-bottom:16px;">
      <tr>
        ${metricTile('Mood before', sign(beforeVal), '#52525b')}
        ${metricTile(`Mood at the ${extremeNoun}`, sign(extremeVal), extremeColor)}
        ${metricTile('Overall mood change', sign(ate), dirColor)}
      </tr>
      <tr>
        ${metricTile(dir === 'up' ? 'Reaches its peak after' : 'Hits its low after', peakH !== undefined && peakH !== null ? `${peakH.toFixed(1)}h` : '—', '#18181b')}
        ${metricTile('Time to start recovering', halfH !== undefined && halfH !== null ? `${halfH.toFixed(0)}h` : '—', '#18181b')}
        ${metricTile('Confidence', rob !== undefined && rob !== null ? `${rob.toFixed(0)}%` : '—', '#18181b')}
      </tr>
    </table>

    ${bars}
    ${strip}

    ${narr ? `
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#71717a;border-top:1px solid #e4e4e7;padding-top:14px;margin-bottom:8px;">
      What this means, in plain English
    </div>
    <p style="font-size:13px;color:#3f3f46;line-height:1.6;margin:0 0 16px;">${esc(narr)}</p>` : ''}

    ${edges.length > 0 ? `
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#71717a;border-top:1px solid #e4e4e7;padding-top:14px;margin-bottom:8px;">
      How one thing leads to another
    </div>
    ${edges
      .map(
        e => `
      <div style="border:1px solid #e4e4e7;border-radius:8px;padding:8px 10px;margin-bottom:6px;">
        <div style="font-size:12px;font-weight:bold;color:#18181b;">
          ${esc(nodeLabel[e.source] || e.source)} → ${esc(nodeLabel[e.target] || e.target)}
          ${e.is_confounder ? '<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:9999px;font-size:10px;font-weight:700;margin-left:6px;">OUTSIDE FACTOR</span>' : ''}
          <span style="color:#a1a1aa;font-weight:normal;"> · ${strengthWord(e.effect_size)} influence</span>
        </div>
        <div style="font-size:12px;color:#3f3f46;margin-top:2px;">${esc(e.mechanism || '')}</div>
      </div>`
      )
      .join('')}
    ${data.edges.length > 8 ? `<p style="font-size:11px;color:#a1a1aa;">…and ${data.edges.length - 8} more connections in the full model.</p>` : ''}` : ''}

    ${data.recommended_mitigations.length > 0 ? `
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#71717a;border-top:1px solid #e4e4e7;padding-top:14px;margin-bottom:8px;">
      Recommended next steps
    </div>
    ${data.recommended_mitigations
      .slice(0, 5)
      .map((m, i) => `
      <div style="border-left:3px solid ${dirColor};padding:6px 10px;margin-bottom:6px;background:#fafafa;">
        <span style="font-size:12px;font-weight:bold;color:#18181b;">${i + 1}.</span>
        <span style="font-size:12px;color:#3f3f46;">${esc(m)}</span>
      </div>`)
      .join('')}` : ''}

    ${tests.length > 0 ? `
    <div style="font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#71717a;border-top:1px solid #e4e4e7;padding-top:14px;margin-bottom:8px;">
      How we checked the result
    </div>
    ${tests
      .map(
        t => `
      <div style="font-size:12px;color:#3f3f46;padding:3px 0;">
        ${t.passed ? '✅' : '❌'} ${esc(t.name || '')} — ${esc(t.verdict || (t.passed ? 'held' : 'failed'))}
      </div>`
      )
      .join('')}` : ''}
  `;

  return {
    subject: `Mood forecast — ${data.scenario_title} (expected to move ${dir})`,
    html: shell('Mood Forecast Report', new Date().toLocaleString(), inner),
    text:
      `Cloud Sentiment — Mood forecast\n` +
      `Scenario: ${data.scenario_title}\n` +
      `What happened: ${data.intervention_name}\n\n` +
      `IN SHORT: ${inShort}${confidenceLine}\n` +
      (firstAction ? `\nWHAT TO DO NOW: ${firstAction}\n` : '') +
      `\nMood before: ${sign(beforeVal)} · Mood at the ${extremeNoun}: ${sign(extremeVal)} · Overall change: ${sign(ate)}\n` +
      (peakH !== undefined && peakH !== null ? `Hits its ${extremeNoun} after ~${peakH.toFixed(1)}h · ` : '') +
      (halfH !== undefined && halfH !== null ? `Starts recovering after ~${halfH.toFixed(0)}h · ` : '') +
      (rob !== undefined && rob !== null ? `Confidence: ${rob.toFixed(0)}%` : '') +
      (narr ? `\n\nWHAT THIS MEANS:\n${narr.slice(0, 800)}` : ''),
  };
}

/** True when the picked strip samples skipped the T=0 (event) point. */
function atZeroMissing(picked: Array<{ hour: number }>, series: Array<{ hour: number }>): boolean {
  return !picked.some(p => p.hour === 0) && series.some(p => p.hour === 0);
}
