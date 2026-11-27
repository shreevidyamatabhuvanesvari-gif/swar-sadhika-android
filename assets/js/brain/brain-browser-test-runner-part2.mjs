import { chromium } from "playwright";
import { createServer } from "node:http";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative, resolve, sep } from "node:path";

const REPOSITORY_ROOT = resolve(process.env.BRAIN_REPO_ROOT || process.cwd());
const TEST_PAGE = "assets/js/brain/brain-browser-test-part2.html";
const STORAGE_MODULE = "assets/js/brain/brain-storage-part2.js";
const SECURITY_MODULE = "assets/js/brain/brain-security-part2.js";
const CHROME_PATH = process.env.CHROME_PATH;
const TEST_TIMEOUT_MS = Number.parseInt(process.env.BRAIN_TEST_TIMEOUT_MS || "90000", 10);

const REQUIRED_PHASE_CHECKS = Object.freeze({
  write: [
    "secure-context-and-required-browser-apis",
    "test-database-reset",
    "legacy-v1-database-created-and-closed",
    "native-indexeddb-v2-migration",
    "non-destructive-v1-data-migration",
    "record-metadata-event-write",
    "event-history-is-append-only",
    "bounded-record-list",
    "checksummed-backup-tamper-rejection",
    "storage-quota-and-persistence-diagnostics",
    "storage-connection-closed-after-write"
  ],
  read: [
    "secure-context-and-required-browser-apis",
    "persisted-database-reopened",
    "coldstart-record-metadata-event-recovered",
    "legacy-v1-data-still-present-after-reopen",
    "reopened-storage-diagnostics",
    "test-database-cleanup"
  ],
  all: [
    "secure-context-and-required-browser-apis",
    "test-database-reset",
    "legacy-v1-database-created-and-closed",
    "native-indexeddb-v2-migration",
    "non-destructive-v1-data-migration",
    "record-metadata-event-write",
    "event-history-is-append-only",
    "bounded-record-list",
    "checksummed-backup-tamper-rejection",
    "storage-quota-and-persistence-diagnostics",
    "storage-connection-closed-after-write",
    "persisted-database-reopened",
    "coldstart-record-metadata-event-recovered",
    "legacy-v1-data-still-present-after-reopen",
    "reopened-storage-diagnostics",
    "test-database-cleanup"
  ]
});

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
});

function log(message, detail = undefined) {
  if (detail === undefined) {
    console.log(message);
  } else {
    console.log(message + " " + JSON.stringify(detail));
  }
}

function fail(message, details = undefined) {
  const error = new Error(message);
  error.name = "BrainBrowserTestRunnerErrorPart2";
  if (details !== undefined) error.details = details;
  throw error;
}

async function verifyPrerequisites() {
  if (!CHROME_PATH) {
    fail("CHROME_PATH is required. Point it to the installed Chrome/Chromium executable; the runner will not silently substitute another browser.");
  }

  try {
    await access(CHROME_PATH, fsConstants.X_OK);
  } catch (error) {
    fail("Chrome executable is missing or not executable: " + CHROME_PATH, error.message);
  }

  const requiredPaths = [TEST_PAGE, STORAGE_MODULE, SECURITY_MODULE];
  for (const item of requiredPaths) {
    const absolute = resolve(REPOSITORY_ROOT, item);
    try {
      const info = await stat(absolute);
      if (!info.isFile()) fail("Required test dependency is not a file: " + item);
    } catch (error) {
      fail("Required test dependency is unavailable: " + item, error.message);
    }
  }

  if (!Number.isInteger(TEST_TIMEOUT_MS) || TEST_TIMEOUT_MS < 1000 || TEST_TIMEOUT_MS > 300000) {
    fail("BRAIN_TEST_TIMEOUT_MS must be an integer between 1000 and 300000.");
  }
}

function isInsideRoot(root, target) {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith(".." + sep) && rel !== ".." && !rel.startsWith(sep));
}

