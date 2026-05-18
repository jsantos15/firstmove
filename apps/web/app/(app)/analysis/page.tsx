'use client';

import { useMemo, useState } from 'react';
import type { AnalyzedGame, AnalyzedGameMove } from '@firstmove/core';
import { CoachBubble } from '@/components/practice/CoachBubble';
import { COACH_PERSONA_OPTIONS, useCoachSettings } from '@/hooks/useCoachSettings';
import {
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
      beforeEvalCp: 30,
      afterPlayedEvalCp: -320,
      afterBestEvalCp: 140,
      bestMoveSan: 'Bxf7+',
      themeTags: ['fork'],
    },
    {
      san: 'Nf6',
      plyIndex: 28,
      playedBy: 'black',
      phase: 'middlegame',
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

export default function AnalysisPage() {
  const [selectedSampleId, setSelectedSampleId] = useState(ANALYSIS_SAMPLES[0].id);
  const { settings: coachSettings, setSettings: setCoachSettings } = useCoachSettings();
  const selectedSample =
    ANALYSIS_SAMPLES.find(sample => sample.id === selectedSampleId) ?? ANALYSIS_SAMPLES[0];
  const feedbacks = useMemo(
    () =>
      buildGameAnalysisCoachFeedbackFromAnalyzedGame({
        game: SAMPLE_ANALYZED_GAME,
        persona: coachSettings.persona,
      }).filter(feedback => feedback.event.plyIndex === selectedSample.move.plyIndex),
    [coachSettings.persona, selectedSample.move.plyIndex]
  );
  const primaryFeedback: CoachFeedback | null = feedbacks[0] ?? null;

  return (
    <div className="h-full overflow-y-auto bg-(--bg-base)">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8 pb-16">
        <header>
          <p className="mb-1 text-2xl font-bold text-white">Analysis Coach</p>
          <p className="max-w-2xl text-sm leading-6 text-gray-400">
            Review a sample analyzed game through the same coach event pipeline used by opening
            practice.
          </p>
        </header>

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

            <div className="grid gap-3 md:grid-cols-3">
              {ANALYSIS_SAMPLES.map(sample => {
                const selected = sample.id === selectedSample.id;
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
                        value={moveLabel(sample.move, sample.move.bestMoveSan)}
                      />
                      <FeedbackFact
                        label="Eval"
                        value={`${evalLabel(sample.move.afterPlayedEvalCp)} / ${evalLabel(
                          sample.move.afterBestEvalCp
                        )}`}
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
              fallbackText="Select a reviewed move to see the coach explanation."
            />
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="rounded-xl border border-white/5 bg-(--bg-panel) p-4">
            <h2 className="mb-3 text-base font-semibold text-white">Coach events</h2>
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
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/5 bg-(--bg-panel) p-4">
            <h2 className="mb-3 text-base font-semibold text-white">Speech text</h2>
            <p className="text-sm leading-6 text-gray-400">
              {primaryFeedback?.spokenText ?? 'No speech text available.'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
