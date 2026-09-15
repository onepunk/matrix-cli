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
import { TextFlicker } from '../src/flicker.js';
import { ReturnTransition } from '../src/return.js';
import { InputParser } from '../src/input.js';
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
    assert.ok(raw.slice(raw.lastIndexOf('\x1b[?1049l')).includes('Result: n'));
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
  view.submitted(); view.update('working',1700); assert.ok(view.rain);
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
 setTimeout(()=>screen('✳ Thinking… (running Stop hooks… 0/2 · 3s)'),1400);
 setTimeout(()=>screen('Review complete.\\r\\n❯'),1900);
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
    child.write('go\x1d'); // A PTY may coalesce adjacent writes into this one chunk.
    await until(()=>screen().includes('claude working'));
    const start=Date.now();
    while(Date.now()-start<450){assert.ok(screen().includes('claude working'));await new Promise(r=>setTimeout(r,20));}
    await until(()=>screen().includes('Review complete.'));
    assert.ok(!screen().includes('claude working'));
    const afterReply=Date.now();
    while(Date.now()-afterReply<1200){assert.ok(!screen().includes('claude working'));await new Promise(r=>setTimeout(r,20));}
  } finally {child.kill();term.dispose();await rm(dir,{recursive:true,force:true});}
});


test('historical background waiting cannot hide completion or cancellation', () => {
  const waiting = '* Waiting for 1 background agent to finish';
  for (const ending of ['⏺ All background agents stopped', '✻ Crunched for 4m 18s · done', '✻ Cooked for 35s']) {
    assert.equal(detectState([waiting, ending, ...Array(20).fill(''), '❯']), 'idle');
  }
  assert.equal(detectState(['✻ Cooked for 35s', waiting, ...Array(20).fill(''), '❯']), 'working');
});


test('Codex warnings and review text do not override active work', () => {
  const working = '• Working (7s • esc to interrupt)';
  assert.equal(detectState(['⚠ MCP startup incomplete (failed: example-server)', working, '› Ask Codex to do anything']), 'working');
  assert.equal(detectState(['• Inspecting permission checks and failed test handling.', working]), 'working');
  assert.equal(detectState(['• Reading src/permissions.js', working]), 'working');
  assert.equal(detectState([working, 'Would you like to run the following command?', '1. Yes, proceed', '2. No, cancel']), 'attention');
  assert.equal(detectState([working, 'Approval required']), 'attention');
  assert.equal(detectState(['Error: connection lost']), 'attention');
});


test('Codex quoted interrupt hints cannot restart rain in the final answer', () => {
  assert.equal(detectState(['  - Working indicators hide errors. Reproduced with Working', '    (esc to interrupt) followed by Error: connection lost: rain remains active.']), 'idle');
  assert.equal(detectState(['• Working (12s • esc to interrupt)', 'Error: connection lost']), 'attention');
  assert.equal(detectState(['• Working (12s • esc to interrupt)']), 'working');
});


test('paste boundaries survive every chunk split without treating pasted controls as keys', () => {
  const text = '\x1b[200~hello\r\x1d界\x1b[201~';
  for (let i=1;i<text.length;i++) {
    const parser = new InputParser();
    const events = [...parser.push(text.slice(0,i)),...parser.push(text.slice(i))];
    assert.equal(events[0].type,'paste-start');
    assert.equal(events.at(-1).type,'paste-end');
    assert.equal(events.slice(1,-1).map(e=>e.data).join(''),'hello\r\x1d界');
    assert.ok(events.slice(1,-1).every(e=>e.type==='paste-data'));
    assert.equal(parser.pending,'');
  }
});

test('PTY consumes a fragmented reveal paste and preserves a subsequent live paste', {timeout:10000}, async () => {
  const dir = await mkdtemp(join(tmpdir(),'matrix-paste-'));
  const log=join(dir,'input.log');
  await writeFile(join(dir,'codex'), `#!${process.execPath}
const fs=require('fs');process.stdin.setRawMode(true);process.stdin.resume();
process.stdout.write('Working (esc to interrupt)');
process.stdin.on('data',b=>fs.appendFileSync(${JSON.stringify(log)},b));
`,{mode:0o755});
  const term = new xterm.Terminal({cols:80,rows:24,allowProposedApi:true});
  const child = pty.spawn(process.execPath,[resolve('src/cli.js'),'codex'],{cols:80,rows:24,cwd:process.cwd(),env:{...process.env,PATH:`${dir}:${process.env.PATH}`}});
  child.onData(d=>term.write(d));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  try {
    for(let i=0;i<100 && !screenLines(term).join('\n').includes('codex working');i++)await sleep(20);
    assert.ok(screenLines(term).join('\n').includes('codex working'));
    for(const chunk of ['\x1b[20','0~hidden\r','paste','\x1b[20','1~']) {child.write(chunk);await sleep(60);}
    const {readFile}=await import('node:fs/promises');
    await assert.rejects(readFile(log),{code:'ENOENT'});
    assert.ok(screenLines(term).join('\n').includes('Working (esc to interrupt)'));
    for(const chunk of ['\x1b[200~','hello 界\r','\x1b[201~']) {child.write(chunk);await sleep(30);}
    assert.equal(await readFile(log,'utf8'),'\x1b[200~hello 界\r\x1b[201~');
    const bytes = Buffer.from('界');
    for (const byte of bytes) {child.write(Buffer.from([byte]));await sleep(30);}
    assert.equal(await readFile(log,'utf8'),'\x1b[200~hello 界\r\x1b[201~界');
  } finally {child.kill();term.dispose();await rm(dir,{recursive:true,force:true});}
});


