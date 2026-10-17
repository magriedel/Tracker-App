import { Chess } from './chess-engine.js';
import { interpretQuickUpdate } from './quick-update.js';
import { renderAnalysis } from './analysis.js';
import { WISDOM } from './wisdom.js';
import { readPdfLabRows } from './lab-pdf.js';

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
      const submittedDays = Object.fromEntries(Object.entries(saved.days).filter(([, day]) => day.submitted || Object.keys(day.parts || {}).length).map(([date, day]) => [date, { submitted: day.submitted, submissionHistory: day.submissionHistory || [], parts: day.parts || {} }]));
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
let activeDate = today();
let recognition = null;
let toastTimer;
let selectedSquare = null;
let currentPublicPapers = [];
let researchHasLoaded = false;
let activeRoutineGroup = TIME_GROUPS[0][0];
let pendingQuickUpdate = null;
let pendingQuickOverrides = null;
let routineGroupToManage = '';
let itemMenu = { id: '', moving: false };
let lastRoutineTap = { group: '', time: 0 };
let routineTabHoldTimer = null;
let suppressRoutineTabClick = false;
let pendingLabRows = [];

function saveData() {
  const submittedDays = Object.fromEntries(Object.entries(data.days).filter(([, day]) => day.submitted || Object.keys(day.parts || {}).length).map(([date, day]) => [date, { submitted: day.submitted, submissionHistory: day.submissionHistory || [], parts: day.parts || {} }]));
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ days: submittedDays, labs: data.labs || [], customItems: data.customItems || [], customSymptoms: data.customSymptoms || [], doseOverrides: data.doseOverrides || {}, routineOverrides: data.routineOverrides || {}, deletedRoutineItems: data.deletedRoutineItems || [], routineGroups: routineGroups(), desiredRanges: data.desiredRanges || {}, healthByDate: data.healthByDate || {}, puzzle: { ...data.puzzle, rating: undefined } }));
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

function getDay(date = activeDate) {
  if (!data.days[date]) {
    const prior = data.days[previousDay(date)];
    data.days[date] = { draft: makeDraft(combinedRoutine(), prior?.submitted), submitted: null, parts: {}, dirtySections: [] };
  } else if (!data.days[date].draft) {
    const day = data.days[date];
    const prior = data.days[previousDay(date)];
    const submitted = day.submitted;
    day.draft = makeDraft(combinedRoutine(), submitted || prior?.submitted);
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
  document.getElementById('fortuneReveal').hidden = true;
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
  const previous = day.parts[activeRoutineGroup]; const history = Array.isArray(previous) ? previous : previous ? [previous] : [];
  day.parts[activeRoutineGroup] = [...history, { items: draft().routine.filter((item) => item.group === activeRoutineGroup).map((item) => ({ ...item })), submittedAt: new Date().toISOString() }];
    day.dirtySections = (day.dirtySections || []).filter((section) => section !== `routine:${activeRoutineGroup}`);
  saveData(); updateStatus(); renderRoutine(); toast(`${activeRoutineGroup} saved for ${activeDate}.`);
}

function submitCheckinPart() {
  const day = getDay(); day.parts ||= {};
  const previous = day.parts.checkin; const history = Array.isArray(previous) ? previous : previous ? [previous] : [];
  day.parts.checkin = [...history, { entry: { energyLevel: draft().energyLevel, sleepQuality: draft().sleepQuality, symptoms: { ...draft().symptoms }, stoolEvents: JSON.parse(JSON.stringify(draft().stoolEvents)), notes: draft().notes, health: draft().health }, submittedAt: new Date().toISOString() }];
  day.dirtySections = (day.dirtySections || []).filter((section) => section !== 'checkin');
  saveData(); updateStatus(); toast(`Check-in saved for ${activeDate}.`);
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

function saveDraft(section = 'checkin') { const day = getDay(); day.draft = draft(); day.dirtySections ||= []; if (!day.dirtySections.includes(section)) day.dirtySections.push(section); day.dirty = true; updateStatus(); }
function updateStatus() {
  const day = getDay();
  const dirty = day.dirtySections?.length;
  const partCount = Object.keys(day.parts || {}).length;
  document.getElementById('submissionStatus').textContent = dirty ? `${day.dirtySections.length} section${dirty === 1 ? '' : 's'} not submitted` : day.submitted ? 'Submitted' : partCount ? `${partCount} part${partCount === 1 ? '' : 's'} saved · day open` : activeDate === today() ? 'Today is not submitted' : 'No submission for this date';
  document.getElementById('submissionStatus').classList.toggle('submitted', Boolean(day.submitted && !dirty));
}
function setDate(date) {
  if (pendingQuickUpdate) cancelQuickUpdate();
  activeRoutineGroup = routineGroups()[0];
  activeDate = date || today();
  getDay();
  if (data.healthByDate?.[activeDate]) draft().health = data.healthByDate[activeDate];
  document.getElementById('entryDate').value = activeDate;
  document.getElementById('quickUpdate').value = '';
  document.getElementById('quickUpdateStatus').textContent = 'Interpreted on this device. Review the updated fields before Submit.';
  bindDraftFields(); renderRoutine(); renderSymptoms(); renderStoolEvents(); renderHealthSummary(); updateStatus();
}

function submitDay() {
  const day = getDay();
  day.submissionHistory ||= [];
  if (day.submitted) day.submissionHistory.push(day.submitted);
  day.submitted = { ...JSON.parse(JSON.stringify(day.draft)), submittedAt: new Date().toISOString() };
  day.dirtySections = []; day.dirty = false;
  saveData(); updateStatus(); renderMomentum(); renderLocalCorrelations(); toast('Day submitted. It now counts in your record.');
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
  data.labs.forEach((lab) => { const key = lab.marker.trim().toLowerCase(); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(lab); });
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, entries]) => entries.sort((a, b) => a.date.localeCompare(b.date)));
}

