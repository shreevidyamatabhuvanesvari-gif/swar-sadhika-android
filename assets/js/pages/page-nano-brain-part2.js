/* Swar-Sadhika — Nano Brain Foundation Console Page Part 2.
 * Displays only diagnostics returned by the real local Integration/Storage APIs.
 * User permissions are never requested automatically. Memory operations require
 * an explicit session capability grant and a direct user action.
 *
 * No network access, remote model loading, fabricated AI status or hidden writes.
 */

import { createBrainIntegrationPart2 } from "../brain/brain-integration-foundation-part2.js";
import { createBrainCorePart2 } from "../brain/brain-core-part2.js";
import { createBrainMemoryEnginePart2 } from "../brain/brain-memory-engine-part2.js";
import { createBrainKnowledgeEnginePart2 } from "../brain/brain-knowledge-engine-part2.js";
import { createOpfsAssetStorePart2 } from "../brain/brain-storage-part2.js";

export const NANO_BRAIN_PAGE_VERSION_PART2 = "1.2.1";

const PAGE_TITLE = "नैनो ब्रेन — Foundation एवं Knowledge Console";
const TTS_ROUTE = "jump-text";
const MEMORY_CAPABILITIES = Object.freeze(["memory.read", "memory.write"]);
const KNOWLEDGE_CAPABILITIES = Object.freeze(["knowledge.read", "knowledge.propose"]);
const SESSION_CAPABILITIES = Object.freeze([
  ...MEMORY_CAPABILITIES,
  ...KNOWLEDGE_CAPABILITIES
]);
const KNOWLEDGE_TYPES = Object.freeze([
  ["shloka", "श्लोक"],
  ["mantra", "मंत्र"],
  ["stotra", "स्तोत्र"],
  ["richa", "ऋचा"],
  ["sutra", "सूत्र"],
  ["grammar", "व्याकरण"],
  ["pronunciation", "उच्चारण"],
  ["concept", "संकल्पना"],
  ["historical-claim", "ऐतिहासिक दावा"],
  ["other", "अन्य"]
]);
const KNOWLEDGE_SOURCE_KINDS = Object.freeze([
  ["primary", "प्राथमिक स्रोत"],
  ["secondary", "द्वितीयक स्रोत"],
  ["oral-tradition", "मौखिक परंपरा"],
  ["user-supplied", "उपयोगकर्ता द्वारा दिया गया"],
  ["unknown", "स्रोत अज्ञात"]
]);