test('Codex startup and background-terminal statuses remain active', () => {
  for (const status of [
    '• Starting MCP servers (2/4): example-tools, example-apps (0s • esc to interrupt)',
    '◦ Working (17s • esc to interrupt) · 1 background terminal running · /ps to view · /stop to close',
  ]) assert.equal(detectState([status,'› Ask Codex to do anything']), 'working');
});


test('approval dialogs above the footer reveal over background work', () => {
  assert.equal(detectState(['* Waiting for 1 background agent to finish', 'Do you want to continue?', ...Array(25).fill(''), '❯']), 'attention');
  assert.equal(detectState(['• Source contains "press enter" in its regex.', '• Working (1s • esc to interrupt)']), 'working');
});

test('fragmented cursor and history keys remain complete sequences', () => {
  const parser = new InputParser();
  assert.deepEqual(parser.push('\x1b[5'),[]);
  assert.deepEqual(parser.push(';2~'),[{type:'text',data:'\x1b[5;2~'}]);
  assert.deepEqual(parser.push('\x1b['),[]);
  assert.deepEqual(parser.push('A'),[{type:'text',data:'\x1b[A'}]);
});


test('closing work after a revealed response stays visible until the next prompt', () => {
  const view = new ViewState();
  view.update('working',0); assert.ok(view.rain);
  view.update('idle',1000); view.tick(1600); assert.equal(view.rain,false);
  view.update('working',2000); assert.equal(view.rain,false);
  view.tick(3500); assert.equal(view.rain,false);
  view.update('idle',4000); view.tick(4600); assert.equal(view.rain,false);
  view.submitted(); view.update('working',5000); assert.ok(view.rain);
  view.reveal(); view.submitted(); view.update('working',6000); assert.equal(view.rain,false);
  view.toggle(); assert.ok(view.rain);
});


test('return transition resolves current output and restores Unicode, colours and cursor', async () => {
  const source = new xterm.Terminal({cols:60,rows:20,allowProposedApi:true});
  const target = new xterm.Terminal({cols:60,rows:20,allowProposedApi:true});
  const rain = new Rain(()=>.5);
  for(let i=0;i<60;i++)rain.frame(60,20,'working');
  await write(source,'\x1b[31mReview complete 界\x1b[0m\r\nAll checks passed.');
  const transition = new ReturnTransition(0);
  await write(target,'\x1b[?7l'+transition.frame(source,rain,400));
  assert.equal(target.buffer.active.baseY,0);
  assert.ok(transition.flicker.active);
  await write(source,'\r\nReady for your next prompt.');
  await write(target,transition.frame(source,rain,850));
  await write(target,transition.frame(source,rain,1400));
  assert.deepEqual(screenLines(target).map(s=>s.trimEnd()),screenLines(source).map(s=>s.trimEnd()));
  assert.equal(target.buffer.active.getLine(0).getCell(0).getFgColor(),1);
  assert.equal(target.buffer.active.cursorY,source.buffer.active.cursorY);
  assert.ok(transition.done(850));
  source.dispose();target.dispose();
});


test('coalesced toggle keys are handled separately outside bracketed paste', () => {
  const parser = new InputParser();
  assert.deepEqual(parser.push('go\x1dnext\x1d'),[
    {type:'text',data:'go'}, {type:'text',data:'\x1d'},
    {type:'text',data:'next'}, {type:'text',data:'\x1d'},
  ]);
  assert.deepEqual(parser.push('\x1b[200~go\x1dnext\x1b[201~'),[
    {type:'paste-start',data:'\x1b[200~'},
    {type:'paste-data',data:'go\x1dnext'},
    {type:'paste-end',data:'\x1b[201~'},
  ]);
});

test('fresh text staggers independently, settles within 500ms and never restarts unchanged text', async () => {
  const source = new xterm.Terminal({cols:40,rows:10,allowProposedApi:true});
  const target = new xterm.Terminal({cols:40,rows:10,allowProposedApi:true});
  let n = 0;
  const flicker = new TextFlicker(() => (++n % 4) / 4);
  try {
    await write(source,'Hello 界\r\n> ');
    await write(target,flicker.frame(source,0,0));
    const count = flicker.animations.size;
    assert.ok(count > 1);
    assert.equal(screenLines(target)[1].trimEnd(),'>');
    await write(target,flicker.frame(source,0,300));
    assert.ok(flicker.animations.size > 0 && flicker.animations.size < count);
    await write(target,flicker.frame(source,0,500));
    assert.equal(flicker.active,false);
    assert.deepEqual(screenLines(target).map(s=>s.trimEnd()),screenLines(source).map(s=>s.trimEnd()));
    flicker.frame(source,0,600);
    assert.equal(flicker.active,false);
    await write(source,'\x1b[1;9Hnew\x1b[2;3H');
    flicker.frame(source,0,700);
    assert.equal(flicker.animations.size,3);
    await write(target,flicker.frame(source,0,720,false));
    assert.equal(flicker.active,false);
    assert.deepEqual(screenLines(target).map(s=>s.trimEnd()),screenLines(source).map(s=>s.trimEnd()));
  } finally { source.dispose(); target.dispose(); }
});
