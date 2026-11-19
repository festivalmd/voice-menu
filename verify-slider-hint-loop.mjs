/**
 * verify-slider-hint-loop.mjs
 *
 * Offline harness (no browser, no server, no config.json changes) that loads
 * assets/js/app.js into a minimal stubbed DOM and asserts the REPEATING hint
 * cycle requested for the full-screen modal sliders:
 *
 *   A. on a MIDDLE slide the hint shows both arrows (prev rocks LEFT, next rocks
 *      RIGHT - i.e. outwards, in opposite directions, in the SAME frame);
 *   B. on the FIRST slide only the NEXT arrow is hinted/nudged (to the right),
 *      on the LAST slide only the PREV one (to the left);
 *   C. a single slide never hints any arrow;
 *   D. the hint REPEATS forever while the modal is open: show -> hide ->
 *      5000ms gap -> show -> hide -> ... ;
 *   E. any activity (scroll / swipe / arrow / dot / edge tap) resets the cycle -
 *      no dangling timers and the arrows stop immediately;
 *   F. closing the modal stops the cycle for good.
 *
 * Run:  node verify-slider-hint-loop.mjs [slideCount]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------ *
 * Minimal DOM stub
 * ------------------------------------------------------------------ */
class ClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach(x => x && this.set.add(x)); }
  remove(...c) { c.forEach(x => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : !!force;
    if (on) this.set.add(c); else this.set.delete(c);
    return on;
  }
}

class El {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.classList = new ClassList();
    this.style = {};
    this.attributes = {};
    this._listeners = {};
    this._rect = { width: 400, height: 400, top: 0, left: 0 };
    this.scrollLeft = 0;
    this.clientWidth = 400;
    this.offsetWidth = 400;
    this.textContent = '';
    this.id = attrs.id || '';
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') String(v).split(/\s+/).forEach(c => c && this.classList.add(c));
      else if (k === 'id') this.id = v;
      else this.attributes[k] = v;
    });
    children.forEach(c => this.appendChild(c));
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  dispatch(type, ev = {}) {
    (this._listeners[type] || []).forEach(fn =>
      fn({ type, preventDefault() {}, stopPropagation() {}, ...ev }));
  }
  getAttribute(n) { return n === 'id' ? this.id : (this.attributes[n] ?? null); }
  setAttribute(n, v) { this.attributes[n] = v; }
  getBoundingClientRect() { return this._rect; }
  scrollTo(o) { this.scrollLeft = o.left ?? this.scrollLeft; }
  get offsetHeight() { return 60; }
  getAnimations() { return []; }
}

