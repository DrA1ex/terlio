# Syntax highlighting

Terlio.js includes a small zero-dependency lexical highlighter for common source files. It recognizes comments, strings, numbers, keywords, types, built-ins, constants, properties, annotations, operators and preprocessor lines. It is intentionally lightweight: it does not build an AST and it does not attempt semantic analysis.

Highlighting is opt-in, so existing code and transcript rendering remains unchanged until it is enabled.

## Supported languages

The built-in language set includes:

- JavaScript and JSX
- TypeScript and TSX
- Python
- C and `.h` headers
- C++ and `.hpp`/`.hh`/`.hxx` headers
- Objective-C and Objective-C++ (`.m` and `.mm`)
- Swift and Metal source (`.swift` and `.metal`)
- shell scripts (`sh`, Bash, Zsh and Fish)
- JSON and JSON with comments
- XML, HTML, SVG, property lists, entitlements, storyboards and XIB files
- CSS, SCSS and Less
- Java
- Go
- Rust

Language aliases, file extensions and common shebangs are normalized automatically. An explicit `language` always takes precedence over `filename` detection.

## Highlight a standalone source string

Use `SyntaxText` when the highlighted source is part of a component tree:

```js
import { SyntaxText, themes } from 'terlio.js';

const source = SyntaxText({
  code: 'const answer = 42;',
  language: 'javascript',
  theme: themes.ocean,
});
```

Use `highlightSyntax()` or `highlightSyntaxLines()` when you need ANSI text directly:

```js
import { highlightSyntaxLines, themes } from 'terlio.js';

const lines = highlightSyntaxLines(sourceCode, {
  filename: 'Sources/App.swift',
  theme: themes.ocean,
});
```

Unknown languages safely return the original text without styling.

## Structured code blocks

Enable highlighting for one block:

```js
import { createBlock, renderBlockLines, themes } from 'terlio.js';

const block = createBlock({
  type: 'code',
  filename: 'server.js',
  syntaxHighlight: true,
  content: 'export const port = 3000;',
});

const lines = renderBlockLines({
  block,
  width: 72,
  theme: themes.ocean,
});
```

Enable it for every code block in one render call:

```js
const lines = renderBlocksLines({
  blocks,
  width: 72,
  theme: themes.ocean,
  syntaxHighlight: true,
});
```

A block-level `syntaxHighlight: false` overrides a globally enabled renderer. `filename` is used for both detection and the default code-block title when no explicit title is supplied.

## Chat applications

Enable highlighting in the complete chat runtime:

```js
const app = new RichTerminalApp({
  syntaxHighlight: true,
});
```

Or pass the option to the reusable chat screen:

```js
const screen = ChatScreen({
  messages,
  syntaxHighlight: true,
  columns: 100,
  rows: 30,
});
```

## Theme tokens

The highlighter uses semantic theme fields. Every bundled theme supplies fallbacks, and custom themes may override any of these fields:

```js
const customTheme = {
  ...themes.ocean,
  syntaxKeyword: '\x1b[38;5;207m',
  syntaxString: '\x1b[38;5;114m',
  syntaxComment: '\x1b[38;5;244m',
};
```

Available fields are:

- `syntaxText`
- `syntaxComment`
- `syntaxString`
- `syntaxNumber`
- `syntaxKeyword`
- `syntaxType`
- `syntaxBuiltin`
- `syntaxConstant`
- `syntaxProperty`
- `syntaxPreprocessor`
- `syntaxAnnotation`
- `syntaxOperator`
- `syntaxPunctuation`

## Example

Run the packaged snapshot:

```bash
npx terlio.js example:syntax
```

From a development checkout:

```bash
npm run example:syntax
```
