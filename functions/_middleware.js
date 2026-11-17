/**
 * functions/_middleware.js
 * ---------------------------------------------------------------------------
 * Root Cloudflare Pages middleware. Enforces HTTP Basic Auth in front of the
 * admin surface of the project BEFORE any Pages Function or static asset is
 * served (a root _middleware.js runs for the entire application, including
 * static files - see Cloudflare Pages docs "Middleware").
 *
 * Protected (any method):
 *   - /pad, /pad.html, /pad/*   -> admin SPA (Pages redirects /pad.html -> /pad)
 *   - /api/admin, /api/admin/*  -> config read/write, upload, image delete
 *
 * Protected (mutating methods, on every Pages Function):
 *   - POST / PUT / PATCH / DELETE
 *
 * Left public on purpose (the guest menu must keep working):
 *   - GET / , /assets/* , /locales/* , /manifest.json   (static assets)
 *   - GET /api/config                                   (guest menu config)
 *   - GET /api/images/*                                 (R2 image delivery)
 *
 * Credentials come from env.ADMIN_USER / env.ADMIN_PASS (set with
 * `wrangler pages secret put` in production, or via .dev.vars locally).
 * If either variable is missing the protected surface fails closed with
 * HTTP 500 so the admin panel can never be served without a password.
 */

const REALM = 'Voice Menu Admin';

/**
 * Build the 401 challenge response. The browser shows its native Basic Auth
 * dialog (and then caches the credentials for the whole origin, which is what
 * lets the admin SPA call /api/admin/* afterwards).
 */
function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store'
    }
  });
}

/**
 * Constant-time string comparison (avoids leaking length / prefix via timing).
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);
  const method = request.method.toUpperCase();

  const isAdminPage =
    pathname === '/pad' || pathname === '/pad.html' || pathname.startsWith('/pad/');
  const isAdminApi =
    pathname === '/api/admin' || pathname.startsWith('/api/admin/');
  const isMutating = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  // Public read-only traffic (menu, locales, R2 images, guest config) is never
  // challenged.
  if (!isAdminPage && !isAdminApi && !isMutating) {
    return next();
  }

  const adminUser = env.ADMIN_USER;
  const adminPass = env.ADMIN_PASS;

  // Fail closed: without credentials the protected surface must not open.
  if (!adminUser || !adminPass) {
    return new Response('Admin credentials are not configured', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return unauthorized();

  let decoded;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return unauthorized();
  }

  const sep = decoded.indexOf(':');
  const user = sep === -1 ? decoded : decoded.slice(0, sep);
  const pass = sep === -1 ? '' : decoded.slice(sep + 1);

  if (!safeEqual(user, adminUser) || !safeEqual(pass, adminPass)) {
    return unauthorized();
  }

  return next();
}
