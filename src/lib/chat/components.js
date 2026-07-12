import { ansi } from '../ansi/codes.js';
import { themes } from '../ansi/themes.js';
import { color, truncateVisible, visibleLength } from '../ansi/text.js';
import { enabledSkillNames } from '../skills.js';
import { wrapText } from '../wrap.js';
import { getCommandPaletteMatches, getPaletteQuery } from '../commandPalette.js';
import { OverlayHost } from '../overlayHost.js';
import { RequireViewport } from '../ui/requireViewport.js';
import { Box, Column, Text } from '../ui/node.js';
import { renderNode } from '../ui/layout/index.js';
import { fit } from '../ui/layout/utils.js';
import { renderTextEditorLines } from '../ui/components/editor.js';
import { normalizeBlocks } from '../blocks.js';
import { packageDisplayName } from '../packageMetadata.js';

export const DEFAULT_SUGGESTION_WINDOW_SIZE = 6;
export const CHAT_MIN_COLUMNS = 56;
export const CHAT_MIN_ROWS = 18;

const MAX_READING_WIDTH = 112;

export function createChatScreen(props = {}) {
  const columns = Math.max(1, Number(props.columns) || 80);
  const rows = Math.max(1, Number(props.rows) || 24);
  const theme = props.theme ?? themes[props.themeName] ?? themes.ocean ?? themes.dark;
  const frame = Number(props.frame) || 0;

  if (columns < CHAT_MIN_COLUMNS || rows < CHAT_MIN_ROWS) {
    return {
      node: RequireViewport({
        width: columns,
        height: rows,
        minWidth: CHAT_MIN_COLUMNS,
        minHeight: CHAT_MIN_ROWS,
        title: packageDisplayName,
        message: 'The chat workspace needs a slightly larger terminal.',
        theme,
      }),
      scrollOffset: 0,
      transcriptHeight: 0,
      transcriptTotalRows: 0,
    };
  }

  const compact = rows < 22 || columns < 90;
  const header = Header({ ...props, columns, theme, compact });
  const suggestionsVisible = props.mode !== 'palette'
    && Boolean(props.suggestionsVisible ?? (String(props.inputValue ?? '').trimStart().startsWith('/') && !props.busy));
  const suggestionHeight = suggestionsVisible
    ? Math.min(compact ? 4 : 7, Math.max(4, rows - 12))
    : 0;
  const composerHeight = compact ? 4 : rows >= 32 ? 6 : 5;
  const statusHeight = 1;
  const headerHeight = componentHeight(header, columns);
  const requestedDebugHeight = props.debug?.enabled ? (compact ? 4 : 5) : 0;
  const debugHeight = rows >= headerHeight + suggestionHeight + composerHeight + statusHeight + requestedDebugHeight + 4
    ? requestedDebugHeight
    : 0;
  const fixedHeight = headerHeight + suggestionHeight + debugHeight + composerHeight + statusHeight;
  const transcriptPaneHeight = Math.max(4, rows - fixedHeight);

  const transcript = TranscriptPane({
    ...props,
    columns,
    height: transcriptPaneHeight,
    theme,
    frame,
  });
  const suggestions = suggestionsVisible
    ? SuggestionsPanel({
        ...props,
        columns,
        height: suggestionHeight,
        theme,
      })
    : null;
  const debug = debugHeight
    ? DebugPanel({ ...props, columns, height: debugHeight, theme })
    : null;
  const status = StatusBar({
    ...props,
    columns,
    theme,
    scrollOffset: transcript.scrollOffset,
    transcriptTotalRows: transcript.totalRows,
  });
  const input = InputBar({
    ...props,
    columns,
    height: composerHeight,
    theme,
    compact,
  });

  const content = Column({ height: rows }, header, transcript.node, suggestions, debug, status, input);
  const manager = chatOverlayManager({
    mode: props.mode,
    palette: props.palette,
    overlays: props.overlays,
    theme,
    rows,
    columns,
  });

  return {
    node: OverlayHost({
      content,
      manager,
      theme,
      width: columns,
      height: rows,
      dim: true,
      toastBottomMargin: composerHeight + statusHeight + 1,
    }),
    scrollOffset: transcript.scrollOffset,
    transcriptHeight: transcript.contentHeight,
    transcriptTotalRows: transcript.totalRows,
  };
}

