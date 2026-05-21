#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = path.resolve(
  __dirname,
  "output",
  "generated-opening-branches.json"
);
function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    output: null,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--input") {
      args.input = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--output") {
      args.output = path.resolve(argv[index + 1]);
      index += 1;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  args.output = args.output ?? args.input;
  return args;
}

function lineScore(line) {
  return Number(line.branchScore ?? line.generation?.branch?.branchScore ?? -999999);
}

function finalTrainedEvalCp(line) {
  return Number(
    line.finalTrainedEvalCp ??
    line.generation?.branch?.finalTrainedEvalCp ??
    line.generation?.branch?.selectionMetadata?.finalState?.trainedEvalCp ??
    -999999
  );
}

function linePlayRate(line) {
  return Number(
    line.playRate ??
    line.popularityScore ??
    line.triggerMovePopularity ??
    line.generation?.branch?.playRate ??
    line.generation?.branch?.triggerMovePopularity ??
    0
  );
}

function lineNodeGames(line) {
  return Number(
    line.nodeGames ??
    line.gamesAtNode ??
    line.generation?.branch?.nodeGames ??
    line.generation?.branch?.gamesAtNode ??
    0
  );
}

function isPayoffCap(line) {
  const fallbackKind =
    line.generation?.branch?.selectionMetadata?.fallbackKind ??
    line.generation?.branch?.selection?.fallbackKind ??
    null;
  const reason =
    line.stopReason ??
    line.generation?.branch?.stopReason ??
    line.generation?.branch?.selection?.stopReason ??
    line.generation?.branch?.continuationTrace?.slice(-1)?.[0]?.stopReason ??
    "";
  return fallbackKind === "payoff_cap" || String(reason).includes("payoff_cap");
}

function branchKey(line) {
  return (
    line.generation?.branch?.branchKey ??
    (line.parentLineId && line.lessonStemPly != null && line.triggerMoveUci
      ? `${line.openingId}::${line.parentLineId}::${line.lessonStemPly}::${line.triggerMoveUci}`
      : null)
  );
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function collapseRepeatedTrailingParentheticals(value) {
  let current = String(value ?? "");
  while (true) {
    const match = current.match(/^(.*?)(\s\([^)]+\))\2$/);
    if (!match) return current;
    current = `${match[1]}${match[2]}`;
  }
}

function isStrictSanPrefix(prefixSans, fullSans) {
  if (!Array.isArray(prefixSans) || !Array.isArray(fullSans)) return false;
  if (prefixSans.length >= fullSans.length) return false;
  return prefixSans.every((san, index) => san === fullSans[index]);
}

function parentLineId(line) {
  return line.parentLineId ?? line.generation?.branch?.parentLineId ?? null;
}

function branchNameSuffix(line, tailSize = 2) {
  const trace = line.generation?.branch?.continuationTrace ?? line.generation?.extension ?? [];
  const traceTail = trace
    .map((step) => step?.san)
    .filter(Boolean)
    .slice(-tailSize)
    .join(" ");
  if (traceTail) return traceTail;
  return line.generatedSans?.slice(-tailSize).join(" ") || line.lineId?.slice(-8) || "alternate";
}

function prunePrefixBranches(branches) {
  return branches.filter((branch) => {
    const branchParentLineId = parentLineId(branch);
    return !branches.some((other) => {
      if (other === branch) return false;
      if (branch.openingId !== other.openingId) return false;
      if (branchParentLineId !== parentLineId(other)) return false;
      return isStrictSanPrefix(branch.generatedSans, other.generatedSans);
    });
  });
}

function mateEquivalentDiffIndex(leftSans, rightSans) {
  if (!Array.isArray(leftSans) || !Array.isArray(rightSans)) return -1;
  if (leftSans.length !== rightSans.length || leftSans.length < 3) return -1;
  if (leftSans[leftSans.length - 1] !== rightSans[rightSans.length - 1]) return -1;
  if (!String(leftSans[leftSans.length - 1]).endsWith("#")) return -1;

  let diffIndex = -1;
  for (let index = 0; index < leftSans.length; index += 1) {
    if (leftSans[index] === rightSans[index]) continue;
    if (diffIndex !== -1) return -1;
    diffIndex = index;
  }

  if (diffIndex === -1) return -1;
  if (diffIndex < leftSans.length - 3) return -1;
  if (!String(leftSans[diffIndex]).endsWith("+")) return -1;
  if (!String(rightSans[diffIndex]).endsWith("+")) return -1;
  return diffIndex;
}

