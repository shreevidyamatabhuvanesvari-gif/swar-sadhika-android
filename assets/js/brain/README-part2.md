# Swar-Sadhika Nano Brain — Foundation Part 2

This directory contains the first local-only foundation. It is deliberately not a chatbot or a model runtime.

## Included modules

- `brain-security-part2.js`: bounded JSON validation, data-only Skill Manifest validation, safe IDs, SHA-256 helpers, and a default-deny capability gate. A grant requires a trusted browser event plus the browser's native confirmation dialog. Grants are session-only.
- `brain-storage-part2.js`: IndexedDB structured storage (`records`, `metadata`, `events`), explicitly reported in-memory fallback, optional OPFS asset storage, and an opt-in user-selected directory picker. The directory handle is not silently persisted.
- `brain-integration-foundation-part2.js`: narrow application facade, single-flight initialization, and serialized mount/show/hide/unmount lifecycle helper.
- `brain-foundation-selftest-part2.js`: Node/browser-compatible foundation regression tests.
- `../pages/page-nano-brain-part2.js`: actual Nano Brain foundation status page. It reports the model runtime as not installed and strict offline certification as not run.

## Data and security rules

1. No external AI API, remote inference endpoint, or server is called.
2. Skill manifests contain metadata only. They cannot specify a script, file, or URL, and this foundation never imports downloaded skills.
3. Capabilities are denied by default. There is no persisted permission grant.
4. JSON records are cloned through a bounded validator and reject prototype-pollution keys, accessors, symbol keys, non-finite numbers, non-plain objects, and excessive nesting/size.
5. IndexedDB is the only persistent structured store implemented here. If it cannot open, the optional fallback is Memory and diagnostics explicitly report `persistent: false`.
6. OPFS is an optional feature-detected asset store. It is not assumed to exist and is not yet wired to model installation.
7. A user-selected directory is optional, requires a real trusted browser gesture, and is not automatically saved as a permanent handle. Android SD-card access is therefore not claimed.
8. Hash utilities are available for future model/asset admission, but no model download or model activation is implemented in this phase.

## Database contract

Database: `swar-sadhika-brain-part2`, version 1.

- `records`: key path `id` — structured memory/knowledge/learning records.
- `metadata`: key path `key` — schema, version and migration metadata.
- `events`: key path `id` — append-style local operational events.

The existing Nano Server database is not modified. Future schema changes must add an explicit IndexedDB migration and tests; they must not silently clear existing stores.

## Integration contract

The Nano Brain page is routed through the existing main Page Loader using a statically declared Part 2 page entry. `index.html` and its script tags are unchanged. The existing Nano Server, Sanskrit, TTS and Avatar engines are not modified by this foundation.

The legacy generic Registry loader remains separate from the Brain Skill Manifest. The Brain Skill Manifest is declarative metadata and must never become an executable-code registry.

## Not implemented in this phase

- Symbolic reasoning, planning, or autonomous task execution.
- Neural model loading, inference, fine-tuning, or voice training.
- Automatic activation of new pronunciation rules.
- OPFS model installation, SD-card persistence, or permanent File System Access handle storage.
- Service Worker installation and strict offline certification.

These require separate audited implementation and real Android Chrome tests.


## Browser-level IndexedDB persistence test

`brain-browser-test-part2.html` uses the browser's native IndexedDB implementation and requires a secure context (localhost is suitable for CI). `brain-browser-test-runner-part2.mjs` drives it with Playwright and the installed Chrome binary; Playwright is installed only inside CI and is not a runtime dependency of the Android app.

The Foundation workflow launches Chrome twice with the same isolated browser profile:
1. `phase=write` creates a separate test database, writes a record, metadata and an event, then closes the connection.
2. `phase=read` starts a new browser process with the same profile and verifies that all three values survived, then cleans up the record.

The same runner also loads the real app shell at a mobile-sized viewport and verifies that the Nano Brain navigation route mounts the Part 2 page through the existing Page Loader. This verifies real Chromium IndexedDB persistence across browser-process restarts and a browser-level app route smoke test. It is not a physical Android Chrome certification. Android device testing must still verify the actual installed Chrome version, storage quota/eviction behavior, app cold start, and offline behavior.
