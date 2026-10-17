// Analysis dashboard: filters, trends, heatmaps, on/off comparisons, change log and correlations. All local.

import { canonicalLabMarker, labMarkerIdentity } from './lab-pdf.js';

const PALETTE = ['#245e4d', '#9a641c', '#385e79', '#a23f55', '#6b5aa8', '#2f8f9d', '#7a7a2c', '#555f5b'];
const state = { range: '30', metrics: null, item: '', group: '', outcome: 'Energy', lag: '0', minDays: '6' };

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dayMs = 86400000;
const toTime = (date) => new Date(`${date}T12:00:00`).getTime();
const toKey = (time) => { const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const fmt = (value, digits = 1) => (Number.isInteger(value) ? String(value) : value.toFixed(digits));

function buildRecords(days) {
  return Object.entries(days).flatMap(([date, day]) => {
    if (day.submitted) return [{ date, entry: { ...day.submitted, routine: day.submitted.routine || [] } }];
    const checkins = day.parts?.checkin;
    const latestCheckin = Array.isArray(checkins) ? checkins[checkins.length - 1]?.entry : checkins?.entry;
    const entry = latestCheckin ? { ...latestCheckin, routine: [] } : { routine: [] };
    Object.entries(day.parts || {}).forEach(([group, history]) => {
      if (group === 'checkin') return;
      const latest = Array.isArray(history) ? history[history.length - 1] : history;
      if (latest?.items) entry.routine.push(...latest.items);
    });
    return latestCheckin || entry.routine.length ? [{ date, entry }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function buildMetrics(ctx) {
  const num = (value) => (value === '' || value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
  const metrics = [
    { name: 'Energy', max: 5, get: (entry) => num(entry.energyLevel) },
    { name: 'Sleep quality', max: 5, get: (entry) => num(entry.sleepQuality) },
    ...ctx.symptoms.map((name) => ({ name, max: 5, symptom: true, get: (entry) => num(entry.symptoms?.[name.toLowerCase()]) })),
    { name: 'Bowel movements', get: (entry) => { const count = (entry.stoolEvents || []).filter((event) => event.time || event.form).length; return count || null; } },
    { name: 'Average stool form', max: 7, get: (entry) => { const forms = (entry.stoolEvents || []).filter((event) => event.form !== '' && event.form !== undefined).map((event) => Number(event.form)).filter(Number.isFinite); return forms.length ? mean(forms) : null; } },
    { name: 'Watch sleep (hours)', get: (entry) => (entry.health?.sleepMinutes ? entry.health.sleepMinutes / 60 : null) },
    { name: 'Watch heart rate (bpm)', get: (entry) => num(entry.health?.averageHeartRate) },
    { name: 'Watch steps', get: (entry) => num(entry.health?.steps) },
    { name: 'Watch exercise (min)', get: (entry) => num(entry.health?.exerciseMinutes) }
  ];
  [...new Set(ctx.labs.map((lab) => canonicalLabMarker(lab.marker)))].forEach((marker) => {
    const values = ctx.labs.filter((lab) => labMarkerIdentity(lab.marker) === labMarkerIdentity(marker));
    metrics.push({ name: `${marker} (lab)`, lab: true, get: (entry, date) => {
      const time = toTime(date);
      const nearest = values.map((lab) => ({ lab, gap: Math.abs(toTime(lab.date) - time) / dayMs })).filter((row) => row.gap <= 30).sort((a, b) => a.gap - b.gap)[0];
      return nearest ? num(nearest.lab.value) : null;
    } });
  });
  return metrics;
}

function pearson(pairs) {
  const mx = mean(pairs.map((p) => p[0])); const my = mean(pairs.map((p) => p[1]));
  const num = pairs.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  const den = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - mx) ** 2, 0) * pairs.reduce((sum, [, y]) => sum + (y - my) ** 2, 0));
  return den ? num / den : null;
}

function itemOn(entry, name) { const item = entry.routine.find((record) => record.name === name); return item ? Boolean(item.enabled) : null; }

function outcomeOn(model, record, metric, lag) {
  const target = lag ? model.byDate.get(toKey(toTime(record.date) + lag * dayMs)) : record;
  if (!target) return null;
  return metric.get(target.entry, target.date);
}

function lineChart(model, filtered) {
  const chosen = model.metrics.filter((metric) => state.metrics.includes(metric.name));
  if (!chosen.length || !filtered.length) return '<div class="empty-state">Pick at least one measure and make sure entries exist in this period.</div>';
  const W = 640; const H = 230; const L = 36; const R = 12; const T = 12; const B = 28;
  const fixed = chosen.every((metric) => metric.max === 5);
  const t0 = toTime(filtered[0].date); const t1 = toTime(filtered[filtered.length - 1].date);
  const x = (date) => (t1 === t0 ? (L + W - R) / 2 : L + ((toTime(date) - t0) / (t1 - t0)) * (W - L - R));
  const y = (value) => T + (1 - value) * (H - T - B);
  const series = chosen.map((metric, index) => {
    const points = filtered.map((record) => ({ date: record.date, raw: metric.get(record.entry, record.date) })).filter((p) => p.raw !== null);
    const lo = fixed ? 0 : Math.min(...points.map((p) => p.raw)); const hi = fixed ? 5 : Math.max(...points.map((p) => p.raw));
    return { metric, color: PALETTE[index % PALETTE.length], points: points.map((p) => ({ ...p, norm: hi === lo ? 0.5 : (p.raw - lo) / (hi - lo) })) };
  });
  const grid = [0, 0.25, 0.5, 0.75, 1].map((tick) => `<line x1="${L}" x2="${W - R}" y1="${y(tick)}" y2="${y(tick)}" class="an-grid"/><text x="${L - 6}" y="${y(tick) + 4}" text-anchor="end" class="an-axis">${fixed ? fmt(tick * 5) : `${Math.round(tick * 100)}%`}</text>`).join('');
  const labelDates = [filtered[0].date, filtered[Math.floor((filtered.length - 1) / 2)].date, filtered[filtered.length - 1].date];
  const xlabels = [...new Set(labelDates)].map((date, i, all) => `<text x="${x(date)}" y="${H - 8}" text-anchor="${all.length > 1 && i === 0 ? 'start' : all.length > 1 && i === all.length - 1 ? 'end' : 'middle'}" class="an-axis">${esc(date.slice(5))}</text>`).join('');
  const lines = series.map(({ color, points, metric }) => `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" points="${points.map((p) => `${x(p.date).toFixed(1)},${y(p.norm).toFixed(1)}`).join(' ')}"/>${points.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.norm).toFixed(1)}" r="3" fill="${color}"><title>${esc(metric.name)} · ${p.date}: ${fmt(p.raw, 2)}</title></circle>`).join('')}`).join('');
  const legend = series.map(({ color, metric }) => `<span><i style="background:${color}"></i>${esc(metric.name)}</span>`).join('');
  return `<svg class="an-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend of selected measures">${grid}${xlabels}${lines}</svg><div class="an-legend">${legend}</div><p class="fine-print">${fixed ? 'Scale 0–5.' : 'Mixed units: each line is scaled to its own lowest–highest value in this period (hover a point for the real value).'}</p>`;
}

function adherenceHeatmap(model, filtered) {
  const recent = filtered.slice(-45);
  let names = [...new Set(recent.flatMap((record) => record.entry.routine.filter((item) => !state.group || item.group === state.group).map((item) => item.name)))];
  if (state.item) names = names.filter((name) => name === state.item);
  names = names.filter((name) => recent.some((record) => itemOn(record.entry, name)));
  if (!names.length) return '<div class="empty-state">No routine items were switched on in this period.</div>';
  const header = `<div class="an-hm-row an-hm-head"><span></span>${recent.map((record) => `<b>${esc(record.date.slice(8))}</b>`).join('')}</div>`;
  const rows = names.map((name) => `<div class="an-hm-row"><span title="${esc(name)}">${esc(name)}</span>${recent.map((record) => { const on = itemOn(record.entry, name); return `<i class="an-cell ${on === null ? 'none' : on ? 'on' : 'off'}" title="${esc(name)} · ${record.date}: ${on === null ? 'not recorded' : on ? 'on' : 'off'}"></i>`; }).join('')}</div>`).join('');
  return `<div class="an-heatmap" style="--cols:${recent.length}">${header}${rows}</div><p class="fine-print">${esc(recent[0].date)} to ${esc(recent[recent.length - 1].date)} · day of month shown.</p>`;
}

function symptomHeatmap(model, filtered) {
  const recent = filtered.slice(-45);
  const rows = model.metrics.filter((metric) => metric.symptom && recent.some((record) => (metric.get(record.entry) || 0) > 0));
  if (!rows.length) return '<div class="empty-state">No symptoms rated above 0 in this period.</div>';
  const header = `<div class="an-hm-row an-hm-head"><span></span>${recent.map((record) => `<b>${esc(record.date.slice(8))}</b>`).join('')}</div>`;
  const body = rows.map((metric) => `<div class="an-hm-row"><span title="${esc(metric.name)}">${esc(metric.name)}</span>${recent.map((record) => { const value = metric.get(record.entry); return `<i class="an-cell sym" style="--v:${value === null ? 0 : value / 5}" data-empty="${value === null}" title="${esc(metric.name)} · ${record.date}: ${value === null ? 'not recorded' : `${value}/5`}"></i>`; }).join('')}</div>`).join('');
  return `<div class="an-heatmap" style="--cols:${recent.length}">${header}${body}</div>`;
}

function comparison(model, filtered) {
  if (!state.item) return '<div class="empty-state">Choose a focus item in the filters to compare days it was on versus off.</div>';
  const lag = Number(state.lag);
  const exposure = filtered.map((record) => ({ record, on: itemOn(record.entry, state.item) })).filter((row) => row.on !== null);
  const rows = model.metrics.map((metric) => {
    const on = []; const off = [];
    exposure.forEach(({ record, on: isOn }) => { const value = outcomeOn(model, record, metric, lag); if (value !== null && value !== undefined) (isOn ? on : off).push(value); });
    return { metric, on, off };
  }).filter((row) => row.on.length && row.off.length);
  if (!rows.length) return `<div class="empty-state">${esc(state.item)} needs both on and off days with recorded measures in this period.</div>`;
  const scale = (row) => row.metric.max || Math.max(...row.on, ...row.off, 1);
  return rows.map((row) => { const a = mean(row.on); const b = mean(row.off); const top = scale(row); const delta = a - b; return `<div class="an-cmp"><strong>${esc(row.metric.name)}</strong><div class="an-cmp-bars"><div><i class="on" style="width:${Math.max(2, (a / top) * 100)}%"></i><span>On ${fmt(a)} (${row.on.length}d)</span></div><div><i class="off" style="width:${Math.max(2, (b / top) * 100)}%"></i><span>Off ${fmt(b)} (${row.off.length}d)</span></div></div><b class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '+' : ''}${fmt(delta, 2)}</b></div>`; }).join('');
}

function changeLog(model, filtered) {
  const outcome = model.metrics.find((metric) => metric.name === state.outcome) || model.metrics[0];
  const events = [];
  for (let i = 1; i < filtered.length; i += 1) {
    const before = filtered[i - 1]; const after = filtered[i];
    after.entry.routine.forEach((item) => {
      if (state.item && item.name !== state.item) return;
      if (state.group && item.group !== state.group) return;
      const prev = before.entry.routine.find((record) => record.name === item.name);
      if (!prev) return;
      if (Boolean(prev.enabled) !== Boolean(item.enabled)) events.push({ date: after.date, text: `${item.enabled ? 'Started' : 'Stopped'} ${item.name}` });
      else if (item.enabled && prev.dose !== item.dose) events.push({ date: after.date, text: `${item.name} dose ${prev.dose || '?'} → ${item.dose || '?'}` });
    });
  }
  if (!events.length) return '<div class="empty-state">No routine changes between consecutive logged days in this period.</div>';
  const around = (date, direction) => {
    const time = toTime(date);
    const values = model.records.filter((record) => { const diff = (toTime(record.date) - time) / dayMs; return direction < 0 ? diff < 0 && diff >= -7 : diff >= 0 && diff < 7; }).map((record) => outcome.get(record.entry, record.date)).filter((v) => v !== null && v !== undefined);
    return values.length ? mean(values) : null;
  };
  return events.slice(-30).reverse().map((event) => { const a = around(event.date, -1); const b = around(event.date, 1); const delta = a !== null && b !== null ? b - a : null; return `<div class="an-event"><time>${esc(event.date)}</time><span>${esc(event.text)}</span><small>${a === null || b === null ? `${esc(outcome.name)}: not enough data` : `${esc(outcome.name)} 7d avg ${fmt(a)} → ${fmt(b)} <b class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">(${delta > 0 ? '+' : ''}${fmt(delta, 2)})</b>`}</small></div>`; }).join('');
}

function correlations(model, filtered) {
  const lag = Number(state.lag); const minDays = Number(state.minDays);
  const names = [...new Set(filtered.flatMap((record) => record.entry.routine.map((item) => item.name)))].filter((name) => !state.item || name === state.item).filter((name) => !state.group || filtered.some((record) => record.entry.routine.some((item) => item.name === name && item.group === state.group)));
  const rows = [];
  names.forEach((name) => model.metrics.forEach((metric) => {
    const pairs = [];
    filtered.forEach((record) => { const on = itemOn(record.entry, name); const value = outcomeOn(model, record, metric, lag); if (on !== null && value !== null && value !== undefined) pairs.push([on ? 1 : 0, value]); });
    const onCount = pairs.filter((p) => p[0] === 1).length; const offCount = pairs.length - onCount;
    if (pairs.length < minDays || onCount < 2 || offCount < 2) return;
    const r = pearson(pairs);
    if (r === null) return;
    rows.push({ name, metric: metric.name, r, n: pairs.length, on: mean(pairs.filter((p) => p[0] === 1).map((p) => p[1])), off: mean(pairs.filter((p) => p[0] === 0).map((p) => p[1])) });
  }));
  rows.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  if (!rows.length) return `<div class="empty-state">Not enough on and off days yet (need at least ${minDays} days with 2+ on and 2+ off). Try a longer period or a lower minimum.</div>`;
  return rows.slice(0, 15).map((row) => `<div class="an-corr"><div class="an-corr-label"><strong>${esc(row.name)}</strong><span>with ${esc(row.metric)}</span></div><div class="an-corr-bar" aria-hidden="true"><i class="${row.r >= 0 ? 'pos' : 'neg'}" style="width:${Math.abs(row.r) * 50}%;${row.r >= 0 ? 'left:50%' : `right:50%`}"></i></div><b>${row.r > 0 ? '+' : ''}${row.r.toFixed(2)}</b><small>${row.n} days · on ${fmt(row.on)} vs off ${fmt(row.off)}</small></div>`).join('') + '<p class="fine-print">Association only: other factors, timing and chance can explain these. Discuss patterns with your clinician; they are not proof of cause.</p>';
}

function summary(model, filtered) {
  const avg = (name) => { const metric = model.metrics.find((m) => m.name === name); const values = filtered.map((r) => metric.get(r.entry, r.date)).filter((v) => v !== null && v !== undefined); return values.length ? fmt(mean(values)) : '–'; };
  const adherence = filtered.map((record) => { const items = record.entry.routine; return items.length ? items.filter((item) => item.enabled).length / items.length : null; }).filter((v) => v !== null);
  const symptomAverages = model.metrics.filter((m) => m.symptom).map((metric) => ({ name: metric.name, value: mean(filtered.map((r) => metric.get(r.entry) || 0)) })).sort((a, b) => b.value - a.value)[0];
  const cards = [['Days logged', String(filtered.length)], ['Avg energy', avg('Energy')], ['Avg sleep quality', avg('Sleep quality')], ['Avg routine on', adherence.length ? `${Math.round(mean(adherence) * 100)}%` : '–'], ['Avg bowel movements', avg('Bowel movements')], ['Top symptom', symptomAverages && symptomAverages.value > 0 ? symptomAverages.name : '–']];
  return cards.map(([label, value]) => `<div class="an-card"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`).join('');
}

function controls(model) {
  const items = [...new Map(model.records.flatMap((record) => record.entry.routine.map((item) => [item.name, item.group]))).entries()];
  const groups = [...new Set(items.map(([, group]) => group).filter(Boolean))];
  const options = (list, selected) => list.map(([value, label]) => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('');
  const chips = model.metrics.map((metric) => `<label class="an-chip"><input type="checkbox" data-metric="${esc(metric.name)}" ${state.metrics.includes(metric.name) ? 'checked' : ''}/><span>${esc(metric.name)}</span></label>`).join('');
  return `<div class="an-filters">
    <label class="field compact-field"><span>Period</span><select data-filter="range">${options([['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year'], ['all', 'All time']], state.range)}</select></label>
    <label class="field compact-field"><span>Routine time</span><select data-filter="group">${options([['', 'All times'], ...groups.map((g) => [g, g])], state.group)}</select></label>
    <label class="field compact-field"><span>Focus item</span><select data-filter="item">${options([['', 'All items'], ...items.filter(([, g]) => !state.group || g === state.group).map(([n]) => [n, n])], state.item)}</select></label>
    <label class="field compact-field"><span>Effect timing</span><select data-filter="lag">${options([['0', 'Same day'], ['1', 'Next day'], ['2', '2 days later']], state.lag)}</select></label>
    <label class="field compact-field"><span>Change log measure</span><select data-filter="outcome">${options(model.metrics.map((m) => [m.name, m.name]), state.outcome)}</select></label>
    <label class="field compact-field"><span>Min days per pattern</span><select data-filter="minDays">${options([['4', '4'], ['6', '6'], ['10', '10'], ['14', '14']], state.minDays)}</select></label>
  </div>
  <details class="an-metrics"><summary>Measures on trend chart (${state.metrics.length})</summary><div class="an-chip-grid">${chips}</div></details>`;
}

export function renderAnalysis(root, ctx) {
  const records = buildRecords(ctx.days);
  const metrics = buildMetrics(ctx);
  const model = { records, metrics, byDate: new Map(records.map((record) => [record.date, record])) };
  if (!state.metrics) state.metrics = ['Energy', 'Sleep quality'];
  state.metrics = state.metrics.filter((name) => metrics.some((metric) => metric.name === name));
  if (!metrics.some((metric) => metric.name === state.outcome)) state.outcome = 'Energy';
  if (!records.length) { root.innerHTML = '<div class="empty-state">No submitted entries yet. Submit a day, check-in or routine section and the analysis will appear here.</div>'; return; }
  const cutoff = state.range === 'all' ? '' : toKey(Date.now() - Number(state.range) * dayMs);
  const filtered = records.filter((record) => record.date >= cutoff);
  const section = (title, hint, body) => `<section class="an-section"><div class="section-rule"><h3>${title}</h3><span>${hint}</span></div>${body}</section>`;
  root.innerHTML = `${controls(model)}
    <div class="an-summary">${summary(model, filtered)}</div>
    ${section('Trends', 'Selected measures', lineChart(model, filtered))}
    ${section('Routine adherence', 'Green = on', adherenceHeatmap(model, filtered))}
    ${section('Symptom intensity', 'Darker = stronger', symptomHeatmap(model, filtered))}
    ${section('On vs off', state.item ? esc(state.item) : 'Pick a focus item', comparison(model, filtered))}
    ${section('Change log', 'Starts, stops, dose changes', changeLog(model, filtered))}
    ${section('Potential correlations', state.lag === '0' ? 'Same day' : `Effect ${state.lag} day(s) later`, correlations(model, filtered))}`;
  root.querySelectorAll('[data-filter]').forEach((select) => select.addEventListener('change', () => { state[select.dataset.filter] = select.value; if (select.dataset.filter === 'group') state.item = ''; renderAnalysis(root, ctx); }));
  root.querySelectorAll('[data-metric]').forEach((box) => box.addEventListener('change', () => {
    state.metrics = [...root.querySelectorAll('[data-metric]:checked')].map((input) => input.dataset.metric);
    const open = root.querySelector('.an-metrics')?.open;
    renderAnalysis(root, ctx);
    if (open) root.querySelector('.an-metrics').open = true;
  }));
}
