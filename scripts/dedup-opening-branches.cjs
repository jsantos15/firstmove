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

function isStrictSanPrefix(prefixSans, fullSans) {
  if (!Array.isArray(prefixSans) || !Array.isArray(fullSans)) return false;
  if (prefixSans.length >= fullSans.length) return false;
  return prefixSans.every((san, index) => san === fullSans[index]);
}

function parentLineId(line) {
  return line.parentLineId ?? line.generation?.branch?.parentLineId ?? null;
}

function branchNameSuffix(line) {
  const trace = line.generation?.branch?.continuationTrace ?? line.generation?.extension ?? [];
  const traceTail = trace
    .map((step) => step?.san)
    .filter(Boolean)
    .slice(-2)
    .join(" ");
  if (traceTail) return traceTail;
  return line.generatedSans?.slice(-2).join(" ") || line.lineId?.slice(-8) || "alternate";
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

function withUniqueBranchNames(branches) {
  const counts = new Map();
  for (const branch of branches) {
    const branchParentLineId = parentLineId(branch);
    if (!branchParentLineId || !branch.lineName) continue;
    const key = `${branchParentLineId}::${normalizeText(branch.lineName)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return branches.map((branch) => {
    const branchParentLineId = parentLineId(branch);
    if (!branchParentLineId || !branch.lineName) return branch;
    const key = `${branchParentLineId}::${normalizeText(branch.lineName)}`;
    if ((counts.get(key) ?? 0) <= 1) return branch;

    const lineName = `${branch.lineName} (${branchNameSuffix(branch)})`;
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
  const finalBranches = withUniqueBranchNames(matePruned);

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
