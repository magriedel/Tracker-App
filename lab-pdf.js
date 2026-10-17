const DATE_PATTERN = /\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b/;
const NUMBER_PATTERN = /[<>]?\s*-?\d+(?:[.,]\d+)?/g;
const KNOWN_MARKERS = [
  ['Free T4', /\b(?:free\s*t4|t4\s*,?\s*free|ft4)\b/i],
  ['Free T3', /\b(?:free\s*t3|t3\s*,?\s*free|ft3)\b/i],
  ['Total T4', /\b(?:total\s*t4|t4\s*,?\s*total)\b/i],
  ['Total T3', /\b(?:total\s*t3|t3\s*,?\s*total)\b/i],
  ['Thyroid peroxidase antibodies', /\b(?:thyroid\s+peroxidase\s+(?:ab|antibodies)|tpo\s*(?:ab|antibodies?))\b/i],
  ['Thyroglobulin antibodies', /\b(?:thyroglobulin\s+(?:ab|antibodies)|tg\s*(?:ab|antibodies?))\b/i],
  ['25-OH Vitamin D', /\b25\s*-?\s*oh\s+vitamin\s*d\b|\bvitamin\s*d\s*,?\s*25\s*-?\s*hydroxy\b|\b25\s*-?\s*hydroxy\s+vitamin\s*d\b/i],
  ['Thyroid-stimulating immunoglobulin', /\b(?:thyroid\s+stimulating\s+immunoglobulin|tsi)\b/i],
  ['TSH receptor antibodies', /\b(?:tsh\s+receptor\s+(?:ab|antibodies)|trab)\b/i],
  ['TSH', /\b(?:tsh|thyroid\s+stimulating\s+hormone|thyrotropin)\b/i],
  ['TRAb', /\btrab\b/i],
  ['TSI', /\btsi\b/i]
];
const MARKER_ALIASES = [
  ['TSH', ['tsh', 'ultrasensitive tsh', 'tsh ultrasensitive', 'sensitive tsh', 'tsh ultrasensible', 'thyroid stimulating hormone', 'thyroid stimulating hormone tsh', 'thyrotropin', 'tirotropina', 'hormona estimulante de la tiroides', 'hormona estimulante tiroidea', 'hormona estimulante tiroides', 'hormona estimulante tiroides ultrasensible']],
  ['Free T4', ['free t4', 'ft4', 'free thyroxine', 'thyroxine free', 't4 free', 't4 libre', 't4 libre ft4', 't4 libre suero', 'thyroxine libre', 'tiroxina libre', 'tiroxina libre t4', 'tiroxina libre suero', 't4l']],
  ['Free T3', ['free t3', 'ft3', 'free triiodothyronine', 'triiodothyronine free', 't3 free', 't3 libre', 'triyodotironina libre', 'triiodotironina libre', 't3l']],
  ['Total T4', ['total t4', 't4 total', 'thyroxine total', 'thyroxine t4', 'thyroxine t4 total', 'tiroxina total', 't4 total serum']],
  ['Total T3', ['total t3', 't3 total', 'triiodothyronine total', 'triiodotironina total']],
  ['Thyroid Peroxidase Antibodies', ['tpo', 'tpo ab', 'tpo antibodies', 'thyroid peroxidase antibodies', 'thyroid peroxidase tpo ab', 'anti tpo', 'anti tpo antibodies', 'anticuerpos tpo', 'anticuerpos anti tpo', 'anticuerpos antiperoxidasa', 'anticuerpos antiperoxidasa tiroidea', 'anticuerpos contra la peroxidasa tiroidea']],
  ['Thyroglobulin Antibodies', ['tg ab', 'tg antibodies', 'thyroglobulin antibodies', 'anti thyroglobulin', 'anticuerpos antitiroglobulina', 'anticuerpos anti tiroglobulina']],
  ['TSI', ['tsi', 'thyroid stimulating immunoglobulin', 'thyroid stimulating immunoglobulins', 'inmunoglobulina estimulante tiroidea', 'inmunoglobulinas estimulantes tiroideas']],
  ['TRAb', ['trab', 'tsh receptor antibodies', 'tsh receptor ab', 'thyrotropin receptor antibodies', 'anticuerpos del receptor de tsh', 'anticuerpos receptor tsh', 'anticuerpos anti receptor de tsh']]
];
const normalizeMarkerText = (marker) => String(marker ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const MARKER_ALIAS_MAP = new Map(MARKER_ALIASES.flatMap(([canonical, aliases]) => aliases.map((alias) => [normalizeMarkerText(alias), canonical])));

export function canonicalLabMarker(marker) {
  const original = String(marker ?? '').trim();
  return MARKER_ALIAS_MAP.get(normalizeMarkerText(original)) || original;
}

export function labMarkerIdentity(marker) {
  return normalizeMarkerText(canonicalLabMarker(marker));
}

const LAB_UNITS = /^(?:%|units?|u?m?iu\/(?:l|ml)|µiu\/(?:l|ml)|μiu\/(?:l|ml)|mu\/l|ng\/(?:dl|ml|l)|u?g\/(?:dl|ml|l)|pg\/(?:ml|l)|pmol\/l|nmol\/l|mmol\/l|u?mol\/l|µmol\/l|μmol\/l|mg\/(?:dl|l)|g\/(?:dl|l)|u\/l|iu\/l|ml\/min(?:\/\d+(?:\.\d+)?)?|cells?\/(?:ul|µl|μl)|k\/ul|fl|pg|seconds?|sec|minutes?|min|ratio|index|copies\/ml|10\^?\d+\/(?:l|ul))$/i;
const DOSE_UNITS = /^(?:mg|mcg|µg|μg|ug|g|grams?|iu|ml|capsules?|caps?|tablets?|pills?|scoops?|drops?|cfu|billion)(?:\s|$)/i;

const normalizeDate = (raw) => {
  if (!raw) return '';
  const parts = raw.split(/[-/]/).map(Number);
  let year; let month; let day;
  if (parts[0] > 31) [year, month, day] = parts;
  else { [month, day, year] = parts; if (year < 100) year += year < 50 ? 2000 : 1900; }
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

function linesFromText(text) {
  const lines = text.split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const joined = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^Thyroid Peroxidase\s*\(TPO\)$/i.test(lines[index]) && /^Ab\s+\d{2}\b/i.test(lines[index + 1] || '')) joined.push(`${lines[index]} ${lines[++index]}`);
    else joined.push(lines[index]);
  }
  return joined.flatMap(splitAdjacentRows);
}

