/**
 * verify-slider-hints.mjs
 *
 * Offline harness (no browser, no server, no config.json changes) that loads
 * assets/js/app.js into a minimal stubbed DOM and asserts the three behaviors
 * requested for the full-screen modal sliders:
 *
 *   1. the arrow hint lasts exactly 3 pulse cycles (3 * 1600ms) + grace, so the
 *      CSS animation is never cut mid-cycle;
 *   2. on the LAST slide the hint targets the PREV (left) arrow; on slides
 *      before the last it targets the NEXT (right) arrow; one slide -> no hint;
 *   3. the invisible edge tap zones step backwards / forwards, respect the
 *      boundaries and ignore swipes.
 *
 * Run:  node verify-slider-hints.mjs [slideCount]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------ *
 * Minimal DOM stub
 * ------------------------------------------------------------------ */
class ClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
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
    this.classList = new ClassList(this);
    this.style = {};
    this.dataset = {};
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
      else if (k.startsWith('data-')) {
        this.attributes[k] = v;
        this.dataset[k.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = v;
      } else if (k === 'id') this.id = v;
      else this.attributes[k] = v;
    });
    children.forEach(c => this.appendChild(c));
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  querySelector(sel) { return queryAll(this, sel)[0] || null; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const l = this._listeners[type]; if (!l) return;
    const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
  }
  dispatch(type, ev = {}) {
    (this._listeners[type] || []).forEach(fn =>
      fn({ type, preventDefault() {}, stopPropagation() {}, ...ev }));
  }
  getAttribute(n) { return n === 'id' ? this.id : (this.attributes[n] ?? null); }
  setAttribute(n, v) { this.attributes[n] = v; }
  removeAttribute(n) { delete this.attributes[n]; }
  getBoundingClientRect() { return this._rect; }
  scrollTo(o) { this.scrollLeft = o.left ?? this.scrollLeft; }
  get offsetHeight() { return 60; }
  /* Mirrors `Element.getAnimations()`: no live animations in the stub, so the
     hint-restart path simply clears the classes and forces a style flush. */
  getAnimations() { return []; }
  contains(node) {
    if (node === this) return true;
    return this.children.some(c => c.contains && c.contains(node));
  }
}

/* --- tiny CSS selector engine (tag / .class / #id / [attr="val"]) --- */
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
 * Fixture: one modal with N slides + arrows + edge zones + dots
 * ------------------------------------------------------------------ */
function buildModal(name, slideCount) {
  const modal = new El('div', { id: `${name}-modal`, class: 'modal-fullscreen fixed hidden' });
  const prev = new El('button', { class: 'modal-nav-btn modal-nav-prev', 'data-slider-arrows': name });
  const next = new El('button', { class: 'modal-nav-btn modal-nav-next', 'data-slider-arrows': name });
  const zonePrev = new El('button', { class: 'modal-edge-zone modal-edge-zone-prev', 'data-slider-edge': name, 'data-edge-dir': 'prev' });
  const zoneNext = new El('button', { class: 'modal-edge-zone modal-edge-zone-next', 'data-slider-edge': name, 'data-edge-dir': 'next' });

  const slider = new El('div', { id: `${name}-content`, class: 'modal-slider' });
  for (let i = 0; i < slideCount; i++) slider.appendChild(new El('div', { class: 'modal-slide' }));

  const dots = new El('div', { class: 'modal-dots', 'data-slider-dots-list': name });
  for (let i = 0; i < slideCount; i++) {
    dots.appendChild(new El('button', { class: `modal-dot${i === 0 ? ' is-active' : ''}`, 'data-slide-to': String(i), 'data-slider': name }));
  }
  const counter = new El('span', { class: 'modal-counter', 'data-slider-counter': name });

  modal.appendChild(prev); modal.appendChild(next);
  modal.appendChild(zonePrev); modal.appendChild(zoneNext);
  modal.appendChild(slider); modal.appendChild(dots); modal.appendChild(counter);
  return { modal, slider, prev, next, zonePrev, zoneNext, dots, counter };
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

/* Fake timers so the exact hint delay can be asserted. */
const scheduled = [];
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
  /* Browser API used by restartCssAnimation() to force a STYLE flush that
     restarts the CSS pulse/nudge. The stub returns the resting (no-animation)
     state; the harness only asserts the class bookkeeping, not paint output. */
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
const CSS = fs.readFileSync(path.join(process.cwd(), 'assets/css/styles.css'), 'utf8');
const HTML = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

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
app.bindSlider('promo');

/* ------------------------------------------------------------------ *
 * Assertions
 * ------------------------------------------------------------------ */
let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`  PASS  ${label}`); }
  catch (e) { failures++; console.log(`  FAIL  ${label}\n        ${e.message}`); }
};

