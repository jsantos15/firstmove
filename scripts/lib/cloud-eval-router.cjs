const { fetchLichessCloudEval } = require("./lichess-cloud-eval.cjs");
const { fetchChessApiEval } = require("./chess-api-eval.cjs");

const ENGINE_IDS = ["lichess", "chess-api"];

const DEFAULT_COOLDOWNS = {
  lichess: 30 * 60 * 1000,
  "chess-api": 30 * 60 * 1000,
};

class EngineRateLimitedError extends Error {
  constructor(engineId) {
    super(`Engine "${engineId}" is rate limited`);
    this.code = "ENGINE_RATE_LIMITED";
    this.engineId = engineId;
  }
}

class CloudEvalRouter {
  constructor(options = {}) {
    this._cooldowns = {};
    this._cooledAt = {};

    for (const id of ENGINE_IDS) {
      this._cooldowns[id] = options[`${id.replace("-", "")}CooldownMs`]
        ?? options.cooldownMs
        ?? DEFAULT_COOLDOWNS[id];
    }
  }

  get engineIds() {
    return ENGINE_IDS;
  }

  isCoolingDown(engineId) {
    const cooledAt = this._cooledAt[engineId];
    if (!cooledAt) return false;
    return Date.now() - cooledAt < this._cooldowns[engineId];
  }

  markCoolingDown(engineId) {
    this._cooledAt[engineId] = Date.now();
    const cooldownMin = Math.round(this._cooldowns[engineId] / 60000);
    console.warn(
      `[router] Engine "${engineId}" marked cooling — will retry after ${cooldownMin} min.`
    );
  }

  getNextAvailableEngine(afterEngineId = null) {
    let start = 0;
    if (afterEngineId != null) {
      const idx = ENGINE_IDS.indexOf(afterEngineId);
      start = idx >= 0 ? idx + 1 : 0;
    }
    for (let i = start; i < ENGINE_IDS.length; i++) {
      if (!this.isCoolingDown(ENGINE_IDS[i])) {
        return ENGINE_IDS[i];
      }
    }
    return null;
  }

  allCoolingDown() {
    return ENGINE_IDS.every((id) => this.isCoolingDown(id));
  }

  async fetch(engineId, fen, engineOptions = {}) {
    try {
      let result;

      if (engineId === "lichess") {
        result = await fetchLichessCloudEval(fen, engineOptions.lichess ?? {});
      } else if (engineId === "chess-api") {
        result = await fetchChessApiEval(fen, engineOptions.chessApi ?? {});
      } else {
        throw new Error(`Unknown engine id: "${engineId}"`);
      }

      return result;
    } catch (error) {
      if (error?.status === 429) {
        throw new EngineRateLimitedError(engineId);
      }
      throw error;
    }
  }

  statusSummary() {
    return ENGINE_IDS.map((id) => {
      if (!this.isCoolingDown(id)) return `${id}:ready`;
      const remainMs = this._cooldowns[id] - (Date.now() - this._cooledAt[id]);
      const remainMin = Math.ceil(remainMs / 60000);
      return `${id}:cooling(${remainMin}m)`;
    }).join(", ");
  }
}

module.exports = { CloudEvalRouter, EngineRateLimitedError, ENGINE_IDS };
