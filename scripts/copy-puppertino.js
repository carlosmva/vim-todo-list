const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE =
  'https://cdn.jsdelivr.net/gh/codedgar/Puppertino@latest/dist/css/';
const FILES = ['color_palette.css', 'forms.css', 'shadows.css'];
const outDir = path.join(__dirname, '..', 'vendor', 'puppertino');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetch(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of FILES) {
    const url = BASE + file;
    const content = await fetch(url);
    fs.writeFileSync(path.join(outDir, file), content, 'utf8');
    console.log(`Copied Puppertino ${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