function parseSimpleSelector(sel) {
  const parts = [];
  const re = /(^[a-zA-Z][\w-]*)|(\.([\w-]+))|(#([\w-]+))|(\[([\w-]+)(?:="([^"]*)")?\])/g;
  let m;
  while ((m = re.exec(sel))) {
    if (m[1]) parts.push({ t: 'tag', v: m[1].toLowerCase() });
    else if (m[3]) parts.push({ t: 'class', v: m[3] });
    else if (m[5]) parts.push({ t: 'id', v: m[5] });
    else if (m[7]) parts.push({ t: 'attr', v: m[7], val: m[8] });
  }
  return parts;
}

function walk(root, out = []) {
  root.children.forEach(c => { out.push(c); walk(c, out); });
  return out;
}

function matches(el, parts) {
  return parts.every(p => {
    if (p.t === 'tag') return el.tagName === p.v.toUpperCase();
    if (p.t === 'class') return el.classList.contains(p.v);
    if (p.t === 'id') return el.id === p.v;
    if (p.t === 'attr') {
      const raw = el.attributes[p.v];
      if (raw === undefined) return false;
      if (p.val === undefined) return true;
      return String(raw) === p.val;
    }
    return false;
  });
}

function queryAll(root, selector) {
  const all = walk(root);
  return selector.split(',').map(s => s.trim()).flatMap(sel => {
    const parts = parseSimpleSelector(sel);
    if (!parts.length) return [];
    return all.filter(el => matches(el, parts));
  });
}


/* ------------------------------------------------------------------ *
 * Fixture: one modal with N slides + arrows + edge zones
 * ------------------------------------------------------------------ */
function buildModal(name, slideCount) {
  const modal = new El('div', { id: `${name}-modal`, class: 'modal-fullscreen fixed hidden' });
  const prev = new El('button', { class: 'modal-nav-btn modal-nav-prev', 'data-slider-arrows': name });
  const next = new El('button', { class: 'modal-nav-btn modal-nav-next', 'data-slider-arrows': name });
  const zonePrev = new El('button', { class: 'modal-edge-zone modal-edge-zone-prev', 'data-slider-edge': name, 'data-edge-dir': 'prev' });
  const zoneNext = new El('button', { class: 'modal-edge-zone modal-edge-zone-next', 'data-slider-edge': name, 'data-edge-dir': 'next' });

  const slider = new El('div', { id: `${name}-content`, class: 'modal-slider' });
  for (let i = 0; i < slideCount; i++) slider.appendChild(new El('div', { class: 'modal-slide' }));

  modal.appendChild(prev); modal.appendChild(next);
  modal.appendChild(zonePrev); modal.appendChild(zoneNext);
  modal.appendChild(slider);
  return { modal, slider, prev, next, zonePrev, zoneNext };
}

/* ------------------------------------------------------------------ *
 * Boot app.js inside the stubbed DOM
 * ------------------------------------------------------------------ */
const documentStub = {
  _tree: null,
  getElementById(id) {
    const all = walk(this._tree);
    return all.find(el => el.id === id && el.classList.contains('modal-fullscreen'))
        || all.find(el => el.id === id) || null;
  },
  querySelector(sel) { return queryAll(this._tree, sel)[0] || null; },
  querySelectorAll(sel) { return queryAll(this._tree, sel); },
  addEventListener() {},
  body: new El('body'),
};
const root = new El('div', { id: 'root' });
documentStub._tree = root;

const MODAL_SLIDES = Number(process.argv[2] || 3);
const promo = buildModal('promo', MODAL_SLIDES);
root.appendChild(promo.modal);

/* Fake timers so the exact gap/loop delays can be asserted and fired by hand. */
const scheduled = [];
const fire = (ms) => {
  const found = scheduled.filter(s => s.ms === ms);
  found.forEach(s => { const i = scheduled.indexOf(s); if (i >= 0) scheduled.splice(i, 1); s.fn(); });
  return found.length;
};
const sandbox = {
  document: documentStub,
  console,
  window: {
    MENU_API_BASE: '', addEventListener() {}, scrollTo() {}, open() {},
    location: { pathname: '/', port: '8080' }, pageYOffset: 0,
  },
  fetch: async () => ({ ok: true, json: async () => ({ version: 1, navigation: { horizontal: [], vertical: [] }, sections: [] }) }),
  setTimeout: (fn, ms) => { const id = { fn, ms: ms || 0 }; scheduled.push(id); return id; },
  clearTimeout: (id) => { const i = scheduled.indexOf(id); if (i >= 0) scheduled.splice(i, 1); },
  requestAnimationFrame: (fn) => { fn(); return 1; },
  getComputedStyle: () => ({ animationName: '' }),
  history: { replaceState() {} },
  location: { pathname: '/', hash: '', port: '8080' },
  Math, Date, JSON, Set, Map, Promise, Array, Object, String, Number, Boolean, Error,
};
sandbox.globalThis = sandbox;
sandbox.window.document = documentStub;

const src = fs.readFileSync(path.join(process.cwd(), 'assets/js/app.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(src + '\n;globalThis.BarMenuApp = BarMenuApp;', sandbox, { filename: 'app.js' });

/* Build the instance WITHOUT running init() (no real network / DOM setup). */
const app = Object.create(sandbox.BarMenuApp.prototype);
app.apiBase = '';
app.promoModal = promo.modal;
app.birthdayModal = null;
app._arrowHint = {};
app.config = {
  sections: [{
    id: 'promo-modal', titleKey: 'x',
    images: Array.from({ length: MODAL_SLIDES }, (_, i) => ({ id: `p${i}`, src: `s${i}`, alt: '' })),
  }],
};
app.activeModal = 'promo';            // pretend the promo modal is open
app.bindSlider('promo');

/* ------------------------------------------------------------------ *
 * Assertions
 * ------------------------------------------------------------------ */
let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`  PASS  ${label}`); }
  catch (e) { failures++; console.log(`  FAIL  ${label}\n        ${e.message}`); }
};

