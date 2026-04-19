(function () {
  "use strict";

  const msg = document.getElementById("pickVaultMessage");
  const btn = document.getElementById("pickVaultBtn");

  if (!window.ObsidianVaultIdb || typeof window.ObsidianVaultIdb.saveVaultHandle !== "function") {
    if (msg) msg.textContent = "Storage module failed to load. Reload the extension.";
    return;
  }

  if (typeof showDirectoryPicker !== "function") {
    if (msg) msg.textContent = "Folder picker is not available in this browser.";
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    return;
  }

  if (btn instanceof HTMLButtonElement) {
    btn.addEventListener("click", async () => {
      if (msg) msg.textContent = "";
      try {
        const handle = await showDirectoryPicker({ mode: "readwrite" });
        await window.ObsidianVaultIdb.saveVaultHandle(handle);
        try {
          const bc = new BroadcastChannel("vim-todo-obsidian-vault");
          bc.postMessage({ type: "linked" });
          bc.close();
        } catch {
          // ignore
        }
        if (msg) {
          msg.textContent = "Vault folder saved. Closing this tab…";
        }
        setTimeout(() => {
          try {
            window.close();
          } catch {
            if (msg) {
              msg.textContent = "Vault folder saved. You can close this tab and return to the extension.";
            }
          }
        }, 350);
      } catch (e) {
        if (e && e.name === "AbortError") return;
        console.error(e);
        if (msg) {
          const detail = e instanceof Error ? e.message || e.name : String(e);
          msg.textContent = String(detail).slice(0, 300);
        }
      }
    });
  }
})();
