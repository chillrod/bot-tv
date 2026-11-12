// Nível do robô pelo tempo de IA trabalhando, somado de todas as sessões.
// Cada nível pede LEVEL_STEP_MIN minutos a mais que o anterior (10, 20, 30…), sem teto.
export const LEVEL_STEP_MIN = 10;

export interface LevelInfo { level: number; seconds: number; progress: number; toNext: number }

// Segundos acumulados para chegar ao nível `level` (nível 1 = 0).
export const need = (level: number): number => (LEVEL_STEP_MIN * 60 * (level - 1) * level) / 2;

export function levelOf(seconds: number): LevelInfo {
  // inverso de need(): maior nível com need(nível) <= seconds
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * seconds) / (LEVEL_STEP_MIN * 60))) / 2));
  while (need(level + 1) <= seconds) level++; // corrige arredondamento na fronteira
  while (level > 1 && need(level) > seconds) level--;
  const from = need(level), to = need(level + 1);
  return { level, seconds, progress: (seconds - from) / (to - from), toNext: to - seconds };
}

// 42s · 17min · 3h05
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}
