# Swar-Sadhika — Engine Interfaces and Integration Contracts

**Project:** Swar-Sadhika — Female Chant Studio  
**Repository:** `shreevidyamatabhuvanesvari-gif/swar-sadhika-android`  
**Branch baseline:** `main`  
**Design baseline commit:** `24e9d2ca9f651fd80b0c0c484f788becf58a105b`  
**Document status:** Proposed shared contracts for implementation and review; these contracts are not yet implemented merely because they are documented.  
**Last reviewed:** 4 November 2026

---

## 1. Purpose

This document defines how the four parts of Swar-Sadhika communicate without tightly coupling one Engine to another.

The goal is to prevent the previous classes of integration errors: mismatched DOM IDs, unresolved imports, undocumented payloads, duplicate initialization, hidden remote dependencies, unsupported claims of model training, and loss of user data.

These contracts apply to:

1. Part 1 — App Foundation and Index Panel.
2. Part 2 — Female Neural Voice and Chant Engine.
3. Part 3 — Music Learning and Training Brain.
4. Part 4 — Avatar, Lip-Sync and Video Studio.

The application remains browser-first and targets Android Chrome/PWA, local inference, local storage and offline operation where the relevant capability is technically supported.

## 2. Non-negotiable integration principles

1. Exactly four primary user-facing Indexes exist. Sub-Modules are nested within them.
2. The current `main` branch is the source of truth; audit the exact base SHA before changes.
3. Part 1 owns the shared application shell, composition root, Navigation, shared Storage, common Status reporting and PWA foundation.
4. A consumer may call another Engine only through its documented public interface or a documented event/data contract.
5. An Engine must not import another Engine's private implementation files.
6. Shared Core services may be imported through stable public modules.
7. Initialize each Engine once per application lifecycle unless the interface explicitly supports multiple instances.
8. Heavy model inference, media analysis and rendering must not block the UI thread; use a Worker when the selected browser runtime supports the required transfer and execution model.
9. Do not copy large media/model binaries between Engines. Pass validated references/handles and metadata.
10. A browser API being present does not prove the corresponding capability works.
11. Feature extraction, rule-based adaptation, inference and actual model training/fine-tuning are distinct operations and must be reported separately.
12. A normal TTS utterance is not a generated audio file; TTS is not singing synthesis; pitch adjustment is not proof of a natural female neural voice.
13. A speaking Boolean or CSS mouth animation is not phoneme-synchronized lip-sync.
14. Local photos, private media and private generated content must not be uploaded to the public repository.
15. Unknown, missing, unsupported or failed capability must be represented honestly, not replaced by a fabricated success state.

## 3. Application layers and dependency direction

| Layer | Responsibility | May depend on |
|---|---|---|
| Presentation | Four Indexes, Sub-Module panels, controls and status displays | Application controllers and view-facing Core APIs |
| Application | Bootstrap, Navigation, orchestration and user workflows | Core services and public Engine interfaces |
| Core | Storage, configuration, events, status, errors and capability detection | Browser platform APIs; must not depend on feature UI |
| Engines | Voice, pronunciation, prosody, analysis, pose, avatar, lip-sync and rendering | Public Core contracts and their own implementation |
| Workers | Heavy isolated tasks | Explicit worker messages and task-specific code |
| Storage | IndexedDB, CacheStorage and supported local binary storage | Browser storage APIs |
| Tests | Unit, integration, regression, offline and device acceptance | Public contracts and test harnesses |

Dependency direction is from the UI/orchestrator toward public contracts. An Engine must not reach into another Engine's DOM or internal state.

### 3.1 Public API boundaries

- UI modules may call the application facade or an injected controller.
- Application orchestration may call an Engine's public interface.
- Engines may use injected Storage, Event Bus, capability and logging services.
- Engines may publish documented events; consumers must validate the event version and payload.
- No Engine may directly alter another Engine's UI elements.
- A Worker communicates only through its message protocol; it does not access the DOM.

