// bot_tv: recebe os hooks do Claude Code via HTTP local e mostra o trajeto da IA:
// um feed no painel lateral (falas, plano, comandos, resultados) e o editor acompanhando (leituras, achados, diffs).
const vscode = require('vscode');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pick } = require('./i18n');
const { levelOf, fmtDuration } = require('./level');

const T = () => pick(vscode.workspace.getConfiguration('botTv').get('language'), vscode.env.language);

const EDITS = new Set(['Edit', 'Write', 'MultiEdit']);
const MAX_BODY = 50 * 1024 * 1024; // Write pode mandar arquivo grande; acima disso descarta
const MAX_SNAPSHOTS = 100;
const MAX_FEED = 400;     // itens guardados no feed (o webview corta no mesmo limite)
const MAX_HITS = 200;     // resultados de busca listados por passo
const MAX_SCAN = 3000;    // linhas de saída examinadas atrás de arquivo:linha
const OUTPUT_LINES = 30;  // linhas de saída de comando mostradas no feed

const before = new Map();      // id do tool_use -> conteúdo do arquivo antes da edição
const queue = [];
const feed = [];
let paused = false, busy = false, state = '', todos = [], nextId = 1, viewShown = false;
let agent = false; // o passo sendo mostrado veio de um subagente
let out, status, hl, face, view, extUri, store, wsState;

// Abas: "flow" segue tudo; senão, só o projeto (cwd da sessão) escolhido mexe no editor e na legenda.
const projects = new Map(); // chave do projeto -> nome da pasta
let following = 'flow';
let cur = { project: '', name: '' }; // projeto do passo sendo mostrado
let followed = true;                  // o passo sendo mostrado é da aba seguida

// Nível: tempo de IA trabalhando (do prompt ao Stop), somado entre sessões e guardado no VS Code.
const GAP_CAP_S = 120;    // intervalo máximo contado entre dois eventos de um turno: sessão largada aberta não vira XP
const XP_SAVE_MS = 30_000; // de quanto em quanto tempo grava o XP enquanto a IA trabalha
const turns = new Map();   // session_id -> hora do último evento com turno aberto
let xpSeconds = 0, lastSave = 0;

const skin = () => vscode.workspace.getConfiguration('botTv').get('skin');

// Destaque das linhas que a IA está lendo/achou. No skin vaporwave: neon rosa com brilho.
function makeHighlight() {
  if (skin() === 'vscode') {
    return vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'), isWholeLine: true });
  }
  return vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: 'rgba(255, 79, 216, 0.10)',
    borderColor: '#ff4fd8',
    borderStyle: 'solid',
    borderWidth: '0 0 0 2px',
    overviewRulerColor: '#ff4fd8',
    overviewRulerLane: vscode.OverviewRulerLane.Center,
    // shortcut: o brilho entra pelo CSS de textDecoration (truque aceito pela API de decorações); se o VS Code passar a filtrar, sobra o fundo e a borda
    textDecoration: 'none; text-shadow: 0 0 6px rgba(255, 79, 216, 0.85)',
  });
}

function activate(ctx) {
  extUri = ctx.extensionUri;
  store = ctx.globalState;
  wsState = ctx.workspaceState;
  xpSeconds = store.get('botTv.xpSeconds', 0);
  following = wsState.get('botTv.following', 'flow');
  out = vscode.window.createOutputChannel('bot_tv');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'botTv.toggle';
  hl = makeHighlight();
  face = vscode.window.createTextEditorDecorationType({
    gutterIconPath: vscode.Uri.joinPath(extUri, 'media', 'gutter.svg'),
    gutterIconSize: 'contain',
  });
  ctx.subscriptions.push(
    out, status, face, { dispose: () => hl.dispose() },
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('botTv.skin')) {
        hl.dispose();
        hl = makeHighlight();
        post({ type: 'skin', skin: skin() });
      }
      if (e.affectsConfiguration('botTv.language')) { setState(''); post({ type: 'ui', ui: T().ui }); }
    }),
    vscode.workspace.registerTextDocumentContentProvider('bottv-before', {
      provideTextDocumentContent: (uri) => before.get(uri.query) ?? '',
    }),
    vscode.commands.registerCommand('botTv.toggle', toggle),
    vscode.window.registerWebviewViewProvider('botTv.feed', { resolveWebviewView }, { webviewOptions: { retainContextWhenHidden: true } }),
  );

  const port = vscode.workspace.getConfiguration('botTv').get('port');
  const server = http.createServer(handle);
  // shortcut: só uma janela do VS Code escuta a porta; para várias janelas, rotear pelo cwd do evento
  server.on('error', (e) => { out.appendLine(`servidor não subiu na porta ${port}: ${e.message}`); setState(T().portBusy); });
  server.listen(port, '127.0.0.1', () => out.appendLine(`ouvindo em 127.0.0.1:${port}`));
  ctx.subscriptions.push({ dispose: () => server.close() });
  setState(state);
}

