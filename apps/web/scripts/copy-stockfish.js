#!/usr/bin/env node
// Copies the Stockfish WASM engine files from node_modules to public/stockfish/
// so they are statically served to the browser Web Worker.
// Run automatically before dev and build. Re-run after updating the stockfish package.

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'node_modules', 'stockfish', 'src');
const destDir = path.join(__dirname, '..', 'public', 'stockfish');

fs.mkdirSync(destDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => /^stockfish-17\.1-lite-single-/.test(f));

if (files.length === 0) {
  console.error('copy-stockfish: no lite-single engine files found in', srcDir);
  process.exit(1);
}

let copied = 0;
for (const file of files) {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(dest) && fs.statSync(src).size === fs.statSync(dest).size) continue;
  fs.copyFileSync(src, dest);
  console.log('copy-stockfish: copied', file);
  copied++;
}

if (copied === 0) console.log('copy-stockfish: already up to date');
