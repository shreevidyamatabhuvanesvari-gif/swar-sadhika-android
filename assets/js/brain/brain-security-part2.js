/* Swar-Sadhika Nano Brain — Security Foundation Part 2.
 * Data-only skill metadata, explicit capability grants, safe JSON boundaries,
 * and digest verification. This module never imports or executes downloaded code.
 */

export const BRAIN_SECURITY_VERSION_PART2 = "1.0.0";

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/i;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i;
const CAPABILITIES = new Set([
  "memory.read", "memory.write", "knowledge.read", "knowledge.propose",
  "tts.speak", "audio.analyze", "microphone.read", "media.read",
  "filesystem.read", "filesystem.write", "model.inference", "avatar.control"
]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_JSON_DEPTH = 24;
const MAX_JSON_NODES = 12000;
const MAX_JSON_STRING_LENGTH = 262144;
const MAX_JSON_TOTAL_CHARS = 1048576;
const MANIFEST_SCHEMA = "swar-sadhika.brain.skill-registry";

export class BrainSecurityErrorPart2 extends Error {
  constructor(message, code = "BRAIN_SECURITY_ERROR") {
    super(message);
    this.name = "BrainSecurityErrorPart2";
    this.code = code;
  }
}

function fail(message, code) { throw new BrainSecurityErrorPart2(message, code); }

export function isSafeBrainIdPart2(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function assertSafeBrainIdPart2(value, label = "ID") {
  if (!isSafeBrainIdPart2(value)) fail(label + " अमान्य है।", "INVALID_ID");
  return value;
}

export function cloneSafeJsonPart2(value) {
  let nodes = 0;
  let totalChars = 0;
  function visit(input, depth) {
    nodes += 1;
    if (nodes > MAX_JSON_NODES) fail("डेटा में अनुमत सीमा से अधिक तत्व हैं।", "JSON_NODE_LIMIT");
    if (depth > MAX_JSON_DEPTH) fail("डेटा की nesting सीमा पार हुई।", "JSON_DEPTH_LIMIT");
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "string") {
      if (input.length > MAX_JSON_STRING_LENGTH) fail("पाठ का आकार अनुमत सीमा से अधिक है।", "JSON_STRING_LIMIT");
      totalChars += input.length;
      if (totalChars > MAX_JSON_TOTAL_CHARS) fail("कुल पाठ-आकार अनुमत सीमा से अधिक है।", "JSON_TOTAL_SIZE_LIMIT");
      return input;
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) fail("डेटा में अमान्य संख्या है।", "INVALID_JSON_NUMBER");
      return input;
    }
    if (Array.isArray(input)) {
      if (Object.getPrototypeOf(input) !== Array.prototype) fail("अपरिचित Array prototype अस्वीकृत है।", "NON_PLAIN_ARRAY");
      if (Object.getOwnPropertySymbols(input).length) fail("Symbol keys JSON डेटा में स्वीकार्य नहीं हैं।", "SYMBOL_KEY_REJECTED");
      const descriptors = Object.getOwnPropertyDescriptors(input);
      const keys = Object.keys(descriptors).filter(key => key !== "length");
      if (keys.length !== input.length || keys.some(key => !Number.isSafeInteger(Number(key)) || String(Number(key)) !== key || Number(key) >= input.length)) {
        fail("Sparse Array या अतिरिक्त properties अस्वीकृत हैं।", "INVALID_ARRAY_SHAPE");
      }
      const output = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set) {
          fail("Array में accessor या sparse element स्वीकार्य नहीं है।", "ARRAY_ACCESSOR_REJECTED");
        }
        output.push(visit(descriptor.value, depth + 1));
      }
      return output;
    }
    if (typeof input !== "object") fail("केवल JSON-संगत डेटा स्वीकार्य है।", "NON_JSON_VALUE");
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("केवल साधारण JSON object स्वीकार्य है।", "NON_PLAIN_OBJECT");
    }
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Object.getOwnPropertySymbols(input).length) fail("Symbol keys JSON डेटा में स्वीकार्य नहीं हैं।", "SYMBOL_KEY_REJECTED");
    const output = Object.create(null);
    for (const key of Object.keys(descriptors)) {
      if (FORBIDDEN_KEYS.has(key)) fail("संदिग्ध object key अस्वीकृत है।", "UNSAFE_OBJECT_KEY");
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.get || descriptor.set) {
        fail("केवल enumerable data properties स्वीकार्य हैं।", "ACCESSOR_REJECTED");
      }
      output[key] = visit(descriptor.value, depth + 1);
    }
    return output;
  }
  return visit(value, 0);
}

