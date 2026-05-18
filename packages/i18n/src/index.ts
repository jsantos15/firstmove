import {
  COACH_CLASSIFICATIONS,
  COACH_EVENT_TYPES,
  type CoachClassification,
  type CoachEvent,
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
  'coach.event.missed_tactic.message':
    'There was a tactic here. {bestMoveSan} would have created a stronger practical chance.',
  'coach.event.tactic_found.message':
    '{moveSan} finds the tactic. The position now has a concrete payoff.',
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

export function getCoachEventMessageKey(event: CoachEvent): I18nMessageKey {
  if (isMessageKey(event.messageKey)) return event.messageKey;
  return 'coach.event.generic.message';
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
  const messageKey = isMessageKey(event.messageKey)
    ? event.messageKey
    : firstExistingMessageKey(getCoachEventMessageFallbacks(event.eventType, persona));
  const spokenTextKey = isMessageKey(event.spokenKey)
    ? event.spokenKey
    : firstExistingMessageKey(getCoachEventSpokenFallbacks(event.eventType, persona));
  const label = formatMessage(presentation.labelKey, {}, locale);
  const title = formatMessage(presentation.titleKey, {}, locale);
  const message = formatMessage(messageKey, event.variables, locale);
  const spokenText = formatMessage(spokenTextKey, { label, title, message }, locale);

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
    variables: event.variables,
    message,
    spokenText,
    tone: event.tone,
    persona,
  };
}

export const REQUIRED_COACH_MESSAGE_KEYS = [
  ...COACH_CLASSIFICATIONS.flatMap(classification => [
    `coach.label.${classification}`,
    `coach.title.${classification}`,
  ]),
  ...COACH_EVENT_TYPES.map(eventType => `coach.event.${eventType}.message`),
  'coach.event.generic.message',
  'coach.spoken.event',
  'coach.spoken.wrong_move',
] as const;
