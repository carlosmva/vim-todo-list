chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["overlay.js"]
    });
  } catch {
    // Restricted page: open Google and inject overlay there
    const newTab = await chrome.tabs.create({ url: "https://www.google.com" });
    const tabId = newTab.id;

    const injectWhenReady = () => {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ["overlay.js"]
      }).catch(() => {});
    };

    // Try injecting when tab finishes loading
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        injectWhenReady();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // Fallback: try after a short delay in case listener missed it
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.get(tabId).then(() => injectWhenReady()).catch(() => {});
    }, 2000);
  }
});