function withinTimeframe(labs, days) {
  if (!days || days === 'all') return labs;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(days));
  return labs.filter((lab) => new Date(`${lab.date}T23:59:59`) >= cutoff);
}

function markerRange(marker) { return data.desiredRanges?.[marker.trim().toLowerCase()] || {}; }
function labRangeState(lab, range) {
  const low = range.low === '' || range.low === undefined ? null : Number(range.low);
  const high = range.high === '' || range.high === undefined ? null : Number(range.high);
  if (low === null && high === null) return 'unrated';
  return (low === null || Number(lab.value) >= low) && (high === null || Number(lab.value) <= high) ? 'in-range' : 'out-range';
}

function renderLabs() {
  const el = document.getElementById('labDashboard');
  const groups = groupLabs().map((entries) => withinTimeframe(entries, document.getElementById('labTimeFilter').value)).filter((entries) => entries.length);
  if (!groups.length) { el.innerHTML = '<div class="empty-state">No results in this time period. Try a wider filter or add a result.</div>'; return; }
  el.innerHTML = groups.map((entries) => {
    const newestFirst = entries.slice().reverse(); const range = markerRange(entries[0].marker);
    return `<section class="marker-table-section"><button class="marker-open" type="button" data-open-marker="${escapeHtml(entries[0].marker)}"><span class="marker-chevron">↗</span><span><strong>${escapeHtml(entries[0].marker)}</strong><small>Tap for chart · ${range.low !== undefined || range.high !== undefined ? `desired ${escapeHtml(range.low ?? '—')}–${escapeHtml(range.high ?? '—')}` : 'set desired range'}</small></span></button><div class="lab-table-wrap"><table class="lab-table"><thead><tr><th>Result</th>${newestFirst.map((lab) => `<th>${escapeHtml(lab.date)}</th>`).join('')}</tr></thead><tbody><tr><th>Value</th>${newestFirst.map((lab, index) => { const previous = newestFirst[index + 1]; const delta = previous ? Number(lab.value) - Number(previous.value) : null; const state = labRangeState(lab, range); return `<td class="${state}"><strong>${escapeHtml(lab.value)}</strong><small>${escapeHtml(lab.units)}</small><span class="range-state ${state}">${state === 'in-range' ? 'In range' : state === 'out-range' ? 'Out of range' : 'Not set'}</span>${delta !== null ? `<small class="lab-delta">${delta > 0 ? '+' : ''}${escapeHtml(delta.toFixed(2))} vs prior</small>` : '<small class="lab-delta">Baseline</small>'}<button type="button" class="text-button" data-remove-lab="${escapeHtml(lab.id)}" aria-label="Remove result from ${escapeHtml(lab.date)}">Remove</button></td>`; }).join('')}</tr></tbody></table></div></section>`;
  }).join('');
  el.querySelectorAll('[data-open-marker]').forEach((button) => button.addEventListener('click', () => openLabDashboard(button.dataset.openMarker)));
  el.querySelectorAll('[data-remove-lab]').forEach((button) => button.addEventListener('click', () => { data.labs = data.labs.filter((lab) => lab.id !== button.dataset.removeLab); saveData(); renderLabs(); renderLocalCorrelations(); }));
}

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
  const values = withinTimeframe(data.labs.filter((lab) => lab.marker.trim().toLowerCase() === selectedLabMarker.trim().toLowerCase()), days).sort((a, b) => a.date.localeCompare(b.date));
  if (!values.length) { container.innerHTML = '<div class="empty-state">No results in this time period.</div>'; return; }
  const width = 680, height = 280, pad = { left: 54, right: 22, top: 25, bottom: 45 };
  const numbers = values.map((lab) => Number(lab.value)); const range = markerRange(selectedLabMarker); [range.low, range.high].forEach((value) => { if (value !== undefined && value !== '' && Number.isFinite(Number(value))) numbers.push(Number(value)); });
  let min = Math.min(...numbers), max = Math.max(...numbers); if (min === max) { min -= 1; max += 1; } else { const breathingRoom = (max - min) * .12; min -= breathingRoom; max += breathingRoom; }
  const x = (index) => pad.left + index * (width - pad.left - pad.right) / Math.max(values.length - 1, 1);
  const y = (value) => pad.top + (max - Number(value)) * (height - pad.top - pad.bottom) / (max - min);
  const pointString = values.map((lab, index) => `${x(index)},${y(lab.value)}`).join(' ');
  const rangeLines = [range.low, range.high].filter((value) => value !== undefined && value !== '').map((value) => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(value)}" y2="${y(value)}" stroke="#b44f4f" stroke-dasharray="5 4"/><text x="${width - pad.right}" y="${y(value) - 5}" text-anchor="end" class="target-label">Target ${escapeHtml(value)}</text>`).join('');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(selectedLabMarker)} values over time"><line x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}" stroke="#cdd7d0"/><line x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${height - pad.bottom}" stroke="#cdd7d0"/>${rangeLines}<polyline points="${pointString}" fill="none" stroke="#245e4d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${values.map((lab, index) => `<circle cx="${x(index)}" cy="${y(lab.value)}" r="5" fill="${labRangeState(lab, range) === 'out-range' ? '#b44f4f' : '#245e4d'}"><title>${escapeHtml(lab.date)}: ${escapeHtml(lab.value)} ${escapeHtml(lab.units)}</title></circle><text x="${x(index)}" y="${height - 18}" text-anchor="middle" class="axis-label">${escapeHtml(lab.date.slice(5))}</text>`).join('')}<text x="${pad.left - 8}" y="${pad.top + 6}" text-anchor="end" class="axis-label">${escapeHtml(max.toFixed(1))}</text><text x="${pad.left - 8}" y="${height - pad.bottom}" text-anchor="end" class="axis-label">${escapeHtml(min.toFixed(1))}</text></svg><p class="fine-print">${values.length} result${values.length === 1 ? '' : 's'} shown. Desired range is user-defined and is not a treatment target.</p>`;
}

