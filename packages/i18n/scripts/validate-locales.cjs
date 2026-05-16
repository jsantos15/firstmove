#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const sourceFile = path.resolve(__dirname, '..', 'src', 'index.ts');
const source = fs.readFileSync(sourceFile, 'utf8');
const match = source.match(/export const EN_MESSAGES = \{([\s\S]*?)\} as const;/);

if (!match) {
  throw new Error('Could not find EN_MESSAGES in packages/i18n/src/index.ts');
}

const keys = [...match[1].matchAll(/['"]([^'"]+)['"]:/g)].map(entry => entry[1]);
const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);

if (duplicates.length > 0) {
  throw new Error(`Duplicate message keys: ${[...new Set(duplicates)].join(', ')}`);
}

if (keys.length === 0) {
  throw new Error('No English message keys found.');
}

console.log(`Validated ${keys.length} English message keys.`);
