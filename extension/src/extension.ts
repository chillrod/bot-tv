// bot_tv: recebe os eventos do plugin do Claude Code via HTTP local e mostra o trajeto da IA:
// um feed no painel lateral (falas, plano, comandos, resultados) e o editor acompanhando (leituras, achados, diffs).
import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { pick, Strings } from './i18n';
import { levelOf, fmtDuration, isNewer } from './level';
import { Hit, bashCwd, commandFiles, editLines, findHits, grepSoleFile, isDir, isFile, listTarget, readTarget, resolvePath, responseText } from './parse';
import { Forecast, forecast } from './weather';

// O que o plugin manda: o formato dos hooks do Claude Code, mais os eventos próprios (AssistantText, Stop com reason).
interface HookEvent {
  plugin_version?: string; // versão do plugin que mandou o evento
  hook_event_name: string;
  tool_name?: string;
  tool_input?: Record<string, any>; // argumentos da ferramenta, formato livre por ferramenta
  tool_response?: unknown;
  tool_text?: string;
  tool_use_id?: string;
  session_id?: string;
  cwd?: string;
  agentId?: string;
  isError?: boolean;
  prompt?: string;
  text?: string;
  message?: string;
  reason?: string;
}

interface FeedItem {
  kind: string;
  title?: string;
  sub?: string;
  body?: string;
  code?: boolean;
  diff?: boolean; // body em linhas "- " e "+ " de uma edição
  file?: string | null;
  line?: number;
  hits?: (Hit & { rel: string })[];
  end?: boolean;
  agent?: boolean;
  project?: string;
  projectName?: string;
  id?: number;
  ts?: number;
}

interface Todo { content: string; status: string }
interface Job { ev: HookEvent; project: string }

const T = (): Strings => pick(vscode.workspace.getConfiguration('botTv').get<string>('language'), vscode.env.language);

const EDITS = new Set(['Edit', 'Write', 'MultiEdit']);
const MAX_BODY = 50 * 1024 * 1024; // Write pode mandar arquivo grande; acima disso descarta
const MAX_SNAPSHOTS = 100;
const MAX_FEED = 400;     // itens guardados no feed (o webview corta no mesmo limite)
const OUTPUT_LINES = 30;  // linhas de saída de comando mostradas no feed
const DIFF_LINES = 60;    // linhas de uma edição mostradas no feed (o resto é só a contagem)

const before = new Map<string, string>(); // id do tool_use -> conteúdo do arquivo antes da edição
// Bash também muda arquivo (sed -i, scripts, `> arquivo`): antes do comando, foto dos arquivos que ele cita (null = não existia).
const bashBefore = new Map<string, Map<string, string | null>>();
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024; // arquivo maior que isso não entra na foto
const MAX_BASH_DIFFS = 3;                   // diffs abertos por comando
const queue: Job[] = [];
const feed: FeedItem[] = [];
let paused = false, busy = false, state = '', nextId = 1;
let todos: Todo[] = [];
let agent = false; // o passo sendo mostrado veio de um subagente
let out: vscode.OutputChannel, status: vscode.StatusBarItem, hl: vscode.TextEditorDecorationType, face: vscode.TextEditorDecorationType;
let view: vscode.WebviewView | null = null;
let version = '', pluginNewer = ''; // pluginNewer: versão do plugin, quando mais nova que esta extensão
let extUri: vscode.Uri, store: vscode.Memento | undefined, wsState: vscode.Memento;

// Sessões do Claude Code: o painel segue uma só (a escolhida no botão de sessão). "flow" segue todas, só se a pessoa pedir.
// Sem escolha, prende na primeira que aparecer; se ela ficar parada STALE_MS e outra mandar um prompt, passa para a nova.
interface Session { name: string; prompt: string; last: number }
const sessions = new Map<string, Session>(); // session_id -> pasta, primeiro prompt, último passo
const STALE_MS = 10 * 60_000;
let following = '';
let cur = { project: '', name: '' }; // sessão do passo sendo mostrado
let followed = true;                  // o passo sendo mostrado é da sessão seguida
const SHELLS = new Set(['Bash', 'PowerShell']); // ferramentas que rodam comando: as duas mostram leitura, pasta e arquivo alterado
// O editor só é guiado com o painel da TV aberto e visível; fechado, os passos só entram no feed.
const steer = () => followed && !!view?.visible;

