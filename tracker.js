import { Chess } from './chess-engine.js';
import { interpretQuickUpdate } from './quick-update.js';
import { renderAnalysis } from './analysis.js?v=2';
import { WISDOM } from './wisdom.js';
import { canonicalLabMarker, labMarkerIdentity, readPdfLabRows } from './lab-pdf.js?v=3';
import { DEFAULT_LAB_CATEGORIES, catalogCategoryForMarker, catalogMarkerDefinition, defaultLabCategories, demographicReference, labUnitConversion, standardizeLabResult } from './lab-catalog.js';

const STORAGE_KEY = 'thyroid-tracker-v2';
const LEGACY_KEY = 'thyroid-tracker-local-data-v1';
const SYMPTOMS = ['Fatigue', 'Joint pain', 'Appetite', 'Brain fog', 'Anxiety', 'Tremor', 'Mood', 'Heat intolerance', 'Palpitations'];
const STOOL_FORMS = [
  'Pellet-like, hard stool',
  'Lumpy, sausage-shaped stool',
  'Formed stool with surface cracks',
  'Smooth, soft, formed stool',
  'Soft blobs with defined edges',
  'Loose, ragged stool',
  'Watery stool, no solid pieces'
];
const STOOL_TIMES = [
  ['morning', 'Morning'],
  ['midday', 'Midday'],
  ['afternoon', 'Afternoon'],
  ['evening', 'Evening'],
  ['overnight', 'Overnight']
];
const TIME_GROUPS = [
  ['Morning, empty stomach', [['Acetyl-L-carnitine', '500–1,000 mg'], ['Alpha-lipoic acid', '300 mg'], ['NAC', '600 mg'], ['Colostrum', '1–2 g'], ['Thyropep', 'Per label']]],
  ['Breakfast, with food', [['Vitamin D3', '2,000–4,000 IU'], ['Vitamin K2', '90–180 mcg'], ['Selenium', '200 mcg'], ['Omega-3s', '1–2 g EPA + DHA'], ['B-complex', '1 capsule'], ['Polyphenols', '500–1,000 mg'], ['Vitamin C', '500 mg']]],
  ['Mid-morning', [['NMN', '250–500 mg']]],
  ['Lunch, with food', [['Probiotic / S. boulardii', '5–10 billion CFU'], ['Zinc carnosine', '75 mg complex'], ['Inositol', '500–1,000 mg'], ['Quercetin', '250–500 mg'], ['Bromelain', '100–250 mg'], ['Apigenin', '50–100 mg']]],
  ['Dinner, with food', [['TributyrinMax', '500–1,000 mg'], ['Collagen', '10–15 g'], ['Magnesium glycinate', '200–400 mg'], ['Biothyroid', 'Iodine-free, per label'], ['Biothymus', 'Per label']]],
  ['Evening / bedtime', [['Reishi extract', '500–1,000 mg'], ['L-theanine', '200–400 mg'], ['Taurine', '500–1,000 mg'], ['Glycine', '2–3 g'], ['LDN', '0.5–1.5 mg initially']]],
  ['Cycled, non-daily peptides', [['Thymalin', '5–10 mg cycles'], ['KPV', '200–500 mcg'], ['BPC-157', '250–500 mcg'], ['Epitalon', '5–10 mg cycles']]]
];

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const emptyRoutine = () => TIME_GROUPS.flatMap(([group, items]) => items.map(([name, dose]) => ({ id: `${group}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, dose, group, source: 'Imported source list', enabled: false })));
const makeDraft = (routine, prior = null) => ({
  routine: routine.map((item) => ({ ...item, enabled: prior?.routine?.find((old) => old.id === item.id)?.enabled ?? item.enabled })),
  energyLevel: prior?.energyLevel ?? '',
  sleepQuality: prior?.sleepQuality ?? '',
  symptoms: { ...(prior?.symptoms || Object.fromEntries(SYMPTOMS.map((name) => [name.toLowerCase(), 0]))) },
  stoolEvents: Array.from({ length: 3 }, (_, index) => ({ id: `stool-${Date.now()}-${index}`, time: '', form: '' })),
  health: prior?.health || null,
  notes: ''
});

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.days && Array.isArray(saved.labs)) {
      const submittedDays = Object.fromEntries(Object.entries(saved.days).filter(([, day]) => day.submitted || Object.keys(day.parts || {}).length || day.draft || day.submissionActions?.length).map(([date, day]) => [date, { submitted: day.submitted, submissionHistory: day.submissionHistory || [], parts: day.parts || {}, draft: day.draft, dirtySections: day.dirtySections || [], submissionActions: day.submissionActions || [], submissionCursor: day.submissionCursor ?? day.submissionActions?.length ?? 0 }]));
      const puzzle = { solved: 0, streak: 0, bestStreak: 0, targetRating: saved.puzzle?.rating ?? 1200, ...saved.puzzle };
      if (!puzzle.targetRating || (puzzle.solved === 0 && puzzle.targetRating === 800)) puzzle.targetRating = 1200;
      return { doseOverrides: {}, routineOverrides: {}, deletedRoutineItems: [], routineGroups: TIME_GROUPS.map(([group]) => group), healthByDate: {}, customSymptoms: [], puzzle: { solved: 0, streak: 0, bestStreak: 0, targetRating: 1200 }, ...saved, puzzle, days: submittedDays };
      }
  } catch {}
  const routine = emptyRoutine();
  const migrated = { days: {}, labs: [], customItems: [] };
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (old) {
      const oldRoutine = old.regimen?.map((item) => ({ ...item, enabled: Boolean(item.taken ?? item.enabled) })) || routine;
      const date = old.date || today();
      const legacyEntry = makeDraft(oldRoutine, { ...old, notes: old.dailyNotes });
      migrated.days[date] = { draft: legacyEntry, submitted: { ...JSON.parse(JSON.stringify(legacyEntry)), submittedAt: new Date().toISOString(), migrated: true } };
      migrated.customItems = oldRoutine.filter((item) => item.id?.startsWith('custom-'));
      migrated.labs = old.labs || [];
    }
  } catch {}
  return { doseOverrides: {}, routineOverrides: {}, deletedRoutineItems: [], routineGroups: TIME_GROUPS.map(([group]) => group), healthByDate: {}, customSymptoms: [], puzzle: { solved: 0, streak: 0, bestStreak: 0, targetRating: 1200 }, ...migrated };
}

const data = loadData();
data.labCategories ||= defaultLabCategories();
data.labMarkerAliases ||= {};
data.labProfile ||= { age: '', sex: '' };
data.labUnits ||= {};
data.hiddenLabMarkers ||= {};
data.labImports ||= {};
const storedLabReferences = data.labReferences || {};
data.labReferences = {};
Object.entries(storedLabReferences).forEach(([marker, reference]) => {
  const key = labMarkerIdentity(marker);
  if (!Object.hasOwn(data.labReferences, key)) data.labReferences[key] = reference;
});
(data.labs || []).forEach((lab) => {
  const key = labMarkerIdentity(lab.marker);
  if (!data.labReferences[key] && lab.reference) data.labReferences[key] = lab.reference;
});
data.desiredRanges ||= {};
Object.entries(data.desiredRanges).forEach(([marker, range]) => {
  const key = labMarkerIdentity(marker);
  if (key !== marker && !Object.hasOwn(data.desiredRanges, key)) data.desiredRanges[key] = range;
});
migrateStoredLabUnits();
let activeDate = today();
let calendarMonth = new Date(`${activeDate}T12:00:00`);
let recognition = null;
let toastTimer;
let selectedSquare = null;
let currentPublicPapers = [];
let labPortraitTextScale = Math.min(1, Math.max(0.65, Number(localStorage.getItem('thyroid-tracker-lab-text-scale')) || 0.8));
let activeRoutineGroup = TIME_GROUPS[0][0];
let activeLabCategory = 'Thyroid';
let labCategoryToManage = '';
let labMarkerMenu = { key: '', moving: false, merging: false };
let labCategoryHoldTimer = null;
let lastLabCategoryTap = { name: '', time: 0 };
let suppressLabCategoryClick = false;
let pendingQuickUpdate = null;
let pendingQuickOverrides = null;
let routineGroupToManage = '';
let itemMenu = { id: '', moving: false };
let lastRoutineTap = { group: '', time: 0 };
let routineTabHoldTimer = null;
let suppressRoutineTabClick = false;
let pendingLabRows = [];
let pendingLabImport = null;

function saveData() {
  const submittedDays = Object.fromEntries(Object.entries(data.days).filter(([, day]) => day.submitted || Object.keys(day.parts || {}).length || day.draft || day.submissionActions?.length).map(([date, day]) => [date, { submitted: day.submitted, submissionHistory: day.submissionHistory || [], parts: day.parts || {}, draft: day.draft, dirtySections: day.dirtySections || [], submissionActions: day.submissionActions || [], submissionCursor: day.submissionCursor ?? day.submissionActions?.length ?? 0 }]));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ days: submittedDays, labs: data.labs || [], labImports: data.labImports || {}, labReferences: data.labReferences || {}, customItems: data.customItems || [], customSymptoms: data.customSymptoms || [], doseOverrides: data.doseOverrides || {}, routineOverrides: data.routineOverrides || {}, deletedRoutineItems: data.deletedRoutineItems || [], routineGroups: routineGroups(), desiredRanges: data.desiredRanges || {}, healthByDate: data.healthByDate || {}, labCategories: data.labCategories || defaultLabCategories(), labMarkerAliases: data.labMarkerAliases || {}, hiddenLabMarkers: data.hiddenLabMarkers || {}, labUnits: data.labUnits || {}, labProfile: data.labProfile || {}, puzzle: { ...data.puzzle, rating: undefined } }));
}

function recordSubmissionAction(date, kind, section, before, after, draftBefore) {
  const day = data.days[date];
  day.submissionActions ||= [];
  day.submissionCursor ??= day.submissionActions.length;
  day.submissionActions = day.submissionActions.slice(0, day.submissionCursor);
  day.submissionActions.push({ kind, section, before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(after)), draftBefore: JSON.parse(JSON.stringify(draftBefore)) });
  if (day.submissionActions.length > 30) day.submissionActions.shift();
  day.submissionCursor = day.submissionActions.length;
}

function updateSubmissionHistoryButtons() {
  const day = data.days?.[activeDate];
  const actions = day?.submissionActions || [];
  const cursor = day?.submissionCursor ?? actions.length;
  const undo = document.getElementById('undoSubmission');
  const redo = document.getElementById('redoSubmission');
  if (undo) undo.disabled = cursor <= 0;
  if (redo) redo.disabled = cursor >= actions.length;
  const dialogUndo = document.getElementById('undoSubmissionDialog');
  const dialogRedo = document.getElementById('redoSubmissionDialog');
  if (dialogUndo) dialogUndo.disabled = cursor <= 0;
  if (dialogRedo) dialogRedo.disabled = cursor >= actions.length;
}

function applySubmissionAction(date, action, useAfter) {
  const day = data.days[date];
  if (!day || !action) return;
  const value = useAfter ? action.after : action.before;
  if (action.kind === 'day') {
    day.submitted = JSON.parse(JSON.stringify(value.submitted));
    day.draft = JSON.parse(JSON.stringify(value.draft));
    day.dirtySections = [...(value.dirtySections || [])];
    day.submissionHistory = JSON.parse(JSON.stringify(value.submissionHistory || []));
    day.dirty = Boolean(day.dirtySections.length);
  } else if (action.kind === 'section') {
    day.parts ||= {};
    if (value.part === undefined) delete day.parts[action.section];
    else day.parts[action.section] = JSON.parse(JSON.stringify(value.part));
    day.draft = JSON.parse(JSON.stringify(value.draft));
    day.dirtySections = [...(value.dirtySections || [])];
    day.dirty = Boolean(day.dirtySections.length);
  }
  saveData();
}

function undoSubmission() {
  const day = data.days?.[activeDate];
  if (!day) return;
  const actions = day.submissionActions || [];
  const cursor = day.submissionCursor ?? actions.length;
  if (cursor <= 0) return;
  const action = actions[cursor - 1];
  applySubmissionAction(activeDate, action, false);
  day.submissionCursor = cursor - 1;
  saveData();
  setDate(activeDate);
  renderMomentum(); renderLocalCorrelations(); updateSubmissionHistoryButtons();
  toast(`Undid ${action.kind === 'day' ? 'day' : action.section} submission.`);
}

function redoSubmission() {
  const day = data.days?.[activeDate];
  if (!day) return;
  const actions = day.submissionActions || [];
  const cursor = day.submissionCursor ?? actions.length;
  if (cursor >= actions.length) return;
  const action = actions[cursor];
  applySubmissionAction(activeDate, action, true);
  day.submissionCursor = cursor + 1;
  saveData();
  setDate(activeDate);
  renderMomentum(); renderLocalCorrelations(); updateSubmissionHistoryButtons();
  toast(`Redid ${action.kind === 'day' ? 'day' : action.section} submission.`);
}

function previousDay(date) { const day = new Date(`${date}T12:00:00`); day.setDate(day.getDate() - 1); return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`; }
function combinedRoutine() {
  const deleted = new Set(data.deletedRoutineItems || []);
  return [...emptyRoutine(), ...(data.customItems || [])]
    .filter((item) => !deleted.has(item.id))
    .map((item) => ({ ...item, ...(data.routineOverrides?.[item.id] || {}), dose: data.doseOverrides?.[item.id] ?? item.dose }));
}
function routineGroups() { return [...new Set([...(data.routineGroups?.length ? data.routineGroups : TIME_GROUPS.map(([group]) => group)), ...(data.customItems || []).map((item) => data.routineOverrides?.[item.id]?.group ?? item.group)])]; }
function allSymptoms() { return [...SYMPTOMS, ...(data.customSymptoms || [])]; }

function carryForwardEntry(day) {
  if (!day) return null;
  if (day.submitted) return day.submitted;
  const carried = { routine: [] };
  const checkinParts = day.parts?.checkin;
  const latestCheckin = Array.isArray(checkinParts) ? checkinParts[checkinParts.length - 1] : checkinParts;
  if (latestCheckin?.entry) Object.assign(carried, latestCheckin.entry);
  const routineById = new Map();
  Object.entries(day.parts || {}).forEach(([group, history]) => {
    if (group === 'checkin') return;
    const latest = Array.isArray(history) ? history[history.length - 1] : history;
    (latest?.items || []).forEach((item) => routineById.set(item.id, item));
  });
  carried.routine = [...routineById.values()];
  return carried.routine.length || latestCheckin?.entry ? carried : null;
}

function getDay(date = activeDate) {
  if (!data.days[date]) {
    const prior = carryForwardEntry(data.days[previousDay(date)]);
    data.days[date] = { draft: makeDraft(combinedRoutine(), prior), submitted: null, parts: {}, dirtySections: [] };
  } else if (!data.days[date].draft) {
    const day = data.days[date];
    const prior = carryForwardEntry(data.days[previousDay(date)]);
    const submitted = day.submitted;
    day.draft = makeDraft(combinedRoutine(), submitted || prior);
    if (submitted) {
      const savedItems = new Map((submitted.routine || []).map((item) => [item.id, item]));
      day.draft.routine = combinedRoutine().map((item) => ({ ...item, ...(savedItems.get(item.id) || {}) }));
      day.draft.stoolEvents = JSON.parse(JSON.stringify(submitted.stoolEvents || []));
      day.draft.notes = submitted.notes || '';
    }
    Object.entries(day.parts || {}).forEach(([group, revisions]) => {
      const latest = Array.isArray(revisions) ? revisions[revisions.length - 1] : revisions;
      if (group === 'checkin' && latest?.entry) Object.assign(day.draft, latest.entry);
      else if (latest?.items) {
        const savedItems = new Map(latest.items.map((item) => [item.id, item]));
        day.draft.routine = day.draft.routine.map((item) => ({ ...item, ...(savedItems.get(item.id) || {}) }));
      }
    });
    day.dirtySections ||= [];
    day.parts ||= {};
  }
  allSymptoms().forEach((name) => { data.days[date].draft.symptoms[name.toLowerCase()] ??= 0; });
  return data.days[date];
}

function draft() { return getDay().draft; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function uniqueId(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
function toast(message) { const el = document.getElementById('toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 2600); }

const FALLBACK_PUZZLES = [
  { id: 'original-mate-1-queen', rating: 850, fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', solution: ['g6g7'], title: 'Mate in one', theme: 'Queen and king coordination' },
  { id: 'original-mate-1-rook', rating: 1150, fen: '7k/5K2/8/8/4B3/8/8/6R1 w - - 0 1', solution: ['g1g8'], title: 'Mate in one', theme: 'Rook lift with protected escape squares' },
  { id: 'original-mate-2-queen', rating: 1550, fen: '7k/8/5K2/6Q1/8/8/8/8 w - - 0 1', solution: ['g5h6', 'h8g8', 'h6g7'], title: 'Forced mate in two', theme: 'Forcing check and king-boxing finish' }
];
const PIECE_GLYPHS = { w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }, b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' } };
let chessGame = new Chess();
let puzzleSolverColor = 'w';
let currentPuzzle = null;
let puzzlePly = 0;
let legalTargets = [];
let lastChallengeId = '';
let challengeRequest = 0;
let puzzleTargetRating = null;

let puzzleBank = null;
async function loadPuzzleBank() {
  if (puzzleBank) return puzzleBank;
  try {
    const response = await fetch('./puzzles.json');
    puzzleBank = (await response.json()).map(([id, fen, moves, rating, themes]) => ({ id, fen, moves: moves.split(' '), rating, themes }));
  } catch { puzzleBank = []; }
  return puzzleBank;
}

function pickPuzzle(bank, rating) {
  const seen = new Set(data.puzzle.seen || []);
  for (const window of [60, 120, 250, 500, 4000]) {
    const near = bank.filter((puzzle) => Math.abs(puzzle.rating - rating) <= window);
    const fresh = near.filter((puzzle) => !seen.has(puzzle.id));
    if (fresh.length >= 3 || (window >= 500 && fresh.length)) return fresh[Math.floor(Math.random() * fresh.length)];
    if (window === 250 && !fresh.length && near.length) {
      data.puzzle.seen = (data.puzzle.seen || []).filter((id) => !near.some((puzzle) => puzzle.id === id));
      return near[Math.floor(Math.random() * near.length)];
    }
  }
  return null;
}

function fallbackPuzzleForRating(rating) {
  const available = FALLBACK_PUZZLES.filter((puzzle) => puzzle.id !== lastChallengeId);
  const candidates = available.length ? available : FALLBACK_PUZZLES;
  return candidates.reduce((best, puzzle) => Math.abs(puzzle.rating - rating) < Math.abs(best.rating - rating) ? puzzle : best, candidates[0]);
}

function bankPuzzleToPlayable(entry) {
  const game = new Chess(entry.fen);
  const [opening, ...solution] = entry.moves;
  game.move({ from: opening.slice(0, 2), to: opening.slice(2, 4), promotion: opening[4] || 'q' });
  const themes = entry.themes.split('+').filter(Boolean).map((name) => name.replace(/([A-Z])/g, ' $1').toLowerCase().trim()).join(' · ');
  return { id: entry.id, rating: entry.rating, fen: game.fen(), solution, title: 'Rated puzzle', theme: themes || 'Find the best continuation', source: 'Lichess', sourceUrl: `https://lichess.org/training/${encodeURIComponent(entry.id)}` };
}

function installPuzzle(puzzle) {
  currentPuzzle = { ...puzzle };
  chessGame = new Chess(currentPuzzle.fen);
  puzzleSolverColor = chessGame.turn();
  puzzlePly = 0;
  selectedSquare = null;
  legalTargets = [];
  lastChallengeId = currentPuzzle.id;
  document.getElementById('puzzleTitle').textContent = `${chessGame.turn() === 'w' ? 'White' : 'Black'} to move · ${currentPuzzle.title || 'Puzzle'}`;
  document.getElementById('puzzleDescription').textContent = `${currentPuzzle.theme || 'Find the best continuation'}`;
  document.getElementById('puzzleRatingInput').value = data.puzzle.targetRating;
  document.getElementById('puzzleDescription').textContent = `Puzzle rating ${currentPuzzle.rating} · ${currentPuzzle.theme || 'Find the best continuation'}`;
  document.getElementById('puzzleFeedback').textContent = currentPuzzle.source ? 'Tap a piece, then a destination.' : 'Offline puzzle · tap a piece, then a destination.';
  const source = document.getElementById('puzzleSource');
  source.hidden = !currentPuzzle.sourceUrl;
  source.href = currentPuzzle.sourceUrl || '#';
  source.textContent = currentPuzzle.sourceUrl ? 'Puzzle source: Lichess' : '';
  const fortuneReveal = document.getElementById('fortuneReveal');
  if (fortuneReveal) fortuneReveal.hidden = true;
  renderPuzzle();
}

async function preparePuzzle() {
  const requestId = ++challengeRequest;
  const targetRating = data.puzzle.targetRating;
  puzzleTargetRating = targetRating;
  const bank = await loadPuzzleBank();
  if (requestId !== challengeRequest) return;
  const entry = bank.length ? pickPuzzle(bank, targetRating) : null;
  if (!entry) { installPuzzle(fallbackPuzzleForRating(targetRating)); return; }
  data.puzzle.seen = [...(data.puzzle.seen || []), entry.id].slice(-1500);
  saveData();
  installPuzzle(bankPuzzleToPlayable(entry));
}

function renderPuzzle() {
  const board = document.getElementById('chessBoard');
  if (!board || !chessGame) return;
  board.innerHTML = '';
  const boardState = chessGame.board();
  const targetSet = new Set(legalTargets.map((move) => move.to));
  const ranks = puzzleSolverColor === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = puzzleSolverColor === 'w' ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
  for (const rank of ranks) for (const file of files) {
    const square = `${file}${rank}`;
    const piece = chessGame.get(square);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `square ${(file + rank) % 2 ? 'dark' : 'light'} ${piece ? 'piece' : ''} ${selectedSquare === square ? 'selected' : ''} ${targetSet.has(square) ? 'legal-target' : ''}`;
    cell.dataset.square = square;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`);
    cell.textContent = piece ? PIECE_GLYPHS[piece.color][piece.type] : '';
    board.append(cell);
  }
  board.querySelectorAll('[data-square]').forEach((cell) => cell.addEventListener('click', () => movePuzzle(cell.dataset.square)));
}

function puzzleMoveUci(move) { return `${move.from}${move.to}${move.promotion || ''}`; }

function movePuzzle(square) {
  if (!currentPuzzle || !chessGame) return;
  const feedback = document.getElementById('puzzleFeedback');
  const piece = chessGame.get(square);
  if (selectedSquare && legalTargets.some((move) => move.to === square)) {
    const expected = currentPuzzle.solution[puzzlePly];
    const candidate = expected?.startsWith(`${selectedSquare}${square}`) ? expected : `${selectedSquare}${square}${legalTargets.find((move) => move.to === square)?.promotion || ''}`;
    if (candidate !== expected) {
      selectedSquare = null; legalTargets = [];
      data.puzzle.streak = 0; saveData(); renderMomentum();
      feedback.textContent = 'That move is legal, but it misses the puzzle line. Try another idea.';
      renderPuzzle(); return;
    }
    chessGame.move({ from: selectedSquare, to: square, promotion: candidate[4] || 'q' });
    puzzlePly += 1; selectedSquare = null; legalTargets = [];
    if (puzzlePly >= currentPuzzle.solution.length) { finishPuzzle(); return; }
    const reply = currentPuzzle.solution[puzzlePly];
    if (reply) {
      chessGame.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] || 'q' });
      puzzlePly += 1;
    }
    feedback.textContent = chessGame.isCheckmate() ? 'Checkmate.' : 'Good move. Find the continuation.';
    if (puzzlePly >= currentPuzzle.solution.length) { finishPuzzle(); return; }
    renderPuzzle(); return;
  }
  if (piece && piece.color === chessGame.turn()) {
    selectedSquare = square;
    legalTargets = chessGame.moves({ square, verbose: true });
    feedback.textContent = 'Choose a highlighted square.';
  } else {
    selectedSquare = null; legalTargets = [];
  }
  renderPuzzle();
}

function finishPuzzle() {
  data.puzzle.solved += 1;
  data.puzzle.streak += 1;
  data.puzzle.bestStreak = Math.max(data.puzzle.bestStreak, data.puzzle.streak);
  saveData(); renderMomentum();
  document.getElementById('puzzleFeedback').textContent = chessGame.isCheckmate() ? 'Checkmate. Puzzle solved.' : 'Puzzle line complete.';
  const seenQuotes = new Set(data.puzzle.quotesSeen || []);
  let unseen = WISDOM.map((_, index) => index).filter((index) => !seenQuotes.has(index));
  if (!unseen.length) { data.puzzle.quotesSeen = []; unseen = WISDOM.map((_, index) => index); }
  const quoteIndex = unseen[Math.floor(Math.random() * unseen.length)];
  data.puzzle.quotesSeen = [...(data.puzzle.quotesSeen || []), quoteIndex];
  saveData();
  const [quote, author] = WISDOM[quoteIndex];
  const wisdomEl = document.getElementById('wisdomText');
  wisdomEl.textContent = quote;
  if (author) { const by = document.createElement('small'); by.className = 'wisdom-author'; by.textContent = `— ${author}`; wisdomEl.append(document.createElement('br'), by); }
  const overlay = document.getElementById('wisdomOverlay');
  overlay.hidden = false;
  overlay.classList.remove('wisdom-show');
  void overlay.offsetWidth;
  overlay.classList.add('wisdom-show');
  playMeditationBell();
  renderPuzzle();
}

function closeWisdom() {
  const overlay = document.getElementById('wisdomOverlay');
  overlay.hidden = true;
  overlay.classList.remove('wisdom-show');
  document.querySelector('#momentumDialog').querySelector('#closeChallenge').focus();
}

function playMeditationBell() {
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return;
  try {
    const context = new AudioContextType();
    const start = context.currentTime;
    [[880, 0.045, 2.8], [1320, 0.022, 2.3], [1760, 0.01, 1.8]].forEach(([frequency, peak, duration]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(start); oscillator.stop(start + duration + 0.05);
    });
    window.setTimeout(() => context.close().catch(() => {}), 3200);
  } catch {}
}

function resetPuzzle() { preparePuzzle(); }

function openChallenge() {
  const dialog = document.getElementById('momentumDialog');
  resetPuzzle();
  if (!dialog.open) dialog.showModal();
}

function renderRoutine() {
  const el = document.getElementById('routineList');
  const items = draft().routine;
  renderRoutineSubtabs();
  const grouped = items.filter((item) => item.group === activeRoutineGroup);
  el.innerHTML = grouped.length ? `<section class="routine-group">${grouped.map((item) => `<div class="routine-row"><div class="routine-item-copy"><div class="item-title"><strong>${escapeHtml(item.name)}</strong><button class="item-edit" type="button" data-edit-item="${escapeHtml(item.id)}" aria-haspopup="menu" aria-expanded="${itemMenu.id === item.id}">Edit</button></div><div class="dose-inline"><span class="dose-display">${escapeHtml(item.dose)}</span><button class="dose-edit-button" type="button" data-dose-toggle="${escapeHtml(item.id)}">Dose</button><input class="dose-edit-input" data-dose-input="${escapeHtml(item.id)}" aria-label="Dose for ${escapeHtml(item.name)}" value="${escapeHtml(item.dose)}" hidden /></div>${itemMenu.id === item.id ? itemMenuHtml(item) : ''}</div><button class="switch ${item.enabled ? 'on' : ''}" role="switch" aria-checked="${item.enabled}" aria-label="${item.enabled ? 'On' : 'Off'}: ${escapeHtml(item.name)}" data-switch="${escapeHtml(item.id)}"><span></span><b>${item.enabled ? 'On' : 'Off'}</b></button></div>`).join('')}</section>` : '<div class="empty-state">No items in this time period yet.</div>';
  const part = getDay().parts?.[activeRoutineGroup];
  const latestPart = Array.isArray(part) ? part[part.length - 1] : part;
    const partDirty = getDay().dirtySections?.includes(`routine:${activeRoutineGroup}`);
    document.getElementById('partSubmitStatus').textContent = partDirty ? 'Changes in this section are not submitted' : latestPart ? `Saved ${new Date(latestPart.submittedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Changes in this section are not submitted';
  el.querySelectorAll('[data-dose-toggle]').forEach((button) => button.addEventListener('click', () => {
    const input = el.querySelector(`[data-dose-input="${CSS.escape(button.dataset.doseToggle)}"]`);
    input.hidden = !input.hidden;
    if (!input.hidden) { input.focus(); input.select(); }
  }));
  el.querySelectorAll('[data-edit-item]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    itemMenu = itemMenu.id === button.dataset.editItem ? { id: '', moving: false } : { id: button.dataset.editItem, moving: false };
    renderRoutine();
  }));
  el.querySelectorAll('[data-item-rename]').forEach((button) => button.addEventListener('click', () => { const id = itemMenu.id; itemMenu = { id: '', moving: false }; renameRoutineItem(id); renderRoutine(); }));
  el.querySelectorAll('[data-item-delete]').forEach((button) => button.addEventListener('click', () => { const id = itemMenu.id; itemMenu = { id: '', moving: false }; deleteRoutineItem(id); renderRoutine(); }));
  el.querySelectorAll('[data-item-move]').forEach((button) => button.addEventListener('click', () => { itemMenu.moving = !itemMenu.moving; renderRoutine(); }));
  el.querySelectorAll('[data-item-move-to]').forEach((select) => select.addEventListener('change', () => { const id = itemMenu.id; itemMenu = { id: '', moving: false }; moveRoutineItem(id, select.value); }));
  el.querySelectorAll('[data-dose-input]').forEach((input) => input.addEventListener('change', () => {
    const itemId = input.dataset.doseInput;
    data.doseOverrides[itemId] = input.value.trim();
    const item = draft().routine.find((entry) => entry.id === itemId);
    if (item) item.dose = input.value.trim();
      saveData(); saveDraft(`routine:${item.group}`); renderRoutine();
  }));
  el.querySelectorAll('[data-switch]').forEach((button) => button.addEventListener('click', () => {
    const item = draft().routine.find((entry) => entry.id === button.dataset.switch);
    item.enabled = !item.enabled;
      saveDraft(`routine:${activeRoutineGroup}`); renderRoutine();
  }));
}

function itemMenuHtml(item) {
  const options = routineGroups().map((group) => `<option value="${escapeHtml(group)}" ${group === item.group ? 'selected' : ''}>${escapeHtml(group.replace(', empty stomach', '').replace(', with food', ''))}</option>`).join('');
  return `<div class="item-menu" role="menu"><button type="button" role="menuitem" data-item-rename>Rename</button><button type="button" role="menuitem" data-item-move aria-expanded="${itemMenu.moving}">Move${itemMenu.moving ? ' ▴' : ' ▾'}</button>${itemMenu.moving ? `<select data-item-move-to aria-label="Move ${escapeHtml(item.name)} to"><option value="" disabled selected>Move to…</option>${options}</select>` : ''}<button type="button" role="menuitem" class="danger" data-item-delete>Delete</button></div>`;
}

function moveRoutineItem(itemId, destination) {
  const item = draft().routine.find((entry) => entry.id === itemId);
  if (!item || !destination || item.group === destination) { renderRoutine(); return; }
  const source = item.group;
  data.routineOverrides ||= {};
  data.routineOverrides[itemId] = { ...(data.routineOverrides[itemId] || {}), group: destination };
  item.group = destination;
  saveData(); saveDraft(`routine:${source}`); saveDraft(`routine:${destination}`);
  toast(`Moved ${item.name} to ${destination.replace(', empty stomach', '').replace(', with food', '')}.`);
  renderRoutine();
}

document.addEventListener('click', (event) => {
  if (itemMenu.id && !event.target.closest('.item-menu, .item-edit')) { itemMenu = { id: '', moving: false }; renderRoutine(); }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && itemMenu.id) { itemMenu = { id: '', moving: false }; renderRoutine(); }
});

function renderRoutineSubtabs() {
  const tabs = routineGroups();
  if (!tabs.includes(activeRoutineGroup)) activeRoutineGroup = tabs[0];
  const container = document.getElementById('routineSubtabs');
  container.innerHTML = tabs.map((group) => `<button class="routine-subtab ${group === activeRoutineGroup ? 'active' : ''}" type="button" data-routine-group="${escapeHtml(group)}" aria-selected="${group === activeRoutineGroup}">${escapeHtml(group.replace(', empty stomach', '').replace(', with food', ''))}</button>`).join('');
  let held = null;
  const cancelHold = () => clearTimeout(routineTabHoldTimer);
  const arm = () => {
    const tabs = [...container.querySelectorAll('[data-routine-group]')];
    held.armed = true;
    held.slots = tabs.map((tab) => { const box = tab.getBoundingClientRect(); return { tab, left: box.left, top: box.top, cx: box.left + box.width / 2, cy: box.top + box.height / 2 }; });
    held.button.classList.add('dragging');
  };
  container.querySelectorAll('[data-routine-group]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      cancelHold();
      held = { button, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, armed: false, moved: false, target: -1 };
      routineTabHoldTimer = setTimeout(() => { if (held) arm(); }, 250);
    });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (suppressRoutineTabClick) return;
      const group = button.dataset.routineGroup;
      const now = Date.now();
      if (lastRoutineTap.group === group && now - lastRoutineTap.time < 400) { lastRoutineTap = { group: '', time: 0 }; openRoutineGroupMenu(group); return; }
      lastRoutineTap = { group, time: now };
      if (activeRoutineGroup !== group) { activeRoutineGroup = group; renderRoutine(); }
    });
  });
  container.onpointermove = (event) => {
    if (!held) return;
    if (!held.armed) {
      if (Math.hypot(event.clientX - held.startX, event.clientY - held.startY) > 8) { cancelHold(); if (event.pointerType === 'mouse') arm(); else { held = null; return; } } else return;
    }
    if (!held.captured) { container.setPointerCapture(held.pointerId); held.captured = true; }
    const dx = event.clientX - held.startX; const dy = event.clientY - held.startY;
    held.moved = held.moved || Math.hypot(dx, dy) > 6;
    held.button.style.transform = `translate(${dx}px, ${dy}px) scale(1.05)`;
    const from = held.slots.findIndex((slot) => slot.tab === held.button);
    const mine = held.slots[from];
    const px = mine.cx + dx; const py = mine.cy + dy;
    let target = 0; let best = Infinity;
    held.slots.forEach((slot, index) => { const distance = Math.hypot(slot.cx - px, slot.cy - py); if (distance < best) { best = distance; target = index; } });
    held.target = target;
    held.slots.filter((slot) => slot.tab !== held.button).forEach((slot, position) => {
      const destination = held.slots[position < target ? position : position + 1];
      slot.tab.classList.add('shifting');
      slot.tab.style.transform = destination === slot ? '' : `translate(${destination.left - slot.left}px, ${destination.top - slot.top}px)`;
    });
  };
  container.ontouchmove = (event) => { if (held?.armed && event.cancelable) event.preventDefault(); };
  const finish = (event) => {
    cancelHold();
    if (!held) return;
    const { button, armed, moved, slots, target } = held;
    held = null;
    if (!armed) return;
    suppressRoutineTabClick = true;
    setTimeout(() => { suppressRoutineTabClick = false; }, 0);
    if (event.type !== 'pointercancel' && moved && target >= 0) {
      const names = slots.filter((slot) => slot.tab !== button).map((slot) => slot.tab.dataset.routineGroup);
      names.splice(target, 0, button.dataset.routineGroup);
      if (names.join('\n') !== routineGroups().join('\n')) { data.routineGroups = names; saveData(); }
    }
    renderRoutine();
  };
  container.onpointerup = finish;
  container.onpointercancel = finish;
}

function addRoutineGroup() {
  const name = prompt('Name this time-of-day tab:')?.trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (routineGroups().some((group) => group.toLowerCase() === name.toLowerCase())) { toast('A tab with that name already exists.'); return; }
  data.routineGroups = [...routineGroups(), name];
  activeRoutineGroup = name;
  saveData(); renderRoutine();
}

function openRoutineGroupMenu(group) {
  routineGroupToManage = group;
  document.getElementById('routineGroupMenuTitle').textContent = group.replace(', empty stomach', '').replace(', with food', '');
  document.getElementById('deleteRoutineGroup').disabled = routineGroups().length <= 1;
  document.getElementById('routineGroupMenu').showModal();
}

function renameRoutineGroup() {
  const oldName = routineGroupToManage;
  const name = prompt('Rename this time-of-day tab:', oldName)?.trim().replace(/\s+/g, ' ');
  if (!name || name === oldName) return;
  if (routineGroups().some((group) => group !== oldName && group.toLowerCase() === name.toLowerCase())) { toast('A tab with that name already exists.'); return; }
  data.routineGroups = routineGroups().map((group) => group === oldName ? name : group);
  data.routineOverrides ||= {};
  draft().routine.forEach((item) => {
    if (item.group !== oldName) return;
    item.group = name;
    data.routineOverrides[item.id] = { ...(data.routineOverrides[item.id] || {}), group: name };
  });
  activeRoutineGroup = name;
  document.getElementById('routineGroupMenu').close();
  saveData(); saveDraft(`routine:${name}`); renderRoutine();
}

function deleteRoutineGroup() {
  const groups = routineGroups();
  if (groups.length <= 1) { toast('Keep at least one time-of-day tab.'); return; }
  const oldName = routineGroupToManage;
  const destination = groups.find((group) => group !== oldName);
  const itemCount = draft().routine.filter((item) => item.group === oldName).length;
  const detail = itemCount ? `${itemCount} ${itemCount === 1 ? 'item will' : 'items will'} move to “${destination}”.` : 'No items are in this tab.';
  if (!confirm(`Delete the “${oldName}” tab? ${detail} Previously submitted records remain unchanged.`)) return;
  data.routineGroups = groups.filter((group) => group !== oldName);
  data.routineOverrides ||= {};
  draft().routine.forEach((item) => {
    if (item.group !== oldName) return;
    item.group = destination;
    data.routineOverrides[item.id] = { ...(data.routineOverrides[item.id] || {}), group: destination };
  });
  activeRoutineGroup = destination;
  document.getElementById('routineGroupMenu').close();
  saveData(); saveDraft(`routine:${destination}`); renderRoutine();
}

function submitRoutinePart() {
  const day = getDay(); day.parts ||= {};
  const draftBefore = JSON.parse(JSON.stringify(day.draft));
  const previous = day.parts[activeRoutineGroup]; const history = Array.isArray(previous) ? previous : previous ? [previous] : [];
  day.parts[activeRoutineGroup] = [...history, { items: draft().routine.filter((item) => item.group === activeRoutineGroup).map((item) => ({ ...item })), submittedAt: new Date().toISOString() }];
  const previousDirtySections = [...(day.dirtySections || [])];
  day.dirtySections = previousDirtySections.filter((section) => section !== `routine:${activeRoutineGroup}`);
  recordSubmissionAction(activeDate, 'section', activeRoutineGroup, { part: previous, draft: draftBefore, dirtySections: previousDirtySections }, { part: day.parts[activeRoutineGroup], draft: day.draft, dirtySections: day.dirtySections }, draftBefore);
  saveData(); updateStatus(); updateSubmissionHistoryButtons(); renderRoutine(); toast(`${activeRoutineGroup} saved for ${activeDate}.`);
}

function submitCheckinPart() {
  const day = getDay(); day.parts ||= {};
  const draftBefore = JSON.parse(JSON.stringify(day.draft));
  const previous = day.parts.checkin; const history = Array.isArray(previous) ? previous : previous ? [previous] : [];
  day.parts.checkin = [...history, { entry: { energyLevel: draft().energyLevel, sleepQuality: draft().sleepQuality, symptoms: { ...draft().symptoms }, stoolEvents: JSON.parse(JSON.stringify(draft().stoolEvents)), notes: draft().notes, health: draft().health }, submittedAt: new Date().toISOString() }];
  const previousDirtySections = [...(day.dirtySections || [])];
  day.dirtySections = (day.dirtySections || []).filter((section) => section !== 'checkin');
  recordSubmissionAction(activeDate, 'section', 'checkin', { part: previous, draft: draftBefore, dirtySections: previousDirtySections }, { part: day.parts.checkin, draft: day.draft, dirtySections: day.dirtySections }, draftBefore);
  saveData(); updateStatus(); updateSubmissionHistoryButtons(); toast(`Check-in saved for ${activeDate}.`);
}

function renameRoutineItem(itemId) {
  const item = draft().routine.find((entry) => entry.id === itemId);
  if (!item) return;
  const nextName = prompt('Rename routine item:', item.name)?.trim().replace(/\s+/g, ' ');
  if (!nextName || nextName === item.name) return;
  data.routineOverrides ||= {};
  data.routineOverrides[itemId] = { ...(data.routineOverrides[itemId] || {}), name: nextName };
  item.name = nextName;
  saveData(); saveDraft(`routine:${item.group}`); renderRoutine();
}

function deleteRoutineItem(itemId) {
  const item = draft().routine.find((entry) => entry.id === itemId);
  if (!item || !confirm(`Delete “${item.name}” from the routine? Previously submitted records will remain unchanged.`)) return;
  if (itemId.startsWith('custom-')) data.customItems = (data.customItems || []).filter((entry) => entry.id !== itemId);
  else {
    data.deletedRoutineItems ||= [];
    if (!data.deletedRoutineItems.includes(itemId)) data.deletedRoutineItems.push(itemId);
  }
  draft().routine = draft().routine.filter((entry) => entry.id !== itemId);
  saveData(); saveDraft(`routine:${item.group}`); renderRoutine();
}

function renderSymptoms() {
  const el = document.getElementById('symptomList');
  el.innerHTML = allSymptoms().map((name) => {
    const key = name.toLowerCase(); const value = Number(draft().symptoms[key] ?? 0);
    return `<label class="range-field symptom-range-field"><span>${name}</span><input type="range" min="0" max="5" step="1" value="${value}" data-symptom="${key}" aria-label="${name}, severity 0 to 5"><output>${value}/5</output></label>`;
  }).join('');
  el.querySelectorAll('[data-symptom]').forEach((range) => range.addEventListener('input', () => {
    draft().symptoms[range.dataset.symptom] = Number(range.value); range.nextElementSibling.value = `${range.value}/5`; saveDraft('checkin');
  }));
  [['energyLevel', 'energyOutput'], ['sleepQuality', 'sleepOutput']].forEach(([id, outputId]) => {
    const control = document.getElementById(id); const value = draft()[id] === '' ? 0 : Number(draft()[id]);
    control.value = value; document.getElementById(outputId).value = `${value}/5`;
    control.oninput = () => { draft()[id] = Number(control.value); document.getElementById(outputId).value = `${control.value}/5`; saveDraft('checkin'); };
  });
}

function addCustomSymptom() {
  const name = prompt('What symptom would you like to track?');
  const cleanName = name?.trim().replace(/\s+/g, ' ');
  if (!cleanName) return;
  if (allSymptoms().some((symptom) => symptom.toLowerCase() === cleanName.toLowerCase())) { toast('That symptom is already in your list.'); return; }
  data.customSymptoms ||= [];
  data.customSymptoms.push(cleanName);
  draft().symptoms[cleanName.toLowerCase()] = 0;
  saveData(); saveDraft('checkin'); renderSymptoms();
}

function renderStoolEvents() {
  const events = draft().stoolEvents;
  const timeValue = (value) => {
    if (value === '' || value === null || value === undefined) return '';
    if (STOOL_TIMES.some(([key]) => key === value)) return value;
    const hour = Number(String(value || '').slice(0, 2));
    if (!Number.isFinite(hour)) return '';
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'midday';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 23) return 'evening';
    return 'overnight';
  };
  const dropdown = (id, field, prompt, accessibleLabel, selected, options) => {
    const current = options.find(([value]) => String(value) === String(selected));
    const display = current?.[1] || prompt;
    return `<div class="stool-picker"><button class="stool-picker-trigger" type="button" data-stool-picker="${field}" data-event-id="${escapeHtml(id)}" aria-label="${accessibleLabel}" aria-haspopup="listbox" aria-expanded="false">${escapeHtml(display)}<span aria-hidden="true">⌄</span></button><div class="stool-picker-menu" role="listbox" aria-label="${accessibleLabel}" ${field === 'time' ? 'data-picker-kind="time"' : 'data-picker-kind="form"'} hidden>${options.map(([value, text]) => `<button type="button" class="stool-picker-option ${String(value) === String(selected) ? 'selected' : ''}" role="option" aria-selected="${String(value) === String(selected)}" data-stool-option="${escapeHtml(value)}" data-event-id="${escapeHtml(id)}" data-field="${field}">${escapeHtml(text)}</button>`).join('')}</div></div>`;
  };
  document.getElementById('stoolEvents').innerHTML = events.length ? events.map((event, index) => `<div class="stool-event"><span class="stool-index">${index + 1}</span>${dropdown(event.id, 'time', 'Time', `Bowel movement ${index + 1} time`, timeValue(event.time), STOOL_TIMES)}${dropdown(event.id, 'form', 'Stool form', `Bowel movement ${index + 1} stool form`, event.form, STOOL_FORMS.map((text, i) => [String(i + 1), text]))}<button class="text-button" type="button" data-remove-stool="${event.id}" aria-label="Remove bowel movement ${index + 1}">×</button></div>`).join('') : '<div class="empty-state">No stool events recorded.</div>';
  const container = document.getElementById('stoolEvents');
  container.onclick = (event) => {
    const trigger = event.target.closest('[data-stool-picker]');
    const option = event.target.closest('[data-stool-option]');
    const remove = event.target.closest('[data-remove-stool]');
    if (option) {
      const stoolEvent = events.find((item) => item.id === option.dataset.eventId);
      if (stoolEvent) stoolEvent[option.dataset.field] = option.dataset.stoolOption;
      saveDraft('checkin'); renderStoolEvents(); return;
    }
    if (trigger) {
      const menu = trigger.nextElementSibling;
      container.querySelectorAll('.stool-picker-menu').forEach((other) => { if (other !== menu) other.hidden = true; });
      const open = menu.hidden;
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', String(open));
      return;
    }
    if (remove) { draft().stoolEvents = events.filter((item) => item.id !== remove.dataset.removeStool); saveDraft('checkin'); renderStoolEvents(); return; }
    container.querySelectorAll('.stool-picker-menu').forEach((menu) => { menu.hidden = true; menu.previousElementSibling.setAttribute('aria-expanded', 'false'); });
  };
  container.onkeydown = (event) => {
    if (event.key === 'Escape') {
      const menu = event.target.closest('.stool-picker-menu');
      if (menu) { menu.hidden = true; menu.previousElementSibling.setAttribute('aria-expanded', 'false'); menu.previousElementSibling.focus(); }
    }
  };
}

document.addEventListener('click', (event) => {
  if (event.target.closest('#stoolEvents')) return;
  document.querySelectorAll('#stoolEvents .stool-picker-menu:not([hidden])').forEach((menu) => {
    menu.hidden = true;
    menu.previousElementSibling.setAttribute('aria-expanded', 'false');
  });
});

function bindDraftFields() {
  const values = { dailyNotes: draft().notes };
  Object.entries(values).forEach(([id, value]) => { document.getElementById(id).value = value ?? ''; });
  [['dailyNotes', 'notes']].forEach(([id, key]) => {
    const input = document.getElementById(id);
    input.oninput = input.onchange = () => { draft()[key] = input.value; saveDraft('checkin'); };
  });
}

function applyQuickUpdate() {
  const input = document.getElementById('quickUpdate');
  const message = input.value.trim();
  const statusEl = document.getElementById('quickUpdateStatus');
  if (!message) { pendingQuickUpdate = null; pendingQuickOverrides = null; document.getElementById('quickUpdateReview').hidden = true; return; }
  const current = draft();
  const { changes } = interpretQuickUpdate(message, {
    items: current.routine, groups: routineGroups(), symptoms: allSymptoms(), stoolForms: STOOL_FORMS,
    current: { energy: current.energyLevel, sleep: current.sleepQuality, symptoms: current.symptoms }
  });
  const next = JSON.parse(JSON.stringify(current));
  const overrides = { ...data.doseOverrides };
  const report = [];
  changes.forEach((change) => {
    if (change.type === 'energy') next.energyLevel = change.value;
    else if (change.type === 'sleep') next.sleepQuality = change.value;
    else if (change.type === 'symptom') next.symptoms[change.key] = change.value;
    else if (change.type === 'routine') { const item = next.routine.find((entry) => entry.id === change.id); if (item) item.enabled = change.enabled; }
    else if (change.type === 'routine-group') next.routine.forEach((item) => { if (change.ids.includes(item.id)) item.enabled = change.enabled; });
    else if (change.type === 'dose') { const item = next.routine.find((entry) => entry.id === change.id); if (item) { item.dose = change.dose; overrides[item.id] = change.dose; } }
    else if (change.type === 'stool') {
      change.events.forEach((event) => {
        const slot = next.stoolEvents.find((entry) => !entry.time && !entry.form);
        if (slot) { slot.time = event.time; slot.form = event.form; }
        else next.stoolEvents.push({ id: uniqueId('stool'), time: event.time, form: event.form });
      });
    }
    if (!change.noop) report.push(change.label + (change.estimated ? ' (level not stated, set to 3)' : ''));
  });
  next.notes = `${next.notes}${next.notes ? '\n' : ''}${message}`;
  pendingQuickUpdate = next;
  pendingQuickOverrides = overrides;
  document.getElementById('quickUpdateReview').hidden = false;
  statusEl.textContent = report.length ? `Will change: ${report.join(' · ')}. The message is also saved to notes.` : changes.length ? 'Everything mentioned already matches. The message will be added to notes.' : 'No routine, check-in or symptom changes recognized. The message will be added to notes. Try e.g. "took selenium and vitamin D, energy 4, mild tremor, 2 bowel movements".';
}

function confirmQuickUpdate() {
  if (!pendingQuickUpdate) return;
  const day = getDay();
  const changedGroups = new Set(pendingQuickUpdate.routine.filter((item) => {
    const previous = day.draft.routine.find((entry) => entry.id === item.id);
    return previous && (previous.enabled !== item.enabled || previous.dose !== item.dose);
  }).map((item) => item.group));
  day.draft = pendingQuickUpdate;
  data.doseOverrides = pendingQuickOverrides || data.doseOverrides;
  changedGroups.forEach((group) => saveDraft(`routine:${group}`));
  saveDraft('checkin');
  pendingQuickUpdate = null; pendingQuickOverrides = null;
  document.getElementById('quickUpdateReview').hidden = true;
  document.getElementById('quickUpdate').value = '';
  bindDraftFields(); renderSymptoms(); renderRoutine(); renderStoolEvents(); renderHealthSummary(); saveData();
  toast('Update applied to this session. Submit this section or day to save it.');
}

function cancelQuickUpdate() {
  pendingQuickUpdate = null; pendingQuickOverrides = null;
  document.getElementById('quickUpdateReview').hidden = true;
  document.getElementById('quickUpdate').value = '';
}

function dateKey(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseAppleHealthXml(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('This does not look like an Apple Health XML export.');
  const summaries = {};
  const bucket = (key) => summaries[key] || (summaries[key] = { heartRates: [], steps: 0, sleepIntervals: [], exerciseMinutes: 0, workouts: 0 });
  xml.querySelectorAll('Record').forEach((record) => {
    const key = dateKey(record.getAttribute('startDate'));
    if (!key) return;
    const type = record.getAttribute('type') || ''; const value = Number(record.getAttribute('value'));
    if (type === 'HKQuantityTypeIdentifierHeartRate' && Number.isFinite(value)) bucket(key).heartRates.push(value);
    else if (type === 'HKQuantityTypeIdentifierStepCount' && Number.isFinite(value)) bucket(key).steps += value;
    else if (type === 'HKCategoryTypeIdentifierSleepAnalysis' && /Asleep(Core|Deep|REM|Unspecified)/.test(record.getAttribute('value') || '')) {
      const start = new Date(record.getAttribute('startDate')).getTime(); const end = new Date(record.getAttribute('endDate')).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) bucket(key).sleepIntervals.push([start, end]);
    }
  });
  xml.querySelectorAll('Workout').forEach((workout) => {
    const key = dateKey(workout.getAttribute('startDate')); const duration = Number(workout.getAttribute('duration'));
    const unit = (workout.getAttribute('durationUnit') || 'min').toLowerCase();
    const minutes = /sec/.test(unit) ? duration / 60 : /hour/.test(unit) ? duration * 60 : duration;
    if (key && Number.isFinite(minutes)) { bucket(key).exerciseMinutes += minutes; bucket(key).workouts += 1; }
  });
  Object.values(summaries).forEach((summary) => {
    summary.averageHeartRate = summary.heartRates.length ? summary.heartRates.reduce((sum, value) => sum + value, 0) / summary.heartRates.length : null;
    summary.sleepIntervals.sort((a, b) => a[0] - b[0]);
    let intervalStart = null, intervalEnd = null, totalMilliseconds = 0;
    summary.sleepIntervals.forEach(([start, end]) => { if (intervalStart === null) { intervalStart = start; intervalEnd = end; } else if (start <= intervalEnd) intervalEnd = Math.max(intervalEnd, end); else { totalMilliseconds += intervalEnd - intervalStart; intervalStart = start; intervalEnd = end; } });
    if (intervalStart !== null) totalMilliseconds += intervalEnd - intervalStart;
    summary.sleepMinutes = totalMilliseconds / 60000;
    delete summary.heartRates; delete summary.sleepIntervals;
  });
  return summaries;
}

function renderHealthSummary() {
  const dataForDay = draft().health || data.healthByDate?.[activeDate];
  const container = document.getElementById('healthDaySummary');
  if (!container) return;
  if (!dataForDay) { container.innerHTML = ''; return; }
  draft().health = dataForDay;
  container.innerHTML = `<span>${dataForDay.sleepMinutes ? `${(dataForDay.sleepMinutes / 60).toFixed(1)} h sleep` : 'Sleep not found'}</span><span>${dataForDay.averageHeartRate ? `${Math.round(dataForDay.averageHeartRate)} bpm average` : 'Heart rate not found'}</span><span>${dataForDay.steps ? `${Math.round(dataForDay.steps).toLocaleString()} steps` : ''}</span><span>${dataForDay.exerciseMinutes ? `${Math.round(dataForDay.exerciseMinutes)} exercise min · ${dataForDay.workouts} workouts` : ''}</span>`;
}

function importAppleHealth(file) {
  if (!file) return;
  const status = document.getElementById('healthImportStatus');
  status.textContent = 'Reading Apple Health export on this device…';
  const reader = new FileReader();
  reader.onerror = () => { status.textContent = 'Unable to read file on this device.'; };
  reader.onload = () => {
    try {
      const imported = parseAppleHealthXml(String(reader.result));
      data.healthByDate = { ...(data.healthByDate || {}), ...imported };
      let updatedSubmitted = 0;
      Object.entries(imported).forEach(([date, summary]) => {
        if (data.days[date]?.submitted) { data.days[date].submitted.health = summary; updatedSubmitted += 1; }
        const checkinParts = data.days[date]?.parts?.checkin;
        if (Array.isArray(checkinParts)) checkinParts.forEach((part) => { if (part.entry) part.entry.health = summary; });
        else if (checkinParts?.entry) checkinParts.entry.health = summary;
      });
      if (imported[activeDate]) draft().health = imported[activeDate];
      saveData(); renderHealthSummary();
      status.textContent = `Imported ${Object.keys(imported).length} dates locally; updated ${updatedSubmitted} submitted dates in analysis.`;
    } catch (error) { status.textContent = error.message; }
  };
  reader.readAsText(file);
}

function saveDraft(section = 'checkin') { const day = getDay(); if ((day.submissionCursor ?? day.submissionActions?.length ?? 0) < (day.submissionActions?.length || 0)) { day.submissionActions = day.submissionActions.slice(0, day.submissionCursor); } day.draft = draft(); day.dirtySections ||= []; if (!day.dirtySections.includes(section)) day.dirtySections.push(section); day.dirty = true; updateStatus(); updateSubmissionHistoryButtons(); }
function updateStatus() {
  const day = getDay();
  const dirty = day.dirtySections?.length;
  const partCount = Object.keys(day.parts || {}).length;
  document.getElementById('submissionStatus').textContent = dirty ? `${day.dirtySections.length} section${dirty === 1 ? '' : 's'} not submitted` : day.submitted ? 'Submitted' : partCount ? `${partCount} part${partCount === 1 ? '' : 's'} saved · day open` : activeDate === today() ? 'Today is not submitted' : 'No submission for this date';
  document.getElementById('submissionStatus').classList.toggle('submitted', Boolean(day.submitted && !dirty));
}
function formatCalendarDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}
function renderDatePicker() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1, 12);
  const start = new Date(year, month, 1 - firstDay.getDay(), 12);
  document.getElementById('calendarMonthLabel').textContent = firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  document.getElementById('datePickerGrid').innerHTML = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const submitted = Boolean(data.days[key]?.submitted);
    const classes = ['date-picker-day', date.getMonth() !== month ? 'outside-month' : '', key === today() ? 'is-today' : '', key === activeDate ? 'is-selected' : '', submitted ? 'is-submitted' : ''].filter(Boolean).join(' ');
    const label = `${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}${submitted ? ', submitted' : ''}`;
    return `<button class="${classes}" type="button" data-calendar-date="${key}" aria-label="${label}" aria-pressed="${key === activeDate}">${date.getDate()}</button>`;
  }).join('');
}
function openDatePicker() {
  calendarMonth = new Date(`${activeDate}T12:00:00`);
  renderDatePicker();
  document.getElementById('datePickerDialog').showModal();
  document.getElementById('entryDate').setAttribute('aria-expanded', 'true');
}
function setDate(date) {
  if (pendingQuickUpdate) cancelQuickUpdate();
  saveData();
  if (!routineGroups().includes(activeRoutineGroup)) activeRoutineGroup = routineGroups()[0];
  activeDate = date || today();
  getDay();
  if (data.healthByDate?.[activeDate]) draft().health = data.healthByDate[activeDate];
  document.getElementById('entryDate').textContent = formatCalendarDate(activeDate);
  document.getElementById('quickUpdate').value = '';
  document.getElementById('quickUpdateStatus').textContent = 'Interpreted on this device. Review the updated fields before Submit.';
  bindDraftFields(); renderRoutine(); renderSymptoms(); renderStoolEvents(); renderHealthSummary(); updateStatus(); updateSubmissionHistoryButtons();
}