console.log(`\n=== Modal slider hints / edge zones (slides = ${MODAL_SLIDES}) ===\n`);

console.log('1) Hint duration == exactly 3 pulse cycles, no mid-cycle cut');
check('JS constants are 1600ms x 3 = 4800ms', () => {
  assert.ok(/const MODAL_HINT_CYCLE_MS\s*=\s*1600;/.test(src), 'MODAL_HINT_CYCLE_MS != 1600');
  assert.ok(/const MODAL_HINT_CYCLES\s*=\s*3;/.test(src), 'MODAL_HINT_CYCLES != 3');
  assert.ok(/const MODAL_HINT_DURATION_MS\s*=\s*MODAL_HINT_CYCLE_MS\s*\*\s*MODAL_HINT_CYCLES;/.test(src),
    'MODAL_HINT_DURATION_MS is not derived from the cycle count');
});
check('CSS pulse/halo run exactly 3 iterations on the same 1600ms cycle', () => {
  assert.ok(/--modal-hint-cycle:\s*1600ms/.test(CSS), '--modal-hint-cycle is not 1600ms');
  assert.ok(/animation:\s*modalArrowHalo\s+var\(--modal-hint-cycle,\s*1600ms\)\s+ease-in-out\s+3\s+forwards/.test(CSS),
    'halo animation is not "3 ... forwards"');
  assert.ok(/animation:\s*modalArrowPulse\s+var\(--modal-hint-cycle,\s*1600ms\)\s+ease-in-out\s+3\s+forwards/.test(CSS),
    'pulse animation is not "3 ... forwards"');
});
check('keyframes start AND end at the resting value (no visible jump)', () => {
  assert.ok(/@keyframes modalArrowHalo\s*{\s*0%,\s*100%\s*{\s*transform:\s*scale\(1\);\s*opacity:\s*1;\s*}/.test(CSS),
    'halo keyframes do not start/end at the resting state (scale(1), opacity 1)');
  assert.ok(/@keyframes modalArrowPulse\s*{\s*0%,\s*100%\s*{\s*transform:\s*scale\(1\);\s*}/.test(CSS),
    'pulse keyframes do not start/end at scale(1)');
});
check('hint timer is armed for 4800ms + 80ms grace', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  scheduled.length = 0;
  app.showArrowHint('promo');
  const t = scheduled.find(s => s.ms >= 1000);
  assert.ok(t, 'no hide timer scheduled');
  assert.equal(t.ms, 4880);
});
check('the open hint waits for the fade-in, then holds a full 3-cycle hint', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  scheduled.length = 0;
  app.showArrowHintOnOpen('promo');
  const show = scheduled.find(s => s.ms === 350);
  assert.ok(show, 'open hint did not wait for the fade-in');
  show.fn();
  const hide = scheduled.find(s => s.ms >= 1000);
  assert.equal(hide.ms, 4880, 'open hint must hold for one full 3-cycle hint');
});

console.log('\n2) The hint targets the correct arrow for the current slide');
const hintClasses = () => ({
  prev: promo.prev.classList.contains('is-hint'),
  next: promo.next.classList.contains('is-hint'),
  prevNudge: promo.prev.classList.contains('is-nudging'),
  nextNudge: promo.next.classList.contains('is-nudging'),
});
const goToSlide = (i) => { promo.slider.scrollLeft = i * 400; app.updateSliderUI('promo', i); };

