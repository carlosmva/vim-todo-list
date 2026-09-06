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

  /**
   * Obsidian stores settings in a hidden `.obsidian` folder *inside* the vault. If the user picks that
   * folder by mistake, use its parent as the vault root when the API allows.
   */
  async function resolveVaultRootDirectoryHandle(picked) {
    if (!picked || typeof picked.name !== "string") return picked;
    if (picked.name.toLowerCase() !== ".obsidian") return picked;
    const gp =
      picked &&
      typeof picked.getParentHandle === "function"
        ? picked.getParentHandle.bind(picked)
        : null;
    if (!gp) {
      return null;
    }
    try {
      return await gp();
    } catch {
      return null;
    }
  }

  if (btn instanceof HTMLButtonElement) {
    btn.addEventListener("click", async () => {
      setMessage("Opening folder picker…", "pending");
      setBusy(true);
      try {
        let handle = await showDirectoryPicker({ mode: "readwrite" });
        const resolved = await resolveVaultRootDirectoryHandle(handle);
        if (resolved === null && handle && handle.name && handle.name.toLowerCase() === ".obsidian") {
          setMessage(
            "You selected the “.obsidian” folder (Obsidian’s settings folder inside a vault). In the picker, open the parent folder and select your vault root — the folder whose name matches Obsidian’s lower-left vault name — not “.obsidian”.",
            "error"
          );
          return;
        }
        handle = resolved || handle;

        // Ask while the picker click is still a live user gesture. Saving a prompt-state handle
        // here makes Chrome defer this consent to a later task action, which feels like a second setup.
        const permission = await handle.requestPermission({ mode: "readwrite" });
        if (permission !== "granted") {
          setMessage("Read/write access is required to sync with this vault. Choose the folder again and allow access.", "error");
          return;
        }

        await window.ObsidianVaultIdb.saveVaultHandle(handle);
        const folderName = typeof handle.name === "string" ? handle.name : "";
        try {
          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            await chrome.storage.local.set({ obsidianVaultFolderSelection_v1: folderName });
          }
        } catch {
          // The broadcast below still updates an already-open settings page.
        }
        try {
          const bc = new BroadcastChannel("vim-todo-obsidian-vault");
          bc.postMessage({
            type: "linked",
            folderName,
          });
          bc.close();
        } catch {
          // ignore
        }
        setMessage(
          "Vault folder saved. Return to Settings and click Allow folder access — Chrome asks again for the extension window, on this same folder (not ToDo).",
          "success"
        );
        setTimeout(() => {
          try {
            window.close();
          } catch {
            setMessage(
              "Vault folder saved. You can close this tab, then in Settings click Allow folder access.",
              "success"
            );
          }
        }, 2200);
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
