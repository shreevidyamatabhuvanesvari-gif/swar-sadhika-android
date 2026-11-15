/* Swar-Sadhika Nano Brain — Integration Foundation Part 2.
 * Narrow app bridge, single-flight initialization, serialized lifecycle,
 * and capability-checked access to the local Storage API.
 *
 * No network access, remote code loading, model execution, autonomous action,
 * or direct access to the raw Storage backend / raw Capability Gate.
 */

import { createBrainStoragePart2 } from "./brain-storage-part2.js";
import { createCapabilityGatePart2, cloneSafeJsonPart2 } from "./brain-security-part2.js";

export const BRAIN_INTEGRATION_VERSION_PART2 = "1.1.0";

const ROUTES = new Set(["index", "nano-brain", "nano-server", "avatar", "video"]);
const BRAIN_EVENT_PATTERN = /^brain:[a-z0-9][a-z0-9:_-]{0,78}$/i;
const REQUIRED_STORAGE_METHODS = Object.freeze([
  "getRecord",
  "putRecord",
  "deleteRecord",
  "listRecords",
  "getMetadata",
  "putMetadata",
  "appendEvent",
  "listEvents",
  "diagnostics",
  "requestPersistentStorage",
  "exportBackup",
  "importBackup",
  "restoreBackup",
  "dispose"
]);

