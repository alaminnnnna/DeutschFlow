/*
 * DeutschFlow service worker — offline-first app shell.
 *
 * Strategies:
 *   - App shell + icons:    precached at install (network-first on navigation
 *                           with shell fallback so the SPA always opens).
 *   - Versioned build assets (/_next/static/*) and self-hosted fonts/icons:
 *                           cache-first (immutable content-hashed URLs).
 *   - Same-origin GET (manifest, misc): stale-while-revalidate.
 *   - /api/*:               NEVER cached — translations must be honestly
 *                           online; offline text comes from the app's own
 *                           IndexedDB cache (see src/lib/cache.ts).
 *   - POST/DELETE etc.:     never intercepted.
 *
 * Updates: a new version installs and WAITS (no auto-reload). The page shows
 * a non-blocking notice; reloading activates it — an active review session
 * is never interrupted from underneath the user.
 */

const VERSION = 'v1';
const SHELL_CACHE = `df-shell-${VERSION}`;
const ASSET_CACHE = `df-assets-${VERSION}`;
const RUNTIME_CACHE = `df-runtime-${VERSION}`;

const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all(
      SHELL_URLS.map((url) =>
        caches
          .open(SHELL_CACHE)
          .then((cache) => cache.add(new Request(url, { cache: 'reload' })))
          .catch(() => {}) // a failed icon must never break the install
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, RUNTIME_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isImmutableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin: ignore
  if (url.pathname.startsWith('/api/')) return; // honest network-only

  // App shell navigation: network-first, fall back to cached pages.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached =
            (await caches.match(request)) ||
            (await caches.match('/')) ||
            (await caches.match('/', { ignoreSearch: true }));
          return (
            cached ||
            new Response('<h1>DeutschFlow</h1><p>Offline — প্রথমে একবার অনলাইনে খুলে নাও।</p>', {
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
              status: 200,
            })
          );
        }
      })()
    );
    return;
  }

  // Immutable versioned assets: cache-first.
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        const fresh = await fetch(request);
        const cache = await caches.open(ASSET_CACHE);
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      })()
    );
    return;
  }

  // Everything else same-origin GET: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const hit = await cache.match(request);
      const network = fetch(request)
        .then((fresh) => {
          if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        })
        .catch(() => hit);
      return hit || network;
    })()
  );
});