function isMateEquivalentBranch(left, right) {
  if (left.openingId !== right.openingId) return false;
  if (parentLineId(left) !== parentLineId(right)) return false;
  return mateEquivalentDiffIndex(left.generatedSans, right.generatedSans) !== -1;
}

function compareBranchRetention(left, right) {
  const leftClean = isPayoffCap(left) ? 0 : 1;
  const rightClean = isPayoffCap(right) ? 0 : 1;
  if (leftClean !== rightClean) return rightClean - leftClean;

  const scoreDelta = lineScore(right) - lineScore(left);
  if (scoreDelta !== 0) return scoreDelta;

  const playRateDelta = linePlayRate(right) - linePlayRate(left);
  if (playRateDelta !== 0) return playRateDelta;

  const gamesDelta = lineNodeGames(right) - lineNodeGames(left);
  if (gamesDelta !== 0) return gamesDelta;

  const leftKey = left.generatedSans?.join(" ") ?? left.lineId ?? "";
  const rightKey = right.generatedSans?.join(" ") ?? right.lineId ?? "";
  return leftKey.localeCompare(rightKey);
}

function pruneMateEquivalentBranches(branches) {
  const kept = [];

  for (const branch of branches) {
    const duplicateIndex = kept.findIndex((other) => isMateEquivalentBranch(branch, other));
    if (duplicateIndex === -1) {
      kept.push(branch);
      continue;
    }

    const current = kept[duplicateIndex];
    if (compareBranchRetention(current, branch) > 0) {
      kept[duplicateIndex] = branch;
    }
  }

  return kept;
}

function continuationTrace(line) {
  return line.generation?.branch?.continuationTrace ?? line.generation?.extension ?? [];
}

function trainedTraceStepAt(line, index) {
  return continuationTrace(line).find((step) => {
    if (step?.side !== "trained") return false;
    if (step?.san !== line.generatedSans?.[index]) return false;
    return Number.isInteger(step.ply) ? step.ply - 1 === index : false;
  });
}

function hasSamePrefixBefore(leftSans, rightSans, index) {
  if (!Array.isArray(leftSans) || !Array.isArray(rightSans)) return false;
  if (leftSans.length <= index || rightSans.length <= index) return false;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (leftSans[cursor] !== rightSans[cursor]) return false;
  }
  return true;
}

function trainedChoices(line) {
  const choices = [];
  for (const step of continuationTrace(line)) {
    if (step?.side !== "trained") continue;
    const index = Number.isInteger(step.ply) ? step.ply - 1 : -1;
    if (index < 0 || line.generatedSans?.[index] !== step.san) continue;
    choices.push({
      index,
      step,
      rank: Number(step.engineRank ?? 999999),
      evalLossCp: Number(step.engineEvalLossCp ?? 999999),
    });
  }
  return choices;
}

function isComparableTrainedAlternative(branch, other, choice) {
  if (branch === other) return false;
  if (branch.openingId !== other.openingId) return false;
  if (parentLineId(branch) !== parentLineId(other)) return false;
  if (!hasSamePrefixBefore(branch.generatedSans, other.generatedSans, choice.index)) return false;
  if (branch.generatedSans[choice.index] === other.generatedSans[choice.index]) return false;

  const otherStep = trainedTraceStepAt(other, choice.index);
  return otherStep?.side === "trained";
}

function isDominatedByComparableTrainedAlternative(branch, choice, other) {
  const branchEval = finalTrainedEvalCp(branch);
  const otherEval = finalTrainedEvalCp(other);
  if (!Number.isFinite(branchEval) || !Number.isFinite(otherEval)) return false;
  if (otherEval > branchEval) return true;
  if (otherEval < branchEval) return false;

  const otherStep = trainedTraceStepAt(other, choice.index);
  const otherRank = Number(otherStep?.engineRank ?? 999999);
  if (otherRank !== choice.rank) return otherRank < choice.rank;

  const otherLoss = Number(otherStep?.engineEvalLossCp ?? 999999);
  if (otherLoss !== choice.evalLossCp) return otherLoss < choice.evalLossCp;

  return false;
}

