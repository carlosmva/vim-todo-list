/* global initSqlJs */

const STORAGE_KEY = "sqliteDb_v1";
const ACTIVE_BOARD_KEY = "activeBoard_v1";
const KEY_LAYOUT_KEY = "keyLayout_v1";
const THEME_KEY = "theme_v1";
const DEFAULT_TAB_NAME = "To Do";

const openNoteEditorIds = new Set();
const flippedNoteIds = new Set();
let cardFilterQuery = "";

function bytesToBase64(bytes) {
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
  if (!b64) return null;
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

async function loadTheme() {
  const result = await chrome.storage.local.get([THEME_KEY]);
  const value = result[THEME_KEY];
  if (value === "light" || value === "dark") return value;
  return null;
}

async function saveTheme(theme) {
  await chrome.storage.local.set({ [THEME_KEY]: theme });
}

async function saveDbBytes(bytes) {
  const b64 = bytesToBase64(bytes);
  await chrome.storage.local.set({ [STORAGE_KEY]: b64 });
}

function ensureSchema(db, defaultBoard = DEFAULT_TAB_NAME) {
  // Enable FK constraints (needed for ON DELETE CASCADE to work).
  // sql.js (SQLite) defaults to foreign_keys=OFF.
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS boards (
      name TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL
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

  // Migrate older DBs that predate note link descriptions
  try {
    db.run("ALTER TABLE note_links ADD COLUMN description TEXT");
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
      "SELECT DISTINCT board FROM notes WHERE board IS NOT NULL AND board <> ''"
    );
    const names = noteBoards.length ? noteBoards[0].values.map((r) => r[0]) : [];
    if (names.length) {
      db.run("BEGIN");
      const ins = db.prepare(
        "INSERT OR IGNORE INTO boards(name, created_at) VALUES(?, ?)"
      );
      try {
        for (const n of names) ins.run([String(n), Date.now()]);
      } finally {
        ins.free();
        db.run("COMMIT");
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
        "INSERT OR IGNORE INTO boards(name, created_at) VALUES(?, ?)"
      );
      stmt.run([defaultBoard, Date.now()]);
      stmt.free();
    }
  } catch {
    // ignore
  }
}

function queryBoards(db) {
  const res = db.exec(
    "SELECT name FROM boards ORDER BY created_at ASC, name ASC"
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
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO boards(name, created_at) VALUES(?, ?)"
  );
  stmt.run([n, Date.now()]);
  stmt.free();
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

function queryDashboardStats(db) {
  const stats = {
    pending: {}, // { boardName: { low, normal, high } }
    complete: {},
    boards: [],
    oldestPending: null,
    newestCreated: null,
    recentlyCompleted: null
  };

  try {
    const gridRes = db.exec(
      `SELECT board, priority, status, COUNT(*) AS cnt
       FROM notes
       WHERE board IS NOT NULL AND board <> ''
       GROUP BY board, priority, status`
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
      stats.boards = [...boardsSet].sort();
    }

    const oldestRes = db.exec(
      "SELECT created_at FROM notes WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1"
    );
    if (oldestRes.length && oldestRes[0].values?.[0]?.[0] != null) {
      stats.oldestPending = Number(oldestRes[0].values[0][0]);
    }

    const newestRes = db.exec(
      "SELECT created_at FROM notes ORDER BY created_at DESC LIMIT 1"
    );
    if (newestRes.length && newestRes[0].values?.[0]?.[0] != null) {
      stats.newestCreated = Number(newestRes[0].values[0][0]);
    }

    const completedRes = db.exec(
      "SELECT completed_at FROM notes WHERE completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1"
    );
    if (completedRes.length && completedRes[0].values?.[0]?.[0] != null) {
      stats.recentlyCompleted = Number(completedRes[0].values[0][0]);
    }
  } catch {
    // ignore
  }
  return stats;
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
      SELECT id, text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board
      FROM notes
      WHERE board = ?
      ORDER BY
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 ELSE 1 END,
        CASE WHEN status = 'pending' THEN sort_order ELSE NULL END ASC,
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
    board: row[idx.board]
  }));
}

function getNextPendingSortOrder(db, board) {
  const res = db.exec(
    "SELECT COALESCE(MAX(sort_order), -1) AS m FROM notes WHERE board = ? AND status = 'pending'",
    [board]
  );
  if (!res.length) return 0;
  const maxVal = res[0].values?.[0]?.[0];
  const n = Number(maxVal);
  return Number.isFinite(n) ? n + 1 : 0;
}

function insertNote(db, board, text) {
  const now = Date.now();
  const stmt = db.prepare(
    "INSERT INTO notes(text, status, priority, created_at, updated_at, completed_at, notes_html, sort_order, board) VALUES (?, 'pending', 'normal', ?, ?, NULL, '', ?, ?)"
  );
  stmt.run([text.trim(), now, now, getNextPendingSortOrder(db, board), board]);
  stmt.free();
}

function setNotesHtml(db, noteId, html) {
  const stmt = db.prepare(
    "UPDATE notes SET notes_html = ?, updated_at = ? WHERE id = ?"
  );
  stmt.run([html, Date.now(), noteId]);
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

  const stmt = db.prepare(
    "UPDATE notes SET status = 'complete', completed_at = ?, updated_at = ? WHERE id = ?"
  );
  stmt.run([now, now, id]);
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
  const haystack = `${note?.text || ""} ${plainNotes}`.toLowerCase();
  return haystack.includes(q);
}

