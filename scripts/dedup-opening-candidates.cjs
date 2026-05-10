'use strict';

const fs = require('fs');
const path = require('path');

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input')   { args.input   = path.resolve(argv[++i]); continue; }
    if (argv[i] === '--output')  { args.output  = path.resolve(argv[++i]); continue; }
    if (argv[i] === '--dry-run') { args.dryRun  = true;                    continue; }
  }

  if (!args.input) {
    console.error('Usage: node dedup-opening-candidates.cjs --input <file> [--output <file>] [--dry-run]');
    process.exit(1);
  }

  if (!args.output) args.output = args.input;
  return args;
}

// ─── Core logic ───────────────────────────────────────────────────────────────

function getSans(line) {
  return Array.isArray(line.generatedSans) ? line.generatedSans : [];
}

// Returns true if `a` is a strict prefix of `b` (a is shorter, all a's moves match b's start)
function isStrictPrefix(a, b) {
  const sa = getSans(a);
  const sb = getSans(b);
  if (sa.length === 0 || sa.length >= sb.length) return false;
  return sa.every((san, i) => san === sb[i]);
}

function deduplicateLines(lines) {
  const redundantIds = new Set();
  const coveredBy = new Map(); // lineId → [fullNames of covering lines]

  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < lines.length; j++) {
      if (i === j) continue;
      if (isStrictPrefix(lines[i], lines[j])) {
        redundantIds.add(lines[i].lineId);
        const existing = coveredBy.get(lines[i].lineId) ?? [];
        existing.push(lines[j].fullName ?? lines[j].lineId);
        coveredBy.set(lines[i].lineId, existing);
      }
    }
  }

  return {
    kept:    lines.filter(l => !redundantIds.has(l.lineId)),
    removed: lines.filter(l =>  redundantIds.has(l.lineId)).map(l => ({
      lineId:    l.lineId,
      fullName:  l.fullName ?? l.lineId,
      moveCount: getSans(l).length,
      coveredBy: coveredBy.get(l.lineId) ?? [],
    })),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  const data = JSON.parse(fs.readFileSync(args.input, 'utf8'));

  if (!Array.isArray(data.openings) || !Array.isArray(data.results)) {
    console.error('Input file does not look like a generated candidates JSON (missing openings or results).');
    process.exit(1);
  }

  const allRemoved = [];

  for (const opening of data.openings) {
    if (!Array.isArray(opening.lines) || opening.lines.length === 0) continue;

    const { kept, removed } = deduplicateLines(opening.lines);

    if (removed.length === 0) continue;

    opening.lines     = kept;
    opening.lineCount = kept.length;

    const removedIds = new Set(removed.map(r => r.lineId));
    data.results = data.results.filter(r => !removedIds.has(r.lineId));

    for (const r of removed) {
      allRemoved.push({ openingId: opening.openingId, ...r });
    }
  }

  data.processedSourceNames = data.results.map(r => r.fullName);

  // ─── Report ─────────────────────────────────────────────────────────────────

  if (allRemoved.length === 0) {
    console.log('No redundant lines found — nothing to remove.');
    return;
  }

  console.log(`\nFound ${allRemoved.length} redundant line(s):\n`);
  for (const r of allRemoved) {
    console.log(`  ✗  ${r.fullName}  (${r.moveCount} moves)`);
    for (const name of r.coveredBy) {
      console.log(`     ↳ covered by: ${name}`);
    }
  }

  if (args.dryRun) {
    console.log('\n[dry run] No files written.');
    return;
  }

  fs.writeFileSync(args.output, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`\nWrote cleaned output to ${args.output}`);
  console.log(JSON.stringify({
    openings: data.openings.length,
    lines:    data.results.length,
    removed:  allRemoved.length,
  }, null, 2));
}

main();
