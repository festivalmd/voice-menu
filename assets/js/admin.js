/**
 * admin.js - Admin Panel Logic
 * Handles navigation editing, image management (upload/delete/reorder), config saving, price editor
 */

class AdminPanel {
  constructor() {
    this.config = null;
    this.currentSection = null;
    this.draggedItem = null;
    this.uploadQueue = [];
    this.confirmCallback = null;
    this.dirty = false;
    this.locales = { ro: {}, ru: {}, en: {} };
    this.isSaving = false; // Guard against recursive saves
    
    this.init();
  }

  async init() {
    await Promise.all([this.loadConfig(), this.loadLocales()]);
    this.bindEvents();
    this.render();
  }

  async loadLocales() {
    try {
      const [ro, ru, en] = await Promise.all([
        fetch('/locales/ro.json').then(r => r.json()),
        fetch('/locales/ru.json').then(r => r.json()),
        fetch('/locales/en.json').then(r => r.json())
      ]);
      this.locales = { ro, ru, en };
    } catch (error) {
      console.error('Error loading locales:', error);
      this.locales = { ro: {}, ru: {}, en: {} };
    }
  }

  async loadConfig() {
    try {
      const response = await fetch('/api/admin/config');
      if (!response.ok) throw new Error('Failed to load config');
      this.config = await response.json();
    } catch (error) {
      console.error('Error loading config:', error);
      this.showToast('Failed to load configuration', 'error');
    }
  }

  // Ensure the dedicated "Start Background" section always exists (migration for
  // configs saved before it was introduced). It holds the hero/landing background.
  ensureHeroSection() {
    if (!this.config) return;
    if (!Array.isArray(this.config.sections)) this.config.sections = [];
    if (!this.config.sections.some(s => s.id === 'hero-section')) {
      this.config.sections.unshift({ id: 'hero-section', titleKey: 'Start Background', images: [] });
    }
  }

  // Ensure the KARAOKE button exists in both navigations (migration for configs
  // saved before it was introduced). It always sits right after BIRTHDAY OFFER.
  // Its optional `link` opens another project in a brand new window.
  ensureKaraokeNav() {
    if (!this.config || !this.config.navigation) return;
    const ensure = (arr, icon) => {
      if (!Array.isArray(arr)) return;
      if (arr.some(b => b.id === 'karaoke')) return;
      const btn = { id: 'karaoke', labelKey: 'nav.karaoke', target: 'karaoke', link: '' };
      if (icon) btn.icon = icon;
      const idx = arr.findIndex(b => b.id === 'birthday');
      arr.splice(idx === -1 ? arr.length : idx + 1, 0, btn);
    };
    ensure(this.config.navigation.horizontal);
    ensure(this.config.navigation.vertical, 'mic');
  }

  // "MENU" hero title switch. Defaults to ON for configs saved before it existed,
  // so the title keeps showing until the admin explicitly turns it off.
  // Also migrates the visual style option (gold | neon | editorial | glass).
  ensureMenuTitle() {
    if (!this.config) return;
    if (!this.config.navigation) this.config.navigation = {};
    const VALID_STYLES = ['gold', 'neon', 'editorial', 'glass'];
    const mt = this.config.navigation.menuTitle;
    if (!mt || typeof mt !== 'object') {
      this.config.navigation.menuTitle = { enabled: true, style: 'gold' };
    } else {
      if (typeof mt.enabled !== 'boolean') mt.enabled = true;
      if (!VALID_STYLES.includes(mt.style)) mt.style = 'gold';
    }
  }

  async loadConfig() {
    try {
      const response = await fetch('/api/admin/config');
      if (!response.ok) throw new Error('Failed to load config');
      this.config = await response.json();
      this.ensureHeroSection();
      this.ensureKaraokeNav();
      this.ensureMenuTitle();
    } catch (error) {
      console.error('Error loading config:', error);
      this.showToast('Failed to load configuration', 'error');
    }
  }