check('slide 1 -> NEXT arrow is hinted and nudged, PREV is not', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  app.hideArrowHint('promo'); goToSlide(0); app.showArrowHint('promo');
  const h = hintClasses();
  assert.equal(h.next, true, 'next not hinted');
  assert.equal(h.prev, false, 'prev must not be hinted on the first slide');
  assert.equal(h.nextNudge, true);
});
check('middle slide -> BOTH arrows are hinted (and nudged) in sync', () => {
  if (MODAL_SLIDES < 3) { console.log('        (skipped: needs 3+ slides)'); return; }
  app.hideArrowHint('promo'); goToSlide(1); app.showArrowHint('promo');
  const h = hintClasses();
  assert.equal(h.next, true, 'next must be hinted on a middle slide');
  assert.equal(h.prev, true, 'prev must be hinted on a middle slide');
  assert.equal(h.nextNudge, true, 'the next arrow must rock');
  assert.equal(h.prevNudge, true, 'the prev arrow must rock');
  assert.equal(scheduled.filter(s => s.ms >= 1000).length, 1,
    'BOTH arrows must share ONE synchronised hint timer');
});
check('LAST slide -> PREV arrow is hinted and rocks LEFT', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  app.hideArrowHint('promo'); goToSlide(MODAL_SLIDES - 1); app.showArrowHint('promo');
  const h = hintClasses();
  assert.equal(h.prev, true, 'prev must be hinted on the last slide');
  assert.equal(h.next, false, 'next must never be hinted on the last slide');
  assert.equal(h.prevNudge, true, 'the prev arrow must rock (mirrored nudge)');
  assert.equal(h.nextNudge, false);
});
check('the idle reminder is armed even on the LAST slide', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  scheduled.length = 0;
  goToSlide(MODAL_SLIDES - 1);
  app.scheduleArrowHint('promo', 6000);
  const t = scheduled.find(s => s.ms === 6000);
  assert.ok(t, 'no idle reminder armed on the last slide');
  t.fn();
  assert.equal(hintClasses().prev, true, 'the reminder on the last slide must hint prev');
});
check('both nudge directions are declared and wired in CSS', () => {
  assert.ok(/@keyframes modalArrowNudgePrev/.test(CSS), 'no mirrored nudge keyframe');
  assert.ok(/\.modal-nav-prev\.is-nudging\s*{\s*animation:\s*modalArrowNudgePrev/.test(CSS),
    'the prev arrow is not wired to the mirrored nudge');
  assert.ok(/\.modal-nav-next\.is-nudging\s*{\s*animation:\s*modalArrowNudgeNext/.test(CSS));
});
check('hideArrowHint clears both hint and nudge classes', () => {
  app.showArrowHint('promo');
  app.hideArrowHint('promo');
  const h = hintClasses();
  assert.deepEqual([h.prev, h.next, h.prevNudge, h.nextNudge], [false, false, false, false]);
});
check('both arrows are hinted on a middle slide AND only avail. arrows otherwise', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  const only = () => {
    app.hideArrowHint('promo'); goToSlide(1); app.showArrowHint('promo');
    return hintClasses();
  };
  // 3+ slides: slide 2 is a middle slide -> both directions are available.
  if (MODAL_SLIDES >= 3) {
    const h = only();
    assert.deepEqual([h.prev, h.next], [true, true], 'middle slide must hint BOTH arrows');
  }
  // First slide -> only the right arrow, last slide -> only the left one.
  app.hideArrowHint('promo'); goToSlide(0); app.showArrowHint('promo');
  assert.deepEqual([hintClasses().prev, hintClasses().next], [false, true],
    'first slide must hint ONLY the next arrow');
  app.hideArrowHint('promo'); goToSlide(MODAL_SLIDES - 1); app.showArrowHint('promo');
  assert.deepEqual([hintClasses().prev, hintClasses().next], [true, false],
    'last slide must hint ONLY the prev arrow');
});

console.log('\n3) Edge tap zones (>=44x44, work even while the arrow is hidden)');
const tap = (zone, opts = {}) => {
  const { dx = 0, dy = 0, ms = 50, pointerType = 'touch', button = 0 } = opts;
  zone.dispatch('pointerdown', { clientX: 10, clientY: 200, pointerType, button });
  if (dx || dy) zone.dispatch('pointermove', { clientX: 10 + dx, clientY: 200 + dy, pointerType });
  const realNow = Date.now;
  Date.now = () => realNow.call(Date) + ms;
  try { zone.dispatch('pointerup', { clientX: 10 + dx, clientY: 200 + dy, pointerType, button }); }
  finally { Date.now = realNow; }
};

check('both modals have both zones in index.html', () => {
  assert.ok(/data-slider-edge="promo"/.test(HTML), 'promo zones missing');
  assert.ok(/data-slider-edge="birthday"/.test(HTML), 'birthday zones missing');
  assert.equal((HTML.match(/modal-edge-zone-prev/g) || []).length, 2);
  assert.equal((HTML.match(/modal-edge-zone-next/g) || []).length, 2);
});
check('CSS gives the zones >=44x44px and lets swipes pass through', () => {
  assert.ok(/\.modal-edge-zone\s*{[^}]*width:\s*44px/.test(CSS), 'zone is not 44px wide');
  assert.ok(/\.modal-edge-zone\s*{[^}]*min-height:\s*44px\s*!important/.test(CSS), 'zone is not 44px tall');
  assert.ok(/\.modal-edge-zone\s*{[^}]*touch-action:\s*pan-x/.test(CSS), 'swipes would be swallowed');
  assert.ok(/\.modal-edge-zone\s*{[^}]*z-index:\s*15/.test(CSS), 'zones must stay below arrows/dots (20)');
});
check('boundaries: prev zone inert on slide 1, next zone inert on the last slide', () => {
  goToSlide(0);
  assert.equal(promo.zonePrev.classList.contains('is-disabled'), true, 'prev zone inert on slide 1');
  if (MODAL_SLIDES < 2) {
    assert.equal(promo.zoneNext.classList.contains('is-disabled'), true, 'next zone must be inert on a single slide');
    return;
  }
  assert.equal(promo.zoneNext.classList.contains('is-disabled'), false);
  goToSlide(MODAL_SLIDES - 1);
  assert.equal(promo.zoneNext.classList.contains('is-disabled'), true, 'next zone inert on the last slide');
  assert.equal(promo.zonePrev.classList.contains('is-disabled'), false);
});
check('tap right zone -> next slide while the arrow is INVISIBLE', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  goToSlide(0);
  assert.equal(promo.next.classList.contains('is-hint'), false, 'precondition: arrow hidden');
  tap(promo.zoneNext);
  assert.equal(app.getActiveSlideIndex('promo'), 1, `expected slide 2, got ${app.getActiveSlideIndex('promo')}`);
});
check('tap left zone -> previous slide while the arrow is invisible', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  goToSlide(MODAL_SLIDES - 1);
  tap(promo.zonePrev);
  assert.equal(app.getActiveSlideIndex('promo'), MODAL_SLIDES - 2, 'prev zone did not step back');
});
check('tap left zone on the first slide does nothing', () => {
  goToSlide(0);
  tap(promo.zonePrev);
  assert.equal(promo.slider.scrollLeft, 0);
});
check('tap right zone on the last slide does nothing', () => {
  goToSlide(MODAL_SLIDES - 1);
  const before = promo.slider.scrollLeft;
  tap(promo.zoneNext);
  assert.equal(promo.slider.scrollLeft, before);
});
check('a swipe (pointer moved > 10px) is NOT a tap', () => {
  goToSlide(0);
  tap(promo.zoneNext, { dx: 60, ms: 200 });
  assert.equal(promo.slider.scrollLeft, 0, 'a swipe must not switch slides');
});
check('a long press (> 400ms) is NOT a tap', () => {
  goToSlide(0);
  tap(promo.zoneNext, { ms: 900 });
  assert.equal(promo.slider.scrollLeft, 0);
});
check('a right mouse-button press is ignored', () => {
  goToSlide(0);
  tap(promo.zoneNext, { pointerType: 'mouse', button: 2 });
  assert.equal(promo.slider.scrollLeft, 0);
});
check('a tap clears the running hint (no dangling timers)', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  goToSlide(0);
  app.hideArrowHint('promo');
  scheduled.length = 0;
  app.showArrowHint('promo');
  const armed = scheduled.filter(s => s.ms >= 1000).length;
  assert.equal(armed, 1, `precondition: exactly one hint timer armed, got ${armed}`);
  tap(promo.zoneNext);
  assert.equal(scheduled.some(s => s.ms >= 1000), false, 'tap must clear the hint timer');
  assert.equal(promo.next.classList.contains('is-hint'), false);
});
check('the existing swipe/scroll hint plumbing is untouched', () => {
  // bindSlider must still wire the slider scroll listener that hides the hint
  // and re-arms the 6s idle reminder once the scroll settles.
  goToSlide(0);
  app.showArrowHint('promo');
  scheduled.length = 0;
  promo.slider.dispatch('scroll');
  assert.equal(promo.next.classList.contains('is-hint'), false, 'scroll must hide the hint at once');
  assert.ok(scheduled.some(s => s.ms === 150), 'the 150ms scroll-settle debounce is missing');
});
check('dots still jump to a slide', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  goToSlide(0);
  const dot = promo.dots.querySelector(`[data-slide-to="${MODAL_SLIDES - 1}"]`);
  dot.dispatch('click');
  assert.equal(app.getActiveSlideIndex('promo'), MODAL_SLIDES - 1);
});