// Nível: tempo de IA trabalhando (do prompt ao Stop), somado entre sessões e guardado no VS Code.
const GAP_CAP_S = 120;     // intervalo máximo contado entre dois eventos de um turno: sessão largada aberta não vira XP
const XP_SAVE_MS = 30_000; // de quanto em quanto tempo grava o XP enquanto a IA trabalha
const turns = new Map<string, number>(); // session_id -> hora do último evento com turno aberto
let xpSeconds = 0, lastSave = 0;

const WEATHER_MS = 30 * 60_000;  // de quanto em quanto tempo pergunta o clima
const MAX_GAME_SAVE = 100_000;   // o save do jogo vem do webview: acima disso é lixo, não grava
let weather: Forecast | null = null;

const skin = () => vscode.workspace.getConfiguration('botTv').get<string>('skin');

// Destaque das linhas que a IA está lendo/achou. No skin vaporwave: neon rosa com brilho.
function makeHighlight(): vscode.TextEditorDecorationType {
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

export function activate(ctx: vscode.ExtensionContext): void {
  extUri = ctx.extensionUri;
  version = String(ctx.extension.packageJSON.version ?? '');
  store = ctx.globalState;
  wsState = ctx.workspaceState;
  xpSeconds = store.get('botTv.xpSeconds', 0);
  following = wsState.get<string>('botTv.following', '') === 'flow' ? 'flow' : ''; // id de sessão não sobrevive ao reinício; "todas" sim
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
      if (e.affectsConfiguration('botTv.weatherCity')) refreshWeather();
    }),
    vscode.workspace.registerTextDocumentContentProvider('bottv-before', {
      provideTextDocumentContent: (uri) => before.get(uri.query) ?? '',
    }),
    vscode.workspace.registerTextDocumentContentProvider('bottv-folder', { onDidChange: folderChanged.event, provideTextDocumentContent: folderText }),
    vscode.languages.registerDocumentLinkProvider({ scheme: 'bottv-folder' }, {
      provideDocumentLinks: (doc) => (folderLinks.get(doc.uri.toString()) || []).map((l) => new vscode.DocumentLink(doc.lineAt(l.line).range, l.target)),
    }),
    folderChanged,
    vscode.commands.registerCommand('botTv.toggle', toggle),
    vscode.window.registerWebviewViewProvider('botTv.feed', { resolveWebviewView }, { webviewOptions: { retainContextWhenHidden: true } }),
  );

  const port = vscode.workspace.getConfiguration('botTv').get<number>('port', 7337);
  const server = http.createServer(handle);
  // shortcut: só uma janela do VS Code escuta a porta; para várias janelas, rotear pelo cwd do evento
  server.on('error', (e) => { out.appendLine(`servidor não subiu na porta ${port}: ${e.message}`); setState(T().portBusy); });
  server.listen(port, '127.0.0.1', () => out.appendLine(`ouvindo em 127.0.0.1:${port}`));
  ctx.subscriptions.push({ dispose: () => server.close() });
  setState(state);
  refreshWeather();
  const wx = setInterval(refreshWeather, WEATHER_MS);
  ctx.subscriptions.push({ dispose: () => clearInterval(wx) });
}

async function refreshWeather(): Promise<void> {
  const city = (vscode.workspace.getConfiguration('botTv').get<string>('weatherCity') || '').trim();
  try { weather = city ? await forecast(city) : null; }
  catch (e) { out.appendLine(`clima: ${(e as Error).message}`); return; } // sem rede: fica o último que chegou
  if (city && !weather) out.appendLine(`clima: cidade não encontrada: ${city}`);
  post({ type: 'weather', weather });
}

