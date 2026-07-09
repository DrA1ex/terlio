import { ansi } from '../ansi/codes.js';
import { themes } from '../ansi/themes.js';
import { color, truncateVisible, visibleLength } from '../ansi/text.js';
import { enabledSkillNames } from '../skills.js';
import { wrapText } from '../wrap.js';
import { renderCommandPalette } from '../commandPalette.js';
import { Column, Text } from '../ui/node.js';
import { renderNode } from '../ui/layout/index.js';
import { normalizeBlocks } from '../blocks.js';

export const DEFAULT_SUGGESTION_WINDOW_SIZE = 7;

export function createChatScreen(props = {}) {
  const columns = Math.max(1, Number(props.columns) || 80);
  const rows = Math.max(1, Number(props.rows) || 24);
  const theme = props.theme ?? themes[props.themeName] ?? themes.dark;
  const frame = Number(props.frame) || 0;

  const header = Header({ ...props, columns, theme });
  const input = InputBar({ ...props, columns, theme });
  const suggestions = props.mode === 'palette'
    ? PalettePanel({ ...props, columns, rows, theme })
    : SuggestionsPanel({ ...props, columns, theme });
  const debug = DebugPanel({ ...props, columns, theme });
  const status = StatusBar({ ...props, columns, theme });

  const fixedHeight = componentHeight(header, columns)
    + componentHeight(input, columns)
    + componentHeight(suggestions, columns)
    + componentHeight(debug, columns)
    + componentHeight(status, columns);

  const transcriptHeight = Math.max(1, rows - fixedHeight);
  const transcript = Transcript({
    ...props,
    columns,
    height: transcriptHeight,
    theme,
    frame,
  });

  return {
    node: Column(header, transcript.node, suggestions, debug, status, input),
    scrollOffset: transcript.scrollOffset,
    transcriptHeight,
  };
}

export function ChatScreen(props = {}) {
  return createChatScreen(props).node;
}

export function Header({ columns = 80, theme = themes.dark, themeName = 'dark', providerName = 'mock', sessionId = '', skillState = null, activeSkills = null } = {}) {
  const skills = Array.isArray(activeSkills)
    ? activeSkills.join(', ')
    : typeof activeSkills === 'string'
      ? activeSkills
      : skillState
        ? enabledSkillNames(skillState).join(', ')
        : 'none';
  const safeSkills = skills || 'none';
  const title = ' Mock AI Terminal ';
  const session = String(sessionId || 'session').split('_')[0].slice(-8) || 'session';
  const right = `provider:${providerName} theme:${themeName} session:${session}`;
  const width = Math.max(0, columns - visibleLength(title) - visibleLength(right) - 2);
  const middleRaw = `${title}${' '.repeat(width)}${right}`;
  const hint = ` Ctrl+P palette  /help  /session  /provider  /retry  /debug      skills:${safeSkills} `;

  return Lines([
    color(theme, 'border', `┌${'─'.repeat(Math.max(0, columns - 2))}┐`),
    color(theme, 'border', '│') + color(theme, 'title', truncateVisible(middleRaw, columns - 2)) + color(theme, 'border', '│'),
    color(theme, 'border', '│') + color(theme, 'subtle', truncateVisible(hint, columns - 2)) + color(theme, 'border', '│'),
    color(theme, 'border', `└${'─'.repeat(Math.max(0, columns - 2))}┘`),
  ]);
}

export function Transcript({ columns = 80, height = 10, messages = [], theme = themes.dark, frame = 0, scrollOffset = 0 } = {}) {
  const rendered = renderTranscriptLines({ columns, messages, theme, frame });
  const maxOffset = Math.max(0, rendered.length - height);
  const nextScrollOffset = Math.min(Math.max(0, Number(scrollOffset) || 0), maxOffset);
  const end = Math.max(height, rendered.length - nextScrollOffset);
  const sliced = rendered.slice(Math.max(0, end - height), end);
  const missing = height - sliced.length;
  return {
    node: Lines([...Array(Math.max(0, missing)).fill(''), ...sliced]),
    scrollOffset: nextScrollOffset,
  };
}

export function renderTranscriptLines({ columns = 80, messages = [], theme = themes.dark, frame = 0 } = {}) {
  const width = Math.max(20, columns - 4);
  const rendered = [];

  for (const message of messages) {
    const roleKey = message.role === 'user' ? 'user' : message.role === 'assistant' ? 'assistant' : 'system';
    const label = roleLabel(message.role).padEnd(7);
    const prefix = color(theme, roleKey, `${label} `);
    const marker = message.status === 'streaming'
      ? color(theme, 'accent', streamingMarker(frame))
      : statusMarker(message.status);
    const lines = renderMessageContentLines({ message, width: width - 10, theme });

    if (lines.length === 0) {
      rendered.push(prefix + marker);
    } else {
      lines.forEach((line, index) => {
        const left = index === 0 ? prefix + marker + ' ' : ' '.repeat(9);
        rendered.push(left + line);
      });
    }
    rendered.push(color(theme, 'border', ' '.repeat(Math.min(columns, 1))));
  }

  return rendered;
}

