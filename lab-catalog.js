const marker = (name, units = '', reference = '', aliases = [], profiles = null, conversions = []) => ({ name, units, reference, aliases: [name, ...aliases], profiles, conversions });

export const DEFAULT_LAB_CATEGORIES = [
  { name: 'Thyroid', markers: [
    marker('TSH', 'mIU/L', '0.4–4.0', ['thyroid stimulating hormone', 'thyrotropin', 'tirotropina', 'hormona estimulante de la tiroides', 'hormona estimulante tiroidea'], null, [['uIU/mL', 1], ['µIU/mL', 1], ['mIU/mL', 1000]]),
    marker('Free T4', 'ng/dL', '0.8–1.8', ['FT4', 'free thyroxine', 'T4 free', 'T4 libre', 'tiroxina libre', 'tiroxina libre t4', 'T4L'], null, [['pmol/L', 1 / 12.87]]),
    marker('Free T3', 'pg/mL', '2.3–4.2', ['FT3', 'free triiodothyronine', 'triiodothyronine t3 free', 'T3 free', 'T3 libre', 'triyodotironina libre', 'triiodotironina libre', 'T3L'], null, [['pmol/L', 0.651]]),
    marker('Total T4', 'µg/dL', '4.5–12.0', ['T4 total', 'total thyroxine', 'thyroxine total', 'thyroxine (T4)', 'thyroxine T4', 'tiroxina total'], null, [['ug/dL', 1], ['nmol/L', 1 / 12.87]]),
    marker('T3 uptake', '%', '24–39', ['T3 resin uptake', 'T3RU', 'captacion de T3', 'captación de T3'], null, [['ratio', 100], ['fraction', 100]]),
    marker('Free thyroxine index', 'index', '1.2–4.9', ['FTI', 'T7', 'free T4 index', 'indice de tiroxina libre', 'índice de tiroxina libre']),
    marker('Thyroid peroxidase antibodies (TPOAb)', 'IU/mL', 'Assay-specific; use report interval', ['TPOAb', 'TPO antibody', 'anti-TPO', 'thyroid peroxidase antibodies', 'anticuerpos anti microsomas', 'anticuerpos anti microsomales', 'anticuerpos antiperoxidasa', 'anticuerpos anti-TPO', 'anticuerpos contra la peroxidasa tiroidea', 'anticuerpos antimicrosomales peroxidasa AntiTPO', 'anticuerpos antimicrosomales peroxidasa', 'AntiTPO'], null, [['kIU/L', 1], ['IU/L', 0.001]]),
    marker('Thyroglobulin antibodies (TgAb)', 'IU/mL', 'Assay-specific; use report interval', ['TgAb', 'thyroglobulin antibody', 'thyroglobulin antibodies', 'anti-thyroglobulin', 'anticuerpos antitiroglobulina', 'anticuerpos anti-tiroglobulina'], null, [['kIU/L', 1], ['IU/L', 0.001]]),
    marker('TSH receptor antibodies (TRAb)', 'IU/L', 'Assay-specific; use report interval', ['TRAb', 'TSH receptor antibody', 'TSH receptor ab', 'TSH-RAb', 'TSH - RAb', 'TSH-R Ab', 'thyrotropin receptor antibodies', 'anticuerpos del receptor de TSH', 'anticuerpos anti-receptor de TSH'], null, [['IU/mL', 1000], ['kIU/L', 1]]),
    marker('Thyroid stimulating immunoglobulin (TSI)', 'index', 'Assay-specific; use report interval', ['TSI', 'thyroid-stimulating immunoglobulin', 'inmunoglobulina estimulante tiroidea'])
  ]},
  { name: 'Other hormones', markers: [
    marker('Total testosterone', 'ng/dL', '', ['testosterone', 'testosterona total', 'testosterona'], { female: '15–70 (adult typical)', male: '264–916 (adult typical)' }, [['nmol/L', 28.84]]),
    marker('DHEA sulfate (DHEA-S)', 'µg/dL', 'Age- and sex-specific; use report interval', ['DHEA-S', 'DHEAS', 'dehydroepiandrosterone sulfate', 'dehidroepiandrosterona sulfato', 'sulfato de DHEA'], null, [['umol/L', 36.85], ['µmol/L', 36.85]]),
    marker('Sex hormone binding globulin (SHBG)', 'nmol/L', 'Age- and sex-specific; use report interval', ['SHBG', 'sex hormone-binding globulin', 'globulina fijadora de hormonas sexuales', 'SHBG globulina transportadora de hormonas sexuales', 'SHBG globulina transp de hormonas sexuales', 'globulina transp de hormonas sexuales', 'globulina transportadora de hormonas sexuales']),
    marker('Free androgen index', '%', 'Use laboratory-specific reference interval', ['FAI', 'free androgen index', 'indice androgenico libre', 'índice androgénico libre']),
    marker('Calculated free testosterone (CFT) %', '%', 'Use laboratory-specific reference interval', ['testosterona libre calculada CFT porcentaje', 'testosterona libre calculada CFT %', 'calculated free testosterone percentage', 'CFT percentage']),
    marker('Calculated free testosterone (CFT)', 'pg/mL', 'Use laboratory-specific reference interval', ['CFT', 'calculated free testosterone', 'testosterona libre calculada', 'testosterona libre calculada CFT'], null, [['pmol/L', 1 / 3.467]]),
    marker('Bioavailable testosterone', 'ng/dL', 'Use laboratory-specific reference interval', ['bioavailable testosterone', 'testosterona biodisponible'], { female: 'Use laboratory-specific reference interval', male: 'Use laboratory-specific reference interval' }, [['nmol/L', 28.84]]),
    marker('Bioavailable testosterone %', '%', 'Use laboratory-specific reference interval', ['bioavailable testosterone percentage', 'testosterona biodisponible porcentaje', 'testosterona biodisponible %'])
  ]},
  { name: 'Blood count', markers: [
    marker('Hemoglobin', 'g/dL', '', ['haemoglobin', 'hemoglobina'], { female: '12.0–15.5 (adult typical)', male: '13.5–17.5 (adult typical)' }, [['g/L', 0.1]]),
    marker('Hematocrit', '%', '', ['haematocrit', 'packed cell volume', 'HCT', 'hematocrito'], { female: '36–46 (adult typical)', male: '41–53 (adult typical)' }, [['L/L', 100], ['fraction', 100]]),
    marker('Red blood cells (RBC)', '10^6/µL', '', ['RBC', 'red blood cell count', 'erythrocytes', 'eritrocitos'], { female: '4.0–5.2 (adult typical)', male: '4.5–5.9 (adult typical)' }, [['10^12/L', 1], ['x10^12/L', 1], ['10^6/uL', 1]]),
    marker('Mean corpuscular volume (MCV)', 'fL', '80–100', ['MCV', 'VCM', 'mean corpuscular volume', 'volumen corpuscular medio']),
    marker('Mean corpuscular hemoglobin (MCH)', 'pg', '27–33', ['MCH', 'HCM', 'mean corpuscular hemoglobin', 'hemoglobina corpuscular media']),
    marker('Mean corpuscular hemoglobin concentration (MCHC)', 'g/dL', '32–36', ['MCHC', 'CHCM', 'mean corpuscular hemoglobin concentration', 'concentracion de hemoglobina corpuscular media'], null, [['g/L', 0.1]]),
    marker('Red cell distribution width (RDW-CV)', '%', '11.5–14.5', ['RDW', 'RDW-CV', 'red cell distribution width', 'ancho de distribucion eritrocitaria'], null, [['fraction', 100]]),
    marker('Red cell size', '', 'Qualitative; use report description', ['anisocytosis', 'tamaño eritrocitario', 'tamano eritrocitario']),
    marker('Red cell coloration', '', 'Qualitative; use report description', ['chromia', 'hypochromia', 'hyperchromia', 'coloracion eritrocitaria']),
    marker('White blood cells (WBC)', '10^3/µL', '4.0–11.0', ['WBC', 'white blood cell count', 'leukocytes', 'leucocitos', 'globulos blancos', 'glóbulos blancos'], null, [['10^9/L', 1], ['x10^9/L', 1], ['k/uL', 1], ['K/µL', 1]]),
    marker('Neutrophils', '%', '40–70', ['neutrophil percentage', 'neutrofilos', 'neutrófilos'], null, [['fraction', 100]]),
    marker('Lymphocytes', '%', '20–40', ['lymphocyte percentage', 'lymphs', 'linfocitos'], null, [['fraction', 100]]),
    marker('Monocytes', '%', '2–8', ['monocyte percentage', 'monocitos'], null, [['fraction', 100]]),
    marker('Eosinophils', '%', '1–4', ['eos', 'eosinophil percentage', 'eosinofilos', 'eosinófilos'], null, [['fraction', 100]]),
    marker('Basophils', '%', '0–1', ['baso', 'basophil percentage', 'basofilos', 'basófilos'], null, [['fraction', 100]]),
    marker('Bands', '%', '0–5', ['band neutrophils', 'band cells', 'cayados', 'bandas'], null, [['fraction', 100]]),
    marker('Blasts', '%', '0 in peripheral blood', ['blast cells', 'blastos'], null, [['fraction', 100]]),
    marker('Promyelocytes', '%', '0 in peripheral blood', ['promyelocyte', 'promielocitos'], null, [['fraction', 100]]),
    marker('Myelocytes', '%', '0 in peripheral blood', ['myelocyte', 'mielocitos'], null, [['fraction', 100]]),
    marker('Metamyelocytes', '%', '0–1', ['metamyelocyte', 'metamielocitos'], null, [['fraction', 100]]),
    marker('Immature granulocytes', '%', '0–0.5', ['IG%', 'immature granulocyte percentage', 'granulocitos inmaduros'], null, [['fraction', 100]]),
    marker('Differential total check', '%', '100', ['differential total', 'differential sum', 'total diferencial']),
    marker('Neutrophils (absolute)', '10^3/µL', '1.5–7.5', ['absolute neutrophils', 'ANC', 'neutrophils absolute', 'neutrofilos absolutos'], null, [['10^9/L', 1], ['x10^9/L', 1], ['k/uL', 1]]),
    marker('Lymphocytes (absolute)', '10^3/µL', '1.0–4.0', ['absolute lymphocytes', 'lymphocytes absolute', 'linfocitos absolutos'], null, [['10^9/L', 1], ['x10^9/L', 1], ['k/uL', 1]]),
    marker('Monocytes (absolute)', '10^3/µL', '0.2–0.8', ['absolute monocytes', 'monocytes absolute', 'monocitos absolutos'], null, [['10^9/L', 1], ['x10^9/L', 1], ['k/uL', 1]]),
    marker('Eosinophils (absolute)', '10^3/µL', '0.0–0.5', ['absolute eosinophils', 'eosinophils absolute', 'eosinofilos absolutos'], null, [['10^9/L', 1], ['x10^9/L', 1], ['k/uL', 1]]),
    marker('Basophils (absolute)', '10^3/µL', '0.0–0.2', ['absolute basophils', 'basophils absolute', 'basofilos absolutos'], null, [['10^9/L', 1], ['x10^9/L', 1], ['k/uL', 1]]),
    marker('Immature granulocytes (absolute)', '10^3/µL', '0.0–0.1', ['absolute immature granulocytes', 'IG absolute'], null, [['10^9/L', 1], ['x10^9/L', 1], ['k/uL', 1]]),
    marker('Platelets', '10^3/µL', '150–400', ['platelet count', 'trombocitos', 'plaquetas'], null, [['10^9/L', 1], ['x10^9/L', 1], ['k/uL', 1]]),
    marker('Mean platelet volume (MPV)', 'fL', '7.5–12.0', ['MPV', 'VPM', 'mean platelet volume', 'volumen plaquetario medio'])
  ]},
  { name: 'Glucose metabolism', markers: [
    marker('Glucose', 'mg/dL', '70–99 fasting', ['glucosa'], null, [['mmol/L', 18.0182]]),
    marker('Hemoglobin A1c (HbA1c)', '%', '<5.7 (non-diabetic)', ['HbA1c', 'A1c', 'glycated hemoglobin', 'hemoglobina glicosilada', 'hemoglobina glicada', 'hemoglobina glicada hba1c'], null, [['mmol/mol', 0.09148, 2.152]]),
    marker('Estimated average glucose', 'mg/dL', 'Derived from HbA1c', ['eAG', 'average glucose', 'glucosa promedio'], null, [['mmol/L', 18.0182]])
  ]},
  { name: 'Kidney function and uric acid', markers: [
    marker('Creatinine', 'mg/dL', '', ['creatinina'], { female: '0.5–1.1 (adult typical)', male: '0.7–1.3 (adult typical)' }, [['µmol/L', 1 / 88.4], ['umol/L', 1 / 88.4]]),
    marker('Blood urea nitrogen (BUN)', 'mg/dL', '7–20', ['BUN', 'urea nitrogen', 'nitrogeno ureico', 'nitrógeno ureico'], null, [['mmol/L', 2.801]]),
    marker('Estimated glomerular filtration rate (eGFR)', 'mL/min/1.73 m²', '≥60 (adults; interpretation depends on context)', ['eGFR', 'estimated GFR', 'filtrado glomerular estimado'], null, [['mL/s/1.73 m2', 60], ['mL/s/1.73m2', 60]]),
    marker('BUN/creatinine ratio', 'ratio', '10–20', ['BUN creatinine ratio', 'urea creatinine ratio', 'relacion BUN creatinina']),
    marker('Uric acid', 'mg/dL', '', ['uric acid', 'urate', 'acido urico', 'ácido úrico'], { female: '2.4–6.0 (adult typical)', male: '3.4–7.0 (adult typical)' }, [['µmol/L', 1 / 59.48], ['umol/L', 1 / 59.48]])
  ]},
  { name: 'Electrolytes and minerals', markers: [
    marker('Sodium', 'mmol/L', '135–145', ['Na', 'sodio'], null, [['mEq/L', 1]]),
    marker('Potassium', 'mmol/L', '3.5–5.1', ['K', 'potasio'], null, [['mEq/L', 1]]),
    marker('Chloride', 'mmol/L', '98–107', ['Cl', 'cloruro'], null, [['mEq/L', 1]]),
    marker('Carbon dioxide (total)', 'mmol/L', '22–29', ['CO2', 'bicarbonate', 'carbon dioxide total', 'dioxido de carbono'], null, [['mEq/L', 1]]),
    marker('Calcium', 'mg/dL', '8.6–10.2', ['calcio'], null, [['mmol/L', 4.008]]),
    marker('Magnesium', 'mg/dL', '1.7–2.2', ['magnesio'], null, [['mmol/L', 2.43]])
  ]},
  { name: 'Liver function and proteins', markers: [
    marker('AST (SGOT)', 'U/L', '10–40', ['AST', 'SGOT', 'S.G.O.T. /A.S.T.', 'aspartate aminotransferase', 'aspartato aminotransferasa'], null, [['IU/L', 1], ['ukat/L', 60], ['µkat/L', 60]]),
    marker('ALT (SGPT)', 'U/L', '', ['ALT', 'SGPT', 'S.G.P.T./A.L.T.', 'alanine aminotransferase', 'alanina aminotransferasa'], { female: '7–35 (adult typical)', male: '10–40 (adult typical)' }, [['IU/L', 1], ['ukat/L', 60], ['µkat/L', 60]]),
    marker('Gamma glutamyl transferase (GGT)', 'U/L', '', ['GGT', 'gamma-GT', 'gamma glutamyltransferase', 'gamma glutamil transferasa', 'gama glutamil transpeptidasa'], { female: '5–36 (adult typical)', male: '8–61 (adult typical)' }, [['IU/L', 1], ['ukat/L', 60], ['µkat/L', 60]]),
    marker('Alkaline phosphatase (ALP)', 'U/L', '44–147 (adult typical; higher during growth/pregnancy)', ['ALP', 'alkaline phosphatase', 'alk phos', 'fosfatasa alcalina'], null, [['IU/L', 1], ['ukat/L', 60], ['µkat/L', 60]]),
    marker('Bilirubin (total)', 'mg/dL', '0.1–1.2', ['total bilirubin', 'bilirubin total', 'bilirrubina total'], null, [['µmol/L', 1 / 17.1], ['umol/L', 1 / 17.1]]),
    marker('Bilirubin (direct)', 'mg/dL', '0.0–0.3', ['direct bilirubin', 'conjugated bilirubin', 'bilirrubina directa'], null, [['µmol/L', 1 / 17.1], ['umol/L', 1 / 17.1]]),
    marker('Bilirubin (indirect)', 'mg/dL', '0.1–0.9', ['indirect bilirubin', 'unconjugated bilirubin', 'bilirrubina indirecta'], null, [['µmol/L', 1 / 17.1], ['umol/L', 1 / 17.1]]),
    marker('Total protein', 'g/dL', '6.0–8.3', ['protein total', 'proteina total', 'proteínas totales', 'proteína total'], null, [['g/L', 0.1]]),
    marker('Albumin', 'g/dL', '3.5–5.0', ['albumina', 'albumina en suero', 'albúmina en suero'], null, [['g/L', 0.1]]),
    marker('Globulin', 'g/dL', '2.0–3.5', ['globulina'], null, [['g/L', 0.1]]),
    marker('Albumin/globulin ratio', 'ratio', '1.0–2.2', ['A/G ratio', 'albumin globulin ratio', 'relacion a/g', 'relacion albumina globulina'])
  ]},
  { name: 'Muscle enzymes', markers: [
    marker('Creatine kinase (CK / CPK total)', 'U/L', '', ['CK', 'CPK', 'CPK total', 'C.P.K. TOTAL', 'creatine kinase total', 'creatine phosphokinase', 'creatina quinasa'], { female: '26–192 (adult typical)', male: '39–308 (adult typical)' }, [['IU/L', 1], ['ukat/L', 60], ['µkat/L', 60]])
  ]},
  { name: 'Iron and vitamins', markers: [
    marker('Serum iron', 'µg/dL', '50–170', ['iron', 'hierro'], null, [['umol/L', 5.585], ['µmol/L', 5.585]]),
    marker('Transferrin', 'mg/dL', '200–360', ['transferrin', 'transferrina'], null, [['g/L', 100]]),
    marker('Total iron binding capacity (TIBC)', 'µg/dL', '250–450', ['TIBC', 'iron binding capacity', 'capacidad de fijacion', 'capacidad de fijación', 'capacidad total de fijacion del hierro', 'capacidad total de fijación del hierro'], null, [['umol/L', 5.585], ['µmol/L', 5.585]]),
    marker('Transferrin saturation', '%', '20–50', ['iron saturation', 'transferrin saturation percentage', 'indice de saturacion', 'índice de saturación', 'saturacion de transferrina', 'saturación de transferrina']),
    marker('Vitamin B12', 'pg/mL', '200–900', ['B12', 'cobalamin', 'vitamina B12', 'cobalamina'], null, [['pmol/L', 1 / 0.738]]),
    marker('Vitamin D (total)', 'ng/mL', '20–50 (common sufficiency threshold; guidance varies)', ['25-OH vitamin D', '25 hydroxy vitamin D', '25-hydroxyvitamin D', 'vitamin D total', 'vitamina D', '25-hidroxivitamina D'], null, [['nmol/L', 0.4]])
  ]},
  { name: 'Inflammation', markers: [
    marker('Erythrocyte sedimentation rate (ESR)', 'mm/h', '', ['ESR', 'V.E.S.', 'sedimentation rate', 'erythrocyte sedimentation rate', 'VSG', 'velocidad de sedimentacion globular', 'velocidad de eritrosedimentacion'], { female: '0–20 (<50 y); 0–30 (≥50 y)', male: '0–15 (<50 y); 0–20 (≥50 y)' }),
    marker('C-reactive protein (quantitative)', 'mg/L', '<5', ['CRP', 'C-reactive protein', 'PCR cuantificada', 'proteina C reactiva cuantitativa', 'proteína C reactiva cuantitativa'], null, [['mg/dL', 10]]),
    marker('High sensitivity C-reactive protein (hs-CRP)', 'mg/L', '<3 (cardiovascular risk context; not a general inflammation range)', ['hs-CRP', 'hsCRP', 'high sensitivity CRP', 'PCR ultrasensible'], null, [['mg/dL', 10]]),
    marker('C-reactive protein (qualitative)', '', 'Negative', ['CRP qualitative', 'qualitative CRP', 'proteina C reactiva cualitativa', 'proteína C reactiva cualitativa'])
  ]},
  { name: 'Immune markers', markers: [
    marker('Antinuclear antibodies (ANA)', 'titer', 'Negative (commonly <1:80; method-dependent)', ['ANA', 'antinuclear antibody', 'antinuclear antibodies', 'anticuerpos antinucleares']),
    marker('Rheumatoid factor (RF)', 'IU/mL', '<14', ['RF', 'rheumatoid factor', 'factor reumatoide']),
    marker('Antiparietal cell antibodies', 'titer', 'Assay-specific; use report interval', ['antiparietal cell antibody', 'parietal cell antibody', 'parietal cell antibodies', 'anticuerpos antiparietales', 'anticuerpos contra celulas parietales']),
    marker('Transforming growth factor beta 1 (TGF-beta1)', 'pg/mL', 'Assay-specific; use report interval', ['TGF-beta1', 'TGF beta 1', 'TGF-beta', 'TGF-b', 'trans growth fact beta', 'transforming growth factor beta 1'])
  ]},
  { name: 'Infectious serology', markers: [
    marker('Epstein-Barr virus antibodies IgM', '', 'Negative; assay-specific', ['EBV VCA IgM', 'Epstein-Barr virus VCA IgM', 'virus de Epstein-Barr IgM', 'anticuerpos anti epstein barr igm', 'anticuerpos anti epstein barr lgm']),
    marker('Epstein-Barr virus antibodies IgG', '', 'Assay-specific; prior infection commonly remains positive', ['EBV VCA IgG', 'Epstein-Barr virus VCA IgG', 'virus de Epstein-Barr IgG', 'anticuerpos anti epstein barr igg', 'anticuerpos anti epstein barr lgg']),
    marker('VDRL', 'titer', 'Nonreactive', ['Venereal Disease Research Laboratory', 'VDRL titer'])
  ]},
  { name: 'Stool tests', markers: [
    marker('Helicobacter pylori stool antigen', '', 'Negative', ['H. pylori stool antigen', 'H pylori Ag, stool', 'antigeno de H. pylori en heces', 'antígeno de H. pylori en heces']),
    marker('Parasite examination', '', 'No parasites detected', ['ova and parasites', 'O&P', 'stool ova parasite', 'examen parasitologico de heces']),
    marker('Stool leukocytes', '', 'Not detected', ['fecal leukocytes', 'white blood cells stool', 'leucocitos fecales']),
    marker('Stool erythrocytes', '', 'Not detected', ['fecal erythrocytes', 'red blood cells stool', 'eritrocitos fecales']),
    marker('Stool consistency', '', 'Descriptive; no numeric reference interval', ['stool form', 'fecal consistency', 'consistencia de heces']),
    marker('Stool culture', '', 'No enteric pathogen isolated', ['fecal culture', 'coproculture', 'cultivo de heces'])
  ]},
  { name: 'Specimen observations', markers: [
    marker('Serum appearance', '', 'Descriptive; use report observation', ['serum appearance', 'serum color', 'aspecto del suero'])
  ]}
];

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const unitKey = (value) => String(value ?? '').toLowerCase().replace(/[μµ]/g, 'u').replace(/²/g, '2').replace(/\s+/g, '').replace(/micrograms?/g, 'ug').replace(/micromoles?/g, 'umol').replace(/millimoles?/g, 'mmol');
const aliasMap = new Map(DEFAULT_LAB_CATEGORIES.flatMap((category) => category.markers.flatMap((item) => item.aliases.map((alias) => [normalize(alias), item.name]))));
const definitionMap = new Map(DEFAULT_LAB_CATEGORIES.flatMap((category) => category.markers.map((item) => [normalize(item.name), { ...item, category: category.name }])));

