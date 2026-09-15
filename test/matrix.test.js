import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pty from 'node-pty';
import xterm from '@xterm/headless';
import { detectState, ViewState } from '../src/state.js';
import { renderScreen, screenLines, captureScreen } from '../src/screen.js';
import { Rain } from '../src/rain.js';
const write = (term, data) => new Promise(resolve => term.write(data, resolve));

test('attention takes precedence and unknown screens stay visible', () => {
  assert.equal(detectState(['Working (esc to interrupt)']), 'working');
  assert.equal(detectState(['esc to interrupt', 'Do you want to approve?']), 'attention');
  assert.equal(detectState(['All done', '> ']), 'idle');
  const state = new ViewState(); state.update('working'); assert.ok(state.rain);
  state.reveal(); state.update('working'); assert.equal(state.rain,false);
  state.update('idle'); state.update('working'); assert.equal(state.rain,false);
  state.update('attention'); state.update('working'); assert.equal(state.rain,false);
  state.toggle(); assert.ok(state.rain);
  state.update('attention'); state.toggle(); assert.equal(state.rain,false);
});

test('screen redraw retains Unicode, colours, alternate buffer and cursor', async () => {
  const source = new xterm.Terminal({cols:30,rows:8,allowProposedApi:true});
  const target = new xterm.Terminal({cols:30,rows:8,allowProposedApi:true});
  await write(source,'\x1b[?1049h\x1b[31mHello 界\x1b[0m\r\nApprove?');
  await write(target,'\x1b[?7l' + renderScreen(source));
  assert.deepEqual(screenLines(target).map(s=>s.trimEnd()),screenLines(source).map(s=>s.trimEnd()));
  assert.equal(target.buffer.active.getLine(0).getCell(0).getFgColor(),1);
  assert.equal(target.buffer.active.cursorX,source.buffer.active.cursorX);
  source.dispose(); target.dispose();
});

test('rain renders inside resized terminal', async () => {
  const term = new xterm.Terminal({cols:40,rows:12,allowProposedApi:true});
  const rain = new Rain(() => .5);
  for(let i=0;i<30;i++) await write(term, '\x1b[?7l'+rain.frame(40,12,'codex working'));
  assert.match(screenLines(term).join('\n'),/codex working/);
  assert.equal(term.buffer.active.baseY,0);
  term.dispose();
});

for (const agent of ['codex','claude']) test(`${agent}: PTY animation, reveal, approval, resize and exit code`, {timeout:15000}, async () => {
  const dir = await mkdtemp(join(tmpdir(),'matrix-test-'));
  const executable = join(dir,agent);
  const working = agent === 'claude' ? '· Smooshing… (18s · ↓ 360 tokens)' : 'Working (esc to interrupt)';
  await writeFile(executable, `#!${process.execPath}\nprocess.stdin.setRawMode(true); process.stdin.resume();
function screen(s) { process.stdout.write('\\x1b[2J\\x1b[H'+s); }
screen('Ready>');
let stage=0;
process.stdin.on('data', b => {
 if(b.toString() === 'refresh') { screen('Between tools'); setTimeout(()=>screen('Editing secret-file.js\\r\\n${working}'),100); return; }
 if(stage===0) {stage++; screen('Editing secret-file.js\\r\\n${working}');}
 else if(stage===1) {stage++; screen('Do you want to approve? [y/n]');}
 else {screen('Result: '+b.toString());setTimeout(()=>process.exit(7),200);}
});\n`, {mode:0o755});
  const term = new xterm.Terminal({cols:80,rows:24,allowProposedApi:true});
  const child = pty.spawn(process.execPath,[resolve('src/cli.js'),agent],{cols:80,rows:24,cwd:process.cwd(),env:{...process.env,PATH:`${dir}:${process.env.PATH}`}});
  let raw='',exited=false;
  const exit = new Promise(resolve => child.onExit(e=>{exited=true;resolve(e);}));
  child.onData(data=>{raw+=data;term.write(data);});
  async function until(check) { const start=Date.now(); while(!check()) { if(Date.now()-start>5000) throw new Error('Timed out: '+screenLines(term).join('\n')); await new Promise(r=>setTimeout(r,30)); } }
  const screen = () => screenLines(term).join('\n');
  try {
    await until(()=>screen().includes('Ready>')); child.write('start\r');
    await until(()=>screen().includes(`${agent} working`)); assert.ok(!screen().includes('secret-file'));
    child.resize(60,18); term.resize(60,18);
    child.write('y'); // Only reveals. Must not reach child.
    await until(()=>screen().includes('secret-file.js'));
    assert.ok(!screen().includes('approve?'));
    child.write('refresh');
    await until(()=>screen().includes('Between tools'));
    await until(()=>screen().includes(working));
    await new Promise(r=>setTimeout(r,200));
    assert.ok(!screen().includes(`${agent} working`));
    child.write('\x1d');
    await until(()=>screen().includes(`${agent} working`));
    child.write('\x1d');
    await until(()=>screen().includes('secret-file.js'));
    child.write('next\r'); await until(()=>screen().includes('approve?'));
    assert.ok(!screen().includes(`${agent} working`));
    child.write('n'); assert.equal((await exit).exitCode,7);
    assert.ok(raw.includes('Result: n')); assert.ok(raw.includes('\x1b[?1049l'));
  } finally { if(!exited) child.kill(); term.dispose(); await rm(dir,{recursive:true,force:true}); }
});


