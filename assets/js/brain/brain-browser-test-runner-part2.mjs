import { chromium } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const executablePath = process.env.CHROME_PATH;
if (!executablePath) throw new Error("CHROME_PATH environment variable is required.");

const profile = await mkdtemp(join(tmpdir(), "swar-brain-chrome-"));
const baseUrl = process.env.BRAIN_TEST_URL || "http://127.0.0.1:8765/assets/js/brain/brain-browser-test-part2.html";

async function runPhase(phase) {
  const context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(baseUrl + "?phase=" + phase, { waitUntil: "load" });
    await page.waitForFunction(() => {
      const result = document.documentElement.dataset.result;
      return result === "PASSED" || result === "FAILED";
    }, null, { timeout: 20000 });
    const result = await page.locator("#result").innerText();
    console.log("BROWSER " + phase.toUpperCase() + "\n" + result);
    if (!result.includes("RESULT PASSED")) {
      throw new Error("Browser IndexedDB " + phase + " phase failed. " + pageErrors.join(" | "));
    }
    if (pageErrors.length) {
      throw new Error("Browser page errors: " + pageErrors.join(" | "));
    }
  } finally {
    await context.close();
  }
}

try {
  await runPhase("write");
  await runPhase("read");
  console.log("CHROMIUM INDEXEDDB PERSISTENCE: PASSED");
} finally {
  await rm(profile, { recursive: true, force: true });
}