  async saveConfig() {
    // Prevent recursive saves
    if (this.isSaving) {
      console.warn('Save already in progress, skipping');
      return false;
    }
    this.isSaving = true;
    
    try {
      // Safe stringify with circular reference protection using a regular Set
      const seen = new Set();
      const safeStringify = (obj) => JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]';
          seen.add(value);
        }
        return value;
      });
      
      const response = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: safeStringify(this.config)
      });
      if (!response.ok) throw new Error('Failed to save config');
      const result = await response.json();
      this.showToast(`Configuration saved (v${result.version})`, 'success');
      this.dirty = false;
      document.getElementById('btn-save-all').disabled = true;
      document.getElementById('save-indicator')?.classList.add('hidden');
      return true;
    } catch (error) {
      console.error('Error saving config:', error);
      this.showToast('Failed to save configuration', 'error');
      return false;
    } finally {
      this.isSaving = false;
    }
  }

  async saveAll() {
    const btn = document.getElementById('btn-save-all');
    const indicator = document.getElementById('save-indicator');
    btn.disabled = true;
    indicator.classList.remove('hidden', 'saved', 'error');
    indicator.classList.add('saving');
    indicator.textContent = 'Saving...';
    const success = await this.saveConfig();
    btn.disabled = !this.dirty;
    indicator.classList.remove('saving');
    if (success) {
      indicator.classList.add('saved');
      indicator.textContent = 'Saved';
      setTimeout(() => indicator.classList.add('hidden'), 2000);
    } else {
      indicator.classList.add('error');
      indicator.textContent = 'Failed';
    }
  }

  bindEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    document.getElementById('save-nav')?.addEventListener('click', () => this.saveConfig());

    // Hero "MENU" title on/off (Navigation tab)
    document.getElementById('toggle-menu-title')?.addEventListener('change', (e) => {
      if (!this.config) return;
      if (!this.config.navigation) this.config.navigation = {};
      if (!this.config.navigation.menuTitle) this.config.navigation.menuTitle = {};
      this.config.navigation.menuTitle.enabled = e.target.checked;
      this.markDirty();
    });

    // Hero "MENU" title visual style (Navigation tab)
    document.getElementById('menu-title-style')?.addEventListener('change', (e) => {
      if (!this.config) return;
      if (!this.config.navigation) this.config.navigation = {};
      if (!this.config.navigation.menuTitle) this.config.navigation.menuTitle = {};
      this.config.navigation.menuTitle.style = e.target.value;
      this.markDirty();
    });

    document.getElementById('btn-upload')?.addEventListener('click', () => {
      document.getElementById('image-upload').click();
    });
    document.getElementById('image-upload')?.addEventListener('change', (e) => {
      if (e.target.files.length) this.handleUpload(e.target.files);
      e.target.value = '';
    });

    const dropZone = document.getElementById('drop-zone');
    dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('active'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('active'));
    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault(); dropZone.classList.remove('active');
      if (e.dataTransfer.files.length) this.handleUpload(e.dataTransfer.files);
    });

    document.getElementById('close-upload-modal')?.addEventListener('click', () => this.closeUploadModal());
    document.getElementById('cancel-upload-modal')?.addEventListener('click', () => this.closeUploadModal());
    document.getElementById('confirm-upload-modal')?.addEventListener('click', () => this.confirmUpload());
    document.getElementById('upload-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeUploadModal();
    });

    document.getElementById('confirm-cancel')?.addEventListener('click', () => this.hideConfirm());
    document.getElementById('confirm-ok')?.addEventListener('click', () => {
      if (this.confirmCallback) this.confirmCallback();
      this.hideConfirm();
    });

    document.getElementById('confirm-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.hideConfirm();
    });
    document.getElementById('price-editor-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closePriceEditor();
    });
    document.getElementById('price-editor-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.closePriceEditor();
    });
    // Close button handled in bindEvents to ensure proper 'this' binding
    document.getElementById('price-editor-save')?.addEventListener('click', () => this.savePrices());
    document.getElementById('mode-place')?.addEventListener('click', () => this.setPriceEditorMode('place'));
    document.getElementById('mode-price')?.addEventListener('click', () => this.setPriceEditorMode('price'));
    // Style controls (font size / color / shadow) live in BOTH the toolbar and the
    // sidebar. They are bound by class (querySelectorAll) on purpose: previously a
    // duplicate `id="price-font-size"` meant only the hidden toolbar select got the
    // listener, so changing the visible sidebar select did nothing.
    this.bindPriceStyleControls();

    document.addEventListener('click', (e) => {
      const pricesBtn = e.target.closest('.btn-prices');
      if (pricesBtn) { e.stopPropagation(); this.openPriceEditor(pricesBtn.dataset.sectionId, pricesBtn.dataset.imageId); }
      const deletePriceBtn = e.target.closest('.btn-delete-price');
      if (deletePriceBtn) { e.stopPropagation(); this.deletePriceTag(deletePriceBtn.dataset.priceId); }
    });

    document.getElementById('btn-save-all')?.addEventListener('click', () => this.saveAll());
  }

  // Bind font size / color / shadow controls. Bound by class on purpose: these
  // elements exist in BOTH the toolbar and the sidebar, and a duplicate
  // `id="price-font-size"` used to wire only the (hidden) toolbar select.
  bindPriceStyleControls() {
    document.querySelectorAll('.js-price-font-size').forEach(el => {
      el.addEventListener('change', (e) => this.updateSelectedZoneStyle('fontSize', e.target.value));
    });
    document.querySelectorAll('.js-price-color').forEach(el => {
      el.addEventListener('input', (e) => this.updateSelectedZoneStyle('color', e.target.value));
    });
    document.querySelectorAll('.js-price-shadow').forEach(el => {
      el.addEventListener('change', (e) => this.updateSelectedZoneStyle('textShadow', e.target.checked));
    });
    document.querySelectorAll('.js-price-bold').forEach(el => {
      el.addEventListener('change', (e) => this.updateSelectedZoneStyle('bold', e.target.checked));
    });
  }


  switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle('bg-white/10', isActive);
      btn.classList.toggle('text-white/80', isActive);
      btn.classList.toggle('bg-white/5', !isActive);
      btn.classList.toggle('text-white/60', !isActive);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-content-${tab}`);
    });
    if (tab === 'images') this.renderImagesTab();
  }

  render() {
    this.renderNavigationTab();
    this.renderImagesTab();
  }

  // ============ NAVIGATION TAB ============
  renderNavigationTab() {
    if (!this.config) return;

    const langFields = (btn) => {
      const labels = btn.labels || {};
      const labelKey = btn.labelKey || `nav.${btn.id}`;
      const roVal = labels.ro || this.locales.ro?.nav?.[btn.id] || '';
      const ruVal = labels.ru || this.locales.ru?.nav?.[btn.id] || '';
      const enVal = labels.en || this.locales.en?.nav?.[btn.id] || '';
      return `
        <div class="space-y-2">
          <label class="text-xs text-white/50 flex items-center gap-1"><span class="w-6 text-xs bg-accent/20 text-accent px-1 py-0.5 rounded">RO</span> Romanian</label>
          <input type="text" class="w-full lang-field bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" value="${roVal}" data-field="labels.ro" placeholder="MÂNCARE">
          <label class="text-xs text-white/50 flex items-center gap-1 mt-2"><span class="w-6 text-xs bg-accent/20 text-accent px-1 py-0.5 rounded">RU</span> Russian</label>
          <input type="text" class="w-full lang-field bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" value="${ruVal}" data-field="labels.ru" placeholder="ЕДА">
          <label class="text-xs text-white/50 flex items-center gap-1 mt-2"><span class="w-6 text-xs bg-accent/20 text-accent px-1 py-0.5 rounded">EN</span> English</label>
          <input type="text" class="w-full lang-field bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" value="${enVal}" data-field="labels.en" placeholder="FOOD">
          <div class="text-xs text-white/40 pt-1 border-t border-white/10">i18n Key: <code class="text-accent">${labelKey}</code> (fallback if labels empty)</div>
        </div>
      `;
    };

    const hContainer = document.getElementById('horizontal-nav-list');
    if (hContainer && this.config.navigation?.horizontal) {
      hContainer.innerHTML = this.config.navigation.horizontal.map((btn, index) => `
        <div class="nav-btn-item bg-white/5 rounded-lg p-4 flex items-start gap-3" data-nav-id="${btn.id}" data-nav-type="horizontal" data-index="${index}">
          <svg class="w-5 h-5 text-white/40 cursor-grab mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          <div class="flex-1 space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">${langFields(btn)}</div>
            <div><label class="text-xs text-white/50">Target Section ID</label><input type="text" class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" value="${btn.target}" data-field="target"></div>
            <div><label class="text-xs text-white/50">External Link (opens in a new window)</label><input type="url" class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" value="${btn.link || ''}" data-field="link" placeholder="https://..."></div>
          </div>
          <span class="text-xs text-white/40 px-2 py-1 bg-white/5 rounded flex-shrink-0">${btn.id.toUpperCase()}</span>
        </div>
      `).join('');
    }

    const vContainer = document.getElementById('vertical-nav-list');
    if (vContainer && this.config.navigation?.vertical) {
      vContainer.innerHTML = this.config.navigation.vertical.map((btn, index) => `
        <div class="nav-btn-item bg-white/5 rounded-lg p-4 flex items-start gap-3" data-nav-id="${btn.id}" data-nav-type="vertical" data-index="${index}">
          <svg class="w-5 h-5 text-white/40 cursor-grab mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
          <div class="flex-1 space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">${langFields(btn)}</div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label class="text-xs text-white/50">Target Section ID</label><input type="text" class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" value="${btn.target}" data-field="target"></div>
              <div><label class="text-xs text-white/50">Icon</label><select class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" data-field="icon"><option value="utensils" ${btn.icon === 'utensils' ? 'selected' : ''}>Utensils (Food)</option><option value="martini" ${btn.icon === 'martini' ? 'selected' : ''}>Martini (Drinks)</option><option value="flame" ${btn.icon === 'flame' ? 'selected' : ''}>Flame (Promo)</option><option value="cake" ${btn.icon === 'cake' ? 'selected' : ''}>Cake (Birthday)</option><option value="mic" ${btn.icon === 'mic' ? 'selected' : ''}>Microphone (Karaoke)</option></select></div>
            </div>
            <div><label class="text-xs text-white/50">External Link (opens in a new window)</label><input type="url" class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-accent" value="${btn.link || ''}" data-field="link" placeholder="https://..."></div>
          </div>
          <span class="text-xs text-white/40 px-2 py-1 bg-white/5 rounded flex-shrink-0">${btn.id.toUpperCase()}</span>
        </div>
      `).join('');
    }

    document.querySelectorAll('.nav-btn-item input, .nav-btn-item select').forEach(input => {
      input.addEventListener('change', (e) => this.updateNavButton(e));
    });

    // Reflect the saved "MENU" title state in the toggle (defaults to ON).
    const menuTitleToggle = document.getElementById('toggle-menu-title');
    if (menuTitleToggle) {
      menuTitleToggle.checked = this.config.navigation?.menuTitle?.enabled !== false;
    }

    // Reflect the saved "MENU" title style in the select (defaults to "gold").
    const menuTitleStyle = document.getElementById('menu-title-style');
    if (menuTitleStyle) {
      menuTitleStyle.value = this.config.navigation?.menuTitle?.style || 'gold';
    }

    this.initSortableJS(document.getElementById('horizontal-nav-list'), 'horizontal');
    this.initSortableJS(document.getElementById('vertical-nav-list'), 'vertical');
  }

  updateNavButton(e) {
    const item = e.target.closest('.nav-btn-item');
    const navId = item.dataset.navId;
    const navType = item.dataset.navType;
    const field = e.target.dataset.field;
    const value = e.target.type === 'select-one' ? e.target.value : e.target.value;
    const navArray = this.config.navigation[navType];
    const btn = navArray.find(b => b.id === navId);
    if (btn) {
      if (field.startsWith('labels.')) { const lang = field.split('.')[1]; btn.labels = btn.labels || {}; btn.labels[lang] = value; }
      else { btn[field] = value; }
      this.markDirty();
    }
  }

  initSortableJS(container, navType) {
    if (!container || typeof Sortable === 'undefined') return;
    new Sortable(container, {
      animation: 150, handle: '.cursor-grab', ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen',
      onEnd: (evt) => {
        const navArray = this.config.navigation[navType];
        const [moved] = navArray.splice(evt.oldIndex, 1);
        navArray.splice(evt.newIndex, 0, moved);
        this.markDirty();
        this.renderNavigationTab();
      }
    });
  }

  markDirty() {
    this.dirty = true;
    document.getElementById('btn-save-all').disabled = false;
  }

  // ============ IMAGES TAB ============
  renderImagesTab() {
    if (!this.config) return;
    const container = document.getElementById('images-sections');
    if (!container) return;

    container.innerHTML = this.config.sections.map(section => {
      const isHero = section.id === 'hero-section';
      const isModal = section.id === 'promo-modal' || section.id === 'birthday-modal';
      const badge = isHero
        ? '<span class="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded ml-2">Background</span>'
        : (isModal ? '<span class="text-xs px-2 py-0.5 bg-accent/20 text-accent rounded ml-2">Modal</span>' : '');
      return `
        <section class="bg-white/5 rounded-xl p-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-lg">${section.titleKey || section.id} ${badge}</h3>
            <div class="flex items-center gap-2">
              <span class="text-xs text-white/40 px-2 py-1 bg-white/5 rounded">${section.images?.length || 0} images</span>
              ${isHero ? '' : `<button class="btn-delete-section p-2 text-white/40 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors bg-white/5 border border-white/10" data-section-id="${section.id}" title="Delete entire section and all its images"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v12m-6 0h12"/></svg></button>`}
            </div>
          </div>
          <div class="sortable-images grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" data-section-id="${section.id}">
            ${section.images?.map((img, index) => `
              <div class="image-item bg-white/5 rounded-lg overflow-hidden relative group" data-image-id="${img.id}" data-index="${index}">
                <div class="aspect-[4/3] overflow-hidden relative"><img src="${img.src}" alt="${img.alt}" class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"><div class="drag-handle absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style="cursor: grab;"><svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg></div></div>
                <div class="p-3"><div class="flex items-center justify-between mb-2"><span class="text-sm font-medium truncate">${img.alt}</span><span class="text-xs text-white/40 px-2 py-0.5 bg-white/5 rounded">${img.id}</span></div><div class="flex items-center gap-2"><input type="text" class="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-accent" value="${img.alt}" data-field="alt" data-image-id="${img.id}"><button class="btn-prices p-2 text-white/50 hover:text-accent hover:bg-white/10 rounded transition-colors" data-image-id="${img.id}" data-section-id="${section.id}" title="Manage Prices"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0l1-1m-1 1l-1-1"/></svg></button><button class="btn-delete-image p-2 text-white/50 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors" data-image-id="${img.id}" data-section-id="${section.id}" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v12m-6 0h12"/></svg></button></div></div></div>
            `).join('')}
          </div>
        </section>
      `;
    }).join('');

    document.querySelectorAll('.btn-delete-image').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.confirmDelete(btn.dataset.sectionId, btn.dataset.imageId); });
    });
    document.querySelectorAll('.btn-delete-section').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.confirmDeleteSection(btn.dataset.sectionId); });
    });

    document.querySelectorAll('.sortable-images').forEach(container => {
      if (typeof Sortable !== 'undefined') {
        new Sortable(container, {
          animation: 150, group: 'menu-images', ghostClass: 'sortable-ghost',
          onEnd: (evt) => {
            const sectionId = evt.target.dataset.sectionId;
            const section = this.config.sections.find(s => s.id === sectionId);
            if (section && evt.from === evt.to) { const [moved] = section.images.splice(evt.oldIndex, 1); section.images.splice(evt.newIndex, 0, moved); this.markDirty(); }
          },
          onAdd: (evt) => {
            const fromSectionId = evt.from.dataset.sectionId;
            const toSectionId = evt.to.dataset.sectionId;
            if (fromSectionId === toSectionId) return;
            const fromSection = this.config.sections.find(s => s.id === fromSectionId);
            const toSection = this.config.sections.find(s => s.id === toSectionId);
            if (fromSection && toSection) {
              const movedItem = evt.item.dataset.imageId;
              const itemIndex = fromSection.images.findIndex(img => img.id === movedItem);
              if (itemIndex !== -1) { const [item] = fromSection.images.splice(itemIndex, 1); toSection.images.splice(evt.newIndex, 0, item); this.markDirty(); }
            }
          }
        });
      }
    });

    document.querySelectorAll('.image-item input[data-field="alt"]').forEach(input => {
      input.addEventListener('change', (e) => this.updateImageAlt(e.target.dataset.imageId, e.target.value));
    });
  }

  updateImageAlt(imageId, alt) {
    for (const section of this.config.sections) {
      const img = section.images?.find(i => i.id === imageId);
      if (img) { img.alt = alt; this.markDirty(); return; }
    }
  }

  // ============ IMAGE UPLOAD ============
  closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
    document.getElementById('upload-modal').classList.remove('flex');
    const fileInput = document.getElementById('image-upload');
    if (fileInput) { fileInput.value = ''; fileInput.type = 'text'; fileInput.type = 'file'; }
    const confirmBtn = document.getElementById('confirm-upload-modal');
    const cancelBtn = document.getElementById('cancel-upload-modal');
    const selectEl = document.getElementById('upload-section-select');
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Upload'; }
    if (cancelBtn) cancelBtn.disabled = false;
    if (selectEl) selectEl.disabled = false;
    this.pendingUploadFiles = null;
  }

  handleUpload(files) {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;
    this.pendingUploadFiles = fileArray;

    const sectionOptions = this.config.sections.map(s => `<option value="${s.id}">${s.titleKey || s.id}${s.id.includes('modal') ? ' (Modal)' : ''}</option>`).join('');
    document.getElementById('upload-section-select').innerHTML = sectionOptions;

    const previewsContainer = document.getElementById('upload-file-previews');
    previewsContainer.innerHTML = fileArray.map((file, index) => {
      const previewUrl = URL.createObjectURL(file);
      return `<div class="flex items-center gap-3 p-3 bg-white/5 rounded-lg" data-file-index="${index}"><div class="w-12 h-12 bg-white/5 rounded flex-shrink-0 overflow-hidden"><img src="${previewUrl}" alt="${file.name}" class="w-full h-full object-cover"></div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${file.name}</p><p class="text-xs text-white/40">${(file.size / 1024).toFixed(1)} KB</p></div></div>`;
    }).join('');

    document.getElementById('upload-modal').classList.remove('hidden');
    document.getElementById('upload-modal').classList.add('flex');
  }

  async confirmUpload() {
    if (!this.pendingUploadFiles?.length) return;
    const sectionId = document.getElementById('upload-section-select').value;
    const confirmBtn = document.getElementById('confirm-upload-modal');
    const cancelBtn = document.getElementById('cancel-upload-modal');
    const selectEl = document.getElementById('upload-section-select');
    confirmBtn.disabled = true; cancelBtn.disabled = true; selectEl.disabled = true;
    confirmBtn.textContent = 'Uploading...';

    const fileArray = this.pendingUploadFiles;
    let successCount = 0;

    for (const file of fileArray) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sectionId', sectionId);
        const response = await fetch('/api/admin/upload', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
          successCount++;
          const section = this.config.sections.find(s => s.id === sectionId);
          if (section) { section.images.push({ id: `${sectionId}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, src: result.url, alt: file.name.replace(/\.[^/.]+$/, ''), prices: [] }); this.markDirty(); }
        } else throw new Error(result.error || 'Upload failed');
      } catch (error) { console.error('Upload error:', error); }
    }

    this.closeUploadModal();
    this.renderImagesTab();
    this.showToast(`${successCount}/${fileArray.length} image(s) uploaded to ${this.config.sections.find(s => s.id === sectionId)?.titleKey || sectionId}`, successCount > 0 ? 'success' : 'error');
  }

  // ============ IMAGE DELETE ============
  confirmDelete(sectionId, imageId) {
    const section = this.config.sections.find(s => s.id === sectionId);
    const image = section?.images?.find(i => i.id === imageId);
    this.showConfirm('Delete Image', `Are you sure you want to delete "${image?.alt || imageId}"?`, async () => {
      const section = this.config.sections.find(s => s.id === sectionId);
      if (section) { section.images = section.images.filter(i => i.id !== imageId); await this.saveConfig(); this.renderImagesTab(); this.showToast('Image deleted', 'success'); }
    });
  }

  confirmDeleteSection(sectionId) {
    const section = this.config.sections.find(s => s.id === sectionId);
    const imageCount = section?.images?.length || 0;
    this.showConfirm('Delete Section', `Delete entire "${section?.titleKey || sectionId}" section? This will delete all ${imageCount} images.`, async () => {
      this.config.sections = this.config.sections.filter(s => s.id !== sectionId);
      ['horizontal', 'vertical'].forEach(navType => { this.config.navigation[navType] = this.config.navigation[navType].filter(btn => btn.target !== sectionId); });
      await this.saveConfig();
      this.renderImagesTab(); this.renderNavigationTab();
      this.showToast('Section deleted', 'success');
    });
  }

  // ============ PRICE EDITOR ============
  openPriceEditor(sectionId, imageId) {
    const section = this.config.sections.find(s => s.id === sectionId);
    const image = section?.images?.find(i => i.id === imageId);
    if (!section || !image) return;

    this.currentPriceImage = { sectionId, imageId };
    // Load zones from priceZones (new format) or convert from prices (legacy format)
    if (image.priceZones && image.priceZones.length > 0) {
      this.priceEditorZones = [...image.priceZones];
    } else if (image.prices && image.prices.length > 0) {
      // Convert legacy prices format to priceZones format
      this.priceEditorZones = image.prices.map(p => ({
        id: p.id,
        x_percent: p.x_percent,
        y_percent: p.y_percent,
        w_percent: 8, // default width for point prices
        h_percent: 8, // default height for point prices
        text: p.price
      }));
    } else {
      this.priceEditorZones = [];
    }
    this.priceEditorMode = 'place';
    this.selectedZoneId = null;

    const modal = document.getElementById('price-editor-modal');
    const title = document.getElementById('price-editor-title');
    const container = document.getElementById('price-editor-container');

    title.textContent = `Price Editor: ${image.alt}`;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    this.setPriceEditorModeUI('place');

    // The wrapper is sized (in px) to exactly match the image display area, so the
    // overlay (inset:0) covers the image precisely - no letterbox math anywhere.
    container.innerHTML = `
      <div id="price-editor-wrapper">
        <img id="price-editor-image" src="${image.src}" alt="${image.alt}">
        <div id="price-editor-overlay" class="bg-transparent touch-none"></div>
      </div>
    `;

    const img = document.getElementById('price-editor-image');
    const initEditor = () => {
      this.sizePriceEditorWrapper();
      this.renderPriceZoneList();
      this.bindPriceEditorEvents();
      this.renderZoneOverlay();
    };
    // Use addEventListener with { once: true } to prevent double-firing on cached images
    if (img.complete && img.naturalWidth > 0) {
        initEditor();
    } else {
        img.addEventListener('load', initEditor, { once: true });
    }

    // Keep the wrapper matched to the available space on resize/orientation change
    this._editorResizeHandler = () => {
      this.sizePriceEditorWrapper();
      this.renderZoneOverlay();
    };
    window.addEventListener('resize', this._editorResizeHandler);

    // Close on backdrop click only (not on close button or other children)
    modal.onclick = (e) => {
      if (e.target === modal) this.closePriceEditor();
    };

    // Close on Escape key
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') this.closePriceEditor();
    };
    document.addEventListener('keydown', this.escapeHandler);

    this.priceEditorCleanup = () => {
      document.removeEventListener('keydown', this.escapeHandler);
      const modal = document.getElementById('price-editor-modal');
      if (modal) modal.onclick = null;
    };
  }

