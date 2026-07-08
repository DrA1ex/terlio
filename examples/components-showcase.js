#!/usr/bin/env node
import { Box, Column, Panel, Row, Text, createFrame, diffFrames, renderToString } from '../src/lib/index.js';
import { isDirectRun } from './_demoRuntime.js';

export function createComponentsShowcaseView() {
  return Column(
    Box({ border: true, padding: { left: 1, right: 1 }, title: ' Components Showcase ' },
      Text('This non-interactive example renders UI nodes into a fixed virtual frame.'),
    ),
    Row({ gap: 2, distribute: true },
      Panel(' Layout ',
        Text('Box'),
        Text('Row / Column'),
        Text('Panel'),
        Text('Text wrapping'),
      ),
      Panel(' Runtime ',
        Text('Virtual frame'),
        Text('Frame diff'),
        Text('ANSI patch'),
        Text('No dependencies'),
      ),
      Panel(' App layer ',
        Text('InputEditor'),
        Text('Key parser'),
        Text('FocusManager'),
        Text('Provider API'),
      ),
    ),
    Box({ border: true, padding: 1, title: ' Example screen ' },
      Text('user      Write a terminal UI without dependencies.'),
      Text('assistant I will render a virtual frame first, then patch only changed rows.'),
      Text('system    Press npm run example:editor to try the editor lab.'),
    ),
  );
}

export function renderComponentsShowcase({ width = 88, height = 22 } = {}) {
  return renderToString(createComponentsShowcaseView(), { width, height });
}

export function createDiffShowcase() {
  const previous = createFrame([
    'status: idle',
    'assistant: Hel',
    'footer: frame 1',
  ], { width: 24, height: 3 });
  const next = createFrame([
    'status: streaming',
    'assistant: Hello',
    'footer: frame 2',
  ], { width: 24, height: 3 });

  return diffFrames(previous, next);
}

if (isDirectRun(import.meta.url)) {
  console.log(renderComponentsShowcase());
  console.log('\nChanged rows between two virtual frames:');
  for (const operation of createDiffShowcase()) {
    console.log(`row ${operation.row}: ${operation.line}`);
  }
}
