# Voice Menu Project - Handoff Documentation

## 1. Stack & Structure
- **Language**: Vanilla JS (ES6+), HTML5, CSS3 (Tailwind via CDN)
- **Runtime**: Cloudflare Pages + Workers (Pages Functions API)
- **Storage**: Cloudflare KV (config), R2 (images)
- **Deploy**: `wrangler pages dev` (dev), `wrangler pages deploy` (prod)

**Key Files:**
- `index.html` - Main SPA entry, SSR-rendered via config
- `pad.html` - Admin panel (SPA, protected by Basic Auth)
- `config.json` - Source of truth (sections, images, prices, nav)
- `assets/js/app.js` - Client SPA: nav, scroll, modals, i18n, price rendering
- `assets/js/admin.js` - Admin SPA: CRUD images, price editor (drag/draw/resize/text)
- `assets/css/styles.css` - All styles (Tailwind + custom)
- `functions/api/admin/config.js` - GET/PUT config (KV)
- `functions/api/admin/upload.js` - POST image → R2, returns public URL
- `functions/api/admin/images/[id].js` - DELETE image from R2
- `functions/api/images/[[path]].js` - Serves R2 images via Worker (bypasses SPA fallback)

## 2. Architecture & Data

### Config Structure (`config.json`)
```json
{
  "version": 1,
  "navigation": { "horizontal": [], "vertical": [] },
  "sections": [
    { "id": "food-section", "titleKey": "sections.food", "images": [{ "id", "src", "alt", "prices": [], "priceZones": [] }] }
  ]
}
```
- **Sections**: `food-section`, `drinks-section`, `promo-modal`, `birthday-modal`
- **Images**: Each has `id`, `src` (R2 URL), `alt`, `prices[]` (legacy), `priceZones[]` (new)
- **Price Zone**: `{ id, x_percent, y_percent, w_percent, h_percent, text, fontSize, color, textShadow }`

### Price Editor (Admin)
- **Two Modes**: `place` (draw rectangles) / `price` (edit text/style)
- **Coordinates**: Stored as **percentages** of the image area. Stored as `x_percent`, `y_percent`, `w_percent`, `h_percent` (0-100, 1 decimal)
- **Wrapper**: `#price-editor-wrapper` is sized (in px) by `sizePriceEditorWrapper()` to match the image's fitting box exactly (container width capped at 70vh height, aspect preserved). No letterboxing → the overlay (`inset: 0`) covers the image precisely.
- **Rendering**: `renderZoneOverlay()` applies coordinates directly as CSS percentages (`left/top/width/height: X%`) — **no % → px conversion**.
- **Drawing/Drag/Resize**: Single source of truth = `overlay.getBoundingClientRect()` (== image area). `%` is computed as `px / rect.width|height * 100` on mouseup.
- **Admin Save**: Serializes zones → saves to `image.priceZones` + syncs legacy `prices[]`

### Client Price Rendering (`app.js:renderPriceTags`)
1. Finds `.price-overlay[data-image-id]` (sibling of the `<img>` inside `.image-wrapper`)
2. `.image-wrapper` (position:relative, container-type:inline-size) hugs the image: `.image-wrapper > img` is `display:block; width:100%; height:auto` (declared in CSS, not only via Tailwind), so the `inset:0` overlay matches the image exactly
3. A zone is a RECTANGLE (x_percent/y_percent = top-left, w/h = size) — the tag OCCUPIES that rectangle 1:1 (inline `left/top/width/height` in `%`, `box-sizing:border-box`, `overflow:hidden`, flex-centered text, `line-height:1`), with NO padding/border/radius/shadow. Background = `zone.backgroundColor` or the admin mask background `rgba(0,0,0,0.2)`. Legacy `prices[]` (no w/h) → centered point label
4. Font size is fluid via Container Queries: the stored px size is converted by `fontSizeToCqw(px) = px / 5.6` (baseline 14px == 2.5cqw @560px) and rendered as `clamp(8px, Xcqw, 96px)`. The admin editor uses the identical formula/container, so admin preview == client 1:1

### Full-screen Modals + Horizontal Swipe Slider (`promo-modal`, `birthday-modal`)
- **Full screen**: `.modal-fullscreen` = `fixed inset-0 w-screen h-[100dvh]` with `m-0 max-w-none rounded-none flex flex-col overflow-hidden`; the CSS block mirrors it with `100dvw/100dvh` + `!important` overrides and forces `display:none` while `.hidden` (Tailwind `flex` cannot win).
- **Pinned header**: `.modal-header` is `shrink-0 sticky top-0 z-30` and adds `env(safe-area-inset-top/left/right)` padding → it never scrolls away and is never covered by slides (slides live below it in `.modal-body`).
- **Slider built from config** (`renderSlider()` in `app.js`): N `.modal-slide` elements == the actual number of images in the `promo-modal` / `birthday-modal` section. Dots are generated the same way. 1 image → arrows + indicators hidden (`is-single`); 2+ → N slides + N dots.
- **Slider mechanics**: `#promo-content` / `#birthday-content` are `.modal-slider` = `display:flex; overflow-x:auto; scroll-snap-type:x mandatory; scroll-behavior:smooth` with the scrollbar hidden. Each `.modal-slide` is `flex:0 0 100%` + `scroll-snap-align:start`; the picture uses `object-fit:contain` so it is as large as possible.
- **Arrows**: `.modal-nav-btn` (52×52, ≥44px tap target) = dark translucent circle `rgba(20,20,35,.72)` + `backdrop-filter:blur(4px)`, white stroke, light border, soft shadow. Hidden on the first slide (prev) / last slide (next) and when a single image exists (`hidden` / `is-disabled`). The next arrow rocks `translateX(3px)` while more slides are available.
- **Indicators**: `.modal-indicators` (bottom plashka) holds dots + `1 / N` counter; they follow the native scroll (`getActiveSlideIndex`) and jump on click (`scrollSliderTo`). Hidden when there is one image.
- **Open resets to slide 1**: `openModal()` calls `resetSlider(name)` → `scrollLeft = 0` (instant, no smooth animation).
- **Price zones stay aligned**: `sizeModalSliders()` (in `app.js`, mirrors the admin `sizePriceEditorWrapper()`) sizes each `.modal-image-wrapper` in px to the picture's real display box (aspect preserved), so the `inset:0` overlay == the image area and existing `%`-based zones land exactly where the admin drew them. Re-measured on open, on image `load`/`error`, on `resize` and on `orientationchange`.
- **config.json / admin.js untouched**: the client only reads the sections; the image markup (`.image-wrapper` + `.price-overlay[data-image-id]`) is unchanged, so admin price editing keeps working 1:1.

