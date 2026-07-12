import { themes } from '../ansi/themes.js';
import { buildMockBlocks, replyRules } from '../mockModel.js';
import { listProviders } from '../providers.js';
import { enabledSkillNames, formatSkillList, getSkill, skills } from '../skills.js';
import { lastAssistantMessage } from '../state.js';
import { packageDisplayName } from '../packageMetadata.js';

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
      app.status = `Skill ${skill.name} ${action === 'on' ? 'enabled' : 'disabled'}.`;
      app.notify?.(`Skill ${skill.name} ${action === 'on' ? 'enabled' : 'disabled'}`, action === 'on' ? 'success' : 'info', `Active: ${enabledSkillNames(app.skillState).join(', ') || 'none'}`);
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
      app.status = `Theme changed to ${themeName}.`;
      app.notify?.(`Theme: ${themeName}`, 'success', 'Applied to the whole chat workspace.');
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
      app.status = `Provider changed to ${app.provider.title}.`;
      app.notify?.(`Provider: ${app.providerName}`, 'success', app.provider.title);
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
        app.status = `Session saved: ${saved.title}.`;
        app.notify?.('Session saved', 'success', saved.title);
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
        app.status = `Session removed: ${id}.`;
        app.notify?.('Session removed', 'info', id);
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
      return app.retryLastUserPrompt();
    },
  },
  {
    name: '/regenerate',
    usage: '/regenerate',
    description: 'Generate another response to the last user prompt.',
    run(app) {
      return app.retryLastUserPrompt();
    },
  },
  {
    name: '/shorter',
    usage: '/shorter',
    description: 'Shorten the last assistant response.',
    run(app) {
      return app.runAssistantAction('shorter');
    },
  },
  {
    name: '/longer',
    usage: '/longer',
    description: 'Expand the last assistant response.',
    run(app) {
      return app.runAssistantAction('longer');
    },
  },
  {
    name: '/explain',
    usage: '/explain',
    description: 'Explain the reasoning behind the last response.',
    run(app) {
      return app.runAssistantAction('explain');
    },
  },
  {
    name: '/apply',
    usage: '/apply',
    description: 'Show the mock path for applying the last artifact.',
    run(app) {
      return app.runAssistantAction('apply');
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
        app.status = 'Debug overlay enabled.';
        app.notify?.('Debug overlay enabled', 'info', 'Recent input events are now visible.');
        return;
      }
      if (action === 'off') {
        app.toggleDebug(false);
        app.status = 'Debug overlay disabled.';
        app.notify?.('Debug overlay disabled', 'info');
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
      app.status = 'Conversation cleared.';
      app.notify?.('Conversation cleared', 'info');
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
      app.setTheme('ocean');
      app.setProvider('mock');
      app.skillState = app.createDefaultSkillState();
      app.status = 'Workspace reset to defaults.';
      app.notify?.('Workspace reset', 'success', 'Theme ocean, mock provider, default skills.');
    },
  },
  {
    name: '/about',
    usage: '/about',
    description: `Describe the ${packageDisplayName} reference chat application.`,
    run(app) {
      app.addSystemMessage(`${packageDisplayName} is a dependency-free declarative terminal UI framework for Node.js. This reference chat application demonstrates the renderer, input editor, sessions, providers, response actions, overlays, skills, themes, regex intents and structured streaming contract.`);
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

export function helpText() {
  const commandRows = commands.map((command) => `${command.usage.padEnd(52)} ${command.description}`).join('\n');
  return [
    'Commands:',
    commandRows,
    '',
    'Keys:',
    'Tab                                                  apply the selected slash-command suggestion',
    'Shift+Tab                                            select the previous suggestion',
    '↑ / ↓                                                select suggestions; move in multiline input; otherwise browse history',
    'Enter / Ctrl+J                                       send input / insert a newline',
    '← / →, Home / End, Ctrl+A / Ctrl+E                    move within the current line',
    'Alt+← / Alt+→                                        move by words',
    'Cmd+← / Cmd+→                                        move to document start / end when supported',
    'Ctrl+K / Ctrl+U / Ctrl+W                              delete to end, to start, or the word to the left',
    'PageUp / PageDown                                    scroll transcript',
    'Ctrl+L                                               redraw the screen and return to transcript bottom',
    'Esc                                                  cancel streaming, dismiss suggestions, or return to latest',
    'Ctrl+C / Ctrl+D                                      exit',
  ].join('\n');
}
