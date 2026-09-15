# Matrix CLI

**`text-flicker` experiment:** fresh output resolves from random green Matrix characters, with independent timing per character over roughly half a second. Returning from rain uses the same effect. Prompts and approval dialogs remain immediately readable.

Matrix-style code rain for **Codex CLI** and **Claude Code**. Dim background streams and brighter, faster foreground trails add depth while your agent works. The visible text falls into the rain when you switch views. Returning to the CLI reveals its text through a brief flicker of green Matrix characters.

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

## Development

```sh
npm ci
npm test
npm run check
```

Tests use simulated agents and need no credentials. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[Apache 2.0](LICENSE). Free and open source. Independent of OpenAI, Anthropic and the owners of The Matrix; no film assets are included.
