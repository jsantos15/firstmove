#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const sourceFile = path.resolve(__dirname, '..', 'src', 'index.ts');
const coachSourceFile = path.resolve(__dirname, '..', '..', 'core', 'src', 'coach', 'index.ts');
const source = fs.readFileSync(sourceFile, 'utf8');
const coachSource = fs.readFileSync(coachSourceFile, 'utf8');
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

function readStringArray(name) {
  const arrayMatch = coachSource.match(
    new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`)
  );
  if (!arrayMatch) {
    throw new Error(`Could not find ${name} in packages/core/src/coach/index.ts`);
  }
  return [...arrayMatch[1].matchAll(/'([^']+)'/g)].map(entry => entry[1]);
}

const classifications = readStringArray('COACH_CLASSIFICATIONS');
const eventTypes = readStringArray('COACH_EVENT_TYPES');
const requiredKeys = [
  ...classifications.flatMap(classification => [
    `coach.label.${classification}`,
    `coach.title.${classification}`,
  ]),
  ...eventTypes.map(eventType => `coach.event.${eventType}.message`),
  'coach.event.generic.message',
  'coach.spoken.event',
  'coach.spoken.wrong_move',
];
const missingKeys = requiredKeys.filter(key => !keys.includes(key));

if (missingKeys.length > 0) {
  throw new Error(`Missing required English message keys:\n${missingKeys.join('\n')}`);
}

console.log(
  `Validated ${keys.length} English message keys and ${requiredKeys.length} required coach keys.`
);
