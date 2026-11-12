// Lê comandos e saídas das ferramentas e transforma em arquivos e linhas. Sem VS Code: testável com Node puro.
import * as fs from 'fs';
import * as path from 'path';

const MAX_HITS = 200;  // resultados de busca listados por passo
const MAX_SCAN = 3000; // linhas de saída examinadas atrás de arquivo:linha

export interface Hit { file: string; line: number }
export interface ReadTarget { file: string; start?: number; count?: number }

// Aceita caminhos do Git Bash (/c/Users/...) além dos do Windows.
export function resolvePath(cwd: string | undefined, p: string | undefined): string | null {
  if (!p) return null;
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  if (m && process.platform === 'win32') p = `${m[1].toUpperCase()}:${m[2] || '/'}`; // maiúscula: mesmo arquivo, mesma chave
  return path.resolve(cwd || '', p);
}

export function isFile(p: string | null | undefined): p is string {
  try { return !!p && fs.statSync(p).isFile(); } catch { return false; }
}

// shortcut: segue os `cd` do comando em sequência, sem entender subshell nem `cd` depois do comando que importa
export function bashCwd(cwd: string | undefined, command: string | undefined): string {
  let dir = cwd || '';
  const re = /(?:^|&&|;|\|\|)\s*cd\s+(?:"([^"]*)"|'([^']*)'|([^\s;&|]+))/g;
  for (const m of (command || '').matchAll(re)) dir = resolvePath(dir, m[1] ?? m[2] ?? m[3]) ?? dir;
  return dir;
}

function segments(command: string): string[][] {
  return command.split(/&&|\|\||;|\|/).map((s) => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((w) => w.replace(/^["']|["']$/g, '')));
}

// Comando de leitura (sed -n A,Bp / head / tail / cat) num arquivo existente -> trecho a mostrar.
export function readTarget(command: string, cwd: string): ReadTarget | null {
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
export function grepSoleFile(command: string, cwd: string): string | null {
  for (const [cmd, ...args] of segments(command)) {
    if (!['grep', 'egrep', 'rg'].includes(cmd)) continue;
    const files = args.filter((a) => !a.startsWith('-')).map((a) => resolvePath(cwd, a)).filter(isFile);
    if (files.length === 1) return files[0];
  }
  return null;
}

// O registro de resultado varia por ferramenta: junta o que tiver texto.
export function responseText(r: unknown): string {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (Array.isArray(r)) return r.map(responseText).join('\n');
  const o = r as { stdout?: string; content?: unknown; filenames?: unknown };
  return [o.stdout, typeof o.content === 'string' ? o.content : '', Array.isArray(o.filenames) ? o.filenames.join('\n') : '']
    .filter(Boolean).join('\n');
}

// Linhas "arquivo:linha:", "linha:" (arquivo único) ou só "arquivo". Só vale se o arquivo existe: isso descarta falso positivo.
export function findHits(text: string, cwd: string, sole: string | null): Hit[] {
  const hits: Hit[] = [], seen = new Set<string>();
  for (const line of text.split(/\r?\n/).slice(0, MAX_SCAN)) {
    if (hits.length >= MAX_HITS) break;
    let file: string, ln = 1, m: RegExpExecArray | null;
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

// O que uma edição mudou, para o feed: linhas "- " saíram, "+ " entraram. Linhas iguais no começo e no fim de cada troca
// ficam de fora, para sobrar só o que mudou. Write mostra o arquivo novo todo como "+".
export function editLines(tool: string, input: Record<string, any>): string[] {
  const pairs: [string, string][] = tool === 'Write' ? [['', String(input.content ?? '')]]
    : tool === 'MultiEdit' ? (input.edits || []).map((e: any) => [String(e.old_string ?? ''), String(e.new_string ?? '')])
    : [[String(input.old_string ?? ''), String(input.new_string ?? '')]];
  const out: string[] = [];
  for (const [before, after] of pairs) {
    const a = before ? before.split(/\r?\n/) : [], b = after ? after.split(/\r?\n/) : [];
    while (a.length && b.length && a[0] === b[0]) { a.shift(); b.shift(); }
    while (a.length && b.length && a[a.length - 1] === b[b.length - 1]) { a.pop(); b.pop(); }
    if (!a.length && !b.length) continue;
    if (out.length) out.push('…');
    out.push(...a.map((l) => `- ${l}`), ...b.map((l) => `+ ${l}`));
  }
  return out;
}

// Arquivos que um comando cita (sed -i, scripts, `> arquivo`, nomes dentro de heredoc): candidatos a mudar.
// O bot_tv fotografa esses antes do comando e compara depois, já que o Bash mexe em arquivo sem passar por Edit.
// shortcut: só pega nomes com extensão (a.ts, notas.md); arquivo sem extensão alterado por comando não aparece
const TEXT_EXT = /\.(md|txt|json|jsonc|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cc|cpp|cs|css|scss|html|vue|svelte|php|swift|lua|sh|ps1|sql|xml|yml|yaml|toml|ini|cfg|env|csv)$/i;
export function commandFiles(command: string, cwd: string, max = 20): string[] {
  const out = new Set<string>();
  for (const tok of command.split(/[\s'"`=;|&<>(),{}\[\]]+/)) {
    // nome antes do ponto (".read" de open(p).read() não é arquivo), nada de flag nem URL
    if (!tok || tok.startsWith('-') || tok.includes('://') || tok.length > 300 || !/[^./\\]\.[A-Za-z0-9]{1,8}$/.test(tok)) continue;
    const p = resolvePath(cwd, tok);
    if (!p || p.includes(`${path.sep}node_modules${path.sep}`) || p.includes(`${path.sep}.git${path.sep}`)) continue;
    if (isFile(p) || TEXT_EXT.test(tok)) out.add(p); // arquivo que existe, ou um de texto que o comando pode estar criando
    if (out.size >= max) break;
  }
  return [...out];
}
