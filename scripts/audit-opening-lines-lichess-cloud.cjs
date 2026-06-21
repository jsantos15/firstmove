#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Chess } = require("./lib/chess-js.cjs");
const { fetchLichessCloudEval } = require("./lib/lichess-cloud-eval.cjs");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates.json"
);
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "lichess-cloud-audit-opening-lines.json"
);
const DEFAULT_CACHE = path.resolve(
  __dirname,
  "output",
  "lichess-cloud-eval-cache.json"
);

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    cache: DEFAULT_CACHE,
    scope: "continuation",
    line: null,
    limit: null,
    delayMs: 5000,
    timeoutMs: 30000,
    maxRetries: 0,
    multipvCount: 5,
    minDepth: 30,
    resume: true,
    stopLineAfterOverride: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--input") {
      args.input = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--output") {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--cache") {
      args.cache = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--scope") {
      args.scope = String(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--line") {
      args.line = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }

    if (token === "--limit") {
      args.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--delay-ms") {
      args.delayMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--timeout-ms") {
      args.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--max-retries") {
      args.maxRetries = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--multipv-count") {
      args.multipvCount = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--min-depth") {
      args.minDepth = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (token === "--no-resume") {
      args.resume = false;
      continue;
    }

    if (token === "--continue-after-override") {
      args.stopLineAfterOverride = false;
      continue;
    }
  }

  if (!["anchor", "continuation", "final"].includes(args.scope)) {
    throw new Error(
      `Unsupported scope "${args.scope}". Expected anchor, continuation, or final.`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing input file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function lineKey(line) {
  return line.lineId ?? line.variationId ?? line.fullName ?? line.lineName;
}

function lineMatches(line, filter) {
  if (!filter) {
    return true;
  }

  const haystack = [
    line.openingId,
    line.variationId,
    line.lineId,
    line.openingName,
    line.lineName,
    line.fullName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(filter.toLowerCase());
}

function replaySansToPositions(sans) {
  const chess = new Chess();
  const positions = [
    {
      fen: chess.fen(),
      ply: 0,
      uciMoves: [],
    },
  ];
  const uciMoves = [];

  for (const san of sans ?? []) {
    const move = chess.move(san);
    if (!move) {
      throw new Error(`Illegal SAN while replaying line: ${san}`);
    }

    uciMoves.push(`${move.from}${move.to}${move.promotion ?? ""}`);
    positions.push({
      fen: chess.fen(),
      ply: uciMoves.length,
      uciMoves: [...uciMoves],
    });
  }

  return positions;
}

function buildTargetFromMoveStep(line, positions, step) {
  const position = positions[step.ply - 1];
  if (!position) {
    throw new Error(`Missing replay position for ${line.fullName} ply ${step.ply}.`);
  }

  return {
    key: `${lineKey(line)}::ply:${step.ply}`,
    openingId: line.openingId,
    lineId: line.lineId,
    fullName: line.fullName,
    ply: step.ply,
    fen: position.fen,
    localMove: step.uci,
    localSan: step.san,
    localSource: step.source,
    targetType: "continuation_move",
  };
}

function buildFinalTarget(line, positions) {
  const generatedSans = line.generatedSans ?? [];
  const finalPosition = positions[generatedSans.length];
  if (!finalPosition) {
    throw new Error(`Missing final replay position for ${line.fullName}.`);
  }

  return {
    key: `${lineKey(line)}::final:${generatedSans.length}`,
    openingId: line.openingId,
    lineId: line.lineId,
    fullName: line.fullName,
    ply: generatedSans.length,
    fen: finalPosition.fen,
    localMove: line.stockfish?.bestMove ?? null,
    localSan: null,
    localSource: "stockfish-final-best-move",
    targetType: "final_position",
  };
}

function buildAuditTargets(line, scope) {
  const generatedSans = line.generatedSans ?? [];
  if (!generatedSans.length) {
    return [];
  }

  const positions = replaySansToPositions(generatedSans);

  if (scope === "final") {
    return [buildFinalTarget(line, positions)];
  }

  const extension = line.generation?.extension ?? [];
  if (!extension.length) {
    return [];
  }

  const steps = scope === "anchor" ? extension.slice(0, 1) : extension;
  return steps.map((step) => buildTargetFromMoveStep(line, positions, step));
}

function isLegalUci(fen, uci) {
  if (!uci) {
    return false;
  }

  const chess = new Chess(fen);
  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4, 5) || undefined,
  });

  return Boolean(move);
}

function summarizeAudit(target, cloud, args) {
  const cloudBest = cloud?.lines?.[0] ?? null;
  const cloudBestMove = cloudBest?.uci ?? null;
  const localInCloud =
    cloud?.lines?.find((line) => line.uci === target.localMove) ?? null;
  const cloudUsable =
    Boolean(cloudBestMove) &&
    isLegalUci(target.fen, cloudBestMove) &&
    (cloud.depth ?? 0) >= args.minDepth;

  let status = "unknown";
  if (!cloudBestMove) {
    status = "no_cloud_result";
  } else if (!cloudUsable) {
    status = "cloud_too_shallow";
  } else if (cloudBestMove === target.localMove) {
    status = "match";
  } else {
    status = "cloud_override";
  }

  return {
    ...target,
    status,
    shouldOverride: status === "cloud_override",
    cloudBestMove,
    cloudDepth: cloud?.depth ?? null,
    localMoveCloudRank: localInCloud?.multipv ?? null,
    cloudLines: (cloud?.lines ?? []).map((line) => ({
      multipv: line.multipv,
      uci: line.uci,
      scoreWhite: line.whiteScore,
      pv: line.pv,
    })),
  };
}

function buildInitialOutput(args, payload, targets) {
  return {
    generatedAt: new Date().toISOString(),
    status: "running",
    sourceArtifact: path.basename(args.input),
    config: {
      scope: args.scope,
      line: args.line,
      delayMs: args.delayMs,
      timeoutMs: args.timeoutMs,
      maxRetries: args.maxRetries,
      multipvCount: args.multipvCount,
      minDepth: args.minDepth,
      stopLineAfterOverride: args.stopLineAfterOverride,
      cache: args.cache,
    },
    sourceCounts: {
      lines: payload.count ?? payload.results?.length ?? null,
      targets: targets.length,
    },
    auditedCount: 0,
    matchCount: 0,
    overrideCount: 0,
    noCloudCount: 0,
    shallowCount: 0,
    skippedAfterOverrideCount: 0,
    error: null,
    results: [],
  };
}

function refreshCounts(output) {
  output.auditedCount = output.results.filter(
    (result) => result.status !== "skipped_after_override"
  ).length;
  output.matchCount = output.results.filter((result) => result.status === "match").length;
  output.overrideCount = output.results.filter(
    (result) => result.status === "cloud_override"
  ).length;
  output.noCloudCount = output.results.filter(
    (result) => result.status === "no_cloud_result"
  ).length;
  output.shallowCount = output.results.filter(
    (result) => result.status === "cloud_too_shallow"
  ).length;
  output.skippedAfterOverrideCount = output.results.filter(
    (result) => result.status === "skipped_after_override"
  ).length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = readJson(args.input);
  const lines = (Array.isArray(payload.results) ? payload.results : []).filter((line) =>
    lineMatches(line, args.line)
  );
  const allTargets = lines.flatMap((line) => buildAuditTargets(line, args.scope));
  const targets =
    Number.isFinite(args.limit) && args.limit > 0
      ? allTargets.slice(0, args.limit)
      : allTargets;
  const output =
    args.resume && fs.existsSync(args.output)
      ? readJson(args.output)
      : buildInitialOutput(args, payload, targets);
  const doneKeys = new Set(output.results.map((result) => result.key));
  const overrideLines = new Set(
    output.results
      .filter((result) => result.status === "cloud_override")
      .map((result) => result.lineId ?? result.fullName)
  );

  output.status = "running";
  output.sourceCounts.targets = targets.length;
  writeJson(args.output, output);

  for (const target of targets) {
    if (doneKeys.has(target.key)) {
      continue;
    }

    const currentLineKey = target.lineId ?? target.fullName;
    if (args.stopLineAfterOverride && overrideLines.has(currentLineKey)) {
      output.results.push({
        ...target,
        status: "skipped_after_override",
        shouldOverride: false,
        cloudBestMove: null,
        cloudDepth: null,
        localMoveCloudRank: null,
        cloudLines: [],
      });
      doneKeys.add(target.key);
      refreshCounts(output);
      output.generatedAt = new Date().toISOString();
      writeJson(args.output, output);
      continue;
    }

    try {
      const cloud = await fetchLichessCloudEval(target.fen, {
        multipvCount: args.multipvCount,
        delayMs: args.delayMs,
        maxRetries: args.maxRetries,
        timeoutMs: args.timeoutMs,
        cachePath: args.cache,
      });
      const result = summarizeAudit(target, cloud, args);

      output.results.push(result);
      doneKeys.add(target.key);

      if (result.status === "cloud_override") {
        overrideLines.add(currentLineKey);
      }

      refreshCounts(output);
      output.generatedAt = new Date().toISOString();
      writeJson(args.output, output);
      console.log(
        `[${output.results.length}/${targets.length}] ${target.fullName} ply ${target.ply}: ${result.status}`
      );
    } catch (error) {
      output.status = "paused";
      output.error = {
        message: error instanceof Error ? error.message : String(error),
        target,
        at: new Date().toISOString(),
      };
      refreshCounts(output);
      writeJson(args.output, output);
      throw error;
    }
  }

  output.status = "complete";
  output.error = null;
  output.generatedAt = new Date().toISOString();
  refreshCounts(output);
  writeJson(args.output, output);
  console.log(`Wrote Lichess cloud audit to ${args.output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