function saveMarkerRange() {
  const lowText = document.getElementById('detailDesiredLow').value, highText = document.getElementById('detailDesiredHigh').value;
  if (lowText !== '' && highText !== '' && Number(lowText) > Number(highText)) { toast('Desired low must be at or below desired high.'); return; }
  data.desiredRanges ||= {};
  data.desiredRanges[selectedLabMarker.trim().toLowerCase()] = { low: lowText === '' ? undefined : Number(lowText), high: highText === '' ? undefined : Number(highText) };
  saveData(); renderLabs(); drawLabGraph(); toast('Desired range saved on this device.');
}

function addLab(event) {
  event.preventDefault();
  const marker = document.getElementById('labMarker').value.trim();
  data.labs.push({ id: uniqueId('lab'), marker, date: document.getElementById('labDate').value, value: Number(document.getElementById('labValue').value), units: document.getElementById('labUnits').value.trim(), reference: document.getElementById('labReference').value.trim() });
  data.desiredRanges ||= {};
  const low = document.getElementById('labDesiredLow').value, high = document.getElementById('labDesiredHigh').value;
  if (low !== '' || high !== '') data.desiredRanges[marker.toLowerCase()] = { low: low === '' ? undefined : Number(low), high: high === '' ? undefined : Number(high) };
  saveData(); renderLabs(); renderLocalCorrelations(); event.target.reset(); document.querySelector('.lab-entry-details').open = false; toast('Lab result saved on this device.');
}

