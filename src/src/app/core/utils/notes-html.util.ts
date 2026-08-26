/** Plain text extracted from rich notes HTML (matches legacy popup.js behavior). */
export function htmlToReadableText(html: string): string {
  const source = String(html || '').trim();
  if (!source) return '';

  const container = document.createElement('div');
  container.innerHTML = source;

  const out: string[] = [];
  const isBlockTag = (tag: string) =>
    tag === 'P' || tag === 'DIV' || tag === 'LI' || tag === 'TR' || /^H[1-6]$/.test(tag);

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.nodeValue || '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === 'BR') {
      out.push('\n');
      return;
    }

    if (tag === 'A') {
      const text = (el.textContent || '').trim();
      const href = (el.getAttribute('href') || '').trim();
      if (text) out.push(text);
      if (!text && href) out.push(href);
      if (text && href && href !== text) out.push(` (${href})`);
      return;
    }

    for (const child of el.childNodes) walk(child);
    if (isBlockTag(tag)) out.push('\n');
  };

  for (let i = 0; i < container.childNodes.length; i++) {
    walk(container.childNodes[i]);
    if (i >= container.childNodes.length - 1) continue;
    const cur = container.childNodes[i];
    const next = container.childNodes[i + 1];
    const curText = cur.nodeType === Node.TEXT_NODE && (cur.textContent || '').trim();
    const nextBlock =
      next.nodeType === Node.ELEMENT_NODE && isBlockTag((next as HTMLElement).tagName);
    if (curText && nextBlock && out.length > 0 && out[out.length - 1] !== '\n') {
      out.push('\n');
    }
  }

  return out
    .join('')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[\t ]+\n/g, '\n')
    .trim();
}

function looksLikeStoredHtml(source: string): boolean {
  const container = document.createElement('div');
  container.innerHTML = source;
  return !!container.querySelector(
    'a, strong, b, em, i, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, code, p, div, br, hr'
  );
}

/** Persist editor content as markdown source for ngx-markdown preview. */
export function editorContentToMarkdown(editor: HTMLElement): string {
  // innerText preserves line breaks from contenteditable block boundaries reliably.
  const text = (editor.innerText || editor.textContent || '').replace(/\u00a0/g, ' ');
  if (text.trim()) return text;
  const html = editor.innerHTML.trim();
  if (html && looksLikeStoredHtml(html)) return htmlToReadableText(html);
  return text;
}

/** Markdown passed to ngx-markdown [data] when the notes editor is closed. */
export function notesContentToPreviewMarkdown(stored: string): string {
  const source = String(stored || '').trim();
  if (!source) return '';
  if (looksLikeStoredHtml(source)) return htmlToReadableText(source);
  return source;
}

/** @deprecated use notesContentToPreviewMarkdown */
export function notesHtmlToPreviewMarkdown(html: string): string {
  return notesContentToPreviewMarkdown(html);
}

export function hasNotesPreviewContent(html: string): boolean {
  return notesContentToPreviewMarkdown(html).trim().length > 0;
}

/** Seed the contenteditable with editable markdown/plain text. */
export function notesContentForEditorSeed(stored: string): string {
  return notesContentToPreviewMarkdown(stored);
}

/** Apply markdown source to a contenteditable while preserving line breaks. */
export function applyMarkdownToEditor(editor: HTMLElement, markdown: string): void {
  if (!markdown) {
    // Match browser default block so the first typed line stays in a <div>.
    editor.innerHTML = '<div><br></div>';
    return;
  }
  editor.innerText = markdown;
}
