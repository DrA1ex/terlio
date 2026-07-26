import { ansi } from './ansi/codes.js';
import { sanitizeSgrStyle } from './terminal/controlParser.js';
import { enforceLimit, normalizeSecurityLimits } from './securityLimits.js';

const TOKEN_LIMITS = new WeakMap();

export const SYNTAX_TOKEN_TYPES = Object.freeze([
  'text',
  'comment',
  'string',
  'number',
  'keyword',
  'type',
  'builtin',
  'constant',
  'property',
  'preprocessor',
  'annotation',
  'operator',
  'punctuation',
]);

export const SUPPORTED_SYNTAX_LANGUAGES = Object.freeze([
  'javascript',
  'typescript',
  'python',
  'c',
  'cpp',
  'objective-c',
  'swift',
  'shell',
  'json',
  'xml',
  'css',
  'java',
  'go',
  'rust',
]);

const ALIASES = new Map(Object.entries({
  js: 'javascript', javascript: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
  ts: 'typescript', typescript: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', python: 'python', python3: 'python',
  c: 'c',
  h: 'c', header: 'c',
  cpp: 'cpp', 'c++': 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp', hxx: 'cpp', hh: 'cpp',
  objc: 'objective-c', 'objective-c': 'objective-c', objectivec: 'objective-c', m: 'objective-c', mm: 'objective-c',
  swift: 'swift',
  sh: 'shell', shell: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  json: 'json', jsonc: 'json',
  xml: 'xml', html: 'xml', xhtml: 'xml', plist: 'xml', svg: 'xml',
  css: 'css', scss: 'css', less: 'css',
  java: 'java',
  go: 'go', golang: 'go',
  rs: 'rust', rust: 'rust',
}));

const EXTENSIONS = new Map(Object.entries({
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.py': 'python', '.pyw': 'python',
  '.c': 'c', '.h': 'c',
  '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp', '.hxx': 'cpp', '.metal': 'cpp',
  '.m': 'objective-c', '.mm': 'objective-c',
  '.swift': 'swift',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell', '.fish': 'shell',
  '.json': 'json', '.jsonc': 'json',
  '.xml': 'xml', '.html': 'xml', '.htm': 'xml', '.xhtml': 'xml', '.plist': 'xml', '.entitlements': 'xml', '.storyboard': 'xml', '.xib': 'xml', '.svg': 'xml',
  '.css': 'css', '.scss': 'css', '.less': 'css',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
}));


const SYNTAX_THEME_FALLBACKS = Object.freeze({
  text: 'text',
  comment: 'textMuted',
  string: 'success',
  number: 'warning',
  keyword: 'textAccent',
  type: 'info',
  builtin: 'title',
  constant: 'warning',
  property: 'assistant',
  preprocessor: 'danger',
  annotation: 'info',
  operator: 'textMuted',
  punctuation: 'textMuted',
});

const COMMON_CONSTANTS = words('true false null nil None True False undefined NaN Infinity self super this YES NO');
const COMMON_TYPES = words('string number boolean object void any unknown never int float double char short long unsigned signed bool byte size_t String Array Object Map Set Error Promise');

