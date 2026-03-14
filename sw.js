const CACHE_NAME = 'testimoniale-v15';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/config.js',
    './js/db.js',
    './js/events.js',
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
    './js/views/archive.js',
    './js/views/pertinenze.js',
    './js/views/stairs.js',
    './js/views/prospetti.js',
    './js/views/marker.js',
    './js/reports/formatters.js',
    './manifest.json'
];

// CDN resources to cache
const CDN_TO_CACHE = [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Cache local assets first (critical)
                return cache.addAll(ASSETS_TO_CACHE).then(() => {
                    // Then try CDN assets (non-critical, may fail offline)
                    return Promise.allSettled(
                        CDN_TO_CACHE.map((url) => cache.add(url))
                    );
                });
            })
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Message: consenti force-update dalla webapp
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Fetch: stale-while-revalidate for static assets
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip non-GET
    if (event.request.method !== 'GET') return;

    // Skip cross-origin except allowed CDNs
    if (url.origin !== location.origin &&
        !url.href.includes('fonts.googleapis.com') &&
        !url.href.includes('fonts.gstatic.com') &&
        !url.href.includes('cdn.jsdelivr.net') &&
        !url.href.includes('telegram.org')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) {
                // Serve from cache, update in background
                fetch(event.request).then((response) => {
                    if (response && response.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, response.clone());
                        });
                    }
                }).catch(() => {});
                return cached;
            }

            // Not in cache: fetch from network and cache
            return fetch(event.request).then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            });
        })
    );
});
