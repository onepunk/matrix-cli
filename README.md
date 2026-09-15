# Matrix CLI

Matrix-style code rain for **Codex CLI** and **Claude Code**. Dim background streams and brighter, faster foreground trails add depth while your agent works. The visible text falls into the rain when you switch views. Returning to the CLI clears the rain in staggered columns as its text resolves back into place.

## Install

Requires **Node.js 22+**, npm, and either `codex` or `claude` on your PATH.

```sh
git clone https://github.com/onepunk/matrix-cli.git
cd matrix-cli
npm ci
npm link
```

Then launch from your project's directory:

```sh
matrix codex
matrix claude
matrix --demo
```

Arguments pass through to the selected CLI, for example `matrix claude --continue` or `matrix codex resume --last`. Uses your existing agent configuration and account; no wrapper account or telemetry. Agent usage charges still apply.

## Controls

| Key | Action |
| --- | --- |
| `Ctrl+]` | Toggle rain / live screen |
| Any key during rain | Reveal the screen; that key is consumed |
| `Ctrl+C` | Reveal and interrupt the agent |
| `Shift+PageUp` / `Shift+PageDown` | Browse retained terminal history |
| `q` in demo | Exit |

Manual reveal stays visible until you press `Ctrl+]` again. After a response appears automatically, closing activity cannot restart the rain; submitting your next prompt re-enables automatic rain.

## Status

**Alpha.** Tested locally on macOS; CI targets macOS and Linux. Windows is not validated. Automatic animation detects visible working indicators, so CLI updates can affect detection. Questions and errors take precedence when recognized; press any key to reveal immediately.

Text, colours and Unicode are supported. Mouse reporting, terminal graphics, hyperlinks and some advanced keyboard features are not. History is held in memory for the session; the last screen is printed when the agent exits. Native dependency builds may require compiler tools.

## Development

```sh
npm ci
npm test
npm run check
```

Tests use simulated agents and need no credentials. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[Apache 2.0](LICENSE). Free and open source. Independent of OpenAI, Anthropic and the owners of The Matrix; no film assets are included.