test('entry captures screen characters, drops and morphs them, and restarts on re-entry', async () => {
  const source = new xterm.Terminal({cols:40,rows:20,allowProposedApi:true});
  const target = new xterm.Terminal({cols:40,rows:20,allowProposedApi:true});
  const rain = new Rain(()=>.5);
  await write(source,'Hello 界');
  rain.enter(captureScreen(source),0);
  await write(target,'\x1b[?7l'+rain.frame(40,20,'working',0));
  assert.equal(screenLines(target)[0].trimEnd(),'Hello 界');
  await write(target,rain.frame(40,20,'working',500));
  assert.equal(screenLines(target)[0].trimEnd(),'');
  assert.match(screenLines(target)[1],/Hello/);
  await write(target,rain.frame(40,20,'working',850));
  assert.ok(!screenLines(target).join('\n').includes('Hello'));
  assert.equal(target.buffer.active.baseY,0);
  await write(source,'\x1b[2J\x1b[HNew screen');
  rain.enter(captureScreen(source),3000);
  await write(target,rain.frame(40,20,'working',3000));
  assert.equal(screenLines(target)[0].trimEnd(),'New screen');
  source.dispose(); target.dispose();
});


test('Claude bypass-permissions mode badge does not suppress rain or toggling', () => {
  const badge = '⏵⏵ bypass permissions on (shift+tab to cycle)';
  assert.equal(detectState(['Thinking… (esc to interrupt)', '❯', badge]), 'working');
  assert.equal(detectState(['❯', badge]), 'idle');
  assert.equal(detectState(['Thinking… (esc to interrupt)', 'Do you want to continue?', badge]), 'attention');
  assert.equal(detectState(['Thinking… (esc to interrupt)', badge + ' · Confirm action?']), 'attention');
  const view = new ViewState();
  view.update(detectState(['Thinking… (esc to interrupt)', badge]));
  assert.ok(view.rain);
  view.reveal();
  view.update(detectState(['Thinking… (esc to interrupt)', badge]));
  assert.equal(view.rain,false);
  view.toggle(); assert.ok(view.rain);
});


