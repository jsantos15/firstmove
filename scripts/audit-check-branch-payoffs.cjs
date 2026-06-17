#!/usr/bin/env node

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Chess } = require("./lib/chess-js.cjs");

const OUTPUT_DIR = path.resolve(__dirname, "output");
const DEFAULT_REPORT = path.join(OUTPUT_DIR, "check-branch-payoff-audit.json");
const DEFAULT_TMP_DIR = path.join(OUTPUT_DIR, ".check-branch-payoff-audit");

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = {
    report: DEFAULT_REPORT,
    tmpDir: DEFAULT_TMP_DIR,
    staticScan: true,
    verify: "none",
    openings: null,
    parentLineSlugs: null,
    limitParents: null,
    resume: false,
    keepTemp: false,
    cloudEvalMode: "off",
    extraBranchArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[++index];
    if (token === "--help" || token === "-h") args.help = true;
    else if (token === "--report") args.report = path.resolve(next());
    else if (token === "--tmp-dir") args.tmpDir = path.resolve(next());
    else if (token === "--no-static-scan") args.staticScan = false;
    else if (token === "--verify") args.verify = String(next());
    else if (token === "--openings") args.openings = new Set(parseList(next()).map(slugify));
    else if (token === "--parent-line-slugs") args.parentLineSlugs = new Set(parseList(next()));
    else if (token === "--limit-parents") args.limitParents = Number(next());
    else if (token === "--resume") args.resume = true;
    else if (token === "--keep-temp") args.keepTemp = true;
    else if (token === "--cloud-eval-mode") args.cloudEvalMode = String(next());
    else if (token === "--branch-arg") args.extraBranchArgs.push(String(next()));
    else throw new Error(`Unknown argument: ${token}`);
  }

  if (args.help) return args;
  if (!["none", "static", "all"].includes(args.verify)) {
    throw new Error('--verify must be one of "none", "static", or "all".');
  }
  if (args.limitParents != null && (!Number.isInteger(args.limitParents) || args.limitParents < 1)) {
    throw new Error("--limit-parents must be a positive integer.");
  }
  return args;
}

function printUsage() {
  console.log(`Usage:
  node scripts/audit-check-branch-payoffs.cjs
  node scripts/audit-check-branch-payoffs.cjs --verify static
  node scripts/audit-check-branch-payoffs.cjs --verify all --openings italian-game --limit-parents 10
  node scripts/audit-check-branch-payoffs.cjs --verify all --parent-line-slugs italian-game-evans-gambit-fontaine-countergambit

Options:
  --verify <mode>             none = static report only, static = rerun static-suspicious parents,
                              all = rerun every parent in selected candidate files
  --openings <slugs>          Comma-separated opening payload slugs, e.g. italian-game,sicilian-defense
  --parent-line-slugs <list>  Comma-separated exact parent line IDs to verify
  --limit-parents <n>         Verify only the first N selected parents
  --resume                    Reuse existing report verified parent results
  --cloud-eval-mode <mode>    Passed to generate-opening-branches.cjs during verification (default: off)
  --branch-arg <value>        Extra raw argument passed to generate-opening-branches.cjs
  --report <path>             Output report path (default: ${path.relative(process.cwd(), DEFAULT_REPORT)})
  --keep-temp                 Keep per-parent temporary generated JSON files
`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function normFen(fen) {
  return String(fen ?? "").split(" ").slice(0, 4).join(" ");
}

function sourceRank(source) {
  if (source === "lichess-cloud-eval") return 300;
  if (source === "chess-api") return 200;
  if (source === "stockfish") return 100;
  return 0;
}

function betterAnalysis(left, right) {
  if (!right) return true;
  const leftQuality = [sourceRank(left.source), left.depth ?? 0, left.lines?.length ?? 0];
  const rightQuality = [sourceRank(right.source), right.depth ?? 0, right.lines?.length ?? 0];
  for (let index = 0; index < leftQuality.length; index += 1) {
    if (leftQuality[index] !== rightQuality[index]) return leftQuality[index] > rightQuality[index];
  }
  return false;
}

function indexEvalCache(file) {
  const index = new Map();
  if (!fs.existsSync(file)) return index;
  const cache = readJson(file);
  for (const [key, value] of Object.entries(cache)) {
    const result = value.result ?? value;
    if (!result || !(result.bestMove || result.lines?.length)) continue;
    const fen = result.fen ?? key.split("::")[0];
    const normalized = normFen(fen);
    if (betterAnalysis(result, index.get(normalized))) index.set(normalized, result);
  }
  return index;
}

function moveObjectFromUci(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4) || undefined,
  };
}

