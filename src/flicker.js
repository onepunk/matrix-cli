import { renderScreen } from './screen.js';
const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>[]{}/*+=ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘ';

// Match unchanged lines in order, including output moved by a full-screen redraw.
// An ordered match keeps repeated lines distinct instead of sharing animation state.
function matchLines(previous, current) {
  const lengths = Array.from({length: previous.length+1}, () => new Uint16Array(current.length+1));
  for (let i=previous.length-1;i>=0;i--) for (let j=current.length-1;j>=0;j--) {
    lengths[i][j] = previous[i].text === current[j].text
      ? 1+lengths[i+1][j+1] : Math.max(lengths[i+1][j],lengths[i][j+1]);
  }
  const matches = new Map();
  let i=0,j=0;
  while (i<previous.length && j<current.length) {
    if (previous[i].text === current[j].text) {
      matches.set(current[j++].row,previous[i++].row);
    } else if (lengths[i+1][j] >= lengths[i][j+1]) i++;
    else j++;
  }
  return matches;
}

export class TextFlicker {
  constructor(random = Math.random, duration = 500) {
    this.random = random;
    this.duration = duration;
    this.previous = new Map();
    this.lines = [];
    this.bufferType = undefined;
    this.animations = new Map();
  }
  reset() { this.previous.clear(); this.animations.clear(); this.lines = []; }
  settle() { this.animations.clear(); }
  get active() { return this.animations.size > 0; }
  frame(term, offset = 0, now = performance.now(), enabled = true) {
    let out = renderScreen(term,offset);
    const buffer = term.buffer.active;
    const current = new Map();
    const nextAnimations = new Map();
    const lines = [];
    for (let y=0;y<term.rows;y++) {
      const row = Math.max(0,buffer.baseY-offset)+y;
      const text = buffer.getLine(row)?.translateToString(true) || '';
      if (text.trim()) lines.push({row,text});
    }
    const matches = matchLines(this.bufferType === buffer.type ? this.lines : [],lines);
    for (let y=0; y<term.rows; y++) {
      const row = Math.max(0,buffer.baseY-offset)+y;
      const line = buffer.getLine(row);
      for (let x=0;x<term.cols;x++) {
        const cell = line?.getCell(x);
        if (!cell || !cell.getWidth()) continue;
        const text = cell.getChars();
        const key = `${buffer.type}:${row}:${x}`;
        current.set(key,text);
        // Keep the editable prompt, status rows and dialogs immediately legible.
        const eligible = enabled && !offset && y !== buffer.cursorY && y < term.rows-2 && text.trim();
        const previousKey = `${buffer.type}:${matches.get(row) ?? row}:${x}`;
        let animation = this.animations.get(previousKey);
        if (eligible && this.previous.get(previousKey) !== text) {
          animation = {until: now + this.duration*(.15+.85*this.random()),seed:Math.floor(this.random()*glyphs.length)};
        }
        if (eligible && animation && now < animation.until) {
          nextAnimations.set(key,animation);
          const glyph = glyphs[(animation.seed+Math.floor(now/60))%glyphs.length];
          const colour = animation.until-now < 90 ? 195 : 46;
          out += `\x1b[${y+1};${x+1}H\x1b[0;38;5;${colour}m${glyph}${cell.getWidth()===2 ? ' ' : ''}`;
        }
      }
    }
    this.animations = nextAnimations;
    this.lines = lines;
    this.bufferType = buffer.type;
    this.previous = current;
    out += '\x1b[0m';
    if (!offset) out += `\x1b[${buffer.cursorY+1};${Math.min(term.cols,buffer.cursorX+1)}H\x1b[?25h`;
    return out;
  }
}
