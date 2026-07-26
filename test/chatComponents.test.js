import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChatHeader,
  ChatScreen,
  createChatScreen,
  createCommandPaletteState,
  createMessage,
  renderBlockLines,
  renderToString,
  stripAnsi,
  themes,
} from '../src/lib/index.js';
import { RichTerminalApp } from '../src/lib/app.js';
import { packageDisplayName } from '../src/lib/packageMetadata.js';

function plain(node, options = { width: 80, height: 20 }) {
  return stripAnsi(renderToString(node, options));
}

test('ChatScreen renders the main shell from reusable components', () => {
  const node = ChatScreen({
    columns: 100,
    rows: 18,
    theme: themes.dark,
    themeName: 'dark',
    providerName: 'mock',
    sessionId: '20260707_abcde',
    activeSkills: ['code', 'writer'],
    messages: [
      createMessage({ role: 'system', content: 'Started' }),
      createMessage({ role: 'user', content: 'hello terminal' }),
      createMessage({ role: 'assistant', content: 'Mock answer', status: 'streaming' }),
    ],
    inputValue: '/he',
    inputParts: { before: '/h', current: 'e', after: '' },
    suggestions: [{ label: '/help', detail: '/help', description: 'Show commands', insert: '/help' }],
    suggestionIndex: 0,
    status: 'Ready.',
    frame: 2,
  });

  const output = plain(node, { width: 100, height: 18 });
  assert.match(output, new RegExp(packageDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(output, /mock · dark/);
  assert.match(output, /skills code, writer/);
  // Compact height prioritizes the latest turn; older turns remain available through transcript scrolling.
  assert.match(output, /you/);
  assert.match(output, /hello terminal/);
  assert.match(output, /COMMANDS · 1 match/);
  assert.match(output, /\/help/);
  assert.match(output, /Ready\./);
});

test('createChatScreen clamps transcript scroll offset and keeps frame height stable', () => {
  const messages = Array.from({ length: 20 }, (_, index) => createMessage({ role: 'user', content: `message ${index}` }));
  const screen = createChatScreen({
    columns: 64,
    rows: 18,
    theme: themes.dark,
    messages,
    inputParts: { before: '', current: ' ', after: '' },
    scrollOffset: 999,
    status: 'Scrolled.',
  });

  assert.ok(screen.scrollOffset < 999);
  assert.ok(screen.transcriptHeight >= 1);
  const text = plain(screen.node, { width: 64, height: 18 });
  assert.equal(text.split('\n').length, 18);
  assert.match(text, /scroll:\+/);
});

test('ChatScreen can render command palette as an overlay section', () => {
  const palette = createCommandPaletteState({
    items: [
      { id: '/help', title: 'Help', description: 'Show help' },
      { id: '/theme', title: 'Theme', description: 'Switch theme' },
    ],
    query: 'theme',
    selectedIndex: 0,
    windowSize: 4,
  });

  const output = plain(ChatScreen({
    columns: 72,
    rows: 20,
    theme: themes.dark,
    mode: 'palette',
    palette,
    messages: [],
    inputParts: { before: '', current: ' ', after: '' },
    status: 'Palette opened.',
  }), { width: 72, height: 20 });

  assert.match(output, /Command Palette/);
  assert.match(output, /Search\s+theme/);
  assert.match(output, /\/theme/);
});


test('diff blocks highlight patch changes without coloring file headers as additions', () => {
  const lines = renderBlockLines({
    block: {
      type: 'diff',
      title: 'example.patch',
      content: '--- a/file.js\n+++ b/file.js\n@@\n- old line\n+ new line',
    },
    width: 80,
    theme: themes.dark,
  });
  assert.ok(lines.find((line) => line.includes('+++ b/file.js'))?.startsWith(themes.dark.muted));
  assert.ok(lines.find((line) => line.includes('--- a/file.js'))?.startsWith(themes.dark.muted));
  assert.ok(lines.find((line) => line.includes('- old line'))?.startsWith(themes.dark.error));
  assert.ok(lines.find((line) => line.includes('+ new line'))?.startsWith(themes.dark.ok));
  assert.ok(lines.find((line) => line.includes('@@'))?.startsWith(themes.dark.accent));
});

test('ChatScreen renders debug overlay through DebugPanel', () => {
  const output = plain(ChatScreen({
    columns: 72,
    rows: 18,
    theme: themes.dark,
    messages: [],
    inputParts: { before: '', current: ' ', after: '' },
    debug: { enabled: true, events: [{ type: 'key', detail: 'ctrl-p' }] },
    status: 'Debug.',
  }), { width: 72, height: 18 });

  assert.match(output, /debug key: ctrl-p/);
  assert.match(output, /debug:on/);
});


test('compact transcript keeps the structured code header visible when the block is taller than the viewport', () => {
  const message = createMessage({
    role: 'assistant',
    blocks: [{
      type: 'code',
      title: 'example.js',
      content: Array.from({ length: 12 }, (_, index) => `line ${index}`).join('\n'),
    }],
  });
  const screen = createChatScreen({
    columns: 64,
    rows: 18,
    theme: themes.dark,
    messages: [message],
    inputParts: { before: '', current: ' ', after: '' },
  });

  const output = plain(screen.node, { width: 64, height: 18 });
  assert.match(output, /┌─ example\.js/);
  assert.match(output, /line 11/);
  assert.doesNotMatch(output, /CONVERSATION[^\n]*\n│\s+│ line 7/);
});

test('compact transcript uses an unambiguous whole-word history summary', () => {
  const messages = Array.from({ length: 12 }, (_, index) => createMessage({ role: 'user', content: `message ${index}` }));
  const screen = createChatScreen({
    columns: 72,
    rows: 18,
    theme: themes.dark,
    messages,
    scrollOffset: 5,
    inputParts: { before: '', current: ' ', after: '' },
  });

  const output = plain(screen.node, { width: 72, height: 18 });
  assert.match(output, /↑\d+ earlier/);
  assert.doesNotMatch(output, /ea…|e…/);
});

test('narrow chat header keeps the palette shortcut as a complete word', () => {
  const output = plain(ChatHeader({
    columns: 80,
    compact: false,
    theme: themes.dark,
    pointerActive: true,
    activeSkills: ['code'],
  }), { width: 80, height: 4 });

  assert.match(output, /Ctrl\+P palette/);
  assert.doesNotMatch(output, /palet?…/);
});

test('RichTerminalApp.render delegates to component ChatScreen and TerminalRenderer', () => {
  const output = {
    columns: 80,
    rows: 18,
    isTTY: true,
    writes: [],
    write(chunk) { this.writes.push(String(chunk)); },
    on() {},
    off() {},
  };
  const app = new RichTerminalApp({ output, input: { isTTY: true, on() {}, off() {}, setEncoding() {}, setRawMode() {}, resume() {}, pause() {} } });
  app.running = true;
  app.messages = [createMessage({ role: 'user', content: 'hello from app' })];
  app.editor.set('/he');

  app.render();

  const frame = stripAnsi(app.renderer.previousFrame.toString());
  assert.match(frame, new RegExp(packageDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(frame, /COMMANDS/);
  assert.match(frame, /\/help/);
});