function applyUci(fen, uci) {
  try {
    const chess = new Chess(fen);
    return chess.move(moveObjectFromUci(uci));
  } catch {
    return null;
  }
}

function applySans(sans) {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess;
}

function walk(value, callback) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, callback);
    return;
  }
  if (!value || typeof value !== "object") return;
  callback(value);
  for (const child of Object.values(value)) walk(child, callback);
}

function resultsFromPayload(payload) {
  return Array.isArray(payload?.results) ? payload.results : [];
}

function practicalBranches(payload, parentLineId = null) {
  return resultsFromPayload(payload).filter(
    (line) =>
      line.lineType === "practical_branch" &&
      (!parentLineId || line.parentLineId === parentLineId)
  );
}

function referenceParents(payload) {
  return resultsFromPayload(payload)
    .filter((line) => line.lineType !== "practical_branch" && line.lineId)
    .map((line) => ({
      lineId: line.lineId,
      fullName: line.fullName,
      openingId: line.openingId,
    }));
}

function discoverPairs(args) {
  const branchFiles = fs
    .readdirSync(OUTPUT_DIR)
    .filter((file) => /^generated-opening-branches-.*\.json$/.test(file))
    .sort();
  const pairs = [];
  for (const branchFile of branchFiles) {
    const openingSlug = branchFile
      .replace(/^generated-opening-branches-/, "")
      .replace(/\.json$/, "");
    if (args.openings && !args.openings.has(openingSlug)) continue;
    const candidateFile = `generated-opening-candidates-${openingSlug}-cloud-reference.json`;
    const branchPath = path.join(OUTPUT_DIR, branchFile);
    const candidatePath = path.join(OUTPUT_DIR, candidateFile);
    if (!fs.existsSync(candidatePath)) continue;
    pairs.push({
      openingSlug,
      branchFile,
      candidateFile,
      branchPath,
      candidatePath,
    });
  }
  return pairs;
}