export function ChatScreen(props = {}) {
  return createChatScreen(props).node;
}

export function Header({
  columns = 80,
  theme = themes.ocean ?? themes.dark,
  themeName = 'ocean',
  providerName = 'mock',
  sessionId = '',
  sessionTitle = 'Untitled session',
  skillState = null,
  activeSkills = null,
  compact = false,
} = {}) {
  const skills = Array.isArray(activeSkills)
    ? activeSkills.join(', ')
    : typeof activeSkills === 'string'
      ? activeSkills
      : skillState
        ? enabledSkillNames(skillState).join(', ')
        : 'none';
  const safeSkills = skills || 'none';
  const innerWidth = Math.max(1, columns - 4);
  const session = shortSessionId(sessionId);
  const rawTitle = sessionTitle || 'Untitled session';
  const compactTitleWidth = Math.max(14, Math.min(30, Math.floor(innerWidth * 0.46)));
  const title = truncateVisible(rawTitle, compact ? compactTitleWidth : Math.max(16, Math.floor(innerWidth * 0.52)), '…');
  const compactMetaParts = columns < 70
    ? [providerName, themeName]
    : columns < 96
      ? [providerName, themeName, session]
      : [providerName, themeName, session, safeSkills !== 'none' ? `skills ${safeSkills}` : ''];
  const rawMeta = compact
    ? compactMetaParts.filter(Boolean).join(' · ')
    : `provider ${providerName}  ·  theme ${themeName}  ·  session ${session}`;
  const metaBudget = compact ? Math.max(10, innerWidth - visibleLength(title) - 2) : innerWidth;
  const meta = compact ? truncateVisible(rawMeta, metaBudget, '…') : rawMeta;
  const rowOne = joinSides(color(theme, 'text', title), color(theme, 'textMuted', meta), innerWidth);
  const shortcuts = compact
    ? 'Ctrl+P palette · / commands · PgUp/PgDn transcript'
    : columns < 124
      ? 'Ctrl+P palette · / commands · Ctrl+J newline · PgUp/PgDn read'
      : 'Ctrl+P palette  ·  / commands  ·  Ctrl+J newline  ·  PgUp/PgDn transcript  ·  Esc latest/cancel';
  const skillText = compact ? `${safeSkills}` : `skills: ${safeSkills}`;
  const rowTwo = joinSides(color(theme, 'textMuted', shortcuts), color(theme, 'textAccent', skillText), innerWidth);

  return Box({
    border: true,
    borderColor: theme.borderActive ?? theme.accent ?? theme.border,
    padding: { left: 1, right: 1 },
    title: ` ${packageDisplayName} `,
    height: compact ? 3 : 4,
  },
  Text(rowOne, { wrap: false }),
  compact ? null : Text(rowTwo, { wrap: false }));
}

export function TranscriptPane({ columns = 80, height = 10, messages = [], theme = themes.dark, frame = 0, scrollOffset = 0, busy = false } = {}) {
  const safeHeight = Math.max(4, Number(height) || 4);
  const contentHeight = Math.max(1, safeHeight - 3);
  const transcript = Transcript({ columns: Math.max(20, columns - 4), height: contentHeight, messages, theme, frame, scrollOffset });
  const scrollSummary = [
    transcript.hiddenAbove > 0 ? `↑${transcript.hiddenAbove} earlier` : '',
    transcript.hiddenBelow > 0 ? `↓${transcript.hiddenBelow} newer` : '',
  ].filter(Boolean).join(' · ');
  const state = transcript.scrollOffset > 0
    ? `reading history${scrollSummary ? ` · ${scrollSummary}` : ''}`
    : busy
      ? `following live response${scrollSummary ? ` · ${scrollSummary}` : ''}`
      : `at latest${scrollSummary ? ` · ${scrollSummary}` : ''}`;
  const title = ` CONVERSATION · ${messages.length} message${messages.length === 1 ? '' : 's'} `;
  const footer = joinSides(
    color(theme, 'textMuted', state),
    color(theme, 'textMuted', `${transcript.totalRows} rows`),
    Math.max(1, columns - 4),
  );
  return {
    node: Box({
      border: true,
      borderColor: theme.borderMuted ?? theme.border,
      padding: { left: 1, right: 1 },
      title,
      height: safeHeight,
    }, transcript.node, Text(footer, { wrap: false })),
    scrollOffset: transcript.scrollOffset,
    totalRows: transcript.totalRows,
    contentHeight,
  };
}