export function canonicalCatalogMarker(value) {
  const original = String(value ?? '').trim();
  if (/testosterona\s+libre\s+calculada.*%/i.test(original) || /calculated\s+free\s+testosterone.*%/i.test(original)) return 'Calculated free testosterone (CFT) %';
  if (/testosterona\s+biodisponible.*%/i.test(original) || /bioavailable\s+testosterone.*%/i.test(original)) return 'Bioavailable testosterone %';
  if (/^testosterona\s+biodisponible$/i.test(normalize(original)) || /^bioavailable\s+testosterone$/i.test(normalize(original))) return 'Bioavailable testosterone';
  return aliasMap.get(normalize(original)) || original;
}

export function catalogMarkerDefinition(value) {
  const canonical = canonicalCatalogMarker(value);
  if (['Calculated free testosterone (CFT) %', 'Calculated free testosterone (CFT)', 'Bioavailable testosterone %', 'Bioavailable testosterone'].includes(canonical)) {
    return DEFAULT_LAB_CATEGORIES.flatMap((category) => category.markers).find((item) => item.name === canonical) || null;
  }
  return definitionMap.get(normalize(canonical)) || null;
}

export function catalogCategoryForMarker(value) {
  return catalogMarkerDefinition(value)?.category || '';
}

export function defaultLabCategories() {
  return DEFAULT_LAB_CATEGORIES.map((category) => ({ name: category.name, markers: category.markers.map((item) => item.name) }));
}

