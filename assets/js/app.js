/**
 * app.js - Main application logic
 * Handles navigation, smooth scroll, modals, and language switching
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
    
    this.init();
  }

  init() {
    this.bindEvents();
    this.handleHashNavigation();
    this.setupScrollListener();
  }

  setupScrollListener() {
    // Listen for scroll to show/hide header
    window.addEventListener('scroll', () => this.onScroll(), { passive: true });
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
    const viewportHeight = window.innerHeight;
    
    // Show header when hero section is mostly out of view (less than 50px visible)
    const shouldShow = heroBottom < 50;
    
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
    document.querySelectorAll('[data-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleNavClick(e));
    });

    // Language switcher buttons
    document.querySelectorAll('[data-lang]').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleLangClick(e));
    });

    // Modal back buttons
    document.getElementById('promo-back').addEventListener('click', () => this.closeModal('promo'));
    document.getElementById('birthday-back').addEventListener('click', () => this.closeModal('birthday'));

    // Close modal on overlay click (outside content)
    this.promoModal.addEventListener('click', (e) => {
      if (e.target === this.promoModal) this.closeModal('promo');
    });
    this.birthdayModal.addEventListener('click', (e) => {
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

  /**
   * Handle navigation button clicks
   * @param {Event} e - Click event
   */
  handleNavClick(e) {
    const btn = e.currentTarget;
    const target = btn.getAttribute('data-nav');
    
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

  /**
   * Smooth scroll to section with header offset
   * @param {string} sectionId - Section ID (food or drinks)
   */
  smoothScrollTo(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const headerHeight = this.headerVisible ? this.header.offsetHeight : 0;
    const sectionTop = section.getBoundingClientRect().top + window.pageYOffset;
    const offsetTop = sectionTop - headerHeight;

    // Use native smooth scroll
    window.scrollTo({
      top: offsetTop,
      behavior: 'smooth'
    });

    // Update URL hash without scrolling
    history.replaceState(null, '', `#${sectionId}`);
  }

  /**
   * Open a modal (promo or birthday)
   * @param {string} modalName - 'promo' or 'birthday'
   */
  openModal(modalName) {
    const modal = modalName === 'promo' ? this.promoModal : this.birthdayModal;
    if (!modal) return;

    // Save scroll position
    this.scrollPosition = window.pageYOffset;

    // Prevent body scroll
    document.body.classList.add('modal-open');
    document.body.style.top = `-${this.scrollPosition}px`;

    // Show modal with animation
    modal.classList.remove('hidden');
    modal.classList.add('modal-enter');
    
    // Focus management
    const backBtn = modal.querySelector('.back-btn');
    if (backBtn) {
      setTimeout(() => backBtn.focus(), 50);
    }

    this.activeModal = modalName;

    // Update nav active state
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-nav="${modalName}"]`)?.classList.add('active');
  }

  /**
   * Close the active modal
   * @param {string} modalName - 'promo' or 'birthday'
   */
  closeModal(modalName) {
    const modal = modalName === 'promo' ? this.promoModal : this.birthdayModal;
    if (!modal) return;

    // Hide modal
    modal.classList.add('hidden');
    modal.classList.remove('modal-enter');

    // Restore body scroll
    document.body.classList.remove('modal-open');
    const scrollPos = parseInt(document.body.style.top || '0', 10) * -1;
    document.body.style.top = '';
    window.scrollTo(0, scrollPos);

    this.activeModal = null;

    // Clear hash
    history.replaceState(null, '', window.location.pathname);
  }

  /**
   * Handle language button clicks
   * @param {Event} e - Click event
   */
  async handleLangClick(e) {
    const btn = e.currentTarget;
    const lang = btn.getAttribute('data-lang');
    
    if (window.i18n) {
      await window.i18n.setLanguage(lang);
    }
  }

  /**
   * Handle initial hash navigation (for direct links)
   */
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
  
  // Initialize i18n after app
  if (window.i18n) {
    window.i18n.init().catch(console.error);
  }
});

// Handle page visibility change (restore scroll if needed)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && window.app?.activeModal) {
    // Ensure modal is still visible
    const modal = window.app.activeModal === 'promo' 
      ? window.app.promoModal 
      : window.app.birthdayModal;
    if (modal && modal.classList.contains('hidden')) {
      window.app.closeModal(window.app.activeModal);
    }
  }
});