function staticScan(pairs) {
  const bestIndex = indexEvalCache(path.join(OUTPUT_DIR, "best-known-eval-cache.json"));
  const stockfishIndex = indexEvalCache(path.join(OUTPUT_DIR, "stockfish-eval-cache.json"));
  const byKey = new Map();
  const totals = {
    branchPayloads: pairs.length,
    practicalBranches: 0,
    trainedRank2Plus: 0,
    staleBestMoves: 0,
  };

  const analysesForFen = (fen) => {
    const key = normFen(fen);
    return [bestIndex.get(key), stockfishIndex.get(key)].filter(Boolean);
  };

  for (const pair of pairs) {
    const payload = readJson(pair.branchPath);
    walk(payload, (line) => {
      if (line.lineType !== "practical_branch" || !Array.isArray(line.generatedSans)) return;
      totals.practicalBranches += 1;
      const trace = line.generation?.extension ?? line.generation?.branch?.continuationTrace ?? [];
      for (const step of trace) {
        if (step.side !== "trained" || !(step.engineRank > 1)) continue;
        totals.trainedRank2Plus += 1;
        let fen = null;
        try {
          fen = applySans(line.generatedSans.slice(0, step.ply - 1)).fen();
        } catch {
          continue;
        }
        for (const analysis of analysesForFen(fen)) {
          const bestMove = analysis.bestMove ?? analysis.lines?.[0]?.uci ?? analysis.lines?.[0]?.pv?.[0];
          if (!bestMove) continue;
          const bestApplied = applyUci(fen, bestMove);
          if (!bestApplied) {
            totals.staleBestMoves += 1;
            continue;
          }
          if (!/[+#]/.test(bestApplied.san)) continue;
          const key = `${line.lineId}::${step.ply}`;
          if (!byKey.has(key)) {
            byKey.set(key, {
              openingSlug: pair.openingSlug,
              file: pair.branchFile,
              openingId: line.openingId,
              parentLineId: line.parentLineId,
              lineId: line.lineId,
              fullName: line.fullName,
              pgn: line.fullLinePgn,
              ply: step.ply,
              savedSan: step.san,
              savedUci: step.uci,
              savedRank: step.engineRank,
              savedEval: step.engineEvalCp,
              bestSan: bestApplied.san,
              bestUci: bestMove,
              bestEval: step.engineBestEvalCp,
              evalLoss: step.engineEvalLossCp,
              source: analysis.source,
              depth: analysis.depth,
            });
          }
          break;
        }
      }
    });
  }

  const suspiciousMoves = Array.from(byKey.values()).sort((left, right) => {
    if (left.openingSlug !== right.openingSlug) return left.openingSlug.localeCompare(right.openingSlug);
    if (left.parentLineId !== right.parentLineId) return left.parentLineId.localeCompare(right.parentLineId);
    return left.ply - right.ply;
  });
  const parentMap = new Map();
  for (const move of suspiciousMoves) {
    const key = `${move.openingSlug}::${move.parentLineId}`;
    if (!parentMap.has(key)) {
      parentMap.set(key, {
        openingSlug: move.openingSlug,
        openingId: move.openingId,
        parentLineId: move.parentLineId,
        count: 0,
        maxEvalLoss: null,
        examples: [],
      });
    }
    const parent = parentMap.get(key);
    parent.count += 1;
    parent.maxEvalLoss = Math.max(parent.maxEvalLoss ?? 0, move.evalLoss ?? 0);
    if (parent.examples.length < 3) {
      parent.examples.push({
        lineId: move.lineId,
        ply: move.ply,
        saved: move.savedSan,
        best: move.bestSan,
        evalLoss: move.evalLoss,
      });
    }
  }

  return {
    totals,
    suspiciousMoveCount: suspiciousMoves.length,
    affectedParentCount: parentMap.size,
    suspiciousMoves,
    affectedParents: Array.from(parentMap.values()).sort(
      (left, right) =>
        right.count - left.count ||
        (right.maxEvalLoss ?? 0) - (left.maxEvalLoss ?? 0) ||
        left.parentLineId.localeCompare(right.parentLineId)
    ),
  };
}

function branchSignature(line) {
  const trace = line.generation?.extension ?? line.generation?.branch?.continuationTrace ?? [];
  const trigger = line.triggerMoveUci ?? trace.find((step) => step.side === "opponent")?.uci ?? "";
  const sans = Array.isArray(line.generatedSans) ? line.generatedSans.join(" ") : line.fullLinePgn ?? "";
  return `${line.parentLineId ?? ""}::${trigger}::${sans}`;
}

function branchSummary(line) {
  const trace = line.generation?.extension ?? line.generation?.branch?.continuationTrace ?? [];
  const firstTrained = trace.find((step) => step.side === "trained") ?? null;
  return {
    lineId: line.lineId,
    fullName: line.fullName,
    pgn: line.fullLinePgn,
    triggerMoveSan: line.triggerMoveSan,
    triggerMoveUci: line.triggerMoveUci,
    finalTrainedEvalCp: line.finalTrainedEvalCp ?? line.finalEvalCp ?? null,
    branchScore: line.branchScore ?? null,
    firstTrained: firstTrained
      ? {
          san: firstTrained.san,
          uci: firstTrained.uci,
          source: firstTrained.source,
          engineRank: firstTrained.engineRank,
          engineEvalCp: firstTrained.engineEvalCp,
          engineEvalLossCp: firstTrained.engineEvalLossCp,
        }
      : null,
  };
}

function compareParentBranches({ oldBranches, newBranches }) {
  const oldBySignature = new Map(oldBranches.map((line) => [branchSignature(line), line]));
  const newBySignature = new Map(newBranches.map((line) => [branchSignature(line), line]));
  const added = [];
  const removed = [];
  for (const [signature, line] of newBySignature) {
    if (!oldBySignature.has(signature)) added.push(branchSummary(line));
  }
  for (const [signature, line] of oldBySignature) {
    if (!newBySignature.has(signature)) removed.push(branchSummary(line));
  }

  return {
    affected: added.length > 0 || removed.length > 0,
    oldCount: oldBranches.length,
    newCount: newBranches.length,
    added,
    removed,
  };
}

function loadExistingReport(file) {
  if (!fs.existsSync(file)) return null;
  return readJson(file);
}

function selectParents({ args, pairs, staticResult, existingReport }) {
  const staticParentKeys = new Set(
    (staticResult?.affectedParents ?? []).map((parent) => `${parent.openingSlug}::${parent.parentLineId}`)
  );
  const verifiedKeys = new Set(
    args.resume ? (existingReport?.verifiedParents ?? []).map((parent) => `${parent.openingSlug}::${parent.parentLineId}`) : []
  );
  const selected = [];

  for (const pair of pairs) {
    const candidatePayload = readJson(pair.candidatePath);
    const parents = referenceParents(candidatePayload);
    for (const parent of parents) {
      if (args.parentLineSlugs && !args.parentLineSlugs.has(parent.lineId)) continue;
      const key = `${pair.openingSlug}::${parent.lineId}`;
      if (args.verify === "static" && !staticParentKeys.has(key)) continue;
      if (verifiedKeys.has(key)) continue;
      selected.push({
        ...pair,
        parentLineId: parent.lineId,
        parentFullName: parent.fullName,
        openingId: parent.openingId,
      });
    }
  }

  return args.limitParents != null ? selected.slice(0, args.limitParents) : selected;
}

function runGeneratorForParent({ parent, args }) {
  fs.mkdirSync(args.tmpDir, { recursive: true });
  const output = path.join(args.tmpDir, `${parent.openingSlug}--${parent.parentLineId}.json`);
  const commandArgs = [
    path.join(__dirname, "generate-opening-branches.cjs"),
    "--input",
    parent.candidatePath,
    "--output",
    output,
    "--parent-line-slugs",
    parent.parentLineId,
    "--no-resume",
    "--cloud-eval-mode",
    args.cloudEvalMode,
    ...args.extraBranchArgs,
  ];
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const elapsedMs = Date.now() - startedAt;
  if (result.status !== 0) {
    return {
      ok: false,
      output,
      elapsedMs,
      error: `generate-opening-branches exited with ${result.status}`,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
  return {
    ok: true,
    output,
    elapsedMs,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function verifyParents({ selectedParents, args, existingReport }) {
  const verifiedParents = args.resume ? [...(existingReport?.verifiedParents ?? [])] : [];
  const affectedParents = args.resume ? [...(existingReport?.verifiedAffectedParents ?? [])] : [];
  const startedAt = Date.now();

  for (const [index, parent] of selectedParents.entries()) {
    console.log(
      `[${index + 1}/${selectedParents.length}] verifying ${parent.openingSlug}: ${parent.parentLineId}`
    );
    const oldPayload = readJson(parent.branchPath);
    const run = runGeneratorForParent({ parent, args });
    if (!run.ok) {
      const failure = {
        openingSlug: parent.openingSlug,
        openingId: parent.openingId,
        parentLineId: parent.parentLineId,
        parentFullName: parent.parentFullName,
        ok: false,
        elapsedMs: run.elapsedMs,
        error: run.error,
        stderr: run.stderr,
      };
      verifiedParents.push(failure);
      continue;
    }

    const newPayload = readJson(run.output);
    const comparison = compareParentBranches({
      oldBranches: practicalBranches(oldPayload, parent.parentLineId),
      newBranches: practicalBranches(newPayload, parent.parentLineId),
    });
    const record = {
      openingSlug: parent.openingSlug,
      openingId: parent.openingId,
      parentLineId: parent.parentLineId,
      parentFullName: parent.parentFullName,
      ok: true,
      elapsedMs: run.elapsedMs,
      ...comparison,
    };
    verifiedParents.push(record);
    if (comparison.affected) affectedParents.push(record);
    if (!args.keepTemp) fs.rmSync(run.output, { force: true });
  }

  return {
    mode: args.verify,
    selectedParentCount: selectedParents.length,
    verifiedParentCount: verifiedParents.length,
    affectedParentCount: affectedParents.length,
    elapsedMs: Date.now() - startedAt,
    verifiedParents,
    verifiedAffectedParents: affectedParents,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const pairs = discoverPairs(args);
  const existingReport = loadExistingReport(args.report);
  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      staticScan: args.staticScan,
      verify: args.verify,
      openings: args.openings ? Array.from(args.openings) : null,
      parentLineSlugs: args.parentLineSlugs ? Array.from(args.parentLineSlugs) : null,
      cloudEvalMode: args.cloudEvalMode,
      limitParents: args.limitParents,
      resume: args.resume,
    },
    pairs: pairs.map((pair) => ({
      openingSlug: pair.openingSlug,
      branchFile: pair.branchFile,
      candidateFile: pair.candidateFile,
    })),
    static: null,
    verification: null,
  };

  if (args.staticScan) {
    console.log(`Static scan: ${pairs.length} branch payload(s).`);
    report.static = staticScan(pairs);
    console.log(
      `Static scan found ${report.static.suspiciousMoveCount} suspicious move(s) across ` +
        `${report.static.affectedParentCount} parent variation(s).`
    );
  }

  if (args.verify !== "none") {
    const selectedParents = selectParents({
      args,
      pairs,
      staticResult: report.static,
      existingReport,
    });
    console.log(`Verification selected ${selectedParents.length} parent variation(s).`);
    report.verification = verifyParents({ selectedParents, args, existingReport });
  }

  writeJson(args.report, report);
  if (!args.keepTemp && fs.existsSync(args.tmpDir)) {
    fs.rmSync(args.tmpDir, { recursive: true, force: true });
  }
  console.log(`Wrote ${args.report}`);
}

main();
