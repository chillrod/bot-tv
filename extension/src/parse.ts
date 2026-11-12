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
