export function screenLines(term) {
  const b = term.buffer.active;
  return Array.from({ length: term.rows }, (_, y) => b.getLine(b.baseY + y)?.translateToString(true) ?? '');
}
function style(cell) {
  const codes = [0];
  for (const [method, code] of [['isBold',1],['isDim',2],['isItalic',3],['isUnderline',4],['isInverse',7],['isInvisible',8],['isStrikethrough',9]]) if (cell[method]()) codes.push(code);
  for (const [side, code] of [['Fg',38],['Bg',48]]) {
    const color = cell[`get${side}Color`]();
    if (cell[`is${side}RGB`]()) codes.push(code,2,(color>>16)&255,(color>>8)&255,color&255);
    else if (cell[`is${side}Palette`]()) codes.push(code,5,color);
  }
  return `\x1b[${codes.join(';')}m`;
}
export function renderScreen(term, offset = 0) {
  const b = term.buffer.active;
  let out = '\x1b[?25l\x1b[0m';
  for (let y = 0; y < term.rows; y++) {
    out += `\x1b[${y+1};1H`;
    const line = b.getLine(Math.max(0, b.baseY - offset) + y);
    let previous = '';
    for (let x = 0; x < term.cols; x++) {
      const cell = line?.getCell(x);
      if (!cell) { out += ' '; continue; }
      if (cell.getWidth() === 0) continue;
      const next = style(cell);
      if (next !== previous) { out += next; previous = next; }
      out += cell.getChars() || ' ';
    }
  }
  out += '\x1b[0m';
  if (!offset) out += `\x1b[${b.cursorY+1};${Math.min(term.cols,b.cursorX+1)}H\x1b[?25h`;
  return out;
}

export function captureScreen(term, offset = 0) {
  const b = term.buffer.active;
  const cells = [];
  for (let y = 0; y < term.rows; y++) {
    const line = b.getLine(Math.max(0, b.baseY - offset) + y);
    for (let x = 0; x < term.cols; x++) {
      const cell = line?.getCell(x);
      if (cell && cell.getWidth() && cell.getChars().trim()) {
        cells.push({ x, y, text: cell.getChars(), width: cell.getWidth(), style: style(cell) });
      }
    }
  }
  return cells;
}
