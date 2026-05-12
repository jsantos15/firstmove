#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Chess } = require("./lib/chess-js.cjs");
const { fetchLichessExplorer, totalGames } = require("./lib/lichess-explorer.cjs");
const { createStockfishEngine, parseInfoLine } = require("./lib/stockfish.cjs");
const { CloudEvalRouter, EngineRateLimitedError } = require("./lib/cloud-eval-router.cjs");
const { readCachedLichessCloudEval } = require("./lib/lichess-cloud-eval.cjs");
const { readCachedChessApiEval } = require("./lib/chess-api-eval.cjs");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-candidates-italian-game-cloud-reference.json"
);
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-branches.json"
);
const SCORE_MATE_CP = 100000;

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    limitReferences: null,
    parentLineSlugs: null,
    maxBranchesPerVariation: 10,
    minBranchesPerVariation: 1,
    onlyUnderBranchCount: null,
    targetBranchesPerVariation: null,
    maxNewBranchesPerVariation: null,
    maxCandidateMovesPerNode: 4,
    trainedCandidateMoves: 3,
    trainedCandidateMaxLossCp: 60,
    trainedOpportunityMinEvalCp: 200,
    minNodeGames: 250,
    minMoveGames: 35,
    minMoveShare: 0.03,
    cumulativePlayRateNearAnchor: 0.8,
    cumulativePlayRateMidline: 0.68,
    cumulativePlayRateDeep: 0.55,
    individualMoveShareNearAnchor: 0.2,
    individualMoveShareMidline: 0.15,
    individualMoveShareDeep: 0.1,
    continuationOpponentCandidateMoves: 3,
    maxContinuationBranchesPerTrigger: 3,
    maxContinuationSearchNodes: 120,
    midlineAddedPlies: 6,
    deepAddedPlies: 12,
    maxBranchPliesFromAnchor: 18,
    softBranchPliesFromAnchor: 12,
    maxTotalPlies: 40,
    minAcceptTrainedEvalCp: 20,
    fallbackAcceptTrainedEvalCp: -40,
    advantageResolutionMinPlies: 4,
    stockfishDepth: 18,
    stockfishEngine: "lite-single",
    multipvCount: 5,
    delayMs: 800,
    cloudEvalMode: "authoritative",
    cloudEvalDelayMs: 5000,
    cloudEvalTimeoutMs: 30000,
    cloudEvalMaxRetries: 0,
    cloudEvalMinDepth: 0,
    cloudEvalCache: path.resolve(__dirname, "output", "lichess-cloud-eval-cache.json"),
    chessApiCache: path.resolve(__dirname, "output", "chess-api-eval-cache.json"),
    stockfishEvalCache: path.resolve(__dirname, "output", "stockfish-eval-cache.json"),
    bestEvalCache: path.resolve(__dirname, "output", "best-known-eval-cache.json"),
    cloudCacheMissTtlMs: 24 * 60 * 60 * 1000,
    cloudEngineCooldownMs: 30 * 60 * 1000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => argv[++index];

    if (token === "--input") args.input = path.resolve(next());
    else if (token === "--output") args.output = path.resolve(next());
    else if (token === "--limit-references") args.limitReferences = Number(next());
    else if (token === "--parent-line-slugs") {
      args.parentLineSlugs = new Set(
        String(next())
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      );
    }
    else if (token === "--max-branches-per-variation") args.maxBranchesPerVariation = Number(next());
    else if (token === "--min-branches-per-variation") args.minBranchesPerVariation = Number(next());
    else if (token === "--only-under-branch-count") args.onlyUnderBranchCount = Number(next());
    else if (token === "--target-branches-per-variation") args.targetBranchesPerVariation = Number(next());
    else if (token === "--max-new-branches-per-variation") args.maxNewBranchesPerVariation = Number(next());
    else if (token === "--max-candidate-moves-per-node") args.maxCandidateMovesPerNode = Number(next());
    else if (token === "--trained-candidate-moves") args.trainedCandidateMoves = Number(next());
    else if (token === "--trained-candidate-max-loss-cp") args.trainedCandidateMaxLossCp = Number(next());
    else if (token === "--trained-opportunity-min-eval-cp") args.trainedOpportunityMinEvalCp = Number(next());
    else if (token === "--min-node-games") args.minNodeGames = Number(next());
    else if (token === "--min-move-games") args.minMoveGames = Number(next());
    else if (token === "--min-move-share") args.minMoveShare = Number(next());
    else if (token === "--cumulative-play-rate-near-anchor") args.cumulativePlayRateNearAnchor = Number(next());
    else if (token === "--cumulative-play-rate-midline") args.cumulativePlayRateMidline = Number(next());
    else if (token === "--cumulative-play-rate-deep") args.cumulativePlayRateDeep = Number(next());
    else if (token === "--individual-move-share-near-anchor") args.individualMoveShareNearAnchor = Number(next());
    else if (token === "--individual-move-share-midline") args.individualMoveShareMidline = Number(next());
    else if (token === "--individual-move-share-deep") args.individualMoveShareDeep = Number(next());
    else if (token === "--continuation-opponent-candidate-moves") args.continuationOpponentCandidateMoves = Number(next());
    else if (token === "--max-continuation-branches-per-trigger") args.maxContinuationBranchesPerTrigger = Number(next());
    else if (token === "--max-continuation-search-nodes") args.maxContinuationSearchNodes = Number(next());
    else if (token === "--midline-added-plies") args.midlineAddedPlies = Number(next());
    else if (token === "--deep-added-plies") args.deepAddedPlies = Number(next());
    else if (token === "--max-branch-plies-from-anchor") args.maxBranchPliesFromAnchor = Number(next());
    else if (token === "--soft-branch-plies-from-anchor") args.softBranchPliesFromAnchor = Number(next());
    else if (token === "--max-total-plies") args.maxTotalPlies = Number(next());
    else if (token === "--min-accept-trained-eval-cp") args.minAcceptTrainedEvalCp = Number(next());
    else if (token === "--fallback-accept-trained-eval-cp") args.fallbackAcceptTrainedEvalCp = Number(next());
    else if (token === "--advantage-resolution-min-plies") args.advantageResolutionMinPlies = Number(next());
    else if (token === "--stockfish-depth") args.stockfishDepth = Number(next());
    else if (token === "--stockfish-engine") args.stockfishEngine = String(next());
    else if (token === "--multipv-count") args.multipvCount = Number(next());
    else if (token === "--delay-ms") args.delayMs = Number(next());
    else if (token === "--cloud-eval-mode") args.cloudEvalMode = String(next());
    else if (token === "--cloud-eval-delay-ms") args.cloudEvalDelayMs = Number(next());
    else if (token === "--cloud-eval-timeout-ms") args.cloudEvalTimeoutMs = Number(next());
    else if (token === "--cloud-eval-max-retries") args.cloudEvalMaxRetries = Number(next());
    else if (token === "--cloud-eval-min-depth") args.cloudEvalMinDepth = Number(next());
    else if (token === "--cloud-eval-cache") args.cloudEvalCache = path.resolve(next());
    else if (token === "--chess-api-cache") args.chessApiCache = path.resolve(next());
    else if (token === "--stockfish-eval-cache") args.stockfishEvalCache = path.resolve(next());
    else if (token === "--best-eval-cache") args.bestEvalCache = path.resolve(next());
    else if (token === "--cloud-cache-miss-ttl-ms") args.cloudCacheMissTtlMs = Number(next());
  }

  if (!["off", "full", "authoritative"].includes(args.cloudEvalMode)) {
    throw new Error(`Unsupported --cloud-eval-mode "${args.cloudEvalMode}".`);
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing input file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withFileRetry(operation, label, attempts = 8) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      lastError = error;
      const retryable =
        error?.code === "EPERM" ||
        error?.code === "EBUSY" ||
        error?.code === "UNKNOWN";
      if (!retryable || attempt === attempts) break;
      sleepSync(50 * attempt);
    }
  }
  throw new Error(
    `${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

function loadJsonObject(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  try {
    return withFileRetry(
      () => JSON.parse(fs.readFileSync(filePath, "utf8")),
      `Could not read cache ${filePath}`
    );
  } catch (error) {
    console.warn(
      `Could not read cache ${filePath}; continuing with an empty in-memory cache: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return {};
  }
}

