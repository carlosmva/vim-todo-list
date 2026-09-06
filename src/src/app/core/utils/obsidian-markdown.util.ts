import { Note, NotePriority, normalizePriority } from '../models/note.model';

const OBSIDIAN_NEW_CONTENT_MAX = 20000;

function looksLikeStoredHtml(source: string): boolean {
  const container = document.createElement('div');
  container.innerHTML = source;
  return !!container.querySelector(
    'a, strong, b, em, i, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, code, p, div, br, hr'
  );
}

export function readObsidianSyncEnabled(dbValue: string | null | undefined, envelopeSync: unknown): boolean {
  if (dbValue === '1') return true;
  if (dbValue === '0' || dbValue === '') return false;
  if (typeof envelopeSync === 'boolean') return envelopeSync;
  if (envelopeSync === 1 || envelopeSync === '1') return true;
  return false;
}

export function slugifyObsidianBoardSegment(value: string): string {
  let text = String(value || '').trim();
  if (!text) return 'board';
  text = text.replace(/[^\w\u00C0-\u024f-]+/g, '-').replace(/^-+|-+$/g, '');
  return (text || 'board').slice(0, 48);
}

export function slugifyObsidianNoteTitle(text: string): string {
  let value = String(text || '').trim();
  if (!value) return '';
  value = value.replace(/[^\w\u00C0-\u024f-]+/g, '-').replace(/^-+|-+$/g, '');
  return (value || '').slice(0, 48);
}

/** Basename stem: `title-slug` when unique on board, else `title-slug-id`. */
export function obsidianBaseFilenameStem(boardNotes: Note[], note: Note): string {
  const id = Number(note.id);
  if (!Number.isFinite(id)) return '';
  const titleSlug = slugifyObsidianNoteTitle(note.text);
  if (!titleSlug) return `note-${id}`;

  let sameSlugCount = 0;
  for (const row of boardNotes) {
    if (slugifyObsidianNoteTitle(row.text) === titleSlug) sameSlugCount += 1;
  }
  return sameSlugCount > 1 ? `${titleSlug}-${id}` : titleSlug;
}

const OBSIDIAN_DUE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDueDateForObsidian(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  return `${OBSIDIAN_DUE_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function parseDueDateFromObsidian(value: string): number | null {
  const text = String(value || '')
    .replace(/^\*\*Due:\*\*\s*/i, '')
    .trim();
  const match = text.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return null;
  const month = OBSIDIAN_DUE_MONTHS.indexOf(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (month < 0 || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  return Date.UTC(year, month, day);
}

export function formatDueDateForObsidianProperty(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDueDateFromObsidianProperty(value: string): number | null {
  const text = unquoteYamlScalar(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
}

function sameUtcDate(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return formatDueDateForObsidianProperty(a) === formatDueDateForObsidianProperty(b);
}

function unquoteYamlScalar(value: string): string {
  const text = String(value || '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2)
  ) {
    return text.slice(1, -1);
  }
  const comment = text.search(/\s+#/);
  return comment >= 0 ? text.slice(0, comment).trim() : text;
}

function quoteYamlScalar(value: string): string {
  if (value === '') return '""';
  if (/[:#\[\]{},&*!|>%@`]/.test(value) || /^\s|\s$/.test(value) || /^(true|false|null|yes|no)$/i.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function looksLikeYamlProperties(yaml: string): boolean {
  const lines = String(yaml || '')
    .split('\n')
    .map((line) => line.replace(/\t/g, '  '))
    .filter((line) => line.trim() && !line.trim().startsWith('#'));
  if (!lines.length) return true;
  return lines.every((line) => /^\s+/.test(line) || /^[\w.-]+\s*:/.test(line));
}