function submitDay() {
  const day = getDay();
  const before = { submitted: JSON.parse(JSON.stringify(day.submitted ?? null)), draft: JSON.parse(JSON.stringify(day.draft)), dirtySections: [...(day.dirtySections || [])], submissionHistory: JSON.parse(JSON.stringify(day.submissionHistory || [])) };
  day.submissionHistory ||= [];
  if (day.submitted) day.submissionHistory.push(day.submitted);
  day.submitted = { ...JSON.parse(JSON.stringify(day.draft)), submittedAt: new Date().toISOString() };
  day.dirtySections = []; day.dirty = false;
  recordSubmissionAction(activeDate, 'day', '', before, { submitted: JSON.parse(JSON.stringify(day.submitted)), draft: JSON.parse(JSON.stringify(day.draft)), dirtySections: [], submissionHistory: JSON.parse(JSON.stringify(day.submissionHistory || [])) }, before.draft);
  saveData(); updateStatus(); updateSubmissionHistoryButtons(); renderMomentum(); renderLocalCorrelations(); toast('Day submitted. It now counts in your record.');
  openChallenge();
}

function addItem() {
  const name = prompt(`Add item to ${activeRoutineGroup}:`);
  const cleanName = name?.trim().replace(/\s+/g, ' ');
  if (!cleanName) return;
  const dose = prompt('Dose or amount (optional):', '')?.trim() || 'Not specified';
  const item = { id: uniqueId('custom'), name: cleanName, dose, group: activeRoutineGroup, source: 'Personal item', enabled: false };
  data.customItems ||= [];
  data.customItems.push(item); draft().routine.push({ ...item });
  saveData(); saveDraft(`routine:${activeRoutineGroup}`); renderRoutine();
}

