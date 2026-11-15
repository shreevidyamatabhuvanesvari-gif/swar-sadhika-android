/* Swar-Sadhika Nano Brain — Memory Engine Part 2.
 * Capability-gated, user-approved, append-only local memory records.
 *
 * Storage is accessed only through the Central Core's Integration Memory
 * facade. The engine never opens IndexedDB directly, never calls the network,
 * never stores executable code, and never silently deletes prior memories.
 */

import { assertSafeBrainIdPart2, cloneSafeJsonPart2 } from "./brain-security-part2.js";

export const BRAIN_MEMORY_VERSION_PART2 = "1.0.0";

const READER_MODULE_ID = "memory.reader";
const WRITER_MODULE_ID = "memory.writer";
const MAINTAINER_MODULE_ID = "memory.maintainer";
const MAX_RECORDS = 500;
const MAX_RESULT_ITEMS = 100;
const MAX_CONTENT_CHARS = 32768;
const MAX_TITLE_CHARS = 160;
const MAX_TAGS = 24;
const MAX_TAG_CHARS = 40;
const APPROVAL_TTL_MS = 60000;
const CATEGORIES = new Set([
  "preference", "fact", "episode", "procedure", "knowledge", "task"
]);
const PRIVACY_LEVELS = new Set(["private", "app"]);
const SECRET_KEY_PATTERN = /(?:password|passwd|passphrase|secret|access.?token|refresh.?token|api.?key|private.?key|credential)/i;

export class BrainMemoryErrorPart2 extends Error {
  constructor(message, code = "BRAIN_MEMORY_ERROR", details = null, cause = null) {
    super(message);
    this.name = "BrainMemoryErrorPart2";
    this.code = code;
    if (details) this.details = details;
    if (cause) this.cause = cause;
  }
}

function fail(message, code, details = null, cause = null) {
  throw new BrainMemoryErrorPart2(message, code, details, cause);
}

function freezeSafe(value) {
  const safe = cloneSafeJsonPart2(value);
  const visit = item => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return item;
    Object.keys(item).forEach(key => visit(item[key]));
    return Object.freeze(item);
  };
  return visit(safe);
}

function makeId(prefix, host, sequence) {
  const now = host && host.Date && typeof host.Date.now === "function"
    ? host.Date.now()
    : Date.now();
  const random = host && host.crypto && typeof host.crypto.randomUUID === "function"
    ? host.crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2, 14);
  return prefix + "-" + Number(now).toString(36) + "-" + sequence.toString(36) + "-" + random;
}

function assertNoSecretFields(value, pathName = "content", depth = 0) {
  if (depth > 20) fail("Memory Content की nesting सीमा पार हुई।", "CONTENT_DEPTH_LIMIT");
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      fail("संवेदनशील credential-जैसी property Memory में स्वीकार्य नहीं है: " + pathName + "." + key,
        "SECRET_FIELD_REJECTED");
    }
    assertNoSecretFields(value[key], pathName + "." + key, depth + 1);
  }
}

