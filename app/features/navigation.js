const VALID_INDEXES = Object.freeze(["workspace", "voice", "learning", "avatar"]);

export function initNavigation({ onNavigate = () => {} } = {}) {
  const indexButtons = [...document.querySelectorAll("[data-index-target]")];
  const indexPanels = [...document.querySelectorAll("[data-index-panel]")];
  const submoduleButtons = [...document.querySelectorAll("[data-submodule-target]")];
  const submodulePanels = [...document.querySelectorAll("[data-submodule-panel]")];

  function notify(index, submodule) {
    const detail = { index, submodule };
    window.dispatchEvent(new CustomEvent("swar-sadhika:navigation:changed", { detail }));
    try { onNavigate(detail); } catch (error) { console.error("Navigation callback failed", error); }
  }

  function show(index, requestedSubmodule, options = {}) {
    if (!VALID_INDEXES.includes(index)) return false;
    const indexPanel = indexPanels.find(panel => panel.dataset.indexPanel === index);
    if (!indexPanel) return false;
    const ownedPanels = submodulePanels.filter(panel => panel.dataset.indexOwner === index);
    const selectedPanel = ownedPanels.find(panel => panel.dataset.submodulePanel === requestedSubmodule) ||
      ownedPanels.find(panel => panel.dataset.default === "true") ||
      ownedPanels[0];
    if (!selectedPanel) return false;
    const submodule = selectedPanel.dataset.submodulePanel;

    indexPanels.forEach(panel => { panel.hidden = panel !== indexPanel; });
    indexButtons.forEach(button => {
      const active = button.dataset.indexTarget === index;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    submodulePanels.forEach(panel => { panel.hidden = panel !== selectedPanel; });
    submoduleButtons.forEach(button => {
      const active = button.dataset.indexOwner === index &&
        button.dataset.submoduleTarget === submodule;
      button.classList.toggle("active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
    if (options.updateHash !== false && window.history && window.history.replaceState) {
      const hash = "#" + index + "/" + submodule;
      if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
    }
    notify(index, submodule);
    return true;
  }

  indexButtons.forEach(button => {
    button.addEventListener("click", () => {
      const index = button.dataset.indexTarget;
      const panel = indexPanels.find(item => item.dataset.indexPanel === index);
      show(index, panel && panel.dataset.defaultSubmodule);
    });
  });
  submoduleButtons.forEach(button => {
    button.addEventListener("click", () => show(
      button.dataset.indexOwner,
      button.dataset.submoduleTarget
    ));
  });

  const hash = window.location.hash.replace(/^#/, "").split("/");
  const initialIndex = VALID_INDEXES.includes(hash[0]) ? hash[0] : "workspace";
  const initialPanel = indexPanels.find(panel => panel.dataset.indexPanel === initialIndex);
  show(initialIndex, hash[1] || initialPanel?.dataset.defaultSubmodule, { updateHash: false });

  return {
    navigate: show,
    getActive: () => ({
      index: indexPanels.find(panel => !panel.hidden)?.dataset.indexPanel || "workspace",
      submodule: submodulePanels.find(panel => !panel.hidden)?.dataset.submodulePanel || null
    })
  };
}