function groupLabs() {
  const grouped = new Map();
  data.labs.forEach((lab) => { const key = markerReferenceKey(lab.marker); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(lab); });
  const order = new Map();
  labCategories().forEach((category, categoryIndex) => category.markers.forEach((marker, markerIndex) => order.set(markerReferenceKey(marker), [categoryIndex, markerIndex])));
  return [...grouped.entries()].sort(([firstKey], [secondKey]) => {
    const first = order.get(firstKey) || [Number.MAX_SAFE_INTEGER, 0];
    const second = order.get(secondKey) || [Number.MAX_SAFE_INTEGER, 0];
    return first[0] - second[0] || first[1] - second[1] || firstKey.localeCompare(secondKey);
  }).map(([, entries]) => entries.sort((a, b) => a.date.localeCompare(b.date)).map((lab) => ({ ...lab, marker: canonicalUserLabMarker(lab.marker) })));
}

function canonicalUserLabMarker(marker) {
  const rawKey = labMarkerIdentity(marker);
  const alias = data.labMarkerAliases?.[rawKey] || Object.values(data.labMarkerAliases || {}).find((item) => labMarkerIdentity(item.name) === rawKey);
  if (alias) return alias.name;
  const canonical = canonicalLabMarker(marker);
  return data.labMarkerAliases?.[labMarkerIdentity(canonical)]?.name || canonical;
}

