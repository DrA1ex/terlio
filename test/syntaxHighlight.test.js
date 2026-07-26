import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_SYNTAX_LANGUAGES,
  ChatScreen,
  SyntaxText,
  createBlock,
  detectSyntaxLanguage,
  highlightSyntax,
  highlightSyntaxLines,
  normalizeSyntaxLanguage,
  renderBlockLines,
  renderToString,
  stripAnsi,
  styleSyntaxToken,
  themes,
  tokenizeSyntax,
} from '../src/lib/index.js';

const theme = themes.ocean;

test('syntax language detection supports aliases, source files, headers, Apple files and shebangs', () => {
  assert.equal(normalizeSyntaxLanguage('language-js'), 'javascript');
  assert.equal(normalizeSyntaxLanguage('C++'), 'cpp');
  assert.equal(detectSyntaxLanguage({ filename: 'src/main.js' }), 'javascript');
  assert.equal(detectSyntaxLanguage({ filename: 'include/render.h' }), 'c');
  assert.equal(detectSyntaxLanguage({ filename: 'include/render.hpp' }), 'cpp');
  assert.equal(detectSyntaxLanguage({ filename: 'Sources/AppDelegate.m' }), 'objective-c');
  assert.equal(detectSyntaxLanguage({ filename: 'Sources/App.swift' }), 'swift');
  assert.equal(detectSyntaxLanguage({ filename: 'Info.plist' }), 'xml');
  assert.equal(detectSyntaxLanguage({ source: '#!/usr/bin/env python3\nprint(1)' }), 'python');
  assert.equal(detectSyntaxLanguage({ source: '#!/bin/zsh\necho ok' }), 'shell');
  assert.ok(SUPPORTED_SYNTAX_LANGUAGES.includes('javascript'));
  assert.ok(SUPPORTED_SYNTAX_LANGUAGES.includes('objective-c'));
});

test('basic tokenizer recognizes comments, strings, numbers, keywords, types and preprocessors', () => {
  const javascript = tokenizeSyntax('const count = 42; // total\nreturn "ok";', { language: 'js' });
  assert.ok(javascript.some((token) => token.type === 'keyword' && token.value.includes('const')));
  assert.ok(javascript.some((token) => token.type === 'number' && token.value === '42'));
  assert.ok(javascript.some((token) => token.type === 'comment' && token.value === '// total'));
  assert.ok(javascript.some((token) => token.type === 'string' && token.value === '"ok"'));

  const cpp = tokenizeSyntax('#include <string>\nstd::string name = "terlio";', { filename: 'sample.hpp' });
  assert.equal(cpp[0].type, 'preprocessor');
  assert.ok(cpp.some((token) => token.type === 'type' && token.value.includes('string')));

  const python = tokenizeSyntax('@dataclass\nclass Job:\n    retries: int = 3', { language: 'python' });
  assert.ok(python.some((token) => token.type === 'keyword' && token.value === 'class'));
  assert.ok(python.some((token) => token.type === 'type' && token.value === 'int'));
});

