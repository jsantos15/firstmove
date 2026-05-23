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

test('event-specific spoken fallback works without event-specific display copy', () => {
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
  assert.equal(rendered.spokenTextKey, 'coach.spoken.event.great_move');
  assert.equal(rendered.persona, 'strict');
  assert.match(rendered.spokenText, /^Great move\./);
  assert.match(rendered.spokenText, /queen to h five/);
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
    ['missed_tactic', 'game_turning_point', 'missed_win', 'blunder', 'material_trade']
  );
  assert.equal(events[0].classification, 'miss');
  assert.equal(events[0].analysisFacts.candidateReason, 'missed_forcing_capture');
  assert.equal(events[2].classification, 'miss');
  assert.equal(events[3].classification, 'blunder');
  assert.equal(events[0].analysisFacts.centipawnLoss, 460);
  assert.equal(events[0].analysisFacts.missedOpportunityCp, 460);
  assert.equal(events[0].evidence?.kind, 'line');
  assert.equal(events[0].analysisFacts.isCapture, true);
  assert.ok(events.some(event => event.eventType === 'material_trade'));
  const renderedMissedTactic = i18n.renderCoachEvent(events[0], 'en');
  assert.equal(renderedMissedTactic.evidence?.kind, 'line');
  assert.equal(renderedMissedTactic.evidence?.actionLabel, 'Show');
  assert.equal(renderedMissedTactic.evidence?.title, 'Show the line');
  assert.match(renderedMissedTactic.evidence?.summary ?? '', /key sequence is Bxf7\+ Kxf7 Qxd5\+/);
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
    ['great_move', 'missed_tactic', 'game_turning_point', 'missed_win', 'blunder', 'material_trade']
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

test('pawn-structure detector flags doubled pawns and passed pawns', () => {
  const doubledEvents = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-10',
    moveSan: 'cxd3',
    plyIndex: 18,
    playedBy: 'white',
    phase: 'middlegame',
    beforeFen: '4k3/8/8/8/3P4/3p4/2P5/4K3 w - - 0 1',
    beforeEvalCp: 20,
    afterPlayedEvalCp: -60,
    afterBestEvalCp: -60,
    bestMoveSan: 'cxd3',
  });
  const doubledEvent = doubledEvents.find(
    event => event.analysisFacts.candidateReason === 'doubled_pawn_created'
  );

  assert.ok(doubledEvent);
  assert.equal(doubledEvent.eventType, 'pawn_structure');
  assert.equal(doubledEvent.analysisFacts.pawnStructureIssue, 'doubled_pawn');
  assert.equal(doubledEvent.analysisFacts.pawnStructureSquare, 'd3');
  assert.equal(doubledEvent.evidence?.kind, 'square');

  const passedEvents = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-11',
    moveSan: 'dxe6',
    plyIndex: 34,
    playedBy: 'white',
    phase: 'endgame',
    beforeFen: '4k3/8/2p1p3/3P4/8/8/8/4K3 w - - 0 1',
    beforeEvalCp: 80,
    afterPlayedEvalCp: 180,
    afterBestEvalCp: 180,
    bestMoveSan: 'dxe6',
  });
  const passedEvent = passedEvents.find(
    event => event.analysisFacts.candidateReason === 'passed_pawn_created'
  );

  assert.ok(passedEvent);
  assert.equal(passedEvent.eventType, 'conversion');
  assert.equal(passedEvent.analysisFacts.passedPawnSquare, 'e6');
  assert.equal(passedEvent.analysisFacts.passedPawnRank, 6);
  assert.equal(passedEvent.evidence?.kind, 'square');
});

test('coach composition combines a primary lesson with a complementary note', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-12',
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
  const secondary = core.selectComplementaryGameAnalysisEvent(events);
  const rendered = i18n.renderCoachEventComposition({
    primary: events[0],
    secondary,
    locale: 'en',
  });

  assert.ok(secondary);
  assert.notEqual(secondary.eventType, events[0].eventType);
  assert.ok(rendered.secondary);
  assert.match(rendered.message, /Also:/);
  assert.match(rendered.spokenText, /Also:/);
});

