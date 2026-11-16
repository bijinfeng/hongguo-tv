/* Give every interactive or named region a stable, inspectable preview identity. */
(() => {
  const paint = window.paintIcons;
  window.paintIcons = function (root = document) {
    paint(root);
    const used = new Set(
      [...document.querySelectorAll("[data-od-id]")].map(
        (el) => el.dataset.odId,
      ),
    );
    const nodes = document.querySelectorAll(
      "header,nav,main,aside,section,h1,h2,h3,button,input,select,dialog,.poster-card,.tv-card",
    );
    for (const [index, el] of [...nodes].entries()) {
      if (el.hasAttribute("data-od-id")) continue;
      const value =
        el.id ||
        el.dataset.action ||
        el.dataset.tvAction ||
        el.dataset.route ||
        el.dataset.tvRoute ||
        el.dataset.open ||
        el.dataset.tvOpen ||
        el.tagName.toLowerCase();
      const base =
        (document.body.dataset.device || "overview") +
        "-" +
        value
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-|-$/g, "");
      let id = base,
        suffix = 1;
      while (used.has(id)) id = base + "-" + ++suffix;
      el.dataset.odId = id;
      used.add(id);
    }
  };
  window.paintIcons();
})();
