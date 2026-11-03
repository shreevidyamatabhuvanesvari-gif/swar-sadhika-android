import { getRecords, deleteRecord, exportLibrary, importLibrary } from "../core/storage.js";

const MAP = [
  ["texts", "savedTextsList", "content"],
  ["mediaNotes", "savedMediaList", "notes"],
  ["learningNotes", "savedLearningList", "notes"]
];

function dispatchOpen(record) {
  window.dispatchEvent(new CustomEvent("swar-sadhika:load-text", {
    detail: String(record.content || "")
  }));
  window.dispatchEvent(new CustomEvent("swar-sadhika:load-text-record", {
    detail: { id: record.id, content: String(record.content || "") }
  }));
}

export async function renderLibrary({ toast = () => {} } = {}) {
  const search = document.getElementById("librarySearchInput");
  const term = String(search?.value || "").trim().toLocaleLowerCase();
  for (const [store, id, field] of MAP) {
    const host = document.getElementById(id);
    if (!host) continue;
    host.replaceChildren();
    try {
      const records = await getRecords(store);
      const filtered = records.filter(record =>
        String(record.title || "").toLocaleLowerCase().includes(term) ||
        String(record[field] || "").toLocaleLowerCase().includes(term)
      );
      if (!filtered.length) {
        const empty = document.createElement("p");
        empty.className = "muted-text";
        empty.textContent = records.length
          ? "इस खोज से मेल खाती सामग्री नहीं मिली।"
          : "अभी कोई सामग्री सुरक्षित नहीं है।";
        host.append(empty);
        continue;
      }
      for (const record of filtered) {
        const row = document.createElement("article");
        row.className = "saved-item";
        const body = document.createElement("div");
        const title = document.createElement("strong");
        const description = document.createElement("small");
        title.textContent = record.title || "बिना शीर्षक";
        description.textContent = String(record[field] || "").slice(0, 260);
        body.append(title, description);
        const actions = document.createElement("div");
        actions.className = "saved-actions";
        if (store === "texts") {
          const open = document.createElement("button");
          open.type = "button";
          open.className = "button button-secondary button-small";
          open.textContent = "संपादित करें";
          open.addEventListener("click", () => {
            dispatchOpen(record);
            window.dispatchEvent(new CustomEvent("swar-sadhika:navigate-to-text"));
            toast("पाठ संपादन के लिए खुला।");
          });
          actions.append(open);
        }
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button button-quiet button-small";
        remove.textContent = "हटाएँ";
        remove.addEventListener("click", async () => {
          if (!window.confirm("क्या यह Library रिकॉर्ड हटाना है?")) return;
          try {
            await deleteRecord(store, record.id);
            toast("Library रिकॉर्ड हटाया गया।");
            await renderLibrary({ toast });
          } catch (error) {
            toast(error.message);
          }
        });
        actions.append(remove);
        row.append(body, actions);
        host.append(row);
      }
    } catch (error) {
      const message = document.createElement("p");
      message.className = "status-line error-text";
      message.textContent = error.message;
      host.append(message);
    }
  }

  const exportButton = document.getElementById("exportLibraryButton");
  const importInput = document.getElementById("importLibraryInput");
  const backupStatus = document.getElementById("backupStatus");
  if (exportButton && !exportButton.dataset.bound) {
    exportButton.dataset.bound = "1";
    exportButton.addEventListener("click", async () => {
      try {
        const backup = await exportLibrary();
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "swar-sadhika-library-backup.json";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (backupStatus) backupStatus.textContent = "JSON Backup डाउनलोड हुई। निजी Avatar Photo इसमें शामिल नहीं है।";
      } catch (error) {
        if (backupStatus) backupStatus.textContent = "Backup विफल: " + error.message;
      }
    });
  }
  if (importInput && !importInput.dataset.bound) {
    importInput.dataset.bound = "1";
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const result = await importLibrary(JSON.parse(await file.text()));
        if (backupStatus) {
          backupStatus.textContent = "Backup आयात हुई: " + result.imported +
            " नए रिकॉर्ड, " + result.duplicates + " दोहराए गए रिकॉर्ड छोड़े गए। मौजूदा सामग्री सुरक्षित रखी गई।";
        }
        await renderLibrary({ toast });
      } catch (error) {
        if (backupStatus) backupStatus.textContent = "आयात विफल: " + error.message;
      } finally {
        importInput.value = "";
      }
    });
  }
}

export function initLibrarySearch({ toast = () => {} } = {}) {
  const input = document.getElementById("librarySearchInput");
  if (input && !input.dataset.bound) {
    input.dataset.bound = "1";
    input.addEventListener("input", () => renderLibrary({ toast }));
  }
}
