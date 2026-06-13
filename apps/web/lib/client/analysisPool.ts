const WORKER_SCRIPT = '/stockfish/stockfish-17.1-lite-single-03e3232.js';
const MULTIPV_COUNT = 3;
const MATE_SCORE_CP = 100_000;

export type FenAnalysisLine = {
  multipv: number;
  evalCp: number | undefined;
  bestMoveUci: string | undefined;
  pv: string[];
  depth: number;
};

export type FenAnalysisResult = {
  fen: string;
  bestMoveUci: string | undefined;
  evalCp: number | undefined;
  lines: FenAnalysisLine[];
  pv: string[];
};

type Pending = {
  resolve: (r: FenAnalysisResult) => void;
  reject: (e: Error) => void;
  fen: string;
  latestByMultipv: Map<number, {
    depth: number;
    scoreType: 'cp' | 'mate';
    scoreValue: number;
    bestMoveUci: string | undefined;
    pv: string[];
  }>;
};

function toWhiteEvalCp(scoreType: 'cp' | 'mate', scoreValue: number, fen: string): number {
  const sideMultiplier = fen.split(/\s+/)[1] === 'b' ? -1 : 1;
  if (scoreType === 'cp') return scoreValue * sideMultiplier;
  const mateScore = Math.sign(scoreValue) * (MATE_SCORE_CP - Math.min(Math.abs(scoreValue), 999));
  return mateScore * sideMultiplier;
}

export class AnalysisWorkerPool {
  private workers: Worker[] = [];
  private pendingMap = new Map<Worker, Pending | null>();
  private taskQueue: Array<() => void> = [];
  terminated = false;

  private constructor() {}

  static async create(count: number): Promise<AnalysisWorkerPool> {
    const pool = new AnalysisWorkerPool();
    const inits: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      const worker = new Worker(WORKER_SCRIPT);
      pool.workers.push(worker);
      pool.pendingMap.set(worker, null);
      worker.onmessage = (e: MessageEvent) => pool.handleMessage(worker, e);

      inits.push(new Promise<void>(resolve => {
        function onInit(e: MessageEvent) {
          const line = typeof e.data === 'string' ? e.data : String(e.data);
          if (line === 'uciok') worker.postMessage('isready');
          else if (line === 'readyok') {
            worker.removeEventListener('message', onInit);
            resolve();
          }
        }
        worker.addEventListener('message', onInit);
        worker.postMessage('uci');
      }));
    }

    await Promise.all(inits);
    return pool;
  }

  private handleMessage(worker: Worker, e: MessageEvent) {
    const line = typeof e.data === 'string' ? e.data : String(e.data);
    const pending = this.pendingMap.get(worker);
    if (!pending) return;

    if (line.startsWith('info ')) {
      const depthMatch = line.match(/\bdepth\s+(\d+)/);
      const multipvMatch = line.match(/\bmultipv\s+(\d+)/);
      const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
      const pvMatch = line.match(/\bpv\s+(.+)$/);
      if (!depthMatch || !scoreMatch) return;

      const depth = Number(depthMatch[1]);
      const multipv = multipvMatch ? Number(multipvMatch[1]) : 1;
      const scoreType = scoreMatch[1] as 'cp' | 'mate';
      const scoreValue = Number(scoreMatch[2]);
      const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

      const existing = pending.latestByMultipv.get(multipv);
      if (!existing || depth >= existing.depth) {
        pending.latestByMultipv.set(multipv, { depth, scoreType, scoreValue, bestMoveUci: pv[0], pv });
      }
    } else if (line.startsWith('bestmove ')) {
      const match = line.match(/^bestmove\s+(\S+)/);
      const bestMoveUci = match?.[1] && match[1] !== '(none)' ? match[1] : undefined;

      const lines: FenAnalysisLine[] = [...pending.latestByMultipv.entries()]
        .sort(([a], [b]) => a - b)
        .map(([multipv, info]) => ({
          multipv,
          evalCp: toWhiteEvalCp(info.scoreType, info.scoreValue, pending.fen),
          bestMoveUci: info.bestMoveUci,
          pv: info.pv,
          depth: info.depth,
        }));

      const primary = pending.latestByMultipv.get(1);
      const result: FenAnalysisResult = {
        fen: pending.fen,
        bestMoveUci: bestMoveUci ?? primary?.bestMoveUci,
        evalCp: primary
          ? toWhiteEvalCp(primary.scoreType, primary.scoreValue, pending.fen)
          : undefined,
        lines,
        pv: primary?.pv ?? [],
      };

      this.pendingMap.set(worker, null);
      pending.resolve(result);
      this.taskQueue.shift()?.();
    }
  }

  private runOnWorker(worker: Worker, fen: string, depth: number): Promise<FenAnalysisResult> {
    return new Promise((resolve, reject) => {
      this.pendingMap.set(worker, { resolve, reject, fen, latestByMultipv: new Map() });
      worker.postMessage('ucinewgame');
      worker.postMessage(`setoption name MultiPV value ${MULTIPV_COUNT}`);
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${depth}`);
    });
  }

  analyze(fen: string, depth: number): Promise<FenAnalysisResult> {
    if (this.terminated) return Promise.reject(new Error('Pool terminated'));
    const available = this.workers.find(w => this.pendingMap.get(w) === null);
    if (available) return this.runOnWorker(available, fen, depth);
    return new Promise((resolve, reject) => {
      this.taskQueue.push(() => {
        const w = this.workers.find(worker => this.pendingMap.get(worker) === null);
        if (w) this.runOnWorker(w, fen, depth).then(resolve).catch(reject);
        else reject(new Error('No available worker'));
      });
    });
  }

  terminate() {
    this.terminated = true;
    for (const w of this.workers) {
      const p = this.pendingMap.get(w);
      if (p) p.reject(new Error('Pool terminated'));
      w.terminate();
    }
    this.workers = [];
    this.pendingMap.clear();
    this.taskQueue = [];
  }
}

export function workerPoolSize(): number {
  if (typeof navigator === 'undefined') return 2;
  // Use half the logical cores, minimum 2, maximum 4.
  // Leaves enough headroom for the UI thread and OS during analysis.
  return Math.min(Math.max(Math.floor(navigator.hardwareConcurrency / 2), 2), 4);
}
