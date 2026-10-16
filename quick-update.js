// Local, rule-based reader for free-text daily updates. Nothing here leaves the device.

const NUMBER_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const GENERIC_TOKENS = new Set(['vitamin', 'complex', 'extract', 'acetyl', 'capsule', 'powder']);
const UNITS = 'mcg|µg|ug|mg|g|gram|grams|iu|ml|billion|cfu|capsules?|caps?|tablets?|pills?|scoops?|drops?|units?';

const ITEM_ALIASES = {
  'acetyl-l-carnitine': ['alcar', 'acetylcarnitine', 'carnitine'],
  'alpha-lipoic acid': ['ala', 'lipoic acid', 'alpha lipoic'],
  nac: ['n acetyl cysteine', 'acetylcysteine'],
  'omega-3s': ['omega 3', 'omega3', 'fish oil'],
  'b-complex': ['b complex', 'b vitamins', 'b vitamin', 'bcomplex'],
  'probiotic / s. boulardii': ['probiotic', 'boulardii', 'saccharomyces'],
  'zinc carnosine': ['zinc'],
  'magnesium glycinate': ['magnesium', 'mag glycinate'],
  'l-theanine': ['theanine'],
  ldn: ['low dose naltrexone', 'naltrexone'],
  'reishi extract': ['reishi'],
  'bpc-157': ['bpc 157', 'bpc157', 'bpc'],
  tributyrinmax: ['tributyrin', 'butyrate', 'tribute in max', 'tributary max'],
  thyropep: ['thyro pep', 'thyroid pep', 'tyro pep'],
  biothyroid: ['bio thyroid', 'bio thyroids'],
  biothymus: ['bio thymus', 'bio thymas'],
  thymalin: ['thymalin', 'thymaline', 'thymolin'],
  epitalon: ['epithalon', 'epitalone', 'epi talon'],
  kpv: ['k p v', 'kpv peptide'],
  nmn: ['nicotinamide mononucleotide', 'nicotinamide'],
  colostrum: ['colostrim', 'bovine colostrum'],
  bromelain: ['bromelin', 'pineapple enzyme'],
  quercetin: ['quercitin', 'quercetine'],
  inositol: ['inisitol', 'myo inositol', 'myoinositol'],
  apigenin: ['apigen', 'apigenen'],
  polyphenols: ['polyphenol', 'poly phenols'],
  taurine: ['tauring', 'torine'],
  'vitamin k2': ['k2', 'mk7', 'mk 7'],
  'vitamin c': ['ascorbic acid'],
  'vitamin d3': ['d3', 'd 3', 'vitamin d'],
  collagen: ['collagens', 'collagen peptides']
};

const SYMPTOM_ALIASES = {
  fatigue: 'fatigued?|tired(?:ness)?|exhaust(?:ed|ion)|worn out|drained|lethargic|lethargy|sluggish|sleepy',
  'joint pain': 'joint pains?|joint aches?|achy joints?|aching joints?|sore joints?|arthralgia|joints? (?:hurt|hurts|ache|aches|are sore|were sore)',
  appetite: 'hungry|hunger|ravenous|starving',
  'brain fog': 'foggy|mental fog|fog',
  anxiety: 'anxious|nervous|on edge|jittery|panick?y|panic',
  tremor: 'tremors?|shak(?:y|ing|es)|trembl(?:e|es|ing|y)',
  mood: 'moody|irritab(?:le|ility)|irritated|grumpy|low mood',
  'heat intolerance': 'heat sensitiv(?:e|ity)|overheat(?:ing|ed)?|(?:feel(?:ing)?|felt|feels|so|too|really|very) hot|sweating|sweaty|night sweats?',
  palpitations: 'palpitation|heart racing|racing heart|heart (?:is |was )?pounding|pounding heart|heart flutter(?:ing|s)?|flutter(?:ing|s)?|skipped beats?|rapid heart(?:beat)?|fast heart(?:beat)?|heart beating fast'
};

