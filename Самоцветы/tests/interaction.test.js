const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../game.js');
const campaign = require('../campaign.js');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.disabled = false;
    this.isConnected = true;
    this.classList = {
      add: name => { if (!this.className.split(' ').includes(name)) this.className += ` ${name}`; },
      remove: name => { this.className = this.className.split(' ').filter(item => item !== name).join(' '); },
      toggle: (name, on) => { if (on ?? !this.className.split(' ').includes(name)) this.classList.add(name); else this.classList.remove(name); },
      contains: name => this.className.split(' ').includes(name)
    };
  }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(child) { child.parentElement?.children.splice(child.parentElement.children.indexOf(child), 1); this.children.push(child); child.parentElement = this; }
  replaceChildren(...children) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; children.forEach(child => this.append(child)); }
  querySelector(selector) { return this.children.find(child => child.className.includes(selector.slice(1))) || null; }
  closest(selector) { return selector === '.cell' && this.className.includes('cell') ? this : this.parentElement?.closest(selector); }
  getBoundingClientRect() {
    const node = this.tagName === 'span' && this.parentElement ? this.parentElement : this;
    const index = node.index ?? 0;
    return { left: index % 8 * 42, top: Math.floor(index / 8) * 42, width: 36, height: 36 };
  }
  get firstElementChild() { return this.children[0] || null; }
  get offsetLeft() { return (this.index ?? 0) % 8 * 42; }
  get offsetTop() { return Math.floor((this.index ?? 0) / 8) * 42; }
  cloneNode() { const clone = new Element(this.tagName); clone.className = this.className; return clone; }
  animate() { return { finished: Promise.resolve(), cancel() {} }; }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
  get offsetWidth() { return 36; }
  focus() {}
}

const ids = [...fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
elements.board.append(elements['gem-layer']);
elements.moves.parentElement = new Element();
const body = new Element('body');
let selectedMode = 'campaign';
const fakeWindow = {
  GemRules: rules,
  GemCampaign: campaign,
  GemAudio: class { enabled = true; unlock() {} select() {} swap() {} invalid() {} match() {} },
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  setTimeout: callback => setTimeout(callback, 0),
  setInterval: callback => setInterval(callback, 1000),
  clearInterval
};
const document = {
  body,
  getElementById: id => elements[id],
  createElement: tag => new Element(tag),
  querySelector: selector => ({ value: selector.includes('mode') ? selectedMode : 'normal' })
};
const context = vm.createContext({ document, window: fakeWindow, localStorage: { getItem: () => null, setItem() {} }, console, setTimeout: fakeWindow.setTimeout, setInterval: fakeWindow.setInterval, clearTimeout, clearInterval, requestAnimationFrame: callback => setTimeout(callback, 0) });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context);
elements.board.children.slice(1).forEach((cell, index) => { cell.index = index; });

(async () => {
  vm.runInContext('startCampaign()', context);
  assert.equal(elements.board.children.length, 65);
  vm.runInContext('select(0)', context);
  assert.equal(elements.board.children[1].attributes['aria-pressed'], 'true', 'first click selects a gem');
  const before = vm.runInContext('board.slice()', context);
  const move = vm.runInContext('select(1)', context);
  assert.equal(elements.status.textContent, 'Перестановка…', 'second adjacent click begins the swap');
  assert.equal(vm.runInContext('busy', context), true);
  assert.equal(elements['gem-layer'].children.length, 64, 'gems stay in the board layer during motion');
  assert.equal(vm.runInContext('board[0]', context), before[1]);
  assert.equal(vm.runInContext('board[1]', context), before[0]);
  await move;
  assert.equal(vm.runInContext('busy', context), false, 'the board unlocks when a turn finishes');
  assert.equal(body.children.length, 0, 'no animation copies are added to the page');
  const pair = vm.runInContext(`(() => {
    for (let a = 0; a < 64; a++) for (const b of [a + 1, a + 8]) {
      if (b >= 64 || !window.GemRules.adjacent(a, b)) continue;
      window.GemRules.swap(board, a, b); const matched = window.GemRules.matchDetails(board).cells.size; window.GemRules.swap(board, a, b);
      if (matched) return [a, b];
    }
    return null;
  })()`, context);
  assert.ok(pair, 'generated board has a matching move');
  await vm.runInContext(`select(${pair[0]})`, context);
  const cascadeMove = vm.runInContext(`select(${pair[1]})`, context);
  elements['pause-button'].listeners.click[0]();
  await cascadeMove;
  assert.equal(vm.runInContext('paused', context), true, 'pause stays active while a cascade finishes');
  assert.equal(elements['gem-layer'].children.length, vm.runInContext('board.filter(gem => gem !== null).length', context), 'cascade leaves exactly one gem element per playable cell');
  elements['resume-button'].listeners.click[0]();
  vm.runInContext('startCampaign(); audio.swap = () => { throw new Error("sound unavailable"); }', context);
  elements.board.listeners.pointerdown[0]({ target: elements.board.children[9], clientX: 10, clientY: 50, pointerId: 1 });
  elements.board.listeners.pointerup[0]({ clientX: 55, clientY: 50, pointerId: 1 });
  assert.equal(elements.status.textContent, 'Перестановка…', 'swipe begins a swap even if sound fails');
  assert.equal(elements['gem-layer'].children.length, 64);
  for (let attempt = 0; attempt < 30 && vm.runInContext('busy', context); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(vm.runInContext('busy', context), false);
  elements['pause-button'].listeners.click[0]();
  assert.equal(vm.runInContext('paused', context), true, 'pause state is active');
  assert.equal(elements['pause-overlay'].hidden, false, 'pause dialog is visible');
  assert.equal(elements.board.children[1].disabled, true, 'board is locked while paused');
  elements['resume-button'].listeners.click[0]();
  assert.equal(vm.runInContext('paused', context), false, 'resume clears pause state');
  assert.equal(elements['pause-overlay'].hidden, true, 'pause dialog closes');
  selectedMode = 'timed';
  vm.runInContext('startCampaign()', context);
  await new Promise(resolve => setTimeout(resolve, 5));
  elements['pause-button'].listeners.click[0]();
  const frozenTime = vm.runInContext('timerRemainingMs', context);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(vm.runInContext('timerRemainingMs', context), frozenTime, 'timer remains frozen on pause');
  elements['resume-button'].listeners.click[0]();
  assert.ok(vm.runInContext('timerId', context), 'timer restarts after resume');
  vm.runInContext('clearInterval(timerId)', context);
  console.log('Passed: click and swipe swaps, pause and resume, frozen timed mode, motion layer and turn completion.');
})().catch(error => { console.error(error); process.exitCode = 1; });