export function Transcript({ columns = 80, height = 10, messages = [], theme = themes.dark, frame = 0, scrollOffset = 0 } = {}) {
  if (!messages.length) {
    const rendered = renderWelcomeLines({ columns, height, theme });
    const sliced = rendered.slice(0, height);
    return {
      node: Lines([...sliced, ...Array(Math.max(0, height - sliced.length)).fill('')]),
      scrollOffset: 0,
      totalRows: rendered.length,
      hiddenAbove: 0,
      hiddenBelow: 0,
    };
  }

  const rendered = renderTranscriptLines({ columns, messages, theme, frame });
  const maxOffset = Math.max(0, rendered.length - height);
  const nextScrollOffset = Math.min(Math.max(0, Number(scrollOffset) || 0), maxOffset);
  const end = Math.max(height, rendered.length - nextScrollOffset);
  const sliced = rendered.slice(Math.max(0, end - height), end);
  const missing = height - sliced.length;
  return {
    node: Lines([...Array(Math.max(0, missing)).fill(''), ...sliced]),
    scrollOffset: nextScrollOffset,
    totalRows: rendered.length,
    hiddenAbove: Math.max(0, rendered.length - height - nextScrollOffset),
    hiddenBelow: nextScrollOffset,
  };
}

export function renderTranscriptLines({ columns = 80, messages = [], theme = themes.dark, frame = 0 } = {}) {
  const readingWidth = Math.max(20, Math.min(MAX_READING_WIDTH, columns - 4));
  const leftMargin = columns > readingWidth + 2 ? Math.min(3, Math.floor((columns - readingWidth) / 5)) : 0;
  const indent = ' '.repeat(leftMargin);
  const rendered = [];

  for (const message of messages) {
    const roleKey = message.role === 'user' ? 'user' : message.role === 'assistant' ? 'assistant' : 'system';
    const label = roleLabel(message.role).padEnd(10);
    const prefix = color(theme, roleKey, `${label}`);
    const marker = message.status === 'streaming'
      ? color(theme, 'accent', streamingMarker(frame))
      : color(theme, statusToken(message.status), statusMarker(message.status));
    const contentWidth = Math.max(12, readingWidth - 13);
    const lines = renderMessageContentLines({ message, width: contentWidth, theme });

    if (lines.length === 0) {
      rendered.push(indent + prefix + marker);
    } else {
      lines.forEach((line, index) => {
        const left = index === 0 ? indent + prefix + marker + ' ' : indent + ' '.repeat(12);
        rendered.push(fit(left + line, columns));
      });
    }
    rendered.push('');
  }

  return rendered;
}

export function renderMessageContentLines({ message, width = 70, theme = themes.dark } = {}) {
  const blocks = normalizeBlocks(message?.blocks);
  if (blocks.length) return renderBlocksLines({ blocks, width, theme });

  const content = message?.content || (message?.status === 'streaming' ? 'Thinking…' : '');
  const token = message?.role === 'system' ? 'textMuted' : 'text';
  return wrapText(content, width, '  ').map((line) => color(theme, token, line));
}

export function renderBlocksLines({ blocks = [], width = 70, theme = themes.dark } = {}) {
  const lines = [];
  normalizeBlocks(blocks).forEach((block, index) => {
    if (index > 0 && lines.at(-1) !== '') lines.push('');
    lines.push(...renderBlockLines({ block, width, theme }));
  });
  return lines;
}

export function renderBlockLines({ block, width = 70, theme = themes.dark } = {}) {
  if (block.type === 'code') return renderCodeBlock(block, width, theme);
  if (block.type === 'diff') return renderDiffBlock(block, width, theme);
  if (block.type === 'command') return renderCommandBlock(block, width, theme);
  if (block.type === 'warning') return renderWarningBlock(block, width, theme);
  if (block.type === 'tool_result') return renderToolResultBlock(block, width, theme);
  return wrapText(block.content || ' ', width, '  ').map((line) => color(theme, 'text', line));
}

