import { ansi } from '../ansi/codes.js';
import { createFrame } from './screen.js';

export function diffFrames(previous, next) {
  if (!previous) return next.toLines().map((line, index) => ({ row: index + 1, line }));
  const operations = [];
  const height = Math.max(previous.height, next.height);
  for (let index = 0; index < height; index += 1) {
    const previousLine = previous.lines[index] ?? '';
    const nextLine = next.lines[index] ?? '';
    if (previousLine !== nextLine) operations.push({ row: index + 1, line: nextLine });
  }
  return operations;
}

export function patchFrames(previous, next) {
  return diffFrames(previous, next)
    .map((operation) => `${ansi.moveTo(operation.row, 1)}${ansi.eraseLine}${operation.line}`)
    .join('');
}

export function makeFrame(lines, options) {
  return createFrame(lines, options);
}
