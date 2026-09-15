#!/usr/bin/env node
import { runSession } from './session.js';
const [command, ...args] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  console.log(`Matrix CLI — code rain for coding agents

Usage:
  matrix codex [codex arguments...]
  matrix claude [claude arguments...]
  matrix --demo

Controls:
  Ctrl+]                 Toggle rain / live terminal
  Any key during rain    Reveal terminal (key consumed; Ctrl+C also interrupts)
  Shift+PageUp/PageDown   Browse retained terminal history

Requires Node.js 22+ and the chosen CLI installed on PATH.
Automatic mode follows visible interrupt indicators; unknown states stay visible.`);
} else if (command === '--version') console.log('0.1.0');
else if (!['codex', 'claude', '--demo'].includes(command)) {
  console.error(`Unknown agent: ${command}. Use matrix codex or matrix claude.`); process.exitCode = 2;
} else {
  try { process.exitCode = await runSession(command, args, { demo: command === '--demo' }); }
  catch (error) { console.error(`matrix: ${error.message}`); process.exitCode = 1; }
}