function markerReferenceKey(marker) {
  const rawKey = labMarkerIdentity(marker);
  const aliasEntry = Object.entries(data.labMarkerAliases || {}).find(([key, item]) => key === rawKey || labMarkerIdentity(item.name) === rawKey);
  if (aliasEntry) return aliasEntry[1].key || aliasEntry[0];
  const canonicalKey = labMarkerIdentity(canonicalLabMarker(marker));
  return data.labMarkerAliases?.[canonicalKey] ? canonicalKey : canonicalKey;
}

function baseCatalogMarker(marker) {
  const canonical = canonicalLabMarker(marker);
  if (catalogMarkerDefinition(canonical)) return canonical;
  const key = markerReferenceKey(marker);
  return DEFAULT_LAB_CATEGORIES.flatMap((category) => category.markers).find((item) => labMarkerIdentity(item.name) === key)?.name || marker;
}

function numericReference(reference) {
  const text = String(reference || '').replace(/,/g, '.').trim();
  const titer = text.match(/([<>≤≥]?\s*\d+(?:\.\d+)?\s*:\s*\d+)/);
  if (titer) return titer[1].replace(/\s+/g, '');
  const range = text.match(/([<>≤≥]?\s*-?\d+(?:\.\d+)?)\s*(?:–|—|-|\bto\b)\s*([<>≤≥]?\s*-?\d+(?:\.\d+)?)/i);
  if (range) return `${range[1].replace(/\s+/g, '')}–${range[2].replace(/\s+/g, '')}`;
  const threshold = text.match(/(?:^|\s)([<>≤≥]\s*-?\d+(?:\.\d+)?)(?:\s|$)/);
  if (threshold) return threshold[1].replace(/\s+/g, '');
  const single = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*$/);
  return single ? single[1] : '';
}

function standardizeAppLabResult(row) {
  const displayName = row.marker;
  const key = markerReferenceKey(displayName);
  const converted = standardizeLabResult({ ...row, marker: baseCatalogMarker(displayName) });
  const preferredUnits = data.labUnits?.[key];
  if (preferredUnits && preferredUnits !== converted.units) convertAppResultUnits(converted, preferredUnits);
  converted.marker = displayName;
  Object.assign(row, converted);
  return row;
}

function convertAppResultUnits(row, targetUnits) {
  const baseMarker = baseCatalogMarker(row.marker);
  const sourceUnits = row.units;
  const sourceConversion = labUnitConversion(baseMarker, sourceUnits);
  const targetConversion = labUnitConversion(baseMarker, targetUnits);
  if (!sourceConversion || !targetConversion || targetUnits === sourceUnits) return row;
  const standardValue = Number(row.value) * sourceConversion.factor + sourceConversion.offset;
  row.value = Number(((standardValue - targetConversion.offset) / targetConversion.factor).toPrecision(7));
  const inverseFactor = 1 / targetConversion.factor;
  const inverseOffset = -targetConversion.offset / targetConversion.factor;
  row.reference = convertReferenceForDisplay(row.reference, inverseFactor, inverseOffset, sourceConversion.units, targetUnits);
  row.units = targetUnits;
  return row;
}

function convertReferenceForDisplay(reference, factor, offset, sourceUnits, targetUnits) {
  const range = String(reference || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)(.*)$/);
  if (!range) return reference;
  const low = Number(range[1]) * factor + offset;
  const high = Number(range[2]) * factor + offset;
  const suffix = range[3].trim().toLowerCase().replace(/[μµ]/g, 'u').replace(/\s+/g, '') === String(sourceUnits).toLowerCase().replace(/[μµ]/g, 'u').replace(/\s+/g, '') ? ` ${targetUnits}` : range[3];
  return `${Math.min(low, high).toFixed(2)}–${Math.max(low, high).toFixed(2)}${suffix}`;
}

function migrateStoredLabUnits() {
  const counts = new Map();
  data.labs.forEach((lab) => {
    if (!lab.units) return;
    const key = markerReferenceKey(lab.marker);
    const unitCounts = counts.get(key) || new Map();
    unitCounts.set(lab.units, (unitCounts.get(lab.units) || 0) + 1);
    counts.set(key, unitCounts);
  });
  const commonUnits = new Map([...counts].map(([key, unitCounts]) => [key, [...unitCounts].sort((first, second) => second[1] - first[1])[0][0]]));
  data.labs.forEach((lab) => Object.assign(lab, standardizeAppLabResult(lab)));
  commonUnits.forEach((units, key) => {
    const lab = data.labs.find((item) => markerReferenceKey(item.marker) === key);
    if (!lab) return;
    const conversion = labUnitConversion(baseCatalogMarker(lab.marker), units);
    if (!conversion || (conversion.factor === 1 && conversion.offset === 0)) return;
    if (data.labReferences[key]) {
      const referenceProbe = standardizeAppLabResult({ marker: lab.marker, units, value: 0, reference: data.labReferences[key] });
      data.labReferences[key] = referenceProbe.reference;
    }
    const range = data.desiredRanges?.[key];
    if (!range) return;
    ['low', 'high'].forEach((bound) => {
      if (range[bound] === undefined || range[bound] === '') return;
      const probe = standardizeAppLabResult({ marker: lab.marker, units, value: range[bound], reference: '' });
      range[bound] = probe.value;
    });
  });
}

function labCategories() { return data.labCategories ||= defaultLabCategories(); }
function categoryMarker(category, markerName) { return category.markers.find((name) => markerReferenceKey(name) === markerReferenceKey(markerName)); }

function ensureCatalogMarker(markerName, categoryHint = activeLabCategory) {
  const name = canonicalUserLabMarker(markerName);
  if (data.hiddenLabMarkers?.[markerReferenceKey(name)]) return name;
  const categories = labCategories();
  const matches = categories.filter((category) => categoryMarker(category, name));
  const preferred = catalogCategoryForMarker(name);
  const category = categories.find((item) => item.name === preferred) || matches[0] || categories.find((item) => item.name === categoryHint) || categories[0];
  if (category) {
    categories.filter((item) => item !== category).forEach((item) => { item.markers = item.markers.filter((marker) => markerReferenceKey(marker) !== markerReferenceKey(name)); });
    if (!categoryMarker(category, name)) category.markers.push(name);
  }
  return name;
}

function renderLabCatalog() {
  const categories = labCategories();
  if (!categories.some((category) => category.name === activeLabCategory)) activeLabCategory = categories[0]?.name || '';
  document.getElementById('markerOptions').innerHTML = categories.flatMap((category) => category.markers).map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
  const container = document.getElementById('labCategoryTabs');
  container.innerHTML = `${categories.map((category) => `<button class="lab-category-tab ${category.name === activeLabCategory ? 'active' : ''}" type="button" role="tab" aria-selected="${category.name === activeLabCategory}" data-lab-category="${escapeHtml(category.name)}">${escapeHtml(category.name)}</button>`).join('')}<button class="lab-category-command" type="button" data-add-lab-category>＋ Add category</button><button class="lab-category-command" type="button" data-add-lab-marker>＋ Add biomarker</button>`;
  let held = null;
  const cancelHold = () => clearTimeout(labCategoryHoldTimer);
  const arm = () => {
    held.armed = true;
    held.slots = [...container.querySelectorAll('[data-lab-category]')].map((tab) => { const box = tab.getBoundingClientRect(); return { tab, left: box.left, top: box.top, cx: box.left + box.width / 2, cy: box.top + box.height / 2 }; });
    held.button.classList.add('dragging');
  };
  container.querySelectorAll('[data-lab-category]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => {
      cancelHold();
      held = { button, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, armed: false, moved: false, target: -1 };
      labCategoryHoldTimer = setTimeout(() => { if (held) arm(); }, 250);
    });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (suppressLabCategoryClick) return;
      const name = button.dataset.labCategory;
      const now = Date.now();
      if (lastLabCategoryTap.name === name && now - lastLabCategoryTap.time < 400) { lastLabCategoryTap = { name: '', time: 0 }; openLabCategoryMenu(name); return; }
      lastLabCategoryTap = { name, time: now };
      if (activeLabCategory !== name) { activeLabCategory = name; labMarkerMenu = { key: '', moving: false }; renderLabs(); }
    });
  });
  container.querySelector('[data-add-lab-category]').addEventListener('click', addLabCategory);
  container.querySelector('[data-add-lab-marker]').addEventListener('click', addLabCatalogMarkerPrompt);
  container.onpointermove = (event) => {
    if (!held) return;
    if (!held.armed) {
      if (Math.hypot(event.clientX - held.startX, event.clientY - held.startY) > 8) { cancelHold(); if (event.pointerType === 'mouse') arm(); else { held = null; return; } } else return;
    }
    if (!held.captured) { container.setPointerCapture(held.pointerId); held.captured = true; }
    const dx = event.clientX - held.startX, dy = event.clientY - held.startY;
    held.moved ||= Math.hypot(dx, dy) > 6;
    held.button.style.transform = `translate(${dx}px, ${dy}px) scale(1.04)`;
    const origin = held.slots.find((slot) => slot.tab === held.button);
    const x = origin.cx + dx, y = origin.cy + dy;
    held.target = held.slots.reduce((best, slot, index) => Math.hypot(slot.cx - x, slot.cy - y) < best.distance ? { index, distance: Math.hypot(slot.cx - x, slot.cy - y) } : best, { index: 0, distance: Infinity }).index;
  };
  container.ontouchmove = (event) => { if (held?.armed && event.cancelable) event.preventDefault(); };
  const finish = (event) => {
    cancelHold();
    if (!held) return;
    const { button, armed, moved, slots, target } = held;
    held = null;
    if (!armed) return;
    suppressLabCategoryClick = true;
    setTimeout(() => { suppressLabCategoryClick = false; }, 0);
    if (event.type !== 'pointercancel' && moved && target >= 0) {
      const names = slots.map((slot) => slot.tab.dataset.labCategory);
      const sourceIndex = names.indexOf(button.dataset.labCategory);
      names.splice(sourceIndex, 1);
      names.splice(target, 0, button.dataset.labCategory);
      const byName = new Map(labCategories().map((category) => [category.name, category]));
      data.labCategories = names.map((name) => byName.get(name));
      saveData(); renderLabs();
    }
  };
  container.onpointerup = finish;
  container.onpointercancel = finish;
}

