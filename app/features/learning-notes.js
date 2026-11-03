import { getRecords, putRecord, deleteRecord } from "../core/storage.js";

export async function renderLearningNotes() {
  const host = document.getElementById("learningNotesList");
  if (!host) return;
  host.replaceChildren();
  try {
    const records = await getRecords("learningNotes");
    if (!records.length) {
      const empty = document.createElement("p");
      empty.className = "muted-text";
      empty.textContent = "अभी कोई व्यक्तिगत Learning Note सुरक्षित नहीं है।";
      host.append(empty);
      return;
    }
    for (const record of records) {
      const card = document.createElement("article");
      card.className = "saved-item";
      const body = document.createElement("div");
      const title = document.createElement("strong");
      const note = document.createElement("p");
      title.textContent = record.title || "अध्ययन टिप्पणी";
      note.textContent = record.notes || "";
      body.append(title, note);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-quiet button-small";
      remove.textContent = "हटाएँ";
      remove.addEventListener("click", async () => {
        try {
          await deleteRecord("learningNotes", record.id);
          await renderLearningNotes();
        } catch (error) {
          const status = document.getElementById("learningNotesStatus");
          if (status) status.textContent = error.message;
        }
      });
      card.append(body, remove);
      host.append(card);
    }
  } catch (error) {
    const message = document.createElement("p");
    message.className = "status-line error-text";
    message.textContent = error.message;
    host.append(message);
  }
}

export function initLearningNotes({ toast = () => {} } = {}) {
  const input = document.getElementById("learningNoteInput");
  const save = document.getElementById("saveLearningNoteButton");
  const status = document.getElementById("learningNotesStatus");
  if (save && !save.dataset.bound) {
    save.dataset.bound = "1";
    save.addEventListener("click", async () => {
      const note = String(input?.value || "").trim();
      if (!note) {
        if (status) status.textContent = "पहले अध्ययन टिप्पणी लिखें।";
        return;
      }
      try {
        await putRecord("learningNotes", {
          title: note.slice(0, 65),
          notes: note
        });
        input.value = "";
        if (status) status.textContent = "टिप्पणी स्थानीय Library में सुरक्षित है।";
        await renderLearningNotes();
        toast("Learning Note सुरक्षित हुआ।");
      } catch (error) {
        if (status) status.textContent = "सुरक्षित नहीं हुआ: " + error.message;
      }
    });
  }
  return { render: renderLearningNotes };
}