test('PGN parser builds a structure-only analyzed game timeline', () => {
  const game = core.buildAnalyzedGameFromPgn({
    id: 'game-13',
    pgn: '1. Nf3 d5 2. g3',
  });
  const events = core.buildGameAnalysisMoveEventsFromAnalyzedGameMove({
    game,
    move: game.moves[0],
  });

  assert.equal(game.moves.length, 3);
  assert.equal(game.moves[0].san, 'Nf3');
  assert.equal(game.moves[0].beforeFen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(game.moves[0].hasEngineAnalysis, false);
  assert.ok(events.some(event => event.eventType === 'development'));
  assert.ok(!events.some(event => event.eventType === 'best_move'));
});

test('move conversion helpers keep engine UCI output inside core', () => {
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const sanMove = core.applySanMoveToFen(startFen, 'Nf3');
  const uciMove = core.applyUciMoveToFen(startFen, 'g1f3');
  const line = core.buildSanLineFromUci({
    fen: startFen,
    uciMoves: ['g1f3', 'g8f6', 'e2e4'],
    startPlyIndex: 0,
  });

  assert.equal(sanMove.san, 'Nf3');
  assert.equal(sanMove.afterFen, uciMove.afterFen);
  assert.equal(uciMove.san, 'Nf3');
  assert.deepEqual(
    line.map(move => move.san),
    ['Nf3', 'Nf6', 'e4']
  );
  assert.equal(line[0].isKeyMove, true);
  assert.equal(line[1].side, 'black');
});

test('engine params emit turning-point and advantage-loss events', () => {
  const positiveSwing = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-14',
    moveSan: 'Qh5',
    plyIndex: 22,
    playedBy: 'white',
    phase: 'middlegame',
    beforeEvalCp: -120,
    afterPlayedEvalCp: 220,
    afterBestEvalCp: 230,
    bestMoveSan: 'Qh5',
  });
  assert.equal(positiveSwing[0].eventType, 'game_turning_point');
  assert.equal(positiveSwing[0].analysisFacts.candidateReason, 'eval_leader_changed');

  const lostAdvantage = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-15',
    moveSan: 'Qxd5',
    plyIndex: 24,
    playedBy: 'white',
    phase: 'middlegame',
    beforeEvalCp: 260,
    afterPlayedEvalCp: -80,
    afterBestEvalCp: 260,
    bestMoveSan: 'Bxf7+',
  });
  assert.ok(lostAdvantage.some(event => event.eventType === 'advantage_lost'));
  assert.ok(lostAdvantage.some(event => event.eventType === 'game_turning_point'));
});

test('multipv gaps emit only-move and defensive-resource events', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-16',
    moveSan: 'Kg1',
    plyIndex: 30,
    playedBy: 'white',
    phase: 'middlegame',
    beforeEvalCp: -260,
    afterPlayedEvalCp: -20,
    afterBestEvalCp: -20,
    bestMoveSan: 'Kg1',
    bestMoveAlternatives: [
      { san: 'Kg1', evalCp: -20 },
      { san: 'Kh2', evalCp: -260 },
    ],
  });

  assert.ok(events.some(event => event.eventType === 'defensive_resource'));
  assert.ok(events.some(event => event.eventType === 'only_move'));
  assert.equal(events[0].analysisFacts.bestMoveGapCp, 240);
});

test('winning captures emit simplification and endgame-transition events', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-17',
    moveSan: 'Qxd5',
    plyIndex: 66,
    playedBy: 'white',
    phase: 'endgame',
    beforeFen: '4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1',
    beforeEvalCp: 300,
    afterPlayedEvalCp: 330,
    afterBestEvalCp: 335,
    bestMoveSan: 'Qxd5',
  });

  assert.ok(events.some(event => event.eventType === 'time_to_simplify'));
  assert.ok(events.some(event => event.eventType === 'endgame_transition'));
  assert.ok(events.some(event => event.eventType === 'advantage_preserved'));
});

