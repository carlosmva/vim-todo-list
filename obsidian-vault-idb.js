/* global indexedDB */
(function () {
  "use strict";

  const OBSIDIAN_IDB_NAME = "vim-todo-obsidian-fs";
  const OBSIDIAN_IDB_STORE = "handles";
  const OBSIDIAN_IDB_VERSION = 2;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(OBSIDIAN_IDB_NAME, OBSIDIAN_IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const idbDb = e.target && e.target.result;
        if (!idbDb || typeof idbDb.createObjectStore !== "function") return;
        if (!idbDb.objectStoreNames.contains(OBSIDIAN_IDB_STORE)) {
          idbDb.createObjectStore(OBSIDIAN_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => {
        reject(new Error("IndexedDB upgrade blocked (close other extension tabs using this vault link)."));
      };
    });
  }

  async function saveVaultHandle(handle) {
    const idb = await openDb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(OBSIDIAN_IDB_STORE, "readwrite");
      const store = tx.objectStore(OBSIDIAN_IDB_STORE);
      const putReq = store.put(handle, "vaultRoot");
      putReq.onerror = () => reject(putReq.error || new Error("IndexedDB put failed"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  }

  async function loadVaultHandle() {
    const idb = await openDb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(OBSIDIAN_IDB_STORE, "readonly");
      const g = tx.objectStore(OBSIDIAN_IDB_STORE).get("vaultRoot");
      g.onsuccess = () => resolve(g.result || null);
      g.onerror = () => reject(g.error);
    });
  }

  async function clearVaultHandle() {
    const idb = await openDb();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(OBSIDIAN_IDB_STORE, "readwrite");
      const delReq = tx.objectStore(OBSIDIAN_IDB_STORE).delete("vaultRoot");
      delReq.onerror = () => reject(delReq.error || new Error("IndexedDB delete failed"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  window.ObsidianVaultIdb = {
    saveVaultHandle,
    loadVaultHandle,
    clearVaultHandle,
  };
})();
