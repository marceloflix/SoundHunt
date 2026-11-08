/**
 * SoundHunt Service Worker (PWA)
 * Strategy: Network-First with Cache Fallback for local assets.
 * Guarantees fresh updates when connected, full offline capability when offline.
 */

const CACHE_NAME = 'soundhunt-v0.5.1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/tokens.css',
    './css/base.css',
    './css/controls.css',
    './css/receiver.css',
    './css/feed.css',
    './css/transport.css',
    './css/panels.css',
    './manifest.json',
    './js/controls.js',
    './js/storage.js',
    './js/stash.js',
    './js/settings.js',
    './js/stats.js',
    './js/player.js',
    './js/audio-dsp-engine.js',
    './js/playlist.js',
    './js/merge.js',
    './js/feed.js',
    './js/api.js',
    './js/ui.js',
    './assets/icon.svg',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './assets/icon-maskable-192.png',
    './assets/icon-maskable-512.png',
    './assets/favicon-64.png',
    './assets/hifi/knob.webp',
    './assets/hifi/screw.webp',
    './assets/hifi/bezel.webp',
    './assets/hifi/walnut.webp',
    './assets/hifi/brushed.webp',
    './assets/hifi/cap-wide.webp',
    './assets/hifi/cap-sq.webp',
    './assets/hifi/toggle-up.webp',
    './assets/hifi/toggle-down.webp',
    './assets/hifi/hunt-cap.webp',
    './assets/hifi/hunt-bezel.webp',
    './assets/hifi/turntable.webp',
    './assets/hifi/tonearm.webp'
];

// Third-party static hosts (fonts, icon font, 7-segment font) cached so the receiver
// keeps its look offline.
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

// URLs that must bypass the Service Worker cache completely (APIs & dynamic media)
const BYPASS_DOMAINS = [
    'generativelanguage.googleapis.com',
    'itunes.apple.com',
    'mzstatic.com',
    'monochrome.tf'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Bypass external APIs and streaming media
    if (BYPASS_DOMAINS.some(domain => url.hostname.includes(domain))) {
        return;
    }

    // Network-First with Cache Fallback
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Cache same-origin files and the CDN fonts/icons in the background
                const cacheable = networkResponse && networkResponse.status === 200 &&
                    (networkResponse.type === 'basic' || (networkResponse.type === 'cors' && CDN_HOSTS.includes(url.hostname)));
                if (cacheable) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Offline fallback from cache
                // ignoreSearch: precached files are stored without the ?v= query the page requests
                return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
