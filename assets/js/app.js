/**
 * app.js - Main application logic
 * Handles navigation, smooth scroll, modals, language switching, and dynamic config rendering
 */

/**
 * Arrow hint timing. The pulse animation (CSS `--modal-hint-cycle`) runs exactly
 * 3 iterations, so the hint must stay visible for exactly `3 * cycle` ms -
 * anything shorter cuts the animation mid-cycle (the "abrupt cut" glitch).
 * Keep these two numbers in sync with `--modal-hint-cycle` in styles.css.
 */
const MODAL_HINT_CYCLE_MS = 1600;
const MODAL_HINT_CYCLES = 3;
const MODAL_HINT_DURATION_MS = MODAL_HINT_CYCLE_MS * MODAL_HINT_CYCLES; // 4800ms
/** Small grace so the 3rd cycle (and the nudge) is guaranteed to have finished. */
const MODAL_HINT_GRACE_MS = 80;
/**
 * Pause between two consecutive hints while the modal is open and idle. The hint
 * shows for MODAL_HINT_DURATION_MS, disappears, stays hidden for this long and
 * then shows again - repeating forever until the guest scrolls/swipes, taps an
 * arrow, or closes the modal (all of which reset the whole cycle).
 */
const MODAL_HINT_GAP_MS = 5000;
/** A tap must stay inside these bounds to count as a slide switch (not a swipe). */
const MODAL_EDGE_TAP_MAX_MOVE_PX = 10;
const MODAL_EDGE_TAP_MAX_TIME_MS = 400;

class BarMenuApp {
  constructor() {
    this.header = document.getElementById('main-header');
    this.heroSection = document.getElementById('hero-landing');
    this.mainContent = document.getElementById('main-content');
    this.promoModal = document.getElementById('promo-modal');
    this.birthdayModal = document.getElementById('birthday-modal');
    this.scrollPosition = 0;
    this.activeModal = null;
    this.headerVisible = false;
    this.ticking = false;
    this.config = null;
    /** Timestamp until which a programmatic smooth scroll may still be running. */
    this.smoothScrollUntil = 0;
    // API base URL - in production uses relative, in dev can be overridden via window.MENU_API_BASE
    this.apiBase = window.MENU_API_BASE || '';
    
    this.init();
  }

  async init() {
    // Fetch config first
    await this.loadConfig();
    
    // Render everything from config
    this.renderHeroBackground();
    this.renderNavigation();
    this.renderHeroTitle();
    this.renderSections();
    this.renderModals();
    
    // Bind events after rendering
    this.bindEvents();
    this.handleHashNavigation();
    this.setupScrollListener();
    this.setupResizeListener();

    // Show the header right away when the page is restored (reload / deep link)
    // already scrolled past the hero - otherwise it would pop in on the first
    // scroll event. The hysteresis thresholds are honoured by the same method.
    this.updateHeaderVisibility();

    // Lazy pictures reveal as they arrive. They have no reserved intrinsic box
    // before decode, so make sure scroll anchoring can never shift the page when
    // one of them lands while the guest is dragging.
    document.querySelectorAll('#main-menu-container img').forEach(img => {
      if (!img.complete) {
        const sync = () => this.onScroll();
        img.addEventListener('load', sync, { passive: true, once: true });
        img.addEventListener('error', sync, { passive: true, once: true });
      }
    });
    
    // Initialize i18n after rendering so translations apply to dynamic content
    if (window.i18n) {
      await window.i18n.init();
    }
  }