export function deactivate(): void { saveXp(); }

// ---------- painel ----------

function resolveWebviewView(v: vscode.WebviewView): void {
  view = v;
  const media = vscode.Uri.joinPath(extUri, 'media');
  v.webview.options = { enableScripts: true, localResourceRoots: [media] };
  const nonce = crypto.randomBytes(16).toString('hex');
  v.webview.html = fs.readFileSync(path.join(extUri.fsPath, 'media', 'feed.html'), 'utf8')
    .replace(/%NONCE%/g, nonce)
    .replace(/%CSP%/g, v.webview.cspSource)
    .replace(/%FONT%/g, v.webview.asWebviewUri(vscode.Uri.joinPath(media, 'fonts', 'roboto-mono-latin-wght-normal.woff2')).toString())
    .replace(/%GAME%/g, v.webview.asWebviewUri(vscode.Uri.joinPath(media, 'game.js')).toString());
  v.webview.onDidReceiveMessage((m: { type: string; project?: string; file?: string; line?: number; save?: unknown }) => {
    if (m.type === 'ready') {
      const game = store?.get('botTv.game') ?? null;
      post({ type: 'init', feed, todos, paused, state, skin: skin(), ui: T().ui, following, projects: sessionList(), xp: xpInfo(), update: updateInfo(), game, weather });
    }
    if (m.type === 'game' && m.save && typeof m.save === 'object' && JSON.stringify(m.save).length < MAX_GAME_SAVE) store?.update('botTv.game', m.save);
    if (m.type === 'ackUpdate') store?.update('botTv.seenVersion', version);
    if (m.type === 'toggle') toggle();
    if (m.type === 'follow' && m.project) follow(m.project);
    if (m.type === 'open' && m.file) {
      const go = isDir(m.file) ? showFolder(m.file, [], true) : reveal(m.file, m.line, 1, true);
      go.catch((e: Error) => out.appendLine(`erro ao abrir: ${e.message}`));
    }
  });
  v.onDidDispose(() => { view = null; });
}

function post(msg: Record<string, unknown>): void { view?.webview.postMessage(msg); }