function writeJsonObject(filePath, value) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    withFileRetry(
      () => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8"),
      `Could not write cache ${filePath}`
    );
  } catch (error) {
    console.warn(
      `Could not write cache ${filePath}; continuing without persisting this cache update: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

function uciToMoveObject(uci) {
  let normalizedUci = uci;
  if (uci === "e1h1") normalizedUci = "e1g1";
  else if (uci === "e1a1") normalizedUci = "e1c1";
  else if (uci === "e8h8") normalizedUci = "e8g8";
  else if (uci === "e8a8") normalizedUci = "e8c8";
  return {
    from: normalizedUci.slice(0, 2),
    to: normalizedUci.slice(2, 4),
    promotion: normalizedUci.slice(4) || undefined,
  };
}

function moveToUci(move) {
  return move ? `${move.from}${move.to}${move.promotion ?? ""}` : null;
}

function scoreToCp(score) {
  if (!score) return null;
  if (score.type === "cp") return score.value;
  if (score.type === "mate") return score.value > 0 ? SCORE_MATE_CP : -SCORE_MATE_CP;
  return null;
}

function perspectiveEvalCp(score, turnColor, targetColor) {
  const cp = scoreToCp(score);
  if (!Number.isFinite(cp)) return null;
  return turnColor === targetColor ? cp : -cp;
}

function applySans(sans) {
  const chess = new Chess();
  for (const san of sans) {
    const move = chess.move(san);
    if (!move) throw new Error(`Illegal SAN while replaying line: ${san}`);
  }
  return chess;
}

function sanToUciAtPosition(fen, san) {
  if (!san) return null;
  const chess = new Chess(fen);
  return moveToUci(chess.move(san));
}

function sansToPgn(sans, initialSans = []) {
  const chess = new Chess();
  const moves = [];
  for (const san of initialSans) {
    chess.move(san);
  }
  for (const san of sans) {
    const moveNumber = chess.moveNumber();
    if (chess.turn() === "w") moves.push(`${moveNumber}. ${san}`);
    else if (moves.length === 0) moves.push(`${moveNumber}... ${san}`);
    else moves[moves.length - 1] = `${moves[moves.length - 1]} ${san}`;
    chess.move(san);
  }
  return moves.join(" ").trim();
}

function stockfishCacheKey(fen, args) {
  return `${fen}::depth:${args.stockfishDepth}::engine:${args.stockfishEngine}::multipv:${args.multipvCount}`;
}

async function analyzeFen({ fen, depth, multipvCount, engineFlavor }) {
  return new Promise((resolve, reject) => {
    const engine = createStockfishEngine({ flavor: engineFlavor });
    const latestInfos = new Map();
    const cleanup = () => {
      try {
        engine.quit();
      } catch (_error) {
        // ignore teardown errors
      }
    };

    try {
      engine.send("uci", () => {
        engine.send("setoption name MultiPV value " + multipvCount);
        engine.send("isready", () => {
          engine.send("ucinewgame");
          engine.send(`position fen ${fen}`);
          engine.send(
            `go depth ${depth}`,
            (bestmoveLine) => {
              const bestmoveMatch = bestmoveLine.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
              const turnColor = fen.split(" ")[1] === "w" ? "white" : "black";
              const lines = Array.from(latestInfos.values())
                .sort((left, right) => (left.multipv ?? 1) - (right.multipv ?? 1))
                .map((info) => ({
                  multipv: info.multipv ?? 1,
                  depth: info.depth ?? null,
                  score: info.score ?? null,
                  pv: info.pv ?? [],
                  uci: info.pv?.[0] ?? null,
                  nodes: info.nodes ?? null,
                  nps: info.nps ?? null,
                }));
              cleanup();
              resolve({
                fen,
                turnColor,
                depth,
                engineFlavor,
                source: "stockfish",
                bestMove: bestmoveMatch ? bestmoveMatch[1] : null,
                ponder: bestmoveMatch ? bestmoveMatch[2] ?? null : null,
                lines,
              });
            },
            (line) => {
              const info = parseInfoLine(line);
              if (!info || !info.score) return;
              const key = info.multipv ?? 1;
              const current = latestInfos.get(key);
              if (!current || (info.depth ?? 0) >= (current.depth ?? 0)) {
                latestInfos.set(key, info);
              }
            }
          );
        });
      });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function analyzeFenCached(fen, args) {
  const cache = loadJsonObject(args.stockfishEvalCache);
  const key = stockfishCacheKey(fen, args);
  if (cache[key]?.result) return cache[key].result;
  const result = await analyzeFen({
    fen,
    depth: args.stockfishDepth,
    multipvCount: args.multipvCount,
    engineFlavor: args.stockfishEngine,
  });
  cache[key] = { result, cachedAt: new Date().toISOString() };
  writeJsonObject(args.stockfishEvalCache, cache);
  return result;
}

function normalizedPositionKey(fen) {
  return String(fen).split(/\s+/).slice(0, 4).join(" ");
}

function bestEvalCacheKey(fen) {
  return normalizedPositionKey(fen);
}

function isLegalUciForFen(fen, uci) {
  if (!uci || uci === "(none)") return false;
  try {
    const chess = new Chess(fen);
    return Boolean(chess.move(uciToMoveObject(uci)));
  } catch (_error) {
    return false;
  }
}

function analysisMatchesFen(analysis, fen) {
  if (!analysis?.bestMove || analysis.bestMove === "(none)") return false;
  if (analysis.fen && normalizedPositionKey(analysis.fen) !== normalizedPositionKey(fen)) {
    return false;
  }
  return isLegalUciForFen(fen, analysis.bestMove);
}

function terminalAnalysisForFen(fen) {
  const chess = new Chess(fen);
  if (!chess.isGameOver()) return null;
  const turnColor = chess.turn() === "w" ? "white" : "black";
  const score = chess.isCheckmate()
    ? { type: "mate", value: -1 }
    : { type: "cp", value: 0 };
  return {
    fen,
    turnColor,
    depth: 0,
    engineFlavor: "terminal",
    source: "terminal",
    bestMove: "(none)",
    ponder: null,
    lines: [
      {
        multipv: 1,
        depth: 0,
        score,
        pv: [],
        uci: null,
        nodes: null,
        nps: null,
      },
    ],
  };
}

function providerRank(source) {
  if (source === "lichess-cloud-eval") return 300;
  if (source === "chess-api") return 200;
  if (source === "stockfish") return 100;
  return 0;
}

function analysisLineCount(analysis) {
  return Array.isArray(analysis?.lines) ? analysis.lines.length : 0;
}

function analysisQuality(analysis) {
  return {
    providerRank: providerRank(analysis?.source),
    depth: Number.isFinite(analysis?.depth) ? analysis.depth : 0,
    lineCount: analysisLineCount(analysis),
  };
}

function isBetterAnalysis(candidate, current) {
  if (!candidate?.bestMove || candidate.bestMove === "(none)") return false;
  if (!current?.bestMove || current.bestMove === "(none)") return true;
  const candidateQuality = analysisQuality(candidate);
  const currentQuality = analysisQuality(current);
  if (candidateQuality.providerRank !== currentQuality.providerRank) {
    return candidateQuality.providerRank > currentQuality.providerRank;
  }
  if (candidateQuality.depth !== currentQuality.depth) {
    return candidateQuality.depth > currentQuality.depth;
  }
  return candidateQuality.lineCount > currentQuality.lineCount;
}

function readBestKnownAnalysis(fen, args, cache) {
  if (!args.bestEvalCache || !cache) return null;
  const analysis = cache[bestEvalCacheKey(fen)]?.result ?? null;
  return analysisMatchesFen(analysis, fen) ? analysis : null;
}

function analysisSourceToProvider(source) {
  if (source === "lichess-cloud-eval") return "lichess";
  if (source === "chess-api") return "chess-api";
  if (source === "stockfish") return "stockfish";
  return null;
}

function writeBestKnownAnalysis(fen, analysis, args, cache) {
  if (!args.bestEvalCache || !cache || !analysisMatchesFen(analysis, fen)) {
    return analysis;
  }
  const key = bestEvalCacheKey(fen);
  const current = cache[key]?.result ?? null;
  if (!isBetterAnalysis(analysis, current)) return current ?? analysis;
  cache[key] = {
    result: analysis,
    source: analysis.source ?? null,
    provider: analysisSourceToProvider(analysis.source),
    depth: analysis.depth ?? null,
    bestMove: analysis.bestMove ?? null,
    lineCount: analysisLineCount(analysis),
    quality: analysisQuality(analysis),
    updatedAt: new Date().toISOString(),
  };
  writeJsonObject(args.bestEvalCache, cache);
  return analysis;
}

function shouldUseBestKnownAnalysis(analysis, args) {
  if (!analysis?.bestMove || analysis.bestMove === "(none)") return false;
  if (analysis.source === "lichess-cloud-eval") return true;
  if (args.cloudEvalMode !== "authoritative" && args.cloudEvalMode !== "full") return true;
  if (args.lockedEngineId === "stockfish") return true;
  return false;
}

async function fetchCloudAnalysis(fen, args) {
  const engineOptions = {
    lichess: {
      multipvCount: args.multipvCount,
      delayMs: args.cloudEvalDelayMs,
      maxRetries: args.cloudEvalMaxRetries,
      timeoutMs: args.cloudEvalTimeoutMs,
      cachePath: args.cloudEvalCache,
      missTtlMs: args.cloudCacheMissTtlMs,
    },
    chessApi: {
      delayMs: args.cloudEvalDelayMs,
      timeoutMs: args.cloudEvalTimeoutMs,
      cachePath: args.chessApiCache,
      missTtlMs: args.cloudCacheMissTtlMs,
    },
  };

  const cachedLichess = readCachedLichessCloudEval(fen, engineOptions.lichess);
  if (analysisMatchesFen(cachedLichess, fen)) return cachedLichess;
  const cachedChessApi = readCachedChessApiEval(fen, engineOptions.chessApi);
  if (analysisMatchesFen(cachedChessApi, fen)) return cachedChessApi;

  const allEngines = args.router.engineIds;
  const startIdx = allEngines.indexOf(args.lockedEngineId);
  const orderedEngines = startIdx >= 0 ? allEngines.slice(startIdx) : allEngines;
  for (const engineId of orderedEngines) {
    if (args.router.isCoolingDown(engineId)) continue;
    const result = await args.router.fetch(engineId, fen, engineOptions);
    if (!analysisMatchesFen(result, fen)) continue;
    if (args.cloudEvalMinDepth > 0 && result.depth != null && result.depth < args.cloudEvalMinDepth) {
      continue;
    }
    return result;
  }
  return null;
}

async function analyzePosition(fen, args, cache) {
  const key = `${fen}::${args.stockfishDepth}::${args.stockfishEngine}::${args.multipvCount}::${args.cloudEvalMode}::${args.lockedEngineId ?? "default"}`;
  if (cache.analysis.has(key)) return cache.analysis.get(key);

  const terminalAnalysis = terminalAnalysisForFen(fen);
  if (terminalAnalysis) {
    cache.analysis.set(key, terminalAnalysis);
    return terminalAnalysis;
  }

  const bestKnown = readBestKnownAnalysis(fen, args, cache.bestEval);
  if (shouldUseBestKnownAnalysis(bestKnown, args)) {
    cache.analysis.set(key, bestKnown);
    return bestKnown;
  }

  const useCloud =
    (args.cloudEvalMode === "authoritative" || args.cloudEvalMode === "full") &&
    args.lockedEngineId !== "stockfish";
  if (useCloud) {
    try {
      const cloudResult = await fetchCloudAnalysis(fen, args);
      if (analysisMatchesFen(cloudResult, fen)) {
        const bestResult = writeBestKnownAnalysis(fen, cloudResult, args, cache.bestEval);
        cache.analysis.set(key, bestResult);
        return bestResult;
      }
    } catch (error) {
      if (error instanceof EngineRateLimitedError || error?.code === "ENGINE_RATE_LIMITED") {
        throw error;
      }
      console.warn(
        `Cloud eval unavailable for branch position; falling back to Stockfish: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const localResult = await analyzeFenCached(fen, args);
  if (!analysisMatchesFen(localResult, fen)) {
    throw new Error(`Stockfish returned illegal best move "${localResult?.bestMove ?? "none"}" for ${fen}`);
  }
  const bestResult = writeBestKnownAnalysis(fen, localResult, args, cache.bestEval);
  cache.analysis.set(key, bestResult);
  return bestResult;
}

async function fetchExplorerNode(fen, args, cache) {
  if (cache.has(fen)) return cache.get(fen);
  const explorer = await fetchLichessExplorer(fen, { moves: 12, delayMs: args.delayMs });
  const topMoves = (explorer.moves ?? [])
    .map((move) => ({ ...move, totalGames: totalGames(move) }))
    .sort((left, right) => right.totalGames - left.totalGames);
  const node = {
    opening: explorer.opening ?? null,
    totalGamesAtNode: topMoves.reduce((sum, move) => sum + move.totalGames, 0),
    topMoves,
  };
  cache.set(fen, node);
  await sleep(args.delayMs);
  return node;
}

function cumulativeLimitForAddedPlies(addedPlies, args) {
  if (addedPlies >= args.deepAddedPlies) return args.cumulativePlayRateDeep;
  if (addedPlies >= args.midlineAddedPlies) return args.cumulativePlayRateMidline;
  return args.cumulativePlayRateNearAnchor;
}

function individualMoveShareForAddedPlies(addedPlies, args) {
  if (addedPlies >= args.deepAddedPlies) return args.individualMoveShareDeep;
  if (addedPlies >= args.midlineAddedPlies) return args.individualMoveShareMidline;
  return args.individualMoveShareNearAnchor;
}

function popularMovesForNode({ explorer, addedPlies, args }) {
  if (explorer.totalGamesAtNode < args.minNodeGames) return [];
  const cumulativeLimit = cumulativeLimitForAddedPlies(addedPlies, args);
  const individualShare = individualMoveShareForAddedPlies(addedPlies, args);
  let cumulative = 0;
  const selected = [];

  for (const move of explorer.topMoves) {
    const playRate = explorer.totalGamesAtNode > 0 ? move.totalGames / explorer.totalGamesAtNode : 0;
    if (move.totalGames < args.minMoveGames || playRate < args.minMoveShare) continue;
    const nextCumulative = cumulative + playRate;
    const isIndividuallyCommon = playRate >= individualShare;
    const isInsideCumulativeLimit = nextCumulative <= cumulativeLimit;
    if (selected.length > 0 && !isInsideCumulativeLimit && !isIndividuallyCommon) break;
    cumulative = nextCumulative;
    selected.push({
      ...move,
      playRate,
      cumulativePlayRate: cumulative,
      selectedBy:
        selected.length === 0
          ? "top_move"
          : isInsideCumulativeLimit
            ? "cumulative"
            : "individual_share",
      nodeGames: explorer.totalGamesAtNode,
    });
    if (selected.length >= args.maxCandidateMovesPerNode) break;
  }

  return selected;
}

function countDevelopedMinorPieces(chess, colorCode) {
  const startingSquares =
    colorCode === "w"
      ? new Set(["b1", "g1", "c1", "f1"])
      : new Set(["b8", "g8", "c8", "f8"]);
  let developed = 0;
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = chess.board()[rank][file];
      if (!piece || piece.color !== colorCode || (piece.type !== "n" && piece.type !== "b")) continue;
      const square = `${String.fromCharCode(97 + file)}${8 - rank}`;
      if (!startingSquares.has(square)) developed += 1;
    }
  }
  return developed;
}