  async loadConfig() {
    try {
      const response = await fetch(`${this.apiBase}/api/config`);
      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.status}`);
      }
      this.config = await response.json();
    } catch (error) {
      console.error('Error loading config:', error);
      this.config = { navigation: { horizontal: [], vertical: [] }, sections: [] };
    }
  }

  renderHeroBackground() {
    const heroBg = document.getElementById('hero-bg');
    if (!heroBg || !this.config?.sections?.length) return;
    // Use the dedicated "Start Background" section (hero-section) if it has an
    // image; otherwise fall back to the first menu image so the landing keeps a
    // background even before a separate one is uploaded.
    const heroSection = this.config.sections.find(s => s.id === 'hero-section');
    const heroImg = heroSection?.images?.[0]?.src;
    // Fall back to the first real menu section - never a modal section, so a
    // promo/birthday picture can't accidentally become the landing background.
    const firstMenuSection = this.config.sections
      .find(s => s.id !== 'hero-section' && !BarMenuApp.isModalSection(s) && s.images?.length)
      || this.config.sections.find(s => s.id !== 'hero-section' && s.images?.length);
    const firstMenuImg = firstMenuSection?.images?.[0]?.src;
    const src = heroImg || firstMenuImg;
    if (src) heroBg.style.backgroundImage = `url('${src}')`;
  }

  renderNavigation() {
    // Horizontal nav (header)
    const horizontalNav = document.getElementById('horizontal-nav');
    if (horizontalNav && this.config?.navigation?.horizontal) {
      horizontalNav.innerHTML = this.config.navigation.horizontal.map(btn => {
        // The promo button keeps the SAME special highlight it has in the hero
        // (vertical) nav: an animated gradient (`.promo-text` + `bg-clip-text`)
        // instead of the plain white/hover/active text of the other buttons.
        const isPromo = btn.id === 'promo';
        const className = isPromo
          ? 'nav-btn nav-btn-promo shrink-0 md:flex-1 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap text-center promo-text text-transparent bg-clip-text bg-gradient-to-r from-accent via-red-500 to-orange-500'
          : 'nav-btn shrink-0 md:flex-1 px-3 py-2 text-sm font-medium text-white/80 hover:text-white active:text-accent transition-colors whitespace-nowrap text-center';
        return `
        <button class="${className}" data-nav="${btn.id}"${btn.link ? ` data-external-url="${btn.link}"` : ''} data-i18n="${btn.labelKey}">${btn.id.toUpperCase()}</button>
      `;
      }).join('');
    }

    // Vertical nav (hero)
    const verticalNav = document.getElementById('vertical-nav');
    if (verticalNav && this.config?.navigation?.vertical) {
      const iconPaths = {
        utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v8c0 1.1.9 2 2 2h3Zm0 0v5"/>',
        martini: '<path d="M8 22h8"/><path d="M12 11v11"/><path d="m19 3-7 8-7-8Z"/>',
        flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
        cake: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16h16"/><path d="M12 11V7"/><path d="M8 11V8"/><path d="M16 11V8"/><path d="M12 4v.01"/><path d="M8 5v.01"/><path d="M16 5v.01"/>',
        // Retro microphone: round head with grille + stand/base
        mic: '<circle cx="12" cy="8" r="5"/><path d="M7.5 6.5h9"/><path d="M7 8.5h10"/><path d="M7.5 10.5h9"/><path d="M12 13v5.5"/><path d="M9.5 21h5"/><path d="M12 18.5V21"/>'
      };

      verticalNav.innerHTML = this.config.navigation.vertical.map(btn => {
        const iconPath = iconPaths[btn.icon] || iconPaths.utensils;
        const isPromo = btn.id === 'promo';
        const textClass = isPromo ? 'promo-text text-transparent bg-clip-text bg-gradient-to-r from-accent via-red-500 to-orange-500' : 'text-white hover:text-accent';
        const btnClass = isPromo ? 'transition-colors' : 'text-white hover:text-accent transition-colors';
        
        return `
          <button class="hero-nav-btn w-full py-6 px-6 text-center text-lg font-semibold ${btnClass} rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 active:bg-white/10" data-nav="${btn.id}"${btn.link ? ` data-external-url="${btn.link}"` : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 8px;">${iconPath}</svg>
            <span class="${textClass}" data-i18n="${btn.labelKey}">${btn.id.toUpperCase()}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-left: 8px;">${iconPath}</svg>
          </button>
        `;
      }).join('');
    }
  }

  renderHeroTitle() {
    const container = document.getElementById('hero-title-container');
    if (!container) return;
    // The big "MENU" heading above all hero buttons. `enabled` defaults to true so
    // configs saved before this option existed keep showing it; the admin panel can
    // switch it off (Navigation tab -> Hero MENU Title).
    const enabled = this.config?.navigation?.menuTitle?.enabled !== false;
    // Selectable visual style (admin: Navigation tab -> Hero MENU Title).
    // Falls back to "gold" for configs saved before the option existed.
    const style = this.config?.navigation?.menuTitle?.style || 'gold';
    container.innerHTML = enabled
      ? `<h1 class="hero-menu-title menu-style-${style}" aria-label="Menu">MENU</h1>`
      : '';
  }

  /**
   * Section ids that must NEVER be rendered in the main page flow. Promo and
   * birthday are MODAL sections: their content lives exclusively inside
   * #promo-modal / #birthday-modal (built by renderSlider). Rendering them here
   * would (a) paint their images under the food/drinks sections and (b) create
   * DUPLICATE `id`s (`promo-modal`, `birthday-modal`), so getElementById() would
   * resolve to the in-page clone instead of the real modal and the slider
   * arrows / dots / scroll-sync would silently break.
   */
  static modalSectionIds() {
    return ['promo', 'birthday', 'promo-modal', 'birthday-modal'];
  }

  /** True for modal sections (by id or explicit `type: 'modal'`) */
  static isModalSection(section) {
    if (!section) return false;
    const id = String(section.id || '').toLowerCase();
    return section.type === 'modal' || BarMenuApp.modalSectionIds().indexOf(id) !== -1;
  }

  /**
   * Resolve a real modal element (#promo-modal / #birthday-modal). It must be
   * the full-screen dialog, never an accidental in-page clone, so the check is
   * anchored on the `.modal-fullscreen` class.
   */
  getModalEl(name) {
    const byId = document.getElementById(`${name}-modal`);
    if (byId && byId.classList.contains('modal-fullscreen')) return byId;
    return document.querySelector(`.modal-fullscreen#${name}-modal`);
  }

  renderSections() {
    const container = document.getElementById('main-menu-container');
    if (!container || !this.config?.sections) return;

    container.innerHTML = this.config.sections
      .filter(section => section.id !== 'hero-section' && !BarMenuApp.isModalSection(section))
      .map(section => {
      return `
        <section id="${section.id}" class="menu-section px-4" aria-labelledby="${section.id}-title">
          <h2 id="${section.id}-title" class="sr-only" data-i18n="${section.titleKey}">${section.id.toUpperCase()}</h2>
          <div class="space-y-4">
            ${section.images.map(img => {
              // Reserve the picture's box BEFORE it is decoded. A lazy image that
              // suddenly grows from 0px to Npx while the finger is dragging is
              // exactly what makes native scrolling stutter / jump, so the
              // intrinsic ratio (when known) becomes an inline aspect-ratio.
              const ratio = BarMenuApp.intrinsicRatio(img);
              const attrs = BarMenuApp.intrinsicAttrs(img, ratio);
              return `
              <div class="image-wrapper relative">
                <img src="${img.src}" alt="${img.alt || ''}"${attrs} class="w-full h-auto rounded-lg shadow-lg" loading="lazy" decoding="async">
                <div class="price-overlay absolute inset-0 pointer-events-none" data-image-id="${img.id}"></div>
              </div>
            `;
            }).join('')}
          </div>
        </section>
      `;
    }).join('');
  }

  /**
   * Intrinsic aspect ratio of a config image, if the config recorded it.
   * Accepts `img.width`/`img.height` or a stored `aspectRatio`; returns '' when
   * the dimensions are unknown (the browser then simply keeps the natural ratio).
   */
  static intrinsicRatio(img) {
    const w = Number(img?.width);
    const h = Number(img?.height);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return `${w} / ${h}`;
    }
    const stored = Number(img?.aspectRatio);
    if (Number.isFinite(stored) && stored > 0) {
      return `${stored}`;
    }
    return '';
  }

  /**
   * Extra `<img>` attributes that reserve the box before decode. Only emitted
   * when the dimensions are really known, so a broken/empty attribute can never
   * collapse the image. `width`/`height` give the browser the intrinsic ratio
   * and `aspect-ratio` locks the height while the file is still loading.
   */
  static intrinsicAttrs(img, ratio) {
    const w = Number(img?.width);
    const h = Number(img?.height);
    const hasDims = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
    const sizeAttrs = hasDims ? ` width="${Math.round(w)}" height="${Math.round(h)}"` : '';
    const styleAttr = ratio ? ` style="aspect-ratio:${ratio}"` : '';
    return `${sizeAttrs}${styleAttr}`;
  }

  renderModals() {
    // Build a universal horizontal slider for each modal straight from config:
    // 1 image -> arrows/dots hidden, 2+ images -> N slides + N dots, generated
    // dynamically (nothing is hardcoded). Read-only over config.json.
    this.renderSlider('promo-modal', 'promo-content');
    this.renderSlider('birthday-modal', 'birthday-content');

    // Render price tags for all images
    this.renderAllPriceTags();
  }