function addFeed(item: FeedItem): void {
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

function setState(text: string): void {
  if (!followed) return; // passo de outro projeto: a legenda fica com a aba seguida
  state = text;
  status.text = paused ? `$(debug-pause) bot_tv: ${T().paused}` : `$(device-camera-video) bot_tv${text ? `: ${text}` : ''}`;
  status.tooltip = T().tooltip;
  status.show();
  post({ type: 'state', state });
}

// ---------- sessões e nível ----------

function follow(key: string): void {
  following = key;
  wsState.update('botTv.following', key === 'flow' ? 'flow' : '');
  post({ type: 'following', following });
}

function sessionOf(ev: HookEvent): string {
  const key = ev.session_id || 'default', now = Date.now();
  let ss = sessions.get(key), changed = false;
  if (!ss) {
    const dir = ev.cwd ? path.resolve(ev.cwd) : '';
    ss = { name: path.basename(dir) || dir || 'Claude Code', prompt: '', last: now };
    sessions.set(key, ss);
    changed = true;
  }
  if (ev.hook_event_name === 'UserPromptSubmit' && !ss.prompt && ev.prompt) { ss.prompt = ev.prompt.replace(/\s+/g, ' ').trim().slice(0, 80); changed = true; }
  const lead = following && following !== 'flow' ? sessions.get(following) : undefined;
  if (!following || (following !== 'flow' && !lead)) follow(key); // primeira sessão: o painel prende nela
  else if (lead && key !== following && ev.hook_event_name === 'UserPromptSubmit' && now - lead.last > STALE_MS) follow(key); // a seguida largou: vai para a nova
  ss.last = now;
  if (changed) post({ type: 'projects', projects: sessionList() });
  return key;
}

const sessionList = () => [...sessions].map(([key, x]) => ({ key, name: x.name, prompt: x.prompt, last: x.last }));

function xpInfo() {
  const i = levelOf(xpSeconds);
  return {
    level: i.level, progress: i.progress,
    tip: T().xpTip(i.level, i.xp.toLocaleString('en-US'), xpNextTotal(i), fmtDuration(xpSeconds)),
  };
}
const xpNextTotal = (i: ReturnType<typeof levelOf>) => (i.xp + i.toNext).toLocaleString('en-US');

// Aviso de versão nova: aparece no painel até o usuário clicar nele. Quem já tinha XP guardado e nunca viu aviso também vê.
function updateInfo() {
  if (pluginNewer) return { kind: 'outdated', text: T().outdated(pluginNewer), tip: T().outdatedTip(pluginNewer) };
  const seen = store?.get<string>('botTv.seenVersion');
  if (!version || seen === version || (seen === undefined && xpSeconds === 0)) return null;
  return { kind: 'updated', text: T().updated(version), tip: T().updatedTip(version) };
}

// O plugin é atualizado pelo /plugin, a extensão não: se o plugin é mais novo, o painel avisa para rodar /bot-tv:bot-tv-vscode.
function checkPlugin(v?: string): void {
  if (!v || !version || !isNewer(v, version) || pluginNewer === v) return;
  pluginNewer = v;
  out.appendLine(`plugin v${v} é mais novo que a extensão v${version}: rode /bot-tv:bot-tv-vscode`);
  post({ type: 'update', update: updateInfo() });
}

function trackXp(ev: HookEvent): void {
  const id = ev.session_id || 'default', now = Date.now();
  const last = turns.get(id);
  if (last !== undefined) addXp(Math.min((now - last) / 1000, GAP_CAP_S));
  if (ev.hook_event_name === 'Stop') { turns.delete(id); saveXp(); } else turns.set(id, now);
}

function addXp(s: number): void {
  const was = levelOf(xpSeconds).level;
  xpSeconds += s;
  const info = xpInfo();
  if (info.level > was) { post({ type: 'levelup', level: info.level }); out.appendLine(`level up: ${info.level}`); }
  post({ type: 'xp', xp: info });
  if (Date.now() - lastSave > XP_SAVE_MS) saveXp();
}

function saveXp(): void {
  lastSave = Date.now();
  store?.update('botTv.xpSeconds', xpSeconds);
}

function toggle(): void {
  paused = !paused;
  setState(state);
  post({ type: 'paused', paused });
  if (!paused) drain();
}

// ---------- entrada ----------

function handle(req: http.IncomingMessage, res: http.ServerResponse): void {
  const reply = (code: number, obj: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (req.method === 'GET' && req.url === '/status') {
    const ed = vscode.window.activeTextEditor;
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    return reply(200, {
      workspace: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
      paused, state, queued: queue.length, viewOpen: !!view, todos, following, sessions: sessionList(), xp: xpInfo(),
      recent: feed.slice(-15).map((f) => `${f.kind}: ${f.title || ''}${f.hits ? ` [${f.hits.length} hits]` : ''}`),
      activeTab: tab instanceof vscode.TabInputTextDiff ? { diff: tab.original.toString(), modified: tab.modified.toString() }
        : tab instanceof vscode.TabInputText ? tab.uri.toString() : null,
      activeFile: ed?.document.uri.toString() ?? null,
      visibleLines: ed ? ed.visibleRanges.map((r) => [r.start.line + 1, r.end.line + 1]) : [],
    });
  }
  if (req.method !== 'POST' || req.url !== '/event') return reply(404, { error: 'not found' });

  let body = '', size = 0;
  req.on('data', (d: Buffer) => { size += d.length; if (size <= MAX_BODY) body += d; });
  req.on('end', () => {
    if (size > MAX_BODY) return reply(413, { error: 'evento grande demais' });
    let ev: HookEvent;
    try { ev = JSON.parse(body); } catch { return reply(400, { error: 'json inválido' }); }
    // A foto do "antes" tem que sair agora: o hook Pre segura o Claude até esta resposta.
    if (ev.hook_event_name === 'PreToolUse' && EDITS.has(ev.tool_name || '')) snapshot(ev);
    if (ev.hook_event_name === 'PreToolUse' && SHELLS.has(ev.tool_name || '')) snapshotBash(ev);
    checkPlugin(ev.plugin_version);
    trackXp(ev); // na chegada, não na fila: o tempo é o da IA, não o do replay
    queue.push({ ev, project: sessionOf(ev) });
    reply(200, { ok: true });
    drain();
  });
}

// Texto do arquivo, ou null se não existe, é grande demais ou é binário (não vira diff).
function readText(file: string): string | null {
  try {
    if (fs.statSync(file).size > MAX_SNAPSHOT_BYTES) return null;
    const t = fs.readFileSync(file, 'utf8');
    return t.includes('\u0000') ? null : t;
  } catch { return null; }
}

function snapshotBash(ev: HookEvent): void {
  const cmd = ev.tool_input?.command || '';
  const files = commandFiles(cmd, bashCwd(ev.cwd, cmd));
  if (!files.length) return;
  bashBefore.set(keyOf(ev), new Map(files.map((f) => [f, readText(f)])));
  while (bashBefore.size > MAX_SNAPSHOTS) bashBefore.delete(bashBefore.keys().next().value!);
}

// Arquivos citados pelo comando que mudaram (ou nasceram) enquanto ele rodava.
function bashChanges(ev: HookEvent): [string, string][] {
  const snap = bashBefore.get(keyOf(ev));
  bashBefore.delete(keyOf(ev));
  const out: [string, string][] = [];
  for (const [file, was] of snap || []) {
    const now = readText(file);
    if (now !== null && now !== was) out.push([file, was ?? '']);
  }
  return out.slice(0, MAX_BASH_DIFFS);
}

function snapshot(ev: HookEvent): void {
  const file = fileOf(ev);
  if (!file) return;
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { /* arquivo novo: antes = vazio */ }
  before.set(keyOf(ev), text);
  while (before.size > MAX_SNAPSHOTS) before.delete(before.keys().next().value!);
}

async function drain(): Promise<void> {
  if (busy) return;
  busy = true;
  while (queue.length && !paused) {
    const job = queue.shift()!;
    let visual = false;
    agent = !!job.ev.agentId;
    cur = { project: job.project, name: sessions.get(job.project)?.name || '' };
    followed = following === 'flow' || following === job.project;
    try { visual = await show(job.ev); } catch (e) { out.appendLine(`  erro ao mostrar: ${(e as Error).message}`); }
    followed = true;
    cur = { project: '', name: '' };
    if (visual) await new Promise((r) => setTimeout(r, vscode.workspace.getConfiguration('botTv').get<number>('stepMs', 700)));
  }
  busy = false;
}

// ---------- o que cada evento mostra (retorna true quando mexeu no editor) ----------

async function show(ev: HookEvent): Promise<boolean> {
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
    case 'PreToolUse': return pre(ev, ev.tool_name || '', ev.tool_input || {});
    case 'PostToolUse': return after(ev, ev.tool_name || '', ev.tool_input || {});
  }
  return false;
}

async function pre(ev: HookEvent, t: string, i: Record<string, any>): Promise<boolean> {
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
  if (SHELLS.has(t)) {
    const cwd = bashCwd(ev.cwd, i.command);
    const r = readTarget(i.command || '', cwd);
    setState(i.description || s.runningCommand);
    addFeed({ kind: 'bash', title: i.description || s.command, body: i.command, code: true, file: r?.file, line: r?.start || 1 });
    if (r) return reveal(r.file, r.start, r.count);
    const dir = listTarget(i.command || '', ev.cwd || '');
    return dir ? folderStep(dir, []) : false;
  }
  if (t === 'TodoWrite') {
    todos = ((i.todos || []) as Todo[]).map((x) => ({ content: x.content, status: x.status }));
    post({ type: 'todos', todos });
    const now = todos.find((x) => x.status === 'in_progress');
    addFeed({ kind: 'plan', title: now ? s.now(now.content) : s.planUpdated });
    return false;
  }
  if (t === 'Task' || t === 'Agent') { setState(s.subagentWorking); addFeed({ kind: 'agent', title: i.description || s.subagent, body: i.prompt }); return false; }
  if (t === 'WebSearch') { setState(s.webSearch); addFeed({ kind: 'web', title: i.query }); return false; }
  if (t === 'WebFetch') { setState(s.readingPage); addFeed({ kind: 'web', title: i.url, sub: i.prompt }); return false; }
  addFeed({ kind: 'tool', title: t });
  return false;
}

async function after(ev: HookEvent, t: string, i: Record<string, any>): Promise<boolean> {
  const s = T();
  const file = fileOf(ev);
  if (ev.isError) { // a ferramenta rodou e falhou: nada mudou, então nada de diff nem de "achou"
    const msg = (responseText(ev.tool_response) || ev.tool_text || '').split(/\r?\n/).slice(0, OUTPUT_LINES).join('\n');
    setState(s.failed(t));
    addFeed({ kind: 'fail', title: `${s.failed(t)}${file ? ` · ${rel(file)}` : ''}`, body: msg, code: true });
    return false;
  }
  if (EDITS.has(t) && file) return diff(ev, file);
  if (!SHELLS.has(t) && t !== 'Grep' && t !== 'Glob') return false;
  const shell = SHELLS.has(t);

  const cwd = shell ? bashCwd(ev.cwd, i.command) : ev.cwd || '';
  const text = responseText(ev.tool_response) || ev.tool_text || ''; // tool_text: o resultado como o modelo leu, se o registro não tiver texto
  const pathArg = !shell ? resolvePath(cwd, i.path) : null;
  const sole = shell ? grepSoleFile(i.command || '', cwd) : isFile(pathArg) ? pathArg : null;
  const hits = findHits(text, cwd, sole);
  const lines = text.split(/\r?\n/);
  const outBody = shell && text.trim() ? lines.slice(0, OUTPUT_LINES).join('\n') + (lines.length > OUTPUT_LINES ? `\n${s.moreLines(lines.length - OUTPUT_LINES)}` : '') : '';
  if (hits.length || outBody) {
    addFeed({ kind: hits.length ? 'hits' : 'output', title: hits.length ? s.results(hits.length) : s.output, body: hits.length ? '' : outBody, code: true, hits: hits.map((h) => ({ ...h, rel: rel(h.file) })) });
  }
  let shown = false;
  if (shell) for (const [n, [file, was]] of bashChanges(ev).entries()) shown = (await diffFrom(`${keyOf(ev)}-${n}`, file, was)) || shown;
  if (shown) return true;
  if (t === 'Glob') { // a pasta da busca, com o que casou marcado, diz mais do que abrir o primeiro arquivo
    const base = isDir(pathArg) ? pathArg : cwd;
    return base ? showFolder(base, hits.map((h) => h.file)) : false;
  }
  return hits.length ? revealHits(hits) : false;
}

// ---------- pastas: o Claude navegando pelo disco vira uma árvore no editor ----------

const FOLDER_MAX = 500; // entradas listadas por pasta
const folderLinks = new Map<string, { line: number; target: vscode.Uri }[]>(); // documento -> linhas clicáveis
const folderMarks = new Map<string, string[]>();                                // documento -> entradas marcadas (Glob)
const folderChanged = new vscode.EventEmitter<vscode.Uri>();
const folderUri = (dir: string) => vscode.Uri.from({ scheme: 'bottv-folder', path: `/📁 ${path.basename(dir) || dir}`, query: dir });

function folderText(uri: vscode.Uri): string {
  const dir = uri.query, s = T(), marks = new Set(folderMarks.get(uri.toString()) || []);
  let list: fs.Dirent[] = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return `📁 ${dir}\n\n${(e as Error).message}`; }
  list.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const dirs = list.filter((d) => d.isDirectory()).length;
  const links: { line: number; target: vscode.Uri }[] = [];
  const lines = [`📁 ${dir}`, s.folderSummary(dirs, list.length - dirs), ''];
  const parent = path.dirname(dir);
  if (parent !== dir) { links.push({ line: lines.length, target: folderUri(parent) }); lines.push('   📁 ..'); }
  for (const d of list.slice(0, FOLDER_MAX)) {
    const full = path.join(dir, d.name), mark = marks.has(full) ? '● ' : '  ';
    let size = '';
    if (!d.isDirectory()) { try { size = fmtSize(fs.statSync(full).size); } catch { /* sem acesso */ } }
    links.push({ line: lines.length, target: d.isDirectory() ? folderUri(full) : vscode.Uri.file(full) });
    lines.push(`${mark} ${d.isDirectory() ? '📁' : '📄'} ${d.name}${d.isDirectory() ? '/' : ''}${size ? '  ' + size : ''}`);
  }
  if (list.length > FOLDER_MAX) lines.push(`   … +${list.length - FOLDER_MAX}`);
  folderLinks.set(uri.toString(), links);
  return lines.join('\n');
}

