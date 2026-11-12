// Nível do robô, no estilo MMORPG (Tibia): XP total para o nível L = 50/3·(L³ − 6L² + 17L − 12).
// Nível 2 = 100 XP, nível 10 = 9.300, nível 50 ≈ 1,8M, e sem teto. Cada nível pede um pouco mais que o anterior.
// 1 segundo de IA trabalhando, somado de todas as sessões, vale XP_PER_SECOND de XP.
export const XP_PER_SECOND = 1;

export interface LevelInfo {
  level: number;
  xp: number;       // XP total acumulado
  into: number;     // XP ganho dentro do nível atual
  span: number;     // XP que o nível atual pede (do início ao próximo nível)
  progress: number; // into / span, de 0 a 1
  toNext: number;   // XP que falta pro próximo nível
}

// XP total para chegar ao nível `level` (nível 1 = 0).
export const xpFor = (level: number): number => Math.round((50 * (level ** 3 - 6 * level ** 2 + 17 * level - 12)) / 3);

export function levelOf(workSeconds: number): LevelInfo {
  const xp = Math.max(0, Math.floor(workSeconds * XP_PER_SECOND));
  // chute pela raiz cúbica (o termo dominante é 50/3·L³), depois acerta na fronteira
  let level = Math.max(1, Math.floor(Math.cbrt((3 * xp) / 50)) + 1);
  while (xpFor(level + 1) <= xp) level++;
  while (level > 1 && xpFor(level) > xp) level--;
  const from = xpFor(level), to = xpFor(level + 1);
  return { level, xp, into: xp - from, span: to - from, progress: (xp - from) / (to - from), toNext: to - xp };
}

// 842 · 12,5k · 3,2M
export function fmtXp(n: number): string {
  if (n < 10_000) return String(Math.round(n));
  const f = (v: number, u: string) => `${(Math.round(v * 10) / 10).toString().replace('.', ',')}${u}`;
  if (n < 1e6) return f(n / 1e3, 'k');
  if (n < 1e9) return f(n / 1e6, 'M');
  return f(n / 1e9, 'B');
}

// 42s · 17min · 3h05
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}
