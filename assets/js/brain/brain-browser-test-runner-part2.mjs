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

async function runAppRouteSmoke() {
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
    await page.addInitScript(() => {
      window.__swarSadhikaReady = false;
      window.addEventListener("swar-sadhika:ready", () => { window.__swarSadhikaReady = true; }, { once: true });
    });
    const origin = new URL(baseUrl).origin;
    await page.goto(origin + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => window.__swarSadhikaReady === true, null, { timeout: 20000 });
    const routeButton = page.locator('button[data-route="nano-brain"]');
    if (!(await routeButton.isEnabled())) {
      throw new Error("Nano Brain route button is disabled in the existing Page Loader.");
    }
    await routeButton.click();
    await page.waitForFunction(() => {
      const view = document.getElementById("view-nano-brain");
      const status = view && view.querySelector(".panel .status");
      return Boolean(view && !view.hidden && status && status.textContent.includes("Foundation"));
    }, null, { timeout: 20000 });
    const diagnostics = await page.locator("#view-nano-brain .panel").innerText();
    if (!diagnostics.includes("Storage Backend") || !diagnostics.includes("indexeddb") ||
        !diagnostics.includes("स्थायी Storage") || !diagnostics.includes("उपलब्ध")) {
      throw new Error("Nano Brain diagnostics did not report the real persistent IndexedDB backend: " + diagnostics);
    }
    await page.getByRole("button", { name: "स्थिति पुनः जाँचें" }).click();
    await page.waitForFunction(() => {
      const status = document.querySelector("#view-nano-brain .panel .status");
      return Boolean(status && status.textContent.includes("स्थायी IndexedDB Storage उपलब्ध"));
    }, null, { timeout: 20000 });
    if (pageErrors.length) throw new Error("App page errors: " + pageErrors.join(" | "));
    console.log("HISTORICAL REGRESSION 474d9c8 · Browser Diagnostics Test: PASS");
    console.log("HISTORICAL REGRESSION 4876148 · Navigation Smoke Test: PASS");
  } finally {
    await context.close();
  }
}

try {
  await runPhase("write");
  await runPhase("read");
  console.log("HISTORICAL REGRESSION 5e16a03 · Browser Persistence Test: PASS");
  console.log("HISTORICAL REGRESSION a2f2cfd · Async Browser Test: PASS");
  console.log("CHROMIUM INDEXEDDB PERSISTENCE: PASSED");
  await runAppRouteSmoke();
} finally {
  await rm(profile, { recursive: true, force: true });
}
