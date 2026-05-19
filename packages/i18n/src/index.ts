import {
  COACH_CLASSIFICATIONS,
  COACH_EVENT_TYPES,
  type CoachClassification,
  type CoachEvent,
  type CoachEvidence,
  type CoachPersona,
  type CoachTone,
  getCoachEventMessageFallbacks,
  getCoachEventSpokenFallbacks,
} from '@firstmove/core';

export const DEFAULT_LOCALE = 'en' as const;

export const SUPPORTED_LOCALES = ['en'] as const;

export type FirstMoveLocale = (typeof SUPPORTED_LOCALES)[number];

export type CoachMessageVariables = Record<string, string | number | boolean | null | undefined>;

export const EN_MESSAGES = {
  'coach.event.generic.message': '{moveSan} is the key move in this position.',
  'coach.composition.secondary': 'Also: {secondaryMessage}',
  'coach.evidence.action_label': 'Show',
  'coach.evidence.line.title': 'Show the line',
  'coach.evidence.line.summary': 'The key sequence is {lineSan}.',
  'coach.evidence.line.motif_summary': 'The {tacticMotifLabel} works through {lineSan}.',
  'coach.evidence.single_move.title': 'Show the move',
  'coach.evidence.single_move.summary': '{evidenceMoveSan} is the move that makes the idea work.',
  'coach.evidence.single_move.motif_summary':
    '{evidenceMoveSan} is the move that creates the {tacticMotifLabel}.',
  'coach.evidence.square.title': 'Show the square',
  'coach.evidence.square.summary': 'Focus on {evidenceSquares}.',
  'coach.evidence.piece.title': 'Show the piece',
  'coach.evidence.piece.summary': 'The important piece detail is {evidencePieces}.',
  'coach.evidence.plan.title': 'Show the plan',
  'coach.evidence.plan.summary': '{planSummary}',

  'coach.label.brilliant': 'Brilliant',
  'coach.label.great': 'Great',
  'coach.label.book': 'Book',
  'coach.label.setup': 'Setup',
  'coach.label.forcing': 'Forcing',
  'coach.label.payoff': 'Payoff',
  'coach.label.best': 'Best',
  'coach.label.excellent': 'Excellent',
  'coach.label.good': 'Good',
  'coach.label.inaccuracy': 'Inaccuracy',
  'coach.label.mistake': 'Mistake',
  'coach.label.blunder': 'Blunder',
  'coach.label.miss': 'Miss',
  'coach.label.wrong': 'Try again',
  'coach.label.complete': 'Complete',

  'coach.title.brilliant': 'Brilliant idea',
  'coach.title.great': 'Great move',
  'coach.title.book': 'Good opening move',
  'coach.title.setup': 'Build the structure',
  'coach.title.forcing': 'Keep the initiative',
  'coach.title.payoff': 'Tactical idea',
  'coach.title.best': 'Best move',
  'coach.title.excellent': 'Excellent move',
  'coach.title.good': 'Good move',
  'coach.title.inaccuracy': 'A little imprecise',
  'coach.title.mistake': 'This loses ground',
  'coach.title.blunder': 'Major problem',
  'coach.title.miss': 'Missed opportunity',
  'coach.title.wrong': 'Not this move',
  'coach.title.complete': 'Line complete',

  'coach.event.opening_principle.message':
    '{moveSan} follows an important opening principle in this position.',
  'coach.event.opening_book_move.message':
    '{moveSan} fits the line in {variationName}. Keep following the opening plan.',
  'coach.event.opening_setup.message':
    'Nice quiet move. {moveSan} prepares the position before you start forcing things.',
  'coach.event.opening_forcing.message':
    'Now you are asking a direct question. {moveSan} limits the replies and keeps the initiative with you.',
  'coach.event.opening_deviation.message':
    '{moveSan} leaves the main line. Now the important question is whether the idea still holds together.',
  'coach.event.tactical_payoff.message':
    'That is the point of the line. {moveSan} turns the pressure into something concrete.',
  'coach.event.wrong_move.message':
    '{attemptedSan} is not the move for this position. In {variationName}, look for {expectedSan}.',
  'coach.event.wrong_move.generic_message':
    'That is not the move for this position. In {variationName}, look for {expectedSan}.',
  'coach.event.line_complete.message': 'Nice work, that finishes the line.',
  'coach.event.eval_gain.message':
    'The engine likes the progress: after {moveSan}, your position reaches {evalPawns}.',
  'coach.event.eval_loss.message':
    '{moveSan} gives up some ground. The position is still {evalPawns}, but be precise from here.',
  'coach.event.advantage_gained.message':
    '{moveSan} changes the position in your favor. You have created a real advantage.',
  'coach.event.advantage_lost.message':
    '{moveSan} lets the advantage slip. Look for a more forcing or safer continuation.',
  'coach.event.advantage_preserved.message':
    '{moveSan} keeps the advantage without giving the opponent counterplay.',
  'coach.event.missed_win.message':
    'There was a winning chance here. {bestMoveSan} was the move to look for.',
  'coach.event.missed_win.motif_message':
    'There was a winning {tacticMotifLabel} here. {bestMoveSan} was the move to look for.',
  'coach.event.missed_tactic.message':
    'There was a tactic here. {bestMoveSan} would have created a stronger practical chance.',
  'coach.event.missed_tactic.motif_message':
    'There was a {tacticMotifLabel} here. {bestMoveSan} was the move to look for.',
  'coach.event.tactic_found.message':
    '{moveSan} finds the tactic. The position now has a concrete payoff.',
  'coach.event.tactic_found.motif_message':
    '{moveSan} finds the {tacticMotifLabel}. That is the concrete point of the position.',
  'coach.event.best_move.message': '{moveSan} is the best move in this position.',
  'coach.event.only_move.message':
    '{moveSan} is important because it keeps the position together when other moves fail.',
  'coach.event.brilliant_move.message':
    '{moveSan} is a rare resource. It solves the position while creating a concrete threat.',
  'coach.event.great_move.message':
    '{moveSan} is a strong practical move that improves your position immediately.',
  'coach.event.good_move.message': '{moveSan} is a solid move that keeps your position healthy.',
  'coach.event.inaccuracy.message':
    '{moveSan} is a little imprecise. The position is playable, but there was a cleaner choice.',
  'coach.event.mistake.message':
    '{moveSan} gives the opponent a real chance. Recheck the tactical and defensive details.',
  'coach.event.blunder.message':
    '{moveSan} is a serious problem. The position needed immediate attention.',
  'coach.event.hanging_material.message':
    '{moveSan} leaves {targetPiece} on {targetSquare} hanging. The opponent can aim at that material now.',
  'coach.event.loose_piece.message':
    '{moveSan} leaves {targetPiece} on {targetSquare} under pressure. Check whether it is defended enough.',
  'coach.event.opponent_threat.message':
    '{moveSan} allows {threatMoveSan}. That reply creates an immediate threat you need to account for.',
  'coach.event.king_safety.message':
    '{moveSan} changes the king-safety picture. Watch the threats around the king.',
  'coach.event.development.message':
    '{moveSan} improves development and brings another piece into the game.',
  'coach.event.center_control.message':
    '{moveSan} fights for the center and limits the opponent’s freedom.',
  'coach.event.piece_activity.message':
    '{moveSan} improves piece activity and makes your next moves easier to find.',
  'coach.event.pawn_structure.message':
    '{moveSan} changes the pawn structure. The long-term weaknesses now matter.',
  'coach.event.material_trade.message':
    '{moveSan} changes the material balance. Make sure the resulting position favors you.',
  'coach.event.defensive_resource.message':
    '{moveSan} is the defensive resource that keeps the position under control.',
  'coach.event.conversion.message':
    '{moveSan} helps convert the advantage instead of letting the opponent create counterplay.',
  'coach.event.endgame_transition.message':
    '{moveSan} steers the game toward an endgame. The resulting structure matters now.',
  'coach.event.time_to_simplify.message':
    '{moveSan} is a moment to simplify. Trading can make the advantage easier to convert.',
  'coach.event.game_turning_point.message':
    '{moveSan} is a turning point. The evaluation and practical plans change here.',
  'coach.event.phase_summary.message': 'In this phase, the key pattern was {summaryTheme}.',
  'coach.event.game_summary.message': 'The main lesson from this game is {summaryTheme}.',

  'coach.motif.fork': 'fork',
  'coach.motif.pin': 'pin',
  'coach.motif.skewer': 'skewer',
  'coach.motif.discovered_attack': 'discovered attack',
  'coach.motif.trapped_piece': 'trapped piece',
  'coach.motif.back_rank': 'back-rank idea',

  'coach.spoken.event': '{label}. {title}. {message}',
  'coach.spoken.wrong_move': 'Try again. {message}',

  'coach.persona.friendly.spoken.event': '{label}. {title}. {message}',
  'coach.persona.strict.spoken.event': '{label}. {message}',
  'coach.persona.calm.spoken.event': '{title}. {message}',
  'coach.persona.hype.spoken.event': '{label}. {message}',
  'coach.persona.beginner.spoken.event': '{title}. {message}',
  'coach.persona.technical.spoken.event': '{label}. {title}. {message}',
} as const;

