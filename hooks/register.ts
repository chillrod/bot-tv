import type { EngineInterface, Register } from 'claude-code'

// Porta padrão da extensão bot_tv no VS Code (configuração botTv.port).
// shortcut: porta fixa; se alguém mudar botTv.port, virar userConfig do plugin
const EVENT_URL = 'http://127.0.0.1:7337/event'

let sessionId: string | undefined

// Envia um passo para a extensão. VS Code fechado ou extensão ausente: segue sem acompanhar, nunca atrapalha o Claude.
async function send($: EngineInterface, ev: Record<string, unknown>) {
  try {
    sessionId ??= await $.session.id()
    await $.http.fetch(EVENT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...ev, session_id: sessionId, cwd: await $.session.cwd() }),
    })
  } catch {
    // sem extensão ouvindo
  }
}

const COMMAND = 'bot-tv-vscode'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Instala no VS Code a extensão que mostra os passos do Claude' })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const vsix = `${$.plugin.root}/bot-tv.vsix`
    // No Windows o `code` é um .cmd, que só roda por um shell: tenta direto e depois pelo cmd.
    for (const argv of [['code', '--install-extension', vsix, '--force'], ['cmd', '/c', 'code', '--install-extension', vsix, '--force']]) {
      try {
        const r = await $.process.run(argv, { timeoutMs: 120_000 })
        if (r.exitCode === 0) return { text: 'Extensão bot_tv instalada. Recarregue a janela do VS Code (Developer: Reload Window) e abra o ícone de olho na barra lateral.' }
      } catch {
        // `code` não encontrado por esse caminho: tenta o próximo
      }
    }
    return { text: `Não consegui rodar o comando \`code\`. Instale à mão: code --install-extension "${vsix}"` }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta) await send($, { hook_event_name: 'UserPromptSubmit', prompt: e.text })
    return next(e)
  })

  // Texto que a IA escreve entre os passos: chega aqui antes do tool.call que ele anuncia.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    for (const b of e.message.content) {
      if (b.type === 'text' && b.text.trim()) await send($, { hook_event_name: 'AssistantText', text: b.text, agentId: e.agentId })
      if (b.type === 'thinking' && b.thinking.trim()) await send($, { hook_event_name: 'AssistantThinking', text: b.thinking, agentId: e.agentId })
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const { tool, tool_use_id, agentId, consent: _consent, requestMeta: _meta, ...input } = e
    const base = { tool_name: tool, tool_use_id, tool_input: input, agentId }
    // Antes de rodar: a extensão fotografa o arquivo que vai ser editado (lado esquerdo do diff).
    await send($, { ...base, hook_event_name: 'PreToolUse' })
    const r = await next(e)
    if (r.deny === undefined) await send($, { ...base, hook_event_name: 'PostToolUse', tool_response: r.result, tool_text: r.text, isError: r.isError })
    return r
  })

  on('turn.complete', async ($, e, next) => {
    await send($, { hook_event_name: e.agentId ? 'SubagentStop' : 'Stop', reason: e.reason, agentId: e.agentId })
    return next(e)
  })
}
