import { themes } from '../../src/lib/index.js';

const SUPPORT_SEMANTIC_TOKENS = {
  risk: 'error',
  paused: 'accent',
  solved: 'ok',
  customer: 'user',
  internal: 'system',
  agent: 'assistant',
  selectedTicket: 'selected',
};

// Support Desk inherits the library theme catalog verbatim. Only genuinely
// custom themes should use a `support-` prefix in the future.
export const SUPPORT_THEME_NAMES = Object.keys(themes);

export const SUPPORT_THEMES = Object.fromEntries(
  SUPPORT_THEME_NAMES.map((name) => [name, semanticTheme(name, themes[name])]),
);

export function getSupportTheme(name = 'ocean') {
  const key = SUPPORT_THEME_NAMES.includes(name) ? name : 'ocean';
  return SUPPORT_THEMES[key];
}

function semanticTheme(name, base) {
  return { ...base, name, support: { ...SUPPORT_SEMANTIC_TOKENS } };
}