function addLabCategory() {
  const name = prompt('Name this biomarker category:')?.trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (labCategories().some((category) => category.name.toLowerCase() === name.toLowerCase())) { toast('A category with that name already exists.'); return; }
  data.labCategories.push({ name, markers: [] });
  activeLabCategory = name;
  saveData(); renderLabs();
}

function addLabCatalogMarkerPrompt() {
  const name = prompt(`Add a biomarker to ${activeLabCategory}:`)?.trim().replace(/\s+/g, ' ');
  if (!name) return;
  const category = labCategories().find((item) => item.name === activeLabCategory);
  if (!category) return;
  if (labCategories().some((item) => item.markers.some((marker) => markerReferenceKey(marker) === markerReferenceKey(name)))) { toast('That biomarker is already in the catalog.'); return; }
  delete data.hiddenLabMarkers[markerReferenceKey(name)];
  category.markers.push(canonicalUserLabMarker(canonicalLabMarker(name)));
  saveData(); renderLabs();
}

function migrateExistingLabCatalog() {
  let changed = normalizeLabCategoryMarkers();
  data.labs.forEach((lab) => {
    const marker = canonicalUserLabMarker(lab.marker);
    if (marker !== lab.marker) { lab.marker = marker; changed = true; }
    const categoryCount = labCategories().filter((category) => categoryMarker(category, marker)).length;
    const preferredCategory = catalogCategoryForMarker(marker);
    if (preferredCategory && (categoryCount !== 1 || !labCategories().some((category) => category.name === preferredCategory && categoryMarker(category, marker)))) {
      ensureCatalogMarker(marker);
      changed = true;
    }
    const key = markerReferenceKey(marker);
    if (data.hiddenLabMarkers[key]) return;
    if (!labCategories().some((category) => category.markers.some((name) => markerReferenceKey(name) === key))) {
      ensureCatalogMarker(marker);
      changed = true;
    }
  });
  if (changed) saveData();
}

function normalizeLabCategoryMarkers() {
  const categories = labCategories();
  const normalized = categories.map((category) => ({ ...category, markers: [] }));
  const owners = new Set();
  categories.forEach((category, categoryIndex) => {
    category.markers.forEach((marker) => {
      const name = canonicalUserLabMarker(canonicalLabMarker(marker));
      const key = markerReferenceKey(name);
      if (!key || owners.has(key)) return;
      owners.add(key);
      const preferred = catalogCategoryForMarker(name);
      const target = normalized.find((item) => item.name === preferred) || normalized[categoryIndex];
      target.markers.push(name);
    });
  });
  const changed = normalized.some((category, index) => JSON.stringify(category.markers) !== JSON.stringify(categories[index].markers));
  if (changed) data.labCategories = normalized;
  return changed;
}

function openLabCategoryMenu(name) {
  labCategoryToManage = name;
  activeLabCategory = name;
  document.getElementById('labCategoryMenuTitle').textContent = name;
  document.getElementById('deleteLabCategory').disabled = labCategories().length <= 1;
  document.getElementById('labCategoryMenu').showModal();
}

function handleLabMatrixEdit(event) {
  const button = event.currentTarget;
  const action = button.dataset;
  if (action.editLabMarker) {
    const key = action.editLabMarker;
    labMarkerMenu = labMarkerMenu.key === key ? { key: '', moving: false } : { key, moving: false };
    renderLabs();
    return;
  }
  if (action.moveLabMarker) {
    labMarkerMenu.moving = !labMarkerMenu.moving;
    renderLabs();
    return;
  }
  if (action.mergeLabMarkerStart) {
    labMarkerMenu.merging = !labMarkerMenu.merging;
    renderLabs();
    return;
  }
  if (action.mergeLabMarkerConfirm) {
    const select = document.querySelector(`[data-merge-lab-marker-to="${CSS.escape(action.mergeLabMarkerConfirm)}"]`);
    if (!select?.value) { toast('Choose the biomarker to keep.'); return; }
    if (mergeLabMarkers(action.mergeLabMarkerConfirm, select.value)) toast('Results merged into the selected biomarker.');
    return;
  }
  if (action.editLabUnits || action.editLabReference) {
    const key = action.editLabUnits || action.editLabReference;
    const marker = labCategories().flatMap((category) => category.markers).find((name) => markerReferenceKey(name) === key);
    if (!marker) return;
    if (action.editLabUnits) {
      const current = data.labUnits?.[key] || catalogMarkerDefinition(baseCatalogMarker(marker))?.units || '';
      const units = prompt(`Units for ${marker}:`, current)?.trim();
      if (units === undefined) return;
      saveMarkerUnits(marker, units);
    } else {
      const current = numericReference(markerReference(marker) || catalogMarkerDefinition(baseCatalogMarker(marker))?.reference);
      const reference = prompt(`Numeric reference interval for ${marker}:`, current)?.trim();
      if (reference === undefined) return;
      saveMarkerReference(marker, reference);
    }
    labMarkerMenu = { key: '', moving: false };
    renderLabs();
    return;
  }
  const key = action.renameLabMarker || action.deleteLabMarker;
  const category = labCategories().find((item) => item.name === activeLabCategory);
  const oldName = category?.markers.find((name) => markerReferenceKey(name) === key);
  if (!oldName) return;
  if (action.renameLabMarker) {
    const newName = prompt('Rename biomarker:', oldName)?.trim().replace(/\s+/g, ' ');
    if (!newName || newName === oldName) return;
    if (labCategories().some((item) => item.markers.some((name) => markerReferenceKey(name) !== key && markerReferenceKey(name) === markerReferenceKey(newName)))) { toast('That biomarker is already in the catalog.'); return; }
    data.labMarkerAliases[key] = { name: newName, key };
    category.markers = category.markers.map((name) => markerReferenceKey(name) === key ? newName : name);
    data.labs.forEach((lab) => { if (markerReferenceKey(lab.marker) === key) lab.marker = newName; });
    labMarkerMenu = { key: '', moving: false };
    saveData(); renderLabs(); renderLocalCorrelations();
    return;
  }
  if (action.deleteLabMarker) {
    if (!confirm(`Delete “${oldName}” from this category? Existing results will remain saved.`)) return;
    data.hiddenLabMarkers[key] = true;
    category.markers = category.markers.filter((name) => markerReferenceKey(name) !== key);
    labMarkerMenu = { key: '', moving: false };
    saveData(); renderLabs();
  }
}

function handleLabMarkerMove(event) {
  const select = event.currentTarget;
  const key = select.dataset.moveLabMarkerTo;
  const destination = labCategories().find((category) => category.name === select.value);
  const source = labCategories().find((category) => category.name === activeLabCategory);
  const name = source?.markers.find((marker) => markerReferenceKey(marker) === key);
  if (!source || !destination || !name) return;
  if (!destination.markers.some((marker) => markerReferenceKey(marker) === key)) destination.markers.push(name);
  source.markers = source.markers.filter((marker) => markerReferenceKey(marker) !== key);
  labMarkerMenu = { key: '', moving: false };
  saveData(); renderLabs();
}

function removeLabDateFromCategory(event) {
  const date = event.currentTarget.dataset.removeLabDate;
  const category = labCategories().find((item) => item.name === activeLabCategory);
  const markerKeys = new Set((category?.markers || []).map((marker) => markerReferenceKey(marker)));
  const matching = data.labs.filter((lab) => lab.date === date && markerKeys.has(markerReferenceKey(lab.marker)));
  if (!matching.length || !confirm(`Delete ${matching.length} lab result${matching.length === 1 ? '' : 's'} dated ${date} from ${activeLabCategory}? Other categories will be unchanged.`)) return;
  const removedIds = new Set(matching.map((lab) => lab.id));
  data.labs = data.labs.filter((lab) => !removedIds.has(lab.id));
  saveData(); renderLabs(); renderLocalCorrelations();
}

function renameLabCategory() {
  const category = labCategories().find((item) => item.name === labCategoryToManage);
  if (!category) return;
  const name = prompt('Rename this biomarker category:', category.name)?.trim().replace(/\s+/g, ' ');
  if (!name || name === category.name) return;
  if (labCategories().some((item) => item !== category && item.name.toLowerCase() === name.toLowerCase())) { toast('A category with that name already exists.'); return; }
  category.name = name; activeLabCategory = name; document.getElementById('labCategoryMenu').close(); saveData(); renderLabs();
}

function deleteLabCategory() {
  const categories = labCategories();
  if (categories.length <= 1) { toast('Keep at least one biomarker category.'); return; }
  const category = categories.find((item) => item.name === labCategoryToManage);
  const destination = categories.find((item) => item !== category);
  if (!category || !confirm(`Delete “${category.name}”? Its biomarkers will move to “${destination.name}”; existing results will be kept.`)) return;
  destination.markers.push(...category.markers.filter((name) => !destination.markers.some((existing) => markerReferenceKey(existing) === markerReferenceKey(name))));
  data.labCategories = categories.filter((item) => item !== category);
  activeLabCategory = destination.name; document.getElementById('labCategoryMenu').close(); saveData(); renderLabs();
}

function moveLabCategory(direction) {
  const categories = labCategories();
  const index = categories.findIndex((category) => category.name === activeLabCategory);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= categories.length) return;
  [categories[index], categories[next]] = [categories[next], categories[index]];
  saveData(); renderLabs();
}

function addLabCatalogMarker(event) {
  event.preventDefault();
  const input = document.getElementById('newLabMarker');
  const name = input.value.trim().replace(/\s+/g, ' ');
  const category = labCategories().find((item) => item.name === activeLabCategory);
  if (!name || !category) return;
  if (labCategories().some((item) => item.markers.some((existing) => markerReferenceKey(existing) === markerReferenceKey(name)))) { toast('That biomarker is already in the catalog.'); return; }
  delete data.hiddenLabMarkers[markerReferenceKey(name)];
  category.markers.push(canonicalUserLabMarker(name));
  input.value = ''; saveData(); renderLabs();
}

function handleLabCatalogClick(event) {
  const tab = event.target.closest('[data-lab-category]');
  if (tab) { activeLabCategory = tab.dataset.labCategory; renderLabCatalog(); return; }
  const rename = event.target.closest('[data-rename-lab-marker]');
  if (rename) {
    const key = rename.dataset.renameLabMarker;
    const current = data.labs.find((lab) => markerReferenceKey(lab.marker) === key)?.marker || labCategories().flatMap((category) => category.markers).find((name) => markerReferenceKey(name) === key);
    const name = prompt('Rename biomarker:', current)?.trim().replace(/\s+/g, ' ');
    if (!name || name === current) return;
    if (labCategories().some((category) => category.markers.some((existing) => markerReferenceKey(existing) !== key && markerReferenceKey(existing) === markerReferenceKey(name)))) { toast('That biomarker is already in the catalog.'); return; }
    data.labMarkerAliases[key] = { name };
    data.labs.forEach((lab) => { if (markerReferenceKey(lab.marker) === key) lab.marker = name; });
    labCategories().forEach((category) => { category.markers = category.markers.map((existing) => markerReferenceKey(existing) === key ? name : existing); });
    saveData(); renderLabs(); renderLocalCorrelations(); return;
  }
  const remove = event.target.closest('[data-delete-lab-marker]');
  if (remove) {
    const key = remove.dataset.deleteLabMarker;
    const category = labCategories().find((item) => item.name === activeLabCategory);
    const name = category?.markers.find((item) => markerReferenceKey(item) === key);
    if (!name || !confirm(`Remove “${name}” from the biomarker catalog? Existing results will remain in the results table.`)) return;
    data.hiddenLabMarkers[key] = true;
    category.markers = category.markers.filter((item) => markerReferenceKey(item) !== key);
    saveData(); renderLabs();
  }
}

function handleLabCatalogMove(event) {
  const select = event.target.closest('[data-move-lab-marker]');
  if (!select || !select.value) return;
  const key = select.dataset.moveLabMarker;
  const source = labCategories().find((category) => category.name === activeLabCategory);
  const destination = labCategories().find((category) => category.name === select.value);
  const markerName = source?.markers.find((name) => markerReferenceKey(name) === key);
  if (!source || !destination || !markerName) return;
  if (!destination.markers.some((name) => markerReferenceKey(name) === key)) destination.markers.push(markerName);
  source.markers = source.markers.filter((name) => markerReferenceKey(name) !== key);
  saveData(); renderLabs();
}

function renderLabMergeOptions() {
  const groups = groupLabs();
  const tools = document.getElementById('labMergeTools');
  const options = groups.map((entries) => {
    const marker = canonicalUserLabMarker(entries[0].marker);
    return `<option value="${escapeHtml(markerReferenceKey(marker))}">${escapeHtml(marker)}</option>`;
  }).join('');
  ['labMergeSource', 'labMergeTarget'].forEach((id) => { document.getElementById(id).innerHTML = options; });
  tools.hidden = groups.length < 2;
}

function mergeLabMarkers(sourceKey, targetKey) {
  const source = data.labs.find((lab) => markerReferenceKey(lab.marker) === sourceKey);
  const target = data.labs.find((lab) => markerReferenceKey(lab.marker) === targetKey);
  if (!source || !target || sourceKey === targetKey) return false;
  const targetMarker = canonicalUserLabMarker(target.marker);
  const targetCategory = labCategories().find((category) => category.markers.some((name) => markerReferenceKey(name) === targetKey));
  labCategories().forEach((category) => { category.markers = category.markers.filter((name) => markerReferenceKey(name) !== sourceKey); });
  data.labs.forEach((lab) => {
    if (markerReferenceKey(lab.marker) !== sourceKey) return;
    lab.marker = targetMarker;
    standardizeAppLabResult(lab);
  });
  data.labMarkerAliases[sourceKey] = { name: targetMarker, key: targetKey };
  if (targetCategory && !targetCategory.markers.some((name) => markerReferenceKey(name) === targetKey)) targetCategory.markers.push(targetMarker);
  data.labReferences ||= {};
  data.desiredRanges ||= {};
  if (!data.labReferences[targetKey] && data.labReferences[sourceKey]) data.labReferences[targetKey] = data.labReferences[sourceKey];
  if (!Object.hasOwn(data.desiredRanges, targetKey) && Object.hasOwn(data.desiredRanges, sourceKey)) data.desiredRanges[targetKey] = data.desiredRanges[sourceKey];
  delete data.labReferences[sourceKey];
  delete data.desiredRanges[sourceKey];
  saveData();
  renderLabs();
  renderLocalCorrelations();
  return true;
}

function withinTimeframe(labs, days) {
  if (!days || days === 'all') return labs;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(days));
  return labs.filter((lab) => new Date(`${lab.date}T23:59:59`) >= cutoff);
}

function hasMarkerReference(marker) { return Object.hasOwn(data.labReferences || {}, markerReferenceKey(marker)); }
function markerReference(marker) {
  return savedMarkerReference(marker) || demographicReference(baseCatalogMarker(marker), data.labProfile) || '';
}
function savedMarkerReference(marker) {
  const key = markerReferenceKey(marker);
  const saved = data.labReferences?.[key];
  if (saved && !/^not\s+estab(?:lished)?\.?$/i.test(saved.trim())) return saved;
  return data.labs.find((lab) => markerReferenceKey(lab.marker) === key && lab.reference && !/^not\s+estab(?:lished)?\.?$/i.test(lab.reference.trim()))?.reference || '';
}
function saveMarkerReference(marker, value) {
  const key = markerReferenceKey(marker);
  data.labReferences ||= {};
  data.labReferences[key] = value.trim();
  data.labs.forEach((lab) => { if (markerReferenceKey(lab.marker) === key) lab.reference = value.trim(); });
  saveData();
}
function saveMarkerUnits(marker, value) {
  const key = markerReferenceKey(marker);
  const baseName = baseCatalogMarker(marker);
  const defaultUnits = catalogMarkerDefinition(baseName)?.units || '';
  const customUnits = value.trim();
  const targetUnits = customUnits || defaultUnits;
  const sample = data.labs.find((lab) => markerReferenceKey(lab.marker) === key);
  const sourceUnits = sample?.units || data.labUnits?.[key] || defaultUnits;
  if (sourceUnits && targetUnits && sourceUnits !== targetUnits) {
    if (data.labReferences?.[key]) {
      const reference = { marker, units: sourceUnits, value: 0, reference: data.labReferences[key] };
      convertAppResultUnits(reference, targetUnits);
      data.labReferences[key] = reference.reference;
    }
    const range = data.desiredRanges?.[key];
    if (range) ['low', 'high'].forEach((bound) => {
      if (range[bound] === undefined || range[bound] === '') return;
      const measurement = { marker, units: sourceUnits, value: range[bound], reference: '' };
      convertAppResultUnits(measurement, targetUnits);
      range[bound] = measurement.value;
    });
  }
  data.labUnits ||= {};
  if (customUnits) data.labUnits[key] = customUnits;
  else delete data.labUnits[key];
  data.labs.forEach((lab) => { if (markerReferenceKey(lab.marker) === key) standardizeAppLabResult(lab); });
  saveData();
}
function markerRange(marker) {
  const saved = data.desiredRanges?.[markerReferenceKey(marker)];
  return saved && ((saved.low !== undefined && saved.low !== '') || (saved.high !== undefined && saved.high !== '')) ? saved : referenceBounds(markerReference(marker)) || {};
}
function labRangeState(lab, range) {
  const low = range.low === '' || range.low === undefined ? null : Number(range.low);
  const high = range.high === '' || range.high === undefined ? null : Number(range.high);
  if (low === null && high === null) return 'unrated';
  return (low === null || Number(lab.value) >= low) && (high === null || Number(lab.value) <= high) ? 'in-range' : 'out-range';
}