test('Claude elapsed-time spinner activates rain without an interrupt hint', () => {
  const footer = [
    '· Smooshing… (18s · ↓ 360 tokens)', '', '────────────────', '❯',
    '────────────────', 'Sonnet · 5% context',
    '⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents',
  ];
  assert.equal(detectState(footer), 'working');
  for (const spinner of ['✻ Thinking… (2s)', '* Pondering... (1m 12s · ↑ 1.2k tokens)', '· Working… (0.5s)']) {
    assert.equal(detectState([spinner, ...footer.slice(1)]), 'working');
  }
  assert.equal(detectState(['✻ Cooked for 18s', ...footer.slice(1)]), 'idle');
  assert.equal(detectState([...footer, 'Do you want to allow this command?']), 'attention');
  assert.equal(detectState(['The documentation mentions Smooshing… (18s · ↓ 360 tokens).']), 'idle');
});


test('Claude tool-hook phases remain working', () => {
  for (const phase of ['PreToolUse', 'PostToolUse']) {
    assert.equal(detectState([
      `✳ Honking… (running ${phase} hooks… 0/2 · 6s · ↓ 225 tokens · thought for 4s)`,
      '❯', '⏵⏵ bypass permissions on (shift+tab to cycle)',
    ]), 'working');
  }
});

test('partial redraws do not stop rain; settled idle and prompts reveal', () => {
  const view = new ViewState();
  view.update('working',0);
  view.update('idle',100); view.tick(300); assert.ok(view.rain);
  view.update('working',400); view.tick(900); assert.ok(view.rain);
  view.update('idle',1000); view.tick(1600); assert.equal(view.rain,false);
  view.update('working',1700); assert.ok(view.rain);
  view.update('attention',1701); assert.equal(view.rain,false);
});


test('Claude initial spinner and background review remain active', () => {
  assert.equal(detectState(['✳ Cascading…', '❯', 'Sonnet']), 'working');
  assert.equal(detectState(['* Waiting for 1 background agent to finish', ...Array(30).fill(''), '❯', 'Sonnet']), 'working');
  assert.equal(detectState(['* Waiting for 2 background agents to finish', ...Array(30).fill(''), 'Do you want to continue?']), 'attention');
});

test('PTY keeps rain through redraw gaps and background work, then reveals completion', {timeout:10000}, async () => {
  const dir = await mkdtemp(join(tmpdir(),'matrix-lifecycle-'));
  await writeFile(join(dir,'claude'), `#!${process.execPath}
process.stdin.setRawMode(true); process.stdin.resume();
function screen(s){process.stdout.write('\\x1b[2J\\x1b[H'+s);}
screen('✳ Thinking… (1s)');
process.stdin.on('data',()=>{
 screen('Partial redraw');
 setTimeout(()=>screen('✳ Thinking… (running PostToolUse hooks… 0/2 · 2s)'),100);
 setTimeout(()=>screen('* Waiting for 1 background agent to finish'),200);
 setTimeout(()=>screen('Review complete.\\r\\n❯'),500);
});
`,{mode:0o755});
  const term = new xterm.Terminal({cols:80,rows:24,allowProposedApi:true});
  const child = pty.spawn(process.execPath,[resolve('src/cli.js'),'claude'],{cols:80,rows:24,cwd:process.cwd(),env:{...process.env,PATH:`${dir}:${process.env.PATH}`}});
  child.onData(d=>term.write(d));
  const screen=()=>screenLines(term).join('\n');
  const until=async check=>{const start=Date.now();while(!check()){if(Date.now()-start>4000)throw new Error('Lifecycle timeout');await new Promise(r=>setTimeout(r,20));}};
  try {
    await until(()=>screen().includes('claude working'));
    // Reveal, start the deterministic phase sequence, then explicitly return to rain.
    child.write('\x1d'); await until(()=>screen().includes('Thinking'));
    child.write('go'); child.write('\x1d');
    await until(()=>screen().includes('claude working'));
    const start=Date.now();
    while(Date.now()-start<450){assert.ok(screen().includes('claude working'));await new Promise(r=>setTimeout(r,20));}
    await until(()=>screen().includes('Review complete.'));
    assert.ok(!screen().includes('claude working'));
  } finally {child.kill();term.dispose();await rm(dir,{recursive:true,force:true});}
});
