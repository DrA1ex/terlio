import { themes } from './ansi/themes.js';
import { buildMockBlocks, replyRules } from './mockModel.js';
import { listProviders } from './providers.js';
import { enabledSkillNames, formatSkillList, getSkill, skills } from './skills.js';
import { lastAssistantMessage } from './state.js';

export const commands = [
  {
    name: '/help',
    usage: '/help',
    description: 'Show available commands and keyboard shortcuts.',
    run(app) {
      app.addSystemMessage(helpText());
    },
  },
  {
    name: '/skills',
    usage: '/skills',
    description: 'Show the skill list and current state.',
    run(app) {
      app.addSystemMessage(`Skills:\n${formatSkillList(app.skillState)}`);
    },
  },
  {
    name: '/skill',
    usage: '/skill <on|off|info> <name>',
    description: 'Enable, disable, or describe a skill.',
    run(app, args) {
      const [action, name] = args;
      if (!action || !['on', 'off', 'info'].includes(action)) {
        app.addSystemMessage('Usage: /skill <on|off|info> <name>');
        return;
      }

      if (!name) {
        app.addSystemMessage(`Specify a skill. Available: ${skills.map((skill) => skill.name).join(', ')}`);
        return;
      }

      const skill = getSkill(name);
      if (!skill) {
        app.addSystemMessage(`Unknown skill: ${name}. Available: ${skills.map((item) => item.name).join(', ')}`);
        return;
      }

      if (action === 'info') {
        app.addSystemMessage(`${skill.title}\nname: ${skill.name}\nstate: ${app.skillState.get(skill.name) ? 'on' : 'off'}\n\n${skill.description}\n\nHints: ${skill.hints.join(', ')}`);
        return;
      }

      app.skillState.set(skill.name, action === 'on');
      app.addSystemMessage(`Skill ${skill.name} ${action === 'on' ? 'enabled' : 'disabled'}. Active: ${enabledSkillNames(app.skillState).join(', ') || 'none'}.`);
    },
  },
  {
    name: '/theme',
    usage: `/theme <${Object.keys(themes).join('|')}>`,
    description: 'Switch the color theme.',
    run(app, args) {
      const [themeName] = args;
      if (!themeName || !themes[themeName]) {
        app.addSystemMessage(`Usage: /theme <${Object.keys(themes).join('|')}>`);
        return;
      }
      app.setTheme(themeName);
      app.addSystemMessage(`Theme changed: ${themeName}.`);
    },
  },
  {
    name: '/themes',
    usage: '/themes',
    description: 'Show all available visual themes.',
    run(app) {
      const rows = Object.keys(themes).map((name) => `${name === app.themeName ? 'on ' : '   '} ${name}`);
      app.addSystemMessage(`Visual themes:\n${rows.join('\n')}\n\nSwitch theme: /theme <name>`);
    },
  },
  {
    name: '/provider',
    usage: '/provider [mock|replay]',
    description: 'Show or switch the model provider.',
    run(app, args) {
      const [providerName] = args;
      const providers = listProviders();

      if (!providerName) {
        const rows = providers.map((provider) => `${provider.name === app.providerName ? 'on ' : '   '} ${provider.name.padEnd(8)} ${provider.title} — ${provider.description}`);
        app.addSystemMessage(`Providers:\n${rows.join('\n')}\n\nSwitch: /provider <name>`);
        return;
      }

      if (!providers.some((provider) => provider.name === providerName)) {
        app.addSystemMessage(`Unknown provider: ${providerName}. Available: ${providers.map((provider) => provider.name).join(', ')}`);
        return;
      }

      app.setProvider(providerName);
      app.addSystemMessage(`Provider changed: ${app.provider.title}.`);
    },
  },
  {
    name: '/session',
    usage: '/session <new|save|list|open|delete> [id]',
    description: 'Create, save, open, or delete a local session.',
    run(app, args) {
      const [action, id] = args;
      if (!action) {
        app.addSystemMessage('Usage: /session <new|save|list|open|delete> [id]');
        return;
      }

      if (action === 'new') {
        app.newSession();
        return;
      }

      if (action === 'save') {
        const saved = app.saveSession();
        app.addSystemMessage(`Session saved: ${saved.title}\nid: ${saved.id}\npath: ${app.sessionStore.pathFor(saved.id)}`);
        return;
      }

      if (action === 'list') {
        const sessions = app.sessionStore.list();
        if (!sessions.length) {
          app.addSystemMessage('No saved sessions yet. Use /session save.');
          return;
        }
        const rows = sessions.slice(0, 20).map((session, index) => `${String(index + 1).padStart(2, '0')}. ${session.id.padEnd(28)} ${String(session.messages).padStart(3)} msg  ${session.updatedAt}  ${session.title}`);
        app.addSystemMessage(`Sessions:\n${rows.join('\n')}\n\nOpen: /session open <id>`);
        return;
      }

      if (action === 'open') {
        if (!id) {
          app.addSystemMessage('Specify an id: /session open <id>');
          return;
        }
        app.loadSession(id);
        return;
      }

      if (action === 'delete') {
        if (!id) {
          app.addSystemMessage('Specify an id: /session delete <id>');
          return;
        }
        app.sessionStore.remove(id);
        app.addSystemMessage(`Session removed if it existed: ${id}`);
        return;
      }

      app.addSystemMessage('Usage: /session <new|save|list|open|delete> [id]');
    },
  },
  {
    name: '/retry',
    usage: '/retry',
    description: 'Retry the last user prompt.',
    run(app) {
      app.retryLastUserPrompt();
    },
  },
  {
    name: '/regenerate',
    usage: '/regenerate',
    description: 'Generate another response to the last user prompt.',
    run(app) {
      app.retryLastUserPrompt();
    },
  },
  {
    name: '/shorter',
    usage: '/shorter',
    description: 'Shorten the last assistant response.',
    run(app) {
      app.runAssistantAction('shorter');
    },
  },
  {
    name: '/longer',
    usage: '/longer',
    description: 'Expand the last assistant response.',
    run(app) {
      app.runAssistantAction('longer');
    },
  },
  {
    name: '/explain',
    usage: '/explain',
    description: 'Explain the reasoning behind the last response.',
    run(app) {
      app.runAssistantAction('explain');
    },
  },
  {
    name: '/apply',
    usage: '/apply',
    description: 'Show the mock path for applying the last artifact.',
    run(app) {
      app.runAssistantAction('apply');
    },
  },
  {
    name: '/copy-last',
    usage: '/copy-last',
    description: 'Show the last response in a separate copyable block.',
    run(app) {
      const message = lastAssistantMessage(app.messages);
      if (!message) {
        app.addSystemMessage('No last assistant response.');
        return;
      }
      app.addSystemMessage(`Last response for copying:\n\n${message.content.trim()}`);
    },
  },
  {
    name: '/blocks',
    usage: '/blocks [prompt]',
    description: 'Add a demo structured assistant response.',
    run(app, args) {
      const prompt = args.join(' ') || 'implement code and show tests';
      const blocks = buildMockBlocks(prompt, enabledSkillNames(app.skillState));
      app.addAssistantMessage('', false, { blocks });
      app.status = 'Structured block demo added.';
    },
  },
  {
    name: '/intents',
    usage: '/intents',
    description: 'Show mock model regex intents.',
    run(app) {
      const rows = replyRules.map((rule, index) => `${String(index + 1).padStart(2, '0')}. ${rule.id.padEnd(14)} ${rule.title}`);
      app.addSystemMessage(`Mock model regex intents:\n${rows.join('\n')}\n\nThe model selects the rule with the highest total weight from matched regular expressions.`);
    },
  },
  {
    name: '/debug',
    usage: '/debug <on|off|show>',
    description: 'Enable the debug overlay or show recent events.',
    run(app, args) {
      const [action = 'show'] = args;
      if (action === 'on') {
        app.toggleDebug(true);
        app.addSystemMessage('Debug overlay enabled.');
        return;
      }
      if (action === 'off') {
        app.toggleDebug(false);
        app.addSystemMessage('Debug overlay disabled.');
        return;
      }
      if (action === 'show') {
        const rows = app.debug.events.slice(-20).map((event) => `${event.at} ${event.type.padEnd(8)} ${event.detail}`);
        app.addSystemMessage(rows.length ? `Debug events:\n${rows.join('\n')}` : 'Debug events are empty.');
        return;
      }
      app.addSystemMessage('Usage: /debug <on|off|show>');
    },
  },
  {
    name: '/status',
    usage: '/status',
    description: 'Show app state, theme, provider, session, and terminal size.',
    run(app) {
      const columns = app.output.columns || 80;
      const rows = app.output.rows || 24;
      app.addSystemMessage([
        'Application state:',
        `busy: ${app.busy ? 'yes' : 'no'}`,
        `provider: ${app.providerName}`,
        `theme: ${app.themeName}`,
        `skills: ${enabledSkillNames(app.skillState).join(', ') || 'none'}`,
        `session: ${app.sessionId}`,
        `messages: ${app.messages.length}`,
        `input history: ${app.history.length}`,
        `debug: ${app.debug.enabled ? 'on' : 'off'}`,
        `terminal: ${columns}x${rows}`,
      ].join('\n'));
    },
  },
  {
    name: '/history',
    usage: '/history [count]',
    description: 'Show recent messages as a system summary.',
    run(app, args) {
      const count = Math.min(50, Math.max(1, Number.parseInt(args[0] || '10', 10) || 10));
      const rows = app.messages.slice(-count).map((message, index) => {
        const text = message.content.replace(/\s+/g, ' ').trim();
        return `${String(index + 1).padStart(2, '0')}. ${message.role}/${message.status}: ${text.slice(0, 140)}${text.length > 140 ? '…' : ''}`;
      });
      app.addSystemMessage(rows.length ? `Recent messages:\n${rows.join('\n')}` : 'History is empty.');
    },
  },
  {
    name: '/clear',
    usage: '/clear',
    description: 'Clear the on-screen history.',
    run(app) {
      app.clearMessages();
      app.addSystemMessage('Screen history cleared.');
    },
  },
  {
    name: '/reset',
    usage: '/reset',
    description: 'Reset the screen, input history, theme, provider, and skills to defaults.',
    run(app) {
      app.clearMessages();
      app.history = [];
      app.historyIndex = null;
      app.setTheme('dark');
      app.setProvider('mock');
      app.skillState = app.createDefaultSkillState();
      app.addSystemMessage('State reset: theme dark, provider mock, history cleared, skills restored to defaults.');
    },
  },
  {
    name: '/about',
    usage: '/about',
    description: 'Briefly describe the purpose of the prototype.',
    run(app) {
      app.addSystemMessage('Mock AI Terminal is a dependency-free prototype of a rich terminal shell for AI chat. It includes a message log, input editor, session store, provider interface, actions for the last response, debug overlay, skills, themes, regex intents, and a streaming contract.');
    },
  },
  {
    name: '/exit',
    usage: '/exit',
    description: 'Exit the application.',
    run(app) {
      app.requestExit(0);
    },
  },
];

