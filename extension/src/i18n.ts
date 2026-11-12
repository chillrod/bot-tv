// Textos do bot_tv por idioma. O tipo vem do inglês: uma chave que faltar no português não compila.
const en = {
  you: 'You', ai: 'AI', reasoning: 'Reasoning',
  thinking: 'thinking', waiting: 'waiting for you', waitingTitle: 'Waiting for you',
  done: 'done', doneTitle: 'Done', interrupted: 'interrupted', interruptedTitle: 'Interrupted', errorTitle: 'Stopped with an error',
  subagentDone: 'Subagent done', subagentWorking: 'subagent working', subagent: 'Subagent',
  reading: (f: string) => `reading ${f}`, lines: (a: number, b: number) => `lines ${a}–${b}`,
  searching: (p: string) => `searching ${p}`, listing: (p: string) => `listing ${p}`, files: 'files',
  runningCommand: 'running a command', command: 'Command', output: 'Output', moreLines: (n: number) => `… +${n} lines`,
  results: (n: number) => `${n} result${n > 1 ? 's' : ''}`,
  planUpdated: 'Plan updated', now: (c: string) => `Now: ${c}`,
  webSearch: 'searching the web', readingPage: 'reading a page',
  editing: (f: string) => `editing ${f}`, edited: (f: string) => `edited ${f}`, fileWritten: 'file written', diffTitle: (b: string) => `${b} ← AI`, byCommand: 'changed by a command',
  failed: (t: string) => `${t} failed`,
  paused: 'paused', tooltip: 'bot_tv — click to pause/resume', portBusy: 'port in use',
  xpTip: (l: number, xp: string, next: string, worked: string) => `lv ${l} · ${xp} / ${next} xp · ${worked} of agent work`,
  outdated: (v: string) => `plugin v${v} is newer`, outdatedTip: (v: string) => `The plugin is v${v} but this extension is older. Run /bot-tv:bot-tv-vscode in Claude Code, then reload VS Code.`,
  updated: (v: string) => `updated to v${v}`, updatedTip: (v: string) => `bot_tv v${v}: the arcade is now an endless gothic castle climb: generated castles, stairs, shafts and lifts, a boss per area and the lord of the castle at the top. Click to dismiss.`,
  // vai para o webview: só texto, nada de função
  ui: {
    lang: 'en',
    labels: { prompt: 'you', text: 'ai', thinking: 'thinking', read: 'reading', search: 'searching', hits: 'found', bash: 'command', output: 'output', edit: 'edited', plan: 'plan', agent: 'subagent', web: 'web', wait: 'waiting', fail: 'failed', stop: 'end', tool: 'tool' },
    empty: 'nothing on air yet. run Claude Code with the bot-tv plugin.',
    pause: 'Pause', resume: 'Resume', lines: 'lines',
    flow: 'all', flowTip: 'follow every project', levelUp: 'level up!',
    ws: { title: 'LOCAL FORECAST', now: 'Now', back: 'click to go back to the feed', kinds: { clear: 'CLEAR', rain: 'RAIN', snow: 'SNOW', night: 'CLEAR NIGHT', storm: 'STORM' } },
  },
};

export type Strings = typeof en;

const pt: Strings = {
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
  editing: (f) => `editando ${f}`, edited: (f) => `editou ${f}`, fileWritten: 'arquivo escrito', diffTitle: (b) => `${b} ← IA`, byCommand: 'alterado por comando',
  failed: (t) => `${t} falhou`,
  paused: 'pausado', tooltip: 'bot_tv — clique para pausar/retomar', portBusy: 'porta ocupada',
  xpTip: (l, xp, next, worked) => `lv ${l} · ${xp} / ${next} xp · ${worked} de IA trabalhando`,
  outdated: (v) => `plugin v${v} é mais novo`, outdatedTip: (v) => `O plugin está na v${v} e esta extensão é mais antiga. Rode /bot-tv:bot-tv-vscode no Claude Code e recarregue o VS Code.`,
  updated: (v) => `atualizado para v${v}`, updatedTip: (v) => `bot_tv v${v}: o jogo agora é uma subida sem fim por castelos góticos: castelos gerados na hora, escadarias, poços e elevadores, um chefe por área e o senhor do castelo no topo. Clique para fechar.`,
  ui: {
    lang: 'pt',
    labels: { prompt: 'você', text: 'ia', thinking: 'raciocínio', read: 'lendo', search: 'buscando', hits: 'achou', bash: 'comando', output: 'saída', edit: 'editou', plan: 'plano', agent: 'subagente', web: 'web', wait: 'esperando', fail: 'falhou', stop: 'fim', tool: 'ferramenta' },
    empty: 'nada no ar ainda. rode o Claude Code com o plugin bot-tv.',
    pause: 'Pausar', resume: 'Retomar', lines: 'linhas',
    flow: 'todos', flowTip: 'seguir todos os projetos', levelUp: 'subiu de nível!',
    ws: { title: 'PREVISÃO LOCAL', now: 'Agora', back: 'clique para voltar ao feed', kinds: { clear: 'CÉU LIMPO', rain: 'CHUVA', snow: 'NEVE', night: 'NOITE CLARA', storm: 'TEMPESTADE' } },
  },
};

export const STR = { en, pt };

// setting: "auto" | "en" | "pt-BR"; auto = idioma do VS Code, que por padrão segue o do sistema
export function pick(setting: string | undefined, vscodeLanguage: string | undefined): Strings {
  const l = setting && setting !== 'auto' ? setting : vscodeLanguage || 'en';
  return STR[l.toLowerCase().startsWith('pt') ? 'pt' : 'en'];
}
