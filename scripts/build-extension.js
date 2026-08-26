const fs = require('fs');
const path = require('path');

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else copyFile(src, dst);
  }
}

function patchPopupHtml(htmlPath) {
  if (!fs.existsSync(htmlPath)) return;
  let html = fs.readFileSync(htmlPath, 'utf8');
  // Angular inlines critical CSS with onload handlers; MV3 CSP blocks inline event handlers.
  html = html.replace(
    /<link rel="stylesheet" href="([^"]+\.css)" media="print" onload="this\.media='all'">/g,
    '<link rel="stylesheet" href="$1">'
  );
  html = html.replace(/<noscript><link rel="stylesheet" href="[^"]+\.css"><\/noscript>/g, '');
  fs.writeFileSync(htmlPath, html);
}

function patchManifest(manifestPath, popupHtml) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.action = manifest.action || {};
  manifest.web_accessible_resources = [
    {
      resources: [popupHtml, 'vendor/*', 'icons/*'],
      matches: ['<all_urls>'],
    },
  ];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

function main() {
  const root = path.join(__dirname, '..');
  const angularOut = path.join(root, 'src', 'dist', 'vim-todo-app', 'browser');
  const extOut = path.join(root, 'dist', 'extension');

  if (!fs.existsSync(angularOut)) {
    throw new Error('Angular build output missing. Run `npm run build:ng` in src/ first.');
  }

  if (fs.existsSync(extOut)) fs.rmSync(extOut, { recursive: true, force: true });
  copyDir(angularOut, extOut);

  const indexPath = path.join(extOut, 'index.html');
  const popupPath = path.join(extOut, 'popup.html');
  if (fs.existsSync(indexPath)) {
    copyFile(indexPath, popupPath);
    patchPopupHtml(popupPath);
    patchPopupHtml(indexPath);
  }

  const staticFiles = [
    'background.js',
    'overlay.js',
    'pick-vault.html',
    'pick-vault.js',
    'grant-vault-access.html',
    'grant-vault-access.js',
    'obsidian-vault-idb.js',
    'support-prompt.js',
    'vault-access.css',
  ];
  for (const f of staticFiles) {
    const src = path.join(root, f);
    if (fs.existsSync(src)) copyFile(src, path.join(extOut, f));
  }

  copyDir(path.join(root, 'icons'), path.join(extOut, 'icons'));
  copyDir(path.join(root, 'vendor'), path.join(extOut, 'vendor'));

  for (const css of ['popup.css', 'modern.css', 'nothing.css']) {
    const src = path.join(root, css);
    if (fs.existsSync(src)) copyFile(src, path.join(extOut, css));
  }

  copyFile(path.join(root, 'manifest.json'), path.join(extOut, 'manifest.json'));
  patchManifest(path.join(extOut, 'manifest.json'), 'popup.html');

  console.log(`Extension build ready at ${extOut}`);
}

main();