function parseLabText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const parsed = [];
  lines.forEach((line, index) => {
    const cells = line.split(/[\t,;]/).map((cell) => cell.trim().replace(/^"|"$/g, ''));
    if (index === 0 && /marker|test|name/i.test(cells[0])) return;
    if (cells.length >= 3 && cells[0] && cells[1] && !Number.isNaN(Number(cells[2]))) {
      parsed.push({ id: uniqueId(`lab-${index}`), marker: cells[0], date: cells[1], value: Number(cells[2]), units: cells[3] || '', reference: cells[4] || '' });
    }
  });
  return parsed;
}

function renderLabPdfReview(rows, fileName) {
  const body = document.getElementById('labPdfRows');
  body.innerHTML = rows.map((row, index) => `<tr data-pdf-row="${index}" data-flag="${escapeHtml(row.flag || '')}" data-flag-source="${escapeHtml(row.flagSource || '')}"><td><input type="checkbox" data-field="include" checked aria-label="Import ${escapeHtml(row.marker)} ${escapeHtml(row.resultPeriod || '')}" /></td><td>${escapeHtml(row.resultPeriod || 'Result')}</td><td><input type="text" data-field="marker" value="${escapeHtml(row.marker)}" aria-label="Marker" /></td><td><input type="date" data-field="date" value="${escapeHtml(row.date)}" aria-label="Result date" /></td><td><input type="number" step="any" data-field="value" value="${escapeHtml(row.value)}" aria-label="Result value" /></td><td>${escapeHtml(row.flag ? `${row.flag}${row.flagSource === 'reference interval' ? ' *' : ''}` : '—')}</td><td><input type="text" data-field="units" value="${escapeHtml(row.units)}" aria-label="Units" /></td><td><input type="text" data-field="reference" value="${escapeHtml(row.reference)}" aria-label="Reference range" /></td></tr>`).join('');
  document.getElementById('labPdfSummary').textContent = `${rows.length} possible result${rows.length === 1 ? '' : 's'} found in ${fileName}. Check and correct each row before adding. H/L flags are kept when present in text; * means inferred from the printed reference interval. PDF bold styling and alert icons may not be extractable from text.`;
  document.getElementById('labPdfReview').showModal();
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
  data.labs.push(...imported);
  saveData(); renderLabs(); renderLocalCorrelations();
  document.getElementById('labPdfReview').close();
  document.getElementById('labImportStatus').textContent = `${imported.length} result${imported.length === 1 ? '' : 's'} added from PDF. The file was read locally.`;
  pendingLabRows = [];
  toast(`${imported.length} PDF lab result${imported.length === 1 ? '' : 's'} imported locally.`);
}