function splitAdjacentRows(line) {
  const markerStart = '(?:WBC|RBC|Hemoglobin|Hematocrit|MCV|MCH|MCHC|RDW|Platelets?|Neutrophils|Lymphs?|Monocytes|Eos|Basos|Immature Granulocytes|eGFR|BUN\\/Creatinine Ratio|Thyroxine|Free Thyroxine Index|Antiparietal Cell Antibody|Thyroid Peroxidase|TSH|Free T[34]|Total T[34])';
  const suffix = new RegExp(`(not\\s+estab\\.?|[<>]?\\s*-?\\d+(?:[.,]\\d+)?\\s*(?:-|\\u2013|\\u2014|to)\\s*[<>]?\\s*-?\\d+(?:[.,]\\d+)?|[<>]\\s*\\d+(?:[.,]\\d+)?)(?=${markerStart}\\b)`, 'ig');
  const starts = [...line.matchAll(new RegExp(`${markerStart}\\b(?=(?:\\s+(?:[a-z][a-z0-9()/.-]*|\\([^)]+\\))){0,5}\\s+(?:\\d{2}\\s+)?[<>]?\\s*\\d)`, 'ig'))].map((match) => match.index).filter((index) => index > 0);
  const parts = [];
  let start = 0;
  starts.forEach((index) => { if (index > start) { parts.push(line.slice(start, index).trim()); start = index; } });
  parts.push(line.slice(start).trim());
  return parts.flatMap((part) => part.replace(suffix, '$1\n').split('\n').map((item) => item.trim()).filter(Boolean));
}

function parseOrphanLabcorpResult(line) {
  const reference = '(?:[<>]?\\s*-?\\d+(?:[.,]\\d+)?\\s*(?:-|\\u2013|\\u2014|to)\\s*[<>]?\\s*-?\\d+(?:[.,]\\d+)?|not\\s+estab\\.?|[<>]\\s*\\d+(?:[.,]\\d+)?)';
  const match = line.match(new RegExp(`^([<>]?\\s*-?\\d+(?:[.,]\\d+)?)(?:\\s+(HIGH|LOW|H|L))?(?:\\s+([<>]?\\s*-?\\d+(?:[.,]\\d+)?)\\s+(\\d{1,2}[-/]\\d{1,2}[-/]\\d{2,4}))?\\s+([a-zµμ%][a-z0-9µμ/^.-]*)\\s+(${reference})$`, 'i'));
  if (!match) return null;
  const [, currentRaw, explicitFlag, previousRaw, previousDate, units, referenceValue] = match;
  if (!isLabUnit(units) && !/^x?10(?:e|\^)?\d+\/(?:u|µ)?l$/i.test(units.replace(/\s+/g, ''))) return null;
  const currentValue = Number(currentRaw.replace(/[<>\\s]/g, '').replace(',', '.'));
  if (!Number.isFinite(currentValue)) return null;
  return { currentValue, explicitFlag, previousRaw, previousDate, units, reference: referenceValue.trim() };
}