/** Split a closed leading Obsidian Properties fence from body Markdown. */
export function splitObsidianFrontmatter(markdown: string): ObsidianFrontmatterSplit {
  const text = String(markdown || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  if (!/^---\s*$/.test(lines[0] ?? '')) {
    return { hasFence: false, yaml: '', body: text };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (!/^---\s*$/.test(lines[i])) continue;
    const yaml = lines.slice(1, i).join('\n');
    const next = (lines[i + 1] ?? '').trim();
    const followedByFooter = /^\*Board:/.test(next);
    const hasKeyedLine = yaml.split('\n').some((line) => /^[\w.-]+\s*:/.test(line));
    if (followedByFooter && !hasKeyedLine) continue;
    if (!looksLikeYamlProperties(yaml)) continue;
    let body = lines.slice(i + 1).join('\n');
    if (body.startsWith('\n')) body = body.slice(1);
    return { hasFence: true, yaml, body };
  }
  return { hasFence: false, yaml: '', body: text };
}

function parseFlowYamlList(value: string): string[] {
  const inner = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!inner.trim()) return [];
  const items: string[] = [];
  let current = '';
  let quote = '';
  for (const char of inner) {
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',') {
      items.push(unquoteYamlScalar(current));
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) items.push(unquoteYamlScalar(current));
  return items;
}

export function parseObsidianYamlEntries(yaml: string): ObsidianYamlEntry[] {
  const lines = String(yaml || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const entries: ObsidianYamlEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i += 1;
      continue;
    }
    const keyed = line.match(/^([\w.-]+)\s*:\s*(.*)$/);
    if (!keyed) {
      i += 1;
      continue;
    }
    const key = keyed[1];
    const rest = keyed[2];
    i += 1;
    if (!rest.trim()) {
      const list: string[] = [];
      const raw: string[] = [];
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) {
          i += 1;
          continue;
        }
        const item = next.match(/^\s+-\s+(.*)$/);
        if (!item) break;
        list.push(unquoteYamlScalar(item[1]));
        raw.push(next);
        i += 1;
      }
      entries.push({ key, value: raw.length ? list : '' });
      continue;
    }
    if (rest.trim().startsWith('[') && rest.trim().endsWith(']')) {
      entries.push({ key, value: parseFlowYamlList(rest) });
      continue;
    }
    entries.push({ key, value: unquoteYamlScalar(rest) });
  }
  return entries;
}

function parseStatusProperty(value: string): Note['status'] | null {
  const text = unquoteYamlScalar(value).toLowerCase();
  if (text === 'complete' || text === 'completed' || text === 'done') return 'complete';
  if (text === 'pending' || text === 'todo' || text === 'open') return 'pending';
  return null;
}

function parsePriorityProperty(value: string): NotePriority | null {
  const text = unquoteYamlScalar(value).toLowerCase();
  if (text === 'low' || text === 'normal' || text === 'high') return text;
  return null;
}

export function parseObsidianProperties(yaml: string): ObsidianNoteProperties {
  const entries = parseObsidianYamlEntries(yaml);
  const props: ObsidianNoteProperties = {
    due: null,
    status: null,
    board: null,
    priority: null,
    vimTodoId: null,
    unknown: [],
  };
  for (const entry of entries) {
    const key = entry.key.toLowerCase();
    const scalar = Array.isArray(entry.value) ? entry.value[0] ?? '' : entry.value;
    if (key === 'due' || key === 'due_at') {
      props.due = parseDueDateFromObsidianProperty(scalar);
      continue;
    }
    if (key === 'status') {
      props.status = parseStatusProperty(scalar);
      continue;
    }
    if (key === 'board') {
      props.board = unquoteYamlScalar(scalar);
      continue;
    }
    if (key === 'priority') {
      props.priority = parsePriorityProperty(scalar);
      continue;
    }
    if (key === 'vim-todo-id' || key === 'vim_todo_id') {
      const id = Number(unquoteYamlScalar(scalar));
      props.vimTodoId = Number.isFinite(id) ? id : null;
      continue;
    }
    props.unknown.push(entry);
  }
  return props;
}

function serializeYamlValue(value: ObsidianYamlValue): string {
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `\n${value.map((item) => `  - ${quoteYamlScalar(item)}`).join('\n')}`;
  }
  return ` ${quoteYamlScalar(value)}`;
}