const hintClasses = () => ({
  prev: promo.prev.classList.contains('is-hint'),
  next: promo.next.classList.contains('is-hint'),
  prevNudge: promo.prev.classList.contains('is-nudging'),
  nextNudge: promo.next.classList.contains('is-nudging'),
});
const goToSlide = (i) => { promo.slider.scrollLeft = i * 400; app.updateSliderUI('promo', i); };

const CSS = fs.readFileSync(path.join(process.cwd(), 'assets/css/styles.css'), 'utf8');

console.log(`\n=== Repeating modal slider hint loop (slides = ${MODAL_SLIDES}) ===\n`);

console.log('1) Gap constant + CSS nudge directions (outwards, mirrored)');
check('the inter-hint gap is exactly 5000ms', () => {
  assert.ok(/const MODAL_HINT_GAP_MS\s*=\s*5000;/.test(src), 'MODAL_HINT_GAP_MS != 5000');
});
check('next rocks right (outward), prev rocks left (outward)', () => {
  assert.ok(/@keyframes modalArrowNudgeNext\s*{[\s\S]*?45%\s*{\s*margin-left:\s*6px/.test(CSS),
    'next nudge does not move right (+6px)');
  assert.ok(/@keyframes modalArrowNudgePrev\s*{[\s\S]*?45%\s*{\s*margin-left:\s*-6px/.test(CSS),
    'prev nudge does not move left (-6px)');
});

console.log('\n2) Which arrows are hinted / nudged per slide');
check('middle slide -> BOTH arrows, outwards, in one frame', () => {
  if (MODAL_SLIDES < 3) { console.log('        (skipped: needs 3+ slides)'); return; }
  app.hideArrowHint('promo'); goToSlide(1); app.showArrowHint('promo');
  const h = hintClasses();
  assert.deepEqual([h.prev, h.next, h.prevNudge, h.nextNudge], [true, true, true, true]);
  assert.equal(scheduled.filter(s => s.ms >= 1000).length, 1, 'both arrows must share ONE timer');
});
check('first slide -> ONLY next (right)', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  app.hideArrowHint('promo'); goToSlide(0); app.showArrowHint('promo');
  const h = hintClasses();
  assert.deepEqual([h.prev, h.next, h.prevNudge, h.nextNudge], [false, true, false, true]);
});
check('last slide -> ONLY prev (left)', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  app.hideArrowHint('promo'); goToSlide(MODAL_SLIDES - 1); app.showArrowHint('promo');
  const h = hintClasses();
  assert.deepEqual([h.prev, h.next, h.prevNudge, h.nextNudge], [true, false, true, false]);
});

console.log('\n3) The hint REPEATS while the modal is open (show -> hide -> 5s -> show)');
check('the open hint waits for the fade-in, then holds a full 3-cycle hint', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  goToSlide(0);
  app.resetArrowHint('promo');
  scheduled.length = 0;
  app.showArrowHintOnOpen('promo');
  const show = scheduled.find(s => s.ms === 350);
  assert.ok(show, 'the open hint must wait 350ms for the fade-in');
  show.fn();
  const hide = scheduled.find(s => s.ms === 4880);
  assert.ok(hide, 'the hint must be hidden after 4880ms (3 cycles + grace)');
});
check('after the hint hides, the next one is armed 5000ms later, and repeats', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  goToSlide(0);
  app.resetArrowHint('promo');
  scheduled.length = 0;
  app.startArrowHintLoop('promo', 0);            // arm the repeating loop
  fire(0);                                        // first hint shows now
  assert.equal(promo.next.classList.contains('is-hint'), true, 'first hint must show');
  fire(4880);                                     // hint fades out
  assert.equal(promo.next.classList.contains('is-hint'), false, 'hint must be hidden after the cycle');
  const gap = scheduled.find(s => s.ms === 5000);
  assert.ok(gap, 'no 5000ms gap timer armed -> the hint never repeats');
  gap.fn();                                       // show again
  assert.equal(promo.next.classList.contains('is-hint'), true, 'the repeating hint must show again');
  fire(4880);                                     // and hide again
  assert.ok(scheduled.some(s => s.ms === 5000), 'the cycle must keep repeating, not stop after one round');
});


