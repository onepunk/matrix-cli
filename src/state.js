// Deliberately conservative: CLI wording can change between releases.
export function detectState(lines) {
  const visible = [...lines];
  while (visible.length && !visible.at(-1).trim()) visible.pop();
  const footer = visible.slice(-10).join('\n');
  // Claude displays this mode badge even while working. It is not a request.
  // Remove only the known badge phrase, so actual questions on the same line win.
  const prompts = footer.replace(/\bbypass permissions on\b/gi, '');
  if (/(?:allow|approve|permission|confirm|do you want|would you like|sign in|log in|error:|failed|press enter|enter to (?:confirm|select))/i.test(prompts)) return 'attention';
  if (/(?:esc(?:ape)? to (?:interrupt|cancel|stop)|ctrl\+c to interrupt)/i.test(footer)) return 'working';
  // Claude's current spinner uses rotating verbs and elapsed time/token counts.
  // Match the status shape rather than a list of verbs; completed summaries lack ellipses.
  if (/^\s*[^\p{L}\p{N}\n]*[\p{L}][\p{L}\p{M} -]*(?:…|\.{3})\s*\(\s*\d+(?:\.\d+)?[hms](?=[\s·•)])[^\n)]*\)\s*$/mu.test(footer)) return 'working';
  return 'idle';
}

export class ViewState {
  constructor() { this.manual = false; this.peek = false; this.state = 'idle'; }
  update(state) {
    if (state !== 'working') this.manual = false;
    // User reveal is sticky across redraws, tool changes and subsequent turns.
    this.state = state;
  }
  get rain() { return this.state !== 'attention' && (this.manual || (this.state === 'working' && !this.peek)); }
  toggle() {
    if (this.rain) { this.manual = false; this.peek = true; }
    else { this.manual = true; this.peek = false; }
  }
  reveal() { this.manual = false; this.peek = true; }
}