const DEFINITIONS = {
  javascript: definition({
    keywords: 'as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static switch throw try typeof var while with yield',
    types: 'Array BigInt Boolean Date Error Function Map Number Object Promise RegExp Set String Symbol WeakMap WeakSet',
    builtins: 'console document globalThis JSON Math process require module exports setTimeout setInterval clearTimeout clearInterval fetch',
    constants: 'true false null undefined NaN Infinity',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'", '`'],
  }),
  typescript: definition({
    keywords: 'abstract any as asserts async await break case catch class const constructor continue declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new of out override private protected public readonly return satisfies set static super switch symbol this throw try type typeof undefined unique unknown using var void while with yield',
    types: 'Array BigInt Boolean Date Error Function Map Number Object Promise ReadonlyArray Record RegExp Set String Symbol WeakMap WeakSet',
    builtins: 'console document globalThis JSON Math process require module exports setTimeout setInterval clearTimeout clearInterval fetch',
    constants: 'true false null undefined NaN Infinity',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'", '`'],
  }),
  python: definition({
    keywords: 'and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield',
    types: 'bool bytes bytearray complex dict float frozenset int list memoryview object range set slice str tuple type',
    builtins: 'abs all any bin breakpoint callable chr classmethod compile dir divmod enumerate eval exec filter format getattr globals hasattr hash help hex id input isinstance issubclass iter len locals map max min next oct open ord pow print property repr reversed round setattr sorted staticmethod sum super vars zip __import__',
    constants: 'True False None NotImplemented Ellipsis',
    lineComments: ['#'], blockComments: [], strings: ['"', "'"], tripleStrings: ['"""', "'''"], atKeywords: true,
  }),
  c: definition({
    keywords: 'auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while _Alignas _Alignof _Atomic _Bool _Complex _Generic _Imaginary _Noreturn _Static_assert _Thread_local',
    types: 'void char short int long float double signed unsigned size_t ptrdiff_t wchar_t FILE',
    builtins: 'printf fprintf sprintf snprintf scanf malloc calloc realloc free memcpy memmove memset strlen strcmp strcpy strncpy fopen fclose',
    constants: 'NULL true false',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], preprocessor: true,
  }),
  cpp: definition({
    keywords: 'alignas alignof and and_eq asm atomic_cancel atomic_commit atomic_noexcept auto bitand bitor break case catch class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern for friend goto if import inline module mutable namespace new noexcept not not_eq operator or or_eq private protected public reflexpr register reinterpret_cast requires return sizeof static static_assert static_cast struct switch synchronized template this thread_local throw try typedef typeid typename union using virtual volatile while xor xor_eq',
    types: 'void char char8_t char16_t char32_t wchar_t short int long float double signed unsigned bool size_t ptrdiff_t string vector array map unordered_map set unordered_set optional variant tuple unique_ptr shared_ptr weak_ptr',
    builtins: 'std cout cerr cin endl move forward make_unique make_shared printf malloc free',
    constants: 'nullptr true false NULL',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], preprocessor: true,
  }),
  'objective-c': definition({
    keywords: 'auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while interface implementation protocol property synthesize dynamic selector encode synchronized autoreleasepool try catch finally throw class public private protected package optional required end import',
    types: 'void char short int long float double signed unsigned BOOL NSInteger NSUInteger CGFloat id Class SEL NSString NSArray NSDictionary NSSet NSNumber NSData NSError NSObject',
    builtins: 'NSLog alloc init new copy mutableCopy retain release autorelease',
    constants: 'nil Nil NULL YES NO true false',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], preprocessor: true, atKeywords: true,
  }),
  swift: definition({
    keywords: 'associatedtype borrowing break case catch class consume consuming continue convenience copy default defer deinit didSet distributed do dynamic else enum extension fallthrough fileprivate final for func get guard if import indirect infix init in inout internal is isolated nonisolated lazy let macro mutating nonmutating open operator optional override package postfix precedencegroup prefix private protocol public repeat required rethrows return set some static struct subscript switch throws throwing try typealias unowned var weak where while willSet',
    types: 'Any AnyObject Array Bool Character Data Dictionary Double Error Float Int Int8 Int16 Int32 Int64 Never Optional Result Set String UInt UInt8 UInt16 UInt32 UInt64 URL',
    builtins: 'print debugPrint dump fatalError precondition assertionFailure type of',
    constants: 'true false nil self super',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"'], tripleStrings: ['"""'], atKeywords: true,
  }),
  shell: definition({
    keywords: 'if then elif else fi for while until do done case esac function in select time coproc',
    types: '',
    builtins: 'alias bg bind break builtin cd command continue declare dirs disown echo enable eval exec exit export false fc fg getopts hash help history jobs kill let local logout mapfile popd printf pushd pwd read readonly return set shift shopt source suspend test times trap true type typeset ulimit umask unalias unset wait',
    constants: 'true false',
    lineComments: ['#'], blockComments: [], strings: ['"', "'", '`'], shellVariables: true,
  }),
  json: definition({
    keywords: '', types: '', builtins: '', constants: 'true false null',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"'], json: true,
  }),
  css: definition({
    keywords: '@charset @container @font-face @import @keyframes @layer @media @namespace @page @property @supports from to important',
    types: '', builtins: 'var calc min max clamp rgb rgba hsl hsla url env', constants: 'inherit initial unset revert transparent currentColor',
    lineComments: [], blockComments: [['/*', '*/']], strings: ['"', "'"], css: true, atKeywords: true,
  }),
  java: definition({
    keywords: 'abstract assert break case catch class const continue default do else enum exports extends final finally for goto if implements import instanceof interface module native new non-sealed open opens package permits private protected provides public record requires return sealed static strictfp super switch synchronized this throw throws to transient transitive try uses var void volatile while with yield',
    types: 'boolean byte char double float int long short String Object Class Integer Long Double Float Boolean Character Byte Short BigDecimal BigInteger List Map Set Optional Stream',
    builtins: 'System Math Objects Arrays Collections', constants: 'true false null',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], atKeywords: true,
  }),
  go: definition({
    keywords: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
    types: 'bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr',
    builtins: 'append cap clear close complex copy delete imag len make max min new panic print println real recover', constants: 'true false nil iota',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'", '`'],
  }),
  rust: definition({
    keywords: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type union unsafe use where while',
    types: 'bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize String Vec Box Option Result HashMap HashSet',
    builtins: 'assert assert_eq assert_ne cfg column concat dbg eprintln env file format format_args include include_bytes include_str line module_path option_env panic print println stringify thread_local todo unimplemented unreachable vec', constants: 'true false None Some Ok Err',
    lineComments: ['//'], blockComments: [['/*', '*/']], strings: ['"', "'"], annotations: ['#'],
  }),
};

export function normalizeSyntaxLanguage(value) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/^language-/, '');
  if (!normalized) return '';
  return ALIASES.get(normalized) ?? '';
}

export function detectSyntaxLanguage({ language = '', filename = '', source = '' } = {}) {
  const explicit = normalizeSyntaxLanguage(language);
  if (explicit) return explicit;

  const name = String(filename ?? '').trim().toLowerCase().replace(/\\/g, '/').split('/').at(-1) ?? '';
  if (name) {
    if (name === 'makefile' || name === 'dockerfile' || name === '.zshrc' || name === '.bashrc') return 'shell';
    const dot = name.lastIndexOf('.');
    if (dot >= 0) {
      const detected = EXTENSIONS.get(name.slice(dot));
      if (detected) return detected;
    }
  }

  const firstLine = String(source ?? '').split(/\r?\n/, 1)[0] ?? '';
  if (/^#!.*\b(?:python|python3)\b/.test(firstLine)) return 'python';
  if (/^#!.*\b(?:bash|zsh|sh|fish)\b/.test(firstLine)) return 'shell';
  if (/^#!.*\bnode\b/.test(firstLine)) return 'javascript';
  if (/^\s*<\?xml\b|^\s*<!doctype\s+html\b|^\s*<plist\b/i.test(String(source ?? ''))) return 'xml';
  return '';
}

export function tokenizeSyntax(source, options = {}) {
  const text = String(source ?? '');
  const language = detectSyntaxLanguage({ ...options, source: text });
  const limits = normalizeSecurityLimits(options.securityLimits);
  const tokens = !language
    ? createTokenList(limits.syntaxTokens, 'text', text)
    : language === 'xml'
      ? tokenizeMarkup(text, limits.syntaxTokens)
      : tokenizeGeneric(text, DEFINITIONS[language] ?? DEFINITIONS.javascript, limits.syntaxTokens);
  enforceLimit('syntaxTokens', tokens.length, limits.syntaxTokens);
  return tokens;
}

export function highlightSyntax(source, options = {}) {
  return highlightSyntaxLines(source, options).join('\n');
}

export function highlightSyntaxLines(source, {
  language = '',
  filename = '',
  theme = {},
  enabled = true,
  securityLimits = null,
} = {}) {
  const text = String(source ?? '');
  if (!enabled) return text.split('\n');
  const detected = detectSyntaxLanguage({ language, filename, source: text });
  if (!detected) return text.split('\n');

  const lines = [''];
  for (const token of tokenizeSyntax(text, { language: detected, securityLimits })) {
    const parts = String(token.value ?? '').split('\n');
    for (let index = 0; index < parts.length; index += 1) {
      if (parts[index]) lines[lines.length - 1] += styleSyntaxToken({ ...token, value: parts[index] }, theme);
      if (index < parts.length - 1) lines.push('');
    }
  }
  return lines;
}

export function styleSyntaxToken(token, theme = {}) {
  const type = SYNTAX_TOKEN_TYPES.includes(token?.type) ? token.type : 'text';
  const value = String(token?.value ?? '');
  const open = sanitizeSgrStyle(syntaxStyle(theme, type));
  if (!open || !value) return value;
  return `${open}${value}${ansi.reset}`;
}

function syntaxStyle(theme, type) {
  const explicit = theme?.[`syntax${capitalize(type)}`];
  if (explicit != null) return explicit;
  const fallbackToken = SYNTAX_THEME_FALLBACKS[type] ?? 'text';
  return theme?.[fallbackToken] ?? theme?.text ?? '';
}

function tokenizeGeneric(text, config, tokenLimit) {
  const tokens = createTokenList(tokenLimit);
  let index = 0;
  let lineStart = true;

  while (index < text.length) {
    const char = text[index];

    if (char === '\n') {
      push(tokens, 'text', '\n');
      index += 1;
      lineStart = true;
      continue;
    }

    if (lineStart && config.preprocessor) {
      const match = /^(\s*#.*?)(?=\n|$)/.exec(text.slice(index));
      if (match) {
        push(tokens, 'preprocessor', match[1]);
        index += match[1].length;
        lineStart = false;
        continue;
      }
    }

    if (/\s/.test(char)) {
      const match = /^[^\S\r\n]+/.exec(text.slice(index));
      const value = match?.[0] ?? char;
      push(tokens, 'text', value);
      lineStart = value.endsWith('\n');
      index += value.length;
      continue;
    }
    lineStart = false;

    const lineComment = config.lineComments.find((marker) => text.startsWith(marker, index));
    if (lineComment) {
      const end = text.indexOf('\n', index);
      const value = text.slice(index, end < 0 ? text.length : end);
      push(tokens, 'comment', value);
      index += value.length;
      continue;
    }

    const blockComment = config.blockComments.find(([open]) => text.startsWith(open, index));
    if (blockComment) {
      const [open, close] = blockComment;
      const end = text.indexOf(close, index + open.length);
      const stop = end < 0 ? text.length : end + close.length;
      push(tokens, 'comment', text.slice(index, stop));
      index = stop;
      continue;
    }

    const triple = config.tripleStrings.find((delimiter) => text.startsWith(delimiter, index));
    if (triple) {
      const stop = findStringEnd(text, index, triple, { escapes: true });
      push(tokens, 'string', text.slice(index, stop));
      index = stop;
      continue;
    }

    if (config.shellVariables && char === '$') {
      const match = /^\$(?:\{[^}\n]*\}|[A-Za-z_][\w]*|[0-9@#?$!*-])/.exec(text.slice(index));
      if (match) {
        push(tokens, 'constant', match[0]);
        index += match[0].length;
        continue;
      }
    }

    const stringDelimiter = config.strings.find((delimiter) => text.startsWith(delimiter, index));
    if (stringDelimiter) {
      const stop = findStringEnd(text, index, stringDelimiter, { escapes: stringDelimiter !== '`' || config !== DEFINITIONS.shell });
      let type = 'string';
      if (config.json) {
        const rest = text.slice(stop).match(/^\s*/)?.[0]?.length ?? 0;
        if (text[stop + rest] === ':') type = 'property';
      }
      push(tokens, type, text.slice(index, stop));
      index = stop;
      continue;
    }

    if (config.atKeywords && char === '@') {
      const match = /^@[A-Za-z_][\w]*/.exec(text.slice(index));
      if (match) {
        push(tokens, 'annotation', match[0]);
        index += match[0].length;
        continue;
      }
    }

    if (config.annotations?.includes(char)) {
      const match = /^#\!?\[[^\]\n]*\]/.exec(text.slice(index));
      if (match) {
        push(tokens, 'annotation', match[0]);
        index += match[0].length;
        continue;
      }
    }

    const number = /^(?:0[xX][0-9a-fA-F](?:_?[0-9a-fA-F])*|0[bB][01](?:_?[01])*|0[oO][0-7](?:_?[0-7])*|(?:\d(?:_?\d)*)?(?:\.\d(?:_?\d)*)|\d(?:_?\d)*(?:\.\d(?:_?\d)*)?)(?:[eE][+-]?\d(?:_?\d)*)?[fFdDlLuU]*/.exec(text.slice(index));
    if (number?.[0]) {
      push(tokens, 'number', number[0]);
      index += number[0].length;
      continue;
    }

    const identifier = /^[A-Za-z_$][\w$]*/.exec(text.slice(index));
    if (identifier) {
      const value = identifier[0];
      const type = config.keywords.has(value) ? 'keyword'
        : config.types.has(value) || COMMON_TYPES.has(value) ? 'type'
          : config.builtins.has(value) ? 'builtin'
            : config.constants.has(value) || COMMON_CONSTANTS.has(value) ? 'constant'
              : propertyAfterDot(tokens) ? 'property'
                : 'text';
      push(tokens, type, value);
      index += value.length;
      continue;
    }

    const operator = /^(?:===|!==|>>>|<<=|>>=|=>|\?\?|\?\.|\+\+|--|&&|\|\||==|!=|<=|>=|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|::|->|\.\.|\*\*|:=|[+\-*\/%=&|^!<>?:~])/.exec(text.slice(index));
    if (operator) {
      push(tokens, 'operator', operator[0]);
      index += operator[0].length;
      continue;
    }

    if (/^[()[\]{}.,;]/.test(char)) {
      push(tokens, 'punctuation', char);
      index += 1;
      continue;
    }

    push(tokens, 'text', char);
    index += 1;
  }

  return tokens;
}

