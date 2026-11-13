// bot_tv arcade: o robô sobe castelos góticos gerados na hora, área por área, até o topo; vence o senhor do castelo
// e parte para o próximo. Infinito e só para ver: nada pede clique. Os passos do Claude viram golpes e reações.
(() => {
  const W = 240, H = 60, HERO_SX = 84, HERO_SY = 46;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const cv = $('game'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const vr = (n) => Math.floor(Math.random() * n);
  const vp = (a) => a[vr(a.length)];

  // gerador com semente (mulberry32): o mesmo castelo se refaz a partir do save
  function seeded(seed) {
    let a = seed | 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- textos ----------
  const L = {
    en: {
      castle: 'castle', hide: 'hide game', show: 'show game',
      zones: { gate: 'Ramparts', hall: 'Great Hall', library: 'Archive', chapel: 'Chapel', catacombs: 'Crypts', clock: 'Bell Tower', keep: 'Throne Spire' },
      down: 'DOWN', room: 'Save room', castleOf: (n) => `Castle of ${n}`, castleN: (k) => `castle ${k}`, conquered: 'Castle conquered', defeated: (n) => `${n} defeated`,
      species: ['Gargoyle', 'Specter', 'Bat', 'Skeleton', 'Armor', 'Ghoul', 'Harpy', 'Golem', 'Lich', 'Slime', 'Crypt Hound', 'Hollow Bishop'],
      adj: ['Bone', 'Grim', 'Crimson', 'Pale', 'Ancient', 'Starving', 'Eyeless', 'Wax', 'Cursed', 'Cracked', 'Ash'],
      titles: ['Warden of Bells', 'the Crimson', 'Lord of Mist', 'the Clockmaker', 'Fallen Bishop', 'Keeper of Crypts', 'the Lightless', 'Candle Eater'],
      foe: (s, a) => `${a.split('/')[0]} ${s.split(':')[0]}`, lord: (n) => `${n}, Lord of the Castle`,
      say: { clear: 'The sky cleared', rain: 'It started raining', snow: 'It started snowing', night: 'The full moon rose', storm: 'Storm!' },
    },
    pt: {
      castle: 'castelo', hide: 'esconder jogo', show: 'mostrar jogo',
      zones: { gate: 'Muralha', hall: 'Grande Salão', library: 'Arquivo', chapel: 'Capela', catacombs: 'Criptas', clock: 'Torre do Sino', keep: 'Torre do Trono' },
      down: 'CAIU', room: 'Sala de descanso', castleOf: (n) => `Castelo de ${n}`, castleN: (k) => `castelo ${k}`, conquered: 'Castelo conquistado', defeated: (n) => `${n} caiu`,
      // ":f" marca substantivo feminino; "m/f" são as duas formas do adjetivo, para concordar
      species: ['Gárgula:f', 'Espectro', 'Morcego', 'Esqueleto', 'Armadura:f', 'Carniçal', 'Harpia:f', 'Golem', 'Lich', 'Lodo', 'Cão das Criptas', 'Bispo Oco'],
      adj: ['de Ossos', 'Sombrio/Sombria', 'Carmesim', 'Pálido/Pálida', 'Ancestral', 'Faminto/Faminta', 'sem Olhos', 'de Cera', 'Maldito/Maldita', 'Rachado/Rachada', 'de Cinzas'],
      titles: ['Guardião do Sino', 'o Carmesim', 'Senhor da Névoa', 'o Relojoeiro', 'Bispo Caído', 'Guardião das Criptas', 'o Sem Luz', 'Devorador de Velas'],
      foe: (s, a) => { const [n, gender] = s.split(':'), [m, f] = a.split('/'); return `${n} ${gender === 'f' && f ? f : m}`; },
      lord: (n) => `${n}, Senhor do Castelo`,
      say: { clear: 'O céu abriu', rain: 'Começou a chover', snow: 'Começou a nevar', night: 'A lua cheia subiu', storm: 'Tempestade!' },
    },
  };
  let T = L.en;
  const SYL1 = ['Vla', 'Mor', 'Kar', 'Zef', 'Ul', 'Bel', 'Sar', 'Dre', 'Nox', 'Ves', 'Ast', 'Ler'];
  const SYL2 = ['kor', 'gath', 'mir', 'ion', 'eth', 'ul', 'oth', 'ena', 'ard', 'iel', 'umo'];

  // ---------- fonte de pixel 3x5: cada linha é um dígito octal (3 bits) ----------
  const FONT = {};
  ('0 75557 1 26227 2 71747 3 71317 4 55711 5 74717 6 74757 7 71122 8 75757 9 75717 A 25755 B 65656 C 34443 D 65556 E 74647 F 74644 G 34553 H 55755 I 72227 ' +
   'J 11152 K 55655 L 44447 M 57755 N 65555 O 25552 P 65644 Q 25563 R 65655 S 34216 T 72222 U 55557 V 55552 W 55775 X 55255 Y 55222 Z 71247 ' +
   '+ 02720 - 00700 ! 22202 ? 61202 . 00002 , 00024 : 02020 / 11244 % 51245 * 05250').split(' ').forEach((v, i, a) => { if (i % 2) FONT[a[i - 1]] = v; });
  function text(str, x, y, c, center, s = 1) {
    str = String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (center) x -= Math.floor((str.length * 4 - 1) * s / 2);
    for (const pass of [0, 1]) {
      g.fillStyle = pass ? c : '#000';
      const o = pass ? 0 : s;
      for (let i = 0; i < str.length; i++) {
        const gl = FONT[str[i]]; if (!gl) continue;
        for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (+gl[r] & (4 >> b)) g.fillRect(x + (i * 4 + b) * s + o, y + r * s + o, s, s);
      }
    }
  }
  function sprite(rows, x, y, pal, s = 1) {
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c]; if (ch === '.') continue;
      g.fillStyle = pal[ch]; g.fillRect(Math.round(x + c * s), Math.round(y + r * s), s, s);
    }
  }

  // ---------- sprites fixos: o robô é a TV do painel em pixel ----------
  const BOT = ['..a.....a..', '...a...a...', 'bbbbbbbbbbb', 'b.........b', 'b..e...e..b', 'b.........b', 'b...mmm...b', 'b.........b', 'bbbbbbbbbbb', '...b...b...', '..bb...bb..'];
  const BAT = [['d.....d', '.d.d.d.', '..ddd..'], ['..d.d..', '.ddddd.', 'd..d..d']];
  const THRONE = ['..yyy..', '.yrrry.', '.yrrry.', '.yrrry.', 'yyyyyyy', 'yrrrrry', 'y.....y', 'y.....y'];

  // ---------- monstros procedurais: metade sorteada, espelhada, com núcleo sólido e olhos ----------
  function genRows(w, h) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let half = '';
      for (let x = 0; x < w; x++) half += Math.random() < (y === 0 || y === h - 1 ? 0.4 : 0.55) + x * 0.12 ? 'g' : '.';
      rows.push(half + [...half].reverse().join(''));
    }
    for (let y = 2; y < h - 2; y++) rows[y] = rows[y].slice(0, w - 1) + 'gg' + rows[y].slice(w + 1);
    const ey = 1 + vr(2), ex = Math.max(1, w - 2 - vr(2));
    const set = (r, c, ch) => { rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1); };
    set(ey, ex, 'k'); set(ey, 2 * w - 1 - ex, 'k');
    for (let y = Math.ceil(h * 0.65); y < h; y++) rows[y] = rows[y].replace(/g/g, 'd');
    return rows;
  }
  function makeFoe(z, x, y, boss, lord) {
    const th = TH[z], hue = th.hue[0] + vr(th.hue[1] - th.hue[0]), light = 45 + vr(20);
    const k = scale();
    const hp = (boss ? 16 * (lord ? 1.5 : 1) : 3 + vr(2)) * k, dmg = (boss ? 9 : 6) * k * (lord ? 1.3 : 1);
    const name = lord ? T.lord(C.name) : boss ? `${vp(SYL1)}${vp(SYL2)}, ${vp(T.titles)}` : T.foe(vp(T.species), vp(T.adj));
    return {
      rows: boss ? genRows(5, 10) : genRows(4, 7 + vr(2)), boss, name, hp, max: hp, dmg, x, y,
      s: boss ? 2 : 1, fly: !boss && Math.random() < 0.3, atkT: 0, flash: 0, lunge: 0, dead: false, phase: Math.random() * 6,
      pal: { g: `hsl(${hue} 55% ${light}%)`, d: `hsl(${hue} 50% ${light - 20}%)`, k: lord ? '#ff2040' : vp(['#ff4040', '#ffe040', '#4ff0ff', '#ffffff']) },
    };
  }

  // ---------- áreas do castelo ----------
  const TH = {
    gate: { out: true, wall: '#2a2238', dark: '#18131f', fa: '#3a3448', fb: '#2e2a3a', fill: '#1c1826', edge: '#5a5070', light: '#ffb84a', hue: [80, 150] },
    hall: { wall: '#3a1c2c', dark: '#22101a', fa: '#4a2a20', fb: '#3a2018', fill: '#24120e', edge: '#6a3a2a', light: '#ffd060', hue: [320, 360], curtain: '#7a1030' },
    library: { wall: '#2c2418', dark: '#1a140c', fa: '#3c2c1c', fb: '#2e2214', fill: '#1a120a', edge: '#5a4428', light: '#ffd060', hue: [20, 60], books: true },
    chapel: { wall: '#262036', dark: '#16121f', fa: '#3a3450', fb: '#2c2840', fill: '#14101c', edge: '#6a6090', light: '#fff0b0', hue: [200, 280], glass: true },
    catacombs: { wall: '#1e2420', dark: '#101410', fa: '#2a302a', fb: '#202620', fill: '#0c100c', edge: '#3a4a3a', light: '#7cf5c8', hue: [90, 170], bones: true },
    clock: { wall: '#22283a', dark: '#141826', fa: '#30364a', fb: '#262a3a', fill: '#10141e', edge: '#4a5270', light: '#ffd060', hue: [190, 260], gears: true },
    keep: { wall: '#2a0e18', dark: '#16060c', fa: '#3a1420', fb: '#2c0e18', fill: '#12040a', edge: '#7a2a3a', light: '#ff6a4a', hue: [340, 380], banners: true },
  };
  const BOOKS = Array.from({ length: 64 }, () => [vp(['#7a2a2a', '#2a4a7a', '#4a6a2a', '#7a6a2a', '#5a2a6a']), 3 + vr(3)]);
  const GLASS = ['#c03040', '#3050c0', '#d0a030', '#30a060'];

  // Castelo: lista de trechos (corredor, escadaria, poço, elevador, porta, descanso, chefe) que sobem da porta ao trono.
  function buildCastle(seed) {
    const R = seeded(seed), ri = (n) => Math.floor(R() * n), rp = (a) => a[ri(a.length)];
    const mids = ['hall', 'library', 'chapel', 'catacombs', 'clock'].map((z) => [R(), z]).sort((a, b) => a[0] - b[0]).map((p) => p[1]).slice(0, 3 + ri(2));
    const segs = [];
    let x = 0, y = 0;
    const push = (s) => {
      s.x0 = x; s.y0 = y;
      if (s.type === 'stairs') { s.x1 = x + s.n * 4 + 10; s.y1 = y - s.n * 4; }
      else if (s.type === 'shaft') { s.x1 = x + 40; s.y1 = y - s.h; }
      else if (s.type === 'lift') { s.x1 = x + 24; s.y1 = y - s.h; }
      else { s.x1 = x + s.len; s.y1 = y; }
      segs.push(s); x = s.x1; y = s.y1;
    };
    for (const z of ['gate', ...mids, 'keep']) {
      push({ type: 'door', z, len: 40 });
      const n = 4 + ri(3), pool = z === 'gate' ? ['hall', 'hall', 'stairs'] : ['hall', 'hall', 'stairs', 'shaft', 'lift'];
      let rested = false;
      for (let i = 0; i < n; i++) {
        let t = rp(pool);
        if (i === n - 1 && !segs.slice(-n).some((s) => s.y1 < s.y0)) t = 'stairs'; // toda área sobe
        if (!rested && z !== 'gate' && i === 2 && R() < 0.5) { push({ type: 'rest', z, len: 60 }); rested = true; }
        if (t === 'hall') push({ type: 'hall', z, len: 70 + ri(90), foes: z === 'gate' ? 1 + ri(2) : ri(3) });
        if (t === 'stairs') push({ type: 'stairs', z, n: 4 + ri(5) });
        if (t === 'shaft') push({ type: 'shaft', z, h: 24 + ri(3) * 12 });
        if (t === 'lift') push({ type: 'lift', z, h: 30 + ri(4) * 10 });
      }
      if (z !== 'gate') push({ type: 'boss', z, len: 160, lord: z === 'keep' });
    }
    push({ type: 'finale', z: 'keep', len: 110 });
    const ys = segs.map((s) => s.y1);
    return { name: rp(SYL1) + rp(SYL2), segs, maxX: x, minY: Math.min(...ys) };
  }

  // ---------- clima: vem da cidade (Open-Meteo, se configurado) ou vira sozinho ----------
  const WX = {
    clear: ['#1a2a6a', '#2a3c8a', '#3c5aa8', '#5878c0', '#7a98d4'],
    rain: ['#1c2028', '#262c36', '#303844', '#3a4452', '#465262'],
    snow: ['#4c5a78', '#5c6a88', '#6c7a98', '#7c8aa8', '#909cb8'],
    night: ['#04041a', '#0a0a28', '#121238', '#1c1a4a', '#28225c'],
    storm: ['#120c18', '#1c1424', '#261c30', '#30243c', '#3a2c48'],
  };
  const WX_WEIGHT = [['rain', 30], ['night', 25], ['clear', 20], ['storm', 15], ['snow', 10]];
  let realWx = false;

  // ---------- estado ----------
  let S = null, C = null, seg = null, moves = [], mi = 0, LV = 1;
  const hero = { x: 0, y: 0, jump: null, wait: 0, lunge: 0, hurt: 0, big: 0, hp: 100, down: 0 };
  // Dificuldade: os monstros crescem com o castelo e com o LV do bot_tv; o robô também, mas um pouco menos.
  // Ninguém morre: com a vida a zero o robô cai, levanta com 60% e o monstro segue ferido. Demora, mas sempre avança.
  const scale = () => 1 + 0.15 * Math.min(20, S.castle - 1) + 0.08 * (LV - 1);
  const heroMax = () => 100 + 10 * (LV - 1);
  const heroPow = () => 1 + 0.06 * (LV - 1);
  const cam = { x: 0, y: 0 };
  const P = [], F = [], STARS = Array.from({ length: 40 }, () => [vr(W), vr(30)]);
  const RAIN = Array.from({ length: 50 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 0.6 + Math.random() * 0.6 }));
  const TOWERS = Array.from({ length: 12 }, () => [6 + vr(10), 14 + vr(20)]);
  const IDLE_S = 120; // sem evento do Claude por esse tempo: o robô vai para a sala de descanso
  let idle = false, quietT = 0, now = 0, flash = 0, fade = 0, banner = null, bat = null, batT = 4, wxT = 60, boltT = 6, atkT = 0;

  const z = () => (seg ? seg.z : 'gate');
  const alive = (f) => f && !f.dead;
  const foesHere = () => (seg ? [...(seg.list || []), ...(seg.boss ? [seg.boss] : [])].filter(alive) : []);
  const target = () => foesHere().filter((f) => f.x > hero.x - 4).sort((a, b) => a.x - b.x)[0] || null;
  const reach = (f) => (f.boss ? 24 : 15);
  const fighting = () => { if (hero.down > 0) return null; const t = target(); return t && t.x - hero.x <= reach(t) ? t : null; };

  function enterSeg(i) {
    S.seg = i; seg = C.segs[i]; mi = 0;
    const s = seg, m = [];
    const walk = (x, y, v = 26) => m.push({ k: 'walk', x, y, v });
    if (s.type === 'stairs') { walk(s.x0 + s.n * 4, s.y1, 20); walk(s.x1, s.y1); }
    else if (s.type === 'shaft') {
      walk(s.x0 + 10, s.y0);
      for (let k = 1; k <= s.h / 12; k++) { m.push({ k: 'jump', x: k % 2 ? s.x0 + 28 : s.x0 + 10, y: s.y0 - k * 12, dur: 0.45 }); m.push({ k: 'wait', dur: 0.15 }); }
      walk(s.x1, s.y1);
    } else if (s.type === 'lift') { walk(s.x0 + 12, s.y0); m.push({ k: 'wait', dur: 0.4 }); m.push({ k: 'ride', y: s.y1, v: 22 }); walk(s.x1, s.y1); }
    else if (s.type === 'rest') { walk(s.x0 + s.len / 2 - 8, s.y0); m.push({ k: 'wait', dur: 2.6, rest: true }); walk(s.x1, s.y1); }
    else if (s.type === 'boss') { walk(s.x0 + 46, s.y0); m.push({ k: 'boss' }); walk(s.x1, s.y1); }
    else walk(s.x1, s.y1);
    moves = m;
    if (s.type === 'hall' && !s.list) s.list = Array.from({ length: s.foes }, (_, k) => makeFoe(s.z, Math.min(s.x1 - 6, s.x0 + 50 + k * 30), s.y0));
    if (s.type === 'door') { fade = Math.max(fade, 0.9); banner = { text: T.zones[s.z], t: 3 }; }
    if (s.type === 'finale') { banner = { text: T.conquered, sub: T.castleOf(C.name), t: 4.5, big: true }; window.tv?.celebrate(); }
  }
  function newCastle(num, seed) {
    S.castle = num; S.seed = seed;
    C = buildCastle(seed);
    enterSeg(0);
    hero.x = 0; hero.y = 0; hero.jump = null;
    cam.x = hero.x - HERO_SX; cam.y = hero.y - HERO_SY;
    banner = { text: T.castleOf(C.name), sub: T.castleN(num), t: 4, big: true };
    fade = 1;
  }

  function slash(big) { hero.lunge = 0.15; hero.big = big ? 0.2 : 0; }
  function strike(power, label) {
    if (hero.down > 0) return;
    slash(power > 1);
    const f = target();
    if (!f || f.x - hero.x > reach(f) + 30) return; // golpe no ar: só a animação
    const hit = power * heroPow();
    f.hp -= hit; f.flash = 0.1;
    const dmg = Math.round(hit * 10 + vr(4));
    F.push({ x: f.x + 4 * f.s, y: f.y - f.rows.length * f.s - (f.fly ? 12 : 4), t: (label ? label + ' ' : '') + dmg, c: power > 1 ? '#f0d040' : '#ffffff', life: 1 });
    if (power > 1 && !reduce) flash = Math.max(flash, 0.06);
    if (f.hp <= 0) kill(f);
  }
  function burst(x, y, colors, n = 14, speed = 40) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random());
      P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, c: vp(colors), life: 0.6 + Math.random() * 0.5, grav: 60 });
    }
    if (P.length > 220) P.splice(0, P.length - 220);
  }
  function kill(f) {
    f.dead = true;
    const cx = f.x + f.rows[0].length * f.s / 2, cy = f.y - f.rows.length * f.s / 2 - (f.fly ? 9 : 0);
    burst(cx, cy, [f.pal.g, f.pal.d, '#ffffff'], f.boss ? 60 : 14, f.boss ? 70 : 40);
    if (f.boss) { flash = 0.3; toast(T.defeated(f.name.split(',')[0])); window.tv?.celebrate(); }
  }
  function sparkle(colors, n = 10) {
    for (let i = 0; i < n; i++) P.push({ x: hero.x - 6 + Math.random() * 12, y: hero.y - Math.random() * 12, vx: (Math.random() - 0.5) * 10, vy: -12 - Math.random() * 18, c: vp(colors), life: 0.8 + Math.random() * 0.6, grav: 0 });
  }
  function hurt(n) {
    if (hero.down > 0) return;
    hero.hurt = 0.3; if (!reduce) flash = Math.max(flash, 0.05);
    if (!n) return;
    hero.hp -= n;
    F.push({ x: hero.x, y: hero.y - 16, t: '-' + Math.round(n), c: '#ff5c7a', life: 1 });
    if (hero.hp <= 0) { hero.hp = 0; hero.down = 2.5; F.push({ x: hero.x, y: hero.y - 22, t: T.down, c: '#ff5c7a', life: 1.5 }); }
  }
  function heal(frac) { hero.hp = Math.min(heroMax(), hero.hp + heroMax() * frac); }

  let toastT = 0;
  function toast(msg) { const el = $('gtoast'); el.textContent = msg; el.hidden = false; toastT = 2.6; }
  function setWx(k, announce) {
    if (!WX[k] || k === S.wx) return;
    S.wx = k;
    if (announce) { toast(T.say[k]); if (k === 'storm') flash = 0.25; }
  }

  // ---------- desenho ----------
  const sx = (x) => Math.round(x - cam.x), sy = (y) => Math.round(y - cam.y);
  function drawSky() {
    const bands = WX[S.wx], bh = Math.ceil(H / bands.length);
    bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * bh, W, bh); });
    if (S.wx === 'night') { g.fillStyle = '#e8e8ff'; STARS.forEach(([x, y]) => g.fillRect(x, y, 1, 1)); }
    if (S.wx === 'night' || S.wx === 'clear') { g.fillStyle = S.wx === 'night' ? '#f4f0d8' : '#f0d040'; g.beginPath(); g.arc(200, 12, 6, 0, 7); g.fill(); }
    if (S.wx === 'rain' || S.wx === 'storm') { g.fillStyle = '#8aa8d8'; RAIN.forEach((p) => g.fillRect(Math.round(p.x), Math.round(p.y), 1, 3)); }
    if (S.wx === 'snow') { g.fillStyle = '#ffffff'; RAIN.forEach((p) => g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)); }
    if (bat) sprite(BAT[Math.floor(now * 8) % 2], bat.x, bat.y, { d: '#0a0610' });
  }
  function flame(x, y, c) {
    g.fillStyle = c + '30'; g.fillRect(x - 2, y - 2, 5, 6);
    g.fillStyle = Math.random() < 0.5 ? c : '#ffffff';
    g.fillRect(x, y - (Math.random() < 0.3 ? 1 : 0), 1, 2);
  }
  // Fundo em ladrilhos de 64x48 com paralaxe: janelas (o céu e o clima aparecem por elas), pilares e o detalhe de cada área.
  function drawBackground() {
    const th = TH[z()];
    if (th.out) {
      drawSky();
      g.fillStyle = '#100c18';
      TOWERS.forEach(([w, h], i) => {
        const x = ((i * 26 - cam.x * 0.2) % 312 + 312) % 312 - 36, base = H - 4 - cam.y * 0.08;
        g.fillRect(x, base - h, w, h + 20); g.fillRect(x - 1, base - h - 2, 2, 2); g.fillRect(x + w - 1, base - h - 2, 2, 2);
      });
      return;
    }
    g.fillStyle = th.wall; g.fillRect(0, 0, W, H);
    const px = cam.x * 0.5, py = cam.y * 0.5, tx0 = Math.floor(px / 64) * 64, ty0 = Math.floor(py / 48) * 48;
    g.fillStyle = th.dark;
    for (let yy = Math.floor(py / 8) * 8; yy < py + H; yy += 8) g.fillRect(0, Math.round(yy - py), W, 1);
    const tiles = [];
    for (let xx = tx0 - 64; xx < px + W + 64; xx += 64) for (let yy = ty0 - 48; yy < py + H + 48; yy += 48) tiles.push([Math.round(xx - px), Math.round(yy - py)]);
    if (th.books) {
      for (const [x, y] of tiles) for (let shelf = 0; shelf < 4; shelf++) {
        const y0 = y + 4 + shelf * 10;
        for (let k = 0; k < 14; k++) { const [c, h] = BOOKS[(k + shelf * 7 + (x & 63)) % BOOKS.length]; g.fillStyle = c; g.fillRect(x + 12 + k * 3, y0 + 8 - h, 2, h); }
        g.fillStyle = th.dark; g.fillRect(x + 11, y0 + 8, 44, 2);
      }
    } else if (th.bones) {
      g.fillStyle = '#c8c4b0';
      for (const [x, y] of tiles) for (let k = 0; k < 3; k++) { g.fillRect(x + 18 + k * 12, y + 14 + (k % 2) * 10, 3, 2); g.fillStyle = '#000'; g.fillRect(x + 18 + k * 12, y + 15 + (k % 2) * 10, 1, 1); g.fillRect(x + 20 + k * 12, y + 15 + (k % 2) * 10, 1, 1); g.fillStyle = '#c8c4b0'; }
    } else {
      const win = (x, y) => { g.rect(x + 24, y + 12, 14, 22); g.rect(x + 26, y + 10, 10, 2); g.rect(x + 28, y + 8, 6, 2); };
      if (th.glass) {
        for (const [x, y] of tiles) for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { g.fillStyle = GLASS[(r + c + ((x >> 6) & 3)) % 4]; g.fillRect(x + 25 + c * 6, y + 12 + r * 5, 6, 5); }
        g.fillStyle = th.dark; for (const [x, y] of tiles) { g.fillRect(x + 30, y + 8, 2, 26); g.fillRect(x + 24, y + 22, 14, 1); }
        g.fillStyle = '#fff0b010'; for (const [x, y] of tiles) g.fillRect(x + 20, y + 34, 22, 14);
      } else {
        g.save(); g.beginPath(); tiles.forEach(([x, y]) => win(x, y)); g.clip(); drawSky(); g.restore();
        g.fillStyle = th.dark; for (const [x, y] of tiles) { g.fillRect(x + 30, y + 8, 2, 26); g.fillRect(x + 24, y + 22, 14, 1); g.fillRect(x + 22, y + 34, 18, 2); }
      }
      if (th.curtain) for (const [x, y] of tiles) { g.fillStyle = th.curtain; g.fillRect(x + 19, y + 6, 4, 30); g.fillRect(x + 39, y + 6, 4, 30); g.fillStyle = '#5a0820'; g.fillRect(x + 20, y + 6, 1, 30); g.fillRect(x + 41, y + 6, 1, 30); }
      if (th.banners) for (const [x, y] of tiles) { g.fillStyle = '#8a1020'; g.fillRect(x + 48, y + 6, 8, 22); g.fillRect(x + 49, y + 28, 2, 3); g.fillRect(x + 53, y + 28, 2, 3); g.fillStyle = '#f0c040'; g.fillRect(x + 51, y + 14, 2, 4); }
    }
    if (th.gears) for (const [x, y] of tiles) {
      const cx = x + 50, cy = y + 30, a = now * (((x >> 6) & 1) ? 0.6 : -0.6);
      g.fillStyle = '#3a4260'; g.beginPath(); g.arc(cx, cy, 8, 0, 7); g.fill();
      for (let k = 0; k < 8; k++) { const ang = a + k * Math.PI / 4; g.fillRect(Math.round(cx + Math.cos(ang) * 9) - 1, Math.round(cy + Math.sin(ang) * 9) - 1, 3, 3); }
      g.fillStyle = th.wall; g.beginPath(); g.arc(cx, cy, 3, 0, 7); g.fill();
    }
    for (let xx = tx0 - 64; xx < px + W + 64; xx += 64) { // pilares com castiçal
      const x = Math.round(xx - px);
      g.fillStyle = th.dark; g.fillRect(x, 0, 7, H);
      g.fillStyle = '#ffffff0c'; g.fillRect(x + 1, 0, 1, H);
      for (let yy = ty0 - 48; yy < py + H + 48; yy += 48) { const y = Math.round(yy - py); g.fillStyle = '#8a7040'; g.fillRect(x + 2, y + 24, 3, 2); flame(x + 3, y + 21, th.light); }
    }
    if (th.bones) { g.fillStyle = '#7cf5c80c'; g.fillRect(0, H - 14, W, 14); }
    if (S.wx === 'storm' || S.wx === 'rain') { g.fillStyle = '#00000020'; g.fillRect(0, 0, W, H); }
  }
  function floor(x0, x1, y, th) { // chão de pedra do nível y até o fundo da tela
    const a = Math.max(sx(x0), -2), b = Math.min(sx(x1), W + 2), top = sy(y);
    if (b <= a || top > H) return;
    g.fillStyle = th.fill; g.fillRect(a, top, b - a, H - top + 1);
    for (let x = Math.floor(x0 / 8) * 8; x < x1; x += 8) {
      const l = Math.max(sx(x), a), r = Math.min(sx(x + 8), b);
      if (r > l) { g.fillStyle = (x / 8) & 1 ? th.fa : th.fb; g.fillRect(l, top, r - l, 3); }
    }
    g.fillStyle = th.edge; g.fillRect(a, top, b - a, 1);
  }
  function wallCol(x, yTop, yBot, th) { g.fillStyle = th.dark; g.fillRect(sx(x) - 6, sy(yTop), 6, sy(yBot) - sy(yTop)); }
  function drawSeg(s, i) {
    const th = TH[s.z];
    if (s.x1 - cam.x < -20 || s.x0 - cam.x > W + 20 || s.y1 - cam.y > H + 60 || s.y0 - cam.y < -60) return;
    if (s.type === 'stairs') {
      for (let k = 0; k < s.n; k++) floor(s.x0 + k * 4, s.x0 + k * 4 + 4, s.y0 - (k + 1) * 4, th);
      floor(s.x0 + s.n * 4, s.x1, s.y1, th);
      g.fillStyle = th.edge; for (let k = 0; k <= s.n; k += 2) g.fillRect(sx(s.x0 + k * 4), sy(s.y0 - k * 4) - 10, 1, 10); // corrimão
      return;
    }
    if (s.type === 'shaft') {
      floor(s.x0, s.x1, s.y0, th);
      wallCol(s.x0, s.y1 - 30, s.y0, th);
      for (let k = 1; k <= s.h / 12; k++) {
        const px = k % 2 ? s.x0 + 28 : s.x0 + 10, py = s.y0 - k * 12, last = k === s.h / 12;
        const l = sx(px - 7), r = last ? sx(s.x1) : sx(px + 8);
        g.fillStyle = th.fa; g.fillRect(l, sy(py), r - l, 3); g.fillStyle = th.edge; g.fillRect(l, sy(py), r - l, 1);
      }
      return;
    }
    if (s.type === 'lift') {
      floor(s.x0, s.x1, s.y0, th);
      wallCol(s.x0, s.y1 - 30, s.y0, th);
      const ly = i < S.seg ? s.y1 : i > S.seg ? s.y0 : (seg === s && mi >= 2 ? hero.y : s.y0);
      g.fillStyle = '#6a6a7a'; for (let yy = s.y1 - 30; yy < ly; yy += 3) { g.fillRect(sx(s.x0 + 4), sy(yy), 1, 2); g.fillRect(sx(s.x0 + 20), sy(yy), 1, 2); }
      g.fillStyle = '#8a8a9a'; g.fillRect(sx(s.x0 + 2), sy(ly), 21, 3); g.fillStyle = '#ffd060'; g.fillRect(sx(s.x0 + 11), sy(ly) + 1, 3, 1);
      return;
    }
    floor(s.x0, s.x1, s.y0, th);
    if (s.z === 'gate' && s.type === 'hall') { g.fillStyle = th.wall; for (let x = Math.ceil(s.x0 / 10) * 10; x < s.x1; x += 10) g.fillRect(sx(x), sy(s.y0) - 6, 6, 6); }
    if (s.type === 'door') {
      const dx = sx(s.x0 + 14), dy = sy(s.y0);
      g.fillStyle = th.edge; g.fillRect(dx - 2, dy - 28, 18, 28); g.fillRect(dx, dy - 31, 14, 3); g.fillRect(dx + 3, dy - 33, 8, 2);
      g.fillStyle = '#000'; g.fillRect(dx, dy - 26, 14, 26); g.fillRect(dx + 2, dy - 28, 10, 2);
      g.fillStyle = '#5a5a6a'; for (let k = 0; k < 4; k++) g.fillRect(dx + 1 + k * 4, dy - 26, 1, i < S.seg || (seg === s && hero.x > s.x0 + 6) ? 6 : 26); // grade sobe quando o robô chega
    }
    if (s.type === 'rest') {
      const cx = sx(s.x0 + s.len / 2), cy = sy(s.y0), pulse = Math.sin(now * 3) * 0.5 + 0.5;
      g.fillStyle = `rgba(124,245,200,${0.08 + pulse * 0.1})`; g.fillRect(cx - 12, cy - 30, 24, 30);
      g.fillStyle = th.edge; g.fillRect(cx - 5, cy - 6, 10, 6); g.fillRect(cx - 3, cy - 8, 6, 2);
      g.fillStyle = '#7cf5c8'; const fy = cy - 16 + Math.round(Math.sin(now * 2) * 2);
      g.fillRect(cx - 1, fy - 4, 2, 8); g.fillRect(cx - 3, fy - 2, 6, 4); g.fillStyle = '#ffffff'; g.fillRect(cx - 1, fy - 2, 1, 2);
    }
    if (s.type === 'boss') {
      g.fillStyle = '#4a4a5a';
      for (const gx of [s.x0 + 6, s.x1 - 10]) for (let k = 0; k < 3; k++) g.fillRect(sx(gx) + k * 2, sy(s.y0) - 30, 1, 30);
    }
    if (s.type === 'finale') sprite(THRONE, sx(s.x0 + 70), sy(s.y0) - 16, { y: '#f0c040', r: '#8a1020' }, 2);
  }
  function drawFoe(f) {
    const h = f.rows.length * f.s;
    const fy = sy(f.y) - h - (f.fly ? 9 + Math.round(Math.sin(now * 4 + f.phase) * 2) : (Math.floor(now * 3 + f.phase) % 2));
    const fx = sx(f.x) - (f.lunge > 0 ? 3 : 0);
    if (f.boss) { const c = f.hp < f.max / 2 ? '#ff2040' : '#b98cff', halo = { g: c, d: c, k: c }; sprite(f.rows, fx - 1, fy, halo, f.s); sprite(f.rows, fx + 1, fy, halo, f.s); }
    sprite(f.rows, fx, fy, f.flash > 0 ? { g: '#fff', d: '#fff', k: '#fff' } : f.pal, f.s);
  }
  function drawHero() {
    const walking = moves[mi] && moves[mi].k === 'walk' && !fighting();
    const bx = sx(hero.x) - 5 + (hero.lunge > 0 ? 2 : 0) - (hero.hurt > 0.15 ? 2 : 0);
    const by = sy(hero.y) - 11 - (walking && Math.floor(now * 8) % 2 ? 1 : 0) + (hero.down > 0 ? 3 : 0);
    g.fillStyle = '#120818'; g.fillRect(bx + 1, by + 3, 9, 5);
    const eye = hero.down > 0 ? '#4a3a58' : hero.hurt > 0 ? '#ff5c7a' : '#4ff0ff';
    sprite(BOT, bx, by, { a: '#ff4fd8', b: '#ff4fd8', e: eye, m: eye });
    if (hero.hp < heroMax()) { // vida do robô: só aparece quando falta
      g.fillStyle = '#000'; g.fillRect(bx - 1, by - 5, 13, 3); g.fillStyle = '#3a1010'; g.fillRect(bx, by - 4, 11, 1);
      g.fillStyle = hero.hp < heroMax() / 3 ? '#ff5c7a' : '#7cf5c8'; g.fillRect(bx, by - 4, Math.round(11 * hero.hp / heroMax()), 1);
    }
    if (hero.lunge > 0) {
      g.fillStyle = hero.big > 0 ? '#ffffff' : '#f0d040';
      const len = hero.big > 0 ? 7 : 4;
      for (let i = 0; i < len; i++) g.fillRect(bx + 12 + i, by + 1 + i * 2, 1, 2);
    }
  }
  function drawMap() { // minimapa: só o que o robô já percorreu, no estilo dos metroidvanias
    const mw = 40, mh = 16, mx = W - mw - 4, my = 3;
    const ax = (x) => mx + 1 + Math.round(x / C.maxX * (mw - 3)), ay = (y) => my + 1 + Math.round((y - C.minY) / (0 - C.minY || 1) * (mh - 3));
    g.fillStyle = '#000000a0'; g.fillRect(mx, my, mw, mh);
    g.fillStyle = '#4ff0ff40'; g.fillRect(mx, my, mw, 1); g.fillRect(mx, my + mh - 1, mw, 1); g.fillRect(mx, my, 1, mh); g.fillRect(mx + mw - 1, my, 1, mh);
    g.fillStyle = '#4ff0ff';
    for (let i = 0; i <= S.seg; i++) {
      const s = C.segs[i], ex = i < S.seg ? s.x1 : hero.x, ey = i < S.seg ? s.y1 : hero.y;
      for (let k = 0; k <= 4; k++) g.fillRect(ax(s.x0 + (ex - s.x0) * k / 4), ay(s.y0 + (ey - s.y0) * k / 4), 1, 1);
    }
    if (Math.floor(now * 3) % 2) { g.fillStyle = '#ff4fd8'; g.fillRect(ax(hero.x), ay(hero.y), 1, 1); }
  }
  // Sala de descanso (estilo sala de save do Symphony of the Night): o robô espera aqui quando o Claude fica parado.
  function drawRoom() {
    const cx = W / 2, pulse = 0.5 + 0.5 * Math.sin(now * 2);
    g.fillStyle = '#0c0818'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#150e24';
    for (let y = 0; y < 48; y += 8) g.fillRect(0, y, W, 1);
    for (let y = 0, r = 0; y < 48; y += 8, r++) for (let x = (r & 1) * 8; x < W; x += 16) g.fillRect(x, y, 1, 8);
    for (const x of [28, 204]) { // pilares com tocha
      g.fillStyle = '#1c1430'; g.fillRect(x, 0, 8, 48); g.fillStyle = '#ffffff0c'; g.fillRect(x + 1, 0, 1, 48);
      g.fillStyle = '#8a7040'; g.fillRect(x + 2, 22, 4, 2); flame(x + 4, 19, '#ff9a3c');
    }
    g.fillStyle = '#1c1430'; g.fillRect(0, 48, W, H - 48); g.fillStyle = '#4a3a68'; g.fillRect(0, 48, W, 1);
    g.fillStyle = `rgba(255,79,216,${0.07 + 0.05 * pulse})`; g.fillRect(cx - 13, 8, 26, 40); // facho de luz
    g.fillStyle = `rgba(255,79,216,${0.35 + 0.35 * pulse})`; g.beginPath(); g.ellipse(cx, 49, 18, 3, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(cx, 49, 10, 1.5, 0, 0, 7); g.fill();
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 3 ? '#ff9ae8' : '#ffffff'; g.fillRect(Math.round(cx - 12 + (i * 7) % 24), Math.round(48 - (now * 7 + i * 9) % 38), 1, 1); }
    const bx = Math.round(cx - 5), by = 37;
    g.fillStyle = '#120818'; g.fillRect(bx + 1, by + 3, 9, 5);
    sprite(BOT, bx, by, { a: '#ff4fd8', b: '#ff4fd8', e: '#4ff0ff', m: '#4ff0ff' });
    for (let i = 0; i < 3; i++) { const t = (now * 0.5 + i / 3) % 1; g.globalAlpha = 1 - t; text('z', bx + 12 + Math.round(t * 8), by - 2 - Math.round(t * 14), '#b98cff', false, 1 + (i & 1)); }
    g.globalAlpha = 1;
    text(T.room, cx, 4, '#f0e0c0', true);
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (idle) {
      drawRoom();
      if (fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; g.fillRect(0, 0, W, H); }
      return;
    }
    drawBackground();
    for (let i = Math.max(0, S.seg - 3); i < Math.min(C.segs.length, S.seg + 4); i++) drawSeg(C.segs[i], i);
    foesHere().forEach(drawFoe);
    drawHero();
    for (const p of P) { g.fillStyle = p.c; g.globalAlpha = Math.max(0, Math.min(1, p.life * 2)); g.fillRect(sx(p.x), sy(p.y), 1, 1); }
    for (const f of F) { g.globalAlpha = Math.max(0, f.life); text(f.t, sx(f.x), sy(f.y), f.c, true); }
    g.globalAlpha = 1;
    const boss = seg && seg.boss && alive(seg.boss) ? seg.boss : null;
    if (boss) { // barra de vida do chefe, embaixo do nome, como nos jogos do gênero
      text(boss.name.split(',')[0], 6, 4, boss.hp < boss.max / 2 ? '#ff5c7a' : '#f0d040');
      g.fillStyle = '#000'; g.fillRect(5, 11, 62, 4); g.fillStyle = '#3a1010'; g.fillRect(6, 12, 60, 2);
      g.fillStyle = '#ff5c7a'; g.fillRect(6, 12, Math.max(0, Math.round(60 * boss.hp / boss.max)), 2);
    }
    drawMap();
    if (banner) {
      const a = Math.min(1, banner.t / 0.6, 1);
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = '#000000b0'; g.fillRect(0, banner.big ? 18 : 22, W, banner.sub ? 22 : 13);
      text(banner.text, W / 2, banner.big ? 21 : 26, '#f0e0c0', true, banner.big ? 2 : 1);
      if (banner.sub) text(banner.sub, W / 2, 33, '#b98cff', true);
      g.globalAlpha = 1;
    }
    if (flash > 0 && !reduce) { g.fillStyle = `rgba(235,235,255,${Math.min(TH[z()].out ? 0.6 : 0.3, flash * 3)})`; g.fillRect(0, 0, W, H); }
    if (fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; g.fillRect(0, 0, W, H); }
  }

  // ---------- laço ----------
  function step(dt) {
    const m = moves[mi];
    if (!m) { // fim do trecho
      if (seg.type === 'finale') return newCastle(S.castle + 1, (Math.random() * 2 ** 31) | 0);
      return enterSeg(S.seg + 1);
    }
    if (hero.down > 0 || fighting()) return; // caído não anda
    if (m.k === 'walk') {
      const dx = m.x - hero.x, dy = m.y - hero.y, d = Math.hypot(dx, dy), v = m.v * dt;
      if (d <= v) { hero.x = m.x; hero.y = m.y; mi++; } else { hero.x += dx / d * v; hero.y += dy / d * v; }
    } else if (m.k === 'jump') {
      if (!hero.jump) hero.jump = { x0: hero.x, y0: hero.y, t: 0 };
      const j = hero.jump; j.t += dt / m.dur;
      const t = Math.min(1, j.t);
      hero.x = j.x0 + (m.x - j.x0) * t;
      hero.y = j.y0 + (m.y - j.y0) * t - Math.sin(t * Math.PI) * 10;
      if (t >= 1) { hero.jump = null; mi++; }
    } else if (m.k === 'ride') {
      hero.y = Math.max(m.y, hero.y - m.v * dt);
      if (hero.y <= m.y) mi++;
    } else if (m.k === 'wait') {
      if (!m.started) { m.started = true; m.left = m.dur; if (m.rest) { heal(1); sparkle(['#7cf5c8', '#ffffff', '#4ff0ff'], 16); } }
      if ((m.left -= dt) <= 0) mi++;
    } else if (m.k === 'boss') {
      if (!seg.boss) { seg.boss = makeFoe(seg.z, seg.x0 + 130, seg.y0, true, seg.lord); banner = { text: seg.boss.name.split(',')[0], sub: seg.boss.name.split(', ')[1], t: 2.5 }; }
      if (seg.boss.dead) mi++;
    }
  }
  function update(dt) {
    now += dt;
    F.forEach((f) => { f.y -= 10 * dt; f.life -= dt; });
    while (F.length && F[0].life <= 0) F.shift();
    for (const p of P) { p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].life <= 0) P.splice(i, 1);
    if (toastT > 0 && (toastT -= dt) <= 0) $('gtoast').hidden = true;
    const fall = S.wx === 'snow' ? 8 : S.wx === 'storm' ? 90 : 60;
    RAIN.forEach((p) => { p.y += fall * p.v * dt; p.x -= S.wx === 'snow' ? Math.sin(p.y / 6) * 0.2 : S.wx === 'storm' ? 1 : 0.4; if (p.y > H) { p.y = -3; p.x = Math.random() * (W + 20); } if (p.x < -4) p.x = W; });
    if (bat) { bat.x -= 40 * dt; bat.y += Math.sin(now * 6) * 0.3; if (bat.x < -10) bat = null; }
    else if ((batT -= dt) <= 0) { batT = 6 + Math.random() * 10; bat = { x: W + 4, y: 4 + vr(14) }; }
    fade -= dt * 1.4; flash -= dt; hero.lunge -= dt; hero.hurt -= dt; hero.big -= dt;
    if (hero.down > 0 && (hero.down -= dt) <= 0) { hero.hp = heroMax() * 0.6; sparkle(['#7cf5c8', '#ffffff']); }
    else if (hero.down <= 0 && !fighting()) heal(0.06 * dt); // fora da luta recupera devagar
    if (banner && (banner.t -= dt) <= 0) banner = null;
    if (!realWx && (wxT -= dt) <= 0) {
      wxT = 50 + Math.random() * 70;
      let k; do { let r = Math.random() * 100; k = WX_WEIGHT.find(([, w]) => (r -= w) < 0)?.[0] || 'rain'; } while (k === S.wx);
      setWx(k, true);
    }
    if (S.wx === 'storm' && (boltT -= dt) <= 0) { boltT = 5 + Math.random() * 5; flash = Math.max(flash, 0.18); }
    if (seg.type === 'finale' && Math.random() < dt * 3) burst(hero.x + 20 + Math.random() * 80, hero.y - 30 - Math.random() * 15, ['#ff4fd8', '#4ff0ff', '#f0d040', '#7cf5c8'], 18, 35);

    if ((quietT += dt) > IDLE_S && !idle) { idle = true; fade = 1; }
    if (idle) { heal(0.3 * dt); return; } // na sala de descanso o castelo fica congelado
    // monstros: andam até o robô e batem de tempos em tempos
    for (const f of foesHere()) {
      f.flash -= dt; f.lunge -= dt;
      const gap = f.x - hero.x;
      if (gap > reach(f) && gap < 90) f.x -= (f.boss ? 14 : 10) * dt;
      if (hero.down <= 0 && gap <= reach(f) + 1 && (f.atkT += dt) >= (f.boss ? (f.hp < f.max / 2 ? 1.1 : 1.4) : 1.7)) { f.atkT = 0; f.lunge = 0.2; hurt(f.dmg * (0.8 + Math.random() * 0.4)); }
    }
    if (fighting() && (atkT += dt) >= 0.6) { atkT = 0; strike(1); }
    step(dt);
    const k = Math.min(1, dt * 5);
    cam.x += (hero.x - HERO_SX - cam.x) * k;
    cam.y += (hero.y - HERO_SY - cam.y) * k;
  }
  let hudT = 0, last = 0, saveT = 0;
  function frame(t) {
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
    update(dt);
    if (!S.hidden) draw();
    if ((hudT -= dt) <= 0) {
      hudT = 0.25;
      $('gCastle').textContent = S.castle;
      $('gZone').textContent = T.zones[z()];
      $('gPct').textContent = `${Math.floor(S.seg / C.segs.length * 100)}%`;
      const f = fighting() || (seg.boss && alive(seg.boss) ? seg.boss : null);
      $('gFoe').textContent = f ? '⚔ ' + f.name : '';
    }
    if ((saveT += dt) > 10) { saveT = 0; save(); }
    requestAnimationFrame(frame);
  }
  function save() { if (S) { S.t = Date.now(); window.game.onSave?.(S); } }
  addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  function renderLabels() {
    $('gCastleL').textContent = T.castle;
    $('hideBtn').textContent = S.hidden ? T.show : T.hide;
    $('arcade').classList.toggle('off', S.hidden);
  }
  $('hideBtn').onclick = () => { S.hidden = !S.hidden; renderLabels(); window.tv?.resize(); save(); };

  // ---------- o que o painel chama ----------
  window.game = {
    onSave: null,
    start(saved, lang) {
      if (S) return; // o init pode chegar de novo; um laço só
      T = L[lang] || L.en;
      const ok = saved && typeof saved === 'object' && Number.isInteger(saved.seed) && Number.isInteger(saved.castle);
      S = { castle: 1, seed: (Math.random() * 2 ** 31) | 0, seg: 0, wx: 'night', hidden: false, t: 0, ...(ok ? saved : { hidden: !!(saved && saved.hidden) }) };
      if (!WX[S.wx]) S.wx = 'night';
      const at = S.seg;
      newCastle(S.castle, S.seed);
      if (at > 0 && at < C.segs.length) { // volta ao trecho onde parou
        enterSeg(at);
        hero.x = seg.x0; hero.y = seg.y0;
        cam.x = hero.x - HERO_SX; cam.y = hero.y - HERO_SY;
        banner = { text: T.zones[seg.z], sub: T.castleOf(C.name), t: 3 };
      }
      hero.hp = heroMax();
      renderLabels();
      requestAnimationFrame(frame);
    },
    lang(lang) { T = L[lang] || L.en; if (S) renderLabels(); },
    level(n) { const was = heroMax(); LV = Math.max(1, n || 1); hero.hp = Math.min(heroMax(), hero.hp + heroMax() - was); },
    weather(kind) { realWx = !!WX[kind]; if (S && realWx) setWx(kind, true); },
    // passo novo do Claude: só os ao vivo, nunca o replay do feed
    event(kind) {
      if (!S) return;
      quietT = 0;
      if (idle) { idle = false; fade = 1; }
      if (kind === 'read') strike(1);
      else if (kind === 'search' || kind === 'hits') { strike(1); setTimeout(() => strike(1), 120); setTimeout(() => strike(1), 240); }
      else if (kind === 'edit') strike(3, 'EDIT');
      else if (kind === 'output') { heal(0.15); sparkle(['#7cf5c8', '#4ff0ff', '#ffffff']); }
      else if (kind === 'fail') hurt(heroMax() * 0.1);
      else if (kind === 'stop') sparkle(['#f0d040', '#ffffff', '#ff4fd8'], 18);
    },
  };
})();