setPriceEditorMode(mode) {
    this.priceEditorMode = mode;
    this.setPriceEditorModeUI(mode);
    this.bindPriceEditorEvents();
    this.renderPriceZoneList();
    this.renderZoneOverlay();
    
    // Fallback: Ensure escape handler is registered
    if (!this.escapeHandler) {
      this.escapeHandler = (e) => {
        if (e.key === 'Escape') this.closePriceEditor();
      };
      document.addEventListener('keydown', this.escapeHandler);
    }
  }

  setPriceEditorModeUI(mode) {
    const placeBtn = document.getElementById('mode-place');
    const priceBtn = document.getElementById('mode-price');
    const saveBtn = document.getElementById('price-editor-save');
    const hint = document.getElementById('price-hint');
    const sidebar = document.getElementById('price-sidebar');
    const toolbar = document.getElementById('price-toolbar');
    
    if (mode === 'place') {
      placeBtn.className = 'mode-btn px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-white';
      priceBtn.className = 'mode-btn px-3 py-1.5 text-sm font-medium rounded-md bg-white/10 text-white/70 hover:bg-white/20';
      saveBtn.textContent = 'Save Zones';
      hint.textContent = 'PRICE PLACE: Drag on image to create rectangular price zones';
      // PLACE mode = only draw/move rectangles: hide ALL style settings
      // (font size / text color / text shadow). Inline display is used because the
      // sidebar has a `lg:block` utility that would otherwise override `hidden`.
      if (sidebar) { sidebar.classList.add('hidden'); sidebar.style.display = 'none'; }
      if (toolbar) { toolbar.classList.add('hidden'); toolbar.style.display = 'none'; }
    } else {
      placeBtn.className = 'mode-btn px-3 py-1.5 text-sm font-medium rounded-md bg-white/10 text-white/70 hover:bg-white/20';
      priceBtn.className = 'mode-btn px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-white';
      saveBtn.textContent = 'Save Prices';
      hint.textContent = 'PRICE: Click zone to edit text';
      // PRICE mode = reveal style settings. Clear the inline override so the
      // sidebar falls back to its classes (`hidden lg:block`) and the toolbar shows.
      if (sidebar) { sidebar.classList.remove('hidden'); sidebar.style.display = ''; }
      if (toolbar) { toolbar.classList.remove('hidden'); toolbar.style.display = ''; }
    }
  }

  bindPriceEditorEvents() {
    this.unbindPriceEditorEvents();
    // Guard against double initialization - set after unbind
    if (this._priceEditorEventsBound) return;
    this._priceEditorEventsBound = true;
    
    // Register Escape key handler
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') this.closePriceEditor();
    };
    document.addEventListener('keydown', this.escapeHandler);
    
    const overlay = document.getElementById('price-editor-overlay');
    if (!overlay) return;

    if (this.priceEditorMode === 'place') {
      // PRICE PLACE MODE: Draw rectangles on overlay
      let isDrawing = false, startX = 0, startY = 0, selectionRect = null;

      const getDrawRect = () => {
        // Overlay (inset:0) == image area, so its viewport rect lets us convert
        // clientX/Y into coordinates relative to the image via subtraction.
        const r = overlay.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          imageOffsetX: 0,
          imageOffsetY: 0
        };
      };

      const onMouseDown = (e) => {
        const drawRect = getDrawRect();
        if (!drawRect) return;
        const viewportX = e.clientX;
        const viewportY = e.clientY;
        startX = viewportX - drawRect.left;
        startY = viewportY - drawRect.top;
        isDrawing = true;
        
        selectionRect = document.createElement('div');
        selectionRect.className = 'absolute border-2 border-accent bg-accent/10 pointer-events-none';
        selectionRect.style.left = `${drawRect.imageOffsetX}px`;
        selectionRect.style.top = `${drawRect.imageOffsetY}px`;
        selectionRect.style.width = '0px';
        selectionRect.style.height = '0px';
        overlay.appendChild(selectionRect);
        e.preventDefault();
      };

      const onMouseMove = (e) => {
        if (!isDrawing || !selectionRect) return;
        const drawRect = getDrawRect();
        if (!drawRect) return;
        const currentX = e.clientX - drawRect.left;
        const currentY = e.clientY - drawRect.top;
        
        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        
        selectionRect.style.left = `${drawRect.imageOffsetX + left}px`;
        selectionRect.style.top = `${drawRect.imageOffsetY + top}px`;
        selectionRect.style.width = `${width}px`;
        selectionRect.style.height = `${height}px`;
      };

      const onMouseUp = (e) => {
        if (!isDrawing || !selectionRect) return;
        // Prevent double execution on same event
        if (this._zoneDrawingCompleted || isDrawing === false) return;
        // Per-event lock (cleared on next tick)
        if (this._zoneDrawLock) return;
        this._zoneDrawLock = true;
        
        isDrawing = false;
        this._zoneDrawingCompleted = true;
        
        const drawRect = getDrawRect();
        if (!drawRect) {
          selectionRect.remove();
          selectionRect = null;
          setTimeout(() => { this._zoneDrawingCompleted = false; this._zoneDrawLock = false; }, 0);
          return;
        }
        const endX = e.clientX - drawRect.left;
        const endY = e.clientY - drawRect.top;
        
        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        
        if (width > 10 && height > 10) {
          const x_percent = Math.round((left / drawRect.width) * 1000) / 10;
          const y_percent = Math.round((top / drawRect.height) * 1000) / 10;
          const w_percent = Math.round((width / drawRect.width) * 1000) / 10;
          const h_percent = Math.round((height / drawRect.height) * 1000) / 10;
          
          this.addPriceZone(x_percent, y_percent, w_percent, h_percent);
        }
        
        selectionRect.remove();
        selectionRect = null;
        // DO NOT remove mouseup listener - keep for subsequent zones
        // Clear lock on next tick
        setTimeout(() => { 
          this._zoneDrawingCompleted = false; 
          this._zoneDrawLock = false;
        }, 0);
      };

      overlay.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      this.priceEditorCleanup = () => {
        overlay.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (selectionRect) selectionRect.remove();
      };
      
    } else {
      // PRICE MODE: Click zone to edit text
      this.makeZonesTextEditableOnly();
      
      // Style controls are bound once in bindPriceStyleControls() (by class), so
      // they are NOT re-bound here - re-binding would stack duplicate listeners.
      
      this.priceEditorCleanup = () => {};
    }
  }

  unbindPriceEditorEvents() {
    if (this.priceEditorCleanup) {
      this.priceEditorCleanup();
      this.priceEditorCleanup = null;
    }
    // Also clean up any price editor specific event listeners
    const overlay = document.getElementById('price-editor-overlay');
    if (overlay) {
      overlay.replaceWith(overlay.cloneNode(true));
    }
    // Reset the bound flag
    this._priceEditorEventsBound = false;
  }

  addPriceZone(x_percent, y_percent, w_percent, h_percent) {
    this.priceEditorZones.push({
      id: `zone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      x_percent, y_percent, w_percent, h_percent,
      text: '',
      fontSize: 20,
      color: '#000000',
      textShadow: false,
      bold: true,
      // No colored fill inside the zone - the admin shows only a thin contour for
      // positioning; the client price tag has no background either.
      backgroundColor: 'transparent'
    });
    this.renderPriceZoneList();
    this.renderZoneOverlay();
  }

  selectZone(zoneId) {
    this.selectedZoneId = zoneId;
    document.querySelectorAll('.price-zone').forEach(el => {
      const isSelected = el.dataset.zoneId === zoneId;
      if (isSelected) el.classList.add('ring-2', 'ring-accent');
      else el.classList.remove('ring-2', 'ring-accent');
    });
    document.querySelectorAll('.price-zone-item').forEach(el => {
      const isSelected = el.dataset.zoneId === zoneId;
      if (isSelected) el.classList.add('ring-2', 'ring-accent');
      else el.classList.remove('ring-2', 'ring-accent');
    });

    // Reflect the selected zone's style in the controls (toolbar + sidebar)
    const zone = this.priceEditorZones.find(z => z.id === zoneId);
    if (zone) {
      const sizeValue = String(zone.fontSize || 20);
      document.querySelectorAll('.js-price-font-size').forEach(el => {
        if ([...el.options].some(o => o.value === sizeValue)) el.value = sizeValue;
      });
      document.querySelectorAll('.js-price-color').forEach(el => { el.value = zone.color || '#000000'; });
      document.querySelectorAll('.js-price-shadow').forEach(el => { el.checked = !!zone.textShadow; });
      document.querySelectorAll('.js-price-bold').forEach(el => { el.checked = zone.bold !== false; });
    }
  }

  updateSelectedZoneStyle(property, value) {
    if (!this.selectedZoneId) return;
    const zone = this.priceEditorZones.find(z => z.id === this.selectedZoneId);
    if (zone) {
      zone[property] = value;
      this.renderZoneOverlay();
      this.renderPriceZoneList();
    }
  }

  renderPriceZoneList() {
    const list = document.getElementById('price-list');
    if (!list) return;

    list.innerHTML = this.priceEditorZones.map((zone, index) => `
      <div class="price-zone-item bg-white/5 rounded-lg p-3 ${this.selectedZoneId === zone.id ? 'ring-2 ring-accent' : ''}" data-zone-id="${zone.id}">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs text-white/50">#${index + 1}</span>
          <span class="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-white text-xs font-bold">${zone.text || '—'}</span>
          <button class="btn-duplicate-zone p-1.5 text-white/50 hover:text-accent hover:bg-white/10 rounded transition-colors" data-zone-id="${zone.id}" title="Duplicate">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-2M5 8h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z"/></svg>
          </button>
          <button class="btn-delete-zone p-1.5 text-white/50 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors" data-zone-id="${zone.id}" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="text-xs text-white/40 flex gap-4">
          <span>X: ${zone.x_percent}% Y: ${zone.y_percent}%</span>
          <span>W: ${zone.w_percent}% H: ${zone.h_percent}%</span>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.btn-delete-zone').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.deletePriceZone(btn.dataset.zoneId); });
    });

    document.querySelectorAll('.btn-duplicate-zone').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.duplicatePriceZone(btn.dataset.zoneId); });
    });

    document.querySelectorAll('.price-zone-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('button')) this.selectZone(item.dataset.zoneId);
      });
    });
  }

  renderZoneOverlay() {
    const overlay = document.getElementById('price-editor-overlay');
    if (!overlay) return;

    // Zones are positioned with plain CSS percentages relative to the overlay,
    // which exactly matches the image area (inset:0). No px conversion needed.
    overlay.innerHTML = this.priceEditorZones.map(zone => {
      const fontSize = zone.fontSize || 20;
      // Same fluid formula as the client: px -> cqw relative to the container
      // (== image width), so admin preview matches the visitor 1:1.
      const cqw = AdminPanel.fontSizeToCqw(fontSize);
      const fontFamily = zone.fontFamily || 'inherit';
      const color = zone.color || '#000000';
      const textShadow = zone.textShadow ? '0 0 4px rgba(0,0,0,0.8)' : 'none';
      const fontWeight = zone.bold === false ? 400 : 800;
      
      return `
        <div class="price-zone absolute ${this.selectedZoneId === zone.id ? 'ring-2 ring-accent' : ''}" 
             style="left: ${zone.x_percent}%; top: ${zone.y_percent}%; width: ${zone.w_percent}%; height: ${zone.h_percent}%;"
             data-zone-id="${zone.id}">
          <!-- Zone contour only: transparent fill, thin dashed border for positioning -->
          <div class="absolute inset-0 border border-dashed border-accent/70 pointer-events-none" style="background: transparent !important;"></div>
          <!-- Text content - editable on click in PRICE mode -->
          <div class="zone-content absolute inset-0 flex items-center justify-center" 
               style="font-size: clamp(8px, ${cqw}cqw, 96px); font-family: ${fontFamily}; color: ${color}; font-weight: ${fontWeight}; text-shadow: ${textShadow}; pointer-events:none;">
            ${zone.text || '—'}
          </div>
          ${this.priceEditorMode === 'place' ? `
          <!-- Duplicate button OUTSIDE mask - top-left corner -->
          <button class="btn-duplicate-zone-on-overlay absolute -top-3 -left-3 w-6 h-6 bg-accent/90 hover:bg-accent text-white rounded-full flex items-center justify-center shadow-lg transition-opacity opacity-70 hover:opacity-100 focus:opacity-100" 
                  data-zone-id="${zone.id}" title="Duplicate zone" style="z-index: 30;">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-2M5 8h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z"/></svg>
          </button>
          <!-- Delete button (X) OUTSIDE mask - top-right corner -->
          <button class="btn-delete-zone-on-overlay absolute -top-3 -right-3 w-6 h-6 bg-red-600/90 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-lg transition-opacity opacity-70 hover:opacity-100 focus:opacity-100" 
                  data-zone-id="${zone.id}" title="Delete zone" style="z-index: 20;">
            ×
          </button>
          <!-- Resize handle -->
          <div class="zone-resize-handle absolute bottom-0 right-0 w-4 h-4 bg-accent cursor-se-resize"></div>
          ` : ''}
        </div>
      `;
    }).join('');

    if (this.priceEditorMode === 'place') {
      // Bind the zone delete (x) button BEFORE drag/resize so pressing it always
      // removes the zone. pointerdown (fires before mousedown) + click, both with
      // stopPropagation/preventDefault so the zone's drag logic never starts and the
      // click is not swallowed when the overlay is re-rendered during mouseup.
      overlay.querySelectorAll('.btn-delete-zone-on-overlay').forEach(btn => {
        const onDelete = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const zoneId = btn.dataset.zoneId;
          if (!zoneId) return;
          btn.dataset.zoneId = ''; // guard against double fire (pointerdown + click)
          this.deletePriceZone(zoneId);
        };
        btn.addEventListener('pointerdown', onDelete);
        btn.addEventListener('click', onDelete);
      });

      // Bind the zone duplicate button with the same guard pattern as delete:
      // pointerdown + click with stopPropagation/preventDefault so the zone's drag
      // logic never starts and the click survives an overlay re-render.
      overlay.querySelectorAll('.btn-duplicate-zone-on-overlay').forEach(btn => {
        const onDuplicate = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const zoneId = btn.dataset.zoneId;
          if (!zoneId) return;
          btn.dataset.zoneId = ''; // guard against double fire (pointerdown + click)
          this.duplicatePriceZone(zoneId);
        };
        btn.addEventListener('pointerdown', onDuplicate);
        btn.addEventListener('click', onDuplicate);
      });
      this.makeZonesDraggableAndResizable();
    } else {
      // PRICE mode: only enable text editing via click, no dragging/resizing
      this.makeZonesTextEditableOnly();
    }
  }

  makeZonesDraggableAndResizable() {
    const overlay = document.getElementById('price-editor-overlay');
    if (!overlay) return;
    // Overlay (inset:0) exactly matches the image area, so its rect IS the image rect.
    // Zones are positioned in % of the overlay, so px <-> % uses this single rect.
    const rect = overlay.getBoundingClientRect();

    overlay.querySelectorAll('.price-zone').forEach(zone => {
      let isDragging = false, isResizing = false;
      let startX, startY, startLeft, startTop, startWidth, startHeight;

      const onMouseMove = (e) => {
        if (!isDragging && !isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (isDragging) {
          let newLeft = Math.max(0, Math.min(rect.width - startWidth, startLeft + dx));
          let newTop = Math.max(0, Math.min(rect.height - startHeight, startTop + dy));
          zone.style.left = `${newLeft}px`; zone.style.top = `${newTop}px`;
        } else if (isResizing) {
          let newWidth = Math.max(30, Math.min(rect.width - startLeft, startWidth + dx));
          let newHeight = Math.max(30, Math.min(rect.height - startTop, startHeight + dy));
          zone.style.width = `${newWidth}px`; zone.style.height = `${newHeight}px`;
        }
      };

      const onMouseUp = () => {
        if (!isDragging && !isResizing) return;
        isDragging = false; isResizing = false;
        zone.classList.remove('dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        const zr = zone.getBoundingClientRect();
        const zoneId = zone.dataset.zoneId;
        const zoneData = this.priceEditorZones.find(z => z.id === zoneId);
        if (zoneData) {
          zoneData.x_percent = Math.round((zr.left - rect.left) / rect.width * 1000) / 10;
          zoneData.y_percent = Math.round((zr.top - rect.top) / rect.height * 1000) / 10;
          zoneData.w_percent = Math.round(zr.width / rect.width * 1000) / 10;
          zoneData.h_percent = Math.round(zr.height / rect.height * 1000) / 10;
          this.renderPriceZoneList();
          // Re-render so zones snap back to their percentage positions (a live
          // px value would drift if the container is later resized).
          this.renderZoneOverlay();
        }
      };

      const onMouseDown = (e) => {
        // Never start drag/resize when the press is on the delete (x) or duplicate
        // button: those buttons have their own pointerdown handlers.
        if (e.target.closest('.btn-delete-zone-on-overlay, .btn-duplicate-zone-on-overlay')) {
          e.stopPropagation();
          return;
        }
        const handle = zone.querySelector('.zone-resize-handle');
        isResizing = e.target === handle;
        isDragging = !isResizing;
        zone.classList.add('dragging');
        startX = e.clientX; startY = e.clientY;
        const zr = zone.getBoundingClientRect();
        startLeft = zr.left - rect.left;
        startTop = zr.top - rect.top;
        startWidth = zr.width; startHeight = zr.height;
        // Attach global listeners ONLY when dragging starts
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault(); e.stopPropagation();
      };

zone.addEventListener('mousedown', onMouseDown);
      zone.addEventListener('click', (e) => {
        if (!isDragging && !isResizing) this.selectZone(zone.dataset.zoneId);
        e.stopPropagation();
      });
      // Double-click to edit text in PRICE mode
      zone.addEventListener('dblclick', (e) => {
        if (this.priceEditorMode === 'price' && !isDragging && !isResizing) {
          this.editZoneText(zone.dataset.zoneId, zone);
        }
        e.stopPropagation();
      });
    });
  }

  // Size the wrapper so it matches the image display area exactly (no letterboxing).
  // The image then fills the wrapper 100% and the overlay (inset:0) covers it precisely.
  sizePriceEditorWrapper() {
    const wrapper = document.getElementById('price-editor-wrapper');
    const img = document.getElementById('price-editor-image');
    const container = document.getElementById('price-editor-container');
    if (!wrapper || !img || !container) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    // Available space: container width, and at most 70% of viewport height
    const maxW = container.clientWidth || window.innerWidth;
    const maxH = Math.max(200, Math.min(container.clientHeight || (window.innerHeight * 0.7), window.innerHeight * 0.7));
    const aspect = img.naturalWidth / img.naturalHeight;

    let w, h;
    if (maxW / maxH > aspect) {
      // Available box is wider than the image -> fit to height
      h = maxH;
      w = maxH * aspect;
    } else {
      // Available box is taller than the image -> fit to width
      w = maxW;
      h = maxW / aspect;
    }

    wrapper.style.width = `${Math.round(w)}px`;
    wrapper.style.height = `${Math.round(h)}px`;
  }

  // The overlay (inset:0) now matches the image display area exactly, so its
  // bounding rect IS the image rect. Kept for backward compatibility.
  getImageDisplayRect(overlay) {
    const rect = overlay.getBoundingClientRect();
    return {
      left: 0,
      top: 0,
      width: rect.width,
      height: rect.height
    };
  }

  makeZonesTextEditableOnly() {
    const overlay = document.getElementById('price-editor-overlay');
    if (!overlay) return;

    overlay.querySelectorAll('.price-zone').forEach(zone => {
      // Click to select zone
      zone.addEventListener('click', (e) => {
        if (this.priceEditorMode === 'price') {
          e.stopPropagation();
          this.selectZone(zone.dataset.zoneId);
        }
      });
      // Double-click to edit text in PRICE mode
      zone.addEventListener('dblclick', (e) => {
        if (this.priceEditorMode === 'price') {
          e.stopPropagation();
          this.editZoneText(zone.dataset.zoneId, zone);
        }
      });
    });
  }

  editZoneText(zoneId, zoneEl) {
    const zone = this.priceEditorZones.find(z => z.id === zoneId);
    if (!zone) return;

    const contentEl = zoneEl.querySelector('.zone-content');
    if (!contentEl) return;

    const currentText = zone.text || '';
    
    // Replace content with input field
    contentEl.innerHTML = `
      <input type="text" class="zone-text-edit w-full px-2 py-1 bg-white/10 border border-accent/50 rounded text-black text-center text-sm focus:outline-none focus:border-accent" value="${currentText}" style="font-size: 20px; font-weight: ${zone.bold === false ? 400 : 800}; color: #000000;">
    `;

    const input = contentEl.querySelector('.zone-text-edit');
    input.focus();
    input.select();

    const finishEdit = () => {
      const newText = input.value.trim();
      if (newText !== currentText) {
        zone.text = newText;
        this.renderZoneOverlay();
        this.renderPriceZoneList();
      } else {
        this.renderZoneOverlay();
      }
    };

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finishEdit();
      } else if (e.key === 'Escape') {
        this.renderZoneOverlay();
      }
    });
  }

  deletePriceZone(zoneId) {
    this.priceEditorZones = this.priceEditorZones.filter(z => z.id !== zoneId);
    if (this.selectedZoneId === zoneId) this.selectedZoneId = null;
    this.renderPriceZoneList();
    this.renderZoneOverlay();
  }

  /**
   * Duplicate a price zone: an exact copy (same size / x / font / color / styles)
   * with a brand new unique id, nudged slightly downward so it doesn't sit exactly
   * on top of the original. If the original already touches the bottom edge, the
   * copy is nudged a bit upward / sideways instead so it never fully covers it.
   * The new zone becomes the selected zone and the config is marked dirty so it
   * can be persisted with the Save button.
   */
  duplicatePriceZone(zoneId) {
    const src = this.priceEditorZones.find(z => z.id === zoneId);
    if (!src) return;

    const clamp = (v, min, max) => Math.min(Math.max(Number(v) || 0, min), max);
    const w = clamp(src.w_percent, 0, 100);
    const h = clamp(src.h_percent, 0, 100);
    const x = clamp(src.x_percent, 0, 100 - w);
    const y = clamp(src.y_percent, 0, 100 - h);

    // Shift down by the zone height plus a small gap, clamped inside the image.
    const GAP = 1.5;
    let newY = y + h + GAP;
    let newX = x;
    const maxY = 100 - h;
    if (newY > maxY) {
      // Original is at/near the bottom: try to sit above it instead.
      newY = y - h - GAP;
      if (newY < 0) {
        // No room above either -> keep it clamped low and offset slightly sideways
        // so the two rectangles are not 100% overlapping.
        newY = maxY;
        newX = clamp(x + (w / 2), 0, 100 - w);
      }
    }
    const round1 = (v) => Math.round(v * 10) / 10;

    const copy = {
      ...src, // copies text / fontSize / fontFamily / color / textShadow / bold / backgroundColor
      id: `zone-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x_percent: round1(newX),
      y_percent: round1(clamp(newY, 0, maxY)),
      w_percent: round1(w),
      h_percent: round1(h)
    };

    // Insert right after the original for a predictable position in the list.
    const srcIndex = this.priceEditorZones.indexOf(src);
    this.priceEditorZones.splice(srcIndex + 1, 0, copy);

    this.selectedZoneId = copy.id;
    this.markDirty();
    this.renderPriceZoneList();
    this.renderZoneOverlay();

    // Keep the style controls (toolbar + sidebar) in sync with the new zone.
    this.selectZone(copy.id);
  }

  closePriceEditor() {
    this.unbindPriceEditorEvents();
    if (this._editorResizeHandler) {
      window.removeEventListener('resize', this._editorResizeHandler);
      this._editorResizeHandler = null;
    }
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler);
      this.escapeHandler = null;
    }
    const modal = document.getElementById('price-editor-modal');
    if (modal) {
      modal.onclick = null;
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
    this.currentPriceImage = null;
    this.priceEditorZones = [];
    this.priceEditorMode = 'place';
    this.selectedZoneId = null;
    this.priceEditorCleanup = null;
  }

  async savePrices() {
    if (!this.currentPriceImage) return;
    try {
      const section = this.config.sections.find(s => s.id === this.currentPriceImage.sectionId);
      const image = section?.images?.find(i => i.id === this.currentPriceImage.imageId);
        if (section && image) {
          // Clamp zone coordinates: keep every zone fully inside the image area.
          // x: 0..100-w, y: 0..100-h (also guards against w/h outside 0..100).
          const clamp = (v, min, max) => Math.min(Math.max(Number(v) || 0, min), max);
          const clampZone = (z) => {
            const w = clamp(z.w_percent, 0, 100);
            const h = clamp(z.h_percent, 0, 100);
            return {
              id: z.id,
              x_percent: clamp(z.x_percent, 0, 100 - w),
              y_percent: clamp(z.y_percent, 0, 100 - h),
              w_percent: w,
              h_percent: h,
              text: z.text,
              fontSize: z.fontSize,
              fontFamily: z.fontFamily,
              color: z.color,
              backgroundColor: z.backgroundColor,
              textShadow: z.textShadow,
              bold: z.bold
            };
          };
          // Create clean zone data without any circular references (+ clamped coords)
          const zonesToSave = this.priceEditorZones.map(clampZone);
        
        if (this.priceEditorMode === 'place') {
          image.priceZones = zonesToSave;
        } else {
          image.priceZones = zonesToSave.filter(z => z.text && z.text.trim());
        }
        
        // Sync to legacy `prices` format for menu page compatibility
        image.prices = image.priceZones
          .filter(z => z.text && z.text.trim())
          .map(z => ({
            id: z.id,
            price: z.text,
            x_percent: z.x_percent,
            y_percent: z.y_percent
          }));
        
        await this.saveConfig();
        this.closePriceEditor();
        this.renderImagesTab();
        this.showToast(`${this.priceEditorMode === 'place' ? 'Zones' : 'Prices'} saved`, 'success');
      }
    } catch (error) {
      console.error('Error saving prices:', error);
      this.showToast('Failed to save: ' + error.message, 'error');
    }
  }

  // ============ UI HELPERS ============
  showConfirm(title, message, callback) { this.confirmCallback = callback; document.getElementById('confirm-title').textContent = title; document.getElementById('confirm-message').textContent = message; document.getElementById('confirm-modal').classList.remove('hidden'); document.getElementById('confirm-modal').classList.add('flex'); }
  hideConfirm() { this.confirmCallback = null; document.getElementById('confirm-modal').classList.add('hidden'); document.getElementById('confirm-modal').classList.remove('flex'); }
  showToast(message, type = 'info') { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' }; toast.className = `px-4 py-3 rounded-lg shadow-lg ${colors[type] || colors.info} text-white animate-slide-in`; toast.textContent = message; container.appendChild(toast); setTimeout(() => { toast.classList.add('animate-fade-out'); setTimeout(() => toast.remove(), 300); }, 3000); }
  /**
   * Convert a stored pixel font size into container-query width units (cqw) so the
   * zone text scales proportionally with the image. Baseline: 14px == 2.5cqw at a
   * 560px wide image. Mirrors BarMenuApp.fontSizeToCqw() on the client so the admin
   * preview matches what visitors see 1:1.
   */
  static fontSizeToCqw(fontSize) {
    const px = Number(fontSize);
    const safe = (isFinite(px) && px > 0) ? px : 14;
    return Math.round((safe / 5.6) * 1000) / 1000;
  }

}

// Initialize admin panel
window.AdminPanel = AdminPanel;
window.initializeAdmin = function() { const initPanel = () => { const panel = new AdminPanel(); window.adminPanel = panel; }; if (typeof Sortable === 'undefined') { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js'; script.onload = initPanel; script.onerror = () => { console.warn('SortableJS CDN failed, trying local fallback'); const localScript = document.createElement('script'); localScript.src = '/assets/js/Sortable.min.js'; localScript.onload = initPanel; localScript.onerror = () => { console.error('SortableJS not available, drag & drop disabled'); initPanel(); }; document.head.appendChild(localScript); }; document.head.appendChild(script); } else { initPanel(); } };