## 4. Common Engine lifecycle contract

The canonical public lifecycle is:

```javascript
/**
 * Illustrative public contract. This is a specification, not an installed Engine.
 */
const engine = {
  init: async context => {},
  loadModel: async options => {},
  getStatus: () => ({}),
  process: async (input, context) => ({}),
  stop: async reason => {},
  dispose: async () => {}
};
```

### 4.1 Method semantics

| Method | Requirement |
|---|---|
| `init(context)` | Validate dependencies, register listeners/resources and transition to initialized/idle. Must be safe against accidental duplicate initialization. |
| `loadModel(options)` | Optional for model-backed Engines only. Verify license/source/integrity/compatibility before loading. Non-model Engines must report this capability as not applicable, not pretend to load a model. |
| `getStatus()` | Return a side-effect-free status snapshot. It must not initiate downloads or inference. |
| `process(input, context)` | Validate input, create/identify a job, report progress and return a typed result or structured error. |
| `stop(reason)` | Request cancellation of active work and settle the job as cancelled/stopped. Cancellation must not be reported as successful completion. |
| `dispose()` | Release listeners, workers, object URLs, audio nodes, model/runtime memory and other resources owned by this Engine. Must be safe to call more than once. |

An Engine may expose additional documented methods, but they must not silently change these shared semantics.

### 4.2 Initialization context

The application may inject a context object such as:

```javascript
const engineContext = {
  contractVersion: "1.0",
  appVersion: "runtime-version",
  services: {
    storage: storageService,
    events: eventBus,
    capabilities: deviceCapabilities,
    logger: logger
  },
  environment: {
    basePath: "/swar-sadhika-android/",
    offline: !navigator.onLine
  }
};
```

The example illustrates dependency injection. It is not a claim that these exact runtime objects already exist.

Requirements:

- Do not read undeclared globals as a hidden dependency when a service can be injected.
- Do not store authentication secrets or personal data in the context.
- Do not pass the entire DOM to an Engine.
- An Engine must declare which services it requires and fail clearly if a mandatory service is absent.

## 5. Engine identity and status schema

Every registered capability/Engine must have a stable identity:

```json
{
  "engineId": "female-voice",
  "part": 2,
  "contractVersion": "1.0",
  "engineVersion": "implementation-version",
  "state": "NOT_INITIALIZED",
  "capabilities": [],
  "model": null,
  "lastError": null,
  "updatedAt": "2026-11-04T00:00:00.000Z"
}
```

The values above are illustrative. Runtime state must be derived from the actual implementation.

### 5.1 Runtime states

Use only the runtime states that apply:

| State | Meaning |
|---|---|
| `NOT_INITIALIZED` | Engine initialization has not completed |
| `IDLE` | Initialized and available for a supported operation |
| `LOADING` | A real initialization/model/resource load is in progress |
| `READY` | Required dependencies are loaded and a capability-specific readiness check passed |
| `PROCESSING` | A real job is executing |
| `STOPPING` | Cancellation is in progress |
| `UNAVAILABLE` | Required API, model, permission or platform capability is unavailable |
| `ERROR` | An operation failed and the error is recorded |
| `DISPOSED` | Resources were released; reinitialization is required |

Do not use a development status such as `NOT_STARTED` as a runtime state.

### 5.2 Development states

The shared project record uses:

- `PASS`
- `FAIL`
- `BLOCKED`
- `IN_PROGRESS`
- `NOT_STARTED`
- `UNVERIFIED`

Development status belongs in the project progress record and its evidence. Runtime status belongs in the live Engine snapshot. Do not derive one automatically from the other.

### 5.3 Capability declaration

Each Engine must declare capability-level support, for example:

```json
{
  "capability": "offline-inference",
  "supported": false,
  "reason": "Model/runtime not integrated or not verified on this device"
}
```

A detected browser API should be reported as an available platform primitive, not as proof that a complete product feature is READY.

## 6. Common job and result envelope

Long-running operations use a job identity so that progress, cancellation and output can be correlated.