function fmtSize(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
}

// Passo de navegação: entra no feed e abre a pasta no editor.
async function folderStep(dir: string, marked: string[]): Promise<boolean> {
  const s = T();
  let dirs = 0, files = 0;
  try { for (const d of fs.readdirSync(dir, { withFileTypes: true })) d.isDirectory() ? dirs++ : files++; } catch { /* sem acesso */ }
  setState(s.browsing(rel(dir) || dir));
  addFeed({ kind: 'folder', title: rel(dir) || dir, sub: s.folderSummary(dirs, files), file: dir });
  return showFolder(dir, marked);
}

async function showFolder(dir: string, marked: string[], asked = false): Promise<boolean> {
  if (!asked && !steer()) return false;
  const uri = folderUri(dir);
  // marca a entrada de primeiro nível que contém cada achado (arquivo ou a pasta dele)
  folderMarks.set(uri.toString(), [...new Set(marked.map((f) => path.join(dir, path.relative(dir, f).split(path.sep)[0])))]);
  folderChanged.fire(uri);
  const doc = await vscode.workspace.openTextDocument(uri);
  const ed = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  const ranges = (folderLinks.get(uri.toString()) || []).filter((l) => doc.lineAt(l.line).text.startsWith('●')).map((l) => new vscode.Range(l.line, 0, l.line, 0));
  if (ranges.length) { ed.revealRange(ranges[0], vscode.TextEditorRevealType.InCenter); flash(ed, ranges, 2500); }
  return true;
}