function isMarkerOnlyLine(line) {
  const marker = line.replace(/\s+\d{2}$/, '').trim();
  return marker.length >= 3 && /[a-z]/i.test(marker) && !DATE_PATTERN.test(marker) && !/^[-+]?\d/.test(marker) && !/\b(?:reference interval|not estab)\b/i.test(marker);
}

function rowsFromOrphan(marker, orphan, currentDate) {
  const cleanMarker = marker.replace(/\s+\d{2}$/, '').replace(/\s+/g, ' ').trim();
  const reportFlag = /^H/i.test(orphan.explicitFlag || '') ? 'H' : /^L/i.test(orphan.explicitFlag || '') ? 'L' : '';
  const derivedFlag = rangeFlag(orphan.currentValue, orphan.reference);
  const rows = [{ marker: cleanMarker, date: currentDate, value: orphan.currentValue, units: orphan.units, reference: orphan.reference, flag: reportFlag || derivedFlag, flagSource: reportFlag ? 'report' : derivedFlag ? 'reference interval' : '', resultPeriod: 'Current' }];
  if (orphan.previousRaw && orphan.previousDate) rows.push({ marker: cleanMarker, date: normalizeDate(orphan.previousDate), value: Number(orphan.previousRaw.replace(/[<>\\s]/g, '').replace(',', '.')), units: orphan.units, reference: orphan.reference, flag: '', flagSource: '', resultPeriod: 'Previous' });
  return rows;
}

function firstNumber(text) {
  const match = NUMBER_PATTERN.exec(text);
  NUMBER_PATTERN.lastIndex = 0;
  if (!match) return null;
  const raw = match[0].replace(/[<>\s]/g, '').replace(',', '.');
  const value = Number(raw);
  return Number.isFinite(value) ? { value, index: match.index, end: match.index + match[0].length } : null;
}

function extractValueTail(tail) {
  const result = firstNumber(tail);
  if (!result) return null;
  const rest = tail.slice(result.end).trim();
  const rangeMatch = rest.match(/(?:^|\s)([<>]?\s*-?\d+(?:[.,]\d+)?)\s*(?:-|\u2013|\u2014|to)\s*([<>]?\s*-?\d+(?:[.,]\d+)?)/i);
  const unitEnd = rangeMatch ? rangeMatch.index : rest.length;
  const units = rest.slice(0, unitEnd).replace(/^[|,;:\s]+|[|,;:\s]+$/g, '').slice(0, 36);
  const reference = rangeMatch ? rangeMatch[0].trim().replace(/^[\s-]+/, '') : '';
  return { value: result.value, units, reference };
}

function isLabUnit(units) {
  const normalized = units.toLowerCase().replace(/\s+/g, '').replace(/[μ]/g, 'µ');
  return LAB_UNITS.test(normalized) || /^x?10(?:e|\^)?\d+\/(?:u|µ)?l$/i.test(normalized);
}

function rangeFlag(value, reference) {
  const match = reference.match(/^\s*([<>]?)\s*(-?\d+(?:[.,]\d+)?)\s*(?:-|\u2013|\u2014|to)\s*([<>]?)\s*(-?\d+(?:[.,]\d+)?)\s*$/i);
  if (!match) return '';
  const low = Number(match[2].replace(',', '.'));
  const high = Number(match[4].replace(',', '.'));
  return value < low ? 'L' : value > high ? 'H' : '';
}