### 6.1 Job input envelope

```json
{
  "schemaVersion": 1,
  "jobId": "unique-job-id",
  "engineId": "audio-analysis",
  "operation": "analyze",
  "input": {
    "type": "media-reference",
    "ref": "local-media-id"
  },
  "options": {},
  "createdAt": "2026-11-04T00:00:00.000Z"
}
```

### 6.2 Job output envelope

```json
{
  "schemaVersion": 1,
  "jobId": "unique-job-id",
  "engineId": "audio-analysis",
  "status": "COMPLETED",
  "output": {
    "type": "analysis-result",
    "ref": "local-analysis-id"
  },
  "warnings": [],
  "error": null,
  "completedAt": "2026-11-04T00:00:00.000Z"
}
```

Valid job terminal states are `COMPLETED`, `FAILED` and `CANCELLED`. An in-progress job may report `QUEUED`, `RUNNING` or `CANCELLING`.

Rules:

- Job IDs are unique within the application.
- Progress events identify the same job ID.
- A cancelled or failed job must not publish a success result.
- Large binary output is stored once; the result carries a storage reference and metadata.
- Timestamps use ISO-8601 UTC with an explicit timezone.
- Inputs are validated before the job starts.
- Errors and warnings are preserved for the user's status view and diagnostics.

## 7. Shared event contract

Use one shared event naming convention:

`swar-sadhika:<domain>:<event>`

Every new event detail object uses:

```json
{
  "schemaVersion": 1,
  "eventId": "unique-event-id",
  "source": "engine-or-feature-id",
  "timestamp": "2026-11-04T00:00:00.000Z",
  "data": {}
}
```

### 7.1 Required events

| Event | Publisher | Consumers | Purpose |
|---|---|---|---|
| `swar-sadhika:navigation:changed` | Navigation | Dashboard/features | Active Index/Sub-Module changed |
| `swar-sadhika:text:updated` | Text Studio | Voice/analysis controllers | Source text changed |
| `swar-sadhika:engine:status` | Any Engine/status service | Dashboard | Runtime status snapshot changed |
| `swar-sadhika:job:progress` | Processing Engine | Relevant panel | A job reports progress |
| `swar-sadhika:job:completed` | Processing Engine | Workflow coordinator | Job completed |
| `swar-sadhika:job:failed` | Processing Engine | Workflow coordinator | Job failed |
| `swar-sadhika:job:cancelled` | Processing Engine | Workflow coordinator | Job cancelled |
| `swar-sadhika:audio:ready` | Audio generation | Avatar/caption/video workflows | Audio reference is ready |
| `swar-sadhika:analysis:ready` | Part 3 analysis | Learning/voice workflows | Analysis result is ready |
| `swar-sadhika:avatar:updated` | Avatar feature/Engine | Video workflow | Avatar selection/configuration changed |
| `swar-sadhika:captions:ready` | Caption workflow | Video renderer | Timed caption track is ready |

Only emit an event after the underlying operation reaches the stated condition. Do not emit `audio:ready` because a TTS button was clicked; emit it only when a usable audio asset/reference has actually been produced.

### 7.2 Existing Library event compatibility

The current repository dispatches:

```javascript
window.dispatchEvent(
  new CustomEvent("swar-sadhika:load-text", {
    detail: contentString
  })
);
```

Keep this legacy event working while the Library/Text Studio integration is migrated. A compatibility adapter may accept either the current string payload or a future versioned envelope, but the change must be covered by an integration test. Do not silently change its payload in a breaking way.

## 8. Part-specific contracts

### 8.1 Part 1 — Foundation services

Part 1 supplies shared platform and application services. Its public responsibilities include:

- Navigation: activate exactly one of the four primary Indexes and the selected Sub-Module.
- Storage: validated record CRUD, migrations, backup/restore and local binary references.
- Device Capabilities: detect browser support without overclaiming feature support.
- Status: expose runtime status separately from development progress.
- Text: publish normalized source text while preserving the user's original content unless the user requests normalization.
- PWA: app-scoped installation/update/cache behavior.

