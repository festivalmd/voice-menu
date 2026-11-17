/**
 * app.js - Main application logic
 * Handles navigation, smooth scroll, modals, language switching, and dynamic config rendering
 */

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
      horizontalNav.innerHTML = this.config.navigation.horizontal.map(btn => `
        <button class="nav-btn shrink-0 md:flex-1 px-3 py-2 text-sm font-medium text-white/80 hover:text-white active:text-accent transition-colors whitespace-nowrap text-center" data-nav="${btn.id}"${btn.link ? ` data-external-url="${btn.link}"` : ''} data-i18n="${btn.labelKey}">${btn.id.toUpperCase()}</button>
      `).join('');
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
            ${section.images.map(img => `
              <div class="image-wrapper relative">
                <img src="${img.src}" alt="${img.alt}" class="w-full h-auto rounded-lg shadow-lg" loading="lazy">
                <div class="price-overlay absolute inset-0 pointer-events-none" data-image-id="${img.id}"></div>
              </div>
            `).join('')}
          </div>
        </section>
      `;
    }).join('');
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
    });
    if (modal) {
      // Bottom plashka (dots + counter) hidden for a single image.
      modal.classList.toggle('is-single', total <= 1);
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

    // Arrows (prev / next) - large, tap-friendly, sit above the slides.
    // Bound via `[data-slider-arrows]` (not via the modal element) so a stray
    // duplicated `id` elsewhere in the page can never leave them unwired.
    modal.querySelectorAll(`[data-slider-arrows="${name}"]`).forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const step = btn.classList.contains('modal-nav-prev') ? -1 : 1;
        this.scrollSliderTo(name, this.getActiveSlideIndex(name) + step);
      });
    });

    // Dots -> jump to a specific slide.
    modal.querySelectorAll(`.modal-dot[data-slider="${name}"]`).forEach(dot => {
      dot.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.scrollSliderTo(name, parseInt(dot.getAttribute('data-slide-to'), 10) || 0);
      });
    });

    // Keep dots/counter/arrows in sync with the native horizontal scroll.
    let raf = null;
    slider.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        this.updateSliderUI(name, this.getActiveSlideIndex(name));
      });
    }, { passive: true });
  }

  renderAllPriceTags() {
    if (!this.config?.sections) return;

    this.config.sections.forEach(section => {
      section.images.forEach(img => {
        // Use priceZones if available (new format with fontSize, color, textShadow), otherwise fall back to prices (legacy format)
        let priceData = img.priceZones && img.priceZones.length > 0 ? img.priceZones : (img.prices || []);
        
        // Normalize: ensure all price objects have a 'price' property for rendering
        priceData = priceData.map(p => ({
          ...p,
          price: p.price !== undefined ? p.price : (p.text || '')
        }));
        
        this.renderPriceTags(img.id, priceData);
      });
    });
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
    window.addEventListener('scroll', () => this.onScroll(), { passive: true });
  }

  setupResizeListener() {
    // Price tags are positioned with CSS percentages, so they automatically
    // stay aligned to the image on resize - no re-rendering required.
    // Modal slider wrappers, however, are sized in px, so re-measure them.
    window.addEventListener('resize', () => this.sizeModalSliders(), { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(() => this.sizeModalSliders(), 150));
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
      this.ticking = false;
    });
  }

  updateHeaderVisibility() {
    if (!this.heroSection || !this.header) return;
    
    const heroRect = this.heroSection.getBoundingClientRect();
    const heroBottom = heroRect.bottom;
    
    const shouldShow = heroBottom < 50;
    
    if (shouldShow !== this.headerVisible) {
      this.headerVisible = shouldShow;
      if (shouldShow) {
        this.header.classList.add('header-visible');
        this.header.setAttribute('aria-hidden', 'false');
        document.body.classList.add('header-visible');
      } else {
        this.header.classList.remove('header-visible');
        this.header.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('header-visible');
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

    const headerHeight = this.headerVisible ? this.header.offsetHeight : 0;
    const sectionTop = section.getBoundingClientRect().top + window.pageYOffset;
    const offsetTop = sectionTop - headerHeight;

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

    document.body.classList.add('modal-open');
    document.body.style.top = `-${this.scrollPosition}px`;

    modal.classList.remove('hidden');
    modal.classList.add('modal-enter');

    // Always start from the first slide (scrollLeft = 0) when opening.
    this.resetSlider(modalName);

    // The wrapper is only measurable once the modal is visible/laid out.
    requestAnimationFrame(() => this.sizeModalSliders());
    
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

    modal.classList.add('hidden');
    modal.classList.remove('modal-enter');

    document.body.classList.remove('modal-open');
    const scrollPos = parseInt(document.body.style.top || '0', 10) * -1;
    document.body.style.top = '';
    window.scrollTo(0, scrollPos);

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