## 3. Working Features (DO NOT BREAK)
- ✅ Config-driven rendering (nav, sections, modals, prices)
- ✅ i18n (RO/RU/EN) via `i18n.js` + `data-i18n` attributes
- ✅ Horizontal/Vertical nav + smooth scroll + header show/hide on scroll
- ✅ Promo/Birthday modals (open/close/back/esc/backdrop)
- ✅ Language switcher (RO/RU/EN) with localStorage
- ✅ Image lazy loading + lazy-loaded price overlays
- ✅ Admin: CRUD images (upload to R2, delete from R2, reorder via SortableJS)
- ✅ Price Editor: Draw rectangles (PLACE), edit text/style (PRICE)
- ✅ Drag/resize zones in PLACE mode (constrained to image display area)
- ✅ Click zone → edit text inline (PRICE mode)
- ✅ Font size dropdown, color picker, text-shadow toggle (sidebar)
- ✅ Drag/resize zones in PLACE mode (constrained to image display rect)
- ✅ Save → KV + sync to legacy `prices[]` + R2 image URLs
- ✅ Responsive: mobile-first, Tailwind + custom CSS
- ✅ i18n (RO/RU/EN) with localStorage persistence

## 4. Coordinate System (RESOLVED — simplified, no letterbox math)

### Approach: container parity + direct CSS percentages
**Files**: `app.js` (client), `admin.js` (admin), `styles.css`

The old system stored `%` of the image area but rendered using the overlay rect (incl. letterbox), then converted `%` → px on every render. It was replaced with a much simpler model:

1. **Client** — `.image-wrapper` wraps `<img class="w-full h-auto">` (no `object-fit`), so the wrapper's box == the image's box. The overlay has `inset: 0`, i.e. it exactly covers the image. Zones are positioned with plain CSS percentages: `left: ${x_percent}%; top: ${y_percent}%`.
2. **Admin** — the image is placed inside `#price-editor-wrapper`, whose width/height are set in px by `sizePriceEditorWrapper()` so it matches the image's fitting box exactly (aspect preserved, height capped at 70vh). Again the overlay `inset: 0` == image area, so zones are rendered with plain CSS percentages.
3. **Single source of truth** for drawing/dragging/resizing = `overlay.getBoundingClientRect()` (which equals the image area). Nothing is converted `%` → px at render time.

**Key Functions**:
- `app.js` `renderPriceTags()` — direct CSS % positioning
- `admin.js` `sizePriceEditorWrapper()` — sizes wrapper to match image box
- `admin.js` `renderZoneOverlay()` — direct CSS % rendering
- `admin.js` `bindPriceEditorEvents()` → `getDrawRect()` — returns overlay viewport rect
- `admin.js` `makeZonesDraggableAndResizable()` — px ↔ % on mouseup
- `admin.js` `getImageDisplayRect()` — kept for compatibility, now just returns overlay rect

### Previously reported issues — all fixed
1. ✅ Admin PLACE mode: drawn rectangle no longer offset (old `getDrawRect()` read `imageOffsetX` which didn't exist → NaN; now uses the overlay rect)
2. ✅ Admin PRICE mode: zones render at correct positions (CSS % of the image-backed overlay)
3. ✅ Resize handling: no `%`→px math and no `_renderFunctions` map; CSS % keeps zones aligned automatically
4. ✅ Text rendering: `price.price` vs `text` handled in `renderPriceTags()` fallback
5. ✅ Font size: fluid via Container Queries (`clamp(10px, 2.5cqw, 26px)`), no hardcoded px on the client

### Responsive Font Size
- Implemented via CSS Container Queries: `.image-wrapper { container-type: inline-size }` + `.price-tag { font-size: clamp(10px, 2.5cqw, 26px) }`
- Admin zone text still uses the per-zone `fontSize` (px) chosen in the sidebar.

### Legacy / KV compatibility
- `savePrices()` still writes `image.priceZones` and syncs `image.prices[]` (`{ id, price, x_percent, y_percent }`) — unchanged.
- `renderAllPriceTags()` still prefers `priceZones` and falls back to `prices[]`.

### Acceptance Criteria
- [x] Zones drawn in admin appear exactly where cursor is
- [x] Zones render at identical positions in admin PLACE/PRICE modes and client
- [x] Window resize → zones stay fixed relative to image content (CSS %)
- [x] Font size scales with container width (cqw/clamp)
- [x] No coordinate drift on window resize / orientation change