Part 1 must not include a fake placeholder Engine that returns READY for future Parts.

### 8.2 Part 2 — Voice and Chant

The Voice/Chant Engine accepts a normalized text reference and explicit mode/style options.

Conceptual input:

```json
{
  "textRef": "local-text-id",
  "languageMode": "sanskrit",
  "operation": "speech-preview",
  "voiceProfileId": null,
  "prosodyProfileId": null,
  "outputFormat": "audio/wav"
}
```

Use explicit operation values such as:

- `speech-preview`
- `neural-tts`
- `chant-synthesis`

These operations must remain distinguishable.

A completed audio result should expose metadata such as:

```json
{
  "audioId": "local-audio-id",
  "mimeType": "audio/wav",
  "durationMs": 12000,
  "sampleRate": 24000,
  "channels": 1,
  "storageRef": "local-audio-reference",
  "timingTrackRef": null,
  "modelId": "verified-model-id",
  "modelVersion": "verified-model-version"
}
```

The values are illustrative, not prescribed model settings.

Requirements:

- Identify whether output is device TTS, Neural TTS or Singing Synthesis.
- Do not call a SpeechSynthesis utterance an exported audio file.
- Do not call a model female merely because its pitch was increased.
- Do not claim Sanskrit or Vedic correctness without suitable model/linguistic and acoustic verification.
- A Vedic mode must preserve source accent marks. Missing accent marks must not be guessed and declared authentic.
- Include audio timing/alignment metadata only when the alignment operation actually produced it.

### 8.3 Part 3 — Music Learning and Analysis

Part 3 accepts a permitted local media reference or a permitted official YouTube embed reference for guided viewing.

Conceptual analysis input:

```json
{
  "mediaRef": "local-media-id",
  "analysisTypes": [
    "waveform",
    "pitch",
    "tempo",
    "rhythm"
  ],
  "consent": {
    "localProcessing": true
  }
}
```

Possible result categories:

- Signal measurements and derived audio features.
- Pitch/tempo/rhythm estimates with confidence/limitations.
- Human-authored learning notes.
- Rule-based adaptation profiles.
- Model inference outputs.
- Actual model-training/fine-tuning outputs, only where a real training pipeline exists.

These result categories must not be conflated.

YouTube contract boundaries:

- Use the official embedded player and permitted playback/metadata features.
- Do not scrape, download or extract protected audio from YouTube.
- The embed does not guarantee access to underlying audio samples.
- For detailed signal analysis, require a user-provided local file that the browser can access lawfully.

### 8.4 Part 4 — Avatar, Lip-Sync and Video

The Avatar Engine accepts a local photo reference and display configuration. The photo binary remains in local storage and is not added to a public repository.

Conceptual avatar reference:

```json
{
  "avatarId": "local-avatar-id",
  "photoStorageRef": "indexeddb-avatar-reference",
  "aspectRatio": "9:16",
  "objectFit": "cover"
}
```

Actual lip-sync requires a real timing source. The preferred input is a timing/alignment track produced from the generated audio and text.

Conceptual alignment item:

```json
{
  "startMs": 840,
  "endMs": 1040,
  "phoneme": "a",
  "viseme": "open",
  "confidence": 0.92
}
```

The values are examples only. A production system must use a documented phoneme/viseme inventory and timings produced by a tested aligner or synthesis model. Do not invent timestamps from text character positions.

Video workflow input should reference audio, avatar, captions and timing tracks; it should not duplicate their binary data unnecessarily.

A successful render must report the actual container/codec/MIME type and device compatibility. Do not promise MP4 when the browser only produced WebM or another format. MP4 output is PASS only after the generated file is verified as a playable MP4 on the target device.

## 9. Storage and resource-reference contracts

Engines must use the shared Storage service or an approved adapter. They must not independently create competing IndexedDB databases for the same application data.

