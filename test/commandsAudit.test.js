import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkillState, findCommand, getSuggestions, helpText, parseCommand } from '../src/lib/index.js';

test('command suggestions cover dynamic skill, theme, provider and session arguments', () => {
  const app = {
    sessionStore: {
      list: () => [
        { id: 'session_alpha', title: 'Alpha review', messages: 4 },
        { id: 'session_beta', title: 'Beta review', messages: 2 },
      ],
    },
  };

  assert.equal(getSuggestions('/skill on ter', app)[0]?.insert, '/skill on terminal');
  assert.equal(getSuggestions('/theme oce', app)[0]?.insert, '/theme ocean');
  assert.equal(getSuggestions('/provider rep', app)[0]?.insert, '/provider replay');
  assert.equal(getSuggestions('/session open session_a', app)[0]?.insert, '/session open session_alpha');
  assert.deepEqual(getSuggestions('not a command', app), []);
});

test('theme and skill commands validate input and mutate application state', () => {
  const messages = [];
  const notifications = [];
  const app = {
    themeName: 'dark',
    skillState: createSkillState(),
    setTheme(name) { this.themeName = name; },
    addSystemMessage(message) { messages.push(message); },
    notify(message, level, detail) { notifications.push({ message, level, detail }); },
    status: '',
  };

  findCommand('/theme').run(app, ['ocean']);
  assert.equal(app.themeName, 'ocean');
  assert.equal(notifications.at(-1).level, 'success');

  findCommand('/skill').run(app, ['off', 'terminal']);
  assert.equal(app.skillState.get('terminal'), false);
  assert.match(app.status, /disabled/);

  findCommand('/skill').run(app, ['on', 'missing']);
  assert.match(messages.at(-1), /Unknown skill/);
});

test('assistant commands return async work to the command executor', async () => {
  const calls = [];
  const app = {
    retryLastUserPrompt: async () => { calls.push('retry'); return 'retried'; },
    runAssistantAction: async (action) => { calls.push(action); return action; },
  };

  assert.equal(await findCommand('/retry').run(app, []), 'retried');
  assert.equal(await findCommand('/shorter').run(app, []), 'shorter');
  assert.deepEqual(calls, ['retry', 'shorter']);
});

test('command help and compatibility parser remain stable after module split', () => {
  assert.match(helpText(), /Commands:/);
  assert.match(helpText(), /Ctrl\+C \/ Ctrl\+D/);
  assert.deepEqual(parseCommand('/history 20'), { name: '/history', args: ['20'] });
});