// ---------- editor ----------

async function reveal(file: string, start?: number, count?: number, asked = false): Promise<boolean> {
  if (!asked && !steer()) return false; // outro projeto: só entra no feed, o editor fica com a aba seguida
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

async function revealHits(hits: Hit[]): Promise<boolean> {
  if (!steer()) return false;
  const file = hits[0].file;
  const doc = await vscode.workspace.openTextDocument(file);
  const ed = await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true });
  const ranges = hits.filter((h) => h.file === file).map((h) => new vscode.Range(h.line - 1, 0, h.line - 1, 0));
  ed.revealRange(ranges[0], vscode.TextEditorRevealType.InCenter);
  flash(ed, ranges, 2500);
  return true;
}

async function diff(ev: HookEvent, file: string): Promise<boolean> {
  const key = keyOf(ev);
  if (!before.has(key)) before.set(key, ''); // Pre perdido (extensão subiu no meio): diff contra vazio
  const right = vscode.Uri.file(file);
  const left = right.with({ scheme: 'bottv-before', query: key }); // mesmo path: VS Code detecta a linguagem pela extensão

  // Posição do trecho novo, calculada do disco: o documento aberto no VS Code pode ainda não ter recarregado.
  const i = ev.tool_input || {};
  const needle: string | undefined = ev.tool_name === 'Edit' ? i.new_string : ev.tool_name === 'MultiEdit' ? i.edits?.at(-1)?.new_string : undefined;
  let selection: vscode.Range | undefined;
  if (needle) {
    const text = fs.readFileSync(file, 'utf8');
    const at = text.indexOf(needle);
    if (at >= 0) selection = new vscode.Range(posAt(text, at), posAt(text, at + needle.length));
  }
  const s = T();
  setState(s.edited(rel(file)));
  const changed = editLines(ev.tool_name || '', i);
  const body = changed.slice(0, DIFF_LINES).join('\n') + (changed.length > DIFF_LINES ? `\n${s.moreLines(changed.length - DIFF_LINES)}` : '');
  const line = selection ? selection.start.line + 1 : 1;
  addFeed({ kind: 'edit', title: rel(file), sub: [ev.tool_name === 'Write' ? s.fileWritten : '', selection ? s.lines(line, selection.end.line + 1) : ''].filter(Boolean).join(' · '), file, line, body, code: true, diff: true });
  if (!steer()) return false;
  await vscode.commands.executeCommand('vscode.diff', left, right, s.diffTitle(path.basename(file)), { preview: true, preserveFocus: true, selection });
  return true;
}

