const CACHE_NAME = 'testimoniale-v1';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',
    './js/config.js',
    './js/db.js',
    './js/photos.js',
    './js/sync.js',
    './js/app.js',
    './js/views/components.js',
    './js/views/home.js',
    './js/views/setup.js',
    './js/views/anagrafica.js',
    './js/views/rooms.js',
    './js/views/wizard.js',
    './js/views/review.js',
    './js/views/pertinenze.js',
    './js/views/stairs.js',
    './js/views/prospetti.js',
    './js/reports/formatters.js',
];

const ALLOWED_CDN = [
    'https://telegram.org',
    'https://unpkg.com',
    'https://cdnjs.cloudflare.com',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    // Solo GET
    if (e.request.method !== 'GET') return;
    // Solo same-origin o CDN permessi
    const isSameOrigin = url.origin === location.origin;
    const isAllowedCDN = ALLOWED_CDN.some(cdn => url.href.startsWith(cdn));
    if (!isSameOrigin && !isAllowedCDN) return;

    // Stale-while-revalidate
    e.respondWith(
        caches.match(e.request).then(cached => {
            const fetchPromise = fetch(e.request).then(resp => {
                if (resp && resp.ok) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return resp;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});
