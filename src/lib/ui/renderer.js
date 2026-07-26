import { ansi } from '../ansi/codes.js';
import { dispatchPointerEvent, hitTestPointerRegions } from '../pointer.js';
import { createTerminalOutputFrame, terminalControl } from '../terminal/outputModel.js';
import { createTerminalPolicy } from '../terminal/policy.js';
import { resolveTerminalSink } from '../terminal/sink.js';
import { patchFrames } from './diff.js';
import { layout } from './layout/index.js';

export function renderToFrame(node, options = {}) {
  return layout(node, options);
}

export function renderToString(node, options = {}) {
  return renderToFrame(node, options).toString();
}

export class TerminalRenderer {
  constructor({ output, sink = null, policy = createTerminalPolicy() } = {}) {
    this.output = output;
    this.policy = policy;
    this.sink = resolveTerminalSink({ sink, output, policy });
    this.previousFrame = null;
    this.pointerRegions = [];
    this.pointerCaptureToken = null;
  }

  renderLines(lines, options) {
    const frame = renderToFrame({ type: 'column', props: {}, children: lines.map((line) => ({ type: 'text', props: { value: line, wrap: false }, children: [] })) }, { ...options, terminalPolicy: options?.terminalPolicy ?? this.policy });
    this.renderFrame(frame);
    return frame;
  }

  renderNode(node, options) {
    const frame = renderToFrame(node, { ...options, terminalPolicy: options?.terminalPolicy ?? this.policy });
    this.renderFrame(frame);
    return frame;
  }

  renderFrame(frame) {
    const patch = patchFrames(this.previousFrame, frame, {
      includeRegionChanges: true,
      // Some terminal fonts draw block/background cells a fraction outside their
      // nominal row. Repaint one neighboring row instead of clearing the screen.
      bleedRows: 1,
    });
    if (patch) {
      const bytes = `${ansi.autoWrapOff}${patch}${ansi.autoWrapOn}`;
      this.sink.writeFrame(createTerminalOutputFrame({
        operations: [terminalControl(bytes, { trusted: true, kind: 'render-patch' })],
        regions: frame?.pointerRegions ?? [],
      }), this.policy);
    }
    this.previousFrame = frame;
    this.pointerRegions = Array.isArray(frame?.pointerRegions) ? frame.pointerRegions : [];
    return patch;
  }

  hitTestPointer(x, y, options = {}) {
    return hitTestPointerRegions(this.pointerRegions, x, y, options);
  }

  dispatchPointer(pointer, context = {}) {
    const result = dispatchPointerEvent(pointer, this.pointerRegions, context, { capturedToken: this.pointerCaptureToken });
    if (result.event?.pointerCaptureReleaseRequested || pointer?.action === 'release') this.pointerCaptureToken = null;
    if (result.event?.pointerCaptureRequested && result.event?.targetToken != null) this.pointerCaptureToken = result.event.targetToken;
    return result;
  }

  reset() {
    this.previousFrame = null;
    this.pointerRegions = [];
    this.pointerCaptureToken = null;
  }
}