function renderLabs() {
  const el = document.getElementById('labDashboard');
  renderLabCatalog();
  const allGroups = groupLabs();
  const allEntries = allGroups.flatMap((entries) => entries);
  const groups = allGroups.map((entries) => withinTimeframe(entries, document.getElementById('labTimeFilter').value)).filter((entries) => entries.length);
  const portrait = window.matchMedia('(max-width:560px) and (orientation:portrait)').matches;
  const activeCategory = labCategories().find((category) => category.name === activeLabCategory);
  const selectedMarkers = activeCategory?.markers || [];
  const selectedMarkerKeys = new Set(selectedMarkers.map((marker) => markerReferenceKey(marker)));
  const dates = [...new Set(groups.filter((entries) => selectedMarkerKeys.has(markerReferenceKey(entries[0].marker))).flatMap((entries) => entries.map((lab) => lab.date)))].sort((a, b) => b.localeCompare(a));
  const bodyRows = selectedMarkers.map((catalogMarker) => {
    const key = markerReferenceKey(catalogMarker);
    const entries = groups.find((group) => markerReferenceKey(group[0].marker) === key) || [];
    const historicalEntries = allEntries.filter((lab) => markerReferenceKey(lab.marker) === key);
    const newestFirst = entries.slice().reverse();
    const marker = canonicalUserLabMarker(historicalEntries[0]?.marker || catalogMarker);
    const range = markerRange(marker);
    const units = [...new Set(historicalEntries.map((lab) => lab.units).filter(Boolean))];
    const standardUnits = data.labUnits?.[key] || catalogMarkerDefinition(baseCatalogMarker(marker))?.units || '';
    const unitLabel = standardUnits || (units.length > 1 ? 'Varies' : units[0] || '—');
    const reference = numericReference(markerReference(marker) || catalogMarkerDefinition(baseCatalogMarker(marker))?.reference);
    const cells = dates.map((date) => {
      const results = newestFirst.filter((lab) => lab.date === date);
      const dateClass = 'lab-date-column';
      if (!results.length) return `<td class="lab-missing ${dateClass}">N/A</td>`;
      const values = results.map((lab) => {
        const state = labRangeState(lab, range);
        const flagged = state === 'out-range' || ['H', 'L'].includes(String(lab.flag || '').toUpperCase());
        return `<div class="lab-date-result ${flagged ? 'lab-flagged' : ''}"><strong>${escapeHtml(lab.value)}</strong><button type="button" class="text-button" data-remove-lab="${escapeHtml(lab.id)}" aria-label="Remove ${escapeHtml(marker)} result from ${escapeHtml(lab.date)}">Remove</button></div>`;
      }).join('');
      return `<td class="lab-date-cell ${dateClass}">${values}</td>`;
    }).join('');
    const otherMarkers = labCategories().flatMap((category) => category.markers).filter((name) => markerReferenceKey(name) !== key);
    const mergeOptions = otherMarkers.map((name) => `<option value="${escapeHtml(markerReferenceKey(name))}">${escapeHtml(name)}</option>`).join('');
    const markerEditMenu = labMarkerMenu.key === key ? `<div class="lab-marker-edit-menu"><button type="button" data-edit-lab-units="${escapeHtml(key)}">Edit units</button><button type="button" data-edit-lab-reference="${escapeHtml(key)}">Edit reference</button><button type="button" data-rename-lab-marker="${escapeHtml(key)}">Rename</button><button type="button" data-move-lab-marker="${escapeHtml(key)}">Move${labMarkerMenu.moving ? ' ▴' : ' ▾'}</button>${labMarkerMenu.moving ? `<select data-move-lab-marker-to="${escapeHtml(key)}" aria-label="Move ${escapeHtml(marker)} to category"><option value="" selected disabled>Move to…</option>${labCategories().filter((category) => category.name !== activeLabCategory).map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('')}</select>` : ''}<button type="button" data-merge-lab-marker-start="${escapeHtml(key)}">Merge with…</button>${labMarkerMenu.merging ? `<select data-merge-lab-marker-to="${escapeHtml(key)}" aria-label="Merge ${escapeHtml(marker)} into another biomarker"><option value="" selected disabled>Choose biomarker…</option>${mergeOptions}</select><button type="button" class="danger" data-merge-lab-marker-confirm="${escapeHtml(key)}">Merge results</button>` : ''}<button type="button" class="danger" data-delete-lab-marker="${escapeHtml(key)}">Delete</button></div>` : '';
    return `<tr><th scope="row"><div class="lab-marker-cell"><button class="lab-marker-link" type="button" data-open-marker="${escapeHtml(marker)}"><strong>${escapeHtml(marker)}</strong><small>Chart</small></button><button class="lab-marker-edit-button" type="button" data-edit-lab-marker="${escapeHtml(key)}" aria-label="Edit ${escapeHtml(marker)}" aria-expanded="${labMarkerMenu.key === key}">Edit</button>${markerEditMenu}</div></th>${cells}<td class="lab-matrix-units">${escapeHtml(unitLabel)}</td><td class="lab-matrix-reference">${escapeHtml(reference)}</td></tr>`;
  }).join('');
  const portraitControls = `<div class="lab-portrait-controls" ${portrait ? '' : 'aria-hidden="true"'}><label class="lab-text-size-control"><span>Text size</span><input type="range" min="0.65" max="1" step="0.05" value="${labPortraitTextScale}" aria-label="Lab results text size" data-lab-text-size><output data-lab-text-output>${Math.round(labPortraitTextScale * 100)}%</output></label></div>`;
  el.innerHTML = `${portraitControls}<div class="lab-results-matrix-wrap"><table class="lab-results-matrix"><thead><tr><th scope="col">Biomarker</th>${dates.map((date) => `<th scope="col" class="lab-date-column"><span>${escapeHtml(date)}</span><button class="lab-date-remove" type="button" data-remove-lab-date="${escapeHtml(date)}" aria-label="Delete all ${escapeHtml(date)} lab results in ${escapeHtml(activeLabCategory)}" title="Delete ${escapeHtml(date)} results">×</button></th>`).join('')}<th scope="col" class="lab-matrix-units">Units</th><th scope="col" class="lab-matrix-reference">Reference</th></tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  updateLabTextScale();
  el.querySelector('[data-lab-text-size]').addEventListener('input', (event) => {
    labPortraitTextScale = Number(event.target.value);
    updateLabTextScale();
    el.querySelector('[data-lab-text-output]').value = `${Math.round(labPortraitTextScale * 100)}%`;
    localStorage.setItem('thyroid-tracker-lab-text-scale', String(labPortraitTextScale));
  });
  el.querySelectorAll('[data-open-marker]').forEach((button) => button.addEventListener('click', () => openLabDashboard(button.dataset.openMarker)));
  el.querySelectorAll('[data-edit-lab-marker],[data-edit-lab-units],[data-edit-lab-reference],[data-move-lab-marker],[data-rename-lab-marker],[data-delete-lab-marker],[data-merge-lab-marker-start],[data-merge-lab-marker-confirm]').forEach((button) => button.addEventListener('click', handleLabMatrixEdit));
  el.querySelectorAll('[data-move-lab-marker-to]').forEach((select) => select.addEventListener('change', handleLabMarkerMove));
  el.querySelectorAll('[data-remove-lab-date]').forEach((button) => button.addEventListener('click', removeLabDateFromCategory));
  el.querySelectorAll('[data-remove-lab]').forEach((button) => button.addEventListener('click', () => { data.labs = data.labs.filter((lab) => lab.id !== button.dataset.removeLab); saveData(); renderLabs(); renderLocalCorrelations(); }));
}

function updateLabTextScale() {
  const matrix = document.querySelector('.lab-results-matrix');
  if (!matrix) return;
  const portrait = window.matchMedia('(max-width:560px) and (orientation:portrait)').matches;
  matrix.style.setProperty('--lab-text-scale', portrait ? labPortraitTextScale : 1);
}

window.addEventListener('resize', updateLabTextScale);
window.addEventListener('orientationchange', updateLabTextScale);

let selectedLabMarker = '';
function openLabDashboard(marker) {
  selectedLabMarker = marker;
  document.getElementById('detailMarkerTitle').textContent = marker;
  const range = markerRange(marker);
  document.getElementById('detailDesiredLow').value = range.low ?? '';
  document.getElementById('detailDesiredHigh').value = range.high ?? '';
  drawLabGraph(); document.getElementById('labDetailDialog').showModal();
}

function drawLabGraph() {
  const container = document.getElementById('labGraph');
  const days = document.getElementById('detailTimeFilter').value;
  const values = withinTimeframe(data.labs.filter((lab) => markerReferenceKey(lab.marker) === markerReferenceKey(selectedLabMarker)), days).sort((a, b) => a.date.localeCompare(b.date));
  if (!values.length) { container.innerHTML = '<div class="empty-state">No results in this time period.</div>'; return; }
  const compactLandscape = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
  const width = 680, height = compactLandscape ? 125 : 280, pad = compactLandscape ? { left: 48, right: 18, top: 15, bottom: 28 } : { left: 54, right: 22, top: 25, bottom: 45 };
  const numbers = values.map((lab) => Number(lab.value)); const range = markerRange(selectedLabMarker); [range.low, range.high].forEach((value) => { if (value !== undefined && value !== '' && Number.isFinite(Number(value))) numbers.push(Number(value)); });
  let min = Math.min(...numbers), max = Math.max(...numbers); if (min === max) { min -= 1; max += 1; } else { const breathingRoom = (max - min) * .12; min -= breathingRoom; max += breathingRoom; }
  const x = (index) => pad.left + index * (width - pad.left - pad.right) / Math.max(values.length - 1, 1);
  const y = (value) => pad.top + (max - Number(value)) * (height - pad.top - pad.bottom) / (max - min);
  const pointString = values.map((lab, index) => `${x(index)},${y(lab.value)}`).join(' ');
  const rangeLines = [range.low, range.high].filter((value) => value !== undefined && value !== '').map((value) => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(value)}" y2="${y(value)}" stroke="#b44f4f" stroke-dasharray="5 4"/><text x="${width - pad.right}" y="${y(value) - 5}" text-anchor="end" class="target-label">Target ${escapeHtml(value)}</text>`).join('');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(selectedLabMarker)} values over time"><line x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}" stroke="#cdd7d0"/><line x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${height - pad.bottom}" stroke="#cdd7d0"/>${rangeLines}<polyline points="${pointString}" fill="none" stroke="#245e4d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${values.map((lab, index) => `<circle cx="${x(index)}" cy="${y(lab.value)}" r="5" fill="${labRangeState(lab, range) === 'out-range' ? '#b44f4f' : '#245e4d'}"><title>${escapeHtml(lab.date)}: ${escapeHtml(lab.value)} ${escapeHtml(lab.units)}</title></circle><text x="${x(index)}" y="${height - 18}" text-anchor="middle" class="axis-label">${escapeHtml(lab.date.slice(5))}</text>`).join('')}<text x="${pad.left - 8}" y="${pad.top + 6}" text-anchor="end" class="axis-label">${escapeHtml(max.toFixed(1))}</text><text x="${pad.left - 8}" y="${height - pad.bottom}" text-anchor="end" class="axis-label">${escapeHtml(min.toFixed(1))}</text></svg>`;
}

function saveMarkerRange() {
  const lowText = document.getElementById('detailDesiredLow').value, highText = document.getElementById('detailDesiredHigh').value;
  if (lowText !== '' && highText !== '' && Number(lowText) > Number(highText)) { toast('Desired low must be at or below desired high.'); return; }
  data.desiredRanges ||= {};
  data.desiredRanges[markerReferenceKey(selectedLabMarker)] = { low: lowText === '' ? undefined : Number(lowText), high: highText === '' ? undefined : Number(highText) };
  saveData(); renderLabs(); drawLabGraph(); toast('Desired range saved on this device.');
}

function addLab(event) {
  event.preventDefault();
  const marker = ensureCatalogMarker(document.getElementById('labMarker').value.trim());
  const key = markerReferenceKey(marker);
  const reference = savedMarkerReference(marker) || document.getElementById('labReference').value.trim();
  data.labReferences ||= {};
  delete data.hiddenLabMarkers[key];
  const result = standardizeAppLabResult({ id: uniqueId('lab'), marker, date: document.getElementById('labDate').value, value: Number(document.getElementById('labValue').value), units: document.getElementById('labUnits').value.trim(), reference });
  if (!data.labReferences[key] && result.reference) data.labReferences[key] = result.reference;
  data.labs.push(result);
  data.desiredRanges ||= {};
  const low = document.getElementById('labDesiredLow').value, high = document.getElementById('labDesiredHigh').value;
  if (low !== '' || high !== '') data.desiredRanges[markerReferenceKey(marker)] = { low: low === '' ? undefined : Number(low), high: high === '' ? undefined : Number(high) };
  saveData(); renderLabs(); renderLocalCorrelations(); event.target.reset(); document.querySelector('.lab-entry-details').open = false; toast('Lab result saved on this device.');
}