function renderCodeBlock(block, width, theme) {
  const title = block.title || `code${block.language ? ` · ${block.language}` : ''}`;
  const body = String(block.content || '').split('\n');
  return [
    color(theme, 'border', blockTop(title, width)),
    ...body.map((line) => color(theme, 'muted', blockBodyLine(line, width))),
    color(theme, 'border', blockBottom(width)),
  ];
}

function renderDiffBlock(block, width, theme) {
  const title = block.title || 'diff';
  const body = String(block.content || '').split('\n');
  return [
    color(theme, 'border', blockTop(title, width)),
    ...body.map((line) => color(theme, diffLineToken(line), blockBodyLine(line, width))),
    color(theme, 'border', blockBottom(width)),
  ];
}

function diffLineToken(line) {
  const value = String(line ?? '');
  if (value.startsWith('+') && !value.startsWith('+++')) return 'ok';
  if (value.startsWith('-') && !value.startsWith('---')) return 'error';
  if (value.startsWith('@@')) return 'accent';
  return 'muted';
}

function renderCommandBlock(block, width, theme) {
  const title = block.title || 'command';
  const command = block.command || block.content || '';
  return [
    color(theme, 'accent', truncateVisible(`$ ${command}`, width)),
    ...wrapText(title, Math.max(1, width - 2), '  ').map((line) => color(theme, 'muted', line)),
  ];
}

function renderWarningBlock(block, width, theme) {
  const text = block.title ? `${block.title}: ${block.content}` : block.content;
  return wrapText(`warning: ${text}`, width, '  ').map((line) => color(theme, 'danger', line));
}

function renderToolResultBlock(block, width, theme) {
  const header = [block.name || 'tool', block.status].filter(Boolean).join(' · ');
  const body = String(block.content || '').split('\n');
  return [
    color(theme, 'accent', fitBlockLine(`tool: ${truncateVisible(header, Math.max(1, width - 6))}`, width)),
    ...body.map((line) => color(theme, 'muted', fitBlockLine(`  ${truncateVisible(line, Math.max(1, width - 2))}`, width))),
  ];
}

function blockTop(title, width) {
  const safeWidth = Math.max(4, Number(width) || 4);
  const labelWidth = Math.max(0, safeWidth - 6);
  const label = truncateVisible(String(title ?? ''), labelWidth, '…');
  const prefix = `┌─ ${label} `;
  const dashes = '─'.repeat(Math.max(0, safeWidth - visibleLength(prefix) - 1));
  return fitBlockLine(`${prefix}${dashes}┐`, safeWidth);
}

function blockBottom(width) {
  const safeWidth = Math.max(4, Number(width) || 4);
  return `└${'─'.repeat(Math.max(0, safeWidth - 2))}┘`;
}

function blockBodyLine(line, width) {
  const safeWidth = Math.max(4, Number(width) || 4);
  const contentWidth = Math.max(0, safeWidth - 4);
  const content = truncateVisible(String(line ?? ''), contentWidth, '…');
  return fitBlockLine(`│ ${fitBlockLine(content, contentWidth)} │`, safeWidth);
}

function fitBlockLine(value, width) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const text = String(value ?? '');
  if (visibleLength(text) >= safeWidth) return truncateVisible(text, safeWidth, '');
  return text + ' '.repeat(safeWidth - visibleLength(text));
}

