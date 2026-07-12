import type { BoardBounds } from './types';

type Rgb = [number, number, number];
type AxisSeed = { start: number; cell: number; votes: number };

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): Rgb {
  const i = (y * width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

function quantizedKey(rgb: Rgb): number {
  return (Math.round(rgb[0] / 12) << 16) | (Math.round(rgb[1] / 12) << 8) | Math.round(rgb[2] / 12);
}

function findAlternatingRuns(colors: number[]): { start: number; cell: number }[] {
  const runs: { start: number; end: number; color: number }[] = [];
  let start = 0;
  for (let i = 1; i <= colors.length; i++) {
    if (i === colors.length || colors[i] !== colors[start]) {
      if (i - start >= 2) runs.push({ start, end: i, color: colors[start]! });
      start = i;
    }
  }

  // Pieces, coordinates, highlights, and arrows interrupt otherwise flat square-color
  // runs. Looking for eight pristine runs therefore fails on real screenshots. Instead,
  // find a repeated long-run width (the square size), then verify that at least seven of
  // the nine expected grid boundaries exist. Extra piece edges are harmless.
  const found: { start: number; cell: number }[] = [];
  const widths = runs
    .map(run => run.end - run.start)
    .filter(width => width >= 10 && width <= colors.length / 5);
  const tried = new Set<number>();
  for (const width of widths) {
    const bucket = Math.round(width / 3);
    if (tried.has(bucket)) continue;
    tried.add(bucket);
    const similar = widths.filter(other => Math.abs(other - width) <= Math.max(3, width * 0.12));
    if (similar.length < 4) continue;
    const cell = similar.sort((a, b) => a - b)[Math.floor(similar.length / 2)]!;
    const boundaries = runs.flatMap(run => [run.start, run.end]);
    for (const startBoundary of boundaries) {
      if (startBoundary + cell * 8 > colors.length + 3) continue;
      const matched: { step: number; boundary: number }[] = [];
      for (let step = 0; step <= 8; step++) {
        const expected = startBoundary + step * cell;
        const nearest = boundaries.reduce((best, boundary) =>
          Math.abs(boundary - expected) < Math.abs(best - expected) ? boundary : best
        , boundaries[0]!);
        if (Math.abs(nearest - expected) <= Math.max(3, cell * 0.035)) matched.push({ step, boundary: nearest });
      }
      if (matched.length >= 7) {
        const meanStep = matched.reduce((sum, item) => sum + item.step, 0) / matched.length;
        const meanBoundary = matched.reduce((sum, item) => sum + item.boundary, 0) / matched.length;
        const numerator = matched.reduce((sum, item) => sum + (item.step - meanStep) * (item.boundary - meanBoundary), 0);
        const denominator = matched.reduce((sum, item) => sum + (item.step - meanStep) ** 2, 0);
        const refinedCell = denominator ? numerator / denominator : cell;
        const refinedStart = meanBoundary - refinedCell * meanStep;
        found.push({ start: refinedStart, cell: refinedCell });
      }
    }
  }
  return found;
}

function clusterSeeds(raw: { start: number; cell: number }[]): AxisSeed[] {
  const clusters: AxisSeed[] = [];
  for (const seed of raw) {
    const existing = clusters.find(item =>
      Math.abs(item.start - seed.start) <= Math.max(4, seed.cell * 0.18)
      && Math.abs(item.cell - seed.cell) <= Math.max(2, seed.cell * 0.12)
    );
    if (existing) {
      const n = existing.votes;
      existing.start = (existing.start * n + seed.start) / (n + 1);
      existing.cell = (existing.cell * n + seed.cell) / (n + 1);
      existing.votes++;
    } else {
      clusters.push({ ...seed, votes: 1 });
    }
  }
  return clusters.filter(seed => seed.votes >= 2).sort((a, b) => b.votes - a.votes);
}

function scanAxes(image: ImageData, vertical: boolean): AxisSeed[] {
  const { data, width, height } = image;
  const lineLength = vertical ? height : width;
  const lineCount = vertical ? width : height;
  const raw: { start: number; cell: number }[] = [];
  const stride = Math.max(2, Math.floor(lineCount / 350));
  for (let line = 0; line < lineCount; line += stride) {
    const colors = new Array<number>(lineLength);
    for (let p = 0; p < lineLength; p++) {
      colors[p] = quantizedKey(vertical ? pixel(data, width, line, p) : pixel(data, width, p, line));
    }
    raw.push(...findAlternatingRuns(colors));
  }
  return clusterSeeds(raw);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function medianRgb(values: Rgb[]): Rgb {
  return [median(values.map(v => v[0])), median(values.map(v => v[1])), median(values.map(v => v[2]))];
}

function scoreBoard(image: ImageData, x: number, y: number, size: number): number {
  const { data, width, height } = image;
  if (x < 0 || y < 0 || x + size > width || y + size > height) return 0;
  const cell = size / 8;
  const parity: [Rgb[], Rgb[]] = [[], []];
  const samples: { rgb: Rgb; parity: 0 | 1 }[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      for (const [ox, oy] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) {
        const rgb = pixel(data, width, Math.floor(x + (col + ox) * cell), Math.floor(y + (row + oy) * cell));
        const p = ((row + col) % 2) as 0 | 1;
        parity[p].push(rgb);
        samples.push({ rgb, parity: p });
      }
    }
  }
  const means: [Rgb, Rgb] = [medianRgb(parity[0]), medianRgb(parity[1])];
  const separation = distance(means[0], means[1]);
  if (separation < 28) return 0;
  const errors = samples.map(sample => distance(sample.rgb, means[sample.parity]));
  const robustError = median(errors);
  const matching = errors.filter(error => error < Math.max(34, separation * 0.55)).length / errors.length;
  return matching * 0.75 + Math.min(1, separation / 100) * 0.25 - Math.min(0.3, robustError / 300);
}

function overlap(a: BoardBounds, b: BoardBounds): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.size, b.x + b.size);
  const bottom = Math.min(a.y + a.size, b.y + b.size);
  if (right <= left || bottom <= top) return 0;
  return ((right - left) * (bottom - top)) / Math.min(a.size * a.size, b.size * b.size);
}

export function detectBoardCandidates(image: ImageData): BoardBounds[] {
  const horizontal = scanAxes(image, false);
  const vertical = scanAxes(image, true);
  const candidates: BoardBounds[] = [];
  for (const xSeed of horizontal.slice(0, 18)) {
    for (const ySeed of vertical.slice(0, 18)) {
      if (Math.abs(xSeed.cell - ySeed.cell) > Math.max(xSeed.cell, ySeed.cell) * 0.15) continue;
      const cell = (xSeed.cell + ySeed.cell) / 2;
      const x = Math.round(xSeed.start);
      const y = Math.round(ySeed.start);
      const size = Math.round(cell * 8);
      const score = scoreBoard(image, x, y, size);
      if (score >= 0.63) candidates.push({ x, y, size, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const distinct: BoardBounds[] = [];
  for (const candidate of candidates) {
    // Periodic grid edges can yield a shifted candidate covering most of the same board.
    // Treat substantial overlap as one detection; genuinely separate boards do not overlap.
    if (distinct.some(other => overlap(candidate, other) > 0.45)) continue;
    distinct.push(candidate);
  }
  return distinct;
}
