const START = '\x1b[200~';
const END = '\x1b[201~';

// Keep bracketed-paste boundaries intact across arbitrary stdin chunks.
export class InputParser {
  constructor() { this.pending = ''; this.pasting = false; }
  push(text) {
    this.pending += text;
    const events = [];
    while (this.pending) {
      const marker = this.pasting ? END : START;
      const index = this.pending.indexOf(marker);
      if (index >= 0) {
        if (index) events.push({ type: this.pasting ? 'paste-data' : 'text', data: this.pending.slice(0,index) });
        events.push({type: this.pasting ? 'paste-end' : 'paste-start', data: marker});
        this.pasting = !this.pasting;
        this.pending = this.pending.slice(index + marker.length);
        continue;
      }
      let keep = Math.min(marker.length-1,this.pending.length);
      while (keep && !marker.startsWith(this.pending.slice(-keep))) keep--;
      const escape = this.pending.lastIndexOf('\x1b');
      if (escape >= 0 && /^\x1b(?:\[[0-?]*[ -/]*)?$/.test(this.pending.slice(escape))) {
        keep = Math.max(keep,this.pending.length-escape);
      }
      const data = this.pending.slice(0,this.pending.length-keep);
      if (data) events.push({type: this.pasting ? 'paste-data' : 'text',data});
      this.pending = this.pending.slice(this.pending.length-keep);
      break;
    }
    return events;
  }
  flush() {
    const data = this.pending;
    this.pending = '';
    return data ? [{type: this.pasting ? 'paste-data' : 'text',data}] : [];
  }
}