export function validateSkillManifestPart2(input) {
  const manifest = cloneSafeJsonPart2(input);
  if (!manifest || manifest.schema !== MANIFEST_SCHEMA || manifest.schemaVersion !== 1 || !Array.isArray(manifest.skills)) {
    fail("Skill Manifest का schema या version अमान्य है।", "INVALID_SKILL_MANIFEST");
  }
  if (manifest.skills.length > 128) fail("Skill Manifest में बहुत अधिक entries हैं।", "SKILL_LIMIT");
  const seen = new Set();
  const skills = manifest.skills.map((skill, index) => {
    if (!skill || typeof skill !== "object") fail("Skill entry अमान्य है: " + index, "INVALID_SKILL");
    assertSafeBrainIdPart2(skill.id, "Skill ID");
    if (seen.has(skill.id)) fail("दोहराया गया Skill ID: " + skill.id, "DUPLICATE_SKILL_ID");
    seen.add(skill.id);
    if (typeof skill.title !== "string" || !skill.title.trim() || skill.title.length > 120) {
      fail("Skill title अमान्य है: " + skill.id, "INVALID_SKILL_TITLE");
    }
    if (typeof skill.version !== "string" || !VERSION_PATTERN.test(skill.version)) {
      fail("Skill version अमान्य है: " + skill.id, "INVALID_SKILL_VERSION");
    }
    if (!Array.isArray(skill.capabilities) || skill.capabilities.length > 12) {
      fail("Skill capabilities अमान्य हैं: " + skill.id, "INVALID_CAPABILITIES");
    }
    const capabilities = [...new Set(skill.capabilities)];
    if (capabilities.some(item => !CAPABILITIES.has(item))) {
      fail("Skill में अज्ञात capability है: " + skill.id, "UNKNOWN_CAPABILITY");
    }
    if (!["low", "medium", "high"].includes(skill.risk)) {
      fail("Skill risk level अमान्य है: " + skill.id, "INVALID_RISK_LEVEL");
    }
    if (skill.execution !== "builtin" || Object.hasOwn(skill, "file") || Object.hasOwn(skill, "url") || Object.hasOwn(skill, "script")) {
      fail("केवल built-in, data-only Skill घोषणाएँ स्वीकार्य हैं।", "EXECUTABLE_SKILL_REJECTED");
    }
    return Object.freeze({
      id: skill.id, title: skill.title.trim(), version: skill.version, risk: skill.risk,
      capabilities: Object.freeze(capabilities), enabled: skill.enabled !== false
    });
  });
  return Object.freeze({ schema: MANIFEST_SCHEMA, schemaVersion: 1, skills: Object.freeze(skills) });
}

export function createCapabilityGatePart2(options = {}) {
  const requestedAllowed = options.allowedCapabilities || CAPABILITIES;
  const allowed = new Set(requestedAllowed);
  if ([...allowed].some(item => !CAPABILITIES.has(item))) {
    fail("Capability Gate में अज्ञात अनुमति सूचीबद्ध है।", "UNKNOWN_ALLOWED_CAPABILITY");
  }
  const grants = new Map();
  const windowRef = options.windowRef || globalThis.window;
  const EventConstructor = options.EventConstructor || globalThis.Event;
  let disposed = false;

  function assertActive() {
    if (disposed) fail("Capability Gate बंद किया जा चुका है।", "GATE_DISPOSED");
  }

  function requestGrant(capabilities, event) {
    assertActive();
    if (typeof EventConstructor !== "function" || !(event instanceof EventConstructor) ||
        event.isTrusted !== true || !["click", "pointerup", "keydown"].includes(event.type)) {
      fail("अनुमति के लिए वास्तविक, प्रत्यक्ष उपयोगकर्ता gesture आवश्यक है।", "USER_GESTURE_REQUIRED");
    }
    if (!Array.isArray(capabilities) || !capabilities.length) fail("कम-से-कम एक capability आवश्यक है।", "INVALID_GRANT");
    const accepted = [...new Set(capabilities)];
    if (accepted.some(item => !allowed.has(item))) fail("अनुमति सूची में अज्ञात capability है।", "UNKNOWN_CAPABILITY");
    if (!windowRef || typeof windowRef.confirm !== "function") {
      fail("इस browser में स्पष्ट अनुमति संवाद उपलब्ध नहीं है।", "CONFIRMATION_UNAVAILABLE");
    }
    const approved = windowRef.confirm("Swar-Sadhika Brain को निम्न स्थानीय क्षमता दें?\n\n" + accepted.join("\n") + "\n\nयह अनुमति केवल इस Browser Session तक रहेगी।");
    if (approved !== true) return Object.freeze([]);
    accepted.forEach(item => grants.set(item, Object.freeze({ grantedAt: Date.now(), source: "trusted-user-confirmation" })));
    return Object.freeze(accepted.slice());
  }

  function requireCapabilities(capabilities) {
    assertActive();
    const list = Array.isArray(capabilities) ? capabilities : [capabilities];
    const missing = list.filter(item => !grants.has(item));
    if (missing.length) fail("आवश्यक उपयोगकर्ता अनुमति उपलब्ध नहीं है: " + missing.join(", "), "CAPABILITY_DENIED");
    return true;
  }

  function revoke(capabilities) {
    assertActive();
    const list = Array.isArray(capabilities) ? capabilities : [capabilities];
    list.forEach(item => grants.delete(item));
    return true;
  }

  function diagnostics() {
    return Object.freeze({ disposed, grantedCapabilities: Object.freeze([...grants.keys()]),
      policy: "trusted-gesture-and-native-confirm", persistentGrants: false });
  }

  return Object.freeze({ requestGrant, require: requireCapabilities, revoke, diagnostics,
    dispose() { grants.clear(); disposed = true; } });
}