function normalizeTags(tags) {
  if (tags === undefined) return Object.freeze([]);
  if (!Array.isArray(tags) || tags.length > MAX_TAGS) {
    fail("Tags की सूची 0 से 24 items के बीच होनी चाहिए।", "INVALID_TAGS");
  }
  const result = [];
  const seen = new Set();
  for (const raw of tags) {
    if (typeof raw !== "string") fail("प्रत्येक Tag पाठ होना चाहिए।", "INVALID_TAG");
    const tag = raw.trim().toLocaleLowerCase();
    if (!tag || tag.length > MAX_TAG_CHARS) fail("Tag खाली या 40 वर्णों से बड़ा है।", "INVALID_TAG");
    if (!seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return Object.freeze(result);
}

function normalizeContent(content) {
  if (content === undefined || content === null) {
    fail("Memory Content आवश्यक है।", "MEMORY_CONTENT_REQUIRED");
  }
  const safe = cloneSafeJsonPart2(content);
  if (typeof safe !== "string" && (typeof safe !== "object" || Array.isArray(safe))) {
    fail("Memory Content पाठ या साधारण JSON Object होना चाहिए।", "INVALID_MEMORY_CONTENT");
  }
  assertNoSecretFields(safe);
  if (JSON.stringify(safe).length > MAX_CONTENT_CHARS) {
    fail("Memory Content 32 KiB की सीमा से बड़ा है।", "MEMORY_CONTENT_TOO_LARGE");
  }
  return safe;
}

function normalizeMemoryInput(input, base = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("Memory Input साधारण Object होना चाहिए।", "INVALID_MEMORY_INPUT");
  }
  const safeInput = cloneSafeJsonPart2(input);
  if (!safeInput || typeof safeInput !== "object" || Array.isArray(safeInput)) {
    fail("Memory Input साधारण JSON Object होना चाहिए।", "INVALID_MEMORY_INPUT");
  }
  const allowed = new Set(["category", "title", "content", "tags", "source", "confidence", "importance", "privacy"]);
  if (Object.keys(safeInput).some(key => !allowed.has(key))) {
    fail("Memory Input में अज्ञात property मिली।", "UNKNOWN_MEMORY_PROPERTY");
  }

  const merged = { ...(base || {}), ...safeInput };
  const category = merged.category;
  if (typeof category !== "string" || !CATEGORIES.has(category)) {
    fail("Memory Category स्वीकृत सूची में होनी चाहिए।", "INVALID_MEMORY_CATEGORY");
  }
  if (typeof merged.title !== "string" || !merged.title.trim() || merged.title.trim().length > MAX_TITLE_CHARS) {
    fail("Memory Title 1 से 160 वर्णों का होना चाहिए।", "INVALID_MEMORY_TITLE");
  }
  const content = normalizeContent(merged.content);
  const tags = normalizeTags(merged.tags);
  const source = merged.source === undefined ? "" : merged.source;
  if (typeof source !== "string" || source.length > 512) {
    fail("Memory Source का आकार 512 वर्णों से अधिक नहीं होना चाहिए।", "INVALID_MEMORY_SOURCE");
  }
  const confidence = merged.confidence === undefined ? 0.5 : merged.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    fail("Confidence का मान 0 से 1 के बीच होना चाहिए।", "INVALID_MEMORY_CONFIDENCE");
  }
  const importance = merged.importance === undefined ? 3 : merged.importance;
  if (!Number.isInteger(importance) || importance < 1 || importance > 5) {
    fail("Importance का मान 1 से 5 के बीच पूर्णांक होना चाहिए।", "INVALID_MEMORY_IMPORTANCE");
  }
  const privacy = merged.privacy === undefined ? "private" : merged.privacy;
  if (!PRIVACY_LEVELS.has(privacy)) {
    fail("Privacy केवल private या app हो सकती है।", "INVALID_MEMORY_PRIVACY");
  }

  return {
    category,
    title: merged.title.trim(),
    content,
    tags,
    source: source.trim(),
    confidence,
    importance,
    privacy
  };
}

function normalizeQuery(query) {
  if (typeof query !== "string" || !query.trim() || query.trim().length > 200) {
    fail("Search Query 1 से 200 वर्णों का होना चाहिए।", "INVALID_SEARCH_QUERY");
  }
  return query.trim().toLocaleLowerCase();
}

function scoreRecord(record, query, tokens) {
  const title = record.title.toLocaleLowerCase();
  const searchable = [
    title,
    typeof record.content === "string" ? record.content : JSON.stringify(record.content),
    ...(record.tags || [])
  ].join(" ").toLocaleLowerCase();
  let score = 0;
  if (title === query) score += 20;
  else if (title.includes(query)) score += 10;
  if (searchable.includes(query)) score += 5;
  for (const token of tokens) {
    if (title.includes(token)) score += 3;
    else if (searchable.includes(token)) score += 1;
  }
  return score;
}

function activeVersions(records) {
  const superseded = new Set(
    records.map(record => record && record.supersedes).filter(value => typeof value === "string")
  );
  return records.filter(record =>
    record && record.status === "active" && !superseded.has(record.id)
  );
}

