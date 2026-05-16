export const DEFAULT_LOCALE = 'en' as const;

export const SUPPORTED_LOCALES = ['en'] as const;

export type FirstMoveLocale = (typeof SUPPORTED_LOCALES)[number];

export type CoachMessageVariables = Record<string, string | number | boolean | null | undefined>;

export const EN_MESSAGES = {
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

  'coach.expected.tactical_payoff.0':
    'There it is. {moveSan} is the moment the earlier pressure starts to pay off.',
  'coach.expected.tactical_payoff.1':
    'That is the point of the line. {moveSan} turns the pressure into something concrete.',
  'coach.expected.tactical_payoff.2':
    'Good, now the idea has teeth. {moveSan} makes the opponent deal with the tactic instead of playing freely.',
  'coach.expected.forcing.0':
    'Now you are asking a direct question. {moveSan} limits the replies and keeps the initiative with you.',
  'coach.expected.forcing.1':
    'Good tempo. {moveSan} makes the opponent respond to your idea before they get comfortable.',
  'coach.expected.forcing.2':
    '{moveSan} keeps the game on your terms. The opponent has fewer useful choices now.',
  'coach.expected.setup.0':
    'Nice quiet move. {moveSan} prepares the position before you start forcing things.',
  'coach.expected.setup.1':
    'This is useful patience. {moveSan} gets the structure ready for the next idea.',
  'coach.expected.setup.2':
    '{moveSan} does the groundwork. You are making the coming plan easier to play.',
  'coach.expected.strategic.0':
    '{moveSan} fits the plan in {variationName}. You improve first, then look for the payoff.',
  'coach.expected.strategic.1':
    'Good practical move. {moveSan} keeps your pieces coordinated and your plan clear.',
  'coach.expected.strategic.2':
    'This keeps the line healthy. {moveSan} improves the position without rushing.',

  'coach.eval.progress': ' The engine also likes the progress: you are up to {evalPawns} now.',
  'coach.eval.precision':
    ' The engine still keeps this playable at {evalPawns}, but be precise from here.',
  'coach.eval.position': ' The position is {evalPawns} for your side.',
  'coach.final': ' Nice work, that finishes the line.',

  'coach.wrong.attempted':
    '{attemptedSan} is not the move for this position. In {variationName}, look for {expectedSan}.',
  'coach.wrong.generic':
    'That is not the move for this position. In {variationName}, look for {expectedSan}.',
  'coach.spoken': '{label}. {title}. {message}',
  'coach.spoken.wrong': 'Try again. {message}',
} as const;

export const MESSAGES_BY_LOCALE = {
  en: EN_MESSAGES,
} as const;

export type I18nMessageKey = keyof typeof EN_MESSAGES;

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