test('syntax highlighting is opt-in, ANSI styled and lossless as plain text', () => {
  const source = 'const answer = 42;';
  const highlighted = highlightSyntax(source, { language: 'javascript', theme });
  assert.match(highlighted, /\x1b\[/);
  assert.ok(highlighted.includes(theme.syntaxKeyword));
  assert.ok(highlighted.includes(theme.syntaxNumber));
  assert.equal(stripAnsi(highlighted), source);
  assert.equal(highlightSyntax(source, { language: 'javascript', theme, enabled: false }), source);
  assert.equal(highlightSyntax(source, { language: 'unknown', theme }), source);
});

test('SyntaxText renders highlighted source with filename detection', () => {
  const output = renderToString(SyntaxText({
    code: 'let title: String = "Terlio"',
    filename: 'Example.swift',
    theme,
  }), { width: 40, height: 2 });
  assert.ok(output.includes(theme.syntaxKeyword));
  assert.equal(stripAnsi(output).split('\n')[0].trimEnd(), 'let title: String = "Terlio"');
});

test('structured code blocks enable highlighting globally or per block', () => {
  const block = createBlock({
    type: 'code',
    filename: 'server.js',
    content: 'const port = 3000;',
  });
  const plainLines = renderBlockLines({ block, width: 36, theme });
  const highlightedLines = renderBlockLines({ block, width: 36, theme, syntaxHighlight: true });
  assert.ok(!plainLines.some((line) => line.includes(theme.syntaxKeyword)));
  assert.ok(highlightedLines.some((line) => line.includes(theme.syntaxKeyword)));
  assert.ok(highlightedLines.some((line) => line.includes(theme.syntaxNumber)));
  assert.match(stripAnsi(highlightedLines.join('\n')), /server\.js/);

  const disabled = createBlock({ ...block, syntaxHighlight: false });
  const disabledLines = renderBlockLines({ block: disabled, width: 36, theme, syntaxHighlight: true });
  assert.ok(!disabledLines.some((line) => line.includes(theme.syntaxKeyword)));

  const enabled = createBlock({ type: 'code', language: 'python', syntaxHighlight: true, content: 'return True' });
  const enabledLines = renderBlockLines({ block: enabled, width: 36, theme });
  assert.ok(enabledLines.some((line) => line.includes(theme.syntaxKeyword)));
  assert.ok(enabledLines.some((line) => line.includes(theme.syntaxConstant)));
});


test('chat rendering can enable syntax highlighting without changing block defaults', () => {
  const message = {
    role: 'assistant',
    status: 'complete',
    blocks: [createBlock({ type: 'code', filename: 'main.py', content: 'def answer():\n    return 42' })],
  };
  const highlighted = renderToString(ChatScreen({
    columns: 88,
    rows: 20,
    messages: [message],
    syntaxHighlight: true,
    theme,
    inputParts: { before: '', current: ' ', after: '' },
  }), { width: 88, height: 20 });
  const plain = renderToString(ChatScreen({
    columns: 88,
    rows: 20,
    messages: [message],
    syntaxHighlight: false,
    theme,
    inputParts: { before: '', current: ' ', after: '' },
  }), { width: 88, height: 20 });
  assert.ok(highlighted.includes(`${theme.syntaxKeyword}def`));
  assert.ok(highlighted.includes(`${theme.syntaxNumber}42`));
  assert.ok(!plain.includes(`${theme.syntaxKeyword}def`));
});

test('multiline comments and strings reapply syntax styles on every rendered line', () => {
  const pythonSource = '"""first\nsecond"""';
  const stringLines = highlightSyntaxLines(pythonSource, { language: 'python', theme });
  assert.equal(stringLines.length, 2);
  assert.ok(stringLines[0].startsWith(theme.syntaxString));
  assert.ok(stringLines[1].startsWith(theme.syntaxString));
  assert.equal(stripAnsi(stringLines.join('\n')), pythonSource);

  const commentSource = '/* first\nsecond */';
  const commentLines = highlightSyntaxLines(commentSource, { language: 'c', theme });
  assert.ok(commentLines[0].startsWith(theme.syntaxComment));
  assert.ok(commentLines[1].startsWith(theme.syntaxComment));
  assert.equal(stripAnsi(commentLines.join('\n')), commentSource);
});


test('language detection handles precedence, special filenames and safe unknown fallbacks', () => {
  assert.equal(normalizeSyntaxLanguage(''), '');
  assert.equal(normalizeSyntaxLanguage('brainfuck'), '');
  assert.equal(detectSyntaxLanguage({ language: 'python', filename: 'main.js' }), 'python');
  assert.equal(detectSyntaxLanguage({ filename: 'Makefile' }), 'shell');
  assert.equal(detectSyntaxLanguage({ filename: 'Dockerfile' }), 'shell');
  assert.equal(detectSyntaxLanguage({ filename: 'C:\\Users\\me\\.bashrc' }), 'shell');
  assert.equal(detectSyntaxLanguage({ filename: 'Shaders/Surface.metal' }), 'cpp');
  assert.equal(detectSyntaxLanguage({ filename: 'App/App.entitlements' }), 'xml');
  assert.equal(detectSyntaxLanguage({ filename: 'Main.storyboard' }), 'xml');
  assert.equal(detectSyntaxLanguage({ source: '#!/usr/bin/env node\nconsole.log(1)' }), 'javascript');
  assert.equal(detectSyntaxLanguage({ source: '<?xml version="1.0"?><root />' }), 'xml');
  assert.equal(detectSyntaxLanguage({ source: '<!DOCTYPE html><html></html>' }), 'xml');
  assert.equal(detectSyntaxLanguage({ filename: 'README.unknown', source: 'plain text' }), '');
});

test('generic tokenizer covers shell variables, JSON properties, annotations and operator forms', () => {
  const shell = tokenizeSyntax('echo "$HOME" ${USER} $? $', { language: 'shell' });
  assert.ok(shell.some((token) => token.type === 'builtin' && token.value.includes('echo')));
  assert.ok(shell.some((token) => token.type === 'string' && token.value.includes('$HOME')));
  assert.ok(shell.some((token) => token.type === 'constant' && token.value.includes('${USER}')));
  assert.ok(shell.some((token) => token.type === 'constant' && token.value.includes('$?')));

  const json = tokenizeSyntax('{"name": "terlio", "enabled": true, "count": 0x10}', { language: 'json' });
  assert.ok(json.some((token) => token.type === 'property' && token.value === '"name"'));
  assert.ok(json.some((token) => token.type === 'string' && token.value === '"terlio"'));
  assert.ok(json.some((token) => token.type === 'constant' && token.value === 'true'));
  assert.ok(json.some((token) => token.type === 'number' && token.value === '0x10'));

  const annotations = tokenizeSyntax('@main struct App {}\n@interface View : NSObject\n#[derive(Debug)] struct Item;', { language: 'swift' });
  assert.ok(annotations.some((token) => token.type === 'annotation' && token.value === '@main'));
  const objc = tokenizeSyntax('@interface View : NSObject\n@end', { language: 'objective-c' });
  assert.ok(objc.some((token) => token.type === 'annotation' && token.value === '@interface'));
  const rust = tokenizeSyntax('#[derive(Debug)]\nlet value: u64 = 0b1010;', { language: 'rust' });
  assert.ok(rust.some((token) => token.type === 'annotation'));
  assert.ok(rust.some((token) => token.type === 'number' && token.value === '0b1010'));

  const operators = tokenizeSyntax('obj.value ??= 1.5e+2; a::b -> c && d != e 🙂', { language: 'cpp' });
  assert.ok(operators.some((token) => token.type === 'property' && token.value === 'value'));
  assert.ok(operators.some((token) => token.type === 'operator' && token.value.includes('::')));
  assert.ok(operators.some((token) => token.type === 'punctuation' && token.value.includes(';')));
  assert.ok(operators.some((token) => token.type === 'text' && token.value.includes('🙂')));
});

test('markup tokenizer recognizes comments, tags, properties, strings, entities and incomplete input', () => {
  const source = '<!-- note -->\n<plist version="1.0"><key>Name</key>&amp;</plist>';
  const tokens = tokenizeSyntax(source, { filename: 'Info.plist' });
  assert.ok(tokens.some((token) => token.type === 'comment' && token.value.includes('note')));
  assert.ok(tokens.some((token) => token.type === 'keyword' && token.value.includes('plist')));
  assert.ok(tokens.some((token) => token.type === 'property' && token.value.includes('version')));
  assert.ok(tokens.some((token) => token.type === 'string' && token.value.includes('1.0')));
  assert.ok(tokens.some((token) => token.type === 'constant' && token.value === '&amp;'));
  assert.equal(tokens.map((token) => token.value).join(''), source);

  assert.equal(tokenizeSyntax('<!-- open', { language: 'xml' }).map((token) => token.value).join(''), '<!-- open');
  assert.equal(tokenizeSyntax('<tag attr="open"', { language: 'xml' }).map((token) => token.value).join(''), '<tag attr="open"');
});

test('unterminated strings and comments remain lossless', () => {
  for (const [source, language] of [
    ['const text = "open', 'javascript'],
    ['/* open', 'c'],
    ['"""open', 'python'],
    ['const path = "a\\\"b";', 'javascript'],
  ]) {
    const tokens = tokenizeSyntax(source, { language });
    assert.equal(tokens.map((token) => token.value).join(''), source);
  }
});

test('syntax token styling supports validated explicit, fallback, unknown and empty tokens', () => {
  assert.equal(styleSyntaxToken({ type: 'keyword', value: 'let' }, { syntaxKeyword: '\x1b[31m' }), '\x1b[31mlet\x1b[0m');
  assert.equal(styleSyntaxToken({ type: 'comment', value: 'note' }, { textMuted: '\x1b[2m' }), '\x1b[2mnote\x1b[0m');
  assert.equal(styleSyntaxToken({ type: 'keyword', value: 'let' }, { syntaxKeyword: '<k>' }), 'let');
  assert.equal(styleSyntaxToken({ type: 'missing', value: 'plain' }, {}), 'plain');
  assert.equal(styleSyntaxToken({ type: 'string', value: '' }, theme), '');
  assert.equal(styleSyntaxToken(null, theme), '');
});

test('unknown highlighted code blocks retain the normal muted fallback', () => {
  const block = createBlock({ type: 'code', language: 'unknown', syntaxHighlight: true, content: 'plain source' });
  const lines = renderBlockLines({ block, width: 32, theme, syntaxHighlight: true });
  assert.ok(lines.some((line) => line.startsWith(theme.muted) && line.includes('plain source')));
});