async function importLabs(file) {
  if (!file) return;
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const status = document.getElementById('labImportStatus');
    status.textContent = 'Reading PDF text on this device…';
    try {
      const rows = await readPdfLabRows(file);
      if (!rows.length) { status.textContent = 'No lab rows were recognized. This can happen with a scanned PDF or a report layout/units the importer does not recognize; it does not necessarily mean the PDF is scanned. The file stayed on this device. Try selecting and copying report text to confirm it is searchable. A redacted sample PDF or copied result lines would help us adapt the importer.'; toast('No lab rows recognized; check whether text can be selected in the PDF.'); return; }
      pendingLabRows = rows;
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
  reader.onload = () => { const rows = parseLabText(String(reader.result)); if (!rows.length) { toast('No rows recognized. Use marker,date,value,units,reference columns.'); return; } data.labs.push(...rows); saveData(); renderLabs(); renderLocalCorrelations(); toast(`${rows.length} results imported locally.`); };
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
  [...new Set(data.labs.map((lab) => lab.marker))].forEach((marker) => measurements.push([`${marker} (lab within 30 days)`, (entry, date) => {
    const dayTime = new Date(`${date}T12:00:00`).getTime();
    const nearest = data.labs.filter((lab) => lab.marker.toLowerCase() === marker.toLowerCase()).map((lab) => ({ ...lab, distance: Math.abs(new Date(`${lab.date}T12:00:00`).getTime() - dayTime) / 86400000 })).filter((lab) => lab.distance <= 30).sort((a, b) => a.distance - b.distance)[0];
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
  event.preventDefault(); const query = document.getElementById('researchTopic').value; const results = document.getElementById('researchResults');
  if (!query) return;
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
}

function chooseResearchTopic() {
  const topic = document.getElementById('researchTopic');
  const submitted = Object.entries(data.days).flatMap(([, day]) => {
    if (day.submitted) return [day.submitted];
    const history = day.parts?.checkin; const latest = Array.isArray(history) ? history[history.length - 1]?.entry : history?.entry;
    return latest ? [latest] : [];
  });
  const recent = submitted.slice(-14);
  const averages = [...allSymptoms(), 'Sleep quality'].map((name) => {
    const key = name.toLowerCase(); const values = recent.map((entry) => Number(entry.symptoms?.[key])).filter(Number.isFinite);
    const metricValues = key === 'sleep quality' ? recent.map((entry) => Number(entry.sleepQuality)).filter(Number.isFinite) : values;
    return { key, average: metricValues.length ? metricValues.reduce((sum, value) => sum + value, 0) / metricValues.length : 0, coverage: metricValues.length };
  });
  const symptom = averages.filter((item) => item.coverage && item.average > 0).sort((a, b) => b.average - a.average)[0];
  let label = 'Graves disease AND thyroid antibodies';
  if (symptom?.key === 'palpitations') label = 'hyperthyroidism AND heart rate';
  else if (symptom?.key === 'sleep quality' || recent.some((entry) => entry.health?.sleepMinutes)) label = 'Graves disease AND sleep';
  else if (symptom?.key === 'digestion' || recent.some((entry) => entry.stoolEvents?.some((item) => item.form))) label = 'Graves disease AND gut microbiome';
  else if (symptom?.key === 'fatigue' || recent.some((entry) => entry.health?.exerciseMinutes)) label = 'Graves disease AND exercise fatigue';
  else if (data.labs.some((lab) => /t3|t4|tsh/i.test(lab.marker))) label = 'Graves disease AND thyroid antibodies';
  const option = [...topic.options].find((candidate) => candidate.value.toLowerCase() === label.toLowerCase() || candidate.textContent.toLowerCase() === label.toLowerCase());
  if (option) topic.value = option.value;
  else {
    const dynamic = document.createElement('option'); dynamic.value = label; dynamic.textContent = label.replace(/ AND /g, ' · '); topic.append(dynamic); topic.value = label;
  }
  return label;
}

function showScreen(name) {
  const target = document.querySelector(`[data-screen="${name}"]`);
  document.querySelectorAll('[data-screen]').forEach((tab) => { const active = tab === target; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
  document.querySelectorAll('.screen').forEach((screen) => { const active = screen.id === `screen-${name}`; screen.hidden = !active; screen.classList.toggle('active', active); });
  if (name === 'analysis') renderAnalysis(document.getElementById('analysisRoot'), { days: data.days, labs: data.labs || [], symptoms: allSymptoms() });
  if (name === 'research') { researchHasLoaded = true; chooseResearchTopic(); searchPapers({ preventDefault() {} }); }
}
function setupTabs() {
  document.querySelectorAll('[data-screen]').forEach((button) => button.addEventListener('click', () => showScreen(button.dataset.screen)));
}

document.getElementById('entryDate').addEventListener('change', (event) => setDate(event.target.value));
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
document.getElementById('closeChallenge').addEventListener('click', () => document.getElementById('momentumDialog').close());
document.getElementById('momentumDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.getElementById('closeWisdom').addEventListener('click', () => { const overlay = document.getElementById('wisdomOverlay'); overlay.hidden = true; overlay.classList.remove('wisdom-show'); document.getElementById('resetPuzzle').focus(); });
document.getElementById('submitRoutinePart').addEventListener('click', submitRoutinePart);
document.getElementById('submitCheckinPart').addEventListener('click', submitCheckinPart);
document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
document.getElementById('labForm').addEventListener('submit', addLab);
document.getElementById('labImport').addEventListener('change', (event) => { importLabs(event.target.files[0]); event.target.value = ''; });
document.getElementById('confirmLabPdfImport').addEventListener('click', confirmLabPdfImport);
document.getElementById('cancelLabPdfImport').addEventListener('click', () => { pendingLabRows = []; document.getElementById('labPdfReview').close(); });
document.getElementById('closeLabPdfReview').addEventListener('click', () => { pendingLabRows = []; document.getElementById('labPdfReview').close(); });
document.getElementById('labPdfReview').addEventListener('click', (event) => { if (event.target === event.currentTarget) { pendingLabRows = []; event.currentTarget.close(); } });
document.getElementById('labTimeFilter').addEventListener('change', renderLabs);
document.getElementById('detailTimeFilter').addEventListener('change', drawLabGraph);
document.getElementById('saveDesiredRange').addEventListener('click', saveMarkerRange);
document.getElementById('closeLabDialog').addEventListener('click', () => document.getElementById('labDetailDialog').close());
document.getElementById('labDetailDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.getElementById('researchForm').addEventListener('submit', searchPapers);
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
setupTabs(); setupVoice(); setDate(activeDate); renderLabs(); renderMomentum(); renderPuzzle(); renderLocalCorrelations(); saveData();

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));