// ---------- painel ----------

function resolveWebviewView(v) {
  view = v;
  const media = vscode.Uri.joinPath(extUri, 'media');
  v.webview.options = { enableScripts: true, localResourceRoots: [media] };
  const nonce = crypto.randomBytes(16).toString('hex');
  v.webview.html = fs.readFileSync(path.join(extUri.fsPath, 'media', 'feed.html'), 'utf8')
    .replace(/%NONCE%/g, nonce)
    .replace(/%CSP%/g, v.webview.cspSource)
    .replace(/%FONT%/g, v.webview.asWebviewUri(vscode.Uri.joinPath(media, 'fonts', 'roboto-mono-latin-wght-normal.woff2')).toString());
  v.webview.onDidReceiveMessage((m) => {
    if (m.type === 'ready') post({ type: 'init', feed, todos, paused, state, skin: skin(), ui: T().ui, following, projects: projectList(), xp: xpInfo() });
    if (m.type === 'toggle') toggle();
    if (m.type === 'follow') {
      following = m.project;
      wsState.update('botTv.following', following);
      post({ type: 'following', following });
    }
    if (m.type === 'open') reveal(m.file, m.line, 1).catch((e) => out.appendLine(`erro ao abrir: ${e.message}`));
  });
  v.onDidDispose(() => { view = null; });
}

function post(msg) { view?.webview.postMessage(msg); }

function addFeed(item) {
  if (agent) item.agent = true;
  item.project = cur.project;
  item.projectName = cur.name;
  item.id = nextId++;
  item.ts = Date.now();
  feed.push(item);
  if (feed.length > MAX_FEED) feed.shift();
  out.appendLine(`${new Date(item.ts).toLocaleTimeString()} [${item.kind}] ${item.title || ''}`);
  post({ type: 'add', item });
}

function setState(text) {
  if (!followed) return; // passo de outro projeto: a legenda fica com a aba seguida
  state = text;
  status.text = paused ? `$(debug-pause) bot_tv: ${T().paused}` : `$(device-camera-video) bot_tv${text ? `: ${text}` : ''}`;
  status.tooltip = T().tooltip;
  status.show();
  post({ type: 'state', state });
}

// ---------- projetos e nível ----------

function projectOf(ev) {
  if (!ev.cwd) return '';
  const p = path.resolve(ev.cwd);
  const key = process.platform === 'win32' ? p.toLowerCase() : p; // mesma pasta, mesma aba, com qualquer caixa
  if (!projects.has(key)) {
    projects.set(key, path.basename(p) || p);
    post({ type: 'projects', projects: projectList() });
  }
  return key;
}

const projectList = () => [...projects].map(([key, name]) => ({ key, name }));

function xpInfo() {
  const i = levelOf(xpSeconds);
  return { level: i.level, progress: i.progress, tip: T().xpTip(i.level, fmtDuration(xpSeconds), fmtDuration(i.toNext)) };
}

function trackXp(ev) {
  const id = ev.session_id || 'default', now = Date.now();
  const last = turns.get(id);
  if (last !== undefined) addXp(Math.min((now - last) / 1000, GAP_CAP_S));
  if (ev.hook_event_name === 'Stop') { turns.delete(id); saveXp(); } else turns.set(id, now);
}