export async function sha256HexPart2(input, cryptoRef = globalThis.crypto) {
  if (!cryptoRef || !cryptoRef.subtle || typeof cryptoRef.subtle.digest !== "function") {
    fail("SHA-256 जाँच के लिए Web Crypto उपलब्ध नहीं है।", "CRYPTO_UNAVAILABLE");
  }
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await cryptoRef.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifySha256Part2(input, expectedHex, cryptoRef = globalThis.crypto) {
  if (typeof expectedHex !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHex)) {
    fail("अपेक्षित SHA-256 hash अमान्य है।", "INVALID_SHA256");
  }
  const actual = await sha256HexPart2(input, cryptoRef);
  return actual.toLowerCase() === expectedHex.toLowerCase();
}

export function selfTest() {
  const checks = [];
  const check = (id, passed) => checks.push({ id, passed: Boolean(passed) });
  try {
    check("safe-id-accepted", isSafeBrainIdPart2("memory.read"));
    check("unsafe-id-rejected", !isSafeBrainIdPart2("../escape"));
    const clean = cloneSafeJsonPart2({ answer: 42, nested: [true, "ok"] });
    check("json-data-cloned", clean.answer === 42 && clean.nested.length === 2);
    let arrayGetterRejected = false;
    const unsafeArray = [];
    Object.defineProperty(unsafeArray, "0", { enumerable: true, get() { throw new Error("array getter executed"); } });
    unsafeArray.length = 1;
    try { cloneSafeJsonPart2(unsafeArray); } catch (error) { arrayGetterRejected = error.code === "ARRAY_ACCESSOR_REJECTED"; }
    check("array-accessor-rejected-without-execution", arrayGetterRejected);
    let sparseArrayRejected = false;
    try { cloneSafeJsonPart2(new Array(2)); } catch (error) { sparseArrayRejected = error.code === "INVALID_ARRAY_SHAPE"; }
    check("sparse-array-rejected", sparseArrayRejected);
    let rejected = false;
    try { cloneSafeJsonPart2(JSON.parse('{"__proto__":{"polluted":true}}')); } catch (error) { rejected = error.code === "UNSAFE_OBJECT_KEY"; }
    check("prototype-pollution-key-rejected", rejected);
    let accessorRejected = false;
    try { const value = {}; Object.defineProperty(value, "x", { enumerable: true, get() { throw new Error("getter executed"); } }); cloneSafeJsonPart2(value); }
    catch (error) { accessorRejected = error.code === "ACCESSOR_REJECTED"; }
    check("accessor-properties-rejected-without-execution", accessorRejected);
    let manifestRejected = false;
    try { validateSkillManifestPart2({ schema: MANIFEST_SCHEMA, schemaVersion: 1, skills: [{ id: "bad", title: "Bad", version: "1.0.0", risk: "low", capabilities: [], execution: "builtin", file: "./remote.js" }] }); }
    catch (error) { manifestRejected = error.code === "EXECUTABLE_SKILL_REJECTED"; }
    check("manifest-executable-path-rejected", manifestRejected);
    const valid = validateSkillManifestPart2({ schema: MANIFEST_SCHEMA, schemaVersion: 1, skills: [{ id: "memory.read", title: "Read memory", version: "1.0.0", risk: "low", capabilities: ["memory.read"], execution: "builtin" }] });
    check("valid-data-only-manifest-accepted", valid.skills.length === 1);
    let denied = false;
    const gate = createCapabilityGatePart2();
    try { gate.require("memory.read"); } catch (error) { denied = error.code === "CAPABILITY_DENIED"; }
    check("capability-denied-by-default", denied);
    let gestureRequired = false;
    try { gate.requestGrant(["memory.read"], { type: "click", isTrusted: true }); }
    catch (error) { gestureRequired = error.code === "USER_GESTURE_REQUIRED"; }
    check("forged-user-gesture-rejected", gestureRequired);
    let deniedAgain = false;
    try { gate.require("memory.read"); } catch (error) { deniedAgain = error.code === "CAPABILITY_DENIED"; }
    check("capability-remains-denied-without-trusted-grant", deniedAgain);
    gate.dispose();
  } catch (_) { check("security-self-test-unexpected-error", false); }
  return Object.freeze({ module: "brain-security-part2", status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length, passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length, checks: Object.freeze(checks) });
}
