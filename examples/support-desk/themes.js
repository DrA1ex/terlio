import { themes } from '../../src/lib/index.js';

export const SUPPORT_THEME_NAMES = ['support-ocean', 'support-dark', 'support-paper', 'support-contrast', 'support-slate'];

export function getSupportTheme(name = 'support-ocean') {
  const key = SUPPORT_THEME_NAMES.includes(name) ? name : 'support-ocean';
  return SUPPORT_THEMES[key];
}

export const SUPPORT_THEMES = {
  'support-ocean': semanticTheme('support-ocean', themes.ocean, {
    risk: 'error', paused: 'accent', solved: 'ok', customer: 'user', internal: 'system', agent: 'assistant', selectedTicket: 'selected',
  }),
  'support-dark': semanticTheme('support-dark', themes.dark, {
    risk: 'error', paused: 'accent', solved: 'ok', customer: 'user', internal: 'system', agent: 'assistant', selectedTicket: 'selected',
  }),
  'support-paper': semanticTheme('support-paper', themes.paper, {
    risk: 'error', paused: 'accent', solved: 'ok', customer: 'user', internal: 'system', agent: 'assistant', selectedTicket: 'selected',
  }),
  'support-contrast': semanticTheme('support-contrast', themes.mono, {
    risk: 'error', paused: 'accent', solved: 'ok', customer: 'user', internal: 'system', agent: 'assistant', selectedTicket: 'selected',
  }),
  'support-slate': semanticTheme('support-slate', themes.slate, {
    risk: 'error', paused: 'accent', solved: 'ok', customer: 'user', internal: 'system', agent: 'assistant', selectedTicket: 'selected',
  }),
};

function semanticTheme(name, base, support) {
  return { ...base, name, support };
}
