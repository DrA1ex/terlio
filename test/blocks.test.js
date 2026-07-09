import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendMessageBlock,
  appendMessageChunk,
  blocksToText,
  buildMockBlocks,
  createMessage,
  normalizeMessages,
  renderTranscriptLines,
  stripAnsi,
  streamMockBlocks,
  themes,
} from '../src/lib/index.js';

test('message blocks keep a plain text representation for old commands and sessions', () => {
  const message = createMessage({
    role: 'assistant',
    blocks: [
      { type: 'text', content: 'Plan:' },
      { type: 'command', title: 'Run checks', command: 'npm test' },
    ],
  });

  assert.match(message.content, /Plan:/);
  assert.match(message.content, /Run checks/);
  assert.match(message.content, /npm test/);
  assert.equal(message.blocks.length, 2);
});

test('appendMessageChunk streams into a text block and appendMessageBlock adds structured blocks', () => {
  const message = createMessage({ role: 'assistant', status: 'streaming' });
  appendMessageChunk(message, 'Hello');
  appendMessageChunk(message, ' world');
  appendMessageBlock(message, { type: 'code', language: 'js', content: 'console.log("ok")' });

  assert.equal(message.blocks[0].type, 'text');
  assert.equal(message.blocks[0].content, 'Hello world');
  assert.equal(message.blocks[1].type, 'code');
  assert.match(message.content, /console\.log/);
});

test('normalizeMessages preserves structured blocks from saved sessions', () => {
  const [message] = normalizeMessages([
    {
      id: 'm_00001',
      role: 'assistant',
      content: 'legacy fallback',
      blocks: [{ type: 'warning', content: 'careful' }],
    },
  ]);

  assert.equal(message.blocks.length, 1);
  assert.equal(message.blocks[0].type, 'warning');
  assert.match(message.content, /Warning: careful/);
});

test('transcript renderer renders code, diff, command, warning and tool result blocks', () => {
  const message = createMessage({
    role: 'assistant',
    blocks: [
      { type: 'text', content: 'Structured answer' },
      { type: 'code', language: 'js', title: 'sample', content: 'const ok = true;' },
      { type: 'diff', content: '- old\n+ new' },
      { type: 'command', title: 'Check', command: 'npm test' },
      { type: 'warning', content: 'mock warning' },
      { type: 'tool_result', name: 'runner', status: 'ok', content: 'all passed' },
    ],
  });

  const output = stripAnsi(renderTranscriptLines({ columns: 96, messages: [message], theme: themes.dark }).join('\n'));
  assert.match(output, /Structured answer/);
  assert.match(output, /sample/);
  assert.match(output, /const ok/);
  assert.match(output, /- old/);
  assert.match(output, /\+ new/);
  assert.match(output, /npm test/);
  assert.match(output, /warning: mock warning/);
  assert.match(output, /tool: runner · ok/);
});

test('mock provider can build and stream structured blocks', async () => {
  const blocks = buildMockBlocks('implement terminal code', ['code']);
  assert.ok(blocks.some((block) => block.type === 'code'));
  assert.ok(blocks.some((block) => block.type === 'command'));
  assert.match(blocksToText(blocks), /npm test/);

  let text = '';
  const streamed = [];
  await streamMockBlocks({
    prompt: 'implement terminal code',
    enabledSkills: ['code'],
    onChunk: (chunk) => { text += chunk; },
    onBlock: (block) => { streamed.push(block); },
    delayScale: 0,
  });

  assert.match(text, /terminal|layer|code/i);
  assert.ok(streamed.some((block) => block.type === 'code'));
});