async function startLocalServer() {
  const root = REPOSITORY_ROOT;
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" });
      response.end("Method Not Allowed");
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
    } catch (_) {
      response.writeHead(400);
      response.end("Bad Request");
      return;
    }

    if (pathname === "/favicon.ico") {
      response.writeHead(204, { "cache-control": "no-store" });
      response.end();
      return;
    }
    if (pathname === "/") pathname = "/" + TEST_PAGE;

    const target = resolve(root, "." + pathname);
    if (!isInsideRoot(root, target)) {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    try {
      const info = await stat(target);
      if (!info.isFile()) throw new Error("Not a file");
      const body = await readFile(target);
      response.writeHead(200, {
        "content-type": MIME_TYPES[extname(target).toLowerCase()] || "application/octet-stream",
        "content-length": body.length,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer"
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (_) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not Found");
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    fail("Local test server did not return a TCP address.");
  }

  return {
    server,
    origin: "http://127.0.0.1:" + address.port,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close(error => error ? rejectClose(error) : resolveClose());
    })
  };
}

async function launchIsolatedChrome(profileDirectory, origin) {
  const context = await chromium.launchPersistentContext(profileDirectory, {
    executablePath: CHROME_PATH,
    headless: true,
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    acceptDownloads: false,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--no-first-run"
    ]
  });

  const browser = context.browser();
  const state = {
    pageErrors: [],
    externalRequests: [],
    failedLocalResponses: [],
    browserDisconnected: false
  };

  if (browser) {
    browser.on("disconnected", () => {
      state.browserDisconnected = true;
    });
  }

  await context.route("**/*", async route => {
    let url;
    try {
      url = new URL(route.request().url());
    } catch (_) {
      state.externalRequests.push(route.request().url());
      await route.abort();
      return;
    }

    if (url.origin !== origin) {
      state.externalRequests.push(url.href);
      await route.abort();
      return;
    }

    await route.continue();
  });

  const page = await context.newPage();
  page.on("pageerror", error => state.pageErrors.push(error.message));
  page.on("response", response => {
    if (response.url().startsWith(origin) && response.status() >= 400) {
      state.failedLocalResponses.push({
        url: response.url(),
        status: response.status()
      });
    }
  });

  return { context, browser, page, state };
}

async function closeChromeProcess(instance) {
  if (!instance) return;
  await instance.context.close();

  if (instance.browser && !instance.state.browserDisconnected) {
    await new Promise((resolveWait, rejectWait) => {
      const timeout = setTimeout(() => {
        rejectWait(new Error("Chrome process did not disconnect after its persistent context was closed."));
      }, 10000);
      instance.browser.once("disconnected", () => {
        clearTimeout(timeout);
        resolveWait();
      });
    });
  }
}

async function collectPhaseResult(page, phase, state) {
  await page.waitForFunction(() => {
    const summary = document.querySelector("#summary");
    return Boolean(
      document.documentElement.dataset.auditComplete === "true" &&
      summary && /^(PASSED|FAILED) — /.test(summary.textContent.trim())
    );
  }, null, { timeout: TEST_TIMEOUT_MS });

  const result = await page.evaluate(() => {
    const summaryNode = document.querySelector("#summary");
    const rows = [...document.querySelectorAll("#results tr")];
    const checks = [];
    const skipped = [];

    for (const row of rows) {
      const cells = [...row.querySelectorAll("td")];
      if (cells.length !== 3) continue;
      const item = {
        id: cells[0].textContent.trim(),
        status: cells[1].textContent.trim(),
        detail: cells[2].textContent.trim()
      };
      if (item.status === "SKIPPED") skipped.push(item);
      else checks.push(item);
    }

    let report = null;
    const raw = document.querySelector("#log")?.textContent || "";
    try { report = JSON.parse(raw); } catch (_) {}

    return {
      summary: summaryNode?.textContent?.trim() || "",
      status: report?.status || (/^PASSED/.test(summaryNode?.textContent || "") ? "PASSED" : "FAILED"),
      checks,
      skipped,
      report
    };
  });

  if (result.status !== "PASSED") {
    fail("Browser page reported a failed phase: " + phase, result);
  }

  const checkMap = new Map(result.checks.map(item => [item.id, item]));
  const missing = REQUIRED_PHASE_CHECKS[phase].filter(id => !checkMap.has(id));
  const failed = result.checks.filter(item => item.status !== "PASS");
  if (missing.length || failed.length) {
    fail("Browser phase did not meet its required assertions: " + phase, {
      missing,
      failed,
      result
    });
  }

  if (state.pageErrors.length || state.externalRequests.length || state.failedLocalResponses.length) {
    fail("Browser runtime emitted errors or attempted unexpected network requests: " + phase, {
      pageErrors: state.pageErrors,
      externalRequests: state.externalRequests,
      failedLocalResponses: state.failedLocalResponses
    });
  }

  return {
    phase,
    status: "PASSED",
    summary: result.summary,
    assertions: result.checks.length,
    passed: result.checks.length,
    failed: 0,
    skipped: result.skipped.map(item => item.id),
    userAgent: await page.evaluate(() => navigator.userAgent),
    indexedDBAvailable: await page.evaluate(() => Boolean(indexedDB && indexedDB.open)),
    browserProcessDisconnectedAfterClose: null
  };
}


