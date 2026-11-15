/* Swar-Sadhika Nano Brain — Foundation Regression Suite Part 2.
 * Aggregates the real self-tests exported by the Security, Storage,
 * Integration and Nano Brain Page modules.
 *
 * This file does not replace those tests, mock their results, or claim
 * Android-device / Strict-Offline certification. A suite fails if its
 * real selfTest throws, reports a failed assertion, or returns an invalid
 * result contract. Environment-dependent skipped checks remain visible.
 */

import { selfTest as runSecuritySelfTest } from "./brain-security-part2.js";
import { selfTest as runStorageSelfTest } from "./brain-storage-part2.js";
import { selfTest as runIntegrationSelfTest } from "./brain-integration-foundation-part2.js";
import { selfTest as runBrainCoreSelfTest } from "./brain-core-part2.js";
import { selfTest as runBrainMemorySelfTest } from "./brain-memory-engine-part2.js";
import { selfTest as runNanoBrainPageSelfTest } from "../pages/page-nano-brain-part2.js";

export const BRAIN_FOUNDATION_SELFTEST_VERSION_PART2 = "1.1.0";

const SUITES = Object.freeze([
  Object.freeze({
    id: "security",
    name: "Security Foundation",
    run: runSecuritySelfTest
  }),
  Object.freeze({
    id: "storage",
    name: "Storage Foundation",
    run: runStorageSelfTest
  }),
  Object.freeze({
    id: "integration",
    name: "Integration Foundation",
    run: runIntegrationSelfTest
  }),
  Object.freeze({
    id: "brain-core",
    name: "Central Brain Core",
    run: runBrainCoreSelfTest
  }),
  Object.freeze({
    id: "brain-memory",
    name: "Central Brain Memory Engine",
    run: runBrainMemorySelfTest
  }),
  Object.freeze({
    id: "nano-brain-page",
    name: "Nano Brain Page",
    run: runNanoBrainPageSelfTest
  })
]);

function normalizeFailure(name, error) {
  const message = error && error.message ? error.message : String(error);
  return Object.freeze({
    id: name + "-selftest-threw",
    passed: false,
    message
  });
}

function validateSuiteResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { valid: false, reason: "Self-Test ने object result नहीं दिया।" };
  }

  if (result.status !== "PASSED" && result.status !== "FAILED") {
    return { valid: false, reason: "Self-Test status केवल PASSED या FAILED होना चाहिए।" };
  }

  if (!Number.isInteger(result.total) || result.total < 0 ||
      !Number.isInteger(result.passed) || result.passed < 0 ||
      !Number.isInteger(result.failed) || result.failed < 0) {
    return { valid: false, reason: "Self-Test counters वैध non-negative integers नहीं हैं।" };
  }

  if (result.passed + result.failed !== result.total) {
    return { valid: false, reason: "Self-Test counters का योग total से मेल नहीं खाता।" };
  }

  if (!Array.isArray(result.checks) || result.checks.length !== result.total) {
    return { valid: false, reason: "Self-Test checks array और total में अंतर है।" };
  }

  const malformed = result.checks.some(check =>
    !check || typeof check !== "object" ||
    typeof check.id !== "string" ||
    typeof check.passed !== "boolean"
  );
  if (malformed) {
    return { valid: false, reason: "Self-Test में malformed assertion entry है।" };
  }

  const actualPassed = result.checks.filter(check => check.passed).length;
  const actualFailed = result.checks.length - actualPassed;
  if (actualPassed !== result.passed || actualFailed !== result.failed) {
    return { valid: false, reason: "Self-Test counters वास्तविक assertion results से मेल नहीं खाते।" };
  }

  if ((result.status === "PASSED") !== (actualFailed === 0)) {
    return { valid: false, reason: "Self-Test status वास्तविक failed assertions से मेल नहीं खाता।" };
  }

  return { valid: true };
}

