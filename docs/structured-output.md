# Structured output

The library includes helpers for AI-style chat applications and structured assistant responses. These helpers are used by the mock chat demo, blocks gallery, code-review demo, agent streaming demo, and support desk demo.

## Messages

Message helpers live in `state.js` and are exported from the package entrypoint.

```js
import {
  createMessage,
  appendMessageChunk,
  appendMessageBlock,
  setMessageBlocks,
  completeMessage,
  normalizeMessages,
  visibleConversationMessages,
  lastUserMessage,
  lastAssistantMessage,
} from 'terlio.js';
```

Create a message:

```js
const message = createMessage({
  role: 'assistant',
  content: '',
  status: 'streaming',
  blocks: [],
  meta: { provider: 'mock' },
});
```

Streaming text:

```js
appendMessageChunk(message, 'Hello');
appendMessageChunk(message, ' world');
completeMessage(message);
```

Messages keep a plain `content` string for compatibility and may also contain structured `blocks`.

## Blocks

Structured blocks represent different assistant output types.

```js
import {
  BLOCK_TYPES,
  createBlock,
  normalizeBlock,
  normalizeBlocks,
  appendBlockContent,
  blockToText,
  blocksToText,
  ensureTextBlock,
} from 'terlio.js';
```

Supported block types:

- `text`
- `code`
- `diff`
- `command`
- `warning`
- `tool_result`

Create blocks:

```js
const blocks = [
  createBlock({ type: 'text', content: 'I found two issues.' }),
  createBlock({ type: 'code', language: 'js', content: 'console.log("hello");' }),
  createBlock({ type: 'warning', content: 'This command mutates files.' }),
];
```

Append streamed content to the last compatible block:

```js
appendBlockContent(blocks[0], ' More text.');
```

Convert blocks back to plain text:

```js
const text = blocksToText(blocks);
```

## Chat screen

`createChatScreen()` creates the full chat UI tree used by `RichTerminalApp`.

```js
import { createChatScreen, renderToString } from 'terlio.js';

const screen = createChatScreen({
  messages,
  input: '/help',
  cursor: 5,
  status: 'Ready',
  suggestions: [],
  themeName: 'dark',
  providerName: 'mock',
  skillNames: [],
});

console.log(renderToString(screen, { width: 100, height: 30 }));
```

Lower-level chat exports include:

- `ChatScreen`
- `ChatHeader`
- `ChatTranscript`
- `SuggestionsPanel`
- `PalettePanel`
- `DebugPanel`
- `StatusBar`
- `InputBar`
- `Lines`
- `Clip`
- `renderTranscriptLines`
- `renderMessageContentLines`
- `renderBlocksLines`
- `renderBlockLines`

These are useful when you want the default transcript rendering but not the full `RichTerminalApp`.

## Providers

Providers implement the streaming interface used by `RichTerminalApp`.

```js
import { createProvider, listProviders } from 'terlio.js';

const provider = createProvider('mock');
console.log(listProviders());
```

Built-in providers:

- `MockProvider` — generates rule-based mock replies and structured blocks.
- `ReplayProvider` — replays deterministic output.

A provider is expected to expose a `stream(prompt, options)`-style operation compatible with the app. The mock provider supports callbacks for plain chunks and structured blocks.

## Mock model helpers

```js
import {
  buildMockReply,
  buildMockBlocks,
  streamMockReply,
  streamMockBlocks,
  StreamCancelled,
} from 'terlio.js';
```

Build an immediate mock reply:

```js
const text = buildMockReply('explain sessions');
const blocks = buildMockBlocks('show code');
```

Stream a reply:

```js
const controller = new AbortController();
await streamMockReply({
  prompt: 'hello',
  signal: controller.signal,
  onChunk: (chunk) => process.stdout.write(chunk),
});
```

Stream structured blocks:

```js
await streamMockBlocks({
  prompt: 'review code',
  onChunk: (chunk) => appendMessageChunk(message, chunk),
  onBlock: (block) => appendMessageBlock(message, block),
});
```

If streaming is aborted, helpers throw `StreamCancelled`.

## Skills

Skill helpers are used by the mock AI chat app to alter responses.

```js
import { createSkillState, enabledSkillNames, formatSkillList, getSkill, skills } from 'terlio.js';

const state = createSkillState();
const names = enabledSkillNames(state);
```

Session persistence helpers:

```js
import { serializeSkillState, applySerializedSkillState } from 'terlio.js';

const saved = serializeSkillState(skillState);
const restored = createSkillState();
applySerializedSkillState(restored, saved);
```

## Rendering structured blocks yourself

You can render blocks directly without using the full chat screen:

```js
import { renderBlocksLines, Box, Text } from 'terlio.js';

const lines = renderBlocksLines({ blocks, width: 80, syntaxHighlight: true });
const node = Box({ border: true, title: ' Assistant ' }, ...lines.map((line) => Text(line, { wrap: false })));
```

This is useful for code review tools, command runners, and agent consoles where blocks are selected, copied, applied, or retried independently.


## Syntax-highlighted code blocks

Code highlighting is disabled by default. Enable it for one block with `syntaxHighlight: true`, or pass `syntaxHighlight: true` to `renderBlockLines()`, `renderBlocksLines()`, `ChatScreen`, or `RichTerminalApp`.

```js
const block = createBlock({
  type: 'code',
  filename: 'main.cpp',
  syntaxHighlight: true,
  content: '#include <iostream>\nint main() { return 0; }',
});
```

The renderer uses `language` first and then `filename` for detection. See [Syntax highlighting](syntax-highlighting.md) for supported languages and custom theme tokens.