const SEVERITY_SCALE = [
  [5, 'severe(?:ly)?|terrible|terribly|awful|awfully|extreme(?:ly)?|worst|unbearable|horrible|excruciating|very bad|really bad|very strong|very intense|very high'],
  [4, 'bad|badly|strong|significant|considerabl[ey]|heavy|a lot|worse|worsened|flared?|flaring|pretty bad|high|intense|increased|elevated'],
  [3, 'moderate(?:ly)?|medium|noticeable|some|so so|average'],
  [2, 'a bit|a little|little|somewhat|lightly|bit of'],
  [1, 'mild(?:ly)?|slight(?:ly)?|barely|hardly|faint|minimal|tiny|touch of'],
  [0, 'none|gone|absent|resolved|zero|nothing|nil|settled|disappeared|vanished']
];

const QUALITY_SCALE = [
  [5, 'great|excellent|amazing|fantastic|wonderful|perfect|deep|like a baby|high|plenty|energetic|best|full of energy'],
  [4, 'good|well|better|decent|fine|solid|nice|pretty good|improved|rested|restful'],
  [3, 'ok|okay|average|medium|moderate|so so|normal|fair|alright|stable'],
  [2, 'low|poor|poorly|bad|badly|worse|lower|meh|weak|lacking|tired|flat|restless|broken|interrupted|short|light'],
  [1, 'terrible|terribly|awful|awfully|horrible|exhausted|drained|very low|really low|very poor|very bad|really bad|barely any|crashed|wiped out|barely'],
  [0, 'none|zero|nothing|nil']
];

const NEGATIVE_CUES = "(?:did(?:\\s*n'?t|\\s+not)|do(?:\\s*n'?t|\\s+not)|(?:have|has)(?:\\s*n'?t|\\s+not)|never|not|no|skipp(?:ed|ing)|skip|miss(?:ed|ing)?|forgot(?:ten)?|forget(?:ting)?|stopp(?:ed|ing)|stop|paus(?:ed|ing)|pause|without|off|ran out of|out of|can'?t|cannot)(?:\\s+(?:to\\s+)?(?:take|taken|taking|have|had|use|used|do|done))?";
const POSITIVE_CUES = 'took|taken|take|taking|takes|had|have|has|having|used|using|use|did|done|started|start|starting|restarted|resumed|resume|added|add|drank|ate|swallowed|completed|finished|got|gotten';
const CUE_PATTERN = new RegExp(`\\b(?:(${NEGATIVE_CUES})|(${POSITIVE_CUES}))\\b`, 'g');
const BOUNDARY_PATTERN = /[.;!?\n]|\b(?:but|however|except|then|although)\b/g;
const CLIP_PATTERN = /[,.;!?\n]|\b(?:and|but|with|while|also|plus|then)\b/;

const AFTER_NUMBER = new RegExp("^[\\s:=\\-]*(?:(?:is|was|were|are|at|about|around|roughly|approximately|like|a|an|of|level|levels|rating|rated|score|severity|sitting|sat|up|down|to|now|today|currently|maybe|probably|really|only|just|ish)\\s+)*(\\d+(?:\\.\\d+)?)(?:\\s*(?:/|out\\s+of)\\s*(\\d+))?(?![\\d.])(?!\\s*(?:mg|mcg|ug|g\\b|iu|ml|hours?|hrs?|h\\b|minutes?|mins?|times|x\\b|am\\b|pm\\b|%|bpm|days?|weeks?|years?))");
const BEFORE_NUMBER = /(\d+(?:\.\d+)?)(?:\s*(?:\/|out\s+of)\s*(\d+))?\s*(?:for|on|in|of|with)?\s*(?:my\s+|the\s+|a\s+)?$/;
const NEGATED_BEFORE = new RegExp("(?:\\b(?:no|without|zero|nil|free of|never)|\\b(?:did|do|have|has|was|is|were|are|could|can)(?:\\s*n'?t|\\s+not)(?:\\s+(?:have|had|feel|feeling|get|got|notice|noticed|experience|experienced|really|much|any))*|\\bnot(?:\\s+(?:feeling|having|had|much|any|really))*)\\s+(?:(?:any|much|more|noticeable|really|very|a)\\s+)*$");
const FLIPPED_BEFORE = /\b(?:not|isn'?t|wasn'?t|aren'?t|weren'?t|never|hardly)\s+(?:very\s+|too\s+|that\s+|really\s+|so\s+)?$/;