function parseLabcorpCbcLine(line, currentDate) {
  const match = line.match(/^(.+?)\s+(?:\d{2}\s+)?([<>]?\s*-?\d+(?:[.,]\d+)?)(?:\s+(HIGH|LOW|H|L))?(?:\s+([<>]?\s*-?\d+(?:[.,]\d+)?)\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}))?\s+(.+)$/i);
  if (!match) return null;
  const [, marker, currentRaw, explicitFlag, previousRaw, previousDate, tail] = match;
  const toNumber = (value) => Number(value.replace(/\s/g, '').replace(',', '.'));
  const cleanMarker = marker.replace(/\s+/g, ' ').trim();
  if (!/[a-z]/i.test(cleanMarker)) return null;
  const currentValue = toNumber(currentRaw);
  if (!Number.isFinite(currentValue)) return null;
  const tailText = tail.trim();
  const firstSpace = tailText.search(/\s/);
  const firstToken = firstSpace < 0 ? tailText : tailText.slice(0, firstSpace);
  const hasUnit = /[a-z%µμ]/i.test(firstToken) && !/^(?:high|low|h|l)$/i.test(firstToken);
  const units = hasUnit ? firstToken : '';
  const cleanReference = (hasUnit ? tailText.slice(firstToken.length) : tailText).trim();
  const derivedFlag = rangeFlag(currentValue, cleanReference);
  const reportFlag = /^H/i.test(explicitFlag || '') ? 'H' : /^L/i.test(explicitFlag || '') ? 'L' : '';
  const rows = [{ marker: cleanMarker, date: currentDate, value: currentValue, units, reference: cleanReference, flag: reportFlag || derivedFlag, flagSource: reportFlag ? 'report' : derivedFlag ? 'reference interval' : '', resultPeriod: 'Current' }];
  if (previousRaw && previousDate) {
    const previousValue = toNumber(previousRaw);
    if (Number.isFinite(previousValue)) rows.push({ marker: cleanMarker, date: normalizeDate(previousDate), value: previousValue, units, reference: cleanReference, flag: '', flagSource: '', resultPeriod: 'Previous' });
  }
  return rows;
}

function parseDatedLabcorpLine(line, currentDate) {
  const dateMatch = DATE_PATTERN.exec(line);
  if (!dateMatch) return null;
  const prefix = line.slice(0, dateMatch.index).trim();
  const suffix = line.slice(dateMatch.index + dateMatch[0].length).trim();
  const tokens = [...prefix.matchAll(/\S+/g)].map((match) => ({ text: match[0], index: match.index }));
  const numeric = tokens.map((token, index) => ({ ...token, tokenIndex: index, value: /^[<>]?\s*-?\d+(?:[.,]\d+)?$/.test(token.text) ? Number(token.text.replace(/[<>\s]/g, '').replace(',', '.')) : null })).filter((token) => token.value !== null && Number.isFinite(token.value));
  if (!numeric.length) return null;
  if (numeric.length > 1 && numeric[0].text === '01') numeric.shift();
  const resultTokens = numeric.slice(-2);
  const current = resultTokens[0];
  const previous = resultTokens.length > 1 ? resultTokens[1] : null;
  const marker = prefix.slice(0, current.index).replace(/\s+01\s*$/, '').trim();
  if (marker.length < 2 || !/[a-z]/i.test(marker) || /\b(?:patient|accession|dob|date of birth|page)\b/i.test(marker)) return null;
  const between = tokens.filter((token) => token.index > current.index && (!previous || token.index < previous.index)).map((token) => token.text);
  const explicitFlag = between.find((token) => /^(?:high|low|h|l)$/i.test(token)) || '';
  let units = '';
  let reference = suffix;
  const suffixTokens = suffix.split(/\s+/).filter(Boolean);
  if (suffixTokens.length && /[a-z%µμ]/i.test(suffixTokens[0]) && !/^(?:high|low|h|l)$/i.test(suffixTokens[0])) {
    units = suffixTokens.shift();
    reference = suffixTokens.join(' ');
  }
  const currentDateValue = currentDate || '';
  const reportFlag = /^H/i.test(explicitFlag) ? 'H' : /^L/i.test(explicitFlag) ? 'L' : '';
  const derivedFlag = rangeFlag(current.value, reference);
  const rows = [{ marker, date: currentDateValue, value: current.value, units, reference, flag: reportFlag || derivedFlag, flagSource: reportFlag ? 'report' : derivedFlag ? 'reference interval' : '', resultPeriod: 'Current' }];
  if (previous) rows.push({ marker, date: normalizeDate(dateMatch[0]), value: previous.value, units, reference, flag: '', flagSource: '', resultPeriod: 'Previous' });
  return rows;
}