export function SuggestionsPanel({
  columns = 80,
  height = undefined,
  theme = themes.dark,
  suggestions = [],
  suggestionIndex = 0,
  busy = false,
  windowSize = DEFAULT_SUGGESTION_WINDOW_SIZE,
  suggestionWindowSize = null,
} = {}) {
  const safeHeight = height === undefined ? null : Math.max(4, Number(height) || 4);
  const innerRows = safeHeight === null ? Math.max(2, suggestions.length + 1) : Math.max(1, safeHeight - 2);
  const activeIndex = suggestions.length ? mod(suggestionIndex, suggestions.length) : 0;
  const requestedWindowSize = suggestionWindowSize ?? windowSize;
  const capacity = Math.max(1, innerRows - 1);
  const size = Math.min(Math.max(1, Number(requestedWindowSize) || DEFAULT_SUGGESTION_WINDOW_SIZE), capacity, Math.max(1, suggestions.length));
  const start = suggestions.length
    ? Math.min(Math.max(activeIndex - Math.floor(size / 2), 0), Math.max(0, suggestions.length - size))
    : 0;
  const visible = suggestions.slice(start, start + size);
  const rows = [];
  const help = busy ? 'streaming' : '↑/↓ select · Tab/Enter complete · Esc dismiss';
  rows.push(Text(color(theme, 'textMuted', fit(help, Math.max(1, columns - 4))), { wrap: false }));

  if (!visible.length) {
    rows.push(Text(color(theme, 'warning', 'No matching slash commands.'), { wrap: false }));
  } else {
    visible.forEach((suggestion, index) => {
      const originalIndex = start + index;
      const selected = originalIndex === activeIndex;
      const pointer = selected ? '›' : ' ';
      const label = truncateVisible(String(suggestion.label ?? ''), 18);
      const detail = truncateVisible(String(suggestion.detail ?? ''), Math.max(12, Math.floor(columns * 0.34)));
      const description = suggestion.description ?? '';
      const row = ` ${pointer} ${label.padEnd(18)} ${detail.padEnd(Math.max(12, Math.floor(columns * 0.34)))} ${description}`;
      const rowWidth = Math.max(1, columns - 4);
      rows.push(Text(color(theme, selected ? 'selected' : 'suggestion', fit(truncateVisible(row, rowWidth, '…'), rowWidth)), { wrap: false }));
    });
  }
  while (rows.length < innerRows) rows.push(Text('', { wrap: false }));
  const above = start;
  const below = Math.max(0, suggestions.length - (start + visible.length));
  const title = ` COMMANDS · ${suggestions.length} match${suggestions.length === 1 ? '' : 'es'}${above || below ? ` · ↑${above} ↓${below}` : ''} `;
  return Box({
    border: true,
    borderColor: theme.borderActive ?? theme.accent ?? theme.border,
    padding: { left: 1, right: 1 },
    title,
    ...(safeHeight !== null ? { height: safeHeight } : {}),
  }, ...rows);
}

export function PalettePanel({ columns = 80, rows = 24, palette = null, theme = null } = {}) {
  if (!palette) return Lines([]);
  const safeWidth = Math.max(32, Number(columns) || 68);
  const height = Math.min(16, Math.max(8, Number(rows) - 8));
  const innerRows = Math.max(4, height - 2);
  const matches = getCommandPaletteMatches(palette);
  palette.selectedIndex = Math.max(0, Math.min(Number(palette.selectedIndex) || 0, Math.max(0, matches.length - 1)));
  const capacity = Math.max(1, innerRows - 4);
  const start = Math.min(
    Math.max(0, palette.selectedIndex - Math.floor(capacity / 2)),
    Math.max(0, matches.length - capacity),
  );
  const visible = matches.slice(start, start + capacity);
  const query = getPaletteQuery(palette);
  const rowsOut = [
    Text(color(theme, 'textMuted', fit('Type to filter · ↑/↓ move · Enter insert · Esc clear/close', safeWidth - 4)), { wrap: false }),
    Text(`${color(theme, 'textAccent', 'Search')}  ${query || '<all>'}█`, { wrap: false }),
  ];
  visible.forEach((item, offset) => {
    const index = start + offset;
    const selected = index === palette.selectedIndex;
    const marker = selected ? '›' : ' ';
    const category = truncateVisible(item.category || 'General', 13);
    const id = truncateVisible(item.id, 18);
    const titleWidth = Math.max(8, safeWidth - 4 - 1 - 13 - 1 - 18 - 3);
    const title = truncateVisible(item.title, titleWidth, '…');
    const line = `${marker} ${category.padEnd(13)} ${id.padEnd(18)} ${title}`;
    rowsOut.push(Text(color(theme, item.disabled ? 'textMuted' : selected ? 'selected' : 'text', fit(line, safeWidth - 4)), { wrap: false }));
  });
  while (rowsOut.length < innerRows - 2) rowsOut.push(Text('', { wrap: false }));
  const selected = matches[palette.selectedIndex];
  const range = matches.length ? `${palette.selectedIndex + 1}/${matches.length}` : '0/0';
  rowsOut.push(Text(color(theme, 'textMuted', fit(selected?.description || 'No matching actions.', safeWidth - 4)), { wrap: false }));
  rowsOut.push(Text(color(theme, 'textMuted', fit(`${range} · ${palette.status ?? ''}`, safeWidth - 4)), { wrap: false }));
  return Box({
    border: true,
    borderColor: theme?.borderActive ?? theme?.accent ?? theme?.border,
    padding: { left: 1, right: 1 },
    title: ' Command Palette ',
    height,
  }, ...rowsOut);
}

