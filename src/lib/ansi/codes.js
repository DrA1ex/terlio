export const ESC = '\x1b[';

export const ansi = {
  clear: `${ESC}2J`,
  home: `${ESC}H`,
  hideCursor: `${ESC}?25l`,
  showCursor: `${ESC}?25h`,
  altScreen: `${ESC}?1049h`,
  normalScreen: `${ESC}?1049l`,
  mouseBasicOn: `${ESC}?1000h`,
  mouseBasicOff: `${ESC}?1000l`,
  mouseDragOn: `${ESC}?1002h`,
  mouseDragOff: `${ESC}?1002l`,
  mouseMotionOn: `${ESC}?1003h`,
  mouseMotionOff: `${ESC}?1003l`,
  mouseSgrOn: `${ESC}?1006h`,
  mouseSgrOff: `${ESC}?1006l`,
  reset: `${ESC}0m`,
  bold: `${ESC}1m`,
  dim: `${ESC}2m`,
  inverse: `${ESC}7m`,
  underline: `${ESC}4m`,
  moveTo(row, col) {
    return `${ESC}${row};${col}H`;
  },
  eraseLine: `${ESC}2K`,
};

export function mouseReportingSequence(enabled, { drag = true, motion = false } = {}) {
  if (!enabled) {
    return ansi.mouseMotionOff + ansi.mouseDragOff + ansi.mouseBasicOff + ansi.mouseSgrOff;
  }
  const tracking = motion ? ansi.mouseMotionOn : drag ? ansi.mouseDragOn : '';
  return ansi.mouseSgrOn + ansi.mouseBasicOn + tracking;
}
