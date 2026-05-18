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
    beforeFen: '4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1',
    beforeEvalCp: 30,
    afterPlayedEvalCp: -320,
    afterBestEvalCp: 140,
    bestMoveSan: 'Bxf7+',
    bestLine: [
      { san: 'Bxf7+', side: 'white', isKeyMove: true },
      { san: 'Kxf7', side: 'black' },
      { san: 'Qxd5+', side: 'white' },
    ],
    themeTags: ['fork'],
  });

  assert.deepEqual(
    events.map(event => event.eventType),
    ['missed_tactic', 'missed_win', 'blunder', 'material_trade']
  );
  assert.equal(events[0].classification, 'miss');
  assert.equal(events[0].analysisFacts.candidateReason, 'missed_forcing_capture');
  assert.equal(events[1].classification, 'miss');
  assert.equal(events[2].classification, 'blunder');
  assert.equal(events[0].analysisFacts.centipawnLoss, 460);
  assert.equal(events[0].analysisFacts.missedOpportunityCp, 460);
  assert.equal(events[0].evidence?.kind, 'line');
  assert.equal(events[0].analysisFacts.isCapture, true);
  assert.ok(events.some(event => event.eventType === 'material_trade'));
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
        beforeFen: '4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1',
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
    ['great_move', 'missed_tactic', 'missed_win', 'blunder', 'material_trade']
  );
  assert.ok(events.every(event => event.subject.id === 'game-4'));
  assert.ok(events.every(event => event.persona === 'beginner'));
});

test('analysis candidates are ranked before coach events are rendered', () => {
  const event = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-5',
    moveSan: 'Qxd5',
    plyIndex: 18,
    playedBy: 'white',
    phase: 'middlegame',
    beforeEvalCp: 30,
    afterPlayedEvalCp: -320,
    afterBestEvalCp: 140,
    bestMoveSan: 'Bxf7+',
    themeTags: ['fork'],
  })[0];

  assert.equal(event.eventType, 'missed_tactic');
  assert.equal(event.analysisFacts.candidateReason, 'missed_forcing_capture');
  assert.ok(Number(event.analysisFacts.candidatePriority) > 2000);
});

test('chess-state detector adds check candidate from move position', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-6',
    moveSan: 'Ra8+',
    plyIndex: 10,
    playedBy: 'white',
    phase: 'middlegame',
    beforeFen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1',
    beforeEvalCp: 20,
    afterPlayedEvalCp: 80,
    afterBestEvalCp: 85,
    bestMoveSan: 'Ra8+',
  });
  const checkEvent = events.find(
    event => event.analysisFacts.candidateReason === 'move_gives_check'
  );

  assert.ok(checkEvent);
  assert.equal(checkEvent.eventType, 'king_safety');
  assert.equal(checkEvent.analysisFacts.givesCheck, true);
  assert.equal(checkEvent.evidence?.kind, 'square');
});

test('best-line detector ranks missed forcing ideas above generic eval loss', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-7',
    moveSan: 'h3',
    plyIndex: 20,
    playedBy: 'white',
    phase: 'middlegame',
    beforeEvalCp: 40,
    afterPlayedEvalCp: -120,
    afterBestEvalCp: 260,
    bestMoveSan: 'Qxf7+',
  });

  assert.equal(events[0].eventType, 'missed_tactic');
  assert.equal(events[0].analysisFacts.candidateReason, 'missed_forcing_capture');
  assert.equal(events[0].analysisFacts.bestMoveGivesCheck, true);
  assert.equal(events[0].analysisFacts.bestMoveIsCapture, true);
  assert.ok(Number(events[0].analysisFacts.candidatePriority) > 2000);
});

test('board-state detector flags hanging material after the move', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-8',
    moveSan: 'h3',
    plyIndex: 12,
    playedBy: 'white',
    phase: 'middlegame',
    beforeFen: '4k3/6b1/8/8/8/8/7P/R3K3 w - - 0 1',
    beforeEvalCp: 15,
    afterPlayedEvalCp: 10,
    afterBestEvalCp: 10,
    bestMoveSan: 'h3',
  });
  const hangingEvent = events.find(
    event => event.analysisFacts.candidateReason === 'hanging_material_after_move'
  );

  assert.ok(hangingEvent);
  assert.equal(hangingEvent.eventType, 'hanging_material');
  assert.equal(hangingEvent.analysisFacts.materialRiskSquare, 'a1');
  assert.equal(hangingEvent.analysisFacts.materialRiskPiece, 'rook');
  assert.equal(hangingEvent.analysisFacts.materialRiskIsHanging, true);
  assert.equal(hangingEvent.evidence?.kind, 'piece');

  const threatEvent = events.find(
    event => event.analysisFacts.candidateReason === 'opponent_capture_after_move'
  );
  assert.ok(threatEvent);
  assert.equal(threatEvent.eventType, 'opponent_threat');
  assert.equal(threatEvent.analysisFacts.opponentThreatMoveSan, 'Bxa1');
  assert.equal(threatEvent.analysisFacts.opponentThreatCapturedPiece, 'rook');
  assert.equal(threatEvent.evidence?.kind, 'single_move');
});

test('positional detectors flag development and center-control gains', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-9',
    moveSan: 'Nf3',
    plyIndex: 1,
    playedBy: 'white',
    phase: 'opening',
    beforeFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    beforeEvalCp: 0,
    afterPlayedEvalCp: 20,
    afterBestEvalCp: 20,
    bestMoveSan: 'Nf3',
  });
  const developmentEvent = events.find(
    event => event.analysisFacts.candidateReason === 'minor_piece_developed_from_home_square'
  );
  const centerEvent = events.find(
    event => event.analysisFacts.candidateReason === 'center_control_increased'
  );

  assert.ok(developmentEvent);
  assert.equal(developmentEvent.eventType, 'development');
  assert.equal(developmentEvent.analysisFacts.developedPiece, 'knight');
  assert.equal(developmentEvent.analysisFacts.developedFrom, 'g1');
  assert.equal(developmentEvent.analysisFacts.developedTo, 'f3');
  assert.ok(centerEvent);
  assert.equal(centerEvent.eventType, 'center_control');
  assert.ok(Number(centerEvent.analysisFacts.centerControlDelta) >= 2);
});

console.log('Coach contract tests passed.');