export function demographicReference(value, profile = {}) {
  const item = catalogMarkerDefinition(value);
  if (!item) return '';
  const age = profile.age === '' || profile.age === null || profile.age === undefined ? NaN : Number(profile.age);
  if (Number.isFinite(age) && age < 18) return '';
  const sex = profile.sex;
  if (item.name === 'DHEA sulfate (DHEA-S)') {
    if (!Number.isFinite(age) || !sex || sex === 'other') return '';
    const bands = sex === 'female'
      ? [[18, 29, '45–320'], [30, 39, '40–325'], [40, 49, '25–220'], [50, 59, '15–170'], [60, 200, '10–150']]
      : [[18, 29, '100–510'], [30, 39, '90–450'], [40, 49, '70–420'], [50, 59, '50–350'], [60, 200, '30–300']];
    return bands.find(([low, high]) => age >= low && age <= high)?.[2] || '';
  }
  if (item.name === 'Sex hormone binding globulin (SHBG)') {
    if (!Number.isFinite(age) || !sex || sex === 'other') return '';
    if (sex === 'female') return age < 50 ? '18–144' : '16–120';
    return age < 50 ? '10–57' : '12–75';
  }
  if (item.name === 'Erythrocyte sedimentation rate (ESR)' && item.profiles?.[sex]) {
    const older = Number.isFinite(age) && age >= 50;
    return item.profiles[sex].split('; ')[older ? 1 : 0];
  }
  if (item.profiles) return item.profiles[sex] || '';
  if (item.name === 'TSH' && Number.isFinite(age) && age >= 65) return '0.4–5.0 (older-adult typical; report interval preferred)';
  return item.reference;
}

