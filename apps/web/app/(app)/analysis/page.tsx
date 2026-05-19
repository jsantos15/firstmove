'use client';

import { useMemo, useState } from 'react';
import type { AnalyzedGame, AnalyzedGameMove } from '@firstmove/core';
import { CoachBubble } from '@/components/practice/CoachBubble';
import { COACH_PERSONA_OPTIONS, useCoachSettings } from '@/hooks/useCoachSettings';
import {
  buildAnalyzedGameFromPgn,
  buildGameAnalysisCoachFeedbackFromAnalyzedGame,
  type CoachFeedback,
} from '@/lib/coachFeedback';

type AnalysisSample = {
  id: string;
  label: string;
  move: AnalyzedGameMove;
};

const SAMPLE_ANALYZED_GAME: AnalyzedGame = {
  id: 'analysis-preview',
  pgn: 'Sample analyzed game timeline',
  moves: [
    {
      san: 'Qh5',
      plyIndex: 15,
      playedBy: 'white',
      phase: 'opening',
      beforeFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      beforeEvalCp: 20,
      afterPlayedEvalCp: 160,
      afterBestEvalCp: 165,
      bestMoveSan: 'Qh5',
      isCriticalMove: true,
      themeTags: ['initiative', 'king_safety'],
    },
    {
      san: 'Qxd5',
      plyIndex: 23,
      playedBy: 'white',
      phase: 'middlegame',
      beforeFen: '4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1',
      beforeEvalCp: 30,
      afterPlayedEvalCp: -320,
      afterBestEvalCp: 140,
      bestMoveSan: 'Bxf7+',
      bestLine: [
        {
          san: 'Bxf7+',
          side: 'white',
          plyIndex: 23,
          comment: 'The fork starts with check.',
          evalCp: 140,
          isKeyMove: true,
        },
        {
          san: 'Kxf7',
          side: 'black',
          plyIndex: 24,
          comment: 'Black is pulled into the tactic.',
        },
        {
          san: 'Qxd5+',
          side: 'white',
          plyIndex: 25,
          comment: 'White wins material with tempo.',
        },
      ],
      themeTags: ['fork'],
    },
    {
      san: 'Nf6',
      plyIndex: 28,
      playedBy: 'black',
      phase: 'middlegame',
      beforeFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
      beforeEvalCp: 10,
      afterPlayedEvalCp: -90,
      afterBestEvalCp: -90,
      bestMoveSan: 'Nf6',
      themeTags: ['piece_activity'],
    },
  ],
};

const ANALYSIS_SAMPLES: AnalysisSample[] = [
  {
    id: 'best-resource',
    label: 'Best resource',
    move: SAMPLE_ANALYZED_GAME.moves[0],
  },
  {
    id: 'missed-win',
    label: 'Missed win',
    move: SAMPLE_ANALYZED_GAME.moves[1],
  },
  {
    id: 'black-counterplay',
    label: 'Black counterplay',
    move: SAMPLE_ANALYZED_GAME.moves[2],
  },
];

const SAMPLE_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6';
const STOCKFISH_MOVE_LIMIT = 40;

type StockfishAnalysisResponse = {
  game: AnalyzedGame;
  analyzedMoves: number;
  requestedMoves: number;
  maxMoves: number;
  depth: number;
};

function evalLabel(cp: number | undefined) {
  if (typeof cp !== 'number') return 'n/a';
  if (Math.abs(cp) < 10) return '0.0';
  return `${cp > 0 ? '+' : '-'}${(Math.abs(cp) / 100).toFixed(1)}`;
}

function FeedbackFact({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-white">{value ?? 'n/a'}</dd>
    </div>
  );
}

function moveNumberLabel(move: AnalyzedGameMove) {
  const moveNumber = Math.floor(move.plyIndex / 2) + 1;
  return move.playedBy === 'white' ? `${moveNumber}.` : `${moveNumber}...`;
}

