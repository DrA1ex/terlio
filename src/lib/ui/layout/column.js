import { applyFixedHeight, distribute, withHeight } from './utils.js';

export function renderColumn(node, width, renderNode) {
  const gap = Number(node.props.gap ?? 0);
  const fixedHeight = node.props.height === undefined ? null : Math.max(0, Number(node.props.height) || 0);

  if (fixedHeight !== null) return renderFixedHeightColumn(node, width, fixedHeight, gap, renderNode);

  const lines = [];
  node.children.forEach((child, index) => {
    if (index > 0) for (let i = 0; i < gap; i += 1) lines.push('');
    lines.push(...renderNode(child, width));
  });
  return lines.length ? lines : [''];
}

function renderFixedHeightColumn(node, width, height, gap, renderNode) {
  const children = node.children || [];
  if (!children.length) return applyFixedHeight([''], width, height);

  const growIndexes = children
    .map((child, index) => child?.props?.grow === true || child?.props?.height === 'fill' ? index : -1)
    .filter((index) => index >= 0);

  if (!growIndexes.length) {
    const lines = [];
    children.forEach((child, index) => {
      if (index > 0) for (let i = 0; i < gap; i += 1) lines.push('');
      lines.push(...renderNode(child, width));
    });
    return applyFixedHeight(lines.length ? lines : [''], width, height);
  }

  const rendered = new Array(children.length);
  let used = Math.max(0, gap * Math.max(0, children.length - 1));

  children.forEach((child, index) => {
    if (growIndexes.includes(index)) return;
    const lines = renderNode(child, width);
    rendered[index] = lines;
    used += lines.length;
  });

  const availableForGrow = Math.max(0, height - used);
  const allocations = distribute(availableForGrow, growIndexes.length);

  growIndexes.forEach((childIndex, allocationIndex) => {
    const child = children[childIndex];
    const assignedHeight = allocations[allocationIndex];
    rendered[childIndex] = renderNode(withHeight(child, assignedHeight), width);
  });

  const lines = [];
  children.forEach((_, index) => {
    if (index > 0) for (let i = 0; i < gap; i += 1) lines.push('');
    lines.push(...(rendered[index] || ['']));
  });

  return applyFixedHeight(lines.length ? lines : [''], width, height);
}
