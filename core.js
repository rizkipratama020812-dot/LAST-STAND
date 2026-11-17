/* WAVE OF DOOM - core logic (no DOM). Works in browser and Node. */
(function (root) {
'use strict';

// =====================================================================================
//  PENGATURAN DIAMOND / SKIN  (ubah angka di sini)
// =====================================================================================
var SKINS_ENABLED = true;                               // false = fitur skin 'SEGERA HADIR' (skin tidak dipakai & layar skin tertutup); ubah ke true untuk membukanya
var START_GEMS = 10000;                                      // diamond awal untuk kerajaan BARU (contoh: 500 untuk testing)
var WIN_GEMS   = { easy: 15, normal: 40, hard: 100 };    // diamond yang didapat tiap menang, per tingkat kesulitan
var SKIN_COST  = [0, 10, 25, 50, 90];                    // harga upgrade: Besik(gratis), Elite, Apik, Colector, Spesial
// =====================================================================================

var W = 640, H = 360;
var BASE_X = 104;            // enemies stop here to hit the castle
var FIELD_TOP = 166, FIELD_BOT = 302;
var LEASH = 360;             // player units won't chase enemies beyond this x

// ---- DATA -------------------------------------------------------------
var UNITS = {
  swordsman: { name: 'Swordsman', cost: 30,  hp: 75,  dmg: 13, range: 17, cd: 0.70, speed: 36, h: 34, fx: 'slash1', desc: 'Murah & cepat' },
  archer:    { name: 'Archer',    cost: 45,  hp: 46,  dmg: 1200, range: 190, cd: 0.90, speed: 30, h: 33, proj: 'arrow', desc: 'Jarak jauh' },
  knight:    { name: 'Knight',    cost: 75,  hp: 190, dmg: 15, range: 18, cd: 0.90, speed: 27, h: 36, fx: 'slash2', desc: 'Tank tangguh' },
  spearman:  { name: 'Spearman',  cost: 55,  hp: 95,  dmg: 18, range: 32, cd: 0.90, speed: 31, h: 38, fx: 'spark2', desc: 'Tusukan jauh' },
  mage:      { name: 'Mage',      cost: 95,  hp: 52,  dmg: 30, range: 170, cd: 1.50, speed: 26, h: 35, proj: 'orb', aoe: 28, desc: 'Sihir area' },
  heavy:     { name: 'Heavy',     cost: 130, hp: 320, dmg: 40, range: 23, cd: 1.30, speed: 21, h: 40, fx: 'slash3', aoe: 26, desc: 'Tebasan area' }
};
var UNIT_ORDER = ['swordsman', 'archer', 'spearman', 'knight', 'mage', 'heavy'];

var ENEMIES = {
  goblin:     { name: 'Goblin',      tier: 1, hp: 38,  dmg: 6,  range: 15, cd: 0.80, speed: 33, h: 32, reward: 6,  fx: 'spark2' },
  skeleton:   { name: 'Skeleton',    tier: 1, hp: 56,  dmg: 8,  range: 17, cd: 0.90, speed: 28, h: 35, reward: 8,  fx: 'spark2' },
  slime:      { name: 'Slime',       tier: 1, hp: 82,  dmg: 5,  range: 13, cd: 1.00, speed: 20, h: 24, reward: 7,  fx: 'dust' },
  orc:        { name: 'Orc',         tier: 2, hp: 165, dmg: 16, range: 19, cd: 1.00, speed: 28, h: 40, reward: 18, fx: 'slash1' },
  darkknight: { name: 'Dark Knight', tier: 2, hp: 245, dmg: 18, range: 19, cd: 1.00, speed: 24, h: 40, reward: 24, fx: 'slash2' },
  darkarcher: { name: 'Dark Archer', tier: 2, hp: 112, dmg: 15, range: 118, cd: 1.10, speed: 26, h: 37, reward: 22, proj: 'arrow' },
  demon:      { name: 'Demon',       tier: 3, hp: 385, dmg: 34, range: 21, cd: 1.00, speed: 32, h: 44, reward: 40, fx: 'flame' },
  giant:      { name: 'Giant',       tier: 3, hp: 920, dmg: 58, range: 28, cd: 1.60, speed: 16, h: 58, reward: 70, fx: 'explosion3', aoe: 30 },
  darklord:   { name: 'Dark Lord',   tier: 3, hp: 530, dmg: 46, range: 112, cd: 1.40, speed: 22, h: 50, reward: 80, proj: 'dark', aoe: 24 }
};
var TIER_POOL = {
  1: ['goblin', 'skeleton', 'slime'],
  2: ['orc', 'darkknight', 'darkarcher'],
  3: ['demon', 'giant', 'darklord']
};

var MODES = {
  easy:   { id: 'easy',   label: 'EASY',   waves: 25,  hp: 0.55, dmg: 0.60, coin: 1.350, start: 200, baseHp: 650 },
  normal: { id: 'normal', label: 'NORMAL', waves: 50,  hp: 1.38, dmg: 1.22, coin: 1.00, start: 150, baseHp: 550 },
  hard:   { id: 'hard',   label: 'HARD',   waves: 100, hp: 2.45, dmg: 1.90, coin: 0.95, start: 140, baseHp: 500 }
};

var UPGRADES = {
  base:  { name: 'Benteng',   desc: '+160 HP markas & perbaikan', icon: 'shield', base: 90,  grow: 1.55, max: 10 },
  atk:   { name: 'Serangan',  desc: '+10% damage pasukan',        icon: 'swords', base: 110, grow: 1.60, max: 10 },
  vit:   { name: 'Ketahanan', desc: '+10% HP pasukan',            icon: 'heart',  base: 110, grow: 1.60, max: 10 },
  eco:   { name: 'Ekonomi',   desc: '+12% koin didapat',          icon: 'coin',   base: 100, grow: 1.55, max: 10 },
  cap:   { name: 'Kapasitas', desc: '+5 batas pasukan',           icon: 'crown',  base: 140, grow: 1.50, max: 8 }
};
var UP_ORDER = ['base', 'atk', 'vit', 'eco', 'cap'];
var UNIT_CAP_BASE = 22;

function rnd(a, b) { return a + Math.random() * (b - a); }
function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

// progress p in [0,1]
function progress(wave, total) { return total <= 1 ? 1 : (wave - 1) / (total - 1); }
function tierFor(p) { return p >= 0.66 ? 3 : (p >= 0.30 ? 2 : 1); }

// biome by wave NUMBER (10 biomes): grass 1-12, autumn 13-25, forest 26-37, snow 38-44, ice 45-50,
// desert 51-60, swamp 61-70, graveyard 71-80, volcano 81-90, castle 91-100
function biomeFor(wave) {
  if (wave <= 12) return 'grass';
  if (wave <= 25) return 'autumn';
  if (wave <= 37) return 'forest';
  if (wave <= 44) return 'snow';
  if (wave <= 50) return 'ice';
  if (wave <= 60) return 'desert';
  if (wave <= 70) return 'swamp';
  if (wave <= 80) return 'graveyard';
  if (wave <= 90) return 'volcano';
  return 'castle';
}

function Game(modeId, opts) {
  opts = opts || {};
  this.skins = opts.skins || {};
  this.biomeSel = opts.biome && opts.biome !== 'auto' ? opts.biome : 'auto';
  this.mode = MODES[modeId] || MODES.normal;
  this.total = this.mode.waves;
  this.coins = this.mode.start;
  this.baseMax = this.mode.baseHp;
  this.baseHp = this.baseMax;
  this.up = { base: 0, atk: 0, vit: 0, eco: 0, cap: 0 };
  this.ents = [];
  this.projs = [];
  this.fx = [];
  this.floats = [];
  this.wave = 0;
  this.phase = 'prep';       // prep | active | won | lost
  this.prepT = 6;
  this.spawnList = [];
  this.spawnIdx = 0;
  this.waveT = 0;
  this.kills = 0;
  this.nextId = 1;
  this.time = 0;
  this.baseHit = 0;
  this.msg = null;
  this.bossAlive = false;
  this.onWaveStart = null;
  this.onWaveClear = null;
  this.onEnd = null;
  this.onShake = null;
  this.onSound = null;
  this.wave = 1;             // first wave to be played
  this.prepT = 5;
}

Game.prototype.snd = function (n) { if (this.onSound) this.onSound(n); };
Game.prototype.unitCap = function () { return UNIT_CAP_BASE + this.up.cap * 5; };
Game.prototype.countPlayers = function () { var n = 0; for (var i = 0; i < this.ents.length; i++) { var e = this.ents[i]; if (e.side === 0 && e.state !== 'dead') n++; } return n; };
Game.prototype.countEnemies = function () {
  var n = 0; for (var i = 0; i < this.ents.length; i++) { var e = this.ents[i]; if (e.side === 1 && e.state !== 'dead') n++; }
  return n + Math.max(0, this.spawnList.length - this.spawnIdx);
};
Game.prototype.upCost = function (k) { var u = UPGRADES[k]; return Math.round(u.base * Math.pow(u.grow, this.up[k])); };

Game.prototype.addFx = function (type, x, y, dur, scale, extra) {
  if (this.fx.length > 90) this.fx.shift();
  var f = { type: type, x: x, y: y, age: 0, dur: dur || 0.4, s: scale || 1 };
  if (extra) for (var k in extra) f[k] = extra[k];
  this.fx.push(f);
};
Game.prototype.addFloat = function (x, y, text, color) {
  if (this.floats.length > 40) this.floats.shift();
  this.floats.push({ x: x, y: y, text: text, color: color, age: 0 });
};

Game.prototype.recruit = function (type) {
  var d = UNITS[type]; if (!d) return 'bad';
  if (this.phase === 'won' || this.phase === 'lost') return 'end';
  if (this.countPlayers() >= this.unitCap()) return 'cap';
  if (this.coins < d.cost) return 'coins';
  this.coins -= d.cost;
  this.spawnUnit(type);
  return 'ok';
};

Game.prototype.spawnUnit = function (type) {
  var d = UNITS[type];
  var hpMul = 1 + 0.10 * this.up.vit;
  var e = {
    id: this.nextId++, side: 0, type: type,
    x: BASE_X + 2, y: 234,
    hp: d.hp * hpMul, maxhp: d.hp * hpMul, baseHp: d.hp,
    dmg: d.dmg, range: d.range, cd: d.cd, cdT: rnd(0, 0.3), speed: d.speed * rnd(0.94, 1.06),
    state: 'walk', st: 0, anim: rnd(0, 1), atkT: 0, hitDone: true, hurtT: 0, deadT: 0,
    scale: 1, boss: false, slot: 0, ranged: !!d.proj && d.range >= 80, skin: this.skins[type] | 0
  };
  this.ents.push(e);
  this.formation(); e.y = e.fy;                // step out of the gate straight into your own lane
  this.snd('recruit');
  this.addFx('dust', e.x, e.y, 0.5, 0.35);
  return e;
};

Game.prototype.spawnEnemy = function (type, boss) {
  var d = ENEMIES[type];
  var p = progress(this.wave, this.total);
  var hm = (0.8 + 2.2 * p) * this.mode.hp;
  var dm = (0.85 + 1.2 * p) * this.mode.dmg;
  var bm = boss ? 5 : 1, bd = boss ? 1.5 : 1;
  var e = {
    id: this.nextId++, side: 1, type: type,
    x: W + 14 + rnd(0, 26), y: rnd(FIELD_TOP + 6, FIELD_BOT - 4),
    hp: d.hp * hm * bm, maxhp: d.hp * hm * bm,
    dmg: d.dmg * dm * bd, range: d.range * (boss ? 1.25 : 1), cd: d.cd, cdT: rnd(0, 0.5), speed: d.speed * rnd(0.92, 1.08) * (boss ? 0.8 : 1),
    state: 'walk', st: 0, anim: rnd(0, 1), atkT: 0, hitDone: true, hurtT: 0, deadT: 0,
    scale: boss ? 1.6 : 1, boss: !!boss, reward: d.reward * (boss ? 6 : 1)
  };
  if (boss) { this.snd('boss'); e.y = (FIELD_TOP + FIELD_BOT) / 2 + 10; e.x = W + 30; this.bossAlive = true; this.addFx('magic_circle', e.x - 60, e.y, 1.2, 1.4); }
  this.ents.push(e);
  return e;
};

// ---- waves ------------------------------------------------------------
Game.prototype.buildWave = function () {
  var w = this.wave, p = progress(w, this.total), tier = tierFor(p);
  var count = 3 + Math.round(17 * p) + Math.floor(w / 12);
  var list = [];
  function pick(t) { var a = TIER_POOL[t]; return a[Math.floor(Math.random() * a.length)]; }
  for (var i = 0; i < count; i++) {
    var r = Math.random(), t;
    if (tier === 1) t = 1;
    else if (tier === 2) t = r < 0.55 ? 2 : 1;
    else t = r < 0.40 ? 3 : (r < 0.80 ? 2 : 1);
    // keep a lid on tier-3 density
    var type = pick(t);
    if (t === 3 && type === 'giant' && Math.random() < 0.5) type = pick(3);
    list.push({ type: type, boss: false });
  }
  var span = 12 + count * 0.55;
  for (var j = 0; j < list.length; j++) list[j].t = (j / list.length) * span + Math.random() * 0.4;
  if (w % 10 === 0) {
    var bt = (w === this.total && this.total >= 50) ? 'darklord' : TIER_POOL[tier][(w / 10) % 3];
    list.push({ type: bt, boss: true, t: 2.0 });
  }
  list.sort(function (a, b) { return a.t - b.t; });
  this.spawnList = list; this.spawnIdx = 0; this.waveT = 0;
};

Game.prototype.startWave = function () {
  if (this.phase !== 'prep') return;
  this.buildWave();
  this.phase = 'active';
  if (this.onWaveStart) this.onWaveStart(this.wave);
};

Game.prototype.skipPrep = function () { if (this.phase === 'prep') this.startWave(); };

Game.prototype.buyUpgrade = function (k) {
  var u = UPGRADES[k]; if (!u) return 'bad';
  if (this.up[k] >= u.max) return 'max';
  var c = this.upCost(k);
  if (this.coins < c) return 'coins';
  this.coins -= c; this.up[k]++;
  this.snd('upgrade');
  if (k === 'base') { this.baseMax += 160; this.baseHp = Math.min(this.baseMax, this.baseHp + 160); }
  if (k === 'vit') {
    for (var i = 0; i < this.ents.length; i++) { var e = this.ents[i]; if (e.side === 0 && e.state !== 'dead') { var add = e.baseHp * 0.10; e.maxhp += add; e.hp += add; } }
  }
  return 'ok';
};

// ---- combat helpers ---------------------------------------------------
Game.prototype.nearest = function (e, side, maxX) {
  var best = null, bd = 1e9;
  for (var i = 0; i < this.ents.length; i++) {
    var o = this.ents[i];
    if (o.side !== side || o.state === 'dead') continue;
    if (maxX && o.x > maxX) continue;
    var d = Math.abs(o.x - e.x) + Math.abs(o.y - e.y) * 1.6;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
};

Game.prototype.damage = function (t, amount, fxType) {
  if (t.state === 'dead') return;
  t.hp -= amount;
  this.snd('hit');
  t.hurtT = 0.16;
  if (t.state !== 'attack' && !t.boss) t.state = 'hurt', t.st = 0.14;
  this.addFloat(t.x, t.y - (UNITS[t.type] || ENEMIES[t.type]).h * 0.9 * t.scale, String(Math.max(1, Math.round(amount))), t.side === 1 ? '#fff3a0' : '#ff8080');
  this.addFx(fxType || 'spark2', t.x, t.y - 14 * t.scale, 0.28, 0.45 * (t.scale > 1 ? 1.4 : 1));
  if (t.hp <= 0) this.kill(t);
};

Game.prototype.kill = function (t) {
  t.hp = 0; t.state = 'dead'; t.deadT = 0;
  this.snd(t.boss ? 'bossdie' : 'die');
  if (t.side === 1) {
    var gain = Math.round(t.reward * (1 + 0.12 * this.up.eco) * this.mode.coin * (1 + progress(this.wave, this.total) * 0.8));
    this.coins += gain; this.kills++;
    this.snd('coin');
    this.addFloat(t.x + 6, t.y - 30, '+' + gain, '#ffd84a');
    if (t.boss) {
      this.bossAlive = false;
      this.addFx('explosion', t.x, t.y - 20, 0.7, 1.8);
      this.addFx('explosion2', t.x - 14, t.y - 6, 0.8, 1.5);
      this.addFx('sparkle', t.x, t.y - 36, 1.0, 1.5);
      if (this.onShake) this.onShake(0.5);
    } else {
      this.addFx('smoke1', t.x, t.y - 10, 0.55, 0.6);
    }
  } else {
    this.addFx('dust', t.x, t.y - 8, 0.5, 0.5);
  }
};

Game.prototype.hitArea = function (cx, cy, radius, side, amount, fxType, exclude) {
  for (var i = 0; i < this.ents.length; i++) {
    var o = this.ents[i];
    if (o.side !== side || o.state === 'dead' || o === exclude) continue;
    if (dist(o.x, o.y, cx, cy) <= radius) this.damage(o, amount * 0.7, fxType);
  }
};

Game.prototype.doAttack = function (e, t, isBase) {
  var d = e.side === 0 ? UNITS[e.type] : ENEMIES[e.type];
  var dmg = e.dmg * (e.side === 0 ? (1 + 0.10 * this.up.atk) : 1);
  if (d.proj) {
    var kind = d.proj;
    this.snd(kind === 'arrow' ? 'arrow' : kind === 'orb' ? 'magic' : 'dark');
    this.projs.push({
      kind: kind, x: e.x + (e.side === 0 ? 10 : -10) * e.scale, y: e.y - d.h * 0.55 * e.scale,
      tx: isBase ? BASE_X - 30 : t.x, ty: isBase ? e.y - 16 : t.y - 14, target: isBase ? null : t,
      side: e.side, dmg: dmg, aoe: d.aoe || 0, speed: kind === 'arrow' ? 300 : 190, isBase: !!isBase, life: 3, ang: 0,
      ut: e.side === 0 && SKINS_ENABLED ? e.type : null, skin: e.skin | 0
    });
    if (kind === 'orb') this.addFx('sparkle', e.x + 10, e.y - 24, 0.3, 0.4);
    if (kind === 'dark') this.addFx('purple_fire', e.x - 8, e.y - 26, 0.4, 0.45);
    return;
  }
  var fxName = d.fx || 'spark2';
  if (e.side === 0 && SKINS_ENABLED) fxName = 'skin:' + e.type + ':' + (e.skin | 0);          // each skin brings its own slash / shield / burst effect
  this.snd(d.aoe ? 'heavy' : 'slash');
  if (isBase) {
    this.damageBase(dmg);
    this.addFx(fxName, BASE_X - 10, e.y - 16, 0.3, 0.6);
    return;
  }
  if (d.aoe) {
    this.hitArea(t.x, t.y, d.aoe, t.side, dmg, null, t);
    this.damage(t, dmg, fxName);
    if (fxName === 'explosion3') { this.addFx('dust', t.x, t.y, 0.5, 0.9); if (this.onShake) this.onShake(0.22); }
  } else {
    this.damage(t, dmg, fxName);
  }
};

Game.prototype.damageBase = function (amount) {
  if (this.phase === 'lost' || this.phase === 'won') return;
  this.baseHp -= amount; this.baseHit = 0.18;
  this.snd('basehit');
  this.addFloat(BASE_X - 24, 214, String(Math.round(amount)), '#ff6a6a');
  if (this.baseHp <= 0) {
    this.baseHp = 0; this.phase = 'lost';
    this.addFx('explosion', 60, 230, 0.8, 2.2); this.addFx('explosion2', 40, 250, 0.9, 1.8);
    this.addFx('purple_fire', 80, 240, 1.2, 1.6);
    if (this.onEnd) this.onEnd(false);
  }
};

// ---- main update ------------------------------------------------------
Game.prototype.update = function (dt) {
  if (dt > 0.05) dt = 0.05;
  this.time += dt;
  if (this.baseHit > 0) this.baseHit -= dt;

  if (this.phase === 'prep') {
    this.prepT -= dt;
    if (this.prepT <= 0) this.startWave();
  } else if (this.phase === 'active') {
    this.waveT += dt;
    while (this.spawnIdx < this.spawnList.length && this.spawnList[this.spawnIdx].t <= this.waveT) {
      var s = this.spawnList[this.spawnIdx++];
      this.spawnEnemy(s.type, s.boss);
    }
    if (this.spawnIdx >= this.spawnList.length && this.countEnemies() === 0) this.clearWave();
  }

  var i, e, ents = this.ents;
  this.formation();

  for (i = 0; i < ents.length; i++) {
    e = ents[i];
    e.anim += dt;
    if (e.hurtT > 0) e.hurtT -= dt;
    if (e.state === 'dead') { e.deadT += dt; continue; }
    if (e.cdT > 0) e.cdT -= dt;
    if (e.state === 'hurt') { e.st -= dt; if (e.st <= 0) e.state = 'walk'; else continue; }

    if (e.state === 'attack') {
      e.atkT -= dt;
      if (!e.hitDone && e.atkT <= 0.18) {
        e.hitDone = true;
        var t = e.tgt;
        if (e.tgtBase) this.doAttack(e, null, true);
        else if (t && t.state !== 'dead') this.doAttack(e, t, false);
      }
      if (e.atkT <= 0) e.state = 'walk';
      continue;
    }

    var d = e.side === 0 ? UNITS[e.type] : ENEMIES[e.type];
    var tgt = null, toBase = false;
    if (e.side === 0) {
      tgt = this.nearest(e, 1, LEASH);
    } else {
      tgt = this.nearest(e, 0);
      if (tgt && Math.abs(tgt.x - e.x) > 150 + e.range) tgt = null;
      if (!tgt || e.x - BASE_X < e.range + 4) {
        if (e.x - BASE_X <= e.range + 6) { toBase = true; tgt = null; }
      }
    }
    e.tgt = tgt; e.tgtBase = toBase;

    if (toBase) {
      e.state = 'idle';
      if (e.cdT <= 0) { e.cdT = e.cd; e.state = 'attack'; e.atkT = 0.42; e.hitDone = false; }
      continue;
    }
    if (tgt) {
      var dx = tgt.x - e.x, dy = tgt.y - e.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
      var inRange = Math.abs(dx) <= e.range && Math.abs(dy) <= Math.max(14, e.range * 0.5);
      if (inRange) {
        e.state = 'idle';
        if (e.cdT <= 0) { e.cdT = e.cd; e.state = 'attack'; e.atkT = 0.42; e.hitDone = false; }
        else if (e.ranged && e.side === 0 && dx < 60 && e.x > BASE_X + 22) {
          // archers & mages back away from enemies that get too close
          e.state = 'walk'; e.x -= e.speed * 1.1 * dt;
        }
      } else if (e.ranged && e.side === 0) {
        // hold the back line; only step forward a little (never past RHOLD) to get a target in range
        if (e.x < 222 && dx > 0) { e.state = 'walk'; e.x += e.speed * dt; } else this.toRally(e, dt);
      } else {
        e.state = 'walk';
        // approach: close x first, then y
        var sp = e.speed * dt;
        var mx = Math.abs(dx) > e.range * 0.8 ? (dx > 0 ? 1 : -1) : 0;
        var my = Math.abs(dy) > 4 ? (dy > 0 ? 1 : -1) : 0;
        e.x += mx * sp; e.y += my * sp * 0.7;
      }
    } else if (e.side === 0) {
      // return to rally position
      this.toRally(e, dt);
    } else {
      e.state = 'walk';
      e.x -= e.speed * dt;
      // drift toward a lane near the castle
      e.y += (Math.sin(e.id * 1.7 + this.time * 0.6)) * dt * 3;
    }
    if (e.y < FIELD_TOP) e.y = FIELD_TOP; if (e.y > FIELD_BOT) e.y = FIELD_BOT;
  }

  // soft separation
  for (i = 0; i < ents.length; i++) {
    var a = ents[i]; if (a.state === 'dead') continue;
    for (var j = i + 1; j < ents.length; j++) {
      var b = ents[j]; if (b.state === 'dead') continue;
      var ox = a.x - b.x; if (ox > 11 || ox < -11) continue;
      var oy = a.y - b.y; if (oy > 7 || oy < -7) continue;
      var push = 18 * dt;
      var sx = ox === 0 ? (a.id < b.id ? -1 : 1) : (ox > 0 ? 1 : -1);
      var sy = oy === 0 ? (a.id < b.id ? -1 : 1) : (oy > 0 ? 1 : -1);
      if (a.state !== 'attack') { a.x += sx * push * 0.6; a.y += sy * push; }
      if (b.state !== 'attack') { b.x -= sx * push * 0.6; b.y -= sy * push; }
    }
  }

  // projectiles
  for (i = this.projs.length - 1; i >= 0; i--) {
    var pr = this.projs[i];
    pr.life -= dt;
    if (pr.target && pr.target.state !== 'dead') { pr.tx = pr.target.x; pr.ty = pr.target.y - 14 * pr.target.scale; }
    var vx = pr.tx - pr.x, vy = pr.ty - pr.y, vd = Math.sqrt(vx * vx + vy * vy);
    pr.ang = Math.atan2(vy, vx);
    var step = pr.speed * dt;
    if (vd <= step + 3 || pr.life <= 0) {
      this.projHit(pr); this.projs.splice(i, 1);
    } else { pr.x += vx / vd * step; pr.y += vy / vd * step; }
  }

  // fx & floaters
  for (i = this.fx.length - 1; i >= 0; i--) { this.fx[i].age += dt; if (this.fx[i].age >= this.fx[i].dur) this.fx.splice(i, 1); }
  for (i = this.floats.length - 1; i >= 0; i--) { this.floats[i].age += dt; if (this.floats[i].age > 0.8) this.floats.splice(i, 1); }
  // cleanup dead
  for (i = ents.length - 1; i >= 0; i--) if (ents[i].state === 'dead' && ents[i].deadT > 0.9) ents.splice(i, 1);
};

// Neat battle lines: tanks in the front column, other melee behind them, shooters in their own block at the back.
// Rows are filled from the middle outwards so a small army still looks centred.
var ROWS = 5, ROW_GAP = 24, ROW_MID = 250, ROW_ORDER = [2, 1, 3, 0, 4];
var MELEE_PRIO = { knight: 0, heavy: 0, swordsman: 1, spearman: 2 };
var FRONT_X = 290, COL_GAP = 26, BACK_X = 160, BACK_GAP = 20;
Game.prototype.formation = function () {
  var melee = [], shoot = [], i, e, ents = this.ents;
  for (i = 0; i < ents.length; i++) {
    e = ents[i]; if (e.side !== 0 || e.state === 'dead') continue;
    (e.ranged ? shoot : melee).push(e);
  }
  melee.sort(function (a, b) { return (MELEE_PRIO[a.type] || 0) - (MELEE_PRIO[b.type] || 0) || a.id - b.id; });
  shoot.sort(function (a, b) { return a.id - b.id; });
  for (i = 0; i < melee.length; i++) {
    e = melee[i]; e.slot = i;
    e.fx = FRONT_X - Math.floor(i / ROWS) * COL_GAP;
    e.fy = ROW_MID + (ROW_ORDER[i % ROWS] - (ROWS - 1) / 2) * ROW_GAP;
  }
  for (i = 0; i < shoot.length; i++) {
    e = shoot[i]; e.slot = i;
    e.fx = BACK_X - Math.floor(i / ROWS) * BACK_GAP;
    e.fy = ROW_MID + (ROW_ORDER[i % ROWS] - (ROWS - 1) / 2) * ROW_GAP;
  }
};
Game.prototype.toRally = function (e, dt) {
  var rx = e.fx !== undefined ? e.fx : 212, ry = e.fy !== undefined ? e.fy : 234;
  var ddx = rx - e.x, ddy = ry - e.y, far = Math.abs(ddx) > 24 || Math.abs(ddy) > 24;
  if (Math.abs(ddx) > 1.5 || Math.abs(ddy) > 1.5) {
    e.state = 'walk';
    var s2 = e.speed * dt * (far ? 2.2 : 1);            // hurry to the line, then settle in gently
    var d = Math.sqrt(ddx * ddx + ddy * ddy) || 1, st = Math.min(s2, d);
    e.x += ddx / d * st; e.y += ddy / d * st;
  } else { e.x = rx; e.y = ry; e.state = 'idle'; }
};

Game.prototype.projHit = function (pr) {
  if (pr.isBase) {
    this.damageBase(pr.dmg); this.addFx('spark2', pr.x, pr.y, 0.3, 0.6); return;
  }
  var side = pr.side === 0 ? 1 : 0;
  if (pr.aoe) {
    this.snd('boom');
    if (pr.ut) this.addFx('skin:' + pr.ut + ':' + pr.skin, pr.x, pr.y - 4, 0.55, 0.9);
    else this.addFx(pr.kind === 'orb' ? 'crystal' : 'purple_fire', pr.x, pr.y, 0.5, pr.kind === 'orb' ? 0.8 : 0.7);
    if (pr.kind === 'orb' && !pr.ut) this.addFx('magic_circle', pr.x, pr.y + 8, 0.5, 0.45);
    this.hitArea(pr.x, pr.y, pr.aoe, side, pr.dmg, null, pr.target);
    if (pr.target && pr.target.state !== 'dead') this.damage(pr.target, pr.dmg, 'sparkle');
  } else if (pr.target && pr.target.state !== 'dead') {
    this.damage(pr.target, pr.dmg, 'spark2');
  }
};

Game.prototype.clearWave = function () {
  var bonus = Math.round((18 + 3 * this.wave) * (1 + 0.12 * this.up.eco) * this.mode.coin);
  this.coins += bonus;
  this.lastBonus = bonus;
  if (this.wave >= this.total) {
    this.phase = 'won';
    if (this.onEnd) this.onEnd(true);
    return;
  }
  this.baseHp = Math.min(this.baseMax, this.baseHp + this.baseMax * 0.12);
  // heal army a little
  for (var i = 0; i < this.ents.length; i++) { var e = this.ents[i]; if (e.side === 0 && e.state !== 'dead') e.hp = Math.min(e.maxhp, e.hp + e.maxhp * 0.35); }
  var prevBiome = this.biomeAt(this.wave);
  this.wave++;
  this.phase = 'prep'; this.prepT = 7;
  if (this.onWaveClear) this.onWaveClear(this.wave - 1, bonus, prevBiome !== this.biomeAt(this.wave));
};

Game.prototype.biomeAt = function (w) { return this.biomeSel === 'auto' ? biomeFor(w) : this.biomeSel; };

// ---- save / restore ---------------------------------------------------
Game.prototype.serialize = function () {
  var army = [];
  for (var i = 0; i < this.ents.length; i++) { var e = this.ents[i]; if (e.side === 0 && e.state !== 'dead') army.push(e.type); }
  return { v: 2, biome: this.biomeSel, mode: this.mode.id, wave: this.wave, coins: this.coins, baseHp: this.baseHp, baseMax: this.baseMax, up: this.up, army: army, kills: this.kills };
};
Game.restore = function (s, opts) {
  var g = new Game(s.mode, { biome: s.biome, skins: opts && opts.skins });
  g.wave = Math.max(1, Math.min(g.total, s.wave | 0)); g.coins = s.coins | 0; g.baseMax = s.baseMax; g.baseHp = Math.min(s.baseMax, s.baseHp);
  g.up = s.up; g.kills = s.kills | 0; g.phase = 'prep'; g.prepT = 6;
  for (var i = 0; i < s.army.length && i < 90; i++) {
    var u = g.spawnUnit(s.army[i]);
    g.formation(); u.x = u.fx; u.y = u.fy; u.state = 'idle'; g.fx.length = 0;
  }
  g.fx.length = 0;
  return g;
};

var API = {
  W: W, H: H, BASE_X: BASE_X, FIELD_TOP: FIELD_TOP, FIELD_BOT: FIELD_BOT,
  UNITS: UNITS, UNIT_ORDER: UNIT_ORDER, ENEMIES: ENEMIES, MODES: MODES, UPGRADES: UPGRADES, UP_ORDER: UP_ORDER,
  SKIN_NAMES: ['Besik', 'Elite', 'Apik', 'Colector', 'Spesial'], SKINS_ENABLED: SKINS_ENABLED, SKIN_COST: SKIN_COST, WIN_GEMS: WIN_GEMS, START_GEMS: START_GEMS,
  Game: Game, biomeFor: biomeFor, BIOME_IDS: ['grass','autumn','forest','snow','ice','desert','swamp','graveyard','volcano','castle'], progress: progress, tierFor: tierFor
};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.LS = API;
})(typeof window !== 'undefined' ? window : globalThis);