export function renderMessageContentLines({ message, width = 70, theme = themes.dark } = {}) {
  const blocks = normalizeBlocks(message?.blocks);
  if (blocks.length) return renderBlocksLines({ blocks, width, theme });

  const content = message?.content || (message?.status === 'streaming' ? ' ' : '');
  return wrapText(content, width, '  ').map((line) => color(theme, 'text', line));
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
  return wrapText(`warning: ${text}`, width, '  ').map((line) => color(theme, 'error', line));
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

export function SuggestionsPanel({ columns = 80, theme = themes.dark, inputValue = '', suggestions = [], suggestionIndex = 0, busy = false, windowSize = DEFAULT_SUGGESTION_WINDOW_SIZE, suggestionWindowSize = null } = {}) {
  if (!suggestions.length) {
    const text = String(inputValue).startsWith('/')
      ? 'No command suggestions.'
      : 'Type a message, or type / to discover commands.';
    return Lines([color(theme, 'muted', truncateVisible(`  ${text}`, columns))]);
  }

  const activeIndex = mod(suggestionIndex, suggestions.length);
  const requestedWindowSize = suggestionWindowSize ?? windowSize;
  const size = Math.min(Math.max(1, Number(requestedWindowSize) || DEFAULT_SUGGESTION_WINDOW_SIZE), suggestions.length);
  const start = Math.min(Math.max(activeIndex - Math.floor(size / 2), 0), Math.max(0, suggestions.length - size));
  const visible = suggestions.slice(start, start + size);
  const above = start > 0 ? ' ↑ more' : '';
  const below = start + size < suggestions.length ? ' ↓ more' : '';
  const verb = busy ? 'streaming' : 'Enter accept';
  const rows = [color(theme, 'muted', `  Suggestions ${activeIndex + 1}/${suggestions.length}${above}${below} · ↑/↓ move · ${verb}`)];

  visible.forEach((suggestion, index) => {
    const originalIndex = start + index;
    const selected = originalIndex === activeIndex;
    const pointer = selected ? '›' : ' ';
    const label = String(suggestion.label ?? '').padEnd(14);
    const detail = String(suggestion.detail ?? '').padEnd(36);
    const row = `  ${pointer} ${label} ${detail} ${suggestion.description ?? ''}`;
    rows.push(color(theme, selected ? 'selected' : 'suggestion', truncateVisible(row, columns)));
  });

  return Lines(rows);
}

export function PalettePanel({ columns = 80, rows = 24, palette = null } = {}) {
  if (!palette) return Lines([]);
  const maxHeight = Math.min(12, Math.max(8, rows - 10));
  const node = renderCommandPalette(palette, { title: ' Command Palette ', showHelp: false });
  return Clip({ node, width: columns, height: maxHeight });
}

export function DebugPanel({ columns = 80, theme = themes.dark, debug = { enabled: false, events: [] } } = {}) {
  if (!debug?.enabled) return Lines([]);
  const events = (debug.events ?? []).slice(-3).map((event) => `  debug ${event.type}: ${event.detail}`);
  return Lines([
    color(theme, 'border', '─'.repeat(columns)),
    ...events.map((line) => color(theme, 'muted', truncateVisible(line, columns))),
  ]);
}

export function StatusBar({ columns = 80, theme = themes.dark, status = 'Ready.', busy = false, scrollOffset = 0, debug = { enabled: false } } = {}) {
  const scroll = scrollOffset > 0 ? ` scroll:+${scrollOffset}` : '';
  const debugText = debug?.enabled ? ' debug:on' : '';
  const text = `${status}${scroll}${debugText}`;
  return Lines([
    color(theme, 'border', '─'.repeat(columns)),
    color(theme, busy ? 'accent' : 'muted', truncateVisible(`  ${text}`, columns)),
  ]);
}

export function InputBar({ columns = 80, theme = themes.dark, busy = false, inputParts = null } = {}) {
  const prompt = busy ? '… ' : '› ';
  const parts = inputParts ?? { before: '', current: ' ', after: '' };
  const line = color(theme, 'accent', prompt)
    + color(theme, 'input', parts.before ?? '')
    + color(theme, 'selected', parts.current ?? ' ')
    + color(theme, 'input', parts.after ?? '');
  return Lines([truncateVisible(line, columns)]);
}

export function Lines(lines = []) {
  return Column(...Array.from(lines).map((line) => Text(String(line ?? ''), { wrap: false })));
}

export function Clip({ node, width = 80, height = 10 } = {}) {
  return Lines(renderNode(node, width).slice(0, Math.max(0, height)));
}

function componentHeight(node, width) {
  return renderNode(node, width).length;
}

function streamingMarker(frame) {
  const frames = ['·', '•', '●', '•'];
  return frames[frame % frames.length];
}

function statusMarker(status) {
  if (status === 'cancelled') return '×';
  if (status === 'error') return '!';
  return ' ';
}

function roleLabel(role) {
  if (role === 'user') return 'you';
  if (role === 'assistant') return 'ai';
  return role || 'system';
}

function mod(value, length) {
  if (!length) return 0;
  return ((value % length) + length) % length;
}

export function resetAnsiLine(line) {
  return `${line}${ansi.reset}`;
}
