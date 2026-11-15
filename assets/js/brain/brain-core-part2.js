/* Swar-Sadhika Nano Brain — Central Orchestrator Part 2.
 * Local, in-process orchestration for reviewed built-in modules.
 *
 * This Core:
 * - reuses the Main App Integration Facade, Security Gate and Memory Facade;
 * - preserves the full 12-capability catalogue through the Security manifest validator;
 * - never auto-grants permissions or loads remote executable code;
 * - executes only local functions explicitly registered by trusted app modules;
 * - provides deterministic task dispatch, cooperative cancellation and diagnostics.
 *
 * Symbolic reasoning, neural inference, autonomous planning and domain engines
 * are reported as not installed until their real modules are integrated and tested.
 */

import {
  assertSafeBrainIdPart2,
  cloneSafeJsonPart2,
  validateSkillManifestPart2
} from "./brain-security-part2.js";

export const BRAIN_CORE_VERSION_PART2 = "1.0.0";

const MANIFEST_SCHEMA = "swar-sadhika.brain.skill-registry";
const MAX_TASK_ID_LENGTH = 96;

export class BrainCoreErrorPart2 extends Error {
  constructor(message, code = "BRAIN_CORE_ERROR", details = null, cause = null) {
    super(message);
    this.name = "BrainCoreErrorPart2";
    this.code = code;
    if (details) this.details = details;
    if (cause) this.cause = cause;
  }
}

function fail(message, code, details = null, cause = null) {
  throw new BrainCoreErrorPart2(message, code, details, cause);
}

function validateIntegration(integration) {
  const methods = [
    "initialize", "diagnostics", "getMemory", "requestCapabilities",
    "revokeCapabilities", "securityDiagnostics", "dispose"
  ];
  if (!integration || typeof integration !== "object" ||
      !integration.app || typeof integration.app.navigate !== "function" ||
      typeof integration.app.emit !== "function" ||
      typeof integration.app.on !== "function") {
    fail("Brain Core को वास्तविक Main App Integration Facade आवश्यक है।", "INTEGRATION_FACADE_REQUIRED");
  }
  const missing = methods.filter(name => typeof integration[name] !== "function");
  if (missing.length) {
    fail("Brain Integration में आवश्यक methods अनुपस्थित हैं: " + missing.join(", "), "INTEGRATION_CONTRACT_INCOMPLETE");
  }
}

function freezeData(value) {
  const data = cloneSafeJsonPart2(value === undefined ? null : value);
  const visit = item => {
    if (!item || typeof item !== "object" || Object.isFrozen(item)) return item;
    Object.keys(item).forEach(key => visit(item[key]));
    return Object.freeze(item);
  };
  return visit(data);
}

function safeError(error) {
  return Object.freeze({
    code: error && typeof error.code === "string" ? error.code : "MODULE_EXECUTION_FAILED",
    message: error && typeof error.message === "string" ? error.message : String(error)
  });
}

function makeTaskId(host, sequence) {
  const now = host && host.Date && typeof host.Date.now === "function"
    ? host.Date.now()
    : Date.now();
  return "brain-task-" + Number(now).toString(36) + "-" + sequence.toString(36);
}

function emitSafely(app, name, detail) {
  try { app.emit(name, detail); } catch (_) {}
}

function moduleSummary(entry) {
  return Object.freeze({
    id: entry.skill.id,
    title: entry.skill.title,
    version: entry.skill.version,
    risk: entry.skill.risk,
    capabilities: entry.skill.capabilities,
    enabled: entry.skill.enabled,
    knowledgeSources: entry.skill.knowledgeSources || Object.freeze([])
  });
}