function moveLabel(move: AnalyzedGameMove, san: string | undefined = move.san) {
  return `${moveNumberLabel(move)} ${san ?? 'n/a'}`;
}

function EvidencePanel({ feedback }: { feedback: CoachFeedback | null }) {
  const evidence = feedback?.evidence;
  if (!evidence) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-(--bg-panel) p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
          {evidence.actionLabel}
        </span>
        <h2 className="text-base font-semibold text-white">{evidence.title}</h2>
      </div>
      <p className="mb-3 text-sm leading-6 text-gray-400">{evidence.summary}</p>
      {evidence.kind === 'line' && (
        <div className="flex flex-col gap-2">
          {evidence.moves.map((move, index) => (
            <div
              key={`${move.san}-${index}`}
              className={`rounded-lg border px-3 py-2 ${
                move.isKeyMove
                  ? 'border-amber-400/30 bg-amber-400/10'
                  : 'border-white/5 bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">{move.san}</span>
                {typeof move.evalCp === 'number' && (
                  <span className="text-xs text-gray-500">{evalLabel(move.evalCp)}</span>
                )}
              </div>
              {move.comment && (
                <p className="mt-1 text-xs leading-5 text-gray-400">{move.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {evidence.kind === 'single_move' && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2">
          <span className="text-sm font-semibold text-white">{evidence.move.san}</span>
          {evidence.move.comment && (
            <p className="mt-1 text-xs leading-5 text-gray-400">{evidence.move.comment}</p>
          )}
        </div>
      )}
      {evidence.kind === 'square' && (
        <div className="flex flex-wrap gap-2">
          {evidence.squares.map(square => (
            <span
              key={square}
              className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-white"
            >
              {square}
            </span>
          ))}
        </div>
      )}
      {evidence.kind === 'piece' && (
        <div className="flex flex-col gap-2">
          {evidence.pieces.map(piece => (
            <div
              key={`${piece.square}-${piece.role}`}
              className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2"
            >
              <span className="text-sm font-semibold text-white">{piece.square}</span>
              {piece.role && <p className="mt-1 text-xs leading-5 text-gray-400">{piece.role}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  const [analyzedGame, setAnalyzedGame] = useState<AnalyzedGame>(SAMPLE_ANALYZED_GAME);
  const [pgnInput, setPgnInput] = useState(SAMPLE_PGN);
  const [fenInput, setFenInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [engineStatus, setEngineStatus] = useState<string | null>(null);
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState(ANALYSIS_SAMPLES[0].id);
  const { settings: coachSettings, setSettings: setCoachSettings } = useCoachSettings();
  const analysisSamples = useMemo<AnalysisSample[]>(
    () =>
      analyzedGame.moves.map(move => ({
        id: move.id ?? `${analyzedGame.id}:${move.plyIndex}`,
        label: move.san,
        move,
      })),
    [analyzedGame]
  );
  const selectedSample =
    analysisSamples.find(sample => sample.id === selectedSampleId) ?? analysisSamples[0] ?? null;
  const feedbacks = useMemo(() => {
    if (!selectedSample) return [];
    return buildGameAnalysisCoachFeedbackFromAnalyzedGame({
      game: analyzedGame,
      persona: coachSettings.persona,
    }).filter(feedback => feedback.event.plyIndex === selectedSample.move.plyIndex);
  }, [analyzedGame, coachSettings.persona, selectedSample]);
  const primaryFeedback: CoachFeedback | null = feedbacks[0] ?? null;

  function analyzePgn() {
    try {
      const game = buildAnalyzedGameFromPgn({
        id: `analysis-${Date.now()}`,
        pgn: pgnInput,
        initialFen: fenInput.trim() || undefined,
      });
      setAnalyzedGame(game);
      setSelectedSampleId(game.moves[0]?.id ?? `${game.id}:0`);
      setParseError(null);
      setEngineError(null);
      setEngineStatus(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Could not parse that PGN/FEN.');
    }
  }

  async function runStockfishAnalysis() {
    if (!analyzedGame.moves.length || isEngineRunning) return;

    setIsEngineRunning(true);
    setEngineError(null);
    setEngineStatus(
      `Running Stockfish depth 8 for up to ${Math.min(
        analyzedGame.moves.length,
        STOCKFISH_MOVE_LIMIT
      )} moves...`
    );

    try {
      const response = await fetch('/api/analysis/stockfish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          game: analyzedGame,
          depth: 8,
          maxMoves: STOCKFISH_MOVE_LIMIT,
        }),
      });

      const payload = (await response.json()) as Partial<StockfishAnalysisResponse> & {
        error?: string;
      };

      if (!response.ok || !payload.game) {
        throw new Error(payload.error ?? 'Stockfish analysis failed.');
      }

      setAnalyzedGame(payload.game);
      setSelectedSampleId(
        payload.game.moves.find(move => move.plyIndex === selectedSample?.move.plyIndex)?.id ??
          payload.game.moves[0]?.id ??
          `${payload.game.id}:0`
      );
      setEngineStatus(
        `Stockfish analyzed ${payload.analyzedMoves ?? 0}/${payload.requestedMoves ?? 0} moves at depth ${
          payload.depth ?? 8
        }.`
      );
    } catch (error) {
      setEngineError(error instanceof Error ? error.message : 'Stockfish analysis failed.');
    } finally {
      setIsEngineRunning(false);
    }
  }

  async function handlePgnFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setPgnInput(text);
    setParseError(null);
    setEngineError(null);
    setEngineStatus(null);
  }

  return (
    <div className="h-full overflow-y-auto bg-(--bg-base)">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 pb-16">
        <header>
          <p className="mb-1 text-2xl font-bold text-white">Analysis Coach</p>
          <p className="max-w-2xl text-sm leading-6 text-gray-400">
            Paste or upload a PGN, then review each move through the same coach event pipeline used
            by opening practice.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="rounded-xl border border-white/5 bg-(--bg-panel) p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Import game</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Parse PGN/FEN locally, then run Stockfish to add evals and best moves.
                </p>
              </div>
              <label className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-gray-300 hover:border-white/20">
                Upload PGN
                <input
                  type="file"
                  accept=".pgn,.txt"
                  className="sr-only"
                  onChange={event => {
                    void handlePgnFile(event.target.files?.[0] ?? null);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>

            <div className="grid gap-3">
              <textarea
                value={pgnInput}
                onChange={event => setPgnInput(event.target.value)}
                rows={6}
                className="min-h-36 resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs leading-5 text-gray-200 outline-none focus:border-amber-400/50"
                spellCheck={false}
              />
              <input
                value={fenInput}
                onChange={event => setFenInput(event.target.value)}
                placeholder="Optional starting FEN for non-standard positions"
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-gray-200 outline-none focus:border-amber-400/50"
              />
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={analyzePgn}
                    className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:border-amber-400/50"
                  >
                    Parse PGN
                  </button>
                  <button
                    type="button"
                    onClick={() => void runStockfishAnalysis()}
                    disabled={isEngineRunning || !analyzedGame.moves.length}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-gray-200 hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isEngineRunning ? 'Running Stockfish...' : 'Run Stockfish'}
                  </button>
                </div>
                <span className="text-xs text-gray-500">
                  {analyzedGame.moves.length} moves loaded
                </span>
              </div>
              {parseError && <p className="text-sm leading-6 text-red-300">{parseError}</p>}
              {engineError && <p className="text-sm leading-6 text-red-300">{engineError}</p>}
              {engineStatus && !engineError && (
                <p className="text-sm leading-6 text-gray-400">{engineStatus}</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-(--bg-panel) p-4">
            <h2 className="mb-3 text-sm font-semibold text-white">Current source</h2>
            <dl className="grid gap-3">
              <FeedbackFact label="Moves" value={analyzedGame.moves.length} />
              <FeedbackFact
                label="Initial FEN"
                value={analyzedGame.initialFen ? 'custom' : 'standard'}
              />
              <FeedbackFact
                label="Engine eval"
                value={
                  analyzedGame.moves.some(move => move.hasEngineAnalysis)
                    ? 'available'
                    : 'pending'
                }
              />
            </dl>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 rounded-xl border border-white/5 bg-(--bg-panel) p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">Reviewed moves</h2>
                <p className="mt-1 text-xs text-gray-500">
                  PGN and eval timeline in, localized coach out.
                </p>
              </div>
              <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
                Preview
              </span>
            </div>

            <div className="grid max-h-96 gap-3 overflow-y-auto pr-1 md:grid-cols-3">
              {analysisSamples.map(sample => {
                const selected = sample.id === selectedSample?.id;
                return (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => setSelectedSampleId(sample.id)}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      selected
                        ? 'border-amber-400/50 bg-amber-400/10'
                        : 'border-white/5 bg-white/[0.03] hover:border-white/15'
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span
                        className={`text-sm font-semibold ${
                          selected ? 'text-amber-300' : 'text-white'
                        }`}
                      >
                        {sample.label}
                      </span>
                      <span className="text-xs text-gray-500">{moveNumberLabel(sample.move)}</span>
                    </div>
                    <dl className="grid gap-3">
                      <FeedbackFact label="Played" value={moveLabel(sample.move)} />
                      <FeedbackFact
                        label="Best"
                        value={
                          sample.move.bestMoveSan
                            ? moveLabel(sample.move, sample.move.bestMoveSan)
                            : 'pending engine'
                        }
                      />
                      <FeedbackFact
                        label="Eval"
                        value={
                          sample.move.hasEngineAnalysis === false
                            ? 'pending engine'
                            : `${evalLabel(sample.move.afterPlayedEvalCp)} / ${evalLabel(
                                sample.move.afterBestEvalCp
                              )}`
                        }
                      />
                    </dl>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <div className="rounded-xl border border-white/5 bg-(--bg-panel) p-4">
              <h2 className="mb-3 text-sm font-semibold text-white">Coach style</h2>
              <div className="grid grid-cols-2 gap-2">
                {COACH_PERSONA_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCoachSettings({ persona: option.id })}
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      coachSettings.persona === option.id
                        ? 'border-amber-400/50 bg-amber-400/10 text-amber-300'
                        : 'border-white/5 bg-white/[0.03] text-gray-300 hover:border-white/15'
                    }`}
                  >
                    <span className="block text-xs font-semibold">{option.label}</span>
                    <span className="mt-1 block text-[10px] leading-4 text-gray-500">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <CoachBubble
              feedback={primaryFeedback}
              fallbackText="Import a PGN and select a move to see the coach explanation."
            />
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="rounded-xl border border-white/5 bg-(--bg-panel) p-4">
            <h2 className="mb-3 text-base font-semibold text-white">Ranked coach matches</h2>
            <div className="flex flex-col gap-2">
              {feedbacks.map(feedback => (
                <div
                  key={feedback.id}
                  className="rounded-lg border border-white/5 bg-white/[0.03] px-4 py-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-300">
                      {feedback.label}
                    </span>
                    <span className="text-sm font-semibold text-white">{feedback.title}</span>
                  </div>
                  <p className="text-sm leading-6 text-gray-400">{feedback.message}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-600">
                    {String(feedback.event.analysisFacts.candidateReason ?? 'matched_event')}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <EvidencePanel feedback={primaryFeedback} />
            <div className="rounded-xl border border-white/5 bg-(--bg-panel) p-4">
              <h2 className="mb-3 text-base font-semibold text-white">Speech text</h2>
              <p className="text-sm leading-6 text-gray-400">
                {primaryFeedback?.spokenText ?? 'No speech text available.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