export function createBrainMemoryEnginePart2(options = {}) {
  const core = options.core;
  const host = options.host || globalThis;
  if (!core || typeof core.getStatus !== "function" ||
      typeof core.registerModule !== "function" ||
      typeof core.unregisterModule !== "function" ||
      typeof core.runTask !== "function" ||
      typeof core.requestCapabilities !== "function") {
    fail("Memory Engine को वास्तविक Central Brain Core आवश्यक है।", "CORE_CONTRACT_REQUIRED");
  }

  const EventConstructor = host && typeof host.Event === "function"
    ? host.Event
    : (typeof Event === "function" ? Event : null);
  let state = "new";
  let initializePromise = null;
  let disposePromise = null;
  let sequence = 0;
  const approvals = new Map();
  const activeTasks = new Map();
  let readerRegistered = false;
  let writerRegistered = false;
  let maintainerRegistered = false;

  function assertReady() {
    if (state === "disposed" || state === "disposing") {
      fail("Memory Engine बंद हो चुका है।", "MEMORY_ENGINE_DISPOSED");
    }
    if (state !== "ready") fail("Memory Engine अभी Initialize नहीं हुआ है।", "MEMORY_ENGINE_NOT_READY");
    const coreState = core.getStatus();
    if (!coreState || coreState.state !== "ready") {
      fail("Central Brain Core Ready स्थिति में नहीं है।", "CORE_NOT_READY");
    }
  }

  function issueWriteApproval(event) {
    assertReady();
    if (!EventConstructor || !(event instanceof EventConstructor) ||
        event.isTrusted !== true ||
        !["click", "pointerup", "keydown"].includes(event.type)) {
      fail("Memory Write के लिए वास्तविक User Gesture आवश्यक है।", "USER_GESTURE_REQUIRED");
    }
    const now = Date.now();
    for (const [approvalId, createdAt] of approvals) {
      if (now - createdAt > APPROVAL_TTL_MS) approvals.delete(approvalId);
    }
    if (approvals.size >= 16) {
      fail("एक समय में अधिकतम 16 अप्रयुक्त Memory Write Approvals रखे जा सकते हैं।",
        "WRITE_APPROVAL_LIMIT");
    }
    const id = makeId("memory-approval", host, ++sequence);
    approvals.set(id, now);
    return Object.freeze({ id, purpose: "single-memory-write", expiresInMs: APPROVAL_TTL_MS });
  }

  function consumeWriteApproval(approvalId) {
    if (typeof approvalId !== "string") {
      fail("Memory Write से पहले अलग User Approval आवश्यक है।", "WRITE_APPROVAL_REQUIRED");
    }
    const createdAt = approvals.get(approvalId);
    approvals.delete(approvalId);
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > APPROVAL_TTL_MS) {
      fail("Memory Write Approval अनुपस्थित, पहले उपयोग किया हुआ या Expired है।", "WRITE_APPROVAL_INVALID");
    }
  }

  async function run(moduleId, operation, input = {}) {
    assertReady();
    const taskId = makeId("memory-task", host, ++sequence);
    const promise = core.runTask(moduleId, { operation, ...input }, { id: taskId });
    activeTasks.set(taskId, promise);
    try {
      const result = await promise;
      return result.output;
    } finally {
      activeTasks.delete(taskId);
    }
  }

  async function readOperation(operation, input = {}) {
    return run(READER_MODULE_ID, operation, input);
  }

  async function writeOperation(operation, input, approval, moduleId = WRITER_MODULE_ID) {
    if (!approval || typeof approval.id !== "string") {
      fail("Memory Write के लिए issueWriteApproval() का ताज़ा Token आवश्यक है।", "WRITE_APPROVAL_REQUIRED");
    }
    return run(moduleId, operation, {
      ...input,
      approvalId: approval.id
    });
  }

  function registerModules() {
    core.registerModule({
      id: READER_MODULE_ID,
      title: "Local Memory Reader",
      version: BRAIN_MEMORY_VERSION_PART2,
      risk: "medium",
      capabilities: ["memory.read"],
      execute: async ({ memory, input, signal }) => {
        if (signal.aborted) fail("Memory Read Task रद्द किया गया।", "TASK_ABORTED");
        if (!memory) fail("Core ने Capability-checked Memory Facade नहीं दिया।", "MEMORY_FACADE_REQUIRED");

        if (input.operation === "get") {
          const record = await memory.getRecord(input.recordId);
          return record || null;
        }
        if (input.operation === "list" || input.operation === "search" || input.operation === "history") {
          const records = await memory.listRecords({ limit: MAX_RECORDS });
          if (input.operation === "history") {
            return records
              .filter(record => record.logicalId === input.logicalId)
              .sort((a, b) => b.version - a.version);
          }
          if (input.operation === "list") {
            const current = activeVersions(records)
              .sort((a, b) => b.updatedAt - a.updatedAt);
            return {
              records: current.slice(0, input.limit || MAX_RESULT_ITEMS),
              truncated: records.length >= MAX_RECORDS
            };
          }
          const query = normalizeQuery(input.query);
          const tokens = [...new Set(query.split(/\s+/).filter(Boolean))];
          const current = activeVersions(records);
          const results = current
            .map(record => ({ record, score: scoreRecord(record, query, tokens) }))
            .filter(item => item.score > 0)
            .sort((a, b) =>
              b.score - a.score ||
              b.record.importance - a.record.importance ||
              b.record.updatedAt - a.record.updatedAt
            )
            .slice(0, input.limit || MAX_RESULT_ITEMS)
            .map(item => ({ record: item.record, score: item.score }));
          return { results, truncated: records.length >= MAX_RECORDS };
        }
        if (input.operation === "export") {
          return memory.exportBackup();
        }
        fail("अज्ञात Memory Read Operation है।", "UNKNOWN_MEMORY_OPERATION");
      }
    });
    readerRegistered = true;

    core.registerModule({
      id: WRITER_MODULE_ID,
      title: "User-Approved Local Memory Writer",
      version: BRAIN_MEMORY_VERSION_PART2,
      risk: "high",
      capabilities: ["memory.write"],
      execute: async ({ memory, input, signal }) => {
        if (signal.aborted) fail("Memory Write Task रद्द किया गया।", "TASK_ABORTED");
        if (!memory) fail("Core ने Capability-checked Memory Facade नहीं दिया।", "MEMORY_FACADE_REQUIRED");
        consumeWriteApproval(input.approvalId);

        if (input.operation === "remember") {
          const normalized = normalizeMemoryInput(input.record);
          const now = Date.now();
          const id = makeId("memory", host, ++sequence);
          const record = {
            id,
            logicalId: id,
            ...normalized,
            status: "active",
            version: 1,
            supersedes: null,
            createdAt: now,
            updatedAt: now,
            provenance: "user-approved-local-entry"
          };
          await memory.putRecord(record);
          return record;
        }

        fail("Memory Writer में केवल नया Memory Record जोड़ने की अनुमति है।", "UNKNOWN_MEMORY_OPERATION");
      }
    });
    writerRegistered = true;

    core.registerModule({
      id: MAINTAINER_MODULE_ID,
      title: "User-Approved Versioned Memory Maintainer",
      version: BRAIN_MEMORY_VERSION_PART2,
      risk: "high",
      capabilities: ["memory.read", "memory.write"],
      execute: async ({ memory, input, signal }) => {
        if (signal.aborted) fail("Memory Maintenance Task रद्द किया गया।", "TASK_ABORTED");
        if (!memory) fail("Core ने Capability-checked Memory Facade नहीं दिया।", "MEMORY_FACADE_REQUIRED");
        consumeWriteApproval(input.approvalId);
        if (input.operation !== "revise" && input.operation !== "archive") {
          fail("अज्ञात Memory Maintenance Operation है।", "UNKNOWN_MEMORY_OPERATION");
        }

        const previous = await memory.getRecord(input.recordId);
        if (!previous) fail("संशोधित करने योग्य Memory Record नहीं मिला।", "MEMORY_RECORD_NOT_FOUND");
        if (previous.status !== "active") fail("केवल सक्रिय Memory Record का नया संस्करण बनाया जा सकता है।", "MEMORY_RECORD_NOT_ACTIVE");

        const all = await memory.listRecords({ limit: MAX_RECORDS });
        if (all.some(record => record.supersedes === previous.id)) {
          fail("यह Memory Record पहले ही supersede हो चुका है।", "STALE_MEMORY_VERSION");
        }

        const normalized = input.operation === "archive"
          ? {
              category: previous.category,
              title: previous.title,
              content: previous.content,
              tags: previous.tags,
              source: previous.source,
              confidence: previous.confidence,
              importance: previous.importance,
              privacy: previous.privacy
            }
          : normalizeMemoryInput(input.patch, previous);

        const now = Date.now();
        const next = {
          id: makeId("memory", host, ++sequence),
          logicalId: previous.logicalId,
          ...normalized,
          status: input.operation === "archive" ? "archived" : "active",
          version: previous.version + 1,
          supersedes: previous.id,
          createdAt: previous.createdAt,
          updatedAt: now,
          provenance: input.operation === "archive"
            ? "user-approved-archive"
            : "user-approved-revision"
        };
        await memory.putRecord(next);
        return next;
      }
    });
    maintainerRegistered = true;
  }

  async function initialize() {
    if (state === "disposed" || state === "disposing") {
      fail("Memory Engine बंद हो चुका है।", "MEMORY_ENGINE_DISPOSED");
    }
    if (state === "ready") return diagnostics();
    if (initializePromise) return initializePromise;
    state = "initializing";
    initializePromise = (async () => {
      try {
        const coreStatus = core.getStatus();
        if (!coreStatus || coreStatus.state !== "ready") {
          fail("पहले Central Brain Core Initialize होना आवश्यक है।", "CORE_NOT_READY");
        }
        registerModules();
        state = "ready";
        return diagnostics();
      } catch (error) {
        if (maintainerRegistered) {
          try { core.unregisterModule(MAINTAINER_MODULE_ID); } catch (_) {}
          maintainerRegistered = false;
        }
        if (writerRegistered) {
          try { core.unregisterModule(WRITER_MODULE_ID); } catch (_) {}
          writerRegistered = false;
        }
        if (readerRegistered) {
          try { core.unregisterModule(READER_MODULE_ID); } catch (_) {}
          readerRegistered = false;
        }
        state = "failed";
        initializePromise = null;
        if (error instanceof BrainMemoryErrorPart2) throw error;
        throw new BrainMemoryErrorPart2("Memory Engine Registration विफल हुआ।",
          "MEMORY_ENGINE_INIT_FAILED", null, error);
      }
    })();
    return initializePromise;
  }

  function requestPermissions(event, options = {}) {
    assertReady();
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      fail("Permission विकल्प साधारण Object होने चाहिए।", "INVALID_PERMISSION_OPTIONS");
    }
    const safeOptions = cloneSafeJsonPart2(options);
    if (Object.keys(safeOptions).some(key => key !== "read" && key !== "write") ||
        (safeOptions.read !== undefined && typeof safeOptions.read !== "boolean") ||
        (safeOptions.write !== undefined && typeof safeOptions.write !== "boolean")) {
      fail("Permission विकल्पों में केवल boolean read/write स्वीकार्य हैं।", "INVALID_PERMISSION_OPTIONS");
    }
    const requested = [];
    if (safeOptions.read !== false) requested.push("memory.read");
    if (safeOptions.write === true) requested.push("memory.write");
    if (!requested.length) fail("कम-से-कम एक Memory Permission चुनना आवश्यक है।", "EMPTY_PERMISSION_REQUEST");
    return core.requestCapabilities(requested, event);
  }

  async function remember(input, approval) {
    return writeOperation("remember", { record: input }, approval);
  }

  async function revise(recordId, patch, approval) {
    assertSafeBrainIdPart2(recordId, "Memory Record ID");
    return writeOperation("revise", { recordId, patch }, approval, MAINTAINER_MODULE_ID);
  }

  async function archive(recordId, approval) {
    assertSafeBrainIdPart2(recordId, "Memory Record ID");
    return writeOperation("archive", { recordId }, approval, MAINTAINER_MODULE_ID);
  }

  async function get(recordId) {
    assertSafeBrainIdPart2(recordId, "Memory Record ID");
    return readOperation("get", { recordId });
  }

  async function list(options = {}) {
    if (!options || typeof options !== "object" || Array.isArray(options) ||
        Object.keys(cloneSafeJsonPart2(options)).some(key => key !== "limit")) {
      fail("Memory List विकल्पों में केवल limit स्वीकार्य है।", "INVALID_MEMORY_OPTIONS");
    }
    const safeOptions = cloneSafeJsonPart2(options);
    const limit = safeOptions.limit === undefined ? MAX_RESULT_ITEMS : safeOptions.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULT_ITEMS) {
      fail("Memory List limit 1 से 100 के बीच होना चाहिए।", "INVALID_MEMORY_LIMIT");
    }
    return readOperation("list", { limit });
  }

  async function search(query, options = {}) {
    const normalized = normalizeQuery(query);
    if (!options || typeof options !== "object" || Array.isArray(options) ||
        Object.keys(cloneSafeJsonPart2(options)).some(key => key !== "limit")) {
      fail("Memory Search विकल्पों में केवल limit स्वीकार्य है।", "INVALID_MEMORY_OPTIONS");
    }
    const safeOptions = cloneSafeJsonPart2(options);
    const limit = safeOptions.limit === undefined ? MAX_RESULT_ITEMS : safeOptions.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULT_ITEMS) {
      fail("Memory Search limit 1 से 100 के बीच होना चाहिए।", "INVALID_MEMORY_LIMIT");
    }
    return readOperation("search", { query: normalized, limit });
  }

  async function history(logicalId) {
    assertSafeBrainIdPart2(logicalId, "Memory Logical ID");
    return readOperation("history", { logicalId });
  }

  async function exportBackup() {
    return readOperation("export");
  }

  async function cancelActiveTasks(reason = "memory-engine-paused") {
    assertReady();
    const pending = [...activeTasks.entries()];
    for (const [taskId] of pending) {
      try { core.cancelTask(taskId, reason); } catch (_) {}
    }
    if (pending.length) await Promise.allSettled(pending.map(([, promise]) => promise));
    return pending.length;
  }

  function diagnostics() {
    const coreStatus = core.getStatus();
    return Object.freeze({
      version: BRAIN_MEMORY_VERSION_PART2,
      state,
      initialized: state === "ready",
      storage: "through-core-integration-facade",
      accessControl: "core-capability-gated",
      writeApproval: "trusted-user-gesture-one-time-token",
      approvalTtlMs: APPROVAL_TTL_MS,
      recordModel: "append-only-versioned",
      hardDelete: "not-exposed",
      maxSearchWindow: MAX_RECORDS,
      maxResultItems: MAX_RESULT_ITEMS,
      registeredModules: Object.freeze({
        reader: readerRegistered,
        writer: writerRegistered,
        maintainer: maintainerRegistered
      }),
      activeTaskCount: activeTasks.size,
      coreState: coreStatus.state
    });
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    if (state === "disposed") return Promise.resolve(false);
    state = "disposing";
    disposePromise = (async () => {
      approvals.clear();
      const pending = [...activeTasks.entries()];
      for (const [taskId] of pending) {
        try { core.cancelTask(taskId, "memory-engine-disposed"); } catch (_) {}
      }
      if (pending.length) {
        await Promise.allSettled(pending.map(([, promise]) => promise));
      }
      if (maintainerRegistered) {
        core.unregisterModule(MAINTAINER_MODULE_ID);
        maintainerRegistered = false;
      }
      if (writerRegistered) {
        core.unregisterModule(WRITER_MODULE_ID);
        writerRegistered = false;
      }
      if (readerRegistered) {
        core.unregisterModule(READER_MODULE_ID);
        readerRegistered = false;
      }
      state = "disposed";
      return true;
    })();
    return disposePromise;
  }

  return Object.freeze({
    version: BRAIN_MEMORY_VERSION_PART2,
    initialize,
    requestPermissions,
    issueWriteApproval,
    remember,
    revise,
    archive,
    get,
    list,
    search,
    history,
    exportBackup,
    cancelActiveTasks,
    diagnostics,
    dispose
  });
}

