import { dispatchPointerEvent, hitTestPointerRegions } from '../pointer.js';
import { patchFrames } from './diff.js';
import { layout } from './layout/index.js';

export function renderToFrame(node, options = {}) {
  return layout(node, options);
}

export function renderToString(node, options = {}) {
  return renderToFrame(node, options).toString();
}

export class TerminalRenderer {
  constructor({ output } = {}) {
    this.output = output;
    this.previousFrame = null;
    this.pointerRegions = [];
  }

  renderLines(lines, options) {
    const frame = renderToFrame({ type: 'column', props: {}, children: lines.map((line) => ({ type: 'text', props: { value: line, wrap: false }, children: [] })) }, options);
    this.renderFrame(frame);
    return frame;
  }

  renderNode(node, options) {
    const frame = renderToFrame(node, options);
    this.renderFrame(frame);
    return frame;
  }

  renderFrame(frame) {
    const patch = patchFrames(this.previousFrame, frame);
    if (this.output && patch) this.output.write(patch);
    this.previousFrame = frame;
    this.pointerRegions = Array.isArray(frame?.pointerRegions) ? frame.pointerRegions : [];
    return patch;
  }

  hitTestPointer(x, y, options = {}) {
    return hitTestPointerRegions(this.pointerRegions, x, y, options);
  }

  dispatchPointer(pointer, context = {}) {
    return dispatchPointerEvent(pointer, this.pointerRegions, context);
  }

  reset() {
    this.previousFrame = null;
    this.pointerRegions = [];
  }
}
