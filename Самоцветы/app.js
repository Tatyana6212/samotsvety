'use strict';
const rules = window.GemRules;
const { LEVELS, evaluateLevel } = window.GemCampaign;
const audio = new window.GemAudio();
const names = ['Розовый ромб', 'Голубой круг', 'Зелёный кристалл', 'Золотой треугольник', 'Фиолетовый кристалл', 'Оранжевый кристалл'];
const BEST_KEY = 'gems-match3-best-v1';
const SCENE_KEY = 'gems-match3-scene-v1';
const $ = id => document.getElementById(id);
const ui = { board: $('board'), gemLayer: $('gem-layer'), effects: $('effects'), score: $('score'), best: $('best-score'), startBest: $('start-best'), status: $('status'), cheer: $('cheer'), combo: $('combo-badge'), moves: $('moves'), levelLabel: $('level-label'), levelName: $('level-name'), goal: $('goal-copy'), progress: $('progress-fill'), missions: $('mission-list'), timerBox: $('timer-box'), timer: $('timer'), sceneToggle: $('scene-toggle'), pauseButton: $('pause-button'), pauseOverlay: $('pause-overlay'), resume: $('resume-button'), pauseNew: $('pause-new-game'), audio: $('audio-toggle'), finalScore: $('final-score'), finalBest: $('final-best'), resultTitle: $('result-title'), resultKicker: $('result-kicker'), resultMessage: $('result-message'), resultEmblem: $('result-emblem'), next: $('next-level'), again: $('play-again'), hammer: $('hammer'), shuffle: $('shuffle'), freeSwap: $('free-swap'), hammerCount: $('hammer-count'), shuffleCount: $('shuffle-count'), swapCount: $('swap-count') };
const screens = { start: $('start-screen'), game: $('game-screen'), result: $('result-screen') };
const DIFFICULTIES = {
  easy: { types: 3, moveBonus: 5, goalScale: .7, obstacles: .55 },
  normal: { types: 5, moveBonus: 0, goalScale: 1, obstacles: 1 },
  hard: { types: 6, moveBonus: -4, goalScale: 1.35, obstacles: 1.45 }
};
let board = [], gemNodes = [], specials = Array(64), obstacles = new Map(), selected = null, score = 0, levelIndex = 0, levelStartScore = 0;
let movesLeft = LEVELS[0].moves, busy = true, generation = 0, cheerTimer = 0, cheerIndex = 0;
let gameMode = 'campaign', difficultyName = 'normal', difficulty = DIFFICULTIES.normal;
let missions = [], collected = Array(6).fill(0), activeBooster = null, boosterUses = { hammer: 1, shuffle: 1, swap: 1 };
let timerLeft = 60, timerId = 0, timerRemainingMs = 60000, timerStartedAt = 0;
let paused = false, pendingOutcome = null;
let gesture = null, suppressPointerClick = false;
const cells = [];
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const delay = ms => new Promise(resolve => window.setTimeout(resolve, reducedMotion ? 0 : ms));
let bestScore = readBest();