export function DebugPanel({ columns = 80, height = 5, theme = themes.dark, debug = { enabled: false, events: [] } } = {}) {
  if (!debug?.enabled) return Lines([]);
  const safeHeight = Math.max(4, Number(height) || 4);
  const events = (debug.events ?? []).slice(-Math.max(1, safeHeight - 2)).map((event) => ` debug ${event.type}: ${event.detail}`);
  while (events.length < safeHeight - 2) events.unshift('');
  return Box({
    border: true,
    borderColor: theme.borderMuted ?? theme.border,
    padding: { left: 1, right: 1 },
    title: ' DEBUG · /debug off to close ',
    height: safeHeight,
  }, ...events.map((line) => Text(color(theme, 'textMuted', fit(line, Math.max(1, columns - 4))), { wrap: false })));
}

export function StatusBar({ columns = 80, theme = themes.dark, status = 'Ready.', busy = false, scrollOffset = 0, debug = { enabled: false }, providerName = 'mock' } = {}) {
  const left = `${busy ? streamingMarker(Date.now()) : '●'} ${status}`;
  const right = [scrollOffset > 0 ? `scroll:+${scrollOffset}` : 'latest', debug?.enabled ? 'debug:on' : '', providerName].filter(Boolean).join(' · ');
  const line = joinSides(
    color(theme, busy ? 'textAccent' : 'textMuted', left),
    color(theme, 'textMuted', right),
    columns,
  );
  return Lines([line]);
}

export function InputBar({
  columns = 80,
  height = 5,
  theme = themes.dark,
  busy = false,
  inputValue = '',
  inputCursor = undefined,
  inputParts = null,
  compact = false,
} = {}) {
  const safeHeight = Math.max(4, Number(height) || 4);
  const innerHeight = Math.max(1, safeHeight - 3);
  const value = inputValue || reconstructInput(inputParts);
  const cursor = inputCursor === undefined ? Array.from(inputParts?.before ?? value).length : inputCursor;
  const placeholder = busy ? 'Response is streaming…' : 'Ask something, or type / for commands…';
  const editorLines = value
    ? renderTextEditorLines({
        value,
        cursor,
        width: Math.max(8, columns - 4),
        height: innerHeight,
        lineNumbers: false,
        placeholder: '',
        cursorGlyph: busy ? '·' : '█',
      })
    : [`${busy ? '·' : '█'} ${placeholder}`, ...Array(Math.max(0, innerHeight - 1)).fill('')];
  const commandMode = String(value).trimStart().startsWith('/');
  const mode = busy ? 'STREAMING' : commandMode ? 'COMMAND' : 'CHAT';
  const hints = busy
    ? 'Esc cancel response · PgUp/PgDn read transcript'
    : compact
      ? 'Enter send · Ctrl+J newline · Ctrl+P palette'
      : 'Enter send  ·  Ctrl+J newline  ·  Tab complete command  ·  Alt+←/→ word  ·  PgUp/PgDn transcript';
  return Box({
    border: true,
    borderColor: busy ? theme.borderActive ?? theme.accent : theme.borderActive ?? theme.accent ?? theme.border,
    padding: { left: 1, right: 1 },
    title: ` COMPOSER · ${mode} `,
    height: safeHeight,
  },
  ...editorLines.map((line) => Text(color(theme, busy ? 'textMuted' : 'input', fit(line, Math.max(1, columns - 4))), { wrap: false })),
  Text(color(theme, 'textMuted', fit(hints, Math.max(1, columns - 4))), { wrap: false }));
}

export function Lines(lines = []) {
  return Column(...Array.from(lines).map((line) => Text(String(line ?? ''), { wrap: false })));
}

export function Clip({ node, width = 80, height = 10 } = {}) {
  return Lines(renderNode(node, width).slice(0, Math.max(0, height)));
}

