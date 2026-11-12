---
description: Installs the VS Code extension that shows what Claude is doing
allowed-tools: Bash(code:*), Bash(cmd:*)
---

Install the bot_tv VS Code extension that ships inside this plugin. Run exactly this command:

```bash
code --install-extension "${CLAUDE_PLUGIN_ROOT}/bot-tv.vsix" --force
```

If `code` isn't found (on Windows it's a `.cmd`), retry as `cmd /c code --install-extension "${CLAUDE_PLUGIN_ROOT}/bot-tv.vsix" --force`. If that fails too, show the user the command so they can run it by hand.

When it works, tell the user in one short line, in the language they write in: reload the VS Code window (Developer: Reload Window) and click the TV icon in the activity bar on the left. Don't do anything else.
