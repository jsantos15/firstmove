#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = function loadTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;

  module._compile(output, filename);
};

const core = require(path.resolve(__dirname, '..', 'packages', 'core', 'src', 'coach', 'index.ts'));
const i18n = require(path.resolve(__dirname, '..', 'packages', 'i18n', 'src', 'index.ts'));

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('opening practice keeps display and spoken text separate', () => {
  const event = core.buildOpeningPracticeWrongMoveEvent({
    attemptedSan: 'Nc3',
    expectedSan: 'Nf3',
    openingId: 'italian-game',
    variationId: 'giuoco-piano',
    variationName: 'Giuoco Piano',
    moveIndex: 2,
    persona: 'strict',
  });
  const rendered = i18n.renderCoachEvent(event, 'en');

  assert.equal(rendered.messageKey, 'coach.event.wrong_move.message');
  assert.equal(rendered.spokenTextKey, 'coach.spoken.wrong_move');
  assert.match(rendered.message, /Nc3 is not the move/);
  assert.match(rendered.spokenText, /^Try again\./);
  assert.notEqual(rendered.message, rendered.spokenText);
});

test('persona-specific spoken fallback works without persona-specific display copy', () => {
  const event = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-1',
    moveSan: 'Qh5',
    plyIndex: 7,
    playedBy: 'white',
    phase: 'opening',
    beforeEvalCp: 20,
    afterPlayedEvalCp: 160,
    afterBestEvalCp: 165,
    bestMoveSan: 'Qh5',
    persona: 'strict',
  })[0];
  const rendered = i18n.renderCoachEvent(event, 'en');

  assert.equal(rendered.event.eventType, 'great_move');
  assert.equal(rendered.messageKey, 'coach.event.great_move.message');
  assert.equal(rendered.spokenTextKey, 'coach.persona.strict.spoken.event');
  assert.equal(rendered.persona, 'strict');
  assert.match(rendered.spokenText, /^Great\./);
});

test('engine adapter emits missed-win and blunder events from white-perspective evals', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-2',
    moveSan: 'Qxd5',
    plyIndex: 18,
    playedBy: 'white',
    phase: 'middlegame',
    beforeEvalCp: 30,
    afterPlayedEvalCp: -320,
    afterBestEvalCp: 140,
    bestMoveSan: 'Bxf7+',
    themeTags: ['fork'],
  });

  assert.deepEqual(
    events.map(event => event.eventType),
    ['missed_win', 'blunder']
  );
  assert.equal(events[0].classification, 'miss');
  assert.equal(events[1].classification, 'blunder');
  assert.equal(events[0].analysisFacts.centipawnLoss, 460);
  assert.equal(events[0].analysisFacts.missedOpportunityCp, 460);
});

test('engine adapter normalizes black moves into player perspective', () => {
  const event = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-3',
    moveSan: '...Nf6',
    plyIndex: 5,
    playedBy: 'black',
    phase: 'opening',
    beforeEvalCp: 10,
    afterPlayedEvalCp: -90,
    afterBestEvalCp: -90,
    bestMoveSan: '...Nf6',
  })[0];

  assert.equal(event.eventType, 'best_move');
  assert.equal(event.analysisFacts.beforeCp, -10);
  assert.equal(event.analysisFacts.afterCp, 90);
  assert.equal(event.analysisFacts.centipawnLoss, 0);
  assert.equal(event.analysisFacts.centipawnGain, 100);
});

test('analyzed-game adapter emits timeline coach events from PGN-shaped input', () => {
  const game = {
    id: 'game-4',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5',
    moves: [
      {
        san: 'Qh5',
        plyIndex: 7,
        playedBy: 'white',
        phase: 'opening',
        beforeEvalCp: 20,
        afterPlayedEvalCp: 160,
        afterBestEvalCp: 165,
        bestMoveSan: 'Qh5',
        isCriticalMove: true,
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
    ],
  };
  const events = core.buildGameAnalysisEventsFromAnalyzedGame({ game, persona: 'beginner' });

  assert.deepEqual(
    events.map(event => event.eventType),
    ['great_move', 'missed_win', 'blunder']
  );
  assert.ok(events.every(event => event.subject.id === 'game-4'));
  assert.ok(events.every(event => event.persona === 'beginner'));
});

console.log('Coach contract tests passed.');
