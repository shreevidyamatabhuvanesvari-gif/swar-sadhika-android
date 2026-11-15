/* Swar-Sadhika Nano Brain — Foundation Regression Suite Part 2. */

import { selfTest as testSecurity } from "./brain-security-part2.js";
import { selfTest as testStorage } from "./brain-storage-part2.js";
import { selfTest as testIntegration } from "./brain-integration-foundation-part2.js";

export const BRAIN_FOUNDATION_TEST_VERSION_PART2 = "1.0.0";

export async function selfTest() {
  const suites = [];
  for (const [name, run] of [
    ["Security Foundation", testSecurity],
    ["Storage Foundation", testStorage],
    ["Integration Foundation", testIntegration]
  ]) {
    try {
      const result = await run();
      suites.push({ name, status: result && result.status === "PASSED" ? "PASSED" : "FAILED",
        total: result && Number.isFinite(result.total) ? result.total : 0,
        passed: result && Number.isFinite(result.passed) ? result.passed : 0,
        failed: result && Number.isFinite(result.failed) ? result.failed : 1,
        checks: result && Array.isArray(result.checks) ? result.checks : [] });
    } catch (error) {
      suites.push({ name, status: "FAILED", total: 1, passed: 0, failed: 1,
        checks: [{ id: "suite-threw", passed: false, message: error && error.message ? error.message : String(error) }] });
    }
  }
  const total = suites.reduce((sum, suite) => sum + suite.total, 0);
  const passed = suites.reduce((sum, suite) => sum + suite.passed, 0);
  const failed = suites.reduce((sum, suite) => sum + suite.failed, 0);
  return Object.freeze({ module: "brain-foundation-selftest-part2", version: BRAIN_FOUNDATION_TEST_VERSION_PART2,
    status: failed === 0 ? "PASSED" : "FAILED", total, passed, failed,
    suites: Object.freeze(suites.map(suite => Object.freeze({ ...suite,
      checks: Object.freeze(suite.checks.map(check => Object.freeze({ ...check }))) }))) });
}
