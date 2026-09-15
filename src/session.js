import pty from 'node-pty';
import { ReturnTransition } from './return.js';
import { InputParser } from './input.js';
import xterm from '@xterm/headless';
import { detectState, ViewState } from './state.js';
import { Rain } from './rain.js';
import { renderScreen, screenLines, captureScreen } from './screen.js';

export async function runSession(command, args, { demo = false } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('An interactive terminal is required.');
  const size = () => ({ cols: Math.max(2, process.stdout.columns || 80), rows: Math.max(3, process.stdout.rows || 24) });
  const term = new xterm.Terminal({ ...size(), allowProposedApi: true, scrollback: 5000 });
  const view = new ViewState();
  const rain = new Rain();
  const parser = new InputParser();
  let discardPaste = false, inputTimer;
  let dirty = true, closed = false, offset = 0, pending = 0, exitEvent;
  let child;
  let showingRain = false, visibleCells = [], returning;
  if (!demo) child = pty.spawn(command, args, { ...size(), name: 'xterm-256color', cwd: process.cwd(), env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } });
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdout.write('\x1b[?1049h\x1b[?7l\x1b[?2004h\x1b[2J');
  const reply = term.onData(data => child?.write(data));
  const paint = () => {
    if (closed || process.stdout.writableLength > 65536) return;
    view.tick();
    if (demo) { if (dirty) process.stdout.write(rain.frame(term.cols,term.rows,'MATRIX DEMO — Ctrl+C exits')); return; }
    if (view.rain && !offset) {
      returning = undefined;
      if (!showingRain) rain.enter(visibleCells);
      showingRain = true;
      process.stdout.write(rain.frame(term.cols,term.rows,`${command} working`));
    } else if (dirty || showingRain || returning) {
      if (showingRain && !offset) returning = new ReturnTransition(performance.now(), view.state === 'attention' ? 350 : 850);
      showingRain = false;
      if (returning?.done()) returning = undefined;
      process.stdout.write(returning ? returning.frame(term, rain) : renderScreen(term, offset));
      visibleCells = captureScreen(term, offset);
      dirty = false;
    }
  };
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const finish = (code = 0) => {
    if (closed) return;
    returning = undefined; showingRain = false;
    if (!demo) { view.reveal(); offset = 0; dirty = true; paint(); }
    const finalText = demo ? '' : screenLines(term).map(line => line.trimEnd()).join('\r\n').trimEnd();
    closed = true;
    clearInterval(timer);
    process.stdin.off('data', receive);
    clearTimeout(inputTimer);
    process.stdout.off('resize', resize);
    process.off('SIGTERM', terminate); process.off('SIGHUP', hangup); process.off('SIGINT', interrupt);
    process.stdin.setRawMode(wasRaw || false); process.stdin.pause();
    process.stdout.write('\x1b[0m\x1b[?25h\x1b[?7h\x1b[?2004l\x1b[?1049l');
    if (finalText) process.stdout.write('\r\n' + finalText + '\r\n');
    reply.dispose(); term.dispose();
    resolveDone(code);
  };
  const stop = code => { try { child?.kill(); } catch {} finish(code); };
  const terminate = () => stop(143), hangup = () => stop(129), interrupt = () => stop(130);
  function dispatch(events) {
    for (const event of events) {
      if (event.type === 'text') { input(event.data); continue; }
      if (event.type === 'paste-start') {
        const autoReturn = returning && !view.peek;
        if (returning) { returning = undefined; dirty = true; paint(); }
        discardPaste = view.rain || offset > 0 || Boolean(autoReturn);
        if (discardPaste) { view.reveal(); offset = 0; dirty = true; paint(); }
      }
      if (!discardPaste) child?.write(event.data);
      if (event.type === 'paste-end') discardPaste = false;
    }
  }
  function receive(text) {
    clearTimeout(inputTimer);
    dispatch(parser.push(text));
    // A lone Escape must still work. Paste payload/boundaries can wait for more input.
    if (parser.pending === '\x1b' && !parser.pasting) inputTimer = setTimeout(() => dispatch(parser.flush()), 30);
  }
  function input(chunk) {
    const data = chunk.toString('utf8');
    if (demo) { if (data.includes('\x03') || data === 'q') finish(); return; }
    if (returning) {
      returning = undefined; dirty = true; paint();
      // First input during an automatic reveal finishes it without answering unseen prompts.
      if (!view.peek && data !== '\x03' && data !== '\x1d') { view.reveal(); return; }
    }
    if (data === '\x1d') { offset = 0; view.toggle(); dirty = true; paint(); return; }
    if (data === '\x1b[5;2~' || data === '\x1b[6;2~') {
      view.reveal();
      offset = Math.max(0, Math.min(term.buffer.active.baseY, offset + (data === '\x1b[5;2~' ? 1 : -1) * Math.max(1, term.rows - 2)));
      dirty = true; paint(); return;
    }
    if (view.rain || offset) {
      view.reveal(); offset = 0; dirty = true; paint();
      // Reveal first. Never let a blind keystroke approve a hidden dialog.
      if (data !== '\x03') return;
    }
    if (/[\r\n]/.test(data)) view.submitted();
    child.write(data);
  }
  function resize() { if (closed) return; returning = undefined; const s = size(); term.resize(s.cols,s.rows); child?.resize(s.cols,s.rows); dirty = true; paint(); }
  process.stdin.on('data', receive); process.stdout.on('resize', resize);
  process.on('SIGTERM', terminate); process.on('SIGHUP', hangup); process.on('SIGINT', interrupt);
  const timer = setInterval(paint, 60);
  child?.onData(data => {
    pending++;
    term.write(data, () => {
      pending--;
      if (closed) return;
      view.update(detectState(screenLines(term))); dirty = true;
      if (exitEvent && !pending) finish(exitEvent.signal ? 128 + exitEvent.signal : exitEvent.exitCode);
    });
  });
  child?.onExit(event => { exitEvent = event; if (!pending) finish(event.signal ? 128 + event.signal : event.exitCode); });
  paint();
  return done;
}