function createVoiceStudioFixtureWav(durationSeconds = 4, sampleRate = 44100) {
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const dataBytes = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const fadeIn = Math.min(1, time / 0.12);
    const fadeOut = Math.min(1, (durationSeconds - time) / 0.15);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.2 * time);
    const fundamental = 245 * vibrato;
    const voiced =
      0.42 * Math.sin(2 * Math.PI * fundamental * time) +
      0.21 * Math.sin(2 * Math.PI * fundamental * 2 * time) +
      0.11 * Math.sin(2 * Math.PI * fundamental * 3 * time) +
      0.055 * Math.sin(2 * Math.PI * fundamental * 4 * time);
    const pulse = 0.92 + 0.08 * Math.sin(2 * Math.PI * 2.8 * time);
    const sample = Math.max(-0.92, Math.min(0.92, voiced * envelope * pulse));
    wav.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
  }

  return wav;
}

async function runVoiceStudioBrowserAudit({ profileDirectory, origin }) {
  const instance = await launchIsolatedChrome(profileDirectory, origin);
  const page = instance.page;
  const hostSelector = "#swar-sadhika-universal-voice-studio-part2";
  const phrase = "ॐ नमः शिवाय";
  const milestones = [];
  let closeError = null;
  let result = null;

  page.on("console", message => {
    if (message.type() === "error") {
      instance.state.consoleErrors ||= [];
      instance.state.consoleErrors.push(message.text());
    }
  });

  async function waitForBankText(text, timeout = TEST_TIMEOUT_MS) {
    await page.waitForFunction(({ selector, expected }) => {
      const host = document.querySelector(selector);
      const node = host && host.shadowRoot && host.shadowRoot.querySelector(".bank-status");
      return Boolean(node && node.textContent.includes(expected));
    }, { selector: hostSelector, expected: text }, { timeout });
  }

  try {
    const url = origin + "/index.html?voice-studio-chromium-audit=1";
    log("Opening Voice Studio in Chromium:", { url });
    const response = await page.goto(url, { waitUntil: "load", timeout: TEST_TIMEOUT_MS });
    if (!response || response.status() !== 200) {
      fail("Main app index.html did not load in Chromium.", {
        status: response ? response.status() : null,
        url
      });
    }
    await page.locator(hostSelector).waitFor({ state: "attached", timeout: TEST_TIMEOUT_MS });
    const host = page.locator(hostSelector);

    await host.locator(".launch").click();
    await host.locator(".panel:not([hidden])").waitFor({ state: "visible" });
    milestones.push("main-app-and-shared-voice-studio-mounted");

    const fileBuffer = createVoiceStudioFixtureWav(4, 44100);
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      host.locator(".audio-files").click()
    ]);
    await fileChooser.setFiles({
      name: "chromium-voice-studio-fixture.wav",
      mimeType: "audio/wav",
      buffer: fileBuffer
    });

    await waitForBankText("1 रिकॉर्डिंग निजी IndexedDB में सुरक्षित हुईं");
    milestones.push("audio-import-decoded-and-stored-in-indexeddb");

    await host.locator(".wave-hint").waitFor({ state: "visible" });
    await host.locator(".unit-start").fill("0.20");
    await host.locator(".unit-end").fill("3.80");
    await host.locator(".unit-label").fill(phrase);
    await host.locator(".unit-save").click();
    await waitForBankText("का रिकॉर्ड किया हुआ नमूना");
    milestones.push("waveform-selection-and-whole-mantra-annotation-saved");

    const savedUnit = host.locator(".unit-list .bank-item").filter({ hasText: phrase });
    await savedUnit.waitFor({ state: "visible" });
    if (await savedUnit.count() !== 1) {
      fail("Expected exactly one complete-mantra recording unit in the Voice Studio list.");
    }
    milestones.push("saved-mantra-unit-visible-in-studio");

    // Reload the actual app origin to verify that the original Blob and annotation
    // survive a page restart, then invoke recorded-unit playback from the UI.
    await page.reload({ waitUntil: "load", timeout: TEST_TIMEOUT_MS });
    await page.locator(hostSelector).waitFor({ state: "attached", timeout: TEST_TIMEOUT_MS });
    const reloadedHost = page.locator(hostSelector);
    await reloadedHost.locator(".launch").click();
    await reloadedHost.locator(".panel:not([hidden])").waitFor({ state: "visible" });
    await waitForBankText("1 निजी रिकॉर्डिंग · 1 चिह्नित अक्षर-नमूने इस उपकरण में सुरक्षित हैं।");
    milestones.push("recording-and-annotation-restored-after-page-reload");

    const moduleReport = await page.evaluate(async () => {
      const [voiceEngine, studio] = await Promise.all([
        import("/modules/omnivoice-local-part2/local-voice-engine-part2.js"),
        import("/modules/voice-studio-part2.js")
      ]);
      const selfTest = await voiceEngine.selfTest();
      return {
        controllerImported: typeof voiceEngine.createLocalOmniVoiceEngine === "function",
        studioImported: typeof studio.mountSharedVoiceStudioPart2 === "function",
        selfTest
      };
    });
    if (!moduleReport.controllerImported || !moduleReport.studioImported || moduleReport.selfTest.failed) {
      fail("Local OmniVoice controller or Voice Studio module failed to import/self-test.", moduleReport);
    }
    milestones.push("local-omnivoice-controller-and-studio-imported");

    const workerReport = await page.evaluate(async () => {
      async function checkWorker(url) {
        return await new Promise((resolve, reject) => {
          const worker = new Worker(url, { type: "module" });
          const timer = setTimeout(() => { worker.terminate(); resolve("loaded"); }, 1200);
          worker.onerror = event => {
            clearTimeout(timer);
            worker.terminate();
            reject(new Error(url + ": " + event.message));
          };
        });
      }
      return {
        ttsWorker: await checkWorker("/modules/omnivoice-local-part2/tts-worker-part2.js"),
        encoderWorker: await checkWorker("/modules/omnivoice-local-part2/encoder-worker-part2.js")
      };
    });
    if (workerReport.ttsWorker !== "loaded" || workerReport.encoderWorker !== "loaded") {
      fail("A local OmniVoice worker failed to load.", workerReport);
    }
    milestones.push("tts-and-reference-encoder-workers-loaded");

    await reloadedHost.locator(".bank-sing").click();
    await page.waitForFunction(({ selector, expected }) => {
      const host = document.querySelector(selector);
      const node = host && host.shadowRoot && host.shadowRoot.querySelector(".status");
      return Boolean(node && node.textContent.includes(expected));
    }, { selector: hostSelector, expected: "पहले सहेली की रिकॉर्डिंग से voice profile तैयार करें" }, { timeout: TEST_TIMEOUT_MS });
    milestones.push("new-text-playback-requires-a-prepared-friend-voice-profile");

    const browserReport = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      secureContext: isSecureContext,
      indexedDBAvailable: Boolean(indexedDB && indexedDB.open),
      audioContextAvailable: Boolean(window.AudioContext || window.webkitAudioContext),
      localOrigin: location.origin
    }));

    if (instance.state.pageErrors.length ||
        instance.state.externalRequests.length ||
        instance.state.failedLocalResponses.length ||
        (instance.state.consoleErrors || []).length) {
      fail("Voice Studio browser runtime reported errors, failed local files, or external network requests.", {
        pageErrors: instance.state.pageErrors,
        consoleErrors: instance.state.consoleErrors || [],
        externalRequests: instance.state.externalRequests,
        failedLocalResponses: instance.state.failedLocalResponses
      });
    }

    result = {
      test: "Swar-Sadhika Voice Studio Browser E2E",
      status: "PASSED",
      browser: "Playwright Headless Chromium",
      browserReport,
      milestones,
      assertions: milestones.length,
      passed: milestones.length,
      failed: 0,
      pageErrors: instance.state.pageErrors,
      consoleErrors: instance.state.consoleErrors || [],
      externalNetworkRequests: instance.state.externalRequests.length,
      failedLocalResponses: instance.state.failedLocalResponses
    };
  } finally {
    try {
      await closeChromeProcess(instance);
    } catch (error) {
      closeError = error;
    }
  }

  if (closeError) {
    fail("Chrome did not shut down cleanly after the Voice Studio browser test.", closeError.message);
  }
  if (!result) fail("Voice Studio Chromium audit ended without a result.");
  result.browserProcessDisconnectedAfterClose = instance.state.browserDisconnected;
  if (!result.browserProcessDisconnectedAfterClose) {
    fail("Chrome process shutdown was not observed after Voice Studio browser audit.");
  }
  log("VOICE STUDIO CHROMIUM E2E RESULT:", result);
  return result;
}