  /**
   * Build a full-screen horizontal swipe slider inside a modal.
   * @param {string} sectionId  config section id (e.g. 'promo-modal')
   * @param {string} contentId  DOM id of the slider container (e.g. 'promo-content')
   */
  renderSlider(sectionId, contentId) {
    const slider = document.getElementById(contentId);
    if (!slider) return;

    const section = this.config?.sections?.find(s => s.id === sectionId);
    const images = section?.images || [];
    const name = sectionId.replace('-modal', ''); // 'promo' | 'birthday'

    // Slides: each occupies 100% of the slider and centers the image (object-contain).
    slider.innerHTML = images.map(img => `
      <div class="modal-slide">
        <div class="image-wrapper modal-image-wrapper">
          <img src="${img.src}" alt="${img.alt}" class="modal-slide-img" loading="lazy">
          <div class="price-overlay absolute inset-0 pointer-events-none" data-image-id="${img.id}"></div>
        </div>
      </div>
    `).join('');

    // Dots generated from the ACTUAL image count (1 -> hidden by CSS/JS below).
    const dotsList = document.querySelector(`[data-slider-dots-list="${name}"]`);
    if (dotsList) {
      dotsList.innerHTML = images.map((_, i) => `
        <button type="button" class="modal-dot${i === 0 ? ' is-active' : ''}" data-slide-to="${i}" data-slider="${name}" aria-label="Slide ${i + 1}"></button>
      `).join('');
    }

    // Measure each slide wrapper once its picture is decoded (real display box).
    slider.querySelectorAll('img.modal-slide-img').forEach(img => {
      if (img.complete) return;
      img.addEventListener('load', () => this.sizeModalSliders(), { once: true });
      img.addEventListener('error', () => this.sizeModalSliders(), { once: true });
    });

    this.updateSliderUI(name, 0);

    // Modal pictures live in a hidden dialog, so the lazy observer from
    // `renderAllPriceTags()` would never fire for them. Paint their price tags
    // right away - the overlay is percentage-based, so it stays aligned.
    if (this.priceDataByImageId) {
      slider.querySelectorAll('.price-overlay[data-image-id]').forEach(overlay => {
        this.paintPriceOverlay(overlay);
      });
    }
  }

  /** Count of slides currently rendered in a modal slider */
  getSliderSlideCount(name) {
    const slider = document.getElementById(`${name}-content`);
    return slider ? slider.querySelectorAll('.modal-slide').length : 0;
  }

  /** Sync dots, counter and arrow visibility with the active slide index */
  updateSliderUI(name, index) {
    const total = this.getSliderSlideCount(name);
    const safeIndex = total > 0 ? Math.max(0, Math.min(index, total - 1)) : 0;

    const dotsList = document.querySelector(`[data-slider-dots-list="${name}"]`);
    if (dotsList) {
      dotsList.querySelectorAll('.modal-dot').forEach((dot, i) => {
        dot.classList.toggle('is-active', i === safeIndex);
      });
    }

    const counter = document.querySelector(`[data-slider-counter="${name}"]`);
    if (counter) counter.textContent = `${total > 0 ? safeIndex + 1 : 0} / ${total}`;

    // Resolve the modal by the `.modal-fullscreen` class, not just by id, so an
    // accidentally duplicated id in the page flow can never break the UI state.
    const modal = this.getModalEl(name);
    const arrowsScope = modal || document;
    arrowsScope.querySelectorAll(`[data-slider-arrows="${name}"]`).forEach(btn => {
      const isPrev = btn.classList.contains('modal-nav-prev');
      // Arrows: hidden on the first/last slide and when there is a single slide.
      btn.classList.toggle('hidden', total <= 1);
      btn.classList.toggle('is-disabled', total <= 1 || (isPrev ? safeIndex === 0 : safeIndex >= total - 1));
      // An arrow that just became unavailable must stop being hinted at.
      if (btn.classList.contains('is-disabled')) this.hideArrowHint(name, false);
    });
    if (modal) {
      // Bottom plashka (dots + counter) hidden for a single image.
      modal.classList.toggle('is-single', total <= 1);
    }

    // Edge tap zones: tappable only in a direction that is still available, so
    // an edge tap can never fire a no-op scroll at the first/last slide.
    (modal || document).querySelectorAll(`[data-slider-edge="${name}"]`).forEach(zone => {
      const isPrev = zone.getAttribute('data-edge-dir') === 'prev';
      zone.classList.toggle('is-disabled', total <= 1 || (isPrev ? safeIndex <= 0 : safeIndex >= total - 1));
    });

    this.onSlideIndexChanged(name, safeIndex);
  }

  /* ------------------------------------------------------------------ *
   * Arrow swipe-hint
   *
   * The arrows are always invisible in the idle state (opacity: 0) so they
   * never cover the picture. While a modal is open they hint in a REPEATING
   * cycle so a guest who never touches the slider keeps being reminded:
   *
   *      show the arrows for a full 3-cycle hint (4800ms + grace)
   *        -> fade out -> stay hidden for 5s (MODAL_HINT_GAP_MS)
   *        -> show again -> ... (forever)
   *
   * The cycle starts right after a modal opens (after the 350ms fade-in) and is
   * restarted (not stopped) whenever a gesture settles, so it keeps running for
   * as long as the modal stays open. Any scroll / swipe / arrow / dot / edge tap
   * clears the pending timers and hides the arrows at once; closing the modal
   * drops the cycle for good.
   *
   * The hinted arrows always mirror the directions the guest can actually take
   * from the current slide: both on a middle slide, right only on the first
   * slide, left only on the last slide. A single slide is never hinted.
   * ------------------------------------------------------------------ */

  /** Per-slider hint state (timers + last known slide index). */
  hintState(name) {
    if (!this._arrowHint) this._arrowHint = {};
    if (!this._arrowHint[name]) {
      this._arrowHint[name] = {
        showTimer: null,
        hideTimer: null,
        // Pending "show the next hint again after the 5s gap" timer.
        loopTimer: null,
        // Pending "resume the repeating loop once the gesture has settled" timer.
        resumeTimer: null,
        // True while the hint must keep repeating every (hint + 5s) while the
        // modal stays open and untouched.
        repeating: false,
        lastIndex: null,
      };
    }
    return this._arrowHint[name];
  }

  /** Clear all pending hint timers for one slider */
  clearArrowHintTimers(name) {
    const st = this.hintState(name);
    if (st.showTimer) { clearTimeout(st.showTimer); st.showTimer = null; }
    if (st.hideTimer) { clearTimeout(st.hideTimer); st.hideTimer = null; }
    if (st.loopTimer) { clearTimeout(st.loopTimer); st.loopTimer = null; }
    if (st.resumeTimer) { clearTimeout(st.resumeTimer); st.resumeTimer = null; }
  }

  /**
   * Hide the hint arrows immediately.
   * @param {string} name
   * @param {boolean} [clearTimers=true] also drop any pending show/hide timer
   */
  hideArrowHint(name, clearTimers = true) {
    if (clearTimers) this.clearArrowHintTimers(name);
    const modal = this.getModalEl(name) || document;
    modal.querySelectorAll(`[data-slider-arrows="${name}"]`).forEach(btn => {
      // Cancel any in-flight animation as well, so a hint that is hidden
      // mid-cycle cannot keep running (and cannot block the next restart).
      this.restartCssAnimation(btn);
      btn.classList.remove('is-hint', 'is-nudging');
    });
  }

