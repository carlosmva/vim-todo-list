/* global initSqlJs */
(function () {
  "use strict";

const STORAGE_KEY = "sqliteDb_v1";
const CUSTOM_BACKGROUND_KEY = "customBackground_v1";
const ACTIVE_BOARD_KEY = "activeBoard_v1";
const KEY_LAYOUT_KEY = "keyLayout_v1";
const KEYBOARD_NAV_PLATFORM_KEY = "keyboardNavPlatform_v1";
const THEME_KEY = "theme_v1";
const AI_ENDPOINT_BASE_URL_KEY = "aiEndpointBaseUrl_v1";
const AI_CUSTOM_WORDS_KEY = "aiCustomWords_v1";
const DEFAULT_TAB_NAME = "To Do";
const DEFAULT_HEADER_TITLE = "Vim To-Do List";
const MAX_CUSTOM_BACKGROUND_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_CUSTOM_BACKGROUND_DIMENSION = 2560;
const THEME_ORDER = [
  "light",
  "dark",
  "solarized-light",
  "solarized-dark",
  "emacs",
  "emacs-dark",
  "command-line",
  "nothing",
  "nothing-light",
];
const POPUP_SIZE_ORDER = ["s", "m", "l", "full"];
const INTERFACE_FONT_ORDER = ["", "inter", "manrope", "dm-sans", "plus-jakarta", "sora", "montserrat", "red-hat"];
const INTERFACE_FONT_LABELS = {
  "": "Theme default",
  inter: "Inter",
  manrope: "Manrope",
  "dm-sans": "DM Sans",
  "plus-jakarta": "Plus Jakarta Sans",
  sora: "Sora",
  montserrat: "Montserrat",
  "red-hat": "Red Hat Text"
};
const INTERFACE_FONT_FAMILIES = {
  inter: '"Inter", system-ui, sans-serif',
  manrope: '"Manrope", system-ui, sans-serif',
  "dm-sans": '"DM Sans", system-ui, sans-serif',
  "plus-jakarta": '"Plus Jakarta Sans", system-ui, sans-serif',
  sora: '"Sora", system-ui, sans-serif',
  montserrat: '"Montserrat", system-ui, sans-serif',
  "red-hat": '"Red Hat Text", system-ui, sans-serif'
};
/** Value "" means follow each theme’s header title styling. */
const HEADER_TITLE_FONT_ORDER = ["", "kelvinized", "inter", "manrope", "dm-sans", "plus-jakarta", "sora", "montserrat", "red-hat", "space-grotesk", "doto", "space-mono"];
const HEADER_TITLE_FONT_LABELS = {
  "": "Theme default",
  kelvinized: "Kelvinized",
  inter: "Inter",
  manrope: "Manrope",
  "dm-sans": "DM Sans",
  "plus-jakarta": "Plus Jakarta Sans",
  sora: "Sora",
  montserrat: "Montserrat",
  "red-hat": "Red Hat Display",
  "space-grotesk": "Space Grotesk",
  doto: "Doto",
  "space-mono": "Space Mono"
};
const HEADER_TITLE_FONT_FAMILIES = {
  kelvinized: '"Kelvinized Normal", system-ui, sans-serif',
  inter: '"Inter", system-ui, sans-serif',
  manrope: '"Manrope", system-ui, sans-serif',
  "dm-sans": '"DM Sans", system-ui, sans-serif',
  "plus-jakarta": '"Plus Jakarta Sans", system-ui, sans-serif',
  sora: '"Sora", system-ui, sans-serif',
  montserrat: '"Montserrat", system-ui, sans-serif',
  "red-hat": '"Red Hat Display", system-ui, sans-serif',
  "space-grotesk": '"Space Grotesk", system-ui, sans-serif',
  doto: '"Doto", "Space Grotesk", system-ui, sans-serif',
  "space-mono": '"Space Mono", ui-monospace, monospace'
};

function normalizeHeaderTitleFontKey(stored) {
  const s = String(stored || "").trim();
  if (!s) return "";
  if (Object.prototype.hasOwnProperty.call(HEADER_TITLE_FONT_FAMILIES, s)) return s;
  return "";
}

function normalizeInterfaceFontKey(stored) {
  const s = String(stored || "").trim();
  if (!s) return "";
  if (Object.prototype.hasOwnProperty.call(INTERFACE_FONT_FAMILIES, s)) return s;
  return "";
}

/** Set when DB loads; used by renderNotes for “Open in Obsidian”. */
let gObsidianVaultName = "";
let gObsidianNotesFolder = "";
/** Mirrored from app settings + vault handle — used for per-card Obsidian sync badges. */
let gObsidianSyncMode = false;
let gObsidianVaultFolderLinked = false;

/**
 * Per-note vault vs app Markdown comparison (normalized). Populated by scanObsidianVaultVsDbNotes.
 * Values: synced | diverged | missing | no_path | path_mismatch | permission_needs_gesture | permission_denied | read_error
 */
const obsidianSyncStatusByNoteId = new Map();
/** Optional short message from the last failed read (tooltip). */
const obsidianSyncErrorHintByNoteId = new Map();
/** When the whole scan fails permission check, explain on every card. */
let obsidianSyncGlobalBadgeHint = "";
/** idle | scanning | done — used while reading vault files for badges. */
let obsidianSyncScanState = "idle";

/** Map File System Access errors to badge kinds (Chrome often uses DOMException names). */
function classifyObsidianVaultAccessError(e) {
  const errName = e && typeof e === "object" && e !== null && "name" in e ? String(e.name) : "";
  const errMsg = e instanceof Error ? e.message : String(e);
  const code =
    e && typeof e === "object" && e !== null && "code" in e && typeof e.code === "number"
      ? e.code
      : NaN;
  if (errName === "NotFoundError" || code === 8 || /not\s*found/i.test(errMsg)) {
    return { kind: "missing", hint: "" };
  }
  if (errName === "TypeMismatchError" || code === 17) {
    return { kind: "path_mismatch", hint: errMsg.slice(0, 220) };
  }
  if (errName === "InvalidStateError") {
    return {
      kind: "read_error",
      hint: `Stale or invalid folder handle — re-link the vault in Settings. ${errMsg.slice(0, 160)}`,
    };
  }
  if (errName === "NotAllowedError" || errName === "SecurityError" || code === 18) {
    return { kind: "permission", hint: errMsg.slice(0, 220) };
  }
  return { kind: "read_error", hint: errMsg.slice(0, 220) };
}

function slugifyObsidianBoardSegment(s) {
  let t = String(s || "").trim();
  if (!t) return "board";
  t = t.replace(/[^\w\u00C0-\u024f\-]+/g, "-").replace(/^-+|-+$/g, "");
  return (t || "board").slice(0, 48);
}

/** File basename segment from card title (without .md). */
function slugifyObsidianNoteTitle(text) {
  let t = String(text || "").trim();
  if (!t) return "";
  t = t.replace(/[^\w\u00C0-\u024f\-]+/g, "-").replace(/^-+|-+$/g, "");
  return (t || "").slice(0, 48);
}

/**
 * Basename stem for Obsidian: `title-slug` when unique on this board, `title-slug-id` when another card shares the same slug.
 */
function obsidianBaseFilenameStem(db, note) {
  const id = Number(note?.id);
  if (!Number.isFinite(id)) return "";
  const titleSlug = slugifyObsidianNoteTitle(note.text);
  if (!titleSlug) return `note-${id}`;

  let rows = [];
  try {
    const res = db.exec("SELECT id, text FROM notes WHERE board = ?", [note.board]);
    if (res.length && res[0].values) rows = res[0].values;
  } catch {
    return `${titleSlug}-${id}`;
  }

  let sameSlugCount = 0;
  for (const row of rows) {
    if (slugifyObsidianNoteTitle(row[1]) === titleSlug) sameSlugCount++;
  }
  if (sameSlugCount > 1) return `${titleSlug}-${id}`;
  return titleSlug;
}

function obsidianHtmlToPlain(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  const el = document.createElement("div");
  el.innerHTML = html;
  const s = el.textContent || "";
  return s.replace(/\s+/g, " ").trim();
}

function formatDueDateForObsidian(ts) {
  if (!ts || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

const OBSIDIAN_NEW_CONTENT_MAX = 20000;

function buildObsidianMarkdown(note) {
  const id = Number(note?.id);
  const title = String(note.text || "").trim() || `Note ${Number.isFinite(id) ? id : ""}`.trim();
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  const due = note.due_at != null ? Number(note.due_at) : null;
  if (due != null && Number.isFinite(due)) {
    lines.push(`**Due:** ${formatDueDateForObsidian(due)}`);
    lines.push("");
  }
  const rich = note.notes_html && String(note.notes_html).trim();
  if (rich) {
    let bodyMd = richNotesHtmlToObsidianBodyMarkdown(rich);
    if (!String(bodyMd || "").trim()) {
      bodyMd = obsidianHtmlToPlain(rich);
    }
    if (String(bodyMd || "").trim()) {
      lines.push(String(bodyMd).trim());
      lines.push("");
    }
  }
  lines.push("---");
  lines.push(`*Board: ${String(note.board || "")} · Vim To-Do (id ${Number.isFinite(id) ? id : "?"})*`);
  lines.push(note.status === "complete" ? "#vim-todo/complete" : "#vim-todo/pending");
  let out = lines.join("\n");
  if (out.length > OBSIDIAN_NEW_CONTENT_MAX) {
    out = `${out.slice(0, OBSIDIAN_NEW_CONTENT_MAX)}\n\n…`;
  }
  return out;
}

function obsidianRelativeFilePath(db, note) {
  const folder = String(gObsidianNotesFolder || "").trim().replace(/^\/+|\/+$/g, "");
  const boardSeg = slugifyObsidianBoardSegment(note.board);
  const id = Number(note?.id);
  if (!Number.isFinite(id)) return "";
  const base = obsidianBaseFilenameStem(db, note);
  if (!base) return "";
  const rel = folder ? `${folder}/${boardSeg}/${base}.md` : `${boardSeg}/${base}.md`;
  return rel.replace(/\\/g, "/");
}

/** localStorage keys: first successful path uses `new`, then `open` so Obsidian does not create `1`, `1 1`, `1 2`, … */
const OBSIDIAN_PATH_CREATED_PREFIX = "obsidianPathCreated_v1:";

/** Per note id + vault so the filename can change (e.g. duplicate title) without re-firing `new`. */
function obsidianPathStorageKey(vault, noteId) {
  return `${OBSIDIAN_PATH_CREATED_PREFIX}${vault}\n${String(noteId)}`;
}

function obsidianPathHasBeenCreated(vault, noteId) {
  try {
    return localStorage.getItem(obsidianPathStorageKey(vault, noteId)) === "1";
  } catch {
    return false;
  }
}

function markObsidianPathCreated(vault, noteId) {
  try {
    localStorage.setItem(obsidianPathStorageKey(vault, noteId), "1");
  } catch {
    // ignore
  }
}

function clearObsidianCreatedPathCache() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(OBSIDIAN_PATH_CREATED_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

/**
 * Build `obsidian://new` with encoded Markdown (Sync mode should verify the file exists before using `open`).
 */
function buildObsidianNewProtocolUrl(vault, relPath, note) {
  const encV = encodeURIComponent(vault);
  const encF = encodeURIComponent(relPath);
  const md = buildObsidianMarkdown(note);
  const encC = encodeURIComponent(md);
  return `obsidian://new?vault=${encV}&file=${encF}&content=${encC}`;
}

/**
 * First open for this vault path uses `new` (creates folders/file). Later opens use `open` only — never `new`
 * again for the same path, or Obsidian creates "note 1", "note 2", … instead of updating the file.
 * To push edited Markdown after the first create, use Sync mode + linked vault folder (writes the .md on disk).
 * (Marks "created" only for this URI-only path — when Sync is on, prefer checking disk before `open`.)
 */
function resolveObsidianUrlForNote(db, note) {
  const vault = String(gObsidianVaultName || "").trim();
  if (!vault) return "";
  const file = obsidianRelativeFilePath(db, note);
  if (!file) return "";
  const nid = Number(note?.id);
  if (!Number.isFinite(nid)) return "";
  const encV = encodeURIComponent(vault);
  const encF = encodeURIComponent(file);
  if (!obsidianPathHasBeenCreated(vault, nid)) {
    markObsidianPathCreated(vault, nid);
    return buildObsidianNewProtocolUrl(vault, file, note);
  }
  return `obsidian://open?vault=${encV}&file=${encF}`;
}

/** --- Obsidian filesystem sync (Chrome File System Access in popup) --- */

function normalizeObsidianMarkdown(s) {
  return String(s || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    // Canonical blank lines before the vim-todo footer (Obsidian often adds/removes one here).
    .replace(/\n+---\s*\n(\*Board:\s*)/g, "\n\n---\n$1")
    // Collapse 3+ consecutive newlines to a single paragraph break (avoids spurious "diverged" / conflict UI).
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** For conflict UI: vault mtime vs app `updated_at` are often within a few hundred ms after a write. */
const OBSIDIAN_VAULT_TIME_SLACK_MS = 750;

function formatConflictModalTime(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "—";
  try {
    return new Date(n).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return String(n);
  }
}

function escapeHtmlForObsidian(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSafeMarkdownUrl(raw) {
  const value = String(raw || "").trim();
  if (!value || value.startsWith("#")) return true;
  try {
    const url = new URL(value, "https://markdown.local/");
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function markdownInlineToHtml(value) {
  const source = String(value || "");
  const tokens = [];
  const token = (html) => {
    const key = `\u0000MD${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };
  let html = source
    .replace(/`([^`\n]+)`/g, (_, code) => token(`<code>${escapeHtmlForObsidian(code)}</code>`))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label, url) => {
      if (!isSafeMarkdownUrl(url)) return escapeHtmlForObsidian(`![${label}](${url})`);
      return token(`<a href="${escapeHtmlForObsidian(url)}" target="_blank" rel="noreferrer">${escapeHtmlForObsidian(label || url)}</a>`);
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      if (!isSafeMarkdownUrl(url)) return escapeHtmlForObsidian(`[${label}](${url})`);
      return token(`<a href="${escapeHtmlForObsidian(url)}" target="_blank" rel="noreferrer">${escapeHtmlForObsidian(label)}</a>`);
    })
    .replace(/\[\[([^\]]+)\]\]/g, (_, target) => {
      const label = String(target).split("|").pop().trim() || target;
      return token(`<span class="obsidianWikiLink">${escapeHtmlForObsidian(label)}</span>`);
    });

  html = escapeHtmlForObsidian(html)
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/==(.+?)==/g, "<mark>$1</mark>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");

  return html.replace(/\u0000MD(\d+)\u0000/g, (_, index) => tokens[Number(index)] || "");
}

function markdownToSimpleHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const isBlockStart = (line) =>
    /^```/.test(line) || /^(#{1,6})\s+/.test(line) || /^\s*>\s?/.test(line) ||
    /^\s*(?:[-+*]|\d+\.)\s+/.test(line) || /^\s*(?:---+|\*\*\*+)\s*$/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i += 1;
      out.push(`<pre><code${language ? ` data-language="${escapeHtmlForObsidian(language)}"` : ""}>${escapeHtmlForObsidian(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${markdownInlineToHtml(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      out.push("<hr>");
      i += 1;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${markdownToSimpleHtml(quote.join("\n"))}</blockquote>`);
      continue;
    }
    const listMatch = line.match(/^\s*((?:[-+*])|(?:\d+\.))\s+(.+)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1]);
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*((?:[-+*])|(?:\d+\.))\s+(.+)$/);
        if (!item || /\d+\./.test(item[1]) !== ordered) break;
        const task = item[2].match(/^\[([ xX])\]\s+(.+)$/);
        const body = task ? `<input type="checkbox" disabled${task[1].toLowerCase() === "x" ? " checked" : ""}> ${markdownInlineToHtml(task[2])}` : markdownInlineToHtml(item[2]);
        items.push(`<li${task ? ' class="noteMarkdownTask"' : ""}>${body}</li>`);
        i += 1;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const paragraph = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++]);
    out.push(`<p>${paragraph.map(markdownInlineToHtml).join("<br>")}</p>`);
  }
  return out.join("");
}

/** Obsidian Markdown body renderer, shared by vault import and note previews. */
function obsidianMarkdownBodyToNotesHtml(bodyMd) {
  return markdownToSimpleHtml(bodyMd);
}

function renderPlainMarkdownNotesHtml(html) {
  const source = String(html || "");
  if (!source.trim()) return "";
  const container = document.createElement("div");
  container.innerHTML = source;
  if (container.querySelector("a, strong, b, em, i, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, code")) {
    return source;
  }
  const markdown = String(container.innerText || "").replace(/\u00a0/g, " ");
  const hasMarkdownSyntax =
    /(^|\n)\s*(?:#{1,6}\s+|[-+*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|>\s?|```)|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|~~.+?~~|==.+?==/.test(
      markdown
    );
  return hasMarkdownSyntax ? markdownToSimpleHtml(markdown) : source;
}

function renderMarkdownInNotesEditor(editor) {
  if (!(editor instanceof HTMLElement)) return "";
  const rendered = renderPlainMarkdownNotesHtml(editor.innerHTML);
  if (rendered && rendered !== editor.innerHTML) editor.innerHTML = rendered;
  return editor.innerHTML;
}

/** Export rich notes HTML to Markdown body (for vault .md), preserving wikilink spans and basic bold. */
function richNotesHtmlToObsidianBodyMarkdown(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;

  function nodeToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    const tag = el.tagName;
    if (tag === "BR") return "\n";
    if (tag === "STRONG" || tag === "B") {
      const inner = [...el.childNodes].map(nodeToMd).join("");
      return inner ? `**${inner}**` : "";
    }
    if (tag === "EM" || tag === "I") {
      const inner = [...el.childNodes].map(nodeToMd).join("");
      return inner ? `*${inner}*` : "";
    }
    if (el.classList && el.classList.contains("obsidianWikiLink")) {
      return el.textContent || "";
    }
    if (tag === "P") {
      const inner = [...el.childNodes].map(nodeToMd).join("");
      return inner + "\n\n";
    }
    if (tag === "DIV") {
      return [...el.childNodes].map(nodeToMd).join("") + "\n";
    }
    if (tag === "LI") return "- " + [...el.childNodes].map(nodeToMd).join("") + "\n";
    if (tag === "UL" || tag === "OL") {
      return [...el.childNodes].map(nodeToMd).join("");
    }
    if (tag === "H1") return "# " + [...el.childNodes].map(nodeToMd).join("").trim() + "\n\n";
    if (tag === "H2") return "## " + [...el.childNodes].map(nodeToMd).join("").trim() + "\n\n";
    if (tag === "H3") return "### " + [...el.childNodes].map(nodeToMd).join("").trim() + "\n\n";
    return [...el.childNodes].map(nodeToMd).join("");
  }

  let out = [...tmp.childNodes].map(nodeToMd).join("");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

/**
 * Parse markdown produced by buildObsidianMarkdown (title, optional due, body, footer).
 * Returns { title, notes_html }.
 */
function parseObsidianMarkdownImport(md) {
  const norm = normalizeObsidianMarkdown(md);
  const lines = norm.split("\n");
  let i = 0;
  let title = "";
  if (lines[0]?.startsWith("# ")) {
    title = lines[0].slice(2).trim();
    i = 1;
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  if (lines[i] && /^\*\*Due:\*\*/.test(lines[i])) i++;
  while (i < lines.length && lines[i].trim() === "") i++;
  let rest = lines.slice(i).join("\n");
  const sepIdx = rest.search(/\n---\s*\n\*Board:/);
  if (sepIdx >= 0) rest = rest.slice(0, sepIdx).trim();
  else {
    const alt = rest.lastIndexOf("\n---");
    if (alt >= 0 && /\n---\s*$/m.test(rest.slice(alt))) rest = rest.slice(0, alt).trim();
  }
  const notes_html = obsidianMarkdownBodyToNotesHtml(rest);
  return { title, notes_html };
}

function buildObsidianOpenUrlOnly(vault, relPath) {
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(relPath)}`;
}

/**
 * Open an obsidian:// URL without assigning the current window. Using location.assign on the
 * extension page breaks when the popup is embedded (e.g. some hosts enforce frame-src and block
 * navigating the frame to custom schemes). Opening a new tab delegates to the OS protocol handler.
 */
function openObsidianProtocolUrl(url) {
  const u = String(url || "").trim();
  if (!u.startsWith("obsidian:")) return;
  try {
    if (typeof chrome !== "undefined" && chrome.tabs && typeof chrome.tabs.create === "function") {
      chrome.tabs.create({ url: u }, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          openObsidianProtocolUrlViaAnchor(u);
        }
      });
      return;
    }
  } catch {
    // fall through
  }
  openObsidianProtocolUrlViaAnchor(u);
}

function openObsidianProtocolUrlViaAnchor(u) {
  try {
    const a = document.createElement("a");
    a.href = u;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    try {
      window.location.assign(u);
    } catch {
      // ignore
    }
  }
}

function obsidianFileSystemApiAvailable() {
  return typeof showDirectoryPicker === "function";
}

function obsidianVaultIdb() {
  return window.ObsidianVaultIdb;
}

async function getFileHandleFromVaultPath(root, relPath, create) {
  const parts = String(relPath || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (!parts.length) throw new Error("empty path");
  const fileName = parts[parts.length - 1];
  const dirs = parts.slice(0, -1);
  let dir = root;
  for (const d of dirs) {
    dir = await dir.getDirectoryHandle(d, { create: !!create });
  }
  return dir.getFileHandle(fileName, { create: !!create });
}

async function writeMarkdownFileAtVaultPath(root, relPath, content) {
  const handle = await getFileHandleFromVaultPath(root, relPath, true);
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function readVaultFileLastModifiedMs(root, relPath) {
  const fh = await getFileHandleFromVaultPath(root, relPath, false);
  return (await fh.getFile()).lastModified;
}

/** After pushing Markdown to the vault, align note.updated_at with the file mtime so the next Obsidian click does not treat the file as newer and re-import over the app. */
async function bumpNoteUpdatedAtToVaultFile(db, noteId, root, relPath) {
  try {
    const t = await readVaultFileLastModifiedMs(root, relPath);
    const stmt = db.prepare("UPDATE notes SET updated_at = ? WHERE id = ?");
    stmt.run([t, noteId]);
    stmt.free();
  } catch (e) {
    console.warn("Obsidian: could not align updated_at with vault file", e);
  }
}

function priorityColorsForTheme() {
  const root = document.documentElement;
  const t = root.getAttribute("data-theme") || "";
  if (t === "nothing" || t === "nothing-light") {
    const cs = getComputedStyle(root);
    return {
      low: cs.getPropertyValue("--nd-priority-low").trim() || "#999999",
      normal: cs.getPropertyValue("--nd-priority-normal").trim() || "#5b9bf6",
      high: cs.getPropertyValue("--nd-priority-high").trim() || "#d71921",
    };
  }
  return { low: "#8d8d8d", normal: "#0f62fe", high: "#da1e28" };
}

const isMac =
  typeof navigator !== "undefined" &&
  (/Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
    (navigator.userAgentData && navigator.userAgentData.platform === "macOS"));

/** "mac" = Control+letter navigation; "winlinux" = Alt+letter. Chosen in Settings > Keyboard. */
let gKeyboardNavPlatform = isMac ? "mac" : "winlinux";

function useNavMacModifier() {
  if (gKeyboardNavPlatform === "mac") return true;
  if (gKeyboardNavPlatform === "winlinux") return false;
  return isMac;
}

function modKeyLabel() {
  return useNavMacModifier() ? "Ctrl" : "Alt";
}

function modKeyActive(e) {
  if (!e) return false;
  return useNavMacModifier() ? !!e.ctrlKey : !!e.altKey;
}

function modKeyOnly(e) {
  if (!e) return false;
  if (!modKeyActive(e)) return false;
  return useNavMacModifier() ? !e.metaKey && !e.altKey : !e.ctrlKey && !e.metaKey;
}

const openNoteEditorIds = new Set();
const flippedNoteIds = new Set();
let cardFilterQuery = "";

// English dictionary fallback completion tries to suggest a *common* word.
// The bundled word list is broad (many rare/technical terms), so we apply a
// lightweight heuristic to avoid noisy recommendations.
const EN_DICT_COMMON_BIGRAM_SCORES = Object.freeze({
  th: 8,
  he: 7,
  in: 6,
  er: 6,
  an: 6,
  re: 6,
  un: 6,
  on: 5,
  at: 5,
  en: 5,
  nd: 5,
  ti: 5,
  es: 5,
  or: 5,
  te: 5,
  is: 5,
  it: 5,
  of: 5,
  st: 4,
  to: 4,
  nt: 4,
  ng: 4,
  se: 4,
  ch: 4,
  sh: 4,
  wh: 4,
  qu: 4,
  be: 4,
  ha: 3,
  as: 3,
  ou: 3,
  io: 3,
  le: 3,
  ve: 3,
  co: 3,
  me: 3,
  de: 3,
  hi: 3,
  ri: 3,
  ro: 3,
  ra: 3,
  li: 3,
  il: 3,
  us: 3,
  go: 3,
  el: 3,
  la: 3,
  ea: 3,
  al: 3,
  ar: 3,
  ck: 3,
  na: 3,
  og: 2,
  ma: 2,
  up: 2,
  oo: 2
});

const EN_DICT_RARE_BIGRAM_PENALTIES = Object.freeze({
  aa: -6,
  ae: -4,
  oe: -4,
  ii: -4,
  uu: -4,
  yy: -4,
  qj: -8,
  jq: -8,
  zx: -8,
  xq: -8
});

function englishBigramScoreLowercase(word) {
  const w = String(word || "");
  if (w.length < 2) return 0;

  let score = 0;
  for (let i = 0; i < w.length - 1; i++) {
    const bg = w.slice(i, i + 2);
    const penalty = EN_DICT_RARE_BIGRAM_PENALTIES[bg];
    if (typeof penalty === "number") {
      score += penalty;
      continue;
    }

    const v = EN_DICT_COMMON_BIGRAM_SCORES[bg];
    if (typeof v === "number") score += v;
    else score -= 0.35; // unknown bigram: slight penalty
  }

  return score;
}

function scoreEnglishTokenShapeLowercase(token) {
  const t0 = String(token || "");
  const letters = t0.toLowerCase().replace(/[^a-z]/g, "");
  if (!letters) return -Infinity;

  let score = englishBigramScoreLowercase(letters);

  // Penalize 'q' not followed by 'u' (rare in common English).
  for (let i = 0; i < letters.length; i++) {
    if (letters[i] !== "q") continue;
    if (letters[i + 1] !== "u") score -= 12;
  }

  const vowels = (letters.match(/[aeiouy]/g) || []).length;
  if (vowels === 0) score -= 12;
  const ratio = vowels / letters.length;
  if (ratio < 0.2 || ratio > 0.85) score -= 3;

  if (/[bcdfghjklmnpqrstvwxyz]{4,}/.test(letters)) score -= 4;
  if (/^(aa|ae|oe|ii|uu)/.test(letters)) score -= 6;

  return score;
}

function scoreEnglishDictionaryCandidateWordLowercase(word, prefixLen) {
  const w = String(word || "").toLowerCase();
  if (!w) return -Infinity;
  if (!/^[a-z'-]+$/.test(w)) return -Infinity;

  const lettersLen = w.replace(/[^a-z]/g, "").length;
  if (lettersLen <= 0) return -Infinity;
  if (lettersLen > 24) return -Infinity;

  const completionLen = Math.max(0, w.length - Number(prefixLen || 0));

  let score = scoreEnglishTokenShapeLowercase(w);
  // Prefer shorter completions and shorter words.
  score += 12 - completionLen * 2;
  score += 10 - lettersLen;

  // Common suffixes in everyday English.
  // Prefer singular over plural when both exist.
  // Avoid penalizing common non-plural endings like "is"/"us" and double-s.
  if (w.endsWith("s") && w.length > 3 && !w.endsWith("ss") && !w.endsWith("is") && !w.endsWith("us")) {
    score -= 0.9;
  }
  if (w.endsWith("ed")) score += 0.75;
  if (w.endsWith("ing")) score += 1.5;
  if (w.endsWith("ly")) score += 0.5;
  if (w.endsWith("tion") || w.endsWith("ment") || w.endsWith("ness")) score += 0.75;

  // Penalize some technical/rare endings.
  if (/(aceae|idae|inae|itis|osis|emia|genic|gynous|phyte|phyll|taxis|metry|graphy|omics|atores|atrix|atrices|atorium|atoria)$/.test(w)) score -= 8;

  // Extra penalty for very long words.
  if (lettersLen > 12) score -= (lettersLen - 12) * 1.25;

  return score;
}

// Filter profanity from the 5k word list so it won't be suggested.
// Stored as base64 to avoid embedding the raw words in-source.
const EN_DICT_PROFANE_WORDS = (() => {
  const b64 = [
    "ZnVjaw==", // fuck
    "ZnVja2Vy", // fucker
    "ZnVja2Vycw==", // fuckers
    "ZnVja2luZw==", // fucking
    "c2hpdA==", // shit
    "c2hpdHM=", // shits
    "c2hpdHR5" // shitty
  ];
  const out = new Set();
  for (const s of b64) {
    try {
      const w = atob(String(s || ""));
      if (w) out.add(String(w).toLowerCase());
    } catch {
      // ignore
    }
  }
  return out;
})();

function isEnglishDictionaryProfaneWordLowercase(word) {
  const w = String(word || "").toLowerCase();
  return !!w && EN_DICT_PROFANE_WORDS.has(w);
}

function bytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes || []);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadDbBytes() {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  const b64 = result[STORAGE_KEY];
  if (typeof b64 !== "string" || !b64) return null;
  try {
    return base64ToBytes(b64);
  } catch {
    return null;
  }
}

async function loadActiveBoard() {
  const result = await chrome.storage.local.get([ACTIVE_BOARD_KEY]);
  const value = result[ACTIVE_BOARD_KEY];
  return typeof value === "string" && value ? value : null;
}

async function saveActiveBoard(board) {
  await chrome.storage.local.set({ [ACTIVE_BOARD_KEY]: board });
}

async function loadKeyLayout() {
  const result = await chrome.storage.local.get([KEY_LAYOUT_KEY]);
  const value = result[KEY_LAYOUT_KEY];
  if (value === "qwerty" || value === "dvorak") return value;
  return null;
}

async function saveKeyLayout(layout) {
  await chrome.storage.local.set({ [KEY_LAYOUT_KEY]: layout });
}

async function loadKeyboardNavPlatform() {
  const result = await chrome.storage.local.get([KEYBOARD_NAV_PLATFORM_KEY]);
  const value = result[KEYBOARD_NAV_PLATFORM_KEY];
  if (value === "mac" || value === "winlinux") return value;
  return isMac ? "mac" : "winlinux";
}

async function saveKeyboardNavPlatform(platform) {
  if (platform !== "mac" && platform !== "winlinux") return;
  await chrome.storage.local.set({ [KEYBOARD_NAV_PLATFORM_KEY]: platform });
}

async function loadThemeFromStorage() {
  const result = await chrome.storage.local.get([THEME_KEY]);
  return result[THEME_KEY] || null;
}

function normalizeEndpointBaseUrl(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  let url;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // Base URL only (strip path/query/hash).
  url.pathname = "/";
  url.search = "";
  url.hash = "";

  let out = url.toString();
  if (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

function isExternalAiHost(baseUrl) {
  try {
    const u = new URL(String(baseUrl || ""));
    const host = String(u.hostname || "").toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0";
  } catch {
    return false;
  }
}

function getOriginForPermission(baseUrl) {
  try {
    const u = new URL(String(baseUrl || ""));
    u.pathname = "/";
    u.search = "";
    u.hash = "";
    let out = u.toString();
    if (!out.endsWith("/")) out += "/";
    return out;
  } catch {
    return null;
  }
}

function getOllamaOriginsHintFor403(baseUrl) {
  // Ollama blocks cross-origin requests by default except for a small allowlist.
  // Browser extensions send an Origin like chrome-extension://<id>, while PowerShell does not.
  // If PowerShell works but the extension gets 403, this is the usual fix.
  try {
    const u = new URL(String(baseUrl || ""));
    const host = String(u.hostname || "").toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      return " (Ollama: set OLLAMA_ORIGINS=chrome-extension://* and restart Ollama)";
    }
    return " (Ollama: set OLLAMA_ORIGINS=chrome-extension://* and restart Ollama on the server)";
  } catch {
    // ignore
  }
  return "";
}

async function loadAiEndpointBaseUrl() {
  const result = await chrome.storage.local.get([AI_ENDPOINT_BASE_URL_KEY]);
  const value = result[AI_ENDPOINT_BASE_URL_KEY];
  return typeof value === "string" ? value : null;
}

async function saveAiEndpointBaseUrl(baseUrl) {
  const normalized = normalizeEndpointBaseUrl(baseUrl);
  if (normalized === null) throw new Error("Invalid endpoint URL");
  if (!normalized) {
    await chrome.storage.local.remove([AI_ENDPOINT_BASE_URL_KEY]);
    return "";
  }
  await chrome.storage.local.set({ [AI_ENDPOINT_BASE_URL_KEY]: normalized });
  return normalized;
}

async function loadAiCustomWords() {
  const result = await chrome.storage.local.get([AI_CUSTOM_WORDS_KEY]);
  const value = result[AI_CUSTOM_WORDS_KEY];
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

async function saveAiCustomWords(customWords) {
  const list = Array.isArray(customWords) ? customWords.filter((w) => typeof w === "string" && w.trim()) : [];
  if (!list.length) {
    await chrome.storage.local.remove([AI_CUSTOM_WORDS_KEY]);
    return [];
  }
  await chrome.storage.local.set({ [AI_CUSTOM_WORDS_KEY]: list });
  return list;
}

async function saveDbBytes(bytes) {
  const b64 = bytesToBase64(bytes);
  await chrome.storage.local.set({ [STORAGE_KEY]: b64 });
}

async function loadCustomBackground() {
  const result = await chrome.storage.local.get([CUSTOM_BACKGROUND_KEY]);
  const value = result[CUSTOM_BACKGROUND_KEY];
  return typeof value === "string" ? value : "";
}

async function saveCustomBackground(dataUrl) {
  const value = String(dataUrl || "");
  if (!value) {
    await chrome.storage.local.remove([CUSTOM_BACKGROUND_KEY]);
    return;
  }
  await chrome.storage.local.set({ [CUSTOM_BACKGROUND_KEY]: value });
}

function ensureSchema(db, defaultBoard = DEFAULT_TAB_NAME) {
  // Enable FK constraints (needed for ON DELETE CASCADE to work).
  // sql.js (SQLite) defaults to foreign_keys=OFF.
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS boards (
      name TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','complete')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      notes_html TEXT,
      sort_order INTEGER NOT NULL,
      board TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS note_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Migrate older DBs that predate note link descriptions
  try {
    db.run("ALTER TABLE note_links ADD COLUMN description TEXT");
  } catch {
    // ignore (already exists)
  }

  // Migrate older DBs that predate board sort ordering
  try {
    db.run("ALTER TABLE boards ADD COLUMN sort_order INTEGER");
  } catch {
    // ignore (already exists)
  }

  // Migrate older DBs that predate sort_order
  try {
    db.run("ALTER TABLE notes ADD COLUMN sort_order INTEGER");
  } catch {
    // ignore (already exists)
  }

  // Migrate older DBs that predate updated_at
  try {
    db.run("ALTER TABLE notes ADD COLUMN updated_at INTEGER");
  } catch {
    // ignore (already exists)
  }

  // Migrate older DBs that predate completed_at
  try {
    db.run("ALTER TABLE notes ADD COLUMN completed_at INTEGER");
  } catch {
    // ignore (already exists)
  }
  
  // Migrate older DBs that predate notes_html
  try {
    db.run("ALTER TABLE notes ADD COLUMN notes_html TEXT");
  } catch {
    // ignore (already exists)
  }

  // Migrate older DBs that predate board
  try {
    db.run("ALTER TABLE notes ADD COLUMN board TEXT");
  } catch {
    // ignore (already exists)
  }

  // Migrate older DBs that predate priority
  try {
    db.run("ALTER TABLE notes ADD COLUMN priority TEXT");
  } catch {
    // ignore (already exists)
  }

  // Migrate older DBs that predate due_at
  try {
    db.run("ALTER TABLE notes ADD COLUMN due_at INTEGER");
  } catch {
    // ignore (already exists)
  }

  // Default any missing board to default.
  db.run("UPDATE notes SET board = ? WHERE board IS NULL OR board = ''", [defaultBoard]);

  // Default any missing/invalid priority to normal.
  try {
    db.run(
      "UPDATE notes SET priority = 'normal' WHERE priority IS NULL OR priority = '' OR priority NOT IN ('low','normal','high')"
    );
  } catch {
    // ignore (priority column may not exist in very old DBs)
  }

  // Backfill timestamps
  db.run("UPDATE notes SET updated_at = created_at WHERE updated_at IS NULL");
  // For legacy completed notes, approximate completed_at as updated_at if missing.
  db.run(
    "UPDATE notes SET completed_at = updated_at WHERE status = 'complete' AND completed_at IS NULL"
  );
  
  // Backfill notes_html
  db.run("UPDATE notes SET notes_html = '' WHERE notes_html IS NULL");

  // Ensure boards have a non-null sort_order (used for tab ordering).
  try {
    db.run("UPDATE boards SET sort_order = 0 WHERE sort_order IS NULL");
  } catch {
    // ignore
  }

  // Backfill any NULL sort_order values per board to preserve existing ordering.
  const boardsRes = db.exec("SELECT DISTINCT board FROM notes WHERE board IS NOT NULL AND board <> '' ORDER BY board ASC");
  const boards = boardsRes.length ? boardsRes[0].values.map((r) => r[0]) : [];
  for (const board of boards) {
    const pendingNull = db.exec(
      "SELECT id FROM notes WHERE board = ? AND status = 'pending' AND sort_order IS NULL ORDER BY created_at DESC, id DESC",
      [board]
    );
    if (!pendingNull.length) continue;
    const ids = pendingNull[0].values.map((row) => row[0]);
    db.run("BEGIN");
    const stmt = db.prepare(
      "UPDATE notes SET sort_order = ? WHERE id = ? AND board = ? AND status = 'pending'"
    );
    try {
      for (let i = 0; i < ids.length; i++) stmt.run([i, ids[i], board]);
    } finally {
      stmt.free();
      db.run("COMMIT");
    }
  }

  // Ensure non-pending rows also have a non-null sort_order.
  db.run("UPDATE notes SET sort_order = 0 WHERE sort_order IS NULL");

  // Backfill missing descriptions so existing links remain visible.
  // If description is missing, use the URL as a fallback description.
  db.run(
    "UPDATE note_links SET description = url WHERE description IS NULL OR description = ''"
  );

  // Ensure the boards table contains any boards referenced by notes.
  try {
    const noteBoards = db.exec(
      "SELECT DISTINCT board FROM notes WHERE board IS NOT NULL AND board <> '' ORDER BY board ASC"
    );
    const names = noteBoards.length ? noteBoards[0].values.map((r) => r[0]) : [];
    if (names.length) {
      const existingRes = db.exec("SELECT name FROM boards");
      const existing = new Set(
        existingRes.length
          ? existingRes[0].values.map((r) => String(r[0] || "").toLowerCase()).filter(Boolean)
          : []
      );

      const missing = [];
      for (const n of names) {
        const s = String(n || "");
        if (!s) continue;
        const k = s.toLowerCase();
        if (existing.has(k)) continue;
        existing.add(k);
        missing.push(s);
      }

      if (missing.length) {
        // Append any missing boards to the end of the tab order.
        let nextSortOrder = 0;
        try {
          const maxRes = db.exec("SELECT COALESCE(MAX(sort_order), -1) AS m FROM boards");
          const m = maxRes.length ? Number(maxRes[0].values?.[0]?.[0]) : -1;
          nextSortOrder = (Number.isFinite(m) ? m : -1) + 1;
        } catch {
          nextSortOrder = 0;
        }

        db.run("BEGIN");
        const ins = db.prepare(
          "INSERT OR IGNORE INTO boards(name, created_at, sort_order) VALUES(?, ?, ?)"
        );
        try {
          for (const n of missing) {
            ins.run([String(n), Date.now(), nextSortOrder]);
            nextSortOrder++;
          }
        } finally {
          ins.free();
          db.run("COMMIT");
        }
      }
    }
  } catch {
    // ignore
  }

  // If there are still no boards, seed the default.
  try {
    const c = db.exec("SELECT COUNT(1) AS c FROM boards");
    const count = c.length ? Number(c[0].values?.[0]?.[0]) : 0;
    if (!Number.isFinite(count) || count <= 0) {
      const stmt = db.prepare(
        "INSERT OR IGNORE INTO boards(name, created_at, sort_order) VALUES(?, ?, ?)"
      );
      stmt.run([defaultBoard, Date.now(), 0]);
      stmt.free();
    }
  } catch {
    // ignore
  }
}

function queryBoards(db) {
  const res = db.exec(
    "SELECT name FROM boards ORDER BY sort_order ASC, created_at ASC, name ASC"
  );
  if (!res.length) return [];
  return res[0].values.map((r) => String(r[0])).filter(Boolean);
}

function normalizeBoardName(name) {
  return String(name || "").trim();
}

function addBoard(db, name) {
  const n = normalizeBoardName(name);
  if (!n) return false;
  let nextSortOrder = 0;
  try {
    const maxRes = db.exec("SELECT COALESCE(MAX(sort_order), -1) AS m FROM boards");
    const m = maxRes.length ? Number(maxRes[0].values?.[0]?.[0]) : -1;
    nextSortOrder = (Number.isFinite(m) ? m : -1) + 1;
  } catch {
    nextSortOrder = 0;
  }

  try {
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO boards(name, created_at, sort_order) VALUES(?, ?, ?)"
    );
    stmt.run([n, Date.now(), nextSortOrder]);
    stmt.free();
  } catch {
    // Backward compatible fallback (should be rare, but keep safe)
    const stmt = db.prepare(
      "INSERT OR IGNORE INTO boards(name, created_at) VALUES(?, ?)"
    );
    stmt.run([n, Date.now()]);
    stmt.free();
  }
  return true;
}

function renameBoard(db, oldName, newName) {
  const oldN = normalizeBoardName(oldName);
  const newN = normalizeBoardName(newName);
  if (!oldN || !newN || oldN === newN) return false;
  const existing = queryBoards(db);
  if (existing.includes(newN)) return false;
  db.run("BEGIN");
  try {
    db.run("UPDATE notes SET board = ? WHERE board = ?", [newN, oldN]);
    db.run("UPDATE boards SET name = ? WHERE name = ?", [newN, oldN]);
    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    return false;
  }
  return true;
}

function deleteBoardCascade(db, name) {
  const n = normalizeBoardName(name);
  if (!n) return;
  db.run("BEGIN");
  try {
    db.run("DELETE FROM notes WHERE board = ?", [n]);
    db.run("DELETE FROM boards WHERE name = ?", [n]);
  } finally {
    db.run("COMMIT");
  }
}

function normalizeUrl(input) {
  const raw = input.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function queryLinks(db, noteId) {
  const res = db.exec(
    "SELECT id, url, description, created_at FROM note_links WHERE note_id = ? ORDER BY created_at DESC, id DESC",
    [noteId]
  );
  if (!res.length) return [];
  const { columns, values } = res[0];
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  return values.map((row) => ({
    id: row[idx.id],
    url: row[idx.url],
    description: row[idx.description],
    created_at: row[idx.created_at]
  }));
}

function insertLink(db, noteId, url, description) {
  const stmt = db.prepare(
    "INSERT INTO note_links(note_id, url, description, created_at) VALUES (?, ?, ?, ?)"
  );
  stmt.run([noteId, url, description, Date.now()]);
  stmt.free();
}

function deleteLink(db, linkId) {
  const stmt = db.prepare("DELETE FROM note_links WHERE id = ?");
  stmt.run([linkId]);
  stmt.free();
}

function deleteNote(db, noteId) {
  db.run("BEGIN");
  try {
    // If PRAGMA foreign_keys is enabled, the note_links rows will cascade.
    // We still delete explicitly for robustness.
    {
      const stmt = db.prepare("DELETE FROM note_links WHERE note_id = ?");
      stmt.run([noteId]);
      stmt.free();
    }
    {
      const stmt = db.prepare("DELETE FROM notes WHERE id = ?");
      stmt.run([noteId]);
      stmt.free();
    }
  } finally {
    db.run("COMMIT");
  }
}

function normalizePriority(value) {
  const v = String(value || "").toLowerCase().trim();
  if (v === "high" || v === "low" || v === "normal") return v;
  return "normal";
}

function nextPriority(current) {
  const cur = normalizePriority(current);
  if (cur === "low") return "normal";
  if (cur === "normal") return "high";
  return "low";
}

function formatPriorityLabel(p) {
  const v = normalizePriority(p);
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function queryDashboardStats(db, boardFilter = "") {
  const selectedBoard = String(boardFilter || "").trim();
  const stats = {
    pending: {}, // { boardName: { low, normal, high } }
    complete: {},
    pendingActivity: {},
    completeActivity: {},
    boards: [],
    oldestPending: null,
    newestCreated: null,
    recentlyCompleted: null
  };

  try {
    const boardsRes = db.exec("SELECT name FROM boards ORDER BY sort_order ASC, created_at ASC, name ASC");
    if (boardsRes.length) {
      stats.boards = (boardsRes[0].values || []).map((row) => String(row[0] || "").trim()).filter(Boolean);
    }

    const gridRes = db.exec(
      `SELECT board, priority, status, COUNT(*) AS cnt
       FROM notes
       WHERE board IS NOT NULL AND board <> ''
         AND (? = '' OR board = ?)
       GROUP BY board, priority, status`
      ,
      [selectedBoard, selectedBoard]
    );
    if (gridRes.length) {
      const boardsSet = new Set();
      for (const row of gridRes[0].values || []) {
        const board = String(row[0] || "").trim();
        const priority = normalizePriority(row[1]);
        const status = String(row[2] || "").toLowerCase();
        const cnt = Number(row[3]) || 0;
        if (!board) continue;
        boardsSet.add(board);
        const target = status === "complete" ? stats.complete : stats.pending;
        if (!target[board]) target[board] = { low: 0, normal: 0, high: 0 };
        target[board][priority] = cnt;
      }
      if (!stats.boards.length) stats.boards = [...boardsSet].sort();
    }

    const oldestRes = db.exec(
      "SELECT created_at FROM notes WHERE status = 'pending' AND (? = '' OR board = ?) ORDER BY created_at ASC LIMIT 1",
      [selectedBoard, selectedBoard]
    );
    if (oldestRes.length && oldestRes[0].values?.[0]?.[0] != null) {
      stats.oldestPending = Number(oldestRes[0].values[0][0]);
    }

    const newestRes = db.exec(
      "SELECT created_at FROM notes WHERE (? = '' OR board = ?) ORDER BY created_at DESC LIMIT 1",
      [selectedBoard, selectedBoard]
    );
    if (newestRes.length && newestRes[0].values?.[0]?.[0] != null) {
      stats.newestCreated = Number(newestRes[0].values[0][0]);
    }

    const completedRes = db.exec(
      "SELECT completed_at FROM notes WHERE completed_at IS NOT NULL AND (? = '' OR board = ?) ORDER BY completed_at DESC LIMIT 1",
      [selectedBoard, selectedBoard]
    );
    if (completedRes.length && completedRes[0].values?.[0]?.[0] != null) {
      stats.recentlyCompleted = Number(completedRes[0].values[0][0]);
    }

    const activityRes = db.exec(
      `SELECT status, due_at
       FROM notes
       WHERE due_at IS NOT NULL
         AND (? = '' OR board = ?)`
      ,
      [selectedBoard, selectedBoard]
    );
    if (activityRes.length) {
      for (const row of activityRes[0].values || []) {
        const status = String(row[0] || "").toLowerCase();
        const dueAt = Number(row[1]);
        if (status === "pending" && Number.isFinite(dueAt)) {
          const key = localDateKey(dueAt);
          stats.pendingActivity[key] = (stats.pendingActivity[key] || 0) + 1;
        }
        if (status === "complete" && Number.isFinite(dueAt)) {
          const key = localDateKey(dueAt);
          stats.completeActivity[key] = (stats.completeActivity[key] || 0) + 1;
        }
      }
    }
  } catch {
    // ignore
  }
  return stats;
}

function localDateKey(ts) {
  if (!Number.isFinite(Number(ts))) return "";
  const d = new Date(Number(ts));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


function formatDate(ts) {
  if (!ts || !Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

function formatDueDate(ts) {
  if (!ts || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function dueAtToDateString(ts) {
  if (!ts || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateToDateInputValue(d) {
  if (!(d instanceof Date) || !Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCalendarMonthsClamped(base, months) {
  const d = base instanceof Date ? base : new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const lastTargetDay = new Date(y, m + months + 1, 0).getDate();
  return new Date(y, m + months, Math.min(day, lastTargetDay));
}

function formatRelative(ts) {
  if (!ts || !Number.isFinite(ts)) return "—";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(ts);
}

function queryNotes(db, board) {
  const res = db.exec(
    `
      SELECT id, text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board, due_at
      FROM notes
      WHERE board = ?
      ORDER BY
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        sort_order ASC,
        CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 1 END,
        created_at DESC,
        id DESC
    `,
    [board]
  );
  if (!res.length) return [];

  const { columns, values } = res[0];
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  return values.map((row) => ({
    id: row[idx.id],
    text: row[idx.text],
    status: row[idx.status],
    priority: normalizePriority(row[idx.priority]),
    created_at: row[idx.created_at],
    updated_at: row[idx.updated_at],
    completed_at: row[idx.completed_at],
    notes_html: row[idx.notes_html],
    sort_order: row[idx.sort_order],
    board: row[idx.board],
    due_at: row[idx.due_at] != null ? row[idx.due_at] : null
  }));
}

function queryAllNotes(db) {
  const res = db.exec(
    `
      SELECT id, text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board, due_at
      FROM notes
      ORDER BY
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        board ASC,
        sort_order ASC,
        CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 1 END,
        created_at DESC,
        id DESC
    `
  );
  if (!res.length) return [];

  const { columns, values } = res[0];
  const idx = Object.fromEntries(columns.map((c, i) => [c, i]));
  return values.map((row) => ({
    id: row[idx.id],
    text: row[idx.text],
    status: row[idx.status],
    priority: normalizePriority(row[idx.priority]),
    created_at: row[idx.created_at],
    updated_at: row[idx.updated_at],
    completed_at: row[idx.completed_at],
    notes_html: row[idx.notes_html],
    sort_order: row[idx.sort_order],
    board: row[idx.board],
    due_at: row[idx.due_at] != null ? row[idx.due_at] : null
  }));
}

function queryPendingCountsByBoard(db) {
  const counts = new Map();
  const res = db.exec(
    `
      SELECT board, COUNT(*) AS pending_count
      FROM notes
      WHERE status = 'pending' AND board IS NOT NULL AND board <> ''
      GROUP BY board
    `
  );
  if (!res.length) return counts;
  for (const [board, count] of res[0].values || []) {
    const boardName = String(board || "").trim();
    if (!boardName) continue;
    counts.set(boardName, Number(count) || 0);
  }
  return counts;
}

function getNextPendingSortOrder(db, board) {
  // Notes list pending rows by sort_order ASC; use one less than the current minimum so
  // new cards appear at the top (older rows from before this behavior may use 0, 1, 2, …).
  const res = db.exec(
    "SELECT COALESCE(MIN(sort_order), 1) AS m FROM notes WHERE board = ? AND status = 'pending'",
    [board]
  );
  if (!res.length) return 0;
  const minVal = res[0].values?.[0]?.[0];
  const n = Number(minVal);
  return Number.isFinite(n) ? n - 1 : 0;
}

function queryNotesByDueRange(db, startTs, endTs) {
  const stmt = db.prepare(
    "SELECT id, text, board, due_at, priority FROM notes WHERE status = 'pending' AND due_at IS NOT NULL AND due_at >= ? AND due_at < ? ORDER BY due_at ASC, id ASC"
  );
  stmt.bind([startTs, endTs]);
  const rows = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rows.push({
      id: row.id,
      text: row.text,
      board: row.board,
      due_at: row.due_at,
      priority: normalizePriority(row.priority)
    });
  }
  stmt.free();
  return rows;
}

function insertNote(db, board, text, dueAt = null) {
  const now = Date.now();
  const stmt = db.prepare(
    "INSERT INTO notes(text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board, due_at) VALUES (?, 'pending', 'normal', ?, ?, NULL, '', ?, ?, ?)"
  );
  stmt.run([text.trim(), now, now, getNextPendingSortOrder(db, board), board, dueAt]);
  stmt.free();
}

function updateNoteDueAt(db, noteId, dueAt) {
  const stmt = db.prepare("UPDATE notes SET due_at = ?, updated_at = ? WHERE id = ?");
  stmt.run([dueAt, Date.now(), noteId]);
  stmt.free();
}

function setNotesHtml(db, noteId, html) {
  const stmt = db.prepare(
    "UPDATE notes SET notes_html = ?, updated_at = ? WHERE id = ?"
  );
  stmt.run([html, Date.now(), noteId]);
  stmt.free();
}

function setNoteText(db, noteId, text) {
  const stmt = db.prepare(
    "UPDATE notes SET text = ?, updated_at = ? WHERE id = ?"
  );
  stmt.run([String(text || "").trim(), Date.now(), noteId]);
  stmt.free();
}

function setStatus(db, board, id, status) {
  const now = Date.now();
  if (status === "pending") {
    const stmt = db.prepare(
      "UPDATE notes SET status = 'pending', sort_order = ?, board = ?, completed_at = NULL, updated_at = ? WHERE id = ?"
    );
    stmt.run([getNextPendingSortOrder(db, board), board, now, id]);
    stmt.free();
    return;
  }

  const nextOrderStmt = db.prepare(
    "SELECT COALESCE(MAX(sort_order), -1) AS m FROM notes WHERE board = ? AND status = 'complete'"
  );
  nextOrderStmt.bind([board]);
  let nextOrder = 0;
  if (nextOrderStmt.step()) {
    const m = nextOrderStmt.getAsObject()?.m;
    nextOrder = Number.isFinite(Number(m)) ? Number(m) + 1 : 0;
  }
  nextOrderStmt.free();
  const stmt = db.prepare(
    "UPDATE notes SET status = 'complete', completed_at = ?, updated_at = ?, sort_order = ? WHERE id = ?"
  );
  stmt.run([now, now, nextOrder, id]);
  stmt.free();
}

function el(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node;
}

function keepCardInView(card) {
  if (!(card instanceof HTMLElement)) return;
  try {
    card.scrollIntoView({ block: "nearest" });
  } catch {
    // ignore
  }
}

function getVisibleCardFace(card) {
  if (!(card instanceof HTMLElement)) return null;
  if (card.classList.contains("is-flipped")) {
    const back = card.querySelector(".noteBack");
    return back instanceof HTMLElement ? back : null;
  }
  const front = card.querySelector(".noteFace:not(.noteBack)");
  return front instanceof HTMLElement ? front : null;
}

function measureCardTargetHeight(card) {
  const face = getVisibleCardFace(card);
  const computed = window.getComputedStyle(card);
  const minRaw = parseFloat(computed.minHeight || "");
  const maxRaw = parseFloat(computed.maxHeight || "");
  const minH = Number.isFinite(minRaw) ? minRaw : 96;
  const maxH = Number.isFinite(maxRaw) ? maxRaw : Number.POSITIVE_INFINITY;

  let target = 96;
  if (!(face instanceof HTMLElement)) {
    const h = Math.ceil(card.getBoundingClientRect().height);
    target = Number.isFinite(h) && h > 0 ? h : 96;
  } else {
    const measured = Math.ceil(face.scrollHeight);
    target = Number.isFinite(measured) ? measured : 96;
  }

  target = Math.max(minH, target);
  target = Math.min(maxH, target);
  return Math.max(96, target);
}

function morphCardHeight(card) {
  if (!(card instanceof HTMLElement)) return;

  const start = Math.ceil(card.getBoundingClientRect().height);
  const target = measureCardTargetHeight(card);
  if (!Number.isFinite(start) || start <= 0) return;
  if (Math.abs(target - start) < 2) return;

  card.classList.add("is-morphing");
  card.style.height = `${start}px`;
  // Force style flush before applying target height so transition always runs.
  void card.offsetHeight;
  card.style.height = `${target}px`;

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    card.classList.remove("is-morphing");
    card.style.height = "";
    card.removeEventListener("transitionend", onEnd);
  };

  const onEnd = (e) => {
    if (e.target !== card || e.propertyName !== "height") return;
    cleanup();
  };

  card.addEventListener("transitionend", onEnd);
  setTimeout(cleanup, 320);
}

function noteMatchesFilter(note, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const plainNotes = String(note?.notes_html || "").replace(/<[^>]*>/g, " ");
  const haystack = `${note?.text || ""} ${note?.board || ""} ${plainNotes}`.toLowerCase();
  return haystack.includes(q);
}

function getFilteredNotes(notes, query) {
  const list = Array.isArray(notes) ? notes : [];
  return list.filter((note) => noteMatchesFilter(note, query));
}

const CARD_ACTION_ICON_PATHS = {
  /** Same clip as legacy "attachments" name; flip control is labeled "Links" in the UI. */
  links: ["M8 12.5 16.2 4.3a3.2 3.2 0 0 1 4.5 4.5L10.9 18.6a5 5 0 0 1-7.1-7.1l9.7-9.7"],
  attachments: ["M8 12.5 16.2 4.3a3.2 3.2 0 0 1 4.5 4.5L10.9 18.6a5 5 0 0 1-7.1-7.1l9.7-9.7"],
  priority: ["M6 21V4", "M7 4h10l-1.8 4L17 12H7"],
  notes: ["M6 4h9l3 3v13H6z", "M14 4v4h4", "M9 11h6", "M9 15h6"],
  obsidian: ["M8.5 8.5 12 4l3.5 4.5L12 20 4 12z", "M8.5 8.5 15.5 8.5 20 12 12 20 4 12z"],
  complete: ["M5 12.5 10 17.5 19 6.5"],
  pending: ["M7 7h7a5 5 0 1 1-3.5 8.5", "M7 7v5h5"],
  delete: ["M6 7h12", "M9 7V5h6v2", "M8 10v9h8v-9", "M10.5 12v5", "M13.5 12v5"],
  moveUp: ["M12 5v14", "M6.5 10.5 12 5l5.5 5.5"],
  moveDown: ["M12 19V5", "M6.5 13.5 12 19l5.5-5.5"],
};

function applyCardActionIcon(button, iconName, label, opts = {}) {
  if (!(button instanceof HTMLButtonElement)) return button;
  button.className = `cardIconButton${opts.extraClass ? ` ${opts.extraClass}` : ""}`;
  button.textContent = "";
  const tooltip = opts.tooltip || opts.title || label;
  button.setAttribute("aria-label", label);
  button.dataset.tooltip = tooltip;
  button.title = tooltip;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "cardIconButton__icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of CARD_ACTION_ICON_PATHS[iconName] || []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  button.appendChild(svg);
  return button;
}

function getNoteNotesPreviewText(html) {
  return htmlToReadableText(html).replace(/\s+/g, " ").trim();
}

function createNoteNotesPreviewElement(notePreviewText) {
  const notesPreview = document.createElement("div");
  notesPreview.className = "noteNotesPreview";
  notesPreview.setAttribute("aria-label", "Notes preview");
  const previewLabel = document.createElement("div");
  previewLabel.className = "noteNotesPreview__label";
  previewLabel.textContent = "[ NOTES ]";
  const previewBody = document.createElement("div");
  previewBody.className = "noteNotesPreview__body";
  previewBody.textContent = notePreviewText;
  previewBody.title = notePreviewText;
  notesPreview.appendChild(previewLabel);
  notesPreview.appendChild(previewBody);
  return notesPreview;
}

/** UI chip for Obsidian vault compare (popup pulls vault Markdown when configured). */
function getObsidianCardSyncBadge(noteId) {
  const vault = String(gObsidianVaultName || "").trim();
  if (!vault) return null;

  if (!gObsidianSyncMode) {
    return {
      className: "noteObsidianSyncBadge noteObsidianSyncBadge--muted",
      text: "Vault: turn on Sync",
      title:
        "Open Settings (gear) → Obsidian tab → check “Sync mode”. Without it the extension only uses obsidian:// links and cannot read or compare vault files on disk.",
    };
  }
  if (!gObsidianVaultFolderLinked) {
    return {
      className: "noteObsidianSyncBadge noteObsidianSyncBadge--muted",
      text: "Vault: link folder",
      title:
        "Settings → Obsidian → “Choose vault folder”: Chrome opens a tab where you pick the same folder Obsidian uses as the vault root. Grant read/write when asked. Status line should say “Vault folder linked.”",
    };
  }

  if (obsidianSyncScanState === "paused_editor") {
    return {
      className: "noteObsidianSyncBadge noteObsidianSyncBadge--muted",
      text: "Vault: waiting",
      meta: "Close the open notes editor to refresh vault status.",
      title:
        "Vault compare is temporarily paused while a card’s notes editor is open, so your in-progress edits are not reset. Close the notes editor to refresh status.",
    };
  }

  if (obsidianSyncScanState === "scanning") {
    return {
      className: "noteObsidianSyncBadge noteObsidianSyncBadge--checking",
      text: "Vault: checking…",
      title: "Reading linked vault files and comparing with each note’s Markdown.",
    };
  }

  const st = obsidianSyncStatusByNoteId.get(Number(noteId));
  const base = { className: "noteObsidianSyncBadge", text: "Vault: —", title: "" };

  switch (st) {
    case "synced":
      return {
        className: "noteObsidianSyncBadge noteObsidianSyncBadge--synced",
        text: "Vault: in sync",
        title: "This card’s Markdown matches the file in your linked vault (normalized).",
      };
    case "diverged":
      return {
        className: "noteObsidianSyncBadge noteObsidianSyncBadge--diverged",
        text: "Vault: differs",
        title:
          "The vault file and this note do not match. Use Notes or Obsidian on this card to merge, or open Settings to troubleshoot.",
      };
    case "missing":
      return {
        className: "noteObsidianSyncBadge noteObsidianSyncBadge--missing",
        text: "Vault: no file yet",
        title: "No Markdown file at the mapped path yet. Sync will create it on the next write or Obsidian action.",
      };
    case "no_path":
      return {
        className: "noteObsidianSyncBadge noteObsidianSyncBadge--muted",
        text: "Vault: no path",
        title: "Could not build a vault relative path for this note (title/board).",
      };
    case "permission_needs_gesture": {
      const ph = obsidianSyncGlobalBadgeHint || "";
      return {
        className: "noteObsidianSyncBadge noteObsidianSyncBadge--warn",
        text: "Vault: grant access",
        title:
          "Chromium cannot show the folder permission prompt inside the popup. Settings → Obsidian → “Grant folder access…” opens a tab — click Allow access there. Or use Obsidian on a card (also counts as a click)." +
          (ph ? `\n\n${ph}` : ""),
      };
    }
    case "permission_denied": {
      const ph =
        obsidianSyncGlobalBadgeHint || obsidianSyncErrorHintByNoteId.get(Number(noteId)) || "";
      return {
        className: "noteObsidianSyncBadge noteObsidianSyncBadge--warn",
        text: "Vault: permission denied",
        title:
          "Allow read/write on the vault folder when Chrome prompts. If this persists: Settings → Obsidian → disconnect folder, then Choose vault folder again and pick the vault root." +
          (ph ? `\n\nDetails: ${ph}` : ""),
      };
    }
    case "path_mismatch": {
      const ph = obsidianSyncErrorHintByNoteId.get(Number(noteId)) || "";
      return {
        className: "noteObsidianSyncBadge noteObsidianSyncBadge--warn",
        text: "Vault: path conflict",
        title:
          "Something on disk is not a folder where a folder was expected (or vice versa). Often the linked folder is not the Obsidian vault root, or a board name produces an invalid path." +
          (ph ? `\n\nDetails: ${ph}` : ""),
      };
    }
    case "read_error": {
      const ph = obsidianSyncErrorHintByNoteId.get(Number(noteId)) || "";
      return {
        className: "noteObsidianSyncBadge noteObsidianSyncBadge--warn",
        text: "Vault: read error",
        title:
          "Could not read this note’s .md file under the linked vault. Right‑click the extension popup → Inspect → Console for Obsidian: lines." +
          (ph ? `\n\nDetails: ${ph}` : ""),
      };
    }
    default:
      return {
        ...base,
        className: "noteObsidianSyncBadge noteObsidianSyncBadge--muted",
        title: "Waiting for vault scan.",
      };
  }
}

function renderNotes(db, notes) {
  const pendingList = el("pendingList");
  const completeList = el("completeList");
  pendingList.textContent = "";
  completeList.textContent = "";

  let pendingCount = 0;
  let completeCount = 0;
  const searchAcrossBoards = !!String(cardFilterQuery || "").trim();
  const visibleNotes = getFilteredNotes(notes, cardFilterQuery);

  for (const note of visibleNotes) {
    const card = document.createElement("div");
    card.className = "bx--tile noteCard";
    card.dataset.noteId = String(note.id);
    card.dataset.status = note.status;
    card.dataset.priority = normalizePriority(note.priority);
    card.dataset.board = String(note.board || "");

    if (flippedNoteIds.has(note.id)) card.classList.add("is-flipped");
    const editorOpen = openNoteEditorIds.has(note.id);
    if (editorOpen) card.classList.add("is-notes-open");

    const inner = document.createElement("div");
    inner.className = "noteCardInner";

    // Front
    const front = document.createElement("div");
    front.className = "noteFace";

    const dueRow = document.createElement("div");
    dueRow.className = "noteDueDateRow";
    if (note.due_at != null && Number.isFinite(note.due_at)) {
      const dueBtn = document.createElement("button");
      dueBtn.type = "button";
      dueBtn.className = "monoLinkButton noteDueDateBtn";
      dueBtn.dataset.action = "editDueDate";
      dueBtn.dataset.noteId = String(note.id);
      dueBtn.textContent = `Due: ${formatDueDate(note.due_at)}`;
      dueBtn.setAttribute("aria-label", `Due date: ${formatDueDate(note.due_at)}. Activate to change or clear.`);
      const clearDueBtn = document.createElement("button");
      clearDueBtn.type = "button";
      clearDueBtn.className = "monoLinkButton noteDueDateClear";
      clearDueBtn.textContent = "Clear";
      clearDueBtn.dataset.action = "clearDueDate";
      clearDueBtn.dataset.noteId = String(note.id);
      clearDueBtn.setAttribute("aria-label", "Clear due date");
      dueRow.appendChild(dueBtn);
      dueRow.appendChild(clearDueBtn);
    } else {
      const addDueBtn = document.createElement("button");
      addDueBtn.type = "button";
      addDueBtn.className = "monoLinkButton noteDueDateAdd";
      addDueBtn.dataset.action = "addDueDate";
      addDueBtn.dataset.noteId = String(note.id);
      addDueBtn.textContent = "Add due date";
      addDueBtn.setAttribute("aria-label", "Add due date");
      dueRow.appendChild(addDueBtn);
    }
    front.appendChild(dueRow);

    if (searchAcrossBoards && note.board) {
      const metaRow = document.createElement("div");
      metaRow.className = "noteCardMetaRow";
      const boardBadge = document.createElement("span");
      boardBadge.className = "noteBoardBadge";
      boardBadge.textContent = String(note.board);
      metaRow.appendChild(boardBadge);
      front.appendChild(metaRow);
    }

    const syncBadgeInfo = getObsidianCardSyncBadge(note.id);
    if (syncBadgeInfo) {
      const syncRow = document.createElement("div");
      syncRow.className = "noteObsidianSyncRow";
      syncRow.setAttribute("role", "status");
      syncRow.setAttribute("aria-live", "polite");
      syncRow.setAttribute("aria-atomic", "true");
      const ariaLabel =
        syncBadgeInfo.meta != null && String(syncBadgeInfo.meta).trim()
          ? `Obsidian ${syncBadgeInfo.text}. ${syncBadgeInfo.meta}`
          : `Obsidian ${syncBadgeInfo.text}`;
      syncRow.setAttribute("aria-label", ariaLabel);
      const syncBadge = document.createElement("span");
      syncBadge.className = syncBadgeInfo.className;
      syncBadge.setAttribute("aria-hidden", "true");
      const syncBadgeText = document.createElement("span");
      syncBadgeText.className = "noteObsidianSyncBadge__text";
      syncBadgeText.textContent = syncBadgeInfo.text;
      if (syncBadgeInfo.meta != null && String(syncBadgeInfo.meta).trim()) {
        const stack = document.createElement("span");
        stack.className = "noteObsidianSyncBadge__stack";
        stack.appendChild(syncBadgeText);
        const metaEl = document.createElement("span");
        metaEl.className = "noteObsidianSyncBadge__meta";
        metaEl.textContent = syncBadgeInfo.meta;
        stack.appendChild(metaEl);
        syncBadge.appendChild(stack);
        syncBadge.classList.add("noteObsidianSyncBadge--stacked");
      } else {
        syncBadge.appendChild(syncBadgeText);
      }
      if (syncBadgeInfo.title) syncBadge.title = syncBadgeInfo.title;
      syncRow.appendChild(syncBadge);
      front.appendChild(syncRow);
    }

    const body = document.createElement("div");
    body.className = "noteText";
    body.textContent = note.text;

    const notePreviewText = getNoteNotesPreviewText(note.notes_html);
    let notesPreview = null;
    if (notePreviewText && !editorOpen) {
      notesPreview = createNoteNotesPreviewElement(notePreviewText);
    }

    const links = queryLinks(db, note.id);

    const attachments = document.createElement("div");
    attachments.className = "noteAttachments";
    if (links.length) {
      const title = document.createElement("div");
      title.className = "noteAttachmentsTitle";
      title.textContent = "Links:";
      attachments.appendChild(title);

      const items = document.createElement("div");
      items.className = "noteAttachmentsItems";

      // Show a compact preview on the front of the card.
      // The CSS caps this area to keep action buttons visible.
      const maxShow = 12;
      for (const l of links.slice(0, maxShow)) {
        const a = document.createElement("a");
        a.href = l.url;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.textContent = (l.description || "").trim() || l.url;
        a.className = "attachmentPill";
        items.appendChild(a);
      }
      if (links.length > maxShow) {
        const more = document.createElement("span");
        more.className = "attachmentPill noteAttachmentsMore";
        more.textContent = `+${links.length - maxShow} more`;
        items.appendChild(more);
      }

      attachments.appendChild(items);
    }

    const footer = document.createElement("div");
    footer.className = "noteActions";

    const priorityBtn = document.createElement("button");
    priorityBtn.type = "button";
    priorityBtn.dataset.action = "togglePriority";
    priorityBtn.dataset.noteId = String(note.id);
    priorityBtn.dataset.priority = normalizePriority(note.priority);
    applyCardActionIcon(
      priorityBtn,
      "priority",
      `Priority: ${formatPriorityLabel(note.priority)}. Activate to change.`,
      { tooltip: `Priority: ${formatPriorityLabel(note.priority)}` }
    );

    const notesBtn = document.createElement("button");
    notesBtn.type = "button";
    notesBtn.dataset.action = "toggleNotes";
    notesBtn.dataset.noteId = String(note.id);
    applyCardActionIcon(notesBtn, "notes", "Toggle notes editor", { tooltip: "Notes" });

    let obsidianBtn = null;
    if (String(gObsidianVaultName || "").trim()) {
      obsidianBtn = document.createElement("button");
      obsidianBtn.type = "button";
      obsidianBtn.dataset.action = "openObsidian";
      obsidianBtn.dataset.noteId = String(note.id);
      applyCardActionIcon(
        obsidianBtn,
        "obsidian",
        "Create or open this note in Obsidian (vault must match Settings)",
        { tooltip: "Obsidian" }
      );
    }

    const moveBtn = document.createElement("button");
    moveBtn.type = "button";

    notesBtn.setAttribute("aria-expanded", String(editorOpen));

    if (note.status === "pending") {
      moveBtn.dataset.action = "complete";
      applyCardActionIcon(moveBtn, "complete", "Mark complete", { tooltip: "Complete" });
      pendingCount++;
    } else {
      moveBtn.dataset.action = "pending";
      applyCardActionIcon(moveBtn, "pending", "Move to pending", { tooltip: "Pending" });
      completeCount++;
    }
    card.setAttribute("aria-grabbed", "false");

    // Cards are draggable for reordering within their column, except when the
    // rich editor is open (click+drag should select text, not start DnD).
    card.draggable = !editorOpen && !searchAcrossBoards;

    moveBtn.dataset.id = String(note.id);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.dataset.action = "deleteNote";
    deleteBtn.dataset.id = String(note.id);
    applyCardActionIcon(deleteBtn, "delete", "Delete note", { tooltip: "Delete" });

    const flipBtn = document.createElement("button");
    flipBtn.type = "button";
    flipBtn.dataset.action = "flip";
    flipBtn.dataset.noteId = String(note.id);
    applyCardActionIcon(flipBtn, "links", "Open links", { tooltip: "Links" });

    const moveUpBtn = document.createElement("button");
    moveUpBtn.type = "button";
    moveUpBtn.dataset.action = "moveUp";
    moveUpBtn.dataset.noteId = String(note.id);
    applyCardActionIcon(moveUpBtn, "moveUp", "Move up", { tooltip: "Move up" });

    const moveDownBtn = document.createElement("button");
    moveDownBtn.type = "button";
    moveDownBtn.dataset.action = "moveDown";
    moveDownBtn.dataset.noteId = String(note.id);
    applyCardActionIcon(moveDownBtn, "moveDown", "Move down", { tooltip: "Move down" });
    if (searchAcrossBoards) {
      moveUpBtn.disabled = true;
      moveDownBtn.disabled = true;
      moveUpBtn.title = "Clear search to reorder tasks";
      moveDownBtn.title = "Clear search to reorder tasks";
      moveUpBtn.setAttribute("aria-label", "Clear search to reorder tasks");
      moveDownBtn.setAttribute("aria-label", "Clear search to reorder tasks");
    }

    footer.appendChild(flipBtn);
    footer.appendChild(priorityBtn);
    footer.appendChild(notesBtn);
    if (obsidianBtn) footer.appendChild(obsidianBtn);
    footer.appendChild(deleteBtn);
    footer.appendChild(moveBtn);
    const moveArrowsSpacer = document.createElement("span");
    moveArrowsSpacer.className = "noteActionsMoveSpacer";
    moveArrowsSpacer.setAttribute("aria-hidden", "true");
    footer.appendChild(moveArrowsSpacer);
    footer.appendChild(moveUpBtn);
    footer.appendChild(moveDownBtn);

    const editorWrap = document.createElement("div");
    editorWrap.className = "noteEditor";
    editorWrap.hidden = !openNoteEditorIds.has(note.id);

    const toolbar = document.createElement("div");
    toolbar.className = "noteEditorToolbar";

    const mkToolBtn = (label, cmd) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.className = "monoLinkButton";
      b.dataset.action = "notesCmd";
      b.dataset.cmd = cmd;
      b.dataset.noteId = String(note.id);
      return b;
    };

    toolbar.appendChild(mkToolBtn("B", "bold"));
    toolbar.appendChild(mkToolBtn("I", "italic"));
    toolbar.appendChild(mkToolBtn("U", "underline"));
    toolbar.appendChild(mkToolBtn("•", "insertUnorderedList"));
    toolbar.appendChild(mkToolBtn("1.", "insertOrderedList"));
    toolbar.appendChild(mkToolBtn("Link", "createLink"));
    const markdownBtn = document.createElement("button");
    markdownBtn.type = "button";
    markdownBtn.textContent = "MD";
    markdownBtn.className = "monoLinkButton";
    markdownBtn.dataset.action = "renderMarkdown";
    markdownBtn.dataset.noteId = String(note.id);
    markdownBtn.title = "Render Markdown";
    markdownBtn.setAttribute("aria-label", "Render Markdown as an Obsidian-style note");
    toolbar.appendChild(markdownBtn);

    const editor = document.createElement("div");
    editor.className = "noteEditorArea";
    editor.setAttribute("contenteditable", "true");
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.setAttribute("aria-label", "Rich notes editor");
    editor.dataset.noteId = String(note.id);
    editor.innerHTML = renderPlainMarkdownNotesHtml(note.notes_html);

    const editorAutocomplete = document.createElement("div");
    editorAutocomplete.className = "noteAutocomplete noteEditorAutocomplete";
    editorAutocomplete.hidden = true;
    editorAutocomplete.dataset.noteId = String(note.id);

    const vimToast = document.createElement("div");
    vimToast.className = "noteVimToast";
    vimToast.dataset.noteId = String(note.id);
    vimToast.setAttribute("role", "status");
    vimToast.setAttribute("aria-live", "polite");
    vimToast.hidden = true;

    const vimStatus = document.createElement("div");
    vimStatus.className = "noteVimStatus";
    vimStatus.dataset.noteId = String(note.id);
    vimStatus.setAttribute("aria-label", "Vim status");
    vimStatus.textContent = "";

    editorWrap.appendChild(toolbar);
    editorWrap.appendChild(editor);
    editorWrap.appendChild(editorAutocomplete);
    editorWrap.appendChild(vimToast);
    editorWrap.appendChild(vimStatus);
    front.appendChild(body);
    if (notesPreview) front.appendChild(notesPreview);
    if (links.length) front.appendChild(attachments);
    front.appendChild(editorWrap);
    front.appendChild(footer);

    // Back (links)
    const back = document.createElement("div");
    back.className = "noteFace noteBack";

    const backBody = document.createElement("div");
    backBody.className = "noteBackBody";

    const backTitle = document.createElement("div");
    backTitle.textContent = "Links";

    const linkList = document.createElement("div");
    linkList.className = "linkList";
    if (!links.length) {
      const empty = document.createElement("div");
      empty.textContent = "No links yet.";
      linkList.appendChild(empty);
    } else {
      for (const l of links) {
        const row = document.createElement("div");
        row.className = "linkRow";

        const a = document.createElement("a");
        a.href = l.url;
        a.target = "_blank";
        a.rel = "noreferrer";
        // Show only the description (URL is still the link target)
        a.textContent = (l.description || "").trim() || l.url;

        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "Delete";
        del.className = "monoLinkButton";
        del.dataset.action = "deleteLink";
        del.dataset.linkId = String(l.id);

        row.appendChild(a);
        row.appendChild(del);
        linkList.appendChild(row);
      }
    }

    const form = document.createElement("form");
    form.className = "linkForm";
    form.dataset.noteId = String(note.id);
    form.setAttribute("aria-label", "Add link");
    const formId = `linkForm-${note.id}`;
    form.id = formId;

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.name = "description";
    descInput.placeholder = "Description…";
    descInput.autocomplete = "off";
    descInput.maxLength = 200;
    descInput.required = true;
    descInput.className = "bx--text-input";

    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.name = "url";
    urlInput.placeholder = "URL (example.com)…";
    urlInput.autocomplete = "off";
    urlInput.maxLength = 2000;
    urlInput.required = true;
    urlInput.className = "bx--text-input";

    form.appendChild(descInput);
    form.appendChild(urlInput);

    const backActions = document.createElement("div");
    backActions.className = "noteBackButtonsRow";
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.textContent = "Back";
    backBtn.className = "monoLinkButton";
    backBtn.dataset.action = "unflip";
    backBtn.dataset.noteId = String(note.id);

    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.setAttribute("form", formId);
    addBtn.textContent = "Add link";
    addBtn.className = "monoLinkButton";

    backActions.appendChild(backBtn);
    backActions.appendChild(addBtn);

    // Layout: keep inputs/buttons visible (top), and let the links list scroll.
    backBody.appendChild(backTitle);
    backBody.appendChild(form);
    backBody.appendChild(backActions);
    backBody.appendChild(document.createElement("hr"));
    backBody.appendChild(linkList);

    back.appendChild(backBody);

    inner.appendChild(front);
    inner.appendChild(back);
    card.appendChild(inner);

    (note.status === "pending" ? pendingList : completeList).appendChild(card);
  }

  el("pendingCount").textContent = String(pendingCount);
  el("completeCount").textContent = String(completeCount);
}

function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(".noteCard:not(.is-dragging)")
  ];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };

  for (const child of draggableElements) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      closest = { offset, element: child };
    }
  }

  return closest.element;
}

function persistPendingOrderFromDom(db, board, pendingList) {
  persistOrderFromDom(db, board, pendingList, "pending");
}

function persistCompleteOrderFromDom(db, board, completeList) {
  persistOrderFromDom(db, board, completeList, "complete");
}

function persistOrderFromDom(db, board, listEl, status) {
  if (!(listEl instanceof Element)) return;
  const cards = [...listEl.querySelectorAll(".noteCard[data-note-id]")];
  const now = Date.now();
  db.run("BEGIN");
  const stmt = db.prepare(
    "UPDATE notes SET sort_order = ?, priority = ?, updated_at = ? WHERE id = ? AND board = ? AND status = ?"
  );
  try {
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const id = Number(c.dataset.noteId);
      if (!Number.isFinite(id)) continue;
      const priority = normalizePriority(c.dataset.priority);
      stmt.run([i, priority, now, id, board, status]);
    }
  } finally {
    stmt.free();
    db.run("COMMIT");
  }
}

function toMdy(ts) {
  // CSV should be human-readable (MM/DD/YYYY), not an ISO timestamp.
  if (ts === null || ts === undefined) return "";
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  try {
    const d = new Date(n);
    if (!Number.isFinite(d.getTime())) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return "";
  }
}

function htmlToReadableText(html) {
  if (typeof html !== "string" || !html.trim()) return "";

  // Use the browser's HTML parser for correctness, then emit plain text.
  const container = document.createElement("div");
  container.innerHTML = html;

  const out = [];
  const isBlockTag = (tag) =>
    tag === "P" ||
    tag === "DIV" ||
    tag === "LI" ||
    tag === "TR" ||
    /^H[1-6]$/.test(tag);

  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.nodeValue || "");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node;
    const tag = el.tagName;

    if (tag === "BR") {
      out.push("\n");
      return;
    }

    if (tag === "A") {
      const text = (el.textContent || "").trim();
      const href = (el.getAttribute("href") || "").trim();
      if (text) out.push(text);
      if (!text && href) out.push(href);
      if (text && href && href !== text) out.push(` (${href})`);
      return;
    }

    for (const child of el.childNodes) walk(child);

    if (isBlockTag(tag)) out.push("\n");
  };

  for (const child of container.childNodes) walk(child);

  const text = out
    .join("")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t ]+\n/g, "\n")
    .trim();

  return text;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportAllTasksCsv(db) {
  const res = db.exec(
    `
      SELECT
        n.id,
        n.board,
        n.status,
        n.priority,
        n.text,
        n.sort_order,
        n.created_at,
        n.updated_at,
        n.completed_at,
        n.notes_html,
        n.due_at,
        COUNT(l.id) AS attachment_count,
        COALESCE(
          GROUP_CONCAT(
            COALESCE(NULLIF(TRIM(l.description), ''), l.url) || '|' || l.url,
            ' ; '
          ),
          ''
        ) AS attachments
      FROM notes n
      LEFT JOIN note_links l ON l.note_id = n.id
      GROUP BY n.id
      ORDER BY n.board ASC,
               CASE WHEN n.status = 'pending' THEN 0 ELSE 1 END,
               CASE n.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 1 END,
               n.sort_order ASC,
               n.created_at DESC,
               n.id DESC
    `
  );

  const rows = res.length ? res[0].values : [];
  const cols = res.length ? res[0].columns : [];
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));

  const header = [
    "id",
    "board",
    "status",
    "priority",
    "text",
    "sort_order",
    "created_at",
    "updated_at",
    "completed_at",
    "notes_html",
    "due_at",
    "attachment_count",
    "attachments"
  ];

  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    const dueAt = row[idx.due_at];
    const dueAtMdy = dueAt != null && Number.isFinite(Number(dueAt))
      ? toMdy(Number(dueAt))
      : "";
    lines.push(
      [
        row[idx.id],
        row[idx.board],
        row[idx.status],
        normalizePriority(row[idx.priority]),
        row[idx.text],
        row[idx.sort_order],
        toMdy(row[idx.created_at]),
        toMdy(row[idx.updated_at]),
        toMdy(row[idx.completed_at]),
        htmlToReadableText(row[idx.notes_html]),
        dueAtMdy,
        row[idx.attachment_count],
        row[idx.attachments]
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  a.href = url;
  a.download = `notes-kanban-${yyyy}-${mm}-${dd}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function main() {
  const SQL = await initSqlJs({
    locateFile: (file) => chrome.runtime.getURL(`vendor/${file}`)
  });

  const notesView = document.getElementById("notesView");
  const instructionsView = document.getElementById("instructionsView");
  const aboutView = document.getElementById("aboutView");
  const dashboardView = document.getElementById("dashboardView");
  const calendarView = document.getElementById("calendarView");
  const settingsView = document.getElementById("settingsView");
  const instructionsLink = document.getElementById("instructionsLink");
  const aboutLink = document.getElementById("aboutLink");
  const settingsBtn = document.getElementById("settingsBtn");
  const tourBtn = document.getElementById("tourBtn");
  const themeSelect = document.getElementById("themeSelect");
  const closeInstructionsBtn = document.getElementById("closeInstructionsBtn");
  const closeAboutBtn = document.getElementById("closeAboutBtn");
  const closeDashboardBtn = document.getElementById("closeDashboardBtn");
  const closeCalendarBtn = document.getElementById("closeCalendarBtn");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const settingsTabBoards = document.getElementById("settingsTabBoards");
  const settingsTabAppearance = document.getElementById("settingsTabAppearance");
  const settingsTabData = document.getElementById("settingsTabData");
  const settingsTabAi = document.getElementById("settingsTabAi");
  const settingsTabObsidian = document.getElementById("settingsTabObsidian");
  const settingsTabKeyboard = document.getElementById("settingsTabKeyboard");
  const settingsPanelBoards = document.getElementById("settingsPanelBoards");
  const settingsPanelAppearance = document.getElementById("settingsPanelAppearance");
  const settingsPanelData = document.getElementById("settingsPanelData");
  const settingsPanelAi = document.getElementById("settingsPanelAi");
  const settingsPanelObsidian = document.getElementById("settingsPanelObsidian");
  const settingsPanelKeyboard = document.getElementById("settingsPanelKeyboard");
  const settingsThemeSelect = document.getElementById("settingsThemeSelect");
  const settingsInterfaceFontSelect = document.getElementById("settingsInterfaceFontSelect");
  const settingsHeaderTitleInput = document.getElementById("settingsHeaderTitleInput");
  const settingsHeaderTitleFontSelect = document.getElementById("settingsHeaderTitleFontSelect");
  const customBackgroundFile = document.getElementById("customBackgroundFile");
  const clearCustomBackgroundBtn = document.getElementById("clearCustomBackgroundBtn");
  const customBackgroundStatus = document.getElementById("customBackgroundStatus");
  const popupSizeInputs = Array.from(document.querySelectorAll('input[name="popupSizeChoice"]'));
  const obsidianVaultNameInput = document.getElementById("obsidianVaultName");
  const obsidianNotesFolderInput = document.getElementById("obsidianNotesFolder");
  const obsidianSettingsForm = document.getElementById("obsidianSettingsForm");
  const obsidianSettingsMessage = document.getElementById("obsidianSettingsMessage");
  const instructionsContent = document.getElementById("instructionsContent");
  const dashboardContent = document.getElementById("dashboardContent");
  const calendarContent = document.getElementById("calendarContent");
  const aiSettingsMessage = document.getElementById("aiSettingsMessage");
  const aiSettingsForm = document.getElementById("aiSettingsForm");
  const aiEndpointBaseUrlInput = document.getElementById("aiEndpointBaseUrl");
  const aiEndpointModelInput = document.getElementById("aiEndpointModel");
  const aiCustomWordsInput = document.getElementById("aiCustomWords");
  const aiStatusLed = document.getElementById("aiStatusLed");
  const aiSettingsUnsavedBanner = document.getElementById("aiSettingsUnsavedBanner");
  const obsidianSettingsUnsavedBanner = document.getElementById("obsidianSettingsUnsavedBanner");
  const saveAiSettingsBtnEl = document.getElementById("saveAiSettingsBtn");
  const saveObsidianSettingsBtnEl = document.getElementById("saveObsidianSettingsBtn");

	  let aiSettingsSavedSnapshot = { url: "", model: "", words: "" };
	  let obsidianSettingsSavedSnapshot = { vault: "", folder: "", sync: false };
	  let dashboardSelectedBoard = "";

  function readAiSettingsFormSnapshot() {
    return {
      url:
        aiEndpointBaseUrlInput instanceof HTMLInputElement
          ? String(aiEndpointBaseUrlInput.value || "").trim()
          : "",
      model:
        aiEndpointModelInput instanceof HTMLInputElement
          ? String(aiEndpointModelInput.value || "").trim()
          : "",
      words: aiCustomWordsInput instanceof HTMLTextAreaElement ? String(aiCustomWordsInput.value || "") : "",
    };
  }

  function aiSnapshotsEqual(a, b) {
    return a.url === b.url && a.model === b.model && a.words === b.words;
  }

  function readObsidianSettingsFormSnapshot() {
    const syncEl = document.getElementById("obsidianSyncMode");
    return {
      vault: obsidianVaultNameInput instanceof HTMLInputElement ? obsidianVaultNameInput.value.trim() : "",
      folder: obsidianNotesFolderInput instanceof HTMLInputElement ? obsidianNotesFolderInput.value.trim() : "",
      sync: syncEl instanceof HTMLInputElement && syncEl.checked,
    };
  }

  function obsidianSnapshotsEqual(a, b) {
    return a.vault === b.vault && a.folder === b.folder && a.sync === b.sync;
  }

  function commitAiSettingsSavedSnapshot() {
    aiSettingsSavedSnapshot = readAiSettingsFormSnapshot();
    updateAiSettingsDirtyUi();
  }

  function updateAiSettingsDirtyUi() {
    const dirty = !aiSnapshotsEqual(readAiSettingsFormSnapshot(), aiSettingsSavedSnapshot);
    if (aiSettingsUnsavedBanner instanceof HTMLElement) aiSettingsUnsavedBanner.hidden = !dirty;
    if (saveAiSettingsBtnEl instanceof HTMLElement) {
      saveAiSettingsBtnEl.classList.toggle("settingsSaveButton--unsaved", dirty);
    }
  }

  function commitObsidianSettingsSavedSnapshot() {
    obsidianSettingsSavedSnapshot = readObsidianSettingsFormSnapshot();
    updateObsidianSettingsDirtyUi();
  }

  function updateObsidianSettingsDirtyUi() {
    const dirty = !obsidianSnapshotsEqual(readObsidianSettingsFormSnapshot(), obsidianSettingsSavedSnapshot);
    if (obsidianSettingsUnsavedBanner instanceof HTMLElement) obsidianSettingsUnsavedBanner.hidden = !dirty;
    if (saveObsidianSettingsBtnEl instanceof HTMLElement) {
      saveObsidianSettingsBtnEl.classList.toggle("settingsSaveButton--unsaved", dirty);
    }
  }

  const cardFilterRow = document.getElementById("cardFilterRow");
  const cardFilterInput = document.getElementById("cardFilterInput");
  const cardFilterMeta = document.getElementById("cardFilterMeta");
  const addNoteModal = document.getElementById("addNoteModal");
  const addNoteButton = document.getElementById("addNoteButton");
  const closeAddNoteModal = document.getElementById("closeAddNoteModal");
  const manageTabsMessage = document.getElementById("manageTabsMessage");
  const tabsList = document.getElementById("tabsList");
  const addTabForm = document.getElementById("addTabForm");
  const addTabName = document.getElementById("addTabName");
  const noteAutocomplete = document.getElementById("noteAutocomplete");
  const guidedTour = document.getElementById("guidedTour");
  const guidedTourPanel = guidedTour instanceof HTMLElement ? guidedTour.querySelector(".guidedTour__panel") : null;
  const guidedTourProgress = document.getElementById("guidedTourProgress");
  const guidedTourTitle = document.getElementById("guidedTourTitle");
  const guidedTourBody = document.getElementById("guidedTourBody");
  const guidedTourBack = document.getElementById("guidedTourBack");
  const guidedTourNext = document.getElementById("guidedTourNext");
  const guidedTourSkip = document.getElementById("guidedTourSkip");

  const textareaMinHeights = new WeakMap();
  let pendingSearchTaskDraft = "";

  function autosizeTextarea(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return;

    let minHeight = textareaMinHeights.get(textarea);
    if (!Number.isFinite(minHeight) || minHeight <= 0) {
      const prev = textarea.style.height;
      textarea.style.height = "";
      const measured = Math.ceil(textarea.getBoundingClientRect().height);
      textarea.style.height = prev;
      if (Number.isFinite(measured) && measured > 0) {
        minHeight = measured;
        textareaMinHeights.set(textarea, minHeight);
      } else {
        minHeight = 0;
      }
    }

    textarea.style.height = "auto";
    const target = Math.max(minHeight || 0, textarea.scrollHeight || 0);
    if (target > 0) textarea.style.height = `${target}px`;
  }

  function queueAutosizeTextarea(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    requestAnimationFrame(() => autosizeTextarea(textarea));
  }

  if (aiCustomWordsInput instanceof HTMLTextAreaElement) {
    aiCustomWordsInput.addEventListener("input", () => {
      autosizeTextarea(aiCustomWordsInput);
      updateAiSettingsDirtyUi();
    });
  }

  function setCardFilterVisible(visible) {
    if (!(cardFilterRow instanceof HTMLElement)) return;
    cardFilterRow.hidden = false;
    cardFilterRow.classList.toggle("cardFilterRow--active", !!visible);
  }

  function updateCardFilterVisibility() {
    const hasQuery = !!String(cardFilterQuery || "").trim();
    const inputFocused = document.activeElement === cardFilterInput;
    setCardFilterVisible(hasQuery || inputFocused);
  }

  function updateCardFilterMeta(visibleNotes) {
    if (!(cardFilterMeta instanceof HTMLElement)) return;
    const hasQuery = !!String(cardFilterQuery || "").trim();
    if (!hasQuery) {
      cardFilterMeta.textContent = `Active board: ${activeBoard}. Type to search every board.`;
      return;
    }
    const matches = Array.isArray(visibleNotes) ? visibleNotes : [];
    const boardCount = new Set(matches.map((note) => String(note?.board || "").trim()).filter(Boolean)).size;
    cardFilterMeta.textContent = `${matches.length} match${matches.length === 1 ? "" : "es"} across ${boardCount} board${boardCount === 1 ? "" : "s"}. Esc clears search.`;
  }

  function showNotesView() {
    if (notesView instanceof HTMLElement) notesView.hidden = false;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = true;
    if (aboutView instanceof HTMLElement) aboutView.hidden = true;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = true;
    if (calendarView instanceof HTMLElement) calendarView.hidden = true;
    if (settingsView instanceof HTMLElement) settingsView.hidden = true;
  }

  function showInstructionsView() {
    if (notesView instanceof HTMLElement) notesView.hidden = true;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = false;
    if (aboutView instanceof HTMLElement) aboutView.hidden = true;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = true;
    if (calendarView instanceof HTMLElement) calendarView.hidden = true;
    if (settingsView instanceof HTMLElement) settingsView.hidden = true;
  }

  function showAboutView() {
    if (notesView instanceof HTMLElement) notesView.hidden = true;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = true;
    if (aboutView instanceof HTMLElement) aboutView.hidden = false;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = true;
    if (calendarView instanceof HTMLElement) calendarView.hidden = true;
    if (settingsView instanceof HTMLElement) settingsView.hidden = true;
  }

  function showDashboardView() {
    if (notesView instanceof HTMLElement) notesView.hidden = true;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = true;
    if (aboutView instanceof HTMLElement) aboutView.hidden = true;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = false;
    if (calendarView instanceof HTMLElement) calendarView.hidden = true;
    if (settingsView instanceof HTMLElement) settingsView.hidden = true;
  }

  function showCalendarView() {
    if (notesView instanceof HTMLElement) notesView.hidden = true;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = true;
    if (aboutView instanceof HTMLElement) aboutView.hidden = true;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = true;
    if (calendarView instanceof HTMLElement) calendarView.hidden = false;
    if (settingsView instanceof HTMLElement) settingsView.hidden = true;
  }

  function setSettingsSection(section) {
    const boards = section === "boards";
    const appearance = section === "appearance";
    const data = section === "data";
    const ai = section === "ai";
    const obs = section === "obsidian";
    const kbd = section === "keyboard";
    if (settingsPanelBoards instanceof HTMLElement) settingsPanelBoards.hidden = !boards;
    if (settingsPanelAppearance instanceof HTMLElement) settingsPanelAppearance.hidden = !appearance;
    if (settingsPanelData instanceof HTMLElement) settingsPanelData.hidden = !data;
    if (settingsPanelAi instanceof HTMLElement) settingsPanelAi.hidden = !ai;
    if (settingsPanelObsidian instanceof HTMLElement) settingsPanelObsidian.hidden = !obs;
    if (settingsPanelKeyboard instanceof HTMLElement) settingsPanelKeyboard.hidden = !kbd;
    if (settingsTabBoards instanceof HTMLElement) {
      settingsTabBoards.setAttribute("aria-selected", boards ? "true" : "false");
    }
    if (settingsTabAppearance instanceof HTMLElement) {
      settingsTabAppearance.setAttribute("aria-selected", appearance ? "true" : "false");
    }
    if (settingsTabData instanceof HTMLElement) {
      settingsTabData.setAttribute("aria-selected", data ? "true" : "false");
    }
    if (settingsTabAi instanceof HTMLElement) {
      settingsTabAi.setAttribute("aria-selected", ai ? "true" : "false");
    }
    if (settingsTabObsidian instanceof HTMLElement) {
      settingsTabObsidian.setAttribute("aria-selected", obs ? "true" : "false");
    }
    if (settingsTabKeyboard instanceof HTMLElement) {
      settingsTabKeyboard.setAttribute("aria-selected", kbd ? "true" : "false");
    }
  }

  function showSettingsView(section) {
    if (notesView instanceof HTMLElement) notesView.hidden = true;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = true;
    if (aboutView instanceof HTMLElement) aboutView.hidden = true;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = true;
    if (calendarView instanceof HTMLElement) calendarView.hidden = true;
    if (settingsView instanceof HTMLElement) settingsView.hidden = false;
    const map = {
      boards: "boards",
      appearance: "appearance",
      data: "data",
      ai: "ai",
      obsidian: "obsidian",
      keyboard: "keyboard",
    };
    const sec = map[section] || "boards";
    setSettingsSection(sec);
  }

  const TOUR_STEPS = [
    {
      view: "notes",
      target: "#addNoteButton",
      title: "Create tasks",
      body: "Use the add button to open a focused task form for the current board.",
    },
    {
      view: "notes",
      target: "#notesBoard",
      title: "Work the board",
      body: "Cards live in Pending and Complete. The app is keyboard-first: move by visual direction, then press Enter on focused controls.",
    },
    {
      view: "settings",
      section: "boards",
      target: "#settingsView",
      title: "Open Settings",
      body: "Settings are split into sections. The tour will switch through each section so you know where the main controls live.",
    },
    {
      view: "settings",
      section: "boards",
      target: "#settingsPanelBoards",
      title: "Boards",
      body: "Add, rename, remove, and reorder boards. These are the tabs above your Pending and Complete columns.",
    },
    {
      view: "settings",
      section: "appearance",
      target: "#settingsPanelAppearance",
      title: "Appearance",
      body: "Change the theme here or from the top bar, and pick the popup size that fits your workflow.",
    },
    {
      view: "settings",
      section: "data",
      target: "#settingsPanelData",
      title: "Data",
      body: "Import and export your local database or CSV when you want a backup or a portable copy.",
    },
    {
      view: "settings",
      section: "ai",
      target: "#settingsPanelAi",
      title: "AI",
      body: "Connect Ollama and tune completion vocabulary for the new-task autocomplete flow.",
    },
    {
      view: "settings",
      section: "obsidian",
      target: "#settingsPanelObsidian",
      title: "Obsidian",
      body: "Link your vault folder and configure sync so cards can compare and update Markdown files.",
    },
    {
      view: "settings",
      section: "keyboard",
      target: "#settingsPanelKeyboard",
      title: "Keyboard",
      body: "Choose Windows / Linux (Alt+letters) or Mac (Ctrl+letters, not Command), and QWERTY or Dvorak, so the tour and docs match the keys you press.",
    },
  ];

  let guidedTourIndex = 0;
  let guidedTourActive = false;
  let guidedTourLastFocus = null;
  let guidedTourTarget = null;

  function clearGuidedTourTarget() {
    if (guidedTourTarget instanceof HTMLElement) {
      guidedTourTarget.classList.remove("guidedTourTarget");
    }
    guidedTourTarget = null;
    if (guidedTour instanceof HTMLElement) {
      guidedTour.classList.remove("guidedTour--hasTarget");
    }
    if (guidedTourPanel instanceof HTMLElement) {
      guidedTourPanel.classList.remove("guidedTour__panel--anchored");
      guidedTourPanel.style.left = "";
      guidedTourPanel.style.top = "";
      guidedTourPanel.style.transform = "";
    }
  }

  function getGuidedTourSpotlightRadius(target) {
    const computed = window.getComputedStyle(target);
    const radius = parseFloat(computed.borderTopLeftRadius || "0");
    return Number.isFinite(radius) ? Math.min(Math.max(radius + 8, 8), 18) : 8;
  }

  function positionGuidedTourPanel(targetRect) {
    if (!(guidedTourPanel instanceof HTMLElement) || !(targetRect instanceof DOMRect)) return;
    const margin = 12;
    const gap = 14;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const panelRect = guidedTourPanel.getBoundingClientRect();
    const targetCenter = targetRect.left + targetRect.width / 2;
    const left = Math.min(
      Math.max(margin, targetCenter - panelRect.width / 2),
      Math.max(margin, viewportWidth - panelRect.width - margin)
    );
    let top = targetRect.bottom + gap;

    if (top + panelRect.height > viewportHeight - margin) {
      top = targetRect.top - panelRect.height - gap;
    }
    if (top < margin) {
      top = Math.max(margin, viewportHeight - panelRect.height - margin);
    }

    guidedTourPanel.classList.add("guidedTour__panel--anchored");
    guidedTourPanel.style.left = `${Math.round(left)}px`;
    guidedTourPanel.style.top = `${Math.round(top)}px`;
    guidedTourPanel.style.transform = "none";
  }

  function updateGuidedTourSpotlight() {
    if (!(guidedTour instanceof HTMLElement) || !(guidedTourTarget instanceof HTMLElement)) return;
    const rect = guidedTourTarget.getBoundingClientRect();
    const padding = 8;
    const x = Math.max(8, rect.left - padding);
    const y = Math.max(8, rect.top - padding);
    const width = Math.min(window.innerWidth - x - 8, rect.width + padding * 2);
    const height = Math.min(window.innerHeight - y - 8, rect.height + padding * 2);

    guidedTour.style.setProperty("--guided-tour-spotlight-x", `${Math.round(x)}px`);
    guidedTour.style.setProperty("--guided-tour-spotlight-y", `${Math.round(y)}px`);
    guidedTour.style.setProperty("--guided-tour-spotlight-width", `${Math.round(Math.max(width, 24))}px`);
    guidedTour.style.setProperty("--guided-tour-spotlight-height", `${Math.round(Math.max(height, 24))}px`);
    guidedTour.style.setProperty("--guided-tour-spotlight-radius", `${getGuidedTourSpotlightRadius(guidedTourTarget)}px`);
    guidedTour.classList.add("guidedTour--hasTarget");
    positionGuidedTourPanel(new DOMRect(x, y, width, height));
  }

  function prepareGuidedTourStep(step) {
    if (!step) return;
    if (step.view === "settings") {
      showSettingsView(step.section || "boards");
      if (step.section === "ai") {
        syncAiSettingsFormFieldsFromGlobals();
        commitAiSettingsSavedSnapshot();
      }
      if (step.section === "obsidian") {
        syncObsidianSettingsFormFieldsFromGlobals();
        commitObsidianSettingsSavedSnapshot();
      }
    } else {
      showNotesView();
    }
  }

  function renderGuidedTourStep() {
    if (!guidedTourActive) return;
    const step = TOUR_STEPS[guidedTourIndex];
    if (!step) return;
    prepareGuidedTourStep(step);
    clearGuidedTourTarget();

    if (guidedTour instanceof HTMLElement) {
      guidedTour.hidden = false;
      guidedTour.setAttribute("aria-hidden", "false");
    }
    if (guidedTourProgress instanceof HTMLElement) {
      guidedTourProgress.textContent = `Step ${guidedTourIndex + 1} of ${TOUR_STEPS.length}`;
    }
    if (guidedTourTitle instanceof HTMLElement) guidedTourTitle.textContent = step.title;
    if (guidedTourBody instanceof HTMLElement) guidedTourBody.textContent = step.body;
    if (guidedTourBack instanceof HTMLButtonElement) guidedTourBack.disabled = guidedTourIndex === 0;
    if (guidedTourNext instanceof HTMLButtonElement) {
      guidedTourNext.textContent = guidedTourIndex === TOUR_STEPS.length - 1 ? "Done" : "Next";
    }

    requestAnimationFrame(() => {
      const target = step.target ? document.querySelector(step.target) : null;
      if (target instanceof HTMLElement) {
        try {
          target.scrollIntoView({ block: "center", inline: "nearest" });
        } catch {
          // ignore
        }
        requestAnimationFrame(() => {
          if (target instanceof HTMLElement && isElementInVisibleView(target)) {
            guidedTourTarget = target;
            guidedTourTarget.classList.add("guidedTourTarget");
            updateGuidedTourSpotlight();
          }
        });
      }
      if (guidedTourNext instanceof HTMLElement) safeFocus(guidedTourNext);
    });
  }

  function setGuidedTourSeen() {
    dbSetAppSettingString(APP_SETTING_TOUR_SEEN, "1");
    void persist().catch(() => {
      // ignore
    });
  }

  function closeGuidedTour({ restoreFocus = true } = {}) {
    guidedTourActive = false;
    clearGuidedTourTarget();
    if (guidedTour instanceof HTMLElement) {
      guidedTour.hidden = true;
      guidedTour.setAttribute("aria-hidden", "true");
    }
    // Tour steps may end in Settings; always bring the app back to the main notes screen.
    showNotesView();

    let restored = false;
    if (restoreFocus && guidedTourLastFocus instanceof HTMLElement && isElementInVisibleView(guidedTourLastFocus)) {
      restored = safeFocus(guidedTourLastFocus);
    }
    if (!restored) {
      if (addNoteButton instanceof HTMLElement) safeFocus(addNoteButton);
    }
    guidedTourLastFocus = null;
  }

  function startGuidedTour({ markSeen = false } = {}) {
    guidedTourActive = true;
    guidedTourIndex = 0;
    guidedTourLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (markSeen) setGuidedTourSeen();
    renderGuidedTourStep();
  }

  const THEME_LABELS = {
    light: "Light",
    dark: "Dark",
    "solarized-light": "Solarized",
    "solarized-dark": "Solarized Dark",
    emacs: "Emacs",
    "emacs-dark": "Emacs Dark",
    "command-line": "Command Line",
    nothing: "Nothing",
    "nothing-light": "Nothing Light",
  };

  function populateOneThemeSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    select.innerHTML = "";
    for (const id of THEME_ORDER) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = THEME_LABELS[id] || id;
      select.appendChild(opt);
    }
  }

  function populateThemeSelect() {
    populateOneThemeSelect(themeSelect);
    populateOneThemeSelect(settingsThemeSelect);
  }

  function populateHeaderTitleFontSelect() {
    if (!(settingsHeaderTitleFontSelect instanceof HTMLSelectElement)) return;
    settingsHeaderTitleFontSelect.innerHTML = "";
    for (const key of HEADER_TITLE_FONT_ORDER) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = HEADER_TITLE_FONT_LABELS[key] || (key || "Theme default");
      settingsHeaderTitleFontSelect.appendChild(opt);
    }
  }

  function populateInterfaceFontSelect() {
    if (!(settingsInterfaceFontSelect instanceof HTMLSelectElement)) return;
    settingsInterfaceFontSelect.innerHTML = "";
    for (const key of INTERFACE_FONT_ORDER) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = INTERFACE_FONT_LABELS[key] || (key || "Theme default");
      settingsInterfaceFontSelect.appendChild(opt);
    }
  }

	  function applyTheme(t) {
	    const value = THEME_ORDER.includes(t) ? t : "light";
	    document.documentElement.setAttribute("data-theme", value);
	    if (themeSelect instanceof HTMLSelectElement) {
	      themeSelect.value = value;
	      themeSelect.setAttribute("aria-label", `Theme: ${THEME_LABELS[value] || value}. Press Enter to change themes, then use navigation keys. Press Escape to exit theme change mode.`);
	    }
	    if (settingsThemeSelect instanceof HTMLSelectElement) {
	      settingsThemeSelect.value = value;
	      settingsThemeSelect.setAttribute("aria-label", `Theme: ${THEME_LABELS[value] || value}`);
	    }
	    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: "vim-todo-theme", theme: value }, "*");
      } catch {
        // ignore
      }
    }
  }

  function setCustomBackgroundStatus(message) {
    if (customBackgroundStatus instanceof HTMLElement) customBackgroundStatus.textContent = String(message || "");
  }

  let customBackgroundAnalysisRequest = 0;

  async function updateCustomBackgroundContrast(dataUrl) {
    const app = document.querySelector(".app");
    if (!(app instanceof HTMLElement)) return;
    const requestId = ++customBackgroundAnalysisRequest;
    const value = String(dataUrl || "");
    if (!/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value)) {
      app.classList.remove("app--customBackgroundLight", "app--customBackgroundDark");
      return;
    }

    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = value;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 48;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let luminanceTotal = 0;
      let pixelCount = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 64) continue;
        luminanceTotal += (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
        pixelCount += 1;
      }
      if (!pixelCount) throw new Error("No visible pixels");
      if (requestId !== customBackgroundAnalysisRequest) return;
      const isLight = luminanceTotal / pixelCount >= 0.55;
      app.classList.toggle("app--customBackgroundLight", isLight);
      app.classList.toggle("app--customBackgroundDark", !isLight);
    } catch {
      if (requestId === customBackgroundAnalysisRequest) {
        app.classList.remove("app--customBackgroundLight", "app--customBackgroundDark");
      }
    }
  }

  function applyCustomBackground(dataUrl) {
    const app = document.querySelector(".app");
    if (!(app instanceof HTMLElement)) return;
    const value = String(dataUrl || "");
    const valid = /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value);
    app.classList.toggle("app--hasCustomBackground", valid);
    if (valid) app.style.setProperty("--custom-background-image", `url("${value}")`);
    else app.style.removeProperty("--custom-background-image");
    void updateCustomBackgroundContrast(valid ? value : "");
    if (clearCustomBackgroundBtn instanceof HTMLButtonElement) clearCustomBackgroundBtn.disabled = !valid;
  }

  function getNavKeys(layout) {
    const l = layout === "dvorak" ? "dvorak" : "qwerty";
    if (l === "dvorak") {
      return { down: "t", up: "c", left: "h", right: "n" };
    }
    // QWERTY: IJKL (up/down/left/right)
    return { down: "k", up: "i", left: "j", right: "l" };
  }

  function getNotesCheckboxKey(layout) {
    const l = layout === "dvorak" ? "dvorak" : "qwerty";
    // QWERTY: mod+H, DVORAK: mod+D (see Settings > Keyboard: Alt vs Ctrl)
    return l === "dvorak" ? "d" : "h";
  }

  function getFocusNewNoteKey(layout) {
    const l = layout === "dvorak" ? "dvorak" : "qwerty";
    // Same physical key: QWERTY P = DVORAK L
    return l === "dvorak" ? "l" : "p";
  }

  function getOpenPopupKey(layout) {
    void layout;
    return "r";
  }

  function renderInstructions() {
    if (!(instructionsContent instanceof HTMLElement)) return;

    const nav = getNavKeys(keyLayout);
    const checkboxKey = getNotesCheckboxKey(keyLayout);
    const focusNewNoteKey = getFocusNewNoteKey(keyLayout);
    const openPopupKey = getOpenPopupKey(keyLayout);
    const layoutLabel = keyLayout === "dvorak" ? "DVORAK" : "QWERTY";

    const fmt = (k) => String(k || "").toUpperCase();
    const keycap = (text) => `<kbd>${String(text || "")}</kbd>`;
    const combo = (...keys) => keys.map((k) => keycap(k)).join(`<span class="keycapSep">+</span>`);
    const mod = modKeyLabel();
    const platformNote = useNavMacModifier()
      ? "On the <b>Mac</b> profile, use <b>Control (⌃)</b> with the keys below — not Command (⌘)."
      : "On the <b>Windows / Linux</b> profile, use <b>Alt</b> with the keys below (Option also registers as Alt on many Mac keyboards).";
    const keyRow = (keys, desc) => `
      <div class="instructionsKeyRow">
        <div class="instructionsKeyRow__keys">${keys}</div>
        <div class="instructionsKeyRow__desc">${desc}</div>
      </div>`;
    const section = (title, body) => `
      <section class="instructionsSection" tabindex="0" aria-label="${title}">
        <h3>${title}</h3>
        ${body}
      </section>`;

    instructionsContent.innerHTML = `
      <div class="instructionsLead" tabindex="0" aria-label="Keyboard-first workflow">
        <h3 class="instructionsLead__title">Keyboard-first workflow</h3>
        <p class="instructionsLead__body">
          Current layout: <b>${layoutLabel}</b>. ${platformNote} Use ${keycap(mod)} with the shown navigation keys. Press ${keycap("Esc")} to leave overlay views; focused buttons activate with ${keycap("Enter")}. This view follows the same navigation bindings. You can change the profile in <b>Settings &gt; Keyboard</b>.
        </p>
      </div>

      <div class="instructionsGrid">
	        ${section(
	          "Core Navigation",
	          `<div class="instructionsKeyList">
	            ${keyRow(combo(mod, fmt(nav.down)), "Move down through the current area.")}
	            ${keyRow(combo(mod, fmt(nav.up)), "Move up through the current area.")}
	            ${keyRow(combo(mod, fmt(nav.left)), "Move left, previous control, or previous column.")}
	            ${keyRow(combo(mod, fmt(nav.right)), "Move right, next control, or next column.")}
            ${keyRow(combo(mod, fmt(focusNewNoteKey)), "Open the new note form.")}
	            ${keyRow(keycap("/"), "Focus the card filter for the current board.")}
	            ${keyRow(keycap("F2"), "Rename the focused card, or rename a board in Settings > Boards.")}
	          </div>
	          <ul>
	            <li>Board strip: switch the active board. Manage boards in <b>Settings > Boards</b>.</li>
	            <li>Pending / Complete: use ${combo(mod, fmt(nav.left))}/${combo(mod, fmt(nav.right))} between column headers; press ${keycap("Enter")} or ${keycap("Space")} on a collapsed column to expand it.</li>
	          </ul>`
	        )}

	        ${section(
	          "Create & Due Dates",
	          `<div class="instructionsKeyList">
	            ${keyRow(combo(mod, fmt(nav.right)), "From new note: move to due date.")}
	            ${keyRow(combo(mod, fmt(nav.left)), "From due date: return to new note.")}
	            ${keyRow(combo(mod, fmt(nav.down)), "From create row: move to filter, column, or first card.")}
	          </div>
	          <ul>
	            <li>Add a due date while creating a note, or use the due date action on each card.</li>
	            <li>Quick due-date buttons below the Due field set the picker to Today, +1w, +2w, or +1mo.</li>
	            <li>Card due date row: move from actions with ${combo(mod, fmt(nav.up))}; move back down with ${combo(mod, fmt(nav.down))}.</li>
	          </ul>`
	        )}

	        ${section(
	          "Card Actions",
	          `<div class="instructionsKeyList">
	            ${keyRow(combo(mod, fmt(nav.left)) + " / " + combo(mod, fmt(nav.right)), "Move across card action buttons.")}
	            ${keyRow(keycap("Enter"), "Activate the focused action.")}
		            ${keyRow(keycap(":x"), "Close notes editor (pushing to Obsidian when sync is on) or flipped links panel.")}
	          </div>
	          <ul>
	            <li>Use the arrow action buttons to move a card up or down within its column.</li>
	            <li>Drag and drop also reorders cards within Pending or Complete.</li>
	          </ul>`
	        )}

	        ${section(
	          "Notes Editor",
	          `<div class="instructionsKeyList">
	            ${keyRow(keycap("Esc"), "Insert > normal, visual > normal, normal > close notes.")}
	            ${keyRow(combo(mod, fmt(checkboxKey)), "Toggle crossed-out text for the current line.")}
	            ${keyRow(keycap("u"), "Undo last change in normal mode.")}
	            ${keyRow(keycap("v"), "Enter visual selection mode.")}
	            ${keyRow(keycap("y") + " / " + keycap("c"), "Yank, or cut selection and enter insert mode.")}
	            ${keyRow(keycap("p"), "Paste register at caret and enter insert mode.")}
	          </div>
	          <ul>
	            <li>Visual selection: use arrow keys, ${combo(mod, fmt(nav.up))}/${combo(mod, fmt(nav.down))}/${combo(mod, fmt(nav.left))}/${combo(mod, fmt(nav.right))}, ${keycap("0")}, ${keycap("^")}, ${keycap("$")}, ${keycap("gg")}, and ${keycap("G")}.</li>
	            <li>Registers: ${keycap('"')} plus ${keycap("1")}-${keycap("4")} chooses a register; ${keycap('"')} plus ${keycap("+")} uses the system clipboard register.</li>
	          </ul>`
	        )}

	        ${section(
	          "Calendar",
	          `<div class="instructionsKeyList">
	            ${keyRow(combo(mod, fmt(nav.up)) + " / " + combo(mod, fmt(nav.down)), "Move between calendar rows or months.")}
	            ${keyRow(combo(mod, fmt(nav.left)) + " / " + combo(mod, fmt(nav.right)), "Move between days.")}
	            ${keyRow(keycap("Enter"), "Open the selected day&rsquo;s task list.")}
	            ${keyRow(keycap("Esc"), "Exit the right pane, then close Calendar.")}
	          </div>
	          <ul>
	            <li>Calendar shows the current month and 3 months ahead.</li>
	            <li>Dots encode pending priority: red high, blue normal, gray low.</li>
	          </ul>`
	        )}

	        ${section(
	          "Settings & Theme",
	          `<div class="instructionsKeyList">
	            ${keyRow(combo(mod, fmt(nav.up)) + " / " + combo(mod, fmt(nav.down)), "Move between Settings tabs or fields.")}
	            ${keyRow(combo(mod, fmt(nav.left)), "From a panel or Close, return to the selected sidebar tab.")}
	            ${keyRow(combo(mod, fmt(nav.right)), "From a sidebar tab, enter the panel.")}
	            ${keyRow(keycap("Enter"), "When theme select is focused, enter theme change mode.")}
	            ${keyRow(keycap("Esc"), "Exit theme change mode or close Settings.")}
	          </div>
	          <ul>
	            <li>Theme select opens with click. Keyboard changes start after ${keycap("Enter")}; then use navigation up/down to cycle themes.</li>
	            <li>AI settings live under <b>Settings > AI</b>. Import and export live under <b>Settings > Data</b>.</li>
	          </ul>`
	        )}

	        ${section(
	          "Autocomplete",
	          `<div class="instructionsKeyList">
	            ${keyRow(keycap("Tab"), "Accept the &ldquo;Complete:&rdquo; recommendation when shown.")}
	            ${keyRow(combo(mod, fmt(nav.down)) + " / " + combo(mod, fmt(nav.up)), "Move through visible suggestions.")}
	          </div>
	          <ul>
	            <li>Local suggestions appear while typing in the new note input.</li>
	            <li>If no completion is selected, ${keycap("Tab")} stays in the New note field.</li>
	          </ul>`
	        )}

	        ${section(
	          "AI & Popup Shortcut",
	          `<div class="instructionsKeyList">
	            ${keyRow(combo(mod, fmt(openPopupKey)), "Open the popup when Chrome has focus.")}
	          </div>
	          <ul>
	            <li>If the shortcut does not work, open ${keycap("chrome://extensions/shortcuts")} and assign it to &ldquo;Open vim-todo-list popup&rdquo;.</li>
	            <li>If Ollama status stays &ldquo;checking&rdquo;, confirm Ollama is running and reachable at the configured URL.</li>
	            <li>For remote Ollama hosts, enter the full URL in Settings. Chrome may ask for permission when you save.</li>
	          </ul>`
	        )}
	      </div>
	    `;
	  }

		  function renderDashboardHeatmap(title, counts, tone) {
	    const dayMs = 24 * 60 * 60 * 1000;
	    const today = new Date();
	    today.setHours(0, 0, 0, 0);
	    const start = new Date(today);
	    start.setDate(today.getDate() - 25 * 7);
	    start.setDate(start.getDate() - start.getDay());
	    const max = Math.max(1, ...Object.values(counts || {}).map((v) => Number(v) || 0));
	    const weekCount = 51;
	    const todayWeek = Math.floor((today.getTime() - start.getTime()) / (7 * dayMs));
	    const todayLabel = today.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
	    const monthLabels = Array.from({ length: weekCount }, () => "");
	    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	    const cells = [];
	    let previousMonth = -1;
	
	    for (let week = 0; week < weekCount; week += 1) {
	      const weekStart = new Date(start.getTime() + week * 7 * dayMs);
	      if (weekStart.getMonth() !== previousMonth) {
	        monthLabels[week] = weekStart.toLocaleString(undefined, { month: "short" });
	        previousMonth = weekStart.getMonth();
	      }
	      for (let day = 0; day < 7; day += 1) {
	        const date = new Date(weekStart.getTime() + day * dayMs);
	        const key = localDateKey(date.getTime());
	        const count = Number(counts?.[key] || 0);
	        const level = count <= 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
	        const formatted = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
	        cells.push(
	          `<span class="dashboardHeatmapCell dashboardHeatmapCell--${tone} dashboardHeatmapCell--level${level}" title="${count} ${escapeHtml(title.toLowerCase())} due ${escapeHtml(formatted)}" aria-label="${count} ${escapeHtml(title.toLowerCase())} due ${escapeHtml(formatted)}"></span>`
	        );
	      }
	    }

	    return `
	      <article class="dashboardHeatmap" aria-label="${escapeHtml(title)} activity heatmap">
	        <div class="dashboardHeatmapHeader">
	          <h4 class="dashboardHeatmapTitle">${escapeHtml(title)}</h4>
	          <div class="dashboardHeatmapLegend" aria-label="Activity intensity">
	            <span>Less</span>
	            <span class="dashboardHeatmapCell dashboardHeatmapCell--${tone} dashboardHeatmapCell--level0" aria-hidden="true"></span>
	            <span class="dashboardHeatmapCell dashboardHeatmapCell--${tone} dashboardHeatmapCell--level1" aria-hidden="true"></span>
	            <span class="dashboardHeatmapCell dashboardHeatmapCell--${tone} dashboardHeatmapCell--level2" aria-hidden="true"></span>
	            <span class="dashboardHeatmapCell dashboardHeatmapCell--${tone} dashboardHeatmapCell--level3" aria-hidden="true"></span>
	            <span class="dashboardHeatmapCell dashboardHeatmapCell--${tone} dashboardHeatmapCell--level4" aria-hidden="true"></span>
	            <span>More</span>
	          </div>
	        </div>
	        <div class="dashboardHeatmapMonths" aria-hidden="true">${monthLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
	        <div class="dashboardHeatmapBody">
	          <div class="dashboardHeatmapDays" aria-hidden="true">${dayLabels.map((label) => `<span>${label}</span>`).join("")}</div>
	          <div class="dashboardHeatmapGridWrap" style="--dashboard-today-week:${todayWeek}" aria-label="Today marker: ${escapeHtml(todayLabel)}">
	            <span class="dashboardHeatmapTodayMarker" aria-hidden="true"></span>
	            <span class="dashboardHeatmapTodayLabel" aria-hidden="true">Today</span>
	            <div class="dashboardHeatmapGrid" role="img" aria-label="${escapeHtml(title)} daily due-date activity from 25 weeks before today through 25 weeks after today">${cells.join("")}</div>
	          </div>
	        </div>
	      </article>
		    `;
		  }

		  function dashboardFilterItems(boardNames) {
		    const used = new Set(["", "0"]);
		    const fallback = "123456789abcdefghijklmnopqrstuvwxyz".split("");
		    const pickKey = (name, index) => {
		      const chars = String(name || "")
		        .toLowerCase()
		        .replace(/[^a-z0-9]/g, "")
		        .split("");
		      for (const ch of chars) {
		        if (!used.has(ch)) {
		          used.add(ch);
		          return ch;
		        }
		      }
		      for (const ch of fallback) {
		        if (!used.has(ch)) {
		          used.add(ch);
		          return ch;
		        }
		      }
		      return String(index + 1);
		    };
		    return [
		      { board: "", label: "All Tabs", key: "0" },
		      ...boardNames.map((board, index) => ({
		        board,
		        label: board,
		        key: pickKey(board, index),
		      })),
		    ];
		  }

		  function renderDashboardFilterCard(items) {
		    return `
		      <section class="dashboardSection dashboardFilterCard" aria-labelledby="dashboardFilterTitle">
		        <div class="dashboardSectionHeader">
		          <h3 id="dashboardFilterTitle" class="dashboardSectionTitle">Tab Filter</h3>
		          <span class="dashboardSectionMeta">Arrows or shown key</span>
		        </div>
		        <div class="dashboardFilterList" role="toolbar" aria-label="Filter dashboard by tab">
		          ${items
		            .map((item, index) => {
		              const selected = item.board === dashboardSelectedBoard;
		              const label = escapeHtml(item.label);
		              const key = escapeHtml(String(item.key || "").toUpperCase());
		              return `<button type="button" class="dashboardFilterButton" data-dashboard-filter-index="${index}" data-dashboard-filter-key="${escapeHtmlAttribute(item.key)}" data-dashboard-filter-board="${escapeHtmlAttribute(item.board)}" data-dashboard-filter-selected="${selected ? "true" : "false"}" aria-pressed="${selected ? "true" : "false"}"><span class="dashboardFilterButton__key">${key}</span><span class="dashboardFilterButton__label">${label}</span></button>`;
		            })
		            .join("")}
		        </div>
		      </section>
		    `;
		  }

		  function wireDashboardFilters() {
		    if (!(dashboardContent instanceof HTMLElement)) return;
		    const list = dashboardContent.querySelector(".dashboardFilterList");
		    if (!(list instanceof HTMLElement)) return;
		    const buttons = [...list.querySelectorAll(".dashboardFilterButton")].filter(
		      (button) => button instanceof HTMLButtonElement
		    );
		    const selectButton = (button, focusAfter = true) => {
		      if (!(button instanceof HTMLButtonElement)) return;
		      dashboardSelectedBoard = button.dataset.dashboardFilterBoard || "";
		      renderDashboard();
		      if (focusAfter) {
		        requestAnimationFrame(() => {
		          const next = dashboardContent.querySelector('.dashboardFilterButton[data-dashboard-filter-selected="true"]');
		          if (next instanceof HTMLElement) safeFocus(next);
		        });
		      }
		    };
		    for (const button of buttons) {
		      button.addEventListener("click", () => selectButton(button, true));
		    }
		    list.addEventListener("keydown", (e) => {
		      const active = document.activeElement;
		      const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
		      const key = String(e.key || "").toLowerCase();
		      if (key === "arrowright" || key === "arrowdown" || key === "arrowleft" || key === "arrowup") {
		        e.preventDefault();
		        const delta = key === "arrowright" || key === "arrowdown" ? 1 : -1;
		        const nextIndex = index >= 0 ? (index + delta + buttons.length) % buttons.length : 0;
		        safeFocus(buttons[nextIndex]);
		        return;
		      }
		      if (key === "home" || key === "end") {
		        e.preventDefault();
		        safeFocus(buttons[key === "home" ? 0 : buttons.length - 1]);
		        return;
		      }
		    });
		  }

		  function activateDashboardFilterKey(key, focusAfter = true) {
		    if (!(dashboardView instanceof HTMLElement) || dashboardView.hidden) return false;
		    if (!(dashboardContent instanceof HTMLElement)) return false;
		    const normalized = String(key || "").toLowerCase();
		    if (normalized.length !== 1) return false;
		    const buttons = [...dashboardContent.querySelectorAll(".dashboardFilterButton")].filter(
		      (button) => button instanceof HTMLButtonElement
		    );
		    const matched = buttons.find(
		      (button) => (button.dataset.dashboardFilterKey || "").toLowerCase() === normalized
		    );
		    if (!(matched instanceof HTMLButtonElement)) return false;
		    dashboardSelectedBoard = matched.dataset.dashboardFilterBoard || "";
		    renderDashboard();
		    if (focusAfter) {
		      requestAnimationFrame(() => {
		        if (!(dashboardContent instanceof HTMLElement)) return;
		        const next = dashboardContent.querySelector('.dashboardFilterButton[data-dashboard-filter-selected="true"]');
		        if (next instanceof HTMLElement) safeFocus(next);
		      });
		    }
		    return true;
		  }

		  function renderDashboard() {
		    if (!(dashboardContent instanceof HTMLElement)) return;
		    let s = queryDashboardStats(db, dashboardSelectedBoard);
		    if (dashboardSelectedBoard && !s.boards.includes(dashboardSelectedBoard)) {
		      dashboardSelectedBoard = "";
		      s = queryDashboardStats(db, dashboardSelectedBoard);
		    }
		    const filterItems = dashboardFilterItems(s.boards);
		    const totalForGrid = (grid) =>
		      Object.values(grid || {}).reduce((sum, row) => sum + row.low + row.normal + row.high, 0);
		    const totalPending = totalForGrid(s.pending);
		    const totalComplete = totalForGrid(s.complete);
		    const scopeLabel = dashboardSelectedBoard ? dashboardSelectedBoard : "All";
		    dashboardContent.innerHTML = `
	      <section class="dashboardHero" aria-label="Dashboard summary">
	        <div class="dashboardMetric">
	          <span class="dashboardMetric__value">${totalPending}</span>
	          <span class="dashboardMetric__label">Pending</span>
	        </div>
	        <div class="dashboardMetric">
	          <span class="dashboardMetric__value">${totalComplete}</span>
	          <span class="dashboardMetric__label">Complete</span>
		        </div>
		        <div class="dashboardMetric">
		          <span class="dashboardMetric__value dashboardMetric__value--text" title="${escapeHtmlAttribute(scopeLabel)}">${escapeHtml(scopeLabel)}</span>
		          <span class="dashboardMetric__label">Scope</span>
		        </div>
	      </section>

	      <section class="dashboardSection" aria-labelledby="dashboardActivityTitle">
	        <div class="dashboardSectionHeader">
	          <h3 id="dashboardActivityTitle" class="dashboardSectionTitle">Activity</h3>
	          <span class="dashboardSectionMeta">25 weeks before and after today</span>
	        </div>
	        <div class="dashboardHeatmapPair">
	          ${renderDashboardHeatmap("Pending Due", s.pendingActivity, "pending")}
	          ${renderDashboardHeatmap("Completed Due", s.completeActivity, "complete")}
	        </div>
	      </section>

		      ${renderDashboardFilterCard(filterItems)}
		    `;
		    wireDashboardFilters();
		  }

  function renderCalendar() {
    if (!(calendarContent instanceof HTMLElement)) return;
    const now = new Date();
    const startTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const endTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 1);
    const notes = queryNotesByDueRange(db, startTs, endTs);

    const byDate = new Map();
    for (const n of notes) {
      const key = String(n.due_at);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(n);
    }

    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

    const getMonthData = (y, m) => {
      const first = new Date(Date.UTC(y, m, 1));
      const last = new Date(Date.UTC(y, m + 1, 0));
      const firstDay = first.getUTCDay();
      const daysInMonth = last.getUTCDate();
      const days = [];
      for (let i = 0; i < firstDay; i++) days.push(null);
      for (let d = 1; d <= daysInMonth; d++) {
        const ts = Date.UTC(y, m, d);
        days.push(ts);
      }
      return { year: y, month: m, days, monthName: monthNames[m] };
    };

    const priorityColors = priorityColorsForTheme();
    const priorityOrder = ["high", "normal", "low"];

    let html = '<div class="calendarGrid">';
    for (let monthIdx = 0; monthIdx < 4; monthIdx++) {
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() + monthIdx;
      const adj = Math.floor(m / 12);
      const year = y + adj;
      const month = ((m % 12) + 12) % 12;
      const data = getMonthData(year, month);
      html += `<div class="calendarMonth" data-month-idx="${monthIdx}"><h3 class="calendarMonthTitle">${data.monthName} ${year}</h3>`;
      html += '<table class="calendarTable"><thead><tr>';
      for (const d of dayNames) html += `<th>${d}</th>`;
      html += '</tr></thead><tbody><tr>';
      let col = 0;
      for (const cell of data.days) {
        if (col > 0 && col % 7 === 0) html += '</tr><tr>';
        const row = Math.floor(col / 7);
        const colInRow = col % 7;
        if (cell === null) {
          html += '<td class="calendarCell calendarCell--empty"></td>';
        } else {
          const tasks = byDate.get(String(cell)) || [];
          const dayNum = new Date(cell).getUTCDate();
          const byPriority = { low: 0, normal: 0, high: 0 };
          for (const t of tasks) {
            const p = t.priority || "normal";
            if (byPriority[p] !== undefined) byPriority[p]++;
          }
          const dotsHtml = priorityOrder
            .filter((p) => byPriority[p] > 0)
            .map((p) => {
              const count = byPriority[p];
              const color = priorityColors[p];
              return `<span class="calendarDot calendarDot--${p}" style="background-color:${color}" title="${p}: ${count}" aria-hidden="true"></span>`;
            })
            .join("");
          const dateStr = formatDate(cell);
          const escapedDate = escapeHtml(dateStr);
          html += `<td class="calendarCell"><button type="button" class="calendarDayCell" data-date-ts="${cell}" data-month-idx="${monthIdx}" data-row="${row}" data-col="${colInRow}" data-has-tasks="${tasks.length > 0}" aria-label="${tasks.length} task${tasks.length === 1 ? "" : "s"} due ${escapedDate}"><span class="calendarCellDay">${dayNum}</span><span class="calendarCellDots">${dotsHtml}</span></button></td>`;
        }
        col++;
      }
      while (col % 7 !== 0) {
        html += '<td class="calendarCell calendarCell--empty"></td>';
        col++;
      }
      html += '</tr></tbody></table></div>';
    }
    html += '</div>';
    calendarContent.innerHTML = html;

    const calendarDayLabel = document.getElementById("calendarDayLabel");
    const calendarDayTasks = document.getElementById("calendarDayTasks");
    const calendarRightPane = document.getElementById("calendarRightPane");

    function renderCalendarRightPane(dateTs) {
      if (!(calendarDayLabel instanceof HTMLElement) || !(calendarDayTasks instanceof HTMLElement)) return;
      const tasks = byDate.get(String(dateTs)) || [];
      const d = new Date(dateTs);
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const dateStr = `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
      calendarDayLabel.textContent = dateStr;
      calendarDayTasks.innerHTML = "";
      for (const t of tasks) {
        const text = String(t.text || "").trim() || "Untitled";
        const displayText = text.slice(0, 60) + (text.length > 60 ? "…" : "");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "calendarTaskLink monoLinkButton";
        btn.dataset.noteId = String(t.id);
        btn.dataset.board = String(t.board || "");
        btn.textContent = displayText;
        btn.setAttribute("aria-label", `Go to card: ${escapeHtml(text)}`);
        btn.addEventListener("click", async () => {
          const noteId = Number(btn.dataset.noteId);
          const board = btn.dataset.board || activeBoard;
          if (!Number.isFinite(noteId)) return;
          activeBoard = board;
          await saveActiveBoard(activeBoard);
          renderBoardTabs(boards, activeBoard);
          setActiveTabUi(activeBoard);
          showNotesView();
          await refresh();
          const card = document.querySelector(`.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`);
          if (card instanceof HTMLElement) {
            keepCardInView(card);
            const firstBtn = card.querySelector("button");
            if (firstBtn instanceof HTMLElement) safeFocus(firstBtn);
          }
        });
        calendarDayTasks.appendChild(btn);
      }
      if (calendarRightPane instanceof HTMLElement) {
        calendarRightPane.hidden = false;
      }
    }

    function clearCalendarRightPane() {
      if (!(calendarDayLabel instanceof HTMLElement) || !(calendarDayTasks instanceof HTMLElement)) return;
      calendarDayLabel.textContent = "Select a day";
      calendarDayTasks.innerHTML = "";
      if (calendarRightPane instanceof HTMLElement) {
        calendarRightPane.hidden = false;
      }
    }

    calendarContent.querySelectorAll(".calendarDayCell").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ts = Number(btn.dataset.dateTs);
        if (Number.isFinite(ts)) {
          renderCalendarRightPane(ts);
          calendarSelectedDayCell = btn;
          if (btn.dataset.hasTasks === "true") {
            const firstLink = calendarDayTasks?.querySelector(".calendarTaskLink");
            if (firstLink instanceof HTMLElement) safeFocus(firstLink);
          }
        }
      });
      btn.addEventListener("focus", () => {
        const ts = Number(btn.dataset.dateTs);
        if (Number.isFinite(ts)) {
          renderCalendarRightPane(ts);
          calendarSelectedDayCell = btn;
        }
      });
      btn.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter") return;
        if (btn.dataset.hasTasks !== "true") return;
        ev.preventDefault();
        const firstLink = calendarDayTasks?.querySelector(".calendarTaskLink");
        if (firstLink instanceof HTMLElement) safeFocus(firstLink);
      });
    });

    const firstDayWithTasks = calendarContent.querySelector(".calendarDayCell[data-has-tasks='true']");
    if (firstDayWithTasks instanceof HTMLElement) {
      renderCalendarRightPane(Number(firstDayWithTasks.dataset.dateTs));
    } else {
      clearCalendarRightPane();
    }
  }

	  function escapeHtml(str) {
	    const div = document.createElement("div");
	    div.textContent = str;
	    return div.innerHTML;
	  }

	  function escapeHtmlAttribute(str) {
	    return escapeHtml(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
	  }

	  function setManageTabsMessage(text) {
    if (manageTabsMessage instanceof HTMLElement) manageTabsMessage.textContent = text || "";
  }

  function setAiSettingsMessage(text) {
    if (aiSettingsMessage instanceof HTMLElement) aiSettingsMessage.textContent = text || "";
  }

  let aiHealthTimer = null;
  let aiHealthAbort = null;
  let aiHealthToken = 0;

  function setAiStatusLedState(state, detail) {
    if (!(aiStatusLed instanceof HTMLElement)) return;
    const s = state === "green" ? "green" : state === "pending" ? "pending" : "red";
    aiStatusLed.classList.toggle("aiStatusLed--green", s === "green");
    aiStatusLed.classList.toggle("aiStatusLed--pending", s === "pending");
    aiStatusLed.classList.toggle("aiStatusLed--red", s === "red");
    const label = String(
      detail || (s === "green" ? "working" : s === "pending" ? "waiting" : "not working")
    );
    aiStatusLed.setAttribute("aria-label", `LLM status: ${label}`);
    aiStatusLed.setAttribute("title", `LLM status: ${label}`);
  }

  async function probeOllamaHealth(baseUrl, timeoutMs = 30000, externalSignal, modelOverride) {
    // Route through background script to avoid mixed-content blocking when the popup
    // runs in an iframe on HTTPS pages (e.g. google.com overlay).
    const abortPromise = externalSignal
      ? new Promise((_, reject) => {
          if (externalSignal.aborted) reject(new Error("aborted"));
          else externalSignal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        })
      : null;
    const msgPromise = chrome.runtime.sendMessage({
      type: "probeOllama",
      baseUrl,
      modelOverride: modelOverride || "",
      timeoutMs: Math.max(50, Number(timeoutMs) || 1500)
    });
    const result = await Promise.race(
      abortPromise ? [msgPromise, abortPromise] : [msgPromise]
    ).catch((err) => {
      if (String(err?.message || "").includes("aborted")) {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      return { error: { message: err?.message || "not working" } };
    });
    if (result?.error) {
      const e = result.error;
      const err = new Error(e.message || "not working");
      err.code = e.code;
      err.status = e.status;
      err.body = e.body;
      err.stage = e.stage;
      throw err;
    }
    return result?.ok ? { ok: true, model: result.model } : result;
  }

  function queueAiSettingsHealthCheck({ delayMs = 250 } = {}) {
    if (!(settingsView instanceof HTMLElement) || settingsView.hidden) return;
    if (settingsPanelAi instanceof HTMLElement && settingsPanelAi.hidden) return;

    if (aiHealthTimer) clearTimeout(aiHealthTimer);
    aiHealthTimer = setTimeout(async () => {
      const token = ++aiHealthToken;

      const raw = aiEndpointBaseUrlInput instanceof HTMLInputElement ? aiEndpointBaseUrlInput.value : "";
      const normalized = normalizeEndpointBaseUrl(raw);
      const modelOverride = aiEndpointModelInput instanceof HTMLInputElement ? aiEndpointModelInput.value : "";

      if (normalized === null) {
        setAiStatusLedState("red", raw.trim() ? "invalid URL" : "unknown");
        return;
      }

      if (!normalized) {
        setAiStatusLedState("red", "disabled");
        return;
      }

      if (aiHealthAbort) {
        try {
          aiHealthAbort.abort();
        } catch {
          // ignore
        }
        aiHealthAbort = null;
      }

      aiHealthAbort = new AbortController();
      try {
        setAiStatusLedState("pending", "checking");
        // Note: probeOllamaHealth uses its own timeout; we still abort on view changes.
        const r = await probeOllamaHealth(normalized, 30000, aiHealthAbort.signal, modelOverride);
        if (token !== aiHealthToken) return;
        if (r?.ok) setAiStatusLedState("green", `working (${r.model})`);
        else setAiStatusLedState("red", "not working");
      } catch (err) {
        if (token !== aiHealthToken) return;
        if (!(settingsView instanceof HTMLElement) || settingsView.hidden) return;

        const isAbort = String(err?.name || "")
          .toLowerCase()
          .includes("abort");
        const isTimeout = err && (err.code === "timeout" || /timed out/i.test(String(err?.message || "")));
        if (isAbort && !isTimeout) return;
        if (isTimeout) {
          const stage2 = err && typeof err.stage === "string" ? String(err.stage || "") : "";
          setAiStatusLedState("red", stage2 ? `timeout (${stage2})` : "timeout");
          return;
        }

        if (err && err.code === "model_not_found") {
          setAiStatusLedState("red", String(err?.message || "model not found").slice(0, 140));
          return;
        }

        const st = err && typeof err.status === "number" ? err.status : null;
        const msg = String(err?.message || "").trim();
        const body = typeof err?.body === "string" ? String(err.body || "") : "";
        const snippet = body ? body.replace(/\s+/g, " ").slice(0, 120) : "";
        if (Number.isFinite(st)) {
          const hint403 = Number(st) === 403 ? getOllamaOriginsHintFor403(normalized) : "";
          setAiStatusLedState("red", (snippet ? `generate ${st}: ${snippet}` : `generate ${st}`) + hint403);
        } else {
          setAiStatusLedState("red", msg ? msg.slice(0, 140) : "not working");
        }
      } finally {
        aiHealthAbort = null;
      }
    }, Math.max(0, Number(delayMs) || 0));
  }

  function getNoteIdFromCardElement(card) {
    if (!(card instanceof HTMLElement)) return null;
    const id = Number(card.dataset.noteId);
    return Number.isFinite(id) ? id : null;
  }

  function renderBoardTabs(boards, activeBoard) {
    const ul = document.getElementById("boardTabs");
    if (!(ul instanceof HTMLElement)) return;
    const pendingCountsByBoard = queryPendingCountsByBoard(db);

    // Reuse existing tabs so refreshing notes does not blur the tab a user selected.
    const existingItemsByBoard = new Map();
    for (const item of ul.querySelectorAll(":scope > .bx--tabs__nav-item")) {
      const tab = item.querySelector("[role='tab'][data-board]");
      if (tab instanceof HTMLAnchorElement && tab.dataset.board) {
        existingItemsByBoard.set(tab.dataset.board, item);
      }
    }

    boards.forEach((b, index) => {
      let li = existingItemsByBoard.get(b);
      let a = li?.querySelector("[role='tab'][data-board]");
      if (!(li instanceof HTMLLIElement) || !(a instanceof HTMLAnchorElement)) {
        li = document.createElement("li");
        li.className = "bx--tabs__nav-item";
        li.setAttribute("role", "presentation");

        a = document.createElement("a");
        a.className = "bx--tabs__nav-link";
        a.href = "#";
        a.setAttribute("role", "tab");
        a.dataset.board = b;

        const label = document.createElement("span");
        label.className = "tabLabel";
        a.appendChild(label);

        const badge = document.createElement("span");
        badge.className = "tabBadge";
        badge.setAttribute("aria-hidden", "true");
        a.appendChild(badge);

        li.appendChild(a);
      }

      const selected = b === activeBoard;
      const pendingCount = pendingCountsByBoard.get(b) || 0;
      a.setAttribute("aria-selected", selected ? "true" : "false");
      // Keep Tab navigation on the selected tab; arrows move between boards.
      a.tabIndex = selected ? 0 : -1;
      a.setAttribute("aria-label", `${b}, ${pendingCount} pending task${pendingCount === 1 ? "" : "s"}`);
      const label = a.querySelector(".tabLabel");
      if (label) label.textContent = b;
      const badge = a.querySelector(".tabBadge");
      if (badge) badge.textContent = String(pendingCount);
      li.classList.toggle("bx--tabs__nav-item--selected", selected);

      // Do not move a correctly ordered item; moving a focused DOM node may still blur it.
      if (ul.children[index] !== li) ul.insertBefore(li, ul.children[index] || null);
      existingItemsByBoard.delete(b);
    });

    for (const item of existingItemsByBoard.values()) item.remove();
  }

  const existing = await loadDbBytes();
  let db = existing ? new SQL.Database(existing) : new SQL.Database();
  ensureSchema(db, DEFAULT_TAB_NAME);

  let boards = queryBoards(db);
  if (!boards.length) {
    addBoard(db, DEFAULT_TAB_NAME);
    boards = queryBoards(db);
  }

  let activeBoard = (await loadActiveBoard()) || boards[0];
  if (!boards.includes(activeBoard)) activeBoard = boards[0];
  await saveActiveBoard(activeBoard);

  // Keyboard layout: default to QWERTY on first install.
  let keyLayout = (await loadKeyLayout()) || "qwerty";
  // Persist default if missing/invalid.
  if ((await loadKeyLayout()) === null) await saveKeyLayout(keyLayout);
  gKeyboardNavPlatform = await loadKeyboardNavPlatform();

  const APP_SETTING_AI_ENDPOINT_BASE_URL = "ai.endpointBaseUrl";
  const APP_SETTING_AI_ENDPOINT_MODEL = "ai.endpointModel";
  const APP_SETTING_AI_CUSTOM_WORDS_JSON = "ai.customWordsJson";
  const APP_SETTING_THEME = "app.theme";
  const APP_SETTING_INTERFACE_FONT = "app.interfaceFont";
  const APP_SETTING_HEADER_TITLE = "app.headerTitle";
  const APP_SETTING_HEADER_TITLE_FONT = "app.headerTitleFont";
  const APP_SETTING_POPUP_SIZE = "app.popupSize";
  const APP_SETTING_TOUR_SEEN = "app.guidedTourSeen";
  const APP_SETTING_OBSIDIAN_VAULT_NAME = "obsidian.vaultName";
  const APP_SETTING_OBSIDIAN_NOTES_FOLDER = "obsidian.notesFolder";
  const APP_SETTING_OBSIDIAN_SYNC_MODE = "obsidian.syncMode";

  function dbGetAppSettingString(key) {
    const k = String(key || "");
    if (!k) return null;
    try {
      const res = db.exec("SELECT value FROM app_settings WHERE key = ? LIMIT 1", [k]);
      const v = res?.[0]?.values?.[0]?.[0];
      if (v === null || v === undefined) return null;
      return String(v);
    } catch {
      return null;
    }
  }

  function dbSetAppSettingString(key, value) {
    const k = String(key || "");
    if (!k) return;
    const v = value === null || value === undefined ? "" : String(value);
    if (!v) {
      try {
        db.run("DELETE FROM app_settings WHERE key = ?", [k]);
      } catch {
        // ignore
      }
      return;
    }
    db.run("INSERT OR REPLACE INTO app_settings(key, value, updated_at) VALUES(?, ?, ?)", [
      k,
      v,
      Date.now()
    ]);
  }

  // AI endpoint base URL: empty/missing means AI disabled.
  let didMigrateAiSettings = false;

  let aiEndpointBaseUrl = dbGetAppSettingString(APP_SETTING_AI_ENDPOINT_BASE_URL) || "";
  if (!aiEndpointBaseUrl) {
    const legacy = (await loadAiEndpointBaseUrl()) || "";
    if (legacy) {
      const normalized = normalizeEndpointBaseUrl(legacy);
      if (normalized) {
        aiEndpointBaseUrl = normalized;
        dbSetAppSettingString(APP_SETTING_AI_ENDPOINT_BASE_URL, normalized);
        didMigrateAiSettings = true;
      }
    }
  }

  // AI model: optional. If set, we will call /api/generate with this model name.
  let aiEndpointModel = dbGetAppSettingString(APP_SETTING_AI_ENDPOINT_MODEL) || "";

  let aiCustomWords = [];
  const customWordsJson = dbGetAppSettingString(APP_SETTING_AI_CUSTOM_WORDS_JSON);
  if (customWordsJson) {
    try {
      const parsed = JSON.parse(customWordsJson);
      if (Array.isArray(parsed)) {
        aiCustomWords = parsed.filter((w) => typeof w === "string" && w.trim());
      }
    } catch {
      // ignore
    }
  }
  if (!aiCustomWords.length) {
    const legacy = await loadAiCustomWords();
    if (legacy.length) {
      aiCustomWords = legacy;
      dbSetAppSettingString(APP_SETTING_AI_CUSTOM_WORDS_JSON, JSON.stringify(legacy));
      didMigrateAiSettings = true;
    }
  }

  if (didMigrateAiSettings) {
    try {
      await persist();
    } catch {
      // ignore
    }
  }

  gObsidianVaultName = dbGetAppSettingString(APP_SETTING_OBSIDIAN_VAULT_NAME) || "";
  gObsidianNotesFolder = dbGetAppSettingString(APP_SETTING_OBSIDIAN_NOTES_FOLDER) || "";
  gObsidianSyncMode = dbGetAppSettingString(APP_SETTING_OBSIDIAN_SYNC_MODE) === "1";
  let obsidianVaultRootHandle = null;
  if (obsidianFileSystemApiAvailable()) {
    try {
      obsidianVaultRootHandle =
        obsidianVaultIdb() && typeof obsidianVaultIdb().loadVaultHandle === "function"
          ? await obsidianVaultIdb().loadVaultHandle()
          : null;
      if (obsidianVaultRootHandle) {
        await obsidianVaultRootHandle.requestPermission({ mode: "readwrite" }).catch(() => {});
      }
    } catch (err) {
      console.warn(err);
    }
  }
  gObsidianVaultFolderLinked = !!obsidianVaultRootHandle;

  // Theme: load from DB first, migrate from chrome.storage if needed.
  let didMigrateTheme = false;
  let theme = dbGetAppSettingString(APP_SETTING_THEME) || null;
  if (!theme) {
    const legacy = await loadThemeFromStorage();
    if (legacy && THEME_ORDER.includes(legacy)) {
      theme = legacy;
      dbSetAppSettingString(APP_SETTING_THEME, theme);
      didMigrateTheme = true;
    }
  }
  if (!theme || !THEME_ORDER.includes(theme)) theme = "light";
  if (didMigrateTheme) {
    try {
      await persist();
    } catch {
      // ignore
    }
  }

  populateThemeSelect();
  populateInterfaceFontSelect();
  populateHeaderTitleFontSelect();
  applyTheme(theme);

  let customBackgroundDataUrl = await loadCustomBackground();
  if (!/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(customBackgroundDataUrl)) customBackgroundDataUrl = "";
  applyCustomBackground(customBackgroundDataUrl);

  let popupSize = dbGetAppSettingString(APP_SETTING_POPUP_SIZE) || "m";
  if (!POPUP_SIZE_ORDER.includes(popupSize)) popupSize = "m";
  applyPopupSize(popupSize);

  let appHeaderTitleRaw = dbGetAppSettingString(APP_SETTING_HEADER_TITLE) || "";
  let appInterfaceFontKey = normalizeInterfaceFontKey(dbGetAppSettingString(APP_SETTING_INTERFACE_FONT) || "");
  let appHeaderTitleFontKey = normalizeHeaderTitleFontKey(
    dbGetAppSettingString(APP_SETTING_HEADER_TITLE_FONT) || ""
  );
  let settingsHeaderTitleFontSelectArmed = false;
  let settingsHeaderTitleFontSelectChangeAllowed = false;

  function applyInterfaceFontKey(key) {
    const resolved = normalizeInterfaceFontKey(key);
    const root = document.documentElement;
    if (resolved) root.style.setProperty("--modern-font-sans", INTERFACE_FONT_FAMILIES[resolved]);
    else root.style.removeProperty("--modern-font-sans");
    if (settingsInterfaceFontSelect instanceof HTMLSelectElement) settingsInterfaceFontSelect.value = resolved;
  }

  function normalizeHeaderTitleInput(value) {
    return String(value || "")
      .replace(/[\r\n\x00-\x1F\x7F]/g, "")
      .trim()
      .slice(0, 80);
  }

  function titleTextForDisplay(storedRaw) {
    const t = normalizeHeaderTitleInput(storedRaw);
    return t || DEFAULT_HEADER_TITLE;
  }

  function applyHeaderTitle(storedRaw) {
    const headerTitleEl = document.getElementById("headerTitle");
    if (headerTitleEl instanceof HTMLElement) {
      headerTitleEl.textContent = titleTextForDisplay(storedRaw);
    }
    if (settingsHeaderTitleInput instanceof HTMLInputElement) {
      settingsHeaderTitleInput.value = normalizeHeaderTitleInput(storedRaw);
    }
  }

  function applyHeaderTitleFontKey(key) {
    const resolved = normalizeHeaderTitleFontKey(key);
    const headerTitleEl = document.getElementById("headerTitle");
    if (headerTitleEl instanceof HTMLElement) {
      if (!resolved) headerTitleEl.style.removeProperty("font-family");
      else headerTitleEl.style.setProperty("font-family", HEADER_TITLE_FONT_FAMILIES[resolved]);
    }
    if (settingsHeaderTitleFontSelect instanceof HTMLSelectElement) {
      settingsHeaderTitleFontSelect.value = resolved;
    }
    setSettingsHeaderTitleFontSelectArmed(settingsHeaderTitleFontSelectArmed);
  }

  applyHeaderTitle(appHeaderTitleRaw);
  applyInterfaceFontKey(appInterfaceFontKey);
  applyHeaderTitleFontKey(appHeaderTitleFontKey);

  // Shared caches for autocomplete (new note + notes editor).
  let ollamaModel = aiEndpointModel || null;
  let englishDictWords = null; // lowercased, sorted
  let englishDictLoadPromise = null;

  function buildAiAutocompletePrompt(prefixText) {
    const raw = String(prefixText || "");
    const MAX_CONTEXT_WORDS = 50;
    const trimmed = raw.trimEnd();
    const trailingSpace = raw.length > trimmed.length ? raw.slice(trimmed.length) : "";
    const contextWords = trimmed.split(/\s+/).filter(Boolean);
    const context =
      contextWords.length > MAX_CONTEXT_WORDS
        ? contextWords.slice(-MAX_CONTEXT_WORDS).join(" ") + trailingSpace
        : raw;
    const endsWithSentencePunct = /[.!?…]+$/.test(String(context || "").trimEnd());
    const endsWithWhitespace = /\s$/.test(context);
    const lastTokenMatch = String(context || "").match(/(\S+)$/);
    const lastToken = !endsWithWhitespace && lastTokenMatch ? String(lastTokenMatch[1] || "") : "";

    const isWordishToken = /^[A-Za-z][A-Za-z'-]*$/.test(lastToken);
    const lowerLastToken = lastToken.toLowerCase();
    const commonWholeWords = new Set([
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "be",
      "because",
      "but",
      "by",
      "for",
      "from",
      "have",
      "i",
      "if",
      "in",
      "is",
      "it",
      "of",
      "on",
      "or",
      "really",
      "so",
      "that",
      "the",
      "this",
      "to",
      "was",
      "we",
      "with",
      "you"
    ]);

    // Heuristic: if there's no trailing space but the last token looks like a complete word,
    // allow the model to continue the sentence (prefix with punctuation/space).
    // Otherwise, treat as mid-word and ask for the suffix only.
    const tokenLooksComplete =
      !!lastToken &&
      isWordishToken &&
      (lastToken.length >= 4 || commonWholeWords.has(lowerLastToken)) &&
      // avoid classifying very short fragments like "rea" as complete
      !(lastToken.length <= 3 && !commonWholeWords.has(lowerLastToken));

    const cursorMode = endsWithSentencePunct
      ? "end-of-sentence"
      : endsWithWhitespace
        ? "after-space"
        : !lastToken
          ? "after-space"
          : tokenLooksComplete
            ? "end-of-word"
            : "mid-word";

    const customWords = Array.isArray(aiCustomWords) ? aiCustomWords.filter((w) => typeof w === "string" && w.trim()) : [];
    const custom = customWords.length ? `\nPreferred terms (if relevant): ${customWords.slice(0, 40).join(", ")}` : "";

    return (
      "You are an autocomplete engine for a TODO note editor.\n" +
      "Given the text BEFORE the cursor, return the characters to INSERT at the cursor.\n" +
      "Your primary goal is to produce a helpful continuation for the user as they type full sentences.\n" +
      "Rules:\n" +
      "- Return ONLY the continuation text (no quotes, no explanations, no prefixes like 'Continuation:').\n" +
      "- Do NOT repeat the provided text.\n" +
      "- One line only. Keep it short (<= 60 characters).\n" +
      "- If CURSOR_MODE is 'mid-word': return ONLY the missing suffix of LAST_TOKEN (no spaces).\n" +
      "- If CURSOR_MODE is 'end-of-word': continue the sentence with punctuation and/or a space + words.\n" +
      "- If CURSOR_MODE is 'after-space': suggest the next word(s) (do NOT start with a space).\n" +
      "- If CURSOR_MODE is 'end-of-sentence': you may return empty (no suggestion), or start a new sentence (e.g. ' Next…').\n" +
      "- Prefer grammatical, natural continuations that complete the current sentence.\n" +
      "- Avoid generic filler. Use the given context.\n" +
      "- If unsure, return empty (no suggestion).\n" +
      "Examples:\n" +
      "TEXT BEFORE CURSOR: This is rea\nCONTINUATION: lly\n" +
      "TEXT BEFORE CURSOR: This is really im\nCONTINUATION: portant\n" +
      "TEXT BEFORE CURSOR: This is really\nCONTINUATION: good for performance.\n" +
      "TEXT BEFORE CURSOR: I ne\nCONTINUATION: ed\n" +
      "TEXT BEFORE CURSOR: Buy milk \nCONTINUATION: and eggs\n" +
      "TEXT BEFORE CURSOR: Buy milk\nCONTINUATION: and eggs\n" +
      "TEXT BEFORE CURSOR: Fix bug in pop\nCONTINUATION: up.js\n" +
      custom +
      `\n\nCURSOR_MODE: ${cursorMode}\nLAST_TOKEN: ${lastToken}\n` +
      "\n\nTEXT BEFORE CURSOR:\n<<<\n" +
      context +
      "\n>>>\nCONTINUATION:" 
    );
  }

  function parseCustomWords(raw) {
    const lines = String(raw || "")
      .split(/\r?\n/)
      .map((s) => String(s || "").trim())
      .filter(Boolean);

    const valid = [];
    const invalid = [];
    const seenLower = new Set();

    for (const w of lines) {
      // "Single word or acronym": allow letters/digits and internal hyphens/underscores, no spaces.
      // Keep the user's casing (e.g., eQuote, pre-eQuote, pre_eQuote).
      const ok =
        /^[A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9])?$/.test(w) &&
        !/(--|__|_-|-_)/.test(w);
      if (!ok) {
        invalid.push(w);
        continue;
      }
      const k = w.toLowerCase();
      if (seenLower.has(k)) continue;
      seenLower.add(k);
      valid.push(w);
    }

    return { valid, invalid };
  }

  function updateKeyboardSettingsUi() {
    const qw = document.getElementById("keyLayoutQwerty");
    const dv = document.getElementById("keyLayoutDvorak");
    const w = document.getElementById("keyboardNavPlatformWinlinux");
    const m = document.getElementById("keyboardNavPlatformMac");
    if (qw instanceof HTMLInputElement) qw.checked = keyLayout === "qwerty";
    if (dv instanceof HTMLInputElement) dv.checked = keyLayout === "dvorak";
    if (w instanceof HTMLInputElement) w.checked = gKeyboardNavPlatform === "winlinux";
    if (m instanceof HTMLInputElement) m.checked = gKeyboardNavPlatform === "mac";
    const intro = document.getElementById("settingsKeyboardIntro");
    if (intro instanceof HTMLElement) {
      intro.innerHTML =
        "Pick your physical <b>layout</b> and which <b>platform&rsquo;s navigation modifier</b> the app should use. " +
        "<b>Windows / Linux</b> = <kbd>Alt</kbd> + letter (including arrow-style navigation on <kbd>" +
        getNavKeys(keyLayout).up +
        "</kbd> / <kbd>" +
        getNavKeys(keyLayout).down +
        "</kbd> / <kbd>" +
        getNavKeys(keyLayout).left +
        "</kbd> / <kbd>" +
        getNavKeys(keyLayout).right +
        "</kbd>). " +
        "<b>Mac</b> = <kbd>Ctrl</kbd> + the same letter keys (the <b>Control</b> key, not <b>Command</b>). " +
        "The <b>Instructions</b> view and card shortcuts follow this choice.";
    }
  }

  updateKeyboardSettingsUi();

  let themeSelectArmed = false;
  let themeSelectChangeAllowed = false;
  let settingsThemeSelectArmed = false;
  let settingsThemeSelectChangeAllowed = false;

  function setThemeSelectArmed(armed) {
    themeSelectArmed = !!armed;
    if (!(themeSelect instanceof HTMLSelectElement)) return;
    themeSelect.dataset.armed = themeSelectArmed ? "true" : "false";
    const label = THEME_LABELS[themeSelect.value] || themeSelect.value || "Theme";
    themeSelect.title = themeSelectArmed
      ? `Theme: ${label}. Use navigation up/down to change. Press Escape to exit.`
      : `Theme: ${label}. Click to open options, or press Enter to change with keyboard.`;
    themeSelect.setAttribute(
      "aria-label",
      themeSelectArmed
        ? `Theme change mode. Current theme: ${label}. Use navigation up and down to change. Press Escape to exit.`
        : `Theme: ${label}. Click to open options, or press Enter to change with keyboard. Press Escape to exit theme change mode.`
    );
  }

  function setSettingsThemeSelectArmed(armed) {
    settingsThemeSelectArmed = !!armed;
    if (!(settingsThemeSelect instanceof HTMLSelectElement)) return;
    settingsThemeSelect.dataset.armed = settingsThemeSelectArmed ? "true" : "false";
    const label = THEME_LABELS[settingsThemeSelect.value] || settingsThemeSelect.value || "Theme";
    settingsThemeSelect.title = settingsThemeSelectArmed
      ? `Theme: ${label}. Use navigation up/down to change. Press Escape to exit.`
      : `Theme: ${label}. Click to open options, or press Enter to change with keyboard.`;
    settingsThemeSelect.setAttribute(
      "aria-label",
      settingsThemeSelectArmed
        ? `Theme change mode. Current theme: ${label}. Use navigation up and down to change. Press Escape to exit.`
        : `Theme: ${label}. Click to open options, or press Enter to change with keyboard. Press Escape to exit theme change mode.`
    );
  }

  function setSettingsHeaderTitleFontSelectArmed(armed) {
    settingsHeaderTitleFontSelectArmed = !!armed;
    if (!(settingsHeaderTitleFontSelect instanceof HTMLSelectElement)) return;
    settingsHeaderTitleFontSelect.dataset.armed = settingsHeaderTitleFontSelectArmed ? "true" : "false";
    const key = normalizeHeaderTitleFontKey(settingsHeaderTitleFontSelect.value);
    const label = HEADER_TITLE_FONT_LABELS[key] || "Header font";
    settingsHeaderTitleFontSelect.title = settingsHeaderTitleFontSelectArmed
      ? `Header title font: ${label}. Use navigation up/down to change. Press Escape to exit.`
      : `Header title font: ${label}. Click to open options, or press Enter to change with keyboard.`;
    settingsHeaderTitleFontSelect.setAttribute(
      "aria-label",
      settingsHeaderTitleFontSelectArmed
        ? `Header font change mode. Current: ${label}. Use navigation up and down to change. Press Escape to exit.`
        : `Header title font: ${label}. Click to open options, or press Enter to change with keyboard. Press Escape to exit font change mode.`
    );
  }

  async function commitThemeSelectValue(value) {
    if (!THEME_ORDER.includes(value)) return;
    theme = value;
    applyTheme(theme);
    setThemeSelectArmed(themeSelectArmed);
    setSettingsThemeSelectArmed(settingsThemeSelectArmed);
    try {
      dbSetAppSettingString(APP_SETTING_THEME, theme);
      await persist();
    } catch {
      // ignore
    }
  }

  async function commitPopupSizeValue(value) {
    if (!POPUP_SIZE_ORDER.includes(value)) return;
    popupSize = value;
    applyPopupSize(popupSize);
    try {
      dbSetAppSettingString(APP_SETTING_POPUP_SIZE, popupSize);
      await persist();
    } catch {
      // ignore
    }
  }

  async function commitHeaderTitleValue() {
    if (!(settingsHeaderTitleInput instanceof HTMLInputElement)) return;
    const next = normalizeHeaderTitleInput(settingsHeaderTitleInput.value);
    if (next === normalizeHeaderTitleInput(appHeaderTitleRaw)) {
      settingsHeaderTitleInput.value = next;
      return;
    }
    appHeaderTitleRaw = next;
    applyHeaderTitle(appHeaderTitleRaw);
    try {
      dbSetAppSettingString(APP_SETTING_HEADER_TITLE, appHeaderTitleRaw);
      await persist();
    } catch {
      // ignore
    }
  }

  async function commitHeaderTitleFontValue() {
    if (!(settingsHeaderTitleFontSelect instanceof HTMLSelectElement)) return;
    const next = normalizeHeaderTitleFontKey(settingsHeaderTitleFontSelect.value);
    if (next === appHeaderTitleFontKey) return;
    appHeaderTitleFontKey = next;
    applyHeaderTitleFontKey(appHeaderTitleFontKey);
    try {
      dbSetAppSettingString(APP_SETTING_HEADER_TITLE_FONT, appHeaderTitleFontKey);
      await persist();
    } catch {
      // ignore
    }
  }

  async function commitInterfaceFontValue() {
    if (!(settingsInterfaceFontSelect instanceof HTMLSelectElement)) return;
    const next = normalizeInterfaceFontKey(settingsInterfaceFontSelect.value);
    if (next === appInterfaceFontKey) return;
    appInterfaceFontKey = next;
    applyInterfaceFontKey(appInterfaceFontKey);
    try {
      dbSetAppSettingString(APP_SETTING_INTERFACE_FONT, appInterfaceFontKey);
      await persist();
    } catch {
      // ignore
    }
  }

  if (themeSelect instanceof HTMLSelectElement) {
    setThemeSelectArmed(false);
    themeSelect.addEventListener("change", async () => {
      if (!themeSelectChangeAllowed) {
        themeSelect.value = theme;
        setThemeSelectArmed(themeSelectArmed);
        return;
      }
      const v = themeSelect.value;
      await commitThemeSelectValue(v);
      themeSelectChangeAllowed = false;
    });

    themeSelect.addEventListener("pointerdown", () => {
      themeSelectChangeAllowed = true;
      setThemeSelectArmed(false);
    });

    themeSelect.addEventListener("blur", () => {
      themeSelectChangeAllowed = false;
      setThemeSelectArmed(false);
    });

    themeSelect.addEventListener("keydown", (e) => {
      const raw = e.key;
      const code = e.code || "";
      const isEnter = raw === "Enter" || code === "Enter" || raw === " ";
      const isEscape = raw === "Escape" || code === "Escape";
      const isNativeSelectNav =
        raw === "ArrowUp" ||
        raw === "ArrowDown" ||
        raw === "ArrowLeft" ||
        raw === "ArrowRight" ||
        raw === "Home" ||
        raw === "End" ||
        raw === "PageUp" ||
        raw === "PageDown";

      if (isEnter) {
        e.preventDefault();
        e.stopPropagation();
        setThemeSelectArmed(true);
        return;
      }
      if (isEscape) {
        e.preventDefault();
        e.stopPropagation();
        setThemeSelectArmed(false);
        return;
      }
      if (isNativeSelectNav || raw.length === 1) {
        e.preventDefault();
      }
    });
  }

  if (settingsThemeSelect instanceof HTMLSelectElement) {
    setSettingsThemeSelectArmed(false);
    settingsThemeSelect.addEventListener("change", async () => {
      if (!settingsThemeSelectChangeAllowed) {
        settingsThemeSelect.value = theme;
        setSettingsThemeSelectArmed(settingsThemeSelectArmed);
        return;
      }
      await commitThemeSelectValue(settingsThemeSelect.value);
      settingsThemeSelectChangeAllowed = false;
    });

    settingsThemeSelect.addEventListener("pointerdown", () => {
      settingsThemeSelectChangeAllowed = true;
      setSettingsThemeSelectArmed(false);
    });

    settingsThemeSelect.addEventListener("blur", () => {
      settingsThemeSelectChangeAllowed = false;
      setSettingsThemeSelectArmed(false);
    });

    settingsThemeSelect.addEventListener("keydown", (e) => {
      const raw = e.key;
      const code = e.code || "";
      const isEnter = raw === "Enter" || code === "Enter" || raw === " ";
      const isEscape = raw === "Escape" || code === "Escape";
      const isNativeSelectNav =
        raw === "ArrowUp" ||
        raw === "ArrowDown" ||
        raw === "ArrowLeft" ||
        raw === "ArrowRight" ||
        raw === "Home" ||
        raw === "End" ||
        raw === "PageUp" ||
        raw === "PageDown";

      if (isEnter) {
        e.preventDefault();
        e.stopPropagation();
        setSettingsThemeSelectArmed(true);
        return;
      }
      if (isEscape) {
        e.preventDefault();
        e.stopPropagation();
        setSettingsThemeSelectArmed(false);
        return;
      }
      if (isNativeSelectNav || raw.length === 1) {
        e.preventDefault();
      }
    });
  }

  // Keep theme selectors keyboard-only until explicitly clicked. This capture
  // guard runs before popup-wide navigation and prevents native select menus
  // from opening on Enter or Space.
  window.addEventListener(
    "keydown",
    (e) => {
      const activeThemeSelect =
        document.activeElement === themeSelect
          ? themeSelect
          : document.activeElement === settingsThemeSelect
            ? settingsThemeSelect
            : null;
      if (activeThemeSelect && modKeyOnly(e)) {
        const nav = getNavKeys(keyLayout);
        const key = String(e.key || "").toLowerCase();
        const armed = activeThemeSelect === themeSelect ? themeSelectArmed : settingsThemeSelectArmed;
        if (armed && (key === nav.up || key === nav.down)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          cycleThemeSelectControl(activeThemeSelect, key === nav.down ? +1 : -1);
          return;
        }
      }
      if (!activeThemeSelect || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key;
      const isEnter = key === "Enter" || key === " ";
      const isNativeSelectNav =
        key === "ArrowUp" ||
        key === "ArrowDown" ||
        key === "ArrowLeft" ||
        key === "ArrowRight" ||
        key === "Home" ||
        key === "End" ||
        key === "PageUp" ||
        key === "PageDown";
      if (isEnter) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (activeThemeSelect === themeSelect) setThemeSelectArmed(true);
        else setSettingsThemeSelectArmed(true);
      } else if (key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (activeThemeSelect === themeSelect) setThemeSelectArmed(false);
        else setSettingsThemeSelectArmed(false);
      } else if (isNativeSelectNav || key.length === 1) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  popupSizeInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      await commitPopupSizeValue(input.value);
    });
  });

  {
    const appearanceSettingsForm = document.getElementById("appearanceSettingsForm");
    if (appearanceSettingsForm instanceof HTMLFormElement) {
      appearanceSettingsForm.addEventListener("submit", (e) => {
        e.preventDefault();
      });
    }
  }

  function normalizeCustomBackgroundFile(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("This image format could not be opened."));
      };
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = largestSide > MAX_CUSTOM_BACKGROUND_DIMENSION ? MAX_CUSTOM_BACKGROUND_DIMENSION / largestSide : 1;
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Unable to prepare this image."));
          return;
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/webp", 0.86));
      };
      image.src = objectUrl;
    });
  }

  if (customBackgroundFile instanceof HTMLInputElement) {
    customBackgroundFile.addEventListener("change", async () => {
      const file = customBackgroundFile.files?.[0];
      if (!file) return;
      if (file.size > MAX_CUSTOM_BACKGROUND_INPUT_BYTES) {
        setCustomBackgroundStatus("Image must be 15 MiB or smaller.");
        customBackgroundFile.value = "";
        return;
      }
      try {
        const dataUrl = await normalizeCustomBackgroundFile(file);
        if (!/^data:image\/webp;base64,/i.test(dataUrl)) throw new Error("Unable to prepare this image.");
        customBackgroundDataUrl = dataUrl;
        applyCustomBackground(customBackgroundDataUrl);
        await saveCustomBackground(customBackgroundDataUrl);
        setCustomBackgroundStatus(`Using ${file.name}`);
      } catch (err) {
        setCustomBackgroundStatus(err instanceof Error ? err.message : "Unable to save background image.");
      } finally {
        customBackgroundFile.value = "";
      }
    });
  }

  if (clearCustomBackgroundBtn instanceof HTMLButtonElement) {
    clearCustomBackgroundBtn.addEventListener("click", async () => {
      customBackgroundDataUrl = "";
      applyCustomBackground("");
      await saveCustomBackground("");
      setCustomBackgroundStatus("Custom background cleared.");
    });
  }

  if (settingsHeaderTitleInput instanceof HTMLInputElement) {
    settingsHeaderTitleInput.addEventListener("input", () => {
      const headerTitleEl = document.getElementById("headerTitle");
      if (headerTitleEl instanceof HTMLElement) {
        headerTitleEl.textContent = titleTextForDisplay(settingsHeaderTitleInput.value);
      }
    });
    settingsHeaderTitleInput.addEventListener("blur", () => {
      void commitHeaderTitleValue();
    });
  }

  if (settingsHeaderTitleFontSelect instanceof HTMLSelectElement) {
    setSettingsHeaderTitleFontSelectArmed(false);
    settingsHeaderTitleFontSelect.addEventListener("change", async () => {
      if (!settingsHeaderTitleFontSelectChangeAllowed) {
        settingsHeaderTitleFontSelect.value = appHeaderTitleFontKey;
        setSettingsHeaderTitleFontSelectArmed(settingsHeaderTitleFontSelectArmed);
        return;
      }
      await commitHeaderTitleFontValue();
      settingsHeaderTitleFontSelectChangeAllowed = false;
    });

    settingsHeaderTitleFontSelect.addEventListener("pointerdown", () => {
      settingsHeaderTitleFontSelectChangeAllowed = true;
      setSettingsHeaderTitleFontSelectArmed(false);
    });

    settingsHeaderTitleFontSelect.addEventListener("blur", () => {
      settingsHeaderTitleFontSelectChangeAllowed = false;
      setSettingsHeaderTitleFontSelectArmed(false);
    });

    settingsHeaderTitleFontSelect.addEventListener("keydown", (e) => {
      const raw = e.key;
      const code = e.code || "";
      const isEnter = raw === "Enter" || code === "Enter" || raw === " ";
      const isEscape = raw === "Escape" || code === "Escape";
      const isNativeSelectNav =
        raw === "ArrowUp" ||
        raw === "ArrowDown" ||
        raw === "ArrowLeft" ||
        raw === "ArrowRight" ||
        raw === "Home" ||
        raw === "End" ||
        raw === "PageUp" ||
        raw === "PageDown";

      if (isEnter) {
        e.preventDefault();
        e.stopPropagation();
        setSettingsHeaderTitleFontSelectArmed(true);
        return;
      }
      if (isEscape) {
        e.preventDefault();
        e.stopPropagation();
        setSettingsHeaderTitleFontSelectArmed(false);
        return;
      }
      if (isNativeSelectNav || raw.length === 1) {
        e.preventDefault();
      }
    });
  }

  if (settingsInterfaceFontSelect instanceof HTMLSelectElement) {
    settingsInterfaceFontSelect.addEventListener("change", () => {
      void commitInterfaceFontValue();
    });
  }

  function wireKeyLayoutSettingsRadios() {
    const qw = document.getElementById("keyLayoutQwerty");
    const dv = document.getElementById("keyLayoutDvorak");
    const w = document.getElementById("keyboardNavPlatformWinlinux");
    const m = document.getElementById("keyboardNavPlatformMac");
    const onLayoutChange = async () => {
      const next =
        dv instanceof HTMLInputElement && dv.checked ? "dvorak" : "qwerty";
      if (keyLayout === next) return;
      keyLayout = next;
      await saveKeyLayout(keyLayout);
      updateKeyboardSettingsUi();
      const iv = document.getElementById("instructionsView");
      const visible = iv instanceof HTMLElement && !iv.hasAttribute("hidden");
      if (visible) renderInstructions();
    };
    const onPlatformChange = async () => {
      const next = m instanceof HTMLInputElement && m.checked ? "mac" : "winlinux";
      if (gKeyboardNavPlatform === next) return;
      gKeyboardNavPlatform = next;
      await saveKeyboardNavPlatform(gKeyboardNavPlatform);
      updateKeyboardSettingsUi();
      const iv = document.getElementById("instructionsView");
      if (iv instanceof HTMLElement && !iv.hasAttribute("hidden")) renderInstructions();
    };
    if (qw instanceof HTMLInputElement) qw.addEventListener("change", onLayoutChange);
    if (dv instanceof HTMLInputElement) dv.addEventListener("change", onLayoutChange);
    if (w instanceof HTMLInputElement) w.addEventListener("change", onPlatformChange);
    if (m instanceof HTMLInputElement) m.addEventListener("change", onPlatformChange);
  }

  function wireSettingsEnterActivate() {
    const syncEl = document.getElementById("obsidianSyncMode");
    const qw = document.getElementById("keyLayoutQwerty");
    const dv = document.getElementById("keyLayoutDvorak");
    const w = document.getElementById("keyboardNavPlatformWinlinux");
    const m = document.getElementById("keyboardNavPlatformMac");
    const sizeInputs = Array.from(document.querySelectorAll('input[name="popupSizeChoice"]'));

    const onEnter = (e) => {
      if (e.key !== "Enter") return;
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;

      if (t === syncEl && syncEl instanceof HTMLInputElement && syncEl.type === "checkbox") {
        e.preventDefault();
        syncEl.click();
        return;
      }
      if ((t === qw || t === dv || t === w || t === m) && t.type === "radio") {
        e.preventDefault();
        t.click();
        return;
      }
      if (sizeInputs.includes(t) && t.type === "radio") {
        e.preventDefault();
        t.click();
      }
    };

    if (syncEl instanceof HTMLElement) syncEl.addEventListener("keydown", onEnter);
    if (qw instanceof HTMLElement) qw.addEventListener("keydown", onEnter);
    if (dv instanceof HTMLElement) dv.addEventListener("keydown", onEnter);
    sizeInputs.forEach((input) => {
      if (input instanceof HTMLElement) input.addEventListener("keydown", onEnter);
    });
  }

  wireKeyLayoutSettingsRadios();
  wireSettingsEnterActivate();

  /** Swaps which board column (Pending vs Complete) is expanded; used by mouse, Enter/Space, and mod+nav. */
  let setBoardColumnSplit = () => {};

  function wireBoardColumnSplit() {
    const board = document.getElementById("notesBoard");
    const colPending = document.getElementById("colPending");
    const colComplete = document.getElementById("colComplete");
    if (
      !(board instanceof HTMLElement) ||
      !(colPending instanceof HTMLElement) ||
      !(colComplete instanceof HTMLElement)
    ) {
      return;
    }

    setBoardColumnSplit = (which) => {
      const next = which === "complete" ? "complete" : "pending";
      board.classList.remove("board--split-pending", "board--split-complete");
      board.classList.add(next === "complete" ? "board--split-complete" : "board--split-pending");
      board.dataset.boardSplit = next;
      if (next === "pending") {
        colPending.setAttribute("aria-expanded", "true");
        colComplete.setAttribute("aria-expanded", "false");
      } else {
        colComplete.setAttribute("aria-expanded", "true");
        colPending.setAttribute("aria-expanded", "false");
      }
      colPending.setAttribute("tabindex", "0");
      colComplete.setAttribute("tabindex", "0");
      requestAnimationFrame(() => {
        document.querySelectorAll(".noteCard").forEach((c) => {
          if (c instanceof HTMLElement) morphCardHeight(c);
        });
      });
    };

    setBoardColumnSplit("pending");

    board.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const col = t.closest(".col");
      if (!(col instanceof HTMLElement) || !board.contains(col)) return;

      if (board.classList.contains("board--split-pending") && col === colComplete) {
        e.preventDefault();
        setBoardColumnSplit("complete");
        return;
      }
      if (board.classList.contains("board--split-complete") && col === colPending) {
        e.preventDefault();
        setBoardColumnSplit("pending");
      }
    });

    board.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const active = document.activeElement;
      if (active !== colPending && active !== colComplete) return;
      if (board.classList.contains("board--split-pending") && active === colComplete) {
        e.preventDefault();
        setBoardColumnSplit("complete");
      } else if (board.classList.contains("board--split-complete") && active === colPending) {
        e.preventDefault();
        setBoardColumnSplit("pending");
      }
    });
  }

  wireBoardColumnSplit();

  renderBoardTabs(boards, activeBoard);

  // Track editor selection per-note so toolbar clicks can apply formatting
  // to the user's selected text (toolbar buttons would otherwise steal focus).
  const editorSelectionByNoteId = new Map();

  // Lightweight Vim-style editing for the rich notes editor.
  // Modes are per-note: 'insert' (default), 'normal', and 'visual'.
  const vimModeByNoteId = new Map();
  const vimPendingByNoteId = new Map();
  const vimRegistersByNoteId = new Map();
  const vimNextRegisterByNoteId = new Map();
  const vimVisualAnchorByNoteId = new Map();
  const vimUndoStackByNoteId = new Map();
  const vimUndoMetaByNoteId = new Map();
  const vimUndoApplyingByNoteId = new Set();
  let lastFocusedNoteEditor = null;

  function vimGetUndoStack(noteId) {
    let stack = vimUndoStackByNoteId.get(noteId);
    if (!Array.isArray(stack)) {
      stack = [];
      vimUndoStackByNoteId.set(noteId, stack);
    }
    return stack;
  }

  function vimUndoPush(noteId, html, { force } = { force: false }) {
    const stack = vimGetUndoStack(noteId);
    const value = typeof html === "string" ? html : "";
    const last = stack.length ? stack[stack.length - 1] : null;
    if (!force && last === value) return;

    // Simple coalescing to avoid pushing on every keystroke.
    const meta = vimUndoMetaByNoteId.get(noteId) || { lastPushAt: 0 };
    const now = Date.now();
    const withinCoalesce = !force && now - (meta.lastPushAt || 0) < 450;
    if (withinCoalesce && stack.length) {
      stack[stack.length - 1] = value;
    } else {
      stack.push(value);
      // Cap stack size.
      if (stack.length > 60) stack.splice(0, stack.length - 60);
    }
    vimUndoMetaByNoteId.set(noteId, { lastPushAt: now });
  }

  function vimUndoApply(editor) {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return false;
    const stack = vimGetUndoStack(noteId);
    if (stack.length < 2) return false;

    // Drop current state and revert to previous.
    stack.pop();
    const prev = stack[stack.length - 1];
    if (typeof prev !== "string") return false;

    vimUndoApplyingByNoteId.add(noteId);
    try {
      editor.innerHTML = prev;
      // Place caret at end.
      const sel = window.getSelection();
      if (sel) {
        const r = document.createRange();
        r.selectNodeContents(editor);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      ensureNotesEditorCaretInView(editor);
      return true;
    } finally {
      // Let any input handlers run before re-enabling capture.
      setTimeout(() => {
        vimUndoApplyingByNoteId.delete(noteId);
      }, 0);
    }
  }

  function getNoteIdFromEditor(editor) {
    if (!(editor instanceof HTMLElement)) return null;
    const n = Number(editor.dataset.noteId);
    return Number.isFinite(n) ? n : null;
  }

  function isEditableElement(el) {
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLElement && el.isContentEditable)
    );
  }

  function getActiveNotesEditorFromEventTarget(target) {
    if (!(target instanceof Element)) return null;
    const editor = target.closest(".noteEditorArea");
    return editor instanceof HTMLElement ? editor : null;
  }

  function getCurrentBlockElement(editor, useFocus = false) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = useFocus ? sel.focusNode : sel.anchorNode;
    if (!node) return null;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!(el instanceof Element)) return null;
    if (!editor.contains(el)) return null;

    const block = el.closest(
      "li, p, div, pre, blockquote, h1, h2, h3, h4, h5, h6"
    );
    if (block instanceof HTMLElement && editor.contains(block) && block !== editor) {
      return block;
    }
    return null;
  }

  function getSelectionRangeInEditor(editor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    try {
      const r = sel.getRangeAt(0);
      if (!r) return null;
      const startOk = r.startContainer instanceof Node && editor.contains(r.startContainer);
      const endOk = r.endContainer instanceof Node && editor.contains(r.endContainer);
      if (!startOk || !endOk) return null;
      return r;
    } catch {
      return null;
    }
  }

  function ensureCaretSelectionInEditor(editor) {
    const existing = getSelectionRangeInEditor(editor);
    if (existing) return existing;
    collapseSelectionToEditorStart(editor);
    return getSelectionRangeInEditor(editor);
  }

  function collapseSelectionToEditorStart(editor) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    // Collapsed ranges at element boundaries may have no client rect; force scroll.
    try {
      editor.scrollTop = 0;
    } catch {
      // ignore
    }
    ensureNotesEditorCaretInView(editor);
  }

  function collapseSelectionToAfterNode(node) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function setCaretInElement(el, offset) {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    try {
      r.setStart(el, offset);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch {
      // ignore
    }
  }

  function findFirstTextNode(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    return w.nextNode();
  }

  function findLastTextNode(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let last = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) last = n;
    return last;
  }

  function vimCaretToStartOfLine(editor, { firstNonWhitespace } = { firstNonWhitespace: false }) {
    const block = getCurrentBlockElement(editor) || editor;
    const firstText = findFirstTextNode(block);
    if (!firstText) {
      // Fallback: place caret at start of block contents.
      const sel = window.getSelection();
      if (!sel) return;
      const r = document.createRange();
      r.selectNodeContents(block);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }

    let offset = 0;
    if (firstNonWhitespace) {
      const text = firstText.nodeValue || "";
      const m = text.match(/^\s*/);
      offset = m ? m[0].length : 0;
      if (offset > text.length) offset = text.length;
    }
    setCaretInElement(firstText, offset);
    ensureNotesEditorCaretInView(editor);
  }

  function vimCaretToEndOfLine(editor) {
    const block = getCurrentBlockElement(editor) || editor;
    const lastText = findLastTextNode(block);
    if (!lastText) {
      const sel = window.getSelection();
      if (!sel) return;
      const r = document.createRange();
      r.selectNodeContents(block);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
      return;
    }
    const text = lastText.nodeValue || "";
    setCaretInElement(lastText, text.length);
    ensureNotesEditorCaretInView(editor);
  }

  function vimSetMode(noteId, mode) {
    if (mode !== "insert" && mode !== "normal" && mode !== "visual") return;
    vimModeByNoteId.set(noteId, mode);
    if (mode !== "visual") vimVisualAnchorByNoteId.delete(noteId);
    updateVimStatusInDom(noteId);
  }

  function vimGetMode(noteId) {
    return vimModeByNoteId.get(noteId) || "insert";
  }

  const vimToastTimersByNoteId = new Map();

  function vimGetPendingStatus(noteId) {
    const p = vimPendingByNoteId.get(noteId);
    if (!p) return null;
    if (!p.key) return null;
    // Pending keys generally time out around 700ms (dd/yy) to 4s (register, :x).
    // Use 4s so the status remains readable while user is mid-sequence.
    if (Date.now() - (p.at || 0) > 4000) return null;
    return String(p.key);
  }

  function vimPeekNextRegister(noteId) {
    const v = vimNextRegisterByNoteId.get(noteId);
    return v ? String(v) : null;
  }

  function vimFormatStatus(noteId) {
    const mode = String(vimGetMode(noteId) || "insert").toUpperCase();
    const pending = vimGetPendingStatus(noteId);
    const nextReg = vimPeekNextRegister(noteId);

    let s = mode;
    if (pending) s += `  |  PENDING: ${pending}`;
    if (nextReg) s += `  |  REG: ${nextReg}`;
    return s;
  }

  function updateVimStatusInDom(noteId) {
    const el = document.querySelector(
      `.noteVimStatus[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (!(el instanceof HTMLElement)) return;
    el.textContent = vimFormatStatus(noteId);
  }

  function updateVimStatusesInDom() {
    const els = document.querySelectorAll(".noteVimStatus[data-note-id]");
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      const noteId = Number(el.dataset.noteId);
      if (!Number.isFinite(noteId)) continue;
      el.textContent = vimFormatStatus(noteId);
    }
  }

  function vimShowToast(noteId, message, { ms } = { ms: 900 }) {
    const el = document.querySelector(
      `.noteVimToast[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (!(el instanceof HTMLElement)) return;
    const msg = String(message || "").trim();
    if (!msg) return;

    const prev = vimToastTimersByNoteId.get(noteId);
    if (prev) clearTimeout(prev);

    el.textContent = msg;
    el.hidden = false;
    const t = setTimeout(() => {
      el.hidden = true;
      el.textContent = "";
      vimToastTimersByNoteId.delete(noteId);
    }, Math.max(250, Number(ms) || 900));
    vimToastTimersByNoteId.set(noteId, t);
  }

  function updateVimIndicatorsInDom() {
    // Back-compat shim: indicator removed; keep status line updated.
    updateVimStatusesInDom();
  }

  function vimClearPending(noteId) {
    vimPendingByNoteId.delete(noteId);
    updateVimStatusInDom(noteId);
  }

  function vimPendingIs(noteId, key, withinMs) {
    const p = vimPendingByNoteId.get(noteId);
    if (!p) return false;
    if (p.key !== key) return false;
    return Date.now() - p.at <= withinMs;
  }

  function vimSetPending(noteId, key) {
    vimPendingByNoteId.set(noteId, { key, at: Date.now() });
    updateVimStatusInDom(noteId);
  }

  function vimGetRegisterBank(noteId) {
    let bank = vimRegistersByNoteId.get(noteId);
    if (!(bank instanceof Map)) {
      bank = new Map();
      vimRegistersByNoteId.set(noteId, bank);
    }
    return bank;
  }

  function vimWriteClipboard({ text, html }, { editor } = {}) {
    const plain = String(text || "");
    const markup = typeof html === "string" ? html : "";

    if (!plain && !markup) return false;

    const plainFromHtml = (inputHtml) => {
      try {
        const wrap = document.createElement("div");
        wrap.innerHTML = String(inputHtml || "");
        return wrap.innerText || wrap.textContent || "";
      } catch {
        return "";
      }
    };

    // Preserve the user's current selection so we can do a hidden-textarea fallback
    // without breaking visual mode selection.
    const prevActive = document.activeElement;
    const sel = window.getSelection();
    const ranges = [];
    if (sel) {
      for (let i = 0; i < sel.rangeCount; i++) {
        try {
          ranges.push(sel.getRangeAt(i).cloneRange());
        } catch {
          // ignore
        }
      }
    }

    // 1) Synchronous execCommand path (most reliable under user-gesture constraints).
    // Use a 'copy' event handler to provide both HTML and plain text.
    let ok = false;
    const copyPlain = plain || plainFromHtml(markup);
    const copyHtml = markup || "";

    const container = document.createElement("div");
    container.setAttribute("contenteditable", "true");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    container.innerHTML = copyHtml || "";
    if (!copyHtml) container.textContent = copyPlain;

    const onCopy = (ev) => {
      try {
        if (!ev || !ev.clipboardData) return;
        if (copyPlain) ev.clipboardData.setData("text/plain", copyPlain);
        if (copyHtml) ev.clipboardData.setData("text/html", copyHtml);
        ev.preventDefault();
        ok = true;
      } catch {
        // ignore
      }
    };

    try {
      document.addEventListener("copy", onCopy, true);
      document.body.appendChild(container);
      const r = document.createRange();
      r.selectNodeContents(container);
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(r);
      }
      try {
        // execCommand may return false even when the copy event succeeds.
        const execOk = document.execCommand("copy");
        ok = ok || !!execOk;
      } catch {
        // ignore
      }
    } catch {
      // ignore
    } finally {
      try {
        document.removeEventListener("copy", onCopy, true);
      } catch {
        // ignore
      }
      try {
        container.remove();
      } catch {
        // ignore
      }

      // Restore focus/selection best-effort.
      try {
        if (editor instanceof HTMLElement) editor.focus();
        else if (prevActive instanceof HTMLElement) prevActive.focus();
      } catch {
        // ignore
      }
      try {
        if (sel && ranges.length) {
          sel.removeAllRanges();
          for (const rr of ranges) sel.addRange(rr);
        }
      } catch {
        // ignore
      }
    }

    if (ok) return true;

    // 2) Async Clipboard API fallback.
    try {
      if (navigator?.clipboard?.write && typeof ClipboardItem !== "undefined") {
        const items = {};
        if (copyPlain) items["text/plain"] = new Blob([copyPlain], { type: "text/plain" });
        if (copyHtml) items["text/html"] = new Blob([copyHtml], { type: "text/html" });
        const item = new ClipboardItem(items);
        navigator.clipboard.write([item]).catch(() => {
          // ignore
        });
        return true;
      }
    } catch {
      // ignore
    }

    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(copyPlain).catch(() => {
          // ignore
        });
        return true;
      }
    } catch {
      // ignore
    }

    return false;
  }

  function vimDefaultRegisterName() {
    return "0";
  }

  function vimSetRegister(noteId, name, value) {
    const bank = vimGetRegisterBank(noteId);
    bank.set(String(name || vimDefaultRegisterName()), {
      html: value && typeof value.html === "string" ? value.html : "",
      text: value && typeof value.text === "string" ? value.text : ""
    });
  }

  function vimGetRegister(noteId, name) {
    const bank = vimGetRegisterBank(noteId);
    const v = bank.get(String(name || vimDefaultRegisterName()));
    if (v && (typeof v.html === "string" || typeof v.text === "string")) return v;
    return null;
  }

  function vimSetNextRegister(noteId, name) {
    vimNextRegisterByNoteId.set(noteId, String(name || vimDefaultRegisterName()));
    updateVimStatusInDom(noteId);
  }

  function vimConsumeNextRegister(noteId) {
    const name = vimNextRegisterByNoteId.get(noteId);
    vimNextRegisterByNoteId.delete(noteId);
    updateVimStatusInDom(noteId);
    return name || null;
  }

  function vimGetOpRegisterName(noteId) {
    return vimConsumeNextRegister(noteId) || vimDefaultRegisterName();
  }

  function extendSelection(direction, granularity) {
    const sel = window.getSelection();
    if (!sel) return;
    if (typeof sel.modify === "function") {
      try {
        sel.modify("extend", direction, granularity);
      } catch {
        // ignore
      }
    }

    // Keep caret/selection visible while navigating long notes.
    try {
      const active = document.activeElement;
      const editor = active instanceof Element ? active.closest(".noteEditorArea") : null;
      if (editor instanceof HTMLElement) ensureNotesEditorCaretInView(editor);
    } catch {
      // ignore
    }
  }

  function getTargetPositionForVisual(editor, target) {
    if (target === "startOfDocument") {
      const r = document.createRange();
      r.selectNodeContents(editor);
      r.collapse(true);
      return { node: r.startContainer, offset: r.startOffset };
    }
    if (target === "endOfDocument") {
      const r = document.createRange();
      r.selectNodeContents(editor);
      r.collapse(false);
      return { node: r.endContainer, offset: r.endOffset };
    }
    const block = getCurrentBlockElement(editor, true) || editor;
    if (target === "startOfLine") {
      const firstText = findFirstTextNode(block);
      if (!firstText) {
        const r = document.createRange();
        r.selectNodeContents(block);
        r.collapse(true);
        return { node: r.startContainer, offset: r.startOffset };
      }
      return { node: firstText, offset: 0 };
    }
    if (target === "startOfLineNonWhitespace") {
      const firstText = findFirstTextNode(block);
      if (!firstText) {
        const r = document.createRange();
        r.selectNodeContents(block);
        r.collapse(true);
        return { node: r.startContainer, offset: r.startOffset };
      }
      const text = firstText.nodeValue || "";
      const m = text.match(/^\s*/);
      const offset = m ? m[0].length : 0;
      return { node: firstText, offset: Math.min(offset, text.length) };
    }
    if (target === "endOfLine") {
      const lastText = findLastTextNode(block);
      if (!lastText) {
        const r = document.createRange();
        r.selectNodeContents(block);
        r.collapse(false);
        return { node: r.endContainer, offset: r.endOffset };
      }
      const text = lastText.nodeValue || "";
      return { node: lastText, offset: text.length };
    }
    return null;
  }

  function comparePositions(nodeA, offsetA, nodeB, offsetB) {
    const ra = document.createRange();
    ra.setStart(nodeA, offsetA);
    ra.collapse(true);
    const rb = document.createRange();
    rb.setStart(nodeB, offsetB);
    rb.collapse(true);
    return ra.compareBoundaryPoints(Range.START_TO_END, rb);
  }

  function extendSelectionToTarget(editor, noteId, target) {
    const anchor = vimVisualAnchorByNoteId.get(noteId);
    if (!anchor) return;
    const pos = getTargetPositionForVisual(editor, target);
    if (!pos) return;
    try {
      const cmp = comparePositions(
        anchor.startContainer,
        anchor.startOffset,
        pos.node,
        pos.offset
      );
      const r = document.createRange();
      if (cmp <= 0) {
        r.setStart(anchor.startContainer, anchor.startOffset);
        r.setEnd(pos.node, pos.offset);
      } else {
        r.setStart(pos.node, pos.offset);
        r.setEnd(anchor.startContainer, anchor.startOffset);
      }
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(r);
      }
      if (target === "startOfDocument") {
        try {
          editor.scrollTop = 0;
        } catch {
          // ignore
        }
      } else if (target === "endOfDocument") {
        try {
          editor.scrollTop = editor.scrollHeight;
        } catch {
          // ignore
        }
      }
      ensureNotesEditorCaretInView(editor);
    } catch {
      // ignore
    }
  }

  function vimEnterVisualMode(editor) {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return;
    const r = ensureCaretSelectionInEditor(editor);
    if (r) vimVisualAnchorByNoteId.set(noteId, r.cloneRange());
    vimSetMode(noteId, "visual");
  }

  function vimExitVisualMode(editor) {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return;

    // Collapse to a caret position within the editor.
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      try {
        sel.collapseToEnd();
      } catch {
        // ignore
      }
    }
    vimSetMode(noteId, "normal");
    vimClearPending(noteId);
    vimNextRegisterByNoteId.delete(noteId);
  }

  function vimDeleteSelection(editor) {
    const r = getSelectionRangeInEditor(editor);
    if (!r) return false;
    if (r.collapsed) return false;
    try {
      editor.focus();
      // Prefer browser delete for contenteditable behavior.
      if (document.queryCommandSupported && document.queryCommandSupported("delete")) {
        if (document.execCommand("delete")) return true;
      }
    } catch {
      // ignore
    }

    try {
      r.deleteContents();
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const rr = document.createRange();
        rr.selectNodeContents(editor);
        rr.collapse(true);
        sel.addRange(rr);
      }
      return true;
    } catch {
      return false;
    }
  }

  function vimYankSelection(editor, registerName) {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return { ok: false, clipboardOk: false };
    const r = getSelectionRangeInEditor(editor);
    if (!r) return { ok: false, clipboardOk: false };
    if (r.collapsed) return { ok: false, clipboardOk: false };

    let html = "";
    let text = "";
    try {
      text = r.toString();
      const frag = r.cloneContents();
      const wrap = document.createElement("div");
      wrap.appendChild(frag);
      html = wrap.innerHTML;

      // Some selections (e.g. checkbox-only, <br>-heavy) can yield an empty Range.toString().
      // Fall back to the fragment's rendered text.
      if (!text) text = wrap.innerText || wrap.textContent || "";
    } catch {
      // ignore
    }

    vimSetRegister(noteId, registerName, { html, text });
    const clipboardOk =
      String(registerName || "") === "+"
        ? vimWriteClipboard({ text, html }, { editor })
        : false;
    return { ok: true, clipboardOk };
  }

  function vimPasteAtCaret(editor, registerName) {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return false;
    const reg = vimGetRegister(noteId, registerName);
    if (!reg || (!reg.html && !reg.text)) return false;

    const r = ensureCaretSelectionInEditor(editor);
    if (!r) return false;

    const tryInsertHtml = (html) => {
      if (!html) return false;
      try {
        editor.focus();
        return document.execCommand("insertHTML", false, html);
      } catch {
        return false;
      }
    };

    const tryInsertText = (text) => {
      if (!text) return false;
      try {
        editor.focus();
        return document.execCommand("insertText", false, text);
      } catch {
        return false;
      }
    };

    if (!tryInsertHtml(reg.html)) {
      if (!tryInsertText(reg.text)) {
        // Range-based fallback
        try {
          const sel = window.getSelection();
          if (!sel || !sel.rangeCount) return;
          const rr = sel.getRangeAt(0);
          rr.deleteContents();
          if (reg.html) {
            const tpl = document.createElement("template");
            tpl.innerHTML = reg.html;
            const frag = tpl.content;
            const last = frag.lastChild;
            rr.insertNode(frag);
            if (last) collapseSelectionToAfterNode(last);
          } else if (reg.text) {
            rr.insertNode(document.createTextNode(reg.text));
          }
        } catch {
          // ignore
        }
      }
    }

    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function moveSelection(direction, granularity) {
    const sel = window.getSelection();
    if (!sel) return;
    if (typeof sel.modify === "function") {
      try {
        sel.modify("move", direction, granularity);
      } catch {
        // ignore
      }
    }

    // Keep caret visible while navigating long notes.
    try {
      const active = document.activeElement;
      const editor = active instanceof Element ? active.closest(".noteEditorArea") : null;
      if (editor instanceof HTMLElement) ensureNotesEditorCaretInView(editor);
    } catch {
      // ignore
    }
  }

  function ensureNotesEditorCaretInView(editor) {
    if (!(editor instanceof HTMLElement)) return;
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const r0 = sel.getRangeAt(0);
      if (!(r0?.endContainer instanceof Node) || !editor.contains(r0.endContainer)) return;

      const r = r0.cloneRange();
      r.collapse(true);

      const rects = r.getClientRects();
      const caretRect = rects && rects.length ? rects[0] : r.getBoundingClientRect();
      if (!caretRect || !(caretRect.width || caretRect.height)) return;

      const editorRect = editor.getBoundingClientRect();
      const pad = 16;

      const tooHigh = caretRect.top < editorRect.top + pad;
      const tooLow = caretRect.bottom > editorRect.bottom - pad;
      if (!tooHigh && !tooLow) return;

      let delta = 0;
      if (tooHigh) delta = caretRect.top - (editorRect.top + pad);
      else if (tooLow) delta = caretRect.bottom - (editorRect.bottom - pad);

      // client-rect delta approximates the scroll delta for the editor's overflow.
      const next = editor.scrollTop + delta;
      editor.scrollTop = Math.max(0, next);
    } catch {
      // ignore
    }
  }

  function vimDeleteCurrentBlock(editor) {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return;
    const block = getCurrentBlockElement(editor);
    if (!block) {
      editor.innerHTML = "";
      collapseSelectionToEditorStart(editor);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    const nextFocus =
      block.nextElementSibling instanceof HTMLElement
        ? block.nextElementSibling
        : block.previousElementSibling instanceof HTMLElement
          ? block.previousElementSibling
          : null;

    block.remove();
    if (nextFocus) {
      // Place caret near the remaining content.
      const sel = window.getSelection();
      if (sel) {
        const r = document.createRange();
        r.selectNodeContents(nextFocus);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    } else {
      collapseSelectionToEditorStart(editor);
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function vimYankCurrentBlock(editor, registerName) {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return { ok: false, clipboardOk: false };
    const block = getCurrentBlockElement(editor);
    const html = block ? block.outerHTML : editor.innerHTML;
    const text = block ? block.textContent : editor.textContent;
    vimSetRegister(noteId, registerName, { html, text });
    const clipboardOk =
      String(registerName || "") === "+"
        ? vimWriteClipboard({ text, html }, { editor })
        : false;
    return { ok: true, clipboardOk };
  }

  async function activateBoard(board, { persistSelection = true, focusBoardTab = false } = {}) {
    if (!board || !boards.includes(board)) return;
    if (board === activeBoard) {
      if (focusBoardTab) focusActiveBoardTab();
      return;
    }

    // Navigating to another board should close any open overlays (Notes editor / flipped links).
    // This keeps navigation predictable and avoids carrying open states across boards.
    for (const card of document.querySelectorAll(".noteCard[data-note-id]")) {
      if (!(card instanceof HTMLElement)) continue;
      const noteId = getNoteIdFromCardElement(card);
      if (noteId === null) continue;

      const editorWrap = card.querySelector(".noteEditor");
      if (editorWrap instanceof HTMLElement) editorWrap.hidden = true;
      openNoteEditorIds.delete(noteId);

      card.classList.remove("is-flipped");
      flippedNoteIds.delete(noteId);
    }

    activeBoard = board;
    setActiveTabUi(activeBoard);
    if (persistSelection) await saveActiveBoard(activeBoard);
    await refresh();
    if (focusBoardTab) focusActiveBoardTab();
    if (String(gObsidianVaultName || "").trim()) void scanObsidianVaultVsDbNotes();
  }

  function focusActiveBoardTab() {
    const tab = document.querySelector(
      `#boardTabs [role='tab'][data-board="${CSS.escape(String(activeBoard))}"]`
    );
    if (!(tab instanceof HTMLElement)) return false;
    try {
      tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      // ignore
    }
    return safeFocus(tab);
  }

  function setActiveTabUi(board) {
    const tabs = document.getElementById("boardTabs");
    if (!tabs) return;
    for (const tab of tabs.querySelectorAll("[role='tab'][data-board]")) {
      const itemBoard = tab.getAttribute("data-board");
      const selected = itemBoard === board;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;

      // Carbon tabs use a selected class on the <li>
      const li = tab.closest(".bx--tabs__nav-item");
      if (li) {
        li.classList.toggle("bx--tabs__nav-item--selected", selected);
      }
    }
  }

  async function refresh() {
    const notes = String(cardFilterQuery || "").trim() ? queryAllNotes(db) : queryNotes(db, activeBoard);
    const visibleNotes = getFilteredNotes(notes, cardFilterQuery);
    renderBoardTabs(boards, activeBoard);
    renderNotes(db, notes);
    updateCardFilterMeta(visibleNotes);
    updateCardFilterVisibility();
    wireNotesEditorAutocomplete();
    updateVimIndicatorsInDom();
  }

  async function maybeRefreshNotesEditorAfterVaultSync(noteId, navigateToObsidian) {
    await refresh();
    scheduleObsidianVaultScanDebounced();
    if (!navigateToObsidian && Number.isFinite(noteId) && openNoteEditorIds.has(noteId)) {
      requestAnimationFrame(() => {
        try {
          setNotesEditorOpen(noteId, true, { focusEditor: true, focusToggleOnClose: true });
        } catch (e) {
          console.warn("Notes editor refocus after vault sync failed", e);
        }
      });
    }
  }

  let obsidianConflictResolve = null;

  function hideObsidianConflictModal() {
    const modal = document.getElementById("obsidianConflictModal");
    if (modal instanceof HTMLElement) {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function applyPopupSize(size) {
    const value = POPUP_SIZE_ORDER.includes(size) ? size : "m";
    document.documentElement.setAttribute("data-popup-size", value);
    document.body.setAttribute("data-popup-size", value);
    popupSizeInputs.forEach((input) => {
      if (input instanceof HTMLInputElement) input.checked = input.value === value;
    });
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: "vim-todo-popup-size", size: value }, "*");
      } catch {
        // ignore
      }
    }
  }

  function splitMarkdownConflictLines(value) {
    const text = String(value || "").slice(0, 12000);
    if (!text) return [""];
    return text.split(/\r\n|\n|\r/);
  }

  function appendConflictDiffLine(parent, line, className, prefix) {
    const row = document.createElement("span");
    row.className = `obsidianConflictModal__diffLine ${className}`;
    const marker = document.createElement("span");
    marker.className = "obsidianConflictModal__diffMarker";
    marker.textContent = prefix;
    const content = document.createElement("span");
    content.className = "obsidianConflictModal__diffContent";
    content.textContent = line || " ";
    row.append(marker, content);
    parent.appendChild(row);
  }

  function renderObsidianConflictDiff(appEl, vaultEl, appMd, vaultMd) {
    const appLines = splitMarkdownConflictLines(appMd);
    const vaultLines = splitMarkdownConflictLines(vaultMd);
    appEl.replaceChildren();
    vaultEl.replaceChildren();

    if (appLines.length > 650 || vaultLines.length > 650) {
      appendConflictDiffLine(appEl, "Diff is large; showing plain preview.", "obsidianConflictModal__diffLine--note", " ");
      appendConflictDiffLine(vaultEl, "Diff is large; showing plain preview.", "obsidianConflictModal__diffLine--note", " ");
      for (const line of appLines) appendConflictDiffLine(appEl, line, "obsidianConflictModal__diffLine--same", " ");
      for (const line of vaultLines) appendConflictDiffLine(vaultEl, line, "obsidianConflictModal__diffLine--same", " ");
      return;
    }

    const rows = vaultLines.length + 1;
    const cols = appLines.length + 1;
    const dp = Array.from({ length: rows }, () => new Uint16Array(cols));
    for (let i = vaultLines.length - 1; i >= 0; i -= 1) {
      for (let j = appLines.length - 1; j >= 0; j -= 1) {
        dp[i][j] =
          vaultLines[i] === appLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    let i = 0;
    let j = 0;
    while (i < vaultLines.length || j < appLines.length) {
      if (i < vaultLines.length && j < appLines.length && vaultLines[i] === appLines[j]) {
        appendConflictDiffLine(vaultEl, vaultLines[i], "obsidianConflictModal__diffLine--same", " ");
        appendConflictDiffLine(appEl, appLines[j], "obsidianConflictModal__diffLine--same", " ");
        i += 1;
        j += 1;
      } else if (j < appLines.length && (i >= vaultLines.length || dp[i][j + 1] >= dp[i + 1][j])) {
        appendConflictDiffLine(vaultEl, "", "obsidianConflictModal__diffLine--removed", "-");
        appendConflictDiffLine(appEl, appLines[j], "obsidianConflictModal__diffLine--added", "+");
        j += 1;
      } else {
        appendConflictDiffLine(vaultEl, vaultLines[i], "obsidianConflictModal__diffLine--added", "+");
        appendConflictDiffLine(appEl, "", "obsidianConflictModal__diffLine--removed", "-");
        i += 1;
      }
    }
  }

  function showObsidianConflictModal_(appMd, vaultMd, meta = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById("obsidianConflictModal");
      const preApp = document.getElementById("obsidianConflictApp");
      const preVault = document.getElementById("obsidianConflictVault");
      const hintEl = document.getElementById("obsidianConflictHint");
      const useAppBtn = document.getElementById("obsidianConflictUseApp");
      const useVaultBtn = document.getElementById("obsidianConflictUseVault");
      if (!(modal instanceof HTMLElement)) {
        console.warn("Obsidian: conflict modal missing from DOM; cancel merge.");
        resolve(null);
        return;
      }
      obsidianConflictResolve = (choice) => {
        obsidianConflictResolve = null;
        hideObsidianConflictModal();
        resolve(choice);
      };
      if (preApp instanceof HTMLElement && preVault instanceof HTMLElement) {
        renderObsidianConflictDiff(preApp, preVault, appMd, vaultMd);
      }
      if (hintEl instanceof HTMLElement) {
        const vf = meta.vaultFileTime;
        const au = meta.appUpdatedAt;
        const vNew = !!meta.vaultNewerByClock;
        const aNew = !!meta.appNewerByClock;
        let line = "Compare the previews, then pick which Markdown wins.";
        if (vNew && !aNew) {
          line += " By modified time, the vault file looks newer.";
        } else if (aNew && !vNew) {
          line += " By saved time, the extension note looks newer.";
        } else {
          line += " Times are close or overlapping — pick the Markdown you trust.";
        }
        const nav = getNavKeys(keyLayout);
        line += ` Vault file: ${formatConflictModalTime(vf)} · Extension: ${formatConflictModalTime(au)}`;
        line += ` Keys: 1 / 2 · ← / → · ↑ / ↓ · ${String(nav.left || "").toUpperCase()} / ${String(
          nav.down || ""
        ).toUpperCase()} / ${String(nav.right || "").toUpperCase()} / ${String(nav.up || "").toUpperCase()} · Esc.`;
        hintEl.textContent = line;
      }
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => {
        if (useAppBtn instanceof HTMLElement && !modal.hidden) useAppBtn.focus();
      });
    });
  }

	  function setObsidianVaultFolderStatusUi() {
	    const canOpenPickerTab =
	      typeof chrome !== "undefined" && !!chrome.runtime?.getURL && !!chrome.tabs?.create;
	    const el = document.getElementById("obsidianVaultFolderStatus");
	    const hasLinkedFolder = !!obsidianVaultRootHandle;
	    if (el instanceof HTMLElement) {
	      if (!canOpenPickerTab) {
	        el.textContent = "Cannot open the folder step (extension APIs unavailable).";
	      } else {
	        el.textContent = hasLinkedFolder
	          ? "Vault folder linked."
	          : "No vault folder linked. “Choose vault folder” opens a tab (the popup cannot use the system picker).";
	      }
	    }
	    const chooseBtn = document.getElementById("obsidianChooseVaultFolderBtn");
	    const grantBtn = document.getElementById("obsidianGrantVaultAccessBtn");
	    const clearBtn = document.getElementById("obsidianClearVaultFolderBtn");
	    const resetCacheBtn = document.getElementById("clearObsidianPathCacheBtn");
	    const vaultNameInput = document.getElementById("obsidianVaultName");
	    const hasVaultName =
	      vaultNameInput instanceof HTMLInputElement
	        ? !!vaultNameInput.value.trim()
	        : !!String(gObsidianVaultName || "").trim();
	    if (chooseBtn instanceof HTMLButtonElement) {
	      chooseBtn.disabled = !canOpenPickerTab;
	      chooseBtn.textContent = hasLinkedFolder ? "Change Vault Folder…" : "Choose Vault Folder…";
	    }
	    if (grantBtn instanceof HTMLButtonElement) {
	      grantBtn.hidden = !hasLinkedFolder;
	      grantBtn.disabled = !canOpenPickerTab;
	    }
	    if (clearBtn instanceof HTMLButtonElement) {
	      clearBtn.hidden = !hasLinkedFolder;
	    }
	    if (resetCacheBtn instanceof HTMLButtonElement) {
	      resetCacheBtn.hidden = !hasVaultName;
	    }
	  }

  async function reloadObsidianVaultHandleFromStorage() {
    const api = obsidianVaultIdb();
    if (!api || typeof api.loadVaultHandle !== "function") {
      gObsidianVaultFolderLinked = false;
      return;
    }
    try {
      const h = await api.loadVaultHandle();
      obsidianVaultRootHandle = h || null;
      if (obsidianVaultRootHandle) {
        await obsidianVaultRootHandle.requestPermission({ mode: "readwrite" }).catch(() => {});
      }
    } catch (e) {
      console.warn("Obsidian: vault handle load failed", e);
      obsidianVaultRootHandle = null;
    }
    gObsidianVaultFolderLinked = !!obsidianVaultRootHandle;
  }

  /** Debounced notes HTML saves; must flush before Obsidian merge so DB matches the editor. */
  const notesEditorSaveTimers = new Map();

  let obsidianVaultScanDebounceTimer = null;
  function scheduleObsidianVaultScanDebounced() {
    if (obsidianVaultScanDebounceTimer) clearTimeout(obsidianVaultScanDebounceTimer);
    obsidianVaultScanDebounceTimer = setTimeout(() => {
      obsidianVaultScanDebounceTimer = null;
      void scanObsidianVaultVsDbNotes();
    }, 700);
  }

  /**
   * Read each visible note’s vault file (when Sync + linked folder) and compare to app Markdown.
   * Updates obsidianSyncStatusByNoteId + obsidianSyncScanState, then re-renders cards.
   */
  async function scanObsidianVaultVsDbNotes() {
    // Full `refresh()` inside this scan replaces all cards and destroys contenteditable nodes; never
    // run while a rich notes editor is open or typing becomes impossible / flickers.
    if (openNoteEditorIds.size > 0) {
      obsidianSyncScanState = "paused_editor";
      obsidianSyncStatusByNoteId.clear();
      obsidianSyncErrorHintByNoteId.clear();
      await refresh();
      return;
    }

    obsidianSyncStatusByNoteId.clear();
    obsidianSyncErrorHintByNoteId.clear();
    obsidianSyncGlobalBadgeHint = "";

    if (!String(gObsidianVaultName || "").trim()) {
      obsidianSyncScanState = "idle";
      await refresh();
      return;
    }

    if (!gObsidianSyncMode || !obsidianVaultRootHandle) {
      obsidianSyncScanState = "done";
      await refresh();
      return;
    }

    obsidianSyncScanState = "scanning";
    await refresh();

    await reloadObsidianVaultHandleFromStorage();

    if (!obsidianVaultRootHandle || !gObsidianSyncMode) {
      obsidianSyncScanState = "done";
      await refresh();
      return;
    }

    // Do not call requestPermission() here — automatic scans run without a user gesture, and
    // Chromium typically denies or no-ops. Use Settings → “Grant folder access” or Obsidian on a card.
    try {
      const st = await obsidianVaultRootHandle.queryPermission({ mode: "readwrite" });
      if (st !== "granted") {
        for (const row of queryNotes(db, activeBoard)) {
          obsidianSyncStatusByNoteId.set(Number(row.id), "permission_needs_gesture");
        }
        obsidianSyncGlobalBadgeHint =
          "queryPermission is not “granted”. Click “Grant folder access” in Settings → Obsidian (or Obsidian on a card), then reopen the popup or wait for badges to refresh.";
        obsidianSyncScanState = "done";
        await refresh();
        return;
      }
    } catch (e) {
      console.warn("Obsidian: vault permission check failed (scan)", e);
      obsidianSyncGlobalBadgeHint =
        (e instanceof Error ? e.message : String(e)).slice(0, 300) ||
        "Could not verify folder permission.";
      for (const row of queryNotes(db, activeBoard)) {
        obsidianSyncStatusByNoteId.set(Number(row.id), "permission_denied");
      }
      obsidianSyncScanState = "done";
      await refresh();
      return;
    }

    for (const note of queryNotes(db, activeBoard)) {
      const relPath = obsidianRelativeFilePath(db, note);
      if (!relPath) {
        obsidianSyncStatusByNoteId.set(Number(note.id), "no_path");
        continue;
      }
      const appMd = buildObsidianMarkdown(note);
      const na = normalizeObsidianMarkdown(appMd);
      try {
        const fh = await getFileHandleFromVaultPath(obsidianVaultRootHandle, relPath, false);
        const file = await fh.getFile();
        const nf = normalizeObsidianMarkdown(await file.text());
        obsidianSyncStatusByNoteId.set(Number(note.id), na === nf ? "synced" : "diverged");
      } catch (e) {
        const { kind, hint } = classifyObsidianVaultAccessError(e);
        if (hint) obsidianSyncErrorHintByNoteId.set(Number(note.id), hint);
        let status = "read_error";
        if (kind === "missing") status = "missing";
        else if (kind === "path_mismatch") status = "path_mismatch";
        else if (kind === "permission") status = "permission_denied";
        obsidianSyncStatusByNoteId.set(Number(note.id), status);
        if (kind !== "missing") {
          console.warn("Obsidian: vault scan read failed", relPath, e);
        }
      }
    }

    obsidianSyncScanState = "done";
    await refresh();
  }

  async function pushNoteMarkdownToObsidianVault(noteId, opts = {}) {
    const force = opts.force === true;
    if (!Number.isFinite(noteId)) return;
    if (!String(gObsidianVaultName || "").trim()) {
      console.warn("Obsidian: skipped vault push (set vault name in Settings).");
      return;
    }
    if (!gObsidianSyncMode) {
      console.warn(
        "Obsidian: skipped vault push (Sync mode off). Without it only obsidian:// links run — linked folder writes are disabled."
      );
      return;
    }

    await reloadObsidianVaultHandleFromStorage();
    if (!obsidianVaultRootHandle) {
      console.warn(
        "Obsidian: skipped vault push (no linked folder). Use “Choose vault folder” in Settings and pick your vault root."
      );
      return;
    }

    try {
      const st = await obsidianVaultRootHandle.queryPermission({ mode: "readwrite" });
      if (st !== "granted") {
        const r = await obsidianVaultRootHandle.requestPermission({ mode: "readwrite" });
        if (r !== "granted") {
          console.warn("Obsidian: skipped vault push (folder permission not granted).");
          return;
        }
      }
    } catch (e) {
      console.warn("Obsidian: skipped vault push (permission check failed).", e);
      return;
    }

    let noteRow = null;
    try {
      const res = db.exec(
        "SELECT id, board, text, status, notes_html, due_at, updated_at FROM notes WHERE id = ?",
        [noteId]
      );
      if (res.length && res[0].values?.length) noteRow = res[0].values[0];
    } catch {
      return;
    }
    if (!noteRow) return;
    const dueRaw = noteRow[5];
    const note = {
      id: noteRow[0],
      board: noteRow[1],
      text: noteRow[2],
      status: noteRow[3],
      notes_html: noteRow[4],
      due_at: dueRaw != null && dueRaw !== "" ? Number(dueRaw) : null,
      updated_at: noteRow[6],
    };

    const relPath = obsidianRelativeFilePath(db, note);
    if (!relPath) return;

    const vault = String(gObsidianVaultName || "").trim();
    const appMd = buildObsidianMarkdown(note);
    const na = normalizeObsidianMarkdown(appMd);
    try {
      const fh = await getFileHandleFromVaultPath(obsidianVaultRootHandle, relPath, false);
      const file = await fh.getFile();
      const nf = normalizeObsidianMarkdown(await file.text());
      const appUpdatedAt = Number.isFinite(Number(note.updated_at)) ? Number(note.updated_at) : 0;
      const vaultNewerByClock = file.lastModified > appUpdatedAt + OBSIDIAN_VAULT_TIME_SLACK_MS;
      if (na !== nf && !force && vaultNewerByClock) {
        console.warn(
          "Obsidian: skipped automatic vault push — on-disk .md differs from this note. Open Notes or Obsidian on this card to compare and choose."
        );
        return;
      }
    } catch {
      // No file yet (or unreadable): allow create below.
    }
    try {
      await writeMarkdownFileAtVaultPath(obsidianVaultRootHandle, relPath, appMd);
      markObsidianPathCreated(vault, note.id);
      await bumpNoteUpdatedAtToVaultFile(db, noteId, obsidianVaultRootHandle, relPath);
      await persist();
      scheduleObsidianVaultScanDebounced();
    } catch (e) {
      console.warn("Obsidian: could not push note to vault", e);
    }
  }

  /**
   * Persist the rich editor to SQLite. Optionally skip pushing to the vault — required before
   * `syncNoteWithObsidianVault` compares vault vs app, otherwise the push would overwrite the file first.
   */
  async function flushPendingNotesEditorSave(noteId, flushOpts = {}) {
    const skipVaultPush = flushOpts.skipVaultPush === true;
    const forceVaultPush = flushOpts.forceVaultPush === true;
    if (!Number.isFinite(noteId)) return;
    const existing = notesEditorSaveTimers.get(noteId);
    if (existing) clearTimeout(existing);
    notesEditorSaveTimers.delete(noteId);
    const editor = document.querySelector(
      `.noteEditorArea[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (!(editor instanceof HTMLElement)) return;
    try {
      setNotesHtml(db, noteId, renderMarkdownInNotesEditor(editor));
    } catch (err) {
      console.warn(err);
      return;
    }
    await persist();
    if (!skipVaultPush && gObsidianSyncMode && String(gObsidianVaultName || "").trim()) {
      await pushNoteMarkdownToObsidianVault(noteId, { force: forceVaultPush });
    }
  }

  async function syncNoteWithObsidianVault(noteId, opts = {}) {
    const navigateToObsidian = opts.navigateToObsidian !== false;
    try {
    await flushPendingNotesEditorSave(noteId, { skipVaultPush: true });

    const vault = String(gObsidianVaultName || "").trim();
    if (!vault) return;

    if (gObsidianSyncMode) {
      await reloadObsidianVaultHandleFromStorage();
    }

    let noteRow = null;
    try {
      const res = db.exec(
        "SELECT id, board, text, status, notes_html, due_at, updated_at FROM notes WHERE id = ?",
        [noteId]
      );
      if (res.length && res[0].values?.length) noteRow = res[0].values[0];
    } catch {
      return;
    }
    if (!noteRow) return;
    const dueRaw = noteRow[5];
    const note = {
      id: noteRow[0],
      board: noteRow[1],
      text: noteRow[2],
      status: noteRow[3],
      notes_html: noteRow[4],
      due_at: dueRaw != null && dueRaw !== "" ? Number(dueRaw) : null,
      updated_at: noteRow[6],
    };

    const relPath = obsidianRelativeFilePath(db, note);
    if (!relPath) return;

    async function navigateUriFallback() {
      if (!navigateToObsidian) return;
      const v = String(gObsidianVaultName || "").trim();
      if (!v) return;
      const file = obsidianRelativeFilePath(db, note);
      if (!file) return;
      const nid = Number(note?.id);
      if (!Number.isFinite(nid)) return;

      if (obsidianPathHasBeenCreated(v, nid)) {
        if (gObsidianSyncMode && obsidianVaultRootHandle) {
          try {
            await reloadObsidianVaultHandleFromStorage();
            if (obsidianVaultRootHandle) {
              let st = await obsidianVaultRootHandle.queryPermission({ mode: "readwrite" });
              if (st !== "granted") {
                await obsidianVaultRootHandle.requestPermission({ mode: "readwrite" }).catch(() => {});
                st = await obsidianVaultRootHandle.queryPermission({ mode: "readwrite" });
              }
              if (st === "granted") {
                try {
                  await getFileHandleFromVaultPath(obsidianVaultRootHandle, file, false);
                  openObsidianProtocolUrl(buildObsidianOpenUrlOnly(v, file));
                  return;
                } catch {
                  try {
                    localStorage.removeItem(obsidianPathStorageKey(v, nid));
                  } catch {
                    // ignore
                  }
                }
              }
            }
          } catch (e) {
            console.warn("Obsidian: navigateUriFallback cache revalidate", e);
          }
        } else {
          openObsidianProtocolUrl(buildObsidianOpenUrlOnly(v, file));
          return;
        }
      }

      if (gObsidianSyncMode && obsidianVaultRootHandle) {
        try {
          await reloadObsidianVaultHandleFromStorage();
          if (obsidianVaultRootHandle) {
            let st = await obsidianVaultRootHandle.queryPermission({ mode: "readwrite" });
            if (st !== "granted") {
              await obsidianVaultRootHandle.requestPermission({ mode: "readwrite" }).catch(() => {});
              st = await obsidianVaultRootHandle.queryPermission({ mode: "readwrite" });
            }
            if (st === "granted") {
              try {
                await getFileHandleFromVaultPath(obsidianVaultRootHandle, file, false);
                markObsidianPathCreated(v, nid);
                openObsidianProtocolUrl(buildObsidianOpenUrlOnly(v, file));
                return;
              } catch {
                // no file at path — use new without marking
              }
            }
          }
        } catch (e) {
          console.warn("Obsidian: navigateUriFallback vault check", e);
        }
        openObsidianProtocolUrl(buildObsidianNewProtocolUrl(v, file, note));
        return;
      }

      const url = resolveObsidianUrlForNote(db, note);
      if (url) openObsidianProtocolUrl(url);
    }

    /**
     * Re-read note from DB, optionally write Markdown to vault, then open Obsidian.
     * @param {{ skipVaultWrite?: boolean }} opts When `skipVaultWrite` (e.g. user chose vault in a conflict), do not
     *   overwrite the .md on disk — the file is already canonical; writing from DB would strip Obsidian-only syntax.
     */
    async function navigateOpenOnly(opts = {}) {
      const skipVaultWrite = opts.skipVaultWrite === true;
      if (!navigateToObsidian) return;
      let openRel = relPath;
      let noteForOpen = note;
      try {
        const res = db.exec(
          "SELECT id, board, text, status, notes_html, due_at, updated_at FROM notes WHERE id = ?",
          [noteId]
        );
        if (res.length && res[0].values?.length) {
          const row = res[0].values[0];
          const dueR = row[5];
          const freshNote = {
            id: row[0],
            board: row[1],
            text: row[2],
            status: row[3],
            notes_html: row[4],
            due_at: dueR != null && dueR !== "" ? Number(dueR) : null,
            updated_at: row[6],
          };
          noteForOpen = freshNote;
          const computed = obsidianRelativeFilePath(db, freshNote);
          if (computed) openRel = computed;
          if (!skipVaultWrite && obsidianVaultRootHandle) {
            const freshMd = buildObsidianMarkdown(freshNote);
            await writeMarkdownFileAtVaultPath(obsidianVaultRootHandle, openRel, freshMd);
            await bumpNoteUpdatedAtToVaultFile(db, noteId, obsidianVaultRootHandle, openRel);
            await persist();
          }
        }
      } catch (e) {
        console.warn("Obsidian: could not refresh vault file before open", e);
      }
      if (!navigateToObsidian) return;

      const v = vault;
      try {
        await reloadObsidianVaultHandleFromStorage();
        if (obsidianVaultRootHandle) {
          let st = await obsidianVaultRootHandle.queryPermission({ mode: "readwrite" });
          if (st !== "granted") {
            await obsidianVaultRootHandle.requestPermission({ mode: "readwrite" }).catch(() => {});
            st = await obsidianVaultRootHandle.queryPermission({ mode: "readwrite" });
          }
          if (st === "granted") {
            try {
              await getFileHandleFromVaultPath(obsidianVaultRootHandle, openRel, false);
              markObsidianPathCreated(v, Number(noteForOpen.id));
              openObsidianProtocolUrl(buildObsidianOpenUrlOnly(v, openRel));
              return;
            } catch {
              openObsidianProtocolUrl(buildObsidianNewProtocolUrl(v, openRel, noteForOpen));
              return;
            }
          }
        }
      } catch (e) {
        console.warn("Obsidian: navigateOpenOnly vault verify", e);
      }
      openObsidianProtocolUrl(buildObsidianNewProtocolUrl(v, openRel, noteForOpen));
    }

    if (!gObsidianSyncMode || !obsidianVaultRootHandle) {
      await navigateUriFallback();
      return;
    }

    try {
      const st = await obsidianVaultRootHandle.queryPermission({ mode: "readwrite" });
      if (st !== "granted") {
        const r = await obsidianVaultRootHandle.requestPermission({ mode: "readwrite" });
        if (r !== "granted") {
          await navigateUriFallback();
          return;
        }
      }
    } catch {
      await navigateUriFallback();
      return;
    }

    const appMd = buildObsidianMarkdown(note);
    let fileMd = "";
    let fileTime = 0;

    try {
      const fh = await getFileHandleFromVaultPath(obsidianVaultRootHandle, relPath, false);
      const file = await fh.getFile();
      fileMd = await file.text();
      fileTime = file.lastModified;
    } catch {
      await writeMarkdownFileAtVaultPath(obsidianVaultRootHandle, relPath, appMd);
      markObsidianPathCreated(vault, note.id);
      await bumpNoteUpdatedAtToVaultFile(db, noteId, obsidianVaultRootHandle, relPath);
      await persist();
      await maybeRefreshNotesEditorAfterVaultSync(noteId, navigateToObsidian);
      await navigateOpenOnly();
      return;
    }

    const na = normalizeObsidianMarkdown(appMd);
    const nf = normalizeObsidianMarkdown(fileMd);
    if (na === nf) {
      await navigateOpenOnly();
      if (navigateToObsidian) {
        scheduleObsidianVaultScanDebounced();
      }
      return;
    }

    // Whenever normalized Markdown differs, ask — modal shows file mtime vs extension updated_at as a hint.
    const au = Number.isFinite(Number(note.updated_at)) ? Number(note.updated_at) : 0;
    const vaultNewerByClock = fileTime > au + OBSIDIAN_VAULT_TIME_SLACK_MS;
    const appNewerByClock = au > fileTime;
    const choice = await showObsidianConflictModal_(na, nf, {
      vaultFileTime: fileTime,
      appUpdatedAt: au,
      vaultNewerByClock,
      appNewerByClock,
    });
    if (choice === "app") {
      await writeMarkdownFileAtVaultPath(obsidianVaultRootHandle, relPath, appMd);
      await bumpNoteUpdatedAtToVaultFile(db, noteId, obsidianVaultRootHandle, relPath);
      await persist();
      await maybeRefreshNotesEditorAfterVaultSync(noteId, navigateToObsidian);
      await navigateOpenOnly();
    } else if (choice === "vault") {
      const parsed = parseObsidianMarkdownImport(fileMd);
      const titleUse = parsed.title ? String(parsed.title).trim() : String(note.text || "").trim();
      const htmlUse =
        typeof parsed.notes_html === "string" && parsed.notes_html.trim()
          ? parsed.notes_html
          : note.notes_html || "";
      const stmt = db.prepare("UPDATE notes SET text = ?, notes_html = ?, updated_at = ? WHERE id = ?");
      stmt.run([titleUse, htmlUse, fileTime, noteId]);
      stmt.free();
      await persist();
      await maybeRefreshNotesEditorAfterVaultSync(noteId, navigateToObsidian);
      await navigateOpenOnly({ skipVaultWrite: true });
    } else {
      hideObsidianConflictModal();
    }
    } catch (e) {
      console.warn("Obsidian vault sync failed", e);
    }
  }

  function openObsidianForNote(noteId) {
    return syncNoteWithObsidianVault(noteId, { navigateToObsidian: true });
  }

  function wireObsidianConflictModalButtons() {
    const useApp = document.getElementById("obsidianConflictUseApp");
    const useVault = document.getElementById("obsidianConflictUseVault");
    const cancel = document.getElementById("obsidianConflictCancel");
    const backdrop = document.getElementById("obsidianConflictModalBackdrop");
    if (useApp instanceof HTMLElement) {
      useApp.addEventListener("click", () => {
        if (typeof obsidianConflictResolve === "function") obsidianConflictResolve("app");
      });
    }
    if (useVault instanceof HTMLElement) {
      useVault.addEventListener("click", () => {
        if (typeof obsidianConflictResolve === "function") obsidianConflictResolve("vault");
      });
    }
    if (cancel instanceof HTMLElement) {
      cancel.addEventListener("click", () => {
        if (typeof obsidianConflictResolve === "function") obsidianConflictResolve(null);
      });
    }
    if (backdrop instanceof HTMLElement) {
      backdrop.addEventListener("click", () => {
        if (typeof obsidianConflictResolve === "function") obsidianConflictResolve(null);
      });
    }
  }
  wireObsidianConflictModalButtons();
  setObsidianVaultFolderStatusUi();

  function wireNotesEditorAutocomplete() {
    const editors = document.querySelectorAll(".noteEditorArea[data-note-id]");
    for (const editor of editors) {
      if (!(editor instanceof HTMLElement)) continue;
      if (editor.dataset.autocompleteWired === "1") continue;

      const wrap = editor.closest(".noteEditor");
      const container = wrap ? wrap.querySelector(".noteEditorAutocomplete") : null;
      if (!(container instanceof HTMLElement)) continue;

      editor.dataset.autocompleteWired = "1";
      setupNotesEditorAutocomplete(editor, container);
    }
  }

  function setupNotesEditorAutocomplete(editor, container) {
    let localTimer = null;
    let aiTimer = null;
    let aiAbort = null;

    let aiPending = false;
    let aiLastError = "";

    let localCompletion = null; // { baseText, completion }
    let aiSuggestion = null; // { baseText, completion }

    const endsWithWhitespace = (s) => /\s$/.test(String(s || ""));
    const getLastToken = (s) => {
      const m = String(s || "").match(/(\S+)$/);
      return m ? m[1] : "";
    };
    const getLastTokenInfo = (s) => {
      const str = String(s || "");
      const m = str.match(/(\S+)$/);
      if (!m) return { token: "", index: str.length };
      const token = m[1] || "";
      const index = Math.max(0, str.length - token.length);
      return { token, index };
    };
    const getLeadingWord = (s) => {
      const m = String(s || "").match(/^([A-Za-z0-9_-]+)/);
      return m ? m[1] : "";
    };

    const getCaretPrefixText = () => {
      try {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return String(editor.textContent || "");
        const r = sel.getRangeAt(0);
        const endNode = r.endContainer;
        if (!(endNode instanceof Node) || !editor.contains(endNode)) {
          return String(editor.textContent || "");
        }
        const pre = document.createRange();
        pre.selectNodeContents(editor);
        pre.setEnd(r.endContainer, r.endOffset);
        return pre.toString();
      } catch {
        return String(editor.textContent || "");
      }
    };

    const ensureEnglishDictionaryLoaded = async () => {
      if (Array.isArray(englishDictWords)) return englishDictWords;
      if (englishDictLoadPromise) return englishDictLoadPromise;

      englishDictLoadPromise = (async () => {
        try {
          const cacheKey = "englishDict:5000-words:v1";
          let txt = "";
          try {
            const cached = await chrome.storage.local.get(cacheKey);
            txt = typeof cached?.[cacheKey] === "string" ? cached[cacheKey] : "";
          } catch {
            // ignore
          }

          if (!txt) {
            const url = "https://raw.githubusercontent.com/mahsu/IndexingExercise/master/5000-words.txt";
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Dictionary fetch failed: ${res.status}`);
            txt = await res.text();
            try {
              await chrome.storage.local.set({ [cacheKey]: txt });
            } catch {
              // ignore
            }
          }

          const out = [];
          const seen = new Set();
          for (const line of txt.split(/\r?\n/)) {
            const w = String(line || "").trim();
            if (!w) continue;
            if (w.length > 60) continue;
            if (!/^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(w)) continue;
            const lower = w.toLowerCase();
            if (isEnglishDictionaryProfaneWordLowercase(lower)) continue;
            if (seen.has(lower)) continue;
            seen.add(lower);
            out.push(lower);
          }
          out.sort();
          englishDictWords = out;
          return englishDictWords;
        } finally {
          if (!Array.isArray(englishDictWords)) englishDictLoadPromise = null;
        }
      })();

      return englishDictLoadPromise;
    };

    const findBestDictionaryWordCompletion = (baseText) => {
      if (!Array.isArray(englishDictWords) || !englishDictWords.length) return null;

      const base = String(baseText || "");
      if (!base.trim()) return null;
      if (endsWithWhitespace(base)) return null;

      const { token } = getLastTokenInfo(base);
      if (!token) return null;
      if (token.length < 3) return null;

      const prefix = token.toLowerCase();
      // If the typed prefix itself is very unlikely in common English, skip
      // dictionary suggestions (avoids recommending obscure terms).
      const shapePrefix = prefix.replace(/[^a-z]/g, "");
      if (shapePrefix.length >= 3 && scoreEnglishTokenShapeLowercase(shapePrefix) < -2) return null;
      const dictWords = englishDictWords;

      let lo = 0;
      let hi = dictWords.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dictWords[mid] < prefix) lo = mid + 1;
        else hi = mid;
      }

      let best = "";
      let bestCompletionLen = Infinity;
      let bestScore = -Infinity;

      // Avoid suggesting huge completions from a broad dictionary list; prefer
      // completing the current word, not replacing it with a long rare term.
      const maxCompletionLen = Math.max(8, Math.min(18, token.length + 6));

      // Scan a small window of matches; rank by commonness + short completion.
      for (let i = lo; i < dictWords.length; i++) {
        const w = dictWords[i];
        if (!w.startsWith(prefix)) break;
        if (w.length <= token.length) continue;

        const completionLen = w.length - token.length;
        if (completionLen > maxCompletionLen) continue;
        const score = scoreEnglishDictionaryCandidateWordLowercase(w, token.length);
        if (!(score >= 6)) continue;

        // Prefer the shortest completion that still looks like common English.
        const betterLen = completionLen < bestCompletionLen;
        const betterScore = completionLen === bestCompletionLen && score > bestScore;
        const betterWordLen =
          completionLen === bestCompletionLen && score === bestScore && (!best || w.length < best.length);

        if (betterLen || betterScore || betterWordLen) {
          best = w;
          bestScore = score;
          bestCompletionLen = completionLen;
        }

        if (i - lo > 600) break;
      }

      if (!best) return null;
      return { baseText: base, completion: best.slice(token.length) };
    };

    const findBestCustomWordCompletion = (baseText) => {
      const base = String(baseText || "");
      if (!base.trim()) return null;
      if (endsWithWhitespace(base)) return null;

      const { token } = getLastTokenInfo(base);
      if (!token) return null;
      if (token.length < 2) return null;

      const prefix = token.toLowerCase();
      const wordList = Array.isArray(aiCustomWords) ? aiCustomWords : [];

      let best = "";
      for (const w0 of wordList) {
        const w = String(w0 || "").trim();
        if (!w) continue;
        if (w.length <= token.length) continue;
        if (w.slice(0, token.length).toLowerCase() !== prefix) continue;
        if (!best || w.length < best.length) best = w;
      }

      if (!best) return null;
      return { baseText: base, completion: best.slice(token.length) };
    };

    const queryBestLocalCompletion = (baseText) => {
      const base = String(baseText || "");
      if (!base.trim()) return null;
      if (endsWithWhitespace(base)) return null;

      const { token } = getLastTokenInfo(base);
      if (!token) return null;
      const tokenLower = token.toLowerCase();

      try {
        const stmt = db.prepare(
          "SELECT text, updated_at FROM notes WHERE text LIKE ? ORDER BY updated_at DESC LIMIT ?"
        );
        stmt.bind([`%${token}%`, 40]);

        let bestWord = "";
        let bestUpdatedAt = -1;
        while (stmt.step()) {
          const row = stmt.getAsObject();
          const t = String(row.text || "");
          const updatedAt = Number(row.updated_at);

          const tokens = t.match(/[A-Za-z0-9_-]+/g) || [];
          for (const w of tokens) {
            if (!w) continue;
            if (w.length <= token.length) continue;
            if (w.slice(0, token.length).toLowerCase() !== tokenLower) continue;

            const isBetterLength = !bestWord || w.length < bestWord.length;
            const isBetterRecency = updatedAt > bestUpdatedAt;
            if (isBetterLength || (!isBetterLength && isBetterRecency)) {
              bestWord = w;
              bestUpdatedAt = Number.isFinite(updatedAt) ? updatedAt : bestUpdatedAt;
            }
          }
        }
        stmt.free();

        if (!bestWord) return null;
        return { baseText: base, completion: bestWord.slice(token.length) };
      } catch (err) {
        console.error(err);
        return null;
      }
    };

    const computeAiContextCompletion = (baseText, aiResponse) => {
      const base = String(baseText || "");
      if (!base.trim()) return null;

      let r = String(aiResponse || "").replace(/\r\n/g, "\n");
      if (!r) return null;

      // Use only the first line to avoid multi-line dumps.
      r = r.split("\n")[0] || "";
      r = r.replace(/^\s*Continuation\s*:\s*/i, "");
      r = r.replace(/^\s+/g, "");
      r = r.replace(/\s+$/g, "");

      // Strip surrounding quotes.
      if (
        (r.startsWith('"') && r.endsWith('"')) ||
        (r.startsWith("'") && r.endsWith("'"))
      ) {
        r = r.slice(1, -1);
      }

      const baseLower = base.toLowerCase();
      let rLower = r.toLowerCase();

      const baseEndsWs = /\s$/.test(base);
      const baseLast = base.slice(-1);
      const baseLastTokenMatch = String(base || "").match(/(\S+)$/);
      const baseLastToken = !baseEndsWs && baseLastTokenMatch ? String(baseLastTokenMatch[1] || "") : "";
      const isWordishToken = /^[A-Za-z][A-Za-z'-]*$/.test(baseLastToken);
      const lowerLastToken = baseLastToken.toLowerCase();
      const commonWholeWords = new Set([
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "because",
        "but",
        "by",
        "for",
        "from",
        "have",
        "i",
        "if",
        "in",
        "is",
        "it",
        "of",
        "on",
        "or",
        "really",
        "so",
        "that",
        "the",
        "this",
        "to",
        "was",
        "we",
        "with",
        "you"
      ]);

      const dictHasWordLower = (wLower) => {
        if (!Array.isArray(englishDictWords) || !englishDictWords.length) return false;
        const w = String(wLower || "");
        if (!w) return false;
        let lo = 0;
        let hi = englishDictWords.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (englishDictWords[mid] < w) lo = mid + 1;
          else hi = mid;
        }
        return englishDictWords[lo] === w;
      };

      const isGluedDictWordsLower = (wLower) => {
        const w = String(wLower || "");
        if (!w || w.length < 10) return false;
        if (!/^[a-z]+$/.test(w)) return false;
        if (!Array.isArray(englishDictWords) || !englishDictWords.length) return false;
        for (let i = 4; i <= w.length - 4; i++) {
          const a = w.slice(0, i);
          const b = w.slice(i);
          if (dictHasWordLower(a) && dictHasWordLower(b)) return true;
        }
        return false;
      };
      const tokenLooksComplete = (() => {
        if (!baseLastToken || !isWordishToken) return false;
        if (commonWholeWords.has(lowerLastToken)) return true;

        // If the 5k English dictionary is loaded, only treat *known words* as complete.
        if (dictHasWordLower(lowerLastToken)) return true;

        // Also allow user-provided custom words to count as complete.
        if (Array.isArray(aiCustomWords) && aiCustomWords.length) {
          for (const w0 of aiCustomWords) {
            const w = String(w0 || "").trim().toLowerCase();
            if (w && w === lowerLastToken) return true;
          }
        }

        return false;
      })();

      // If the model repeated the input, strip it.
      if (r && base && rLower.startsWith(baseLower)) {
        r = r.slice(base.length);
        rLower = r.toLowerCase();
      } else {
        // Some models ignore instructions and return the full completed word
        // instead of the suffix (e.g. base: "I ne" response: "need").
        const { token } = getLastTokenInfo(base);
        const tokenLower = String(token || "").toLowerCase();
        if (tokenLower && baseLower.endsWith(tokenLower) && rLower.startsWith(tokenLower)) {
          r = r.slice(tokenLower.length);
          rLower = r.toLowerCase();
        }
      }

      // If the model returned a phrase instead of a suffix, but that phrase contains
      // a word that completes the user's current token, salvage just the suffix.
      // Example: base "... next we" + response "Next week" -> "ek".
      if (!baseEndsWs) {
        const { token } = getLastTokenInfo(base);
        const tokenLower = String(token || "").toLowerCase();
        if (tokenLower && tokenLower.length >= 2 && /\s/.test(String(r || ""))) {
          const wordsInResp = String(rLower || "").match(/[a-z]+(?:[-'][a-z]+)*/g) || [];
          for (const w of wordsInResp) {
            if (!w) continue;
            if (w.length <= tokenLower.length) continue;
            if (!w.startsWith(tokenLower)) continue;
            r = w.slice(tokenLower.length);
            rLower = r.toLowerCase();
            break;
          }
        }
      }

      // Contraction guardrail: if the user just typed an apostrophe, only allow
      // common contraction suffixes (prevents junk like "let'important").
      if (/[A-Za-z]['’]$/.test(base) && /^[A-Za-z]/.test(r) && !/^['’]/.test(r)) {
        const ok =
          rLower === "s" ||
          rLower === "t" ||
          rLower === "d" ||
          rLower === "m" ||
          rLower.startsWith("re") ||
          rLower.startsWith("ve") ||
          rLower.startsWith("ll");
        if (!ok) return null;
      }

      // If we're at a word boundary and the model starts with a letter/number,
      // it often needs a leading space (e.g., "Send agendas" + "important" -> "Send agendas important").
      // But do NOT insert spaces mid-word ("imp" + "ortant" -> "important").
      if (!baseEndsWs) {
        if (/[.,;:!?…]/.test(baseLast) && /^[A-Za-z0-9]/.test(r) && !/^\s/.test(r)) {
          r = " " + r;
          rLower = r.toLowerCase();
        } else if (tokenLooksComplete && /[A-Za-z0-9]/.test(baseLast) && /^[A-Za-z0-9]/.test(r) && !/^\s/.test(r)) {
          // Ambiguous short tokens like "we" can be both a whole word and a prefix.
          // If the completion forms a real word with the current token ("we"+"ek" -> "week"),
          // treat it as mid-word and do NOT prepend a space.
          const looksLikeSuffix = isWordishToken && /^[A-Za-z'-]+$/.test(r) && !/\s/.test(r);
          if (looksLikeSuffix) {
            const combinedLower = (baseLastToken + r).toLowerCase();
            let combinedIsKnown = dictHasWordLower(combinedLower);
            if (!combinedIsKnown && Array.isArray(aiCustomWords) && aiCustomWords.length) {
              for (const w0 of aiCustomWords) {
                const w = String(w0 || "").trim().toLowerCase();
                if (w && w === combinedLower) {
                  combinedIsKnown = true;
                  break;
                }
              }
            }
            if (combinedIsKnown) {
              // Keep as-is (suffix only) to avoid inserting a space.
            } else {
              // Reject glued nonsense like "importantimportantly" when starting a new word.
              const lead = (String(r || "").match(/^([A-Za-z]{4,})/) || [])[1] || "";
              const leadLower = lead.toLowerCase();
              if (leadLower && isGluedDictWordsLower(leadLower)) return null;

              if (!/^['’]/.test(r)) {
                r = " " + r;
                rLower = r.toLowerCase();
              }
            }
          } else {
          // Reject glued nonsense like "importantimportantly" when starting a new word.
          const lead = (String(r || "").match(/^([A-Za-z]{4,})/) || [])[1] || "";
          const leadLower = lead.toLowerCase();
          if (leadLower && isGluedDictWordsLower(leadLower)) return null;

          if (!/^['’]/.test(r)) {
            r = " " + r;
            rLower = r.toLowerCase();
          }
          }
        } else if (!tokenLooksComplete) {
          // Mid-word: never allow spaces in the completion.
          if (/\s/.test(r)) return null;

          // If the common English dictionary is already loaded, only accept suffixes
          // that form a real word with the current token (prevents junk like
          // "alm" + "ostensibly" -> "almostensibly").
          if (Array.isArray(englishDictWords) && englishDictWords.length && isWordishToken && /^[A-Za-z'-]+$/.test(r)) {
            const combined = (baseLastToken + r).toLowerCase();
            // Completing a word into something very long is almost always junk.
            if (combined.length > 28) return null;
            if (/^[a-z]+(?:[-'][a-z]+)*$/.test(combined)) {
              if (!dictHasWordLower(combined)) return null;
            }
          }
        }
      }

      // Keep short; allow spaces/punctuation.
      r = r.replace(/[\u0000-\u001F\u007F]/g, "");
      if (r.endsWith(".")) {
        r = r.slice(0, -1).replace(/\s+$/g, "");
        rLower = r.toLowerCase();
      }
      r = r.slice(0, 80);
      if (!r.trim()) return null;

      // Guardrail: never append letters/digits immediately before sentence punctuation without a separator.
      // If the model forgets the space, we added it above; if it still looks wrong, drop it.
      const lastChar = base.slice(-1);
      if (/[.!?…]/.test(lastChar) && /^[A-Za-z0-9]/.test(r) && !/^\s/.test(r)) return null;

      return { baseText: base, completion: r };
    };

    const ollamaFetchViaBackground = async (url, opts) => {
      const { method = "GET", body, signal, timeoutMs = 60000 } = opts || {};
      const abortPromise = signal
        ? new Promise((_, reject) => {
            if (signal.aborted) reject(new DOMException("aborted", "AbortError"));
            signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
              once: true
            });
          })
        : null;
      const msgPromise = chrome.runtime.sendMessage({
        type: "ollamaFetch",
        url,
        method,
        body,
        timeoutMs: Math.max(1000, Number(timeoutMs) || 60000)
      });
      const r = await Promise.race(
        abortPromise ? [msgPromise, abortPromise] : [msgPromise]
      ).catch((err) => {
        if (err?.name === "AbortError") throw err;
        return { ok: false, error: err?.message || "fetch failed" };
      });
      if (r?.error) throw new Error(r.error);
      if (!r.ok) {
        const err = new Error(`Request failed: ${r.status}`);
        err.status = r.status;
        err.body = r.text;
        throw err;
      }
      return r;
    };

    const fetchOllamaDefaultModel = async (baseUrl, signal) => {
      const url = new URL("/api/tags", baseUrl).toString();
      const r = await ollamaFetchViaBackground(url, { method: "GET", signal, timeoutMs: 10000 });
      const data = r.data;
      const name = data?.models?.[0]?.name;
      if (typeof name !== "string" || !name) throw new Error("No Ollama models found");
      return name;
    };

    const fetchOllamaCompletion = async (baseUrl, prompt, signal) => {
      const model = ollamaModel || (await fetchOllamaDefaultModel(baseUrl, signal));
      ollamaModel = model;
      const url = new URL("/api/generate", baseUrl).toString();
      const chatUrl = new URL("/api/chat", baseUrl).toString();

      const doFetch = async (prompt2, options) => {
        const r = await ollamaFetchViaBackground(url, {
          method: "POST",
          body: { model, prompt: String(prompt2 || ""), stream: false, options },
          signal,
          timeoutMs: 45000
        });
        const data = r.data;
        const text = typeof data?.response === "string" ? String(data.response || "") : "";
        const doneReason = typeof data?.done_reason === "string" ? data.done_reason : "";
        return { text, meta: doneReason ? `done_reason=${doneReason}` : "" };
      };

      const doChatFetch = async (prompt2, options) => {
        const r = await ollamaFetchViaBackground(chatUrl, {
          method: "POST",
          body: {
            model,
            stream: false,
            messages: [
              {
                role: "system",
                content:
                  "You are an autocomplete engine. Return only the continuation text to insert at the cursor. No quotes. One line."
              },
              { role: "user", content: String(prompt2 || "") }
            ],
            options
          },
          signal,
          timeoutMs: 45000
        });
        const data = r.data;
        const content = typeof data?.message?.content === "string" ? String(data.message.content || "") : "";
        const doneReason = typeof data?.done_reason === "string" ? data.done_reason : "";
        return { text: content, meta: doneReason ? `done_reason=${doneReason}` : "" };
      };

      // Some models (e.g., qwen) occasionally return an empty response; retry once with a nudge.
      const r1 = await doFetch(prompt, { num_predict: 32, temperature: 0.2, top_p: 0.9 });
      if (String(r1?.text || "").trim()) return r1.text;

      const nudge =
        "\n\nIMPORTANT: Output at least 1 visible character. If mid-word, output the missing suffix only.";
      const r2 = await doFetch(String(prompt || "") + nudge, { num_predict: 48, temperature: 0.6, top_p: 0.95 });
      if (String(r2?.text || "").trim()) return r2.text;

      // Fallback: some chat-tuned models return empty for /api/generate but work via /api/chat.
      const r3 = await doChatFetch(prompt, { num_predict: 48, temperature: 0.4, top_p: 0.95 });
      if (String(r3?.text || "").trim()) return r3.text;

      // Allow "no suggestion" rather than forcing garbage.
      return "";
    };

    const hide = () => {
      container.textContent = "";
      container.hidden = true;
    };

    const editorWrap = editor.closest(".noteEditor");
    let inlineTrail = editorWrap ? editorWrap.querySelector(".noteEditorInlineTrail") : null;
    if (editorWrap instanceof HTMLElement && !(inlineTrail instanceof HTMLElement)) {
      inlineTrail = document.createElement("div");
      inlineTrail.className = "noteEditorInlineTrail";
      inlineTrail.hidden = true;
      editorWrap.appendChild(inlineTrail);
    }

    const syncEditorInlineTrailTypography = () => {
      if (!(inlineTrail instanceof HTMLElement)) return;
      try {
        const cs = getComputedStyle(editor);
        inlineTrail.style.fontFamily = cs.fontFamily;
        inlineTrail.style.fontSize = cs.fontSize;
        inlineTrail.style.fontWeight = cs.fontWeight;
        inlineTrail.style.letterSpacing = cs.letterSpacing;
        inlineTrail.style.lineHeight = cs.lineHeight;
      } catch {
        // ignore
      }
    };

    const hideEditorInlineTrail = () => {
      if (!(inlineTrail instanceof HTMLElement)) return;
      inlineTrail.textContent = "";
      inlineTrail.hidden = true;
    };

    const getCaretClientRect = () => {
      try {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const r0 = sel.getRangeAt(0);
        if (!(r0?.endContainer instanceof Node) || !editor.contains(r0.endContainer)) return null;
        const r = r0.cloneRange();
        r.collapse(true);
        const rects = r.getClientRects();
        if (rects && rects.length) return rects[0];
        const br = r.getBoundingClientRect();
        if (br && (br.width || br.height)) return br;
        return null;
      } catch {
        return null;
      }
    };

    const renderEditorInlineTrail = (candidate) => {
      if (!(inlineTrail instanceof HTMLElement)) return;
      if (!(editorWrap instanceof HTMLElement)) return;

      if (
        candidate &&
        candidate.completion &&
        getCaretPrefixText() === candidate.baseText &&
        document.activeElement === editor
      ) {
        const caretRect = getCaretClientRect();
        if (!caretRect) {
          hideEditorInlineTrail();
          return;
        }

        const wrapRect = editorWrap.getBoundingClientRect();
        inlineTrail.textContent = String(candidate.completion || "");
        inlineTrail.hidden = false;
        syncEditorInlineTrailTypography();
        inlineTrail.style.left = `${Math.max(0, caretRect.left - wrapRect.left)}px`;
        inlineTrail.style.top = `${Math.max(0, caretRect.top - wrapRect.top)}px`;
        return;
      }

      hideEditorInlineTrail();
    };

    let tabProgress = null; // { baseText, remaining, step, kind }

    const getActiveTabCompletion = () => {
      const baseText = getCaretPrefixText();
      if (tabProgress && tabProgress.remaining && baseText === tabProgress.baseText) {
        return { baseText, completion: tabProgress.remaining, kind: tabProgress.kind || "local" };
      }
      if (localCompletion && localCompletion.completion && baseText === localCompletion.baseText) {
        return { baseText, completion: localCompletion.completion, kind: "local" };
      }
      if (aiSuggestion && aiSuggestion.completion && baseText === aiSuggestion.baseText) {
        return { baseText, completion: aiSuggestion.completion, kind: "ai" };
      }
      return null;
    };

    const applyTabProgressStep = (candidate) => {
      if (!candidate || !candidate.completion) return false;
      const baseText = String(candidate.baseText || "");
      const remaining = String(candidate.completion || "");
      if (!remaining) return false;

      // Accept full completion in one Tab press.
      try {
        editor.focus();
        document.execCommand("insertText", false, remaining);
      } catch {
        return false;
      }

      tabProgress = null;
      render();
      return true;
    };

    const render = () => {
      if (!editor.isConnected) {
        clearAll();
        return;
      }
      container.textContent = "";
      const hasLocalCompletion = !!(localCompletion && localCompletion.completion);
      const hasAi = !!(aiSuggestion && aiSuggestion.completion);
      const tabC = getActiveTabCompletion();

      // Inline ghost trail (same line as caret)
      renderEditorInlineTrail(tabC);

      if (!hasLocalCompletion && !hasAi && !aiPending && !aiLastError) {
        container.hidden = true;
        return;
      }

      container.hidden = false;

      const label = document.createElement("span");
      label.className = "noteAutocompleteLabel";
      label.textContent = "Suggestions:";
      container.appendChild(label);

      if (aiPending) {
        const pending = document.createElement("span");
        pending.className = "noteAutocompletePending";
        pending.textContent = "AI …";
        container.appendChild(pending);
      } else if (aiLastError) {
        const pending = document.createElement("span");
        pending.className = "noteAutocompletePending";
        pending.textContent = `AI error: ${aiLastError}`;
        container.appendChild(pending);
      }

      const addBtn = (text, kind, payload) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "monoLinkButton";
        btn.textContent = text;
        btn.dataset.autocompleteKind = kind;
        if (payload) {
          for (const [k, v] of Object.entries(payload)) btn.dataset[k] = String(v);
        }
        btn.addEventListener("click", () => {
          const kind2 = btn.dataset.autocompleteKind;
          const base = btn.dataset.baseText || "";
          const completion = btn.dataset.completion || "";
          if (!completion) return;
          if (getCaretPrefixText() !== base) {
            editor.focus();
            return;
          }
          if (kind2 === "localCompletion" || kind2 === "ai") {
            try {
              tabProgress = null;
              editor.focus();
              document.execCommand("insertText", false, completion);
            } catch {
              // ignore
            }
          }
          editor.focus();
        });
        container.appendChild(btn);
      };

      if (hasLocalCompletion) {
        const baseToken = getLastToken(localCompletion.baseText);
        const preview = `${baseToken}${String(localCompletion.completion || "")}`;
        const short = preview.length > 70 ? preview.slice(0, 67) + "…" : preview;
        addBtn(`Complete: ${short}`, "localCompletion", {
          baseText: localCompletion.baseText,
          completion: localCompletion.completion
        });
      }

      if (hasAi) {
        const baseToken = getLastToken(aiSuggestion.baseText);
        const preview = `${baseToken}${String(aiSuggestion.completion || "")}`;
        const short = preview.length > 70 ? preview.slice(0, 67) + "…" : preview;
        addBtn(`AI: ${short}`, "ai", { baseText: aiSuggestion.baseText, completion: aiSuggestion.completion });
      }
    };

    const clearAi = () => {
      aiSuggestion = null;
      aiPending = false;
      aiLastError = "";
      if (aiAbort) {
        try {
          aiAbort.abort();
        } catch {
          // ignore
        }
        aiAbort = null;
      }
    };

    const clearAll = () => {
      localCompletion = null;
      clearAi();
      tabProgress = null;
      hideEditorInlineTrail();
      hide();
    };

    const scheduleRefresh = () => {
      if (!editor.isConnected) {
        if (localTimer) clearTimeout(localTimer);
        if (aiTimer) clearTimeout(aiTimer);
        localTimer = null;
        aiTimer = null;
        return;
      }
      if (localTimer) clearTimeout(localTimer);
      if (aiTimer) clearTimeout(aiTimer);

      const noteId = getNoteIdFromEditor(editor);
      if (noteId !== null && vimGetMode(noteId) !== "insert") {
        clearAll();
        return;
      }

      const value = getCaretPrefixText();
      if (tabProgress && value !== tabProgress.baseText) tabProgress = null;
      const trimmed = String(value || "").trim();
      if (!trimmed) {
        clearAll();
        return;
      }

      localTimer = setTimeout(() => {
        if (!editor.isConnected) return;
        const baseText = getCaretPrefixText();
        const dbCompletion = queryBestLocalCompletion(baseText);
        const customCompletion = findBestCustomWordCompletion(baseText);
        if (customCompletion && dbCompletion) {
          const dbLen = getLastToken(dbCompletion.baseText).length + String(dbCompletion.completion || "").length;
          const cwLen = getLastToken(customCompletion.baseText).length + String(customCompletion.completion || "").length;
          localCompletion = cwLen <= dbLen ? customCompletion : dbCompletion;
        } else {
          localCompletion = customCompletion || dbCompletion;
        }
        render();

        if (!localCompletion) {
          const { token } = getLastTokenInfo(baseText);
          if (token && token.length >= 3) {
            void ensureEnglishDictionaryLoaded()
              .then(() => {
                if (!editor.isConnected) return;
                if (getCaretPrefixText() !== baseText) return;
                if (localCompletion) return;
                const dictC = findBestDictionaryWordCompletion(baseText);
                if (!dictC) return;
                localCompletion = dictC;
                render();
              })
              .catch((err) => {
                console.error(err);
              });
          }
        }
      }, 140);

      clearAi();
      if (!aiEndpointBaseUrl) {
        render();
        return;
      }

      if (trimmed.length < 3) {
        render();
        return;
      }

      aiTimer = setTimeout(async () => {
        if (!editor.isConnected) return;
        let timedOut = false;
        let timeoutId = null;
        try {
          aiAbort = new AbortController();
          timeoutId = setTimeout(() => {
            timedOut = true;
            try {
              aiAbort.abort();
            } catch {
              // ignore
            }
          }, 12000);
          aiPending = true;
          aiLastError = "";
          render();

          // Load dictionary early so mid-word validation can reject blended junk
          // like "suggimportant" reliably (instead of only after a lazy load).
          try {
            await ensureEnglishDictionaryLoaded();
          } catch {
            // ignore
          }

          const baseText = getCaretPrefixText();
          const prompt = buildAiAutocompletePrompt(baseText);
          const raw = await fetchOllamaCompletion(aiEndpointBaseUrl, prompt, aiAbort.signal);
          if (!editor.isConnected) return;
          const c = computeAiContextCompletion(baseText, raw);
          if (!c) {
            aiSuggestion = null;
            aiPending = false;
            render();
            return;
          }

          if (getCaretPrefixText() !== baseText) return;
          if (!editor.isConnected) return;
          aiSuggestion = c;
          aiPending = false;
          render();
        } catch (err) {
          if (!editor.isConnected) return;
          if (String(err?.name || "").toLowerCase().includes("abort")) {
            aiSuggestion = null;
            aiPending = false;
            if (timedOut) aiLastError = "timeout";
            render();
            return;
          }
          const st = err && typeof err.status === "number" ? Number(err.status) : null;
          if (st === 401 || st === 403 || st === 404) console.warn(err);
          else console.error(err);
          aiSuggestion = null;
          aiPending = false;

          const msg = String(err?.message || "").trim();
          const body = typeof err?.body === "string" ? String(err.body || "") : "";
          const snippet = body ? body.replace(/\s+/g, " ").slice(0, 140) : "";

          const hint403 = st === 403 ? getOllamaOriginsHintFor403(aiEndpointBaseUrl) : "";

          if (st === 401) aiLastError = snippet ? `401 unauthorized: ${snippet}` : "401 unauthorized";
          else if (st === 403) aiLastError = (snippet ? `403 forbidden: ${snippet}` : "403 forbidden") + hint403;
          else if (st === 404) aiLastError = snippet ? `404 not found: ${snippet}` : "404 not found";
          else if (Number.isFinite(st)) aiLastError = snippet ? `${String(st)}: ${snippet}` : String(st);
          else if (msg) aiLastError = msg.slice(0, 180);
          else aiLastError = "failed";
          render();
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          aiAbort = null;
        }
      }, 450);
    };

    editor.addEventListener("input", scheduleRefresh);
    editor.addEventListener("keyup", scheduleRefresh);
    editor.addEventListener("mouseup", scheduleRefresh);

    editor.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;

      const c = getActiveTabCompletion();
      if (c && c.completion && getCaretPrefixText() === c.baseText) {
        e.preventDefault();
        applyTabProgressStep(c);
        return;
      }

      // No completion available: keep focus in the editor.
      e.preventDefault();
    });

    editor.addEventListener("blur", () => {
      setTimeout(() => {
        if (!editor.isConnected) return;
        const active = document.activeElement;
        if (active instanceof Element && container.contains(active)) return;
        hide();
        hideEditorInlineTrail();
      }, 0);
    });

    editor.addEventListener("focus", () => {
      scheduleRefresh();
    });

    editor.addEventListener("scroll", () => {
      renderEditorInlineTrail(getActiveTabCompletion());
    });

    window.addEventListener("resize", () => {
      if (!editor.isConnected) return;
      renderEditorInlineTrail(getActiveTabCompletion());
    });
  }

  async function persist() {
    const bytes = db.export();
    await saveDbBytes(bytes);
  }

  function setNotesEditorOpen(
    noteId,
    open,
    { focusEditor, focusToggleOnClose } = { focusEditor: true, focusToggleOnClose: true }
  ) {
    if (!Number.isFinite(noteId)) return;
    const card = document.querySelector(`.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`);
    if (!(card instanceof HTMLElement)) return;
    const editorWrap = card.querySelector(".noteEditor");
    if (!(editorWrap instanceof HTMLElement)) return;

    editorWrap.hidden = !open;
    if (open) openNoteEditorIds.add(noteId);
    else openNoteEditorIds.delete(noteId);
    card.classList.toggle("is-notes-open", !!open);
    requestAnimationFrame(() => morphCardHeight(card));

    // Pending cards are draggable for reordering, except when the rich editor is open.
    const status = card.dataset.status;
    card.draggable = status === "pending" && !open;

    if (!open) {
      const editor = card.querySelector(".noteEditorArea");
      const face = card.querySelector(".noteFace:not(.noteBack)");
      const existingPreview = card.querySelector(".noteNotesPreview");
      const previewText =
        editor instanceof HTMLElement ? getNoteNotesPreviewText(editor.innerHTML) : "";
      if (previewText) {
        const preview =
          existingPreview instanceof HTMLElement
            ? existingPreview
            : createNoteNotesPreviewElement(previewText);
        const previewBody = preview.querySelector(".noteNotesPreview__body");
        if (previewBody instanceof HTMLElement) {
          previewBody.textContent = previewText;
          previewBody.title = previewText;
        }
        if (!existingPreview && face instanceof HTMLElement) {
          const attachments = face.querySelector(".noteAttachments");
          const editorNode = face.querySelector(".noteEditor");
          face.insertBefore(preview, attachments || editorNode || null);
        }
      } else if (existingPreview instanceof HTMLElement) {
        existingPreview.remove();
      }
      if (lastFocusedNoteEditor instanceof HTMLElement) {
        const focusedId = getNoteIdFromEditor(lastFocusedNoteEditor);
        if (focusedId === noteId) lastFocusedNoteEditor = null;
      }
      if (focusToggleOnClose) {
        const notesBtn = card.querySelector("button[data-action='toggleNotes']");
        if (notesBtn instanceof HTMLElement) notesBtn.focus();
      }
      if (
        openNoteEditorIds.size === 0 &&
        String(gObsidianVaultName || "").trim() &&
        gObsidianSyncMode &&
        gObsidianVaultFolderLinked
      ) {
        void scanObsidianVaultVsDbNotes();
      }
      return;
    }

    if (focusEditor) {
      const focusEditorNow = () => {
        const liveCard = document.querySelector(`.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`);
        const editor = liveCard instanceof HTMLElement ? liveCard.querySelector(".noteEditorArea") : null;
        if (editor instanceof HTMLElement && openNoteEditorIds.has(noteId)) editor.focus();
      };
      focusEditorNow();
      requestAnimationFrame(() => focusEditorNow());
    }

    keepCardInView(card);
  }

  function closeNotesEditorFromCommand(noteId, closeOpts = {}) {
    if (!Number.isFinite(noteId)) return;
    setNotesEditorOpen(noteId, false, closeOpts);
    void flushPendingNotesEditorSave(noteId, { forceVaultPush: true }).catch((err) => {
      console.warn("Obsidian: could not push notes after :x", err);
    });
  }

  function closeCardOverlays(card) {
    if (!(card instanceof HTMLElement)) return;
    const noteId = getNoteIdFromCardElement(card);
    if (noteId === null) return;

    if (openNoteEditorIds.has(noteId)) {
      setNotesEditorOpen(noteId, false, { focusEditor: false, focusToggleOnClose: false });
    } else {
      const wrap = card.querySelector(".noteEditor");
      if (wrap instanceof HTMLElement) wrap.hidden = true;
    }

    if (card.classList.contains("is-flipped") || flippedNoteIds.has(noteId)) {
      card.classList.remove("is-flipped");
      flippedNoteIds.delete(noteId);
    }

    requestAnimationFrame(() => morphCardHeight(card));
  }

  function exportDbFile() {
    const bytes = db.export();
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    a.href = url;
    a.download = `notes-kanban-${yyyy}-${mm}-${dd}.sqlite`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // Initial paint + persistence (in case schema was created)
  await persist();
  await reloadObsidianVaultHandleFromStorage();
  setActiveTabUi(activeBoard);
  await refresh();
  updateCardFilterVisibility();
  if (String(gObsidianVaultName || "").trim()) void scanObsidianVaultVsDbNotes();

  if (cardFilterInput instanceof HTMLInputElement) {
    cardFilterInput.addEventListener("input", () => {
      cardFilterQuery = cardFilterInput.value.trim();
      updateCardFilterVisibility();
      void refresh();
    });

    cardFilterInput.addEventListener("blur", () => {
      if (!cardFilterQuery) updateCardFilterVisibility();
    });

    cardFilterInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const draft = cardFilterInput.value.trim();
        if (!draft) return;
        e.preventDefault();
        openAddTaskModalWithPrefill(draft, { clearSearchOnSubmit: true });
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      cardFilterInput.value = "";
      cardFilterQuery = "";
      updateCardFilterVisibility();
      void refresh();
      if (addNoteButton instanceof HTMLElement) safeFocus(addNoteButton);
    });
  }

  function setAddNoteModalVisible(visible) {
    if (!(addNoteModal instanceof HTMLElement)) return;
    const show = visible === true;
    addNoteModal.hidden = !show;
    addNoteModal.setAttribute("aria-hidden", String(!show));
    if (show) {
      const noteText = document.getElementById("noteText");
      if (noteText instanceof HTMLElement) safeFocus(noteText);
    } else if (addNoteButton instanceof HTMLElement) {
      safeFocus(addNoteButton);
    }
  }

  function openAddTaskModalWithPrefill(prefillText = "", options = {}) {
    const { clearSearchOnSubmit = false } = options || {};
    const noteText = document.getElementById("noteText");
    pendingSearchTaskDraft = clearSearchOnSubmit ? String(prefillText || "").trim() : "";
    setAddNoteModalVisible(true);
    if (!(noteText instanceof HTMLInputElement)) return;
    noteText.value = String(prefillText || "");
    clearNewNoteAutocomplete();
    safeFocus(noteText);
    try {
      const len = noteText.value.length;
      noteText.setSelectionRange(len, len);
    } catch {
      // Ignore browsers that do not support input selection here.
    }
  }

  async function submitNewNote({ clearSearchDraftOnSuccess = false } = {}) {
    const input = el("noteText");
    const dueInput = document.getElementById("noteDueDate");
    const text = input.value.trim();
    if (!text) return false;

    let dueAt = null;
    if (dueInput instanceof HTMLInputElement && dueInput.value) {
      const dateStr = dueInput.value;
      const d = new Date(dateStr + "T00:00:00Z");
      if (Number.isFinite(d.getTime())) dueAt = d.getTime();
    }

    insertNote(db, activeBoard, text, dueAt);
    input.value = "";
    if (dueInput instanceof HTMLInputElement) dueInput.value = "";
    clearNewNoteAutocomplete();

    if (clearSearchDraftOnSuccess) {
      pendingSearchTaskDraft = "";
      if (cardFilterInput instanceof HTMLInputElement) cardFilterInput.value = "";
      cardFilterQuery = "";
      updateCardFilterVisibility();
    }

    await persist();
    await refresh();
    setAddNoteModalVisible(false);
    return true;
  }

  if (addNoteButton instanceof HTMLButtonElement) {
    addNoteButton.addEventListener("click", () => openAddTaskModalWithPrefill(""));
  }
  if (closeAddNoteModal instanceof HTMLButtonElement) {
    closeAddNoteModal.addEventListener("click", () => setAddNoteModalVisible(false));
  }
  if (addNoteModal instanceof HTMLElement) {
    addNoteModal.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.closest("[data-add-note-close='true']")) setAddNoteModalVisible(false);
    });
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (!(addNoteModal instanceof HTMLElement) || addNoteModal.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setAddNoteModalVisible(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = addNoteModal.querySelector(".addNoteModalPanel");
      if (!(panel instanceof HTMLElement)) return;
      const focusables = [...panel.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")]
        .filter((node) => node instanceof HTMLElement && isElementInVisibleView(node));
      if (!focusables.length) return;
      const currentIndex = focusables.indexOf(document.activeElement);
      const nextIndex = e.shiftKey
        ? currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1
        : currentIndex >= focusables.length - 1 ? 0 : currentIndex + 1;
      e.preventDefault();
      safeFocus(focusables[nextIndex]);
    },
    true
  );

  // Keep the left header controls vertically paired with search, even when a
  // control (such as the theme select) has its own key handling.
  window.addEventListener(
    "keydown",
    (e) => {
      const nav = getNavKeys(keyLayout);
      if (!modKeyOnly(e) || e.key !== nav.down) return;
      const active = document.activeElement;
      const isSearchHeaderControl =
        active === document.getElementById("themeSelect") ||
        active === document.getElementById("instructionsLink") ||
        active === document.getElementById("aboutLink");
      const notesVisible = notesView instanceof HTMLElement && !notesView.hasAttribute("hidden");
      if (!isSearchHeaderControl || !notesVisible || !(cardFilterInput instanceof HTMLElement)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      safeFocus(cardFilterInput);
    },
    true
  );

  // Initial focus stays on the notes toolbar so the primary surface is immediately available.
  // Linux Chrome often defers popup focus; rAF + delayed retries + keydown/focus fallbacks match Windows behavior.
  function hasMeaningfulPopupFocus() {
    const active = document.activeElement;
    return !!(
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      active instanceof HTMLElement
    );
  }

  function focusEmbeddedAppWindow() {
    try {
      window.focus();
    } catch {
      // ignore
    }
  }

  function focusInitialBoardTabIfNeeded() {
    try {
      if (hasMeaningfulPopupFocus()) return;

      // When opened inside an iframe (page overlay), Linux window managers / Chrome often
      // leave the parent focused; window.focus() claims the iframe browsing context so
      // keyboard events and programmatic .focus() behave like on Windows.
      focusEmbeddedAppWindow();

      const notesViewEl = document.getElementById("notesView");
      if (!(notesViewEl instanceof HTMLElement) || notesViewEl.hasAttribute("hidden")) return;

      const t = cardFilterInput;
      if (!(t instanceof HTMLElement)) return;

      try {
        t.focus({ preventScroll: true });
      } catch {
        t.focus();
      }
    } catch {
      // ignore
    }
  }

  function scheduleInitialBoardTabFocus() {
    const run = () => focusInitialBoardTabIfNeeded();
    focusEmbeddedAppWindow();
    setTimeout(run, 0);
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    setTimeout(run, 50);
    setTimeout(run, 120);
    setTimeout(run, 280);
    setTimeout(run, 450);
    setTimeout(run, 700);
  }

  scheduleInitialBoardTabFocus();

  window.addEventListener(
    "focus",
    () => {
      focusInitialBoardTabIfNeeded();
    },
    true
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") focusInitialBoardTabIfNeeded();
  });

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.defaultPrevented) return;
      const notesViewEl = document.getElementById("notesView");
      if (!(notesViewEl instanceof HTMLElement) || notesViewEl.hasAttribute("hidden")) return;
      if (hasMeaningfulPopupFocus()) return;
      focusInitialBoardTabIfNeeded();
    },
    true
  );

  // Instructions view toggle
  if (instructionsLink instanceof HTMLElement) {
    instructionsLink.addEventListener("click", (e) => {
      e.preventDefault();
      renderInstructions();
      showInstructionsView();
      const firstInstruction = getInstructionsFocusables()[1] || closeInstructionsBtn;
      if (firstInstruction instanceof HTMLElement) safeFocus(firstInstruction);
    });
  }
  if (aboutLink instanceof HTMLElement) {
    aboutLink.addEventListener("click", (e) => {
      e.preventDefault();
      showAboutView();
      const firstAbout = getAboutFocusables()[1] || closeAboutBtn;
      if (firstAbout instanceof HTMLElement) safeFocus(firstAbout);
    });
  }
  if (tourBtn instanceof HTMLElement) {
    tourBtn.addEventListener("click", (e) => {
      e.preventDefault();
      startGuidedTour();
    });
  }
  if (guidedTourBack instanceof HTMLButtonElement) {
    guidedTourBack.addEventListener("click", () => {
      if (!guidedTourActive) return;
      guidedTourIndex = Math.max(0, guidedTourIndex - 1);
      renderGuidedTourStep();
    });
  }
  if (guidedTourNext instanceof HTMLButtonElement) {
    guidedTourNext.addEventListener("click", () => {
      if (!guidedTourActive) return;
      if (guidedTourIndex >= TOUR_STEPS.length - 1) {
        closeGuidedTour({ restoreFocus: true });
        return;
      }
      guidedTourIndex += 1;
      renderGuidedTourStep();
    });
  }
  if (guidedTourSkip instanceof HTMLButtonElement) {
    guidedTourSkip.addEventListener("click", () => {
      closeGuidedTour({ restoreFocus: true });
    });
  }
  if (guidedTour instanceof HTMLElement) {
    guidedTour.addEventListener("keydown", (e) => {
      if (!guidedTourActive) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeGuidedTour({ restoreFocus: true });
      }
    });
  }
  window.addEventListener("resize", () => {
    if (guidedTourActive) updateGuidedTourSpotlight();
  });
  document.addEventListener(
    "scroll",
    () => {
      if (guidedTourActive) updateGuidedTourSpotlight();
    },
    true
  );
	  document.addEventListener(
	    "keydown",
	    (e) => {
      if (!guidedTourActive) return;
      const key = (e.key || "").toLowerCase();
      const nav = getNavKeys(keyLayout);
      if (key === "escape" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeGuidedTour({ restoreFocus: true });
        return;
      }
      if (modKeyOnly(e)) {
        if (key === nav.right || key === nav.down) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (guidedTourNext instanceof HTMLButtonElement) guidedTourNext.click();
          return;
        }
        if (key === nav.left || key === nav.up) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (guidedTourBack instanceof HTMLButtonElement && !guidedTourBack.disabled) {
            guidedTourBack.click();
          }
        }
      }
    },
	    true
	  );
	  document.addEventListener(
	    "keydown",
	    (e) => {
	      if (!(dashboardView instanceof HTMLElement) || dashboardView.hidden) return;
	      if (e.ctrlKey || e.metaKey || e.altKey) return;
	      if (e.target instanceof Element && isEditableElement(e.target)) return;
	      if (activateDashboardFilterKey(e.key, true)) {
	        e.preventDefault();
	        e.stopPropagation();
	        e.stopImmediatePropagation();
	      }
	    },
	    true
	  );

	  if (dbGetAppSettingString(APP_SETTING_TOUR_SEEN) !== "1") {
    setTimeout(() => {
      if (!guidedTourActive) startGuidedTour({ markSeen: true });
    }, 80);
  }

  function populateAiSettingsStaticHints() {
    const extId = chrome.runtime?.id || "";
    const extOriginEl = document.getElementById("aiSettingsExtensionOrigin");
    if (extOriginEl instanceof HTMLElement && extId) {
      extOriginEl.textContent = `chrome-extension://${extId}`;
    }
    const curlEl = document.getElementById("aiSettingsCurlTest");
    if (curlEl instanceof HTMLElement && extId) {
      curlEl.textContent = `curl -H "Origin: chrome-extension://${extId}" http://localhost:11434/api/tags`;
    }
  }

  function syncAiSettingsFormFieldsFromGlobals() {
    populateAiSettingsStaticHints();
    if (aiEndpointBaseUrlInput instanceof HTMLInputElement) {
      aiEndpointBaseUrlInput.value = aiEndpointBaseUrl || "";
    }
    if (aiCustomWordsInput instanceof HTMLTextAreaElement) {
      aiCustomWordsInput.value = Array.isArray(aiCustomWords) ? aiCustomWords.join("\n") : "";
      queueAutosizeTextarea(aiCustomWordsInput);
    }
    if (aiEndpointModelInput instanceof HTMLInputElement) {
      aiEndpointModelInput.value = aiEndpointModel || "";
    }
    queueAiSettingsHealthCheck({ delayMs: 0 });
  }

  function syncObsidianSettingsFormFieldsFromGlobals() {
    if (obsidianVaultNameInput instanceof HTMLInputElement) {
      obsidianVaultNameInput.value = gObsidianVaultName || "";
    }
    if (obsidianNotesFolderInput instanceof HTMLInputElement) {
      obsidianNotesFolderInput.value = gObsidianNotesFolder || "";
    }
    const syncEl = document.getElementById("obsidianSyncMode");
    if (syncEl instanceof HTMLInputElement) syncEl.checked = gObsidianSyncMode;
    setObsidianVaultFolderStatusUi();
  }

  function focusMainBoardSwitcherTab() {
    const activeTab = document.querySelector("#boardTabs [role='tab'][aria-selected='true']");
    const firstTab = document.querySelector("#boardTabs .bx--tabs__nav-link");
    const t = activeTab instanceof HTMLElement ? activeTab : firstTab;
    if (t instanceof HTMLElement && safeFocus(t)) return;
    if (addNoteButton instanceof HTMLElement) safeFocus(addNoteButton);
  }

  function moveBoardTabFocus(delta) {
    const currentIndex = boards.indexOf(activeBoard);
    if (currentIndex < 0) return false;
    const nextIndex = Math.min(boards.length - 1, Math.max(0, currentIndex + delta));
    const nextBoard = boards[nextIndex];
    if (!nextBoard) return false;

    if (nextBoard === activeBoard) {
      const currentTab = document.querySelector(
        `#boardTabs [role='tab'][data-board="${CSS.escape(String(activeBoard))}"]`
      );
      return currentTab instanceof HTMLElement ? safeFocus(currentTab) : false;
    }

    void activateBoard(nextBoard, { persistSelection: true, focusBoardTab: true });
    return true;
  }

  function openSettingsBoardsManagePanel() {
    setAiSettingsMessage("");
    setManageTabsMessage("");
    showSettingsView("boards");
    renderManageTabs();
    requestAnimationFrame(() => {
      if (settingsTabBoards instanceof HTMLElement) safeFocus(settingsTabBoards);
      else if (addTabName instanceof HTMLElement) addTabName.focus();
      else if (closeSettingsBtn instanceof HTMLElement) closeSettingsBtn.focus();
    });
  }

  function openSettingsToAiPanel() {
    setAiSettingsMessage("");
    showSettingsView("ai");
    if (aiEndpointBaseUrlInput instanceof HTMLInputElement) {
      syncAiSettingsFormFieldsFromGlobals();
      commitAiSettingsSavedSnapshot();
      aiEndpointBaseUrlInput.focus();
      try {
        aiEndpointBaseUrlInput.select();
      } catch {
        // ignore
      }
    } else if (closeSettingsBtn instanceof HTMLElement) {
      closeSettingsBtn.focus();
    }
  }

  function activateSettingsSidebarTab(tab) {
    if (!(tab instanceof HTMLElement)) return false;
    switch (tab.id) {
      case "settingsTabBoards":
        setAiSettingsMessage("");
        setManageTabsMessage("");
        setSettingsSection("boards");
        renderManageTabs();
        return true;
      case "settingsTabAppearance":
        setSettingsSection("appearance");
        applyTheme(theme);
        applyPopupSize(popupSize);
        return true;
      case "settingsTabData":
        setSettingsSection("data");
        return true;
      case "settingsTabAi":
        setAiSettingsMessage("");
        setSettingsSection("ai");
        syncAiSettingsFormFieldsFromGlobals();
        commitAiSettingsSavedSnapshot();
        return true;
      case "settingsTabObsidian":
        setSettingsSection("obsidian");
        syncObsidianSettingsFormFieldsFromGlobals();
        commitObsidianSettingsSavedSnapshot();
        return true;
      case "settingsTabKeyboard":
        setSettingsSection("keyboard");
        updateKeyboardSettingsUi();
        return true;
      default:
        return false;
    }
  }

  if (settingsBtn instanceof HTMLElement) {
    settingsBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openSettingsBoardsManagePanel();
    });
  }

  if (settingsTabBoards instanceof HTMLElement) {
    settingsTabBoards.addEventListener("click", () => {
      openSettingsBoardsManagePanel();
    });
  }
  if (settingsTabAppearance instanceof HTMLElement) {
    settingsTabAppearance.addEventListener("click", () => {
      setSettingsSection("appearance");
      if (settingsThemeSelect instanceof HTMLElement) settingsThemeSelect.focus();
    });
  }
  if (settingsTabData instanceof HTMLElement) {
    settingsTabData.addEventListener("click", () => {
      setSettingsSection("data");
      const exportDbBtn = document.getElementById("exportDbBtn");
      if (exportDbBtn instanceof HTMLElement) exportDbBtn.focus();
    });
  }

  if (settingsTabAi instanceof HTMLElement) {
    settingsTabAi.addEventListener("click", () => {
      openSettingsToAiPanel();
    });
  }
	  if (settingsTabObsidian instanceof HTMLElement) {
	    settingsTabObsidian.addEventListener("click", () => {
	      setSettingsSection("obsidian");
	      syncObsidianSettingsFormFieldsFromGlobals();
	      commitObsidianSettingsSavedSnapshot();
	      if (obsidianVaultNameInput instanceof HTMLElement) obsidianVaultNameInput.focus();
	    });
	  }
	  if (obsidianVaultNameInput instanceof HTMLInputElement) {
	    obsidianVaultNameInput.addEventListener("input", () => {
	      setObsidianVaultFolderStatusUi();
	      updateObsidianSettingsDirtyUi();
	    });
	  }
	  if (obsidianNotesFolderInput instanceof HTMLInputElement) {
	    obsidianNotesFolderInput.addEventListener("input", () => {
	      updateObsidianSettingsDirtyUi();
	    });
	  }
	  const obsidianSyncModeInput = document.getElementById("obsidianSyncMode");
	  if (obsidianSyncModeInput instanceof HTMLInputElement) {
	    obsidianSyncModeInput.addEventListener("change", () => {
	      updateObsidianSettingsDirtyUi();
	    });
	  }
  if (settingsTabKeyboard instanceof HTMLElement) {
    settingsTabKeyboard.addEventListener("click", () => {
      setSettingsSection("keyboard");
      updateKeyboardSettingsUi();
      const pwin = document.getElementById("keyboardNavPlatformWinlinux");
      if (pwin instanceof HTMLElement) pwin.focus();
      else {
        const qw = document.getElementById("keyLayoutQwerty");
        if (qw instanceof HTMLElement) qw.focus();
      }
    });
  }
  const dashboardBtn = document.getElementById("dashboardBtn");
  if (dashboardBtn instanceof HTMLElement) {
    dashboardBtn.addEventListener("click", (e) => {
      e.preventDefault();
      renderDashboard();
      showDashboardView();
      if (closeDashboardBtn instanceof HTMLElement) closeDashboardBtn.focus();
    });
  }
  const calendarBtn = document.getElementById("calendarBtn");
  if (calendarBtn instanceof HTMLElement) {
    calendarBtn.addEventListener("click", (e) => {
      e.preventDefault();
      renderCalendar();
      showCalendarView();
      if (closeCalendarBtn instanceof HTMLElement) closeCalendarBtn.focus();
    });
  }
  function setCreateDueDateQuickValue(kind) {
    const dueInput = document.getElementById("noteDueDate");
    if (!(dueInput instanceof HTMLInputElement)) return false;
    const now = new Date();
    let target = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (kind === "1w") target.setDate(target.getDate() + 7);
    else if (kind === "2w") target.setDate(target.getDate() + 14);
    else if (kind === "1mo") target = addCalendarMonthsClamped(target, 1);
    else if (kind !== "today") return false;
    dueInput.value = dateToDateInputValue(target);
    dueInput.dispatchEvent(new Event("input", { bubbles: true }));
    dueInput.dispatchEvent(new Event("change", { bubbles: true }));
    safeFocus(dueInput);
    setCreateDueQuickVisible(false);
    return true;
  }
  setCreateDueQuickVisible(false);
  document.addEventListener(
    "focusin",
    () => {
      const active = document.activeElement;
      if (active instanceof Element && active.closest("#createForm .createDueQuickActions") !== null) return;
      setCreateDueQuickVisible(false);
    },
    true
  );
  document.querySelectorAll("[data-due-quick]").forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      setCreateDueDateQuickValue(btn.dataset.dueQuick || "");
    });
  });
  if (closeInstructionsBtn instanceof HTMLElement) {
    closeInstructionsBtn.addEventListener("click", () => {
      showNotesView();
      if (addNoteButton instanceof HTMLElement) safeFocus(addNoteButton);
    });
  }
  if (closeAboutBtn instanceof HTMLElement) {
    closeAboutBtn.addEventListener("click", () => {
      showNotesView();
      if (addNoteButton instanceof HTMLElement) safeFocus(addNoteButton);
    });
  }
  if (closeSettingsBtn instanceof HTMLElement) {
    closeSettingsBtn.addEventListener("click", () => {
      showNotesView();
      if (addNoteButton instanceof HTMLElement) safeFocus(addNoteButton);
    });
  }

  if (aiEndpointBaseUrlInput instanceof HTMLInputElement) {
    aiEndpointBaseUrlInput.addEventListener("input", () => {
      queueAiSettingsHealthCheck({ delayMs: 450 });
      updateAiSettingsDirtyUi();
    });
    aiEndpointBaseUrlInput.addEventListener("blur", () => {
      queueAiSettingsHealthCheck({ delayMs: 0 });
    });
  }
  if (aiEndpointModelInput instanceof HTMLInputElement) {
    aiEndpointModelInput.addEventListener("input", () => {
      queueAiSettingsHealthCheck({ delayMs: 450 });
      updateAiSettingsDirtyUi();
    });
    aiEndpointModelInput.addEventListener("blur", () => {
      queueAiSettingsHealthCheck({ delayMs: 0 });
    });
  }
  if (closeDashboardBtn instanceof HTMLElement) {
    closeDashboardBtn.addEventListener("click", () => {
      showNotesView();
      const input = document.getElementById("noteText");
      if (input instanceof HTMLElement) input.focus();
    });
  }
  if (closeCalendarBtn instanceof HTMLElement) {
    closeCalendarBtn.addEventListener("click", () => {
      showNotesView();
      const dashboardBtn = document.getElementById("dashboardBtn");
      if (dashboardBtn instanceof HTMLElement) dashboardBtn.focus();
    });
  }

  if (aiSettingsForm instanceof HTMLFormElement) {
    aiSettingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setAiSettingsMessage("");
      const raw = aiEndpointBaseUrlInput instanceof HTMLInputElement ? aiEndpointBaseUrlInput.value : "";
      const normalized = normalizeEndpointBaseUrl(raw);
      if (normalized === null) {
        setAiSettingsMessage("Please enter a valid http(s) URL (or leave empty to disable). ");
        queueAiSettingsHealthCheck({ delayMs: 0 });
        return;
      }

      const rawWords = aiCustomWordsInput instanceof HTMLTextAreaElement ? aiCustomWordsInput.value : "";
      const parsed = parseCustomWords(rawWords);
      if (parsed.invalid.length) {
        setAiSettingsMessage(
          `Some custom words were ignored (must be a single word/acronym; letters/digits/hyphens/underscores; no spaces): ${parsed.invalid.join(", ")}`
        );
      }

      const modelRaw = aiEndpointModelInput instanceof HTMLInputElement ? aiEndpointModelInput.value : "";
      const modelName = String(modelRaw || "").trim();

      if (normalized && isExternalAiHost(normalized)) {
        const origin = getOriginForPermission(normalized);
        if (origin && chrome.permissions) {
          try {
            const granted = await chrome.permissions.request({ origins: [origin] });
            if (!granted) {
              setAiSettingsMessage(
                "Permission denied for external host. The extension cannot reach the AI server." +
                  " Grant it in chrome://extensions (Details → Site access) or leave empty to disable."
              );
              return;
            }
          } catch (err) {
            setAiSettingsMessage(
              `Could not request permission for ${normalized}: ${err instanceof Error ? err.message : String(err)}`
            );
            return;
          }
        }
      }

      try {
        aiEndpointBaseUrl = await saveAiEndpointBaseUrl(normalized);
        aiCustomWords = await saveAiCustomWords(parsed.valid);
        aiEndpointModel = modelName;

        // Reset cached model so subsequent requests use the new selection (or re-fetch default).
        ollamaModel = aiEndpointModel || null;

        // Persist into the SQLite DB so settings travel with DB export/import.
        try {
          dbSetAppSettingString(APP_SETTING_AI_ENDPOINT_BASE_URL, aiEndpointBaseUrl || "");
          dbSetAppSettingString(APP_SETTING_AI_ENDPOINT_MODEL, aiEndpointModel || "");
          dbSetAppSettingString(
            APP_SETTING_AI_CUSTOM_WORDS_JSON,
            Array.isArray(aiCustomWords) && aiCustomWords.length ? JSON.stringify(aiCustomWords) : ""
          );
          await persist();
        } catch (err) {
          console.error(err);
        }

        if (aiCustomWordsInput instanceof HTMLTextAreaElement) {
          queueAutosizeTextarea(aiCustomWordsInput);
        }

        if (aiEndpointBaseUrl) {
          setAiSettingsMessage(
            `Saved. Model: ${aiEndpointModel || "auto"}. Custom words: ${Array.isArray(aiCustomWords) ? aiCustomWords.length : 0}.`
          );
        } else {
          setAiSettingsMessage(
            `AI disabled. Model: ${aiEndpointModel || "auto"}. Custom words: ${Array.isArray(aiCustomWords) ? aiCustomWords.length : 0}.`
          );
        }

        queueAiSettingsHealthCheck({ delayMs: 0 });
        commitAiSettingsSavedSnapshot();
      } catch (err) {
        console.error(err);
        setAiSettingsMessage("Could not save settings.");
        queueAiSettingsHealthCheck({ delayMs: 0 });
      }
    });
  }

  function setObsidianSettingsMessage(text) {
    if (obsidianSettingsMessage instanceof HTMLElement) obsidianSettingsMessage.textContent = text || "";
  }

  if (obsidianSettingsForm instanceof HTMLFormElement) {
    obsidianSettingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setObsidianSettingsMessage("");
      const v =
        obsidianVaultNameInput instanceof HTMLInputElement ? obsidianVaultNameInput.value.trim() : "";
      const f =
        obsidianNotesFolderInput instanceof HTMLInputElement ? obsidianNotesFolderInput.value.trim() : "";
      gObsidianVaultName = v;
      gObsidianNotesFolder = f.replace(/^\/+|\/+$/g, "");
      const syncEl = document.getElementById("obsidianSyncMode");
      gObsidianSyncMode = syncEl instanceof HTMLInputElement && syncEl.checked;
      try {
        dbSetAppSettingString(APP_SETTING_OBSIDIAN_VAULT_NAME, gObsidianVaultName);
	        dbSetAppSettingString(APP_SETTING_OBSIDIAN_NOTES_FOLDER, gObsidianNotesFolder);
	        dbSetAppSettingString(APP_SETTING_OBSIDIAN_SYNC_MODE, gObsidianSyncMode ? "1" : "");
	        await persist();
	        setObsidianVaultFolderStatusUi();
	        setObsidianSettingsMessage("Saved.");
	        commitObsidianSettingsSavedSnapshot();
	        await refresh();
        if (String(gObsidianVaultName || "").trim()) void scanObsidianVaultVsDbNotes();
      } catch (err) {
        console.error(err);
        setObsidianSettingsMessage("Could not save Obsidian settings.");
      }
    });
  }

  const obsidianChooseVaultFolderBtn = document.getElementById("obsidianChooseVaultFolderBtn");
  if (obsidianChooseVaultFolderBtn instanceof HTMLElement) {
    obsidianChooseVaultFolderBtn.addEventListener("click", async () => {
      setObsidianSettingsMessage("");
      try {
        if (!chrome?.runtime?.getURL || !chrome.tabs?.create) {
          setObsidianSettingsMessage("Could not open folder picker tab (extension APIs missing).");
          return;
        }
        const url = chrome.runtime.getURL("pick-vault.html");
        await chrome.tabs.create({ url, active: true });
        setObsidianSettingsMessage(
          "Opened a tab to choose your vault folder (the popup cannot use the folder picker). Click “Choose folder…” there, then return here."
        );
      } catch (err) {
        console.error("Obsidian vault link tab failed:", err);
        const detail =
          err instanceof Error
            ? err.message || err.name
            : typeof err === "string"
              ? err
              : "unknown error";
        setObsidianSettingsMessage(`Could not open folder tab: ${String(detail).slice(0, 220)}`);
      }
    });
  }

  const obsidianGrantVaultAccessBtn = document.getElementById("obsidianGrantVaultAccessBtn");
  if (obsidianGrantVaultAccessBtn instanceof HTMLElement) {
    obsidianGrantVaultAccessBtn.addEventListener("click", async () => {
      setObsidianSettingsMessage("");
      try {
        if (!chrome?.runtime?.getURL || !chrome.tabs?.create) {
          setObsidianSettingsMessage("Could not open grant tab (extension APIs missing).");
          return;
        }
        const url = chrome.runtime.getURL("grant-vault-access.html");
        await chrome.tabs.create({ url, active: true });
        setObsidianSettingsMessage(
          "Opened a tab to grant folder access (Chromium blocks this inside the popup). Click “Allow access to linked folder” there, then return here."
        );
      } catch (err) {
        console.error("Obsidian grant vault access tab:", err);
        const detail = err instanceof Error ? err.message || err.name : String(err);
        setObsidianSettingsMessage(`Could not open tab: ${String(detail).slice(0, 220)}`);
      }
    });
  }

  try {
    const obsidianVaultBc = new BroadcastChannel("vim-todo-obsidian-vault");
    obsidianVaultBc.onmessage = (ev) => {
      if (ev?.data?.type === "permission-granted") {
        void (async () => {
          try {
            await reloadObsidianVaultHandleFromStorage();
            gObsidianVaultFolderLinked = !!obsidianVaultRootHandle;
            setObsidianVaultFolderStatusUi();
            setObsidianSettingsMessage("Vault folder access granted. Refreshing badges…");
            await refresh();
            if (String(gObsidianVaultName || "").trim()) void scanObsidianVaultVsDbNotes();
          } catch (e) {
            console.error(e);
          }
        })();
        return;
      }
      if (ev?.data?.type !== "linked") return;
      void (async () => {
        try {
          let filledVaultFromFolder = false;
          const suggested =
            typeof ev.data?.folderName === "string" ? ev.data.folderName.trim() : "";
          if (suggested) {
            const prev = String(gObsidianVaultName || "").trim();
            const inputEl = document.getElementById("obsidianVaultName");
            const inputEmpty =
              !(inputEl instanceof HTMLInputElement) || !String(inputEl.value || "").trim();
            if (!prev || inputEmpty) {
              gObsidianVaultName = suggested;
              if (inputEl instanceof HTMLInputElement) inputEl.value = suggested;
              try {
                dbSetAppSettingString(APP_SETTING_OBSIDIAN_VAULT_NAME, gObsidianVaultName);
              } catch {
                // ignore
              }
              filledVaultFromFolder = true;
            }
          }

          gObsidianSyncMode = true;
          try {
            dbSetAppSettingString(APP_SETTING_OBSIDIAN_SYNC_MODE, "1");
          } catch {
            // ignore
          }
          const syncEl = document.getElementById("obsidianSyncMode");
          if (syncEl instanceof HTMLInputElement) syncEl.checked = true;

          obsidianVaultRootHandle =
            obsidianVaultIdb() && typeof obsidianVaultIdb().loadVaultHandle === "function"
              ? await obsidianVaultIdb().loadVaultHandle()
              : null;
          gObsidianVaultFolderLinked = !!obsidianVaultRootHandle;
          setObsidianVaultFolderStatusUi();
          setObsidianSettingsMessage(
            filledVaultFromFolder
              ? `Vault name set to “${suggested}” from the selected folder (edit if Obsidian shows something different). Vault folder linked and sync mode turned on. Use “Grant folder access…” if badges still ask for permission, then Obsidian on a card to merge.`
              : "Vault folder linked and sync mode turned on. Use “Grant folder access…” if badges still ask for permission, then Obsidian on a card to merge."
          );
          await persist();
          await refresh();
          if (String(gObsidianVaultName || "").trim()) void scanObsidianVaultVsDbNotes();
          syncObsidianSettingsFormFieldsFromGlobals();
          commitObsidianSettingsSavedSnapshot();
        } catch (e) {
          console.error(e);
        }
      })();
    };
  } catch {
    // BroadcastChannel unavailable
  }

	  const obsidianClearVaultFolderBtn = document.getElementById("obsidianClearVaultFolderBtn");
	  if (obsidianClearVaultFolderBtn instanceof HTMLElement) {
	    obsidianClearVaultFolderBtn.addEventListener("click", async () => {
	      try {
	        if (!window.confirm("Disconnect the linked vault folder? Sync mode and vault name stay saved.")) {
	          return;
	        }
	        if (obsidianVaultIdb() && typeof obsidianVaultIdb().clearVaultHandle === "function") {
	          await obsidianVaultIdb().clearVaultHandle();
	        }
        obsidianVaultRootHandle = null;
        gObsidianVaultFolderLinked = false;
        setObsidianVaultFolderStatusUi();
        setObsidianSettingsMessage("Vault folder disconnected.");
        await refresh();
        if (String(gObsidianVaultName || "").trim()) void scanObsidianVaultVsDbNotes();
      } catch (err) {
        console.error(err);
        setObsidianSettingsMessage("Could not disconnect folder.");
      }
    });
  }

  const clearObsidianPathCacheBtn = document.getElementById("clearObsidianPathCacheBtn");
  if (clearObsidianPathCacheBtn instanceof HTMLElement) {
    clearObsidianPathCacheBtn.addEventListener("click", () => {
      clearObsidianCreatedPathCache();
      setObsidianSettingsMessage('Cleared “first open” cache. Next Obsidian click will create the file if missing.');
    });
  }

  async function persistBoardOrder(orderedBoards) {
    const list = Array.isArray(orderedBoards) ? orderedBoards.filter(Boolean) : [];
    if (!list.length) return;

    try {
      db.run("BEGIN");
      const stmt = db.prepare("UPDATE boards SET sort_order = ? WHERE name = ?");
      try {
        for (let i = 0; i < list.length; i++) {
          stmt.run([i, String(list[i])]);
        }
      } finally {
        stmt.free();
        db.run("COMMIT");
      }
    } catch (err) {
      try {
        db.run("COMMIT");
      } catch {
        // ignore
      }
      console.error(err);
      return;
    }

    boards = list;
    renderBoardTabs(boards, activeBoard);
    setActiveTabUi(activeBoard);
    await persist();
  }

  function getManageTabsRows() {
    const list = document.getElementById("tabsList");
    if (!(list instanceof HTMLElement)) return [];
    return [...list.querySelectorAll(".manageTabsRow")].filter((r) => r instanceof HTMLElement);
  }

  function isBoardsManagePanelOpen() {
    const sv = document.getElementById("settingsView");
    const p = document.getElementById("settingsPanelBoards");
    return (
      sv instanceof HTMLElement &&
      !sv.hasAttribute("hidden") &&
      p instanceof HTMLElement &&
      !p.hasAttribute("hidden")
    );
  }

  function getManageTabsButtonsInRow(rowEl) {
    if (!(rowEl instanceof HTMLElement)) return [];
    return [...rowEl.querySelectorAll("button.monoLinkButton[data-manage-tabs-action]")].filter(
      (b) => b instanceof HTMLButtonElement
    );
  }

  function getManageTabsActionFromActiveElement(activeEl) {
    if (!(activeEl instanceof Element)) return "remove";
    const btn = activeEl.closest("button[data-manage-tabs-action]");
    if (!(btn instanceof HTMLButtonElement)) return "remove";
    const a = String(btn.dataset.manageTabsAction || "");
    if (a === "up" || a === "down" || a === "remove") return a;
    return "remove";
  }

  function focusManageTabsRowAction(rowEl, action) {
    if (!(rowEl instanceof HTMLElement)) return false;
    const preferred = rowEl.querySelector(
      `button[data-manage-tabs-action="${CSS.escape(String(action))}"]`
    );
    if (preferred instanceof HTMLButtonElement && !preferred.disabled && safeFocus(preferred)) return true;

    const remove = rowEl.querySelector('button[data-manage-tabs-action="remove"]');
    if (remove instanceof HTMLButtonElement && !remove.disabled && safeFocus(remove)) return true;

    const any = getManageTabsButtonsInRow(rowEl).find((b) => b instanceof HTMLButtonElement && !b.disabled);
    return any ? safeFocus(any) : false;
  }

  function restoreManageTabsFocus(boardName, action) {
    const list = document.getElementById("tabsList");
    if (!(list instanceof HTMLElement)) return false;
    const row = list.querySelector(
      `.manageTabsRow[data-board="${CSS.escape(String(boardName || ""))}"]`
    );
    if (row instanceof HTMLElement) return focusManageTabsRowAction(row, action);

    // Fallback: focus the first available row action.
    const rows = getManageTabsRows();
    if (!rows.length) return false;
    return focusManageTabsRowAction(rows[0], action);
  }

  function moveFocusWithinManageTabsRow(delta) {
    const activeEl = document.activeElement;
    if (!(activeEl instanceof Element)) return false;
    const row = activeEl.closest(".manageTabsRow");
    if (!(row instanceof HTMLElement)) return false;

    const btns = getManageTabsButtonsInRow(row).filter((b) => b instanceof HTMLButtonElement && !b.disabled);
    if (!btns.length) return false;

    const activeBtn = activeEl.closest("button[data-manage-tabs-action]");
    const idx = activeBtn instanceof HTMLButtonElement ? btns.indexOf(activeBtn) : -1;
    const nextIdx = idx === -1 ? (delta < 0 ? btns.length - 1 : 0) : Math.min(btns.length - 1, Math.max(0, idx + delta));
    return safeFocus(btns[nextIdx]);
  }

  function moveFocusAcrossManageTabsRows(deltaRows) {
    const rows = getManageTabsRows();
    if (!rows.length) return false;

    const activeEl = document.activeElement;
    const currentRow = activeEl instanceof Element ? activeEl.closest(".manageTabsRow") : null;
    const currentIdx = currentRow instanceof HTMLElement ? rows.indexOf(currentRow) : -1;

    // Only handle row movement if the user is currently focused within a row.
    // (Don't hijack navigation when focus is on Add/Close controls.)
    if (currentIdx === -1) return false;

    // Allow exiting the rows area back to the Add controls.
    if (currentIdx === 0 && deltaRows < 0) {
      const addBtn = document.querySelector("#addTabForm button[type='submit']");
      const addTabName = document.getElementById("addTabName");
      if (addBtn instanceof HTMLElement && safeFocus(addBtn)) return true;
      if (addTabName instanceof HTMLElement && safeFocus(addTabName)) return true;
      const closeBtn = document.getElementById("closeSettingsBtn");
      if (closeBtn instanceof HTMLElement && safeFocus(closeBtn)) return true;
      return false;
    }

    const fromIdx = currentIdx === -1 ? (deltaRows < 0 ? rows.length - 1 : 0) : currentIdx;
    const nextIdx = Math.min(rows.length - 1, Math.max(0, fromIdx + deltaRows));
    const action = getManageTabsActionFromActiveElement(activeEl);
    return focusManageTabsRowAction(rows[nextIdx], action);
  }

  function moveBoardsSettingsFocus(direction) {
    if (!isBoardsManagePanelOpen()) return false;
    const activeEl = document.activeElement;
    if (!(activeEl instanceof Element) || activeEl.closest("#settingsPanelBoards") === null) return false;

    const addTabName = document.getElementById("addTabName");
    const addTabSubmit = document.querySelector("#addTabForm button[type='submit']");
    const rows = getManageTabsRows();
    const row = activeEl.closest(".manageTabsRow");

    if (row instanceof HTMLElement) {
      if (direction === "left") return moveFocusWithinManageTabsRow(-1);
      if (direction === "right") return moveFocusWithinManageTabsRow(+1);
      if (direction === "up") return moveFocusAcrossManageTabsRows(-1);
      if (direction === "down") return moveFocusAcrossManageTabsRows(+1);
      return false;
    }

    if (activeEl === addTabName || activeEl === addTabSubmit) {
      if (direction === "up") {
        if (activeEl === addTabSubmit) {
          const closeBtn = document.getElementById("closeSettingsBtn");
          if (closeBtn instanceof HTMLElement) return safeFocus(closeBtn);
        }
        return true;
      }
      if (direction === "left") {
        if (activeEl === addTabSubmit && addTabName instanceof HTMLElement) return safeFocus(addTabName);
        // Let the Settings shell handle left from the first panel control.
        if (activeEl === addTabName) return false;
        return true;
      }
      if (direction === "right") {
        if (activeEl === addTabName && addTabSubmit instanceof HTMLElement) return safeFocus(addTabSubmit);
        return true;
      }
      if (direction === "down") {
        if (rows[0] instanceof HTMLElement) return focusManageTabsRowAction(rows[0], "remove");
        return true;
      }
    }

    return false;
  }

  function renderManageTabs() {
    if (!(tabsList instanceof HTMLElement)) return;
    tabsList.textContent = "";

    const currentBoards = boards.slice();
    if (currentBoards.length <= 1) {
      setManageTabsMessage("At least one board should exist.");
    }

    for (let idx = 0; idx < currentBoards.length; idx++) {
      const b = currentBoards[idx];
      const row = document.createElement("div");
      row.className = "manageTabsRow";
      row.dataset.board = b;

      const name = document.createElement("div");
      name.className = "manageTabsName";
      name.textContent = b;

      const actions = document.createElement("div");
      actions.className = "manageTabsActions";

      const up = document.createElement("button");
      up.type = "button";
      up.className = "monoLinkButton";
      up.textContent = "Up";
      up.dataset.manageTabsAction = "up";
      up.disabled = idx <= 0;
      up.addEventListener("click", async () => {
        const next = boards.slice();
        const i = next.indexOf(b);
        if (i <= 0) return;
        const tmp = next[i - 1];
        next[i - 1] = next[i];
        next[i] = tmp;
        await persistBoardOrder(next);
        renderManageTabs();
        requestAnimationFrame(() => restoreManageTabsFocus(b, "up"));
      });

      const down = document.createElement("button");
      down.type = "button";
      down.className = "monoLinkButton";
      down.textContent = "Down";
      down.dataset.manageTabsAction = "down";
      down.disabled = idx >= currentBoards.length - 1;
      down.addEventListener("click", async () => {
        const next = boards.slice();
        const i = next.indexOf(b);
        if (i < 0 || i >= next.length - 1) return;
        const tmp = next[i + 1];
        next[i + 1] = next[i];
        next[i] = tmp;
        await persistBoardOrder(next);
        renderManageTabs();
        requestAnimationFrame(() => restoreManageTabsFocus(b, "down"));
      });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "monoLinkButton";
      del.textContent = "Remove";
      del.dataset.manageTabsAction = "remove";
      del.disabled = currentBoards.length <= 1;
      del.addEventListener("click", async () => {
        if (boards.length <= 1) {
          setManageTabsMessage("At least one board should exist.");
          return;
        }

        deleteBoardCascade(db, b);
        openNoteEditorIds.clear();
        flippedNoteIds.clear();

        boards = queryBoards(db);
        if (!boards.length) {
          addBoard(db, DEFAULT_TAB_NAME);
          boards = queryBoards(db);
        }

        if (!boards.includes(activeBoard)) {
          activeBoard = boards[0];
          await saveActiveBoard(activeBoard);
        }

        renderBoardTabs(boards, activeBoard);
        setActiveTabUi(activeBoard);
        await persist();
        await refresh();
        renderManageTabs();
      });

      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(del);

      row.appendChild(name);
      row.appendChild(actions);
      tabsList.appendChild(row);
    }
  }

  if (addTabForm instanceof HTMLFormElement) {
    addTabForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setManageTabsMessage("");
      const name = addTabName instanceof HTMLInputElement ? addTabName.value : "";
      const n = normalizeBoardName(name);
      if (!n) return;

      const exists = boards.some((b) => b.toLowerCase() === n.toLowerCase());
      if (exists) {
        setManageTabsMessage("That tab already exists.");
        return;
      }

      addBoard(db, n);
      boards = queryBoards(db);
      renderBoardTabs(boards, activeBoard);
      await persist();

      if (addTabName instanceof HTMLInputElement) addTabName.value = "";
      await activateBoard(n, { persistSelection: true });
      renderManageTabs();
    });
  }

  function getAllCardsInDomOrder() {
    const pendingList = document.getElementById("pendingList");
    const completeList = document.getElementById("completeList");
    const pendingCards = pendingList
      ? [...pendingList.querySelectorAll(".noteCard[data-note-id]")]
      : [];
    const completeCards = completeList
      ? [...completeList.querySelectorAll(".noteCard[data-note-id]")]
      : [];
    return [...pendingCards, ...completeCards].filter((c) => c instanceof HTMLElement);
  }

  function getCardFromElement(el) {
    if (!(el instanceof Element)) return null;
    const card = el.closest(".noteCard[data-note-id]");
    return card instanceof HTMLElement ? card : null;
  }

  function getCardPrimaryActionButton(card) {
    if (!(card instanceof HTMLElement)) return null;
    const footer = card.querySelector(".noteActions");
    if (!(footer instanceof HTMLElement)) return null;
    const btn = footer.querySelector("button");
    return btn instanceof HTMLButtonElement ? btn : null;
  }

  function ensureCardFullyVisible(card) {
    if (!(card instanceof HTMLElement)) return;
    const margin = 12;
    const containers = [];
    const seen = new Set();

    const pushContainer = (node) => {
      if (!(node instanceof HTMLElement)) return;
      if (seen.has(node)) return;
      if (node.scrollHeight <= node.clientHeight) return;
      seen.add(node);
      containers.push(node);
    };

    // Preferred known containers in this UI.
    pushContainer(card.closest(".list"));
    pushContainer(card.closest(".board"));

    // Fallback: any scrollable ancestor.
    let p = card.parentElement;
    while (p) {
      pushContainer(p);
      p = p.parentElement;
    }

    if (!containers.length) {
      card.scrollIntoView({ block: "nearest" });
      return;
    }

    for (const container of containers) {
      const containerRect = container.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();

      const visibleHeight = Math.max(0, containerRect.height - margin * 2);
      if (cardRect.height > visibleHeight) {
        const topDelta = cardRect.top - (containerRect.top + margin);
        if (topDelta < 0 || topDelta > margin) container.scrollTop += topDelta;
        continue;
      }

      const topOverflow = (containerRect.top + margin) - cardRect.top;
      const bottomOverflow = cardRect.bottom - (containerRect.bottom - margin);

      if (topOverflow > 0) container.scrollTop -= topOverflow;
      else if (bottomOverflow > 0) container.scrollTop += bottomOverflow;
    }
  }

  function focusCardPrimaryAction(card) {
    const btn = getCardPrimaryActionButton(card);
    if (btn) btn.focus({ preventScroll: true });
    ensureCardFullyVisible(card);
    if (!btn && card instanceof HTMLElement) card.scrollIntoView({ block: "nearest" });
  }

  function startRename(card) {
    if (!(card instanceof HTMLElement)) return;
    const noteId = Number(card.dataset.noteId);
    if (!Number.isFinite(noteId)) return;
    const body = card.querySelector(".noteFace:not(.noteBack) .noteText");
    if (!(body instanceof HTMLElement)) return;
    if (card.querySelector(".noteTextRenameInput")) return;

    const currentText = (body.textContent || "").trim();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "noteTextRenameInput bx--text-input";
    input.value = currentText;
    input.setAttribute("aria-label", "Rename task");
    input.dataset.noteId = String(noteId);

    const focusCard = () => {
      const c = document.querySelector(
        `.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`
      );
      if (c instanceof HTMLElement) focusCardPrimaryAction(c);
    };

    const finish = (save) => {
      input.remove();
      body.hidden = false;
      const newText = (input.value || "").trim();
      if (save && newText) {
        setNoteText(db, noteId, input.value);
        refresh().then(focusCard);
      } else {
        body.textContent = currentText;
        focusCard();
      }
    };

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    });

    input.addEventListener("blur", () => finish(true));

    body.hidden = true;
    body.parentNode.insertBefore(input, body);
    input.focus();
    input.select();
  }

  function startRenameTab(rowEl) {
    if (!(rowEl instanceof HTMLElement)) return;
    const oldName = rowEl.dataset.board;
    if (!oldName) return;
    const nameEl = rowEl.querySelector(".manageTabsName");
    if (!(nameEl instanceof HTMLElement)) return;
    if (rowEl.querySelector(".manageTabsRenameInput")) return;

    const currentName = (nameEl.textContent || "").trim();
    const input = document.createElement("input");
    input.type = "text";
    input.className = "manageTabsRenameInput bx--text-input";
    input.value = currentName;
    input.setAttribute("aria-label", "Rename board");
    input.dataset.board = oldName;

    const finish = (save) => {
      input.remove();
      nameEl.hidden = false;
      const newName = (input.value || "").trim();
      if (save && newName && newName !== oldName) {
        if (renameBoard(db, oldName, newName)) {
          boards = queryBoards(db);
          if (activeBoard === oldName) activeBoard = newName;
          renderBoardTabs(boards, activeBoard);
          setActiveTabUi(activeBoard);
          persist().then(() => {
            refresh();
            renderManageTabs();
            restoreManageTabsFocus(newName, "remove");
          });
        } else {
          setManageTabsMessage("Tab name already exists or invalid.");
          nameEl.textContent = currentName;
          renderManageTabs();
        }
      } else {
        nameEl.textContent = currentName;
        restoreManageTabsFocus(oldName, "remove");
      }
    };

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(true);
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    });

    input.addEventListener("blur", () => finish(true));

    nameEl.hidden = true;
    nameEl.parentNode.insertBefore(input, nameEl);
    input.focus();
    input.select();
  }

  function moveCardFocus(delta) {
    const cards = getAllCardsInDomOrder();
    if (!cards.length) return;

    const activeEl = document.activeElement;
    const currentCard = getCardFromElement(activeEl);
    const currentIdx = currentCard ? cards.indexOf(currentCard) : -1;

    const nextIdx = Math.min(cards.length - 1, Math.max(0, currentIdx + delta));
    const nextCard = cards[nextIdx];
    if (currentCard && nextCard && currentCard !== nextCard) closeCardOverlays(currentCard);
    focusCardPrimaryAction(nextCard);
  }

  function getFrontAttachmentLinks(card) {
    if (!(card instanceof HTMLElement)) return [];
    const items = card.querySelector(".noteAttachmentsItems");
    if (!(items instanceof HTMLElement)) return [];
    return [...items.querySelectorAll("a.attachmentPill")].filter(
      (n) => n instanceof HTMLElement
    );
  }

  function moveFocusWithinFrontAttachments(card, delta) {
    const links = getFrontAttachmentLinks(card);
    if (!links.length) return false;
    const active = document.activeElement;
    const idx = active ? links.indexOf(active) : -1;

    let nextIdx = idx;
    if (nextIdx === -1) nextIdx = delta < 0 ? links.length - 1 : 0;
    else nextIdx = Math.min(links.length - 1, Math.max(0, nextIdx + delta));

    return safeFocus(links[nextIdx]);
  }

  function focusFrontAttachmentInCard(card, preferLast = false) {
    if (!(card instanceof HTMLElement)) return false;
    const links = getFrontAttachmentLinks(card);
    if (!links.length) return false;
    const target = preferLast ? links[links.length - 1] : links[0];
    const ok = safeFocus(target);
    ensureCardFullyVisible(card);
    return ok;
  }

  function focusAdjacentCardFrontAttachment(card, delta) {
    if (!(card instanceof HTMLElement)) return false;
    const cards = getAllCardsInDomOrder();
    const idx = cards.indexOf(card);
    if (idx < 0) return false;
    const nextIdx = idx + (delta < 0 ? -1 : 1);
    if (nextIdx < 0 || nextIdx >= cards.length) return false;
    const targetCard = cards[nextIdx];
    if (!(targetCard instanceof HTMLElement)) return false;
    if (focusFrontAttachmentInCard(targetCard, delta < 0)) return true;
    focusCardFrontAttachmentsOrPrimary(targetCard);
    return true;
  }

  function focusCardFrontAttachmentsOrPrimary(card) {
    if (!(card instanceof HTMLElement)) return false;
    const buttons = getCardFrontFocusableButtons(card);
    const dueButtons = buttons.filter((b) => b.closest(".noteDueDateRow"));
    if (dueButtons.length && safeFocus(dueButtons[0])) {
      ensureCardFullyVisible(card);
      return true;
    }
    if (focusFrontAttachmentInCard(card, false)) return true;
    focusCardPrimaryAction(card);
    return true;
  }

  function focusAdjacentCardPrimaryAction(card, delta) {
    if (!(card instanceof HTMLElement)) return false;
    const cards = getAllCardsInDomOrder();
    const idx = cards.indexOf(card);
    if (idx < 0) return false;
    const nextIdx = idx + (delta < 0 ? -1 : 1);
    if (nextIdx < 0 || nextIdx >= cards.length) return false;
    const targetCard = cards[nextIdx];
    if (!(targetCard instanceof HTMLElement)) return false;
    focusCardFrontAttachmentsOrPrimary(targetCard);
    return true;
  }

  function getCardFrontFocusableButtons(card) {
    if (!(card instanceof HTMLElement)) return [];
    const buttons = [];
    const dueRow = card.querySelector(".noteDueDateRow");
    if (dueRow instanceof HTMLElement) {
      buttons.push(...dueRow.querySelectorAll("button"));
    }
    const footer = card.querySelector(".noteActions");
    if (footer instanceof HTMLElement) {
      buttons.push(...footer.querySelectorAll("button"));
    }
    return buttons.filter(
      (b) => b instanceof HTMLButtonElement && !b.disabled
    );
  }

  function moveButtonFocusWithinCard(card, delta) {
    if (!(card instanceof HTMLElement)) return;
    const buttons = getCardFrontFocusableButtons(card);
    if (!buttons.length) return;

    const activeEl = document.activeElement;
    const currentIdx = activeEl ? buttons.indexOf(activeEl) : -1;

    let nextIdx = currentIdx;
    if (nextIdx === -1) nextIdx = delta < 0 ? buttons.length - 1 : 0;
    else nextIdx = Math.min(buttons.length - 1, Math.max(0, nextIdx + delta));

    buttons[nextIdx].focus({ preventScroll: true });
    ensureCardFullyVisible(card);
  }

  function focusAttachmentsBackButton(card) {
    if (!(card instanceof HTMLElement)) return false;
    const btn = card.querySelector(
      ".noteBackButtonsRow button[data-action='unflip']"
    );
    if (btn instanceof HTMLButtonElement) {
      btn.focus({ preventScroll: true });
      ensureCardFullyVisible(card);
      return true;
    }
    return false;
  }

  function focusAttachmentsAddLinkButton(card) {
    if (!(card instanceof HTMLElement)) return false;
    const btn = card.querySelector(
      ".noteBackButtonsRow button[type='submit']"
    );
    if (btn instanceof HTMLButtonElement) {
      btn.focus({ preventScroll: true });
      ensureCardFullyVisible(card);
      return true;
    }
    return false;
  }

  function getAttachmentsFocusableElements(card) {
    if (!(card instanceof HTMLElement)) return [];
    const back = card.querySelector(".noteBack");
    if (!(back instanceof HTMLElement)) return [];
    const nodes = [...back.querySelectorAll("input, button, a[href]")].filter(
      (n) => n instanceof HTMLElement
    );
    return nodes.filter((n) => {
      if (!isElementInVisibleView(n)) return false;
      if (n instanceof HTMLButtonElement && n.disabled) return false;
      return true;
    });
  }

  function moveFocusWithinAttachments(card, delta) {
    const els = getAttachmentsFocusableElements(card);
    if (!els.length) return false;
    const active = document.activeElement;
    const currentIdx = active ? els.indexOf(active) : -1;
    let nextIdx = currentIdx;
    if (nextIdx === -1) nextIdx = delta < 0 ? els.length - 1 : 0;
    else nextIdx = Math.min(els.length - 1, Math.max(0, nextIdx + delta));
    const ok = safeFocus(els[nextIdx]);
    ensureCardFullyVisible(card);
    return ok;
  }

  function moveFocusWithinAttachmentsButtonsRow(card, delta) {
    if (!(card instanceof HTMLElement)) return false;
    const row = card.querySelector(".noteBackButtonsRow");
    if (!(row instanceof HTMLElement)) return false;
    const buttons = [...row.querySelectorAll("button")].filter(
      (b) => b instanceof HTMLButtonElement && !b.disabled
    );
    if (!buttons.length) return false;

    const active = document.activeElement;
    const currentIdx = active ? buttons.indexOf(active) : -1;
    let nextIdx = currentIdx;
    if (nextIdx === -1) nextIdx = delta < 0 ? buttons.length - 1 : 0;
    else nextIdx = Math.min(buttons.length - 1, Math.max(0, nextIdx + delta));

    buttons[nextIdx].focus({ preventScroll: true });
    ensureCardFullyVisible(card);
    return true;
  }

  function moveFocusWithinAttachmentsLinkRows(card, deltaRows) {
    if (!(card instanceof HTMLElement)) return false;
    const active = document.activeElement;
    if (!(active instanceof Element)) return false;

    const currentRow = active.closest(".linkRow");
    if (!(currentRow instanceof HTMLElement)) return false;

    const rows = [...card.querySelectorAll(".linkList .linkRow")].filter(
      (r) => r instanceof HTMLElement
    );
    if (!rows.length) return false;

    const currentIdx = rows.indexOf(currentRow);
    if (currentIdx < 0) return false;

    const nextIdx = Math.min(rows.length - 1, Math.max(0, currentIdx + deltaRows));
    if (nextIdx === currentIdx) return false;

    const activeIsDeleteButton = active instanceof HTMLButtonElement;
    const targetRow = rows[nextIdx];
    const preferred = activeIsDeleteButton
      ? targetRow.querySelector("button")
      : targetRow.querySelector("a[href]");
    const fallback = targetRow.querySelector("a[href], button");
    const target = preferred instanceof HTMLElement ? preferred : fallback;
    if (!(target instanceof HTMLElement)) return false;

    const ok = safeFocus(target);
    ensureCardFullyVisible(card);
    return ok;
  }

  function toggleOrInsertLineCheckbox(editor) {
    if (!(editor instanceof HTMLElement)) return;

    const block =
      getCurrentBlockElement(editor) ||
      (editor.firstElementChild instanceof HTMLElement ? editor.firstElementChild : null) ||
      editor;

    // Look for the first <s> (strikethrough) element in the block
    let strike = null;
    for (let n = block.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === Node.ELEMENT_NODE && n.tagName === "S") {
        strike = n;
        break;
      }
    }
    if (strike) {
      // Remove strikethrough (replace <s> with its text content)
      const text = document.createTextNode(strike.textContent || "");
      block.replaceChild(text, strike);
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    // If not found, wrap the entire line in <s>
    const lineText = block.textContent || "";
    // Remove all children
    while (block.firstChild) block.removeChild(block.firstChild);
    const s = document.createElement("s");
    s.textContent = lineText;
    block.appendChild(s);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function removeLeadingLineCheckboxIfAppropriate(editor, key) {
    if (!(editor instanceof HTMLElement)) return false;
    if (key !== "Backspace" && key !== "Delete") return false;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;

    const block = getCurrentBlockElement(editor) || editor;
    const first = block.firstChild;
    if (
      !(first instanceof HTMLInputElement) ||
      first.type !== "checkbox" ||
      !first.classList.contains("noteLineCheckbox")
    ) {
      return false;
    }

    const spaceNode = first.nextSibling;

    const atStartOfBlock = (() => {
      if (range.startContainer === block) {
        const off = range.startOffset;
        // Child offsets: 0=before checkbox, 1=after checkbox, 2=after space
        if (key === "Backspace") return off <= 2;
        return off <= 1;
      }

      if (spaceNode && range.startContainer === spaceNode && spaceNode.nodeType === Node.TEXT_NODE) {
        const off = range.startOffset;
        if (key === "Backspace") return off <= 1;
        return off === 0;
      }

      // If caret is at the very start of the first real text node after the checkbox,
      // allow Backspace to remove the checkbox.
      if (key === "Backspace" && range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer;
        if (range.startOffset !== 0) return false;
        const prev = textNode.previousSibling;
        if (prev === spaceNode || prev === first) return true;
      }

      return false;
    })();

    if (!atStartOfBlock) return false;

    // Remove checkbox + spacer.
    try {
      first.remove();
      if (spaceNode && spaceNode.nodeType === Node.TEXT_NODE) {
        const v = spaceNode.nodeValue || "";
        if (/^\s*$/.test(v)) spaceNode.remove();
        else if (v.startsWith(" ")) spaceNode.nodeValue = v.slice(1);
      }
    } catch {
      // ignore
    }

    // Place caret at start of the block.
    try {
      const r = document.createRange();
      r.selectNodeContents(block);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch {
      // ignore
    }

    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  // Keyboard navigation (popup)
  // - Alt+T: next card (down)
  // - Alt+C: previous card (up)
  // - Alt+H: previous action button (left)
  // - Alt+N: next action button (right)
  // - :x (while focused in notes editor): close notes
  // - :x (while focused in flipped attachments UI): close attachments
  // - Escape: let Chrome close popup
  let notesExitPending = null;
  let attachmentsExitPending = null;
  let lastBoardShortcutAt = 0;
  let calendarSelectedDayCell = null;

  function moveCalendarFocus(dr, dc) {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.classList.contains("calendarDayCell")) return false;
    const monthIdx = Number(active.dataset.monthIdx);
    const row = Number(active.dataset.row);
    const col = Number(active.dataset.col);
    if (!Number.isFinite(monthIdx) || !Number.isFinite(row) || !Number.isFinite(col)) return false;

    const getMonth = (idx) => calendarContent?.querySelector(`.calendarMonth[data-month-idx="${idx}"]`);
    const getCellAt = (mi, r, c) => {
      const month = getMonth(mi);
      if (!(month instanceof HTMLElement)) return null;
      const rows = month.querySelectorAll("tbody tr");
      if (r < 0 || r >= rows.length) return null;
      const tr = rows[r];
      if (!(tr instanceof HTMLElement)) return null;
      const cells = tr.querySelectorAll("td");
      if (c < 0 || c >= cells.length) return null;
      const td = cells[c];
      if (!(td instanceof HTMLElement)) return null;
      return td.querySelector(".calendarDayCell");
    };

    let targetMonthIdx = monthIdx;
    let targetRow = row + dr;
    let targetCol = col + dc;

    if (dc === 1 && targetCol >= 7) {
      targetMonthIdx = monthIdx + 1;
      targetCol = 0;
      if (targetMonthIdx >= 4) return false;
      const targetMonth = getMonth(targetMonthIdx);
      const targetNumRows = targetMonth ? targetMonth.querySelectorAll("tbody tr").length : 0;
      targetRow = Math.min(row, targetNumRows - 1);
    } else if (dc === -1 && targetCol < 0) {
      targetMonthIdx = monthIdx - 1;
      targetCol = 6;
      if (targetMonthIdx < 0) return false;
      const targetMonth = getMonth(targetMonthIdx);
      const targetNumRows = targetMonth ? targetMonth.querySelectorAll("tbody tr").length : 0;
      targetRow = Math.min(row, targetNumRows - 1);
    } else if (dr === 1) {
      const month = getMonth(monthIdx);
      const numRows = month ? month.querySelectorAll("tbody tr").length : 0;
      if (targetRow >= numRows) {
        targetMonthIdx = monthIdx + 2;
        if (targetMonthIdx >= 4) return false;
        targetRow = 0;
      }
    } else if (dr === -1 && targetRow < 0) {
      targetMonthIdx = monthIdx - 2;
      if (targetMonthIdx < 0) return false;
      const targetMonth = getMonth(targetMonthIdx);
      const targetNumRows = targetMonth ? targetMonth.querySelectorAll("tbody tr").length : 0;
      targetRow = Math.max(0, targetNumRows - 1);
    }

    const targetBtn = getCellAt(targetMonthIdx, targetRow, targetCol);
    if (!(targetBtn instanceof HTMLButtonElement)) return false;
    safeFocus(targetBtn);
    return true;
  }

  function isElementInVisibleView(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (node.closest("[hidden]")) return false;
    return true;
  }

  function safeFocus(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (!isElementInVisibleView(node)) return false;
    if (node instanceof HTMLButtonElement && node.disabled) return false;
    try {
      node.focus({ preventScroll: true });
    } catch {
      try {
        node.focus();
      } catch {
        return false;
      }
    }
    return true;
  }

  function getCreateFormNavTargets() {
    const form = document.getElementById("createForm");
    if (!(form instanceof HTMLElement) || !isElementInVisibleView(form)) return [];
    const selectors = [
      "#noteText",
      "#noteDueDate",
      "[data-due-quick]",
      "#dashboardBtn",
      "#calendarBtn",
      "button[type='submit']",
    ];
    return selectors
      .flatMap((selector) => Array.from(form.querySelectorAll(selector)))
      .filter((el) => el instanceof HTMLElement && isElementInVisibleView(el));
  }

  function setCreateDueQuickVisible(visible) {
    const row = document.querySelector("#createForm .createDueQuickRow");
    if (!(row instanceof HTMLElement)) return;
    const show = visible === true;
    row.hidden = !show;
    row.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function focusFirstCreateDueQuickButton() {
    const first = document.querySelector('#createForm [data-due-quick="today"]');
    return first instanceof HTMLElement ? safeFocus(first) : false;
  }

  function moveCreateFormFocusByVisualDirection(key, nav) {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    const targets = getCreateFormNavTargets();
    if (!targets.includes(active)) return false;

    const direction =
      key === nav.left
        ? "left"
        : key === nav.right
          ? "right"
          : key === nav.up
            ? "up"
            : key === nav.down
              ? "down"
              : "";
    if (!direction) return false;

    const noteDueDate = document.getElementById("noteDueDate");
    if (active === noteDueDate && (direction === "right" || direction === "down")) {
      setCreateDueQuickVisible(true);
      return focusFirstCreateDueQuickButton();
    }

    const createSubmitBtn = document.querySelector("#createForm button[type='submit']");
    if (active === createSubmitBtn && direction === "right") {
      if (cardFilterInput instanceof HTMLElement) return safeFocus(cardFilterInput);
    }

    const currentRect = active.getBoundingClientRect();
    const currentCenterX = currentRect.left + currentRect.width / 2;
    const currentCenterY = currentRect.top + currentRect.height / 2;
    const threshold = 2;
    const measured = [];

    for (const target of targets) {
      if (target === active) continue;
      const rect = target.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = centerX - currentCenterX;
      const dy = centerY - currentCenterY;
      const primary =
        direction === "left"
          ? -dx
          : direction === "right"
            ? dx
            : direction === "up"
              ? -dy
              : dy;
      if (primary <= threshold) continue;
      const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
      const overlapsCrossAxis =
        direction === "left" || direction === "right"
          ? rect.bottom >= currentRect.top && rect.top <= currentRect.bottom
          : rect.right >= currentRect.left && rect.left <= currentRect.right;
      measured.push({ target, primary, secondary, overlapsCrossAxis });
    }

    const preferred = measured.filter((item) => item.overlapsCrossAxis);
    const candidates = preferred.length ? preferred : measured;
    let best = null;
    let bestScore = Infinity;
    for (const item of candidates) {
      const score = item.primary * 100 + item.secondary;
      if (score < bestScore) {
        bestScore = score;
        best = item.target;
      }
    }
    return best instanceof HTMLElement ? safeFocus(best) : false;
  }

  function getSettingsSidebarTabs() {
    return [
      document.getElementById("settingsTabBoards"),
      document.getElementById("settingsTabAppearance"),
      document.getElementById("settingsTabData"),
      document.getElementById("settingsTabAi"),
      document.getElementById("settingsTabObsidian"),
      document.getElementById("settingsTabKeyboard"),
    ].filter((t) => t instanceof HTMLElement && isElementInVisibleView(t));
  }

  function getSettingsActivePanelFocusables() {
    const panelBoards = document.getElementById("settingsPanelBoards");
    const panelAppearance = document.getElementById("settingsPanelAppearance");
    const panelData = document.getElementById("settingsPanelData");
    const panelAi = document.getElementById("settingsPanelAi");
    const panelObs = document.getElementById("settingsPanelObsidian");
    const panelKbd = document.getElementById("settingsPanelKeyboard");
    let panel = null;
    if (panelBoards instanceof HTMLElement && !panelBoards.hasAttribute("hidden")) panel = panelBoards;
    else if (panelAppearance instanceof HTMLElement && !panelAppearance.hasAttribute("hidden")) panel = panelAppearance;
    else if (panelData instanceof HTMLElement && !panelData.hasAttribute("hidden")) panel = panelData;
    else if (panelAi instanceof HTMLElement && !panelAi.hasAttribute("hidden")) panel = panelAi;
    else if (panelObs instanceof HTMLElement && !panelObs.hasAttribute("hidden")) panel = panelObs;
    else if (panelKbd instanceof HTMLElement && !panelKbd.hasAttribute("hidden")) panel = panelKbd;
    if (!panel) return [];
    const sel =
      'button:not([disabled]), [href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(panel.querySelectorAll(sel)).filter(
      (el) => el instanceof HTMLElement && isElementInVisibleView(el)
    );
  }

  function focusSettingsPanelControl(target) {
    if (!(target instanceof HTMLElement) || !safeFocus(target)) return false;
    try {
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch {
      // ignore
    }
    return true;
  }

  function movePopupSizeFocus(delta) {
    const active = document.activeElement;
    const inputs = popupSizeInputs.filter((input) => input instanceof HTMLInputElement && !input.disabled);
    const index = active instanceof HTMLInputElement ? inputs.indexOf(active) : -1;
    if (index < 0) return false;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= inputs.length) return false;
    return focusSettingsPanelControl(inputs[nextIndex]);
  }

  function getSettingsSelectedTabEl() {
    const tabs = getSettingsSidebarTabs();
    return tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0] || null;
  }

  function getInstructionsFocusables() {
    const content = document.getElementById("instructionsContent");
    const closeBtn = document.getElementById("closeInstructionsBtn");
    const targets = [];
    if (closeBtn instanceof HTMLElement) targets.push(closeBtn);
    if (content instanceof HTMLElement) {
      targets.push(
        ...Array.from(content.querySelectorAll(".instructionsLead, .instructionsSection")).filter(
          (el) => el instanceof HTMLElement
        )
      );
    }
    return targets.filter((t) => t instanceof HTMLElement && isElementInVisibleView(t));
  }

  function moveInstructionsFocus(delta) {
    const targets = getInstructionsFocusables();
    if (!targets.length) return false;

    const active = document.activeElement;
    const currentIdx = active instanceof HTMLElement ? targets.indexOf(active) : -1;
    let nextIdx = currentIdx;
    if (nextIdx === -1) nextIdx = delta < 0 ? targets.length - 1 : 0;
    else nextIdx = Math.min(targets.length - 1, Math.max(0, nextIdx + delta));

    const target = targets[nextIdx];
    if (!safeFocus(target)) return false;
    if (target !== active && target.closest("#instructionsContent")) {
      try {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {
        // ignore
      }
    }
    return true;
  }

  function getAboutFocusables() {
    const view = document.getElementById("aboutView");
    if (!(view instanceof HTMLElement)) return [];
    const sel =
      'button:not([disabled]), a[href]:not([hidden]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(view.querySelectorAll(sel)).filter(
      (el) => el instanceof HTMLElement && isElementInVisibleView(el)
    );
  }

  function moveAboutFocus(delta) {
    const targets = getAboutFocusables();
    if (!targets.length) return false;

    const active = document.activeElement;
    const currentIdx = active instanceof HTMLElement ? targets.indexOf(active) : -1;
    let nextIdx = currentIdx;
    if (nextIdx === -1) nextIdx = delta < 0 ? targets.length - 1 : 0;
    else nextIdx = Math.min(targets.length - 1, Math.max(0, nextIdx + delta));

    const target = targets[nextIdx];
    if (!safeFocus(target)) return false;
    if (target !== active && target.closest("#aboutContent")) {
      try {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      } catch {
        // ignore
      }
    }
    return true;
  }

  function getHeaderNavTargets() {
    return [
      document.getElementById("themeSelect"),
      document.getElementById("instructionsLink"),
      document.getElementById("aboutLink"),
      document.getElementById("tourBtn"),
      document.getElementById("settingsBtn"),
    ].filter((t) => t instanceof HTMLElement && isElementInVisibleView(t));
  }

  function getGlobalNavTargets() {
    const targets = [];

    const themeSelectEl = document.getElementById("themeSelect");
    const settingsBtnEl = document.getElementById("settingsBtn");
    const instructionsLink = document.getElementById("instructionsLink");
    const aboutLink = document.getElementById("aboutLink");
    const tourBtnEl = document.getElementById("tourBtn");
    if (themeSelectEl instanceof HTMLElement) targets.push(themeSelectEl);
    if (instructionsLink instanceof HTMLElement) targets.push(instructionsLink);
    if (aboutLink instanceof HTMLElement) targets.push(aboutLink);
    if (tourBtnEl instanceof HTMLElement) targets.push(tourBtnEl);
    if (settingsBtnEl instanceof HTMLElement) targets.push(settingsBtnEl);

    const notesView = document.getElementById("notesView");
    const instructionsView = document.getElementById("instructionsView");
    const aboutView = document.getElementById("aboutView");
    const dashboardView = document.getElementById("dashboardView");
    const settingsView = document.getElementById("settingsView");

    const notesVisible = notesView instanceof HTMLElement && !notesView.hasAttribute("hidden");
    const instructionsVisible = instructionsView instanceof HTMLElement && !instructionsView.hasAttribute("hidden");
    const aboutVisible = aboutView instanceof HTMLElement && !aboutView.hasAttribute("hidden");
    const dashboardVisible = dashboardView instanceof HTMLElement && !dashboardView.hasAttribute("hidden");
    const calendarVisible = calendarView instanceof HTMLElement && !calendarView.hasAttribute("hidden");
    const settingsVisible = settingsView instanceof HTMLElement && !settingsView.hasAttribute("hidden");

    if (notesVisible) {
      if (addNoteButton instanceof HTMLElement) targets.push(addNoteButton);
      const noteText = document.getElementById("noteText");
      const noteDueDate = document.getElementById("noteDueDate");
      const dashboardBtn = document.getElementById("dashboardBtn");
      const calendarBtn = document.getElementById("calendarBtn");
      const addBtn = document.querySelector("#createForm button[type='submit']");
      const dueQuickButtons = document.querySelectorAll("#createForm [data-due-quick]");
      const cardFilterInput = document.getElementById("cardFilterInput");

      if (noteText instanceof HTMLElement) targets.push(noteText);
      if (noteDueDate instanceof HTMLElement) targets.push(noteDueDate);
      dueQuickButtons.forEach((btn) => {
        if (btn instanceof HTMLElement) targets.push(btn);
      });
      if (dashboardBtn instanceof HTMLElement) targets.push(dashboardBtn);
      if (calendarBtn instanceof HTMLElement) targets.push(calendarBtn);
      if (addBtn instanceof HTMLElement) targets.push(addBtn);
      if (cardFilterInput instanceof HTMLElement) targets.push(cardFilterInput);

      const tabLinks = [...document.querySelectorAll("#boardTabs .bx--tabs__nav-link")].filter(
        (n) => n instanceof HTMLElement
      );
      targets.push(...tabLinks);

      const colPending = document.getElementById("colPending");
      const colComplete = document.getElementById("colComplete");
      if (colPending instanceof HTMLElement) targets.push(colPending);
      if (colComplete instanceof HTMLElement) targets.push(colComplete);
    }

    if (instructionsVisible) {
      targets.push(...getInstructionsFocusables());
    }

    if (aboutVisible) {
      targets.push(...getAboutFocusables());
    }

    if (settingsVisible) {
      const tabBoards = document.getElementById("settingsTabBoards");
      const tabAppearance = document.getElementById("settingsTabAppearance");
      const tabData = document.getElementById("settingsTabData");
      const tabAi = document.getElementById("settingsTabAi");
      const tabObsidian = document.getElementById("settingsTabObsidian");
      const tabKeyboard = document.getElementById("settingsTabKeyboard");
      const closeBtn = document.getElementById("closeSettingsBtn");
      const panelBoards = document.getElementById("settingsPanelBoards");
      const panelAppearance = document.getElementById("settingsPanelAppearance");
      const panelData = document.getElementById("settingsPanelData");
      const panelAi = document.getElementById("settingsPanelAi");
      const panelObsidian = document.getElementById("settingsPanelObsidian");
      const panelKeyboard = document.getElementById("settingsPanelKeyboard");
      if (tabBoards instanceof HTMLElement) targets.push(tabBoards);
      if (tabAppearance instanceof HTMLElement) targets.push(tabAppearance);
      if (tabData instanceof HTMLElement) targets.push(tabData);
      if (tabAi instanceof HTMLElement) targets.push(tabAi);
      if (tabObsidian instanceof HTMLElement) targets.push(tabObsidian);
      if (tabKeyboard instanceof HTMLElement) targets.push(tabKeyboard);
      if (closeBtn instanceof HTMLElement) targets.push(closeBtn);
      const boardsPanelVisible = panelBoards instanceof HTMLElement && !panelBoards.hasAttribute("hidden");
      const appearancePanelVisible =
        panelAppearance instanceof HTMLElement && !panelAppearance.hasAttribute("hidden");
      const dataPanelVisible = panelData instanceof HTMLElement && !panelData.hasAttribute("hidden");
      const aiPanelVisible = panelAi instanceof HTMLElement && !panelAi.hasAttribute("hidden");
      const obsidianPanelVisible = panelObsidian instanceof HTMLElement && !panelObsidian.hasAttribute("hidden");
      const keyboardPanelVisible =
        panelKeyboard instanceof HTMLElement && !panelKeyboard.hasAttribute("hidden");
      if (boardsPanelVisible) {
        const addTabNameEl = document.getElementById("addTabName");
        const addTabSubmit = document.querySelector("#addTabForm button[type='submit']");
        if (addTabNameEl instanceof HTMLElement) targets.push(addTabNameEl);
        if (addTabSubmit instanceof HTMLElement) targets.push(addTabSubmit);
        const rows = getManageTabsRows();
        for (const row of rows) {
          if (!(row instanceof HTMLElement)) continue;
          const primary =
            row.querySelector('button[data-manage-tabs-action="remove"]:not(:disabled)') ||
            row.querySelector('button[data-manage-tabs-action]:not(:disabled)');
          if (primary instanceof HTMLButtonElement) targets.push(primary);
        }
      }
      if (appearancePanelVisible) {
        const appearanceTheme = document.getElementById("settingsThemeSelect");
        const interfaceFont = document.getElementById("settingsInterfaceFontSelect");
        const backgroundFile = document.getElementById("customBackgroundFile");
        const clearBackground = document.getElementById("clearCustomBackgroundBtn");
        const headerTitleField = document.getElementById("settingsHeaderTitleInput");
        const headerTitleFont = document.getElementById("settingsHeaderTitleFontSelect");
        const sizeSmall = document.getElementById("popupSizeSmall");
        const sizeMedium = document.getElementById("popupSizeMedium");
        const sizeLarge = document.getElementById("popupSizeLarge");
        const sizeFull = document.getElementById("popupSizeFull");
        if (appearanceTheme instanceof HTMLElement) targets.push(appearanceTheme);
        if (interfaceFont instanceof HTMLElement) targets.push(interfaceFont);
        if (backgroundFile instanceof HTMLElement) targets.push(backgroundFile);
        if (clearBackground instanceof HTMLElement && !clearBackground.disabled) targets.push(clearBackground);
        if (headerTitleField instanceof HTMLElement) targets.push(headerTitleField);
        if (headerTitleFont instanceof HTMLElement) targets.push(headerTitleFont);
        if (sizeSmall instanceof HTMLElement) targets.push(sizeSmall);
        if (sizeMedium instanceof HTMLElement) targets.push(sizeMedium);
        if (sizeLarge instanceof HTMLElement) targets.push(sizeLarge);
        if (sizeFull instanceof HTMLElement) targets.push(sizeFull);
      }
      if (dataPanelVisible) {
        const exportDbBtn = document.getElementById("exportDbBtn");
        const importDbBtn = document.getElementById("importDbBtn");
        const exportBtn = document.getElementById("exportBtn");
        if (exportDbBtn instanceof HTMLElement) targets.push(exportDbBtn);
        if (importDbBtn instanceof HTMLElement) targets.push(importDbBtn);
        if (exportBtn instanceof HTMLElement) targets.push(exportBtn);
      }
      if (aiPanelVisible) {
        const endpoint = document.getElementById("aiEndpointBaseUrl");
        const model = document.getElementById("aiEndpointModel");
        const customWords = document.getElementById("aiCustomWords");
        const saveBtn = document.getElementById("saveAiSettingsBtn");
        if (endpoint instanceof HTMLElement) targets.push(endpoint);
        if (model instanceof HTMLElement) targets.push(model);
        if (customWords instanceof HTMLElement) targets.push(customWords);
        if (saveBtn instanceof HTMLElement) targets.push(saveBtn);
      }
      if (obsidianPanelVisible) {
        const vaultName = document.getElementById("obsidianVaultName");
        const notesFolder = document.getElementById("obsidianNotesFolder");
	        const syncMode = document.getElementById("obsidianSyncMode");
	        const chooseVault = document.getElementById("obsidianChooseVaultFolderBtn");
	        const grantVault = document.getElementById("obsidianGrantVaultAccessBtn");
	        const clearVault = document.getElementById("obsidianClearVaultFolderBtn");
	        const saveObsidian = document.getElementById("saveObsidianSettingsBtn");
	        const clearObsidianCache = document.getElementById("clearObsidianPathCacheBtn");
	        if (vaultName instanceof HTMLElement) targets.push(vaultName);
	        if (notesFolder instanceof HTMLElement) targets.push(notesFolder);
	        if (syncMode instanceof HTMLElement) targets.push(syncMode);
	        if (chooseVault instanceof HTMLElement && !chooseVault.hidden) targets.push(chooseVault);
	        if (grantVault instanceof HTMLElement && !grantVault.hidden) targets.push(grantVault);
	        if (clearVault instanceof HTMLElement && !clearVault.hidden) targets.push(clearVault);
	        if (saveObsidian instanceof HTMLElement) targets.push(saveObsidian);
	        if (clearObsidianCache instanceof HTMLElement && !clearObsidianCache.hidden) {
	          targets.push(clearObsidianCache);
	        }
	      }
      if (keyboardPanelVisible) {
        const pwin = document.getElementById("keyboardNavPlatformWinlinux");
        const pmac = document.getElementById("keyboardNavPlatformMac");
        const kq = document.getElementById("keyLayoutQwerty");
        const kd = document.getElementById("keyLayoutDvorak");
        if (pwin instanceof HTMLElement) targets.push(pwin);
        if (pmac instanceof HTMLElement) targets.push(pmac);
        if (kq instanceof HTMLElement) targets.push(kq);
        if (kd instanceof HTMLElement) targets.push(kd);
      }
    }

    if (dashboardVisible) {
      const closeBtn = document.getElementById("closeDashboardBtn");
      if (closeBtn instanceof HTMLElement) targets.push(closeBtn);
    }

    if (calendarVisible) {
      const closeBtn = document.getElementById("closeCalendarBtn");
      if (closeBtn instanceof HTMLElement) targets.push(closeBtn);
      const calendarDayCells = calendarContent?.querySelectorAll(".calendarDayCell");
      if (calendarDayCells) targets.push(...calendarDayCells);
      const calendarTaskLinks = document.querySelectorAll(".calendarTaskLink");
      if (calendarTaskLinks) targets.push(...calendarTaskLinks);
    }

    return targets.filter((t) => isElementInVisibleView(t));
  }

  function moveGlobalFocus(delta) {
    const targets = getGlobalNavTargets();
    if (!targets.length) return false;

    const active = document.activeElement;
    const currentIdx = active ? targets.indexOf(active) : -1;

    let nextIdx = currentIdx;
    if (nextIdx === -1) nextIdx = delta < 0 ? targets.length - 1 : 0;
    else nextIdx = Math.min(targets.length - 1, Math.max(0, nextIdx + delta));

    return safeFocus(targets[nextIdx]);
  }

  /** Settings/theme selects only change after Enter arms them; Alt+Up/Down then cycles options (wraps). */
  function cycleThemeSelectControl(select, delta) {
    if (!(select instanceof HTMLSelectElement)) return;
    let order;
    if (select === themeSelect || select === settingsThemeSelect) {
      order = THEME_ORDER;
    } else if (select === settingsHeaderTitleFontSelect) {
      order = HEADER_TITLE_FONT_ORDER;
    } else {
      return;
    }
    const n = order.length;
    if (!n) return;
    let idx = order.indexOf(select.value);
    if (idx < 0) idx = 0;
    idx = (idx + delta + n) % n;
    if (select === themeSelect) {
      if (!themeSelectArmed) return;
      themeSelectChangeAllowed = true;
    } else if (select === settingsThemeSelect) {
      if (!settingsThemeSelectArmed) return;
      settingsThemeSelectChangeAllowed = true;
    } else if (select === settingsHeaderTitleFontSelect) {
      if (!settingsHeaderTitleFontSelectArmed) return;
      settingsHeaderTitleFontSelectChangeAllowed = true;
    } else {
      return;
    }
    select.value = order[idx];
    select.dispatchEvent(new Event("change", { bubbles: true }));
    if (select === themeSelect) themeSelectChangeAllowed = false;
    else if (select === settingsThemeSelect) settingsThemeSelectChangeAllowed = false;
    else settingsHeaderTitleFontSelectChangeAllowed = false;
  }

  function tryScrollBeforeSectionMove(delta) {
    const active = document.activeElement;
    const dir = delta < 0 ? -1 : 1;
    const seen = new Set();
    const containers = [];

    const pushContainer = (node) => {
      if (!(node instanceof HTMLElement)) return;
      if (!isElementInVisibleView(node)) return;
      if (seen.has(node)) return;
      seen.add(node);
      containers.push(node);
    };

    if (active instanceof Element) {
      pushContainer(active.closest(".noteEditorArea"));
      pushContainer(active.closest(".linkList"));
      pushContainer(active.closest(".noteBackBody"));
      pushContainer(active.closest(".list"));
      pushContainer(active.closest(".board"));
      pushContainer(active.closest(".instructionsContent"));
      pushContainer(active.closest(".calendarContent"));
      pushContainer(active.closest(".calendarRightPane"));
    }

    pushContainer(document.querySelector(".list"));
    pushContainer(document.querySelector(".board"));
    pushContainer(document.getElementById("dashboardContent"));
    pushContainer(document.getElementById("calendarContent"));
    pushContainer(document.getElementById("calendarRightPane"));

    for (const container of containers) {
      const maxScroll = container.scrollHeight - container.clientHeight;
      if (maxScroll <= 0) continue;

      const before = container.scrollTop;
      const step = Math.max(40, Math.floor(container.clientHeight * 0.35));
      const next = Math.max(0, Math.min(maxScroll, before + dir * step));
      if (next === before) continue;

      container.scrollTop = next;
      if (container.scrollTop !== before) {
        if (active instanceof HTMLElement && !isEditableElement(active)) safeFocus(active);
        return true;
      }
    }

    return false;
  }

  // Obsidian conflict modal: window capture runs before document listeners (Vim nav, etc.).
  // stopImmediatePropagation() only affects *other listeners on window* — it does NOT block
  // document capture. We must call stopPropagation() so the event never reaches document,
  // otherwise moveGlobalFocus() runs and jumps to the theme <select>.
  window.addEventListener(
    "keydown",
    (e) => {
      const modal = document.getElementById("obsidianConflictModal");
      if (!(modal instanceof HTMLElement) || modal.hidden) return;
      const raw = e.key;
      const rawLower = String(raw || "").toLowerCase();
      const code = e.code || "";
      /** Physical arrows: prefer e.key; some environments differ, so fall back to e.code. */
      const arrow =
        raw === "ArrowLeft" || raw === "ArrowRight" || raw === "ArrowUp" || raw === "ArrowDown"
          ? raw
          : code === "ArrowLeft" ||
              code === "ArrowRight" ||
              code === "ArrowUp" ||
              code === "ArrowDown"
            ? code
            : "";

      const digitChoice =
        raw === "1" || raw === "2"
          ? raw
          : code === "Digit1" || code === "Numpad1"
            ? "1"
            : code === "Digit2" || code === "Numpad2"
              ? "2"
              : "";
      const nav = getNavKeys(keyLayout);
      const logicalNav =
        rawLower === String(nav.left || "").toLowerCase()
          ? "left"
          : rawLower === String(nav.right || "").toLowerCase()
            ? "right"
            : rawLower === String(nav.up || "").toLowerCase()
              ? "up"
              : rawLower === String(nav.down || "").toLowerCase()
                ? "down"
                : "";

      if (arrow === "" && raw !== "Escape" && digitChoice === "" && logicalNav === "") {
        return;
      }
      // Do not use modKeyActive (Alt): AltGr / layout keys set altKey and would skip 1/2/arrows.
      if (e.ctrlKey || e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();
      try {
        e.stopImmediatePropagation();
      } catch {
        // ignore
      }

      const useAppBtn = document.getElementById("obsidianConflictUseApp");
      const useVaultBtn = document.getElementById("obsidianConflictUseVault");
      const cancelBtn = document.getElementById("obsidianConflictCancel");
      const panelFocusOrder = [useAppBtn, useVaultBtn, cancelBtn].filter(
        (el) => el instanceof HTMLElement
      );

      if (raw === "Escape") {
        if (typeof obsidianConflictResolve === "function") obsidianConflictResolve(null);
        return;
      }
      if (arrow === "ArrowLeft" || logicalNav === "left") {
        if (useAppBtn instanceof HTMLElement) useAppBtn.focus();
        return;
      }
      if (arrow === "ArrowRight" || logicalNav === "right") {
        if (useVaultBtn instanceof HTMLElement) useVaultBtn.focus();
        return;
      }
      if (arrow === "ArrowDown" || arrow === "ArrowUp" || logicalNav === "down" || logicalNav === "up") {
        const dir = arrow === "ArrowDown" || logicalNav === "down" ? 1 : -1;
        const ae = document.activeElement;
        let idx = ae instanceof HTMLElement ? panelFocusOrder.indexOf(ae) : -1;
        if (idx < 0) idx = arrow === "ArrowDown" ? -1 : panelFocusOrder.length;
        const next = (idx + dir + panelFocusOrder.length) % panelFocusOrder.length;
        const t = panelFocusOrder[next];
        if (t instanceof HTMLElement) t.focus();
        return;
      }
      if (digitChoice === "1") {
        if (typeof obsidianConflictResolve === "function") obsidianConflictResolve("app");
        return;
      }
      if (digitChoice === "2") {
        if (typeof obsidianConflictResolve === "function") obsidianConflictResolve("vault");
        return;
      }
    },
    true
  );

  // Prevent modifier alone (Alt on Win/Linux, Ctrl on Mac) from activating browser menu and closing the popup
  document.addEventListener(
    "keydown",
    (e) => {
      const modKey = useNavMacModifier() ? "Control" : "Alt";
      if (
        modKeyActive(e) &&
        (e.key === modKey || e.key === "Alt" || e.key === "Meta") &&
        (useNavMacModifier() ? !e.metaKey && !e.altKey : !e.ctrlKey && !e.metaKey)
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      const key = (e.key || "").toLowerCase();
      const nav = getNavKeys(keyLayout);

      // ESC in overlay views → go to main view (AI, Tabs, Instructions, About, Calendar).
      if (!modKeyActive(e) && !e.ctrlKey && !e.metaKey && key === "escape") {
        const activeEl = document.activeElement;
        if (activeEl === themeSelect && themeSelect instanceof HTMLSelectElement && themeSelectArmed) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setThemeSelectArmed(false);
          return;
        }
        if (
          activeEl === settingsThemeSelect &&
          settingsThemeSelect instanceof HTMLSelectElement &&
          settingsThemeSelectArmed
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setSettingsThemeSelectArmed(false);
          return;
        }
        if (
          activeEl === settingsHeaderTitleFontSelect &&
          settingsHeaderTitleFontSelect instanceof HTMLSelectElement &&
          settingsHeaderTitleFontSelectArmed
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setSettingsHeaderTitleFontSelectArmed(false);
          return;
        }
        const calendarViewEl = document.getElementById("calendarView");
        const calendarVisible =
          calendarViewEl instanceof HTMLElement && !calendarViewEl.hasAttribute("hidden");
        const inCalendar = calendarVisible && activeEl instanceof Element && activeEl.closest("#calendarView") !== null;
        if (inCalendar) {
          const inRightPane = activeEl instanceof Element && activeEl.closest(".calendarRightPane") !== null;
          if (inRightPane && calendarSelectedDayCell instanceof HTMLElement) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            safeFocus(calendarSelectedDayCell);
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          showNotesView();
          const calendarBtn = document.getElementById("calendarBtn");
          if (calendarBtn instanceof HTMLElement) safeFocus(calendarBtn);
          return;
        }
        const settingsViewEl = document.getElementById("settingsView");
        const instructionsViewEl = document.getElementById("instructionsView");
        const aboutViewEl = document.getElementById("aboutView");
        const inSettings = settingsViewEl instanceof HTMLElement && !settingsViewEl.hasAttribute("hidden");
        const inInstructions = instructionsViewEl instanceof HTMLElement && !instructionsViewEl.hasAttribute("hidden");
        const inAbout = aboutViewEl instanceof HTMLElement && !aboutViewEl.hasAttribute("hidden");
        if (inSettings || inInstructions || inAbout) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          showNotesView();
          if (addNoteButton instanceof HTMLElement) safeFocus(addNoteButton);
          return;
        }
      }

      // Autocomplete suggestion navigation (capture-phase):
      // When suggestions are visible for the New note input, mod+Up/mod+Down should
      // traverse the suggestion buttons rather than moving global focus.
      if (modKeyOnly(e) && (key === nav.down || key === nav.up)) {
        const activeEl0 = document.activeElement;
        const noteTextInput = document.getElementById("noteText");

        const inNewNoteInput = activeEl0 instanceof Element && noteTextInput instanceof Element && activeEl0 === noteTextInput;
        const inAutocomplete =
          activeEl0 instanceof Element &&
          noteAutocomplete instanceof HTMLElement &&
          noteAutocomplete.contains(activeEl0);

        if (inNewNoteInput || inAutocomplete) {
          const btns =
            noteAutocomplete instanceof HTMLElement && !noteAutocomplete.hidden
              ? Array.from(noteAutocomplete.querySelectorAll("button.monoLinkButton")).filter(
                  (b) => b instanceof HTMLButtonElement
                )
              : [];

          let idx = activeEl0 instanceof HTMLElement ? btns.indexOf(activeEl0) : -1;
          // When on the new note input (not a suggestion) and pressing up, go to header, not autocomplete.
          const skipAutocompleteForUp = inNewNoteInput && key === nav.up && idx < 0;
          if (!skipAutocompleteForUp && btns.length) {
            // If we're on the last suggestion and moving "down", exit suggestions to the next row.
            if (idx === btns.length - 1 && key === nav.down) {
              e.preventDefault();
              e.stopPropagation();
              try {
                e.stopImmediatePropagation();
              } catch {
                // ignore
              }
              for (const b of btns) b.removeAttribute("aria-current");
              const dashboardBtn = document.getElementById("dashboardBtn");
              if (dashboardBtn instanceof HTMLElement) safeFocus(dashboardBtn);
              return;
            }

            e.preventDefault();
            e.stopPropagation();
            // Ensure no other capture listeners process this navigation key.
            try {
              e.stopImmediatePropagation();
            } catch {
              // ignore
            }

            // If we're on the first suggestion and moving "up", go back to the input.
            if (idx === 0 && key === nav.up && noteTextInput instanceof HTMLElement) {
              for (const b of btns) b.removeAttribute("aria-current");
              safeFocus(noteTextInput);
              return;
            }

            if (idx < 0) {
              idx = key === nav.down ? 0 : btns.length - 1;
            } else {
              idx = idx + (key === nav.down ? +1 : -1);
              if (idx < 0) idx = btns.length - 1;
              if (idx >= btns.length) idx = 0;
            }

            for (let j = 0; j < btns.length; j++) {
              if (j === idx) btns[j].setAttribute("aria-current", "true");
              else btns[j].removeAttribute("aria-current");
            }
            safeFocus(btns[idx]);
            return;
          }
        }
      }

      const activeEl = document.activeElement;
      const inNotesUi =
        activeEl instanceof Element &&
        (activeEl.closest(".noteEditorArea") || activeEl.closest(".noteEditorToolbar") || activeEl.closest(".noteEditor"));

      const activeCard = activeEl instanceof Element ? getCardFromElement(activeEl) : null;
      const flippedCard =
        (activeCard && activeCard.classList.contains("is-flipped")
          ? activeCard
          : document.querySelector(".noteCard.is-flipped")) || null;

      // F2: rename board when focus is in Settings → Boards
      if (
        e.key === "F2" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !modKeyActive(e) &&
        !(activeEl instanceof Element && activeEl.closest(".manageTabsRenameInput"))
      ) {
        const inManageTabs =
          isBoardsManagePanelOpen() &&
          activeEl instanceof Element &&
          activeEl.closest("#settingsPanelBoards") !== null;
        const manageTabsRow =
          activeEl instanceof Element && activeEl.closest(".manageTabsRow");
        if (inManageTabs && manageTabsRow instanceof HTMLElement) {
          e.preventDefault();
          e.stopPropagation();
          startRenameTab(manageTabsRow);
          return;
        }
      }

      // F2: rename task when focus is on a card (front face, not in notes editor)
      if (
        e.key === "F2" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !modKeyActive(e) &&
        activeCard instanceof HTMLElement &&
        !inNotesUi &&
        !activeCard.classList.contains("is-flipped") &&
        !(activeEl instanceof Element && activeEl.closest(".noteTextRenameInput"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        startRename(activeCard);
        return;
      }

      const inAttachmentsUi =
        activeEl instanceof Element &&
        flippedCard instanceof HTMLElement &&
        flippedCard.contains(activeEl) &&
        !inNotesUi;

      // Esc while a notes editor is open should not let Chrome close the popup.
      // - If the editor is in insert mode, Esc exits to normal mode.
      // - If the editor is in visual mode, Esc exits to normal mode.
      // - If already in normal mode, Esc closes the notes editor.
      // Use openNoteEditorIds so we handle Escape even when focus has moved outside the editor.
      if (!e.ctrlKey && !e.metaKey && !modKeyActive(e) && e.key === "Escape" && openNoteEditorIds.size > 0) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        let card = activeCard;
        let noteId = card ? Number(card.dataset.noteId) : NaN;
        if (!Number.isFinite(noteId) || !openNoteEditorIds.has(noteId)) {
          noteId = [...openNoteEditorIds][0];
          card = document.querySelector(`.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`);
        }
        if (!Number.isFinite(noteId) || !(card instanceof HTMLElement)) return;

        const mode = vimGetMode(noteId);
        if (mode === "insert") {
          notesExitPending = null;
          vimClearPending(noteId);
          vimSetMode(noteId, "normal");

          // Keep focus in the editor if possible.
          const editor = card instanceof HTMLElement ? card.querySelector(".noteEditor") : null;
          if (editor instanceof HTMLElement) safeFocus(editor);
          return;
        }

        if (mode === "visual") {
          notesExitPending = null;
          vimClearPending(noteId);

          const editorArea =
            card instanceof HTMLElement ? card.querySelector(".noteEditorArea") : null;
          if (editorArea instanceof HTMLElement) {
            editorArea.focus();
            vimExitVisualMode(editorArea);
          } else {
            vimSetMode(noteId, "normal");
          }
          return;
        }

        notesExitPending = null;
        // Close without letting the helper move focus for us, then place focus
        // on a stable control within the same card.
        setNotesEditorOpen(noteId, false, { focusEditor: false, focusToggleOnClose: false });

        if (card instanceof HTMLElement) {
          const notesBtn = card.querySelector("button[data-action='toggleNotes']");
          if (notesBtn instanceof HTMLElement && safeFocus(notesBtn)) return;
          focusCardPrimaryAction(card);
        }
        return;
      }

      // Attachments exit command: :x (non-typing contexts)
      if (!e.ctrlKey && !e.metaKey && !modKeyActive(e) && inAttachmentsUi) {
        const typingTarget = activeEl && isEditableElement(activeEl);

        if (attachmentsExitPending) {
          const pending = attachmentsExitPending;
          attachmentsExitPending = null;
          clearTimeout(pending.timer);

          if (key === "x") {
            e.preventDefault();
            e.stopPropagation();
            const card = document.querySelector(
              `.noteCard[data-note-id="${CSS.escape(String(pending.noteId))}"]`
            );
            if (card instanceof HTMLElement) {
              card.classList.remove("is-flipped");
              flippedNoteIds.delete(pending.noteId);
              requestAnimationFrame(() => morphCardHeight(card));
              const flipBtn = card.querySelector("button[data-action='flip']");
              if (flipBtn instanceof HTMLElement) safeFocus(flipBtn);
            }
            return;
          }
        }

        if (!typingTarget && key === ":") {
          const card = flippedCard instanceof HTMLElement ? flippedCard : activeCard;
          const noteId = card ? Number(card.dataset.noteId) : NaN;
          if (Number.isFinite(noteId)) {
            e.preventDefault();
            e.stopPropagation();
            const timer = setTimeout(() => {
              if (!attachmentsExitPending) return;
              attachmentsExitPending = null;
            }, 700);
            attachmentsExitPending = { noteId, timer };
            return;
          }
        }
      }

      // Attachments navigation (flipped card)
      // Allow the same directional mappings to traverse back-side controls.
      if (inAttachmentsUi && modKeyOnly(e)) {
        const isUp = key === nav.up;
        const isDown = key === nav.down;
        const isLeft = key === nav.left;
        const isRight = key === nav.right;

        if (isLeft || isRight || isDown || isUp) {
          e.preventDefault();
          e.stopPropagation();
          const card = flippedCard instanceof HTMLElement ? flippedCard : activeCard;
          if (card instanceof HTMLElement) {
            const inButtonsRow =
              document.activeElement instanceof Element &&
              document.activeElement.closest(".noteBackButtonsRow") !== null;

            if (isUp) {
              const inLinkRow =
                document.activeElement instanceof Element &&
                document.activeElement.closest(".linkRow") !== null;
              if (inLinkRow) {
                moveFocusWithinAttachmentsLinkRows(card, -1);
                return;
              }
              if (moveFocusWithinAttachmentsLinkRows(card, -1)) return;
              moveFocusWithinAttachments(card, -1);
              return;
            }

            if (isDown) {
              const inLinkRow =
                document.activeElement instanceof Element &&
                document.activeElement.closest(".linkRow") !== null;
              if (inLinkRow) {
                moveFocusWithinAttachmentsLinkRows(card, +1);
                return;
              }
              if (moveFocusWithinAttachmentsLinkRows(card, +1)) return;
              moveFocusWithinAttachments(card, +1);
              return;
            }

            if (isLeft) {
              if (inButtonsRow && moveFocusWithinAttachmentsButtonsRow(card, -1)) return;
              moveFocusWithinAttachments(card, -1);
              return;
            }

            if (isRight) {
              if (inButtonsRow && moveFocusWithinAttachmentsButtonsRow(card, +1)) return;
              moveFocusWithinAttachments(card, +1);
              return;
            }
          }
          return;
        }
      }

      // mod+<layout key> (within notes): insert/toggle checkbox at line start.
      const checkboxKey = getNotesCheckboxKey(keyLayout);
      if (
        inNotesUi &&
        modKeyOnly(e) &&
        key === checkboxKey
      ) {
        const editor = activeEl instanceof Element ? activeEl.closest(".noteEditorArea") : null;
        if (editor instanceof HTMLElement) {
          e.preventDefault();
          e.stopPropagation();
          editor.focus();
          toggleOrInsertLineCheckbox(editor);
          return;
        }
      }

      // While in notes, mod+<nav key> should move caret in insert mode, not trigger navigation
      if (
        inNotesUi &&
        modKeyOnly(e) &&
        (key === nav.left || key === nav.right || key === nav.up || key === nav.down)
      ) {
        // Do not handle navigation if this is the checkbox key (let the checkbox handler above run it)
        if (key === checkboxKey) return;
        let noteEditor = activeEl instanceof Element ? activeEl.closest('.noteEditorArea') : null;
        let noteId = noteEditor ? getNoteIdFromEditor(noteEditor) : null;
        let mode = noteId !== null ? vimGetMode(noteId) : null;
        if (mode === 'insert' && noteEditor) {
          // Move caret in the appropriate direction
          e.preventDefault();
          e.stopPropagation();
          if (key === nav.left) moveSelection('backward', 'character');
          else if (key === nav.right) moveSelection('forward', 'character');
          else if (key === nav.up) moveSelection('backward', 'line');
          else if (key === nav.down) moveSelection('forward', 'line');
          return;
        } else if (mode === 'visual' && noteEditor) {
          // Extend selection in visual mode (no Shift required)
          e.preventDefault();
          e.stopPropagation();
          if (noteEditor instanceof HTMLElement) noteEditor.focus();
          if (key === nav.left) extendSelection('backward', 'character');
          else if (key === nav.right) extendSelection('forward', 'character');
          else if (key === nav.up) extendSelection('backward', 'line');
          else if (key === nav.down) extendSelection('forward', 'line');
          return;
        } else if (mode !== 'insert') {
          e.preventDefault();
          e.stopPropagation();
          if (noteEditor instanceof HTMLElement) noteEditor.focus();
          if (key === nav.left) moveSelection('backward', 'character');
          else if (key === nav.right) moveSelection('forward', 'character');
          else if (key === nav.up) moveSelection('backward', 'line');
          else if (key === nav.down) moveSelection('forward', 'line');
          return;
        }
      }

      // Notes exit command: :x
      // We avoid stealing ':' unless focus is in a notes editor.
      if (!e.ctrlKey && !e.metaKey && !modKeyActive(e)) {
        const inNotesEditor =
          activeEl instanceof Element &&
          (activeEl.closest(".noteEditorArea") || activeEl.closest(".noteEditorToolbar"));

        // Make the line checkbox removable like text.
        if (inNotesEditor && (e.key === "Backspace" || e.key === "Delete")) {
          const editor = activeEl instanceof Element ? activeEl.closest(".noteEditorArea") : null;
          if (editor instanceof HTMLElement) {
            const removed = removeLeadingLineCheckboxIfAppropriate(editor, e.key);
            if (removed) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }

        if (notesExitPending) {
          const pending = notesExitPending;
          notesExitPending = null;
          clearTimeout(pending.timer);

          if (key === "x") {
            e.preventDefault();
            e.stopPropagation();
            closeNotesEditorFromCommand(pending.noteId, { focusEditor: false, focusToggleOnClose: true });
            return;
          }

          // Not an ':x' sequence; insert ':' where it was requested, then allow this key.
          try {
            if (pending.range) {
              const sel = window.getSelection();
              if (sel) {
                sel.removeAllRanges();
                sel.addRange(pending.range);
              }
            }
            document.execCommand("insertText", false, ":");
          } catch {
            // ignore
          }
          // fall through to handle this key normally
        }

        if (inNotesEditor && e.key === ":") {
          const card = getCardFromElement(activeEl);
          const noteId = card ? Number(card.dataset.noteId) : NaN;
          if (Number.isFinite(noteId)) {
            e.preventDefault();
            e.stopPropagation();

            let range = null;
            try {
              const sel = window.getSelection();
              if (sel && sel.rangeCount) range = sel.getRangeAt(0).cloneRange();
            } catch {
              // ignore
            }

            const timer = setTimeout(() => {
              if (!notesExitPending) return;
              const p = notesExitPending;
              notesExitPending = null;
              try {
                const curActive = document.activeElement;
                const stillInSameEditor =
                  curActive instanceof Element &&
                  (curActive.closest(`.noteCard[data-note-id="${CSS.escape(String(p.noteId))}"]`) !== null);
                if (!stillInSameEditor) return;
                if (p.range) {
                  const sel = window.getSelection();
                  if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(p.range);
                  }
                }
                document.execCommand("insertText", false, ":");
              } catch {
                // ignore
              }
            }, 700);

            notesExitPending = { noteId, range, timer };
            return;
          }
        }
      }

      if (!modKeyActive(e) || (useNavMacModifier() ? (e.metaKey || e.altKey) : (e.ctrlKey || e.metaKey))) return;

      const focusNewNoteKey = getFocusNewNoteKey(keyLayout);
      if (key === focusNewNoteKey) {
        e.preventDefault();
        e.stopPropagation();
        const notesView = document.getElementById("notesView");
        const notesVisible =
          notesView instanceof HTMLElement && !notesView.hasAttribute("hidden");
        if (notesVisible) {
          setAddNoteModalVisible(true);
        }
        return;
      }

      if (key === nav.down) {
        const activeEl2 = document.activeElement;
        if (activeEl2 instanceof Element && (activeEl2.closest(".noteDueDateInput") || activeEl2.closest(".noteTextRenameInput") || activeEl2.closest(".manageTabsRenameInput"))) return;
        e.preventDefault();
        e.stopPropagation();

        if (activeEl2 === themeSelect && themeSelect instanceof HTMLSelectElement && themeSelectArmed) {
          try {
            e.stopImmediatePropagation();
          } catch {
            // ignore
          }
          cycleThemeSelectControl(themeSelect, +1);
          return;
        }
        if (
          activeEl2 === settingsThemeSelect &&
          settingsThemeSelect instanceof HTMLSelectElement &&
          settingsThemeSelectArmed
        ) {
          try {
            e.stopImmediatePropagation();
          } catch {
            // ignore
          }
          cycleThemeSelectControl(settingsThemeSelect, +1);
          return;
        }
        if (
          activeEl2 === settingsHeaderTitleFontSelect &&
          settingsHeaderTitleFontSelect instanceof HTMLSelectElement &&
          settingsHeaderTitleFontSelectArmed
        ) {
          try {
            e.stopImmediatePropagation();
          } catch {
            // ignore
          }
          cycleThemeSelectControl(settingsHeaderTitleFontSelect, +1);
          return;
        }

        {
          const instructionsView = document.getElementById("instructionsView");
          const inInstructions =
            instructionsView instanceof HTMLElement &&
            !instructionsView.hasAttribute("hidden") &&
            activeEl2 instanceof Element &&
            activeEl2.closest("#instructionsView") !== null;
          if (inInstructions) {
            moveInstructionsFocus(+1);
            return;
          }
        }

        {
          const aboutViewEl = document.getElementById("aboutView");
          const inAbout =
            aboutViewEl instanceof HTMLElement &&
            !aboutViewEl.hasAttribute("hidden") &&
            activeEl2 instanceof Element &&
            activeEl2.closest("#aboutView") !== null;
          if (inAbout) {
            moveAboutFocus(+1);
            return;
          }
        }

        if (moveCreateFormFocusByVisualDirection(key, nav)) return;
        if (moveBoardsSettingsFocus("down")) return;

        // Settings: vertical = sidebar tabs or panel fields; not the same as global linear order.
        {
          const settingsView = document.getElementById("settingsView");
          const settingsVisible =
            settingsView instanceof HTMLElement && !settingsView.hasAttribute("hidden");
          const inSettings =
            settingsVisible && activeEl2 instanceof Element && activeEl2.closest("#settingsView") !== null;
          if (inSettings) {
            const tabs = getSettingsSidebarTabs();
            const tablist = settingsView.querySelector(".settingsTablist");
            const inTablist =
              activeEl2 instanceof Element &&
              tablist instanceof HTMLElement &&
              tablist.contains(activeEl2);
            const panelFocusables = getSettingsActivePanelFocusables();
            const panelIndex = activeEl2 instanceof HTMLElement ? panelFocusables.indexOf(activeEl2) : -1;
            const closeBtn = document.getElementById("closeSettingsBtn");
            if (inTablist) {
              const idx = tabs.indexOf(activeEl2);
              const nextIdx = idx >= 0 && idx < tabs.length - 1 ? idx + 1 : 0;
              if (idx >= 0 && tabs[nextIdx]) {
                activateSettingsSidebarTab(tabs[nextIdx]);
                safeFocus(tabs[nextIdx]);
              }
              return;
            }
            if (panelIndex >= 0 && panelIndex < panelFocusables.length - 1) {
              focusSettingsPanelControl(panelFocusables[panelIndex + 1]);
              return;
            }
            if (
              panelIndex >= 0 &&
              panelIndex === panelFocusables.length - 1 &&
              closeBtn instanceof HTMLElement
            ) {
              safeFocus(closeBtn);
              return;
            }
            if (activeEl2 === closeBtn) {
              const boardsTab = document.getElementById("settingsTabBoards");
              if (boardsTab instanceof HTMLElement && safeFocus(boardsTab)) return;
              const pf = panelFocusables;
              if (pf.length) safeFocus(pf[0]);
              else moveGlobalFocus(+1);
              return;
            }
            moveGlobalFocus(+1);
            return;
          }
        }

        // Settings → Boards (manage list): down moves to next row (not across row buttons).
        {
          const inManageTabs =
            isBoardsManagePanelOpen() &&
            activeEl2 instanceof Element &&
            activeEl2.closest("#settingsPanelBoards") !== null;
          if (inManageTabs) {
            const inHeaderLinks =
              activeEl2 instanceof Element &&
              activeEl2.closest(".headerLinks") !== null;
            const inManageTabsRow = activeEl2 instanceof Element && activeEl2.closest(".manageTabsRow") !== null;
            if (!inHeaderLinks && inManageTabsRow) {
              if (moveFocusAcrossManageTabsRows(+1)) return;
            }
          }
        }

        // Calendar: down moves to next row (same column); on task link, move to next link.
        {
          const calendarViewEl = document.getElementById("calendarView");
          const calendarVisible =
            calendarViewEl instanceof HTMLElement && !calendarViewEl.hasAttribute("hidden");
          const inCalendar =
            calendarVisible && activeEl2 instanceof Element && activeEl2.closest("#calendarView") !== null;
          const onCalendarDayCell = activeEl2 instanceof Element && activeEl2.classList.contains("calendarDayCell");
          const onCalendarTaskLink = activeEl2 instanceof Element && activeEl2.classList.contains("calendarTaskLink");
          if (inCalendar && onCalendarDayCell && moveCalendarFocus(1, 0)) return;
          if (inCalendar && onCalendarTaskLink) {
            const links = document.querySelectorAll(".calendarTaskLink");
            const idx = activeEl2 ? [...links].indexOf(activeEl2) : -1;
            if (idx >= 0 && idx < links.length - 1 && links[idx + 1] instanceof HTMLElement) {
              safeFocus(links[idx + 1]);
              return;
            }
          }
        }

        // Notes board: Alt+down from Pending/Complete column headers → first card or expand + focus.
        {
          const notesViewEl = document.getElementById("notesView");
          const notesVisible =
            notesViewEl instanceof HTMLElement && !notesViewEl.hasAttribute("hidden");
          const board = document.getElementById("notesBoard");
          const colPending = document.getElementById("colPending");
          const colComplete = document.getElementById("colComplete");
          const pendingList = document.getElementById("pendingList");
          const completeList = document.getElementById("completeList");
          if (
            notesVisible &&
            board instanceof HTMLElement &&
            colPending instanceof HTMLElement &&
            colComplete instanceof HTMLElement &&
            pendingList instanceof HTMLElement &&
            completeList instanceof HTMLElement &&
            (activeEl2 === colPending || activeEl2 === colComplete)
          ) {
            if (board.classList.contains("board--split-pending") && activeEl2 === colPending) {
              const first = pendingList.querySelector(".noteCard");
              if (first instanceof HTMLElement) {
                focusCardPrimaryAction(first);
                return;
              }
              return;
            }
            if (board.classList.contains("board--split-complete") && activeEl2 === colComplete) {
              const first = completeList.querySelector(".noteCard");
              if (first instanceof HTMLElement) {
                focusCardPrimaryAction(first);
                return;
              }
              return;
            }
            if (board.classList.contains("board--split-pending") && activeEl2 === colComplete) {
              setBoardColumnSplit("complete");
              requestAnimationFrame(() => {
                const first = completeList.querySelector(".noteCard");
                if (first instanceof HTMLElement) focusCardPrimaryAction(first);
              });
              return;
            }
            if (board.classList.contains("board--split-complete") && activeEl2 === colPending) {
              setBoardColumnSplit("pending");
              requestAnimationFrame(() => {
                const first = pendingList.querySelector(".noteCard");
                if (first instanceof HTMLElement) focusCardPrimaryAction(first);
              });
              return;
            }
          }
        }

        const activeCard2 = activeEl2 instanceof Element ? getCardFromElement(activeEl2) : null;
        if (activeCard2 instanceof HTMLElement) {
          const inFrontAttachments2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteAttachmentsItems") !== null;
          const inCardActions2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteActions") !== null;
          const inNoteDueDateRow2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteDueDateRow") !== null;

          // Vertical levels:
          // due date row -> attachments row -> action row -> next card
          if (inNoteDueDateRow2) {
            const links = getFrontAttachmentLinks(activeCard2);
            if (links.length) {
              if (safeFocus(links[0])) return;
            }
            focusCardPrimaryAction(activeCard2);
            return;
          }
          if (inFrontAttachments2) {
            focusCardPrimaryAction(activeCard2);
            return;
          }
          if (inCardActions2 || activeEl2 instanceof Element) {
            if (focusAdjacentCardFrontAttachment(activeCard2, +1)) return;
            if (focusAdjacentCardPrimaryAction(activeCard2, +1)) return;
          }
        }
        const dashboardViewForScroll = document.getElementById("dashboardView");
        const dashboardVisibleForScroll =
          dashboardViewForScroll instanceof HTMLElement && !dashboardViewForScroll.hasAttribute("hidden");
        const inDashboard =
          dashboardVisibleForScroll &&
          activeEl2 instanceof Element &&
          activeEl2.closest("#dashboardView") !== null;

        const inCalendar =
          calendarView instanceof HTMLElement &&
          !calendarView.hasAttribute("hidden") &&
          activeEl2 instanceof Element &&
          activeEl2.closest("#calendarView") !== null;

        const belowTabs =
          activeEl2 instanceof Element &&
          (
            activeEl2.closest(".board") !== null ||
            activeEl2.closest(".col") !== null ||
            activeEl2.closest(".list") !== null ||
            activeEl2.closest(".noteEditor") !== null ||
            activeEl2.closest(".noteBackBody") !== null
          );
        if ((belowTabs || inDashboard || inCalendar) && tryScrollBeforeSectionMove(+1)) return;

        // If the user just switched boards via Alt+1..Alt+9, "down" should enter
        // the cards area (first card) rather than stepping through global UI.
        if (lastBoardShortcutAt) {
          const ageMs = Date.now() - lastBoardShortcutAt;
          if (ageMs >= 0 && ageMs <= 1500) {
            lastBoardShortcutAt = 0;
            const notesView = document.getElementById("notesView");
            const notesVisible =
              notesView instanceof HTMLElement && !notesView.hasAttribute("hidden");
            if (notesVisible) {
              const cards = getAllCardsInDomOrder();
              if (cards.length) {
                focusCardPrimaryAction(cards[0]);
                return;
              }
            }
          } else {
            lastBoardShortcutAt = 0;
          }
        }

        const card = getCardFromElement(activeEl2);
        if (card) {
          moveCardFocus(+1);
          return;
        }

        // If focus is on the header links row, "down" should enter the view's primary control.
        const inHeaderLinks =
          activeEl2 instanceof Element &&
          activeEl2.closest(".headerLinks") !== null;

        if (inHeaderLinks) {
          const notesView = document.getElementById("notesView");
          const instructionsView = document.getElementById("instructionsView");
          const aboutView = document.getElementById("aboutView");
          const dashboardView = document.getElementById("dashboardView");
          const settingsView = document.getElementById("settingsView");

          const notesVisible = notesView instanceof HTMLElement && !notesView.hasAttribute("hidden");
          const instructionsVisible =
            instructionsView instanceof HTMLElement && !instructionsView.hasAttribute("hidden");
          const aboutVisible = aboutView instanceof HTMLElement && !aboutView.hasAttribute("hidden");
          const dashboardVisible =
            dashboardView instanceof HTMLElement && !dashboardView.hasAttribute("hidden");
          const settingsVisible =
            settingsView instanceof HTMLElement && !settingsView.hasAttribute("hidden");

          if (notesVisible) {
            const searchAlignedHeaderControl =
              activeEl2 === document.getElementById("themeSelect") ||
              activeEl2 === document.getElementById("instructionsLink") ||
              activeEl2 === document.getElementById("aboutLink");
            if (searchAlignedHeaderControl && cardFilterInput instanceof HTMLElement) {
              safeFocus(cardFilterInput);
            } else if (addNoteButton instanceof HTMLElement) {
              safeFocus(addNoteButton);
            }
            return;
          }

          if (isBoardsManagePanelOpen()) {
            const addTabName = document.getElementById("addTabName");
            if (addTabName instanceof HTMLElement) safeFocus(addTabName);
            return;
          }

          if (settingsVisible) {
            const closeBtn = document.getElementById("closeSettingsBtn");
            if (closeBtn instanceof HTMLElement) safeFocus(closeBtn);
            return;
          }

          if (dashboardVisible) {
            const closeBtn = document.getElementById("closeDashboardBtn");
            if (closeBtn instanceof HTMLElement) safeFocus(closeBtn);
            return;
          }

          const calendarVisible =
            calendarView instanceof HTMLElement && !calendarView.hasAttribute("hidden");
          if (calendarVisible) {
            const closeBtn = document.getElementById("closeCalendarBtn");
            if (closeBtn instanceof HTMLElement) safeFocus(closeBtn);
            return;
          }

          if (instructionsVisible) {
            const closeBtn = document.getElementById("closeInstructionsBtn");
            if (closeBtn instanceof HTMLElement) safeFocus(closeBtn);
            return;
          }

          if (aboutVisible) {
            const closeBtn = document.getElementById("closeAboutBtn");
            if (closeBtn instanceof HTMLElement) safeFocus(closeBtn);
            return;
          }
        }

        // Down from create fields follows the visual layout: due shortcuts, then modules.
        {
          const noteText = document.getElementById("noteText");
          const noteDueDate = document.getElementById("noteDueDate");
          const dashboardBtn = document.getElementById("dashboardBtn");
          const firstDueQuick = document.querySelector("#createForm [data-due-quick]");
          if (activeEl2 === noteDueDate) {
            setCreateDueQuickVisible(true);
            if (
              (firstDueQuick instanceof HTMLElement && safeFocus(firstDueQuick)) ||
              focusFirstCreateDueQuickButton()
            ) {
              return;
            }
          }
          if (activeEl2 === noteText && dashboardBtn instanceof HTMLElement && safeFocus(dashboardBtn)) return;
        }

        // If focus is on the create actions row, "down" should go to the filter (if any) then the board columns.
        const dashboardBtn = document.getElementById("dashboardBtn");
        const calendarBtn = document.getElementById("calendarBtn");
        const createSubmitBtn = document.querySelector("#createForm button[type='submit']");
        const isCreateActionEl =
          activeEl2 === dashboardBtn ||
          activeEl2 === calendarBtn ||
          activeEl2 === createSubmitBtn ||
          (activeEl2 instanceof Element &&
            (activeEl2.closest(".createDueQuickActions") !== null ||
              activeEl2.closest(".createSubmitCell") !== null ||
              activeEl2.closest(".createModuleActions") !== null));

        if (isCreateActionEl) {
          if (addNoteModal instanceof HTMLElement && !addNoteModal.hidden) {
            const noteText = document.getElementById("noteText");
            if (noteText instanceof HTMLElement) safeFocus(noteText);
            return;
          }
          const cardFilterInput = document.getElementById("cardFilterInput");
          if (cardFilterInput instanceof HTMLElement && safeFocus(cardFilterInput)) return;

          const board = document.getElementById("notesBoard");
          const colPending = document.getElementById("colPending");
          const colComplete = document.getElementById("colComplete");
          if (
            board instanceof HTMLElement &&
            colPending instanceof HTMLElement &&
            colComplete instanceof HTMLElement
          ) {
            const expanded =
              board.classList.contains("board--split-complete") ? colComplete : colPending;
            if (safeFocus(expanded)) return;
          }
          const cards = getAllCardsInDomOrder();
          if (cards.length) focusCardPrimaryAction(cards[0]);
          return;
        }

        // Board tabs (main strip): down enters the expanded Pending/Complete column or first card.
        const inBoardTabs =
          activeEl2 instanceof Element &&
          activeEl2.closest("#boardTabs") !== null;

        if (inBoardTabs) {
          const board = document.getElementById("notesBoard");
          const colPending = document.getElementById("colPending");
          const colComplete = document.getElementById("colComplete");
          if (
            board instanceof HTMLElement &&
            colPending instanceof HTMLElement &&
            colComplete instanceof HTMLElement
          ) {
            const expanded =
              board.classList.contains("board--split-complete") ? colComplete : colPending;
            if (safeFocus(expanded)) return;
          }
          const cards = getAllCardsInDomOrder();
          if (cards.length) focusCardPrimaryAction(cards[0]);
          else {
            if (addNoteButton instanceof HTMLElement) safeFocus(addNoteButton);
          }
          return;
        }

        // From search/filter input, move down to the active board tab, then into the board columns.
        const cardFilterInput = document.getElementById("cardFilterInput");
        if (activeEl2 === cardFilterInput) {
          const activeBoardTab = document.querySelector(
            `#boardTabs [role='tab'][data-board="${CSS.escape(String(activeBoard))}"]`
          );
          if (activeBoardTab instanceof HTMLElement && safeFocus(activeBoardTab)) return;
          const selectedTab = document.querySelector("#boardTabs [role='tab'][aria-selected='true']");
          if (selectedTab instanceof HTMLElement && safeFocus(selectedTab)) return;
          const firstTab = document.querySelector("#boardTabs .bx--tabs__nav-link");
          if (firstTab instanceof HTMLElement && safeFocus(firstTab)) return;
          const notesBoard = document.getElementById("notesBoard");
          const colPending = document.getElementById("colPending");
          const colComplete = document.getElementById("colComplete");
          if (
            notesBoard instanceof HTMLElement &&
            colPending instanceof HTMLElement &&
            colComplete instanceof HTMLElement
          ) {
            const expanded =
              notesBoard.classList.contains("board--split-complete") ? colComplete : colPending;
            if (safeFocus(expanded)) return;
          }
        }

        moveGlobalFocus(+1);
        return;
      }

      if (key === nav.up) {
        const activeEl2 = document.activeElement;
        if (activeEl2 instanceof Element && (activeEl2.closest(".noteDueDateInput") || activeEl2.closest(".noteTextRenameInput") || activeEl2.closest(".manageTabsRenameInput"))) return;
        e.preventDefault();
        e.stopPropagation();

        if (activeEl2 === cardFilterInput) {
          const headerTargets = getHeaderNavTargets();
          const firstHeaderTarget = headerTargets[0];
          if (firstHeaderTarget instanceof HTMLElement && safeFocus(firstHeaderTarget)) return;
        }
        if (activeEl2 === addNoteButton) {
          const settingsButton = document.getElementById("settingsBtn");
          if (settingsButton instanceof HTMLElement && safeFocus(settingsButton)) return;
        }

        if (activeEl2 === themeSelect && themeSelect instanceof HTMLSelectElement && themeSelectArmed) {
          try {
            e.stopImmediatePropagation();
          } catch {
            // ignore
          }
          cycleThemeSelectControl(themeSelect, -1);
          return;
        }
        if (
          activeEl2 === settingsThemeSelect &&
          settingsThemeSelect instanceof HTMLSelectElement &&
          settingsThemeSelectArmed
        ) {
          try {
            e.stopImmediatePropagation();
          } catch {
            // ignore
          }
          cycleThemeSelectControl(settingsThemeSelect, -1);
          return;
        }
        if (
          activeEl2 === settingsHeaderTitleFontSelect &&
          settingsHeaderTitleFontSelect instanceof HTMLSelectElement &&
          settingsHeaderTitleFontSelectArmed
        ) {
          try {
            e.stopImmediatePropagation();
          } catch {
            // ignore
          }
          cycleThemeSelectControl(settingsHeaderTitleFontSelect, -1);
          return;
        }

        {
          const instructionsView = document.getElementById("instructionsView");
          const inInstructions =
            instructionsView instanceof HTMLElement &&
            !instructionsView.hasAttribute("hidden") &&
            activeEl2 instanceof Element &&
            activeEl2.closest("#instructionsView") !== null;
          if (inInstructions) {
            moveInstructionsFocus(-1);
            return;
          }
        }

        {
          const aboutViewEl = document.getElementById("aboutView");
          const inAbout =
            aboutViewEl instanceof HTMLElement &&
            !aboutViewEl.hasAttribute("hidden") &&
            activeEl2 instanceof Element &&
            activeEl2.closest("#aboutView") !== null;
          if (inAbout) {
            moveAboutFocus(-1);
            return;
          }
        }

        if (moveCreateFormFocusByVisualDirection(key, nav)) return;
        if (moveBoardsSettingsFocus("up")) return;

        // Settings: vertical = previous tab, previous panel field, or sidebar from first field.
        {
          const settingsView = document.getElementById("settingsView");
          const settingsVisible =
            settingsView instanceof HTMLElement && !settingsView.hasAttribute("hidden");
          const inSettings =
            settingsVisible && activeEl2 instanceof Element && activeEl2.closest("#settingsView") !== null;
          if (inSettings) {
            const tabs = getSettingsSidebarTabs();
            const tablist = settingsView.querySelector(".settingsTablist");
            const inTablist =
              activeEl2 instanceof Element &&
              tablist instanceof HTMLElement &&
              tablist.contains(activeEl2);
            const panelFocusables = getSettingsActivePanelFocusables();
            const panelIndex = activeEl2 instanceof HTMLElement ? panelFocusables.indexOf(activeEl2) : -1;
            const closeBtn = document.getElementById("closeSettingsBtn");
            if (inTablist) {
              const idx = tabs.indexOf(activeEl2);
              const boardsTabEl = document.getElementById("settingsTabBoards");
              if (boardsTabEl instanceof HTMLElement && activeEl2 === boardsTabEl && closeBtn instanceof HTMLElement) {
                safeFocus(closeBtn);
                return;
              }
              const nextIdx = idx <= 0 ? tabs.length - 1 : idx - 1;
              if (idx >= 0 && tabs[nextIdx]) {
                activateSettingsSidebarTab(tabs[nextIdx]);
                safeFocus(tabs[nextIdx]);
              }
              return;
            }
            if (panelIndex > 0) {
              focusSettingsPanelControl(panelFocusables[panelIndex - 1]);
              return;
            }
            if (panelIndex === 0) {
              const sel = getSettingsSelectedTabEl();
              if (sel) safeFocus(sel);
              return;
            }
            if (activeEl2 === closeBtn) {
              const gear = document.getElementById("settingsBtn");
              if (gear instanceof HTMLElement) {
                safeFocus(gear);
                return;
              }
              const pf = panelFocusables;
              if (pf.length) safeFocus(pf[pf.length - 1]);
              return;
            }
            moveGlobalFocus(-1);
            return;
          }
        }

        // Settings → Boards (manage list): up moves to previous row, or from add form toward Close.
        {
          const inManageTabs =
            isBoardsManagePanelOpen() &&
            activeEl2 instanceof Element &&
            activeEl2.closest("#settingsPanelBoards") !== null;
          if (inManageTabs) {
            const inHeaderLinks =
              activeEl2 instanceof Element &&
              activeEl2.closest(".headerLinks") !== null;
            const inManageTabsRow = activeEl2 instanceof Element && activeEl2.closest(".manageTabsRow") !== null;
            const addTabName = document.getElementById("addTabName");
            const addTabForm = document.getElementById("addTabForm");
            const inAddTabForm =
              activeEl2 === addTabName ||
              (addTabForm instanceof HTMLElement && addTabForm.contains(activeEl2));
            const closeSettingsBtn2 = document.getElementById("closeSettingsBtn");
            if (activeEl2 === closeSettingsBtn2 && closeSettingsBtn2 instanceof HTMLElement) {
              moveGlobalFocus(-1);
              return;
            }
            if (inAddTabForm) {
              if (closeSettingsBtn2 instanceof HTMLElement && safeFocus(closeSettingsBtn2)) return;
            }
            if (!inHeaderLinks && inManageTabsRow) {
              if (moveFocusAcrossManageTabsRows(-1)) return;
            }
          }
        }

        // Calendar: up moves to previous row (same column).
        {
          const calendarViewEl = document.getElementById("calendarView");
          const calendarVisible =
            calendarViewEl instanceof HTMLElement && !calendarViewEl.hasAttribute("hidden");
          const inCalendar =
            calendarVisible && activeEl2 instanceof Element && activeEl2.closest("#calendarView") !== null;
          const onCalendarDayCell = activeEl2 instanceof Element && activeEl2.classList.contains("calendarDayCell");
          const onCalendarTaskLink = activeEl2 instanceof Element && activeEl2.classList.contains("calendarTaskLink");
          if (inCalendar && onCalendarDayCell && moveCalendarFocus(-1, 0)) return;
          if (inCalendar && onCalendarTaskLink) {
            const links = document.querySelectorAll(".calendarTaskLink");
            const idx = activeEl2 ? [...links].indexOf(activeEl2) : -1;
            if (idx <= 0 && calendarSelectedDayCell instanceof HTMLElement) {
              safeFocus(calendarSelectedDayCell);
              return;
            }
            if (idx > 0 && links[idx - 1] instanceof HTMLElement) {
              safeFocus(links[idx - 1]);
              return;
            }
          }
        }

        // Create form: up from shortcuts/modules returns to the related field row.
        {
          const noteText = document.getElementById("noteText");
          const noteDueDate = document.getElementById("noteDueDate");
          const dashboardBtn = document.getElementById("dashboardBtn");
          const calendarBtn = document.getElementById("calendarBtn");
          const createSubmitBtn = document.querySelector("#createForm button[type='submit']");
          const inCreateDueQuick =
            activeEl2 instanceof Element && activeEl2.closest(".createDueQuickActions") !== null;
          const inCreateButtons =
            activeEl2 === dashboardBtn ||
            activeEl2 === calendarBtn ||
            activeEl2 === createSubmitBtn ||
            (activeEl2 instanceof Element &&
              (activeEl2.closest(".createSubmitCell") !== null ||
                activeEl2.closest(".createModuleActions") !== null));
          const inCreateNoteRow =
            activeEl2 === noteText ||
            activeEl2 === noteDueDate;

          if (inCreateDueQuick) {
            if (noteDueDate instanceof HTMLElement && safeFocus(noteDueDate)) return;
            return;
          }
          if (inCreateButtons) {
            if (noteText instanceof HTMLElement && safeFocus(noteText)) return;
            return;
          }
          if (inCreateNoteRow) {
            const themeSelectEl = document.getElementById("themeSelect");
            if (themeSelectEl instanceof HTMLElement && safeFocus(themeSelectEl)) return;
            return;
          }
        }

        // Board tabs (main strip): up moves toward filter / create row.
        {
          const inBoardTabs =
            activeEl2 instanceof Element &&
            activeEl2.closest("#boardTabs") !== null;

          if (inBoardTabs) {
            const cardFilterInput = document.getElementById("cardFilterInput");
            if (cardFilterInput instanceof HTMLElement && isElementInVisibleView(cardFilterInput) && safeFocus(cardFilterInput)) return;
            if (addNoteButton instanceof HTMLElement && safeFocus(addNoteButton)) return;
            // Fallback: moveGlobalFocus finds the previous focusable in the global order.
            moveGlobalFocus(-1);
            return;
          }
        }

        // Notes board: Alt+up from Pending/Complete column headers → main board tab strip.
        {
          const notesViewEl = document.getElementById("notesView");
          const notesVisible =
            notesViewEl instanceof HTMLElement && !notesViewEl.hasAttribute("hidden");
          const colPending = document.getElementById("colPending");
          const colComplete = document.getElementById("colComplete");
          if (
            notesVisible &&
            (activeEl2 === colPending || activeEl2 === colComplete)
          ) {
            focusMainBoardSwitcherTab();
            return;
          }
        }

        const activeCard2 = activeEl2 instanceof Element ? getCardFromElement(activeEl2) : null;
        if (activeCard2 instanceof HTMLElement) {
          const inFrontAttachments2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteAttachmentsItems") !== null;
          const inCardActions2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteActions") !== null;
          const inNoteDueDateRow2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteDueDateRow") !== null;

          // Vertical levels:
          // next card <- action row <- attachments row <- due date row
          if (inCardActions2) {
            const links = getFrontAttachmentLinks(activeCard2);
            if (links.length) {
              const target = links[links.length - 1];
              if (safeFocus(target)) return;
            }
            const dueButtons = getCardFrontFocusableButtons(activeCard2).filter(
              (b) => b.closest(".noteDueDateRow") !== null
            );
            if (dueButtons.length) {
              const lastDue = dueButtons[dueButtons.length - 1];
              if (safeFocus(lastDue)) return;
            }
            if (focusAdjacentCardPrimaryAction(activeCard2, -1)) return;
          }
          if (inFrontAttachments2) {
            const dueButtons = getCardFrontFocusableButtons(activeCard2).filter(
              (b) => b.closest(".noteDueDateRow") !== null
            );
            if (dueButtons.length) {
              const lastDue = dueButtons[dueButtons.length - 1];
              if (safeFocus(lastDue)) return;
            }
            if (focusAdjacentCardPrimaryAction(activeCard2, -1)) return;
          }
          if (inNoteDueDateRow2) {
            const pendingListEl = document.getElementById("pendingList");
            const completeListEl = document.getElementById("completeList");
            const firstPending = pendingListEl?.querySelector(".noteCard[data-note-id]");
            const firstComplete = completeListEl?.querySelector(".noteCard[data-note-id]");
            if (activeCard2 === firstComplete) {
              focusMainBoardSwitcherTab();
              return;
            }
            if (activeCard2 === firstPending) {
              focusMainBoardSwitcherTab();
              return;
            }
            if (focusAdjacentCardPrimaryAction(activeCard2, -1)) return;
            const cards = getAllCardsInDomOrder();
            const idx = cards.indexOf(activeCard2);
            if (idx <= 0) {
              focusMainBoardSwitcherTab();
              return;
            }
          }
        }
        const dashboardViewForScroll = document.getElementById("dashboardView");
        const dashboardVisibleForScroll =
          dashboardViewForScroll instanceof HTMLElement && !dashboardViewForScroll.hasAttribute("hidden");
        const inDashboard =
          dashboardVisibleForScroll &&
          activeEl2 instanceof Element &&
          activeEl2.closest("#dashboardView") !== null;

        const inCalendar =
          calendarView instanceof HTMLElement &&
          !calendarView.hasAttribute("hidden") &&
          activeEl2 instanceof Element &&
          activeEl2.closest("#calendarView") !== null;

        const belowTabs =
          activeEl2 instanceof Element &&
          (
            activeEl2.closest(".board") !== null ||
            activeEl2.closest(".col") !== null ||
            activeEl2.closest(".list") !== null ||
            activeEl2.closest(".noteEditor") !== null ||
            activeEl2.closest(".noteBackBody") !== null
          );
        if ((belowTabs || inDashboard || inCalendar) && tryScrollBeforeSectionMove(-1)) return;
        const card = getCardFromElement(activeEl2);
        if (card) {
          const pendingListEl = document.getElementById("pendingList");
          const completeListEl = document.getElementById("completeList");
          const firstPending = pendingListEl?.querySelector(".noteCard[data-note-id]");
          const firstComplete = completeListEl?.querySelector(".noteCard[data-note-id]");
          if (card === firstPending) {
            closeCardOverlays(card);
            focusMainBoardSwitcherTab();
            return;
          }
          if (card === firstComplete) {
            closeCardOverlays(card);
            focusMainBoardSwitcherTab();
            return;
          }
          const cards = getAllCardsInDomOrder();
          const currentIdx = card instanceof HTMLElement ? cards.indexOf(card) : -1;
          if (currentIdx <= 0) {
            closeCardOverlays(card);
            focusMainBoardSwitcherTab();
            return;
          }

          moveCardFocus(-1);
          return;
        }

        // If focus is on the dashboard close button, Alt+Up closes and focuses Dashboard button.
        const closeDashboardBtn = document.getElementById("closeDashboardBtn");
        const dashboardView = document.getElementById("dashboardView");
        const dashboardVisible =
          dashboardView instanceof HTMLElement && !dashboardView.hasAttribute("hidden");
        if (
          dashboardVisible &&
          activeEl2 === closeDashboardBtn &&
          closeDashboardBtn instanceof HTMLElement
        ) {
          showNotesView();
          const dashboardBtn = document.getElementById("dashboardBtn");
          if (dashboardBtn instanceof HTMLElement) safeFocus(dashboardBtn);
          return;
        }

        // If focus is on the calendar close button, Alt+Up closes and focuses Calendar button.
        const closeCalendarBtn = document.getElementById("closeCalendarBtn");
        const calendarView = document.getElementById("calendarView");
        const calendarVisible =
          calendarView instanceof HTMLElement && !calendarView.hasAttribute("hidden");
        if (
          calendarVisible &&
          activeEl2 === closeCalendarBtn &&
          closeCalendarBtn instanceof HTMLElement
        ) {
          showNotesView();
          const calendarBtn = document.getElementById("calendarBtn");
          if (calendarBtn instanceof HTMLElement) safeFocus(calendarBtn);
          return;
        }

        moveGlobalFocus(-1);
        return;
      }

      // Always allow physical arrow keys to move the cursor in notes editors
      if (
        key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
      ) {
        const activeEl = document.activeElement;
        const noteEditor = activeEl instanceof Element ? activeEl.closest('.noteEditorArea') : null;
        if (noteEditor) {
          // Never block arrow keys in notes editor
          return;
        }
      }

      // Only handle Vim-style navigation keys if not in a notes editor in insert mode
      if (key === nav.left || key === nav.right || key === nav.up || key === nav.down) {
        const activeEl = document.activeElement;
        const noteEditor = activeEl instanceof Element ? activeEl.closest('.noteEditorArea') : null;
        let noteId = noteEditor ? getNoteIdFromEditor(noteEditor) : null;
        let mode = noteId !== null ? vimGetMode(noteId) : null;
        if (noteEditor && mode === 'insert') {
          // Let browser handle Vim-style navigation keys in insert mode
          return;
        }
        e.preventDefault();
        e.stopPropagation();

        // Header: Alt+left/right steps through controls in DOM order (theme → … → settings).
        if (
          (key === nav.left || key === nav.right) &&
          activeEl instanceof Element &&
          activeEl.closest(".headerLinks")
        ) {
          const headerTargets = getHeaderNavTargets();
          const idx = activeEl instanceof HTMLElement ? headerTargets.indexOf(activeEl) : -1;
          if (idx >= 0) {
            const delta = key === nav.right ? 1 : -1;
            const nextIdx = Math.min(headerTargets.length - 1, Math.max(0, idx + delta));
            if (headerTargets[nextIdx]) {
              safeFocus(headerTargets[nextIdx]);
              return;
            }
          }
        }

        // The search field and add button share one visual toolbar row.
        if (activeEl === cardFilterInput && key === nav.right && addNoteButton instanceof HTMLElement) {
          safeFocus(addNoteButton);
          return;
        }
        if (activeEl === addNoteButton && key === nav.left && cardFilterInput instanceof HTMLElement) {
          safeFocus(cardFilterInput);
          return;
        }

        // Board tabs are a single horizontal control. Keep selection and focus aligned
        // while board rendering replaces the tab elements.
        if (
          (key === nav.left || key === nav.right) &&
          activeEl instanceof Element &&
          activeEl.closest("#boardTabs") !== null
        ) {
          moveBoardTabFocus(key === nav.right ? +1 : -1);
          return;
        }

        if (moveBoardsSettingsFocus(key === nav.left ? "left" : "right")) return;
        if (movePopupSizeFocus(key === nav.left ? -1 : +1)) return;

        // Settings: left = focus sidebar (selected tab); right = into panel or next field / Close.
        {
          const settingsViewEl = document.getElementById("settingsView");
          const inSettings =
            settingsViewEl instanceof HTMLElement &&
            !settingsViewEl.hasAttribute("hidden") &&
            activeEl instanceof Element &&
            activeEl.closest("#settingsView") !== null;
          if (inSettings && (key === nav.left || key === nav.right)) {
            const tabs = getSettingsSidebarTabs();
            const tablist = settingsViewEl.querySelector(".settingsTablist");
            const inTablist =
              activeEl instanceof Element &&
              tablist instanceof HTMLElement &&
              tablist.contains(activeEl);
            const panelFocusables = getSettingsActivePanelFocusables();
            const panelIndex = activeEl instanceof HTMLElement ? panelFocusables.indexOf(activeEl) : -1;
            const closeBtn = document.getElementById("closeSettingsBtn");
            const onClose = activeEl === closeBtn;

            if (key === nav.left) {
              if (!inTablist && (onClose || panelIndex >= 0)) {
                const sel = getSettingsSelectedTabEl();
                if (sel) safeFocus(sel);
              }
              return;
            }
            if (key === nav.right) {
              if (inTablist || onClose) {
                const first = panelFocusables[0];
                if (first) safeFocus(first);
                return;
              }
              if (panelIndex >= 0 && panelIndex < panelFocusables.length - 1) {
                focusSettingsPanelControl(panelFocusables[panelIndex + 1]);
                return;
              }
              if (
                panelIndex >= 0 &&
                panelIndex === panelFocusables.length - 1 &&
                closeBtn instanceof HTMLElement
              ) {
                safeFocus(closeBtn);
                return;
              }
              return;
            }
          }
        }

        {
          const instructionsView = document.getElementById("instructionsView");
          const inInstructions =
            instructionsView instanceof HTMLElement &&
            !instructionsView.hasAttribute("hidden") &&
            activeEl instanceof Element &&
            activeEl.closest("#instructionsView") !== null;
          if (inInstructions && (key === nav.left || key === nav.right)) {
            moveInstructionsFocus(key === nav.right ? +1 : -1);
            return;
          }
        }

        {
          const aboutViewEl = document.getElementById("aboutView");
          const inAbout =
            aboutViewEl instanceof HTMLElement &&
            !aboutViewEl.hasAttribute("hidden") &&
            activeEl instanceof Element &&
            activeEl.closest("#aboutView") !== null;
          if (inAbout && (key === nav.left || key === nav.right)) {
            moveAboutFocus(key === nav.right ? +1 : -1);
            return;
          }
        }

        if (moveCreateFormFocusByVisualDirection(key, nav)) return;

        // Notes board: Alt+Left/Right between Pending/Complete column headers.
        {
          const notesViewEl = document.getElementById("notesView");
          const notesVisible =
            notesViewEl instanceof HTMLElement && !notesViewEl.hasAttribute("hidden");
          const notesBoardEl = document.getElementById("notesBoard");
          const colPending = document.getElementById("colPending");
          const colComplete = document.getElementById("colComplete");
          const onColHeader =
            activeEl instanceof HTMLElement &&
            (activeEl === colPending || activeEl === colComplete);
          if (
            notesVisible &&
            notesBoardEl instanceof HTMLElement &&
            colPending instanceof HTMLElement &&
            colComplete instanceof HTMLElement &&
            onColHeader &&
            (key === nav.left || key === nav.right)
          ) {
            if (key === nav.left && activeEl === colComplete) {
              safeFocus(colPending);
              return;
            }
            if (key === nav.right && activeEl === colPending) {
              safeFocus(colComplete);
              return;
            }
          }
        }

        // Settings → Boards (manage list): left/right within a row, up/down across rows.
        {
          const inManageTabs =
            isBoardsManagePanelOpen() &&
            activeEl instanceof Element &&
            activeEl.closest("#settingsPanelBoards") !== null;
          if (inManageTabs) {
            const inManageTabsRow = activeEl instanceof Element && activeEl.closest(".manageTabsRow") !== null;
            if (key === nav.left) {
              if (inManageTabsRow && moveFocusWithinManageTabsRow(-1)) return;
            } else if (key === nav.right) {
              if (inManageTabsRow && moveFocusWithinManageTabsRow(+1)) return;
            } else if (key === nav.up) {
              if (inManageTabsRow && moveFocusAcrossManageTabsRows(-1)) return;
            } else if (key === nav.down) {
              if (inManageTabsRow && moveFocusAcrossManageTabsRows(+1)) return;
            }
            // Fall through to generic global nav if needed.
          }
        }

        // Calendar: up/down = rows, left/right = columns; task links: up goes back to day cell.
        {
          const calendarViewEl = document.getElementById("calendarView");
          const calendarVisible =
            calendarViewEl instanceof HTMLElement && !calendarViewEl.hasAttribute("hidden");
          const inCalendar = calendarVisible && activeEl instanceof Element && activeEl.closest("#calendarView") !== null;
          if (inCalendar) {
            const onCalendarDayCell = activeEl instanceof Element && activeEl.classList.contains("calendarDayCell");
            const onCalendarTaskLink = activeEl instanceof Element && activeEl.classList.contains("calendarTaskLink");
            if (onCalendarDayCell) {
              if (key === nav.up && moveCalendarFocus(-1, 0)) return;
              if (key === nav.down && moveCalendarFocus(1, 0)) return;
              if (key === nav.left && moveCalendarFocus(0, -1)) return;
              if (key === nav.right && moveCalendarFocus(0, 1)) return;
            } else if (onCalendarTaskLink) {
              const links = document.querySelectorAll(".calendarTaskLink");
              const idx = activeEl ? [...links].indexOf(activeEl) : -1;
              if (key === nav.up) {
                if (idx <= 0 && calendarSelectedDayCell instanceof HTMLElement) {
                  safeFocus(calendarSelectedDayCell);
                  return;
                }
                if (idx > 0 && links[idx - 1] instanceof HTMLElement) {
                  safeFocus(links[idx - 1]);
                  return;
                }
              }
              if (key === nav.down && idx >= 0 && idx < links.length - 1 && links[idx + 1] instanceof HTMLElement) {
                safeFocus(links[idx + 1]);
                return;
              }
            }
          }
        }

        const card = getCardFromElement(activeEl);
        if (!card) {
          moveGlobalFocus(
            key === nav.left ? -1 : key === nav.right ? +1 : key === nav.up ? -1 : +1
          );
          return;
        }
        const inFrontAttachments =
          activeEl instanceof Element &&
          activeEl.closest(".noteAttachmentsItems") !== null;
        if (inFrontAttachments && (key === nav.left || key === nav.right)) {
          if (moveFocusWithinFrontAttachments(card, key === nav.left ? -1 : +1)) return;
        }
        moveButtonFocusWithinCard(card, key === nav.left ? -1 : key === nav.right ? +1 : key === nav.up ? -1 : +1);
      }
    },
    true
  );

  // Keyboard shortcuts inside the popup:
  // - Alt+1..Alt+9 always switches boards
  // - 1..9 switches boards only when you're not typing in an input/textarea
  document.addEventListener("keydown", (e) => {
    const key = e.key;
    if (
      key !== "1" &&
      key !== "2" &&
      key !== "3" &&
      key !== "4" &&
      key !== "5" &&
      key !== "6" &&
      key !== "7" &&
      key !== "8" &&
      key !== "9"
    ) {
      return;
    }

    const active = document.activeElement;
    const isTypingTarget =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLElement && active.isContentEditable);

    if (!modKeyActive(e) && isTypingTarget) return;

    const idx = Number(key) - 1;
    const board = boards[idx];
    if (!board) return;

    e.preventDefault();
    if (modKeyActive(e)) lastBoardShortcutAt = Date.now();
    void activateBoard(board, { persistSelection: true });
  });

  // Escape closes the overlay when popup is in an iframe.
  // Only close when outside the notes editor: inside notes, Esc goes insert→normal, then normal→close notes, then Esc closes overlay.
  // Calendar, AI, Settings, Instructions, About: Esc goes to main view instead of closing.
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || modKeyActive(e) || e.ctrlKey || e.metaKey) return;
      if (window.parent === window) return;
      if (openNoteEditorIds.size > 0) return;
      const calendarViewEl = document.getElementById("calendarView");
      if (calendarViewEl instanceof HTMLElement && !calendarViewEl.hasAttribute("hidden")) return;
      const settingsViewEl = document.getElementById("settingsView");
      const instructionsViewEl = document.getElementById("instructionsView");
      const aboutViewEl = document.getElementById("aboutView");
      if (
        (settingsViewEl instanceof HTMLElement && !settingsViewEl.hasAttribute("hidden")) ||
        (instructionsViewEl instanceof HTMLElement && !instructionsViewEl.hasAttribute("hidden")) ||
        (aboutViewEl instanceof HTMLElement && !aboutViewEl.hasAttribute("hidden"))
      ) {
        return;
      }
      try {
        window.parent.postMessage({ type: "vim-todo-close" }, "*");
      } catch {
        // ignore
      }
    },
    true
  );

  // "/" focuses the card filter in Notes view (when not typing in another input/editor).
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "/" || modKeyActive(e) || e.ctrlKey || e.metaKey) return;
      const active = document.activeElement;
      const isTypingTarget =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      if (isTypingTarget) return;

      const notesVisible = notesView instanceof HTMLElement && !notesView.hasAttribute("hidden");
      if (!notesVisible) return;
      if (!(cardFilterInput instanceof HTMLInputElement)) return;

      e.preventDefault();
      setCardFilterVisible(true);
      if (safeFocus(cardFilterInput)) {
        try {
          cardFilterInput.select();
        } catch {
          // ignore
        }
      }
    },
    true
  );

  // Vim-style keybindings for Notes editors.
  // In normal mode, keys are commands (not text). Insert mode behaves normally.
  document.addEventListener(
    "focusin",
    (e) => {
      const target = e.target;
      const editor = getActiveNotesEditorFromEventTarget(target);
      if (!editor) return;
      lastFocusedNoteEditor = editor;
      const noteId = getNoteIdFromEditor(editor);
      if (noteId === null) return;
      if (!vimModeByNoteId.has(noteId)) vimSetMode(noteId, "insert");
      // Seed undo stack on first focus.
      const stack = vimGetUndoStack(noteId);
      if (!stack.length) vimUndoPush(noteId, editor.innerHTML, { force: true });
      updateVimStatusInDom(noteId);
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey || e.metaKey || modKeyActive(e)) return;

      const target = e.target;
      const directEditor = getActiveNotesEditorFromEventTarget(target);
      let editor = directEditor;

      // If user asked for broader scope: allow controlling the last-focused
      // open notes editor when not typing elsewhere.
      if (!editor) {
        const active = document.activeElement;
        if (active && isEditableElement(active)) return;
        if (lastFocusedNoteEditor instanceof HTMLElement) {
          const noteId = getNoteIdFromEditor(lastFocusedNoteEditor);
          if (noteId !== null && openNoteEditorIds.has(noteId)) editor = lastFocusedNoteEditor;
        }
      }

      if (!(editor instanceof HTMLElement)) return;
      const noteId = getNoteIdFromEditor(editor);
      if (noteId === null) return;

      const mode = vimGetMode(noteId);

      if (mode === "insert") return;

      // Don't treat modifier-only keydowns as command input.
      // This is important for sequences like register selection: '"' then Shift+'=' ("+").
      if (e.key === "Shift" || e.key === "CapsLock" || e.key === "AltGraph") return;

      // Register selection prefix: " then 1-4
      const k0 = e.key;
      const k0Normalized = k0 === "=" ? "+" : k0;
      if (vimPendingIs(noteId, '\"', 4000) && /^[0-4+]$/.test(k0Normalized)) {
        e.preventDefault();
        editor.focus();
        vimSetNextRegister(noteId, k0Normalized);
        vimClearPending(noteId);
        return;
      }

      if (mode === "visual") {
        const k = e.key;
        // Visual mode is command mode: don't insert typed characters.
        // We intentionally constrain selection extension to h/j/k/l for now.
        if (k === '"') {
          e.preventDefault();
          editor.focus();
          vimSetPending(noteId, '"');
          return;
        }

        if (k === "h") {
          e.preventDefault();
          editor.focus();
          extendSelection("backward", "character");
          vimClearPending(noteId);
          return;
        }
        if (k === "l") {
          e.preventDefault();
          editor.focus();
          extendSelection("forward", "character");
          vimClearPending(noteId);
          return;
        }
        if (k === "j") {
          e.preventDefault();
          editor.focus();
          extendSelection("forward", "line");
          vimClearPending(noteId);
          return;
        }
        if (k === "k") {
          e.preventDefault();
          editor.focus();
          extendSelection("backward", "line");
          vimClearPending(noteId);
          return;
        }

        // Allow physical arrow keys to extend selection (no Shift) in visual mode.
        if (k === "ArrowLeft") {
          e.preventDefault();
          editor.focus();
          extendSelection("backward", "character");
          vimClearPending(noteId);
          return;
        }
        if (k === "ArrowRight") {
          e.preventDefault();
          editor.focus();
          extendSelection("forward", "character");
          vimClearPending(noteId);
          return;
        }
        if (k === "ArrowUp") {
          e.preventDefault();
          editor.focus();
          extendSelection("backward", "line");
          vimClearPending(noteId);
          return;
        }
        if (k === "ArrowDown") {
          e.preventDefault();
          editor.focus();
          extendSelection("forward", "line");
          vimClearPending(noteId);
          return;
        }

        if (k === "0") {
          e.preventDefault();
          editor.focus();
          extendSelectionToTarget(editor, noteId, "startOfLine");
          vimClearPending(noteId);
          return;
        }
        if (k === "^") {
          e.preventDefault();
          editor.focus();
          extendSelectionToTarget(editor, noteId, "startOfLineNonWhitespace");
          vimClearPending(noteId);
          return;
        }
        if (k === "$") {
          e.preventDefault();
          editor.focus();
          extendSelectionToTarget(editor, noteId, "endOfLine");
          vimClearPending(noteId);
          return;
        }
        if (k === "g") {
          if (vimPendingIs(noteId, "g", 700)) {
            e.preventDefault();
            editor.focus();
            extendSelectionToTarget(editor, noteId, "startOfDocument");
            vimClearPending(noteId);
          } else {
            e.preventDefault();
            editor.focus();
            vimSetPending(noteId, "g");
          }
          return;
        }
        if (k === "G") {
          e.preventDefault();
          editor.focus();
          extendSelectionToTarget(editor, noteId, "endOfDocument");
          vimClearPending(noteId);
          return;
        }

        if (k === "y") {
          e.preventDefault();
          editor.focus();
          const regName = vimGetOpRegisterName(noteId);
          const res = vimYankSelection(editor, regName);
          if (res.ok) {
            if (String(regName || "") === "+") {
              vimShowToast(noteId, res.clipboardOk ? 'Copied to clipboard (+)' : 'Yanked to + (clipboard blocked)');
            } else {
              vimShowToast(noteId, `Yanked to register ${regName}`);
            }
          }
          vimExitVisualMode(editor);
          return;
        }

        if (k === "c") {
          // Change (cut selection): yank selection, delete it, then enter insert mode.
          e.preventDefault();
          editor.focus();
          const regName = vimGetOpRegisterName(noteId);
          const res = vimYankSelection(editor, regName);
          const deleted = vimDeleteSelection(editor);
          if (res.ok && deleted) {
            if (String(regName || "") === "+") {
              vimShowToast(noteId, res.clipboardOk ? 'Cut to clipboard (+)' : 'Cut to + (clipboard blocked)');
            } else {
              vimShowToast(noteId, `Cut to register ${regName}`);
            }
          }
          editor.dispatchEvent(new Event("input", { bubbles: true }));
          vimSetMode(noteId, "insert");
          vimClearPending(noteId);
          return;
        }

        // Ignore other printable keys so they don't type into the editor.
        if (typeof k === "string" && k.length === 1) {
          e.preventDefault();
          editor.focus();
        }
        vimClearPending(noteId);
        return;
      }

      // Normal mode commands
      const k = e.key;
      const handledKeys = new Set([
        "h",
        "j",
        "k",
        "l",
        "i",
        "a",
        "v",
        "u",
        "0",
        "^",
        ":",
        "x",
        "g",
        "G",
        "d",
        "y",
        "p",
        "$",
        '"'
      ]);

      if (!handledKeys.has(k)) {
        vimClearPending(noteId);
        return;
      }

      e.preventDefault();
      editor.focus();

      // Clear pending unless we're continuing a sequence.
      const now = Date.now();
      void now;

      if (k === "i") {
        vimSetMode(noteId, "insert");
        vimClearPending(noteId);
        return;
      }

      if (k === "v") {
        vimClearPending(noteId);
        vimEnterVisualMode(editor);
        return;
      }

      if (k === "a") {
        moveSelection("forward", "character");
        vimSetMode(noteId, "insert");
        vimClearPending(noteId);
        return;
      }

      if (k === "u") {
        vimClearPending(noteId);
        if (vimUndoApply(editor)) vimShowToast(noteId, "Undo");
        return;
      }

      if (k === ":") {
        // Minimal ex-style command: :x closes the rich notes editor.
        vimSetPending(noteId, ":");
        return;
      }

      if (k === '"') {
        vimSetPending(noteId, '"');
        return;
      }

      if (k === "x") {
        if (vimPendingIs(noteId, ":", 4000)) {
          closeNotesEditorFromCommand(noteId, { focusEditor: false, focusToggleOnClose: true });
        }
        vimClearPending(noteId);
        return;
      }

      if (k === "h") {
        moveSelection("backward", "character");
        vimClearPending(noteId);
        return;
      }
      if (k === "l") {
        moveSelection("forward", "character");
        vimClearPending(noteId);
        return;
      }
      if (k === "j") {
        moveSelection("forward", "line");
        vimClearPending(noteId);
        return;
      }
      if (k === "k") {
        moveSelection("backward", "line");
        vimClearPending(noteId);
        return;
      }

      if (k === "0") {
        vimCaretToStartOfLine(editor, { firstNonWhitespace: false });
        vimClearPending(noteId);
        return;
      }

      if (k === "^") {
        vimCaretToStartOfLine(editor, { firstNonWhitespace: true });
        vimClearPending(noteId);
        return;
      }

      if (k === "$") {
        vimCaretToEndOfLine(editor);
        vimClearPending(noteId);
        return;
      }

      if (k === "g") {
        if (vimPendingIs(noteId, "g", 700)) {
          // gg
          collapseSelectionToEditorStart(editor);
          vimClearPending(noteId);
        } else {
          vimSetPending(noteId, "g");
        }
        return;
      }

      if (k === "G") {
        const sel = window.getSelection();
        if (sel) {
          const r = document.createRange();
          r.selectNodeContents(editor);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
        }
        // Collapsed ranges at end may have no client rect; force scroll.
        try {
          editor.scrollTop = editor.scrollHeight;
        } catch {
          // ignore
        }
        ensureNotesEditorCaretInView(editor);
        vimClearPending(noteId);
        return;
      }

      if (k === "d") {
        if (vimPendingIs(noteId, "d", 700)) {
          // dd
          vimDeleteCurrentBlock(editor);
          vimShowToast(noteId, "Deleted block");
          vimClearPending(noteId);
        } else {
          vimSetPending(noteId, "d");
        }
        return;
      }

      if (k === "y") {
        if (vimPendingIs(noteId, "y", 700)) {
          // yy
          const regName = vimGetOpRegisterName(noteId);
          const res = vimYankCurrentBlock(editor, regName);
          if (res.ok) {
            if (String(regName || "") === "+") {
              vimShowToast(noteId, res.clipboardOk ? 'Copied block to clipboard (+)' : 'Yanked block to + (clipboard blocked)');
            } else {
              vimShowToast(noteId, `Yanked block to register ${regName}`);
            }
          }
          vimClearPending(noteId);
        } else {
          vimSetPending(noteId, "y");
        }
        return;
      }

      if (k === "p") {
        const regName = vimGetOpRegisterName(noteId);
        if (vimPasteAtCaret(editor, regName)) {
          vimShowToast(noteId, `Pasted from register ${regName}`);
        }
        vimSetMode(noteId, "insert");
        vimClearPending(noteId);
        return;
      }
    },
    true
  );

  // Export CSV
  {
    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        exportAllTasksCsv(db);
      });
    }
  }

  // Export DB / Import DB
  {
    const exportDbBtn = document.getElementById("exportDbBtn");
    if (exportDbBtn) {
      exportDbBtn.addEventListener("click", () => {
        exportDbFile();
      });
    }

    const importBtn = document.getElementById("importDbBtn");
    const importFile = document.getElementById("importDbFile");
    if (importBtn && importFile instanceof HTMLInputElement) {
      importBtn.addEventListener("click", () => {
        importFile.value = "";
        importFile.click();
      });

      importFile.addEventListener("change", async () => {
        const file = importFile.files?.[0];
        if (!file) return;
        try {
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);

          // Replace db instance
          try {
            db.close();
          } catch {
            // ignore
          }

          db = new SQL.Database(bytes);
          ensureSchema(db, DEFAULT_TAB_NAME);
          flippedNoteIds.clear();

          // Reload AI settings from the imported DB.
          aiEndpointBaseUrl = dbGetAppSettingString(APP_SETTING_AI_ENDPOINT_BASE_URL) || "";
          aiCustomWords = [];
          const importedCustomWordsJson = dbGetAppSettingString(APP_SETTING_AI_CUSTOM_WORDS_JSON);
          if (importedCustomWordsJson) {
            try {
              const parsed = JSON.parse(importedCustomWordsJson);
              if (Array.isArray(parsed)) {
                aiCustomWords = parsed.filter((w) => typeof w === "string" && w.trim());
              }
            } catch {
              // ignore
            }
          }

          gObsidianVaultName = dbGetAppSettingString(APP_SETTING_OBSIDIAN_VAULT_NAME) || "";
          gObsidianNotesFolder = dbGetAppSettingString(APP_SETTING_OBSIDIAN_NOTES_FOLDER) || "";
          gObsidianSyncMode = dbGetAppSettingString(APP_SETTING_OBSIDIAN_SYNC_MODE) === "1";

          appHeaderTitleRaw = dbGetAppSettingString(APP_SETTING_HEADER_TITLE) || "";
          applyHeaderTitle(appHeaderTitleRaw);
          appHeaderTitleFontKey = normalizeHeaderTitleFontKey(
            dbGetAppSettingString(APP_SETTING_HEADER_TITLE_FONT) || ""
          );
          applyHeaderTitleFontKey(appHeaderTitleFontKey);

          clearObsidianCreatedPathCache();

          boards = queryBoards(db);
          if (!boards.length) {
            addBoard(db, DEFAULT_TAB_NAME);
            boards = queryBoards(db);
          }

          // After import, reset to the first tab so the UI is deterministic.
          activeBoard = boards[0];
          await saveActiveBoard(activeBoard);

          renderBoardTabs(boards, activeBoard);
          setActiveTabUi(activeBoard);
          await persist();
          await refresh();
          await reloadObsidianVaultHandleFromStorage();
          if (String(gObsidianVaultName || "").trim()) void scanObsidianVaultVsDbNotes();

          showNotesView();
          focusMainBoardSwitcherTab();
        } catch (err) {
          console.error(err);
          alert("Import failed. Please choose a valid exported .sqlite/.db file.");
        }
      });
    }
  }

  // Tabs
  {
    const tabs = document.getElementById("boardTabs");
    if (tabs) {
      tabs.addEventListener("click", (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const tab = target.closest("[role='tab'][data-board]");
        e.preventDefault();
        if (!(tab instanceof HTMLElement)) return;
        const board = tab.getAttribute("data-board");
        void activateBoard(board, { persistSelection: true, focusBoardTab: true });
      });
    }
  }

  // Drag & drop reordering for Pending and Complete
  {
    const pendingList = el("pendingList");
    const completeList = el("completeList");
    let dragging = null;

    const setupDnd = (listEl, persistFn) => {
      listEl.addEventListener("dragstart", (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const card = target.closest(".noteCard");
        if (!(card instanceof HTMLElement)) return;
        if (!card.draggable) return;

        dragging = card;
        card.classList.add("is-dragging");
        card.setAttribute("aria-grabbed", "true");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", card.dataset.noteId || "");
        }
      });

      listEl.addEventListener("dragover", (e) => {
        if (!dragging) return;
        if (!listEl.contains(dragging)) return;
        e.preventDefault();
        const after = getDragAfterElement(listEl, e.clientY);
        if (!after) {
          listEl.appendChild(dragging);
        } else {
          listEl.insertBefore(dragging, after);
        }
      });

      listEl.addEventListener("drop", (e) => {
        if (!dragging) return;
        e.preventDefault();
      });

      listEl.addEventListener("dragend", async () => {
        if (!dragging) return;
        const list = dragging.parentElement;
        dragging.classList.remove("is-dragging");
        dragging.setAttribute("aria-grabbed", "false");
        dragging = null;

        if (list === pendingList) {
          persistPendingOrderFromDom(db, activeBoard, pendingList);
        } else if (list === completeList) {
          persistCompleteOrderFromDom(db, activeBoard, completeList);
        }
        await persist();
        await refresh();
      });
    };

    setupDnd(pendingList, persistPendingOrderFromDom);
    setupDnd(completeList, persistCompleteOrderFromDom);
  }

  // Autocomplete (new note input): local DB + optional AI completion
  let clearNewNoteAutocomplete = () => {};
  {
    const input = document.getElementById("noteText");
    const container = noteAutocomplete;
    const inlineTrail = document.getElementById("noteTextTrail");
    if (input instanceof HTMLInputElement && container instanceof HTMLElement) {
      let localTimer = null;
      let aiTimer = null;
      let aiAbort = null;
      let aiPending = false;
      let aiLastError = "";

      let focusedSuggestionIndex = -1;

      let localSuggestions = [];
      let localCompletion = null; // { baseText, completion }
      let aiSuggestion = null; // { baseText, completion }

      const endsWithWhitespace = (s) => /\s$/.test(String(s || ""));
      const getLastToken = (s) => {
        const m = String(s || "").match(/(\S+)$/);
        return m ? m[1] : "";
      };
      const getLastTokenInfo = (s) => {
        const str = String(s || "");
        const m = str.match(/(\S+)$/);
        if (!m) return { token: "", index: str.length };
        const token = m[1] || "";
        const index = Math.max(0, str.length - token.length);
        return { token, index };
      };
      const getLeadingWord = (s) => {
        const m = String(s || "").match(/^([A-Za-z0-9_-]+)/);
        return m ? m[1] : "";
      };

      const ensureEnglishDictionaryLoaded = async () => {
        if (Array.isArray(englishDictWords)) return englishDictWords;
        if (englishDictLoadPromise) return englishDictLoadPromise;

        englishDictLoadPromise = (async () => {
          try {
            const cacheKey = "englishDict:5000-words:v1";
            let txt = "";
            try {
              const cached = await chrome.storage.local.get(cacheKey);
              txt = typeof cached?.[cacheKey] === "string" ? cached[cacheKey] : "";
            } catch {
              // ignore
            }

            if (!txt) {
              const url = "https://raw.githubusercontent.com/mahsu/IndexingExercise/master/5000-words.txt";
              const res = await fetch(url);
              if (!res.ok) throw new Error(`Dictionary fetch failed: ${res.status}`);
              txt = await res.text();
              try {
                await chrome.storage.local.set({ [cacheKey]: txt });
              } catch {
                // ignore
              }
            }

            const out = [];
            const seen = new Set();
            for (const line of txt.split(/\r?\n/)) {
              const w = String(line || "").trim();
              if (!w) continue;
              if (w.length > 60) continue;
              if (!/^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(w)) continue;
              const lower = w.toLowerCase();
              if (isEnglishDictionaryProfaneWordLowercase(lower)) continue;
              if (seen.has(lower)) continue;
              seen.add(lower);
              out.push(lower);
            }
            out.sort();
            englishDictWords = out;
            return englishDictWords;
          } finally {
            // Keep the promise cached, but allow retries if load failed.
            if (!Array.isArray(englishDictWords)) englishDictLoadPromise = null;
          }
        })();

        return englishDictLoadPromise;
      };

      const findBestDictionaryWordCompletion = (baseText) => {
        if (!Array.isArray(englishDictWords) || !englishDictWords.length) return null;

        const base = String(baseText || "");
        if (!base.trim()) return null;
        if (endsWithWhitespace(base)) return null;

        const { token } = getLastTokenInfo(base);
        if (!token) return null;
        if (token.length < 4) return null; // avoid noisy single-letter/short completions

        const prefix = token.toLowerCase();
        if (scoreEnglishTokenShapeLowercase(prefix) < 0.75) return null;
        const dictWords = englishDictWords;

        // Binary search for first word >= prefix.
        let lo = 0;
        let hi = dictWords.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (dictWords[mid] < prefix) lo = mid + 1;
          else hi = mid;
        }

        let best = "";
        let bestCompletionLen = Infinity;
        let bestScore = -Infinity;

        // Avoid suggesting huge completions from a broad dictionary list; prefer
        // completing the current word, not replacing it with a long rare term.
        const maxCompletionLen = Math.max(6, Math.min(12, token.length + 3));

        for (let i = lo; i < dictWords.length; i++) {
          const w = dictWords[i];
          if (!w.startsWith(prefix)) break;
          if (w.length <= token.length) continue;

          const completionLen = w.length - token.length;
          if (completionLen > maxCompletionLen) continue;
          const score = scoreEnglishDictionaryCandidateWordLowercase(w, token.length);
          if (!(score >= 9)) continue;

          // Prefer the shortest completion that still looks like common English.
          const betterLen = completionLen < bestCompletionLen;
          const betterScore = completionLen === bestCompletionLen && score > bestScore;
          const betterWordLen =
            completionLen === bestCompletionLen && score === bestScore && (!best || w.length < best.length);

          if (betterLen || betterScore || betterWordLen) {
            best = w;
            bestScore = score;
            bestCompletionLen = completionLen;
          }

          if (i - lo > 240) break;
        }

        if (!best) return null;
        return { baseText: base, completion: best.slice(token.length) };
      };

      const findBestCustomWordCompletion = (baseText) => {
        const base = String(baseText || "");
        if (!base.trim()) return null;
        if (endsWithWhitespace(base)) return null;

        const { token } = getLastTokenInfo(base);
        if (!token) return null;
        if (token.length < 2) return null;

        const prefix = token.toLowerCase();
        const wordList = Array.isArray(aiCustomWords) ? aiCustomWords : [];

        let best = "";
        for (const w0 of wordList) {
          const w = String(w0 || "").trim();
          if (!w) continue;
          if (w.length <= token.length) continue;
          if (w.slice(0, token.length).toLowerCase() !== prefix) continue;
          if (!best || w.length < best.length) best = w;
        }

        if (!best) return null;
        return { baseText: base, completion: best.slice(token.length) };
      };
      const computeLocalWordCompletion = (baseText, fullText) => {
        const base = String(baseText || "");
        const full = String(fullText || "");
        if (!base.trim()) return null;
        if (endsWithWhitespace(base)) return null;
        const head = full.slice(0, base.length);
        if (head.toLowerCase() !== base.toLowerCase()) return null;
        const suffix = full.slice(base.length);
        if (!suffix || /^\s/.test(suffix)) return null;
        const w = getLeadingWord(suffix);
        return w ? { baseText: base, completion: w } : null;
      };
      const computeAiContextCompletion = (baseText, aiResponse) => {
        const base = String(baseText || "");
        if (!base.trim()) return null;

        let r = String(aiResponse || "").replace(/\r\n/g, "\n");
        if (!r) return null;

        // Use only the first line to avoid multi-line dumps.
        r = r.split("\n")[0] || "";
        r = r.replace(/^\s*Continuation\s*:\s*/i, "");
        r = r.replace(/^\s+/g, "");
        r = r.replace(/\s+$/g, "");

        // Strip surrounding quotes.
        if (
          (r.startsWith('"') && r.endsWith('"')) ||
          (r.startsWith("'") && r.endsWith("'"))
        ) {
          r = r.slice(1, -1);
        }

        const baseLower = base.toLowerCase();
        let rLower = r.toLowerCase();

        const baseEndsWs = /\s$/.test(base);
        const baseLast = base.slice(-1);
        const baseLastTokenMatch = String(base || "").match(/(\S+)$/);
        const baseLastToken = !baseEndsWs && baseLastTokenMatch ? String(baseLastTokenMatch[1] || "") : "";
        const isWordishToken = /^[A-Za-z][A-Za-z'-]*$/.test(baseLastToken);
        const lowerLastToken = baseLastToken.toLowerCase();
        const commonWholeWords = new Set([
          "a",
          "an",
          "and",
          "are",
          "as",
          "at",
          "be",
          "because",
          "but",
          "by",
          "for",
          "from",
          "have",
          "i",
          "if",
          "in",
          "is",
          "it",
          "of",
          "on",
          "or",
          "really",
          "so",
          "that",
          "the",
          "this",
          "to",
          "was",
          "we",
          "with",
          "you"
        ]);

        const dictHasWordLower = (wLower) => {
          if (!Array.isArray(englishDictWords) || !englishDictWords.length) return false;
          const w = String(wLower || "");
          if (!w) return false;
          let lo = 0;
          let hi = englishDictWords.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (englishDictWords[mid] < w) lo = mid + 1;
            else hi = mid;
          }
          return englishDictWords[lo] === w;
        };

        const isGluedDictWordsLower = (wLower) => {
          const w = String(wLower || "");
          if (!w || w.length < 10) return false;
          if (!/^[a-z]+$/.test(w)) return false;
          if (!Array.isArray(englishDictWords) || !englishDictWords.length) return false;
          for (let i = 4; i <= w.length - 4; i++) {
            const a = w.slice(0, i);
            const b = w.slice(i);
            if (dictHasWordLower(a) && dictHasWordLower(b)) return true;
          }
          return false;
        };
        const tokenLooksComplete = (() => {
          if (!baseLastToken || !isWordishToken) return false;
          if (commonWholeWords.has(lowerLastToken)) return true;

          if (dictHasWordLower(lowerLastToken)) return true;

          if (Array.isArray(aiCustomWords) && aiCustomWords.length) {
            for (const w0 of aiCustomWords) {
              const w = String(w0 || "").trim().toLowerCase();
              if (w && w === lowerLastToken) return true;
            }
          }

          return false;
        })();

        // If the model repeated the input, strip it.
        if (r && base && rLower.startsWith(baseLower)) {
          r = r.slice(base.length);
          rLower = r.toLowerCase();
        } else {
          // Some models return the full completed word instead of the suffix.
          const { token } = getLastTokenInfo(base);
          const tokenLower = String(token || "").toLowerCase();
          if (tokenLower && baseLower.endsWith(tokenLower) && rLower.startsWith(tokenLower)) {
            r = r.slice(tokenLower.length);
            rLower = r.toLowerCase();
          }
        }

        // If the model returned a phrase instead of a suffix, but that phrase contains
        // a word that completes the user's current token, salvage just the suffix.
        // Example: base "... next we" + response "Next week" -> "ek".
        if (!baseEndsWs) {
          const { token } = getLastTokenInfo(base);
          const tokenLower = String(token || "").toLowerCase();
          if (tokenLower && tokenLower.length >= 2 && /\s/.test(String(r || ""))) {
            const wordsInResp = String(rLower || "").match(/[a-z]+(?:[-'][a-z]+)*/g) || [];
            for (const w of wordsInResp) {
              if (!w) continue;
              if (w.length <= tokenLower.length) continue;
              if (!w.startsWith(tokenLower)) continue;
              r = w.slice(tokenLower.length);
              rLower = r.toLowerCase();
              break;
            }
          }
        }

        // Contraction guardrail: if the user just typed an apostrophe, only allow
        // common contraction suffixes (prevents junk like "let'important").
        if (/[A-Za-z]['’]$/.test(base) && /^[A-Za-z]/.test(r) && !/^['’]/.test(r)) {
          const ok =
            rLower === "s" ||
            rLower === "t" ||
            rLower === "d" ||
            rLower === "m" ||
            rLower.startsWith("re") ||
            rLower.startsWith("ve") ||
            rLower.startsWith("ll");
          if (!ok) return null;
        }

        // If we're at a word boundary and the model starts with a letter/number,
        // it often needs a leading space (e.g., "Send agendas" + "important" -> "Send agendas important").
        // But do NOT insert spaces mid-word ("imp" + "ortant" -> "important").
        if (!baseEndsWs) {
          if (/[.,;:!?…]/.test(baseLast) && /^[A-Za-z0-9]/.test(r) && !/^\s/.test(r)) {
            r = " " + r;
            rLower = r.toLowerCase();
          } else if (tokenLooksComplete && /[A-Za-z0-9]/.test(baseLast) && /^[A-Za-z0-9]/.test(r) && !/^\s/.test(r)) {
            const looksLikeSuffix = isWordishToken && /^[A-Za-z'-]+$/.test(r) && !/\s/.test(r);
            if (looksLikeSuffix) {
              const combinedLower = (baseLastToken + r).toLowerCase();
              let combinedIsKnown = dictHasWordLower(combinedLower);
              if (!combinedIsKnown && Array.isArray(aiCustomWords) && aiCustomWords.length) {
                for (const w0 of aiCustomWords) {
                  const w = String(w0 || "").trim().toLowerCase();
                  if (w && w === combinedLower) {
                    combinedIsKnown = true;
                    break;
                  }
                }
              }
              if (combinedIsKnown) {
                // keep suffix; no leading space
              } else {
                const lead = (String(r || "").match(/^([A-Za-z]{4,})/) || [])[1] || "";
                const leadLower = lead.toLowerCase();
                if (leadLower && isGluedDictWordsLower(leadLower)) return null;

                if (!/^['’]/.test(r)) {
                  r = " " + r;
                  rLower = r.toLowerCase();
                }
              }
            } else {
            const lead = (String(r || "").match(/^([A-Za-z]{4,})/) || [])[1] || "";
            const leadLower = lead.toLowerCase();
            if (leadLower && isGluedDictWordsLower(leadLower)) return null;

            if (!/^['’]/.test(r)) {
              r = " " + r;
              rLower = r.toLowerCase();
            }
            }
          } else if (!tokenLooksComplete) {
            // Mid-word: never allow spaces in the completion.
            if (/\s/.test(r)) return null;

            // If the common English dictionary is already loaded, only accept suffixes
            // that form a real word with the current token.
            if (Array.isArray(englishDictWords) && englishDictWords.length && isWordishToken && /^[A-Za-z'-]+$/.test(r)) {
              const combined = (baseLastToken + r).toLowerCase();
              if (combined.length > 28) return null;
              if (/^[a-z]+(?:[-'][a-z]+)*$/.test(combined)) {
                if (!dictHasWordLower(combined)) return null;
              }
            }
          }
        }

        // Keep short; allow spaces/punctuation.
        r = r.replace(/[\u0000-\u001F\u007F]/g, "");
        if (r.endsWith(".")) {
          r = r.slice(0, -1).replace(/\s+$/g, "");
          rLower = r.toLowerCase();
        }
        r = r.slice(0, 80);
        if (!r.trim()) return null;

        const lastChar = base.slice(-1);
        if (/[.!?…]/.test(lastChar) && /^[A-Za-z0-9]/.test(r) && !/^\s/.test(r)) {
          return null;
        }

        return { baseText: base, completion: r };
      };

      const hide = () => {
        container.textContent = "";
        container.hidden = true;
        focusedSuggestionIndex = -1;
      };

      const syncInlineTrailTypography = () => {
        if (!(inlineTrail instanceof HTMLElement)) return;
        try {
          const cs = getComputedStyle(input);
          inlineTrail.style.fontFamily = cs.fontFamily;
          inlineTrail.style.fontSize = cs.fontSize;
          inlineTrail.style.fontWeight = cs.fontWeight;
          inlineTrail.style.letterSpacing = cs.letterSpacing;
          inlineTrail.style.lineHeight = cs.lineHeight;
          inlineTrail.style.paddingTop = cs.paddingTop;
          inlineTrail.style.paddingRight = cs.paddingRight;
          inlineTrail.style.paddingBottom = cs.paddingBottom;
          inlineTrail.style.paddingLeft = cs.paddingLeft;
        } catch {
          // ignore
        }
      };

      const renderInlineTrail = (candidate) => {
        if (!(inlineTrail instanceof HTMLElement)) return;

        if (
          candidate &&
          candidate.completion &&
          input.value === candidate.baseText &&
          document.activeElement === input
        ) {
          inlineTrail.textContent = "";
          inlineTrail.hidden = false;
          syncInlineTrailTypography();

          const inner = document.createElement("div");
          inner.style.width = "100%";
          inner.style.height = "100%";
          inner.style.display = "flex";
          inner.style.alignItems = "center";

          const textWrap = document.createElement("span");
          const prefix = document.createElement("span");
          prefix.className = "noteInlineTrailPrefix";
          prefix.textContent = String(candidate.baseText || "");

          const suffix = document.createElement("span");
          suffix.className = "noteInlineTrailSuffix";
          suffix.textContent = String(candidate.completion || "");

          textWrap.appendChild(prefix);
          textWrap.appendChild(suffix);
          inner.appendChild(textWrap);
          inlineTrail.appendChild(inner);
          return;
        }

        inlineTrail.textContent = "";
        inlineTrail.hidden = true;
      };

      let tabProgress = null; // { baseText, remaining, step, kind }

      const getActiveTabCompletion = () => {
        const baseText = input.value;
        if (tabProgress && tabProgress.remaining && baseText === tabProgress.baseText) {
          return { baseText, completion: tabProgress.remaining, kind: tabProgress.kind || "local" };
        }
        if (localCompletion && localCompletion.completion && baseText === localCompletion.baseText) {
          return { baseText, completion: localCompletion.completion, kind: "local" };
        }
        if (aiSuggestion && aiSuggestion.completion && baseText === aiSuggestion.baseText) {
          return { baseText, completion: aiSuggestion.completion, kind: "ai" };
        }
        return null;
      };

      const applyTabProgressStep = (candidate) => {
        if (!candidate || !candidate.completion) return false;
        const baseText = String(candidate.baseText || "");
        const remaining = String(candidate.completion || "");
        if (!remaining) return false;

        // Accept full completion in one Tab press.
        input.value = baseText + remaining;
        tabProgress = null;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      };

      const getSuggestionButtons = () =>
        Array.from(container.querySelectorAll("button.monoLinkButton")).filter((b) => b instanceof HTMLButtonElement);

      const syncFocusedIndexFromActiveElement = () => {
        const btns = getSuggestionButtons();
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !container.contains(active)) return;
        const idx = btns.indexOf(active);
        if (idx >= 0) focusedSuggestionIndex = idx;
      };

      const focusSuggestionByIndex = (idx) => {
        const btns = getSuggestionButtons();
        if (!btns.length) return false;
        const n = btns.length;
        const i = ((idx % n) + n) % n;
        focusedSuggestionIndex = i;
        for (let j = 0; j < btns.length; j++) {
          if (j === i) btns[j].setAttribute("aria-current", "true");
          else btns[j].removeAttribute("aria-current");
        }
        return safeFocus(btns[i]);
      };

      const render = () => {
        container.textContent = "";
        const hasLocal = Array.isArray(localSuggestions) && localSuggestions.length > 0;
        const hasLocalCompletion = !!(localCompletion && localCompletion.completion);
        const hasAi = !!(aiSuggestion && aiSuggestion.completion);
        const tabC = getActiveTabCompletion();

        // Inline ghost trail (same line as input)
        renderInlineTrail(tabC);

        if (!hasLocal && !hasLocalCompletion && !hasAi && !aiPending && !aiLastError) {
          container.hidden = true;
          focusedSuggestionIndex = -1;
          return;
        }

        container.hidden = false;

        const label = document.createElement("span");
        label.className = "noteAutocompleteLabel";
        label.textContent = "Suggestions:";
        container.appendChild(label);

        if (aiPending) {
          const pending = document.createElement("span");
          pending.className = "noteAutocompletePending";
          pending.textContent = "AI …";
          container.appendChild(pending);
        } else if (aiLastError) {
          const pending = document.createElement("span");
          pending.className = "noteAutocompletePending";
          pending.textContent = `AI error: ${aiLastError}`;
          container.appendChild(pending);
        }

        const addBtn = (text, kind, payload) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "monoLinkButton";
          btn.textContent = text;
          btn.dataset.autocompleteKind = kind;
          if (payload) {
            for (const [k, v] of Object.entries(payload)) {
              btn.dataset[k] = String(v);
            }
          }
          btn.addEventListener("click", () => {
            if (!(input instanceof HTMLInputElement)) return;
            const kind2 = btn.dataset.autocompleteKind;

            if (kind2 === "local") {
              const value = btn.dataset.value || "";
              input.value = value;
              input.focus();
              input.dispatchEvent(new Event("input", { bubbles: true }));
              return;
            }

            if (kind2 === "localCompletion") {
              const base = btn.dataset.baseText || "";
              const completion = btn.dataset.completion || "";
              if (!completion) return;
              if (input.value === base) {
                input.value = base + completion;
                input.focus();
                input.dispatchEvent(new Event("input", { bubbles: true }));
              }
              return;
            }

            if (kind2 === "ai") {
              const base = btn.dataset.baseText || "";
              const completion = btn.dataset.completion || "";
              if (!completion) return;
              if (input.value === base) {
                input.value = base + completion;
                input.focus();
                input.dispatchEvent(new Event("input", { bubbles: true }));
              }
              return;
            }
          });
          container.appendChild(btn);
        };

        for (const s of localSuggestions) {
          addBtn(s, "local", { value: s });
        }

        if (hasLocalCompletion) {
          const baseToken = getLastToken(localCompletion.baseText);
          const preview = `${baseToken}${String(localCompletion.completion || "")}`;
          const short = preview.length > 70 ? preview.slice(0, 67) + "…" : preview;
          addBtn(`Complete: ${short}`, "localCompletion", {
            baseText: localCompletion.baseText,
            completion: localCompletion.completion
          });
        }

        if (hasAi) {
          const baseToken = getLastToken(aiSuggestion.baseText);
          const preview = `${baseToken}${String(aiSuggestion.completion || "")}`;
          const short = preview.length > 70 ? preview.slice(0, 67) + "…" : preview;
          addBtn(`AI: ${short}`, "ai", { baseText: aiSuggestion.baseText, completion: aiSuggestion.completion });
        }

        // Keep the focus index consistent if focus is already in the container.
        syncFocusedIndexFromActiveElement();
        const btns = getSuggestionButtons();
        if (focusedSuggestionIndex >= btns.length) focusedSuggestionIndex = btns.length - 1;
        for (let j = 0; j < btns.length; j++) {
          if (j === focusedSuggestionIndex) btns[j].setAttribute("aria-current", "true");
          else btns[j].removeAttribute("aria-current");
        }
      };

      const clearAi = () => {
        aiSuggestion = null;
        aiPending = false;
        aiLastError = "";
        if (aiAbort) {
          try {
            aiAbort.abort();
          } catch {
            // ignore
          }
          aiAbort = null;
        }
      };

      const clearAll = () => {
        localSuggestions = [];
        localCompletion = null;
        clearAi();
        tabProgress = null;
        renderInlineTrail(null);
        hide();
      };

      clearNewNoteAutocomplete = clearAll;

      const queryLocalSuggestions = (query, limit = 6) => {
        const p = String(query || "").trim();
        if (!p) return [];
        try {
          const contains = `%${p}%`;
          const prefix = `${p}%`;
          const stmt = db.prepare(
            "SELECT text, MAX(updated_at) AS u, CASE WHEN text LIKE ? THEN 0 ELSE 1 END AS np " +
            "FROM notes WHERE text LIKE ? GROUP BY text ORDER BY np ASC, u DESC LIMIT ?"
          );
          // Order by: prefix matches first, then most recently updated.
          stmt.bind([prefix, contains, limit]);
          const out = [];
          while (stmt.step()) {
            const row = stmt.getAsObject();
            const t = String(row.text || "");
            if (t && t.toLowerCase() !== p.toLowerCase()) out.push(t);
          }
          stmt.free();
          return out;
        } catch (err) {
          console.error(err);
          return [];
        }
      };

      const queryBestLocalCompletion = (baseText) => {
        const base = String(baseText || "");
        if (!base.trim()) return null;
        if (endsWithWhitespace(base)) return null;

        const { token } = getLastTokenInfo(base);
        if (!token) return null;
        const tokenLower = token.toLowerCase();

        // Search for a word that starts with the last token anywhere in existing notes.
        // This enables sentence-style typing like "Get Plan" -> "Get Planview".
        try {
          const stmt = db.prepare(
            "SELECT text, updated_at FROM notes WHERE text LIKE ? ORDER BY updated_at DESC LIMIT ?"
          );
          stmt.bind([`%${token}%`, 40]);

          let bestWord = "";
          let bestUpdatedAt = -1;
          while (stmt.step()) {
            const row = stmt.getAsObject();
            const t = String(row.text || "");
            const updatedAt = Number(row.updated_at);

            const tokens = t.match(/[A-Za-z0-9_-]+/g) || [];
            for (const w of tokens) {
              if (!w) continue;
              if (w.length <= token.length) continue;
              if (w.slice(0, token.length).toLowerCase() !== tokenLower) continue;

              const isBetterLength = !bestWord || w.length < bestWord.length;
              const isBetterRecency = updatedAt > bestUpdatedAt;
              if (isBetterLength || (!isBetterLength && isBetterRecency)) {
                bestWord = w;
                bestUpdatedAt = Number.isFinite(updatedAt) ? updatedAt : bestUpdatedAt;
              }
            }
          }
          stmt.free();

          if (!bestWord) return null;
          return { baseText: base, completion: bestWord.slice(token.length) };
        } catch (err) {
          console.error(err);
          return null;
        }
      };

      const ollamaFetchViaBackground2 = async (url, opts) => {
        const { method = "GET", body, signal, timeoutMs = 60000 } = opts || {};
        const abortPromise = signal
          ? new Promise((_, reject) => {
              if (signal.aborted) reject(new DOMException("aborted", "AbortError"));
              signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
                once: true
              });
            })
          : null;
        const msgPromise = chrome.runtime.sendMessage({
          type: "ollamaFetch",
          url,
          method,
          body,
          timeoutMs: Math.max(1000, Number(timeoutMs) || 60000)
        });
        const r = await Promise.race(
          abortPromise ? [msgPromise, abortPromise] : [msgPromise]
        ).catch((err) => {
          if (err?.name === "AbortError") throw err;
          return { ok: false, error: err?.message || "fetch failed" };
        });
        if (r?.error) throw new Error(r.error);
        if (!r.ok) {
          const err = new Error(`Request failed: ${r.status}`);
          err.status = r.status;
          err.body = r.text;
          throw err;
        }
        return r;
      };

      const fetchOllamaDefaultModel = async (baseUrl, signal) => {
        const url = new URL("/api/tags", baseUrl).toString();
        const r = await ollamaFetchViaBackground2(url, { method: "GET", signal, timeoutMs: 10000 });
        const data = r.data;
        const name = data?.models?.[0]?.name;
        if (typeof name !== "string" || !name) throw new Error("No Ollama models found");
        return name;
      };

      const fetchOllamaCompletion = async (baseUrl, prompt, signal) => {
        const model = ollamaModel || (await fetchOllamaDefaultModel(baseUrl, signal));
        ollamaModel = model;
        const url = new URL("/api/generate", baseUrl).toString();
        const chatUrl = new URL("/api/chat", baseUrl).toString();

        const doFetch = async (prompt2, options) => {
          const r = await ollamaFetchViaBackground2(url, {
            method: "POST",
            body: { model, prompt: String(prompt2 || ""), stream: false, options },
            signal,
            timeoutMs: 45000
          });
          const data = r.data;
          const text = typeof data?.response === "string" ? String(data.response || "") : "";
          const doneReason = typeof data?.done_reason === "string" ? data.done_reason : "";
          return { text, meta: doneReason ? `done_reason=${doneReason}` : "" };
        };

        const doChatFetch = async (prompt2, options) => {
          const r = await ollamaFetchViaBackground2(chatUrl, {
            method: "POST",
            body: {
              model,
              stream: false,
              messages: [
                {
                  role: "system",
                  content:
                    "You are an autocomplete engine. Return only the continuation text to insert at the cursor. No quotes. One line."
                },
                { role: "user", content: String(prompt2 || "") }
              ],
              options
            },
            signal,
            timeoutMs: 45000
          });
          const data = r.data;
          const content = typeof data?.message?.content === "string" ? String(data.message.content || "") : "";
          const doneReason = typeof data?.done_reason === "string" ? data.done_reason : "";
          return { text: content, meta: doneReason ? `done_reason=${doneReason}` : "" };
        };

        const r1 = await doFetch(prompt, { num_predict: 32, temperature: 0.2, top_p: 0.9 });
        if (String(r1?.text || "").trim()) return r1.text;

        const nudge =
          "\n\nIMPORTANT: Output at least 1 visible character. If mid-word, output the missing suffix only.";
        const r2 = await doFetch(String(prompt || "") + nudge, { num_predict: 48, temperature: 0.6, top_p: 0.95 });
        if (String(r2?.text || "").trim()) return r2.text;

        const r3 = await doChatFetch(prompt, { num_predict: 48, temperature: 0.4, top_p: 0.95 });
        if (String(r3?.text || "").trim()) return r3.text;

        return "";
      };

      const scheduleRefresh = () => {
        if (localTimer) clearTimeout(localTimer);
        if (aiTimer) clearTimeout(aiTimer);

        const value = input.value;
        if (tabProgress && value !== tabProgress.baseText) tabProgress = null;
        const trimmed = String(value || "").trim();

        if (!trimmed) {
          clearAll();
          return;
        }

        // Suggestions are most useful for the current word when typing sentences.
        const suggestionsQuery = trimmed.includes(" ") ? getLastToken(trimmed) : trimmed;

        localTimer = setTimeout(() => {
          localSuggestions = queryLocalSuggestions(suggestionsQuery, 6);
          const baseText = input.value;
          const dbCompletion = queryBestLocalCompletion(baseText);
          const customCompletion = findBestCustomWordCompletion(baseText);
          // Prefer whichever produces the shortest completed word; tie-breaker prefers custom.
          if (customCompletion && dbCompletion) {
            const dbLen = getLastToken(dbCompletion.baseText).length + String(dbCompletion.completion || "").length;
            const cwLen = getLastToken(customCompletion.baseText).length + String(customCompletion.completion || "").length;
            localCompletion = cwLen <= dbLen ? customCompletion : dbCompletion;
          } else {
            localCompletion = customCompletion || dbCompletion;
          }
          render();

          // If local DB didn't yield a completion, try the English dictionary (lazy-loaded).
          if (!localCompletion) {
            const { token } = getLastTokenInfo(baseText);
            if (token && token.length >= 4) {
              void ensureEnglishDictionaryLoaded()
                .then(() => {
                  if (input.value !== baseText) return;
                  if (localCompletion) return;
                  const dictC = findBestDictionaryWordCompletion(baseText);
                  if (!dictC) return;
                  localCompletion = dictC;
                  render();
                })
                .catch((err) => {
                  console.error(err);
                });
            }
          }
        }, 140);

        clearAi();
        if (!aiEndpointBaseUrl) {
          render();
          return;
        }

        // Require a small amount of text before calling AI.
        if (trimmed.length < 3) {
          render();
          return;
        }

        aiTimer = setTimeout(async () => {
          let timedOut = false;
          let timeoutId = null;
          try {
            aiAbort = new AbortController();
            timeoutId = setTimeout(() => {
              timedOut = true;
              try {
                aiAbort.abort();
              } catch {
                // ignore
              }
            }, 12000);
            aiPending = true;
            aiLastError = "";
            render();

            // Load dictionary early so mid-word validation can reject blended junk
            // like "suggimportant" reliably (instead of only after a lazy load).
            try {
              await ensureEnglishDictionaryLoaded();
            } catch {
              // ignore
            }

            const baseText = input.value;
            const prompt = buildAiAutocompletePrompt(baseText);
            const raw = await fetchOllamaCompletion(aiEndpointBaseUrl, prompt, aiAbort.signal);
            const c = computeAiContextCompletion(baseText, raw);
            if (!c) {
              aiSuggestion = null;
              aiPending = false;
              render();
              return;
            }

            // Only keep if input hasn't changed since request started.
            if (input.value !== baseText) return;
            aiSuggestion = c;
            aiPending = false;
            render();
          } catch (err) {
              if (String(err?.name || "").toLowerCase().includes("abort")) {
                aiSuggestion = null;
                aiPending = false;
                if (timedOut) aiLastError = "timeout";
                render();
                return;
              }
            const st = err && typeof err.status === "number" ? Number(err.status) : null;
            if (st === 401 || st === 403 || st === 404) console.warn(err);
            else console.error(err);
            aiSuggestion = null;
            aiPending = false;

            const msg = String(err?.message || "").trim();
            const body = typeof err?.body === "string" ? String(err.body || "") : "";
            const snippet = body ? body.replace(/\s+/g, " ").slice(0, 140) : "";

            const hint403 = st === 403 ? getOllamaOriginsHintFor403(aiEndpointBaseUrl) : "";

            if (st === 401) aiLastError = snippet ? `401 unauthorized: ${snippet}` : "401 unauthorized";
            else if (st === 403) aiLastError = (snippet ? `403 forbidden: ${snippet}` : "403 forbidden") + hint403;
            else if (st === 404) aiLastError = snippet ? `404 not found: ${snippet}` : "404 not found";
            else if (Number.isFinite(st)) aiLastError = snippet ? `${String(st)}: ${snippet}` : String(st);
            else if (msg) aiLastError = msg.slice(0, 180);
            else aiLastError = "failed";
            render();
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
            aiAbort = null;
          }
        }, 450);
      };

      input.addEventListener("input", scheduleRefresh);

      input.addEventListener("scroll", () => {
        renderInlineTrail(getActiveTabCompletion());
      });

      window.addEventListener("resize", () => {
        renderInlineTrail(getActiveTabCompletion());
      });

      input.addEventListener("keydown", (e) => {
        // Navigate suggestions using existing Alt+Up/Alt+Down keybindings.
        if (modKeyOnly(e)) {
          const nav = getNavKeys(keyLayout);
          const key = (e.key || "").toLowerCase();
          const btns = getSuggestionButtons();
          const hasSuggestions = !container.hidden && btns.length > 0;
          if (hasSuggestions && (key === nav.down || key === nav.up)) {
            e.preventDefault();
            e.stopPropagation();
            if (focusedSuggestionIndex < 0) {
              // First jump from the input selects either first (down) or last (up).
              focusSuggestionByIndex(key === nav.down ? 0 : btns.length - 1);
            } else {
              focusSuggestionByIndex(focusedSuggestionIndex + (key === nav.down ? +1 : -1));
            }
            return;
          }
        }

        if (e.key !== "Tab") return;
        const c = getActiveTabCompletion();
        if (c && c.completion && input.value === c.baseText) {
          e.preventDefault();
          applyTabProgressStep(c);
          return;
        }

        // No completion available: keep focus in the New note input.
        e.preventDefault();
      });

      // Allow Alt+Up/Alt+Down to continue navigating while focus is on a suggestion button.
      container.addEventListener("keydown", (e) => {
        if (!modKeyActive(e) || (useNavMacModifier() ? (e.metaKey || e.altKey) : (e.ctrlKey || e.metaKey))) return;
        const nav = getNavKeys(keyLayout);
        const key = (e.key || "").toLowerCase();
        if (key !== nav.down && key !== nav.up) return;

        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !container.contains(active)) return;

        const btns = getSuggestionButtons();
        if (!btns.length) return;

        e.preventDefault();
        e.stopPropagation();
        syncFocusedIndexFromActiveElement();
        if (focusedSuggestionIndex < 0) focusedSuggestionIndex = 0;
        focusSuggestionByIndex(focusedSuggestionIndex + (key === nav.down ? +1 : -1));
      });

      input.addEventListener("blur", () => {
        // Keep suggestions visible if the user is interacting with them.
        setTimeout(() => {
          const active = document.activeElement;
          if (active instanceof Element && container.contains(active)) return;
          hide();
        }, 0);
      });

      input.addEventListener("focus", () => {
        scheduleRefresh();
      });
    }
  }


  el("createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitNewNote({ clearSearchDraftOnSuccess: !!pendingSearchTaskDraft });
  });

  document.body.addEventListener("click", async (e) => {
    const raw = e.target;
    if (!(raw instanceof Element)) return;
    const target = raw.closest("button[data-action]");
    if (!(target instanceof HTMLButtonElement)) return;

    const action = target.dataset.action;
    if (!action) return;

    if (action === "deleteLink") {
      const linkId = Number(target.dataset.linkId);
      if (!Number.isFinite(linkId)) return;

      // Capture note_id before delete so we can touch the parent note.
      let noteId = null;
      {
        const res = db.exec("SELECT note_id FROM note_links WHERE id = ?", [linkId]);
        if (res.length) {
          const v = res[0].values?.[0]?.[0];
          const n = Number(v);
          if (Number.isFinite(n)) noteId = n;
        }
      }

      deleteLink(db, linkId);

      if (noteId !== null) {
        const stmt = db.prepare("UPDATE notes SET updated_at = ? WHERE id = ?");
        stmt.run([Date.now(), noteId]);
        stmt.free();
      }

      await persist();
      await refresh();
      return;
    }

    if (action === "editDueDate" || action === "addDueDate") {
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      const card = target.closest(".noteCard[data-note-id]");
      const dueRow = card?.querySelector(".noteDueDateRow");
      if (!(dueRow instanceof HTMLElement)) return;

      let currentDueAt = null;
      try {
        const res = db.exec("SELECT due_at FROM notes WHERE id = ?", [noteId]);
        if (res.length && res[0].values?.[0]?.[0] != null) {
          currentDueAt = Number(res[0].values[0][0]);
        }
      } catch {
        // ignore
      }

      const input = document.createElement("input");
      input.type = "date";
      input.className = "noteDueDateInput bx--text-input";
      input.value = dueAtToDateString(currentDueAt);
      input.setAttribute("aria-label", "Due date");
      dueRow.innerHTML = "";
      dueRow.appendChild(input);
      input.focus();

      let done = false;
      const onDone = async () => {
        if (done) return;
        done = true;
        if (changeTimer) {
          clearTimeout(changeTimer);
          changeTimer = null;
        }
        input.removeEventListener("blur", onBlur);
        input.removeEventListener("change", onChange);
        input.removeEventListener("keydown", onKeydown);
        const val = input.value;
        if (input.parentElement === dueRow) dueRow.removeChild(input);
        let dueAt = null;
        if (val) {
          const d = new Date(val + "T00:00:00Z");
          if (Number.isFinite(d.getTime())) dueAt = d.getTime();
        }
        updateNoteDueAt(db, noteId, dueAt);
        await persist();
        await refresh();
      };

      let changeTimer = null;
      const onChange = () => {
        // Change fires on every keystroke; debounce so we only close when user stops typing.
        if (changeTimer) clearTimeout(changeTimer);
        const val = input.value;
        const m = /^(\d{4})-\d{2}-\d{2}$/.exec(val);
        if (m && Number(m[1]) >= 1000) {
          changeTimer = setTimeout(() => {
            changeTimer = null;
            onDone();
          }, 10000);
        }
      };
      const onBlur = () => {
        // Delay so the native date picker can open without closing the field.
        setTimeout(() => onDone(), 200);
      };
      const onKeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onDone();
        }
      };
      input.addEventListener("change", onChange);
      input.addEventListener("blur", onBlur);
      input.addEventListener("keydown", onKeydown);
      return;
    }

    if (action === "clearDueDate") {
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      updateNoteDueAt(db, noteId, null);
      await persist();
      await refresh();
      return;
    }

    if (action === "openObsidian") {
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      e.preventDefault();
      await openObsidianForNote(noteId);
      return;
    }

    if (action === "toggleNotes") {
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      const card = target.closest(".noteCard[data-note-id]");
      if (!(card instanceof HTMLElement)) return;
      const isOpen = openNoteEditorIds.has(noteId);
      setNotesEditorOpen(noteId, !isOpen);
      if (!isOpen) {
        void syncNoteWithObsidianVault(noteId, { navigateToObsidian: false });
      }
      return;
    }

    if (action === "togglePriority") {
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;

      let cur = "normal";
      try {
        const res = db.exec("SELECT priority FROM notes WHERE id = ?", [noteId]);
        if (res.length) {
          const v = res[0].values?.[0]?.[0];
          cur = normalizePriority(v);
        }
      } catch {
        // ignore
      }

      const next = nextPriority(cur);
      const stmt = db.prepare(
        "UPDATE notes SET priority = ?, updated_at = ? WHERE id = ?"
      );
      stmt.run([next, Date.now(), noteId]);
      stmt.free();

      await persist();
      await refresh();

      // Priority changes can re-order cards. Keep keyboard focus anchored on the
      // priority control for the same note, even if the card moved.
      const nextPriorityBtn = document.querySelector(
        `button[data-action="togglePriority"][data-note-id="${CSS.escape(String(noteId))}"]`
      );
      if (nextPriorityBtn instanceof HTMLElement) {
        try {
          nextPriorityBtn.scrollIntoView({ block: "nearest" });
        } catch {
          // ignore
        }
        safeFocus(nextPriorityBtn);
      }
      return;
    }

    if (action === "notesCmd") {
      const cmd = target.dataset.cmd;
      if (!cmd) return;
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      const card = target.closest(".noteCard[data-note-id]");
      if (!(card instanceof HTMLElement)) return;
      const editor = card.querySelector(".noteEditorArea");
      if (!(editor instanceof HTMLElement)) return;

      // Restore selection (if we have one) before applying the command.
      editor.focus();
      const saved = editorSelectionByNoteId.get(noteId);
      if (saved) {
        const sel = window.getSelection();
        if (sel) {
          try {
            sel.removeAllRanges();
            sel.addRange(saved);
          } catch {
            // ignore
          }
        }
      }

      if (cmd === "createLink") {
        const url = prompt("Link URL (https://...)");
        const normalized = url ? normalizeUrl(url) : null;
        if (!normalized) return;
        document.execCommand("createLink", false, normalized);
        return;
      }

      document.execCommand(cmd, false);
      return;
    }

    if (action === "renderMarkdown") {
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      const editor = document.querySelector(
        `.noteEditorArea[data-note-id="${CSS.escape(String(noteId))}"]`
      );
      if (!(editor instanceof HTMLElement)) return;
      const markdown = String(editor.innerText || "").replace(/\u00a0/g, " ");
      const rendered = markdownToSimpleHtml(markdown);
      if (!rendered) return;
      editor.innerHTML = rendered;
      try {
        setNotesHtml(db, noteId, renderMarkdownInNotesEditor(editor));
        await persist();
      } catch (err) {
        console.warn(err);
        return;
      }
      safeFocus(editor);
      return;
    }

    if (action === "flip" || action === "unflip") {
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      const card = target.closest(".noteCard[data-note-id]");
      if (!(card instanceof HTMLElement)) return;

      if (action === "flip") {
        card.classList.add("is-flipped");
        flippedNoteIds.add(noteId);
        requestAnimationFrame(() => morphCardHeight(card));
        keepCardInView(card);
        const descInput = card.querySelector(".linkForm input[name='description']");
        const urlInput = card.querySelector(".linkForm input[name='url']");
        const firstLink = card.querySelector(".linkList a");
        const closeBtn = card.querySelector("button[data-action='unflip']");
        if (
          !(descInput instanceof HTMLElement && safeFocus(descInput)) &&
          !(urlInput instanceof HTMLElement && safeFocus(urlInput)) &&
          !(firstLink instanceof HTMLElement && safeFocus(firstLink)) &&
          closeBtn instanceof HTMLElement
        ) {
          safeFocus(closeBtn);
        }
      } else {
        card.classList.remove("is-flipped");
        flippedNoteIds.delete(noteId);
        requestAnimationFrame(() => morphCardHeight(card));
        const flipBtn = card.querySelector("button[data-action='flip']");
        if (flipBtn instanceof HTMLElement) safeFocus(flipBtn);
      }
      return;
    }

    if (action === "moveUp" || action === "moveDown") {
      if (String(cardFilterQuery || "").trim()) return;
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      const card = target.closest(".noteCard[data-note-id]");
      if (!(card instanceof HTMLElement)) return;
      const list = card.parentElement;
      if (!(list instanceof HTMLElement)) return;
      const cards = [...list.querySelectorAll(".noteCard[data-note-id]")];
      const idx = cards.indexOf(card);
      if (idx < 0) return;
      const swapIdx = action === "moveUp" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= cards.length) return;

      const otherCard = cards[swapIdx];

      if (action === "moveUp") {
        list.insertBefore(card, otherCard);
      } else {
        list.insertBefore(otherCard, card);
      }

      const status = card.dataset.status;
      if (status === "pending") {
        persistPendingOrderFromDom(db, activeBoard, list);
      } else {
        persistCompleteOrderFromDom(db, activeBoard, list);
      }
      await persist();
      await refresh();
      const cardAfter = document.querySelector(`.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`);
      if (cardAfter instanceof HTMLElement) {
        keepCardInView(cardAfter);
        const btn = cardAfter.querySelector(`button[data-action='${action}']`);
        if (btn instanceof HTMLElement) safeFocus(btn);
      }
      return;
    }

    const idStr = target.dataset.id;
    if (!idStr) return;
    const id = Number(idStr);
    if (!Number.isFinite(id)) return;

    if (action === "deleteNote") {
      deleteNote(db, id);
      flippedNoteIds.delete(id);
      openNoteEditorIds.delete(id);
      await persist();
      await refresh();
      return;
    }

    let completedTaskThisClick = false;
    let statusChangedTaskId = null;
    if (action === "complete") {
      setStatus(db, activeBoard, id, "complete");
      completedTaskThisClick = true;
      statusChangedTaskId = id;
    }
    if (action === "pending") {
      setStatus(db, activeBoard, id, "pending");
      statusChangedTaskId = id;
    }

    await persist();
    if (statusChangedTaskId !== null && gObsidianSyncMode && String(gObsidianVaultName || "").trim()) {
      await pushNoteMarkdownToObsidianVault(statusChangedTaskId, { force: true });
    }
    await refresh();

    if (completedTaskThisClick && window.VimTodoSupportPrompt && typeof window.VimTodoSupportPrompt.scheduleAfterTaskComplete === "function") {
      void window.VimTodoSupportPrompt.scheduleAfterTaskComplete();
    }
  });

  // Prevent toolbar buttons from stealing the text selection.
  document.body.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const btn = target.closest("button[data-action='notesCmd']");
      if (!btn) return;
      e.preventDefault();
    },
    true
  );

  // Capture selection changes inside rich notes editors.
  {
    const capture = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const anchor = sel.anchorNode;
      if (!anchor) return;
      const elNode = anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
      const editor = elNode instanceof Element ? elNode.closest(".noteEditorArea") : null;
      if (!(editor instanceof HTMLElement)) return;
      const noteId = Number(editor.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      try {
        editorSelectionByNoteId.set(noteId, range.cloneRange());
      } catch {
        // ignore
      }
    };

    document.body.addEventListener(
      "mouseup",
      (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (!t.closest(".noteEditorArea")) return;
        capture();
      },
      true
    );
    document.body.addEventListener(
      "keyup",
      (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (!t.closest(".noteEditorArea")) return;
        capture();
      },
      true
    );
  }

  // Autosave rich notes HTML to SQLite while editing. Obsidian push is explicit (:x / Obsidian action).
  {
    const flushNotesEditorToDb = (editor, html) => {
      const noteId = Number(editor.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      const existing = notesEditorSaveTimers.get(noteId);
      if (existing) clearTimeout(existing);
      notesEditorSaveTimers.delete(noteId);
      try {
        setNotesHtml(db, noteId, html);
      } catch (err) {
        console.warn(err);
        return;
      }
      void persist().catch((err) => {
        console.warn(err);
      });
    };

    document.body.addEventListener("input", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("noteEditorArea")) return;
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;

      // Track undo history unless we're currently applying an undo.
      if (!vimUndoApplyingByNoteId.has(noteId)) {
        vimUndoPush(noteId, target.innerHTML);
      }

      const existing = notesEditorSaveTimers.get(noteId);
      if (existing) clearTimeout(existing);

      const t = setTimeout(() => {
        flushNotesEditorToDb(target, renderMarkdownInNotesEditor(target));
      }, 350);

      notesEditorSaveTimers.set(noteId, t);
    });

    document.body.addEventListener(
      "focusout",
      (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.classList.contains("noteEditorArea")) return;
        const related = e.relatedTarget;
        const wrap = target.closest(".noteEditor");
        if (related instanceof Node && wrap instanceof HTMLElement && wrap.contains(related)) return;
        flushNotesEditorToDb(target, renderMarkdownInNotesEditor(target));
      },
      true
    );
  }

  // Add link on card back
  document.body.addEventListener("submit", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLFormElement)) return;
    if (!target.classList.contains("linkForm")) return;
    e.preventDefault();

    const noteIdStr = target.dataset.noteId;
    const noteId = Number(noteIdStr);
    if (!Number.isFinite(noteId)) return;

    const descInput = target.querySelector("input[name='description']");
    const urlInput = target.querySelector("input[name='url']");
    if (!(descInput instanceof HTMLInputElement)) return;
    if (!(urlInput instanceof HTMLInputElement)) return;

    const description = descInput.value.trim();
    if (!description) return;

    const url = normalizeUrl(urlInput.value);
    if (!url) return;

    insertLink(db, noteId, url, description);

    // Touch parent note
    {
      const stmt = db.prepare("UPDATE notes SET updated_at = ? WHERE id = ?");
      stmt.run([Date.now(), noteId]);
      stmt.free();
    }

    descInput.value = "";
    urlInput.value = "";
    await persist();
    await refresh();

    // Refresh re-renders cards and replaces form nodes; restore focus
    // to the same flipped card's add-link flow.
    const refreshedCard = document.querySelector(
      `.noteCard[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (refreshedCard instanceof HTMLElement) {
      const nextDescInput = refreshedCard.querySelector(".linkForm input[name='description']");
      const nextUrlInput = refreshedCard.querySelector(".linkForm input[name='url']");
      if (
        !(nextDescInput instanceof HTMLElement && safeFocus(nextDescInput)) &&
        nextUrlInput instanceof HTMLElement
      ) {
        safeFocus(nextUrlInput);
      }
    }
  });
}

main().catch((err) => {
  console.error(err);
  document.body.textContent = `Error: ${err?.message || String(err)}`;
});
})();