console.log('\n4) Activity resets the whole cycle (no dangling timers)');
check('a swipe (slider scroll) hides the hint at once and stops the loop', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  goToSlide(0);
  app.resetArrowHint('promo');
  scheduled.length = 0;
  app.startArrowHintLoop('promo', 0);
  fire(0);                                        // hint visible
  scheduled.length = 0;
  promo.slider.dispatch('scroll');
  assert.equal(promo.next.classList.contains('is-hint'), false, 'scroll must hide the hint at once');
  assert.equal(scheduled.some(s => s.ms === 4880), false, 'scroll must drop the running hint timer');
  assert.ok(scheduled.some(s => s.ms === 150), 'the 150ms settle debounce must still be armed');
});
check('after the swipe settles the repeating loop is resumed', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  goToSlide(0);
  scheduled.length = 0;
  promo.slider.dispatch('scroll');
  fire(150); // scroll settled
  assert.ok(scheduled.some(s => s.ms === 5000),
    'the loop must resume 5s after the gesture settles while the modal is open');
});
check('an edge-zone tap clears the hint and leaves no hint timer', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  app.hideArrowHint('promo');
  goToSlide(0);
  scheduled.length = 0;
  app.showArrowHint('promo');
  promo.zoneNext.dispatch('pointerdown', { clientX: 5, clientY: 200, pointerType: 'touch', button: 0 });
  promo.zoneNext.dispatch('pointerup', { clientX: 5, clientY: 200, pointerType: 'touch', button: 0 });
  assert.equal(promo.next.classList.contains('is-hint'), false, 'a tap must hide the hint');
  assert.equal(scheduled.some(s => s.ms === 4880), false, 'a tap must not leave a dangling hint timer');
});

console.log('\n5) Closing the modal stops the cycle for good');
check('resetArrowHint() drops every timer and the repeating flag', () => {
  scheduled.length = 0;
  app.showArrowHint('promo');
  app.resetArrowHint('promo');
  assert.equal(scheduled.length, 0, 'closing must clear ALL timers');
  assert.equal(app.hintState('promo').repeating, false, 'the repeating flag must be cleared');
  assert.deepEqual([hintClasses().prev, hintClasses().next], [false, false]);
});
check('with the modal closed, activity no longer arms the loop', () => {
  scheduled.length = 0;
  app.activeModal = null;
  app.touchArrowHintActivity('promo');
  assert.equal(scheduled.length, 0, 'no timers may be armed while the modal is closed');
  app.activeModal = 'promo'; // restore
});

if (MODAL_SLIDES === 1) {
  console.log('\n6) Single-slide modal never hints');
  check('the loop is never armed and no arrow is hinted', () => {
    scheduled.length = 0;
    app.showArrowHintOnOpen('promo');
    app.showArrowHint('promo');
    app.scheduleArrowHint('promo');
    assert.equal(scheduled.some(s => s.ms >= 1000), false, 'a single slide must never be hinted');
  });
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===\n`);
process.exit(failures === 0 ? 0 : 1);