export const MESSAGES_BY_LOCALE = {
  en: EN_MESSAGES,
} as const;

export type I18nMessageKey = keyof typeof EN_MESSAGES;

export interface RenderedCoachEvent {
  id: string;
  event: CoachEvent;
  classification: CoachClassification;
  labelKey: I18nMessageKey;
  label: string;
  titleKey: I18nMessageKey;
  title: string;
  messageKey: I18nMessageKey;
  spokenTextKey: I18nMessageKey;
  variables: CoachMessageVariables;
  message: string;
  spokenText: string;
  tone: CoachTone;
  persona: CoachPersona;
  evidence?: RenderedCoachEvidence;
  secondary?: {
    id: string;
    event: CoachEvent;
    classification: CoachClassification;
    label: string;
    title: string;
    message: string;
    tone: CoachTone;
  };
}

export type RenderedCoachEvidence =
  | {
      kind: 'line';
      actionLabel: string;
      title: string;
      summary?: string;
      moves: CoachEvidenceMoveRender[];
    }
  | {
      kind: 'single_move';
      actionLabel: string;
      title: string;
      summary?: string;
      move: CoachEvidenceMoveRender;
    }
  | {
      kind: 'square';
      actionLabel: string;
      title: string;
      summary?: string;
      squares: string[];
    }
  | {
      kind: 'piece';
      actionLabel: string;
      title: string;
      summary?: string;
      pieces: Array<{ square: string; role: string }>;
    }
  | {
      kind: 'plan';
      actionLabel: string;
      title: string;
      summary: string;
      keyMove?: string;
      targetSquares?: string[];
    };