export function createBrainCorePart2(options = {}) {
  const integration = options.integration;
  validateIntegration(integration);

  const host = options.host || globalThis;
  const initialModules = Array.isArray(options.modules) ? options.modules.slice() : [];
  if (!Array.isArray(options.modules || [])) {
    fail("प्रारंभिक Brain Modules की सूची Array होनी चाहिए।", "INVALID_INITIAL_MODULES");
  }

  let state = "new";
  let initializationPromise = null;
  let disposePromise = null;
  let lastError = null;
  let sequence = 0;
  const modules = new Map();
  const tasks = new Map();

  function assertNotDisposed() {
    if (state === "disposing" || state === "disposed") {
      fail("Brain Core बंद हो चुका है।", "CORE_DISPOSED");
    }
  }

  function assertReady() {
    assertNotDisposed();
    if (state !== "ready") fail("Brain Core अभी Ready नहीं है।", "CORE_NOT_READY");
  }

  function makeManifestSkill(descriptor) {
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
      fail("Brain Module Descriptor साधारण Object होना चाहिए।", "INVALID_MODULE_DESCRIPTOR");
    }
    if (typeof descriptor.execute !== "function") {
      fail("Brain Module को स्थानीय execute(context) function देना आवश्यक है।", "LOCAL_EXECUTOR_REQUIRED");
    }

    const skill = {
      id: descriptor.id,
      title: descriptor.title,
      version: descriptor.version || "1.0.0",
      risk: descriptor.risk || "medium",
      capabilities: descriptor.capabilities || [],
      execution: "builtin",
      ...(descriptor.enabled === undefined ? {} : { enabled: descriptor.enabled }),
      ...(descriptor.knowledgeSources === undefined ? {} : { knowledgeSources: descriptor.knowledgeSources })
    };

    const validated = validateSkillManifestPart2({
      schema: MANIFEST_SCHEMA,
      schemaVersion: 1,
      skills: [skill]
    });
    return { skill: validated.skills[0], execute: descriptor.execute };
  }

  function registerModule(descriptor) {
    assertReady();
    const entry = makeManifestSkill(descriptor);
    const id = entry.skill.id;
    if (modules.has(id)) fail("Brain Module पहले से पंजीकृत है: " + id, "DUPLICATE_MODULE", { moduleId: id });
    modules.set(id, entry);
    emitSafely(integration.app, "brain:module-registered", {
      moduleId: id,
      title: entry.skill.title,
      version: entry.skill.version,
      capabilities: entry.skill.capabilities
    });
    return moduleSummary(entry);
  }

  function unregisterModule(moduleId) {
    assertReady();
    assertSafeBrainIdPart2(moduleId, "Module ID");
    if ([...tasks.values()].some(task => task.moduleId === moduleId)) {
      fail("चल रहे Task के Module को हटाया नहीं जा सकता।", "MODULE_BUSY", { moduleId });
    }
    const removed = modules.delete(moduleId);
    if (removed) emitSafely(integration.app, "brain:module-unregistered", { moduleId });
    return removed;
  }

  function listModules() {
    assertNotDisposed();
    return Object.freeze([...modules.values()].map(moduleSummary));
  }

  function requestCapabilities(capabilities, trustedEvent) {
    assertReady();
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      fail("स्पष्ट Permission Request के लिए non-empty capability सूची आवश्यक है。", "INVALID_CAPABILITY_REQUEST");
    }
    // Delegation keeps the Foundation's trusted-event and native-confirmation
    // checks authoritative. Core never grants permissions by itself.
    return integration.requestCapabilities(capabilities, trustedEvent);
  }

  function getGrantedCapabilities() {
    const security = integration.securityDiagnostics();
    return new Set(Array.isArray(security.grantedCapabilities) ? security.grantedCapabilities : []);
  }

  function checkModuleCapabilities(entry) {
    const granted = getGrantedCapabilities();
    const missing = entry.skill.capabilities.filter(capability => !granted.has(capability));
    if (missing.length) {
      fail(
        "इस Module को चलाने से पहले आवश्यक Permissions स्वीकृत करनी होंगी।",
        "CAPABILITY_REQUIRED",
        { moduleId: entry.skill.id, missingCapabilities: missing }
      );
    }
  }

  function runTask(moduleId, input = null, taskOptions = {}) {
    assertReady();
    assertSafeBrainIdPart2(moduleId, "Module ID");

    const entry = modules.get(moduleId);
    if (!entry) fail("Brain Module पंजीकृत नहीं है: " + moduleId, "MODULE_NOT_REGISTERED", { moduleId });
    if (entry.skill.enabled === false) fail("Brain Module निष्क्रिय है: " + moduleId, "MODULE_DISABLED", { moduleId });

    checkModuleCapabilities(entry);
    const safeInput = freezeData(input);
    const taskId = taskOptions.id || makeTaskId(host, ++sequence);
    if (typeof taskId !== "string" || taskId.length > MAX_TASK_ID_LENGTH ||
        !/^[a-z0-9][a-z0-9._-]*$/i.test(taskId)) {
      fail("Task ID अमान्य है।", "INVALID_TASK_ID");
    }
    if (tasks.has(taskId)) fail("Task ID पहले से सक्रिय है।", "DUPLICATE_TASK_ID", { taskId });

    const AbortControllerConstructor = host && typeof host.AbortController === "function"
      ? host.AbortController
      : (typeof AbortController === "function" ? AbortController : null);
    if (!AbortControllerConstructor) fail("इस Browser में Task cancellation के लिए AbortController उपलब्ध नहीं है।", "ABORT_CONTROLLER_UNAVAILABLE");

    const controller = new AbortControllerConstructor();
    const startedAt = Date.now();
    const needsMemory = entry.skill.capabilities.some(item => item === "memory.read" || item === "memory.write");
    const context = Object.freeze({
      taskId,
      module: moduleSummary(entry),
      input: safeInput,
      signal: controller.signal,
      app: integration.app,
      memory: needsMemory ? integration.getMemory() : null,
      emit(name, detail = null) {
        if (typeof name !== "string" || !/^[a-z0-9][a-z0-9:_-]{0,78}$/i.test(name)) {
          fail("Module Event नाम अमान्य है।", "INVALID_MODULE_EVENT");
        }
        emitSafely(integration.app, name.startsWith("brain:") ? name : "brain:module:" + name,
          freezeData(detail));
      }
    });

    const task = {
      taskId,
      moduleId,
      controller,
      startedAt,
      promise: null
    };
    tasks.set(taskId, task);
    emitSafely(integration.app, "brain:task-started", {
      taskId, moduleId, startedAt
    });

    task.promise = (async () => {
      try {
        const rawOutput = await entry.execute(context);
        if (controller.signal.aborted || state === "disposing" || state === "disposed") {
          fail("Task को रद्द कर दिया गया।", "TASK_ABORTED", { taskId, moduleId });
        }
        const output = freezeData(rawOutput);
        const completedAt = Date.now();
        const result = Object.freeze({
          taskId,
          moduleId,
          status: "completed",
          startedAt,
          completedAt,
          output
        });
        emitSafely(integration.app, "brain:task-completed", {
          taskId, moduleId, startedAt, completedAt
        });
        return result;
      } catch (error) {
        const normalized = controller.signal.aborted
          ? safeError(new BrainCoreErrorPart2("Task को उपयोगकर्ता या Page Lifecycle द्वारा रद्द किया गया।", "TASK_ABORTED"))
          : safeError(error);
        emitSafely(integration.app,
          controller.signal.aborted ? "brain:task-cancelled" : "brain:task-failed",
          { taskId, moduleId, error: normalized });
        if (error instanceof BrainCoreErrorPart2) throw error;
        if (controller.signal.aborted) {
          throw new BrainCoreErrorPart2(normalized.message, normalized.code, { taskId, moduleId }, error);
        }
        throw new BrainCoreErrorPart2("स्थानीय Brain Module का Task विफल हुआ।", normalized.code, {
          taskId, moduleId, causeMessage: normalized.message
        }, error);
      } finally {
        tasks.delete(taskId);
      }
    })();

    return task.promise;
  }

  function cancelTask(taskId, reason = "cancelled") {
    assertNotDisposed();
    const task = tasks.get(taskId);
    if (!task) return false;
    if (!task.controller.signal.aborted) {
      try { task.controller.abort(String(reason).slice(0, 120)); } catch (_) { task.controller.abort(); }
    }
    return true;
  }

  function cancelAllTasks(reason = "cancelled") {
    assertNotDisposed();
    let count = 0;
    for (const task of tasks.values()) {
      if (!task.controller.signal.aborted) {
        try { task.controller.abort(String(reason).slice(0, 120)); } catch (_) { task.controller.abort(); }
        count += 1;
      }
    }
    return count;
  }

  async function initialize() {
    assertNotDisposed();
    if (state === "ready") return diagnostics();
    if (initializationPromise) return initializationPromise;

    state = "initializing";
    lastError = null;
    initializationPromise = (async () => {
      try {
        await integration.initialize();
        if (state === "disposing" || state === "disposed") {
          fail("Initialization के दौरान Brain Core बंद किया गया।", "CORE_DISPOSED");
        }

        for (const descriptor of initialModules) {
          const entry = makeManifestSkill(descriptor);
          if (modules.has(entry.skill.id)) {
            fail("प्रारंभिक Modules में दोहराया गया ID है: " + entry.skill.id, "DUPLICATE_MODULE");
          }
          modules.set(entry.skill.id, entry);
        }

        state = "ready";
        const snapshot = await diagnostics();
        emitSafely(integration.app, "brain:core-ready", {
          version: BRAIN_CORE_VERSION_PART2,
          moduleCount: modules.size,
          localOnly: true
        });
        return snapshot;
      } catch (error) {
        modules.clear();
        state = "failed";
        lastError = safeError(error);
        initializationPromise = null;
        if (error instanceof BrainCoreErrorPart2) throw error;
        throw new BrainCoreErrorPart2("Central Brain Core प्रारंभ नहीं हो सका।",
          "CORE_INITIALIZATION_FAILED", lastError, error);
      }
    })();
    return initializationPromise;
  }

  async function diagnostics() {
    if (state === "disposed") {
      return Object.freeze({
        version: BRAIN_CORE_VERSION_PART2,
        state,
        disposed: true,
        localOnly: true,
        moduleCount: 0,
        activeTaskCount: 0
      });
    }
    let foundation = null;
    if (state === "ready") foundation = await integration.diagnostics();
    return Object.freeze({
      version: BRAIN_CORE_VERSION_PART2,
      state,
      initialized: state === "ready",
      disposed: false,
      localOnly: true,
      moduleCount: modules.size,
      modules: listModules(),
      activeTaskCount: tasks.size,
      activeTaskIds: Object.freeze([...tasks.keys()]),
      foundationState: foundation ? foundation.state : "not-initialized",
      storageBackend: foundation && foundation.storage ? foundation.storage.backend : "unavailable",
      reasoningEngine: "not-installed",
      taskPlanner: "not-installed",
      neuralModelRuntime: "not-installed",
      autonomousExecution: "not-installed",
      lastError
    });
  }

  function getStatus() {
    return Object.freeze({
      version: BRAIN_CORE_VERSION_PART2,
      state,
      moduleCount: modules.size,
      activeTaskCount: tasks.size,
      disposed: state === "disposed",
      lastError
    });
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    if (state === "disposed") return Promise.resolve(false);
    state = "disposing";
    disposePromise = (async () => {
      for (const task of tasks.values()) {
        if (!task.controller.signal.aborted) {
          try { task.controller.abort("core-disposed"); } catch (_) { task.controller.abort(); }
        }
      }
      modules.clear();
      state = "disposed";
      return true;
    })();
    return disposePromise;
  }

  return Object.freeze({
    version: BRAIN_CORE_VERSION_PART2,
    app: integration.app,
    initialize,
    diagnostics,
    getStatus,
    registerModule,
    unregisterModule,
    listModules,
    requestCapabilities,
    runTask,
    cancelTask,
    cancelAllTasks,
    dispose
  });
}