function addXp(s) {
  const was = levelOf(xpSeconds).level;
  xpSeconds += s;
  const info = xpInfo();
  if (info.level > was) { post({ type: 'levelup', level: info.level }); out.appendLine(`level up: ${info.level}`); }
  post({ type: 'xp', xp: info });
  if (Date.now() - lastSave > XP_SAVE_MS) saveXp();
}

function saveXp() {
  lastSave = Date.now();
  store?.update('botTv.xpSeconds', xpSeconds);
}

function toggle() {
  paused = !paused;
  setState(state);
  post({ type: 'paused', paused });
  if (!paused) drain();
}

// ---------- entrada ----------

function handle(req, res) {
  const reply = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (req.method === 'GET' && req.url === '/status') {
    const ed = vscode.window.activeTextEditor;
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    return reply(200, {
      workspace: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
      paused, state, queued: queue.length, viewOpen: !!view, todos, following, projects: projectList(), xp: xpInfo(),
      recent: feed.slice(-15).map((f) => `${f.kind}: ${f.title || ''}${f.hits ? ` [${f.hits.length} hits]` : ''}`),
      activeTab: tab instanceof vscode.TabInputTextDiff ? { diff: tab.original.toString(), modified: tab.modified.toString() } : tab?.uri?.toString() ?? null,
      activeFile: ed?.document.uri.toString() ?? null,
      visibleLines: ed ? ed.visibleRanges.map((r) => [r.start.line + 1, r.end.line + 1]) : [],
    });
  }
  if (req.method !== 'POST' || req.url !== '/event') return reply(404, { error: 'not found' });

  let body = '', size = 0;
  req.on('data', (d) => { size += d.length; if (size <= MAX_BODY) body += d; });
  req.on('end', () => {
    if (size > MAX_BODY) return reply(413, { error: 'evento grande demais' });
    let ev;
    try { ev = JSON.parse(body); } catch { return reply(400, { error: 'json inválido' }); }
    // A foto do "antes" tem que sair agora: o hook Pre segura o Claude até esta resposta.
    if (ev.hook_event_name === 'PreToolUse' && EDITS.has(ev.tool_name)) snapshot(ev);
    trackXp(ev); // na chegada, não na fila: o tempo é o da IA, não o do replay
    queue.push({ ev, project: projectOf(ev) });
    reply(200, { ok: true });
    if (!viewShown && !view) { viewShown = true; vscode.commands.executeCommand('botTv.feed.focus'); }
    drain();
  });
}

function snapshot(ev) {
  const file = fileOf(ev);
  if (!file) return;
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* arquivo novo: antes = vazio */ }
  before.set(keyOf(ev), text);
  while (before.size > MAX_SNAPSHOTS) before.delete(before.keys().next().value);
}

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length && !paused) {
    const job = queue.shift();
    let visual = false;
    agent = !!job.ev.agentId;
    cur = { project: job.project, name: projects.get(job.project) || '' };
    followed = following === 'flow' || following === job.project;
    try { visual = await show(job.ev); } catch (e) { out.appendLine(`  erro ao mostrar: ${e.message}`); }
    followed = true;
    cur = { project: '', name: '' };
    if (visual) await new Promise((r) => setTimeout(r, vscode.workspace.getConfiguration('botTv').get('stepMs')));
  }
  busy = false;
}

// ---------- o que cada evento mostra (retorna true quando mexeu no editor) ----------

async function show(ev) {
  const s = T();
  switch (ev.hook_event_name) {
    case 'UserPromptSubmit': setState(s.thinking); addFeed({ kind: 'prompt', title: s.you, body: ev.prompt }); return false;
    case 'AssistantText': addFeed({ kind: 'text', title: s.ai, body: ev.text?.trim() }); return false;
    case 'AssistantThinking': addFeed({ kind: 'thinking', title: s.reasoning, body: ev.text?.trim() }); return false;
    case 'Notification': setState(s.waiting); addFeed({ kind: 'wait', title: ev.message || s.waitingTitle }); return false;
    case 'Stop': {
      const cut = ev.reason === 'aborted' || ev.reason === 'error';
      setState(cut ? s.interrupted : s.done);
      addFeed({ kind: cut ? 'fail' : 'stop', end: true, title: ev.reason === 'aborted' ? s.interruptedTitle : ev.reason === 'error' ? s.errorTitle : s.doneTitle });
      return false;
    }
    case 'SubagentStop': addFeed({ kind: 'stop', title: s.subagentDone }); return false;
    case 'PreToolUse': return pre(ev, ev.tool_name, ev.tool_input || {});
    case 'PostToolUse': return after(ev, ev.tool_name, ev.tool_input || {});
  }
  return false;
}

