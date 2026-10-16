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
const LAB_UNITS = /^(?:%|m?iu\/(?:l|ml)|u?iu\/(?:l|ml)|ng\/(?:dl|ml|l)|pg\/(?:ml|l)|pmol\/l|nmol\/l|mmol\/l|umol\/l|µmol\/l|μmol\/l|mg\/(?:dl|l)|g\/(?:dl|l)|u\/l|iu\/l|cells?\/(?:ul|µl|μl)|k\/ul|fl|pg|seconds?|sec|minutes?|min|ratio|index|copies\/ml|miu\/l|miu\/ml|10\^?\d+\/(?:l|ul))$/i;
const DOSE_UNITS = /^(?:mg|mcg|µg|μg|ug|g|grams?|iu|ml|capsules?|caps?|tablets?|pills?|scoops?|drops?|cfu|billion)(?:\b|\s|$)/i;

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
  return text.split(/\n+/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
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

function candidateForLine(line, reportDate) {
  if (/\b(?:reference range|normal range|result\s+flag|patient|specimen|collected|collection date|date of birth|dob|accession|page\s+\d+)\b/i.test(line) && !/\b(?:tsh|t3|t4|vitamin|antibod|glucose|cholesterol)\b/i.test(line)) return null;
  const dateMatch = line.match(DATE_PATTERN);
  const date = normalizeDate(dateMatch?.[1]) || reportDate;
  for (const [marker, pattern] of KNOWN_MARKERS) {
    const match = pattern.exec(line);
    if (!match) continue;
    const tail = line.slice(match.index + match[0].length).replace(DATE_PATTERN, ' ');
    const details = extractValueTail(tail);
    if (!details || DOSE_UNITS.test(details.units)) return null;
    if (details.units && !LAB_UNITS.test(details.units.replace(/\s+/g, ''))) return null;
    return { marker, date, ...details };
  }
  const numeric = firstNumber(line);
  if (!numeric) return null;
  const marker = line.slice(0, numeric.index).replace(/[|,:;\s-]+$/g, '').replace(/^[|,:;\s-]+/g, '').trim();
  if (marker.length < 2 || marker.length > 60 || !/[a-z]/i.test(marker) || DATE_PATTERN.test(marker)) return null;
  if (/\b(?:page|phone|fax|zip|account|patient|specimen|accession|collected|reported|reference|range|result|date|dob)\b/i.test(marker)) return null;
  const details = extractValueTail(line.slice(numeric.index));
  return details && LAB_UNITS.test(details.units.replace(/\s+/g, '')) ? { marker, date, ...details } : null;
}

export function parseLabLines(rawLines) {
  const lines = Array.isArray(rawLines) ? rawLines : linesFromText(String(rawLines));
  const labeledDateLines = lines.filter((line) => /\b(?:collection date|date collected|collected|drawn|draw date|specimen date|result date|reported|date of service|date)\b/i.test(line) && !/\b(?:date of birth|dob)\b/i.test(line));
  let reportDate = '';
  for (const line of labeledDateLines) { const match = line.match(DATE_PATTERN); if (match) { reportDate = normalizeDate(match[1]); if (reportDate) break; } }
  const rows = [];
  const seen = new Set();
  for (const line of lines) {
    const row = candidateForLine(line, reportDate);
    if (!row || !Number.isFinite(row.value)) continue;
    const key = [row.marker.toLowerCase(), row.date, row.value, row.units.toLowerCase()].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
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
