const layers = [
  { step: 1, offset: 0, speed: .12, spread: .22, length: .42, colors: ['38;2;20;85;39', '38;2;10;55;25', '38;2;5;33;15', '38;2;2;19;9'] },
  { step: 2, offset: 0, speed: .3, spread: .6, length: .7, colors: ['38;5;83', '38;5;40', '38;5;28', '38;5;22'] },
  { step: 5, offset: 1, speed: .8, spread: .65, length: .85, colors: ['38;5;195', '38;5;46', '38;5;34', '38;5;22'] },
];
const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:<>[]{}/*+=ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘ';
export class Rain {
  constructor(random = Math.random) { this.random = random; this.columns = layers.map(() => []); }
  enter(cells, now = performance.now()) {
    this.started = now;
    this.columns = layers.map(() => []);
    // Copy only the last displayed screen, never hidden agent output.
    this.particles = cells.map(cell => ({ ...cell, delay: this.random() * 280, speed: .7 + this.random() * .6 }));
  }
  frame(cols, rows, label, now = performance.now()) {
    const height = Math.max(1, rows - 2);
    let out = '\x1b[?25l\x1b[0m\x1b[H';
    const elapsed = this.started === undefined ? Infinity : now - this.started;
    const grid = Array.from({length: height}, () => Array(cols).fill(' '));
    // Paint back to front: plentiful dim streams, midground, then sparse bright trails.
    for (const [index, layer] of layers.entries()) {
      const columns = this.columns[index];
      for (let x = layer.offset; x < cols; x += layer.step) {
        let drop = columns[x];
        if (!drop || drop.head - drop.length > height) {
          drop = columns[x] = {
            head: -this.random() * height,
            length: 4 + this.random() * height * layer.length,
            speed: layer.speed + this.random() * layer.spread,
            letters: Array.from({length: height + 8}, () => glyphs[Math.floor(this.random() * glyphs.length)]),
          };
        }
        drop.head += drop.speed;
        for (let y = 0; y < height; y++) {
          const age = drop.head - y;
          if (elapsed > 350 && age >= 0 && age < drop.length) {
            const color = layer.colors[age < 1.5 ? 0 : age < drop.length * .3 ? 1 : age < drop.length * .65 ? 2 : 3];
            // Letters travel with their stream instead of flickering independently.
            const letter = drop.letters[Math.floor(age) % drop.letters.length];
            grid[y][x] = `\x1b[${color}m${letter}`;
          }
        }
      }
    }
    if (elapsed < 2200) {
      for (const particle of this.particles ?? []) {
        const seconds = Math.max(0, elapsed - 120 - particle.delay) / 1000;
        const y = particle.y + Math.floor(seconds * seconds * rows * particle.speed);
        if (y >= height || particle.x + particle.width > cols) continue;
        const morph = seconds > .3;
        const text = morph ? glyphs[Math.floor(this.random() * glyphs.length)] : particle.text;
        const color = seconds === 0 ? particle.style : morph ? '\x1b[38;5;46m' : '\x1b[38;5;195m';
        grid[y][particle.x] = `${color}${text}\x1b[0m`;
        if (particle.width === 2) grid[y][particle.x + 1] = morph ? ' ' : '';
      }
    } else this.particles = [];
    for (let y = 0; y < height; y++) out += `\x1b[${y+1};1H${grid[y].join('')}\x1b[0m\x1b[K`;
    const status = ` ${label}  •  Ctrl+] toggle  •  any key reveals`;
    return out + `\x1b[${height+1};1H\x1b[0;32m${status.slice(0, Math.max(0, cols-1))}\x1b[K\x1b[${rows};1H\x1b[0m\x1b[K`;
  }
}
