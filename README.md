<p align="center">
  <img src="assets/logo.svg" width="128" alt="bot_tv logo: a little TV robot with T_T eyes">
</p>

<h1 align="center">bot_tv</h1>

<p align="center"><i>your agent is coding. put it on tv.</i></p>

---

You ask Claude Code for something and it goes off and greps twelve files, reads half of them, runs a few shell commands, edits three things and tells you it's done. You get a wall of tool calls in a terminal.

bot_tv turns that into a channel you can actually watch. Leave VS Code open next to the terminal and the editor follows the agent around: it jumps to the lines Claude is reading, highlights what a search found, shows the diff the moment an edit lands. A side panel runs the whole broadcast: what you asked, what the agent says between steps, its todo list, each command and its output, and every result you can click.

Think of it as pair programming where you're the one looking over the shoulder.

## what you see

- the file Claude reads opens at the exact lines it read
- searches (`Grep`, `Glob`, and plain `grep`/`rg`/`sed`/`head`/`cat` in Bash) jump to the first hit and light up the rest, and it follows the `cd` inside the command
- edits open as a before → after diff with the new code selected
- the feed: your prompt, the agent's messages, the plan with the current item, commands with their output, subagents, failures, "done"
- steps are paced (700 ms by default) so it reads like a replay and not a strobe light
- click the status bar item or the panel button to pause it

If the agent's tool fails, you see that it failed. No fake diffs.

## install

You need two pieces: the Claude Code plugin (sends the events) and the VS Code extension (shows them).

**1. the plugin.** At a Claude Code prompt:

```
/plugin install bot-tv --marketplace chillrod/bot-tv
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install bot-tv --marketplace chillrod/bot-tv
```

**2. the extension.** In Claude Code, run:

```
/bot-tv-vscode
```

It installs `bot-tv.vsix` (which ships with the plugin) through the `code` CLI. Or do it by hand with `code --install-extension bot-tv.vsix`. Reload VS Code and click the little TV in the activity bar.

Best setup: Claude Code in a terminal **outside** VS Code. Diffs and jumps grab the editor focus, and you don't want that in the window where you're typing.

## how it works

```
Claude Code ── plugin (hooks/register.ts) ── POST 127.0.0.1:7337 ──▶ VS Code extension ──▶ editor + panel
```

The plugin is a Claude Code hooks module. It listens to prompts, the agent's text, every tool call (before and after it runs) and the end of each turn, and posts them to localhost. Before an edit runs, the extension takes a snapshot of the file so it can show you a real diff afterwards.

Nothing leaves your machine. If VS Code isn't open, the plugin shrugs and Claude keeps working like nothing happened.

## dev

```
npm test          # extension parsing checks + plugin tests (needs the claude CLI)
npm run package   # rebuilds bot-tv.vsix
```

To hack on the extension: `code --extensionDevelopmentPath=./extension <some project>`. To hack on the plugin: `claude --plugin-dir .`.

`GET http://127.0.0.1:7337/status` tells you what the extension last showed (handy when you can't see the screen).

## rough edges

- one VS Code window at a time owns the port, the second one shows "porta ocupada"
- several Claude sessions at once all land in the same feed
- the agent's internal thinking doesn't show up: Claude Code doesn't hand it over, only what the agent writes
- the plugin uses the new hooks-module API (Claude Code 2.1.275+), which is still early access
- the UI speaks Portuguese for now. PRs for i18n welcome
- Claude Code only. A Codex adapter would just need to post the same events

## license

MIT
