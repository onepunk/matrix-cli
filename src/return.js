import { renderScreen } from './screen.js';

export class ReturnTransition {
  constructor(now = performance.now(), duration = 850) {
    this.started = now;
    this.duration = duration;
  }
  done(now = performance.now()) { return now - this.started >= this.duration; }
  frame(term, rain, now = performance.now()) {
    if (this.done(now)) return renderScreen(term);
    const progress = Math.max(0,(now-this.started)/this.duration);
    // Keep the remaining rain moving while staggered columns resolve top to bottom.
    rain.particles = [];
    rain.frame(term.cols,term.rows,'',now);
    let out = renderScreen(term) + '\x1b[?25l';
    const buffer = term.buffer.active;
    for (let y=0; y<term.rows-2; y++) {
      const line = buffer.getLine(buffer.baseY+y);
      for (let x=0; x<term.cols; x++) {
        const cell = line?.getCell(x);
        if (cell?.getWidth() === 0) continue;
        const width = cell?.getWidth() || 1;
        const stagger = ((x*17)%23)/23;
        const edge = (progress*1.28-stagger*.24)*(term.rows-2);
        if (y >= edge) {
          for (let dx=0;dx<width;dx++) {
            out += `\x1b[${y+1};${x+dx+1}H\x1b[0m${rain.lastGrid?.[y]?.[x+dx] || ' '}`;
          }
        } else if (y > edge-2 && cell?.getChars().trim()) {
          // A brief green highlight settles into the CLI's original colours.
          out += `\x1b[${y+1};${x+1}H\x1b[0;38;5;83m${cell.getChars()}`;
        }
      }
    }
    return out+'\x1b[0m';
  }
}
