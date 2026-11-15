/* Swar-Sadhika — Nano Brain Foundation Page Part 2.
 * This page reports only capabilities that have actually initialized.
 * It does not claim that a neural model, trained voice or reasoning engine exists.
 */

import { createBrainIntegrationPart2 } from "../brain/brain-integration-foundation-part2.js";
import { createOpfsAssetStorePart2 } from "../brain/brain-storage-part2.js";

export const NANO_BRAIN_PAGE_VERSION_PART2 = "1.0.0";

function makeElement(documentRef, tag, className, text) {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function addStatusRow(documentRef, list, label, value) {
  const row = makeElement(documentRef, "div", "tile");
  row.appendChild(makeElement(documentRef, "strong", "", label));
  row.appendChild(makeElement(documentRef, "span", "subtle", value));
  list.appendChild(row);
}

export async function mount(context) {
  if (!context || !context.root || !context.document || !context.app) {
    throw new TypeError("Nano Brain Page को मान्य Page Loader context चाहिए।");
  }
  const root = context.root;
  const documentRef = context.document;
  const integration = createBrainIntegrationPart2({ app: context.app, host: documentRef.defaultView || globalThis });
  let disposed = false;
  let lastDiagnostics = null;

  const intro = root.querySelector(".intro");
  if (intro) {
    const heading = intro.querySelector("h1");
    const description = intro.querySelector("p");
    if (heading) heading.textContent = "नैनो ब्रेन — आधार स्थिति";
    if (description) description.textContent = "स्थानीय बुद्धि-तंत्र का Integration, Security और Storage Foundation।";
  }

  let panel = root.querySelector(".panel");
  if (!panel) {
    panel = makeElement(documentRef, "section", "panel");
    root.appendChild(panel);
  }
  panel.replaceChildren();
  const status = makeElement(documentRef, "div", "status", "स्थानीय Foundation प्रारंभ हो रहा है…");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const title = makeElement(documentRef, "h2", "", "वास्तविक उपलब्ध क्षमताएँ");
  const grid = makeElement(documentRef, "div", "grid");
  const note = makeElement(documentRef, "p", "note",
    "यह चरण केवल आधार तैयार करता है। Neural Model, प्रशिक्षित आवाज़, स्वतः Reasoning और Strict Offline प्रमाणन अभी सक्रिय नहीं हैं।");
  const refresh = makeElement(documentRef, "button", "btn primary", "स्थिति पुनः जाँचें");
  refresh.type = "button";
  panel.append(status, title, grid, note, refresh);

  async function updateDiagnostics() {
    if (disposed) return;
    try {
      const diagnostics = await integration.diagnostics();
      lastDiagnostics = diagnostics;
      grid.replaceChildren();
      if (!diagnostics.initialized) {
        status.className = "status warn";
        status.textContent = "Foundation अभी प्रारंभ नहीं हुआ है।";
        return;
      }
      const storage = diagnostics.storage;
      status.className = storage.persistent ? "status" : "status warn";
      status.textContent = storage.persistent
        ? "Foundation सक्रिय · स्थायी IndexedDB Storage उपलब्ध।"
        : "Foundation सक्रिय · अस्थायी Memory Storage चल रहा है; बंद होने पर डेटा सुरक्षित रहने की गारंटी नहीं है।";
      addStatusRow(documentRef, grid, "Integration Foundation", diagnostics.version);
      addStatusRow(documentRef, grid, "Storage Backend", storage.backend);
      addStatusRow(documentRef, grid, "स्थायी Storage", storage.persistent ? "उपलब्ध" : "उपलब्ध नहीं — Volatile Mode");
      addStatusRow(documentRef, grid, "Security Gate", "Default Deny · प्रति-सत्र स्पष्ट अनुमति");
      const opfs = createOpfsAssetStorePart2({ navigatorRef: documentRef.defaultView && documentRef.defaultView.navigator });
      addStatusRow(documentRef, grid, "OPFS Model Storage", opfs.supported ? "Browser API उपलब्ध · परीक्षण/उपयोग लंबित" : "इस browser में API उपलब्ध नहीं");
      addStatusRow(documentRef, grid, "User Folder Picker", documentRef.defaultView && typeof documentRef.defaultView.showDirectoryPicker === "function" ? "API उपलब्ध · उपयोगकर्ता चयन आवश्यक" : "API उपलब्ध नहीं");
      addStatusRow(documentRef, grid, "Neural Model", "स्थापित नहीं");
      addStatusRow(documentRef, grid, "Strict Offline Certification", "अभी परीक्षण नहीं हुआ");
    } catch (error) {
      status.className = "status warn";
      status.textContent = "Foundation स्थिति जाँच विफल: " + (error && error.message ? error.message : "अज्ञात त्रुटि");
    }
  }

  refresh.addEventListener("click", updateDiagnostics);
  try {
    await integration.initialize();
    await updateDiagnostics();
  } catch (error) {
    status.className = "status warn";
    status.textContent = "Foundation शुरू नहीं हो सका: " + (error && error.message ? error.message : "अज्ञात त्रुटि");
  }

  return Object.freeze({
    async onShow() { if (!disposed) await updateDiagnostics(); },
    async onHide() {},
    async unmount() {
      if (disposed) return;
      disposed = true;
      refresh.removeEventListener("click", updateDiagnostics);
      await integration.dispose();
    },
    getDiagnostics() { return lastDiagnostics; }
  });
}