function hasCastled(chess, colorCode) {
  const kingSquares = colorCode === "w" ? ["g1", "c1"] : ["g8", "c8"];
  return kingSquares.some((square) => {
    const piece = chess.get(square);
    return piece?.type === "k" && piece.color === colorCode;
  });
}

function computeMaterialEdge(chess, openingColor) {
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let white = 0;
  let black = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      if (piece.color === "w") white += values[piece.type] ?? 0;
      else black += values[piece.type] ?? 0;
    }
  }
  return openingColor === "white" ? white - black : black - white;
}

function squareFromBoardIndexes(rowIndex, colIndex) {
  return `${"abcdefgh"[colIndex]}${8 - rowIndex}`;
}

function materialThreatState(chess, openingColor) {
  const trainedColorCode = openingColor === "white" ? "w" : "b";
  const opponentColorCode = trainedColorCode === "w" ? "b" : "w";
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const attackersBySquare = new Map();
  let threatenedMaterialPawns = 0;
  let threatenedPieceCount = 0;
  let forkThreatCount = 0;

  chess.board().forEach((row, rowIndex) => {
    row.forEach((piece, colIndex) => {
      if (!piece || piece.color !== opponentColorCode || piece.type === "k") return;
      const square = squareFromBoardIndexes(rowIndex, colIndex);
      const attackers = chess.attackers(square, trainedColorCode);
      if (attackers.length === 0) return;
      const value = values[piece.type] ?? 0;
      threatenedMaterialPawns += value;
      threatenedPieceCount += 1;
      for (const attackerSquare of attackers) {
        const attackerPiece = chess.get(attackerSquare);
        if (!attackerPiece) continue;
        const attackerValue = values[attackerPiece.type] ?? 0;
        if (attackerValue < value) {
          forkThreatCount += 1;
          const existing = attackersBySquare.get(attackerSquare) ?? 0;
          attackersBySquare.set(attackerSquare, existing + 1);
        }
      }
    });
  });

  const forkedByOnePiece = Array.from(attackersBySquare.values()).some((count) => count >= 2);
  const hasMaterialThreat =
    threatenedMaterialPawns >= 3 &&
    (threatenedPieceCount >= 2 || forkThreatCount > 0 || forkedByOnePiece);

  return {
    hasMaterialThreat,
    threatenedMaterialPawns,
    threatenedPieceCount,
    forkThreatCount,
    forkedByOnePiece,
  };
}

function moveDescriptorFromUci(chess, uci) {
  if (!uci || uci === "(none)") return null;
  const clone = new Chess(chess.fen());
  let move = null;
  try {
    move = clone.move(uciToMoveObject(uci));
  } catch (_error) {
    return null;
  }
  if (!move) return null;
  return {
    san: move.san,
    isCapture: move.san.includes("x"),
    givesCheck: clone.inCheck(),
  };
}

