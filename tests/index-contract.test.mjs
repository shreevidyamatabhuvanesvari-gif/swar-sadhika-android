import test from "node:test";
import assert from "node:assert/strict";
import { workspaceIndex } from "../app/indexes/index-1-workspace.js";
import { voiceIndex } from "../app/indexes/index-2-voice-chant.js";
import { learningIndex } from "../app/indexes/index-3-learning.js";
import { avatarIndex } from "../app/indexes/index-4-avatar-video.js";

const expected = [
  [workspaceIndex, "workspace", ["dashboard","text-studio","library","learning-notes","engine-status","model-management","learning-history","settings","backup-restore"]],
  [voiceIndex, "voice", ["neural-female-voice","hindi-pronunciation","sanskrit-pronunciation","vedic-pronunciation","mantra-shloka","chant-prosody","singing-synthesis","voice-profiles","audio-generator","audio-player","audio-export"]],
  [learningIndex, "learning", ["gallery-audio","gallery-video","youtube-reference","audio-analysis","pitch-analysis","tempo-analysis","rhythm-analysis","singing-style","learning-brain","learning-memory","adaptation","body-language-learning","training-status"]],
  [avatarIndex, "avatar", ["personal-avatar","avatar-renderer","face-animation","mouth-animation","phoneme-alignment","viseme-mapping","lip-sync","facial-expression","body-language","caption","video-composition","video-export"]]
];

test("exactly four primary indexes are registered", () => {
  assert.deepEqual(expected.map(([index]) => index.id), ["workspace","voice","learning","avatar"]);
});

test("all 45 specified submodules exist exactly once and have content", () => {
  const allIds = [];
  for (const [index, id, ids] of expected) {
    assert.equal(index.id, id);
    assert.deepEqual(index.modules.map(item => item.id), ids, id + " module contract mismatch");
    assert.equal(new Set(ids).size, ids.length, id + " expected IDs contain duplicates");
    for (const module of index.modules) {
      assert.ok(module.title && module.description && module.content, id + "/" + module.id + " is incomplete");
      allIds.push(module.id);
    }
  }
  assert.equal(allIds.length, 45);
  assert.equal(new Set(allIds).size, 45, "Sub-module IDs must be globally unique");
});