console.log('\n4) Repeated hints restart the pulse/nudge every time (no "works only once")');
check('restartCssAnimation() exists and is wired into show/hide', () => {
  assert.equal(typeof app.restartCssAnimation, 'function', 'restartCssAnimation() is missing');
  assert.ok(/this\.restartCssAnimation\(btn\)/.test(src),
    'showArrowHint / hideArrowHint must restart the CSS animation on each toggle');
  assert.ok(/getComputedStyle\(el\)\.animationName/.test(src),
    'restart must force a STYLE flush via getComputedStyle(animationName)');
  assert.ok(/getAnimations\(\{\s*subtree:\s*true\s*\}\)/.test(src),
    'restart must cancel in-flight animations on the whole subtree');
});
check('showing the hint twice re-applies BOTH classes each time', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  const first = (() => {
    app.hideArrowHint('promo'); goToSlide(0); app.showArrowHint('promo');
    return hintClasses();
  })();
  const second = (() => {
    app.showArrowHint('promo'); // re-show WITHOUT an explicit hide in between
    return hintClasses();
  })();
  assert.deepEqual([first.next, first.nextNudge], [true, true], 'first show: next hinted+nudged');
  assert.deepEqual([second.next, second.nextNudge], [true, true], 'second show: next must be hinted+nudged again');
});
check('a middle slide re-hints and re-nudges BOTH arrows on every show', () => {
  if (MODAL_SLIDES < 3) { console.log('        (skipped: needs 3+ slides)'); return; }
  app.hideArrowHint('promo'); goToSlide(1); app.showArrowHint('promo');
  const a = hintClasses();
  app.showArrowHint('promo'); // immediate re-show (mid-flight restart)
  const b = hintClasses();
  assert.deepEqual([a.prev, a.next, a.prevNudge, a.nextNudge], [true, true, true, true],
    'first middle-slide show must hint+nudge both arrows');
  assert.deepEqual([b.prev, b.next, b.prevNudge, b.nextNudge], [true, true, true, true],
    're-show must hint+nudge both arrows again');
});
check('an is-disabled arrow is never hinted (e.g. prev on slide 1)', () => {
  if (MODAL_SLIDES < 2) { console.log('        (skipped: needs 2+ slides)'); return; }
  app.hideArrowHint('promo'); goToSlide(0); app.updateSliderUI('promo', 0); app.showArrowHint('promo');
  assert.equal(promo.prev.classList.contains('is-hint'), false, 'disabled prev arrow must not be hinted');
  assert.equal(promo.prev.classList.contains('is-nudging'), false, 'disabled prev arrow must not be nudged');
});

if (MODAL_SLIDES === 1) {
  console.log('\n5) Single-slide modal');
  check('a single slide is never hinted', () => {
    scheduled.length = 0;
    app.hideArrowHint('promo');
    app.showArrowHint('promo');
    app.scheduleArrowHint('promo', 6000);
    assert.equal(scheduled.some(s => s.ms >= 1000), false, 'a single slide must never be hinted');
  });
  check('both arrows hidden and both zones inert', () => {
    app.updateSliderUI('promo', 0);
    assert.equal(promo.prev.classList.contains('hidden'), true);
    assert.equal(promo.next.classList.contains('hidden'), true);
    assert.equal(promo.zonePrev.classList.contains('is-disabled'), true);
    assert.equal(promo.zoneNext.classList.contains('is-disabled'), true);
  });
  check('tapping an edge zone does nothing', () => {
    tap(promo.zoneNext);
    assert.equal(promo.slider.scrollLeft, 0);
  });
}

console.log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===\n`);
process.exit(failures === 0 ? 0 : 1);