  /** Full reset: stop the timers, hide the arrows and forget the last index */
  resetArrowHint(name) {
    // Closing the modal / resetting the slider kills the whole repeat cycle.
    this.stopArrowHintLoop(name);
    this.hideArrowHint(name, true);
    this.hintState(name).lastIndex = null;
  }

  /**
   * Restart a CSS animation on `el` from frame 0, deterministically.
   *
   * The naive `classList.remove(); void el.offsetWidth; classList.add();` trick
   * is unreliable: reading `offsetWidth` only flushes LAYOUT, while the browser
   * may still coalesce the `animation-name` change (none -> <name>) inside the
   * same frame, so on the 2nd and later hints the pulse/nudge simply never
   * restarts (the arrow appears but stays still - "the sway works only once").
   *
   * `getComputedStyle(el).animationName` forces a STYLE recalc of the animation
   * property itself, which the engine cannot coalesce, and cancelling any live
   * animation via the Web Animations API guarantees a clean restart even when
   * the hint is re-shown while the previous one is still mid-flight.
   */
  restartCssAnimation(el) {
    if (!el) return;
    // Drop any in-flight animations (nudge on the button, pulse on the <svg>,
    // halo on the ::before) so nothing is left running from the previous hint.
    // `subtree: true` + `pseudoElement` coverage is what cancels the child/pseudo
    // animations too - otherwise a finished `forwards` pulse would not re-run.
    if (typeof el.getAnimations === 'function') {
      let animations = [];
      try { animations = el.getAnimations({ subtree: true }); }
      catch (_) { animations = []; }
      if (!animations.length) {
        try { animations = el.getAnimations(); } catch (_) { animations = []; }
      }
      animations.forEach(anim => {
        try { anim.cancel(); } catch (_) { /* older engine - ignore */ }
      });
    }
    // Force the animation-name to be recomputed (STYLE flush, not just layout).
    void getComputedStyle(el).animationName;
  }

  /**
   * Show the arrow(s) that match the AVAILABLE swipe directions for `durationMs`,
   * then fade them out. Only directions the guest can actually take are hinted:
   *   - first slide (index === 0)    -> ONLY the NEXT arrow (nothing to the left);
   *   - last slide  (index === last) -> ONLY the PREV arrow (nothing to the right);
   *   - middle slides                -> BOTH arrows, pulsing + swaying in sync;
   *   - single slide                 -> no hint at all.
   * `nudge` adds the gentle rocking on the hinted arrow(s) in their own direction.
   * The default duration is exactly MODAL_HINT_DURATION_MS (3 full pulse cycles)
   * plus a tiny grace, so the pulse never gets cut mid-cycle.
   *
   * When `st.repeating` is set (the modal is open and the guest is idle) the hint
   * re-arms itself: it shows for one full hint, disappears, stays hidden for
   * MODAL_HINT_GAP_MS (5s) and then shows again - forever, until scroll / swipe /
   * arrow tap / modal close clears the timers and stops the loop.
   */
  showArrowHint(name, durationMs = null, nudge = true) {
    const total = this.getSliderSlideCount(name);
    if (total <= 1) return;
    this.clearArrowHintTimers(name);

    const index = this.getActiveSlideIndex(name);
    const modal = this.getModalEl(name) || document;

    // Collect the arrows to hint FIRST, then start every one of them in one
    // synchronous pass so the pulse + nudge of both arrows begin in the SAME
    // frame (perfectly synchronised sway) and each is restarted from frame 0.
    const targets = [];
    modal.querySelectorAll(`[data-slider-arrows="${name}"]`).forEach(btn => {
      if (btn.classList.contains('hidden')) return;
      const isPrev = btn.classList.contains('modal-nav-prev');
      // Only the directions that are actually available from the current slide:
      //  - the PREV arrow only when there is a slide to the left  (index > 0);
      //  - the NEXT arrow only when there is a slide to the right (index < last);
      //  => first slide -> next only, last slide -> prev only, middle -> both.
      if (isPrev ? index <= 0 : index >= total - 1) return;
      // Never hint an arrow that is currently unavailable (is-disabled) - e.g. a
      // stale updateSliderUI pass must not leave a disabled arrow swaying.
      if (btn.classList.contains('is-disabled')) return;
      targets.push(btn);
    });

    if (!targets.length) return;

    targets.forEach(btn => {
      // 1. Clear the previous hint state so the CSS animation can restart.
      btn.classList.remove('is-hint', 'is-nudging');
      this.restartCssAnimation(btn);
      // 2. Re-apply: `.is-hint` fades the arrow in and starts the pulse/halo,
      //    `.is-nudging` adds the directional rock (both run 3 synced cycles).
      btn.classList.add('is-hint');
      btn.classList.toggle('is-nudging', nudge);
    });

    // Belt-and-braces: force one more style flush AFTER all classes are applied
    // so the browser commits the freshly restarted animations this frame.
    if (targets[0]) void getComputedStyle(targets[0]).animationName;

    const st = this.hintState(name);
    const holdMs = (durationMs || MODAL_HINT_DURATION_MS) + MODAL_HINT_GRACE_MS;
    st.hideTimer = setTimeout(() => {
      st.hideTimer = null;
      this.hideArrowHint(name, false);
      // Repeat while the modal is open and the guest is idle: after the hint has
      // faded out, wait the 5s gap and show it again (tail-recursive). Any
      // activity clears `loopTimer`/`repeating` and breaks the chain at once.
      if (st.repeating) this.scheduleArrowHint(name, MODAL_HINT_GAP_MS);
    }, holdMs);
  }

  /**
   * Begin the repeating hint loop for an open modal: show the hint now (after the
   * fade-in delay) and keep re-showing it every (hint + 5s gap) until the guest
   * interacts or the modal closes. With a single slide the arrows are never
   * hinted, so the loop is not armed at all.
   * @param {number} [initialDelayMs=350] delay before the first hint.
   * @param {boolean} [onlyOnFirstSlide=false] when true the very first hint is
   *   skipped unless the slider is still on slide 1 (used right after opening, so
   *   a guest who already swiped during the fade-in is not hinted).
   */
  startArrowHintLoop(name, initialDelayMs = 350, onlyOnFirstSlide = false) {
    const total = this.getSliderSlideCount(name);
    if (total <= 1) return; // single image -> never any arrows
    const st = this.hintState(name);
    st.repeating = true;
    this.clearArrowHintTimers(name);
    // Let the modal fade in first, then hint (and keep looping from then on).
    st.showTimer = setTimeout(() => {
      st.showTimer = null;
      if (!st.repeating) return;
      // Only the opening hint insists on slide 1; a resumed loop hints whichever
      // slide the guest is on (so the available directions keep being shown).
      if (onlyOnFirstSlide && this.getActiveSlideIndex(name) !== 0) return;
      this.showArrowHint(name, MODAL_HINT_DURATION_MS, true);
    }, initialDelayMs);
  }

