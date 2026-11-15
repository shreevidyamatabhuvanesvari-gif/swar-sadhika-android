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
    return Boolean(summary && /^(PASSED|FAILED) — /.test(summary.textContent.trim()));
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

    const coldStartVerified =
      results[0].phase === "write" &&
      results[1].phase === "read" &&
      results[0].browserProcessDisconnectedAfterClose === true &&
      results[1].browserProcessDisconnectedAfterClose === true;

    const report = {
      test: "Swar-Sadhika Nano Brain Browser Test Runner Part 2",
      status: "PASSED",
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