export interface CoachEvidenceMoveRender {
  san: string;
  side?: 'white' | 'black';
  plyIndex?: number;
  comment?: string;
  evalCp?: number;
  isKeyMove?: boolean;
}

const COACH_CLASSIFICATION_PRESENTATION = {
  brilliant: {
    labelKey: 'coach.label.brilliant',
    titleKey: 'coach.title.brilliant',
    tone: 'payoff',
  },
  great: {
    labelKey: 'coach.label.great',
    titleKey: 'coach.title.great',
    tone: 'positive',
  },
  book: {
    labelKey: 'coach.label.book',
    titleKey: 'coach.title.book',
    tone: 'neutral',
  },
  setup: {
    labelKey: 'coach.label.setup',
    titleKey: 'coach.title.setup',
    tone: 'neutral',
  },
  forcing: {
    labelKey: 'coach.label.forcing',
    titleKey: 'coach.title.forcing',
    tone: 'positive',
  },
  payoff: {
    labelKey: 'coach.label.payoff',
    titleKey: 'coach.title.payoff',
    tone: 'payoff',
  },
  best: {
    labelKey: 'coach.label.best',
    titleKey: 'coach.title.best',
    tone: 'positive',
  },
  excellent: {
    labelKey: 'coach.label.excellent',
    titleKey: 'coach.title.excellent',
    tone: 'positive',
  },
  good: {
    labelKey: 'coach.label.good',
    titleKey: 'coach.title.good',
    tone: 'positive',
  },
  inaccuracy: {
    labelKey: 'coach.label.inaccuracy',
    titleKey: 'coach.title.inaccuracy',
    tone: 'warning',
  },
  mistake: {
    labelKey: 'coach.label.mistake',
    titleKey: 'coach.title.mistake',
    tone: 'negative',
  },
  blunder: {
    labelKey: 'coach.label.blunder',
    titleKey: 'coach.title.blunder',
    tone: 'negative',
  },
  miss: {
    labelKey: 'coach.label.miss',
    titleKey: 'coach.title.miss',
    tone: 'warning',
  },
  wrong: {
    labelKey: 'coach.label.wrong',
    titleKey: 'coach.title.wrong',
    tone: 'negative',
  },
  complete: {
    labelKey: 'coach.label.complete',
    titleKey: 'coach.title.complete',
    tone: 'complete',
  },
} as const satisfies Record<
  CoachClassification,
  { labelKey: I18nMessageKey; titleKey: I18nMessageKey; tone: CoachTone }