function createFakeIntegrationPart2() {
  const granted = new Set();
  const listeners = new Map();
  const emitted = [];
  const memory = Object.freeze({
    async getRecord(id) { return Object.freeze({ id, value: "memory" }); },
    async putRecord() { return true; }
  });
  let initialized = false;
  let disposed = false;
  const app = Object.freeze({
    version: "core-selftest",
    navigate: async route => ({ route }),
    emit(name, detail) {
      emitted.push({ name, detail });
      for (const callback of listeners.get(name) || []) callback(detail, { type: name });
    },
    on(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
      return () => listeners.get(name).delete(callback);
    }
  });
  return {
    app,
    emitted,
    async initialize() {
      if (disposed) fail("fake integration disposed", "INTEGRATION_DISPOSED");
      initialized = true;
      return { state: "ready" };
    },
    async diagnostics() {
      return { state: initialized ? "ready" : "new", storage: { backend: "memory" } };
    },
    getMemory() {
      if (!initialized || disposed) fail("fake integration not ready", "FOUNDATION_NOT_READY");
      return memory;
    },
    requestCapabilities(capabilities) {
      if (!initialized || disposed) fail("fake integration not ready", "FOUNDATION_NOT_READY");
      capabilities.forEach(item => granted.add(item));
      return capabilities.slice();
    },
    revokeCapabilities(capabilities) {
      capabilities.forEach(item => granted.delete(item));
      return capabilities.length;
    },
    securityDiagnostics() {
      return { grantedCapabilities: [...granted], persistentGrants: false };
    },
    async dispose() { disposed = true; granted.clear(); }
  };
}

