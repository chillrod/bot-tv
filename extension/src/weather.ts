// Clima da cidade do usuário pelo Open-Meteo (sem chave). Só roda se botTv.weatherCity estiver preenchido:
// o nome da cidade sai da máquina, então é opt-in. Alimenta o céu do jogo e o canal de previsão da TV.
import * as https from 'https';

export type WxKind = 'clear' | 'rain' | 'snow' | 'night' | 'storm';
export interface Forecast {
  city: string;
  now: { kind: WxKind; temp: number };
  days: { d: string; kind: WxKind; max: number }[];
}

// Código WMO do Open-Meteo -> um dos 5 climas do jogo. Neblina e nublado contam como céu limpo.
export function wxKind(code: number, isDay = 1): WxKind {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 51) return 'rain';
  return isDay ? 'clear' : 'night';
}

// https.get em vez de fetch: o VS Code 1.80 roda em Node 16, que não tem fetch.
function getJson(url: string): Promise<any> {
  return new Promise((ok, fail) => {
    const req = https.get(url, { timeout: 10_000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return fail(new Error(`HTTP ${res.statusCode}`)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => { body += d; });
      res.on('end', () => { try { ok(JSON.parse(body)); } catch (e) { fail(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', fail);
  });
}

export async function forecast(city: string): Promise<Forecast | null> {
  const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
  const at = geo.results?.[0];
  if (!at) return null;
  const r = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${at.latitude}&longitude=${at.longitude}`
    + '&current=weather_code,is_day,temperature_2m&daily=weather_code,temperature_2m_max&forecast_days=5&timezone=auto');
  return {
    city: String(at.name),
    now: { kind: wxKind(r.current.weather_code, r.current.is_day), temp: Math.round(r.current.temperature_2m) },
    days: (r.daily.time as string[]).map((d, i) => ({ d, kind: wxKind(r.daily.weather_code[i]), max: Math.round(r.daily.temperature_2m_max[i]) })),
  };
}