function branchCategory(line, triggerSan, responseSan) {
  const text = normalizeText([line.fullName, line.lineName, triggerSan, responseSan].join(" "));
  if (
    text.includes("gambit") ||
    text.includes("trap") ||
    text.includes("attack") ||
    /[+#x]/.test(`${triggerSan} ${responseSan}`)
  ) {
    return "tactical_payoff";
  }
  if (text.includes("main line") || text.includes("forced")) return "forcing";
  if (text.includes("system") || text.includes("setup")) return "setup";
  return line.primaryCategory ?? "strategic";
}

function checkpointScore({
  chess,
  line,
  analysis,
  openingColor,
  branchSansFromAnchor,
  trace,
  category,
  args,
  advantageStartPly = null,
}) {
  const analysisIsCurrent = analysisMatchesFen(analysis, chess.fen());
  const trainedEvalCp = analysisIsCurrent
    ? perspectiveEvalCp(analysis.lines[0]?.score ?? null, analysis.turnColor, openingColor)
    : null;
  const sideToMove = chess.turn() === "w" ? "white" : "black";
  const trainedColorCode = openingColor === "white" ? "w" : "b";
  const materialEdgePawns = computeMaterialEdge(chess, openingColor);
  const developed = countDevelopedMinorPieces(chess, trainedColorCode);
  const castled = hasCastled(chess, trainedColorCode);
  const bestMoveDescriptor = analysisIsCurrent ? moveDescriptorFromUci(chess, analysis.bestMove) : null;
  const lastSan = branchSansFromAnchor.at(-1) ?? null;
  const lastWasCapture = Boolean(lastSan?.includes("x"));
  const lastGaveCheck = Boolean(lastSan?.includes("+") || lastSan?.includes("#"));
  const hasCaptureSequence = branchSansFromAnchor.some((san) => san.includes("x"));
  const pendingCapture = Boolean(bestMoveDescriptor?.isCapture || lastWasCapture);
  const pendingCheckReply = lastGaveCheck && !lastSan?.includes("#");
  const nextMoveIsForcing = Boolean(bestMoveDescriptor?.givesCheck || bestMoveDescriptor?.isCapture);
  const materialThreat = materialThreatState(chess, openingColor);
  const visibleMaterialThreat =
    materialThreat.hasMaterialThreat &&
    (materialThreat.forkedByOnePiece ||
      (materialThreat.threatenedPieceCount >= 2 && materialThreat.threatenedMaterialPawns >= 6));
  const materialThreatPending =
    sideToMove !== openingColor &&
    materialEdgePawns < 1 &&
    Number.isFinite(trainedEvalCp) &&
    trainedEvalCp >= 120 &&
    materialThreat.hasMaterialThreat &&
    !visibleMaterialThreat;
  const materialConversionPending =
    hasCaptureSequence &&
    materialEdgePawns < 1 &&
    Number.isFinite(trainedEvalCp) &&
    trainedEvalCp >= 120 &&
    (pendingCapture || pendingCheckReply || nextMoveIsForcing || materialThreatPending);
  const advantageResolutionPlies = Number.isFinite(advantageStartPly)
    ? Math.max(0, trace.length ? trace.at(-1).ply - advantageStartPly : 0)
    : null;
  const engineAdvantagePending =
    sideToMove !== openingColor &&
    materialEdgePawns < 1 &&
    Number.isFinite(trainedEvalCp) &&
    trainedEvalCp >= args.trainedOpportunityMinEvalCp;
  const engineAdvantageBlocksStop =
    engineAdvantagePending &&
    !visibleMaterialThreat &&
    Number.isFinite(advantageResolutionPlies) &&
    advantageResolutionPlies < args.advantageResolutionMinPlies;
  const unresolvedForcing = Boolean(
    pendingCapture ||
      pendingCheckReply ||
      nextMoveIsForcing ||
      materialThreatPending ||
      engineAdvantageBlocksStop
  );
  const addedPlies = branchSansFromAnchor.length;
  const opponentRates = trace
    .filter((step) => step.side === "opponent")
    .map((step) => step.playRate)
    .filter(Number.isFinite);
  const minPlayRate = opponentRates.length ? Math.min(...opponentRates) : 1;
  const avgPlayRate =
    opponentRates.length > 0
      ? opponentRates.reduce((sum, value) => sum + value, 0) / opponentRates.length
      : 1;
  let score = Number.isFinite(trainedEvalCp) ? trainedEvalCp / 35 : -5;
  score += Math.min(materialEdgePawns, 3) * 2;
  score += Math.min(developed, 4) * 0.6;
  if (castled) score += 1;
  if (bestMoveDescriptor?.givesCheck) score -= 1;
  if (unresolvedForcing) score -= 4;
  if (materialConversionPending) score -= 3;
  score += avgPlayRate * 3;
  score += minPlayRate * 2;
  score -= Math.max(0, addedPlies - args.softBranchPliesFromAnchor) * 0.8;

  if (category === "tactical_payoff") {
    if (materialEdgePawns >= 1) score += 2;
    if (Number.isFinite(trainedEvalCp) && trainedEvalCp >= 140) score += 2;
    if (/[+#x]/.test(branchSansFromAnchor.join(" "))) score += 1;
  } else if (category === "forcing") {
    if (!pendingCapture && Number.isFinite(trainedEvalCp) && trainedEvalCp >= 80) score += 2;
  } else if (category === "setup") {
    if (developed >= 3 && (castled || addedPlies >= 6) && trainedEvalCp >= -20) score += 2;
  } else if (trainedEvalCp >= 40 && (developed >= 2 || castled || materialEdgePawns >= 0)) {
    score += 2;
  }

  return {
    score: Number(score.toFixed(3)),
    trainedEvalCp,
    materialEdgePawns,
    developed,
    castled,
    pendingCapture,
    pendingCheckReply,
    nextMoveIsForcing,
    visibleMaterialThreat,
    materialThreatPending,
    threatenedMaterialPawns: materialThreat.threatenedMaterialPawns,
    threatenedPieceCount: materialThreat.threatenedPieceCount,
    forkThreatCount: materialThreat.forkThreatCount,
    forkedByOnePiece: materialThreat.forkedByOnePiece,
    engineAdvantagePending,
    engineAdvantageBlocksStop,
    advantageResolutionPlies,
    advantageResolutionMinPlies: args.advantageResolutionMinPlies,
    materialConversionPending,
    unresolvedForcing,
    bestMoveSan: bestMoveDescriptor?.san ?? null,
    bestMoveIsCapture: bestMoveDescriptor?.isCapture ?? false,
    bestMoveGivesCheck: bestMoveDescriptor?.givesCheck ?? false,
    minPlayRate,
    avgPlayRate,
    category,
  };
}

function checkpointAccepts(state, args, allowFallback) {
  const threshold = allowFallback ? args.fallbackAcceptTrainedEvalCp : args.minAcceptTrainedEvalCp;
  if (!Number.isFinite(state.trainedEvalCp) || state.trainedEvalCp < threshold) return false;
  if (state.unresolvedForcing || state.materialConversionPending) return false;
  if (state.category === "tactical_payoff") {
    return state.materialEdgePawns >= 1 || state.trainedEvalCp >= 120;
  }
  if (state.category === "forcing") {
    return state.trainedEvalCp >= 60;
  }
  if (state.category === "setup") {
    return state.trainedEvalCp >= -20 && (state.castled || state.developed >= 3);
  }
  return state.trainedEvalCp >= threshold;
}

function checkpointNeedsResolution(state) {
  return Boolean(state?.unresolvedForcing || state?.materialConversionPending);
}

function trainedMoveCandidates({ chess, analysis, openingColor, args }) {
  const byUci = new Map();
  for (const line of analysis.lines ?? []) {
    const uci = line.uci ?? line.pv?.[0] ?? null;
    if (!uci || byUci.has(uci)) continue;
    const probe = new Chess(chess.fen());
    if (!probe.move(uciToMoveObject(uci))) continue;
    const evalCp = perspectiveEvalCp(line.score ?? null, analysis.turnColor, openingColor);
    if (!Number.isFinite(evalCp)) continue;
    byUci.set(uci, {
      uci,
      rank: line.multipv ?? byUci.size + 1,
      evalCp,
    });
  }

  if (analysis.bestMove && !byUci.has(analysis.bestMove)) {
    const probe = new Chess(chess.fen());
    if (probe.move(uciToMoveObject(analysis.bestMove))) {
      byUci.set(analysis.bestMove, {
        uci: analysis.bestMove,
        rank: 1,
        evalCp: null,
      });
    }
  }

  const candidates = Array.from(byUci.values()).sort((left, right) => {
    if (Number.isFinite(right.evalCp) && Number.isFinite(left.evalCp)) return right.evalCp - left.evalCp;
    return left.rank - right.rank;
  });
  const bestEvalCp = candidates.find((candidate) => Number.isFinite(candidate.evalCp))?.evalCp ?? null;

  return candidates
    .map((candidate, index) => {
      const evalLossCp =
        Number.isFinite(bestEvalCp) && Number.isFinite(candidate.evalCp)
          ? Math.max(0, bestEvalCp - candidate.evalCp)
          : 0;
      return {
        ...candidate,
        rank: index + 1,
        bestEvalCp,
        evalLossCp,
      };
    })
    .filter((candidate, index) => {
      if (index === 0) return true;
      if (index >= args.trainedCandidateMoves) return false;
      return candidate.evalLossCp <= args.trainedCandidateMaxLossCp;
    });
}

function buildTraceStepForOpponent({ ply, move, san, source }) {
  return {
    ply,
    side: "opponent",
    san,
    uci: move.uci,
    source,
    nodeGames: move.nodeGames,
    moveGames: move.totalGames,
    playRate: Number.isFinite(move.playRate) ? Number(move.playRate.toFixed(4)) : null,
    cumulativePlayRate: Number.isFinite(move.cumulativePlayRate)
      ? Number(move.cumulativePlayRate.toFixed(4))
      : null,
    selectedBy: move.selectedBy ?? null,
  };
}

function buildTraceStepForTrained({
  ply,
  san,
  uci,
  analysis,
  trainedEvalCp,
  trainedCandidate = null,
}) {
  return {
    ply,
    side: "trained",
    san,
    uci,
    source: trainedCandidate?.rank > 1 ? "engine-opportunity" : "engine-best",
    engineProvider: analysisSourceToProvider(analysis.source) ?? "stockfish",
    engineSource: analysis.source ?? null,
    engineDepth: analysis.depth ?? null,
    engineRank: trainedCandidate?.rank ?? 1,
    engineEvalCp: trainedCandidate?.evalCp ?? null,
    engineBestEvalCp: trainedCandidate?.bestEvalCp ?? null,
    engineEvalLossCp: trainedCandidate?.evalLossCp ?? 0,
    trainedEvalCp,
  };
}

function makeBranchName({ triggerSan, category, finalState, trace = [] }) {
  const followupOpponentSan = trace
    .filter((step) => step.side === "opponent")
    .slice(1, 2)
    .map((step) => step.san)
    .find(Boolean);
  const triggerLabel = followupOpponentSan ? `${triggerSan} ${followupOpponentSan}` : triggerSan;
  if (category === "tactical_payoff") {
    if (finalState.materialEdgePawns >= 1) return `Punish ${triggerLabel}`;
    if (/[+#]/.test(triggerSan)) return `${triggerLabel} tactic`;
    return `${triggerLabel} tactical response`;
  }
  if (category === "forcing") return `${triggerLabel} forcing line`;
  if (category === "setup") return `${triggerLabel} setup response`;
  if (finalState.castled || finalState.developed >= 3) return `${triggerLabel} practical setup`;
  return `${triggerLabel} practical response`;
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function isStrictSanPrefix(prefixSans, fullSans) {
  if (!Array.isArray(prefixSans) || !Array.isArray(fullSans)) return false;
  if (prefixSans.length >= fullSans.length) return false;
  return prefixSans.every((san, index) => san === fullSans[index]);
}

function pruneSupersededBranchVariants(variants, args) {
  return variants.filter((variant) => {
    const variantEval = Number.isFinite(variant.finalState?.trainedEvalCp)
      ? variant.finalState.trainedEvalCp
      : Number.NEGATIVE_INFINITY;
    return !variants.some((other) => {
      if (other === variant) return false;
      if (!isStrictSanPrefix(variant.generatedSans, other.generatedSans)) return false;
      const otherEval = Number.isFinite(other.finalState?.trainedEvalCp)
        ? other.finalState.trainedEvalCp
        : Number.NEGATIVE_INFINITY;
      return (
        otherEval >= variantEval &&
        (variantEval < args.trainedOpportunityMinEvalCp || otherEval >= args.trainedOpportunityMinEvalCp)
      );
    });
  });
}

function lineKey(line) {
  return `${line.openingId}::${line.lineId}`;
}

function buildBranchEvalCpByPly(generatedSans, branchTrace, evalPerspective) {
  const evalCpByPly = Array(generatedSans.length + 1).fill(null);
  for (const step of branchTrace) {
    if (
      step.side !== "trained" ||
      !Number.isInteger(step.ply) ||
      step.ply < 0 ||
      step.ply >= evalCpByPly.length ||
      !Number.isFinite(step.trainedEvalCp)
    ) {
      continue;
    }
    evalCpByPly[step.ply] =
      evalPerspective === "white" ? step.trainedEvalCp : -step.trainedEvalCp;
  }
  return evalCpByPly.some((value) => Number.isFinite(value)) ? evalCpByPly : null;
}

function buildBranchRecord({ parent, stemSans, trigger, branch, finalState, args }) {
  const parentLineId = parent.lineId ?? slugify(parent.fullName);
  const triggerSlug = slugify(`${stemSans.length}-${trigger.san}`);
  const category = finalState.category;
  const branchTrace = branch.trace;
  const name = makeBranchName({ triggerSan: trigger.san, category, finalState, trace: branchTrace });
  const fullName = `${parent.fullName}: ${name}`;
  const firstTrainedStep = branchTrace.find((step) => step.side === "trained");
  const trainedOpportunitySlug =
    branch.trainedOpportunity && firstTrainedStep?.san ? `-${slugify(firstTrainedStep.san)}` : "";
  const lineId = `${parentLineId}-branch-${triggerSlug}${trainedOpportunitySlug}`;
  const sourceCounts = countBy(branchTrace.map((step) => step.source));
  const engineProviders = countBy(
    branchTrace
      .filter((step) => step.side === "trained")
      .map((step) => step.engineProvider)
  );
  const depths = branchTrace
    .filter((step) => step.side === "trained")
    .map((step) => step.engineDepth)
    .filter(Number.isFinite);
  const avgDepth =
    depths.length > 0 ? Math.round(depths.reduce((sum, value) => sum + value, 0) / depths.length) : null;
  const finalEvalPerspective = parent.openingColor;
  const evalCpByPly = buildBranchEvalCpByPly(branch.generatedSans, branchTrace, finalEvalPerspective);

  return {
    ...parent,
    lineId,
    lineName: name,
    fullName,
    lineDisplayName: fullName,
    lineType: "practical_branch",
    lineKind: "practical_branch",
    variationName: parent.variationName ?? parent.lineName,
    primaryCategory: category,
    isMainVariationLine: false,
    isTeachingLine: true,
    isMainLine: false,
    mainLineConfidence: "none",
    mainLineSource: null,
    branchDepth: 1,
    parentLineId,
    lessonStemPly: stemSans.length,
    lessonStemFen: branch.stemFen,
    triggerMoveSan: trigger.san,
    triggerMoveUci: trigger.uci,
    triggerMovePopularity: trigger.playRate,
    gamesAtNode: trigger.nodeGames,
    gamesForMove: trigger.totalGames,
    referenceMoveSan: trigger.referenceSan,
    referenceMoveUci: trigger.referenceUci,
    evalBeforeTrigger: branch.evalBeforeTrigger,
    evalAfterTrigger: branch.evalAfterTrigger,
    evalGain: Number.isFinite(branch.evalBeforeTrigger) && Number.isFinite(branch.evalAfterTrigger)
      ? branch.evalAfterTrigger - branch.evalBeforeTrigger
      : null,
    branchScore: finalState.score,
    inclusionOutcome: branch.fallback ? "include-practical-branch-fallback" : "include-practical-branch",
    sourceType: "hybrid",
    sourceName: "Lichess Explorer practical branch + engine ladder",
    sourceConfidence: branch.fallback ? "low" : "medium",
    stopReason: branch.stopReason,
    finalFen: branch.finalFen,
    finalEvalCp: finalState.trainedEvalCp,
    finalEvalPerspective,
    evalCpByPly,
    finalPositionSummary: "Practical human continuation selected by popularity and resolved with trained-side engine moves.",
    advantageTypePrimary: category === "tactical_payoff" ? "punishment" : "practical_advantage",
    advantageTypeSecondary: ["human_popularity"],
    popularitySource: "lichess-explorer",
    popularityScore: trigger.playRate,
    popularityGames: trigger.totalGames,
    popularityRankWithinOpening: null,
    continuationPgn: sansToPgn(branch.generatedSans.slice(parent.variationAnchorSans?.length ?? 0), parent.variationAnchorSans ?? []),
    fullLinePgn: sansToPgn(branch.generatedSans),
    sourceSans: parent.sourceSans ?? parent.variationAnchorSans,
    continuationSans: branch.generatedSans.slice(parent.variationAnchorSans?.length ?? 0),
    generatedSans: branch.generatedSans,
    generation: {
      mode: "practical-branch",
      sourcePlies: parent.variationAnchorSans?.length ?? parent.generation?.sourcePlies ?? null,
      addedPlies: Math.max(branch.generatedSans.length - (parent.variationAnchorSans?.length ?? 0), 0),
      extension: branchTrace,
      extensionSourceCounts: sourceCounts,
      engineProvider: Object.keys(engineProviders).length > 1 ? "mixed" : Object.keys(engineProviders)[0] ?? null,
      engineProviderCounts: engineProviders,
      avgExtensionDepth: avgDepth,
      branch: {
        parentLineId,
        branchKey: `${parent.openingId}::${parentLineId}::${stemSans.length}::${trigger.uci}${
          branch.trainedOpportunity ? `::${branch.trainedOpportunity.firstTrainedUci}` : ""
        }`,
        lessonTitle: name,
        lessonStemPly: stemSans.length,
        lessonStemSans: stemSans,
        lessonStemFen: branch.stemFen,
        triggerPly: stemSans.length + 1,
        triggerMoveSan: trigger.san,
        triggerMoveUci: trigger.uci,
        referenceMoveSan: trigger.referenceSan,
        referenceMoveUci: trigger.referenceUci,
        triggerMovePopularity: trigger.playRate,
        triggerCumulativePlayRate: trigger.cumulativePlayRate,
        gamesAtNode: trigger.nodeGames,
        gamesForMove: trigger.totalGames,
        evalBeforeTrigger: branch.evalBeforeTrigger,
        evalAfterTrigger: branch.evalAfterTrigger,
        finalTrainedEvalCp: finalState.trainedEvalCp,
        evalGain: Number.isFinite(branch.evalBeforeTrigger) && Number.isFinite(branch.evalAfterTrigger)
          ? branch.evalAfterTrigger - branch.evalBeforeTrigger
          : null,
        branchScore: finalState.score,
        continuationTrace: branchTrace,
        selectionMetadata: {
          fallback: branch.fallback,
          trainedOpportunity: branch.trainedOpportunity,
          trainedCandidateMoves: args.trainedCandidateMoves,
          trainedCandidateMaxLossCp: args.trainedCandidateMaxLossCp,
          trainedOpportunityMinEvalCp: args.trainedOpportunityMinEvalCp,
          advantageResolutionMinPlies: args.advantageResolutionMinPlies,
          maxBranchesPerVariation: args.maxBranchesPerVariation,
          continuationOpponentCandidateMoves: args.continuationOpponentCandidateMoves,
          maxContinuationBranchesPerTrigger: args.maxContinuationBranchesPerTrigger,
          maxContinuationSearchNodes: args.maxContinuationSearchNodes,
          cumulativeLimits: {
            nearAnchor: args.cumulativePlayRateNearAnchor,
            midline: args.cumulativePlayRateMidline,
            deep: args.cumulativePlayRateDeep,
          },
          individualMoveShareFloors: {
            nearAnchor: args.individualMoveShareNearAnchor,
            midline: args.individualMoveShareMidline,
            deep: args.individualMoveShareDeep,
          },
          finalState,
        },
      },
    },
    stockfish: branch.finalAnalysis,
  };
}

async function generateBranchVariantsFromTrigger({
  parent,
  stemSans,
  trigger,
  args,
  caches,
  allowFallback,
  forcedFirstTrainedCandidate = null,
}) {
  const openingColor = parent.openingColor;
  const root = applySans(stemSans);
  const stemFen = root.fen();
  const beforeAnalysis = await analyzeWithRouter(stemFen, args, caches);
  const evalBeforeTrigger = perspectiveEvalCp(
    beforeAnalysis.lines[0]?.score ?? null,
    beforeAnalysis.turnColor,
    openingColor
  );
  const triggerMove = root.move(uciToMoveObject(trigger.uci));
  if (!triggerMove) return [];

  const initialSans = [...stemSans, triggerMove.san];
  const initialTrace = [
    buildTraceStepForOpponent({
      ply: initialSans.length,
      move: { ...trigger, san: triggerMove.san },
      san: triggerMove.san,
      source: "lichess-explorer-trigger",
    }),
  ];
  const checkpoints = [];
  const responseCategory = branchCategory(parent, triggerMove.san, "");
  let visitedNodes = 0;

  function pushCheckpoint({
    state,
    generatedSans,
    trace,
    fen,
    analysis,
    fallback = false,
  }) {
    if (!checkpointAccepts(state, args, allowFallback || fallback)) return;
    checkpoints.push({
      state,
      generatedSans: [...generatedSans],
      trace: trace.map((step) => ({ ...step })),
      fen,
      analysis,
      fallback,
    });
  }

  async function search({
    chess,
    generatedSans,
    trace,
    latestState,
    finalAnalysis,
    advantageLock,
    usedForcedFirstTrainedCandidate,
  }) {
    visitedNodes += 1;
    if (visitedNodes > args.maxContinuationSearchNodes) return;

    const addedFromAnchor = generatedSans.length - (parent.variationAnchorSans?.length ?? 0);
    const needsResolution = checkpointNeedsResolution(latestState);
    const overBranchCap = addedFromAnchor > args.maxBranchPliesFromAnchor;
    const overTotalCap = generatedSans.length >= args.maxTotalPlies;
    if ((overBranchCap || overTotalCap) && !needsResolution) return;

    const sideToMove = chess.turn() === "w" ? "white" : "black";
    if (sideToMove === openingColor) {
      const analysis = await analyzeWithRouter(chess.fen(), args, caches);
      const trainedCandidates =
        forcedFirstTrainedCandidate && !usedForcedFirstTrainedCandidate
          ? [forcedFirstTrainedCandidate]
          : trainedMoveCandidates({ chess, analysis, openingColor, args }).slice(0, 1);
      if (trainedCandidates.length === 0 && analysis.bestMove && analysis.bestMove !== "(none)") {
        trainedCandidates.push({
          uci: analysis.bestMove,
          rank: 1,
          evalCp: null,
          bestEvalCp: null,
          evalLossCp: 0,
        });
      }

      for (const trainedCandidate of trainedCandidates) {
        if (!trainedCandidate.uci || trainedCandidate.uci === "(none)") continue;
        const nextChess = new Chess(chess.fen());
        const move = nextChess.move(uciToMoveObject(trainedCandidate.uci));
        if (!move) continue;
        const nextGeneratedSans = [...generatedSans, move.san];
        const nextFinalAnalysis = await analyzeWithRouter(nextChess.fen(), args, caches);
        const trainedEvalCp = perspectiveEvalCp(
          nextFinalAnalysis.lines[0]?.score ?? null,
          nextFinalAnalysis.turnColor,
          openingColor
        );
        const nextTrace = [
          ...trace,
          buildTraceStepForTrained({
            ply: nextGeneratedSans.length,
            san: move.san,
            uci: trainedCandidate.uci,
            analysis,
            trainedEvalCp,
            trainedCandidate,
          }),
        ];
        let nextAdvantageLock = advantageLock;
        const category = branchCategory(parent, triggerMove.san, move.san || "");
        let state = checkpointScore({
          chess: nextChess,
          line: parent,
          analysis: nextFinalAnalysis,
          openingColor,
          branchSansFromAnchor: nextGeneratedSans.slice(parent.variationAnchorSans?.length ?? 0),
          trace: nextTrace,
          category,
          args,
          advantageStartPly: nextAdvantageLock?.startPly ?? null,
        });
        if (
          !nextAdvantageLock &&
          Number.isFinite(state.trainedEvalCp) &&
          state.trainedEvalCp >= args.trainedOpportunityMinEvalCp &&
          state.materialEdgePawns < 1 &&
          !state.visibleMaterialThreat
        ) {
          nextAdvantageLock = {
            startPly: nextGeneratedSans.length,
            startEvalCp: state.trainedEvalCp,
          };
          state = checkpointScore({
            chess: nextChess,
            line: parent,
            analysis: nextFinalAnalysis,
            openingColor,
            branchSansFromAnchor: nextGeneratedSans.slice(parent.variationAnchorSans?.length ?? 0),
            trace: nextTrace,
            category,
            args,
            advantageStartPly: nextAdvantageLock.startPly,
          });
        }

        pushCheckpoint({
          state,
          generatedSans: nextGeneratedSans,
          trace: nextTrace,
          fen: nextChess.fen(),
          analysis: nextFinalAnalysis,
        });

        if (addedFromAnchor >= args.softBranchPliesFromAnchor && !checkpointNeedsResolution(state)) {
          continue;
        }

        await search({
          chess: nextChess,
          generatedSans: nextGeneratedSans,
          trace: nextTrace,
          latestState: state,
          finalAnalysis: nextFinalAnalysis,
          advantageLock: nextAdvantageLock,
          usedForcedFirstTrainedCandidate:
            usedForcedFirstTrainedCandidate || forcedFirstTrainedCandidate === trainedCandidate,
        });
      }
      return;
    }

    const explorer = await fetchExplorerNode(chess.fen(), args, caches.explorer);
    const moves = popularMovesForNode({ explorer, addedPlies: addedFromAnchor, args });
    let candidateMoves = moves;
    if (
      checkpointNeedsResolution(latestState) ||
      (Number.isFinite(latestState?.trainedEvalCp) &&
        latestState.trainedEvalCp >= args.trainedOpportunityMinEvalCp)
    ) {
      const forcedMove = moves[0] ?? (await forcedResolutionMove({ chess, explorer, args, caches }));
      candidateMoves = forcedMove ? [forcedMove] : [];
    } else {
      candidateMoves = moves.slice(0, Math.max(1, Math.floor(args.continuationOpponentCandidateMoves)));
    }

    for (const candidate of candidateMoves) {
      const nextChess = new Chess(chess.fen());
      const applied = nextChess.move(uciToMoveObject(candidate.uci));
      if (!applied) continue;
      await search({
        chess: nextChess,
        generatedSans: [...generatedSans, applied.san],
        trace: [
          ...trace,
          buildTraceStepForOpponent({
            ply: generatedSans.length + 1,
            move: candidate,
            san: applied.san,
            source: candidate.source ?? "lichess-explorer-continuation",
          }),
        ],
        latestState,
        finalAnalysis,
        advantageLock,
        usedForcedFirstTrainedCandidate,
      });
    }
  }

  await search({
    chess: root,
    generatedSans: initialSans,
    trace: initialTrace,
    latestState: null,
    finalAnalysis: beforeAnalysis,
    advantageLock: null,
    usedForcedFirstTrainedCandidate: false,
  });

  if (checkpoints.length === 0) {
    const fallbackAnalysis = await analyzeWithRouter(root.fen(), args, caches);
    const state = checkpointScore({
      chess: root,
      line: parent,
      analysis: fallbackAnalysis,
      openingColor,
      branchSansFromAnchor: initialSans.slice(parent.variationAnchorSans?.length ?? 0),
      trace: initialTrace,
      category: responseCategory,
      args,
    });
    if (allowFallback && checkpointAccepts(state, args, true)) {
      checkpoints.push({
        state,
        generatedSans: initialSans,
        trace: initialTrace,
        fen: root.fen(),
        analysis: fallbackAnalysis,
        fallback: true,
      });
    }
  }

  const variantsByLine = new Map();
  for (const variant of checkpoints.map((checkpoint) => ({
      generatedSans: checkpoint.generatedSans,
      trace: checkpoint.trace,
      stemFen,
      evalBeforeTrigger,
      evalAfterTrigger: checkpoint.state.trainedEvalCp,
      finalFen: checkpoint.fen,
      finalAnalysis: checkpoint.analysis,
      finalState: checkpoint.state,
      fallback: Boolean(checkpoint.fallback || allowFallback),
      trainedOpportunity: forcedFirstTrainedCandidate
        ? {
            firstTrainedUci: forcedFirstTrainedCandidate.uci,
            firstTrainedRank: forcedFirstTrainedCandidate.rank,
            firstTrainedEvalCp: forcedFirstTrainedCandidate.evalCp,
            firstTrainedBestEvalCp: forcedFirstTrainedCandidate.bestEvalCp,
            firstTrainedEvalLossCp: forcedFirstTrainedCandidate.evalLossCp,
            acceptedByOpportunity:
              Number.isFinite(checkpoint.state.trainedEvalCp) &&
              checkpoint.state.trainedEvalCp >= args.trainedOpportunityMinEvalCp,
          }
        : null,
      stopReason: checkpoint.fallback
        ? "Kept as the best available practical fallback branch for this variation."
        : "Stopped at a practical branch checkpoint found by bounded continuation search.",
    }))) {
    const key = variant.generatedSans.join(" ");
    const current = variantsByLine.get(key);
    const currentEval = Number.isFinite(current?.finalState?.trainedEvalCp)
      ? current.finalState.trainedEvalCp
      : Number.NEGATIVE_INFINITY;
    const variantEval = Number.isFinite(variant.finalState?.trainedEvalCp)
      ? variant.finalState.trainedEvalCp
      : Number.NEGATIVE_INFINITY;
    if (
      !current ||
      variantEval > currentEval ||
      (variantEval === currentEval && variant.finalState.score > current.finalState.score)
    ) {
      variantsByLine.set(key, variant);
    }
  }

  return pruneSupersededBranchVariants(Array.from(variantsByLine.values()), args)
    .sort((left, right) => {
      const rightEval = Number.isFinite(right.finalState?.trainedEvalCp) ? right.finalState.trainedEvalCp : -999999;
      const leftEval = Number.isFinite(left.finalState?.trainedEvalCp) ? left.finalState.trainedEvalCp : -999999;
      if (rightEval !== leftEval) return rightEval - leftEval;
      return (right.finalState?.score ?? -999) - (left.finalState?.score ?? -999);
    })
    .slice(0, Math.max(1, Math.floor(args.maxContinuationBranchesPerTrigger)));
}

async function analyzeWithRouter(fen, baseArgs, caches) {
  let engineId =
    baseArgs.cloudEvalMode === "authoritative"
      ? (baseArgs.router.getNextAvailableEngine() ?? "stockfish")
      : null;
  while (true) {
    try {
      return await analyzePosition(fen, { ...baseArgs, lockedEngineId: engineId }, caches);
    } catch (error) {
      if (error instanceof EngineRateLimitedError || error?.code === "ENGINE_RATE_LIMITED") {
        baseArgs.router.markCoolingDown(error.engineId);
        engineId = baseArgs.router.getNextAvailableEngine() ?? "stockfish";
        continue;
      }
      throw error;
    }
  }
}

async function firstTrainedCandidatesForTrigger({ parent, stemSans, trigger, args, caches }) {
  const chess = applySans(stemSans);
  const triggerMove = chess.move(uciToMoveObject(trigger.uci));
  if (!triggerMove) return [];
  const sideToMove = chess.turn() === "w" ? "white" : "black";
  if (sideToMove !== parent.openingColor) return [];
  const analysis = await analyzeWithRouter(chess.fen(), args, caches);
  return trainedMoveCandidates({
    chess,
    analysis,
    openingColor: parent.openingColor,
    args,
  });
}

async function forcedResolutionMove({ chess, explorer, args, caches }) {
  const legalUcis = new Set(chess.moves({ verbose: true }).map(moveToUci));
  const total = explorer.totalGamesAtNode;
  const explorerMove = explorer.topMoves.find((move) => legalUcis.has(move.uci));
  if (explorerMove) {
    const playRate = total > 0 ? explorerMove.totalGames / total : null;
    return {
      ...explorerMove,
      playRate,
      cumulativePlayRate: playRate,
      nodeGames: total,
      source: chess.inCheck()
        ? "lichess-explorer-forced-check-reply"
        : "lichess-explorer-forced-resolution",
    };
  }

  const analysis = await analyzeWithRouter(chess.fen(), args, caches);
  if (!analysis.bestMove || !legalUcis.has(analysis.bestMove)) return null;
  return {
    san: null,
    uci: analysis.bestMove,
    totalGames: null,
    playRate: null,
    cumulativePlayRate: null,
    nodeGames: total,
    source: chess.inCheck() ? "engine-forced-check-reply" : "engine-forced-resolution",
  };
}

async function generateBranchesForParent({ parent, args, caches, existingKeys }) {
  const branches = [];
  const candidates = [];
  const anchorPly = parent.variationAnchorSans?.length ?? parent.generation?.sourcePlies ?? 0;
  const parentBranchLimit = Number.isFinite(args.maxNewBranchesPerVariation)
    ? Math.min(args.maxBranchesPerVariation, args.maxNewBranchesPerVariation)
    : args.maxBranchesPerVariation;

  for (let plyIndex = Math.max(anchorPly, 0); plyIndex < parent.generatedSans.length; plyIndex += 1) {
    if (branches.length + candidates.length >= parentBranchLimit * 3) break;
    const stemSans = parent.generatedSans.slice(0, plyIndex);
    const referenceSan = parent.generatedSans[plyIndex] ?? null;
    const chess = applySans(stemSans);
    const sideToMove = chess.turn() === "w" ? "white" : "black";
    if (sideToMove === parent.openingColor) continue;

    const referenceUci = sanToUciAtPosition(chess.fen(), referenceSan);
    const explorer = await fetchExplorerNode(chess.fen(), args, caches.explorer);
    const moves = popularMovesForNode({
      explorer,
      addedPlies: Math.max(plyIndex - anchorPly, 0),
      args,
    });

    for (const move of moves) {
      const key = `${parent.openingId}::${parent.lineId}::${plyIndex}::${move.uci}`;
      if (existingKeys.has(key)) continue;
      candidates.push({
        ...move,
        referenceSan,
        referenceUci,
        stemSans,
        stemPly: plyIndex,
      });
    }
  }

  let discoveryCutoffPly = null;
  for (const candidate of candidates) {
    if (Number.isFinite(discoveryCutoffPly) && candidate.stemPly > discoveryCutoffPly) break;
    const trainedCandidates = await firstTrainedCandidatesForTrigger({
      parent,
      stemSans: candidate.stemSans,
      trigger: candidate,
      args,
      caches,
    });
    const opportunityBranches = [];
    if (trainedCandidates.length > 1) {
      for (const trainedCandidate of trainedCandidates) {
        const branchVariants = await generateBranchVariantsFromTrigger({
          parent,
          stemSans: candidate.stemSans,
          trigger: candidate,
          args,
          caches,
          allowFallback: false,
          forcedFirstTrainedCandidate: trainedCandidate,
        });
        for (const branch of branchVariants) {
          if (
            Number.isFinite(branch.finalState.trainedEvalCp) &&
            branch.finalState.trainedEvalCp >= args.trainedOpportunityMinEvalCp
          ) {
            opportunityBranches.push(branch);
          }
        }
      }
    }

    if (opportunityBranches.length > 0) {
      for (const branch of opportunityBranches) {
        branches.push(
          buildBranchRecord({
            parent,
            stemSans: candidate.stemSans,
            trigger: candidate,
            branch,
            finalState: branch.finalState,
            args,
          })
        );
      }
      discoveryCutoffPly = candidate.stemPly;
      continue;
    }

    const branchVariants = await generateBranchVariantsFromTrigger({
      parent,
      stemSans: candidate.stemSans,
      trigger: candidate,
      args,
      caches,
      allowFallback: false,
    });
    for (const branch of branchVariants) {
      branches.push(
        buildBranchRecord({
          parent,
          stemSans: candidate.stemSans,
          trigger: candidate,
          branch,
          finalState: branch.finalState,
          args,
        })
      );
    }
    if (branchVariants.some(
      (branch) =>
        Number.isFinite(branch.finalState.trainedEvalCp) &&
        branch.finalState.trainedEvalCp >= args.trainedOpportunityMinEvalCp
    )) {
      discoveryCutoffPly = candidate.stemPly;
    }
  }

  if (branches.length < args.minBranchesPerVariation && candidates.length > 0) {
    for (const candidate of candidates) {
      if (branches.length >= args.minBranchesPerVariation) break;
      const branchVariants = await generateBranchVariantsFromTrigger({
        parent,
        stemSans: candidate.stemSans,
        trigger: candidate,
        args,
        caches,
        allowFallback: true,
      });
      const branch = branchVariants[0];
      if (!branch) continue;
      branches.push(
        buildBranchRecord({
          parent,
          stemSans: candidate.stemSans,
          trigger: candidate,
          branch,
          finalState: branch.finalState,
          args,
        })
      );
    }
  }

  return dedupeBranches(branches)
    .sort(compareBranchesForSelection)
    .slice(0, parentBranchLimit);
}

function dedupeBranches(branches) {
  const byKey = new Map();
  for (const branch of branches) {
    const key = branch.generatedSans.join(" ");
    const current = byKey.get(key);
    if (!current || compareBranchesForSelection(branch, current) < 0) {
      byKey.set(key, branch);
    }
  }
  return Array.from(byKey.values());
}

function compareBranchesForSelection(left, right) {
  const rightEval = Number.isFinite(right.finalEvalCp) ? right.finalEvalCp : -999999;
  const leftEval = Number.isFinite(left.finalEvalCp) ? left.finalEvalCp : -999999;
  if (rightEval !== leftEval) return rightEval - leftEval;
  return (right.branchScore ?? -999) - (left.branchScore ?? -999);
}

function compareLinesForOutput(left, right) {
  if (left.openingId !== right.openingId) return String(left.openingId).localeCompare(String(right.openingId));
  const leftIsBranch = left.lineType === "practical_branch";
  const rightIsBranch = right.lineType === "practical_branch";
  if (leftIsBranch !== rightIsBranch) return leftIsBranch ? 1 : -1;
  return String(left.fullName).localeCompare(String(right.fullName));
}

function groupOpenings(referencePayload, results) {
  const existingBySlug = new Map((referencePayload.openings ?? []).map((opening) => [opening.openingId, opening]));
  const grouped = new Map();
  for (const line of results) {
    if (!grouped.has(line.openingId)) {
      const sourceOpening = existingBySlug.get(line.openingId);
      grouped.set(line.openingId, {
        openingId: line.openingId,
        openingName: line.openingName,
        ecoCodes: new Set(sourceOpening?.ecoCodes ?? []),
        sourceNames: new Set(sourceOpening?.sourceNames ?? []),
        openingDifficulty: sourceOpening?.openingDifficulty ?? "beginner",
        openingDifficultyConfidence: sourceOpening?.openingDifficultyConfidence ?? "medium",
        openingDifficultySource: sourceOpening?.openingDifficultySource ?? "Inherited from reference lines.",
        popularitySource: sourceOpening?.popularitySource ?? null,
        popularityScore: sourceOpening?.popularityScore ?? null,
        popularityGames: sourceOpening?.popularityGames ?? null,
        popularityRank: sourceOpening?.popularityRank ?? null,
        lines: [],
      });
    }
    const opening = grouped.get(line.openingId);
    if (line.ecoCode) opening.ecoCodes.add(line.ecoCode);
    if (line.sourceName) opening.sourceNames.add(line.sourceName);
    opening.lines.push(line);
  }
  return Array.from(grouped.values()).map((opening) => {
    const lines = opening.lines.sort(compareLinesForOutput);
    return {
      openingId: opening.openingId,
      openingName: opening.openingName,
      ecoCodes: Array.from(opening.ecoCodes).sort(),
      sourceNames: Array.from(opening.sourceNames).sort(),
      openingDifficulty: opening.openingDifficulty,
      openingDifficultyConfidence: opening.openingDifficultyConfidence,
      openingDifficultySource: opening.openingDifficultySource,
      popularitySource: opening.popularitySource,
      popularityScore: opening.popularityScore,
      popularityGames: opening.popularityGames,
      popularityRank: opening.popularityRank,
      lineCount: lines.length,
      lines,
    };
  });
}

function branchKeyFromLine(line) {
  const branch = line.generation?.branch;
  if (branch?.branchKey) return branch.branchKey;
  if (!line.parentLineId || line.lessonStemPly == null || !line.triggerMoveUci) return null;
  return `${line.openingId}::${line.parentLineId}::${line.lessonStemPly}::${line.triggerMoveUci}`;
}

function parentLineIdFromBranch(line) {
  return line.parentLineId ?? line.generation?.branch?.parentLineId ?? null;
}

function countBranchesByParent(lines) {
  const counts = new Map();
  for (const line of lines) {
    if (line.lineType !== "practical_branch") continue;
    const parentLineId = parentLineIdFromBranch(line);
    if (!parentLineId) continue;
    counts.set(parentLineId, (counts.get(parentLineId) ?? 0) + 1);
  }
  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  args.router = new CloudEvalRouter({ cooldownMs: args.cloudEngineCooldownMs });
  const referencePayload = readJson(args.input);
  if (referencePayload.status !== "complete") {
    throw new Error(`Reference input must be complete. Current status: ${referencePayload.status ?? "missing"}`);
  }

  const references = (referencePayload.results ?? []).filter(
    (line) => Array.isArray(line.generatedSans) && line.lineType !== "practical_branch"
  );
  const scopedReferences = args.parentLineSlugs
    ? references.filter((line) => args.parentLineSlugs.has(line.lineId ?? slugify(line.fullName)))
    : references;
  const selectedReferences = Number.isFinite(args.limitReferences)
    ? scopedReferences.slice(0, args.limitReferences)
    : scopedReferences;
  if (args.parentLineSlugs && selectedReferences.length !== args.parentLineSlugs.size) {
    const found = new Set(selectedReferences.map((line) => line.lineId ?? slugify(line.fullName)));
    const missing = Array.from(args.parentLineSlugs).filter((slug) => !found.has(slug));
    throw new Error(`Missing parent reference line(s): ${missing.join(", ")}`);
  }
  const existingBranches = (referencePayload.results ?? []).filter((line) => line.lineType === "practical_branch");
  const existingBranchKeys = new Set(existingBranches.map(branchKeyFromLine).filter(Boolean));
  const existingBranchCountsByParent = countBranchesByParent(existingBranches);
  const targetBranchesPerVariation =
    args.targetBranchesPerVariation ??
    args.onlyUnderBranchCount ??
    args.maxBranchesPerVariation;
  const caches = {
    analysis: new Map(),
    explorer: new Map(),
    bestEval: loadJsonObject(args.bestEvalCache),
  };
  const generatedBranches = [];

  for (const [index, parent] of selectedReferences.entries()) {
    const parentLineId = parent.lineId ?? slugify(parent.fullName);
    const existingCount = existingBranchCountsByParent.get(parentLineId) ?? 0;
    if (
      Number.isFinite(args.onlyUnderBranchCount) &&
      existingCount >= args.onlyUnderBranchCount
    ) {
      console.log(
        `[${index + 1}/${selectedReferences.length}] ${parent.fullName}: skipped (${existingCount} existing branch(es))`
      );
      continue;
    }

    const neededCount = Math.max(targetBranchesPerVariation - existingCount, 0);
    if (neededCount <= 0) {
      console.log(
        `[${index + 1}/${selectedReferences.length}] ${parent.fullName}: skipped (${existingCount} existing branch(es))`
      );
      continue;
    }

    const generationArgs = {
      ...args,
      maxNewBranchesPerVariation: Number.isFinite(args.maxNewBranchesPerVariation)
        ? Math.min(args.maxNewBranchesPerVariation, neededCount)
        : neededCount,
    };
    const branches = await generateBranchesForParent({
      parent,
      args: generationArgs,
      caches,
      existingKeys: existingBranchKeys,
    });
    for (const branch of branches) {
      const key = branchKeyFromLine(branch);
      if (key) existingBranchKeys.add(key);
    }
    generatedBranches.push(...branches);
    console.log(
      `[${index + 1}/${selectedReferences.length}] ${parent.fullName}: ` +
        `${branches.length} new branch(es), ${existingCount} existing`
    );
  }

  const combinedBranches = dedupeBranches([...existingBranches, ...generatedBranches]);
  const results = [...references, ...combinedBranches].sort(compareLinesForOutput);
  const openings = groupOpenings(referencePayload, results);
  const output = {
    ...referencePayload,
    generatedAt: new Date().toISOString(),
    status: "complete",
    source: {
      ...(referencePayload.source ?? {}),
      branchGeneration:
        "Lichess Explorer human-popular opponent tree with trained-side engine ladder responses.",
    },
    config: {
      ...(referencePayload.config ?? {}),
      branchGeneration: {
        input: args.input,
        minNodeGames: args.minNodeGames,
        minMoveGames: args.minMoveGames,
        minMoveShare: args.minMoveShare,
        individualMoveShareNearAnchor: args.individualMoveShareNearAnchor,
        individualMoveShareMidline: args.individualMoveShareMidline,
        individualMoveShareDeep: args.individualMoveShareDeep,
        continuationOpponentCandidateMoves: args.continuationOpponentCandidateMoves,
        maxContinuationBranchesPerTrigger: args.maxContinuationBranchesPerTrigger,
        maxContinuationSearchNodes: args.maxContinuationSearchNodes,
        maxBranchesPerVariation: args.maxBranchesPerVariation,
        trainedCandidateMoves: args.trainedCandidateMoves,
        trainedCandidateMaxLossCp: args.trainedCandidateMaxLossCp,
        trainedOpportunityMinEvalCp: args.trainedOpportunityMinEvalCp,
        advantageResolutionMinPlies: args.advantageResolutionMinPlies,
        parentLineSlugs: args.parentLineSlugs ? Array.from(args.parentLineSlugs) : null,
        onlyUnderBranchCount: args.onlyUnderBranchCount,
        targetBranchesPerVariation,
        maxNewBranchesPerVariation: args.maxNewBranchesPerVariation,
        minBranchesPerVariation: args.minBranchesPerVariation,
        maxBranchPliesFromAnchor: args.maxBranchPliesFromAnchor,
        cloudEvalMode: args.cloudEvalMode,
        stockfishDepth: args.stockfishDepth,
        stockfishEngine: args.stockfishEngine,
      },
    },
    count: results.length,
    referenceCount: references.length,
    branchCount: combinedBranches.length,
    openingCount: openings.length,
    openings,
    results,
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${generatedBranches.length} new practical branch line(s) to ${args.output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