export function serializeObsidianProperties(props: ObsidianNoteProperties): string {
  const lines: string[] = [];
  const push = (key: string, value: ObsidianYamlValue | null | undefined) => {
    if (value == null || value === '') return;
    lines.push(`${key}:${serializeYamlValue(value)}`);
  };
  if (props.due != null) push('due', formatDueDateForObsidianProperty(props.due));
  if (props.status) push('status', props.status);
  if (props.board) push('board', props.board);
  if (props.priority) push('priority', props.priority);
  if (props.vimTodoId != null && Number.isFinite(props.vimTodoId)) push('vim-todo-id', String(props.vimTodoId));
  for (const entry of props.unknown) {
    if (KNOWN_PROPERTY_KEYS.has(entry.key.toLowerCase())) continue;
    lines.push(`${entry.key}:${serializeYamlValue(entry.value)}`);
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}

export function propertiesFromNote(note: Note, existingMarkdown = ''): ObsidianNoteProperties {
  const existing = parseObsidianProperties(splitObsidianFrontmatter(existingMarkdown).yaml);
  return {
    due: note.due_at != null && Number.isFinite(Number(note.due_at)) ? Number(note.due_at) : null,
    status: note.status === 'complete' ? 'complete' : 'pending',
    board: String(note.board || '').trim() || null,
    priority: normalizePriority(note.priority),
    vimTodoId: Number.isFinite(Number(note.id)) ? Number(note.id) : null,
    unknown: existing.unknown,
  };
}

function formatPropertyDisplay(value: string | number | null | undefined): string {
  if (value == null || value === '') return '(none)';
  return String(value);
}

export interface ObsidianMarkdownImport {
  title: string;
  notes_html: string;
  board: string;
  status: Note['status'];
  due_at: number | null;
  id: number | null;
  priority: NotePriority | null;
}

export type ObsidianYamlValue = string | string[];

export interface ObsidianYamlEntry {
  key: string;
  value: ObsidianYamlValue;
}

export interface ObsidianNoteProperties {
  due: number | null;
  status: Note['status'] | null;
  board: string | null;
  priority: NotePriority | null;
  vimTodoId: number | null;
  unknown: ObsidianYamlEntry[];
}

export interface ObsidianFrontmatterSplit {
  hasFence: boolean;
  yaml: string;
  body: string;
}

export interface ObsidianPropertyDiff {
  key: string;
  appValue: string;
  vaultValue: string;
}

export interface ObsidianNoteCompare {
  equal: boolean;
  appBody: string;
  vaultBody: string;
  propertyDiffs: ObsidianPropertyDiff[];
}

const KNOWN_PROPERTY_KEYS = new Set(['due', 'status', 'board', 'priority', 'vim-todo-id']);

export function normalizeObsidianMarkdown(value: string): string {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+---\s*\n(\*Board:\s*)/g, '\n\n---\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function obsidianHtmlToPlain(html: string): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  const el = document.createElement('div');
  el.innerHTML = html;
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

/** Export rich notes HTML to Markdown body (for vault .md). */
export function richNotesHtmlToObsidianBodyMarkdown(html: string): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const nodeToMd = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'BR') return '\n';
    if (tag === 'STRONG' || tag === 'B') {
      const inner = [...el.childNodes].map(nodeToMd).join('');
      return inner ? `**${inner}**` : '';
    }
    if (tag === 'EM' || tag === 'I') {
      const inner = [...el.childNodes].map(nodeToMd).join('');
      return inner ? `*${inner}*` : '';
    }
    if (el.classList.contains('obsidianWikiLink')) return el.textContent || '';
    if (tag === 'P') return [...el.childNodes].map(nodeToMd).join('') + '\n\n';
    if (tag === 'DIV') return [...el.childNodes].map(nodeToMd).join('') + '\n';
    if (tag === 'LI') return '- ' + [...el.childNodes].map(nodeToMd).join('') + '\n';
    if (tag === 'UL' || tag === 'OL') return [...el.childNodes].map(nodeToMd).join('');
    if (tag === 'H1') return '# ' + [...el.childNodes].map(nodeToMd).join('').trim() + '\n\n';
    if (tag === 'H2') return '## ' + [...el.childNodes].map(nodeToMd).join('').trim() + '\n\n';
    if (tag === 'H3') return '### ' + [...el.childNodes].map(nodeToMd).join('').trim() + '\n\n';
    return [...el.childNodes].map(nodeToMd).join('');
  };

  let out = [...tmp.childNodes].map(nodeToMd).join('');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