function readBest() {
  try { const value = Number.parseInt(localStorage.getItem(BEST_KEY) || '0', 10); return Number.isFinite(value) && value > 0 ? value : 0; } catch { return 0; }
}
function saveBest() {
  if (score <= bestScore) return;
  bestScore = score;
  try { localStorage.setItem(BEST_KEY, String(bestScore)); } catch {}
  renderScores();
}
function showScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => {
    const active = key === name;
    screen.classList.toggle('is-active', active);
    screen.setAttribute('aria-hidden', String(!active));
    if ('inert' in screen) screen.inert = !active;
  });
  document.body.dataset.screen = name;
}
for (let i = 0; i < 64; i++) {
  const cell = document.createElement('button');
  cell.type = 'button'; cell.className = 'cell';
  cell.addEventListener('click', event => {
    if (suppressPointerClick && event.detail > 0) { suppressPointerClick = false; return; }
    select(i).catch(recoverFromMoveError);
  });
  cell.addEventListener('keydown', event => {
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    const target = i + offsets[event.key];
    if (target >= 0 && target < 64 && rules.adjacent(i, target)) cells[target].focus();
  });
  ui.board.append(cell); cells.push(cell);
}
ui.board.addEventListener('pointerdown', event => {
  const cell = event.target.closest?.('.cell');
  if (!cell || busy || paused) return;
  gesture = { index: cells.indexOf(cell), x: event.clientX, y: event.clientY, pointerId: event.pointerId };
});
ui.board.addEventListener('pointerup', event => {
  if (!gesture || event.pointerId !== gesture.pointerId || busy || paused) return;
  const { index, x, y } = gesture;
  gesture = null;
  const dx = event.clientX - x, dy = event.clientY - y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
  const target = Math.abs(dx) > Math.abs(dy) ? index + Math.sign(dx) : index + Math.sign(dy) * 8;
  if (target < 0 || target >= 64 || !rules.adjacent(index, target)) return;
  suppressPointerClick = true;
  window.setTimeout(() => { suppressPointerClick = false; }, 120);
  selected = index;
  render();
  select(target).catch(recoverFromMoveError);
});
ui.board.addEventListener('pointercancel', () => { gesture = null; });
function recoverFromMoveError(error) {
  console.error('Ошибка хода:', error);
  busy = false;
  selected = null;
  ui.status.textContent = 'Попробуйте ход ещё раз';
  render();
  renderBoosters();
}
function playSound(name, ...args) {
  try { audio[name]?.(...args); } catch (error) { console.warn('Звуковой эффект недоступен:', error); }
}
function makeGem(type) {
  const slot = document.createElement('span');
  slot.className = 'gem-slot';
  const gem = document.createElement('span');
  gem.className = `gem gem-${type}`; gem.setAttribute('aria-hidden', 'true');
  slot.append(gem);
  return slot;
}
function renderScores() {
  const current = score.toLocaleString('ru-RU'), best = bestScore.toLocaleString('ru-RU');
  if (ui.score.textContent !== current) ui.score.textContent = current;
  if (ui.best.textContent !== best) ui.best.textContent = best;
  if (ui.startBest.textContent !== best) ui.startBest.textContent = best;
}
let geometry = null;
function measureBoard() {
  if (!cells.length) return;
  geometry = {
    x: cells[0].offsetLeft, y: cells[0].offsetTop,
    stepX: cells[1].offsetLeft - cells[0].offsetLeft,
    stepY: cells[8].offsetTop - cells[0].offsetTop,
    size: cells[0].offsetWidth
  };
  ui.gemLayer.style.setProperty('--gem-size', `${geometry.size}px`);
}
function positionFor(index) {
  if (!geometry) measureBoard();
  return { left: geometry.x + index % 8 * geometry.stepX, top: geometry.y + Math.floor(index / 8) * geometry.stepY };
}
function placeGem(node, index) {
  const point = positionFor(index);
  const target = `translate3d(${point.left}px, ${point.top}px, 0)`;
  if (node.style.transform !== target) node.style.transform = target;
}
function render() {
  if (!geometry) measureBoard();
  cells.forEach((cell, i) => {
    const obstacle = obstacles.get(i), special = specials[i];
    const cellClass = 'cell' + (selected === i ? ' selected' : '') + (obstacle ? ` obstacle obstacle-${obstacle.type}${obstacle.type === 'stone' && obstacle.hp === 1 ? ' is-damaged' : ''}` : '') + (special ? ` has-special special-${special.type}` : '');
    if (cell.className !== cellClass) cell.className = cellClass;
    if (board[i] !== null) {
      if (!gemNodes[i]) gemNodes[i] = makeGem(board[i]);
      const node = gemNodes[i];
      const slotClass = 'gem-slot' + (selected === i ? ' is-selected' : '') + (special ? ' is-special' : '');
      const gemClass = `gem gem-${board[i]}`;
      if (node.className !== slotClass) node.className = slotClass;
      if (node.firstElementChild.className !== gemClass) node.firstElementChild.className = gemClass;
      if (node.parentElement !== ui.gemLayer) ui.gemLayer.append(node);
      placeGem(node, i);
      if (cell.firstElementChild) cell.replaceChildren();
    } else {
      gemNodes[i]?.remove();
      gemNodes[i] = null;
      if (!cell.querySelector('.blocker')) {
        const blocker = document.createElement('span'); blocker.className = 'blocker'; blocker.setAttribute('aria-hidden', 'true'); cell.replaceChildren(blocker);
      }
    }
    const label = board[i] === null ? obstacleLabel(obstacle) : names[board[i]] + (special ? `, особый: ${specialLabel(special.type)}` : '');
    const ariaLabel = `${label}, строка ${Math.floor(i / 8) + 1}, столбец ${i % 8 + 1}`;
    const pressed = String(selected === i);
    if (cell.getAttribute('aria-label') !== ariaLabel) cell.setAttribute('aria-label', ariaLabel);
    if (cell.getAttribute('aria-pressed') !== pressed) cell.setAttribute('aria-pressed', pressed);
    if (cell.disabled !== (busy || paused)) cell.disabled = busy || paused;
  });
  renderScores(); ui.board.setAttribute('aria-busy', String(busy));
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
  measureBoard();
  gemNodes.forEach((node, index) => { if (node) placeGem(node, index); });
}).observe(ui.board);
else window.addEventListener('resize', () => { measureBoard(); gemNodes.forEach((node, index) => { if (node) placeGem(node, index); }); });
function obstacleLabel(obstacle) {
  return obstacle?.type === 'crate' ? 'Ящик' : obstacle?.type === 'stone' ? 'Каменная клетка' : 'Препятствие';
}
function specialLabel(type) {
  return type === 'row' ? 'взрыв строки' : type === 'col' ? 'взрыв столбца' : 'цветная звезда';
}
function renderLevel() {
  const level = LEVELS[levelIndex], stageScore = Math.max(0, score - levelStartScore);
  ui.levelLabel.textContent = gameMode === 'timed' ? 'Режим на время' : `Этап ${levelIndex + 1} из ${LEVELS.length}`;
  ui.levelName.textContent = gameMode === 'timed' ? 'Испытание времени' : level.name; ui.moves.textContent = gameMode === 'timed' ? '∞' : movesLeft;
  ui.moves.parentElement.classList.toggle('is-low', movesLeft <= 3);
  const done = missions.reduce((sum, mission) => sum + Math.min(1, missionProgress(mission) / mission.target), 0);
  ui.goal.textContent = gameMode === 'timed' ? 'Максимум очков' : `${Math.round(done * 100 / Math.max(1, missions.length))}% целей`;
  ui.progress.style.width = `${gameMode === 'timed' ? timerLeft / 60 * 100 : done / Math.max(1, missions.length) * 100}%`;
  renderMissions();
}
function missionProgress(mission) {
  if (mission.type === 'score') return score - levelStartScore;
  if (mission.type === 'collect' || mission.type === 'destroy') return collected[mission.color] || 0;
  return mission.progress || 0;
}
function renderMissions() {
  ui.missions.replaceChildren();
  if (gameMode === 'timed') {
    const item = document.createElement('span'); item.className = 'mission-chip'; item.textContent = 'Наберите максимум очков'; ui.missions.append(item); return;
  }
  missions.forEach(mission => {
    const progress = Math.min(mission.target, missionProgress(mission));
    const item = document.createElement('span'); item.className = 'mission-chip' + (progress >= mission.target ? ' is-done' : '');
    if (mission.type === 'collect') item.innerHTML = `<i class="mini-gem gem-${mission.color}"></i><b>Собрать ${progress}/${mission.target}</b>`;
    else if (mission.type === 'destroy') item.innerHTML = `<i class="mini-gem gem-${mission.color}"></i><b>Уничтожить ${progress}/${mission.target}</b>`;
    else if (mission.type === 'obstacle') item.innerHTML = `<i class="mission-icon">✦</i><b>Преграды ${progress}/${mission.target}</b>`;
    else item.innerHTML = `<i class="mission-icon">★</i><b>${progress.toLocaleString('ru-RU')}/${mission.target.toLocaleString('ru-RU')}</b>`;
    ui.missions.append(item);
  });
}
function buildMissions() {
  const scale = difficulty.goalScale;
  const chapter = Math.floor(levelIndex / 3), phase = levelIndex % 3;
  if (phase === 0) return [{ type: 'collect', color: 1 % difficulty.types, target: Math.ceil((20 + chapter * 2) * scale) }];
  if (phase === 1) return [
    { type: 'destroy', color: 0, target: Math.ceil((10 + chapter * 2) * scale) },
    { type: 'obstacle', target: Math.min(10, Math.ceil((4 + chapter) * scale)), progress: 0 }
  ];
  return [
    { type: 'score', target: Math.ceil(LEVELS[levelIndex].target * scale / 50) * 50 },
    { type: 'collect', color: 2 % difficulty.types, target: Math.ceil((12 + chapter) * scale) }
  ];
}
function solidBlocks() {
  return new Set([...obstacles].filter(([, value]) => value.solid).map(([index]) => index));
}
function setupObstacles() {
  obstacles = new Map();
  if (gameMode === 'timed') return;
  const patterns = [
    [{ i: 18, type: 'ice' }, { i: 21, type: 'ice' }, { i: 42, type: 'ice' }, { i: 45, type: 'ice' }],
    [{ i: 19, type: 'crate', solid: true, hp: 1 }, { i: 20, type: 'chain' }, { i: 27, type: 'ice' }, { i: 28, type: 'crate', solid: true, hp: 1 }, { i: 35, type: 'chain' }, { i: 36, type: 'ice' }],
    [{ i: 18, type: 'stone', solid: true, hp: 2 }, { i: 21, type: 'chain' }, { i: 27, type: 'ice' }, { i: 28, type: 'stone', solid: true, hp: 2 }, { i: 35, type: 'chain' }, { i: 36, type: 'ice' }, { i: 42, type: 'stone', solid: true, hp: 2 }, { i: 45, type: 'chain' }]
  ];
  const pattern = patterns[levelIndex % patterns.length];
  const count = Math.max(2, Math.min(pattern.length, Math.round((2 + Math.floor(levelIndex / 3)) * difficulty.obstacles)));
  pattern.slice(0, count).forEach(item => obstacles.set(item.i, { type: item.type, solid: !!item.solid, hp: item.hp || 1 }));
}
function renderBoosters() {
  ui.hammerCount.textContent = boosterUses.hammer; ui.shuffleCount.textContent = boosterUses.shuffle; ui.swapCount.textContent = boosterUses.swap;
  ui.hammer.disabled = boosterUses.hammer < 1 || busy || paused; ui.shuffle.disabled = boosterUses.shuffle < 1 || busy || paused; ui.freeSwap.disabled = boosterUses.swap < 1 || busy || paused;
  [ui.hammer, ui.freeSwap].forEach(button => button.classList.toggle('is-active', button.dataset.booster === activeBooster));
}
function takePositions(nodes = gemNodes) {
  const positions = new Map();
  nodes.forEach((node, index) => { if (node) positions.set(node, positionFor(index)); });
  return positions;
}
function animateFrom(positions, nodes, duration = 190) {
  const effectiveDuration = reducedMotion ? 1 : duration;
  return Promise.all(nodes.map(node => {
    const from = positions.get(node); if (!from) return Promise.resolve();
    const index = gemNodes.indexOf(node);
    if (index < 0) return Promise.resolve();
    const to = positionFor(index), dx = from.left - to.left, dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return Promise.resolve();
    const origin = `translate3d(${from.left}px, ${from.top}px, 0)`;
    const destination = `translate3d(${to.left}px, ${to.top}px, 0)`;
    if (node.animate) {
      const animation = node.animate([{ transform: origin }, { transform: destination }], { duration: effectiveDuration, easing: 'cubic-bezier(.2,.8,.2,1)' });
      return animation.finished.catch(() => {});
    }
    return new Promise(resolve => {
      node.style.transition = 'none';
      node.style.transform = origin;
      void node.offsetWidth;
      requestAnimationFrame(() => {
        node.style.transition = `transform ${effectiveDuration}ms cubic-bezier(.2,.8,.2,1)`;
        node.style.transform = destination;
        window.setTimeout(() => { node.style.transition = ''; resolve(); }, effectiveDuration + 20);
      });
    });
  }));
}
function scatter(match, cascade) {
  if (reducedMotion) return;
  const overlay = ui.effects.getBoundingClientRect(), count = Math.min(4, 2 + cascade);
  match.forEach(index => {
    const rect = cells[index].getBoundingClientRect();
    for (let n = 0; n < count; n++) {
      const angle = Math.PI * 2 * n / count + Math.random() * .45, distance = 18 + cascade * 4 + Math.random() * 13;
      const spark = document.createElement('i'); spark.className = 'spark';
      spark.style.left = `${rect.left + rect.width / 2 - overlay.left}px`; spark.style.top = `${rect.top + rect.height / 2 - overlay.top}px`;
      spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`); spark.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
      spark.style.setProperty('--spark-delay', `${Math.random() * 45}ms`); spark.style.setProperty('--spark-time', `${310 + Math.min(cascade, 5) * 38}ms`);
      ui.effects.append(spark); spark.addEventListener('animationend', () => spark.remove(), { once: true });
    }
  });
}
function collapseWithMotion(removed) {
  const positions = takePositions(), next = Array(64), fresh = [], falling = [];
  removed.forEach(index => gemNodes[index]?.remove());
  for (let col = 0; col < 8; col++) {
    let start = 0;
    for (let boundary = 0; boundary <= 8; boundary++) {
      const blockIndex = boundary < 8 ? boundary * 8 + col : -1;
      if (boundary < 8 && !obstacles.get(blockIndex)?.solid) continue;
      const survivors = [];
      for (let row = start; row < boundary; row++) {
        const index = row * 8 + col;
        if (!removed.has(index) && gemNodes[index]) survivors.push({ index, node: gemNodes[index] });
      }
      const missing = boundary - start - survivors.length;
      for (let row = start; row < start + missing; row++) {
        const index = row * 8 + col, node = makeGem(board[index]); next[index] = node; fresh.push({ node, row, distance: start + missing - row, col });
      }
      survivors.forEach(({ index: oldIndex, node }, offset) => {
        const row = start + missing + offset, index = row * 8 + col; next[index] = node; falling.push(node); positions.set(node, positionFor(oldIndex));
      });
      if (boundary < 8) next[blockIndex] = null;
      start = boundary + 1;
    }
  }
  gemNodes = next; render();
  const entering = fresh.map(({ node, row, distance, col }) => {
    const target = positionFor(row * 8 + col);
    positions.set(node, { left: target.left, top: target.top - distance * geometry.stepY }); return node;
  });
  return animateFrom(positions, [...falling, ...entering], 245);
}
function collapseSpecials(removed) {
  const next = Array(64);
  for (let col = 0; col < 8; col++) {
    let start = 0;
    for (let boundary = 0; boundary <= 8; boundary++) {
      const blockIndex = boundary < 8 ? boundary * 8 + col : -1;
      if (boundary < 8 && !obstacles.get(blockIndex)?.solid) continue;
      const survivors = [];
      for (let row = start; row < boundary; row++) {
        const index = row * 8 + col;
        if (!removed.has(index) && board[index] !== null) survivors.push(specials[index] || null);
      }
      const missing = boundary - start - survivors.length;
      survivors.forEach((special, offset) => { next[(start + missing + offset) * 8 + col] = special; });
      start = boundary + 1;
    }
  }
  specials = next;
}
function expandSpecials(removed, colorHint) {
  const queue = [...removed], activated = new Set();
  while (queue.length) {
    const index = queue.pop(), special = specials[index];
    if (!special || activated.has(index)) continue;
    activated.add(index);
    const add = target => { if (!solidBlocks().has(target) && !removed.has(target)) { removed.add(target); queue.push(target); } };
    if (special.type === 'row') for (let col = 0; col < 8; col++) add(Math.floor(index / 8) * 8 + col);
    if (special.type === 'col') for (let row = 0; row < 8; row++) add(row * 8 + index % 8);
    if (special.type === 'color') board.forEach((color, target) => { if (color === colorHint) add(target); });
  }
}
function damageObstacles(removed) {
  let destroyed = 0;
  const hit = new Set();
  removed.forEach(index => {
    const candidates = [index, index - 8, index + 8, index - 1, index + 1];
    candidates.forEach(target => {
      if (target < 0 || target >= 64 || (Math.abs(target % 8 - index % 8) > 1)) return;
      if (obstacles.has(target)) hit.add(target);
    });
  });
  hit.forEach(index => {
    const obstacle = obstacles.get(index);
    obstacle.hp--;
    if (obstacle.hp <= 0) { obstacles.delete(index); destroyed++; }
  });
  const mission = missions.find(item => item.type === 'obstacle');
  if (mission) mission.progress += destroyed;
  return destroyed;
}
function prepareMatch(details, preferredIndex) {
  const removed = new Set(details.cells);
  expandSpecials(removed, board[preferredIndex]);
  let created = null;
  const bestRun = [...details.runs].sort((a, b) => b.cells.length - a.cells.length)[0];
  if (bestRun?.cells.length >= 4) {
    const index = bestRun.cells.includes(preferredIndex) ? preferredIndex : bestRun.cells[Math.floor(bestRun.cells.length / 2)];
    created = { index, special: { type: bestRun.cells.length >= 5 ? 'color' : bestRun.axis } };
    removed.delete(index);
  }
  if (details.shaped) {
    score += 250;
    ui.status.textContent = 'Особая форма! +250 очков';
    showCheer(3);
  }
  return { removed, created, shaped: details.shaped };
}
function showCheer(cascade) {
  const phrases = cascade >= 4 ? ['Невероятно!', 'Это великолепно!', 'Идеально!'] : cascade >= 3 ? ['Невероятно!', 'Супер!', 'Вот это серия!'] : cascade === 2 ? ['Каскад!', 'Супер!', 'Отлично!'] : ['Отлично!', 'Супер!', 'Красиво!'];
  ui.cheer.textContent = phrases[cheerIndex++ % phrases.length];
  ui.cheer.style.setProperty('--cheer-time', `${cascade >= 3 ? 1200 : 980}ms`);
  ui.cheer.classList.remove('cheer-show'); void ui.cheer.offsetWidth; ui.cheer.classList.add('cheer-show');
  ui.combo.textContent = `×${Math.min(4, Math.max(2, cascade))}`;
  ui.combo.classList.toggle('is-visible', cascade > 1);
  clearTimeout(cheerTimer); cheerTimer = setTimeout(() => {
    ui.cheer.classList.remove('cheer-show');
    ui.combo.classList.remove('is-visible');
  }, cascade >= 3 ? 1250 : 1030);
}
function resetBoard() {
  generation++; selected = null; busy = false; clearTimeout(cheerTimer); ui.cheer.classList.remove('cheer-show'); ui.combo.classList.remove('is-visible'); ui.effects.replaceChildren();
  gemNodes.forEach(node => node?.getAnimations?.().forEach(animation => animation.cancel()));
  ui.gemLayer.replaceChildren();
  setupObstacles(); const blocked = solidBlocks();
  board = rules.createBoard(difficulty.types, blocked); gemNodes = Array(64); specials = Array(64);
  ui.status.textContent = 'Выберите самоцвет и его соседа'; render(); renderBoosters();
}
function startCampaign() {
  paused = false; pendingOutcome = null; ui.pauseOverlay.hidden = true;
  if (audio.resume) audio.resume(); else audio.unlock();
  clearInterval(timerId);
  gameMode = document.querySelector('input[name="mode"]:checked')?.value || 'campaign';
  difficultyName = document.querySelector('input[name="difficulty"]:checked')?.value || 'normal';
  difficulty = DIFFICULTIES[difficultyName];
  score = 0; levelIndex = 0; levelStartScore = 0; collected = Array(6).fill(0); boosterUses = { hammer: 1, shuffle: 1, swap: 1 }; activeBooster = null;
  movesLeft = Math.max(6, LEVELS[0].moves + difficulty.moveBonus); missions = gameMode === 'timed' ? [] : buildMissions(); timerLeft = 60; timerRemainingMs = 60000;
  ui.timerBox.hidden = gameMode !== 'timed'; renderLevel(); resetBoard();
  const token = generation;
  requestAnimationFrame(() => { if (token === generation) showScreen('game'); });
  if (gameMode === 'timed') startTimer();
}
function startLevel() {
  paused = false; pendingOutcome = null; ui.pauseOverlay.hidden = true;
  levelIndex++; levelStartScore = score; collected = Array(6).fill(0); movesLeft = Math.max(6, LEVELS[levelIndex].moves + difficulty.moveBonus);
  missions = buildMissions(); renderLevel(); resetBoard(); ui.status.textContent = 'Новый этап — удачи!'; audio.levelStart?.();
  const token = generation;
  requestAnimationFrame(() => { if (token === generation) showScreen('game'); });
}
function startTimer() {
  timerRemainingMs = 60000; timerLeft = 60; ui.timer.textContent = '1:00'; ui.timerBox.classList.remove('is-low');
  resumeTimer();
}
function resumeTimer() {
  clearInterval(timerId);
  timerStartedAt = Date.now();
  timerId = setInterval(() => {
    if (paused) return;
    const remaining = Math.max(0, timerRemainingMs - (Date.now() - timerStartedAt));
    const seconds = Math.ceil(remaining / 1000);
    if (seconds !== timerLeft) {
      timerLeft = seconds;
      ui.timer.textContent = `0:${String(seconds).padStart(2, '0')}`;
      ui.timerBox.classList.toggle('is-low', seconds <= 10);
      renderLevel();
    }
    if (remaining <= 0) { clearInterval(timerId); timerId = 0; generation++; showResult('timed'); }
  }, 100);
}
function pauseTimer() {
  if (gameMode !== 'timed') return;
  timerRemainingMs = Math.max(0, timerRemainingMs - (Date.now() - timerStartedAt));
  clearInterval(timerId); timerId = 0;
}
function pauseGame() {
  if (paused || !screens.game.classList.contains('is-active')) return;
  paused = true; gesture = null; pauseTimer();
  if (audio.pause) audio.pause(); else audio.stopAmbience?.();
  ui.pauseOverlay.hidden = false; render(); renderBoosters(); ui.resume.focus();
}
function resumeGame() {
  if (!paused) return;
  paused = false; ui.pauseOverlay.hidden = true;
  if (audio.resume) audio.resume(); else audio.unlock();
  if (pendingOutcome) { const outcome = pendingOutcome; pendingOutcome = null; showResult(outcome); return; }
  if (gameMode === 'timed') resumeTimer();
  render(); renderBoosters(); ui.pauseButton.focus();
}
function showResult(kind) {
  clearInterval(timerId); timerId = 0; paused = false; pendingOutcome = null; ui.pauseOverlay.hidden = true;
  busy = true; render(); renderBoosters(); saveBest();
  ui.finalScore.textContent = score.toLocaleString('ru-RU'); ui.finalBest.textContent = bestScore.toLocaleString('ru-RU');
  const level = LEVELS[levelIndex];
  if (kind === 'timed') {
    ui.resultKicker.textContent = 'ВРЕМЯ ВЫШЛО'; ui.resultTitle.textContent = score >= 1500 ? 'Блестящий результат!' : 'Испытание завершено';
    ui.resultMessage.textContent = 'За 60 секунд вы собрали целое созвездие самоцветов.'; ui.resultEmblem.textContent = '◷';
    ui.next.hidden = true; ui.again.hidden = false; audio.levelComplete?.();
  } else if (kind === 'level-up') {
    ui.resultKicker.textContent = `ЭТАП ${levelIndex + 1} ПРОЙДЕН`; ui.resultTitle.textContent = 'Прекрасная работа!';
    ui.resultMessage.textContent = `${level.name} покорён. Впереди — ${LEVELS[levelIndex + 1].name}.`; ui.resultEmblem.textContent = '✦';
    ui.next.hidden = false; ui.again.hidden = true; audio.levelComplete?.();
  } else if (kind === 'complete') {
    ui.resultKicker.textContent = 'ВСЕ ЭТАПЫ ПРОЙДЕНЫ'; ui.resultTitle.textContent = 'Невероятно!';
    ui.resultMessage.textContent = 'Хранилище сияет ярче прежнего. Вы стали настоящим мастером самоцветов.'; ui.resultEmblem.textContent = '♛';
    ui.next.hidden = true; ui.again.hidden = false; audio.victory?.();
  } else {
    ui.resultKicker.textContent = `ЭТАП ${levelIndex + 1} ЗАВЕРШЁН`; ui.resultTitle.textContent = 'Почти получилось';
    ui.resultMessage.textContent = 'Ходы закончились раньше, чем были выполнены все задания этапа.'; ui.resultEmblem.textContent = '◆';
    ui.next.hidden = true; ui.again.hidden = false; audio.gameOver?.();
  }
  showScreen('result');
}
async function finishTurn(token) {
  if (token !== generation) return;
  saveBest(); renderLevel();
  if (gameMode === 'timed') { busy = false; render(); renderBoosters(); return; }
  const goalsDone = missions.every(mission => missionProgress(mission) >= mission.target);
  const outcome = goalsDone ? (levelIndex === LEVELS.length - 1 ? 'complete' : 'level-up') : (movesLeft <= 0 ? 'game-over' : 'playing');
  if (outcome !== 'playing') {
    await delay(220);
    if (token === generation) {
      if (paused) pendingOutcome = outcome;
      else showResult(outcome);
    }
    return;
  }
  if (!rules.hasMove(board, solidBlocks())) { board = rules.createBoard(difficulty.types, solidBlocks()); ui.gemLayer.replaceChildren(); gemNodes = Array(64); specials = Array(64); ui.status.textContent = 'Поле перемешано — новых ходов стало больше'; }
  busy = false; render(); renderBoosters();
}
async function select(index) {
  if (busy || paused) return;
  if (activeBooster === 'hammer') { await useHammer(index); return; }
  if (obstacles.get(index)?.solid || obstacles.get(index)?.type === 'chain') { ui.status.textContent = 'Сначала разрушьте преграду комбинацией рядом'; playSound('invalid'); return; }
  if (selected === index) { playSound('select'); selected = null; render(); return; }
  if (selected === null || (!rules.adjacent(selected, index) && activeBooster !== 'swap')) { playSound('select'); selected = index; render(); return; }
  const first = selected, token = generation; selected = null; busy = true; movesLeft--; renderLevel(); playSound('swap');
  ui.status.textContent = 'Перестановка…';
  renderBoosters();
  const positions = takePositions(); rules.swap(board, first, index); [gemNodes[first], gemNodes[index]] = [gemNodes[index], gemNodes[first]];
  [specials[first], specials[index]] = [specials[index], specials[first]];
  render(); await animateFrom(positions, [gemNodes[first], gemNodes[index]], 265);
  if (token !== generation) return;
  const colorSpecialIndex = specials[first]?.type === 'color' ? first : specials[index]?.type === 'color' ? index : -1;
  let details = rules.matchDetails(board);
  if (!details.cells.size && colorSpecialIndex < 0 && activeBooster !== 'swap') {
    playSound('invalid');
    await delay(120); if (token !== generation) return;
    rules.swap(board, first, index); const back = takePositions(); [gemNodes[first], gemNodes[index]] = [gemNodes[index], gemNodes[first]];
    [specials[first], specials[index]] = [specials[index], specials[first]];
    ui.status.textContent = 'Нет комбинации — камни вернулись на место'; render();
    await animateFrom(back, [gemNodes[first], gemNodes[index]], 235); await finishTurn(token); return;
  }
  if (activeBooster === 'swap') { boosterUses.swap--; activeBooster = null; renderBoosters(); if (!details.cells.size && colorSpecialIndex < 0) { await finishTurn(token); return; } }
  let cascade = 0;
  while (details.cells.size || colorSpecialIndex >= 0 && cascade === 0) {
    cascade++;
    let prepared;
    if (colorSpecialIndex >= 0 && cascade === 1) {
      const other = colorSpecialIndex === first ? index : first, removed = new Set([colorSpecialIndex]);
      board.forEach((color, target) => { if (color === board[other]) removed.add(target); });
      expandSpecials(removed, board[other]); prepared = { removed, created: null };
    } else prepared = prepareMatch(details, index);
    const matched = prepared.removed; const points = matched.size * 10 * Math.min(4, cascade); score += points;
    matched.forEach(cell => { if (board[cell] !== null) collected[board[cell]]++; });
    damageObstacles(matched); renderScores(); renderLevel();
    ui.status.textContent = prepared.shaped ? `Комбинация Т/Г! +${points + 250}` : prepared.created ? `Создан особый самоцвет! +${points}` : cascade === 1 ? `+${points} очков · ${matched.size} самоцветов` : `Комбо ×${Math.min(4, cascade)}! +${points}`;
    playSound('match', cascade); showCheer(cascade); ui.board.style.setProperty('--pop-scale', String(1.22 + Math.min(cascade, 5) * .04));
    matched.forEach(i => gemNodes[i]?.classList.add('matched')); scatter(matched, cascade);
    await delay(260 + Math.min(cascade - 1, 4) * 18); if (token !== generation) return;
    if (prepared.created) { specials[prepared.created.index] = prepared.created.special; board[prepared.created.index] ??= Math.floor(Math.random() * difficulty.types); }
    matched.forEach(cell => { if (!prepared.created || cell !== prepared.created.index) specials[cell] = null; });
    collapseSpecials(matched); rules.collapse(board, matched, () => Math.floor(Math.random() * difficulty.types), solidBlocks());
    await collapseWithMotion(matched); if (token !== generation) return; details = rules.matchDetails(board);
  }
  await finishTurn(token);
}
async function useHammer(index) {
  const token = generation;
  activeBooster = null; boosterUses.hammer--; busy = true; renderBoosters(); audio.match(1);
  const removed = new Set();
  const obstacle = obstacles.get(index);
  if (obstacle) {
    obstacles.delete(index);
    const mission = missions.find(item => item.type === 'obstacle');
    if (mission) mission.progress++;
    if (!obstacle.solid) removed.add(index);
  } else if (board[index] !== null) {
    removed.add(index); collected[board[index]]++; specials[index] = null; score += 10;
  }
  gemNodes[index]?.classList.add('matched'); scatter(new Set([index]), 1); await delay(240);
  collapseSpecials(removed); rules.collapse(board, removed, () => Math.floor(Math.random() * difficulty.types), solidBlocks());
  await collapseWithMotion(removed);
  let details = rules.matchDetails(board), cascade = 0;
  while (details.cells.size) {
    cascade++; const prepared = prepareMatch(details, index), matched = prepared.removed;
    score += matched.size * 10 * Math.min(4, cascade); matched.forEach(cell => { if (board[cell] !== null) collected[board[cell]]++; });
    damageObstacles(matched); audio.match(cascade); showCheer(cascade); matched.forEach(cell => gemNodes[cell]?.classList.add('matched')); scatter(matched, cascade);
    await delay(250); if (token !== generation) return;
    if (prepared.created) specials[prepared.created.index] = prepared.created.special;
    collapseSpecials(matched); rules.collapse(board, matched, () => Math.floor(Math.random() * difficulty.types), solidBlocks());
    await collapseWithMotion(matched); details = rules.matchDetails(board);
  }
  await finishTurn(token);
}
function useShuffle() {
  if (busy || paused || boosterUses.shuffle < 1) return;
  boosterUses.shuffle--; selected = null; specials = Array(64);
  board = rules.createBoard(difficulty.types, solidBlocks()); ui.gemLayer.replaceChildren(); gemNodes = Array(64);
  ui.status.textContent = 'Поле перемешано'; audio.swap(); render(); renderBoosters();
}
function chooseBooster(name) {
  if (busy || paused || boosterUses[name] < 1) return;
  activeBooster = activeBooster === name ? null : name; selected = null;
  ui.hammer.dataset.booster = 'hammer'; ui.freeSwap.dataset.booster = 'swap';
  ui.status.textContent = activeBooster === 'hammer' ? 'Выберите камень или преграду' : activeBooster === 'swap' ? 'Выберите любые два самоцвета' : 'Бонус отменён';
  render(); renderBoosters();
}
function updateAudioButton() {
  ui.audio.setAttribute('aria-pressed', String(audio.enabled)); ui.audio.setAttribute('aria-label', audio.enabled ? 'Отключить звук' : 'Включить звук');
  ui.audio.title = audio.enabled ? 'Звук включён' : 'Звук выключен'; ui.audio.classList.toggle('is-muted', !audio.enabled);
}
function setScene(scene, persist = true) {
  if (scene !== 'garden' && scene !== 'grotto') scene = 'garden';
  document.body.dataset.scene = scene;
  document.querySelectorAll?.('.scene-choice').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scene === scene)));
  const toggle = ui.sceneToggle;
  if (toggle) {
    const label = toggle.querySelector('b'), icon = toggle.querySelector('span');
    if (label) label.textContent = scene === 'garden' ? 'Сад' : 'Грот';
    if (icon) icon.textContent = scene === 'garden' ? '✿' : '✧';
    toggle.setAttribute('aria-label', `Сменить фон на ${scene === 'garden' ? 'грот' : 'сад'}`);
    toggle.title = `Фон: ${scene === 'garden' ? 'сад' : 'грот'}`;
  }
  if (persist) { try { localStorage.setItem(SCENE_KEY, scene); } catch {} }
}
renderScores(); showScreen('start');
let savedScene = 'garden';
try { savedScene = localStorage.getItem(SCENE_KEY) || 'garden'; } catch {}
setScene(savedScene, false);
document.querySelectorAll?.('.scene-choice').forEach(button => button.addEventListener('click', () => setScene(button.dataset.scene)));
ui.sceneToggle.addEventListener('click', () => setScene(document.body.dataset.scene === 'garden' ? 'grotto' : 'garden'));
$('play-button').addEventListener('click', startCampaign); $('new-game').addEventListener('click', startCampaign);
ui.next.addEventListener('click', startLevel); ui.again.addEventListener('click', startCampaign);
ui.pauseButton.addEventListener('click', pauseGame);
ui.resume.addEventListener('click', resumeGame);
ui.pauseNew.addEventListener('click', startCampaign);
document.addEventListener?.('keydown', event => { if (event.key === 'Escape' && paused) resumeGame(); });
ui.audio.addEventListener('click', () => { audio.toggle(); if (paused && !audio.pause) audio.stopAmbience?.(); updateAudioButton(); });
ui.hammer.dataset.booster = 'hammer'; ui.freeSwap.dataset.booster = 'swap';
ui.hammer.addEventListener('click', () => chooseBooster('hammer'));
ui.shuffle.addEventListener('click', useShuffle);
ui.freeSwap.addEventListener('click', () => chooseBooster('swap'));
