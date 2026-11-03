import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDevanagariText, analyzeDevanagariText } from "../app/core/devanagari-parser.js";
import { LANGUAGE_MODES, resolveLanguageVoices } from "../app/core/language-modes.js";
import { normalizeStoredText, STORAGE_INFO } from "../app/core/storage.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = file => readFile(path.join(root, file), "utf8");

test("the shell declares exactly four primary Indexes with matching panels", async () => {
  const html = await read("index.html");
  const targets = [...html.matchAll(/data-index-target="([^"]+)"/g)].map(x => x[1]);
  const panels = [...html.matchAll(/data-index-panel="([^"]+)"/g)].map(x => x[1]);
  assert.deepEqual(targets, ["workspace", "voice", "learning", "avatar"]);
  assert.deepEqual(panels, targets);
  assert.equal(new Set(targets).size, 4);
  const scripts = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map(x => x[1]);
  assert.deepEqual(scripts, ["./app.js?v=0.9.0"]);
});

test("every declared Sub-Module has one owner panel and unique target", async () => {
  const html = await read("index.html");
  const targets = [...html.matchAll(/data-index-owner="([^"]+)" data-submodule-target="([^"]+)"/g)]
    .map(match => ({ owner: match[1], target: match[2] }));
  const panels = [...html.matchAll(/data-index-owner="([^"]+)" data-submodule-panel="([^"]+)"/g)]
    .map(match => ({ owner: match[1], target: match[2] }));
  assert.ok(targets.length >= 15);
  assert.deepEqual(
    targets.map(x => x.owner + "/" + x.target).sort(),
    panels.map(x => x.owner + "/" + x.target).sort()
  );
  assert.equal(new Set(targets.map(x => x.owner + "/" + x.target)).size, targets.length);
});

test("all HTML IDs are unique and required integration IDs exist", async () => {
  const html = await read("index.html");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate HTML id found");
  for (const id of [
    "sourceText", "languageMode", "settingsLanguageMode", "savedTextsList",
    "savedMediaList", "savedLearningList", "learningNoteInput", "avatarPhoto",
    "mediaFileInput", "dashboardCapabilitiesList", "moduleSummary", "appToast"
  ]) assert.ok(ids.includes(id), "missing DOM id: " + id);
});

test("all relative static JavaScript imports resolve to repository files", async () => {
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) result.push(...await walk(full));
      else if (entry.isFile() && entry.name.endsWith(".js")) result.push(full);
    }
    return result;
  }
  const files = await walk(root);
  const missing = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const imports = [...source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)];
    for (const match of imports) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) continue;
      const clean = specifier.split("?")[0];
      const resolved = path.resolve(path.dirname(file), clean);
      try { await readFile(resolved); }
      catch { missing.push(path.relative(root, file) + " -> " + specifier); }
    }
  }
  assert.deepEqual(missing, []);
});

test("Devanagari normalization preserves Sanskrit and normalizes Unicode", () => {
  const source = "ॐ नमः शिवाय।\r\nसर्वे  भवन्तु सुखिनः॥";
  const normalized = normalizeDevanagariText(source);
  assert.equal(normalized, "ॐ नमः शिवाय।\nसर्वे भवन्तु सुखिनः॥");
  assert.equal(normalized.normalize("NFC"), normalized);
  assert.equal(normalizeStoredText("अ\r\nआ"), "अ\nआ");
});

test("Devanagari analysis returns stable non-empty metrics", () => {
  const result = analyzeDevanagariText("ॐ नमः शिवाय।\nसर्वे भवन्तु सुखिनः॥");
  assert.ok(result.wordCount >= 6);
  assert.ok(result.aksharaCount > 0);
  assert.ok(result.consonantCount > 0);
  assert.ok(result.punctuationCount >= 2);
  assert.ok(Array.isArray(result.issues));
});

test("three required language modes and honest fallback selection are preserved", () => {
  assert.deepEqual(Object.keys(LANGUAGE_MODES).sort(), ["hindi", "sanskrit", "vedic"]);
  assert.equal(LANGUAGE_MODES.vedic.speechLang, "sa-IN");
  assert.equal(LANGUAGE_MODES.sanskrit.speechLang, "sa-IN");
  assert.equal(LANGUAGE_MODES.hindi.speechLang, "hi-IN");
  const voices = [{ lang: "hi-IN", name: "Hindi test voice" }];
  assert.equal(resolveLanguageVoices(voices, "sanskrit").path, "hindi-fallback");
  assert.equal(resolveLanguageVoices([], "sanskrit").path, "unavailable");
});

test("IndexedDB migration retains existing stores and adds settings at schema version 4", async () => {
  const source = await read("app/core/storage.js");
  assert.match(source, /const DB_VERSION = 4/);
  for (const store of ["texts", "mediaNotes", "learningNotes", "avatarPhotos", "settings"]) {
    assert.ok(source.includes('"'+store+'"'), "missing store " + store);
  }
  assert.deepEqual(STORAGE_INFO.stores, ["texts", "mediaNotes", "learningNotes", "settings", "avatarPhotos"]);
  assert.doesNotMatch(source, /deleteDatabase\s*\(/);
});

test("service worker shell contains Part 1 modules and isolates cache namespace", async () => {
  const sw = await read("sw.js");
  for (const file of [
    "app/features/navigation.js", "app/features/dashboard.js",
    "app/features/app-settings.js", "app/features/learning-notes.js",
    "app/core/device-capabilities.js"
  ]) assert.ok(sw.includes(file), "service worker shell missing " + file);
  assert.match(sw, /swar-sadhika-android-v9/);
  assert.match(sw, /const old = names\.filter\(name =>[\s\S]*?LEGACY_CACHE_NAMES\.has\(name\)/);
  assert.match(sw, /old\.map\(name => caches\.delete\(name\)\)/);
});

test("four Indexes are not represented as five legacy primary views", async () => {
  const html = await read("index.html");
  assert.doesNotMatch(html, /data-view=/);
  assert.equal((html.match(/data-index-target=/g) || []).length, 4);
});