>;

type CoachTacticalMotif =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered_attack'
  | 'trapped_piece'
  | 'back_rank';

const COACH_TACTICAL_MOTIF_LABEL_KEYS = {
  fork: 'coach.motif.fork',
  pin: 'coach.motif.pin',
  skewer: 'coach.motif.skewer',
  discovered_attack: 'coach.motif.discovered_attack',
  trapped_piece: 'coach.motif.trapped_piece',
  back_rank: 'coach.motif.back_rank',
} as const satisfies Record<CoachTacticalMotif, I18nMessageKey>;

const COACH_TACTICAL_MOTIF_MESSAGE_KEYS = {
  missed_win: 'coach.event.missed_win.motif_message',
  missed_tactic: 'coach.event.missed_tactic.motif_message',
  tactic_found: 'coach.event.tactic_found.motif_message',
} as const satisfies Partial<Record<CoachEvent['eventType'], I18nMessageKey>>;

function isCoachTacticalMotif(value: unknown): value is CoachTacticalMotif {
  return typeof value === 'string' && value in COACH_TACTICAL_MOTIF_LABEL_KEYS;
}

export function isSupportedLocale(value: string): value is FirstMoveLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(locale?: string | null): FirstMoveLocale {
  if (!locale) return DEFAULT_LOCALE;
  const normalized = locale.replace('_', '-');
  if (isSupportedLocale(normalized)) return normalized;
  const language = normalized.split('-')[0];
  if (isSupportedLocale(language)) return language;
  return DEFAULT_LOCALE;
}

export function getMessageTemplate(key: I18nMessageKey, locale: string = DEFAULT_LOCALE) {
  const resolvedLocale = resolveLocale(locale);
  return MESSAGES_BY_LOCALE[resolvedLocale][key] ?? EN_MESSAGES[key];
}

export function formatMessage(
  key: I18nMessageKey,
  variables: CoachMessageVariables = {},
  locale: string = DEFAULT_LOCALE
) {
  const template = getMessageTemplate(key, locale);
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, variableName: string) => {
    const value = variables[variableName];
    if (value === null || typeof value === 'undefined') return match;
    return String(value);
  });
}

function isMessageKey(value: string): value is I18nMessageKey {
  return value in EN_MESSAGES;
}

function getCoachEventTacticalMotif(event: CoachEvent): CoachTacticalMotif | null {
  const variableMotif = event.variables.tacticMotif;
  if (isCoachTacticalMotif(variableMotif)) return variableMotif;

  const bestMoveMotif = event.analysisFacts.bestMoveTacticalMotif;
  if (isCoachTacticalMotif(bestMoveMotif)) return bestMoveMotif;

  const playedMotif = event.analysisFacts.playedTacticalMotif;
  if (isCoachTacticalMotif(playedMotif)) return playedMotif;

  for (const themeTag of event.themeTags) {
    if (isCoachTacticalMotif(themeTag)) return themeTag;
  }

  return null;
}