async function runBrowserPhase({ phase, profileDirectory, origin }) {
  const instance = await launchIsolatedChrome(profileDirectory, origin);
  let result;
  let closeError = null;

  try {
    const url = origin + "/" + TEST_PAGE + "?phase=" + encodeURIComponent(phase);
    log("Opening browser audit phase:", { phase, url });
    const response = await instance.page.goto(url, { waitUntil: "load", timeout: TEST_TIMEOUT_MS });
    if (!response || response.status() !== 200) {
      fail("Browser test page did not load successfully.", {
        phase,
        status: response ? response.status() : null,
        url
      });
    }

    result = await collectPhaseResult(instance.page, phase, instance.state);
  } finally {
    try {
      await closeChromeProcess(instance);
    } catch (error) {
      closeError = error;
    }
  }

  if (closeError) {
    fail("Chrome did not shut down cleanly after phase " + phase + ".", closeError.message);
  }

  if (result) {
    result.browserProcessDisconnectedAfterClose = instance.state.browserDisconnected;
    if (!result.browserProcessDisconnectedAfterClose) {
      fail("The Browser process shutdown was not observed for phase " + phase + ".");
    }
  }

  return result;
}

async function main() {
  await verifyPrerequisites();

  const profileDirectory = await mkdtemp(join(tmpdir(), "swar-sadhika-brain-chrome-profile-"));
  let localServer = null;
  const results = [];

  try {
    localServer = await startLocalServer();
    log("Local-only Browser test server ready:", { origin: localServer.origin });
    log("Repository root:", REPOSITORY_ROOT);
    log("Chrome executable:", CHROME_PATH);

    // The same persistent profile and same origin are intentionally reused.
    // Closing the first persistent context closes the Chrome process. The next
    // phase starts a new Chrome process and must recover data from IndexedDB.
    results.push(await runBrowserPhase({
      phase: "write",
      profileDirectory,
      origin: localServer.origin
    }));
    results.push(await runBrowserPhase({
      phase: "read",
      profileDirectory,
      origin: localServer.origin
    }));

    // Exercise the page's complete same-process suite separately. This uses
    // its own random database and includes optional OPFS feature detection.
    results.push(await runBrowserPhase({
      phase: "all",
      profileDirectory,
      origin: localServer.origin
    }));

    const voiceStudioResult = await runVoiceStudioBrowserAudit({
      profileDirectory,
      origin: localServer.origin
    });

    const coldStartVerified =
      results[0].phase === "write" &&
      results[1].phase === "read" &&
      results[0].browserProcessDisconnectedAfterClose === true &&
      results[1].browserProcessDisconnectedAfterClose === true;

    const report = {
      test: "Swar-Sadhika Nano Brain and Voice Studio Browser Test Runner Part 2",
      status: "PASSED",
      voiceStudio: voiceStudioResult,
      browserProcessColdStartPersistence: coldStartVerified,
      androidChromeCertified: false,
      strictOfflineCertified: false,
      remoteNetworkRequests: 0,
      localOriginOnly: true,
      results
    };

    if (!coldStartVerified) {
      fail("Cross-process Browser Persistence could not be certified.", report);
    }

    log("BROWSER STORAGE AUDIT RESULT:", report);
  } finally {
    if (localServer) await localServer.close();
    await rm(profileDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error("BROWSER STORAGE AUDIT FAILED");
  console.error(error && error.stack ? error.stack : String(error));
  if (error && error.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exitCode = 1;
});
