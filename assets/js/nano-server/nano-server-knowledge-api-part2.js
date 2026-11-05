/* Swar-Sadhika — Nano Server Knowledge API Part 2.
 * Stable application-facing facade for the browser-local Nano Server Engine.
 * Owns initialization, operation validation, event subscriptions and lifecycle.
 * No network implementation is duplicated here: all I/O and content validation
 * remain in nano-server-engine-part2.js.
 */
import {
  createNanoServerEngine,
  NANO_SERVER_ENGINE_VERSION
} from "./nano-server-engine-part2.js";

export const NANO_SERVER_KNOWLEDGE_API_VERSION = "1.0.0";

const ENGINE_METHODS = Object.freeze([
  "initialize",
  "getNetworkStatus",
  "probeAppNetwork",
  "refreshManifest",
  "getManifest",
  "listEntries",
  "getEntry",
  "downloadEntry",
  "readDocument",
  "getCachedEntries",
  "removeCachedEntry",
  "getDiagnostics",
  "on",
  "dispose",
  "selfTest"
]);

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9:_-]{0,63}$/i;
const ENTRY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/i;

export class NanoServerKnowledgeAPIError extends Error {
  constructor(message, code = "KNOWLEDGE_API_ERROR", cause = null) {
    super(message);
    this.name = "NanoServerKnowledgeAPIError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function fail(message, code) {
  throw new NanoServerKnowledgeAPIError(message, code);
}

function assertOptions(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    fail(label + " विकल्प object होना चाहिए।", "INVALID_OPTIONS");
  }
  return value;
}

function validateEntryId(id) {
  if (typeof id !== "string" || !ENTRY_ID_PATTERN.test(id)) {
    fail("Knowledge entry ID अमान्य है।", "INVALID_ENTRY_ID");
  }
  return id;
}

function validateEngine(engine) {
  if (!engine || typeof engine !== "object") {
    fail("Nano Server Engine उपलब्ध नहीं है।", "ENGINE_UNAVAILABLE");
  }
  const missing = ENGINE_METHODS.filter(name => typeof engine[name] !== "function");
  if (missing.length) {
    fail("Nano Server Engine का contract अधूरा है: " + missing.join(", "), "ENGINE_CONTRACT_MISMATCH");
  }
  return engine;
}