async function runSuite(suite) {
  let result;
  try {
    result = await Promise.resolve().then(() => suite.run());
  } catch (error) {
    const failure = normalizeFailure(suite.id, error);
    return Object.freeze({
      id: suite.id,
      name: suite.name,
      status: "FAILED",
      total: 1,
      passed: 0,
      failed: 1,
      skipped: Object.freeze([]),
      checks: Object.freeze([failure]),
      error: failure.message
    });
  }

  const validation = validateSuiteResult(result);
  if (!validation.valid) {
    const failure = Object.freeze({
      id: suite.id + "-invalid-result-contract",
      passed: false,
      message: validation.reason
    });
    return Object.freeze({
      id: suite.id,
      name: suite.name,
      status: "FAILED",
      total: 1,
      passed: 0,
      failed: 1,
      skipped: Object.freeze([]),
      checks: Object.freeze([failure]),
      error: validation.reason
    });
  }

  const skipped = Array.isArray(result.skipped)
    ? result.skipped.map(item => String(item))
    : [];

  return Object.freeze({
    id: suite.id,
    name: suite.name,
    status: result.status,
    module: typeof result.module === "string" ? result.module : suite.id,
    version: typeof result.version === "string" ? result.version : null,
    total: result.total,
    passed: result.passed,
    failed: result.failed,
    skipped: Object.freeze(skipped),
    checks: Object.freeze(result.checks.map(check => Object.freeze({
      id: check.id,
      passed: check.passed,
      ...(typeof check.message === "string" ? { message: check.message } : {})
    })))
  });
}

function detectRuntime() {
  const host = typeof globalThis === "object" ? globalThis : {};
  const navigatorRef = host.navigator || null;
  const userAgent = navigatorRef && typeof navigatorRef.userAgent === "string"
    ? navigatorRef.userAgent
    : "";

  return Object.freeze({
    browserRuntime: Boolean(host.window && host.document),
    indexedDBAvailable: Boolean(host.indexedDB && typeof host.indexedDB.open === "function"),
    cryptoSubtleAvailable: Boolean(host.crypto && host.crypto.subtle),
    userAgentAvailable: Boolean(userAgent),
    androidUserAgentHint: /Android/i.test(userAgent),
    androidChromeCertified: false,
    strictOfflineCertified: false
  });
}

export async function selfTest() {
  const suites = [];

  // Sequential execution avoids concurrent access to the same browser APIs
  // and makes failure order deterministic.
  for (const suite of SUITES) {
    suites.push(await runSuite(suite));
  }

  const total = suites.reduce((sum, suite) => sum + suite.total, 0);
  const passed = suites.reduce((sum, suite) => sum + suite.passed, 0);
  const failed = suites.reduce((sum, suite) => sum + suite.failed, 0);
  const skipped = suites.flatMap(suite =>
    suite.skipped.map(item => suite.name + ": " + item)
  );

  const runtime = detectRuntime();
  const status = failed === 0 ? "PASSED" : "FAILED";

  return Object.freeze({
    module: "brain-foundation-selftest-part2",
    version: BRAIN_FOUNDATION_SELFTEST_VERSION_PART2,
    status,
    total,
    passed,
    failed,
    suiteCount: suites.length,
    passedSuites: suites.filter(suite => suite.status === "PASSED").length,
    failedSuites: suites.filter(suite => suite.status === "FAILED").length,
    skipped,
    coverage: Object.freeze({
      result: skipped.length ? "PARTIAL_ENVIRONMENT_COVERAGE" : "ALL_AVAILABLE_CHECKS_EXECUTED",
      note: skipped.length
        ? "कुछ environment-dependent checks उपलब्ध API के अभाव में skip हुए हैं; उन्हें PASS नहीं गिना गया।"
        : "सभी उपलब्ध self-test assertions चलाए गए।",
      runtime
    }),
    certification: Object.freeze({
      androidChrome: "NOT_CERTIFIED",
      coldStartOnAndroid: "NOT_CERTIFIED",
      strictOffline: "NOT_CERTIFIED",
      symbolicReasoning: "NOT_INSTALLED",
      neuralModelRuntime: "NOT_INSTALLED",
      voiceTraining: "NOT_INSTALLED",
      singingGeneration: "NOT_INSTALLED"
    }),
    suites: Object.freeze(suites)
  });
}

export async function assertBrainFoundationSelfTestPart2() {
  const result = await selfTest();
  if (result.status !== "PASSED" || result.failed !== 0) {
    const summary = result.suites
      .filter(suite => suite.status !== "PASSED")
      .map(suite => suite.name + ": " + suite.failed + "/" + suite.total + " failed")
      .join("; ");
    const error = new Error("Nano Brain Foundation Regression failed. " + summary);
    error.name = "BrainFoundationSelfTestErrorPart2";
    error.result = result;
    throw error;
  }
  return result;
}
