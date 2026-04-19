(function () {
  "use strict";

  const msg = document.getElementById("grantVaultMessage");
  const btn = document.getElementById("grantVaultBtn");

  function setMessage(text, state = "") {
    if (!msg) return;
    msg.textContent = text || "";
    if (state) msg.dataset.state = state;
    else msg.removeAttribute("data-state");
  }

  function setBusy(busy) {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? "Requesting Access…" : "Allow Access To Linked Folder";
  }

  if (!window.ObsidianVaultIdb || typeof window.ObsidianVaultIdb.loadVaultHandle !== "function") {
    setMessage("Storage module failed to load. Reload the extension.", "error");
    return;
  }

  if (btn instanceof HTMLButtonElement) {
    btn.addEventListener("click", async () => {
      setMessage("Requesting folder access…", "pending");
      setBusy(true);
      try {
        const handle = await window.ObsidianVaultIdb.loadVaultHandle();
        if (!handle) {
          setMessage(
            "No vault folder is linked yet. Open the extension > Settings > Obsidian > Choose Vault Folder first.",
            "error"
          );
          return;
        }
        const r = await handle.requestPermission({ mode: "readwrite" });
        if (r !== "granted") {
          setMessage("Access was not granted. Try again and choose Allow if Chrome asks.", "error");
          return;
        }
        try {
          const bc = new BroadcastChannel("vim-todo-obsidian-vault");
          bc.postMessage({ type: "permission-granted" });
          bc.close();
        } catch {
          // ignore
        }
        setMessage("Access granted. You can close this tab and return to the extension.", "success");
      } catch (e) {
        console.error(e);
        const detail = e instanceof Error ? e.message || e.name : String(e);
        setMessage(String(detail).slice(0, 400), "error");
      } finally {
        setBusy(false);
      }
    });
  }
})();