function makeElement(documentRef, tag, className = "", text = undefined) {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function makeField(documentRef, labelText, control) {
  const field = makeElement(documentRef, "label", "field");
  field.appendChild(makeElement(documentRef, "span", "", labelText));
  field.appendChild(control);
  return field;
}

function fillSelect(documentRef, select, entries) {
  entries.forEach(([value, label]) => {
    const option = makeElement(documentRef, "option", "", label);
    option.value = value;
    select.appendChild(option);
  });
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "उपलब्ध नहीं";
  if (value < 1024) return Math.round(value) + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + " KB";
  if (value < 1024 * 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
  return (value / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function durabilityLabel(storage) {
  if (!storage || storage.volatileFallback || storage.durability === "volatile") {
    return "Volatile Memory — स्थायी डेटा की गारंटी नहीं";
  }
  if (storage.durability === "browser-persistent") {
    return "Browser Persistent Storage Permission स्वीकृत";
  }
  if (storage.durability === "best-effort") {
    return "IndexedDB Best-effort — Browser इसे हटाने का निर्णय ले सकता है";
  }
  return "स्थायित्व की स्थिति प्रमाणित नहीं";
}

function persistenceLabel(storage) {
  if (!storage || storage.persistenceSupported !== true) {
    return "Persistent Storage API उपलब्ध नहीं";
  }
  if (storage.persistenceGranted === true) return "अनुमति स्वीकृत";
  if (storage.persistenceGranted === false) return "अनुमति प्राप्त नहीं";
  return "अनुमति की स्थिति अज्ञात";
}

function backendLabel(storage) {
  if (!storage) return "अभी उपलब्ध नहीं";
  if (storage.backend === "indexeddb") return "IndexedDB";
  if (storage.backend === "memory") return "अस्थायी Memory";
  return String(storage.backend);
}

function getGrantedCapabilities(integration) {
  try {
    const details = integration.securityDiagnostics();
    return Array.isArray(details.grantedCapabilities) ? details.grantedCapabilities.slice() : [];
  } catch (_) {
    return [];
  }
}

function addStatusTile(documentRef, grid, label, value, detail = "") {
  const tile = makeElement(documentRef, "div", "tile");
  tile.appendChild(makeElement(documentRef, "strong", "", label));
  tile.appendChild(makeElement(documentRef, "span", "subtle", value));
  if (detail) tile.appendChild(makeElement(documentRef, "small", "subtle", detail));
  grid.appendChild(tile);
  return tile;
}

function setStatus(node, text, warning = false) {
  node.className = warning ? "status warn" : "status";
  node.textContent = String(text);
}

export async function mount(context) {
  if (!context || !context.root || !context.document || !context.app) {
    throw new TypeError("Nano Brain Page को वास्तविक Page Loader context चाहिए।");
  }

  const root = context.root;
  const documentRef = context.document;
  const host = documentRef.defaultView || globalThis;

  const integration = createBrainIntegrationPart2({
    app: context.app,
    host,
    allowVolatileFallback: false
  });
  const brainCore = createBrainCorePart2({
    integration,
    host
  });
  const memoryEngine = createBrainMemoryEnginePart2({
    core: brainCore,
    host
  });
  const knowledgeEngine = createBrainKnowledgeEnginePart2({
    core: brainCore,
    host
  });

  let disposed = false;
  let lastDiagnostics = null;
  let refreshPromise = null;
  let memoryProbeRunning = false;
  let memoryProbePromise = null;
  let knowledgeBusy = false;
  let knowledgeActionPromise = null;
  let knowledgeInitialized = false;
  let initialized = false;
  let pageVisible = true;
  const listeners = [];

  function listen(element, eventName, callback) {
    element.addEventListener(eventName, callback);
    listeners.push(() => element.removeEventListener(eventName, callback));
  }

  const intro = root.querySelector(".intro");
  if (intro) {
    const heading = intro.querySelector("h1");
    const description = intro.querySelector("p");
    if (heading) heading.textContent = PAGE_TITLE;
    if (description) {
      description.textContent =
        "स्थानीय Integration, Security और Storage की वास्तविक स्थिति। कोई Neural Model या Reasoning क्षमता बिना परीक्षण के सक्रिय नहीं दिखाई जाएगी।";
    }
  }

  // Replace only the contents of the Brain view. No other app page is touched.
  root.querySelectorAll(".panel").forEach(panel => panel.remove());

  const foundationPanel = makeElement(documentRef, "section", "panel");
  const foundationStatus = makeElement(
    documentRef,
    "div",
    "status warn",
    "स्थानीय Brain Foundation प्रारंभ किया जा रहा है…"
  );
  foundationStatus.setAttribute("role", "status");
  foundationStatus.setAttribute("aria-live", "polite");

  const foundationHeading = makeElement(documentRef, "h2", "", "वास्तविक Foundation स्थिति");
  const foundationGrid = makeElement(documentRef, "div", "grid");
  const quotaStatus = makeElement(documentRef, "p", "note", "Storage Quota अभी जाँचा नहीं गया है।");
  const foundationNote = makeElement(
    documentRef,
    "p",
    "note",
    "इस पृष्ठ की जाँच स्थानीय Browser APIs और वास्तविक Foundation Diagnostics से होती है। IndexedDB Backend का होना Browser Persistent Permission मिलने के समान नहीं है।"
  );

  const refreshButton = makeElement(documentRef, "button", "btn primary", "स्थिति पुनः जाँचें");
  refreshButton.type = "button";
  const retryButton = makeElement(documentRef, "button", "btn", "Foundation पुनः प्रारंभ करें");
  retryButton.type = "button";
  const ttsButton = makeElement(documentRef, "button", "btn", "मौजूदा TTS पेज खोलें");
  ttsButton.type = "button";

  const foundationActions = makeElement(documentRef, "div", "tts-actions");
  foundationActions.append(refreshButton, retryButton, ttsButton);
  foundationPanel.append(
    foundationStatus,
    foundationHeading,
    foundationGrid,
    quotaStatus,
    foundationNote,
    foundationActions
  );

  const memoryPanel = makeElement(documentRef, "section", "panel");
  const memoryHeading = makeElement(documentRef, "h2", "", "स्थानीय Memory एवं अनुमति नियंत्रण");
  const memoryStatus = makeElement(
    documentRef,
    "div",
    "status warn",
    "Memory की कोई अनुमति स्वतः नहीं दी गई है।"
  );
  memoryStatus.setAttribute("role", "status");
  memoryStatus.setAttribute("aria-live", "polite");

  const permissionGrid = makeElement(documentRef, "div", "grid");
  const readPermissionTile = addStatusTile(
    documentRef,
    permissionGrid,
    "Memory Read",
    "Default Deny",
    "केवल स्पष्ट Session अनुमति के बाद पढ़ना संभव होगा।"
  );
  const writePermissionTile = addStatusTile(
    documentRef,
    permissionGrid,
    "Memory Write",
    "Default Deny",
    "केवल स्पष्ट Session अनुमति के बाद लिखना संभव होगा।"
  );

  const readButton = makeElement(documentRef, "button", "btn", "Memory Read की अनुमति दें");
  readButton.type = "button";
  const writeButton = makeElement(documentRef, "button", "btn", "Memory Write की अनुमति दें");
  writeButton.type = "button";
  const revokeButton = makeElement(documentRef, "button", "btn danger", "Memory एवं Knowledge अनुमतियाँ वापस लें");
  revokeButton.type = "button";
  const probeButton = makeElement(documentRef, "button", "btn primary", "स्थानीय Memory Read/Write परीक्षण");
  probeButton.type = "button";
  probeButton.disabled = true;

  const persistenceButton = makeElement(
    documentRef,
    "button",
    "btn",
    "Browser Persistent Storage अनुमति माँगें"
  );
  persistenceButton.type = "button";
  persistenceButton.disabled = true;

  const memoryActions = makeElement(documentRef, "div", "tts-actions");
  memoryActions.append(readButton, writeButton, revokeButton, probeButton, persistenceButton);

  const memoryNote = makeElement(
    documentRef,
    "p",
    "note",
    "यह परीक्षण केवल Integration Storage Facade पर एक नया अस्थायी रिकॉर्ड लिखता, पढ़ता और हटाता है; यह Memory Engine की versioned-memory क्षमता का परीक्षण नहीं है। कोई मौजूदा रिकॉर्ड बदला नहीं जाएगा। Browser Persistent Storage अनुरोध अलग अनुमति है; Browser उसे अस्वीकार भी कर सकता है।"
  );

  memoryPanel.append(memoryHeading, memoryStatus, permissionGrid, memoryActions, memoryNote);

  const knowledgePanel = makeElement(documentRef, "section", "panel");
  const knowledgeHeading = makeElement(documentRef, "h2", "", "स्थानीय Knowledge Engine");
  const knowledgeStatus = makeElement(
    documentRef,
    "div",
    "status warn",
    "Knowledge Engine प्रारंभ होने की प्रतीक्षा में है।"
  );
  knowledgeStatus.setAttribute("role", "status");
  knowledgeStatus.setAttribute("aria-live", "polite");

  const knowledgePermissionGrid = makeElement(documentRef, "div", "grid");
  const knowledgeReadTile = addStatusTile(
    documentRef,
    knowledgePermissionGrid,
    "Knowledge Read",
    "Default Deny",
    "स्वीकृत और प्रस्तावित Knowledge पढ़ने के लिए स्पष्ट अनुमति आवश्यक है।"
  );
  const knowledgeProposeTile = addStatusTile(
    documentRef,
    knowledgePermissionGrid,
    "Knowledge Propose / Review",
    "Default Deny",
    "प्रस्ताव या Review लिखने के लिए अलग अनुमति और प्रत्येक क्रिया पर एकबारगी स्वीकृति आवश्यक है।"
  );

  const knowledgeReadButton = makeElement(documentRef, "button", "btn", "Knowledge Read की अनुमति दें");
  knowledgeReadButton.type = "button";
  const knowledgeProposePermissionButton = makeElement(
    documentRef,
    "button",
    "btn",
    "Knowledge Proposal / Review की अनुमति दें"
  );
  knowledgeProposePermissionButton.type = "button";
  const knowledgeRefreshButton = makeElement(documentRef, "button", "btn", "सभी Knowledge Records देखें");
  knowledgeRefreshButton.type = "button";
  const knowledgePermissionActions = makeElement(documentRef, "div", "tts-actions");
  knowledgePermissionActions.append(
    knowledgeReadButton,
    knowledgeProposePermissionButton,
    knowledgeRefreshButton
  );

  const knowledgeSearchInput = makeElement(documentRef, "input");
  knowledgeSearchInput.type = "text";
  knowledgeSearchInput.maxLength = 200;
  knowledgeSearchInput.placeholder = "स्वीकृत या प्रस्तावित Knowledge खोजें";
  knowledgeSearchInput.setAttribute("aria-label", "Knowledge खोज");
  const knowledgeSearchButton = makeElement(documentRef, "button", "btn primary", "खोजें");
  knowledgeSearchButton.type = "button";
  const knowledgeSearchRow = makeElement(documentRef, "div", "row");
  knowledgeSearchRow.append(
    makeField(documentRef, "Knowledge Search", knowledgeSearchInput),
    knowledgeSearchButton
  );

  const knowledgeResults = makeElement(documentRef, "div", "audit-list");
  const knowledgeResultsNote = makeElement(
    documentRef,
    "p",
    "subtle",
    "Records देखने या खोजने से पहले Knowledge Read अनुमति दें। डिफ़ॉल्ट खोज में प्रस्तावित Records भी यहाँ दिखाई देंगे ताकि उनका Review किया जा सके; कोई प्रस्ताव अपने-आप स्वीकार नहीं होगा।"
  );

  const knowledgeFormHeading = makeElement(documentRef, "h3", "", "नया Knowledge प्रस्ताव");
  const knowledgeTypeSelect = makeElement(documentRef, "select");
  fillSelect(documentRef, knowledgeTypeSelect, KNOWLEDGE_TYPES);
  const knowledgeTitleInput = makeElement(documentRef, "input");
  knowledgeTitleInput.type = "text";
  knowledgeTitleInput.maxLength = 180;
  knowledgeTitleInput.placeholder = "शीर्षक";
  const knowledgeLanguageInput = makeElement(documentRef, "input");
  knowledgeLanguageInput.type = "text";
  knowledgeLanguageInput.maxLength = 12;
  knowledgeLanguageInput.value = "sa";
  knowledgeLanguageInput.placeholder = "sa";
  const knowledgeTagsInput = makeElement(documentRef, "input");
  knowledgeTagsInput.type = "text";
  knowledgeTagsInput.maxLength = 512;
  knowledgeTagsInput.placeholder = "शिव, रुद्र, उच्चारण";
  const knowledgeSourceKindSelect = makeElement(documentRef, "select");
  fillSelect(documentRef, knowledgeSourceKindSelect, KNOWLEDGE_SOURCE_KINDS);
  knowledgeSourceKindSelect.value = "user-supplied";
  const knowledgeSourceTitleInput = makeElement(documentRef, "input");
  knowledgeSourceTitleInput.type = "text";
  knowledgeSourceTitleInput.maxLength = 512;
  knowledgeSourceTitleInput.value = "उपयोगकर्ता द्वारा दिया गया पाठ";
  const knowledgeSourceLocatorInput = makeElement(documentRef, "input");
  knowledgeSourceLocatorInput.type = "text";
  knowledgeSourceLocatorInput.maxLength = 512;
  knowledgeSourceLocatorInput.placeholder = "अध्याय, अनुवाक, श्लोक या अन्य संदर्भ";
  const knowledgeContentInput = makeElement(documentRef, "textarea");
  knowledgeContentInput.rows = 5;
  knowledgeContentInput.maxLength = 32768;
  knowledgeContentInput.placeholder = "यहाँ मूल श्लोक, मंत्र, स्तोत्र, ऋचा या प्रमाणित Knowledge लिखें।";
  knowledgeContentInput.setAttribute("aria-label", "Knowledge प्रस्ताव की मूल सामग्री");
  const knowledgeReviewNoteInput = makeElement(documentRef, "input");
  knowledgeReviewNoteInput.type = "text";
  knowledgeReviewNoteInput.maxLength = 1000;
  knowledgeReviewNoteInput.placeholder = "Review टिप्पणी (वैकल्पिक)";
  const knowledgeProposalFields = makeElement(documentRef, "div", "grid");
  knowledgeProposalFields.append(
    makeField(documentRef, "Knowledge प्रकार", knowledgeTypeSelect),
    makeField(documentRef, "शीर्षक", knowledgeTitleInput),
    makeField(documentRef, "भाषा कोड", knowledgeLanguageInput),
    makeField(documentRef, "Tags — comma separated", knowledgeTagsInput),
    makeField(documentRef, "स्रोत का प्रकार", knowledgeSourceKindSelect),
    makeField(documentRef, "स्रोत का नाम", knowledgeSourceTitleInput),
    makeField(documentRef, "स्रोत संदर्भ / Locator", knowledgeSourceLocatorInput)
  );
  const knowledgeProposeButton = makeElement(documentRef, "button", "btn primary", "स्वीकृति देकर Knowledge प्रस्ताव जोड़ें");
  knowledgeProposeButton.type = "button";
  const knowledgeFormNote = makeElement(
    documentRef,
    "p",
    "note",
    "प्रस्ताव पहले unreviewed स्थिति में सुरक्षित होगा। उसे सक्रिय/स्वीकृत Knowledge मानने से पहले अलग Review आवश्यक है। प्रत्येक प्रस्ताव और Review पर वास्तविक user gesture से एकबारगी approval लिया जाएगा।"
  );

  knowledgePanel.append(
    knowledgeHeading,
    knowledgeStatus,
    knowledgePermissionGrid,
    knowledgePermissionActions,
    knowledgeSearchRow,
    knowledgeResultsNote,
    knowledgeResults,
    knowledgeFormHeading,
    knowledgeProposalFields,
    makeField(documentRef, "मूल सामग्री", knowledgeContentInput),
    makeField(documentRef, "Review टिप्पणी", knowledgeReviewNoteInput),
    knowledgeProposeButton,
    knowledgeFormNote
  );

  const capabilitiesPanel = makeElement(documentRef, "section", "panel");
  const capabilitiesHeading = makeElement(documentRef, "h2", "", "Brain की वास्तविक उपलब्ध क्षमताएँ");
  const capabilitiesGrid = makeElement(documentRef, "div", "grid");
  const capabilitiesNote = makeElement(
    documentRef,
    "p",
    "note",
    "यह Foundation एवं Knowledge Console है, पूर्ण Reasoning Brain नहीं। Provenance-aware Knowledge Records और User Review Engine उपलब्ध हैं; Symbolic Reasoning, Task Planning, Autonomous Learning, Neural Model Runtime और Autonomous Skill Execution अभी स्थापित नहीं हैं।"
  );
  capabilitiesPanel.append(capabilitiesHeading, capabilitiesGrid, capabilitiesNote);

  root.append(foundationPanel, memoryPanel, knowledgePanel, capabilitiesPanel);

  function renderPermissions() {
    const granted = getGrantedCapabilities(integration);
    const canRead = granted.includes("memory.read");
    const canWrite = granted.includes("memory.write");
    const canKnowledgeRead = granted.includes("knowledge.read");
    const canKnowledgePropose = granted.includes("knowledge.propose");

    readPermissionTile.querySelector("span").textContent = canRead
      ? "Session अनुमति स्वीकृत"
      : "Default Deny";
    writePermissionTile.querySelector("span").textContent = canWrite
      ? "Session अनुमति स्वीकृत"
      : "Default Deny";

    readButton.disabled = !initialized || canRead;
    writeButton.disabled = !initialized || canWrite;
    revokeButton.disabled = !initialized || !SESSION_CAPABILITIES.some(item => granted.includes(item));
    probeButton.disabled = !initialized || !canRead || !canWrite || memoryProbeRunning;
    persistenceButton.disabled = !initialized || !canWrite;

    knowledgeReadTile.querySelector("span").textContent = canKnowledgeRead
      ? "Session अनुमति स्वीकृत"
      : "Default Deny";
    knowledgeProposeTile.querySelector("span").textContent = canKnowledgePropose
      ? "Session अनुमति स्वीकृत"
      : "Default Deny";
    knowledgeReadButton.disabled = !initialized || !knowledgeInitialized || canKnowledgeRead;
    knowledgeProposePermissionButton.disabled = !initialized || !knowledgeInitialized || canKnowledgePropose;
    knowledgeRefreshButton.disabled = !initialized || !knowledgeInitialized || !canKnowledgeRead || knowledgeBusy;
    knowledgeSearchButton.disabled = !initialized || !knowledgeInitialized || !canKnowledgeRead || knowledgeBusy;
    knowledgeProposeButton.disabled = !initialized || !knowledgeInitialized || !canKnowledgePropose || knowledgeBusy;

    memoryStatus.className = canRead || canWrite ? "status" : "status warn";
    memoryStatus.textContent = granted.some(item => MEMORY_CAPABILITIES.includes(item))
      ? "वर्तमान Browser Page Session में Memory अनुमतियाँ स्वीकृत हैं।"
      : "Memory Default Deny सक्रिय है।";

    knowledgeStatus.className = canKnowledgeRead || canKnowledgePropose ? "status" : "status warn";
    knowledgeStatus.textContent = !knowledgeInitialized
      ? "Knowledge Engine अभी Ready नहीं है।"
      : canKnowledgeRead || canKnowledgePropose
        ? "Knowledge Engine Ready — स्वीकृत Session Permissions: " +
          [canKnowledgeRead ? "knowledge.read" : "", canKnowledgePropose ? "knowledge.propose" : ""].filter(Boolean).join(", ")
        : "Knowledge Engine Ready — Knowledge Permissions Default Deny हैं।";
  }

  function renderKnowledgeRecords(records, truncated = false) {
    knowledgeResults.replaceChildren();
    const safeRecords = Array.isArray(records) ? records : [];
    if (!safeRecords.length) {
      knowledgeResults.appendChild(makeElement(
        documentRef,
        "p",
        "subtle",
        "इस खोज या सूची में कोई Knowledge Record उपलब्ध नहीं है।"
      ));
    }

    const canReview = getGrantedCapabilities(integration).includes("knowledge.propose");
    for (const record of safeRecords) {
      const card = makeElement(documentRef, "article", "tile");
      const heading = makeElement(documentRef, "strong", "", record.title || "शीर्षक उपलब्ध नहीं");
      const metadata = makeElement(
        documentRef,
        "span",
        "subtle",
        String(record.type || "other") + " · " +
          String(record.language || "sa") + " · स्थिति: " + String(record.status || "unknown")
      );
      const content = makeElement(
        documentRef,
        "p",
        "subtle",
        typeof record.content === "string" && record.content.length > 720
          ? record.content.slice(0, 720) + "…"
          : String(record.content || "")
      );
      const sourceTitle = record.source && typeof record.source.title === "string"
        ? record.source.title
        : "स्रोत विवरण उपलब्ध नहीं";
      const source = makeElement(documentRef, "small", "subtle", "स्रोत: " + sourceTitle);
      card.append(heading, metadata, content, source);

      if (record.status === "proposed" && canReview) {
        const actions = makeElement(documentRef, "div", "tts-actions");
        const acceptButton = makeElement(documentRef, "button", "btn", "स्वीकार करें");
        acceptButton.type = "button";
        acceptButton.setAttribute("data-knowledge-action", "review");
        acceptButton.setAttribute("data-record-id", record.id);
        acceptButton.setAttribute("data-decision", "accepted");
        const rejectButton = makeElement(documentRef, "button", "btn danger", "अस्वीकार करें");
        rejectButton.type = "button";
        rejectButton.setAttribute("data-knowledge-action", "review");
        rejectButton.setAttribute("data-record-id", record.id);
        rejectButton.setAttribute("data-decision", "rejected");
        actions.append(acceptButton, rejectButton);
        card.appendChild(actions);
      }
      knowledgeResults.appendChild(card);
    }

    knowledgeResultsNote.textContent = truncated
      ? "अधिकतम 100 परिणाम दिखाए गए हैं। अतिरिक्त Records के लिए अधिक विशिष्ट खोज करें।"
      : "कुल प्रदर्शित Records: " + safeRecords.length +
        "। Proposed Records अलग Review तक स्वीकृत Knowledge नहीं माने जाते।";
  }

  function runKnowledgeAction(task) {
    if (disposed || !knowledgeInitialized || knowledgeBusy) return Promise.resolve(null);
    knowledgeBusy = true;
    renderPermissions();
    const pending = (async () => {
      try {
        return await task();
      } catch (error) {
        setStatus(
          knowledgeStatus,
          "Knowledge क्रिया विफल: " + (error && error.message ? error.message : String(error)),
          true
        );
        return null;
      } finally {
        knowledgeBusy = false;
        knowledgeActionPromise = null;
        if (!disposed) renderPermissions();
      }
    })();
    knowledgeActionPromise = pending;
    return pending;
  }

  async function loadKnowledgeRecords() {
    const granted = getGrantedCapabilities(integration);
    if (!granted.includes("knowledge.read")) {
      setStatus(knowledgeStatus, "Knowledge सूची के लिए Knowledge Read अनुमति आवश्यक है।", true);
      return null;
    }
    return runKnowledgeAction(async () => {
      const result = await knowledgeEngine.list({ limit: 100 });
      renderKnowledgeRecords(result.records, result.truncated);
      setStatus(knowledgeStatus, "Knowledge सूची सफलतापूर्वक पढ़ी गई।");
      return result;
    });
  }

  async function searchKnowledge() {
    const query = knowledgeSearchInput.value.trim();
    if (!query) return loadKnowledgeRecords();
    const granted = getGrantedCapabilities(integration);
    if (!granted.includes("knowledge.read")) {
      setStatus(knowledgeStatus, "Knowledge Search के लिए Knowledge Read अनुमति आवश्यक है।", true);
      return null;
    }
    return runKnowledgeAction(async () => {
      const result = await knowledgeEngine.search(query, { includeProposed: true, limit: 100 });
      renderKnowledgeRecords(result.results.map(item => item.record), result.truncated);
      setStatus(knowledgeStatus, "Knowledge Search पूरी हुई।");
      return result;
    });
  }

  async function requestKnowledgeCapability(capability, event) {
    if (disposed || !initialized || !knowledgeInitialized) return;
    try {
      const options = capability === "knowledge.read"
        ? { read: true, propose: false }
        : { read: false, propose: true };
      const granted = knowledgeEngine.requestPermissions(event, options);
      renderPermissions();
      await refreshDiagnostics();
      const approved = granted.includes(capability);
      setStatus(
        knowledgeStatus,
        approved
          ? capability + " अनुमति इस Page Session के लिए स्वीकृत हुई।"
          : capability + " अनुमति अस्वीकृत या रद्द की गई।",
        !approved
      );
    } catch (error) {
      setStatus(
        knowledgeStatus,
        "Knowledge Permission नहीं मिली: " + (error && error.message ? error.message : String(error)),
        true
      );
    }
  }

  async function submitKnowledgeProposal(event) {
    if (disposed || !knowledgeInitialized || knowledgeBusy) return;
    const title = knowledgeTitleInput.value.trim();
    const content = knowledgeContentInput.value.trim();
    const sourceTitle = knowledgeSourceTitleInput.value.trim();
    const language = knowledgeLanguageInput.value.trim() || "sa";
    if (!title || !content || !sourceTitle) {
      setStatus(knowledgeStatus, "शीर्षक, मूल सामग्री और स्रोत का नाम भरना आवश्यक है।", true);
      return;
    }

    let approval;
    try {
      // Approval is issued synchronously from this real user click, before any await.
      approval = knowledgeEngine.issueWriteApproval(event);
    } catch (error) {
      setStatus(knowledgeStatus, "Knowledge प्रस्ताव की स्वीकृति नहीं मिली: " + error.message, true);
      return;
    }

    const record = {
      type: knowledgeTypeSelect.value,
      title,
      content,
      language,
      tags: knowledgeTagsInput.value.split(",").map(item => item.trim()).filter(Boolean),
      source: {
        kind: knowledgeSourceKindSelect.value,
        title: sourceTitle,
        locator: knowledgeSourceLocatorInput.value.trim()
      }
    };

    return runKnowledgeAction(async () => {
      const created = await knowledgeEngine.propose(record, approval);
      setStatus(
        knowledgeStatus,
        "Knowledge प्रस्ताव सुरक्षित हुआ: " + created.title +
          "। यह Review पूरा होने तक Proposed रहेगा।"
      );
      if (getGrantedCapabilities(integration).includes("knowledge.read")) {
        const result = await knowledgeEngine.list({ limit: 100 });
        renderKnowledgeRecords(result.records, result.truncated);
      }
      return created;
    });
  }

  async function reviewKnowledgeRecord(recordId, decision, event) {
    if (disposed || !knowledgeInitialized || knowledgeBusy) return;
    let approval;
    try {
      // Each decision gets a fresh, single-use approval from the actual review click.
      approval = knowledgeEngine.issueWriteApproval(event);
    } catch (error) {
      setStatus(knowledgeStatus, "Knowledge Review की स्वीकृति नहीं मिली: " + error.message, true);
      return;
    }
    const note = knowledgeReviewNoteInput.value.trim();
    return runKnowledgeAction(async () => {
      const reviewed = await knowledgeEngine.review(recordId, decision, approval, note);
      knowledgeReviewNoteInput.value = "";
      const result = await knowledgeEngine.list({ limit: 100 });
      renderKnowledgeRecords(result.records, result.truncated);
      setStatus(
        knowledgeStatus,
        "Knowledge Review दर्ज हुआ: " + decision + "। Review रिकॉर्ड append-only है।"
      );
      return reviewed;
    });
  }

  function renderDiagnostics(diagnostics) {
    lastDiagnostics = diagnostics;
    foundationGrid.replaceChildren();
    capabilitiesGrid.replaceChildren();

    if (!diagnostics || diagnostics.state !== "ready" || !diagnostics.storage) {
      const error = diagnostics && diagnostics.lastError;
      setStatus(
        foundationStatus,
        error
          ? "Foundation प्रारंभ विफल: " + error.message + " (" + error.code + ")"
          : "Foundation अभी Ready नहीं है।",
        true
      );
      addStatusTile(documentRef, foundationGrid, "Integration State", diagnostics?.state || "unknown");
      addStatusTile(documentRef, foundationGrid, "Storage Backend", "उपलब्ध नहीं");
      addStatusTile(documentRef, foundationGrid, "Security Gate", "उपलब्ध नहीं");
      renderPermissions();
      return;
    }

    const storage = diagnostics.storage;
    const quota = storage.quotaEstimate || {};
    const granted = diagnostics.security && diagnostics.security.grantedCapabilities || [];

    setStatus(
      foundationStatus,
      storage.backend === "indexeddb"
        ? "Foundation Ready — IndexedDB Backend वास्तविक रूप से खुला है।"
        : "Foundation Ready — परन्तु Storage Volatile है; स्थायी डेटा की गारंटी नहीं।",
      storage.backend !== "indexeddb" || storage.durability !== "browser-persistent"
    );

    addStatusTile(documentRef, foundationGrid, "Integration Version", diagnostics.version);
    const coreStatus = brainCore.getStatus();
    const memoryStatusInfo = memoryEngine.diagnostics();
    addStatusTile(
      documentRef,
      foundationGrid,
      "Central Brain Core",
      coreStatus.state === "ready" ? "READY" : coreStatus.state.toUpperCase(),
      "Version " + coreStatus.version + " · Local Modules: " + coreStatus.moduleCount
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "Memory Engine",
      memoryStatusInfo.state === "ready" ? "READY" : memoryStatusInfo.state.toUpperCase(),
      "Version " + memoryStatusInfo.version + " · Append-only versioned records"
    );
    const knowledgeStatusInfo = knowledgeEngine.diagnostics();
    addStatusTile(
      documentRef,
      foundationGrid,
      "Knowledge Engine",
      knowledgeStatusInfo.state === "ready" ? "READY" : knowledgeStatusInfo.state.toUpperCase(),
      "Reader / Proposer Modules: " +
        (knowledgeStatusInfo.registeredModules.reader && knowledgeStatusInfo.registeredModules.proposer
          ? "registered"
          : "not fully registered")
    );
    addStatusTile(documentRef, foundationGrid, "Storage Backend", backendLabel(storage));
    addStatusTile(documentRef, foundationGrid, "Storage Durability", durabilityLabel(storage));
    addStatusTile(documentRef, foundationGrid, "Browser Persistence Permission", persistenceLabel(storage));
    addStatusTile(
      documentRef,
      foundationGrid,
      "Database Schema",
      storage.databaseVersion === null ? "उपलब्ध नहीं" : "Version " + storage.databaseVersion,
      storage.migration ? "Migration: " + storage.migration.strategy : ""
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "IndexedDB Stores",
      Array.isArray(storage.stores) ? storage.stores.join(", ") : "उपलब्ध नहीं"
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "Security Gate",
      "Default Deny",
      "Session Grants: " + granted.length
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "OPFS API",
      createOpfsAssetStorePart2({ navigatorRef: host.navigator }).supported
        ? "API उपलब्ध; Asset I/O परीक्षण लंबित"
        : "API उपलब्ध नहीं"
    );
    addStatusTile(
      documentRef,
      foundationGrid,
      "User Directory Picker",
      typeof host.showDirectoryPicker === "function"
        ? "API उपलब्ध; उपयोगकर्ता चयन आवश्यक"
        : "API उपलब्ध नहीं"
    );

    const quotaText =
      "Storage Usage: " + formatBytes(quota.usage) +
      " · अनुमानित Quota: " + formatBytes(quota.quota) +
      " · शेष: " + formatBytes(quota.remaining);
    quotaStatus.textContent = storage.quotaWarning
      ? quotaText + " · चेतावनी: अनुमानित उपयोग 90% या अधिक है।"
      : quotaText;

    addStatusTile(documentRef, capabilitiesGrid, "Symbolic Reasoning", diagnostics.symbolicReasoning);
    addStatusTile(documentRef, capabilitiesGrid, "Neural Model Runtime", diagnostics.neuralModelRuntime);
    addStatusTile(documentRef, capabilitiesGrid, "Autonomous Execution", diagnostics.autonomousExecution);
    addStatusTile(documentRef, capabilitiesGrid, "Memory Access", diagnostics.memoryAccess);
    addStatusTile(
      documentRef,
      capabilitiesGrid,
      "Knowledge Records",
      knowledgeEngine.diagnostics().state === "ready" ? "PROVENANCE-AWARE" : "NOT READY",
      "Review और source provenance लागू; स्वतः तथ्य-सत्यापन स्थापित नहीं"
    );
    addStatusTile(documentRef, capabilitiesGrid, "Network Policy", "इस Foundation Module में कोई network request नहीं");
    addStatusTile(documentRef, capabilitiesGrid, "Strict Offline Certification", "अभी प्रमाणित नहीं");

    renderPermissions();
  }

  async function refreshDiagnostics() {
    if (disposed) return null;
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const diagnostics = await integration.diagnostics();
        if (!disposed) renderDiagnostics(diagnostics);
        return diagnostics;
      } catch (error) {
        if (!disposed) {
          setStatus(
            foundationStatus,
            "Diagnostics जाँच विफल: " + (error && error.message ? error.message : String(error)),
            true
          );
        }
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  async function initializeFoundation() {
    if (disposed) return;
    initialized = false;
    knowledgeInitialized = false;
    renderPermissions();
    setStatus(foundationStatus, "स्थानीय IndexedDB, Security, Memory और Knowledge Foundation प्रारंभ हो रहा है…", true);

    try {
      await brainCore.initialize();
      if (disposed) return;
      await memoryEngine.initialize();
      if (disposed) return;
      await knowledgeEngine.initialize();
      if (disposed) return;
      knowledgeInitialized = true;
      initialized = true;
      renderPermissions();
      await refreshDiagnostics();
    } catch (error) {
      if (disposed) return;
      initialized = false;
      setStatus(
        foundationStatus,
        "Foundation प्रारंभ नहीं हो सका: " +
          (error && error.message ? error.message : String(error)),
        true
      );
      const diagnostics = await integration.diagnostics();
      if (!disposed) renderDiagnostics(diagnostics);
    }
  }

  async function grantCapability(capability, event) {
    if (disposed || !initialized) return;
    try {
      const granted = memoryEngine.requestPermissions(event, {
        read: capability === "memory.read",
        write: capability === "memory.write"
      });
      await refreshDiagnostics();
      renderPermissions();
      setStatus(
        memoryStatus,
        granted.includes(capability)
          ? capability + " अनुमति इस Page Session के लिए स्वीकृत हुई।"
          : capability + " अनुमति अस्वीकृत या रद्द की गई।",
        !granted.includes(capability)
      );
    } catch (error) {
      setStatus(
        memoryStatus,
        "अनुमति नहीं मिली: " + (error && error.message ? error.message : String(error)),
        true
      );
    }
  }

  async function revokeMemoryPermissions() {
    if (disposed || !initialized) return;
    try {
      integration.revokeCapabilities(SESSION_CAPABILITIES);
      renderPermissions();
      setStatus(memoryStatus, "Memory अनुमतियाँ वापस ले ली गई हैं।");
      setStatus(knowledgeStatus, "Memory और Knowledge की सभी Session अनुमतियाँ वापस ले ली गई हैं।");
    } catch (error) {
      setStatus(memoryStatus, "अनुमति वापस लेना विफल: " + error.message, true);
      setStatus(knowledgeStatus, "अनुमति वापस लेना विफल: " + error.message, true);
    }
  }

  async function executeMemoryProbe() {
    if (disposed || !initialized || memoryProbeRunning) return;
    const granted = getGrantedCapabilities(integration);
    if (!granted.includes("memory.read") || !granted.includes("memory.write")) {
      setStatus(memoryStatus, "परीक्षण से पहले Memory Read और Memory Write दोनों अनुमतियाँ आवश्यक हैं।", true);
      return;
    }

    memoryProbeRunning = true;
    renderPermissions();
    let recordId = "";
    let probePassed = false;

    try {
      const memory = integration.getMemory();
      const probeId = Date.now().toString(36);
      recordId = "brain-page-probe-" + probeId;
      const marker = "local-foundation-probe-" + probeId;

      await memory.putRecord({
        id: recordId,
        kind: "foundation-probe",
        marker,
        createdAt: Date.now()
      });

      const result = await memory.getRecord(recordId);
      probePassed = Boolean(result && result.id === recordId && result.marker === marker);
      if (!probePassed) throw new Error("लिखा गया परीक्षण रिकॉर्ड सही रूप में वापस नहीं मिला।");

      const deletedRecordId = recordId;
      await memory.deleteRecord(deletedRecordId);
      recordId = "";
      const afterDelete = await memory.getRecord(deletedRecordId);
      if (afterDelete !== null) {
        throw new Error("परीक्षण रिकॉर्ड हटाने के बाद भी उपलब्ध है।");
      }

      setStatus(
        memoryStatus,
        "स्थानीय Memory Read/Write परीक्षण सफल: नया अस्थायी रिकॉर्ड लिखा, पढ़ा और हटाया गया।"
      );
    } catch (error) {
      setStatus(
        memoryStatus,
        "स्थानीय Memory परीक्षण विफल: " + (error && error.message ? error.message : String(error)),
        true
      );
    } finally {
      if (recordId) {
        try { await integration.getMemory().deleteRecord(recordId); } catch (_) {}
      }
      memoryProbeRunning = false;
      renderPermissions();
      await refreshDiagnostics();
    }
  }

  function runMemoryProbe() {
    if (memoryProbePromise) return memoryProbePromise;
    memoryProbePromise = executeMemoryProbe().finally(() => {
      memoryProbePromise = null;
    });
    return memoryProbePromise;
  }

  async function navigateToTts() {
    if (disposed || !initialized) return;
    try {
      await integration.app.navigate(TTS_ROUTE);
    } catch (error) {
      setStatus(
        foundationStatus,
        "मौजूदा TTS पेज खोलना विफल: " +
          (error && error.message ? error.message : String(error)),
        true
      );
    }
  }

  async function requestPersistentStorage(event) {
    if (disposed || !initialized) return;
    try {
      const result = await integration.getMemory().requestPersistentStorage(event);
      await refreshDiagnostics();
      const message = result.status === "granted"
        ? "Browser ने Persistent Storage अनुमति स्वीकृत की।"
        : result.status === "unsupported"
          ? "इस Browser में Persistent Storage Permission API उपलब्ध नहीं है।"
          : result.status === "requested"
            ? "Browser ने अनुरोध स्वीकार किया; वर्तमान स्थिति पुनः जाँचें।"
            : "Browser ने Persistent Storage अनुमति स्वीकृत नहीं की।";
      setStatus(memoryStatus, message, result.granted !== true);
    } catch (error) {
      setStatus(
        memoryStatus,
        "Persistent Storage अनुरोध विफल: " + (error && error.message ? error.message : String(error)),
        true
      );
    }
  }

  listen(refreshButton, "click", refreshDiagnostics);
  listen(retryButton, "click", initializeFoundation);
  listen(ttsButton, "click", navigateToTts);
  listen(readButton, "click", event => grantCapability("memory.read", event));
  listen(writeButton, "click", event => grantCapability("memory.write", event));
  listen(revokeButton, "click", revokeMemoryPermissions);
  listen(probeButton, "click", runMemoryProbe);
  listen(persistenceButton, "click", requestPersistentStorage);
  listen(knowledgeReadButton, "click", event => requestKnowledgeCapability("knowledge.read", event));
  listen(
    knowledgeProposePermissionButton,
    "click",
    event => requestKnowledgeCapability("knowledge.propose", event)
  );
  listen(knowledgeRefreshButton, "click", loadKnowledgeRecords);
  listen(knowledgeSearchButton, "click", searchKnowledge);
  listen(knowledgeProposeButton, "click", submitKnowledgeProposal);
  listen(knowledgeResults, "click", event => {
    const button = event.target && typeof event.target.closest === "function"
      ? event.target.closest("button[data-knowledge-action='review']")
      : null;
    if (!button || !knowledgeResults.contains(button)) return;
    const recordId = button.getAttribute("data-record-id");
    const decision = button.getAttribute("data-decision");
    if (recordId && (decision === "accepted" || decision === "rejected")) {
      reviewKnowledgeRecord(recordId, decision, event);
    }
  });

  await initializeFoundation();

  return Object.freeze({
    async onShow() {
      if (disposed) return;
      pageVisible = true;
      await refreshDiagnostics();
      renderPermissions();
      if (knowledgeInitialized) renderPermissions();
    },

    async onHide() {
      if (disposed || !pageVisible) return;
      pageVisible = false;
      // Stop Core tasks first, then await each Engine's task cleanup before revoking permissions.
      try { brainCore.cancelAllTasks("brain-page-hidden"); } catch (_) {}
      try { await knowledgeEngine.cancelActiveTasks("brain-page-hidden"); } catch (_) {}
      try { await memoryEngine.cancelActiveTasks("brain-page-hidden"); } catch (_) {}
      if (knowledgeActionPromise) {
        try { await knowledgeActionPromise; } catch (_) {}
      }
      // A running user-requested storage probe must finish its cleanup before session grants are revoked.
      if (memoryProbePromise) {
        try { await memoryProbePromise; } catch (_) {}
      }
      if (initialized) {
        try {
          integration.revokeCapabilities(SESSION_CAPABILITIES);
        } catch (_) {}
      }
      renderPermissions();
    },

    async unmount() {
      if (disposed) return;
      disposed = true;
      listeners.splice(0).forEach(remove => {
        try { remove(); } catch (_) {}
      });
      try { brainCore.cancelAllTasks("brain-page-unmounted"); } catch (_) {}
      try { await knowledgeEngine.cancelActiveTasks("brain-page-unmounted"); } catch (_) {}
      try { await memoryEngine.cancelActiveTasks("brain-page-unmounted"); } catch (_) {}
      if (knowledgeActionPromise) {
        try { await knowledgeActionPromise; } catch (_) {}
      }
      if (memoryProbePromise) {
        try { await memoryProbePromise; } catch (_) {}
      }
      try {
        await knowledgeEngine.dispose();
      } finally {
        try {
          await memoryEngine.dispose();
        } finally {
          try { await brainCore.dispose(); } finally { await integration.dispose(); }
        }
      }
    },

    getDiagnostics() {
      return lastDiagnostics;
    }
  });
}

export function selfTest() {
  const checks = [];
  const check = (id, passed) => checks.push({ id, passed: Boolean(passed) });

  check("page-version-declared", NANO_BRAIN_PAGE_VERSION_PART2 === "1.2.1");
  check("bytes-zero-formatted", formatBytes(0) === "0 B");
  check("bytes-invalid-marked-unavailable", formatBytes(Number.NaN) === "उपलब्ध नहीं");
  check("indexeddb-best-effort-not-called-durable",
    durabilityLabel({ backend: "indexeddb", persistent: true, durability: "best-effort" })
      .includes("Best-effort"));
  check("volatile-storage-not-called-persistent",
    durabilityLabel({ backend: "memory", persistent: false, volatileFallback: true, durability: "volatile" })
      .includes("स्थायी डेटा की गारंटी नहीं"));
  check("browser-persistent-label-requires-confirmed-status",
    durabilityLabel({ backend: "indexeddb", persistent: true, durability: "browser-persistent" })
      .includes("Permission स्वीकृत"));
  check("persistence-denial-not-misreported-as-granted",
    persistenceLabel({ persistenceSupported: true, persistenceGranted: false }) === "अनुमति प्राप्त नहीं");
  check("memory-capability-contract-preserved",
    MEMORY_CAPABILITIES.length === 2 &&
    MEMORY_CAPABILITIES[0] === "memory.read" &&
    MEMORY_CAPABILITIES[1] === "memory.write");
  check("knowledge-capability-contract-preserved",
    KNOWLEDGE_CAPABILITIES.length === 2 &&
    KNOWLEDGE_CAPABILITIES[0] === "knowledge.read" &&
    KNOWLEDGE_CAPABILITIES[1] === "knowledge.propose");
  check("all-required-session-capabilities-preserved",
    SESSION_CAPABILITIES.length === 4 &&
    SESSION_CAPABILITIES.includes("memory.read") &&
    SESSION_CAPABILITIES.includes("memory.write") &&
    SESSION_CAPABILITIES.includes("knowledge.read") &&
    SESSION_CAPABILITIES.includes("knowledge.propose"));
  check("knowledge-engine-factory-is-imported",
    typeof createBrainKnowledgeEnginePart2 === "function");
  check("knowledge-type-catalogue-is-nonempty",
    KNOWLEDGE_TYPES.length >= 9 &&
    KNOWLEDGE_TYPES.every(item => typeof item[0] === "string" && typeof item[1] === "string"));
  check("knowledge-source-catalogue-is-nonempty",
    KNOWLEDGE_SOURCE_KINDS.some(item => item[0] === "primary") &&
    KNOWLEDGE_SOURCE_KINDS.some(item => item[0] === "user-supplied"));
  check("tts-navigation-uses-main-app-supported-route",
    TTS_ROUTE === "jump-text" && PAGE_TITLE.includes("नैनो ब्रेन"));

  return Object.freeze({
    module: "page-nano-brain-part2",
    version: NANO_BRAIN_PAGE_VERSION_PART2,
    status: checks.every(item => item.passed) ? "PASSED" : "FAILED",
    total: checks.length,
    passed: checks.filter(item => item.passed).length,
    failed: checks.filter(item => !item.passed).length,
    checks: Object.freeze(checks.map(item => Object.freeze(item)))
  });
}
