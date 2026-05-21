#!/usr/bin/env node

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const dedupScript = path.join(__dirname, "dedup-opening-branches.cjs");

function makeBranch({ id, moveAtDecision, rank, loss, finalEval }) {
  const prefix = ["e4", "e5", "Nf3", "Nc6"];
  const generatedSans =
    moveAtDecision === "Ne1"
      ? [...prefix, "Ne1", "a6", "Bxc6", "bxc6", "Rc1"]
      : [...prefix, "Bxc6", "bxc6", "Ne1", "Rb8", "Nd3"];

  return {
    openingId: "italian-game",
    openingName: "Italian Game",
    lineType: "practical_branch",
    lineId: id,
    lineName: id,
    fullName: `Italian Game: Test: ${id}`,
    parentLineId: "italian-game-classical-variation-greco-gambit-anderssen-variation",
    generatedSans,
    finalTrainedEvalCp: finalEval,
    branchScore: finalEval,
    generation: {
      branch: {
        parentLineId: "italian-game-classical-variation-greco-gambit-anderssen-variation",
        finalTrainedEvalCp: finalEval,
        continuationTrace: [
          {
            ply: 5,
            side: "trained",
            san: moveAtDecision,
            engineRank: rank,
            engineEvalLossCp: loss,
            trainedEvalCp: finalEval,
          },
        ],
      },
    },
  };
}

function runDedup(payload) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "firstmove-branch-dedup-"));
  const input = path.join(tempDir, "input.json");
  const output = path.join(tempDir, "output.json");
  fs.writeFileSync(input, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  try {
    execFileSync(process.execPath, [dedupScript, "--input", input, "--output", output], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    return JSON.parse(fs.readFileSync(output, "utf8"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("dedup keeps the better completed trained alternative, even when it is non-top", () => {
  const payload = {
    status: "complete",
    openings: [],
    results: [
      makeBranch({ id: "rank-1-lower-final-eval", moveAtDecision: "Bxc6", rank: 1, loss: 0, finalEval: 201 }),
      makeBranch({ id: "rank-2-higher-final-eval", moveAtDecision: "Ne1", rank: 2, loss: 11, finalEval: 226 }),
    ],
  };

  const output = runDedup(payload);
  const branches = output.results.filter((line) => line.lineType === "practical_branch");

  assert.equal(branches.length, 1);
  assert.equal(branches[0].lineId, "rank-2-higher-final-eval");
});

test("dedup uses engine rank as the tie-breaker for equal completed evals", () => {
  const payload = {
    status: "complete",
    openings: [],
    results: [
      makeBranch({ id: "rank-1-equal-final-eval", moveAtDecision: "Bxc6", rank: 1, loss: 0, finalEval: 226 }),
      makeBranch({ id: "rank-2-equal-final-eval", moveAtDecision: "Ne1", rank: 2, loss: 11, finalEval: 226 }),
    ],
  };

  const output = runDedup(payload);
  const branches = output.results.filter((line) => line.lineType === "practical_branch");

  assert.equal(branches.length, 1);
  assert.equal(branches[0].lineId, "rank-1-equal-final-eval");
});

console.log("Opening branch dedup tests passed.");