  /**
   * Stop the repeating hint loop and drop every pending timer.
   * @param {boolean} [clearResume=true] also cancel a pending auto-resume, so a
   *   modal close cannot be followed by a stray hint.
   */
  stopArrowHintLoop(name, clearResume = true) {
    const st = this.hintState(name);
    st.repeating = false;
    if (st.loopTimer) { clearTimeout(st.loopTimer); st.loopTimer = null; }
    if (clearResume && st.resumeTimer) { clearTimeout(st.resumeTimer); st.resumeTimer = null; }
  }

  /**
   * Right after the modal opens: the slider is reset to the first slide, so
   * gently reveal the "next" arrow for exactly three pulse cycles so the guest
   * immediately sees that the slider can be swiped. The hint keeps repeating
   * (5s gap) for as long as the modal stays open and the guest does nothing.
   */
  showArrowHintOnOpen(name) {
    this.startArrowHintLoop(name, 350, true);
  }
  /**
   * Idle reminder: after `delayMs` (5s by default) flash the arrows for the
   * directions that are still available (~3 pulse cycles) - but only when the
   * slider actually has more than one slide. On the FIRST slide that is the NEXT
   * arrow, on the LAST slide the PREV arrow, and on a middle slide BOTH of them.
   * Reuses the `loopTimer` slot so it never collides with the repeating cycle.
   */
  scheduleArrowHint(name, delayMs = MODAL_HINT_GAP_MS) {
    const st = this.hintState(name);
    if (st.loopTimer) { clearTimeout(st.loopTimer); st.loopTimer = null; }

    const total = this.getSliderSlideCount(name);
    if (total <= 1) return;

    st.loopTimer = setTimeout(() => {
      st.loopTimer = null;
      const count = this.getSliderSlideCount(name);
      // Re-check at fire time: a single slide can never be hinted.
      if (count <= 1) return;
      this.showArrowHint(name, MODAL_HINT_DURATION_MS, true);
    }, delayMs);
  }

  /**
   * User activity (scroll / swipe / arrow / dot / edge tap): cancel the pending
   * hint and hide the arrows at once. While the modal stays OPEN the repeating
   * cycle is resumed 5s later, so an idle guest keeps being reminded; closing the
   * modal (`resetArrowHint`) stops it for good.
   */
  touchArrowHintActivity(name) {
    this.stopArrowHintLoop(name, false);
    this.clearArrowHintTimers(name);
    this.hideArrowHint(name, false);

    if (this.activeModal === name && this.getSliderSlideCount(name) > 1) {
      const st = this.hintState(name);
      st.resumeTimer = setTimeout(() => {
        st.resumeTimer = null;
        // Only while the modal is still open and untouched.
        if (this.activeModal === name) this.startArrowHintLoop(name, MODAL_HINT_GAP_MS);
      }, MODAL_HINT_GAP_MS);
    }
  }

  /** Called by updateSliderUI whenever the snapped slide index changes */
  onSlideIndexChanged(name, safeIndex) {
    const st = this.hintState(name);
    if (st.lastIndex !== safeIndex) {
      st.lastIndex = safeIndex;
      // A slide change invalidates the running hint: hide it and start over.
      this.touchArrowHintActivity(name);
    }
  }

  /**
   * Width of one slide in px (== the slider viewport width). Falls back to the
   * first slide's own width when `clientWidth` is still 0 (e.g. the modal has
   * just been unhidden and layout has not been flushed yet), so scroll math
   * never silently becomes a no-op (`0 * index`).
   */
  getSliderStep(name) {
    const slider = document.getElementById(`${name}-content`);
    if (!slider) return 0;
    const fromSlider = slider.clientWidth || Math.round(slider.getBoundingClientRect().width) || 0;
    if (fromSlider > 0) return fromSlider;
    const slide = slider.querySelector('.modal-slide');
    return slide ? Math.round(slide.getBoundingClientRect().width) || 0 : 0;
  }

  /** Index of the slide currently snapped into view */
  getActiveSlideIndex(name) {
    const slider = document.getElementById(`${name}-content`);
    if (!slider) return 0;
    const w = this.getSliderStep(name) || 1;
    return Math.round(slider.scrollLeft / w);
  }

  /** Snap a modal slider to a given slide (used by dots / arrows) */
  scrollSliderTo(name, index) {
    const slider = document.getElementById(`${name}-content`);
    if (!slider) return;
    const total = this.getSliderSlideCount(name);
    const target = Math.max(0, Math.min(index, total - 1));
    // A dots/arrows jump is user activity: drop the hint before we animate.
    this.touchArrowHintActivity(name);
    const step = this.getSliderStep(name);
    if (step <= 0) {
      // Layout not measured yet - nothing sane to scroll to.
      this.updateSliderUI(name, target);
      return;
    }
    slider.scrollTo({ left: target * step, behavior: 'smooth' });
    this.updateSliderUI(name, target);
  }

  /** Reset a modal slider to the first slide (scrollLeft = 0) */
  resetSlider(name) {
    const slider = document.getElementById(`${name}-content`);
    if (!slider) return;
    // A reset invalidates every pending hint.
    this.resetArrowHint(name);
    // Instant jump on open (no smooth animation while the modal is appearing).
    const behavior = slider.style.scrollBehavior;
    slider.style.scrollBehavior = 'auto';
    slider.scrollLeft = 0;
    // Restore the CSS smooth behavior on the next frame.
    requestAnimationFrame(() => { slider.style.scrollBehavior = behavior || ''; });
    this.updateSliderUI(name, 0);
  }