async function pre(ev, t, i) {
  const s = T();
  const file = fileOf(ev);
  if (EDITS.has(t)) { setState(s.editing(rel(file))); return false; } // o diff sai no Post
  if (t === 'Read' && file) {
    setState(s.reading(rel(file)));
    addFeed({ kind: 'read', title: rel(file), sub: i.offset || i.limit ? s.lines(i.offset || 1, (i.offset || 1) + (i.limit || 0) - 1) : '', file, line: i.offset || 1 });
    return reveal(file, i.offset, i.limit);
  }
  if (t === 'Grep') {
    setState(s.searching(i.pattern));
    addFeed({ kind: 'search', title: i.pattern, sub: [i.path && rel(resolvePath(ev.cwd, i.path)), i.glob].filter(Boolean).join(' · ') });
    return false;
  }
  if (t === 'Glob') { setState(s.listing(i.pattern)); addFeed({ kind: 'search', title: i.pattern, sub: s.files }); return false; }
  if (t === 'Bash') {
    const cwd = bashCwd(ev);
    const r = readTarget(i.command || '', cwd);
    setState(i.description || s.runningCommand);
    addFeed({ kind: 'bash', title: i.description || s.command, body: i.command, code: true, file: r?.file, line: r?.start || 1 });
    return r ? reveal(r.file, r.start, r.count) : false;
  }
  if (t === 'TodoWrite') {
    todos = (i.todos || []).map((x) => ({ content: x.content, status: x.status }));
    post({ type: 'todos', todos });
    const cur = todos.find((x) => x.status === 'in_progress');
    addFeed({ kind: 'plan', title: cur ? s.now(cur.content) : s.planUpdated });
    return false;
  }
  if (t === 'Task' || t === 'Agent') { setState(s.subagentWorking); addFeed({ kind: 'agent', title: i.description || s.subagent, body: i.prompt }); return false; }
  if (t === 'WebSearch') { setState(s.webSearch); addFeed({ kind: 'web', title: i.query }); return false; }
  if (t === 'WebFetch') { setState(s.readingPage); addFeed({ kind: 'web', title: i.url, sub: i.prompt }); return false; }
  addFeed({ kind: 'tool', title: t });
  return false;
}

async function after(ev, t, i) {
  const s = T();
  const file = fileOf(ev);
  if (ev.isError) { // a ferramenta rodou e falhou: nada mudou, então nada de diff nem de "achou"
    const msg = (responseText(ev.tool_response) || ev.tool_text || '').split(/\r?\n/).slice(0, OUTPUT_LINES).join('\n');
    setState(s.failed(t));
    addFeed({ kind: 'fail', title: `${s.failed(t)}${file ? ` · ${rel(file)}` : ''}`, body: msg, code: true });
    return false;
  }
  if (EDITS.has(t) && file) return diff(ev, file);
  if (t !== 'Bash' && t !== 'Grep' && t !== 'Glob') return false;

  const cwd = t === 'Bash' ? bashCwd(ev) : ev.cwd || '';
  const text = responseText(ev.tool_response) || ev.tool_text || ''; // tool_text: o resultado como o modelo leu, se o registro não tiver texto
  const sole = t === 'Bash' ? grepSoleFile(i.command || '', cwd) : i.path && isFile(resolvePath(cwd, i.path)) ? resolvePath(cwd, i.path) : null;
  const hits = findHits(text, cwd, sole);
  const lines = text.split(/\r?\n/);
  const outBody = t === 'Bash' && text.trim() ? lines.slice(0, OUTPUT_LINES).join('\n') + (lines.length > OUTPUT_LINES ? `\n${s.moreLines(lines.length - OUTPUT_LINES)}` : '') : '';
  if (hits.length || outBody) {
    addFeed({ kind: hits.length ? 'hits' : 'output', title: hits.length ? s.results(hits.length) : s.output, body: hits.length ? '' : outBody, code: true, hits: hits.map((h) => ({ ...h, rel: rel(h.file) })) });
  }
  return hits.length ? revealHits(hits) : false;
}

