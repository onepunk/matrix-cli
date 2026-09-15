import { renderScreen } from './screen.js';
const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>[]{}/*+=ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘ';

export class TextFlicker {
  constructor(random = Math.random, duration = 500) {
    this.random = random;
    this.duration = duration;
    this.previous = new Map();
    this.animations = new Map();
  }
  reset() { this.previous.clear(); this.animations.clear(); }
  settle() { this.animations.clear(); }
  get active() { return this.animations.size > 0; }
  frame(term, offset = 0, now = performance.now(), enabled = true) {
    let out = renderScreen(term,offset);
    const buffer = term.buffer.active;
    const current = new Map();
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
        if (eligible && this.previous.get(key) !== text) {
          this.animations.set(key,{until: now + this.duration*(.15+.85*this.random()),seed:Math.floor(this.random()*glyphs.length)});
        }
        const animation = this.animations.get(key);
        if (!eligible || (animation && now >= animation.until)) this.animations.delete(key);
        else if (animation) {
          const glyph = glyphs[(animation.seed+Math.floor(now/60))%glyphs.length];
          const colour = animation.until-now < 90 ? 195 : 46;
          out += `\x1b[${y+1};${x+1}H\x1b[0;38;5;${colour}m${glyph}${cell.getWidth()===2 ? ' ' : ''}`;
        }
      }
    }
    for (const key of this.animations.keys()) if (!current.has(key)) this.animations.delete(key);
    this.previous = current;
    out += '\x1b[0m';
    if (!offset) out += `\x1b[${buffer.cursorY+1};${Math.min(term.cols,buffer.cursorX+1)}H\x1b[?25h`;
    return out;
  }
}