export class BrainIntegrationErrorPart2 extends Error {
  constructor(message, code = "BRAIN_INTEGRATION_ERROR", cause = null) {
    super(message);
    this.name = "BrainIntegrationErrorPart2";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function fail(message, code, cause) {
  throw new BrainIntegrationErrorPart2(message, code, cause || null);
}

function validateApp(app) {
  if (!app || typeof app !== "object" ||
      typeof app.emit !== "function" ||
      typeof app.on !== "function" ||
      typeof app.navigate !== "function") {
    fail("मुख्य Swar-Sadhika App Bridge का आवश्यक contract उपलब्ध नहीं है।", "APP_BRIDGE_INVALID");
  }
}

function validateStorage(storage) {
  if (!storage || typeof storage !== "object") {
    fail("Storage Factory ने मान्य Storage Object नहीं दिया।", "STORAGE_CONTRACT_INVALID");
  }
  const missing = REQUIRED_STORAGE_METHODS.filter(name => typeof storage[name] !== "function");
  if (missing.length) {
    fail("Storage contract में आवश्यक methods अनुपस्थित हैं: " + missing.join(", "), "STORAGE_CONTRACT_INCOMPLETE");
  }
}

function resolveWindow(host) {
  if (host && host.window && typeof host.window.confirm === "function") return host.window;
  if (host && typeof host.confirm === "function") return host;
  return null;
}

function resolveEventConstructor(host) {
  return host && typeof host.Event === "function" ? host.Event : globalThis.Event;
}

function normalizeBrainEventName(eventName) {
  if (typeof eventName !== "string" || !BRAIN_EVENT_PATTERN.test(eventName)) {
    fail("केवल निर्धारित brain:* application events स्वीकार्य हैं।", "INVALID_BRAIN_EVENT");
  }
  return eventName;
}

function immutableSnapshot(value) {
  return Object.freeze(cloneSafeJsonPart2(value));
}

export function createBrainAppFacadePart2(app) {
  validateApp(app);

  return Object.freeze({
    version: String(app.version || "unknown"),

    emit(eventName, detail = null) {
      const name = normalizeBrainEventName(eventName);
      const safeDetail = cloneSafeJsonPart2(detail === undefined ? null : detail);
      return app.emit(name, safeDetail);
    },

    on(eventName, callback) {
      const name = normalizeBrainEventName(eventName);
      if (typeof callback !== "function") fail("Event callback function आवश्यक है।", "INVALID_EVENT_CALLBACK");

      const unsubscribe = app.on(name, (detail, event) => {
        const safeDetail = cloneSafeJsonPart2(detail === undefined ? null : detail);
        callback(safeDetail, event);
      });

      if (typeof unsubscribe !== "function") {
        fail("App Event Bridge ने unsubscribe function नहीं दिया।", "EVENT_UNSUBSCRIBE_UNAVAILABLE");
      }
      return unsubscribe;
    },

    navigate(route) {
      if (typeof route !== "string" || !ROUTES.has(route)) {
        fail("यह Route Brain Integration की allowlist में उपलब्ध नहीं है।", "ROUTE_NOT_ALLOWED");
      }
      return app.navigate(route);
    }
  });
}

/*
 * Lifecycle calls are serialized in the order received.
 * Hook failures are returned to the caller; the internal queue remains usable.
 * Unmount always attempts cleanup and permanently closes this lifecycle.
 */
export function createSerializedLifecyclePart2(hooks = {}) {
  if (!hooks || typeof hooks !== "object") {
    fail("Lifecycle hooks साधारण Object होने चाहिए।", "INVALID_LIFECYCLE_HOOKS");
  }

  for (const name of ["mount", "onShow", "onHide", "unmount"]) {
    if (hooks[name] !== undefined && typeof hooks[name] !== "function") {
      fail("Lifecycle hook function अमान्य है: " + name, "INVALID_LIFECYCLE_HOOK");
    }
  }

  let state = "new";
  let chain = Promise.resolve();

  function enqueue(task) {
    const scheduled = chain.then(task);
    chain = scheduled.catch(() => undefined);
    return scheduled;
  }

  return Object.freeze({
    mount() {
      return enqueue(async () => {
        if (state === "disposed" || state !== "new") return false;
        if (hooks.mount) await hooks.mount();
        state = "mounted";
        return true;
      });
    },

    show() {
      return enqueue(async () => {
        if (state !== "mounted" && state !== "hidden") return false;
        if (hooks.onShow) await hooks.onShow();
        state = "shown";
        return true;
      });
    },

    hide() {
      return enqueue(async () => {
        if (state !== "shown") return false;
        if (hooks.onHide) await hooks.onHide();
        state = "hidden";
        return true;
      });
    },

    unmount() {
      return enqueue(async () => {
        if (state === "disposed") return false;
        let firstError = null;

        if (state === "shown" && hooks.onHide) {
          try { await hooks.onHide(); }
          catch (error) { firstError = error; }
        }

        try {
          if (hooks.unmount) await hooks.unmount();
        } catch (error) {
          if (!firstError) firstError = error;
        } finally {
          state = "disposed";
        }

        if (firstError) throw firstError;
        return true;
      });
    },

    diagnostics() {
      return Object.freeze({
        state,
        mounted: state === "mounted" || state === "shown" || state === "hidden",
        visible: state === "shown",
        disposed: state === "disposed"
      });
    }
  });
}

function createMemoryFacade(storage, gate, assertReady) {
  function requireRead() {
    assertReady();
    gate.require("memory.read");
  }

  function requireWrite() {
    assertReady();
    gate.require("memory.write");
  }

  return Object.freeze({
    async getRecord(id) {
      requireRead();
      return storage.getRecord(id);
    },

    async listRecords(options) {
      requireRead();
      return storage.listRecords(options);
    },

    async getMetadata(key) {
      requireRead();
      return storage.getMetadata(key);
    },

    async listEvents(options) {
      requireRead();
      return storage.listEvents(options);
    },

    async exportBackup() {
      requireRead();
      return storage.exportBackup();
    },

    async putRecord(record) {
      requireWrite();
      return storage.putRecord(record);
    },

    async deleteRecord(id) {
      requireWrite();
      return storage.deleteRecord(id);
    },

    async putMetadata(key, value) {
      requireWrite();
      return storage.putMetadata(key, value);
    },

    async appendEvent(event) {
      requireWrite();
      return storage.appendEvent(event);
    },

    async importBackup(backup) {
      requireWrite();
      return storage.importBackup(backup);
    },

    async restoreBackup(backup) {
      requireWrite();
      return storage.restoreBackup(backup);
    },

    async requestPersistentStorage(event) {
      requireWrite();
      return storage.requestPersistentStorage(event);
    },

    async diagnostics() {
      assertReady();
      return storage.diagnostics();
    }
  });
}

export function createBrainIntegrationPart2(options = {}) {
  const appFacade = createBrainAppFacadePart2(options.app);
  const host = options.host || globalThis;
  const storageFactory = options.storageFactory || createBrainStoragePart2;

  if (typeof storageFactory !== "function") {
    fail("Storage Factory function आवश्यक है।", "INVALID_STORAGE_FACTORY");
  }

  let state = "new";
  let initializationPromise = null;
  let disposePromise = null;
  let storage = null;
  let gate = null;
  let memoryFacade = null;
  let lastError = null;

  function assertNotDisposed() {
    if (state === "disposing" || state === "disposed") {
      fail("Brain Integration बंद हो चुका है।", "INTEGRATION_DISPOSED");
    }
  }

  function assertReady() {
    if (state !== "ready" || !storage || !gate) {
      fail("Brain Foundation अभी Ready नहीं है।", "FOUNDATION_NOT_READY");
    }
  }

  function makeSnapshot(storageDiagnostics, securityDiagnostics) {
    return immutableSnapshot({
      version: BRAIN_INTEGRATION_VERSION_PART2,
      state: "ready",
      localOnly: true,
      storage: storageDiagnostics,
      security: securityDiagnostics,
      symbolicReasoning: "not-installed",
      neuralModelRuntime: "not-installed",
      autonomousExecution: "not-installed"
    });
  }

  function initialize() {
    assertNotDisposed();

    if (initializationPromise) return initializationPromise;
    if (state === "ready") {
      return Promise.resolve(diagnostics());
    }

    state = "initializing";
    lastError = null;

    const task = (async () => {
      let pendingStorage = null;
      let pendingGate = null;

      try {
        pendingStorage = await storageFactory({
          host,
          dbName: options.dbName,
          allowVolatileFallback: options.allowVolatileFallback === true
        });

        validateStorage(pendingStorage);
        assertNotDisposed();

        pendingGate = createCapabilityGatePart2({
          windowRef: resolveWindow(host),
          EventConstructor: resolveEventConstructor(host)
        });

        const storageDiagnostics = await pendingStorage.diagnostics();
        if (!storageDiagnostics || typeof storageDiagnostics !== "object" ||
            typeof storageDiagnostics.backend !== "string" ||
            typeof storageDiagnostics.persistent !== "boolean") {
          fail("Storage Diagnostics का contract अधूरा है।", "STORAGE_DIAGNOSTICS_INVALID");
        }

        assertNotDisposed();

        // Publish the dependencies only after the complete initialization succeeds.
        storage = pendingStorage;
        gate = pendingGate;
        memoryFacade = createMemoryFacade(storage, gate, assertReady);
        state = "ready";

        const snapshot = makeSnapshot(storageDiagnostics, gate.diagnostics());
        appFacade.emit("brain:foundation-ready", {
          version: BRAIN_INTEGRATION_VERSION_PART2,
          storageBackend: storageDiagnostics.backend,
          persistent: storageDiagnostics.persistent,
          durability: storageDiagnostics.durability || "unknown",
          localOnly: true
        });

        return snapshot;
      } catch (error) {
        if (pendingGate) {
          try { pendingGate.dispose(); } catch (_) {}
        }

        if (pendingStorage) {
          if (storage === pendingStorage) storage = null;
          try { await pendingStorage.dispose(); } catch (_) {}
        }

        if (gate === pendingGate) gate = null;
        memoryFacade = null;

        if (state !== "disposing" && state !== "disposed") state = "failed";
        lastError = error;

        if (error instanceof BrainIntegrationErrorPart2) throw error;
        throw new BrainIntegrationErrorPart2(
          "Brain Foundation Initialization विफल हुआ।",
          "FOUNDATION_INIT_FAILED",
          error
        );
      }
    })();

    initializationPromise = task;
    task.then(
      () => {},
      () => {
        if (state !== "disposing" && state !== "disposed") {
          initializationPromise = null;
        }
      }
    );
    return task;
  }

  async function diagnostics() {
    if (state !== "ready" || !storage || !gate) {
      return immutableSnapshot({
        version: BRAIN_INTEGRATION_VERSION_PART2,
        state,
        initialized: false,
        disposed: state === "disposed",
        localOnly: true,
        lastError: lastError ? {
          code: lastError.code || "INITIALIZATION_FAILED",
          message: lastError.message || String(lastError)
        } : null,
        symbolicReasoning: "not-installed",
        neuralModelRuntime: "not-installed",
        autonomousExecution: "not-installed"
      });
    }

    const storageInfo = await storage.diagnostics();
    return immutableSnapshot({
      version: BRAIN_INTEGRATION_VERSION_PART2,
      state,
      initialized: true,
      disposed: false,
      localOnly: true,
      storage: storageInfo,
      security: gate.diagnostics(),
      memoryAccess: "capability-checked",
      rawStorageExposed: false,
      rawCapabilityGateExposed: false,
      symbolicReasoning: "not-installed",
      neuralModelRuntime: "not-installed",
      autonomousExecution: "not-installed"
    });
  }

  function requestCapabilities(capabilities, event) {
    assertReady();
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      fail("अनुमति के लिए capabilities की non-empty सूची आवश्यक है।", "INVALID_CAPABILITY_REQUEST");
    }
    return gate.requestGrant(capabilities, event);
  }

  function revokeCapabilities(capabilities) {
    assertReady();
    return gate.revoke(capabilities);
  }

  function securityDiagnostics() {
    assertReady();
    return gate.diagnostics();
  }

  function getMemory() {
    assertReady();
    return memoryFacade;
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    if (state === "disposed") return Promise.resolve(false);

    state = "disposing";
    disposePromise = (async () => {
      // Wait for an in-flight initialization. Its failure path closes any
      // dependency that had not yet been published.
      if (initializationPromise) {
        try { await initializationPromise; } catch (_) {}
      }

      if (gate) {
        try { gate.dispose(); } catch (_) {}
      }

      if (storage) {
        try { await storage.dispose(); }
        finally { storage = null; }
      }

      gate = null;
      memoryFacade = null;
      state = "disposed";
      return true;
    })();

    return disposePromise;
  }

  return Object.freeze({
    version: BRAIN_INTEGRATION_VERSION_PART2,
    app: appFacade,
    initialize,
    diagnostics,
    getMemory,
    requestCapabilities,
    revokeCapabilities,
    securityDiagnostics,
    dispose
  });
}

function createFakeStoragePart2(options = {}) {
  const values = new Map();
  let disposed = false;
  const calls = { reads: 0, writes: 0, dispose: 0 };

  function assertActive() {
    if (disposed) fail("Fake Storage disposed है।", "STORAGE_DISPOSED");
  }

  return {
    calls,
    async diagnostics() {
      assertActive();
      return {
        backend: "memory",
        persistent: false,
        volatileFallback: true,
        durability: "volatile",
        databaseVersion: null
      };
    },
    async getRecord(id) {
      assertActive();
      calls.reads += 1;
      return values.get(id) || null;
    },
    async putRecord(record) {
      assertActive();
      calls.writes += 1;
      values.set(record.id, cloneSafeJsonPart2(record));
      return true;
    },
    async deleteRecord(id) {
      assertActive();
      calls.writes += 1;
      return values.delete(id);
    },
    async listRecords() { assertActive(); calls.reads += 1; return [...values.values()]; },
    async getMetadata() { assertActive(); calls.reads += 1; return null; },
    async putMetadata() { assertActive(); calls.writes += 1; return true; },
    async appendEvent() { assertActive(); calls.writes += 1; return true; },
    async listEvents() { assertActive(); calls.reads += 1; return []; },
    async requestPersistentStorage() { assertActive(); calls.writes += 1; return { supported: false, granted: false }; },
    async exportBackup() { assertActive(); calls.reads += 1; return { format: "test" }; },
    async importBackup() { assertActive(); calls.writes += 1; return { records: 0 }; },
    async restoreBackup() { assertActive(); calls.writes += 1; return { records: 0 }; },
    async dispose() { if (disposed) return; disposed = true; calls.dispose += 1; }
  };
}

export async function selfTest() {
  const checks = [];
  const check = (id, passed, message = "") => checks.push({
    id,
    passed: Boolean(passed),
    ...(message ? { message } : {})
  });

  const fakeListeners = new Map();
  const emitted = [];
  const fakeApp = {
    version: "integration-selftest",
    emit(name, detail) {
      emitted.push({ name, detail });
      for (const callback of fakeListeners.get(name) || []) callback(detail, { type: name });
    },
    on(name, callback) {
      if (!fakeListeners.has(name)) fakeListeners.set(name, new Set());
      fakeListeners.get(name).add(callback);
      return () => fakeListeners.get(name).delete(callback);
    },
    navigate(route) { return Promise.resolve({ route }); }
  };

  try {
    let invalidAppRejected = false;
    try { createBrainAppFacadePart2({ emit() {} }); }
    catch (error) { invalidAppRejected = error.code === "APP_BRIDGE_INVALID"; }
    check("app-bridge-contract-required", invalidAppRejected);

    const facade = createBrainAppFacadePart2(fakeApp);
    check("facade-does-not-expose-app-state-or-registry",
      !("state" in facade) && !("loadRegistry" in facade) && !("loadRegisteredModule" in facade));

    let routeDenied = false;
    try { facade.navigate("javascript:alert(1)"); }
    catch (error) { routeDenied = error.code === "ROUTE_NOT_ALLOWED"; }
    check("route-allowlist-blocks-untrusted-route", routeDenied);

    let namespaceDenied = false;
    try { facade.emit("user:arbitrary", {}); }
    catch (error) { namespaceDenied = error.code === "INVALID_BRAIN_EVENT"; }
    check("event-namespace-restricted-to-brain", namespaceDenied);

    let callbackValue = null;
    const unsubscribe = facade.on("brain:self-test", detail => { callbackValue = detail.value; });
    facade.emit("brain:self-test", { value: 17 });
    unsubscribe();
    check("brain-event-subscribe-emit-unsubscribe", callbackValue === 17 && fakeListeners.get("brain:self-test").size === 0);

    let factoryCalls = 0;
    let factoryOptions = null;
    const fakeStorage = createFakeStoragePart2();
    class TestEvent {
      constructor(type) { this.type = type; this.isTrusted = true; }
    }
    const integration = createBrainIntegrationPart2({
      app: fakeApp,
      host: {
        Event: TestEvent,
        window: { confirm: () => true }
      },
      allowVolatileFallback: false,
      storageFactory: async options => {
        factoryCalls += 1;
        factoryOptions = options;
        await Promise.resolve();
        return fakeStorage;
      }
    });

    let memoryUnavailableBeforeInit = false;
    try { integration.getMemory(); }
    catch (error) { memoryUnavailableBeforeInit = error.code === "FOUNDATION_NOT_READY"; }
    check("memory-unavailable-before-initialization", memoryUnavailableBeforeInit);

    const firstInit = integration.initialize();
    const secondInit = integration.initialize();
    check("initialization-single-flight-promise", firstInit === secondInit);

    const [firstSnapshot, secondSnapshot] = await Promise.all([firstInit, secondInit]);
    check("storage-factory-called-once", factoryCalls === 1);
    check("strict-persistent-mode-default", factoryOptions.allowVolatileFallback === false);
    check("initialization-snapshot-is-local-and-honest",
      firstSnapshot.localOnly === true &&
      firstSnapshot.storage.backend === "memory" &&
      firstSnapshot.storage.durability === "volatile" &&
      firstSnapshot.symbolicReasoning === "not-installed" &&
      secondSnapshot.state === "ready");

    const memory = integration.getMemory();
    let readDenied = false;
    try { await memory.getRecord("protected-record"); }
    catch (error) { readDenied = error.code === "CAPABILITY_DENIED"; }
    check("memory-read-denied-by-default", readDenied);

    let writeDenied = false;
    try { await memory.putRecord({ id: "protected-record", value: 1 }); }
    catch (error) { writeDenied = error.code === "CAPABILITY_DENIED"; }
    check("memory-write-denied-by-default", writeDenied);
    check("denied-operations-did-not-reach-storage",
      fakeStorage.calls.reads === 0 && fakeStorage.calls.writes === 0);

    // Use an instance of the exact Event constructor supplied to the gate.
    const gateEvent = new TestEvent("click");
    const granted = integration.requestCapabilities(["memory.read", "memory.write"], gateEvent);
    check("trusted-user-confirmation-grants-session-capabilities",
      granted.length === 2 && integration.securityDiagnostics().grantedCapabilities.length === 2);

    await memory.putRecord({ id: "protected-record", value: 23 });
    const stored = await memory.getRecord("protected-record");
    check("authorized-memory-read-write-reaches-storage",
      stored && stored.value === 23 && fakeStorage.calls.reads === 1 && fakeStorage.calls.writes === 1);

    integration.revokeCapabilities(["memory.read"]);
    let revokedReadDenied = false;
    try { await memory.getRecord("protected-record"); }
    catch (error) { revokedReadDenied = error.code === "CAPABILITY_DENIED"; }
    check("revoked-capability-blocks-next-read", revokedReadDenied);

    const status = await integration.diagnostics();
    check("raw-storage-and-raw-gate-not-exposed",
      status.rawStorageExposed === false && status.rawCapabilityGateExposed === false &&
      !("getStorage" in integration) && !("getCapabilityGate" in integration));

    await integration.dispose();
    await integration.dispose();
    check("dispose-is-idempotent-and-closes-storage",
      fakeStorage.calls.dispose === 1 && (await integration.diagnostics()).state === "disposed");

    let resolvePendingStorage;
    let pendingDisposed = 0;
    const pendingStorage = new Promise(resolve => { resolvePendingStorage = resolve; });
    const pendingIntegration = createBrainIntegrationPart2({
      app: fakeApp,
      host: {},
      storageFactory: () => pendingStorage
    });
    const pendingInit = pendingIntegration.initialize().catch(error => error);
    await Promise.resolve();
    const pendingDispose = pendingIntegration.dispose();
    resolvePendingStorage({
      ...createFakeStoragePart2(),
      async dispose() { pendingDisposed += 1; }
    });
    await Promise.all([pendingInit, pendingDispose]);
    check("dispose-during-initialization-closes-pending-storage",
      pendingDisposed === 1 && (await pendingIntegration.diagnostics()).state === "disposed");

    let lifecycleOrder = [];
    const lifecycle = createSerializedLifecyclePart2({
      mount() { lifecycleOrder.push("mount"); },
      onShow() { lifecycleOrder.push("show"); },
      onHide() { lifecycleOrder.push("hide"); },
      unmount() { lifecycleOrder.push("unmount"); }
    });
    const lifecycleResults = await Promise.all([
      lifecycle.mount(),
      lifecycle.show(),
      lifecycle.hide(),
      lifecycle.unmount()
    ]);
    check("concurrent-lifecycle-calls-are-serialized",
      lifecycleOrder.join(",") === "mount,show,hide,unmount" && lifecycleResults.every(Boolean));
    check("lifecycle-is-closed-after-unmount", lifecycle.diagnostics().disposed);

    let hideOnUnmountOrder = [];
    const visibleLifecycle = createSerializedLifecyclePart2({
      mount() { hideOnUnmountOrder.push("mount"); },
      onShow() { hideOnUnmountOrder.push("show"); },
      onHide() { hideOnUnmountOrder.push("hide"); },
      unmount() { hideOnUnmountOrder.push("unmount"); }
    });
    await visibleLifecycle.mount();
    await visibleLifecycle.show();
    await visibleLifecycle.unmount();
    check("unmount-hides-visible-page-before-cleanup",
      hideOnUnmountOrder.join(",") === "mount,show,hide,unmount");

    const failedLifecycle = createSerializedLifecyclePart2({
      mount() { throw new Error("mount-failure"); }
    });
    let hookFailurePropagated = false;
    try { await failedLifecycle.mount(); }
    catch (error) { hookFailurePropagated = error.message === "mount-failure"; }
    check("lifecycle-hook-failure-is-not-silenced", hookFailurePropagated);
    check("lifecycle-queue-recovers-after-hook-failure",
      (await failedLifecycle.unmount()) === true && failedLifecycle.diagnostics().disposed);
  } catch (error) {
    checks.push({
      id: "integration-self-test-unexpected-error",
      passed: false,
      message: error && error.message ? error.message : String(error)
    });
  }

  return Object.freeze({
    module: "brain-integration-foundation-part2",
    version: BRAIN_INTEGRATION_VERSION_PART2,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks.map(item => Object.freeze({ ...item })))
  });
}