export function createNanoServerKnowledgeAPI(options = {}) {
  const config = assertOptions(options, "Knowledge API");
  const injectedEngine = config.engine || null;
  const engine = validateEngine(
    injectedEngine || createNanoServerEngine(config.engineOptions || config)
  );
  const ownsEngine = injectedEngine
    ? config.disposeEngine === true
    : true;

  let disposed = false;
  let initialized = false;
  let initializationPromise = null;
  let manifestRefreshPromise = null;
  const subscriptions = new Set();

  function assertActive() {
    if (disposed) fail("Knowledge API dispose किया जा चुका है।", "API_DISPOSED");
  }

  async function ensureInitialized() {
    assertActive();
    if (initialized) return engine.getDiagnostics();
    if (!initializationPromise) {
      initializationPromise = (async () => {
        const result = await engine.initialize();
        assertActive();
        initialized = true;
        return result;
      })();
    }
    try {
      return await initializationPromise;
    } catch (error) {
      initializationPromise = null;
      throw error;
    }
  }

  async function initialize(options = {}) {
    const initOptions = assertOptions(options, "initialize");
    const diagnostics = await ensureInitialized();
    if (initOptions.refreshManifest === true) {
      await refreshManifest(initOptions.manifestOptions || {});
      return engine.getDiagnostics();
    }
    return diagnostics;
  }

  function getNetworkStatus() {
    assertActive();
    return engine.getNetworkStatus();
  }

  async function probeAppNetwork(options = {}) {
    assertActive();
    return engine.probeAppNetwork(assertOptions(options, "network probe"));
  }

  async function refreshManifest(options = {}) {
    assertActive();
    await ensureInitialized();
    assertActive();
    if (manifestRefreshPromise) return manifestRefreshPromise;
    manifestRefreshPromise = (async () => {
      try {
        const manifest = await engine.refreshManifest(assertOptions(options, "Manifest refresh"));
        assertActive();
        return manifest;
      } finally {
        manifestRefreshPromise = null;
      }
    })();
    return manifestRefreshPromise;
  }

  function getManifest() {
    assertActive();
    return engine.getManifest();
  }

  function listEntries(options = {}) {
    assertActive();
    return engine.listEntries(assertOptions(options, "entry listing"));
  }

  function getEntry(id) {
    assertActive();
    return engine.getEntry(validateEntryId(id));
  }

  async function downloadEntry(id, options = {}) {
    assertActive();
    await ensureInitialized();
    assertActive();
    return engine.downloadEntry(
      validateEntryId(id),
      assertOptions(options, "document download")
    );
  }

  async function readDocument(id, options = {}) {
    assertActive();
    await ensureInitialized();
    assertActive();
    return engine.readDocument(
      validateEntryId(id),
      assertOptions(options, "document read")
    );
  }

  async function getCachedEntries() {
    assertActive();
    await ensureInitialized();
    assertActive();
    return engine.getCachedEntries();
  }

  async function removeCachedEntry(id) {
    assertActive();
    await ensureInitialized();
    assertActive();
    return engine.removeCachedEntry(validateEntryId(id));
  }

  async function getDiagnostics() {
    assertActive();
    return engine.getDiagnostics();
  }

  function on(eventName, callback) {
    assertActive();
    if (typeof eventName !== "string" || !EVENT_NAME_PATTERN.test(eventName)) {
      fail("Engine event name अमान्य है।", "INVALID_EVENT_NAME");
    }
    if (typeof callback !== "function") {
      fail("Event callback function होना चाहिए।", "INVALID_EVENT_CALLBACK");
    }

    const engineUnsubscribe = engine.on(eventName, callback);
    if (typeof engineUnsubscribe !== "function") {
      fail("Engine ने वैध unsubscribe function नहीं दिया।", "INVALID_EVENT_SUBSCRIPTION");
    }

    let active = true;
    const unsubscribe = () => {
      if (!active) return false;
      active = false;
      subscriptions.delete(unsubscribe);
      engineUnsubscribe();
      return true;
    };
    subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  function selfTest() {
    assertActive();
    const checks = [];
    const check = (id, passed) => checks.push(Object.freeze({ id, passed: Boolean(passed) }));
    let engineTest = null;

    try {
      engineTest = engine.selfTest();
      check("engine-self-test", Boolean(engineTest && engineTest.status === "PASSED" &&
        (engineTest.failed === undefined || engineTest.failed === 0)));
    } catch (_) {
      check("engine-self-test", false);
    }

    check("api-version", NANO_SERVER_KNOWLEDGE_API_VERSION === "1.0.0");
    check("engine-version", typeof NANO_SERVER_ENGINE_VERSION === "string" && NANO_SERVER_ENGINE_VERSION.length > 0);
    check("engine-contract", ENGINE_METHODS.every(name => typeof engine[name] === "function"));
    check("same-origin-engine-boundary", typeof engine.refreshManifest === "function" &&
      typeof engine.downloadEntry === "function" && typeof engine.readDocument === "function");
    check("event-subscription-tracking", subscriptions instanceof Set);
    check("lifecycle-state-valid", typeof initialized === "boolean" && typeof disposed === "boolean");

    return Object.freeze({
      status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
      total: checks.length,
      passed: checks.filter(item => item.passed).length,
      failed: checks.filter(item => !item.passed).length,
      checks: Object.freeze(checks),
      engine: engineTest
    });
  }

  async function dispose() {
    if (disposed) return false;
    disposed = true;

    const errors = [];
    for (const unsubscribe of Array.from(subscriptions)) {
      try {
        unsubscribe();
      } catch (error) {
        errors.push(error);
      }
    }
    subscriptions.clear();

    if (ownsEngine) {
      try {
        await engine.dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length) {
      throw new NanoServerKnowledgeAPIError(
        "Knowledge API cleanup के दौरान " + errors.length + " त्रुटि हुई।",
        "API_DISPOSE_FAILED",
        errors[0]
      );
    }
    return true;
  }

  return Object.freeze({
    apiVersion: NANO_SERVER_KNOWLEDGE_API_VERSION,
    engineVersion: NANO_SERVER_ENGINE_VERSION,
    initialize,
    getNetworkStatus,
    probeAppNetwork,
    refreshManifest,
    getManifest,
    listEntries,
    getEntry,
    downloadEntry,
    readDocument,
    getCachedEntries,
    removeCachedEntry,
    getDiagnostics,
    on,
    dispose,
    selfTest
  });
}