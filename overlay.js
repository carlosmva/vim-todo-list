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
    if (e.data?.type === "vim-todo-popup-size" && typeof e.data.size === "string") {
      applyPopupSize(e.data.size);
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

  const POPUP_SIZES = {
    m: { width: "800px", height: "600px", radius: "10px", padding: "24px", shadow: "0 24px 48px rgba(0, 0, 0, 0.25)" },
    l: { width: "1200px", height: "860px", radius: "10px", padding: "16px", shadow: "0 24px 48px rgba(0, 0, 0, 0.25)" },
    full: { width: "100%", height: "100%", radius: "0", padding: "0", shadow: "none" }
  };

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("popup.html");
  iframe.dataset.theme = "light";
  iframe.style.cssText = `
    width: ${POPUP_SIZES.m.width};
    height: ${POPUP_SIZES.m.height};
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
    border: none;
    border-radius: ${POPUP_SIZES.m.radius};
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.25);
    background: ${IFRAME_BG.light};
    transition: width 160ms ease, height 160ms ease, border-radius 160ms ease;
  `;

  function setIframeTheme(theme) {
    iframe.style.background = IFRAME_BG[theme] || IFRAME_BG.light;
    iframe.dataset.theme = theme;
  }

  function closeOverlay() {
    overlay.remove();
  }

  function applyPopupSize(size) {
    const next = POPUP_SIZES[size] || POPUP_SIZES.m;
    container.style.padding = next.padding;
    iframe.style.width = next.width;
    iframe.style.height = next.height;
    iframe.style.borderRadius = next.radius;
    iframe.style.boxShadow = next.shadow;
  }

  overlay.addEventListener("click", (e) => {
    if (!iframe.contains(e.target)) closeOverlay();
  });

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlay();
  });

  overlay.setAttribute("tabindex", "-1");
  overlay.addEventListener("focus", () => overlay.focus());

  function focusEmbeddedPopup() {
    try {
      iframe.focus();
      const w = iframe.contentWindow;
      if (w) w.focus();
    } catch {
      // Cross-origin parent policy can block contentWindow access; popup.js calls window.focus().
    }
  }

  iframe.addEventListener("load", () => {
    focusEmbeddedPopup();
    requestAnimationFrame(() => {
      requestAnimationFrame(focusEmbeddedPopup);
    });
    setTimeout(focusEmbeddedPopup, 0);
    setTimeout(focusEmbeddedPopup, 50);
    setTimeout(focusEmbeddedPopup, 150);
    setTimeout(focusEmbeddedPopup, 320);
  });

  container.appendChild(iframe);
  overlay.appendChild(container);
  document.documentElement.appendChild(overlay);
  overlay.focus();
})();