function getCoachEventMotifMessageKey(event: CoachEvent): I18nMessageKey | null {
  if (!getCoachEventTacticalMotif(event)) return null;
  if (!(event.eventType in COACH_TACTICAL_MOTIF_MESSAGE_KEYS)) return null;

  const key =
    COACH_TACTICAL_MOTIF_MESSAGE_KEYS[
      event.eventType as keyof typeof COACH_TACTICAL_MOTIF_MESSAGE_KEYS
    ];
  return key && isMessageKey(key) ? key : null;
}

function joinEvidenceMoves(evidence: Extract<CoachEvidence, { kind: 'line' }>) {
  return evidence.moves.map(move => move.san).join(' ');
}

function joinEvidenceSquares(squares: readonly string[]) {
  return squares.join(', ');
}

function joinEvidencePieces(pieces: ReadonlyArray<{ square: string; role: string }>) {
  return pieces.map(piece => `${piece.role} on ${piece.square}`).join(', ');
}

function renderCoachEvidence({
  evidence,
  locale,
  variables,
}: {
  evidence: CoachEvidence | undefined;
  locale: string;
  variables: CoachMessageVariables;
}): RenderedCoachEvidence | undefined {
  if (!evidence) return undefined;

  const actionLabel = formatMessage('coach.evidence.action_label', {}, locale);

  if (evidence.kind === 'line') {
    const lineSan = joinEvidenceMoves(evidence);
    const summaryKey = variables.tacticMotifLabel
      ? 'coach.evidence.line.motif_summary'
      : 'coach.evidence.line.summary';
    return {
      kind: evidence.kind,
      actionLabel,
      title: formatMessage('coach.evidence.line.title', variables, locale),
      summary: formatMessage(summaryKey, { ...variables, lineSan }, locale),
      moves: evidence.moves,
    };
  }

  if (evidence.kind === 'single_move') {
    const evidenceMoveSan = evidence.move.san;
    const summaryKey = variables.tacticMotifLabel
      ? 'coach.evidence.single_move.motif_summary'
      : 'coach.evidence.single_move.summary';
    return {
      kind: evidence.kind,
      actionLabel,
      title: formatMessage('coach.evidence.single_move.title', variables, locale),
      summary: formatMessage(summaryKey, { ...variables, evidenceMoveSan }, locale),
      move: evidence.move,
    };
  }

  if (evidence.kind === 'square') {
    return {
      kind: evidence.kind,
      actionLabel,
      title: formatMessage('coach.evidence.square.title', variables, locale),
      summary: formatMessage(
        'coach.evidence.square.summary',
        { ...variables, evidenceSquares: joinEvidenceSquares(evidence.squares) },
        locale
      ),
      squares: evidence.squares,
    };
  }

  if (evidence.kind === 'piece') {
    return {
      kind: evidence.kind,
      actionLabel,
      title: formatMessage('coach.evidence.piece.title', variables, locale),
      summary: formatMessage(
        'coach.evidence.piece.summary',
        { ...variables, evidencePieces: joinEvidencePieces(evidence.pieces) },
        locale
      ),
      pieces: evidence.pieces,
    };
  }

  return {
    kind: evidence.kind,
    actionLabel,
    title: formatMessage('coach.evidence.plan.title', variables, locale),
    summary: formatMessage(
      'coach.evidence.plan.summary',
      { ...variables, planSummary: evidence.summary },
      locale
    ),
    keyMove: evidence.keyMove,
    targetSquares: evidence.targetSquares,
  };
}

export function getCoachEventMessageKey(event: CoachEvent): I18nMessageKey {
  if (isMessageKey(event.messageKey)) return event.messageKey;
  const motifMessageKey = getCoachEventMotifMessageKey(event);
  if (motifMessageKey) return motifMessageKey;
  return firstExistingMessageKey(
    getCoachEventMessageFallbacks(event.eventType, event.persona ?? 'neutral')
  );
}

export function getCoachEventSpokenKey(event: CoachEvent): I18nMessageKey {
  if (isMessageKey(event.spokenKey)) return event.spokenKey;
  if (event.eventType === 'wrong_move') return 'coach.spoken.wrong_move';
  return 'coach.spoken.event';
}

