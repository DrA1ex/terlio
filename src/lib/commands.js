import { themes } from './ansi.js';
import { buildMockBlocks, replyRules } from './mockModel.js';
import { listProviders } from './providers.js';
import { enabledSkillNames, formatSkillList, getSkill, skills } from './skills.js';
import { lastAssistantMessage } from './state.js';

export const commands = [
  {
    name: '/help',
    usage: '/help',
    description: 'Показать доступные команды и горячие клавиши.',
    run(app) {
      app.addSystemMessage(helpText());
    },
  },
  {
    name: '/skills',
    usage: '/skills',
    description: 'Показать список скилов и их состояние.',
    run(app) {
      app.addSystemMessage(`Скилы:\n${formatSkillList(app.skillState)}`);
    },
  },
  {
    name: '/skill',
    usage: '/skill <on|off|info> <name>',
    description: 'Включить, выключить или описать скил.',
    run(app, args) {
      const [action, name] = args;
      if (!action || !['on', 'off', 'info'].includes(action)) {
        app.addSystemMessage('Использование: /skill <on|off|info> <name>');
        return;
      }

      if (!name) {
        app.addSystemMessage(`Укажите скил. Доступно: ${skills.map((skill) => skill.name).join(', ')}`);
        return;
      }

      const skill = getSkill(name);
      if (!skill) {
        app.addSystemMessage(`Неизвестный скил: ${name}. Доступно: ${skills.map((item) => item.name).join(', ')}`);
        return;
      }

      if (action === 'info') {
        app.addSystemMessage(`${skill.title}\nname: ${skill.name}\nstate: ${app.skillState.get(skill.name) ? 'on' : 'off'}\n\n${skill.description}\n\nПодсказки: ${skill.hints.join(', ')}`);
        return;
      }

      app.skillState.set(skill.name, action === 'on');
      app.addSystemMessage(`Скил ${skill.name} ${action === 'on' ? 'включён' : 'выключен'}. Активны: ${enabledSkillNames(app.skillState).join(', ') || 'none'}.`);
    },
  },
  {
    name: '/theme',
    usage: `/theme <${Object.keys(themes).join('|')}>`,
    description: 'Сменить цветовую тему.',
    run(app, args) {
      const [themeName] = args;
      if (!themeName || !themes[themeName]) {
        app.addSystemMessage(`Использование: /theme <${Object.keys(themes).join('|')}>`);
        return;
      }
      app.setTheme(themeName);
      app.addSystemMessage(`Тема изменена: ${themeName}.`);
    },
  },
  {
    name: '/themes',
    usage: '/themes',
    description: 'Показать все доступные темы оформления.',
    run(app) {
      const rows = Object.keys(themes).map((name) => `${name === app.themeName ? 'on ' : '   '} ${name}`);
      app.addSystemMessage(`Темы оформления:\n${rows.join('\n')}\n\nСменить тему: /theme <name>`);
    },
  },
  {
    name: '/provider',
    usage: '/provider [mock|replay]',
    description: 'Показать или сменить provider модели.',
    run(app, args) {
      const [providerName] = args;
      const providers = listProviders();

      if (!providerName) {
        const rows = providers.map((provider) => `${provider.name === app.providerName ? 'on ' : '   '} ${provider.name.padEnd(8)} ${provider.title} — ${provider.description}`);
        app.addSystemMessage(`Провайдеры:\n${rows.join('\n')}\n\nСменить: /provider <name>`);
        return;
      }

      if (!providers.some((provider) => provider.name === providerName)) {
        app.addSystemMessage(`Неизвестный provider: ${providerName}. Доступно: ${providers.map((provider) => provider.name).join(', ')}`);
        return;
      }

      app.setProvider(providerName);
      app.addSystemMessage(`Provider изменён: ${app.provider.title}.`);
    },
  },
  {
    name: '/session',
    usage: '/session <new|save|list|open|delete> [id]',
    description: 'Создать, сохранить, открыть или удалить локальную сессию.',
    run(app, args) {
      const [action, id] = args;
      if (!action) {
        app.addSystemMessage('Использование: /session <new|save|list|open|delete> [id]');
        return;
      }

      if (action === 'new') {
        app.newSession();
        return;
      }

      if (action === 'save') {
        const saved = app.saveSession();
        app.addSystemMessage(`Сессия сохранена: ${saved.title}\nid: ${saved.id}\npath: ${app.sessionStore.pathFor(saved.id)}`);
        return;
      }

      if (action === 'list') {
        const sessions = app.sessionStore.list();
        if (!sessions.length) {
          app.addSystemMessage('Сохранённых сессий пока нет. Используйте /session save.');
          return;
        }
        const rows = sessions.slice(0, 20).map((session, index) => `${String(index + 1).padStart(2, '0')}. ${session.id.padEnd(28)} ${String(session.messages).padStart(3)} msg  ${session.updatedAt}  ${session.title}`);
        app.addSystemMessage(`Сессии:\n${rows.join('\n')}\n\nОткрыть: /session open <id>`);
        return;
      }

      if (action === 'open') {
        if (!id) {
          app.addSystemMessage('Укажите id: /session open <id>');
          return;
        }
        app.loadSession(id);
        return;
      }

      if (action === 'delete') {
        if (!id) {
          app.addSystemMessage('Укажите id: /session delete <id>');
          return;
        }
        app.sessionStore.remove(id);
        app.addSystemMessage(`Сессия удалена, если существовала: ${id}`);
        return;
      }

      app.addSystemMessage('Использование: /session <new|save|list|open|delete> [id]');
    },
  },
  {
    name: '/retry',
    usage: '/retry',
    description: 'Повторить последний пользовательский запрос.',
    run(app) {
      app.retryLastUserPrompt();
    },
  },
  {
    name: '/regenerate',
    usage: '/regenerate',
    description: 'Сгенерировать ещё один ответ на последний пользовательский запрос.',
    run(app) {
      app.retryLastUserPrompt();
    },
  },
  {
    name: '/shorter',
    usage: '/shorter',
    description: 'Сократить последний ответ ассистента.',
    run(app) {
      app.runAssistantAction('shorter');
    },
  },
  {
    name: '/longer',
    usage: '/longer',
    description: 'Расширить последний ответ ассистента.',
    run(app) {
      app.runAssistantAction('longer');
    },
  },
  {
    name: '/explain',
    usage: '/explain',
    description: 'Объяснить логику последнего ответа.',
    run(app) {
      app.runAssistantAction('explain');
    },
  },
  {
    name: '/apply',
    usage: '/apply',
    description: 'Показать mock-путь применения последнего артефакта.',
    run(app) {
      app.runAssistantAction('apply');
    },
  },
  {
    name: '/copy-last',
    usage: '/copy-last',
    description: 'Показать последний ответ отдельным блоком для копирования.',
    run(app) {
      const message = lastAssistantMessage(app.messages);
      if (!message) {
        app.addSystemMessage('Нет последнего ответа ассистента.');
        return;
      }
      app.addSystemMessage(`Последний ответ для копирования:\n\n${message.content.trim()}`);
    },
  },
  {
    name: '/blocks',
    usage: '/blocks [prompt]',
    description: 'Добавить демонстрационный structured assistant response.',
    run(app, args) {
      const prompt = args.join(' ') || 'реализуй код и покажи тесты';
      const blocks = buildMockBlocks(prompt, enabledSkillNames(app.skillState));
      app.addAssistantMessage('', false, { blocks });
      app.status = 'Structured block demo added.';
    },
  },
  {
    name: '/intents',
    usage: '/intents',
    description: 'Показать regex-интенты мок-модели.',
    run(app) {
      const rows = replyRules.map((rule, index) => `${String(index + 1).padStart(2, '0')}. ${rule.id.padEnd(14)} ${rule.title}`);
      app.addSystemMessage(`Regex-интенты мок-модели:\n${rows.join('\n')}\n\nМодель выбирает правило с наибольшим весом совпавших регулярных выражений.`);
    },
  },
  {
    name: '/debug',
    usage: '/debug <on|off|show>',
    description: 'Включить debug overlay или показать последние события.',
    run(app, args) {
      const [action = 'show'] = args;
      if (action === 'on') {
        app.toggleDebug(true);
        app.addSystemMessage('Debug overlay включён.');
        return;
      }
      if (action === 'off') {
        app.toggleDebug(false);
        app.addSystemMessage('Debug overlay выключен.');
        return;
      }
      if (action === 'show') {
        const rows = app.debug.events.slice(-20).map((event) => `${event.at} ${event.type.padEnd(8)} ${event.detail}`);
        app.addSystemMessage(rows.length ? `Debug events:\n${rows.join('\n')}` : 'Debug events пока пустые.');
        return;
      }
      app.addSystemMessage('Использование: /debug <on|off|show>');
    },
  },
  {
    name: '/status',
    usage: '/status',
    description: 'Показать состояние приложения, тему, provider, сессию и размер терминала.',
    run(app) {
      const columns = app.output.columns || 80;
      const rows = app.output.rows || 24;
      app.addSystemMessage([
        'Состояние приложения:',
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
    description: 'Показать последние сообщения в виде системной сводки.',
    run(app, args) {
      const count = Math.min(50, Math.max(1, Number.parseInt(args[0] || '10', 10) || 10));
      const rows = app.messages.slice(-count).map((message, index) => {
        const text = message.content.replace(/\s+/g, ' ').trim();
        return `${String(index + 1).padStart(2, '0')}. ${message.role}/${message.status}: ${text.slice(0, 140)}${text.length > 140 ? '…' : ''}`;
      });
      app.addSystemMessage(rows.length ? `Последние сообщения:\n${rows.join('\n')}` : 'История пока пустая.');
    },
  },
  {
    name: '/clear',
    usage: '/clear',
    description: 'Очистить историю на экране.',
    run(app) {
      app.clearMessages();
      app.addSystemMessage('Экранная история очищена.');
    },
  },
  {
    name: '/reset',
    usage: '/reset',
    description: 'Сбросить экран, историю ввода, тему, provider и скилы к значениям по умолчанию.',
    run(app) {
      app.clearMessages();
      app.history = [];
      app.historyIndex = null;
      app.setTheme('dark');
      app.setProvider('mock');
      app.skillState = app.createDefaultSkillState();
      app.addSystemMessage('Состояние сброшено: тема dark, provider mock, история очищена, скилы возвращены к значениям по умолчанию.');
    },
  },
  {
    name: '/about',
    usage: '/about',
    description: 'Кратко описать назначение прототипа.',
    run(app) {
      app.addSystemMessage('Mock AI Terminal — dependency-free прототип rich-terminal оболочки для AI-чата. Теперь есть message log, input editor, session store, provider interface, actions над последним ответом, debug overlay, скилы, темы, regex-интенты и streaming-контракт.');
    },
  },
  {
    name: '/exit',
    usage: '/exit',
    description: 'Завершить приложение.',
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
          description: action === 'on' ? 'Включить скил.' : action === 'off' ? 'Выключить скил.' : 'Показать описание скила.',
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
        description: 'Переключить визуальную тему терминала.',
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
        description: action === 'on' ? 'Включить overlay.' : action === 'off' ? 'Выключить overlay.' : 'Показать события.',
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
        description: `Показать последние ${count} сообщений.`,
      }));
  }

  return [];
}

