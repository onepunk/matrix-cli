// Deliberately conservative: CLI wording can change between releases.
export function detectState(lines) {
  const visible = [...lines];
  while (visible.length && !visible.at(-1).trim()) visible.pop();
  const footer = visible.slice(-10).join('\n');
  // Claude displays this mode badge even while working. It is not a request.
  // Remove only the known badge phrase, so actual questions on the same line win.
  const prompts = visible.join('\n').replace(/\bbypass permissions on\b/gi, '');
  // Match actual interaction prompts, not words in logs or source under review.
  const question = /^[ \t]*(?:[│┃›❯>][ \t]*)?(?:do you want\b|would you like\b|allow\b[^\n]*\?|approve\b[^\n]*\?|(?:permission|approval) (?:required|needed|requested)\b)/im;
  if (question.test(prompts) || /(?:^[ \t]*(?:[│┃›❯>][ \t]*)?(?:press enter|enter to (?:confirm|select))\b|(?:^|[·•])[ \t]*confirm (?:action|command|changes)\?)/im.test(prompts)) return 'attention';
  if (/^[ \t]*(?:[⚠×!][ \t]*)?(?:error:|failed\b|sign in\b|log in\b)/im.test(footer)) return 'attention';
  if (/^[ \t]*(?:[•●◦✳✶✻✽✢✱*·][ \t]+)?[\p{L}][\p{L}\p{N} ….:/_-]*\([^\n()]*\b(?:esc(?:ape)? to (?:interrupt|cancel|stop)|ctrl\+c to interrupt)\)[ \t]*$/imu.test(footer)) return 'working';
  // Codex adds MCP startup details and a background-terminal suffix to this line.
  if (/^[ \t]*[•◦●][ \t]+[^\n]*\(\d+[^\n)]*\besc to interrupt\)(?:[ \t]*·[^\n]*)?[ \t]*$/m.test(footer)) return 'working';
  // Claude's current spinner uses rotating verbs and elapsed time/token counts.
  // Match the status shape rather than a list of verbs; completed summaries lack ellipses.
  if (/^\s*[^\p{L}\p{N}\n]*[\p{L}][\p{L}\p{M} -]*(?:…|\.{3})\s*\([^\n)]*?\b\d+(?:\.\d+)?[hms](?=[\s·•)])[^\n)]*\)\s*$/mu.test(footer)) return 'working';
  if (/^[ \t]*[✳✶✻✽✢✱*·][ \t]+[\p{L}][\p{L}\p{M} -]*(?:…|\.{3})[ \t]*$/mu.test(footer)) return 'working';
  // Background reviews move their waiting indicator above the large empty prompt area.
  const waiting = visible.findLastIndex(line => /^[ \t]*[✳✶✻✽✢✱*·][ \t]+Waiting for \d+ background agents? to finish[ \t]*$/u.test(line));
  const ended = visible.slice(waiting + 1).some(line =>
    /All background agents (?:stopped|finished|completed)/i.test(line) ||
    /^[ \t]*[✳✶✻✽✢✱*·][ \t]+[\p{L} -]+ for \d+(?:\.\d+)?[hms]\b/u.test(line));
  if (waiting >= 0 && !ended) return 'working';
  return 'idle';
}

export class ViewState {
  constructor() { this.manual = false; this.peek = false; this.state = 'idle'; }
  update(state, now = performance.now()) {
    if (state === 'idle' && this.state === 'working') {
      this.idleSince ??= now;
      this.tick(now);
      return;
    }
    this.idleSince = undefined;
    if (state !== 'working') this.manual = false;
    // User reveal is sticky across redraws, tool changes and subsequent turns.
    this.state = state;
  }
  tick(now = performance.now()) {
    // A missing spinner can be a partial redraw. Confirm idle after a short grace period.
    if (this.idleSince !== undefined && now - this.idleSince >= 600) {
      this.state = 'idle';
      this.manual = false;
      this.idleSince = undefined;
    }
  }
  get rain() { return this.state !== 'attention' && (this.manual || (this.state === 'working' && !this.peek)); }
  toggle() {
    if (this.rain) { this.manual = false; this.peek = true; }
    else { this.manual = true; this.peek = false; }
  }
  reveal() { this.manual = false; this.peek = true; }
}