function renderNotes(db, notes) {
  const pendingList = el("pendingList");
  const completeList = el("completeList");
  pendingList.textContent = "";
  completeList.textContent = "";

  let pendingCount = 0;
  let completeCount = 0;
  const visibleNotes = notes.filter((note) => noteMatchesFilter(note, cardFilterQuery));

  for (const note of visibleNotes) {
    const card = document.createElement("div");
    card.className = "bx--tile noteCard";
    card.dataset.noteId = String(note.id);
    card.dataset.status = note.status;
    card.dataset.priority = normalizePriority(note.priority);

    if (flippedNoteIds.has(note.id)) card.classList.add("is-flipped");

    const inner = document.createElement("div");
    inner.className = "noteCardInner";

    // Front
    const front = document.createElement("div");
    front.className = "noteFace";

    const body = document.createElement("div");
    body.className = "noteText";
    body.textContent = note.text;

    const links = queryLinks(db, note.id);

    const attachments = document.createElement("div");
    attachments.className = "noteAttachments";
    if (links.length) {
      const title = document.createElement("div");
      title.className = "noteAttachmentsTitle";
      title.textContent = "Attachments:";
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
    priorityBtn.textContent = `Priority: ${formatPriorityLabel(note.priority)}`;
    priorityBtn.className = "monoLinkButton";
    priorityBtn.dataset.action = "togglePriority";
    priorityBtn.dataset.noteId = String(note.id);
    priorityBtn.setAttribute(
      "aria-label",
      `Priority: ${formatPriorityLabel(note.priority)}. Activate to change.`
    );

    const notesBtn = document.createElement("button");
    notesBtn.type = "button";
    notesBtn.textContent = "Notes";
    notesBtn.className = "monoLinkButton";
    notesBtn.dataset.action = "toggleNotes";
    notesBtn.dataset.noteId = String(note.id);

    const moveBtn = document.createElement("button");
    moveBtn.className = "monoLinkButton";

    const editorOpen = openNoteEditorIds.has(note.id);
    if (editorOpen) card.classList.add("is-notes-open");

    if (note.status === "pending") {
      moveBtn.textContent = "Mark complete";
      moveBtn.dataset.action = "complete";
      pendingCount++;
      card.setAttribute("aria-grabbed", "false");
    } else {
      moveBtn.textContent = "Move to pending";
      moveBtn.dataset.action = "pending";
      completeCount++;
    }

    // Pending cards are draggable for reordering, except when the rich editor
    // is open (click+drag should select text, not start DnD).
    card.draggable = note.status === "pending" && !editorOpen;

    moveBtn.dataset.id = String(note.id);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "monoLinkButton";
    deleteBtn.dataset.action = "deleteNote";
    deleteBtn.dataset.id = String(note.id);

    const flipBtn = document.createElement("button");
    flipBtn.type = "button";
    flipBtn.textContent = "Attachments";
    flipBtn.className = "monoLinkButton";
    flipBtn.dataset.action = "flip";
    flipBtn.dataset.noteId = String(note.id);

    footer.appendChild(flipBtn);
    footer.appendChild(priorityBtn);
    footer.appendChild(notesBtn);
    footer.appendChild(deleteBtn);
    footer.appendChild(moveBtn);

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

    const vimIndicator = document.createElement("div");
    vimIndicator.className = "noteVimIndicator";
    vimIndicator.dataset.noteId = String(note.id);
    vimIndicator.textContent = "";
    toolbar.appendChild(vimIndicator);

    const editor = document.createElement("div");
    editor.className = "noteEditorArea";
    editor.setAttribute("contenteditable", "true");
    editor.setAttribute("role", "textbox");
    editor.setAttribute("aria-multiline", "true");
    editor.setAttribute("aria-label", "Rich notes editor");
    editor.dataset.noteId = String(note.id);
    editor.innerHTML = typeof note.notes_html === "string" ? note.notes_html : "";

    editorWrap.appendChild(toolbar);
    editorWrap.appendChild(editor);
    front.appendChild(body);
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
  const cards = [...pendingList.querySelectorAll(".noteCard[data-note-id]")];
  const now = Date.now();
  db.run("BEGIN");
  const stmt = db.prepare(
    "UPDATE notes SET sort_order = ?, updated_at = ? WHERE id = ? AND board = ? AND status = 'pending'"
  );
  try {
    for (let i = 0; i < cards.length; i++) {
      const id = Number(cards[i].dataset.noteId);
      if (!Number.isFinite(id)) continue;
      stmt.run([i, now, id, board]);
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
    "attachment_count",
    "attachments"
  ];

  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
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
  const dashboardView = document.getElementById("dashboardView");
  const manageTabsView = document.getElementById("manageTabsView");
  const instructionsLink = document.getElementById("instructionsLink");
  const manageTabsLink = document.getElementById("manageTabsLink");
  const themeToggle = document.getElementById("themeToggle");
  const closeInstructionsBtn = document.getElementById("closeInstructionsBtn");
  const closeDashboardBtn = document.getElementById("closeDashboardBtn");
  const closeManageTabsBtn = document.getElementById("closeManageTabsBtn");
  const instructionsContent = document.getElementById("instructionsContent");
  const dashboardContent = document.getElementById("dashboardContent");
  const cardFilterRow = document.getElementById("cardFilterRow");
  const cardFilterInput = document.getElementById("cardFilterInput");
  const manageTabsMessage = document.getElementById("manageTabsMessage");
  const tabsList = document.getElementById("tabsList");
  const addTabForm = document.getElementById("addTabForm");
  const addTabName = document.getElementById("addTabName");

  function setCardFilterVisible(visible) {
    if (!(cardFilterRow instanceof HTMLElement)) return;
    cardFilterRow.hidden = !visible;
  }

  function updateCardFilterVisibility() {
    const hasQuery = !!String(cardFilterQuery || "").trim();
    const inputFocused = document.activeElement === cardFilterInput;
    setCardFilterVisible(hasQuery || inputFocused);
  }

  function showNotesView() {
    if (notesView instanceof HTMLElement) notesView.hidden = false;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = true;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = true;
    if (manageTabsView instanceof HTMLElement) manageTabsView.hidden = true;
  }

  function showInstructionsView() {
    if (notesView instanceof HTMLElement) notesView.hidden = true;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = false;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = true;
    if (manageTabsView instanceof HTMLElement) manageTabsView.hidden = true;
  }

  function showDashboardView() {
    if (notesView instanceof HTMLElement) notesView.hidden = true;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = true;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = false;
    if (manageTabsView instanceof HTMLElement) manageTabsView.hidden = true;
  }

  function showManageTabsView() {
    if (notesView instanceof HTMLElement) notesView.hidden = true;
    if (instructionsView instanceof HTMLElement) instructionsView.hidden = true;
    if (dashboardView instanceof HTMLElement) dashboardView.hidden = true;
    if (manageTabsView instanceof HTMLElement) manageTabsView.hidden = false;
  }

  const keyLayoutToggle = document.getElementById("keyLayoutToggle");
  let theme = (await loadTheme()) || "light";
  if ((await loadTheme()) === null) await saveTheme(theme);

  function applyTheme(t) {
    const value = t === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", value);
    if (themeToggle instanceof HTMLElement) {
      themeToggle.textContent = value === "dark" ? "Dark" : "Light";
      themeToggle.setAttribute("aria-label", `Theme: ${value}. Click to switch.`);
    }
  }

  applyTheme(theme);

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
    // QWERTY: Alt+H, DVORAK: Alt+D
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

    instructionsContent.innerHTML = `
      <h3>Navigation</h3>
      <ul>
        <li>${combo("Alt", fmt(openPopupKey))}: open the popup</li>
        <li><b>Keyboard layout</b>: ${layoutLabel} (toggle in header)</li>
        <li>${combo("Alt", fmt(nav.down))}: move down</li>
        <li>${combo("Alt", fmt(nav.up))}: move up</li>
        <li>${combo("Alt", fmt(nav.left))}: move left (not in notes)</li>
        <li>${combo("Alt", fmt(nav.right))}: move right (not in notes)</li>
        <li>${combo("Alt", fmt(focusNewNoteKey))}: focus new note input</li>
        <li>${keycap("/")}: focus card filter for current tab</li>
        <li>${keycap("Enter")}: activate the focused button</li>
      </ul>

      <h3>Notes editor</h3>
      <ul>
        <li>${keycap(":x")}: close notes editor or close flipped attachments</li>
        <li>${combo("Alt", fmt(checkboxKey))}: toggle crossed-out (strikethrough) text for the line</li>
        <li>${keycap("Esc")}: exit insert mode (then Esc again closes notes)</li>
      </ul>
    `;
  }

  function renderDashboard() {
    if (!(dashboardContent instanceof HTMLElement)) return;
    const s = queryDashboardStats(db);
    const pendingRows = s.boards
      .map((board) => {
        const row = s.pending[board] || { low: 0, normal: 0, high: 0 };
        return `<tr><td>${escapeHtml(board)}</td><td class="dashboardNum">${row.low}</td><td class="dashboardNum">${row.normal}</td><td class="dashboardNum">${row.high}</td></tr>`;
      })
      .join("");
    const completeRows = s.boards
      .map((board) => {
        const row = s.complete[board] || { low: 0, normal: 0, high: 0 };
        return `<tr><td>${escapeHtml(board)}</td><td class="dashboardNum">${row.low}</td><td class="dashboardNum">${row.normal}</td><td class="dashboardNum">${row.high}</td></tr>`;
      })
      .join("");
    const tableHtml = (rows) =>
      rows
        ? `<table class="dashboardTable"><thead><tr><th>Tab</th><th style="text-align: center;width:150px;">Low</th><th style="text-align: center; width:150px">Normal</th><th style="text-align: center; width:100px">High</th></tr></thead><tbody>${rows}</tbody></table>`
        : `<p>No notes yet.</p>`;

    dashboardContent.innerHTML = `
      <h3 style="font-weight: 600;">Pending</h3>
      <hr>
      ${tableHtml(pendingRows)}

      <h3 style="font-weight: 600;">Complete</h3>
      <hr>
      ${tableHtml(completeRows)}

      <h3 style="font-weight: 600;">Timing</h3>
      <hr>
      <ul>
        <li><strong>Oldest pending</strong>: ${s.oldestPending ? `${formatRelative(s.oldestPending)} (${formatDate(s.oldestPending)})` : "—"}</li>
        <li><strong>Newest created</strong>: ${s.newestCreated ? `${formatRelative(s.newestCreated)} (${formatDate(s.newestCreated)})` : "—"}</li>
        <li><strong>Last completed</strong>: ${s.recentlyCompleted ? `${formatRelative(s.recentlyCompleted)} (${formatDate(s.recentlyCompleted)})` : "—"}</li>
      </ul>

      <h3 style="font-weight: 600;">Charts</h3>
      <hr>
      <div class="dashboardCharts">
        <div id="dashboardChartPending" class="dashboardChart" aria-label="Pending by tab and priority"></div>
        <div id="dashboardChartComplete" class="dashboardChart" aria-label="Complete by tab and priority"></div>
      </div>
    `;

    if (typeof d3 !== "undefined") {
      renderDashboardCharts(s);
    }
  }

  function renderDashboardCharts(s) {
    const keys = ["low", "normal", "high"];
    const colors = { low: "#8d8d8d", normal: "#0f62fe", high: "#da1e28" };
    const labels = { low: "L", normal: "N", high: "H" };
    const ariaLabels = { low: "Low", normal: "Normal", high: "High" };
    const margin = { top: 36, right: 12, bottom: 32, left: 36 };
    const chartWidth = 280;
    const chartHeight = 180;

    const renderChart = (containerId, grid, title) => {
      const el = document.getElementById(containerId);
      if (!el) return;
      if (!s.boards.length) {
        el.innerHTML = "<p class=\"dashboardChartEmpty\">No data</p>";
        return;
      }
      el.innerHTML = "";

      const data = s.boards.map((tab) => {
        const row = grid[tab] || { low: 0, normal: 0, high: 0 };
        return { tab, low: row.low, normal: row.normal, high: row.high };
      });

      const totalMax = Math.ceil(d3.max(data, (d) => d.low + d.normal + d.high) || 1);
      const width = chartWidth - margin.left - margin.right;
      const height = chartHeight - margin.top - margin.bottom;

      const svg = d3
        .select(el)
        .append("svg")
        .attr("width", chartWidth)
        .attr("height", chartHeight)
        .attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

      const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

      const headerY = 14;
      svg
        .append("text")
        .attr("x", margin.left)
        .attr("y", headerY)
        .attr("text-anchor", "start")
        .attr("class", "dashboardChartTitle")
        .text(title);

      const legendItemWidth = 28;
      const legendRightPadding = 22;
      const legend = svg
        .append("g")
        .attr("class", "dashboardChartLegend")
        .attr("role", "list")
        .attr("aria-label", "Priority legend: Low, Normal, High")
        .attr("transform", `translate(${chartWidth - margin.right - legendRightPadding}, ${headerY})`);
      keys.forEach((key, i) => {
        const item = legend
          .append("g")
          .attr("role", "listitem")
          .attr("aria-label", `${ariaLabels[key]} priority`)
          .attr("transform", `translate(${-legendItemWidth * (keys.length - 1 - i)}, -5)`);
        const rect = item
          .append("rect")
          .attr("width", 10)
          .attr("height", 10)
          .attr("x", 0)
          .attr("fill", colors[key]);
        rect.append("title").text(ariaLabels[key]);
        item
          .append("text")
          .attr("x", 14)
          .attr("y", 9)
          .attr("font-size", "11px")
          .attr("aria-hidden", "true")
          .text(labels[key]);
      });

      const x = d3
        .scaleBand()
        .domain(s.boards)
        .range([0, width])
        .padding(0.2);

      const y = d3.scaleLinear().domain([0, totalMax]).range([height, 0]);

      const stack = d3.stack().keys(keys)(data);

      g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickSizeOuter(0))
        .selectAll("text")
        .attr("transform", "rotate(-18)")
        .style("text-anchor", "end");

      const yTickStep = totalMax <= 5 ? 1 : Math.ceil(totalMax / 5);
      const yTickValues = [];
      for (let v = 0; v <= totalMax; v += yTickStep) yTickValues.push(v);
      if (yTickValues[yTickValues.length - 1] !== totalMax) yTickValues.push(totalMax);
      g.append("g")
        .call(d3.axisLeft(y).tickValues(yTickValues).tickFormat(d3.format("d")).tickSizeOuter(0));

      const series = g
        .selectAll(".series")
        .data(stack)
        .join("g")
        .attr("fill", (d) => colors[d.key] || "#999");

      series
        .selectAll("rect")
        .data((d) => d)
        .join("rect")
        .attr("x", (d) => x(d.data.tab))
        .attr("y", (d) => y(d[1]))
        .attr("height", (d) => y(d[0]) - y(d[1]))
        .attr("width", x.bandwidth());
    };

    renderChart("dashboardChartPending", s.pending, "Pending");
    renderChart("dashboardChartComplete", s.complete, "Complete");
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function setManageTabsMessage(text) {
    if (manageTabsMessage instanceof HTMLElement) manageTabsMessage.textContent = text || "";
  }

  function getNoteIdFromCardElement(card) {
    if (!(card instanceof HTMLElement)) return null;
    const id = Number(card.dataset.noteId);
    return Number.isFinite(id) ? id : null;
  }

  function renderBoardTabs(boards, activeBoard) {
    const ul = document.getElementById("boardTabs");
    if (!(ul instanceof HTMLElement)) return;
    ul.textContent = "";

    // Keep Carbon tab layout: we have variable tab count, so use flex.
    ul.style.display = "flex";
    ul.style.flexWrap = "wrap";

    for (const b of boards) {
      const li = document.createElement("li");
      li.className = "bx--tabs__nav-item";
      li.setAttribute("role", "presentation");

      const a = document.createElement("a");
      a.className = "bx--tabs__nav-link";
      a.href = "#";
      a.setAttribute("role", "tab");
      a.setAttribute("aria-selected", b === activeBoard ? "true" : "false");
      a.dataset.board = b;
      a.textContent = b;
      li.appendChild(a);
      if (b === activeBoard) li.classList.add("bx--tabs__nav-item--selected");
      ul.appendChild(li);
    }
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

  function updateKeyLayoutToggleUi() {
    if (!(keyLayoutToggle instanceof HTMLElement)) return;
    const label = keyLayout === "dvorak" ? "DVORAK" : "QWERTY";
    keyLayoutToggle.textContent = label;
    keyLayoutToggle.setAttribute(
      "aria-label",
      `Keyboard layout: ${label}. Click to switch.`
    );
  }

  updateKeyLayoutToggleUi();

  if (themeToggle instanceof HTMLElement) {
    themeToggle.addEventListener("click", async () => {
      theme = theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      await saveTheme(theme);
    });
  }

  if (keyLayoutToggle instanceof HTMLElement) {
    keyLayoutToggle.addEventListener("click", async () => {
      keyLayout = keyLayout === "dvorak" ? "qwerty" : "dvorak";
      await saveKeyLayout(keyLayout);
      updateKeyLayoutToggleUi();
      // If instructions are visible, re-render so keys match.
      const iv = document.getElementById("instructionsView");
      const visible = iv instanceof HTMLElement && !iv.hasAttribute("hidden");
      if (visible) renderInstructions();
    });
  }

  renderBoardTabs(boards, activeBoard);

  // Track editor selection per-note so toolbar clicks can apply formatting
  // to the user's selected text (toolbar buttons would otherwise steal focus).
  const editorSelectionByNoteId = new Map();

  // Lightweight Vim-style editing for the rich notes editor.
  // Modes are per-note: 'insert' (default) and 'normal'.
  const vimModeByNoteId = new Map();
  const vimPendingByNoteId = new Map();
  const vimRegisterByNoteId = new Map();
  let lastFocusedNoteEditor = null;

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

  function getCurrentBlockElement(editor) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const anchor = sel.anchorNode;
    if (!anchor) return null;
    const anchorEl =
      anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement;
    if (!(anchorEl instanceof Element)) return null;
    if (!editor.contains(anchorEl)) return null;

    const block = anchorEl.closest(
      "li, p, div, pre, blockquote, h1, h2, h3, h4, h5, h6"
    );
    if (block instanceof HTMLElement && editor.contains(block) && block !== editor) {
      return block;
    }
    return null;
  }

  function collapseSelectionToEditorStart(editor) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
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
  }

  function vimSetMode(noteId, mode) {
    if (mode !== "insert" && mode !== "normal") return;
    vimModeByNoteId.set(noteId, mode);
    updateVimIndicatorInDom(noteId);
  }

  function vimGetMode(noteId) {
    return vimModeByNoteId.get(noteId) || "insert";
  }

  function updateVimIndicatorInDom(noteId) {
    const indicator = document.querySelector(
      `.noteVimIndicator[data-note-id="${CSS.escape(String(noteId))}"]`
    );
    if (!(indicator instanceof HTMLElement)) return;
    const mode = vimGetMode(noteId);
    indicator.textContent = mode.toUpperCase();
    indicator.classList.toggle("is-normal", mode === "normal");
  }

  function updateVimIndicatorsInDom() {
    const indicators = document.querySelectorAll(".noteVimIndicator[data-note-id]");
    for (const el of indicators) {
      if (!(el instanceof HTMLElement)) continue;
      const noteId = Number(el.dataset.noteId);
      if (!Number.isFinite(noteId)) continue;
      const mode = vimGetMode(noteId);
      el.textContent = mode.toUpperCase();
      el.classList.toggle("is-normal", mode === "normal");
    }
  }

  function vimClearPending(noteId) {
    vimPendingByNoteId.delete(noteId);
  }

  function vimPendingIs(noteId, key, withinMs) {
    const p = vimPendingByNoteId.get(noteId);
    if (!p) return false;
    if (p.key !== key) return false;
    return Date.now() - p.at <= withinMs;
  }

  function vimSetPending(noteId, key) {
    vimPendingByNoteId.set(noteId, { key, at: Date.now() });
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

  function vimYankCurrentBlock(editor) {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return;
    const block = getCurrentBlockElement(editor);
    const html = block ? block.outerHTML : editor.innerHTML;
    const text = block ? block.textContent : editor.textContent;
    vimRegisterByNoteId.set(noteId, { html, text });
  }

  function vimPasteAfterBlock(editor) {
    const noteId = getNoteIdFromEditor(editor);
    if (noteId === null) return;
    const reg = vimRegisterByNoteId.get(noteId);
    if (!reg || (!reg.html && !reg.text)) return;

    const block = getCurrentBlockElement(editor);
    const tpl = document.createElement("template");
    tpl.innerHTML = reg.html || "";
    const node = tpl.content.firstElementChild;

    if (node instanceof HTMLElement) {
      if (block) {
        block.insertAdjacentElement("afterend", node);
        collapseSelectionToAfterNode(node);
      } else {
        editor.appendChild(node);
        collapseSelectionToAfterNode(node);
      }
    } else {
      // Fallback to plain text paste
      const text = reg.text || "";
      if (block) {
        block.insertAdjacentText("afterend", `\n${text}`);
      } else {
        editor.insertAdjacentText("beforeend", text);
      }
    }

    editor.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function activateBoard(board, { persistSelection } = { persistSelection: true }) {
    if (!board || !boards.includes(board)) return;
    if (board === activeBoard) return;

    // Navigating to another board should close any open overlays (Notes editor / Attachments).
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
  }

  function setActiveTabUi(board) {
    const tabs = document.getElementById("boardTabs");
    if (!tabs) return;
    for (const tab of tabs.querySelectorAll("[role='tab'][data-board]")) {
      const itemBoard = tab.getAttribute("data-board");
      const selected = itemBoard === board;
      tab.setAttribute("aria-selected", selected ? "true" : "false");

      // Carbon tabs use a selected class on the <li>
      const li = tab.closest(".bx--tabs__nav-item");
      if (li) {
        li.classList.toggle("bx--tabs__nav-item--selected", selected);
      }
    }
  }

  async function refresh() {
    const notes = queryNotes(db, activeBoard);
    renderNotes(db, notes);
    updateVimIndicatorsInDom();
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
      if (lastFocusedNoteEditor instanceof HTMLElement) {
        const focusedId = getNoteIdFromEditor(lastFocusedNoteEditor);
        if (focusedId === noteId) lastFocusedNoteEditor = null;
      }
      if (focusToggleOnClose) {
        const notesBtn = card.querySelector("button[data-action='toggleNotes']");
        if (notesBtn instanceof HTMLElement) notesBtn.focus();
      }
      return;
    }

    if (focusEditor) {
      const editor = card.querySelector(".noteEditorArea");
      if (editor instanceof HTMLElement) editor.focus();
    }

    keepCardInView(card);
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
  setActiveTabUi(activeBoard);
  await refresh();
  updateCardFilterVisibility();

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
      if (e.key !== "Escape") return;
      e.preventDefault();
      cardFilterInput.value = "";
      cardFilterQuery = "";
      updateCardFilterVisibility();
      void refresh();
      const noteText = document.getElementById("noteText");
      if (noteText instanceof HTMLElement) safeFocus(noteText);
    });
  }

  // Initial focus: start on the last-selected board tab when the popup opens.
  // Only do this if nothing meaningful is focused yet.
  setTimeout(() => {
    try {
      const active = document.activeElement;
      const hasMeaningfulFocus =
        active &&
        active !== document.body &&
        active !== document.documentElement &&
        active instanceof HTMLElement;
      if (hasMeaningfulFocus) return;

      const activeTab = document.querySelector(
        "#boardTabs [role='tab'][aria-selected='true']"
      );
      if (activeTab instanceof HTMLElement) {
        try {
          activeTab.focus({ preventScroll: true });
        } catch {
          activeTab.focus();
        }
      }
    } catch {
      // ignore
    }
  }, 0);

  // Instructions view toggle
  if (instructionsLink instanceof HTMLElement) {
    instructionsLink.addEventListener("click", (e) => {
      e.preventDefault();
      renderInstructions();
      showInstructionsView();
      if (closeInstructionsBtn instanceof HTMLElement) closeInstructionsBtn.focus();
    });
  }
  if (manageTabsLink instanceof HTMLElement) {
    manageTabsLink.addEventListener("click", (e) => {
      e.preventDefault();
      setManageTabsMessage("");
      showManageTabsView();
      if (addTabName instanceof HTMLElement) addTabName.focus();
      renderManageTabs();
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
  if (closeInstructionsBtn instanceof HTMLElement) {
    closeInstructionsBtn.addEventListener("click", () => {
      showNotesView();
      const input = document.getElementById("noteText");
      if (input instanceof HTMLElement) input.focus();
    });
  }
  if (closeManageTabsBtn instanceof HTMLElement) {
    closeManageTabsBtn.addEventListener("click", () => {
      showNotesView();
      const input = document.getElementById("noteText");
      if (input instanceof HTMLElement) input.focus();
    });
  }
  if (closeDashboardBtn instanceof HTMLElement) {
    closeDashboardBtn.addEventListener("click", () => {
      showNotesView();
      const input = document.getElementById("noteText");
      if (input instanceof HTMLElement) input.focus();
    });
  }

  function renderManageTabs() {
    if (!(tabsList instanceof HTMLElement)) return;
    tabsList.textContent = "";

    const currentBoards = boards.slice();
    if (currentBoards.length <= 1) {
      setManageTabsMessage("At least one tab should exist.");
    }

    for (const b of currentBoards) {
      const row = document.createElement("div");
      row.className = "manageTabsRow";

      const name = document.createElement("div");
      name.className = "manageTabsName";
      name.textContent = b;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "monoLinkButton";
      del.textContent = "Remove";
      del.disabled = currentBoards.length <= 1;
      del.addEventListener("click", async () => {
        if (boards.length <= 1) {
          setManageTabsMessage("At least one tab should exist.");
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

      row.appendChild(name);
      row.appendChild(del);
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
    focusCardPrimaryAction(targetCard);
    return true;
  }

  function focusCardFrontAttachmentsOrPrimary(card) {
    if (!(card instanceof HTMLElement)) return false;
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
    focusCardPrimaryAction(targetCard);
    return true;
  }

  function moveButtonFocusWithinCard(card, delta) {
    if (!(card instanceof HTMLElement)) return;
    const footer = card.querySelector(".noteActions");
    if (!(footer instanceof HTMLElement)) return;
    const buttons = [...footer.querySelectorAll("button")].filter(
      (b) => b instanceof HTMLButtonElement && !b.disabled
    );
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

  function getGlobalNavTargets() {
    const targets = [];

    const themeToggle = document.getElementById("themeToggle");
    const manageTabsLink = document.getElementById("manageTabsLink");
    const keyLayoutToggle = document.getElementById("keyLayoutToggle");
    const instructionsLink = document.getElementById("instructionsLink");
    if (themeToggle instanceof HTMLElement) targets.push(themeToggle);
    if (manageTabsLink instanceof HTMLElement) targets.push(manageTabsLink);
    if (keyLayoutToggle instanceof HTMLElement) targets.push(keyLayoutToggle);
    if (instructionsLink instanceof HTMLElement) targets.push(instructionsLink);

    const notesView = document.getElementById("notesView");
    const instructionsView = document.getElementById("instructionsView");
    const dashboardView = document.getElementById("dashboardView");
    const manageTabsView = document.getElementById("manageTabsView");

    const notesVisible = notesView instanceof HTMLElement && !notesView.hasAttribute("hidden");
    const instructionsVisible = instructionsView instanceof HTMLElement && !instructionsView.hasAttribute("hidden");
    const dashboardVisible = dashboardView instanceof HTMLElement && !dashboardView.hasAttribute("hidden");
    const manageTabsVisible = manageTabsView instanceof HTMLElement && !manageTabsView.hasAttribute("hidden");

    if (notesVisible) {
      const noteText = document.getElementById("noteText");
      const exportDbBtn = document.getElementById("exportDbBtn");
      const importDbBtn = document.getElementById("importDbBtn");
      const dashboardBtn = document.getElementById("dashboardBtn");
      const exportBtn = document.getElementById("exportBtn");
      const addBtn = document.querySelector("#createForm button[type='submit']");
      const cardFilterInput = document.getElementById("cardFilterInput");

      if (noteText instanceof HTMLElement) targets.push(noteText);
      if (exportDbBtn instanceof HTMLElement) targets.push(exportDbBtn);
      if (importDbBtn instanceof HTMLElement) targets.push(importDbBtn);
      if (dashboardBtn instanceof HTMLElement) targets.push(dashboardBtn);
      if (exportBtn instanceof HTMLElement) targets.push(exportBtn);
      if (addBtn instanceof HTMLElement) targets.push(addBtn);
      if (cardFilterInput instanceof HTMLElement) targets.push(cardFilterInput);

      const tabLinks = [...document.querySelectorAll("#boardTabs .bx--tabs__nav-link")].filter(
        (n) => n instanceof HTMLElement
      );
      targets.push(...tabLinks);
    }

    if (instructionsVisible) {
      const closeBtn = document.getElementById("closeInstructionsBtn");
      if (closeBtn instanceof HTMLElement) targets.push(closeBtn);
    }

    if (dashboardVisible) {
      const closeBtn = document.getElementById("closeDashboardBtn");
      if (closeBtn instanceof HTMLElement) targets.push(closeBtn);
    }

    if (manageTabsVisible) {
      const closeBtn = document.getElementById("closeManageTabsBtn");
      const addTabName = document.getElementById("addTabName");
      const addBtn = document.querySelector("#addTabForm button[type='submit']");
      if (closeBtn instanceof HTMLElement) targets.push(closeBtn);
      if (addTabName instanceof HTMLElement) targets.push(addTabName);
      if (addBtn instanceof HTMLElement) targets.push(addBtn);

      const removeButtons = [...document.querySelectorAll(".manageTabsRow button")].filter(
        (n) => n instanceof HTMLButtonElement
      );
      targets.push(...removeButtons);
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
    }

    pushContainer(document.querySelector(".list"));
    pushContainer(document.querySelector(".board"));
    pushContainer(document.getElementById("dashboardContent"));

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

  // Prevent Alt alone from activating browser menu and closing the popup
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Alt" && e.altKey && !e.ctrlKey && !e.metaKey) {
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

      const activeEl = document.activeElement;
      const inNotesUi =
        activeEl instanceof Element &&
        (activeEl.closest(".noteEditorArea") || activeEl.closest(".noteEditorToolbar") || activeEl.closest(".noteEditor"));

      const activeCard = activeEl instanceof Element ? getCardFromElement(activeEl) : null;
      const flippedCard =
        (activeCard && activeCard.classList.contains("is-flipped")
          ? activeCard
          : document.querySelector(".noteCard.is-flipped")) || null;

      const inAttachmentsUi =
        activeEl instanceof Element &&
        flippedCard instanceof HTMLElement &&
        flippedCard.contains(activeEl) &&
        !inNotesUi;

      // Esc while in the notes editor UI should not let Chrome close the popup.
      // - If the editor is in insert mode, Esc exits to normal mode.
      // - If already in normal mode, Esc closes the notes editor.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === "Escape" && inNotesUi) {
        e.preventDefault();
        e.stopPropagation();

        const card = activeCard;
        const noteId = card ? Number(card.dataset.noteId) : NaN;
        if (!Number.isFinite(noteId)) return;

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
      if (!e.ctrlKey && !e.metaKey && !e.altKey && inAttachmentsUi) {
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
      if (inAttachmentsUi && e.altKey && !e.ctrlKey && !e.metaKey) {
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

      // Alt+<layout key> (within notes): insert/toggle checkbox at line start.
      const checkboxKey = getNotesCheckboxKey(keyLayout);
      if (
        inNotesUi &&
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
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

      // While in notes, Alt+<nav key> should move caret in insert mode, not trigger navigation
      if (
        inNotesUi &&
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
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
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
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
            setNotesEditorOpen(pending.noteId, false, { focusEditor: false, focusToggleOnClose: true });
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

      if (!e.altKey || e.ctrlKey || e.metaKey) return;

      const focusNewNoteKey = getFocusNewNoteKey(keyLayout);
      if (key === focusNewNoteKey) {
        e.preventDefault();
        e.stopPropagation();
        const notesView = document.getElementById("notesView");
        const notesVisible =
          notesView instanceof HTMLElement && !notesView.hasAttribute("hidden");
        if (notesVisible) {
          const noteText = document.getElementById("noteText");
          if (noteText instanceof HTMLElement) safeFocus(noteText);
        }
        return;
      }

      if (key === nav.down) {
        e.preventDefault();
        e.stopPropagation();
        const activeEl2 = document.activeElement;
        const activeCard2 = activeEl2 instanceof Element ? getCardFromElement(activeEl2) : null;
        if (activeCard2 instanceof HTMLElement) {
          const inFrontAttachments2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteAttachmentsItems") !== null;
          const inCardActions2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteActions") !== null;

          // Vertical levels:
          // attachments row -> same card action row -> next card attachments/action row
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

        const belowTabs =
          activeEl2 instanceof Element &&
          (
            activeEl2.closest(".board") !== null ||
            activeEl2.closest(".col") !== null ||
            activeEl2.closest(".list") !== null ||
            activeEl2.closest(".noteEditor") !== null ||
            activeEl2.closest(".noteBackBody") !== null
          );
        if ((belowTabs || inDashboard) && tryScrollBeforeSectionMove(+1)) return;

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
                focusCardFrontAttachmentsOrPrimary(cards[0]);
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
          const dashboardView = document.getElementById("dashboardView");
          const manageTabsView = document.getElementById("manageTabsView");

          const notesVisible = notesView instanceof HTMLElement && !notesView.hasAttribute("hidden");
          const instructionsVisible =
            instructionsView instanceof HTMLElement && !instructionsView.hasAttribute("hidden");
          const dashboardVisible =
            dashboardView instanceof HTMLElement && !dashboardView.hasAttribute("hidden");
          const manageTabsVisible =
            manageTabsView instanceof HTMLElement && !manageTabsView.hasAttribute("hidden");

          if (notesVisible) {
            const noteText = document.getElementById("noteText");
            if (noteText instanceof HTMLElement) safeFocus(noteText);
            return;
          }

          if (manageTabsVisible) {
            const addTabName = document.getElementById("addTabName");
            if (addTabName instanceof HTMLElement) safeFocus(addTabName);
            return;
          }

          if (dashboardVisible) {
            const closeBtn = document.getElementById("closeDashboardBtn");
            if (closeBtn instanceof HTMLElement) safeFocus(closeBtn);
            return;
          }

          if (instructionsVisible) {
            const closeBtn = document.getElementById("closeInstructionsBtn");
            if (closeBtn instanceof HTMLElement) safeFocus(closeBtn);
            return;
          }
        }

        // If focus is on the create actions row, "down" should go to the tabs.
        const exportDbBtn = document.getElementById("exportDbBtn");
        const importDbBtn = document.getElementById("importDbBtn");
        const dashboardBtn = document.getElementById("dashboardBtn");
        const exportBtn = document.getElementById("exportBtn");
        const createSubmitBtn = document.querySelector("#createForm button[type='submit']");
        const isCreateActionEl =
          activeEl2 === exportDbBtn ||
          activeEl2 === importDbBtn ||
          activeEl2 === dashboardBtn ||
          activeEl2 === exportBtn ||
          activeEl2 === createSubmitBtn ||
          (activeEl2 instanceof Element && activeEl2.closest(".createButtons") !== null);

        if (isCreateActionEl) {
          const cardFilterInput = document.getElementById("cardFilterInput");
          if (cardFilterInput instanceof HTMLElement && safeFocus(cardFilterInput)) return;

          const activeTab = document.querySelector(
            "#boardTabs [role='tab'][aria-selected='true']"
          );
          if (activeTab instanceof HTMLElement && safeFocus(activeTab)) return;

          const firstTab = document.querySelector("#boardTabs .bx--tabs__nav-link");
          if (firstTab instanceof HTMLElement && safeFocus(firstTab)) return;
          // If tabs are missing for some reason, fall back to entering the cards.
          const cards = getAllCardsInDomOrder();
          if (cards.length) focusCardFrontAttachmentsOrPrimary(cards[0]);
          return;
        }

        // If focus is on the board tabs, "down" should enter the cards area.
        const inBoardTabs =
          activeEl2 instanceof Element &&
          activeEl2.closest("#boardTabs") !== null;

        if (inBoardTabs) {
          const cards = getAllCardsInDomOrder();
          if (cards.length) focusCardFrontAttachmentsOrPrimary(cards[0]);
          else {
            const noteText = document.getElementById("noteText");
            if (noteText instanceof HTMLElement) safeFocus(noteText);
          }
          return;
        }

        moveGlobalFocus(+1);
        return;
      }

      if (key === nav.up) {
        e.preventDefault();
        e.stopPropagation();
        const activeEl2 = document.activeElement;
        const activeCard2 = activeEl2 instanceof Element ? getCardFromElement(activeEl2) : null;
        if (activeCard2 instanceof HTMLElement) {
          const inFrontAttachments2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteAttachmentsItems") !== null;
          const inCardActions2 =
            activeEl2 instanceof Element && activeEl2.closest(".noteActions") !== null;

          // Vertical levels:
          // next card action row <- same card action row <- same card attachments row
          if (inCardActions2) {
            const links = getFrontAttachmentLinks(activeCard2);
            if (links.length) {
              const target = links[links.length - 1];
              if (safeFocus(target)) return;
            }
            if (focusAdjacentCardPrimaryAction(activeCard2, -1)) return;
          }
          if (inFrontAttachments2) {
            if (focusAdjacentCardPrimaryAction(activeCard2, -1)) return;
          }
        }
        const dashboardViewForScroll = document.getElementById("dashboardView");
        const dashboardVisibleForScroll =
          dashboardViewForScroll instanceof HTMLElement && !dashboardViewForScroll.hasAttribute("hidden");
        const inDashboard =
          dashboardVisibleForScroll &&
          activeEl2 instanceof Element &&
          activeEl2.closest("#dashboardView") !== null;

        const belowTabs =
          activeEl2 instanceof Element &&
          (
            activeEl2.closest(".board") !== null ||
            activeEl2.closest(".col") !== null ||
            activeEl2.closest(".list") !== null ||
            activeEl2.closest(".noteEditor") !== null ||
            activeEl2.closest(".noteBackBody") !== null
          );
        if ((belowTabs || inDashboard) && tryScrollBeforeSectionMove(-1)) return;
        const card = getCardFromElement(activeEl2);
        if (card) {
          const cards = getAllCardsInDomOrder();
          const currentIdx = card instanceof HTMLElement ? cards.indexOf(card) : -1;
          if (currentIdx <= 0) {
            closeCardOverlays(card);
            const activeTab = document.querySelector(
              "#boardTabs [role='tab'][aria-selected='true']"
            );
            if (activeTab instanceof HTMLElement && safeFocus(activeTab)) return;
            const firstTab = document.querySelector("#boardTabs [role='tab']");
            if (firstTab instanceof HTMLElement) safeFocus(firstTab);
            return;
          }

          moveCardFocus(-1);
          return;
        }

        // If focus is on the create actions row, "up" should go back to the input.
        {
          const exportDbBtn = document.getElementById("exportDbBtn");
          const importDbBtn = document.getElementById("importDbBtn");
          const exportBtn = document.getElementById("exportBtn");
          const createSubmitBtn = document.querySelector("#createForm button[type='submit']");
          const isCreateActionEl =
            activeEl2 === exportDbBtn ||
            activeEl2 === importDbBtn ||
            activeEl2 === exportBtn ||
            activeEl2 === createSubmitBtn ||
            (activeEl2 instanceof Element && activeEl2.closest(".createButtons") !== null);

          if (isCreateActionEl) {
            const noteText = document.getElementById("noteText");
            if (noteText instanceof HTMLElement) safeFocus(noteText);
            return;
          }
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

        // If focus is on the board tabs, "up" should return to the create actions row.
        const inBoardTabs =
          activeEl2 instanceof Element &&
          activeEl2.closest("#boardTabs") !== null;

        if (inBoardTabs) {
          const cardFilterInput = document.getElementById("cardFilterInput");
          if (cardFilterInput instanceof HTMLElement && safeFocus(cardFilterInput)) return;

          const exportDbBtn = document.getElementById("exportDbBtn");
          const importDbBtn = document.getElementById("importDbBtn");
          const dashboardBtn = document.getElementById("dashboardBtn");
          const exportBtn = document.getElementById("exportBtn");

          if (
            (exportDbBtn instanceof HTMLElement && safeFocus(exportDbBtn)) ||
            (importDbBtn instanceof HTMLElement && safeFocus(importDbBtn)) ||
            (dashboardBtn instanceof HTMLElement && safeFocus(dashboardBtn)) ||
            (exportBtn instanceof HTMLElement && safeFocus(exportBtn))
          ) {
            return;
          }

          const noteText = document.getElementById("noteText");
          if (noteText instanceof HTMLElement) safeFocus(noteText);
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

    if (!e.altKey && isTypingTarget) return;

    const idx = Number(key) - 1;
    const board = boards[idx];
    if (!board) return;

    e.preventDefault();
    if (e.altKey) lastBoardShortcutAt = Date.now();
    void activateBoard(board, { persistSelection: true });
  });

  // "/" focuses the card filter in Notes view (when not typing in another input/editor).
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "/" || e.altKey || e.ctrlKey || e.metaKey) return;
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
      updateVimIndicatorInDom(noteId);
    },
    true
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

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

      // Normal mode commands
      const k = e.key;
      const handledKeys = new Set([
        "h",
        "j",
        "k",
        "l",
        "i",
        "a",
        "0",
        "^",
        ":",
        "x",
        "g",
        "G",
        "d",
        "y",
        "p",
        "$"
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

      if (k === "a") {
        moveSelection("forward", "character");
        vimSetMode(noteId, "insert");
        vimClearPending(noteId);
        return;
      }

      if (k === ":") {
        // Minimal ex-style command: :x closes the rich notes editor.
        vimSetPending(noteId, ":");
        return;
      }

      if (k === "x") {
        if (vimPendingIs(noteId, ":", 4000)) {
          setNotesEditorOpen(noteId, false, { focusEditor: false, focusToggleOnClose: true });
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
        vimClearPending(noteId);
        return;
      }

      if (k === "d") {
        if (vimPendingIs(noteId, "d", 700)) {
          // dd
          vimDeleteCurrentBlock(editor);
          vimClearPending(noteId);
        } else {
          vimSetPending(noteId, "d");
        }
        return;
      }

      if (k === "y") {
        if (vimPendingIs(noteId, "y", 700)) {
          // yy
          vimYankCurrentBlock(editor);
          vimClearPending(noteId);
        } else {
          vimSetPending(noteId, "y");
        }
        return;
      }

      if (k === "p") {
        vimPasteAfterBlock(editor);
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

          // Keep focus on the first tab after import.
          const boardTabs = document.getElementById("boardTabs");
          const firstTab = boardTabs?.querySelector("[role='tab'][data-board]");
          if (firstTab instanceof HTMLElement) safeFocus(firstTab);
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
      // Keyboard: activate on focus
      tabs.addEventListener("focusin", (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const tab = target.closest("[role='tab'][data-board]");
        if (!(tab instanceof HTMLElement)) return;
        const board = tab.getAttribute("data-board");
        void activateBoard(board, { persistSelection: true });
      });

      // Prevent navigation when clicking the anchor (optional; hover already switches)
      tabs.addEventListener("click", (e) => {
        e.preventDefault();
      });
    }
  }

  // Drag & drop reordering for Pending only
  {
    const pendingList = el("pendingList");
    let dragging = null;

    pendingList.addEventListener("dragstart", (e) => {
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

    pendingList.addEventListener("dragover", (e) => {
      if (!dragging) return;
      e.preventDefault();
      const after = getDragAfterElement(pendingList, e.clientY);
      if (!after) {
        pendingList.appendChild(dragging);
      } else {
        pendingList.insertBefore(dragging, after);
      }
    });

    pendingList.addEventListener("drop", (e) => {
      if (!dragging) return;
      e.preventDefault();
    });

    pendingList.addEventListener("dragend", async () => {
      if (!dragging) return;
      dragging.classList.remove("is-dragging");
      dragging.setAttribute("aria-grabbed", "false");
      dragging = null;

      persistPendingOrderFromDom(db, activeBoard, pendingList);
      await persist();
      await refresh();
    });
  }


  el("createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = el("noteText");
    const text = input.value.trim();
    if (!text) return;

    insertNote(db, activeBoard, text);
    input.value = "";
    await persist();
    await refresh();
  });

  document.body.addEventListener("click", async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName !== "BUTTON") return;

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

    if (action === "toggleNotes") {
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;
      const card = target.closest(".noteCard[data-note-id]");
      if (!(card instanceof HTMLElement)) return;
      const isOpen = openNoteEditorIds.has(noteId);
      setNotesEditorOpen(noteId, !isOpen);
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

    if (action === "complete") setStatus(db, activeBoard, id, "complete");
    if (action === "pending") setStatus(db, activeBoard, id, "pending");

    await persist();
    await refresh();
  });

  // Prevent toolbar buttons from stealing the text selection.
  document.body.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target;

      // Never start a card drag from inside the rich notes editor UI.
      if (target.closest(".noteEditor")) {
        e.preventDefault();
        return;
      }

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

  // Autosave rich notes HTML (debounced)
  {
    const saveTimers = new Map();
    document.body.addEventListener("input", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("noteEditorArea")) return;
      const noteId = Number(target.dataset.noteId);
      if (!Number.isFinite(noteId)) return;

      const html = target.innerHTML;
      const existing = saveTimers.get(noteId);
      if (existing) clearTimeout(existing);

      const t = setTimeout(async () => {
        saveTimers.delete(noteId);
        setNotesHtml(db, noteId, html);
        await persist();
      }, 350);

      saveTimers.set(noteId, t);
    });
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