const clean = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalizeMessage(message) {
  let text = String(message).toLowerCase().replace(/[’‘`]/g, "'").replace(/[-–—_]/g, ' ');
  text = text.replace(/\b(?:[a-z]\s+){2,}[a-z]\b/g, (match) => match.replace(/\s+/g, ''));
  text = text.replace(/\b([dk])\s+([23])\b/g, '$1$2');
  text = text.replace(/\b(energy|sleep(?: quality)?)\s+(?:is\s+|was\s+|at\s+)?(?:for|fore)(?=\s*(?:[,.;!?]|$|and\b))/g, '$1 4');
  text = text.replace(/\b(energy|sleep(?: quality)?)\s+(?:is\s+|was\s+|at\s+)?(?:to|too)(?=\s*(?:[,.;!?]|$|and\b))/g, '$1 2');
  text = text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/g, (word) => String(NUMBER_WORDS[word]));
  return text.replace(/\btwice\b/g, '2 times').replace(/\bthrice\b/g, '3 times');
}

function findAll(text, source) {
  const found = [];
  const pattern = new RegExp(`(^|[^a-z0-9])(${source})(?![a-z0-9])`, 'g');
  let match;
  while ((match = pattern.exec(text))) {
    const start = match.index + match[1].length;
    found.push({ start, end: start + match[2].length });
    if (!match[0].length) pattern.lastIndex += 1;
  }
  return found;
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const grid = Array.from({ length: a.length + 1 }, (_, row) => [row]);
  for (let column = 1; column <= b.length; column += 1) grid[0][column] = column;
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      grid[row][column] = Math.min(grid[row - 1][column] + 1, grid[row][column - 1] + 1, grid[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1));
    }
  }
  return grid[a.length][b.length];
}

const FUZZY_STOP = new Set(['the', 'and', 'took', 'take', 'taken', 'had', 'have', 'has', 'with', 'for', 'was', 'were', 'but', 'not', 'did', 'didnt', 'also', 'some', 'when', 'than', 'that', 'this', 'felt', 'feel', 'feeling', 'today', 'morning', 'evening', 'night', 'about', 'after', 'before', 'bit', 'much', 'more', 'less', 'bowel', 'sleep', 'slept', 'energy', 'stool', 'movement', 'movements', 'mild', 'severe', 'moderate', 'little', 'skipped', 'missed', 'forgot']);

// Rough consonant skeleton so "selenium"/"celenium", "colostrum"/"calostrum" compare equal.
function skeleton(word) {
  const sound = word.replace(/ph/g, 'f').replace(/ck|ch|q/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/z/g, 's').replace(/x/g, 'ks').replace(/wh|w/g, 'w').replace(/th/g, 't').replace(/([a-z])\1+/g, '$1');
  return sound[0] + sound.slice(1).replace(/[aeiouyh]/g, '');
}

function clipAfter(text) { return text.split(CLIP_PATTERN)[0]; }
function clipBefore(text) { const parts = text.split(CLIP_PATTERN); return parts[parts.length - 1]; }

function polarityAt(text, position) {
  let segmentStart = 0;
  for (const boundary of text.slice(0, position).matchAll(BOUNDARY_PATTERN)) segmentStart = boundary.index + boundary[0].length;
  let last = null;
  for (const cue of text.slice(segmentStart, position).matchAll(CUE_PATTERN)) last = cue;
  return last ? !last[1] : null;
}

function postfixPolarity(text, end) {
  const tail = text.slice(end, end + 20);
  if (/^\s*(?:skipped|missed|forgot(?:ten)?|not taken|not yet)\b/.test(tail) || /^\s*[:=]\s*(?:no|none|nope|off)\b/.test(tail)) return false;
  if (/^\s*[:=]\s*(?:taken|done|yes|yep|on|took|had)\b/.test(tail) || /^\s+(?:taken|done)\b/.test(tail)) return true;
  return null;
}

function toScale(value, denominator) {
  let number = Number(value);
  if (denominator === '10' || (!denominator && number > 5 && number <= 10)) number = Math.round(number / 2);
  else if (denominator && Number(denominator) !== 5 && Number(denominator) > 0) number = Math.round((number / Number(denominator)) * 5);
  return number >= 0 && number <= 5 ? Math.round(number) : null;
}

function scanScale(windowText, scale, mode) {
  const hits = [];
  scale.forEach(([value, source]) => {
    for (const match of windowText.matchAll(new RegExp(`\\b(?:${source})\\b`, 'g'))) hits.push({ value, start: match.index, end: match.index + match[0].length });
  });
  const kept = hits.filter((hit) => !hits.some((other) => other !== hit && other.start <= hit.start && other.end >= hit.end && other.end - other.start > hit.end - hit.start));
  if (!kept.length) return null;
  kept.sort((a, b) => a.start - b.start);
  const hit = mode === 'last' ? kept[kept.length - 1] : kept[0];
  const flipped = FLIPPED_BEFORE.test(windowText.slice(0, hit.start));
  return { value: flipped && hit.value >= 3 ? 2 : hit.value };
}

function valueNear(text, mention, scale) {
  const after = clipAfter(text.slice(mention.end, mention.end + 40));
  const before = clipBefore(text.slice(Math.max(0, mention.start - 32), mention.start));
  const afterNumber = after.match(AFTER_NUMBER);
  if (afterNumber) { const value = toScale(afterNumber[1], afterNumber[2]); if (value !== null) return { value }; }
  const beforeNumber = before.match(BEFORE_NUMBER);
  if (beforeNumber) { const value = toScale(beforeNumber[1], beforeNumber[2]); if (value !== null) return { value }; }
  const afterHit = scanScale(after, scale, 'first');
  if (NEGATED_BEFORE.test(before)) return { value: afterHit && afterHit.value >= 3 ? 2 : 0 };
  if (afterHit) return afterHit;
  return scanScale(before, scale, 'last');
}

function itemKeys(item) {
  const keys = new Set();
  const add = (key) => { const value = clean(key); if (value.length >= 3 || /^[a-z]\d$/.test(value)) keys.add(value); };
  add(item.name);
  String(item.name).split(/[/,+&]|\band\b/).forEach(add);
  (ITEM_ALIASES[String(item.name).toLowerCase()] || []).forEach(add);
  const name = clean(item.name);
  const vitamin = name.match(/^vitamin ([a-z])(\d*)$/);
  if (vitamin) {
    add(`vitamin ${vitamin[1]}`); add(`vit ${vitamin[1]}`);
    if (vitamin[2]) { add(`${vitamin[1]}${vitamin[2]}`); add(`vitamin ${vitamin[1]}${vitamin[2]}`); }
  }
  name.split(' ').forEach((token) => { if (token.length >= 6 && !GENERIC_TOKENS.has(token)) add(token); });
  return [...keys];
}

function groupKeys(group) {
  const base = clean(group);
  const keys = new Set([base]);
  const skip = new Set(['empty', 'stomach', 'with', 'food', 'cycled', 'daily', 'time']);
  base.split(' ').forEach((word) => {
    if (word.length < 5 || skip.has(word)) return;
    if (word === 'morning' && base.includes('mid')) return;
    keys.add(word);
  });
  if (base.includes('mid') && base.includes('morning')) { keys.add('mid morning'); keys.add('midmorning'); }
  if (base.includes('bedtime')) { keys.add('night'); keys.add('tonight'); }
  return [...keys];
}

function resolveOverlaps(mentions) {
  const sorted = [...mentions].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept = [];
  sorted.forEach((mention) => { if (!kept.some((other) => mention.start < other.end && mention.end > other.start)) kept.push(mention); });
  return kept;
}

function readScalars(text, context, put) {
  const current = context.current || {};
  const scalars = [
    { type: 'energy', label: 'Energy', source: 'energy(?: levels?)?|energetic', now: current.energy },
    { type: 'sleep', label: 'Sleep quality', source: 'sleep quality|sleep|slept|sleeping|rested|restful', now: current.sleep }
  ];
  scalars.forEach(({ type, label, source, now }) => {
    let result = null;
    findAll(text, source).forEach((mention) => { result = valueNear(text, mention, QUALITY_SCALE) || result; });
    if (result) put(type, { type, value: result.value, label: `${label} → ${result.value}/5`, noop: now !== '' && now !== undefined && Number(now) === result.value });
  });
}

function readSymptoms(text, context, put) {
  const current = context.current?.symptoms || {};
  (context.symptoms || []).forEach((name) => {
    const key = name.toLowerCase();
    const alias = SYMPTOM_ALIASES[key];
    const source = [`${escapeRegex(key)}s?`, alias].filter(Boolean).join('|');
    let result = null;
    findAll(text, source).forEach((mention) => {
      const found = valueNear(text, mention, SEVERITY_SCALE);
      result = found ? { value: found.value, estimated: false } : { value: 3, estimated: true };
    });
    if (result) put(`symptom:${key}`, { type: 'symptom', key, name, value: result.value, estimated: result.estimated, label: `${name} → ${result.value}/5`, noop: Number(current[key]) === result.value && !result.estimated });
  });
}

function readRoutine(text, context, put) {
  const items = context.items || [];
  const groups = context.groups || [];
  const groupMentions = [];
  groups.forEach((group) => {
    groupKeys(group).forEach((key) => {
      findAll(text, escapeRegex(key)).forEach((mention) => {
        const suffix = text.slice(mention.end, mention.end + 22).match(/^\s*(?:supplements?|pills?|stack|routine|items?|doses?|stuff|meds?|ones|vitamins?)\b/);
        const prefixed = /\b(?:all|every|everything|whole|entire|full|complete)\b(?:\s+\w+){0,3}\s*$/.test(text.slice(Math.max(0, mention.start - 24), mention.start));
        if (suffix || prefixed) groupMentions.push({ ...mention, end: mention.end + (suffix ? suffix[0].length : 0), group });
      });
    });
  });
  const everything = [];
  const sweeping = /\b(?:everything|all\s+(?:of\s+)?(?:my\s+|the\s+)?(?:supplements?|pills?|stack|routine|doses?|items?|meds?|vitamins?))\b/g;
  for (const match of text.matchAll(sweeping)) {
    const near = text.slice(Math.max(0, match.index - 25), match.index);
    const hasNoun = !match[0].startsWith('everything');
    if (hasNoun || new RegExp(`\\b(?:${NEGATIVE_CUES}|${POSITIVE_CUES})\\b\\s*$`).test(near)) everything.push({ start: match.index, end: match.index + match[0].length });
  }
  resolveOverlaps(groupMentions).forEach((mention) => {
    const enabled = postfixPolarity(text, mention.end) ?? polarityAt(text, mention.start) ?? true;
    const ids = items.filter((item) => item.group === mention.group).map((item) => item.id);
    if (!ids.length) return;
    put(`group:${mention.group}`, { type: 'routine-group', group: mention.group, enabled, ids, label: `All ${mention.group.replace(/,.*$/, '')} items → ${enabled ? 'On' : 'Off'}`, noop: items.filter((item) => ids.includes(item.id)).every((item) => item.enabled === enabled) });
  });
  everything.filter((span) => !groupMentions.some((group) => span.start < group.end && span.end > group.start)).forEach((span) => {
    const enabled = polarityAt(text, span.end) ?? true;
    const ids = items.map((item) => item.id);
    put('group:*', { type: 'routine-group', group: '*', enabled, ids, label: `All routine items → ${enabled ? 'On' : 'Off'}`, noop: items.every((item) => item.enabled === enabled) });
  });

  const exactKeys = new Set(items.flatMap(itemKeys));
  const mentions = [];
  items.forEach((item) => {
    itemKeys(item).forEach((key) => findAll(text, `${escapeRegex(key)}s?`).forEach((mention) => mentions.push({ ...mention, item, length: key.length, exact: true })));
  });
  // Speech-to-text often mangles supplement names, so match by sound across 1-3 spoken words.
  const tokens = [...text.matchAll(/[a-z]+/g)].map((match) => ({ word: match[0], start: match.index, end: match.index + match[0].length }));
  const fuzzyKeys = items.flatMap((item) => itemKeys(item).map((key) => key.replace(/ /g, '')).filter((key) => key.length >= 5 && !/\d/.test(key)).map((key) => ({ item, key, skeleton: skeleton(key) })));
  for (let i = 0; i < tokens.length; i += 1) {
    if (FUZZY_STOP.has(tokens[i].word)) continue;
    for (let size = 1; size <= 3 && i + size <= tokens.length; size += 1) {
      const window = tokens.slice(i, i + size);
      if (size > 1 && window.some((token, index) => index > 0 && tokens[i + index].start - tokens[i + index - 1].end > 1)) break;
      if (window.some((token) => FUZZY_STOP.has(token.word)) && size > 1) continue;
      const heard = window.map((token) => token.word).join('');
      if (heard.length < 4 || exactKeys.has(window.map((token) => token.word).join(' '))) continue;
      const heardSkeleton = skeleton(heard);
      fuzzyKeys.forEach(({ item, key, skeleton: keySkeleton }) => {
        if (Math.abs(heard.length - key.length) > 3) return;
        const limit = key.length <= 6 ? 1 : key.length <= 9 ? 2 : 3;
        const close = distance(heard, key) <= limit && heard[0] === key[0];
        const sounds = heardSkeleton.length >= 4 && (heardSkeleton === keySkeleton || (keySkeleton.length >= 6 && distance(heardSkeleton, keySkeleton) <= 1));
        if (close || sounds) mentions.push({ start: window[0].start, end: window[window.length - 1].end, item, length: key.length, exact: false });
      });
    }
  }
  const exactSpans = mentions.filter((mention) => mention.exact);
  const usable = mentions.filter((mention) => mention.exact || !exactSpans.some((other) => mention.start < other.end && mention.end > other.start));
  const unit = UNITS;
  resolveOverlaps(usable).forEach((mention) => {
    const { item } = mention;
    const enabled = postfixPolarity(text, mention.end) ?? polarityAt(text, mention.start) ?? true;
    put(`item:${item.id}`, { type: 'routine', id: item.id, name: item.name, group: item.group, enabled, label: `${item.name} → ${enabled ? 'On' : 'Off'}`, noop: item.enabled === enabled });
    const before = text.slice(Math.max(0, mention.start - 40), mention.start).match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unit})\\s*(?:of\\s+)?(?:my\\s+|the\\s+)?$`));
    const after = text.slice(mention.end, mention.end + 40).match(new RegExp(`^\\s*(?:dose|dosage|is|was|at|to|of|:|=|-)*\\s*(?:to\\s+|at\\s+)?(\\d+(?:\\.\\d+)?)\\s*(${unit})\\b`));
    const found = before || after;
    if (found && enabled) {
      const dose = `${found[1]} ${found[2]}`;
      put(`dose:${item.id}`, { type: 'dose', id: item.id, name: item.name, group: item.group, dose, label: `${item.name} dose → ${dose}`, noop: String(item.dose).toLowerCase() === dose });
    }
  });
}

