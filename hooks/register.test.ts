import { expect, test } from 'claude-code/testing'

// Each hook here stands in for the engine beneath the plugin.
function engine(on: Parameters<Parameters<typeof test>[1]>[1], sent: Record<string, unknown>[]) {
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('http.fetch', (_, e) => {
    sent.push(JSON.parse(String(e.init?.body)))
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } }
  })
}

test('a tool call is sent before it runs and again with its result', async ($, on) => {
  const sent: Record<string, unknown>[] = []
  engine(on, sent)
  on('tool.call', () => ({ result: { stdout: 'a.ts:3:x' }, text: 'a.ts:3:x' }))

  await $.tool.call({ tool: 'Bash', command: 'grep -n x a.ts' })

  expect(sent.map((s) => s.hook_event_name)).toEqual(['PreToolUse', 'PostToolUse'])
  expect(sent[0]).toMatchObject({ tool_name: 'Bash', tool_input: { command: 'grep -n x a.ts' }, session_id: 'sess-1', cwd: '/repo' })
  expect(sent[1]).toMatchObject({ tool_response: { stdout: 'a.ts:3:x' }, tool_text: 'a.ts:3:x' })
})

test('a tool that fails is reported as failed, so the viewer shows no fake diff', async ($, on) => {
  const sent: Record<string, unknown>[] = []
  engine(on, sent)
  on('tool.call', () => ({ result: 'String not found', text: 'String not found', isError: true }))

  await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b' })

  expect(sent[1]).toMatchObject({ hook_event_name: 'PostToolUse', isError: true })
})

test('with VS Code closed the tool still runs and returns its result', async ($, on) => {
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('http.fetch', () => { throw new Error('connect ECONNREFUSED 127.0.0.1:7337') })
  on('tool.call', () => ({ result: { stdout: 'ok' }, text: 'ok' }))

  const r = await $.tool.call({ tool: 'Bash', command: 'echo ok' })

  expect(r.text).toBe('ok')
})