function parseDelimitedRows(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = ['\t', ',', ';'].sort((first, second) => firstLine.split(second).length - firstLine.split(first).length)[0];
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) { row.push(cell.trim()); cell = ''; }
    else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function csvDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (!match) return '';
  const first = Number(match[1]), second = Number(match[2]);
  let year = Number(match[3]); if (year < 100) year += year < 50 ? 2000 : 1900;
  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function csvNumber(value) {
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text || /^(?:-|—|n\/a|na|not\s+done|negative|positive)$/i.test(text)) return null;
  const normalized = text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text.replace(/,/g, '');
  const match = normalized.match(/[<>]?(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

function parseLabText(text) {
  const rows = parseDelimitedRows(text);
  if (rows.length < 2) return [];
  const normalizedHeaders = rows[0].map((value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim());
  const markerHeaders = ['marker', 'biomarker', 'test', 'test name', 'analyte', 'examen', 'prueba', 'analisis', 'nombre del examen', 'nombre'];
  const dateHeaders = ['date', 'result date', 'collection date', 'fecha', 'fecha del resultado', 'fecha de toma', 'fecha toma', 'fecha recoleccion', 'fecha de recoleccion'];
  const valueHeaders = ['value', 'result', 'result value', 'valor', 'resultado'];
  const unitHeaders = ['units', 'unit', 'unidades', 'unidad'];
  const referenceHeaders = ['reference', 'reference range', 'normal range', 'interval', 'rango de referencia', 'valores de referencia'];
  const headerIndex = (names) => normalizedHeaders.findIndex((header) => names.includes(header));
  const markerIndex = headerIndex(markerHeaders);
  const dateIndex = headerIndex(dateHeaders);
  const valueIndex = headerIndex(valueHeaders);
  const unitIndex = headerIndex(unitHeaders);
  const referenceIndex = headerIndex(referenceHeaders);
  const parsed = [];
  const addResult = (marker, date, rawValue, units = '', reference = '', sourceIndex = 0) => {
    const value = csvNumber(rawValue);
    const resultDate = csvDate(date);
    if (!marker || !resultDate || value === null || !Number.isFinite(value)) return;
    parsed.push({ id: uniqueId(`lab-csv-${sourceIndex}`), marker: canonicalUserLabMarker(canonicalLabMarker(marker)), date: resultDate, value, units: String(units || '').trim(), reference: String(reference || '').trim() });
  };

  if (markerIndex >= 0 && dateIndex >= 0 && valueIndex >= 0) {
    rows.slice(1).forEach((row, index) => addResult(row[markerIndex], row[dateIndex], row[valueIndex], row[unitIndex] || '', row[referenceIndex] || '', index));
    return parsed;
  }

  const metadataHeaders = new Set([...markerHeaders, ...dateHeaders, ...unitHeaders, ...referenceHeaders, 'category', 'categoria', 'group', 'flag', 'status', 'reference interval']);
  const dateColumns = rows[0].map((header, index) => {
    const date = csvDate(header);
    const normalizedDateHeader = normalizedHeaders[index];
    const unitsIndex = normalizedDateHeader ? normalizedHeaders.findIndex((candidate, candidateIndex) => candidateIndex !== index && (candidate === `${normalizedDateHeader} unit` || candidate === `${normalizedDateHeader} units`)) : -1;
    return { index, date, unitsIndex };
  }).filter((column) => column.date);
  if (markerIndex >= 0 && dateColumns.length) {
    rows.slice(1).forEach((row, rowIndex) => {
      const biomarker = row[markerIndex];
      const units = unitIndex >= 0 ? row[unitIndex] : '';
      const reference = referenceIndex >= 0 ? row[referenceIndex] : '';
      dateColumns.forEach(({ index, date, unitsIndex }) => addResult(biomarker, date, row[index], unitsIndex >= 0 ? row[unitsIndex] : units, reference, rowIndex));
    });
    return parsed;
  }

  const firstColumnDates = rows.slice(1).map((row) => csvDate(row[0]));
  if (firstColumnDates.filter(Boolean).length >= Math.max(1, Math.floor(firstColumnDates.length * 0.6))) {
    const headerDates = rows[0].slice(1).map(csvDate);
    if (!headerDates.some(Boolean)) {
      rows[0].slice(1).forEach((biomarker, columnIndex) => {
        rows.slice(1).forEach((row, rowIndex) => addResult(biomarker, row[0], row[columnIndex + 1], '', '', rowIndex));
      });
      return parsed;
    }
  }

  const rowDates = rows.slice(1).map((row) => csvDate(row[0]));
  if (rowDates.filter(Boolean).length >= Math.max(1, Math.floor(rowDates.length * 0.6))) {
    rows[0].slice(1).forEach((biomarker, columnIndex) => {
      const label = String(biomarker || '').trim();
      if (!label || metadataHeaders.has(label.toLowerCase())) return;
      const canonical = canonicalUserLabMarker(canonicalLabMarker(label));
      const inCatalog = labCategories().some((category) => category.markers.some((marker) => markerReferenceKey(marker) === markerReferenceKey(canonical)));
      if (canonical === label && !catalogMarkerDefinition(canonical) && !inCatalog) return;
      rows.slice(1).forEach((row, rowIndex) => addResult(canonical, row[0], row[columnIndex + 1], '', '', rowIndex));
    });
    return parsed;
  }

  if (rows.every((row) => row.length >= 3) && markerIndex < 0 && dateIndex < 0) {
    rows.forEach((row, index) => {
      if (index === 0 && /marker|biomarker|test|name/i.test(row[0])) return;
      addResult(row[0], row[1], row[2], row[3] || '', row[4] || '', index);
    });
  }
  return parsed;
}

function renderLabPdfReview(rows, fileName) {
  const body = document.getElementById('labPdfRows');
  rows.forEach((row) => { row.marker = canonicalUserLabMarker(canonicalLabMarker(row.marker)); });
  const references = new Map();
  rows.forEach((row) => {
    const key = markerReferenceKey(row.marker);
    const savedReference = savedMarkerReference(row.marker);
    if (savedReference) references.set(key, savedReference);
    else if (!references.get(key) && row.reference) references.set(key, row.reference);
  });
  rows.forEach((row) => { const key = markerReferenceKey(row.marker); if (!references.get(key)) references.set(key, ''); });
  body.innerHTML = rows.map((row, index) => {
    const key = markerReferenceKey(row.marker);
    const reference = references.get(key);
    return `<tr data-pdf-row="${index}" data-marker-key="${escapeHtml(key)}" data-flag="${escapeHtml(row.flag || '')}" data-flag-source="${escapeHtml(row.flagSource || '')}"><td><input type="checkbox" data-field="include" checked aria-label="Import ${escapeHtml(row.marker)} ${escapeHtml(row.resultPeriod || '')}" /></td><td>${escapeHtml(row.resultPeriod || 'Result')}</td><td><input type="text" data-field="marker" value="${escapeHtml(row.marker)}" aria-label="Marker" /></td><td><input type="date" data-field="date" value="${escapeHtml(row.date)}" aria-label="Result date" /></td><td><input type="number" step="any" data-field="value" value="${escapeHtml(row.value)}" aria-label="Result value" /></td><td>${escapeHtml(row.flag ? `${row.flag}${row.flagSource === 'reference interval' ? ' *' : ''}` : '—')}</td><td><input type="text" data-field="units" value="${escapeHtml(row.units)}" aria-label="Units" /></td><td><input type="text" data-field="reference" value="${escapeHtml(reference)}" aria-label="Reference range for ${escapeHtml(row.marker)}" /></td></tr>`;
  }).join('');
  body.querySelectorAll('[data-field="reference"]').forEach((input) => input.addEventListener('input', () => {
    const row = input.closest('[data-pdf-row]');
    body.querySelectorAll(`[data-marker-key="${CSS.escape(row.dataset.markerKey)}"] [data-field="reference"]`).forEach((peer) => { if (peer !== input) peer.value = input.value; });
  }));
  document.getElementById('labPdfSummary').textContent = `${rows.length} possible result${rows.length === 1 ? '' : 's'} found in ${fileName}. Review markers, dates, values, units and references before adding.`;
  document.getElementById('labPdfReview').showModal();
}

function applyCanonicalLabReferences(rows, useProvidedReference = false) {
  const references = new Map();
  rows.forEach((row) => {
    row.marker = ensureCatalogMarker(canonicalUserLabMarker(canonicalLabMarker(row.marker)));
    standardizeAppLabResult(row);
    const key = markerReferenceKey(row.marker);
    const savedReference = !useProvidedReference ? savedMarkerReference(row.marker) : '';
    if (savedReference) references.set(key, savedReference);
    else if (!references.get(key) && row.reference) references.set(key, row.reference);
  });
  rows.forEach((row) => { const key = markerReferenceKey(row.marker); if (!references.get(key)) references.set(key, ''); });
  references.forEach((reference, key) => {
    if (!reference || /^not\s+estab(?:lished)?\.?$/i.test(reference.trim())) return;
    data.labReferences ||= {};
    data.labReferences[key] = reference;
    data.labs.forEach((lab) => { if (markerReferenceKey(lab.marker) === key) lab.reference = reference; });
  });
  rows.forEach((row) => {
    const key = markerReferenceKey(row.marker);
    row.reference = references.get(key) || row.reference || '';
    if (!hasDesiredRange(key)) {
      const bounds = referenceBounds(row.reference);
      if (bounds) { data.desiredRanges ||= {}; data.desiredRanges[key] = bounds; }
    }
  });
}

function hasDesiredRange(key) {
  const range = data.desiredRanges?.[key];
  return Boolean(range && ((range.low !== undefined && range.low !== '') || (range.high !== undefined && range.high !== '')));
}

function referenceBounds(reference) {
  const text = String(reference || '').replace(/,/g, '.');
  if (/^\s*not\s+estab\.?\s*$/i.test(text)) return null;
  const interval = text.match(/([<>]?\s*-?\d+(?:\.\d+)?)\s*(?:-|\u2013|\u2014|\bto\b)\s*([<>]?\s*-?\d+(?:\.\d+)?)/i);
  if (interval) {
    const low = Number(interval[1].replace(/[<>\s]/g, ''));
    const high = Number(interval[2].replace(/[<>\s]/g, ''));
    if (Number.isFinite(low) && Number.isFinite(high)) return { low: Math.min(low, high), high: Math.max(low, high) };
  }
  const oneSided = text.match(/(?:^|\s)([<>])\s*(-?\d+(?:\.\d+)?)(?:\s|$)/);
  if (!oneSided) return null;
  const value = Number(oneSided[2]);
  if (!Number.isFinite(value)) return null;
  return oneSided[1] === '>' ? { low: value, high: undefined } : { low: undefined, high: value };
}

function confirmLabPdfImport() {
  const selected = [...document.querySelectorAll('#labPdfRows tr[data-pdf-row]')].filter((row) => row.querySelector('[data-field="include"]').checked);
  if (!selected.length) { toast('Select at least one result to import.'); return; }
  const imported = [];
  for (const row of selected) {
    const field = (name) => row.querySelector(`[data-field="${name}"]`).value.trim();
    const marker = field('marker'); const date = field('date'); const value = Number(field('value'));
    if (!marker || !date || field('value') === '' || !Number.isFinite(value)) { toast('Each selected result needs a marker, date and numeric value.'); return; }
    imported.push({ id: uniqueId('lab-pdf'), marker, date, value, units: field('units'), reference: field('reference'), flag: row.dataset.flag || '', flagSource: row.dataset.flagSource || '' });
  }
  selected.forEach((row, index) => {
    imported[index].reference = row.querySelector('[data-field="reference"]').value.trim();
  });
  const accepted = commitImportedLabRows(imported, pendingLabImport, true);
  document.getElementById('labPdfReview').close();
  document.getElementById('labImportStatus').textContent = accepted ? `${imported.length} result${imported.length === 1 ? '' : 's'} added from PDF. The file was read locally.` : 'PDF import cancelled; saved results were left unchanged.';
  pendingLabRows = [];
  pendingLabImport = null;
}

async function labFileFingerprint(file) {
  const contents = await file.arrayBuffer();
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', contents);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function labResultDuplicateKey(lab) {
  return [markerReferenceKey(lab.marker), lab.date, Number(lab.value), String(lab.units || '').trim().toLowerCase()].join('|');
}

function commitImportedLabRows(rows, source, useProvidedReference = false) {
  const prepared = rows.map((row) => {
    row.marker = ensureCatalogMarker(canonicalUserLabMarker(canonicalLabMarker(row.marker)));
    standardizeAppLabResult(row);
    return row;
  });
  const previousFileRows = source?.fingerprint ? data.labs.filter((lab) => lab.importSourceHash === source.fingerprint) : [];
  const priorImport = source?.fingerprint ? data.labImports?.[source.fingerprint] : null;
  const wasImported = Boolean(priorImport || previousFileRows.length);
  if (wasImported && !confirm(`${source.fileName} appears to have already been imported${previousFileRows.length ? ` (${previousFileRows.length} saved results)` : ''}. Replace the results from that file? Choose Cancel to keep them unchanged.`)) {
    toast('Import cancelled; existing lab results were left unchanged.');
    return false;
  }
  const replacedIds = new Set(previousFileRows.map((lab) => lab.id));
  const existingKeys = new Set(data.labs.filter((lab) => !replacedIds.has(lab.id)).map(labResultDuplicateKey));
  const seen = new Set();
  const fresh = prepared.filter((lab) => {
    const key = labResultDuplicateKey(lab);
    if (seen.has(key) || (!previousFileRows.length && existingKeys.has(key))) return false;
    seen.add(key);
    return true;
  });
  data.labs = data.labs.filter((lab) => !replacedIds.has(lab.id));
  if (!fresh.length) {
    if (wasImported) {
      data.labImports[source.fingerprint] = { fileName: source.fileName, importedAt: new Date().toISOString() };
      saveData(); renderLabs(); renderLocalCorrelations();
      toast('The previous import was replaced; it contained no new numeric results.');
      return true;
    }
    toast('These lab results are already saved; no duplicates were added.');
    return false;
  }
  fresh.forEach((lab) => {
    if (source?.fingerprint) {
      lab.importSourceHash = source.fingerprint;
      lab.importFileName = source.fileName;
    }
  });
  if (source?.fingerprint) data.labImports[source.fingerprint] = { fileName: source.fileName, importedAt: new Date().toISOString(), resultCount: fresh.length };
  applyCanonicalLabReferences(fresh, useProvidedReference);
  data.labs.push(...fresh);
  saveData(); renderLabs(); renderLocalCorrelations();
  toast(`${fresh.length} result${fresh.length === 1 ? '' : 's'} imported locally${prepared.length > fresh.length ? `; skipped ${prepared.length - fresh.length} duplicate${prepared.length - fresh.length === 1 ? '' : 's'}` : ''}.`);
  return true;
}

async function importLabs(file) {
  if (!file) return;
  const source = { fingerprint: await labFileFingerprint(file), fileName: file.name };
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const status = document.getElementById('labImportStatus');
    status.hidden = false;
    status.textContent = 'Reading PDF text on this device…';
    try {
      const rows = await readPdfLabRows(file);
      if (!rows.length) { status.textContent = 'No lab rows were recognized. This can happen with a scanned PDF or a report layout/units the importer does not recognize; it does not necessarily mean the PDF is scanned. The file stayed on this device. Try selecting and copying report text to confirm it is searchable. A redacted sample PDF or copied result lines would help us adapt the importer.'; toast('No lab rows recognized; check whether text can be selected in the PDF.'); return; }
      pendingLabRows = rows;
      pendingLabImport = source;
      status.textContent = `${rows.length} possible rows extracted locally. Review before adding.`;
      renderLabPdfReview(rows, file.name);
    } catch (error) {
      status.textContent = 'Could not read this PDF. It may be password-protected, damaged, or unsupported.';
      toast('Could not read that PDF.');
    }
    return;
  }
  if (!/\.(csv|txt)$/i.test(file.name)) { toast('Choose a PDF, CSV, or text file.'); return; }
  const reader = new FileReader();
  reader.onload = () => { const rows = parseLabText(String(reader.result)); if (!rows.length) { toast('No lab results recognized. Check that the CSV includes biomarker names, dates, and numeric results.'); return; } commitImportedLabRows(rows, source); };
  reader.readAsText(file);
}

function exportJson() {
  const submittedDays = Object.fromEntries(Object.entries(data.days).filter(([, day]) => day.submitted).map(([date, day]) => [date, { submitted: day.submitted }]));
  download(`thyroid-tracker-${activeDate}.json`, JSON.stringify({ ...data, days: submittedDays }, null, 2), 'application/json');
}
function exportCsv() {
  const rows = [['marker', 'date', 'value', 'units', 'reference'], ...data.labs.map((lab) => [lab.marker, lab.date, lab.value, lab.units, lab.reference])];
  download('thyroid-tracker-labs.csv', rows.map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
}
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }

function renderMomentum() {
  const dates = Object.entries(data.days).filter(([, day]) => day.submitted).map(([date]) => date).sort();
  let streak = 0, cursor = today();
  while (data.days[cursor]?.submitted) { streak += 1; cursor = previousDay(cursor); }
  document.getElementById('momentumStats').innerHTML = `<div class="stat"><strong>${dates.length}</strong><span>days submitted</span></div><div class="stat"><strong>${streak}</strong><span>day current streak</span></div><div class="stat"><strong>${dates.length ? new Date(`${dates[dates.length - 1]}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</strong><span>last check-in</span></div>`;
  document.getElementById('puzzleSolvedCount').textContent = data.puzzle.solved;
  document.getElementById('puzzleBestStreak').textContent = data.puzzle.bestStreak;
  document.getElementById('puzzleRatingInput').value = data.puzzle.targetRating;
}

function renderLocalCorrelations() {
  const container = document.getElementById('localCorrelations');
  const submitted = Object.entries(data.days).flatMap(([date, day]) => {
    if (day.submitted) return [{ date, entry: day.submitted }];
    const checkins = day.parts?.checkin;
    const latestCheckin = Array.isArray(checkins) ? checkins[checkins.length - 1]?.entry : checkins?.entry;
    const entry = latestCheckin ? { ...latestCheckin, routine: [] } : { routine: [] };
    Object.entries(day.parts || {}).forEach(([group, history]) => {
      if (group === 'checkin') return;
      const latest = Array.isArray(history) ? history[history.length - 1] : history;
      if (latest?.items) entry.routine.push(...latest.items);
    });
    return latestCheckin || entry.routine.length ? [{ date, entry }] : [];
  });
  if (submitted.length < 6) { container.innerHTML = `<div class="empty-state">${submitted.length} of 6 required submitted days recorded. Keep logging; no drafts are counted.</div>`; return; }
  const correlations = [];
  const measurements = [...allSymptoms().map((name) => [name, (entry) => entry.symptoms?.[name.toLowerCase()]]), ['Energy', (entry) => entry.energyLevel === '' ? null : Number(entry.energyLevel)], ['Sleep quality', (entry) => entry.sleepQuality === '' ? null : Number(entry.sleepQuality)], ['Bowel movements', (entry) => { const count = (entry.stoolEvents || []).filter((event) => event.time || event.form).length; return count || null; }], ['Average stool form', (entry) => { const forms = (entry.stoolEvents || []).filter((event) => event.form !== '').map((event) => Number(event.form)).filter(Number.isFinite); return forms.length ? forms.reduce((sum, value) => sum + value, 0) / forms.length : null; }], ['Watch sleep (hours)', (entry) => entry.health?.sleepMinutes ? entry.health.sleepMinutes / 60 : null], ['Watch heart rate (bpm)', (entry) => entry.health?.averageHeartRate], ['Watch steps', (entry) => entry.health?.steps], ['Watch exercise (minutes)', (entry) => entry.health?.exerciseMinutes]];
  [...new Set(data.labs.map((lab) => canonicalUserLabMarker(lab.marker)))].forEach((marker) => measurements.push([`${marker} (lab within 30 days)`, (entry, date) => {
    const dayTime = new Date(`${date}T12:00:00`).getTime();
    const nearest = data.labs.filter((lab) => markerReferenceKey(lab.marker) === markerReferenceKey(marker)).map((lab) => ({ ...lab, distance: Math.abs(new Date(`${lab.date}T12:00:00`).getTime() - dayTime) / 86400000 })).filter((lab) => lab.distance <= 30).sort((a, b) => a.distance - b.distance)[0];
    return nearest ? Number(nearest.value) : null;
  }]));
  const itemNames = [...new Set(submitted.flatMap(({ entry }) => entry.routine.map((item) => item.name)))];
  itemNames.forEach((itemName) => measurements.forEach(([measureName, getValue]) => {
    const pairs = submitted.flatMap(({ date, entry }) => {
      const item = entry.routine.find((record) => record.name === itemName);
      const value = getValue(entry, date);
      if (!item || value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return [];
      const numbers = String(item.dose || '').match(/[\d.]+/g)?.map(Number) || [];
      const dose = numbers.length > 1 ? (numbers[0] + numbers[1]) / 2 : numbers[0];
      const exposure = item.enabled ? (Number.isFinite(dose) ? dose : 1) : 0;
      return [[exposure, Number(value)]];
    });
    if (pairs.length < 6 || pairs.filter(([active]) => active === 1).length < 2 || pairs.filter(([active]) => active === 0).length < 2) return;
    const meanX = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
    const meanY = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
    const numerator = pairs.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0);
    const denominator = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - meanX) ** 2, 0) * pairs.reduce((sum, [, y]) => sum + (y - meanY) ** 2, 0));
    if (denominator) correlations.push({ itemName, measureName, coefficient: numerator / denominator, count: pairs.length });
  }));
  correlations.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
  container.innerHTML = correlations.length ? correlations.slice(0, 8).map((item) => `<div class="correlation-row"><strong>${escapeHtml(item.itemName)}</strong><span>with ${escapeHtml(item.measureName)}</span><b>${item.coefficient > 0 ? '+' : ''}${item.coefficient.toFixed(2)}</b><small>r · ${item.count} days</small></div>`).join('') : '<div class="empty-state">Not enough variation yet to compare on and off days with a recorded measure.</div>';
}

function setupVoice() {
  const button = document.getElementById('voiceButton'); const status = document.getElementById('voiceStatus');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const quickButton = document.getElementById('quickVoiceButton');
  const quickInput = document.getElementById('quickUpdate');
  const focusKeyboardDictation = (reason) => {
    quickInput.focus();
    const cursor = quickInput.value.length;
    quickInput.setSelectionRange(cursor, cursor);
    document.getElementById('quickUpdateReview').hidden = false;
    document.getElementById('quickUpdateStatus').textContent = reason || 'Tap the microphone on your keyboard (or switch to Wispr Flow), speak, then the changes appear here to confirm.';
  };
  const speechUsable = SpeechRecognition && window.isSecureContext;
  if (!speechUsable) {
    button.disabled = true;
    button.title = 'Use your keyboard microphone or Wispr Flow in the notes field';
    status.textContent = 'Use your keyboard microphone or select Wispr Flow in the notes field.';
    quickButton.setAttribute('aria-label', 'Dictate with your keyboard microphone');
    quickButton.title = 'Opens the field; use your keyboard microphone or Wispr Flow';
    quickButton.addEventListener('click', () => focusKeyboardDictation(SpeechRecognition ? 'In-app dictation needs a secure (https) connection. Use your keyboard microphone or Wispr Flow: speak, and the changes appear here to confirm.' : 'This browser has no built-in dictation. Use your keyboard microphone or Wispr Flow.'));
    return;
  }
  button.addEventListener('click', () => {
    if (recognition) { recognition.stop(); return; }
    recognition = new SpeechRecognition(); recognition.continuous = true; recognition.interimResults = true;
    const existing = document.getElementById('dailyNotes').value.trim();
    button.setAttribute('aria-pressed', 'true'); button.textContent = '■ Stop dictation'; status.textContent = 'Listening. Your browser may process audio online.';
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join(' ');
      document.getElementById('dailyNotes').value = `${existing}${existing ? ' ' : ''}${transcript}`.trim();
      draft().notes = document.getElementById('dailyNotes').value; saveDraft();
    };
    recognition.onerror = () => { status.textContent = 'Dictation stopped. Check microphone permission or use keyboard dictation.'; };
    recognition.onend = () => { recognition = null; button.setAttribute('aria-pressed', 'false'); button.textContent = '🎙 Dictate notes'; status.textContent = 'Dictation stopped. Transcript remains a draft until you submit the day.'; };
    recognition.start();
  });
  quickButton.addEventListener('click', () => {
    if (recognition) { recognition.stop(); return; }
    const statusEl = document.getElementById('quickUpdateStatus');
    const base = quickInput.value.trim();
    let finalText = '';
    recognition = new SpeechRecognition(); recognition.continuous = true; recognition.interimResults = true; recognition.lang = navigator.language || 'en-US'; recognition.maxAlternatives = 1;
    quickButton.textContent = '■'; quickButton.setAttribute('aria-pressed', 'true');
    document.getElementById('quickUpdateReview').hidden = false;
    statusEl.textContent = 'Listening… tap again when finished. Browser speech services may process audio online.';
    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const piece = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += `${piece} `; else interim += piece;
      }
      quickInput.value = [base, finalText.trim(), interim.trim()].filter(Boolean).join(' ');
    };
    recognition.onerror = (event) => {
      const reason = event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'Microphone permission was denied.' : event.error === 'no-speech' ? 'No speech heard.' : 'Browser dictation failed.';
      recognition = null; quickButton.textContent = '🎙'; quickButton.setAttribute('aria-pressed', 'false');
      if (event.error !== 'no-speech') focusKeyboardDictation(`${reason} Use your keyboard microphone or Wispr Flow instead.`); else statusEl.textContent = reason;
    };
    recognition.onend = () => {
      recognition = null; quickButton.textContent = '🎙'; quickButton.setAttribute('aria-pressed', 'false');
      if (quickInput.value.trim()) applyQuickUpdate();
    };
    try { recognition.start(); } catch { recognition = null; quickButton.textContent = '🎙'; focusKeyboardDictation(); }
  });
}

async function searchPapers(event) {
  event.preventDefault(); const query = document.getElementById('researchTopic').value.trim(); const results = document.getElementById('researchResults');
  if (!query) { results.innerHTML = '<p class="empty-state">Enter a search or choose a suggestion.</p>'; return; }
  const button = document.getElementById('researchSearchButton');
  button.disabled = true;
  currentPublicPapers = [];
  document.getElementById('aiReviewArea').hidden = true;
  results.innerHTML = '<p class="empty-state">Searching PubMed. Your search terms are sent to NCBI; tracker data is not.</p>';
  try {
    const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
    const searchUrl = `${base}esearch.fcgi?db=pubmed&retmode=json&retmax=8&term=${encodeURIComponent(query)}`;
    const searchResponse = await fetch(searchUrl); if (!searchResponse.ok) throw new Error('Search unavailable');
    const search = await searchResponse.json(); const ids = search.esearchresult.idlist;
    if (!ids.length) { results.innerHTML = '<p class="empty-state">No matching papers found.</p>'; return; }
    const summaryResponse = await fetch(`${base}esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`); if (!summaryResponse.ok) throw new Error('Paper details unavailable');
    const summary = await summaryResponse.json();
    currentPublicPapers = ids.map((id) => ({ id, title: summary.result[id].title || 'Untitled paper' }));
    document.getElementById('aiReviewArea').hidden = false;
    results.innerHTML = ids.map((id) => { const article = summary.result[id]; const authors = article.authors?.slice(0, 3).map((author) => author.name).join(', ') || 'Authors not listed'; return `<article class="paper-row"><p class="paper-date">${escapeHtml(article.pubdate || 'Date unknown')} · ${escapeHtml(article.fulljournalname || article.source || 'PubMed')}</p><h3><a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(id)}/" target="_blank" rel="noreferrer">${escapeHtml(article.title || 'Untitled paper')}</a></h3><p>${escapeHtml(authors)}${article.authors?.length > 3 ? ' et al.' : ''}</p><span class="paper-id">PMID ${escapeHtml(id)}</span></article>`; }).join('');
  } catch { results.innerHTML = '<p class="empty-state">Could not reach PubMed. Check your connection and try again. Research search needs internet access.</p>'; }
  finally { button.disabled = false; }
}

