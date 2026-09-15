// Wrapper flags may appear before or after the agent. After --, arguments are literal.
export function parseOptions(argv) {
  const options = { rain: true, textFlicker: true };
  const positional = [];
  let literal = false;
  for (const arg of argv) {
    if (literal) positional.push(arg);
    else if (arg === '--') { literal = true; positional.push(arg); }
    else if (arg === '--no-rain') options.rain = false;
    else if (arg === '--no-text-flicker') options.textFlicker = false;
    else positional.push(arg);
  }
  const [command, ...args] = positional;
  return { command, args, options };
}