function createMemoryEngineTestCore() {
  const modules = new Map();
  const records = new Map();
  const grants = new Set();
  let state = "ready";
  return {
    getStatus() { return { state }; },
    registerModule(descriptor) {
      if (modules.has(descriptor.id)) fail("duplicate test module", "DUPLICATE_MODULE");
      modules.set(descriptor.id, descriptor);
      return { id: descriptor.id };
    },
    unregisterModule(id) { return modules.delete(id); },
    requestCapabilities(capabilities) {
      capabilities.forEach(capability => grants.add(capability));
      return capabilities.slice();
    },
    async runTask(moduleId, input, taskOptions) {
      const module = modules.get(moduleId);
      if (!module) fail("module missing", "MODULE_NOT_REGISTERED");
      const missing = module.capabilities.filter(capability => !grants.has(capability));
      if (missing.length) fail("capability required", "CAPABILITY_REQUIRED", { missingCapabilities: missing });
      const memory = {
        async getRecord(id) { return records.has(id) ? freezeSafe(records.get(id)) : null; },
        async listRecords() { return [...records.values()].map(freezeSafe); },
        async putRecord(record) { records.set(record.id, cloneSafeJsonPart2(record)); return true; },
        async exportBackup() {
          return freezeSafe({
            format: "test-backup",
            records: [...records.values()]
          });
        }
      };
      const controller = new AbortController();
      const result = await module.execute({
        taskId: taskOptions.id,
        module,
        input: freezeSafe(input),
        signal: controller.signal,
        memory
      });
      return { taskId: taskOptions.id, status: "completed", output: freezeSafe(result) };
    },
    cancelTask() { return false; },
    get records() { return records; },
    get modules() { return modules; }
  };
}