test('motif detector tags played fork and pin tactics', () => {
  const forkEvents = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-18',
    moveSan: 'Nf7',
    plyIndex: 20,
    playedBy: 'white',
    phase: 'middlegame',
    beforeFen: '3qk2r/8/7N/8/8/8/8/4K3 w - - 0 1',
    beforeEvalCp: 0,
    afterPlayedEvalCp: 220,
    afterBestEvalCp: 220,
    bestMoveSan: 'Nf7',
  });
  const fork = forkEvents.find(event => event.analysisFacts.playedTacticalMotif === 'fork');
  assert.ok(fork);
  assert.equal(fork.eventType, 'tactic_found');
  assert.ok(fork.themeTags.includes('fork'));
  assert.deepEqual(fork.analysisFacts.playedTacticalMotifTargets, ['d8', 'h8']);
  const renderedFork = i18n.renderCoachEvent(fork, 'en');
  assert.equal(renderedFork.messageKey, 'coach.event.tactic_found.motif_message');
  assert.match(renderedFork.message, /finds the fork/);
  assert.match(renderedFork.spokenText, /fork/);

  const pinEvents = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-19',
    moveSan: 'Bb5',
    plyIndex: 10,
    playedBy: 'white',
    phase: 'opening',
    beforeFen: '4k3/8/2n5/8/8/8/4B3/4K3 w - - 0 1',
    beforeEvalCp: 20,
    afterPlayedEvalCp: 110,
    afterBestEvalCp: 110,
    bestMoveSan: 'Bb5',
  });
  const pin = pinEvents.find(event => event.analysisFacts.playedTacticalMotif === 'pin');
  assert.ok(pin);
  assert.equal(pin.eventType, 'tactic_found');
  assert.ok(pin.themeTags.includes('pin'));
  assert.deepEqual(pin.analysisFacts.playedTacticalMotifTargets, ['c6', 'e8']);
});

test('motif detector tags missed tactical motif on best move', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-20',
    moveSan: 'Kd2',
    plyIndex: 20,
    playedBy: 'white',
    phase: 'middlegame',
    beforeFen: '3qk2r/8/7N/8/8/8/8/4K3 w - - 0 1',
    beforeEvalCp: 0,
    afterPlayedEvalCp: 0,
    afterBestEvalCp: 220,
    bestMoveSan: 'Nf7',
  });
  const missedFork = events.find(event => event.analysisFacts.bestMoveTacticalMotif === 'fork');
  assert.ok(missedFork);
  assert.equal(missedFork.eventType, 'missed_tactic');
  assert.equal(missedFork.analysisFacts.candidateReason, 'missed_fork');
  assert.ok(missedFork.themeTags.includes('fork'));
  const renderedMissedFork = i18n.renderCoachEvent(missedFork, 'en');
  assert.equal(renderedMissedFork.messageKey, 'coach.event.missed_tactic.motif_message');
  assert.match(renderedMissedFork.message, /There was a fork here/);
  assert.match(renderedMissedFork.spokenText, /fork/);
  assert.equal(renderedMissedFork.evidence?.kind, 'single_move');
  assert.equal(renderedMissedFork.evidence?.title, 'Show the move');
  assert.match(renderedMissedFork.evidence?.summary ?? '', /creates the fork/);
});

test('mixed missed tactic and blunder keeps tactic primary and severity secondary', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-21',
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
  });
  const secondary = core.selectComplementaryGameAnalysisEvent(events);

  assert.equal(events[0].eventType, 'missed_tactic');
  assert.equal(events[0].classification, 'miss');
  assert.equal(events[0].evidence?.kind, 'line');
  assert.equal(secondary?.eventType, 'blunder');
  assert.equal(secondary?.classification, 'blunder');
});

test('missed mate is always the primary lesson', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-22',
    moveSan: 'Qf6',
    plyIndex: 42,
    playedBy: 'white',
    phase: 'endgame',
    beforeFen: '7k/6Q1/6K1/8/8/8/8/8 w - - 0 1',
    beforeEvalCp: 700,
    afterPlayedEvalCp: 100,
    afterBestEvalCp: 3000,
    bestMoveSan: 'Qf8#',
  });
  const rendered = i18n.renderCoachEvent(events[0], 'en');

  assert.equal(events[0].eventType, 'missed_win');
  assert.equal(events[0].analysisFacts.bestMoveGivesCheckmate, true);
  assert.equal(events[0].analysisFacts.candidateReason, 'missed_forced_mate');
  assert.equal(events[0].evidence?.kind, 'single_move');
  assert.equal(rendered.spokenTextKey, 'coach.spoken.event.missed_win');
  assert.match(rendered.spokenText, /queen to f eight/);
});

