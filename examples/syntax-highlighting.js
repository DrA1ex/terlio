#!/usr/bin/env node
import {
  Badge,
  Column,
  RequireViewport,
  Row,
  SyntaxText,
  Text,
  WorkspaceFooter,
  WorkspacePane,
  WorkspaceShell,
  renderToString,
  themes,
} from '../src/lib/index.js';
import { isDirectRun } from './_demoRuntime.js';

const THEME = themes.ocean;
const MIN_WIDTH = 82;
const MIN_HEIGHT = 24;

const SAMPLES = [
  {
    title: ' JavaScript · explicit language ',
    language: 'javascript',
    code: `export async function loadUser(id) {
  const response = await fetch(\`/api/users/\${id}\`);
  if (!response.ok) throw new Error('Request failed');
  return response.json(); // zero dependencies
}`,
  },
  {
    title: ' Python · filename detection ',
    filename: 'worker.py',
    code: `from dataclasses import dataclass

@dataclass
class Job:
    name: str
    retries: int = 3

print(Job("index", retries=2))`,
  },
  {
    title: ' C++ header · filename detection ',
    filename: 'renderer.hpp',
    code: `#pragma once
#include <string>

struct Frame {
  std::string title;
  int width = 80;
};`,
  },
  {
    title: ' Swift · explicit language ',
    language: 'swift',
    code: `import Foundation

struct Session: Codable {
  let id: UUID
  var title: String
}

let session = Session(id: UUID(), title: "Terminal")`,
  },
];

export function createSyntaxHighlightingView({ width = 112, height = 30 } = {}) {
  const safeWidth = Math.max(1, Number(width) || 112);
  const safeHeight = Math.max(1, Number(height) || 30);
  const sampleRows = safeWidth >= 104
    ? [Row({ gap: 2, distribute: true }, samplePane(SAMPLES[0]), samplePane(SAMPLES[1])), Row({ gap: 2, distribute: true }, samplePane(SAMPLES[2]), samplePane(SAMPLES[3]))]
    : SAMPLES.map(samplePane);

  return RequireViewport({
    width: safeWidth,
    height: safeHeight,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: 'Syntax highlighting example needs more room',
    message: 'Resize the terminal to at least 82×24.',
    theme: THEME,
    children: WorkspaceShell({
      title: 'Zero-dependency Syntax Highlighting',
      subtitle: 'Opt-in lexical highlighting for common source files',
      stats: [
        Badge({ label: '0 deps', tone: 'success', variant: 'filled', theme: THEME }),
        Badge({ label: 'filename detection', tone: 'info', variant: 'subtle', theme: THEME }),
        Badge({ label: 'theme tokens', tone: 'muted', variant: 'outline', theme: THEME }),
      ],
      main: Column({ height: 'fill' }, ...sampleRows),
      footer: WorkspaceFooter({
        left: ['SyntaxText', 'highlightSyntax()', 'renderBlockLines({ syntaxHighlight: true })'],
        right: ['JavaScript', 'Python', 'C/C++', 'Swift', 'Objective-C'],
        theme: THEME,
      }),
      height: safeHeight,
      theme: THEME,
    }),
  });
}

export function renderSyntaxHighlighting({ width = 112, height = 30 } = {}) {
  return renderToString(createSyntaxHighlightingView({ width, height }), { width, height });
}

function samplePane(sample) {
  return WorkspacePane({
    title: sample.title,
    height: 'fill',
    theme: THEME,
    children: [
      SyntaxText({
        code: sample.code,
        language: sample.language,
        filename: sample.filename,
        theme: THEME,
      }),
    ],
  });
}

if (isDirectRun(import.meta.url)) {
  const width = Math.max(MIN_WIDTH, Number(process.stdout.columns) || 112);
  const height = Math.max(MIN_HEIGHT, Number(process.stdout.rows) || 30);
  process.stdout.write(`${renderSyntaxHighlighting({ width, height })}\n`);
}
