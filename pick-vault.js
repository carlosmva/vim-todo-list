(function () {
  "use strict";

  const msg = document.getElementById("pickVaultMessage");
  const btn = document.getElementById("pickVaultBtn");

  function setMessage(text, state = "") {
    if (!msg) return;
    msg.textContent = text || "";
    if (state) msg.dataset.state = state;
    else msg.removeAttribute("data-state");
  }

  function setBusy(busy) {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? "Choosing Folder…" : "Choose Folder…";
  }

  if (!window.ObsidianVaultIdb || typeof window.ObsidianVaultIdb.saveVaultHandle !== "function") {
    setMessage("Storage module failed to load. Reload the extension.", "error");
    return;
  }

  if (typeof showDirectoryPicker !== "function") {
    setMessage("Folder picker is not available in this browser.", "error");
    if (btn instanceof HTMLButtonElement) btn.disabled = true;
    return;
  }

  if (btn instanceof HTMLButtonElement) {
    btn.addEventListener("click", async () => {
      setMessage("Opening folder picker…", "pending");
      setBusy(true);
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
        setMessage("Vault folder saved. Closing this tab…", "success");
        setTimeout(() => {
          try {
            window.close();
          } catch {
            setMessage("Vault folder saved. You can close this tab and return to the extension.", "success");
          }
        }, 350);
      } catch (e) {
        if (e && e.name === "AbortError") {
          setMessage("Folder selection canceled.");
          return;
        }
        console.error(e);
        const detail = e instanceof Error ? e.message || e.name : String(e);
        setMessage(String(detail).slice(0, 300), "error");
      } finally {
        setBusy(false);
      }
    });
  }
})();