function pruneInferiorTrainedDeviations(branches) {
  return branches.filter((branch) => {
    for (const choice of trainedChoices(branch)) {
      const alternatives = branches.filter((other) =>
        isComparableTrainedAlternative(branch, other, choice)
      );
      if (alternatives.some((other) => isDominatedByComparableTrainedAlternative(branch, choice, other))) {
        return false;
      }
    }

    return true;
  });
}

function normalizedFinalFen(line) {
  const fen = line.finalFen ?? line.generation?.branch?.finalFen ?? null;
  if (!fen) return null;
  return String(fen).split(/\s+/).slice(0, 4).join(" ");
}

function firstDifferingIndex(leftSans, rightSans) {
  if (!Array.isArray(leftSans) || !Array.isArray(rightSans)) return -1;
  const limit = Math.min(leftSans.length, rightSans.length);
  for (let index = 0; index < limit; index += 1) {
    if (leftSans[index] !== rightSans[index]) return index;
  }
  return leftSans.length === rightSans.length ? -1 : limit;
}

function trainedStepQuality(line, index) {
  const step = trainedTraceStepAt(line, index);
  if (!step) {
    return {
      hasStep: 0,
      rank: 999999,
      evalLossCp: 999999,
    };
  }
  return {
    hasStep: 1,
    rank: Number(step.engineRank ?? 999999),
    evalLossCp: Number(step.engineEvalLossCp ?? 999999),
  };
}

function compareTransposedBranchRetention(left, right) {
  const diffIndex = firstDifferingIndex(left.generatedSans, right.generatedSans);
  if (diffIndex >= 0) {
    const leftQuality = trainedStepQuality(left, diffIndex);
    const rightQuality = trainedStepQuality(right, diffIndex);
    if (leftQuality.hasStep !== rightQuality.hasStep) return rightQuality.hasStep - leftQuality.hasStep;
    if (leftQuality.rank !== rightQuality.rank) return leftQuality.rank - rightQuality.rank;
    if (leftQuality.evalLossCp !== rightQuality.evalLossCp) return leftQuality.evalLossCp - rightQuality.evalLossCp;
  }

  const evalDelta = finalTrainedEvalCp(right) - finalTrainedEvalCp(left);
  if (evalDelta !== 0) return evalDelta;

  const retentionDelta = compareBranchRetention(left, right);
  if (retentionDelta !== 0) return retentionDelta;

  const leftKey = left.generatedSans?.join(" ") ?? left.lineId ?? "";
  const rightKey = right.generatedSans?.join(" ") ?? right.lineId ?? "";
  return leftKey.localeCompare(rightKey);
}

function pruneTransposedFinalFenBranches(branches) {
  const kept = [];

  for (const branch of branches) {
    const branchFinalFen = normalizedFinalFen(branch);
    if (!branchFinalFen) {
      kept.push(branch);
      continue;
    }

    const duplicateIndex = kept.findIndex((other) => {
      return (
        branch.openingId === other.openingId &&
        parentLineId(branch) === parentLineId(other) &&
        normalizedFinalFen(other) === branchFinalFen
      );
    });

    if (duplicateIndex === -1) {
      kept.push(branch);
      continue;
    }

    const current = kept[duplicateIndex];
    if (compareTransposedBranchRetention(current, branch) > 0) {
      kept[duplicateIndex] = branch;
    }
  }

  return kept;
}