### 9.1 Current storage baseline

The audited application database is:

- Name: `swar-sadhika-local`
- Version: `3`
- Stores: `texts`, `mediaNotes`, `learningNotes`, `avatarPhotos`

Do not assume that this schema is already version 4 or that a future store exists.

### 9.2 Proposed data domains

| Domain | Data | Storage guidance |
|---|---|---|
| Text | Source text, title, language mode, timestamps | IndexedDB |
| Notes | Media/learning notes and metadata | IndexedDB |
| Settings | User preferences and UI settings | IndexedDB, after migration |
| Avatar | Personal photo Blob and safe metadata | Dedicated local IndexedDB store |
| Media | User-selected media reference and optional user-approved local persistence | IndexedDB metadata plus suitable local binary storage |
| Audio output | Generated audio asset and metadata | Suitable local binary storage; reference in records |
| Learning profile | Derived feature profiles, provenance and model/version metadata | IndexedDB; large artifacts separately |
| Timed tracks | Phoneme/viseme/caption timing records | IndexedDB or associated structured asset |
| Video output | Rendered output reference and verified format metadata | Local file/download flow; do not upload by default |

### 9.3 Resource reference

A reference must identify where an asset is stored without copying the Blob through every Engine:

```json
{
  "refId": "unique-local-reference",
  "kind": "audio",
  "storage": "indexeddb-or-opfs",
  "store": "audioAssets",
  "key": "asset-key",
  "mimeType": "audio/wav",
  "sizeBytes": 123456,
  "createdAt": "2026-11-04T00:00:00.000Z"
}
```

This is a proposed shape, not a claim that an `audioAssets` store currently exists.

Rules:

- Validate asset type, size, ownership and availability when resolving a reference.
- Avoid unnecessary Blob copies and base64 encoding.
- Revoke temporary Object URLs when no longer needed.
- Do not put personal photos, private recordings, generated audio or video into the public Git repository.
- Do not cache private media in the Service Worker App Shell.
- Check quota before storing large assets and handle quota errors explicitly.

## 10. Worker message contract

A Worker used for heavy work must receive serializable messages and return serializable results or explicitly transferred buffers.

Request:

```javascript
{
  schemaVersion: 1,
  requestId: "unique-request-id",
  jobId: "unique-job-id",
  type: "PROCESS",
  payload: {}
}
```

Response:

```javascript
{
  schemaVersion: 1,
  requestId: "same-request-id",
  jobId: "same-job-id",
  type: "RESULT",
  payload: {}
}
```

Supported message types should include `INIT`, `PROCESS`, `CANCEL`, `DISPOSE`, `PROGRESS`, `RESULT` and `ERROR` as appropriate.

Requirements:

- Validate message schema and request/job IDs.
- Handle worker errors and termination.
- Support cancellation where the processing technology permits it.
- Do not send DOM nodes or functions through the message channel.
- Transfer large ArrayBuffers where safe instead of duplicating them.
- Keep the UI responsive and report progress accurately.
- Do not create a Worker until a real heavy task requires one and the selected runtime works in target Android Chrome.

## 11. Error contract

Use structured errors internally:

```json
{
  "code": "MODEL_UNAVAILABLE",
  "message": "A required local model is unavailable.",
  "engineId": "female-voice",
  "jobId": "unique-job-id",
  "recoverable": true,
  "details": null,
  "timestamp": "2026-11-04T00:00:00.000Z"
}
```

Error codes should be stable and actionable. Examples:

- `UNSUPPORTED_API`
- `PERMISSION_DENIED`
- `STORAGE_UNAVAILABLE`
- `STORAGE_QUOTA_EXCEEDED`
- `INVALID_INPUT`
- `MODEL_UNAVAILABLE`
- `MODEL_INTEGRITY_FAILED`
- `MODEL_LICENSE_UNVERIFIED`
- `INFERENCE_FAILED`
- `MEDIA_DECODE_FAILED`
- `WORKER_FAILED`
- `CANCELLED`
- `EXPORT_FORMAT_UNSUPPORTED`

