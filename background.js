// On install, check if the keyboard shortcut was assigned (it can be unassigned due to conflicts).
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.commands.getAll().then((commands) => {
      const actionCmd = commands.find((c) => c.name === "_execute_action");
      if (actionCmd?.shortcut === "") {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: "vim-todo-list",
          message:
            "Alt+R may be unassigned. Go to chrome://extensions/shortcuts to assign it."
        });
      }
    });
  }
});

// Probe Ollama health from extension context to avoid mixed-content blocking
// when the popup runs in an iframe on HTTPS pages (e.g. google.com overlay).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "ollamaFetch") {
    const { url, method = "GET", body, timeoutMs = 60000 } = msg;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 60000));
    fetch(url, {
      method: method || "GET",
      headers: method === "POST" ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })
      .then(async (res) => {
        const text = await res.text();
        let data;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }
        sendResponse({ ok: res.ok, status: res.status, data, text });
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          error: err?.message || "fetch failed",
          status: err?.status
        });
      })
      .finally(() => clearTimeout(timeout));
    return true;
  }
  if (msg?.type !== "probeOllama") return false;
  const { baseUrl, modelOverride, timeoutMs = 30000 } = msg;
  const controller = new AbortController();
  let timedOut = false;
  let stage = "tags";
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(50, Number(timeoutMs) || 1500));

  (async () => {
    try {
      const tagsUrl = new URL("/api/tags", baseUrl).toString();
      const res = await fetch(tagsUrl, { signal: controller.signal });
      if (!res.ok) throw new Error(`Ollama tags failed: ${res.status}`);
      const data = await res.json();
      const models = Array.isArray(data?.models)
        ? data.models.map((m) => String(m?.name || "").trim()).filter(Boolean)
        : [];
      const defaultName = models[0] || "";
      if (!defaultName) throw new Error("No Ollama models found");

      const override = String(modelOverride || "").trim();
      if (override && !models.includes(override)) {
        const e = new Error(`Model not found: ${override}`);
        e.code = "model_not_found";
        throw e;
      }
      const name = override || defaultName;

      stage = "generate";
      const genUrl = new URL("/api/generate", baseUrl).toString();
      const genRes = await fetch(genUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: name, prompt: "ok", stream: false, options: { num_predict: 1 } }),
        signal: controller.signal
      });
      if (!genRes.ok) {
        let body = "";
        try {
          body = String((await genRes.text()) || "");
        } catch {
          body = "";
        }
        const err = new Error(`Ollama generate failed: ${genRes.status}`);
        err.status = genRes.status;
        err.body = body;
        throw err;
      }
      sendResponse({ ok: true, model: name });
    } catch (err) {
      const isAbort = String(err?.name || "").toLowerCase().includes("abort");
      if (isAbort && timedOut) {
        sendResponse({
          error: { message: `Ollama health check timed out (${stage})`, code: "timeout", stage }
        });
      } else {
        sendResponse({
          error: {
            message: err?.message || "not working",
            code: err?.code,
            status: err?.status,
            body: err?.body
          }
        });
      }
    } finally {
      clearTimeout(timeout);
    }
  })();
  return true; // keep channel open for async sendResponse
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["overlay.js"]
    });
  } catch {
    // Restricted page: open Google in new window and inject overlay there
    const win = await chrome.windows.create({ url: "https://www.google.com", focused: true });
    const tabId = win.tabs?.[0]?.id;
    if (!tabId) return;

    const injectWhenReady = () => {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ["overlay.js"]
      }).catch(() => {});
    };

    // Inject after delays to allow the page to load (retry if first attempt fails)
    setTimeout(injectWhenReady, 1000);
    setTimeout(injectWhenReady, 2500);
  }
});
