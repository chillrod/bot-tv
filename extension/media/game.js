// bot_tv arcade: um RPG idle no rodapé do painel. O robô desce um castelo sozinho, sala por sala;
// os passos do Claude dão empurrões (golpes, cura, dano, relíquias). O painel chama window.game.* e grava o save pela extensão.
(() => {
  const W = 240, H = 40, GROUND = 34, HX = 26, STOP = HX + 16;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (id) => document.getElementById(id);
  const cv = $('game'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const rnd = (n) => Math.floor(Math.random() * n);
  const pick = (a) => a[rnd(a.length)];

  // ---------- textos ----------
  const L = {
    en: {
      floor: 'floor', shop: 'workshop', hide: 'hide game', show: 'show game', shopH: 'Workshop (kept between runs)', relH: 'Relics this run',
      noRelics: 'none yet: chests, elites and bosses drop them', lv: 'lv', max: 'max',
      ups: { atk: ['Strength', '+1 damage'], hp: ['Vigor', '+8 health'], luck: ['Luck', '+3% crit'], spd: ['Rhythm', 'attack 7% faster'] },
      relics: {
        rosary: ['Rosary', '+15% crit'], chalice: ['Blood Chalice', 'each hit heals 2%'], cape: ['Bat Cape', '15% dodge'], grimoire: ['Grimoire', 'x5 spell every 6 hits'],
        crown: ['Cracked Crown', '+40% damage, −15% health'], reliquary: ['Reliquary', '+25% souls'], water: ['Holy Water', 'heals 20% each room'],
        sword: ['Short Sword', '+25% damage'], shield: ['Iron Shield', '−25% damage taken'], hourglass: ['Hourglass', 'attack 20% faster'],
      },
      biomes: ['Ramparts', 'Great Hall', 'Library', 'Catacombs', 'Clock Tower'],
      species: ['Gargoyle', 'Specter', 'Bat', 'Skeleton', 'Armor', 'Ghoul', 'Harpy', 'Golem', 'Lich', 'Slime', 'Crypt Hound', 'Hollow Bishop'],
      adj: ['Bone', 'Grim', 'Crimson', 'Pale', 'Ancient', 'Starving', 'Eyeless', 'Wax', 'Cursed', 'Cracked', 'Ash'],
      titles: ['King of Crypts', 'the Crimson', 'Lord of Mist', 'the Clockmaker', 'Fallen Bishop', 'Bell Warden', 'the Lightless', 'Candle Eater'],
      foe: (s, a) => `${a} ${s}`,
      floorMsg: (n, b) => `Floor ${n} · ${b}`, elite: 'Elite', enraged: (n) => `${n} is enraged`, fell: (f) => `Fell on floor ${f}. New run.`,
      shrine: 'Shrine: health restored', fountain: 'Old fountain: +1 damage this run', trap: 'Spike trap',
      merchant: (c) => `Merchant: ${c} souls for a relic`, broke: (c) => `Merchant: you lack ${c} souls`, ghost: 'A friendly ghost healed you', altar: 'Dark altar: a relic for blood',
      say: { clear: 'The sky cleared', rain: 'It started raining', snow: 'It started snowing', night: 'The full moon rose', storm: 'Storm!' },
      away: (n) => `Away: +${n} souls`, chest: 'a chest', shrineP: 'a shrine', odd: 'something odd…', dodge: 'dodge', magic: 'SPELL', bolt: 'BOLT',
    },
    pt: {
      floor: 'andar', shop: 'oficina', hide: 'esconder jogo', show: 'mostrar jogo', shopH: 'Oficina (fica entre expedições)', relH: 'Relíquias desta expedição',
      noRelics: 'nenhuma ainda: baús, elites e chefes soltam', lv: 'nv', max: 'máximo',
      ups: { atk: ['Força', '+1 de dano'], hp: ['Vigor', '+8 de vida'], luck: ['Sorte', '+3% de crítico'], spd: ['Ritmo', 'ataque 7% mais rápido'] },
      relics: {
        rosary: ['Rosário', '+15% de crítico'], chalice: ['Cálice de Sangue', 'cada golpe cura 2%'], cape: ['Capa de Morcego', '15% de esquiva'], grimoire: ['Grimório', 'magia x5 a cada 6 golpes'],
        crown: ['Coroa Rachada', '+40% de dano, −15% de vida'], reliquary: ['Relicário', '+25% de almas'], water: ['Água Benta', 'cura 20% a cada sala'],
        sword: ['Espada Curta', '+25% de dano'], shield: ['Escudo de Ferro', '−25% de dano recebido'], hourglass: ['Ampulheta', 'ataque 20% mais rápido'],
      },
      biomes: ['Muralha', 'Salão', 'Biblioteca', 'Catacumbas', 'Torre do Relógio'],
      // ":f" marca substantivo feminino; "m/f" são as duas formas do adjetivo, para concordar
      species: ['Gárgula:f', 'Espectro', 'Morcego', 'Esqueleto', 'Armadura:f', 'Carniçal', 'Harpia:f', 'Golem', 'Lich', 'Lodo', 'Cão das Criptas', 'Bispo Oco'],
      adj: ['de Ossos', 'Sombrio/Sombria', 'Carmesim', 'Pálido/Pálida', 'Ancestral', 'Faminto/Faminta', 'sem Olhos', 'de Cera', 'Maldito/Maldita', 'Rachado/Rachada', 'de Cinzas'],
      titles: ['Rei das Criptas', 'o Carmesim', 'Senhor da Névoa', 'o Relojoeiro', 'Bispo Caído', 'Guardião do Sino', 'o Sem Luz', 'Devorador de Velas'],
      foe: (s, a) => { const [n, gender] = s.split(':'), [m, f] = a.split('/'); return `${n} ${gender === 'f' && f ? f : m}`; },
      floorMsg: (n, b) => `Andar ${n} · ${b}`, elite: 'Elite', enraged: (n) => `${n} enfureceu`, fell: (f) => `Caiu no andar ${f}. Nova expedição.`,
      shrine: 'Santuário: vida restaurada', fountain: 'Fonte antiga: +1 de dano nesta expedição', trap: 'Armadilha de espinhos',
      merchant: (c) => `Mercador: ${c} almas por uma relíquia`, broke: (c) => `Mercador: faltam ${c} almas`, ghost: 'Um fantasma amigo curou tudo', altar: 'Altar sombrio: relíquia em troca de sangue',
      say: { clear: 'O céu abriu', rain: 'Começou a chover', snow: 'Começou a nevar', night: 'A lua cheia subiu', storm: 'Tempestade!' },
      away: (n) => `Fora: +${n} almas`, chest: 'um baú', shrineP: 'um santuário', odd: 'algo estranho…', dodge: 'esquiva', magic: 'MAGIA', bolt: 'RAIO',
    },
  };
  let T = L.en;

  // ---------- fonte de pixel 3x5: cada linha é um dígito octal (3 bits) ----------
  const FONT = {};
  ('0 75557 1 26227 2 71747 3 71317 4 55711 5 74717 6 74757 7 71122 8 75757 9 75717 A 25755 B 65656 C 34443 D 65556 E 74647 F 74644 G 34553 H 55755 I 72227 ' +
   'J 11152 K 55655 L 44447 M 57755 N 65555 O 25552 P 65644 Q 25563 R 65655 S 34216 T 72222 U 55557 V 55552 W 55775 X 55255 Y 55222 Z 71247 ' +
   '+ 02720 - 00700 ! 22202 ? 61202 . 00002 , 00024 : 02020 / 11244 % 51245 * 05250').split(' ').forEach((v, i, a) => { if (i % 2) FONT[a[i - 1]] = v; });
  function text(str, x, y, c, center) {
    str = String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (center) x -= Math.floor((str.length * 4 - 1) / 2);
    for (const pass of [0, 1]) {
      g.fillStyle = pass ? c : '#000';
      const o = pass ? 0 : 1;
      for (let i = 0; i < str.length; i++) {
        const gl = FONT[str[i]]; if (!gl) continue;
        for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (+gl[r] & (4 >> b)) g.fillRect(x + i * 4 + b + o, y + r + o, 1, 1);
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
  const CHEST = [['bbbbbbb', 'byyyyyb', 'bbbybbb', 'bbbbbbb'], ['y.y.y.y', 'byyyyyb', 'bbbybbb', 'bbbbbbb']];
  const ALTAR = ['..y..', '.yyy.', '..y..', 'wwwww', '.www.', '.www.', 'wwwww'];

  // ---------- monstros procedurais: metade sorteada, espelhada, com núcleo sólido e olhos ----------
  const SYL1 = ['Vla', 'Mor', 'Kar', 'Zef', 'Ul', 'Bel', 'Sar', 'Dre', 'Nox', 'Ves', 'Ast', 'Ler'];
  const SYL2 = ['kor', 'gath', 'mir', 'ion', 'eth', 'ul', 'oth', 'ena', 'ard', 'iel', 'umo'];
  function genRows(w, h) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let half = '';
      for (let x = 0; x < w; x++) half += Math.random() < (y === 0 || y === h - 1 ? 0.4 : 0.55) + x * 0.12 ? 'g' : '.';
      rows.push(half + [...half].reverse().join(''));
    }
    for (let y = 2; y < h - 2; y++) rows[y] = rows[y].slice(0, w - 1) + 'gg' + rows[y].slice(w + 1);
    const ey = 1 + rnd(2), ex = Math.max(1, w - 2 - rnd(2));
    const set = (r, c, ch) => { rows[r] = rows[r].slice(0, c) + ch + rows[r].slice(c + 1); };
    set(ey, ex, 'k'); set(ey, 2 * w - 1 - ex, 'k');
    for (let y = Math.ceil(h * 0.65); y < h; y++) rows[y] = rows[y].replace(/g/g, 'd');
    return rows;
  }
  function makeFoe(kind) {
    const b = biome(), boss = kind === 'boss', elite = kind === 'elite';
    const hue = b.hue[0] + rnd(b.hue[1] - b.hue[0]), light = 45 + rnd(20);
    const hp = Math.ceil(6 * 1.28 ** (R.floor - 1) * (1 + 0.06 * R.room) * (wx().hp || 1) * (boss ? 8 : elite ? 3 : 1));
    const name = boss ? `${pick(SYL1)}${pick(SYL2)}, ${pick(T.titles)}` : T.foe(pick(T.species), pick(T.adj));
    return {
      rows: boss ? genRows(5, 10) : genRows(4, 7 + rnd(2)), boss, elite, fly: !boss && Math.random() < 0.3, name, hp, max: hp,
      s: boss ? 2 : 1, x: W + 8, atkT: 0, flash: 0, enraged: false, phase: Math.random() * 6,
      pal: { g: `hsl(${hue} 55% ${light}%)`, d: `hsl(${hue} 50% ${light - 20}%)`, k: pick(['#ff4040', '#ffe040', '#4ff0ff', '#ffffff']) },
    };
  }

  // ---------- cenários (um por andar) ----------
  const BIOMES = [
    { out: true, wall: '#2a2238', dark: '#18131f', fa: '#3a3448', fb: '#2e2a3a', hue: [80, 150], light: '#ffb84a' },
    { wall: '#3a1c2c', dark: '#22101a', fa: '#4a2a20', fb: '#3a2018', hue: [320, 360], light: '#ffd060', curtain: '#7a1030' },
    { wall: '#2c2418', dark: '#1a140c', fa: '#3c2c1c', fb: '#2e2214', hue: [20, 60], light: '#ffd060', books: true },
    { wall: '#1e2420', dark: '#101410', fa: '#2a302a', fb: '#202620', hue: [90, 170], light: '#7cf5c8', bones: true },
    { wall: '#22283a', dark: '#141826', fa: '#30364a', fb: '#262a3a', hue: [190, 260], light: '#ffd060', clock: true },
  ];
  const BOOKS = Array.from({ length: 80 }, () => [pick(['#7a2a2a', '#2a4a7a', '#4a6a2a', '#7a6a2a', '#5a2a6a']), 3 + rnd(3)]);
  const biomeIdx = () => (R.floor - 1) % BIOMES.length;
  const biome = () => BIOMES[biomeIdx()];
  const biomeName = () => T.biomes[biomeIdx()];

  // ---------- clima: vem da cidade (Open-Meteo, se configurado) ou vira sozinho ----------
  const WX = {
    clear: { gold: 1.1, sky: ['#1a2a6a', '#2a3c8a', '#3c5aa8', '#5878c0', '#7a98d4'] },
    rain: { gold: 1.3, hp: 1.2, sky: ['#1c2028', '#262c36', '#303844', '#3a4452', '#465262'] },
    snow: { eSpd: 1.5, sky: ['#4c5a78', '#5c6a88', '#6c7a98', '#7c8aa8', '#909cb8'] },
    night: { crit: 0.1, sky: ['#04041a', '#0a0a28', '#121238', '#1c1a4a', '#28225c'] },
    storm: { bolt: true, gold: 1.15, sky: ['#120c18', '#1c1424', '#261c30', '#30243c', '#3a2c48'] },
  };
  const WX_WEIGHT = [['rain', 30], ['night', 25], ['clear', 20], ['storm', 15], ['snow', 10]];
  let realWx = false;

  // ---------- relíquias: valem só para a expedição e somam entre si ----------
  const RELICS = Object.keys(L.en.relics);

  // ---------- estado ----------
  const DEFRUN = () => ({ floor: 1, room: 0, rooms: genRooms(), hp: 0, relics: [], bonus: 0, hits: 0 });
  function genRooms() {
    const pool = ['fight', 'fight', 'fight', 'elite', 'chest', 'shrine', 'event', 'event'];
    const rooms = Array.from({ length: 5 }, () => pick(pool));
    if (!rooms.includes('fight')) rooms[0] = 'fight';
    rooms.push('boss');
    return rooms;
  }
  let S = null, R = null, LVB = 1;
  const wx = () => WX[S.wx];
  const rc = (id) => R.relics.filter((x) => x === id).length;
  const maxHp = () => Math.round((30 + 8 * S.up.hp) * (1 - 0.15 * Math.min(3, rc('crown'))));
  const dmg = () => (2 + S.up.atk + R.bonus) * LVB * (1 + 0.25 * rc('sword') + 0.4 * rc('crown'));
  const critCh = () => Math.min(0.8, 0.05 + 0.03 * S.up.luck + 0.15 * rc('rosary') + (wx().crit || 0));
  const atkMs = () => 1100 * 0.93 ** S.up.spd * 0.8 ** rc('hourglass');
  const dodge = () => Math.min(0.6, 0.15 * rc('cape'));
  const soulMult = () => (1 + 0.25 * rc('reliquary')) * (wx().gold || 1);
  function fmt(n) {
    n = Math.floor(n);
    if (n < 1e4) return String(n);
    const u = ['k', 'M', 'B', 'T']; let i = -1;
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return n.toFixed(n < 10 ? 1 : 0) + u[i];
  }

  // ---------- mundo ----------
  let E = null, foes = [], prop = null, scroll = 0, shake = 0, flashSky = 0, atkT = 0, boltT = 6, fade = 0, lastEv = 0, now = 0;
  let wxT = 60, batT = 4, bat = null;
  const HR = { lunge: 0, hurt: 0, magic: 0 };
  const F = [];
  const STARS = Array.from({ length: 30 }, () => [rnd(W), rnd(20)]);
  const P = Array.from({ length: 50 }, () => ({ x: Math.random() * W, y: Math.random() * GROUND, v: 0.6 + Math.random() * 0.6 }));
  const TOWERS = Array.from({ length: 12 }, () => [6 + rnd(8), 10 + rnd(14)]);
  const DUST = Array.from({ length: 10 }, () => ({ x: Math.random() * W, y: 6 + Math.random() * 24, v: 0.5 + Math.random() }));
  const arrived = () => E && E.x <= STOP;

  function float(x, y, t, c) { F.push({ x, y, t, c, life: 1 }); if (F.length > 24) F.shift(); }
  let toastT = 0;
  function toast(msg) { const el = $('gtoast'); el.textContent = msg; el.hidden = false; toastT = 2.6; }

  function enterRoom() {
    const type = R.rooms[R.room];
    if (rc('water')) heal(0.2 * rc('water'), true);
    if (type === 'fight') foes = Array.from({ length: 2 + rnd(2) }, () => makeFoe('fight'));
    else if (type === 'elite' || type === 'boss') foes = [makeFoe(type)];
    else { foes = []; prop = { kind: type, x: W + 10, done: false }; }
    E = foes.shift() || null;
    if (E && E.boss) toast(E.name);
    else if (E && E.elite) toast(`${T.elite}: ${E.name}`);
  }
  function nextRoom() {
    R.room++;
    if (R.room >= R.rooms.length) {
      R.floor++; R.room = 0; R.rooms = genRooms();
      S.best = Math.max(S.best, R.floor);
      fade = 1;
      toast(T.floorMsg(R.floor, biomeName()));
    }
    enterRoom();
  }
  function hit(mult = 1, label = '') {
    if (!E) return;
    let d = dmg() * mult;
    const crit = Math.random() < critCh();
    if (crit) d *= 3;
    d = Math.max(1, Math.round(d));
    E.hp -= d; E.flash = 0.1; HR.lunge = 0.14;
    float(E.x + 4 * E.s, GROUND - E.rows.length * E.s - 7 - (E.fly ? 8 : 0), (label ? label + ' ' : '') + fmt(d) + (crit ? '!' : ''), crit ? '#f0d040' : '#ffffff');
    if (crit && !reduce) shake = 0.1;
    if (rc('chalice')) heal(0.02 * rc('chalice'), true);
    if (E.boss && !E.enraged && E.hp < E.max / 2) { E.enraged = true; toast(T.enraged(E.name.split(',')[0])); }
    const spell = rc('grimoire') && ++R.hits % Math.max(2, 7 - rc('grimoire')) === 0 && label !== T.magic;
    if (E.hp <= 0) die();
    if (spell) { HR.magic = 0.3; setTimeout(() => hit(5, T.magic), 120); } // depois do die: a magia vai no próximo monstro
  }
  function die() {
    const souls = Math.ceil(1.25 ** (R.floor - 1) * (E.elite ? 3 : 1) * (E.boss ? 15 : 1) * soulMult());
    S.souls += souls;
    float(E.x + 6, 8, '+' + fmt(souls) + '*', '#b98cff');
    if (E.boss) { window.tv?.celebrate(); gainRelic(); heal(0.4, true); }
    else if (E.elite && Math.random() < 0.6) gainRelic();
    E = foes.shift() || null;
    if (!E) nextRoom();
  }
  function hurt(n) {
    if (Math.random() < dodge()) { float(HX + 6, 10, T.dodge, '#4ff0ff'); return; }
    n = Math.ceil(n * (1 - 0.25 * Math.min(3, rc('shield'))));
    R.hp -= n; HR.hurt = 0.3;
    float(HX + 6, 10, '-' + fmt(n), '#ff5c7a');
    if (!reduce) shake = 0.12;
    if (R.hp <= 0) {
      S.runs++;
      toast(T.fell(R.floor));
      R = DEFRUN(); R.hp = maxHp(); fade = 1; prop = null;
      enterRoom(); renderRelics();
    }
  }
  function heal(frac, quiet) {
    const before = R.hp;
    R.hp = Math.min(maxHp(), R.hp + maxHp() * frac);
    if (!quiet && R.hp > before) float(HX + 6, 10, '+' + fmt(R.hp - before), '#7cf5c8');
  }
  function gainRelic() {
    const id = pick(RELICS);
    R.relics.push(id);
    R.hp = Math.min(R.hp, maxHp());
    toast(`${T.relics[id][0]}: ${T.relics[id][1]}`);
    renderRelics();
  }
  function useProp(p) {
    if (p.kind === 'chest') return gainRelic();
    if (p.kind === 'shrine') { heal(0.5); return toast(T.shrine); }
    const cost = 15 * R.floor, run = R, ev = pick(['fountain', 'trap', 'merchant', 'ghost', 'altar']);
    const later = () => setTimeout(() => { if (R === run) gainRelic(); }, 900); // não entrega relíquia numa expedição que já acabou
    if (ev === 'fountain') { R.bonus++; toast(T.fountain); }
    if (ev === 'trap') { toast(T.trap); hurt(Math.ceil(maxHp() * 0.2)); }
    if (ev === 'merchant') { if (S.souls >= cost) { S.souls -= cost; toast(T.merchant(cost)); later(); } else toast(T.broke(cost)); }
    if (ev === 'ghost') { heal(1); toast(T.ghost); }
    if (ev === 'altar') { toast(T.altar); hurt(Math.ceil(maxHp() * 0.25)); later(); }
  }
  function setWx(k, announce) {
    if (!WX[k] || k === S.wx) return;
    S.wx = k;
    if (announce) { toast(T.say[k]); if (k === 'storm') flashSky = 0.25; }
  }

  // ---------- rodapé: oficina e relíquias ----------
  const UP = {
    atk: (l) => Math.ceil(10 * 1.15 ** l), hp: (l) => Math.ceil(10 * 1.15 ** l),
    luck: (l) => Math.ceil(25 * 1.3 ** l), spd: (l) => Math.ceil(30 * 1.4 ** l),
  };
  const UPMAX = { luck: 15, spd: 12 };
  const shop = $('shop');
  function buildShop() {
    shop.textContent = '';
    for (const k of Object.keys(UP)) {
      const b = document.createElement('button');
      b.className = 'up'; b.dataset.up = k;
      b.innerHTML = '<span class="n"><span></span><span class="lvl"></span></span><span class="d"></span><span class="c"></span>';
      b.querySelector('.n span').textContent = T.ups[k][0];
      b.querySelector('.d').textContent = T.ups[k][1];
      b.onclick = () => {
        const l = S.up[k], c = UP[k](l);
        if ((UPMAX[k] && l >= UPMAX[k]) || S.souls < c) return;
        S.souls -= c; S.up[k]++;
        if (k === 'hp') R.hp += 8;
        renderShop();
      };
      shop.append(b);
    }
  }
  function renderShop() {
    for (const b of shop.children) {
      const k = b.dataset.up, l = S.up[k], max = UPMAX[k] && l >= UPMAX[k], c = UP[k](l);
      b.querySelector('.lvl').textContent = `${T.lv} ${l}`;
      b.querySelector('.c').textContent = max ? T.max : '☠ ' + fmt(c);
      b.disabled = !!max || S.souls < c;
    }
  }
  function renderRelics() {
    const box = $('relics');
    box.textContent = '';
    const ids = [...new Set(R.relics)];
    if (!ids.length) { const e = document.createElement('em'); e.textContent = T.noRelics; box.append(e); return; }
    for (const id of ids) {
      const s = document.createElement('span');
      s.textContent = T.relics[id][0] + (rc(id) > 1 ? ' x' + rc(id) : '');
      s.title = T.relics[id][1];
      box.append(s);
    }
  }
  function renderLabels() {
    $('gFloorL').textContent = T.floor;
    $('shopH').textContent = T.shopH;
    $('relH').textContent = T.relH;
    $('shopBtn').textContent = `${T.shop} ${$('drawer').hidden ? '▸' : '▾'}`;
    $('hideBtn').textContent = S.hidden ? T.show : T.hide;
    $('arcade').classList.toggle('off', S.hidden);
  }
  $('shopBtn').onclick = () => { const d = $('drawer'); d.hidden = !d.hidden; $('shopBtn').setAttribute('aria-expanded', String(!d.hidden)); renderLabels(); };
  $('hideBtn').onclick = () => { S.hidden = !S.hidden; renderLabels(); window.tv?.resize(); save(); };

  // ---------- desenho ----------
  const per = (x, period, k) => ((x - scroll * k) % period + period) % period;
  function drawSky() {
    const w = wx(), bh = Math.ceil(GROUND / w.sky.length);
    w.sky.forEach((c, i) => { g.fillStyle = c; g.fillRect(-4, i * bh, W + 8, bh); });
    if (S.wx === 'night') { g.fillStyle = '#e8e8ff'; STARS.forEach(([x, y]) => g.fillRect(x, y, 1, 1)); }
    if (S.wx === 'night' || S.wx === 'clear') { g.fillStyle = S.wx === 'night' ? '#f4f0d8' : '#f0d040'; g.beginPath(); g.arc(196, 9, 5, 0, 7); g.fill(); }
    if (S.wx === 'rain' || S.wx === 'storm') { g.fillStyle = '#8aa8d8'; P.forEach((p) => g.fillRect(Math.round(p.x), Math.round(p.y), 1, 3)); }
    if (S.wx === 'snow') { g.fillStyle = '#ffffff'; P.forEach((p) => g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)); }
    if (bat) sprite(BAT[Math.floor(now * 8) % 2], bat.x, bat.y, { d: '#0a0610' });
  }
  function flame(x, y, c) {
    g.fillStyle = Math.random() < 0.5 ? c : '#ffffff';
    g.fillRect(x, y - (Math.random() < 0.3 ? 1 : 0), 1, 2);
    g.fillStyle = c + '33'; g.fillRect(x - 2, y - 2, 5, 5);
  }
  function drawBiome() {
    const b = biome();
    if (b.out) {
      drawSky();
      g.fillStyle = '#100c18';
      TOWERS.forEach(([w, h], i) => { const x = per(i * 22, 264, 0.15) - 24; g.fillRect(x, GROUND - 8 - h, w, h + 8); g.fillRect(x - 1, GROUND - 10 - h, 2, 2); g.fillRect(x + w - 1, GROUND - 10 - h, 2, 2); });
      g.fillStyle = b.wall; g.fillRect(-4, GROUND - 9, W + 8, 9);
      for (let i = 0; i < 26; i++) g.fillRect(per(i * 10, 260, 0.6) - 10, GROUND - 13, 6, 4);
      g.fillStyle = b.dark; for (let i = 0; i < 26; i++) g.fillRect(per(i * 10 + 5, 260, 0.6) - 10, GROUND - 7, 1, 7);
      for (let i = 0; i < 6; i++) { const x = per(i * 44 + 20, 264, 0.6) - 12; g.fillStyle = '#3a2a1a'; g.fillRect(x, GROUND - 17, 1, 8); flame(x, GROUND - 19, b.light); }
    } else {
      g.fillStyle = b.wall; g.fillRect(-4, 0, W + 8, GROUND);
      if (b.books) {
        for (let s = 0; s < 6; s++) {
          const x0 = per(s * 48 + 4, 288, 0.5) - 24;
          for (let shelf = 0; shelf < 3; shelf++) {
            const y0 = 6 + shelf * 9;
            for (let k = 0; k < 13; k++) { const [c, h] = BOOKS[(s * 13 + k + shelf * 5) % BOOKS.length]; g.fillStyle = c; g.fillRect(x0 + k * 3, y0 + 7 - h, 2, h); }
            g.fillStyle = b.dark; g.fillRect(x0 - 1, y0 + 7, 41, 2);
          }
        }
      } else {
        // janelas em arco: o céu (com chuva e raio) aparece por elas
        const wins = [];
        for (let i = 0; i < 6; i++) wins.push(per(i * 48 + 17, 288, 0.5) - 24);
        g.save(); g.beginPath();
        wins.forEach((x) => { g.rect(x, 9, 14, 14); g.rect(x + 2, 7, 10, 2); g.rect(x + 4, 5, 6, 2); });
        g.clip(); drawSky(); g.restore();
        g.fillStyle = b.dark; wins.forEach((x) => { g.fillRect(x + 6, 5, 2, 18); g.fillRect(x, 15, 14, 1); g.fillRect(x - 1, 23, 16, 2); });
        if (b.curtain) wins.forEach((x) => { g.fillStyle = b.curtain; g.fillRect(x - 4, 3, 4, 22); g.fillRect(x + 14, 3, 4, 22); g.fillStyle = '#5a0820'; g.fillRect(x - 3, 3, 1, 22); g.fillRect(x + 16, 3, 1, 22); });
        if (b.bones) { g.fillStyle = '#c8c4b0'; for (let i = 0; i < 14; i++) { const x = per(i * 20 + 3, 280, 0.5) - 20; g.fillRect(x, 27 + (i % 2) * 2, 2, 2); g.fillRect(x + 1, 29 - (i % 2) * 2, 1, 1); } }
        if (b.clock) {
          const cx = per(120, 360, 0.3) - 60;
          g.fillStyle = '#e8e0c0'; g.beginPath(); g.arc(cx, 15, 9, 0, 7); g.fill();
          g.fillStyle = b.dark; g.beginPath(); g.arc(cx, 15, 7, 0, 7); g.fill();
          g.strokeStyle = '#e8e0c0'; g.lineWidth = 1; g.beginPath();
          g.moveTo(cx, 15); g.lineTo(cx + Math.cos(now) * 6, 15 + Math.sin(now) * 6);
          g.moveTo(cx, 15); g.lineTo(cx + Math.cos(now / 12) * 4, 15 + Math.sin(now / 12) * 4); g.stroke();
        }
      }
      for (let i = 0; i < 6; i++) { // pilares com castiçal
        const x = per(i * 48, 288, 0.8) - 24;
        g.fillStyle = b.dark; g.fillRect(x, 0, 6, GROUND); g.fillRect(x - 1, 2, 8, 2); g.fillRect(x - 1, GROUND - 3, 8, 3);
        g.fillStyle = '#ffffff10'; g.fillRect(x + 1, 0, 1, GROUND);
        g.fillStyle = '#8a7040'; g.fillRect(x + 2, 14, 2, 3);
        flame(x + 3, 12, b.light);
      }
      if (S.wx === 'storm' || S.wx === 'rain') { g.fillStyle = '#00000022'; g.fillRect(-4, 0, W + 8, GROUND); }
      g.fillStyle = '#ffffff30'; DUST.forEach((d) => g.fillRect(Math.round(d.x), Math.round(d.y), 1, 1));
      if (b.bones) { g.fillStyle = '#7cf5c80d'; g.fillRect(-4, GROUND - 6, W + 8, 6); }
    }
    for (let row = 0; row < 2; row++) for (let i = 0; i < 42; i++) { // chão de pedra
      g.fillStyle = (i + row) % 2 ? b.fa : b.fb; g.fillRect(per(i * 6 + row * 3, 252, 1) - 6, GROUND + row * 3, 6, 3);
    }
    g.fillStyle = '#00000055'; g.fillRect(-4, GROUND, W + 8, 1);
  }
  function bar(x, y, w, f, c) {
    g.fillStyle = '#000'; g.fillRect(x - 1, y - 1, w + 2, 3);
    g.fillStyle = '#3a1010'; g.fillRect(x, y, w, 1);
    g.fillStyle = c; g.fillRect(x, y, Math.max(0, Math.round(w * Math.min(1, f))), 1);
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, shake > 0 ? Math.round(Math.random() * 2 - 1) : 0, 0);
    drawBiome();
    if (prop) {
      if (prop.kind === 'chest') sprite(CHEST[prop.done ? 1 : 0], prop.x, GROUND - 4, { b: '#8a5a2a', y: '#f0d040' });
      else if (prop.kind === 'shrine') { sprite(ALTAR, prop.x, GROUND - 7, { y: '#7cf5c8', w: '#a8a4c0' }); if (!prop.done) { g.fillStyle = '#7cf5c822'; g.fillRect(prop.x - 3, GROUND - 12, 11, 12); } }
      else { g.fillStyle = '#3a2a4a'; g.fillRect(prop.x, GROUND - 9, 6, 9); text('?', prop.x + 2, GROUND - 16 - (Math.floor(now * 3) % 2), '#b98cff'); }
    }
    const sleeping = performance.now() - lastEv > 60_000;
    const bx = HX + (HR.lunge > 0 ? 3 : 0), by = GROUND - 11 - (!arrived() && Math.floor(scroll / 5) % 2 ? 1 : 0);
    g.fillStyle = '#120818'; g.fillRect(bx + 1, by + 3, 9, 5);
    if (rc('cape')) { g.fillStyle = '#5a1030'; g.fillRect(bx - 2, by + 3, 2, 8); }
    sprite(BOT, bx, by, { a: '#ff4fd8', b: '#ff4fd8', e: HR.hurt > 0 ? '#ff5c7a' : sleeping ? '#4a3a58' : '#4ff0ff', m: HR.hurt > 0 ? '#ff5c7a' : '#4ff0ff' });
    if (HR.lunge > 0) { g.fillStyle = HR.magic > 0 ? '#b98cff' : '#f0d040'; for (let i = 0; i < 4; i++) g.fillRect(bx + 12 + i, by + 2 + i * 2, 1, 2); }
    if (HR.magic > 0) { g.fillStyle = '#b98cff55'; g.fillRect(bx - 2, by - 2, 15, 15); }
    bar(HX, by - 3, 11, R.hp / maxHp(), '#7cf5c8');
    if (E) {
      const ey = GROUND - E.rows.length * E.s - (E.fly ? 9 + Math.round(Math.sin(now * 4 + E.phase) * 2) : (Math.floor(now * 3 + E.phase) % 2));
      if (E.elite || E.enraged) {
        const c = E.enraged ? '#ff2040' : '#f0d040', halo = { g: c, d: c, k: c };
        sprite(E.rows, E.x - 1, ey, halo, E.s); sprite(E.rows, E.x + 1, ey, halo, E.s);
      }
      sprite(E.rows, E.x, ey, E.flash > 0 ? { g: '#fff', d: '#fff', k: '#fff' } : E.pal, E.s);
      bar(E.x, ey - 3, E.rows[0].length * E.s, E.hp / E.max, '#ff5c7a');
      if (E.boss) text(E.name.split(',')[0], W / 2, 2, E.enraged ? '#ff5c7a' : '#f0d040', true);
    }
    for (const f of F) { g.globalAlpha = Math.max(0, f.life); text(f.t, f.x, Math.round(f.y), f.c, true); }
    g.globalAlpha = 1;
    if (flashSky > 0 && !reduce) { g.fillStyle = `rgba(230,230,255,${Math.min(biome().out ? 0.6 : 0.3, flashSky * 3)})`; g.fillRect(-4, 0, W + 8, H); }
    if (fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; g.fillRect(-4, 0, W + 8, H); }
  }

  // ---------- laço ----------
  function update(dt) {
    now += dt;
    F.forEach((f) => { f.y -= 8 * dt; f.life -= dt * 0.9; });
    while (F.length && F[0].life <= 0) F.shift();
    if (toastT > 0 && (toastT -= dt) <= 0) $('gtoast').hidden = true;
    const fall = S.wx === 'snow' ? 6 : S.wx === 'storm' ? 90 : 60;
    P.forEach((p) => { p.y += fall * p.v * dt; p.x -= S.wx === 'snow' ? Math.sin(p.y / 6) * 0.2 : S.wx === 'storm' ? 1 : 0.4; if (p.y > GROUND) { p.y = -3; p.x = Math.random() * (W + 20); } if (p.x < -4) p.x = W; });
    DUST.forEach((d) => { d.x -= d.v * dt * 3; d.y += Math.sin(now + d.v * 9) * dt; if (d.x < 0) d.x = W; });
    if (bat) { bat.x -= 40 * dt; bat.y += Math.sin(now * 6) * 0.3; if (bat.x < -10) bat = null; }
    else if ((batT -= dt) <= 0) { batT = 6 + Math.random() * 10; bat = { x: W + 4, y: 3 + rnd(10) }; }
    fade -= dt * 1.5; HR.lunge -= dt; HR.hurt -= dt; HR.magic -= dt; shake -= dt; flashSky -= dt;
    if (!realWx && (wxT -= dt) <= 0) {
      wxT = 50 + Math.random() * 70;
      let k, r; do { r = Math.random() * 100; k = WX_WEIGHT.find(([, w]) => (r -= w) < 0)?.[0] || 'rain'; } while (k === S.wx);
      setWx(k, true);
    }
    if (E) E.flash -= dt;
    R.hp = Math.min(maxHp(), R.hp + maxHp() * 0.02 * dt);
    if (!E && !prop) enterRoom();
    if (prop) {
      const step = 40 * dt; prop.x -= step; scroll += step;
      if (!prop.done && prop.x <= HX + 14) { prop.done = true; useProp(prop); }
      if (prop && prop.x < -16) { prop = null; nextRoom(); }
      return;
    }
    if (!E) return;
    if (!arrived()) { const step = 45 * dt; E.x = Math.max(STOP, E.x - step); scroll += step; return; }
    if ((atkT += dt * 1000) >= atkMs()) { atkT = 0; hit(1); }
    if (!E || !arrived()) return;
    E.atkT += dt;
    const every = (E.boss ? (E.enraged ? 1.1 : 1.4) : E.elite ? 1.5 : 1.8) * (wx().eSpd || 1);
    if (E.atkT >= every) { E.atkT = 0; hurt(2 * 1.22 ** (R.floor - 1) * (E.elite ? 1.5 : 1) * (E.boss ? 1.5 : 1)); }
    if (wx().bolt && (boltT -= dt) <= 0) { boltT = 5 + Math.random() * 4; flashSky = 0.18; if (E) hit(5, T.bolt); }
  }
  let hudT = 0, last = 0, saveT = 0;
  function frame(t) {
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
    update(dt);
    if (!S.hidden) draw();
    if ((hudT -= dt) <= 0) {
      hudT = 0.25;
      $('gSouls').textContent = fmt(S.souls);
      $('gFloor').textContent = R.floor;
      $('gRoom').textContent = `${R.room + 1}/${R.rooms.length}`;
      $('gFoe').textContent = E ? '⚔ ' + E.name : prop ? { chest: T.chest, shrine: T.shrineP, event: T.odd }[prop.kind] : biomeName();
      if (!$('drawer').hidden) renderShop();
    }
    if ((saveT += dt) > 10) { saveT = 0; save(); }
    requestAnimationFrame(frame);
  }
  function save() { if (!S) return; S.t = Date.now(); S.run = R; window.game.onSave?.(S); }
  addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // ---------- o que o painel chama ----------
  window.game = {
    onSave: null,
    start(saved, lang) {
      if (S) return; // o init pode chegar de novo; um laço só
      T = L[lang] || L.en;
      const ok = saved && typeof saved === 'object';
      S = { souls: 0, best: 1, runs: 0, wx: 'night', hidden: false, t: 0, run: null, ...(ok ? saved : {}) };
      S.up = { atk: 0, hp: 0, luck: 0, spd: 0, ...(ok && saved.up ? saved.up : {}) };
      if (!WX[S.wx]) S.wx = 'night';
      R = S.run && Array.isArray(S.run.rooms) && Array.isArray(S.run.relics) ? S.run : DEFRUN();
      R.relics = R.relics.filter((id) => RELICS.includes(id));
      if (!R.hp) R.hp = maxHp();
      if (S.t) { // o robô seguiu explorando com o VS Code fechado (até 8 h)
        const secs = Math.min(8 * 3600, (Date.now() - S.t) / 1000);
        if (secs > 60) { const n = Math.floor(secs / 20 * 1.25 ** (R.floor - 1)); S.souls += n; setTimeout(() => toast(T.away(fmt(n))), 600); }
      }
      buildShop(); renderShop(); renderRelics(); renderLabels();
      enterRoom();
      if (!S.t) toast(T.floorMsg(R.floor, biomeName()));
      requestAnimationFrame(frame);
    },
    lang(lang) { T = L[lang] || L.en; if (S) { buildShop(); renderShop(); renderRelics(); renderLabels(); } },
    level(n) { LVB = 1 + 0.05 * Math.max(0, (n || 1) - 1); },
    weather(kind) { realWx = !!WX[kind]; if (S && realWx) setWx(kind, true); },
    // passo novo do Claude: só os ao vivo, nunca o replay do feed
    event(kind) {
      if (!S) return;
      lastEv = performance.now();
      if (kind === 'read') hit(1);
      else if (kind === 'search' || kind === 'hits') { hit(0.6); setTimeout(() => hit(0.6), 110); setTimeout(() => hit(0.6), 220); }
      else if (kind === 'edit') hit(4, 'EDIT');
      else if (kind === 'output') heal(0.3);
      else if (kind === 'fail') hurt(Math.ceil(maxHp() * 0.25));
      else if (kind === 'stop') gainRelic();
    },
  };
  lastEv = performance.now();
})();
