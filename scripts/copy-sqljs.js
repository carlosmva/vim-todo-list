const fs = require("fs");
const path = require("path");

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst);
    } else if (entry.isFile()) {
      copyFile(src, dst);
    }
  }
}

function main() {
  const vendorDir = path.join(__dirname, "..", "vendor");
  fs.mkdirSync(vendorDir, { recursive: true });

  // --- sql.js ---
  const sqlJsDist = path.join(__dirname, "..", "node_modules", "sql.js", "dist");

  const js = path.join(sqlJsDist, "sql-wasm.js");
  const wasm = path.join(sqlJsDist, "sql-wasm.wasm");

  if (!fs.existsSync(js) || !fs.existsSync(wasm)) {
    throw new Error(
      "sql.js dist files not found. Run `npm install` first (and ensure sql.js is installed)."
    );
  }

  copyFile(js, path.join(vendorDir, "sql-wasm.js"));
  copyFile(wasm, path.join(vendorDir, "sql-wasm.wasm"));

  // --- Carbon (IBM) ---
  const carbonCss = path.join(
    __dirname,
    "..",
    "node_modules",
    "carbon-components",
    "css",
    "carbon-components.min.css"
  );
  if (!fs.existsSync(carbonCss)) {
    throw new Error(
      "carbon-components CSS not found. Run `npm install` first (and ensure carbon-components is installed)."
    );
  }
  copyFile(carbonCss, path.join(vendorDir, "carbon.min.css"));

  // --- D3.js ---
  const d3Min = path.join(__dirname, "..", "node_modules", "d3", "dist", "d3.min.js");
  if (!fs.existsSync(d3Min)) {
    throw new Error("d3.min.js not found. Run `npm install` first (and ensure d3 is installed).");
  }
  copyFile(d3Min, path.join(vendorDir, "d3.min.js"));

  console.log("Copied sql.js + Carbon CSS + D3 -> vendor/");
}

main();
