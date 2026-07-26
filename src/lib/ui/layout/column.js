import { applyFixedHeightResult, asLayoutResult, createLayoutResult, translatePointerRegions } from './result.js';
import { distribute, withHeight } from './utils.js';

export function renderColumn(node, width, renderNode) {
  const gap = Number(node.props.gap ?? 0);
  const fixedHeight = node.props.height === undefined ? null : Math.max(0, Number(node.props.height) || 0);

  if (fixedHeight !== null) return renderFixedHeightColumn(node, width, fixedHeight, gap, renderNode);

  const lines = [];
  const pointerRegions = [];
  node.children.forEach((child, index) => {
    if (index > 0) for (let i = 0; i < gap; i += 1) lines.push('');
    const rendered = asLayoutResult(renderNode(child, width));
    const y = lines.length;
    lines.push(...rendered.lines);
    pointerRegions.push(...translatePointerRegions(rendered.pointerRegions, 0, y, { width, height: Infinity }));
  });
  return createLayoutResult(lines.length ? lines : [''], pointerRegions);
}

function renderFixedHeightColumn(node, width, height, gap, renderNode) {
  const children = node.children || [];
  if (!children.length) return applyFixedHeightResult(createLayoutResult(['']), width, height);

  const growIndexes = children
    .map((child, index) => child?.props?.grow === true || child?.props?.height === 'fill' ? index : -1)
    .filter((index) => index >= 0);

  if (!growIndexes.length) {
    const lines = [];
    const pointerRegions = [];
    children.forEach((child, index) => {
      if (index > 0) for (let i = 0; i < gap; i += 1) lines.push('');
      const rendered = asLayoutResult(renderNode(child, width));
      const y = lines.length;
      lines.push(...rendered.lines);
      pointerRegions.push(...translatePointerRegions(rendered.pointerRegions, 0, y, { width, height }));
    });
    return applyFixedHeightResult(createLayoutResult(lines.length ? lines : [''], pointerRegions), width, height);
  }

  const rendered = new Array(children.length);
  let used = Math.max(0, gap * Math.max(0, children.length - 1));

  children.forEach((child, index) => {
    if (growIndexes.includes(index)) return;
    const result = asLayoutResult(renderNode(child, width));
    rendered[index] = result;
    used += result.lines.length;
  });

  const availableForGrow = Math.max(0, height - used);
  const allocations = distribute(availableForGrow, growIndexes.length);

  growIndexes.forEach((childIndex, allocationIndex) => {
    const child = children[childIndex];
    const assignedHeight = allocations[allocationIndex];
    rendered[childIndex] = asLayoutResult(renderNode(withHeight(child, assignedHeight), width));
  });

  const lines = [];
  const pointerRegions = [];
  children.forEach((_, index) => {
    if (index > 0) for (let i = 0; i < gap; i += 1) lines.push('');
    const result = rendered[index] || createLayoutResult(['']);
    const y = lines.length;
    lines.push(...result.lines);
    pointerRegions.push(...translatePointerRegions(result.pointerRegions, 0, y, { width, height }));
  });

  return applyFixedHeightResult(createLayoutResult(lines.length ? lines : [''], pointerRegions), width, height);
}