export function helpText() {
  const commandRows = commands.map((command) => `${command.usage.padEnd(52)} ${command.description}`).join('\n');
  return [
    'Команды:',
    commandRows,
    '',
    'Клавиши:',
    'Tab / Shift+Tab                                      перейти по подсказкам; если подсказка одна — применить её',
    '↑ / ↓                                                выбрать подсказку, если открыт список команд; иначе история ввода',
    'Enter                                                применить выбранную подсказку или выполнить введённую команду',
    '← / →, Home / End, Ctrl+A / Ctrl+E                    перемещение по строке',
    'Alt+← / Alt+→                                        перемещение по словам',
    'Cmd+← / Cmd+→                                        начало / конец строки в терминалах, которые отдают CSI 1;9D/C',
    'Ctrl+K / Ctrl+U / Ctrl+W                              удалить до конца, до начала или слово слева',
    'PageUp / PageDown                                    прокрутка transcript',
    'Ctrl+L                                               перерисовать экран и вернуться к низу transcript',
    'Esc                                                  отменить текущий потоковый ответ',
    'Ctrl+C / Ctrl+D                                      выход',
  ].join('\n');
}

function sessionActionDescription(action) {
  if (action === 'new') return 'Начать новую сессию.';
  if (action === 'save') return 'Сохранить текущую сессию в ~/.mock-ai-terminal/sessions.';
  if (action === 'list') return 'Показать сохранённые сессии.';
  if (action === 'open') return 'Открыть сохранённую сессию.';
  if (action === 'delete') return 'Удалить сохранённую сессию.';
  return '';
}
