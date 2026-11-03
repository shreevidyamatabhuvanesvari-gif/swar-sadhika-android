/* App-scoped offline cache: do not clear CacheStorage entries owned by other apps. */
"use strict";

const CACHE_PREFIX = "swar-sadhika-android-";
const CACHE_NAME = `${CACHE_PREFIX}v7";
const LEGACY_CACHE_NAMES = new Set([
  "swar-sadhika-web-v5",
  "swar-sadhika-web-v6"
]);
const APP_SCOPE = new URL(self.registration.scope);

const SHELL = [
  "./",
  "./index.html?v=0.6.1",
  "./styles.css?v=0.6.1",
  "./app.js?v=0.6.1",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./app/main.js?v=0.6.0",
  "./app/core/storage.js",
  "./app/core/devanagari-parser.js?v=0.6.0",
  "./app/core/language-modes.js?v=0.6.0",
  "./app/core/pronunciation-engine.js?v=0.6.0",
  "./app/data/sanskrit-pronunciation-lexicon.js?v=0.6.0",
  "./app/core/status-board.js",
  "./app/features/voice-preview.js?v=0.6.0",
  "./app/features/text-studio.js?v=0.6.0",
  "./app/features/media-lab.js",
  "./app/features/library-view.js?v=0.6.0",
  "./app/features/avatar-preview.js",
  "./progress.json"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    const ownedOldCaches = cacheNames.filter(name =>
      name !== CACHE_NAME &&
      (name.startsWith(CACHE_PREFIX) || LEGACY_CACHE_NAMES.has(name))
    );

    await Promise.all(ownedOldCaches.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (
    requestUrl.origin !== APP_SCOPE.origin ||
    !requestUrl.pathname.startsWith(APP_SCOPE.pathname)
  ) {
    return;
  }

  const isProgressJson = requestUrl.pathname.endsWith("/progress.json");

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (isProgressJson) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;
        throw error;
      }
    }

    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