class MemoryTestEventPart2 {
  constructor(type) {
    this.type = type;
    this.isTrusted = true;
  }
}

export async function selfTest() {
  const checks = [];
  const check = (id, passed, message = "") => checks.push({
    id, passed: Boolean(passed), ...(message ? { message } : {})
  });

  const fakeCore = createMemoryEngineTestCore();
  const host = {
    Event: MemoryTestEventPart2,
    Date,
    Math,
    crypto: { randomUUID: () => "01234567-89ab-cdef-0123-456789abcdef" }
  };
  const engine = createBrainMemoryEnginePart2({ core: fakeCore, host });

  try {
    let prematureRejected = false;
    const notReadyCore = { ...fakeCore, getStatus: () => ({ state: "new" }) };
    try {
      const early = createBrainMemoryEnginePart2({ core: notReadyCore, host });
      await early.initialize();
    } catch (error) { prematureRejected = error.code === "CORE_NOT_READY"; }
    check("requires-central-core-ready-before-registration", prematureRejected);

    await engine.initialize();
    check("registers-reader-and-writer-through-core",
      engine.diagnostics().registeredModules.reader &&
      engine.diagnostics().registeredModules.writer &&
      engine.diagnostics().registeredModules.maintainer);

    let writePermissionDenied = false;
    try {
      const token = engine.issueWriteApproval(new MemoryTestEventPart2("click"));
      await engine.remember({
        category: "preference",
        title: "Test",
        content: "Denied until permission"
      }, token);
    } catch (error) { writePermissionDenied = error.code === "CAPABILITY_REQUIRED"; }
    check("memory-write-requires-core-capability", writePermissionDenied);

    let fakeGestureRejected = false;
    try { engine.issueWriteApproval({ type: "click", isTrusted: true }); }
    catch (error) { fakeGestureRejected = error.code === "USER_GESTURE_REQUIRED"; }
    check("forged-write-gesture-rejected", fakeGestureRejected);

    engine.requestPermissions(new MemoryTestEventPart2("click"), { read: true, write: true });
    const approval = engine.issueWriteApproval(new MemoryTestEventPart2("click"));
    const first = await engine.remember({
      category: "preference",
      title: "Sanskrit pronunciation preference",
      content: { language: "Sanskrit", preference: "clear and measured" },
      tags: ["Sanskrit", "Pronunciation"],
      source: "User-confirmed entry",
      confidence: 1,
      importance: 5
    }, approval);
    check("user-approved-memory-write-persists-version-one",
      first.version === 1 && first.status === "active" && first.provenance === "user-approved-local-entry");

    let approvalReuseRejected = false;
    try {
      await engine.remember({
        category: "fact",
        title: "Second write",
        content: "Approval must be single-use"
      }, approval);
    } catch (error) { approvalReuseRejected = error.code === "WRITE_APPROVAL_INVALID"; }
    check("write-approval-is-single-use", approvalReuseRejected);

    const fetched = await engine.get(first.id);
    check("memory-read-uses-reader-module", fetched && fetched.id === first.id);

    const found = await engine.search("Sanskrit pronunciation");
    check("bounded-ranked-search-finds-record",
      found.results.length === 1 && found.results[0].record.id === first.id && found.results[0].score > 0);

    const revised = await engine.revise(first.id, {
      title: "Sanskrit pronunciation preference updated",
      content: { language: "Sanskrit", preference: "clear, measured and natural" }
    }, engine.issueWriteApproval(new MemoryTestEventPart2("click")));
    check("revision-creates-new-version-without-overwriting-history",
      revised.version === 2 && revised.supersedes === first.id &&
      fakeCore.records.has(first.id) && fakeCore.records.has(revised.id));

    const history = await engine.history(first.logicalId);
    check("history-retains-both-versions",
      history.length === 2 && history[0].version === 2 && history[1].version === 1);

    const current = await engine.list();
    check("list-returns-only-current-active-version",
      current.records.length === 1 && current.records[0].id === revised.id);

    let staleRevisionRejected = false;
    try {
      await engine.revise(first.id, {
        title: "Stale update",
        content: "Should be rejected"
      }, engine.issueWriteApproval(new MemoryTestEventPart2("click")));
    } catch (error) { staleRevisionRejected = error.code === "STALE_MEMORY_VERSION"; }
    check("stale-version-cannot-be-revised", staleRevisionRejected);

    let secretRejected = false;
    try {
      await engine.remember({
        category: "fact",
        title: "Credential test",
        content: { apiKey: "must-not-be-saved" }
      }, engine.issueWriteApproval(new MemoryTestEventPart2("click")));
    } catch (error) { secretRejected = error.code === "SECRET_FIELD_REJECTED"; }
    check("credential-shaped-content-is-rejected", secretRejected);

    let unsafeContentRejected = false;
    try {
      await engine.remember({
        category: "fact",
        title: "Unsafe content",
        content: () => "executable"
      }, engine.issueWriteApproval(new MemoryTestEventPart2("click")));
    } catch (error) { unsafeContentRejected = error.code === "NON_JSON_VALUE"; }
    check("non-json-content-is-rejected", unsafeContentRejected);

    const archived = await engine.archive(revised.id, engine.issueWriteApproval(new MemoryTestEventPart2("click")));
    const afterArchive = await engine.list();
    check("archive-is-versioned-and-removed-from-active-list",
      archived.status === "archived" && archived.version === 3 && afterArchive.records.length === 0);

    const backup = await engine.exportBackup();
    check("backup-export-delegates-to-core-memory-facade",
      backup && backup.format === "test-backup" && backup.records.length === 3);

    let invalidQueryRejected = false;
    try { await engine.search(" "); }
    catch (error) { invalidQueryRejected = error.code === "INVALID_SEARCH_QUERY"; }
    check("invalid-search-query-rejected", invalidQueryRejected);

    const beforeDispose = engine.diagnostics();
    await engine.dispose();
    await engine.dispose();
    check("dispose-unregisters-modules-and-is-idempotent",
      engine.diagnostics().state === "disposed" &&
      fakeCore.modules.size === 0 &&
      beforeDispose.registeredModules.reader === true);
  } catch (error) {
    checks.push({
      id: "memory-engine-selftest-unexpected-error",
      passed: false,
      message: error && error.message ? error.message : String(error)
    });
  } finally {
    try { await engine.dispose(); } catch (_) {}
  }

  return Object.freeze({
    module: "brain-memory-engine-part2",
    version: BRAIN_MEMORY_VERSION_PART2,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks.map(item => Object.freeze(item)))
  });
}
