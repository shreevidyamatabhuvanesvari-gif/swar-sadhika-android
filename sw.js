/* App-scoped offline cache. Never delete another GitHub Pages app's cache. */
"use strict";
const CACHE_PREFIX = "swar-sadhika-android-";
const CACHE_NAME = `${CACHE_PREFIX}v9`;
const LEGACY_CACHE_NAMES = new Set(["swar-sadhika-web-v5", "swar-sadhika-web-v6"]);
const APP_SCOPE = new URL(self.registration.scope);
const SHELL = [
  "./",
  "./index.html?v=0.9.0",
  "./styles.css?v=0.9.0",
  "./app.js?v=0.9.0",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./app/main.js?v=0.9.0",
  "./app/core/storage.js",
  "./app/core/device-capabilities.js?v=0.9.0",
  "./app/core/status-board.js?v=0.9.0",
  "./app/core/devanagari-parser.js?v=0.9.0",
  "./app/core/language-modes.js",
  "./app/core/language-modes.js?v=0.6.0",
  "./app/core/pronunciation-engine.js?v=0.6.0",
  "./app/data/sanskrit-pronunciation-lexicon.js",
  "./app/data/sanskrit-pronunciation-lexicon.js?v=0.6.0",
  "./app/features/navigation.js?v=0.9.0",
  "./app/features/dashboard.js?v=0.9.0",
  "./app/features/app-settings.js?v=0.9.0",
  "./app/features/learning-notes.js?v=0.9.0",
  "./app/features/voice-preview.js?v=0.9.0",
  "./app/features/text-studio.js?v=0.9.0",
  "./app/features/media-lab.js?v=0.9.0",
  "./app/features/library-view.js?v=0.9.0",
  "./app/features/avatar-preview.js",
  "./progress.json"
];
self.addEventListener("install", event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL);
  await self.skipWaiting();
})()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  const names = await caches.keys();
  const old = names.filter(name =>
    (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) || LEGACY_CACHE_NAMES.has(name)
  );
  await Promise.all(old.map(name => caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== APP_SCOPE.origin || !url.pathname.startsWith(APP_SCOPE.pathname)) return;
  const isProgress = url.pathname.endsWith("/progress.json");
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (isProgress) {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw error;
      }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  })());
});
