import { ansi, stripAnsi, takeVisibleAnsi, visibleLength } from '../../ansi.js';
import { fit } from './utils.js';

export function renderShadowOverlay(node, width, renderNode) {
  const props = node.props || {};
  const containerWidth = Math.max(1, Math.min(Math.max(1, width), Math.max(1, Number(props.width) || width)));
  const childWidth = Math.max(1, Math.min(containerWidth, Number(props.childWidth) || containerWidth));
  const offsetX = Number.isFinite(Number(props.offsetX)) ? Number(props.offsetX) : -1;
  const offsetY = Math.max(0, Number(props.offsetY) || 0);
  const minActualX = Math.max(0, -offsetX);
  const requestedInset = Math.max(0, Number(props.inset) || 0);
  const actualX = Math.min(Math.max(minActualX, requestedInset), Math.max(0, containerWidth - childWidth));
  const shadowX = Math.max(0, actualX + offsetX);
  const shadowColor = String(props.shadowColor || '');
  const reset = shadowColor ? ansi.reset : '';
  const child = node.children?.[0] ?? null;
  const actualLines = renderNode(child, childWidth).map((line) => fit(line, childWidth));
  const shadowLines = actualLines.map((line) => stripAnsi(line));
  const totalHeight = actualLines.length + offsetY;
  const output = [];

  for (let row = 0; row < totalHeight; row += 1) {
    const actualLine = row < actualLines.length ? actualLines[row] : null;
    const shadowPlain = row >= offsetY ? shadowLines[row - offsetY] ?? null : null;
    output.push(composeShadowOverlayLine({
      actualLine,
      shadowPlain,
      actualX,
      shadowX,
      childWidth,
      width: containerWidth,
      shadowColor,
      reset,
    }));
  }

  return output;
}

function composeShadowOverlayLine({ actualLine, shadowPlain, actualX, shadowX, childWidth, width, shadowColor, reset }) {
  const actualEnd = actualLine === null ? -1 : actualX + childWidth;
  const shadowEnd = shadowPlain === null ? -1 : shadowX + childWidth;
  let line = '';
  let cursor = 0;

  const appendSpacesTo = (target) => {
    const next = Math.max(cursor, Math.min(width, target));
    if (next > cursor) line += ' '.repeat(next - cursor);
    cursor = next;
  };
  const appendShadow = (start, end) => {
    if (shadowPlain === null) return;
    const from = Math.max(0, start - shadowX);
    const to = Math.max(from, Math.min(childWidth, end - shadowX));
    if (to <= from) return;
    const segment = Array.from(shadowPlain).slice(from, to).join('');
    line += `${shadowColor}${segment}${reset}`;
    cursor += visibleLength(segment);
  };
  const appendActual = () => {
    if (actualLine === null) return;
    const segment = takeVisibleAnsi(actualLine, Math.max(0, Math.min(childWidth, width - cursor)));
    line += segment;
    cursor += visibleLength(segment);
  };

  if (shadowPlain !== null && (actualLine === null || shadowX < actualX)) {
    appendSpacesTo(shadowX);
    appendShadow(shadowX, actualLine === null ? shadowEnd : Math.min(actualX, shadowEnd));
  }

  if (actualLine !== null) {
    appendSpacesTo(actualX);
    appendActual();
  }

  if (shadowPlain !== null && actualLine !== null && shadowEnd > actualEnd) {
    appendSpacesTo(Math.max(cursor, actualEnd));
    appendShadow(Math.max(actualEnd, shadowX), shadowEnd);
  }

  return fit(line, width);
}
