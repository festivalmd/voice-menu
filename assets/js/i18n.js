/**
 * i18n.js - Simple translation system
 * Loads translations from /locales/{lang}.json
 * Uses data-i18n attributes on DOM elements
 */

class I18n {
  constructor() {
    this.translations = {};
    this.currentLang = 'en';
    this.fallbackLang = 'en';
    this.loaded = false;
  }

  /**
   * Load translations for a language
   * @param {string} lang - Language code (e.g., 'en', 'ru', 'ro')
   * @returns {Promise<Object>} Translations object
   */
  async load(lang) {
    if (this.translations[lang]) {
      return this.translations[lang];
    }

    try {
      const response = await fetch(`/locales/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load ${lang}.json: ${response.status}`);
      }
      const data = await response.json();
      this.translations[lang] = data;
      return data;
    } catch (error) {
      console.error(`Error loading translations for ${lang}:`, error);
      if (lang !== this.fallbackLang) {
        return this.load(this.fallbackLang);
      }
      return {};
    }
  }

  /**
   * Get translation for a key
   * @param {string} key - Dot notation key (e.g., 'nav.food')
   * @param {string} lang - Language code (optional, uses current)
   * @returns {string} Translated string or key if not found
   */
  t(key, lang = this.currentLang) {
    const translations = this.translations[lang] || this.translations[this.fallbackLang] || {};
    const keys = key.split('.');
    let value = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key; // Return key as fallback
      }
    }

    return typeof value === 'string' ? value : key;
  }

  /**
   * Set current language and apply translations
   * @param {string} lang - Language code
   * @returns {Promise<void>}
   */
  async setLanguage(lang) {
    await this.load(lang);
    this.currentLang = lang;
    this.applyTranslations();
    localStorage.setItem('preferred-language', lang);
    this.updateLanguageButtons(lang);
  }

  /**
   * Apply translations to all elements with data-i18n attribute
   */
  applyTranslations() {
    if (!this.loaded) {
      this.loaded = true;
    }

    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.t(key);
      
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.placeholder = translation;
      } else if (element.hasAttribute('aria-label')) {
        element.setAttribute('aria-label', translation);
        element.textContent = translation;
      } else {
        element.textContent = translation;
      }
    });

    // Update document title if it has data-i18n
    const titleElement = document.querySelector('title[data-i18n]');
    if (titleElement) {
      document.title = this.t(titleElement.getAttribute('data-i18n'));
    }

    // Update html lang attribute
    document.documentElement.lang = this.currentLang;
  }

  /**
   * Update language button active states
   * @param {string} activeLang - Active language code
   */
  updateLanguageButtons(activeLang) {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      if (lang === activeLang) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  /**
   * Initialize i18n system
   * @returns {Promise<void>}
   */
  async init() {
    // Get saved language or default to 'ru' (first language in PRD)
    const savedLang = localStorage.getItem('preferred-language') || 'ru';
    await this.setLanguage(savedLang);
  }
}

// Export singleton instance
window.i18n = new I18n();