function renderWelcomeLines({ columns, height = 10, theme }) {
  const width = Math.max(20, Math.min(MAX_READING_WIDTH, columns - 4));
  const compact = columns < 72 || height < 9;
  const items = compact
    ? [
        color(theme, 'title', `Welcome to ${packageDisplayName}`),
        color(theme, 'text', 'A local, dependency-free AI chat workspace.'),
        '',
        color(theme, 'textMuted', 'Type a message and press Enter.'),
        color(theme, 'textMuted', 'Use / for commands · Ctrl+P for the palette.'),
        color(theme, 'textMuted', 'Ctrl+J adds a line · PgUp/PgDn reads history.'),
      ]
    : [
        color(theme, 'title', `Welcome to ${packageDisplayName}`),
        color(theme, 'text', 'A local, dependency-free chat workspace for testing rich terminal interaction.'),
        '',
        color(theme, 'textAccent', 'Start here'),
        color(theme, 'textMuted', '• Type a message and press Enter.'),
        color(theme, 'textMuted', '• Type / to browse commands with inline completion.'),
        color(theme, 'textMuted', '• Press Ctrl+P for the searchable action palette.'),
        color(theme, 'textMuted', '• Use Ctrl+J for multiline input and PgUp/PgDn to read older output.'),
      ];
  return items.flatMap((line) => line ? wrapText(line, width, '  ') : ['']);
}

function chatOverlayManager({ mode, palette, overlays, theme, rows = 24, columns = 80 }) {
  const base = overlays ?? { toasts: [], top: () => null };
  return {
    toasts: base.toasts ?? [],
    top() {
      if (mode === 'palette' && palette) {
        return {
          id: 'chat.palette',
          type: 'custom',
          node: PalettePanel({ columns: Math.max(32, columns - 2), rows, palette, theme }),
          width: Math.max(32, columns - 2),
          shadow: false,
          opaqueRows: true,
          blocking: true,
        };
      }
      return typeof base.top === 'function' ? base.top() : null;
    },
  };
}

function componentHeight(node, width) {
  return renderNode(node, width).length;
}

function shortSessionId(sessionId) {
  const raw = String(sessionId || 'session');
  if (!sessionId || raw === 'session') return 'new';
  const parts = raw.split('_');
  const suffix = parts.at(-1) || raw;
  const stamp = parts[0]?.replace(/[^0-9TZ]/g, '') ?? '';
  const time = stamp.slice(-8);
  return `${time ? `${time}-` : ''}${suffix.slice(-5)}` || 'session';
}

function joinSides(left, right, width) {
  const safeWidth = Math.max(0, Number(width) || 0);
  const leftText = String(left ?? '');
  const rightText = String(right ?? '');
  const rightWidth = visibleLength(rightText);
  if (rightWidth >= safeWidth) return fit(rightText, safeWidth);
  const leftWidth = Math.max(0, safeWidth - rightWidth - 1);
  const fittedLeft = truncateVisible(leftText, leftWidth, '…');
  return fittedLeft + ' '.repeat(Math.max(1, safeWidth - visibleLength(fittedLeft) - rightWidth)) + rightText;
}

function reconstructInput(parts) {
  if (!parts) return '';
  const current = parts.current === ' ' && !parts.after ? '' : parts.current ?? '';
  return `${parts.before ?? ''}${current}${parts.after ?? ''}`;
}

function streamingMarker(frame) {
  const frames = ['·', '•', '●', '•'];
  const index = Number.isFinite(Number(frame)) ? Number(frame) : 0;
  return frames[Math.abs(Math.floor(index)) % frames.length];
}

function statusMarker(status) {
  if (status === 'cancelled') return '×';
  if (status === 'error') return '!';
  if (status === 'complete') return '✓';
  return '·';
}

function statusToken(status) {
  if (status === 'cancelled' || status === 'error') return 'danger';
  if (status === 'complete') return 'success';
  return 'textMuted';
}

function roleLabel(role) {
  if (role === 'user') return 'you';
  if (role === 'assistant') return 'assistant';
  return role || 'system';
}

function mod(value, length) {
  if (!length) return 0;
  return ((value % length) + length) % length;
}

export function resetAnsiLine(line) {
  return `${line}${ansi.reset}`;
}