// ---------- editor ----------

async function reveal(file, start, count) {
  if (!followed) return false; // outro projeto: só entra no feed, o editor fica com a aba seguida
  const doc = await vscode.workspace.openTextDocument(file);
  const ed = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  if (!start && !count) { // arquivo inteiro: só abre no topo, destacar tudo não informa nada
    ed.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop);
    return true;
  }
  const s = Math.max(0, (start || 1) - 1);
  const e = Math.min(doc.lineCount - 1, s + (count || doc.lineCount) - 1);
  const range = new vscode.Range(s, 0, e, 0);
  ed.revealRange(range, count === 1 ? vscode.TextEditorRevealType.InCenter : vscode.TextEditorRevealType.AtTop);
  flash(ed, [range]);
  return true;
}

async function revealHits(hits) {
  if (!followed) return false;
  const file = hits[0].file;
  const doc = await vscode.workspace.openTextDocument(file);
  const ed = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  const ranges = hits.filter((h) => h.file === file).map((h) => new vscode.Range(h.line - 1, 0, h.line - 1, 0));
  ed.revealRange(ranges[0], vscode.TextEditorRevealType.InCenter);
  flash(ed, ranges, 2500);
  return true;
}

async function diff(ev, file) {
  const key = keyOf(ev);
  if (!before.has(key)) before.set(key, ''); // Pre perdido (extensão subiu no meio): diff contra vazio
  const right = vscode.Uri.file(file);
  const left = right.with({ scheme: 'bottv-before', query: key }); // mesmo path: VS Code detecta a linguagem pela extensão

  // Posição do trecho novo, calculada do disco: o documento aberto no VS Code pode ainda não ter recarregado.
  const i = ev.tool_input || {};
  const needle = ev.tool_name === 'Edit' ? i.new_string : ev.tool_name === 'MultiEdit' ? i.edits?.at(-1)?.new_string : null;
  let selection;
  if (needle) {
    const text = fs.readFileSync(file, 'utf8');
    const at = text.indexOf(needle);
    if (at >= 0) selection = new vscode.Range(posAt(text, at), posAt(text, at + needle.length));
  }
  const s = T();
  setState(s.edited(rel(file)));
  addFeed({ kind: 'edit', title: rel(file), sub: ev.tool_name === 'Write' ? s.fileWritten : '', file, line: selection ? selection.start.line + 1 : 1 });
  if (!followed) return false;
  await vscode.commands.executeCommand('vscode.diff', left, right, s.diffTitle(path.basename(file)), { preview: true, preserveFocus: true, selection });
  return true;
}

function flash(ed, ranges, ms = 1500) {
  const d = hl; // se o skin mudar no meio, limpa a decoração que foi posta
  ed.setDecorations(d, ranges);
  ed.setDecorations(face, [new vscode.Range(ranges[0].start, ranges[0].start)]); // o mascote marca onde a IA está
  setTimeout(() => { ed.setDecorations(d, []); ed.setDecorations(face, []); }, ms);
}

function posAt(text, offset) {
  const lines = text.slice(0, offset).split('\n');
  return new vscode.Position(lines.length - 1, lines.at(-1).length);
}

// ---------- leitura de comandos e saídas ----------

function fileOf(ev) {
  const p = ev.tool_input?.file_path;
  return p ? resolvePath(ev.cwd, p) : null;
}

function keyOf(ev) { return ev.tool_use_id || `${ev.session_id}:${fileOf(ev)}`; }

// Aceita caminhos do Git Bash (/c/Users/...) além dos do Windows.
function resolvePath(cwd, p) {
  if (!p) return null;
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  if (m && process.platform === 'win32') p = `${m[1].toUpperCase()}:${m[2] || '/'}`; // maiúscula: mesmo arquivo, mesma chave
  return path.resolve(cwd || '', p);
}

