/* Swar-Sadhika Nano Brain — Integration Foundation Part 2.
 * Provides a narrow application facade, single-flight initialization and
 * serialized lifecycle handling. It does not load executable skills or models.
 */

import { createBrainStoragePart2 } from "./brain-storage-part2.js";
import { createCapabilityGatePart2 } from "./brain-security-part2.js";

export const BRAIN_INTEGRATION_VERSION_PART2 = "1.0.0";
const ROUTES = new Set(["index", "nano-brain", "nano-server", "avatar", "video"]);

export class BrainIntegrationErrorPart2 extends Error {
  constructor(message, code = "BRAIN_INTEGRATION_ERROR", cause = null) {
    super(message);
    this.name = "BrainIntegrationErrorPart2";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function validateApp(app) {
  if (!app || typeof app !== "object" || typeof app.emit !== "function" || typeof app.on !== "function") {
    throw new BrainIntegrationErrorPart2("मुख्य Swar-Sadhika App Bridge का contract अधूरा है।", "APP_BRIDGE_INVALID");
  }
}

export function createBrainAppFacadePart2(app) {
  validateApp(app);
  return Object.freeze({
    version: String(app.version || "unknown"),
    emit(eventName, detail) { return app.emit(eventName, detail); },
    on(eventName, callback) { return app.on(eventName, callback); },
    navigate(route) {
      if (!ROUTES.has(route) || typeof app.navigate !== "function") {
        throw new BrainIntegrationErrorPart2("अनुमत App Route उपलब्ध नहीं है।", "ROUTE_NOT_ALLOWED");
      }
      return app.navigate(route);
    }
  });
}

export function createSerializedLifecyclePart2(hooks = {}) {
  let chain = Promise.resolve();
  let mounted = false;
  let disposed = false;
  function enqueue(name, callback) {
    if (disposed && name !== "unmount") return Promise.resolve(false);
    const task = chain.then(async () => {
      if (disposed && name !== "unmount") return false;
      if (typeof callback === "function") return callback();
      return true;
    });
    chain = task.catch(() => undefined);
    return task;
  }
  return Object.freeze({
    mount() {
      return enqueue("mount", async () => {
        if (mounted) return false;
        if (typeof hooks.mount === "function") await hooks.mount();
        mounted = true;
        return true;
      });
    },
    show() { return enqueue("show", () => mounted && typeof hooks.onShow === "function" ? hooks.onShow() : mounted); },
    hide() { return enqueue("hide", () => mounted && typeof hooks.onHide === "function" ? hooks.onHide() : mounted); },
    unmount() {
      return enqueue("unmount", async () => {
        if (!mounted) { disposed = true; return false; }
        try { if (typeof hooks.unmount === "function") await hooks.unmount(); }
        finally { mounted = false; disposed = true; }
        return true;
      });
    },
    diagnostics() { return Object.freeze({ mounted, disposed }); }
  });
}

export function createBrainIntegrationPart2(options = {}) {
  const facade = createBrainAppFacadePart2(options.app);
  const host = options.host || globalThis;
  const storageFactory = options.storageFactory || createBrainStoragePart2;
  let initializationPromise = null;
  let storage = null;
  let gate = null;
  let disposed = false;
  let disposePromise = null;

  function initialize() {
    if (disposed) throw new BrainIntegrationErrorPart2("Brain Integration बंद हो चुका है।", "INTEGRATION_DISPOSED");
    if (!initializationPromise) {
      const task = (async () => {
        let pendingStorage = null;
        let pendingGate = null;
        try {
          pendingStorage = await storageFactory({ host, allowVolatileFallback: options.allowVolatileFallback !== false });
          if (disposed) {
            throw new BrainIntegrationErrorPart2("Initialization के दौरान Integration बंद हुआ।", "INTEGRATION_DISPOSED");
          }
          pendingGate = createCapabilityGatePart2();
          const storageDiagnostics = await pendingStorage.diagnostics();
          if (disposed) {
            throw new BrainIntegrationErrorPart2("Initialization के दौरान Integration बंद हुआ।", "INTEGRATION_DISPOSED");
          }
          storage = pendingStorage;
          gate = pendingGate;
          facade.emit("brain:foundation-ready", {
            version: BRAIN_INTEGRATION_VERSION_PART2,
            storageBackend: storageDiagnostics.backend,
            persistent: storageDiagnostics.persistent
          });
          return Object.freeze({ version: BRAIN_INTEGRATION_VERSION_PART2,
            storage: storageDiagnostics, security: gate.diagnostics(), modelRuntime: "not-installed" });
        } catch (error) {
          if (pendingGate) {
            pendingGate.dispose();
            if (gate === pendingGate) gate = null;
          }
          if (pendingStorage) {
            if (storage === pendingStorage) storage = null;
            try { await pendingStorage.dispose(); } catch (_) {}
          }
          throw error;
        }
      })();
      initializationPromise = task.catch(error => {
        if (!disposed) initializationPromise = null;
        throw new BrainIntegrationErrorPart2("Brain Foundation initialization विफल हुआ।", "FOUNDATION_INIT_FAILED", error);
      });
    }
    return initializationPromise;
  }

  function getStorage() {
    if (!storage || disposed) throw new BrainIntegrationErrorPart2("Brain Storage अभी उपलब्ध नहीं है।", "STORAGE_NOT_READY");
    return storage;
  }

  function getCapabilityGate() {
    if (!gate || disposed) throw new BrainIntegrationErrorPart2("Security Gate अभी उपलब्ध नहीं है।", "SECURITY_NOT_READY");
    return gate;
  }

  async function diagnostics() {
    if (disposed || !initializationPromise || !storage || !gate) return Object.freeze({
      version: BRAIN_INTEGRATION_VERSION_PART2, initialized: false, disposed, modelRuntime: "not-installed"
    });
    const storageInfo = await storage.diagnostics();
    return Object.freeze({ version: BRAIN_INTEGRATION_VERSION_PART2, initialized: true, disposed,
      storage: storageInfo, security: gate.diagnostics(), modelRuntime: "not-installed" });
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    disposed = true;
    disposePromise = (async () => {
      if (gate) gate.dispose();
      if (initializationPromise) {
        try { await initializationPromise; } catch (_) {}
      }
      if (storage) await storage.dispose();
      storage = null;
      gate = null;
    })();
    return disposePromise;
  }

  return Object.freeze({ facade, initialize, getStorage, getCapabilityGate, diagnostics, dispose });
}

export async function selfTest() {
  const checks = [];
  const check = (id, passed) => checks.push({ id, passed: Boolean(passed) });
  try {
    const fakeApp = { version: "test", emit() {}, on() { return () => {}; }, navigate() { return true; }, loadRegistry() {}, state: {} };
    const facade = createBrainAppFacadePart2(fakeApp);
    check("app-facade-hides-internal-registry-and-state", !("loadRegistry" in facade) && !("state" in facade));
    let deniedRoute = false;
    try { facade.navigate("javascript:alert(1)"); } catch (error) { deniedRoute = error.code === "ROUTE_NOT_ALLOWED"; }
    check("app-facade-route-allowlist", deniedRoute);
    let factoryCalls = 0;
    const fakeStorage = { async diagnostics() { return { backend: "memory", persistent: false }; }, async dispose() {} };
    const integration = createBrainIntegrationPart2({ app: fakeApp, host: {}, storageFactory: async () => { factoryCalls += 1; await Promise.resolve(); return fakeStorage; } });
    const a = integration.initialize();
    const b = integration.initialize();
    check("initialization-single-flight", a === b);
    const results = await Promise.all([a, b]);
    check("initialization-result-consistent", results[0].storage.backend === "memory" && results[1].storage.backend === "memory");
    check("storage-factory-called-once", factoryCalls === 1);
    await integration.dispose();
    await integration.dispose();
    check("dispose-is-idempotent", true);
    let resolvePendingStorage;
    let pendingDisposed = 0;
    const pendingStoragePromise = new Promise(resolve => { resolvePendingStorage = resolve; });
    const pendingIntegration = createBrainIntegrationPart2({
      app: fakeApp, host: {},
      storageFactory: async () => pendingStoragePromise
    });
    const pendingInit = pendingIntegration.initialize().catch(error => error);
    await Promise.resolve();
    const pendingDispose = pendingIntegration.dispose();
    resolvePendingStorage({ async diagnostics() { return { backend: "memory", persistent: false }; }, async dispose() { pendingDisposed += 1; } });
    await Promise.all([pendingInit, pendingDispose]);
    check("dispose-during-initialization-closes-pending-storage", pendingDisposed === 1);
    check("disposed-integration-cannot-reinitialize", (() => {
      try { pendingIntegration.initialize(); return false; } catch (error) { return error.code === "INTEGRATION_DISPOSED"; }
    })());
    const order = [];
    const life = createSerializedLifecyclePart2({ mount() { order.push("mount"); }, onShow() { order.push("show"); }, onHide() { order.push("hide"); }, unmount() { order.push("unmount"); } });
    await life.mount();
    await life.show();
    await life.hide();
    await life.unmount();
    check("lifecycle-serialized-order", order.join(",") === "mount,show,hide,unmount");
    check("lifecycle-unmount-final", life.diagnostics().disposed && !life.diagnostics().mounted);
  } catch (_) { check("integration-self-test-unexpected-error", false); }
  return Object.freeze({ module: "brain-integration-foundation-part2", status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length, passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length, checks: Object.freeze(checks) });
}