function withUniqueBranchNames(branches) {
  const groups = new Map();
  for (const branch of branches) {
    const branchParentLineId = parentLineId(branch);
    if (!branchParentLineId || !branch.lineName) continue;
    const baseLineName = collapseRepeatedTrailingParentheticals(branch.lineName);
    const key = `${branchParentLineId}::${normalizeText(baseLineName)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(branch);
  }

  const renamed = new Map();
  for (const group of groups.values()) {
    if (group.length <= 1) continue;

    for (let tailSize = 2; tailSize <= 6; tailSize += 1) {
      const candidates = group.map((branch) => {
        const baseLineName = collapseRepeatedTrailingParentheticals(branch.lineName);
        return `${baseLineName} (${branchNameSuffix(branch, tailSize)})`;
      });
      if (new Set(candidates.map(normalizeText)).size !== candidates.length) continue;
      for (let index = 0; index < group.length; index += 1) {
        renamed.set(group[index], candidates[index]);
      }
      break;
    }

    for (const branch of group) {
      if (renamed.has(branch)) continue;
      const baseLineName = collapseRepeatedTrailingParentheticals(branch.lineName);
      const stableSuffix = branch.lineId?.slice(-8) || branch.generatedSans?.slice(-4).join(" ") || "alternate";
      renamed.set(branch, `${baseLineName} (${stableSuffix})`);
    }
  }

  return branches.map((branch) => {
    const branchParentLineId = parentLineId(branch);
    if (!branchParentLineId || !branch.lineName) return branch;
    const lineName = renamed.get(branch);
    if (!lineName) return branch;

    const parentName = branch.fullName.includes(": ")
      ? branch.fullName.split(": ").slice(0, -1).join(": ")
      : branch.fullName;
    const fullName = `${parentName}: ${lineName}`;
    return {
      ...branch,
      lineName,
      fullName,
      lineDisplayName: fullName,
      generation: {
        ...(branch.generation ?? {}),
        branch: {
          ...(branch.generation?.branch ?? {}),
          lessonTitle: lineName,
        },
      },
    };
  });
}

function dedupeLines(lines) {
  const references = lines.filter((line) => line.lineType !== "practical_branch");
  const branches = lines.filter((line) => line.lineType === "practical_branch");
  const grouped = new Map();

  for (const branch of branches) {
    const key = branchKey(branch) ?? branch.generatedSans?.join(" ");
    const current = grouped.get(key);
    if (!current || lineScore(branch) > lineScore(current)) {
      grouped.set(key, branch);
    }
  }

  const bySans = new Map();
  for (const branch of grouped.values()) {
    const key = branch.generatedSans?.join(" ");
    const current = bySans.get(key);
    if (!current || lineScore(branch) > lineScore(current)) {
      bySans.set(key, branch);
    }
  }

  const prefixPruned = prunePrefixBranches(Array.from(bySans.values()));
  const matePruned = pruneMateEquivalentBranches(prefixPruned);
  const deviationPruned = pruneInferiorTrainedDeviations(matePruned);
  const transpositionPruned = pruneTransposedFinalFenBranches(deviationPruned);
  const finalBranches = withUniqueBranchNames(transpositionPruned);

  return {
    references,
    branches: finalBranches,
    removed: branches.length - finalBranches.length,
  };
}

function groupOpenings(payload, results) {
  const grouped = new Map();
  for (const line of results) {
    if (!grouped.has(line.openingId)) {
      const source = (payload.openings ?? []).find((opening) => opening.openingId === line.openingId);
      grouped.set(line.openingId, {
        ...(source ?? {
          openingId: line.openingId,
          openingName: line.openingName,
          ecoCodes: [],
          sourceNames: [],
          openingDifficulty: "beginner",
          openingDifficultyConfidence: "medium",
          openingDifficultySource: "Inherited from generated lines.",
          popularitySource: null,
          popularityScore: null,
          popularityGames: null,
          popularityRank: null,
        }),
        lines: [],
      });
    }

    grouped.get(line.openingId).lines.push(line);
  }

  return Array.from(grouped.values()).map((opening) => ({
    ...opening,
    lineCount: opening.lines.length,
    lines: opening.lines,
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const results = Array.isArray(payload.results) ? payload.results : [];
  const { references, branches, removed } = dedupeLines(results);
  const dedupedResults = [...references, ...branches];
  const output = {
    ...payload,
    generatedAt: new Date().toISOString(),
    count: dedupedResults.length,
    referenceCount: references.length,
    branchCount: branches.length,
    openingCount: new Set(dedupedResults.map((line) => line.openingId)).size,
    openings: groupOpenings(payload, dedupedResults),
    results: dedupedResults,
  };

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          input: args.input,
          references: references.length,
          branchesBefore: results.length - references.length,
          branchesAfter: branches.length,
          removed,
        },
        null,
        2
      )
    );
    return;
  }

  fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Deduped opening branches: removed ${removed}, wrote ${args.output}`);
}

main();