const TIME_WORDS = [
  ['overnight', /last night|overnight|during the night|middle of the night|at night|\b[1-4]\s*am\b/g],
  ['morning', /morning|breakfast|woke|wake|first thing|\b(?:[5-9]|10|11)\s*(?:am|a m)\b/g],
  ['midday', /midday|noon|lunch/g],
  ['afternoon', /afternoon|\b[1-4]\s*pm\b/g],
  ['evening', /evening|dinner|tonight|\b(?:[5-9]|10)\s*pm\b/g]
];
const FORM_WORDS = [
  [7, /diarrh\w*|watery|liquid|runny/],
  [6, /mushy|loose|ragged|fluffy/],
  [5, /soft blobs?|blobs?|soft/],
  [4, /normal|healthy|smooth|well formed|formed|regular|perfect/],
  [3, /cracks?|cracked/],
  [2, /lumpy/],
  [1, /constipat\w*|hard|pellets?|rabbit|rock|dry|straining/]
];
const ORDINALS = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3 };

function timeBucket(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'overnight';
}

function readBowel(text, context, put) {
  const bowelContext = /\b(?:bowel|bowels|stools?|poo|poop\w*|bms?|toilet|bathroom|diarrh\w+|constipat\w+|loose motions?)\b/;
  const events = [];
  text.split(/[.;!?\n]+/).forEach((sentence) => {
    if (!bowelContext.test(sentence)) return;
    const countMatch = sentence.match(/(\d+)\s*(?:x\s*)?(?:bowel movements?|bowels?|stools?|poops?|bms?|trips? to the (?:toilet|bathroom)|times)\b/) || sentence.match(/(?:bowel movements?|stools?|poop\w*|toilet|bathroom|bm|diarrh\w+)[^,.]*?\b(\d+)\s*times?\b/);
    let count = countMatch ? Number(countMatch[1]) : /\bonce\b/.test(sentence) ? 1 : 0;
    const typed = [...sentence.matchAll(/(?:\b(first|1st|second|2nd|third|3rd|fourth|4th)\b[^,.]{0,24}?)?\b(?:type|bristol)\s*(?:number\s*)?([1-7])\b/g)];
    const forms = [];
    typed.forEach((match, index) => { forms[match[1] ? ORDINALS[match[1]] : index] = Number(match[2]); });
    const described = FORM_WORDS.find(([, pattern]) => pattern.test(sentence));
    const times = [];
    TIME_WORDS.forEach(([key, pattern]) => { for (const match of sentence.matchAll(pattern)) times.push({ key, index: match.index }); });
    times.sort((a, b) => a.index - b.index);
    if (!count) count = Math.max(1, forms.length, times.length);
    count = Math.min(count, 12);
    for (let index = 0; index < count; index += 1) {
      const time = times.length === count ? times[index].key : times[0]?.key;
      const form = forms[index] ?? (!typed.length && described ? described[0] : undefined);
      events.push({ time: time || timeBucket((context.now || new Date()).getHours()), form: form ? String(form) : '' });
    }
  });
  if (!events.length) return;
  const labels = context.stoolForms || [];
  const detail = [...new Set(events.map((event) => labels[Number(event.form) - 1]).filter(Boolean))].join(', ');
  put('stool', { type: 'stool', events, label: `Bowel movements: ${events.length}${detail ? ` · ${detail}` : ''}`, noop: false });
}

export function interpretQuickUpdate(message, context = {}) {
  const text = normalizeMessage(message);
  const changes = new Map();
  const put = (key, change) => changes.set(key, change);
  readScalars(text, context, put);
  readSymptoms(text, context, put);
  readRoutine(text, context, put);
  readBowel(text, context, put);
  return { changes: [...changes.values()], text };
}