function isFile(p) {
  try { return !!p && fs.statSync(p).isFile(); } catch { return false; }
}

function rel(file) {
  if (!file) return '';
  for (const f of vscode.workspace.workspaceFolders || []) {
    const r = path.relative(f.uri.fsPath, file); // win32: compara sem diferenciar maiúsculas (c: vs C:)
    if (r && !r.startsWith('..') && !path.isAbsolute(r)) return r.split(path.sep).join('/');
  }
  return file;
}

// shortcut: segue os `cd` do comando em sequência, sem entender subshell nem `cd` depois do comando que importa
function bashCwd(ev) {
  let cwd = ev.cwd || '';
  const re = /(?:^|&&|;|\|\|)\s*cd\s+(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/g;
  for (const m of (ev.tool_input?.command || '').matchAll(re)) cwd = resolvePath(cwd, m[1] ?? m[2] ?? m[3]);
  return cwd;
}

function segments(command) {
  return command.split(/&&|\|\||;|\|/).map((s) => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((w) => w.replace(/^["']|["']$/g, '')));
}

// Comando de leitura (sed -n A,Bp / head / tail / cat) num arquivo existente -> trecho a mostrar.
function readTarget(command, cwd) {
  for (const [cmd, ...args] of segments(command)) {
    if (!['sed', 'head', 'tail', 'cat'].includes(cmd)) continue;
    const file = args.filter((a) => !a.startsWith('-')).map((a) => resolvePath(cwd, a)).find(isFile);
    if (!file) continue;
    if (cmd === 'cat') return { file };
    if (cmd === 'sed') {
      const r = args.map((a) => /^(\d+)(?:,(\d+))?p$/.exec(a)).find(Boolean);
      return r ? { file, start: +r[1], count: (r[2] ? +r[2] : +r[1]) - +r[1] + 1 } : { file };
    }
    const nArg = args.findIndex((a) => a === '-n');
    const n = nArg >= 0 ? +args[nArg + 1] : +(args.find((a) => /^-\d+$/.test(a)) || '-10').slice(1);
    if (cmd === 'head') return { file, start: 1, count: n };
    const total = fs.readFileSync(file, 'utf8').split('\n').length;
    return { file, start: Math.max(1, total - n), count: n };
  }
  return null;
}

// `grep -n padrão arquivo` com um arquivo só imprime "linha:" sem o caminho; o arquivo vem do comando.
function grepSoleFile(command, cwd) {
  for (const [cmd, ...args] of segments(command)) {
    if (!['grep', 'egrep', 'rg'].includes(cmd)) continue;
    const files = args.filter((a) => !a.startsWith('-')).map((a) => resolvePath(cwd, a)).filter(isFile);
    if (files.length === 1) return files[0];
  }
  return null;
}

function responseText(r) {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (Array.isArray(r)) return r.map(responseText).join('\n');
  return [r.stdout, typeof r.content === 'string' ? r.content : '', Array.isArray(r.filenames) ? r.filenames.join('\n') : '']
    .filter(Boolean).join('\n');
}

// Linhas "arquivo:linha:", "linha:" (arquivo único) ou só "arquivo". Só vale se o arquivo existe: isso descarta falso positivo.
function findHits(text, cwd, sole) {
  const hits = [], seen = new Set();
  for (const line of text.split(/\r?\n/).slice(0, MAX_SCAN)) {
    if (hits.length >= MAX_HITS) break;
    let file, ln = 1, m;
    if ((m = /^((?:[A-Za-z]:)?[^:\n]+):(\d+)[:-]/.exec(line))) { file = m[1]; ln = +m[2]; }
    else if (sole && (m = /^(\d+)[:-]/.exec(line))) { file = sole; ln = +m[1]; }
    else if (line.trim() && line.length < 300) file = line.trim();
    else continue;
    const abs = file === sole ? sole : resolvePath(cwd, file);
    if (!isFile(abs)) continue;
    const key = `${abs}:${ln}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ file: abs, line: ln });
  }
  return hits;
}

module.exports = { activate, deactivate: saveXp, _test: { findHits, bashCwd, readTarget, grepSoleFile, resolvePath } };