export async function selfTest() {
  const checks = [];
  const check = (id, passed, message = "") => checks.push({
    id, passed: Boolean(passed), ...(message ? { message } : {})
  });

  let invalidIntegrationRejected = false;
  try { createBrainCorePart2({ integration: {} }); }
  catch (error) { invalidIntegrationRejected = error.code === "INTEGRATION_FACADE_REQUIRED"; }
  check("core-requires-real-integration-contract", invalidIntegrationRejected);

  const integration = createFakeIntegrationPart2();
  const core = createBrainCorePart2({ integration, host: globalThis });
  try {
    const first = await core.initialize();
    const second = await core.initialize();
    check("core-initializes-through-existing-foundation",
      first.state === "ready" && second.state === "ready" &&
      first.version === BRAIN_CORE_VERSION_PART2);
    
    const localModule = core.registerModule({
      id: "selftest.echo",
      title: "Local Echo Skill",
      version: "1.0.0",
      risk: "low",
      capabilities: [],
      execute: async ({ input }) => ({ echoed: input.value })
    });
    check("local-built-in-module-registers", localModule.id === "selftest.echo");

    let duplicateRejected = false;
    try {
      core.registerModule({
        id: "selftest.echo",
        title: "Duplicate",
        risk: "low",
        capabilities: [],
        execute: async () => null
      });
    } catch (error) { duplicateRejected = error.code === "DUPLICATE_MODULE"; }
    check("duplicate-module-id-rejected", duplicateRejected);

    const output = await core.runTask("selftest.echo", { value: "Swar-Sadhika" });
    check("local-task-runs-and-returns-safe-result",
      output.status === "completed" && output.output.echoed === "Swar-Sadhika");

    core.registerModule({
      id: "selftest.knowledge",
      title: "Knowledge Permission Test",
      risk: "medium",
      capabilities: ["knowledge.read"],
      execute: async ({ input }) => ({ accepted: input.accepted === true })
    });
    let permissionDenied = false;
    try { await core.runTask("selftest.knowledge", { accepted: true }); }
    catch (error) {
      permissionDenied = error.code === "CAPABILITY_REQUIRED" &&
        error.details.missingCapabilities.includes("knowledge.read");
    }
    check("task-requires-explicit-module-capabilities", permissionDenied);

    const granted = core.requestCapabilities(["knowledge.read"], { type: "trusted-test-event" });
    const knowledgeResult = await core.runTask("selftest.knowledge", { accepted: true });
    check("explicit-capability-request-enables-module",
      granted.includes("knowledge.read") && knowledgeResult.output.accepted === true);

    let unsafeOutputRejected = false;
    core.registerModule({
      id: "selftest.unsafe-output",
      title: "Unsafe Output Test",
      risk: "low",
      capabilities: [],
      execute: async () => ({ executable() {} })
    });
    try { await core.runTask("selftest.unsafe-output"); }
    catch (error) { unsafeOutputRejected = error.code === "NON_JSON_VALUE"; }
    check("non-json-module-output-rejected", unsafeOutputRejected);

    const cancellable = core.registerModule({
      id: "selftest.cancellable",
      title: "Cancellable Task",
      risk: "low",
      capabilities: [],
      execute: ({ signal }) => new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new Error("already aborted"));
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })
    });
    const pending = core.runTask(cancellable.id);
    const activeId = core.getStatus().activeTaskCount === 1
      ? (await core.diagnostics()).activeTaskIds[0]
      : "";
    const cancelled = activeId ? core.cancelTask(activeId, "self-test") : false;
    let cancellationObserved = false;
    try { await pending; }
    catch (error) { cancellationObserved = error.code === "TASK_ABORTED"; }
    check("task-cancellation-is-cooperative-and-observable", cancelled && cancellationObserved);

    const status = await core.diagnostics();
    check("core-diagnostics-are-honest-about-uninstalled-intelligence",
      status.reasoningEngine === "not-installed" &&
      status.taskPlanner === "not-installed" &&
      status.neuralModelRuntime === "not-installed" &&
      status.localOnly === true);

    await core.dispose();
    await core.dispose();
    check("core-dispose-is-idempotent", core.getStatus().disposed);
  } catch (error) {
    checks.push({
      id: "core-self-test-unexpected-error",
      passed: false,
      message: error && error.message ? error.message : String(error)
    });
  } finally {
    await core.dispose();
    await integration.dispose();
  }

  return Object.freeze({
    module: "brain-core-part2",
    version: BRAIN_CORE_VERSION_PART2,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks.map(item => Object.freeze({ ...item })))
  });
}