export function parseCommand(line) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  const name = parts[0];
  const args = parts.slice(1);
  return { name, args };
}

export function findCommand(name) {
  return commands.find((command) => command.name === name);
}

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

export function helpText() {
  const commandRows = commands.map((command) => `${command.usage.padEnd(52)} ${command.description}`).join('\n');
  return [
    'Commands:',
    commandRows,
    '',
    'Keys:',
    'Tab / Shift+Tab                                      cycle suggestions; if only one suggestion exists, apply it',
    '↑ / ↓                                                select a suggestion when the command list is open; otherwise input history',
    'Enter                                                apply the selected suggestion or run the typed command',
    '← / →, Home / End, Ctrl+A / Ctrl+E                    move within the line',
    'Alt+← / Alt+→                                        move by words',
    'Cmd+← / Cmd+→                                        line start / end in terminals that emit CSI 1;9D/C',
    'Ctrl+K / Ctrl+U / Ctrl+W                              delete to end, to start, or the word to the left',
    'PageUp / PageDown                                    scroll transcript',
    'Ctrl+L                                               redraw the screen and return to transcript bottom',
    'Esc                                                  cancel the current streaming response',
    'Ctrl+C / Ctrl+D                                      exit',
  ].join('\n');
}

function sessionActionDescription(action) {
  if (action === 'new') return 'Start a new session.';
  if (action === 'save') return 'Save the current session in ~/.mock-ai-terminal/sessions.';
  if (action === 'list') return 'Show saved sessions.';
  if (action === 'open') return 'Open a saved session.';
  if (action === 'delete') return 'Delete a saved session.';
  return '';
}
