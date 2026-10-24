# QR Web Menu for Bar

Mobile-first web app for bar menu accessed via QR codes. Deployed on Vercel.

## Quick Start

### Local Development
```bash
# Using Python (built-in)
python -m http.server 8000

# Or Node.js
npx serve .

# Or PHP
php -S localhost:8000
```
Then open http://localhost:8000

### Deploy to Vercel
1. Push this folder to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → Add New Project
3. Import your GitHub repo
4. Deploy (zero config needed)

## Project Structure
```
voice-menu/
├── index.html              # Main entry point
├── manifest.json           # PWA manifest
├── vercel.json             # Vercel config
├── assets/
│   ├── css/
│   │   └── styles.css      # Custom styles
│   ├── js/
│   │   ├── app.js          # Navigation, modals, scroll
│   │   └── i18n.js         # Translation system
│   └── images/
│       └── menu/           # PUT YOUR JPG MENU PAGES HERE
├── locales/
│   ├── en.json             # English (placeholder)
│   ├── ru.json             # Russian translations
│   └── ro.json             # Romanian translations
```

## Adding Menu Images (JPG)

**Upload your menu page JPGs to: `assets/images/menu/`**

### Expected Filenames (matching index.html)

**Food Section (5 pages):**
- `food-page-1.jpg` through `food-page-5.jpg`

**Drinks Section (11 pages):**
- `drinks-page-1.jpg` through `drinks-page-11.jpg`

**Promo Set (2 pages):**
- `promo-page-1.jpg`, `promo-page-2.jpg`

**Birthday Offer (2 pages):**
- `birthday-page-1.jpg`, `birthday-page-2.jpg`

### To add more/fewer pages:
Edit `index.html` and add/remove `<img>` tags in the corresponding sections:
- `#food-section` for food
- `#drinks-section` for drinks
- `#promo-content` for promo
- `#birthday-content` for birthday

**Image requirements:**
- Format: JPG (recommended) or PNG
- Width: Optimize for mobile (max 800px wide)
- Lazy loading is automatic (`loading="lazy"`)

## Adding Translations

Edit `locales/ru.json` and `locales/ro.json` to translate the interface.

### Current Keys
```json
{
  "nav": {
    "food": "FOOD",
    "drinks": "DRINKS",
    "promo": "PROMO SET",
    "birthday": "BIRTHDAY OFFER"
  },
  "common": {
    "back": "BACK",
    "language": "LANGUAGE"
  },
  "sections": {
    "food": "FOOD MENU",
    "drinks": "DRINKS MENU"
  },
  "promo": {
    "title": "PROMO SET",
    "content": "Promo content..."
  },
  "birthday": {
    "title": "BIRTHDAY OFFER",
    "content": "Birthday content..."
  }
}
```

**To translate:** Replace the English values with Russian/Romanian translations. Keep the keys exactly the same.

## Customization

### Colors
Edit `tailwind.config` in `index.html`:
```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: '#1a1a2e',    // Dark background
        secondary: '#16213e',  // Card background
        accent: '#e94560',     // Accent color (red)
        gold: '#ffd700'        // Gold accent
      }
    }
  }
}
```

### Font
Add Google Fonts link in `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```
Then add `font-inter` to body class.

## Features
- ✅ Mobile-first responsive design
- ✅ Sticky header with 4 navigation buttons
- ✅ Smooth scroll to FOOD/DRINKS sections (with header offset)
- ✅ Full-screen modals for PROMO SET & BIRTHDAY OFFER
- ✅ Sticky BACK button in modals
- ✅ Language switcher (RU/RO) with localStorage persistence
- ✅ Translation system via JSON files
- ✅ PWA ready (installable on mobile)
- ✅ Accessible (ARIA, focus management, keyboard nav)
- ✅ Zero build step - pure HTML/CSS/JS
- ✅ Vercel-ready with SPA routing
- ✅ Image-based menu (preserves original PDF design 100%)

## Browser Support
- iOS Safari 14+
- Chrome for Android 90+
- Modern desktop browsers

## Performance
- No external dependencies except Tailwind CDN (~27KB gzipped)
- All logic in ~2KB gzipped JS
- Images lazy-loaded by browser
- Cache headers configured in vercel.json

---

**Need help?** Check the browser console for errors. Most issues are:
1. Missing `locales/{lang}.json` files
2. Incorrect `data-i18n` keys in HTML
3. CORS when testing locally (use a local server, not `file://`)
4. Images not found - check filenames match exactly (case-sensitive on Linux/Vercel)