function escapeHtmlForObsidian(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeMarkdownUrl(raw: string): boolean {
  const value = String(raw || '').trim();
  if (!value || value.startsWith('#')) return true;
  try {
    const url = new URL(value, 'https://markdown.local/');
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function markdownInlineToHtml(value: string): string {
  const source = String(value || '');
  const tokens: string[] = [];
  const token = (html: string): string => {
    const key = `\u0000MD${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };

  let html = source
    .replace(/`([^`\n]+)`/g, (_, code) => token(`<code>${escapeHtmlForObsidian(code)}</code>`))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label, url) => {
      if (!isSafeMarkdownUrl(url)) return escapeHtmlForObsidian(`![${label}](${url})`);
      return token(
        `<a href="${escapeHtmlForObsidian(url)}" target="_blank" rel="noreferrer">${escapeHtmlForObsidian(label || url)}</a>`
      );
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      if (!isSafeMarkdownUrl(url)) return escapeHtmlForObsidian(`[${label}](${url})`);
      return token(
        `<a href="${escapeHtmlForObsidian(url)}" target="_blank" rel="noreferrer">${escapeHtmlForObsidian(label)}</a>`
      );
    })
    .replace(/\[\[([^\]]+)\]\]/g, (_, target) => {
      const label = String(target).split('|').pop()?.trim() || target;
      return token(`<span class="obsidianWikiLink">${escapeHtmlForObsidian(label)}</span>`);
    });

  html = escapeHtmlForObsidian(html)
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

  return html.replace(/\u0000MD(\d+)\u0000/g, (_, index) => tokens[Number(index)] || '');
}

export function markdownToSimpleHtml(markdown: string): string {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  const isBlockStart = (line: string) =>
    /^```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*(?:[-+*]|\d+\.)\s+/.test(line) ||
    /^\s*(?:---+|\*\*\*+)\s*$/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i += 1;
      out.push(
        `<pre><code${language ? ` data-language="${escapeHtmlForObsidian(language)}"` : ''}>${escapeHtmlForObsidian(code.join('\n'))}</code></pre>`
      );
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
      out.push('<hr>');
      i += 1;
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${markdownToSimpleHtml(quote.join('\n'))}</blockquote>`);
      continue;
    }
    const listMatch = line.match(/^\s*((?:[-+*])|(?:\d+\.))\s+(.+)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*((?:[-+*])|(?:\d+\.))\s+(.+)$/);
        if (!item || /\d+\./.test(item[1]) !== ordered) break;
        const task = item[2].match(/^\[([ xX])\]\s+(.+)$/);
        const body = task
          ? `<input type="checkbox" disabled${task[1].toLowerCase() === 'x' ? ' checked' : ''}> ${markdownInlineToHtml(task[2])}`
          : markdownInlineToHtml(item[2]);
        items.push(`<li${task ? ' class="noteMarkdownTask"' : ''}>${body}</li>`);
        i += 1;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const paragraph = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++]);
    out.push(`<p>${paragraph.map(markdownInlineToHtml).join('<br>')}</p>`);
  }
  return out.join('');
}

export function obsidianMarkdownBodyToNotesHtml(bodyMd: string): string {
  return markdownToSimpleHtml(bodyMd);
}

/** Body Markdown without the Properties fence (title, due line, notes, footer). */
export function buildObsidianMarkdownBody(note: Note): string {
  const id = Number(note.id);
  const title = String(note.text || '').trim() || `Note ${Number.isFinite(id) ? id : ''}`.trim();
  const lines: string[] = [`# ${title}`, ''];
  const due = note.due_at != null ? Number(note.due_at) : null;
  if (due != null && Number.isFinite(due)) {
    lines.push(`**Due:** ${formatDueDateForObsidian(due)}`, '');
  }

  const rich = note.notes_html && String(note.notes_html).trim();
  if (rich) {
    let bodyMd = looksLikeStoredHtml(rich) ? richNotesHtmlToObsidianBodyMarkdown(rich) : rich;
    if (!String(bodyMd || '').trim() && looksLikeStoredHtml(rich)) bodyMd = obsidianHtmlToPlain(rich);
    if (String(bodyMd || '').trim()) {
      lines.push(String(bodyMd).trim(), '');
    }
  }

  lines.push('---');
  lines.push(`*Board: ${String(note.board || '')} · Vim To-Do (id ${Number.isFinite(id) ? id : '?'})*`);
  lines.push(note.status === 'complete' ? '#vim-todo/complete' : '#vim-todo/pending');

  let out = lines.join('\n');
  if (out.length > OBSIDIAN_NEW_CONTENT_MAX) {
    out = `${out.slice(0, OBSIDIAN_NEW_CONTENT_MAX)}\n\n…`;
  }
  return out;
}

