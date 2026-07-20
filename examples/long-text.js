#!/usr/bin/env node
import {
  Column,
  ScrollPane,
  Text,
  copyTextToClipboard,
  createTextSelectionState,
  createWorkspaceApp,
  resolveScrollKeyOffset,
  scrollMax,
} from '../src/lib/index.js';
import { isDirectRun } from './_demoRuntime.js';

const DEFAULT_LINE_COUNT = 10_000;
const WHEEL_STEP = 3;

export function createLongTextState({ lineCount = DEFAULT_LINE_COUNT } = {}) {
  const count = Math.max(1, Math.trunc(Number(lineCount) || DEFAULT_LINE_COUNT));
  return {
    lines: createLongTextLines(count),
    scroll: 0,
    visibleRows: 1,
    selection: createTextSelectionState(),
    status: `Loaded ${count.toLocaleString('en-US')} rows. Wheel or use the arrows to scroll.`,
  };
}

export function createLongTextLines(count = DEFAULT_LINE_COUNT) {
  const safeCount = Math.max(1, Math.trunc(Number(count) || DEFAULT_LINE_COUNT));
  return Array.from({ length: safeCount }, (_, index) => {
    const number = String(index + 1).padStart(5, '0');
    const phase = ['queued', 'decoded', 'rendered', 'patched'][index % 4];
    return `${number}  ${phase.padEnd(8)}  Virtualized terminal row ${number}: only visible rows are formatted during scrolling.`;
  });
}

export function createLongTextView({ state, width = 100, height = 30, onCopy = null } = {}) {
  const safeWidth = Math.max(40, Number(width) || 100);
  const safeHeight = Math.max(10, Number(height) || 30);
  const paneHeight = Math.max(5, safeHeight - 4);
  const visibleRows = Math.max(1, paneHeight - 3);
  state.visibleRows = visibleRows;
  state.scroll = Math.max(0, Math.min(scrollMax(state.lines.length, visibleRows), Number(state.scroll) || 0));

  const pane = ScrollPane({
    title: ` LONG TEXT STRESS · ${state.lines.length.toLocaleString('en-US')} ROWS `,
    lines: state.lines,
    width: safeWidth,
    height: paneHeight,
    scroll: state.scroll,
    selection: state.selection,
    pointerId: 'long-text:viewport',
    onWheel: (event) => {
      const direction = Number(event.deltaY) < 0 ? -1 : 1;
      scrollLongText(state, direction * WHEEL_STEP);
      event.preventDefault();
      return true;
    },
    onSelectionChange: (text) => {
      state.status = text
        ? `${Array.from(text).length.toLocaleString('en-US')} characters selected. Click the highlight to copy.`
        : `Row ${state.scroll + 1}-${Math.min(state.lines.length, state.scroll + state.visibleRows)} of ${state.lines.length.toLocaleString('en-US')}.`;
    },
    onCopy: (text, selection, event, context) => onCopy?.(text, selection, event, context) ?? false,
  });

  return Column(
    Text('Long Text Performance Lab', { wrap: false }),
    Text('10,000+ rows stay virtualized; wheel bursts are batched into one render pass.', { wrap: false }),
    pane,
    Text(state.status, { wrap: false }),
  );
}

export function handleLongTextKey({ key, state }) {
  const result = resolveScrollKeyOffset({
    keyName: key.name,
    scroll: state.scroll,
    totalRows: state.lines.length,
    visibleRows: state.visibleRows,
    pageStep: Math.max(1, state.visibleRows - 1),
    includeHomeEnd: true,
  });
  if (!result.handled) return false;
  state.scroll = result.scroll;
  state.status = `Row ${state.scroll + 1}-${Math.min(state.lines.length, state.scroll + state.visibleRows)} of ${state.lines.length.toLocaleString('en-US')}.`;
  return true;
}

export function scrollLongText(state, delta) {
  const max = scrollMax(state.lines.length, state.visibleRows);
  state.scroll = Math.max(0, Math.min(max, (Number(state.scroll) || 0) + (Number(delta) || 0)));
  state.status = `Row ${state.scroll + 1}-${Math.min(state.lines.length, state.scroll + state.visibleRows)} of ${state.lines.length.toLocaleString('en-US')}.`;
  return state.scroll;
}

export function createLongTextApp({ input = process.stdin, output = process.stdout, lineCount = DEFAULT_LINE_COUNT } = {}) {
  const state = createLongTextState({ lineCount });
  return createWorkspaceApp({
    title: 'Long Text Performance Lab',
    state,
    input,
    output,
    render: ({ state: current, width, height }) => createLongTextView({
      state: current,
      width,
      height,
      onCopy: (text) => copyTextToClipboard(text, { output }),
    }),
    onKey: ({ key, state: current }) => handleLongTextKey({ key, state: current }),
  });
}

function requestedLineCount(argv = process.argv.slice(2)) {
  const value = argv.find((item) => /^--lines=/.test(item));
  return value ? Number(value.slice('--lines='.length)) : DEFAULT_LINE_COUNT;
}

if (isDirectRun(import.meta.url)) createLongTextApp({ lineCount: requestedLineCount() }).start();
