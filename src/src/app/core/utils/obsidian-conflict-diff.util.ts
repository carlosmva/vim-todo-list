export interface ObsidianConflictDiffLine {
  text: string;
  kind: 'same' | 'added' | 'removed' | 'note';
  marker: string;
}

export interface ObsidianConflictDiff {
  appLines: ObsidianConflictDiffLine[];
  vaultLines: ObsidianConflictDiffLine[];
}

function splitMarkdownConflictLines(value: string): string[] {
  const text = String(value || '').slice(0, 12000);
  if (!text) return [''];
  return text.split(/\r\n|\n|\r/);
}

function line(kind: ObsidianConflictDiffLine['kind'], text: string, marker: string): ObsidianConflictDiffLine {
  return { kind, text: text || ' ', marker };
}

/** Side-by-side line diff for the Obsidian conflict modal (legacy popup.js parity). */
export function buildObsidianConflictDiff(appMd: string, vaultMd: string): ObsidianConflictDiff {
  const appLines = splitMarkdownConflictLines(appMd);
  const vaultLines = splitMarkdownConflictLines(vaultMd);

  if (appLines.length > 650 || vaultLines.length > 650) {
    return {
      appLines: [
        line('note', 'Diff is large; showing plain preview.', ' '),
        ...appLines.map((text) => line('same', text, ' ')),
      ],
      vaultLines: [
        line('note', 'Diff is large; showing plain preview.', ' '),
        ...vaultLines.map((text) => line('same', text, ' ')),
      ],
    };
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

  const appOut: ObsidianConflictDiffLine[] = [];
  const vaultOut: ObsidianConflictDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < vaultLines.length || j < appLines.length) {
    if (i < vaultLines.length && j < appLines.length && vaultLines[i] === appLines[j]) {
      vaultOut.push(line('same', vaultLines[i], ' '));
      appOut.push(line('same', appLines[j], ' '));
      i += 1;
      j += 1;
    } else if (j < appLines.length && (i >= vaultLines.length || dp[i][j + 1] >= dp[i + 1][j])) {
      vaultOut.push(line('removed', '', '-'));
      appOut.push(line('added', appLines[j], '+'));
      j += 1;
    } else {
      vaultOut.push(line('added', vaultLines[i], '+'));
      appOut.push(line('removed', '', '-'));
      i += 1;
    }
  }

  return { appLines: appOut, vaultLines: vaultOut };
}

export function formatConflictModalTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'unknown';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'unknown';
  }
}

export function buildObsidianConflictHint(meta: {
  vaultFileTime: number;
  appUpdatedAt: number;
  vaultNewerByClock: boolean;
  appNewerByClock: boolean;
  keys?: string;
}): string {
  let text = 'Compare the previews, then pick which Markdown wins.';
  if (meta.vaultNewerByClock && !meta.appNewerByClock) {
    text += ' By modified time, the vault file looks newer.';
  } else if (meta.appNewerByClock && !meta.vaultNewerByClock) {
    text += ' By saved time, the extension note looks newer.';
  } else {
    text += ' Times are close or overlapping — pick the Markdown you trust.';
  }
  text += ` Vault file: ${formatConflictModalTime(meta.vaultFileTime)} · Extension: ${formatConflictModalTime(meta.appUpdatedAt)}`;
  text += ` ${meta.keys || 'Keys: 1 keep card · 2 keep vault · Enter confirm · Esc cancel · arrow keys.'}`;
  return text;
}
