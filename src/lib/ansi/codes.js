export const ESC = '\x1b[';

export const ansi = {
  clear: `${ESC}2J`,
  home: `${ESC}H`,
  hideCursor: `${ESC}?25l`,
  showCursor: `${ESC}?25h`,
  altScreen: `${ESC}?1049h`,
  normalScreen: `${ESC}?1049l`,
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

