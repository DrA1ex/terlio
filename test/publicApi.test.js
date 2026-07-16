import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/lib/index.js';

test('library entry exports terminal app and low-level building blocks', () => {
  for (const name of [
    'RichTerminalApp',
    'createAppPaletteItems',
    'InputEditor',
    'createProvider',
    'SessionStore',
    'parseKey',
    'parsePointer',
    'parseInputEvents',
    'PointerRegion',
    'dispatchPointerEvent',
    'mouseReportingSequence',
    'FocusManager',
    'Text',
    'Box',
    'Grid',
    'measureNodeHeight',
    'resolveWorkspaceShellLayout',
    'resolveAutoScrollOffset',
    'resolveScrollKeyOffset',
    'isScrollAtBottom',
    'scrollLine',
    'scrollMax',
    'renderToFrame',
    'createFrame',
    'SelectList',
    'ConfirmPrompt',
    'Modal',
    'Toast',
    'ProgressBar',
    'Spinner',
    'ModeManager',
    'createCommandPaletteState',
    'renderCommandPalette',
    'createBlock',
    'buildMockBlocks',
    'streamMockBlocks',
    'appendMessageBlock',
  ]) {
    assert.equal(typeof api[name], 'function', `${name} should be exported`);
  }
});
