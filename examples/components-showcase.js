#!/usr/bin/env node
import {
  Badge,
  Box,
  Column,
  Grid,
  KeyValueBlock,
  Panel,
  Row,
  Text,
  createFrame,
  diffFrames,
  renderToString,
} from '../src/lib/index.js';
import { isDirectRun } from './_demoRuntime.js';

export function createComponentsShowcaseView({ width = 88, height = 22 } = {}) {
  const previous = createFrame(['status  idle', 'answer  Hel', 'footer  frame 1'], { width: 28, height: 3 });
  const next = createFrame(['status  streaming', 'answer  Hello', 'footer  frame 2'], { width: 28, height: 3 });
  const operations = diffFrames(previous, next);
  const capabilityItems = [
    ['Layout', 'Box · Row · Column · Grid'],
    ['Runtime', 'Frame · diff · patch'],
    ['Input', 'Key parser · InputEditor'],
    ['State', 'Focus · modes · scroll'],
  ];
  const capabilityColumns = width >= 108 ? 4 : 2;
  const frameRow = width >= 76
    ? Row({ gap: 2, distribute: true }, framePanel('Previous frame', previous), framePanel('Next frame', next))
    : Column(framePanel('Previous frame', previous), framePanel('Next frame', next));

  return Column({ height },
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Components Showcase ' },
      Text('A static, CI-friendly tour of the virtual UI runtime. No TTY or interactive input is required.'),
      Row({ gap: 1 }, Badge({ label: 'dependency-free', tone: 'success', variant: 'subtle' }), Badge({ label: 'fixed frames', tone: 'info', variant: 'subtle' }), Badge({ label: 'ANSI-aware', tone: 'muted', variant: 'outline' })),
    ),
    Grid({
      items: capabilityItems,
      columns: capabilityColumns,
      gap: 1,
      border: true,
      renderItem: ([title, detail]) => `${title}: ${detail}`,
    }),
    frameRow,
    KeyValueBlock({
      title: ' Patch plan ',
      rows: [
        ['changed rows', operations.map((item) => item.row).join(', ')],
        ['writes', `${operations.length} row patches instead of a full repaint`],
        ['benefit', 'stable cursor, less flicker, testable output'],
      ],
    }),
  );
}

export function renderComponentsShowcase({ width = 88, height = 22 } = {}) {
  return renderToString(createComponentsShowcaseView({ width, height }), { width, height });
}

export function createDiffShowcase() {
  const previous = createFrame(['status: idle', 'assistant: Hel', 'footer: frame 1'], { width: 24, height: 3 });
  const next = createFrame(['status: streaming', 'assistant: Hello', 'footer: frame 2'], { width: 24, height: 3 });
  return diffFrames(previous, next);
}

function framePanel(title, frame) {
  return Panel(` ${title} `, ...frame.toLines().map((line) => Text(line, { wrap: false })));
}

if (isDirectRun(import.meta.url)) {
  console.log(renderComponentsShowcase());
  console.log('\nChanged rows between two virtual frames:');
  for (const operation of createDiffShowcase()) console.log(`row ${operation.row}: ${operation.line}`);
}
