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
    'BottomOverlay',
    'SelectableText',
    'createTextSelectionState',
    'selectionContainsPoint',
    'copyTextToClipboard',
    'dispatchPointerEvent',
    'requestsPointerReporting',
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
    'getListItemKind',
    'isPresentationListItem',
    'isSelectableListItem',
    'ConfirmPrompt',
    'Modal',
    'Toast',
    'ProgressBar',
    'ProgressStatus',
    'ScrollView',
    'Spinner',
    'ModeManager',
    'createCommandPaletteState',
    'renderCommandPalette',
    'createBlock',
    'buildMockBlocks',
    'streamMockBlocks',
    'appendMessageBlock',
    'SyntaxText',
    'detectSyntaxLanguage',
    'normalizeSyntaxLanguage',
    'tokenizeSyntax',
    'highlightSyntax',
    'highlightSyntaxLines',
    'styleSyntaxToken',
  ]) {
    assert.equal(typeof api[name], 'function', `${name} should be exported`);
  }
  assert.equal(typeof api.ProgressStatus.create, 'function');
  assert.ok(Array.isArray(api.SUPPORTED_SYNTAX_LANGUAGES));
  assert.ok(Array.isArray(api.SYNTAX_TOKEN_TYPES));
});