  /** Wire arrows, dots and scroll-sync for one modal slider */
  bindSlider(name) {
    const slider = document.getElementById(`${name}-content`);
    const modal = this.getModalEl(name) || document;
    if (!slider) return;

    // A pointer/finger press on the slider is activity -> cancel the hint.
    slider.addEventListener('pointerdown', () => this.touchArrowHintActivity(name), { passive: true });

    // Arrows (prev / next) - thin chevrons, tap-friendly, sit above the slides.
    // Bound via `[data-slider-arrows]` (not via the modal element) so a stray
    // duplicated `id` elsewhere in the page can never leave them unwired.
    modal.querySelectorAll(`[data-slider-arrows="${name}"]`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Any arrow click clears the hint immediately.
        this.touchArrowHintActivity(name);
        const step = btn.classList.contains('modal-nav-prev') ? -1 : 1;
        this.scrollSliderTo(name, this.getActiveSlideIndex(name) + step);
      });
    });

    // Dots -> jump to a specific slide.
    modal.querySelectorAll(`.modal-dot[data-slider="${name}"]`).forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.touchArrowHintActivity(name);
        this.scrollSliderTo(name, parseInt(dot.getAttribute('data-slide-to'), 10) || 0);
      });
    });

    // Edge tap zones -> step prev/next, even while the chevron is invisible.
    // A horizontal swipe may START on a zone (it covers the rim of the screen),
    // so the gesture is only treated as a tap when the pointer barely moved and
    // was released quickly; otherwise it is left to the native slider scroll.
    // `touch-action: pan-x` on the zone (styles.css) keeps native swiping alive.
    modal.querySelectorAll(`[data-slider-edge="${name}"]`).forEach(zone => {
      let startX = 0;
      let startY = 0;
      let startTime = 0;
      let tracking = false;

      zone.addEventListener('pointerdown', (e) => {
        tracking = true;
        startX = e.clientX;
        startY = e.clientY;
        startTime = Date.now();
        // A press is user activity -> drop the hint (same as the slider itself).
        this.touchArrowHintActivity(name);
      });

      zone.addEventListener('pointermove', (e) => {
        if (!tracking) return;
        // Moved too far -> this is a swipe/scroll, not a tap: stop tracking so
        // the native horizontal scroll (started on this zone) is left alone.
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > MODAL_EDGE_TAP_MAX_MOVE_PX) {
          tracking = false;
        }
      });

      const cancel = () => { tracking = false; };
      zone.addEventListener('pointercancel', cancel);
      zone.addEventListener('pointerleave', cancel);

      zone.addEventListener('pointerup', (e) => {
        if (!tracking) return;
        tracking = false;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > MODAL_EDGE_TAP_MAX_MOVE_PX) return;
        if (Date.now() - startTime > MODAL_EDGE_TAP_MAX_TIME_MS) return;

        const isPrev = zone.getAttribute('data-edge-dir') === 'prev';
        const total = this.getSliderSlideCount(name);
        const index = this.getActiveSlideIndex(name);
        // Only step in a direction that actually exists (guards the boundaries
        // independently of the `is-disabled` styling).
        if (total <= 1) return;
        if (isPrev && index <= 0) return;
        if (!isPrev && index >= total - 1) return;

        e.preventDefault();
        e.stopPropagation();
        this.scrollSliderTo(name, index + (isPrev ? -1 : 1));
      });

      // Keyboard/AT support: the zones are focusable-prohibited (tabindex="-1")
      // so Enter/Space on them is only reachable when a screen reader announces
      // them; keep the activation semantics consistent in that case.
      zone.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const isPrev = zone.getAttribute('data-edge-dir') === 'prev';
        const index = this.getActiveSlideIndex(name);
        if (this.getSliderSlideCount(name) <= 1) return;
        e.preventDefault();
        this.scrollSliderTo(name, index + (isPrev ? -1 : 1));
      });
    });

    // Keep dots/counter/arrows in sync with the native horizontal scroll and
    // (re)arm the repeating 5s hint loop once the scrolling has settled.
    let raf = null;
    let idleTimer = null;
    slider.addEventListener('scroll', () => {
      // Live scroll (swipe): stop the loop, hide the hint at once and postpone
      // the next cycle until the gesture has settled.
      this.touchArrowHintActivity(name);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleTimer = null;
        // Scroll stopped -> resume the repeating "there is more to swipe" hint
        // (5s gap), but only while the modal is still open.
        if (this.activeModal === name) this.startArrowHintLoop(name, MODAL_HINT_GAP_MS);
      }, 150);
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        this.updateSliderUI(name, this.getActiveSlideIndex(name));
      });
    }, { passive: true });
  }

  renderAllPriceTags() {
    if (!this.config?.sections) return;

    // Build a lookup so the lazy observer can resolve an overlay back to its
    // config image without re-scanning the whole config on every intersection.
    this.priceDataByImageId = new Map();
    this.config.sections.forEach(section => {
      (section.images || []).forEach(img => {
        this.priceDataByImageId.set(img.id, BarMenuApp.normalizePriceData(img));
      });
    });

    const overlays = Array.from(document.querySelectorAll('.price-overlay[data-image-id]'));
    if (!('IntersectionObserver' in window)) {
      overlays.forEach(overlay => this.paintPriceOverlay(overlay));
      return;
    }

    // Price tags are plain CSS-percentage boxes, so painting them is cheap - but
    // doing it for EVERY image of a long menu at once stalls the first frames.
    // They are painted only when the picture comes near the viewport, so a
    // finger drag never competes with a burst of DOM work.
    if (!this.priceObserver) {
      this.priceObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          this.paintPriceOverlay(entry.target);
        });
      }, { rootMargin: '300px 0px 300px 0px' });
    }

    overlays.forEach(overlay => {
      if (overlay.childElementCount > 0) return; // already painted
      // Pictures already on screen are painted immediately (no flash of
      // missing prices when the page opens scrolled down).
      const wrapper = overlay.parentElement;
      const r = wrapper ? wrapper.getBoundingClientRect() : null;
      const nearViewport = r && r.bottom > -300 && r.top < (window.innerHeight || 0) + 300;
      if (nearViewport) this.paintPriceOverlay(overlay);
      else this.priceObserver.observe(overlay);
    });
  }

  paintPriceOverlay(overlay) {
    const imageId = overlay.getAttribute('data-image-id');
    const prices = this.priceDataByImageId?.get(imageId);
    if (!prices) return;
    this.renderPriceTags(imageId, prices);
  }

  /**
   * Price payload for one image: `priceZones` (new) wins, legacy `prices[]` is the
   * fallback. Every entry is normalized to carry a `price` property.
   */
  static normalizePriceData(img) {
    const source = (img?.priceZones && img.priceZones.length > 0)
      ? img.priceZones
      : (img?.prices || []);
    return source.map(p => ({
      ...p,
      price: p.price !== undefined ? p.price : (p.text || '')
    }));
  }

  renderPriceTags(imageId, prices) {
    const overlay = document.querySelector(`.price-overlay[data-image-id="${imageId}"]`);
    if (!overlay) return;

    // The overlay (inset: 0) matches the image display area exactly, because the
    // <img> is sized to fill its wrapper (no object-fit letterboxing) and the
    // wrapper has `container-type: inline-size`. So we position tags with plain
    // CSS percentages relative to the overlay - which equals the image area.
    overlay.innerHTML = prices.map(price => {
      const color = price.color || '#000000';
      const textShadow = price.textShadow ? '0 0 4px rgba(0, 0, 0, 0.8)' : 'none';
      const fontWeight = price.bold === false ? 400 : 800;
      const text = price.price !== undefined && price.price !== null
        ? price.price
        : (price.text || '');

      // Fluid font size proportional to the image width (container query units),
      // identical to the admin editor: what the admin sees == what the visitor sees.
      const cqw = BarMenuApp.fontSizeToCqw(price.fontSize);

      const x = Number(price.x_percent) || 0;
      const y = Number(price.y_percent) || 0;
      const w = Number(price.w_percent) || 0;
      const h = Number(price.h_percent) || 0;

      if (w > 0 && h > 0) {
        // A zone is a RECTANGLE (x/y = top-left, w/h = size), exactly as drawn in the
        // admin. The tag OCCUPIES that rectangle 1:1 (width/height in %), so it
        // hides the old price on the JPG only inside the drawn box - no box around it.
        return `
          <div class="price-tag"
               style="left: ${x}%; top: ${y}%; width: ${w}%; height: ${h}%; font-size: clamp(8px, ${cqw}cqw, 96px); font-weight: ${fontWeight}; color: ${color}; text-shadow: ${textShadow};"
               data-price-id="${price.id}">
            ${text}
          </div>
        `;
      }

      // Legacy `prices[]` (no rectangle): fall back to a centered point label.
      return `
        <div class="price-tag"
             style="left: ${x}%; top: ${y}%; transform: translate(-50%, -50%); font-size: clamp(8px, ${cqw}cqw, 96px); font-weight: ${fontWeight}; color: ${color}; text-shadow: ${textShadow};"
             data-price-id="${price.id}">
          ${text}
        </div>
      `;
    }).join('');
  }

  /**
   * Convert a stored pixel font size into container-query width units (cqw) so the
   * text scales proportionally with the image. Baseline: 14px == 2.5cqw at a 560px
   * wide image (preserves the original look). Used by both the client and admin.
   */
  static fontSizeToCqw(fontSize) {
    const px = Number(fontSize);
    const safe = (isFinite(px) && px > 0) ? px : 14;
    return Math.round((safe / 5.6) * 1000) / 1000;
  }

  // ... rest of the existing methods (bindEvents, handleNavClick, smoothScrollTo, etc.)
  // Keep all existing methods exactly as they were

  setupScrollListener() {
    // Read-only, passive listeners: nothing here may call preventDefault (that
    // would cancel the native touch scroll) nor touch layout during the gesture.
    window.addEventListener('scroll', () => this.onScroll(), { passive: true });
    // A finger gesture takes over instantly: drop the programmatic smooth-scroll
    // mode the moment the guest touches the screen, so the drag is 1:1 with the
    // finger (no synthetic animation fighting the finger = no jitter).
    const cancelSmooth = () => this.endSmoothScroll();
    window.addEventListener('touchstart', cancelSmooth, { passive: true });
    window.addEventListener('wheel', cancelSmooth, { passive: true });
  }

  setupResizeListener() {
    // Price tags are positioned with CSS percentages, so they automatically
    // stay aligned to the image on resize - no re-rendering required.
    // Modal slider wrappers, however, are sized in px, so re-measure them.
    window.addEventListener('resize', () => this.sizeModalSliders(), { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(() => this.sizeModalSliders(), 150));
    // A picture finishing its download (mobile networks) changes the layout - the
    // header state must be re-evaluated once, never during the load itself.
    window.addEventListener('load', () => this.updateHeaderVisibility(), { passive: true });
  }

  /**
   * Size every modal slide wrapper to the picture's real display box (aspect
   * preserved inside the slide, capped at 100% x 100%). Mirrors the approach
   * used by the admin price editor (#price-editor-wrapper) so the price overlay
   * (inset: 0) always lands exactly on the printed image - no coordinate drift.
   */
  sizeModalSliders() {
    document.querySelectorAll('.modal-slide').forEach(slide => {
      const img = slide.querySelector('img.modal-slide-img');
      const wrapper = slide.querySelector('.modal-image-wrapper');
      if (!img || !wrapper) return;

      // Available space inside the slide (clientWidth/Height include padding, so
      // subtract it to keep the picture inside the padded content box).
      const cs = window.getComputedStyle(slide);
      const availW = slide.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
      const availH = slide.clientHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
      if (availW <= 0 || availH <= 0) return;

      const iw = img.naturalWidth || 0;
      const ih = img.naturalHeight || 0;
      if (iw <= 0 || ih <= 0) {
        // Image not decoded yet - keep the CSS fallback and retry when loaded.
        return;
      }

      const scale = Math.min(availW / iw, availH / ih);
      const w = Math.round(iw * scale);
      const h = Math.round(ih * scale);

      wrapper.style.width = `${w}px`;
      wrapper.style.height = `${h}px`;
      wrapper.style.maxWidth = '100%';
      wrapper.style.maxHeight = '100%';
    });
  }

  onScroll() {
    if (this.ticking) return;
    this.ticking = true;

    requestAnimationFrame(() => {
      this.updateHeaderVisibility();
      // A programmatic smooth scroll ends once the scroll position stops moving.
      if (this.smoothScrollUntil && performance.now() > this.smoothScrollUntil) {
        this.endSmoothScroll();
      }
      this.ticking = false;
    });
  }

  /**
   * Programmatic smooth scrolling is OPT-IN per gesture (a nav button / anchor
   * jump), never a global `scroll-behavior: smooth`. A global smooth behaviour on
   * <html> also animates finger-driven scrolls on some engines - the scroll then
   * "chases" the finger and snaps back and forth. Here the smooth mode lives only
   * for the duration of the jump and is dropped on the first user gesture.
   */
  beginSmoothScroll(durationMs = 700) {
    const root = document.documentElement;
    root.classList.add('is-smooth-scrolling');
    this.smoothScrollUntil = performance.now() + durationMs + 150;
  }

  endSmoothScroll() {
    if (!this.smoothScrollUntil && !document.documentElement.classList.contains('is-smooth-scrolling')) return;
    this.smoothScrollUntil = 0;
    document.documentElement.classList.remove('is-smooth-scrolling');
  }

  /**
   * The fixed header is measured AFTER its show/hide transition settles, so a
   * jump never mixes a half-slid header height with the target offset.
   * `headerHeight()` keeps the offset stable while the bar animates.
   */
  headerHeight() {
    if (!this.header) return 0;
    return this.headerVisible ? this.header.offsetHeight : 0;
  }

  updateHeaderVisibility() {
    if (!this.heroSection || !this.header) return;

    const heroRect = this.heroSection.getBoundingClientRect();

    // Hysteresis: the bar appears a bit after the hero has left the screen and
    // disappears a bit later again. A single threshold flips the bar back and
    // forth on every other pixel of a slow drag (visible "twitching").
    const SHOW_AT = 24;   // hero bottom above this -> show
    const HIDE_AT = 84;   // hero bottom below this -> hide
    const current = heroRect.bottom;
    let shouldShow = this.headerVisible;

    if (!this.headerVisible && current < SHOW_AT) shouldShow = true;
    else if (this.headerVisible && current > HIDE_AT) shouldShow = false;

    if (shouldShow !== this.headerVisible) {
      this.headerVisible = shouldShow;
      if (shouldShow) {
        this.header.classList.add('header-visible');
        this.header.setAttribute('aria-hidden', 'false');
      } else {
        this.header.classList.remove('header-visible');
        this.header.setAttribute('aria-hidden', 'true');
      }
    }
  }

  bindEvents() {
    // Navigation buttons (FOOD, DRINKS, PROMO SET, BIRTHDAY OFFER)
    // Use event delegation since buttons are dynamically rendered
    document.addEventListener('click', (e) => {
      const navBtn = e.target.closest('[data-nav]');
      if (navBtn) {
        this.handleNavClick({ currentTarget: navBtn });
      }
      
      const langBtn = e.target.closest('[data-lang]');
      if (langBtn) {
        this.handleLangClick({ currentTarget: langBtn });
      }
    });

    // Modal back buttons
    document.getElementById('promo-back')?.addEventListener('click', () => this.closeModal('promo'));
    document.getElementById('birthday-back')?.addEventListener('click', () => this.closeModal('birthday'));

    // Modal sliders: arrows, dots, scroll-sync (slides built in renderSlider)
    this.bindSlider('promo');
    this.bindSlider('birthday');

    // Close modal on overlay click (outside content)
    this.promoModal?.addEventListener('click', (e) => {
      if (e.target === this.promoModal) this.closeModal('promo');
    });
    this.birthdayModal?.addEventListener('click', (e) => {
      if (e.target === this.birthdayModal) this.closeModal('birthday');
    });

    // Keyboard: Escape closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.closeModal(this.activeModal);
      }
    });

    // Handle hash changes for direct linking
    window.addEventListener('hashchange', () => this.handleHashNavigation());
  }

  handleNavClick(e) {
    const btn = e.currentTarget;
    const target = btn.getAttribute('data-nav');

    // Buttons with an external link (e.g. KARAOKE) open another project in a
    // brand new window. The current menu stays exactly as it is: no active
    // state, no scroll, no modal.
    const externalUrl = btn.getAttribute('data-external-url');
    if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    
    // Update active state
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    switch (target) {
      case 'food':
        this.smoothScrollTo('food-section');
        if (this.activeModal) this.closeModal(this.activeModal);
        break;
      case 'drinks':
        this.smoothScrollTo('drinks-section');
        if (this.activeModal) this.closeModal(this.activeModal);
        break;
      case 'promo':
        this.openModal('promo');
        break;
      case 'birthday':
        this.openModal('birthday');
        break;
    }
  }

  smoothScrollTo(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const headerHeight = this.headerHeight();
    const sectionTop = section.getBoundingClientRect().top + window.pageYOffset;
    const offsetTop = Math.max(0, sectionTop - headerHeight);

    // Smooth animation only for this one jump; a touch cancels it instantly.
    this.beginSmoothScroll();
    window.scrollTo({
      top: offsetTop,
      behavior: 'smooth'
    });

    history.replaceState(null, '', `#${sectionId}`);
  }

  openModal(modalName) {
    const modal = this.getModalEl(modalName) || (modalName === 'promo' ? this.promoModal : this.birthdayModal);
    if (!modal) return;

    this.scrollPosition = window.pageYOffset;

    // Opening a full-screen modal interrupts any running page animation and
    // locks the page exactly where it is.
    this.endSmoothScroll();
    document.body.classList.add('modal-open');
    document.body.style.top = `-${this.scrollPosition}px`;

    modal.classList.remove('hidden');
    modal.classList.add('modal-enter');

    // Always start from the first slide (scrollLeft = 0) when opening.
    this.resetSlider(modalName);

    // The wrapper is only measurable once the modal is visible/laid out.
    requestAnimationFrame(() => this.sizeModalSliders());

    // Opening hint: with 2+ slides, gently reveal the arrow(s) the guest can use
    // and keep repeating the hint every (hint + 5s) for as long as the modal
    // stays open, so the guest realises the slider can be swiped.
    this.showArrowHintOnOpen(modalName);
    
    const backBtn = modal.querySelector('.back-btn');
    if (backBtn) {
      setTimeout(() => backBtn.focus(), 50);
    }

    this.activeModal = modalName;

    document.querySelectorAll('[data-nav]').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-nav="${modalName}"]`)?.classList.add('active');
  }

  closeModal(modalName) {
    const modal = this.getModalEl(modalName) || (modalName === 'promo' ? this.promoModal : this.birthdayModal);
    if (!modal) return;

    // Closing the modal cancels all timers and hides the arrows at once.
    this.resetArrowHint(modalName);

    modal.classList.add('hidden');
    modal.classList.remove('modal-enter');

    document.body.classList.remove('modal-open');
    const scrollPos = parseInt(document.body.style.top || '0', 10) * -1;
    document.body.style.top = '';
    // Restore instantly (`auto`): an animated restore while the modal disappears
    // reads as the page sliding away on its own.
    this.endSmoothScroll();
    window.scrollTo({ top: scrollPos, left: 0, behavior: 'auto' });
    // The header state depends on the restored position - resync it right away
    // instead of waiting for the first scroll event.
    this.updateHeaderVisibility();

    this.activeModal = null;

    history.replaceState(null, '', window.location.pathname);
  }

  async handleLangClick(e) {
    const btn = e.currentTarget;
    const lang = btn.getAttribute('data-lang');
    
    if (window.i18n) {
      await window.i18n.setLanguage(lang);
    }
  }

  handleHashNavigation() {
    const hash = window.location.hash.slice(1);
    if (hash === 'food') {
      setTimeout(() => this.smoothScrollTo('food-section'), 100);
    } else if (hash === 'drinks') {
      setTimeout(() => this.smoothScrollTo('drinks-section'), 100);
    } else if (hash === 'promo') {
      this.openModal('promo');
    } else if (hash === 'birthday') {
      this.openModal('birthday');
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new BarMenuApp();
});

// Handle page visibility change (restore scroll if needed)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && window.app?.activeModal) {
    const modal = window.app.activeModal === 'promo' 
      ? window.app.promoModal 
      : window.app.birthdayModal;
    if (modal && modal.classList.contains('hidden')) {
      window.app.closeModal(window.app.activeModal);
    }
  }
});