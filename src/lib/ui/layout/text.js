import { fit, wrapPlain } from './utils.js';

export function renderText(node, width) {
  const value = String(node.props.value ?? '');
  const wrap = node.props.wrap !== false;
  if (!wrap) return value.split('\n').map((line) => fit(line, width));
  return wrapPlain(value, width).map((line) => fit(line, width));
}