// Arquivo que um comando mudou: o mesmo diff de uma edição, com o "antes" fotografado no Pre do comando.
async function diffFrom(key: string, file: string, was: string): Promise<boolean> {
  const now = readText(file);
  if (now === null) return false;
  before.set(key, was);
  const a = was.split(/\r?\n/), b = now.split(/\r?\n/);
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  const changed = editLines('Edit', { old_string: was, new_string: now });
  const added = changed.filter((l) => l.startsWith('+ ')).length;
  const s = T();
  setState(s.edited(rel(file)));
  addFeed({ kind: 'edit', title: rel(file), sub: [s.byCommand, s.lines(k + 1, k + Math.max(1, added))].join(' · '), file, line: k + 1,
    body: changed.slice(0, DIFF_LINES).join('\n') + (changed.length > DIFF_LINES ? `\n${s.moreLines(changed.length - DIFF_LINES)}` : ''), code: true, diff: true });
  if (!steer()) return false;
  const right = vscode.Uri.file(file);
  const selection = new vscode.Range(k, 0, k + Math.max(0, added - 1), 0);
  await vscode.commands.executeCommand('vscode.diff', right.with({ scheme: 'bottv-before', query: key }), right, s.diffTitle(path.basename(file)), { preview: true, preserveFocus: true, selection });
  return true;
}

function flash(ed: vscode.TextEditor, ranges: vscode.Range[], ms = 1500): void {
  const d = hl; // se o skin mudar no meio, limpa a decoração que foi posta
  ed.setDecorations(d, ranges);
  ed.setDecorations(face, [new vscode.Range(ranges[0].start, ranges[0].start)]); // o mascote marca onde a IA está
  setTimeout(() => { ed.setDecorations(d, []); ed.setDecorations(face, []); }, ms);
}

function posAt(text: string, offset: number): vscode.Position {
  const lines = text.slice(0, offset).split('\n');
  return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
}

function fileOf(ev: HookEvent): string | null {
  return resolvePath(ev.cwd, ev.tool_input?.file_path);
}

function keyOf(ev: HookEvent): string { return ev.tool_use_id || `${ev.session_id}:${fileOf(ev)}`; }

function rel(file: string | null): string {
  if (!file) return '';
  for (const f of vscode.workspace.workspaceFolders || []) {
    const r = path.relative(f.uri.fsPath, file); // win32: compara sem diferenciar maiúsculas (c: vs C:)
    if (r && !r.startsWith('..') && !path.isAbsolute(r)) return r.split(path.sep).join('/');
  }
  return file;
}
