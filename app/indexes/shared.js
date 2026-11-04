export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function stateClass(status) {
  return status === "IN_PROGRESS" ? "state-in-progress" : status === "UNVERIFIED" ? "state-unverified" : status === "PASS" ? "state-ready" : "state-not-started";
}

export function renderIndex(definition, activeSubmodule) {
  const active = definition.modules.find(item => item.id === activeSubmodule) || definition.modules[0];
  const nav = definition.modules.map(item => `
    <button type="button" class="submodule-tab" data-submodule="${escapeHTML(item.id)}" aria-current="${item.id === active.id ? "page" : "false"}">
      ${escapeHTML(item.label)}<small>${escapeHTML(item.engine || "कार्य-पटल")}</small>
    </button>`).join("");
  return `
    <section class="index-workspace" data-rendered-index="${escapeHTML(definition.id)}">
      <aside class="index-sidebar">
        <p class="sidebar-heading">${escapeHTML(definition.number)} · ${escapeHTML(definition.shortTitle)}</p>
        <div class="submodule-list" aria-label="${escapeHTML(definition.title)} के Sub-Modules">${nav}</div>
      </aside>
      <section class="work-panel" aria-labelledby="active-module-title">
        <header class="heading-row">
          <div><p class="eyebrow">${escapeHTML(definition.kicker)}</p><h2 id="active-module-title">${escapeHTML(active.title)}</h2><p>${escapeHTML(active.description)}</p></div>
          <span class="state-tag ${stateClass(active.status)}">${escapeHTML(active.status)}</span>
        </header>
        <div class="panel-content">${active.content}</div>
      </section>
    </section>`;
}

export function moduleEntry(id, label, title, description, content, options = {}) {
  return { id, label, title, description, content, status: options.status || "NOT_STARTED", engine: options.engine || "" };
}

export function infoCard(title, body, status = "NOT_STARTED") {
  return `<section class="card"><div class="heading-row"><h3>${escapeHTML(title)}</h3><span class="state-tag ${stateClass(status)}">${escapeHTML(status)}</span></div><p>${escapeHTML(body)}</p></section>`;
}