function candidateForLine(line, reportDate) {
  if (/\b(?:reference range|normal range|result\s+flag|patient|specimen|collected|collection date|date of birth|dob|accession|page\s+\d+)\b/i.test(line) && !/\b(?:tsh|t3|t4|vitamin|antibod|glucose|cholesterol)\b/i.test(line)) return null;
  const dateMatch = line.match(DATE_PATTERN);
  const date = normalizeDate(dateMatch?.[1]) || reportDate;
  for (const [marker, pattern] of KNOWN_MARKERS) {
    const match = pattern.exec(line);
    if (!match) continue;
    const tail = line.slice(match.index + match[0].length).replace(DATE_PATTERN, ' ');
    const details = extractValueTail(tail);
    if (!details) return null;
    return { marker, date, ...details };
  }
  const numeric = firstNumber(line);
  if (!numeric) return null;
  const marker = line.slice(0, numeric.index).replace(/[|,:;\s-]+$/g, '').replace(/^[|,:;\s-]+/g, '').trim();
  if (marker.length < 2 || marker.length > 60 || !/[a-z]/i.test(marker) || DATE_PATTERN.test(marker)) return null;
  if (/\b(?:page|phone|fax|zip|account|patient|specimen|accession|collected|reported|reference|range|result|date|dob)\b/i.test(marker)) return null;
  const details = extractValueTail(line.slice(numeric.index));
  return details ? { marker, date, ...details } : null;
}

export function parseLabLines(rawLines) {
  const sourceLines = Array.isArray(rawLines) ? rawLines : linesFromText(String(rawLines));
  const normalized = sourceLines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const joined = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (/^Thyroid Peroxidase\s*\(TPO\)$/i.test(normalized[index]) && /^Ab(?:\s+\d{2})?$/i.test(normalized[index + 1] || '')) joined.push(`${normalized[index]} ${normalized[++index]}`);
    else joined.push(normalized[index]);
  }
  const lines = joined.flatMap(splitAdjacentRows);
  const labeledDateLines = lines.filter((line) => /\b(?:collection date|date collected|collected|drawn|draw date|specimen date|result date|reported|date of service|date)\b/i.test(line) && !/\b(?:date of birth|dob)\b/i.test(line));
  let reportDate = '';
  for (const line of labeledDateLines) { const match = line.match(DATE_PATTERN); if (match) { reportDate = normalizeDate(match[1]); if (reportDate) break; } }
  const rows = [];
  const seen = new Set();
  let orphan = null;
  for (const line of lines) {
    const orphanMatch = parseOrphanLabcorpResult(line);
    if (orphanMatch) { orphan = orphanMatch; continue; }
    if (orphan && isMarkerOnlyLine(line)) {
      for (const row of rowsFromOrphan(line, orphan, reportDate)) {
        const key = [row.marker.toLowerCase(), row.date, row.value, row.units.toLowerCase()].join('|');
        if (!seen.has(key)) { seen.add(key); rows.push(row); }
      }
      orphan = null;
      continue;
    }
    const dated = parseDatedLabcorpLine(line, reportDate);
    if (dated) {
      for (const row of dated) {
        const key = [row.marker.toLowerCase(), row.date, row.value, row.units.toLowerCase()].join('|');
        if (!seen.has(key)) { seen.add(key); rows.push(row); }
      }
      continue;
    }
    const structured = parseLabcorpCbcLine(line, reportDate);
    const candidates = structured || [candidateForLine(line, reportDate)].filter(Boolean);
    for (const row of candidates) {
      if (!Number.isFinite(row.value)) continue;
      const key = [row.marker.toLowerCase(), row.date, row.value, row.units.toLowerCase()].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function textLinesFromItems(items) {
  const buckets = [];
  items.filter((item) => item.str?.trim()).forEach((item) => {
    const y = item.transform?.[5] ?? 0;
    let line = buckets.find((entry) => Math.abs(entry.y - y) < 2.2);
    if (!line) { line = { y, cells: [] }; buckets.push(line); }
    line.cells.push({ x: item.transform?.[4] ?? 0, text: item.str });
  });
  return buckets.sort((a, b) => b.y - a.y).map((line) => line.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export async function readPdfLabRows(file) {
  const pdfjs = await import('./pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf.worker.min.mjs', import.meta.url).href;
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  for (let pageNo = 1; pageNo <= document.numPages; pageNo += 1) {
    const page = await document.getPage(pageNo);
    const content = await page.getTextContent();
    lines.push(...textLinesFromItems(content.items));
  }
  return parseLabLines(lines);
}
