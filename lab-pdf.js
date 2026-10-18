import { canonicalCatalogMarker, catalogMarkerDefinition } from './lab-catalog.js';

const DATE_PATTERN = /\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/;
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
  ['TSH receptor antibodies (TRAb)', /\b(?:tsh\s*[- ]\s*r\s*[- ]?ab|tsh[- ]?rab)\b/i],
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
  ['TRAb', ['trab', 'tsh receptor antibodies', 'tsh receptor ab', 'thyrotropin receptor antibodies', 'anticuerpos del receptor de tsh', 'anticuerpos receptor tsh', 'anticuerpos anti receptor de tsh']],
  ['White Blood Cell Count', ['wbc', 'white blood cell count', 'white blood cells', 'leukocytes', 'leucocitos', 'globulos blancos', 'globulos blancos totales']],
  ['Red Blood Cell Count', ['rbc', 'red blood cell count', 'red blood cells', 'erythrocytes', 'eritrocitos', 'globulos rojos']],
  ['Hemoglobin', ['hemoglobin', 'haemoglobin', 'hemoglobina']],
  ['Hematocrit', ['hematocrit', 'haematocrit', 'hematocrito']],
  ['Platelets', ['platelet count', 'platelets', 'plaquetas', 'recuento de plaquetas']],
  ['Neutrophils', ['neutrophils', 'neutrofilos', 'neutrofilos absolutos', 'neutrofilos porcentaje']],
  ['Lymphocytes', ['lymphs', 'lymphocytes', 'linfocitos', 'linfocitos absolutos', 'linfocitos porcentaje']],
  ['Monocytes', ['monocytes', 'monocitos', 'monocitos absolutos', 'monocitos porcentaje']],
  ['Eosinophils', ['eos', 'eosinophils', 'eosinofilos', 'eosinofilos absolutos', 'eosinofilos porcentaje']],
  ['Basophils', ['basos', 'basophils', 'basofilos', 'basofilos absolutos', 'basofilos porcentaje']],
  ['Glucose', ['glucose', 'glucosa']],
  ['Creatinine', ['creatinine', 'creatinina']],
  ['Blood Urea Nitrogen', ['bun', 'blood urea nitrogen', 'urea nitrogen', 'nitrogeno ureico', 'nitrogeno ureico en sangre']],
  ['Sodium', ['sodium', 'sodio']],
  ['Potassium', ['potassium', 'potasio']],
  ['Chloride', ['chloride', 'cloro', 'cloruro']],
  ['Calcium', ['calcium', 'calcio']],
  ['Albumin', ['albumin', 'albumina']],
  ['Total Protein', ['total protein', 'proteina total']],
  ['Total Bilirubin', ['total bilirubin', 'bilirubin total', 'bilirrubina total']],
  ['Alkaline Phosphatase', ['alkaline phosphatase', 'alk phos', 'fosfatasa alcalina']],
  ['Aspartate Aminotransferase', ['ast', 'sgot', 'aspartate aminotransferase', 'aspartato aminotransferasa', 'transaminasa got']],
  ['Alanine Aminotransferase', ['alt', 'sgpt', 'alanine aminotransferase', 'alanina aminotransferasa', 'transaminasa gpt']],
  ['Total Cholesterol', ['total cholesterol', 'cholesterol total', 'colesterol total']],
  ['HDL Cholesterol', ['hdl', 'hdl cholesterol', 'colesterol hdl']],
  ['LDL Cholesterol', ['ldl', 'ldl cholesterol', 'colesterol ldl']],
  ['Triglycerides', ['triglycerides', 'trigliceridos']],
  ['Vitamin D', ['vitamin d', '25 oh vitamin d', '25 hydroxy vitamin d', 'vitamina d', '25 oh vitamina d', '25 hidroxi vitamina d']],
  ['Vitamin B12', ['vitamin b12', 'b12', 'vitamina b12', 'cobalamina']],
  ['Ferritin', ['ferritin', 'ferritina']],
  ['Iron', ['iron', 'hierro']],
  ['Magnesium', ['magnesium', 'magnesio']],
  ['Phosphorus', ['phosphorus', 'phosphate', 'fosforo', 'fosfato']],
  ['C-Reactive Protein', ['crp', 'c reactive protein', 'proteina c reactiva', 'pcr']],
  ['Cortisol', ['cortisol']],
  ['Testosterone', ['testosterone', 'testosterona']],
  ['Estradiol', ['estradiol', 'estradiolo', 'estradiol']],
  ['Progesterone', ['progesterone', 'progesterona']],
  ['Insulin', ['insulin', 'insulina']],
  ['Prolactin', ['prolactin', 'prolactina']]
];
const normalizeMarkerText = (marker) => String(marker ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const MARKER_ALIAS_MAP = new Map(MARKER_ALIASES.flatMap(([canonical, aliases]) => aliases.map((alias) => [normalizeMarkerText(alias), canonical])));
const BIOMARKER_PATTERNS = [
  /^(?:wbc|white blood cells?|leukocytes?|rbc|red blood cells?|erythrocytes?|hemoglobin|haemoglobin|hematocrit|haematocrit|packed cell volume|mcv|mch|mchc|rdw|platelets?|platelet count|neutrophils?(?: absolute| percent| #)?|lymphs?(?: absolute| percent| #)?|lymphocytes?(?: absolute| percent| #)?|monocytes?(?: absolute| percent| #)?|eos(?: absolute| percent| #)?|eosinophils?(?: absolute| percent| #)?|basos?(?: absolute| percent| #)?|basophils?(?: absolute| percent| #)?|immature granulocytes?(?: absolute| percent| #)?|nucleated red blood cells?)$/,
  /^(?:glucose|bun|blood urea nitrogen|urea nitrogen|creatinine|bun creatinine ratio|bun creatinine|egfr|estimated glomerular filtration rate|sodium|potassium|chloride|carbon dioxide|co2|calcium|protein total|total protein|albumin|globulin|a g ratio|albumin globulin ratio|bilirubin(?: total| direct| indirect)?|alkaline phosphatase|alk phos|ast|sgot|aspartate aminotransferase|alt|sgpt|alanine aminotransferase|ggt|gamma glutamyl transferase|anion gap|osmolality)$/,
  /^(?:cholesterol(?: total)?|total cholesterol|triglycerides?|hdl(?: cholesterol)?|ldl(?: cholesterol)?|vldl(?: cholesterol)?|non hdl cholesterol|apolipoprotein [ab]|lipoprotein a)$/,
  /^(?:tsh|thyroid stimulating hormone(?: tsh)?|thyrotropin|ultrasensitive tsh|tsh ultrasensitive|sensitive tsh|tsh ultrasensible|hormona estimulante de la tiroides|hormona estimulante tiroidea|hormona estimulante tiroides|free t[34]|total t[34]|t[34] free|t[34] total|ft[34]|t[34] libre|t[34]l|thyroxine(?: \(t4\))?|free thyroxine|free thyroxine index|thyroxine binding globulin|t3 uptake|t4 uptake|tpo(?: ab| antibodies?)?|thyroid peroxidase(?: \(tpo\))?(?: ab| antibodies?)?|thyroglobulin(?: ab| antibodies?)?|anti tpo(?: antibodies?)?|antiparietal cell antibody|parietal cell antibodies?|thyroid stimulating immunoglobulin|tsi|trab|tsh receptor antibodies?)$/,
  /^(?:vitamin d(?: 25 hydroxy| 25 oh)?|25 oh vitamin d|25 hydroxy vitamin d|vitamin b12|b12|folate|folic acid|ferritin|iron|iron binding capacity|tibc|transferrin|transferrin saturation|iron saturation|magnesium|phosphorus|phosphate|zinc|copper)$/,
  /^(?:c reactive protein|crp|high sensitivity crp|hs crp|esr|sedimentation rate|erythrocyte sedimentation rate|ana|antinuclear antibodies?|rheumatoid factor|rf|complement c[34])$/,
  /^(?:insulin|c peptide|cortisol|testosterone(?: total| free)?|estradiol|progesterone|dhea(?: s)?|lh|luteinizing hormone|fsh|follicle stimulating hormone|prolactin|shbg|sex hormone binding globulin|pth|parathyroid hormone|igf 1|growth hormone)$/
];

export function isBiomarkerName(marker) {
  const normalized = normalizeMarkerText(marker).replace(/\s+\d{2}$/, '');
  if (!normalized || /^(?:name|age|sex|gender|dob|date|page|patient|specimen|accession|reference|result|test)$/.test(normalized)) return false;
  if (MARKER_ALIAS_MAP.has(normalized) || catalogMarkerDefinition(marker)) return true;
  return BIOMARKER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isExcludedReportLabel(marker) {
  const normalized = normalizeMarkerText(marker).replace(/\s+\d{2}$/, '');
  return /^(?:name|patient(?: name| id| number| identifier)?|patient id|patient identifier|id paciente|identificacion(?: del paciente)?|age|edad|sex|sexo|gender|genero|dob|date of birth|fecha de nacimiento|birth(?: date)?|date(?: of birth| collected| of service)?|fecha(?: de (?:nacimiento|toma|recoleccion|extraccion|servicio))?|page(?: \d+)?|reference(?: interval| range| values?)?|rango de referencia|intervalo de referencia|valores de referencia|test(?: name)?|result(?: flag)?|specimen(?: id| type)?|accession(?: number)?|order(?: number)?|account(?: number)?|report(?: date| number)?|labcorp|diagnosis|women|men|female|male|mujeres|hombres|trimester|trimestre|patient information|informacion del paciente|informacion personal)(?:\b|$)/.test(normalized);
}

function isReferenceAnnotationLine(line) {
  const normalized = normalizeMarkerText(line);
  return /^(?:(?:i|ii|iii|iv|1st|2nd|3rd|first|second|third) trimester|(?:primer|segundo|tercer) trimestre|women|men|female|male|mujeres|hombres|femenino|masculino|reference|reference range|normal range|rango de referencia|intervalo de referencia|age|edad)\b/.test(normalized);
}

function isStructuredLabMarker(marker) {
  const normalized = normalizeMarkerText(marker).replace(/\s+\d{2}$/, '');
  return Boolean(normalized && normalized.length <= 100 && /[a-z]/.test(normalized) && !isExcludedReportLabel(normalized) && !isReferenceAnnotationLine(normalized) && isBiomarkerName(normalized));
}

function isLayoutBiomarkerLabel(marker) {
  const text = String(marker || '').replace(/\s+/g, ' ').trim();
  const normalized = normalizeMarkerText(text);
  return Boolean(text && text.length <= 100 && /[a-z]/i.test(text) && !DATE_PATTERN.test(text) && !isExcludedReportLabel(text) && !isReferenceAnnotationLine(text) && !/\b(?:reference|range|interval|patient|paciente|birth|nacimiento|age|edad|sex|gender|sexo|genero|trimestre|trimester|women|mujeres|men|hombres|specimen|accession|diagnosis|page|account|order)\b/.test(normalized));
}

export function canonicalLabMarker(marker) {
  const original = String(marker ?? '').trim();
  return canonicalCatalogMarker(MARKER_ALIAS_MAP.get(normalizeMarkerText(original)) || original);
}

export function labMarkerIdentity(marker) {
  const canonical = canonicalLabMarker(marker);
  const normalized = normalizeMarkerText(canonical);
  return /(?:calculated free testosterone \(cft\) %|bioavailable testosterone %)$/i.test(canonical) ? `${normalized} percent` : normalized;
}

const LAB_UNITS = /^(?:%|units?|u?m?iu\/(?:l|ml)|µiu\/(?:l|ml)|μiu\/(?:l|ml)|mu\/l|ng\/(?:dl|ml|l)|u?g\/(?:dl|ml|l)|pg\/(?:ml|l)|pmol\/l|nmol\/l|mmol\/l|u?mol\/l|µmol\/l|μmol\/l|mg\/(?:dl|l)|g\/(?:dl|l)|u\/l|iu\/l|ml\/min(?:\/\d+(?:\.\d+)?)?|cells?\/(?:ul|µl|μl)|k\/ul|fl|pg|seconds?|sec|minutes?|min|ratio|index|copies\/ml|10\^?\d+\/(?:l|ul))$/i;
const DOSE_UNITS = /^(?:mg|mcg|µg|μg|ug|g|grams?|iu|ml|capsules?|caps?|tablets?|pills?|scoops?|drops?|cfu|billion)(?:\s|$)/i;

const normalizeDate = (raw) => {
  if (!raw) return '';
  const parts = raw.split(/[-/._]/).map(Number);
  let year; let month; let day;
  if (parts[0] > 31) [year, month, day] = parts;
  else if (String(raw).includes('.') || parts[0] > 12) { [day, month, year] = parts; if (year < 100) year += year < 50 ? 2000 : 1900; }
  else { [month, day, year] = parts; if (year < 100) year += year < 50 ? 2000 : 1900; }
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export function dateFromFilename(fileName) {
  const name = String(fileName || '').replace(/\.[^.]+$/, '');
  const dottedDmy = name.match(/(?:^|[^0-9])(\d{1,2})\.(\d{1,2})\.((?:19|20)\d{2})(?=$|[^0-9])/);
  if (dottedDmy) {
    const date = normalizeDate(`${dottedDmy[1]}.${dottedDmy[2]}.${dottedDmy[3]}`);
    const [year, month, day] = date.split('-').map(Number);
    const actual = new Date(Date.UTC(year, month - 1, day));
    if (date && actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day) return date;
  }
  const match = name.match(/(?:^|[^0-9])((?:(?:19|20)\d{2}[-/._]\d{1,2}[-/._]\d{1,2})|(?:\d{1,2}[-/._]\d{1,2}[-/._](?:19|20)\d{2}))(?=$|[^0-9])/);
  if (match) {
    const date = normalizeDate(match[1]);
    const [year, month, day] = date.split('-').map(Number);
    const actual = new Date(Date.UTC(year, month - 1, day));
    if (date && actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day) return date;
  }
  const compact = name.match(/(?:^|[^0-9])((?:19|20)\d{2})(\d{2})(\d{2})(?=$|[^0-9])/);
  if (compact) {
    const date = normalizeDate(`${compact[1]}-${compact[2]}-${compact[3]}`);
    const [year, month, day] = date.split('-').map(Number);
    const actual = new Date(Date.UTC(year, month - 1, day));
    if (date && actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day) return date;
  }
  return '';
}

function linesFromText(text) {
  const lines = text.split(/\n+/).map((line) => ({ text: line.trim().replace(/\s+/g, ' '), indent: (line.match(/^\s*/) || [''])[0].length, fontSize: null, fontNames: [] })).filter((line) => line.text);
  const joined = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^Thyroid Peroxidase\s*\(TPO\)$/i.test(lines[index].text) && /^Ab\s+\d{2}\b/i.test(lines[index + 1]?.text || '')) joined.push({ ...lines[index], text: `${lines[index].text} ${lines[++index].text}` });
    else joined.push(lines[index]);
  }
  return joined.flatMap((line) => splitAdjacentRows(line.text).map((text) => ({ ...line, text })));
}

function splitAdjacentRows(line) {
  const markerStart = '(?:WBC|RBC|Hemoglobin|Hematocrit|MCV|MCH|MCHC|RDW|Platelets?|Neutrophils|Lymphs?|Monocytes|Eos|Basos|Immature Granulocytes|eGFR|BUN\\/Creatinine Ratio|Thyroxine|Free Thyroxine Index|Antiparietal Cell Antibody|Thyroid Peroxidase|TSH|Free T[34]|Total T[34])';
  const suffix = new RegExp(`(not\\s+estab\\.?|[<>]?\\s*-?\\d+(?:[.,]\\d+)?\\s*(?:-|\\u2013|\\u2014|to)\\s*[<>]?\\s*-?\\d+(?:[.,]\\d+)?|[<>]\\s*\\d+(?:[.,]\\d+)?)(?=${markerStart}\\b)`, 'ig');
  return line.replace(suffix, '$1\\n').split('\\n').map((item) => item.trim()).filter(Boolean);
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
  return marker.length >= 3 && isStructuredLabMarker(marker) && !DATE_PATTERN.test(marker) && !/^[-+]?\d/.test(marker);
}

function rowsFromOrphan(marker, orphan, currentDate) {
  const cleanMarker = marker.replace(/\s+\d{2}$/, '').replace(/\s+/g, ' ').trim();
  const reportFlag = /^H/i.test(orphan.explicitFlag || '') ? 'H' : /^L/i.test(orphan.explicitFlag || '') ? 'L' : '';
  const derivedFlag = rangeFlag(orphan.currentValue, orphan.reference);
  const rows = [{ marker: cleanMarker, date: currentDate, value: orphan.currentValue, units: orphan.units, reference: orphan.reference, flag: reportFlag || derivedFlag, flagSource: reportFlag ? 'report' : derivedFlag ? 'reference interval' : '', resultPeriod: 'Current' }];
  if (orphan.previousRaw && orphan.previousDate) rows.push({ marker: cleanMarker, date: normalizeDate(orphan.previousDate), value: Number(orphan.previousRaw.replace(/[<>\\s]/g, '').replace(',', '.')), units: orphan.units, reference: orphan.reference, flag: '', flagSource: '', resultPeriod: 'Previous' });
  return rows;
}

function parseIndentedResultLine(line) {
  if (isReferenceAnnotationLine(line)) return null;
  const match = line.match(/^\s*([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s+([*†‡]+|HIGH|LOW|H|L))?(?:\s+([a-zµμ%][a-z0-9µμ/^.-]*))?(?:\s+(.*))?$/i);
  if (!match) return null;
  const value = Number(match[1].replace(/[<>≤≥\s]/g, '').replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const units = match[3] || '';
  const reference = (match[4] || '').replace(/\b(?:high|low|H|L)\b/gi, '').replace(/[*†‡]+/g, '').trim();
  if (isReferenceAnnotationLine(reference)) return null;
  const explicitFlag = /^(?:HIGH|H)$/i.test(match[2] || '') ? 'H' : /^(?:LOW|L)$/i.test(match[2] || '') ? 'L' : '';
  return { value, units, reference, explicitFlag };
}

function matchingPdfStyle(markerLine, resultLine) {
  if (Number.isFinite(markerLine.fontSize) && Number.isFinite(resultLine.fontSize) && Math.abs(markerLine.fontSize - resultLine.fontSize) > 0.5) return false;
  return true;
}

function isMoreIndentedLine(markerLine, resultLine) {
  const markerIndent = Number(markerLine.indent) || 0;
  const resultIndent = Number(resultLine.indent) || 0;
  return resultIndent > markerIndent + (markerLine.hasPdfLayout ? 2 : 0);
}

function rowsFromIndentedResult(markerLine, resultLine, date) {
  const result = parseIndentedResultLine(resultLine.text);
  if (!result) return [];
  const marker = markerLine.text.replace(/\s+\d{2}$/, '').replace(/\s+/g, ' ').trim();
  const reference = result.reference;
  const flag = result.explicitFlag || rangeFlag(result.value, reference);
  return [{ marker, date, value: result.value, units: result.units, reference, flag, flagSource: result.explicitFlag ? 'report' : flag ? 'reference interval' : '' }];
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
  if (!isStructuredLabMarker(cleanMarker) || !tail.trim()) return null;
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
  if (!isStructuredLabMarker(marker) || !suffix) return null;
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
  if (isExcludedReportLabel(line) || isReferenceAnnotationLine(line)) return null;
  if (/\b(?:reference range|normal range|result\s+flag|patient|specimen|collected|collection date|date of birth|dob|accession|page\s+\d+)\b/i.test(line)) return null;
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
  if (marker.length > 100 || (!isBiomarkerName(marker) && !isLayoutBiomarkerLabel(marker)) || DATE_PATTERN.test(marker)) return null;
  if (isExcludedReportLabel(marker) || isReferenceAnnotationLine(marker) || /\b(?:page|phone|fax|zip|account|patient|specimen|accession|collected|reported|reference|range|result|date|dob)\b/i.test(marker)) return null;
  const details = extractValueTail(line.slice(numeric.index));
  return details ? { marker, date, ...details } : null;
}

export function parseLabLines(rawLines, filenameDate = '') {
  const sourceLines = Array.isArray(rawLines) ? rawLines : linesFromText(String(rawLines));
  const normalized = sourceLines.map((raw) => {
    if (typeof raw === 'string') return { text: raw.trim().replace(/\s+/g, ' '), indent: (raw.match(/^\s*/) || [''])[0].length, fontSize: null, fontNames: [] };
    return { ...raw, text: String(raw.text || '').trim().replace(/\s+/g, ' '), indent: Number(raw.indent) || 0, fontSize: Number(raw.fontSize) || null, fontNames: raw.fontNames || [] };
  }).filter((line) => line.text);
  const joined = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (/^Thyroid Peroxidase\s*\(TPO\)$/i.test(normalized[index].text) && /^Ab(?:\s+\d{2})?$/i.test(normalized[index + 1]?.text || '')) joined.push({ ...normalized[index], text: `${normalized[index].text} ${normalized[++index].text}` });
    else joined.push(normalized[index]);
  }
  const lines = joined.flatMap((line) => splitAdjacentRows(line.text).map((text) => ({ ...line, text })));
  const labeledDateLines = lines.filter((line) => /\b(?:collection date|date collected|collected|drawn|draw date|specimen date|result date|reported|date of service|fecha de (?:toma|recoleccion|extraccion|prueba|analisis)|fecha de servicio|date)\b/i.test(line.text) && !/\b(?:date of birth|dob|fecha de nacimiento)\b/i.test(line.text));
  let reportDate = filenameDate;
  for (const line of labeledDateLines) { const match = line.text.match(DATE_PATTERN); if (match) { reportDate = normalizeDate(match[1]); if (reportDate) break; } }
  const rows = [];
  const seen = new Set();
  let pendingMarker = null;
  for (const lineRecord of lines) {
    const line = lineRecord.text;
    if (pendingMarker) {
      const result = parseIndentedResultLine(line);
      if (result && isMoreIndentedLine(pendingMarker, lineRecord) && matchingPdfStyle(pendingMarker, lineRecord) && !isReferenceAnnotationLine(line)) {
        for (const row of rowsFromIndentedResult(pendingMarker, lineRecord, reportDate)) {
          const key = [normalizeMarkerText(row.marker), row.date, row.value, row.units.toLowerCase()].join('|');
          if (!seen.has(key)) { seen.add(key); rows.push(row); }
        }
        pendingMarker = null;
        continue;
      }
    }
    const orphanMatch = parseOrphanLabcorpResult(line);
    if (orphanMatch) {
      if (pendingMarker && isMoreIndentedLine(pendingMarker, lineRecord) && matchingPdfStyle(pendingMarker, lineRecord)) {
        for (const row of rowsFromOrphan(pendingMarker.text, orphanMatch, reportDate)) {
          const key = [row.marker.toLowerCase(), row.date, row.value, row.units.toLowerCase()].join('|');
          if (!seen.has(key)) { seen.add(key); rows.push(row); }
        }
      }
      pendingMarker = null;
      continue;
    }
    if (isMarkerOnlyLine(line) || isLayoutBiomarkerLabel(line)) { pendingMarker = lineRecord; }
    else pendingMarker = null;
    if (/^.+\s+\d{2}$/.test(line) && isBiomarkerName(line.replace(/\s+\d{2}$/, ''))) continue;
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
    const fontSize = Math.hypot(item.transform?.[0] ?? 0, item.transform?.[1] ?? 0) || item.height || null;
    line.cells.push({ x: item.transform?.[4] ?? 0, text: item.str, fontSize, fontName: item.fontName || '' });
  });
  return buckets.sort((a, b) => b.y - a.y).map((line) => {
    const cells = line.cells.sort((a, b) => a.x - b.x);
    const fontSizes = cells.map((cell) => cell.fontSize).filter(Number.isFinite);
    return {
      text: cells.map((cell) => cell.text).join(' ').replace(/\s+/g, ' ').trim(),
      indent: cells[0]?.x ?? 0,
      fontSize: fontSizes.length ? fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length : null,
      fontNames: [...new Set(cells.map((cell) => cell.fontName).filter(Boolean))],
      hasPdfLayout: true
    };
  }).filter((line) => line.text);
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
  return parseLabLines(lines, dateFromFilename(file.name));
}