test('move allowing mate is primary danger with opponent-reply evidence', () => {
  const events = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-23',
    moveSan: 'g4',
    plyIndex: 4,
    playedBy: 'white',
    phase: 'opening',
    beforeFen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2',
    beforeEvalCp: -50,
    afterPlayedEvalCp: -900,
    afterBestEvalCp: 0,
    bestMoveSan: 'e4',
  });
  const rendered = i18n.renderCoachEvent(events[0], 'en');

  assert.equal(events[0].eventType, 'opponent_threat');
  assert.equal(events[0].analysisFacts.opponentThreatGivesCheckmate, true);
  assert.equal(events[0].analysisFacts.opponentThreatMoveSan, 'Qh4#');
  assert.equal(events[0].evidence?.kind, 'single_move');
  assert.equal(rendered.spokenTextKey, 'coach.spoken.event.opponent_threat');
  assert.match(rendered.spokenText, /queen to h four/);
});

test('spoken SAN conversion produces chess-readable move phrases', () => {
  const knightEvent = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-24',
    moveSan: 'Nf3',
    plyIndex: 1,
    playedBy: 'white',
    phase: 'opening',
    beforeEvalCp: 0,
    afterPlayedEvalCp: 20,
    afterBestEvalCp: 20,
    bestMoveSan: 'Nf3',
  })[0];
  const missedCapture = core.buildGameAnalysisMoveEventsFromEngine({
    gameId: 'game-24',
    moveSan: 'h3',
    plyIndex: 20,
    playedBy: 'white',
    phase: 'middlegame',
    beforeEvalCp: 40,
    afterPlayedEvalCp: -120,
    afterBestEvalCp: 260,
    bestMoveSan: 'Qxf7+',
  })[0];
  const renderedKnight = i18n.renderCoachEvent(knightEvent, 'en');
  const renderedMissedCapture = i18n.renderCoachEvent(missedCapture, 'en');

  assert.match(renderedKnight.spokenText, /knight to f three/);
  assert.match(renderedMissedCapture.spokenText, /queen captures on f seven/);
});

test('analyzed-game summaries emit phase and game recap events', () => {
  const game = {
    id: 'game-25',
    moves: [
      {
        san: 'Nf3',
        plyIndex: 1,
        playedBy: 'white',
        phase: 'opening',
        beforeFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        beforeEvalCp: 0,
        afterPlayedEvalCp: 20,
        afterBestEvalCp: 20,
        bestMoveSan: 'Nf3',
      },
      {
        san: 'Qxd5',
        plyIndex: 24,
        playedBy: 'white',
        phase: 'middlegame',
        beforeFen: '4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1',
        beforeEvalCp: 260,
        afterPlayedEvalCp: -80,
        afterBestEvalCp: 260,
        bestMoveSan: 'Bxf7+',
      },
    ],
  };
  const summaryEvents = core.buildGameAnalysisSummaryEvents({ game, persona: 'beginner' });
  const allEvents = core.buildGameAnalysisEventsFromAnalyzedGame({
    game,
    persona: 'beginner',
    includeSummaries: true,
  });
  const gameSummary = summaryEvents.find(event => event.eventType === 'game_summary');
  const renderedGameSummary = i18n.renderCoachEvent(gameSummary, 'en');

  assert.equal(summaryEvents.filter(event => event.eventType === 'phase_summary').length, 2);
  assert.ok(gameSummary);
  assert.equal(gameSummary.persona, 'beginner');
  assert.equal(gameSummary.classification, 'complete');
  assert.equal(gameSummary.analysisFacts.worstMoveSan, 'Qxd5');
  assert.ok(allEvents.some(event => event.eventType === 'game_summary'));
  assert.equal(renderedGameSummary.spokenTextKey, 'coach.spoken.event.game_summary');
  assert.match(renderedGameSummary.message, /main lesson from this game/);
});

console.log('Coach contract tests passed.');