function convertReference(reference, factor, offset = 0, sourceUnits = '', targetUnits = '') {
  const range = String(reference || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)(.*)$/);
  if (!range) return reference;
  const low = Number(range[1]) * factor + offset;
  const high = Number(range[2]) * factor + offset;
  const suffix = unitKey(range[3].trim()) === unitKey(sourceUnits) ? ` ${targetUnits}` : range[3];
  return `${Math.min(low, high).toFixed(2)}–${Math.max(low, high).toFixed(2)}${suffix}`;
}

export function labUnitConversion(value, units) {
  const item = catalogMarkerDefinition(value);
  if (!item?.units || !units) return null;
  const incoming = unitKey(units);
  if (incoming === unitKey(item.units)) return { factor: 1, offset: 0, units: item.units };
  const conversion = item.conversions.find(([unit]) => unitKey(unit) === incoming);
  return conversion ? { factor: conversion[1], offset: conversion[2] || 0, units: item.units } : null;
}

export function standardizeLabResult(row) {
  const conversion = labUnitConversion(row.marker, row.units);
  if (!conversion) return row;
  if (Number.isFinite(Number(row.value))) row.value = Number((Number(row.value) * conversion.factor + conversion.offset).toPrecision(7));
  row.reference = convertReference(row.reference, conversion.factor, conversion.offset, row.units, conversion.units);
  row.units = conversion.units;
  return row;
}