function researchEntries() {
  return Object.entries(data.days).flatMap(([date, day]) => {
    if (day.submitted) return [{ date, entry: day.submitted }];
    const history = day.parts?.checkin;
    const latest = Array.isArray(history) ? history[history.length - 1]?.entry : history?.entry;
    return latest ? [{ date, entry: latest }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
}

function renderResearchSuggestions() {
  renderLocalCorrelations();
  const suggestions = [];
  const seen = new Set();
  const add = (label, query, type) => {
    const key = query.toLowerCase();
    if (!query || seen.has(key) || suggestions.length >= 8) return;
    seen.add(key); suggestions.push({ label, query, type });
  };
  document.querySelectorAll('#localCorrelations .correlation-row').forEach((row) => {
    if (suggestions.filter((item) => item.type === 'Pattern').length >= 2) return;
    const item = row.querySelector('strong')?.textContent?.trim();
    const measure = row.querySelector('span')?.textContent?.replace(/^with\s+/i, '').trim();
    if (item && measure) add(`${item} and ${measure}`, `"${item}" AND "${measure}" AND (thyroid OR Graves disease)`, 'Pattern');
  });

  const entries = researchEntries();
  const symptomScores = allSymptoms().map((name) => {
    const key = name.toLowerCase();
    const values = entries.map(({ entry }) => Number(entry.symptoms?.[key])).filter(Number.isFinite);
    return { name, average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0, count: values.length };
  }).filter((item) => item.count >= 2 && item.average > 0).sort((a, b) => b.average - a.average);
  symptomScores.slice(0, 2).forEach(({ name }) => add(`${name} and thyroid disease`, `"${name}" AND (Graves disease OR hyperthyroidism)`, 'Check-in'));

  const latestLabs = new Map();
  [...(data.labs || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach((lab) => {
    const marker = canonicalUserLabMarker(lab.marker);
    if (marker && !latestLabs.has(marker)) latestLabs.set(marker, lab);
  });
  const labs = [...latestLabs.entries()].sort(([, a], [, b]) => Number(Boolean(b.flag)) - Number(Boolean(a.flag)) || String(b.date).localeCompare(String(a.date)));
  labs.slice(0, 3).forEach(([marker, lab]) => {
    const flagged = lab.flag ? ' · flagged lab' : ' · lab';
    add(`${marker} and thyroid function${flagged}`, `"${marker}" AND (thyroid function OR Graves disease OR hyperthyroidism)`, 'Lab');
  });

  [
    ['Graves disease and thyroid antibodies', '(Graves disease OR Basedow disease) AND (thyroid antibodies OR TRAb OR TSI)'],
    ['Sleep and thyroid function', '(Graves disease OR hyperthyroidism) AND sleep'],
    ['Hyperthyroidism and heart rate', 'hyperthyroidism AND (heart rate OR arrhythmia)'],
    ['Exercise tolerance and Graves disease', '(Graves disease OR hyperthyroidism) AND exercise tolerance'],
    ['Autoimmune thyroid disease and gut health', 'autoimmune thyroid disease AND gut microbiome'],
    ['Thyroid hormone and bone health', 'thyroid hormone AND bone density'],
    ['Vitamin D and autoimmune thyroid disease', 'vitamin D AND autoimmune thyroid disease']
  ].forEach(([label, query]) => add(label, query, 'Topic'));

  document.getElementById('researchSuggestions').innerHTML = suggestions.map((item) => `<button class="research-suggestion" type="button" data-research-query="${escapeHtml(item.query)}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.type)}</small></button>`).join('');
}

function showScreen(name) {
  const target = document.querySelector(`[data-screen="${name}"]`);
  document.querySelectorAll('[data-screen]').forEach((tab) => { const active = tab === target; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  document.querySelectorAll('.screen').forEach((screen) => { const active = screen.id === `screen-${name}`; screen.hidden = !active; screen.classList.toggle('active', active); });
  if (name === 'labs') renderLabs();
  if (name === 'analysis') renderAnalysis(document.getElementById('analysisRoot'), { days: data.days, labs: data.labs || [], healthByDate: data.healthByDate || {}, symptoms: allSymptoms() });
  if (name === 'research') renderResearchSuggestions();
}
function setupTabs() {
  document.querySelectorAll('[data-screen]').forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.screen)));
}

document.getElementById('entryDate').addEventListener('click', openDatePicker);
document.getElementById('datePickerDialog').addEventListener('close', () => document.getElementById('entryDate').setAttribute('aria-expanded', 'false'));
document.getElementById('closeDatePicker').addEventListener('click', () => document.getElementById('datePickerDialog').close());
document.getElementById('previousCalendarMonth').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() - 1); renderDatePicker(); });
document.getElementById('nextCalendarMonth').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() + 1); renderDatePicker(); });
document.getElementById('calendarToday').addEventListener('click', () => { setDate(today()); document.getElementById('datePickerDialog').close(); });
document.getElementById('datePickerGrid').addEventListener('click', (event) => {
  const dayButton = event.target.closest('[data-calendar-date]');
  if (!dayButton) return;
  setDate(dayButton.dataset.calendarDate);
  document.getElementById('datePickerDialog').close();
});
document.getElementById('addRoutineGroupBtn').addEventListener('click', addRoutineGroup);
document.getElementById('addItemToSection').addEventListener('click', addItem);
document.getElementById('renameRoutineGroup').addEventListener('click', renameRoutineGroup);
document.getElementById('deleteRoutineGroup').addEventListener('click', deleteRoutineGroup);
document.getElementById('closeRoutineGroupMenu').addEventListener('click', () => document.getElementById('routineGroupMenu').close());
document.getElementById('routineGroupMenu').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.getElementById('addStoolEvent').addEventListener('click', () => { draft().stoolEvents.push({ id: uniqueId('stool'), time: '', form: '' }); saveDraft('checkin'); renderStoolEvents(); });
document.getElementById('applyQuickUpdate').addEventListener('click', applyQuickUpdate);
{ let quickTimer; document.getElementById('quickUpdate').addEventListener('input', () => { clearTimeout(quickTimer); quickTimer = setTimeout(applyQuickUpdate, 700); }); }
document.getElementById('addSymptom').addEventListener('click', addCustomSymptom);
document.getElementById('confirmQuickUpdate').addEventListener('click', confirmQuickUpdate);
document.getElementById('cancelQuickUpdate').addEventListener('click', cancelQuickUpdate);
document.getElementById('healthImport').addEventListener('change', (event) => importAppleHealth(event.target.files[0]));
document.getElementById('submitDay').addEventListener('click', submitDay);
document.getElementById('undoSubmission').addEventListener('click', undoSubmission);
document.getElementById('redoSubmission').addEventListener('click', redoSubmission);
document.getElementById('undoSubmissionDialog').addEventListener('click', undoSubmission);
document.getElementById('redoSubmissionDialog').addEventListener('click', redoSubmission);
document.getElementById('closeChallenge').addEventListener('click', () => document.getElementById('momentumDialog').close());
document.getElementById('momentumDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.getElementById('closeWisdom').addEventListener('click', () => { const overlay = document.getElementById('wisdomOverlay'); overlay.hidden = true; overlay.classList.remove('wisdom-show'); document.getElementById('resetPuzzle').focus(); });
document.getElementById('submitRoutinePart').addEventListener('click', submitRoutinePart);
document.getElementById('submitCheckinPart').addEventListener('click', submitCheckinPart);
document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
document.getElementById('labForm').addEventListener('submit', addLab);
document.getElementById('labProfileForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const ageValue = document.getElementById('labProfileAge').value;
  data.labProfile = { age: ageValue === '' ? '' : Number(ageValue), sex: document.getElementById('labProfileSex').value };
  saveData(); renderLabs(); toast('Reference profile saved on this device.');
});
document.getElementById('labCategoryTabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-lab-category]');
  if (!tab || tab.dataset.labCategory === activeLabCategory) return;
  activeLabCategory = tab.dataset.labCategory;
  renderLabs();
});
document.getElementById('renameLabCategory').addEventListener('click', renameLabCategory);
document.getElementById('deleteLabCategory').addEventListener('click', deleteLabCategory);
document.getElementById('closeLabCategoryMenu').addEventListener('click', () => document.getElementById('labCategoryMenu').close());
document.getElementById('labCategoryMenu').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.getElementById('labImport').addEventListener('change', (event) => { importLabs(event.target.files[0]); event.target.value = ''; });
document.getElementById('confirmLabPdfImport').addEventListener('click', confirmLabPdfImport);
document.getElementById('cancelLabPdfImport').addEventListener('click', () => { pendingLabRows = []; pendingLabImport = null; document.getElementById('labPdfReview').close(); });
document.getElementById('closeLabPdfReview').addEventListener('click', () => { pendingLabRows = []; pendingLabImport = null; document.getElementById('labPdfReview').close(); });
document.getElementById('labPdfReview').addEventListener('click', (event) => { if (event.target === event.currentTarget) { pendingLabRows = []; pendingLabImport = null; event.currentTarget.close(); } });
document.getElementById('labTimeFilter').addEventListener('change', renderLabs);
document.getElementById('detailTimeFilter').addEventListener('change', drawLabGraph);
document.getElementById('saveDesiredRange').addEventListener('click', saveMarkerRange);
document.getElementById('closeLabDialog').addEventListener('click', () => document.getElementById('labDetailDialog').close());
document.getElementById('labDetailDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.getElementById('researchForm').addEventListener('submit', searchPapers);
document.getElementById('researchSuggestions').addEventListener('click', (event) => {
  const suggestion = event.target.closest('[data-research-query]');
  if (!suggestion) return;
  document.getElementById('researchTopic').value = suggestion.dataset.researchQuery;
  document.getElementById('researchForm').requestSubmit();
});
document.getElementById('aiReviewButton').addEventListener('click', () => {
  if (!currentPublicPapers.length) return;
  const query = document.getElementById('researchTopic').value;
  const citations = currentPublicPapers.map((paper) => `${paper.title} (PMID ${paper.id}: https://pubmed.ncbi.nlm.nih.gov/${paper.id}/)`).join('\n');
  const prompt = `For this general public research question: ${query}\nCompare these public papers. Describe study type, main findings relevant to the question, limitations, and uncertainty. Distinguish association from causation, cite only sources you can verify, and do not give personal medical advice.\n\n${citations}`;
  if (confirm('This opens ChatGPT and shares only your general research question and public paper citations. No tracker data or lab records are included. Continue?')) window.open(`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`, '_blank', 'noopener,noreferrer');
});
document.getElementById('resetPuzzle').addEventListener('click', resetPuzzle);
document.getElementById('puzzleRatingInput').addEventListener('change', (event) => { const value = Number(event.target.value); if (value >= 400 && value <= 3000) { data.puzzle.targetRating = Math.round(value); saveData(); resetPuzzle(); } else event.target.value = data.puzzle.targetRating; });
document.getElementById('labDate').value = activeDate;
document.getElementById('labProfileAge').value = data.labProfile.age ?? '';
document.getElementById('labProfileSex').value = data.labProfile.sex ?? '';
migrateExistingLabCatalog();
setupTabs(); setupVoice(); setDate(activeDate); renderLabs(); renderMomentum(); renderPuzzle(); renderLocalCorrelations(); saveData();

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));