Do not expose secrets, raw private media, or sensitive local paths in user-facing errors. Preserve enough diagnostic context for tests and a user-approved diagnostic report.

## 12. Progress reporting and evidence

Progress records describe development verification. Runtime status describes the current device/session.

A development capability may reach PASS only when:

- The stated acceptance test ran in a named environment.
- The result and timestamp are recorded.
- Reviewable evidence is present.
- Required target-device tests have been completed where the criterion requires a device.

Examples of evidence include test logs, run IDs, commit SHA, reproducible steps, reviewed output file metadata and device/OS/Chrome versions.

Do not assign estimated percentages to unimplemented capabilities. Do not let README wording, a placeholder screen or a successful deploy change a development status by itself.

## 13. Security, privacy, licensing and offline policy

### 13.1 Privacy

- Personal Photo Avatar remains local unless an explicitly approved private storage feature is separately designed.
- No personal photo or private media is committed to the public repository.
- No media is uploaded for learning without clear user action and consent.
- No hidden telemetry or remote processing endpoint is introduced.
- JSON backups must explain what they contain and exclude private binary assets by default.

### 13.2 Model and dependency governance

Before accepting a model/runtime, record:

- Source URL and maintainer.
- Exact model/runtime version and checksum.
- License and intended-use permissions.
- Supported language(s) and relevant evidence.
- Model size and memory estimate.
- Android Chrome runtime compatibility.
- Offline behavior after first download.
- Security/CORS/integrity implications.
- Sample output evaluation and known limitations.

A library or model name alone is not acceptance evidence. Do not commit large weights to the public repository unless the license, size and maintenance case have been reviewed and explicitly approved.

### 13.3 Offline

- The service worker caches only the application shell and approved public resources.
- Large model assets use a deliberate local storage/download policy.
- A cached UI does not prove local model inference.
- Each Engine must separately declare whether its operation is available offline and test it with the network disabled.
- A failure to download a model must not be reported as a successful offline fallback unless a real fallback completed.

## 14. Compatibility and contract versioning

- Every new shared payload includes `schemaVersion`.
- Every Engine publishes `contractVersion`.
- Breaking changes require an explicit version decision, migration/adapter, and integration tests.
- Preserve the existing `swar-sadhika:load-text` string event until a tested compatibility adapter is in place.
- Do not rename shared Storage stores or methods without migration and consumer audit.
- Do not change a shared event's semantics while retaining its old name.
- Keep contracts documented in this file and update tests in the same integration change.

## 15. Required tests for every Engine

| Test category | Minimum requirement |
|---|---|
| Unit | Input validation, core transformation and error behavior |
| Lifecycle | Init, repeated init, status, stop and dispose |
| Integration | Public contract and real data flow with its consumer |
| Regression | Existing capability and stored user data remain intact |
| Worker | Message validation, error, cancellation and result correlation, if a Worker is used |
| Storage | Reference resolution, persistence, migration and quota/error paths where applicable |
| Offline | Actual operation with network disabled, only when offline support is claimed |
| Device | Actual Android Chrome execution for hardware/browser-dependent acceptance |

An Engine must not be integrated into the four-Index UI as READY until its own readiness check passes.

## 16. Part completion gates

- **Part 1:** Four-Index navigation, shared services, Text Studio, Library, backup/restore, PWA/offline shell and Android Chrome foundation tests.
- **Part 2:** A real suitable Neural Voice model/runtime, local inference, usable audio output, Sanskrit/Hindi evaluation, and clearly separated speech versus singing behavior.
- **Part 3:** Real local media analysis, measurable feature outputs, provenance, local persistence and verified data flow into the intended consumer.
- **Part 4:** User-selected local photo, real audio/text timing alignment, tested viseme mapping, synchronized captions and a verified export format.

All four Parts must use these contracts and pass cross-part integration tests. A completed UI alone does not complete a Part.

---
