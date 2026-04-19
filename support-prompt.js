/**
 * Voluntary support prompt (Chrome Web Store–friendly): tracks completions in
 * chrome.storage.local and shows a dismissible banner after milestones.
 * Core features are never gated on this UI.
 */
(function () {
  "use strict";

  const SUPPORT_URL = "https://buymeacoffee.com/carlosx";

  const STORAGE = {
    completedTasks: "completedTasks",
    supportDismissed: "supportDismissed",
    supportShown20: "supportShown20",
    supportShown100: "supportShown100",
    supportClicked: "supportClicked",
  };

  /** @returns {Promise<number>} New total completed-task count (lifetime). */
  async function incrementTaskCount() {
    const r = await chrome.storage.local.get(STORAGE.completedTasks);
    const prev = Math.max(0, Number(r[STORAGE.completedTasks]) || 0);
    const next = prev + 1;
    await chrome.storage.local.set({ [STORAGE.completedTasks]: next });
    return next;
  }

  /**
   * @param {number} completedCount — value after incrementTaskCount()
   * @returns {Promise<{ show: boolean, milestone: 20 | 100 | null }>}
   */
  async function shouldShowSupportPrompt(completedCount) {
    const r = await chrome.storage.local.get([
      STORAGE.supportDismissed,
      STORAGE.supportShown20,
      STORAGE.supportShown100,
      STORAGE.supportClicked,
    ]);
    if (r[STORAGE.supportDismissed] === true) {
      return { show: false, milestone: null };
    }

    const clicked = r[STORAGE.supportClicked] === true;
    const shown20 = r[STORAGE.supportShown20] === true;
    const shown100 = r[STORAGE.supportShown100] === true;

    // 100-task reminder: only if user has not used Support yet
    if (completedCount >= 100 && !clicked && !shown100) {
      return { show: true, milestone: 100 };
    }
    if (completedCount >= 20 && !shown20) {
      return { show: true, milestone: 20 };
    }
    return { show: false, milestone: null };
  }

  /** @param {20 | 100} milestone */
  async function markMilestoneShown(milestone) {
    const patch =
      milestone === 100
        ? { [STORAGE.supportShown100]: true, [STORAGE.supportShown20]: true }
        : { [STORAGE.supportShown20]: true };
    await chrome.storage.local.set(patch);
  }

  let wired = false;

  function hideSupportModal() {
    const root = document.getElementById("supportPrompt");
    if (!(root instanceof HTMLElement)) return;
    const panel = root.querySelector(".supportPrompt__panel");
    root.classList.remove("supportPrompt--visible");
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
    };
    if (panel instanceof HTMLElement) {
      panel.addEventListener(
        "transitionend",
        (e) => {
          if (e.propertyName === "transform" || e.propertyName === "opacity") finish();
        },
        { once: true }
      );
    }
    window.setTimeout(finish, 450);
  }

  /**
   * @param {20 | 100} milestone
   */
  async function showSupportModal(milestone) {
    const root = document.getElementById("supportPrompt");
    const titleEl = document.getElementById("supportPromptTitle");
    const bodyEl = document.getElementById("supportPromptBody");
    if (!(root instanceof HTMLElement) || !(titleEl instanceof HTMLElement) || !(bodyEl instanceof HTMLElement)) {
      return;
    }

    await markMilestoneShown(milestone);

    titleEl.textContent = "Enjoying the extension?";
    if (milestone === 100) {
      bodyEl.textContent =
        "You've completed 100 tasks. If this tool saves you time, consider supporting development ☕";
    } else {
      bodyEl.textContent =
        "You've completed 20 tasks. If this tool saves you time, consider supporting development ☕";
    }

    root.dataset.milestone = String(milestone);
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      root.classList.add("supportPrompt--visible");
      const primary = document.getElementById("supportPromptSupport");
      if (primary instanceof HTMLElement) primary.focus();
    });

    if (!wired) {
      wired = true;
      const supportBtn = document.getElementById("supportPromptSupport");
      const laterBtn = document.getElementById("supportPromptLater");
      const neverBtn = document.getElementById("supportPromptNever");

      if (supportBtn instanceof HTMLButtonElement) {
        supportBtn.addEventListener("click", async () => {
          await chrome.storage.local.set({
            [STORAGE.supportClicked]: true,
            [STORAGE.supportShown20]: true,
            [STORAGE.supportShown100]: true,
          });
          try {
            await chrome.tabs.create({ url: SUPPORT_URL });
          } catch (err) {
            console.error(err);
          }
          hideSupportModal();
        });
      }
      if (laterBtn instanceof HTMLButtonElement) {
        laterBtn.addEventListener("click", () => hideSupportModal());
      }
      if (neverBtn instanceof HTMLButtonElement) {
        neverBtn.addEventListener("click", async () => {
          await chrome.storage.local.set({
            [STORAGE.supportDismissed]: true,
            [STORAGE.supportShown20]: true,
            [STORAGE.supportShown100]: true,
          });
          hideSupportModal();
        });
      }

      document.addEventListener(
        "keydown",
        (e) => {
          const root = document.getElementById("supportPrompt");
          if (!(root instanceof HTMLElement) || root.hidden) return;
          if (e.key === "Escape") {
            e.preventDefault();
            hideSupportModal();
          }
        },
        true
      );
    }
  }

  /** Call only after a task was just marked complete (not on load). */
  async function scheduleAfterTaskComplete() {
    try {
      const count = await incrementTaskCount();
      const decision = await shouldShowSupportPrompt(count);
      if (!decision.show || decision.milestone == null) return;
      const milestone = decision.milestone;
      window.setTimeout(() => void showSupportModal(milestone), 500);
    } catch (e) {
      console.error(e);
    }
  }

  /** Dev/testing: clear all support-prompt storage keys. */
  async function resetSupportPromptState() {
    await chrome.storage.local.remove([
      STORAGE.completedTasks,
      STORAGE.supportDismissed,
      STORAGE.supportShown20,
      STORAGE.supportShown100,
      STORAGE.supportClicked,
    ]);
  }

  window.VimTodoSupportPrompt = {
    SUPPORT_URL,
    incrementTaskCount,
    shouldShowSupportPrompt,
    showSupportModal,
    scheduleAfterTaskComplete,
    resetSupportPromptState,
    hideSupportModal,
  };
})();