/** Vault Markdown for a note: Properties fence plus canonical body. */
export function buildObsidianMarkdown(note: Note, existingMarkdown = ''): string {
  const yaml = serializeObsidianProperties(propertiesFromNote(note, existingMarkdown));
  const body = buildObsidianMarkdownBody(note);
  return `---\n${yaml}---\n\n${body}`;
}

export function compareObsidianNoteToVault(note: Note, vaultMarkdown: string): ObsidianNoteCompare {
  const appBody = normalizeObsidianMarkdown(buildObsidianMarkdownBody(note));
  const split = splitObsidianFrontmatter(vaultMarkdown);
  const vaultBody = normalizeObsidianMarkdown(split.body);
  const vaultProps = parseObsidianProperties(split.yaml);
  const propertyDiffs: ObsidianPropertyDiff[] = [];
  if (vaultProps.due != null && !sameUtcDate(vaultProps.due, note.due_at)) {
    propertyDiffs.push({
      key: 'due',
      appValue: note.due_at != null ? formatDueDateForObsidianProperty(note.due_at) : '(none)',
      vaultValue: formatDueDateForObsidianProperty(vaultProps.due),
    });
  }
  if (vaultProps.status != null && vaultProps.status !== note.status) {
    propertyDiffs.push({
      key: 'status',
      appValue: formatPropertyDisplay(note.status),
      vaultValue: formatPropertyDisplay(vaultProps.status),
    });
  }
  if (vaultProps.board != null && vaultProps.board !== String(note.board || '')) {
    propertyDiffs.push({
      key: 'board',
      appValue: formatPropertyDisplay(note.board),
      vaultValue: formatPropertyDisplay(vaultProps.board),
    });
  }
  if (vaultProps.priority != null && vaultProps.priority !== normalizePriority(note.priority)) {
    propertyDiffs.push({
      key: 'priority',
      appValue: formatPropertyDisplay(normalizePriority(note.priority)),
      vaultValue: formatPropertyDisplay(vaultProps.priority),
    });
  }
  if (vaultProps.vimTodoId != null && vaultProps.vimTodoId !== Number(note.id)) {
    propertyDiffs.push({
      key: 'vim-todo-id',
      appValue: formatPropertyDisplay(note.id),
      vaultValue: formatPropertyDisplay(vaultProps.vimTodoId),
    });
  }
  return {
    equal: appBody === vaultBody && propertyDiffs.length === 0,
    appBody,
    vaultBody,
    propertyDiffs,
  };
}

/**
 * Parse vault Markdown back into title + notes body.
 * The notes editor/preview store markdown in `notes_html`, so keep the body as
 * markdown — converting to HTML would later be stripped to plain text.
 */
export function parseObsidianMarkdownImport(md: string): ObsidianMarkdownImport {
  const split = splitObsidianFrontmatter(md);
  const props = parseObsidianProperties(split.yaml);
  const norm = normalizeObsidianMarkdown(split.body);
  const footer = norm.match(/\*Board:\s*(.*?)\s*·\s*Vim To-Do \(id\s+(\d+)\)\*/);
  const board = props.board || footer?.[1]?.trim() || '';
  const parsedId = footer ? Number(footer[2]) : NaN;
  const footerId = Number.isFinite(parsedId) ? parsedId : null;
  const id = props.vimTodoId ?? footerId;
  const status: Note['status'] = props.status ?? (/#vim-todo\/complete\b/.test(norm) ? 'complete' : 'pending');

  const lines = norm.split('\n');
  let i = 0;
  let title = '';
  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim();
    i = 1;
  }
  while (i < lines.length && lines[i].trim() === '') i += 1;
  let due_at: number | null = null;
  if (lines[i] && /^\*\*Due:\*\*/.test(lines[i])) {
    due_at = parseDueDateFromObsidian(lines[i]);
    i += 1;
  }
  if (props.due != null) due_at = props.due;
  while (i < lines.length && lines[i].trim() === '') i += 1;

  let rest = lines.slice(i).join('\n');
  const sepIdx = rest.search(/\n---\s*\n\*Board:/);
  if (sepIdx >= 0) rest = rest.slice(0, sepIdx).trim();
  else {
    const alt = rest.lastIndexOf('\n---');
    if (alt >= 0 && /\n---\s*$/m.test(rest.slice(alt))) rest = rest.slice(0, alt).trim();
  }

  return { title, notes_html: rest, board, status, due_at, id, priority: props.priority };
}
