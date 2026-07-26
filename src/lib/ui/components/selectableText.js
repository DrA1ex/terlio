import { PointerRegion, Text } from '../node.js';
import {
  beginTextSelection,
  clearTextSelection,
  completeTextSelection,
  createTextLineSource,
  renderTextSelectionLines,
  selectionContainsPoint,
  updateTextSelection,
} from '../../textSelection.js';

export function SelectableText({
  lines = [],
  selectionLines = lines,
  selectionOffsetX = 0,
  selectionOffsetY = 0,
  selectionRowMap = null,
  selection,
  pointerId = 'selectable-text',
  pointerData = undefined,
  pointerWidth = 'fill',
  pointerAutoEnable = true,
  disabled = false,
  onWheel = null,
  onSelectionChange = null,
  onCopy = null,
  copyOnRelease = false,
  copyOnSelectionClick = true,
  clearOnWheel = false,
  nativeSelectionModifier = false,
} = {}) {
  const visible = Array.from(lines ?? [], (line) => String(line ?? ''));
  const source = createTextLineSource(selectionLines);
  const offsetX = Math.trunc(Number(selectionOffsetX) || 0);
  const offsetY = Math.trunc(Number(selectionOffsetY) || 0);
  const rendered = renderTextSelectionLines(visible, selection, {
    sourceLines: source,
    rowOffset: offsetY,
    rowMap: selectionRowMap,
  });

  return PointerRegion({
    pointerId,
    pointerData,
    pointerWidth,
    pointerAutoEnable,
    disabled,
    onClick: disabled ? null : (event, context) => {
      if (event.button !== 'left') return false;
      if (usesNativeTerminalSelection(event, nativeSelectionModifier)) {
        event.stopPropagation?.();
        return false;
      }

      const mapped = mappedEventPoint(event, source, { offsetX, offsetY, rowMap: selectionRowMap });
      if (!mapped.valid) {
        const changed = clearTextSelection(selection);
        onSelectionChange?.('', selection, event, context);
        event.preventDefault();
        event.stopPropagation();
        return changed || true;
      }

      const insideSelection = selectionContainsPoint(selection, mapped.point, source);
      selection.interaction = {
        point: mapped.point,
        insideSelection,
        moved: false,
      };
      if (!insideSelection) beginTextSelection(selection, mapped.point, source);
      event.capturePointer?.();
      onSelectionChange?.(insideSelection ? selection.text : '', selection, event, context);
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    onDrag: disabled ? null : (event, context) => {
      if (usesNativeTerminalSelection(event, nativeSelectionModifier)) {
        event.releasePointerCapture?.();
        event.stopPropagation?.();
        return false;
      }

      const mapped = mappedEventPoint(event, source, { offsetX, offsetY, rowMap: selectionRowMap, clampOutside: true });
      const interaction = selection.interaction ?? {
        point: mapped.point,
        insideSelection: false,
        moved: false,
      };
      interaction.moved ||= !samePoint(interaction.point, mapped.point);
      selection.interaction = interaction;

      if (interaction.insideSelection && !selection.selecting) {
        beginTextSelection(selection, interaction.point, source);
      }
      const text = updateTextSelection(selection, mapped.point, source);
      onSelectionChange?.(text, selection, event, context);
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    onRelease: disabled ? null : (event, context) => {
      if (usesNativeTerminalSelection(event, nativeSelectionModifier)) {
        selection.interaction = null;
        event.releasePointerCapture?.();
        event.stopPropagation?.();
        return false;
      }

      const mapped = mappedEventPoint(event, source, { offsetX, offsetY, rowMap: selectionRowMap, clampOutside: true });
      const interaction = selection.interaction;
      const moved = Boolean(interaction?.moved || (interaction?.point && !samePoint(interaction.point, mapped.point)));

      if (interaction?.insideSelection && !selection.selecting && !moved) {
        selection.interaction = null;
        event.releasePointerCapture?.();
        if (selection.text && copyOnSelectionClick) {
          const copyResult = onCopy?.(selection.text, selection, event, context);
          if (copySucceeded(copyResult)) {
            clearTextSelection(selection);
            onSelectionChange?.('', selection, event, context);
          }
        }
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

      const text = selection.selecting
        ? completeTextSelection(selection, mapped.point, source)
        : selection.text;
      selection.interaction = null;
      event.releasePointerCapture?.();
      onSelectionChange?.(text, selection, event, context);
      if (text && copyOnRelease) onCopy?.(text, selection, event, context);
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    onWheel: typeof onWheel === 'function' ? (event, context) => {
      if (clearOnWheel) clearTextSelection(selection);
      const result = onWheel(event, context);
      event.stopPropagation();
      return result;
    } : null,
  }, ...rendered.map((line) => Text(line, { wrap: false })));
}

function mappedEventPoint(event, lines, {
  offsetX = 0,
  offsetY = 0,
  rowMap = null,
  clampOutside = false,
} = {}) {
  const localY = Math.trunc(Number(event?.localY) || 0);
  const mappedY = mappedSourceRow(localY, rowMap, offsetY);
  const raw = {
    x: Math.trunc(Number(event?.localX) || 0) + offsetX,
    y: mappedY ?? -1,
  };
  const valid = mappedY !== null && raw.y >= 0 && raw.y < lines.length;
  if (!clampOutside || !lines.length) return { point: raw, valid };
  const y = valid
    ? raw.y
    : nearestMappedSourceRow(localY, rowMap, offsetY, lines.length);
  return {
    point: { x: Math.max(0, raw.x), y },
    valid,
  };
}

function mappedSourceRow(localY, rowMap, offsetY) {
  if (!Array.isArray(rowMap)) return localY + offsetY;
  const value = rowMap[localY];
  return Number.isInteger(value) ? value : null;
}

function nearestMappedSourceRow(localY, rowMap, offsetY, sourceLength) {
  if (!Array.isArray(rowMap)) return Math.max(0, Math.min(localY + offsetY, sourceLength - 1));
  for (let distance = 0; distance < rowMap.length; distance += 1) {
    const before = rowMap[localY - distance];
    if (Number.isInteger(before)) return Math.max(0, Math.min(before, sourceLength - 1));
    const after = rowMap[localY + distance];
    if (Number.isInteger(after)) return Math.max(0, Math.min(after, sourceLength - 1));
  }
  return 0;
}

function samePoint(a, b) {
  return Number(a?.x) === Number(b?.x) && Number(a?.y) === Number(b?.y);
}

function usesNativeTerminalSelection(event, modifier) {
  if (modifier === false || modifier == null) return false;
  if (typeof modifier === 'function') return Boolean(modifier(event));
  const names = Array.isArray(modifier) ? modifier : [modifier];
  return names.some((name) => Boolean(event?.[String(name)]));
}


function copySucceeded(result) {
  if (result === true) return true;
  return Boolean(result && typeof result === 'object' && result.copied === true);
}
