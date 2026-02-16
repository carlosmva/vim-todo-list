/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.join(__dirname, '..', 'icons');

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect x="8" y="8" width="112" height="112" rx="24" fill="#6C63FF"/>
  <rect x="34" y="26" width="60" height="76" rx="10" fill="#FFFFFF"/>
  <path d="M94 26 L94 40 L80 26 Z" fill="#FFD66E"/>
  <rect x="42" y="46" width="44" height="6" rx="3" fill="#D9D9F8"/>
  <rect x="42" y="58" width="38" height="6" rx="3" fill="#D9D9F8"/>
  <rect x="42" y="70" width="30" height="6" rx="3" fill="#D9D9F8"/>
</svg>`;

const sizes = [16, 32, 48, 128];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // Keep an SVG copy for source-of-truth.
  fs.writeFileSync(path.join(outDir, 'icon.svg'), svg, 'utf8');

  const input = Buffer.from(svg);
  await Promise.all(
    sizes.map(async (size) => {
      const outPath = path.join(outDir, `icon${size}.png`);
      await sharp(input, { density: 512 })
        .resize(size, size)
        .png()
        .toFile(outPath);
      console.log(`wrote ${path.relative(path.join(__dirname, '..'), outPath)}`);
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
