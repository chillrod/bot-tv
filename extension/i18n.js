// Textos do bot_tv por idioma. Chave nova: pôr nos dois idiomas.
const STR = {
  en: {
    you: 'You', ai: 'AI', reasoning: 'Reasoning',
    thinking: 'thinking', waiting: 'waiting for you', waitingTitle: 'Waiting for you',
    done: 'done', doneTitle: 'Done', interrupted: 'interrupted', interruptedTitle: 'Interrupted', errorTitle: 'Stopped with an error',
    subagentDone: 'Subagent done', subagentWorking: 'subagent working', subagent: 'Subagent',
    reading: (f) => `reading ${f}`, lines: (a, b) => `lines ${a}–${b}`,
    searching: (p) => `searching ${p}`, listing: (p) => `listing ${p}`, files: 'files',
    runningCommand: 'running a command', command: 'Command', output: 'Output', moreLines: (n) => `… +${n} lines`,
    results: (n) => `${n} result${n > 1 ? 's' : ''}`,
    planUpdated: 'Plan updated', now: (c) => `Now: ${c}`,
    webSearch: 'searching the web', readingPage: 'reading a page',
    editing: (f) => `editing ${f}`, edited: (f) => `edited ${f}`, fileWritten: 'file written', diffTitle: (b) => `${b} ← AI`,
    failed: (t) => `${t} failed`,
    paused: 'paused', tooltip: 'bot_tv — click to pause/resume', portBusy: 'port in use',
    xpTip: (l, worked, left) => `lv ${l} · ${worked} of agent work · ${left} to lv ${l + 1}`,
    ui: {
      labels: { prompt: 'you', text: 'ai', thinking: 'thinking', read: 'reading', search: 'searching', hits: 'found', bash: 'command', output: 'output', edit: 'edited', plan: 'plan', agent: 'subagent', web: 'web', wait: 'waiting', fail: 'failed', stop: 'end', tool: 'tool' },
      empty: 'nothing on air yet. run Claude Code with the bot-tv plugin.',
      pause: 'Pause', resume: 'Resume',
      flow: 'flow…', flowTip: 'follow every project', levelUp: 'level up!',
    },
  },
  pt: {
    you: 'Você', ai: 'IA', reasoning: 'Raciocínio',
    thinking: 'pensando', waiting: 'esperando você', waitingTitle: 'Esperando você',
    done: 'terminou', doneTitle: 'Terminou', interrupted: 'interrompido', interruptedTitle: 'Interrompido', errorTitle: 'Parou com erro',
    subagentDone: 'Subagente terminou', subagentWorking: 'subagente trabalhando', subagent: 'Subagente',
    reading: (f) => `lendo ${f}`, lines: (a, b) => `linhas ${a}–${b}`,
    searching: (p) => `buscando ${p}`, listing: (p) => `listando ${p}`, files: 'arquivos',
    runningCommand: 'rodando comando', command: 'Comando', output: 'Saída', moreLines: (n) => `… +${n} linhas`,
    results: (n) => `${n} resultado${n > 1 ? 's' : ''}`,
    planUpdated: 'Plano atualizado', now: (c) => `Agora: ${c}`,
    webSearch: 'pesquisando na web', readingPage: 'lendo página',
    editing: (f) => `editando ${f}`, edited: (f) => `editou ${f}`, fileWritten: 'arquivo escrito', diffTitle: (b) => `${b} ← IA`,
    failed: (t) => `${t} falhou`,
    paused: 'pausado', tooltip: 'bot_tv — clique para pausar/retomar', portBusy: 'porta ocupada',
    xpTip: (l, worked, left) => `lv ${l} · ${worked} de IA trabalhando · faltam ${left} pro lv ${l + 1}`,
    ui: {
      labels: { prompt: 'você', text: 'ia', thinking: 'raciocínio', read: 'lendo', search: 'buscando', hits: 'achou', bash: 'comando', output: 'saída', edit: 'editou', plan: 'plano', agent: 'subagente', web: 'web', wait: 'esperando', fail: 'falhou', stop: 'fim', tool: 'ferramenta' },
      empty: 'nada no ar ainda. rode o Claude Code com o plugin bot-tv.',
      pause: 'Pausar', resume: 'Retomar',
      flow: 'flow…', flowTip: 'seguir todos os projetos', levelUp: 'subiu de nível!',
    },
  },
};

// setting: "auto" | "en" | "pt-BR"; auto = idioma do VS Code, que por padrão segue o do sistema
function pick(setting, vscodeLanguage) {
  const l = setting && setting !== 'auto' ? setting : vscodeLanguage || 'en';
  return STR[l.toLowerCase().startsWith('pt') ? 'pt' : 'en'];
}

module.exports = { pick, STR };
