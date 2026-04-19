(function () {
  const OVERLAY_ID = "vim-todo-list-overlay";
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const BACKDROP_STYLES = {
    light: "rgba(234, 241, 255, 0.45)",
    dark: "rgba(20, 26, 36, 0.55)",
    "solarized-light": "rgba(253, 246, 227, 0.45)",
    "solarized-dark": "rgba(0, 43, 54, 0.55)",
    emacs: "rgba(245, 245, 245, 0.45)",
    "command-line": "rgba(10, 10, 10, 0.6)"
  };

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.dataset.theme = "light";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${BACKDROP_STYLES.light};
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  `;

  function setBackdropTheme(theme) {
    const bg = BACKDROP_STYLES[theme] || BACKDROP_STYLES.light;
    overlay.style.background = bg;
    overlay.dataset.theme = theme;
  }

  window.addEventListener("message", (e) => {
    if (e.data?.type === "vim-todo-theme" && typeof e.data.theme === "string") {
      setBackdropTheme(e.data.theme);
      setIframeTheme(e.data.theme);
    }
    if (e.data?.type === "vim-todo-close") {
      closeOverlay();
    }
  });

  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 24px;
    box-sizing: border-box;
  `;

  const IFRAME_BG = {
    light: "#f4f4f4",
    dark: "#141a24",
    "solarized-light": "#fdf6e3",
    "solarized-dark": "#002b36",
    emacs: "#f5f5f5",
    "command-line": "#0a0a0a"
  };

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("popup.html");
  iframe.dataset.theme = "light";
  iframe.style.cssText = `
    width: 864px;
    height: 720px;
    max-width: 100%;
    max-height: 100%;
    border: none;
    border-radius: 12px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
    background: ${IFRAME_BG.light};
  `;

  function setIframeTheme(theme) {
    iframe.style.background = IFRAME_BG[theme] || IFRAME_BG.light;
    iframe.dataset.theme = theme;
  }

  function closeOverlay() {
    overlay.remove();
  }

  overlay.addEventListener("click", (e) => {
    if (!iframe.contains(e.target)) closeOverlay();
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlay();
  });

  overlay.setAttribute("tabindex", "-1");
  overlay.addEventListener("focus", () => overlay.focus());

  container.appendChild(iframe);
  overlay.appendChild(container);
  document.documentElement.appendChild(overlay);
  overlay.focus();
})();
