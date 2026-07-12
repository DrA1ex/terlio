import { themes } from '../ansi/themes.js';
import { listProviders } from '../providers.js';
import { skills } from '../skills.js';
import { commands } from './catalog.js';

export function getSuggestions(input, app = null) {
  const value = input.trimStart();
  if (!value.startsWith('/')) return [];

  const endsWithSpace = /\s$/.test(input);
  const tokens = value.split(/\s+/).filter(Boolean);
  const commandToken = tokens[0] ?? '';

  if (tokens.length <= 1 && !endsWithSpace) {
    return commands
      .filter((command) => command.name.startsWith(commandToken))
      .map((command) => ({
        insert: command.name + (command.usage.includes('<') || command.usage.includes('[') ? ' ' : ''),
        label: command.name,
        detail: command.usage,
        description: command.description,
      }));
  }

  if (commandToken === '/skill') {
    const actionToken = tokens[1] ?? '';
    if (tokens.length === 1 || (tokens.length === 2 && !endsWithSpace)) {
      return ['on', 'off', 'info']
        .filter((action) => action.startsWith(actionToken))
        .map((action) => ({
          insert: `/skill ${action} `,
          label: action,
          detail: `/skill ${action} <name>`,
          description: action === 'on' ? 'Enable the skill.' : action === 'off' ? 'Disable the skill.' : 'Show the skill description.',
        }));
    }

    const nameToken = tokens[2] ?? '';
    return skills
      .filter((skill) => skill.name.startsWith(nameToken))
      .map((skill) => ({
        insert: `/skill ${tokens[1]} ${skill.name}`,
        label: skill.name,
        detail: skill.title,
        description: skill.description,
      }));
  }

  if (commandToken === '/theme') {
    const themeToken = tokens[1] ?? '';
    return Object.keys(themes)
      .filter((theme) => theme.startsWith(themeToken))
      .map((theme) => ({
        insert: `/theme ${theme}`,
        label: theme,
        detail: `theme ${theme}`,
        description: 'Switch the terminal visual theme.',
      }));
  }

  if (commandToken === '/provider') {
    const providerToken = tokens[1] ?? '';
    return listProviders()
      .filter((provider) => provider.name.startsWith(providerToken))
      .map((provider) => ({
        insert: `/provider ${provider.name}`,
        label: provider.name,
        detail: provider.title,
        description: provider.description,
      }));
  }

  if (commandToken === '/session') {
    const actionToken = tokens[1] ?? '';
    if (tokens.length === 1 || (tokens.length === 2 && !endsWithSpace)) {
      return ['new', 'save', 'list', 'open', 'delete']
        .filter((action) => action.startsWith(actionToken))
        .map((action) => ({
          insert: action === 'open' || action === 'delete' ? `/session ${action} ` : `/session ${action}`,
          label: action,
          detail: `/session ${action}`,
          description: sessionActionDescription(action),
        }));
    }

    if ((tokens[1] === 'open' || tokens[1] === 'delete') && app) {
      const idToken = tokens[2] ?? '';
      return app.sessionStore.list()
        .filter((session) => session.id.startsWith(idToken))
        .slice(0, 20)
        .map((session) => ({
          insert: `/session ${tokens[1]} ${session.id}`,
          label: session.id.slice(0, 14),
          detail: `${session.messages} msg`,
          description: session.title,
        }));
    }
  }

  if (commandToken === '/debug') {
    const token = tokens[1] ?? '';
    return ['on', 'off', 'show']
      .filter((action) => action.startsWith(token))
      .map((action) => ({
        insert: `/debug ${action}`,
        label: action,
        detail: `/debug ${action}`,
        description: action === 'on' ? 'Enable the overlay.' : action === 'off' ? 'Disable the overlay.' : 'Show events.',
      }));
  }

  if (commandToken === '/history') {
    const countToken = tokens[1] ?? '';
    return ['5', '10', '20', '50']
      .filter((count) => count.startsWith(countToken))
      .map((count) => ({
        insert: `/history ${count}`,
        label: count,
        detail: `/history ${count}`,
        description: `Show the last ${count} messages.`,
      }));
  }

  return [];
}

function sessionActionDescription(action) {
  if (action === 'new') return 'Start a new session.';
  if (action === 'save') return 'Save the current session in ~/.terlio/sessions.';
  if (action === 'list') return 'Show saved sessions.';
  if (action === 'open') return 'Open a saved session.';
  if (action === 'delete') return 'Delete a saved session.';
  return '';
}