function tokenizeMarkup(text, tokenLimit) {
  const tokens = createTokenList(tokenLimit);
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('<!--', index)) {
      const end = text.indexOf('-->', index + 4);
      const stop = end < 0 ? text.length : end + 3;
      push(tokens, 'comment', text.slice(index, stop));
      index = stop;
      continue;
    }
    if (text[index] === '<') {
      const end = text.indexOf('>', index + 1);
      const stop = end < 0 ? text.length : end + 1;
      const tag = text.slice(index, stop);
      const parts = tag.match(/<\/?|\?>|\/?>|[A-Za-z_:][\w:.-]*|=|"[^"]*"|'[^']*'|\s+|./g) ?? [tag];
      let seenName = false;
      for (const part of parts) {
        let type = 'text';
        if (/^<\/?$|^\/?>$|^\?>$|^=$/.test(part)) type = 'punctuation';
        else if (/^\s+$/.test(part)) type = 'text';
        else if (/^['"]/.test(part)) type = 'string';
        else if (!seenName && /^[A-Za-z_:]/.test(part)) {
          type = 'keyword';
          seenName = true;
        } else if (/^[A-Za-z_:]/.test(part)) type = 'property';
        push(tokens, type, part);
      }
      index = stop;
      continue;
    }
    if (text[index] === '&') {
      const match = /^&[A-Za-z0-9#]+;/.exec(text.slice(index));
      if (match) {
        push(tokens, 'constant', match[0]);
        index += match[0].length;
        continue;
      }
    }
    const next = text.indexOf('<', index);
    const stop = next < 0 ? text.length : next;
    push(tokens, 'text', text.slice(index, stop));
    index = stop;
  }
  return tokens;
}

function findStringEnd(text, start, delimiter, { escapes = true } = {}) {
  let index = start + delimiter.length;
  while (index < text.length) {
    if (escapes && text[index] === '\\') {
      index += Math.min(2, text.length - index);
      continue;
    }
    if (text.startsWith(delimiter, index)) return index + delimiter.length;
    index += 1;
  }
  return text.length;
}

function definition({ keywords = '', types = '', builtins = '', constants = '', lineComments = [], blockComments = [], strings = [], tripleStrings = [], ...rest }) {
  return {
    keywords: words(keywords),
    types: words(types),
    builtins: words(builtins),
    constants: words(constants),
    lineComments,
    blockComments,
    strings,
    tripleStrings,
    ...rest,
  };
}

function words(value) {
  return new Set(String(value ?? '').split(/\s+/).filter(Boolean));
}

function push(tokens, type, value) {
  if (!value) return;
  const last = tokens.at(-1);
  if (last?.type === type) last.value += value;
  else {
    enforceLimit('syntaxTokens', tokens.length + 1, TOKEN_LIMITS.get(tokens) ?? Infinity);
    tokens.push({ type, value });
  }
}

function createTokenList(limit, type = null, value = '') {
  const tokens = [];
  TOKEN_LIMITS.set(tokens, limit);
  if (type && value) push(tokens, type, value);
  return tokens;
}

function propertyAfterDot(tokens) {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (/^\s*$/.test(token.value)) continue;
    return token.value.endsWith('.');
  }
  return false;
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : '';
}