function firstExistingMessageKey(keys: readonly string[]): I18nMessageKey {
  for (const key of keys) {
    if (isMessageKey(key)) return key;
  }
  return 'coach.event.generic.message';
}

export function renderCoachEvent(
  event: CoachEvent,
  locale: string = DEFAULT_LOCALE,
  persona: CoachPersona = event.persona ?? 'neutral'
): RenderedCoachEvent {
  const presentation = COACH_CLASSIFICATION_PRESENTATION[event.classification];
  const tacticMotif = getCoachEventTacticalMotif(event);
  const tacticMotifLabel = tacticMotif
    ? formatMessage(COACH_TACTICAL_MOTIF_LABEL_KEYS[tacticMotif], {}, locale)
    : null;
  const variables = {
    ...event.variables,
    tacticMotif,
    tacticMotifLabel,
  };
  const messageKey = isMessageKey(event.messageKey)
    ? event.messageKey
    : getCoachEventMotifMessageKey(event) ??
      firstExistingMessageKey(getCoachEventMessageFallbacks(event.eventType, persona));
  const spokenTextKey = isMessageKey(event.spokenKey)
    ? event.spokenKey
    : firstExistingMessageKey(getCoachEventSpokenFallbacks(event.eventType, persona));
  const label = formatMessage(presentation.labelKey, {}, locale);
  const title = formatMessage(presentation.titleKey, {}, locale);
  const message = formatMessage(messageKey, variables, locale);
  const spokenText = formatMessage(spokenTextKey, { label, title, message }, locale);
  const evidence = renderCoachEvidence({
    evidence: event.evidence,
    locale,
    variables,
  });

  return {
    id: event.id,
    event,
    classification: event.classification,
    labelKey: presentation.labelKey,
    label,
    titleKey: presentation.titleKey,
    title,
    messageKey,
    spokenTextKey,
    variables,
    message,
    spokenText,
    tone: event.tone,
    persona,
    evidence,
  };
}

export function renderCoachEventComposition({
  primary,
  secondary,
  locale = DEFAULT_LOCALE,
  persona = primary.persona ?? 'neutral',
}: {
  primary: CoachEvent;
  secondary?: CoachEvent | null;
  locale?: string;
  persona?: CoachPersona;
}): RenderedCoachEvent {
  const renderedPrimary = renderCoachEvent(primary, locale, persona);
  if (!secondary) return renderedPrimary;

  const renderedSecondary = renderCoachEvent(secondary, locale, persona);
  const secondaryNote = formatMessage(
    'coach.composition.secondary',
    { secondaryMessage: renderedSecondary.message },
    locale
  );
  const message = `${renderedPrimary.message} ${secondaryNote}`;
  const spokenText = formatMessage(
    renderedPrimary.spokenTextKey,
    {
      label: renderedPrimary.label,
      title: renderedPrimary.title,
      message,
    },
    locale
  );

  return {
    ...renderedPrimary,
    message,
    spokenText,
    secondary: {
      id: renderedSecondary.id,
      event: renderedSecondary.event,
      classification: renderedSecondary.classification,
      label: renderedSecondary.label,
      title: renderedSecondary.title,
      message: renderedSecondary.message,
      tone: renderedSecondary.tone,
    },
  };
}

export const REQUIRED_COACH_MESSAGE_KEYS = [
  ...COACH_CLASSIFICATIONS.flatMap(classification => [
    `coach.label.${classification}`,
    `coach.title.${classification}`,
  ]),
  ...COACH_EVENT_TYPES.map(eventType => `coach.event.${eventType}.message`),
  'coach.composition.secondary',
  'coach.evidence.action_label',
  'coach.evidence.line.title',
  'coach.evidence.line.summary',
  'coach.evidence.line.motif_summary',
  'coach.evidence.single_move.title',
  'coach.evidence.single_move.summary',
  'coach.evidence.single_move.motif_summary',
  'coach.evidence.square.title',
  'coach.evidence.square.summary',
  'coach.evidence.piece.title',
  'coach.evidence.piece.summary',
  'coach.evidence.plan.title',
  'coach.evidence.plan.summary',
  'coach.event.generic.message',
  'coach.spoken.event',
  'coach.spoken.wrong_move',
] as const;
