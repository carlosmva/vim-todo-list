import { Note } from '../models/note.model';

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

export function formatDueDateForObsidian(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

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

/** Markdown stored in the vault for a note (legacy popup.js parity). */
export function buildObsidianMarkdown(note: Note): string {
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

/**
 * Parse vault Markdown back into title + notes body.
 * The notes editor/preview store markdown in `notes_html`, so keep the body as
 * markdown — converting to HTML would later be stripped to plain text.
 */
export function parseObsidianMarkdownImport(md: string): { title: string; notes_html: string } {
  const norm = normalizeObsidianMarkdown(md);
  const lines = norm.split('\n');
  let i = 0;
  let title = '';
  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim();
    i = 1;
  }
  while (i < lines.length && lines[i].trim() === '') i += 1;
  if (lines[i] && /^\*\*Due:\*\*/.test(lines[i])) i += 1;
  while (i < lines.length && lines[i].trim() === '') i += 1;

  let rest = lines.slice(i).join('\n');
  const sepIdx = rest.search(/\n---\s*\n\*Board:/);
  if (sepIdx >= 0) rest = rest.slice(0, sepIdx).trim();
  else {
    const alt = rest.lastIndexOf('\n---');
    if (alt >= 0 && /\n---\s*$/m.test(rest.slice(alt))) rest = rest.slice(0, alt).trim();
  }

  return { title, notes_html: rest };
}
