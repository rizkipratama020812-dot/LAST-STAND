/* LAST STAND: WAVE DEFENSE - renderer, UI, loop. Pure JS + Canvas. */
(function () {
'use strict';
var LS = window.LS, W = LS.W, H = LS.H;
var UNITS = LS.UNITS, ENEMIES = LS.ENEMIES, MODES = LS.MODES, UPGRADES = LS.UPGRADES;
var MAN = window.ASSET_MANIFEST;
var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d');
var stage = $('stage'), hud = $('hud'), screens = $('screens');

/* ------------------------------------------------------------------ loader */
var IMG = {};               // 'folder/name' -> Image
function url(key) { return (window.ASSET_DATA && window.ASSET_DATA[key]) || 'assets/' + key + '.png'; }
var loadFailed = [];
function loadAll(done) {
  var list = [];
  for (var f in MAN) for (var n in MAN[f]) list.push(f + '/' + n);
  var total = list.length, got = 0;
  function tick() {
    got++;
    $('lfill').style.width = Math.round(got / total * 100) + '%';
    $('ltxt').textContent = 'Memuat aset… ' + got + '/' + total;
    if (got === total) done();
  }
  list.forEach(function (key) {
    var im = new Image(), tries = 0;
    im.onload = function () { IMG[key] = im; tick(); };
    im.onerror = function () {
      if (tries++ < 1) { im.src = url(key) + (window.ASSET_DATA ? '' : '?r=' + tries); return; }
      loadFailed.push(key); tick();
    };
    im.src = url(key);
  });
}
function img(folder, name) { return IMG[folder + '/' + name]; }

/* ------------------------------------------------------------------ sprite cache */
var scaledCache = {};
function scaleTo(im, w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  var x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(im, 0, 0, c.width, c.height);
  return c;
}
// scaled sprite by target height (cached)
function byH(folder, name, h) {
  h = Math.max(2, Math.round(h));
  var k = folder + '/' + name + '@' + h;
  if (scaledCache[k]) return scaledCache[k];
  var im = img(folder, name); if (!im) return null;
  var c = scaleTo(im, im.width * h / im.height, h);
  scaledCache[k] = c; return c;
}

var FRAMES = {
  // [folder, prefix, count, idle[], walk[], attack[]]
  swordsman: ['characters', 5, [0], [0, 1, 2], [3, 4]],
  archer:    ['characters', 4, [0], [0, 1], [2, 3]],
  knight:    ['characters', 4, [0], [0, 1, 2], [3]],
  spearman:  ['characters', 5, [0], [0, 1, 2], [3, 4]],
  mage:      ['characters', 4, [0], [0, 1], [2, 3]],
  heavy:     ['characters', 4, [2], [1, 2], [0, 3]],
  goblin:    ['enemies', 3, [0], [0, 1, 2], [1, 2]],
  skeleton:  ['enemies', 3, [0], [0, 1, 2], [1, 2]],
  slime:     ['enemies', 3, [0], [0, 1, 2], [2, 1]],
  orc:       ['enemies', 3, [0], [0, 1, 2], [1, 2]],
  darkknight:['enemies', 3, [0], [0, 1, 2], [1, 2]],
  darkarcher:['enemies', 3, [0], [0, 1, 2], [1, 2]],
  demon:     ['enemies', 3, [0], [0, 1, 2], [1, 2]],
  giant:     ['enemies', 2, [0], [0, 1], [1]],
  darklord:  ['enemies', 3, [0], [0, 1, 2], [1, 2]]
};
var unitSprites = {};   // type@scale -> {frames:[canvas], flash:[canvas], idleW}
function getUnitSprites(type, scale) {
  var key = type + '@' + scale;
  if (unitSprites[key]) return unitSprites[key];
  var fm = FRAMES[type], def = UNITS[type] || ENEMIES[type];
  var idle = img(fm[0], type + '_' + fm[2][0]); if (!idle) return null;
  var sc = def.h * scale / idle.height;
  var out = { frames: [], flash: [], idleW: idle.width * sc };
  for (var i = 0; i < fm[1]; i++) {
    var im = img(fm[0], type + '_' + i); if (!im) { out.frames.push(null); out.flash.push(null); continue; }
    var c = scaleTo(im, im.width * sc, im.height * sc);
    out.frames.push(c);
    var f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
    var fx = f.getContext('2d'); fx.drawImage(c, 0, 0);
    fx.globalCompositeOperation = 'source-atop'; fx.fillStyle = 'rgba(255,255,255,.75)'; fx.fillRect(0, 0, f.width, f.height);
    out.flash.push(f);
  }
  unitSprites[key] = out; return out;
}

var FXH = { slash1: 24, slash2: 24, slash3: 28, spark2: 18, sparkle: 18, explosion: 32, explosion2: 34, explosion3: 38, flame: 24,
  purple_fire: 26, dust: 18, smoke1: 22, crystal: 22, magic_circle: 24, blue_pillar: 42, tornado: 44, mage_orb: 12 };
function fxSprite(name, h) {
  var base = FXH[name] || 20; return byH('effects', name, Math.round(base * h / 2) * 2);
}

/* ------------------------------------------------------------------ static map */
var mapCache = {};
var curBiome = 'grass';
var fadeIn = 0;
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

var BIOME = {
  grass:  { bg: 'grass',  ground: 'grass_ground',  path: 'grass_path',
    back: [['tree', 50], ['tree_b', 44], ['pine', 42], ['bush_b', 16], ['rock', 14], ['bush', 16], ['tree', 56]],
    field: [['flowers', 10], ['flowers_b', 11], ['flower_y', 11], ['rock', 9], ['bush', 10]],
    front: [['tree', 60], ['bush_f', 24], ['fence_c', 20], ['signpost', 32], ['tree_b', 56], ['barrel_a', 18], ['crate', 16]] },
  forest: { bg: 'forest', ground: 'forest_ground', path: 'forest_path',
    back: [['tree_f2', 72], ['tree_f3', 70], ['tree_f1', 44], ['pine_s', 36], ['bush_f', 18], ['tree_f2', 64]],
    field: [['flower_y', 11], ['flower_y2', 11], ['stump', 14], ['rock_f', 11], ['bush_f', 12]],
    front: [['tree_f2', 76], ['tree_f3', 74], ['stump2', 20], ['bush_f', 24], ['lake_group', 70], ['pine_s', 40]] },
  snow:   { bg: 'snow', ground: 'snow_ground', path: 'snow_path',
    back: [['snow_pine1', 66], ['snow_pine2', 62], ['snow_cliff', 40], ['snow_dead', 52], ['snow_pine2', 54]],
    field: [['snow_bush1', 12], ['snow_rock1', 12], ['snow_rock2', 10], ['snow_bush1', 11]],
    front: [['snow_pine1', 72], ['snow_pine2', 66], ['snow_rock1', 22], ['snow_dead', 54], ['snow_rock2', 18]] },
  desert: { bg: 'desert', ground: 'desert_ground', path: 'desert_path',
    back: [['palm', 76], ['cactus2', 44], ['desert_rock', 36], ['palm', 70], ['cactus3', 28]],
    field: [['dry_grass', 12], ['sand_rock', 12], ['desert_stone', 10], ['bones', 12], ['skull', 10], ['cactus3', 18]],
    front: [['palm', 80], ['cactus2', 50], ['sand_rock', 26], ['desert_rock', 38], ['dry_grass', 18]] },
  castle: { bg: 'grass', ground: 'castle_ground', path: 'castle_path', tint: '#5a3a78',
    back: [['wall_h', 34], ['gate_arch', 58], ['wall_v', 50], ['banner_red', 44], ['wall_h', 30], ['tent_red', 36]],
    field: [['skull', 10], ['bones', 12], ['barrel_b', 14], ['crate', 13], ['skull', 9]],
    front: [['wall_v', 56], ['torch_a', 36], ['banner_red', 50], ['barrel_b', 22], ['fire_big', 34]] }
};

function tileFill(c, patchName, x0, y0, x1, y1, size, rnd) {
  var p = img('tiles', patchName); if (!p) return;
  for (var y = y0; y < y1; y += size) for (var x = x0; x < x1; x += size) {
    c.save(); c.translate(x + size / 2, y + size / 2);
    c.scale(rnd() < 0.5 ? -1 : 1, rnd() < 0.5 ? -1 : 1);
    c.drawImage(p, -size / 2, -size / 2, size, size); c.restore();
  }
}

function buildMap(biome) {
  if (mapCache[biome]) return mapCache[biome];
  var B = BIOME[biome], rnd = mulberry(biome.length * 977 + biome.charCodeAt(0) * 31);
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  // sky / scenery band
  var bgim = img('backgrounds', B.bg);
  if (bgim) {
    var sx = 8, sw = bgim.width - 16, sy = 44, sh = 60, sc = W / sw;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(bgim, sx, sy, sw, sh, 0, 0, W, Math.round(sh * sc));
    g.imageSmoothingEnabled = false;
    var skyBot = Math.round(sh * sc);
    g.fillStyle = '#7fb4e8'; if (skyBot < 150) g.fillRect(0, skyBot, W, 150 - skyBot);
  }
  // ground layer (feathered into the scenery)
  var gl = document.createElement('canvas'); gl.width = W; gl.height = H; var gc = gl.getContext('2d');
  tileFill(gc, B.ground, 0, 132, W, H, 32, rnd);
  gc.globalAlpha = 0.35; gc.save(); gc.translate(16, 16); tileFill(gc, B.ground, 0, 132, W, H, 32, rnd); gc.restore(); gc.globalAlpha = 1;
  // path band with irregular edges
  var pc = document.createElement('canvas'); pc.width = W; pc.height = H; var pg = pc.getContext('2d');
  tileFill(pg, B.path, 0, 200, W, 276, 32, rnd);
  var pm = document.createElement('canvas'); pm.width = W; pm.height = H; var pmg = pm.getContext('2d');
  pmg.fillStyle = '#000'; pmg.beginPath(); pmg.moveTo(0, 270);
  var topE = [], botE = [];
  for (var x = 0; x <= W; x += 12) { topE.push([x, 212 + Math.round((rnd() - 0.5) * 8)]); botE.push([x, 262 + Math.round((rnd() - 0.5) * 8)]); }
  pmg.beginPath(); topE.forEach(function (p, i) { i ? pmg.lineTo(p[0], p[1]) : pmg.moveTo(p[0], p[1]); });
  for (var i = botE.length - 1; i >= 0; i--) pmg.lineTo(botE[i][0], botE[i][1]); pmg.closePath(); pmg.fill();
  pg.globalCompositeOperation = 'destination-in'; pg.drawImage(pm, 0, 0);
  // path rim shadow
  var rim = pc.getContext('2d'); rim.globalCompositeOperation = 'source-over';
  rim.strokeStyle = 'rgba(0,0,0,.22)'; rim.lineWidth = 2;
  rim.beginPath(); topE.forEach(function (p, i) { i ? rim.lineTo(p[0], p[1]) : rim.moveTo(p[0], p[1]); }); rim.stroke();
  rim.beginPath(); botE.forEach(function (p, i) { i ? rim.lineTo(p[0], p[1]) : rim.moveTo(p[0], p[1]); }); rim.stroke();
  gc.drawImage(pc, 0, 0);
  // feather ground top edge
  gc.globalCompositeOperation = 'destination-in';
  var grad = gc.createLinearGradient(0, 132, 0, 168); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
  gc.fillStyle = grad; gc.fillRect(0, 0, W, H); gc.globalCompositeOperation = 'source-over';
  g.drawImage(gl, 0, 0);

  function place(list, count, yMin, yMax, xMin, xMax) {
    var items = [];
    for (var n = 0; n < count; n++) {
      var it = list[Math.floor(rnd() * list.length)];
      items.push({ n: it[0], h: it[1] * (0.85 + rnd() * 0.3), x: xMin + rnd() * (xMax - xMin), y: yMin + rnd() * (yMax - yMin) });
    }
    items.sort(function (a, b) { return a.y - b.y; });
    items.forEach(function (o) {
      var s = byH('decor', o.n, o.h); if (!s) return;
      g.drawImage(s, Math.round(o.x - s.width / 2), Math.round(o.y - s.height));
    });
  }
  // river with bridge on the grassland path
  if (biome === 'grass') {
    var rv = byH('decor', 'bridge_river', 148);
    if (rv) g.drawImage(rv, 318, 163);
  }
  place(B.back, 11, 150, 176, 120, 636);
  place(B.field, 9, 182, 300, 150, 630);
  place(B.front, 9, 318, 352, 8, 636);

  // base surroundings: fence line (defense line)
  var fe = byH('decor', 'fence_a', 22);
  if (fe) for (var fy = 176; fy < 312; fy += 17) g.drawImage(fe, 104, fy);
  // castle + support buildings
  var cs = byH('buildings', 'castle_s', 94); if (cs) g.drawImage(cs, 2, 198);
  var tw = byH('buildings', 'tower_s', 72); if (tw) g.drawImage(tw, 6, 148);
  var hs = byH('buildings', 'house_s', 52); if (hs) g.drawImage(hs, 56, 156);
  var tc = byH('decor', 'torch_a', 24);
  if (tc) { g.drawImage(tc, 96, 222); g.drawImage(tc, 96, 276); }

  // biome tint (dark castle)
  if (B.tint) {
    g.globalCompositeOperation = 'multiply'; g.fillStyle = B.tint; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    // re-draw base so the player's castle stays bright
    var cs2 = byH('buildings', 'castle_s', 94); if (cs2) g.drawImage(cs2, 2, 198);
    var vg = g.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 420); vg.addColorStop(0, 'rgba(20,0,30,0)'); vg.addColorStop(1, 'rgba(20,0,30,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  mapCache[biome] = c;
  return c;
}

/* ------------------------------------------------------------------ ambient */
var amb = [];
function initAmbient() {
  amb = [];
  var n = curBiome === 'snow' ? 46 : curBiome === 'castle' ? 26 : curBiome === 'desert' ? 22 : 18;
  for (var i = 0; i < n; i++) amb.push({ x: Math.random() * W, y: Math.random() * H, v: 0.4 + Math.random(), ph: Math.random() * 6 });
}
function drawAmbient(dt) {
  var b = curBiome;
  for (var i = 0; i < amb.length; i++) {
    var p = amb[i];
    if (b === 'snow') { p.y += (14 + p.v * 14) * dt; p.x += Math.sin(p.ph + game.time) * 6 * dt - 4 * dt; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(p.x | 0, p.y | 0, p.v > 1 ? 2 : 1, p.v > 1 ? 2 : 1); }
    else if (b === 'forest') { p.y += (8 + p.v * 6) * dt; p.x += Math.sin(p.ph + game.time * 1.5) * 12 * dt; ctx.fillStyle = 'rgba(150,210,80,.8)'; ctx.fillRect(p.x | 0, p.y | 0, 2, 1); }
    else if (b === 'desert') { p.x -= (40 + p.v * 30) * dt; p.y += Math.sin(p.ph + game.time) * 4 * dt; ctx.fillStyle = 'rgba(240,210,150,.55)'; ctx.fillRect(p.x | 0, p.y | 0, 3, 1); }
    else if (b === 'castle') { p.y -= (10 + p.v * 12) * dt; p.x += Math.sin(p.ph + game.time * 2) * 8 * dt; ctx.fillStyle = p.v > 1 ? 'rgba(255,140,50,.9)' : 'rgba(190,90,255,.8)'; ctx.fillRect(p.x | 0, p.y | 0, 1, 2); }
    else { p.x += 10 * dt; p.y += Math.sin(p.ph + game.time) * 5 * dt; ctx.fillStyle = 'rgba(255,255,210,.7)'; ctx.fillRect(p.x | 0, p.y | 0, 1, 1); }
    if (p.y > H) { p.y = -4; p.x = Math.random() * W; } if (p.y < -6) { p.y = H; p.x = Math.random() * W; }
    if (p.x < -6) p.x = W + 4; if (p.x > W + 6) p.x = -4;
  }
}

/* ------------------------------------------------------------------ rendering */
var game = null, shake = 0, shakeX = 0, shakeY = 0;
var endFx = [];

function frameIndex(e, def) {
  var fm = FRAMES[e.type];
  if (e.state === 'attack') {
    var a = fm[4], prog = 1 - Math.max(0, e.atkT) / 0.42;
    return a[Math.min(a.length - 1, Math.floor(prog * a.length))];
  }
  if (e.state === 'walk') { var w = fm[3]; return w[Math.floor(e.anim * 8) % w.length]; }
  return fm[2][0];
}

function drawEntity(e) {
  var sp = getUnitSprites(e.type, e.scale); if (!sp) return;
  var def = UNITS[e.type] || ENEMIES[e.type];
  var x = Math.round(e.x), y = Math.round(e.y);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  var sw = (sp.idleW * 0.45) | 0;
  ctx.beginPath(); ctx.ellipse(x, y - 1, sw, 3 * e.scale, 0, 0, 6.283); ctx.fill();

  var fi = frameIndex(e, def), fr = sp.frames[fi] || sp.frames[0];
  if (!fr) return;
  var lunge = 0, bob = 0;
  if (e.state === 'attack') { var pr = 1 - e.atkT / 0.42; lunge = Math.sin(Math.min(1, pr) * Math.PI) * 4 * (e.side === 0 ? 1 : -1) * e.scale; }
  else if (e.state === 'walk') bob = -Math.abs(Math.sin(e.anim * 10)) * 1.6;
  else bob = Math.sin(e.anim * 3 + e.id) * 0.5;
  var dx = fr.width > sp.idleW * 1.3 ? -sp.idleW / 2 : -fr.width / 2;
  var drawX = x + dx + lunge, drawY = y - fr.height + bob;

  if (e.state === 'dead') {
    var t = Math.min(1, e.deadT / 0.8);
    ctx.save(); ctx.globalAlpha = 1 - t * t;
    ctx.translate(x, y); ctx.rotate((e.side === 0 ? -1 : 1) * t * 1.45); ctx.translate(-x, -y);
    ctx.drawImage(sp.frames[fi] || sp.frames[0], x + dx, y - fr.height + t * 4);
    ctx.restore(); return;
  }
  var src = (e.hurtT > 0 && sp.flash[fi]) ? sp.flash[fi] : fr;
  ctx.drawImage(src, drawX | 0, drawY | 0);

  // health bar
  var bw = e.boss ? 34 : 16, bx = x - bw / 2, by = y - fr.height - (e.boss ? 9 : 5) + bob;
  ctx.fillStyle = '#000'; ctx.fillRect(bx - 1 | 0, by - 1 | 0, bw + 2, 4);
  ctx.fillStyle = '#3a1010'; ctx.fillRect(bx | 0, by | 0, bw, 2);
  var pct = Math.max(0, e.hp / e.maxhp);
  ctx.fillStyle = e.side === 0 ? (pct > 0.5 ? '#5ad65a' : pct > 0.25 ? '#e6c83a' : '#e0502a') : '#e0382e';
  ctx.fillRect(bx | 0, by | 0, Math.round(bw * pct), 2);
  if (e.boss) { var cr = byH('ui', 'crown', 11); if (cr) ctx.drawImage(cr, x - 6, by - 12 + Math.sin(game.time * 4) * 1); }
}

function drawProj(p) {
  if (p.kind === 'arrow') {
    var a = byH('characters', 'arrow', 7); if (!a) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.drawImage(a, -a.width / 2, -a.height / 2); ctx.restore();
  } else if (p.kind === 'orb') {
    var o = fxSprite('mage_orb', 1 + 0.15 * Math.sin(game.time * 20)); if (o) ctx.drawImage(o, p.x - o.width / 2, p.y - o.height / 2);
  } else {
    var d = fxSprite('purple_fire', 0.55); if (d) ctx.drawImage(d, p.x - d.width / 2, p.y - d.height / 2);
  }
}

function drawFx(f) {
  var t = f.age / f.dur, sp;
  var name = f.type;
  if (name === 'slash1' || name === 'slash2' || name === 'slash3') name = ['slash1', 'slash2', 'slash3'][Math.min(2, Math.floor(t * 3))] ;
  sp = fxSprite(name, f.s * (0.75 + 0.5 * t)); if (!sp) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t * t);
  var yy = f.y - (f.type === 'smoke1' || f.type === 'dust' ? t * 12 : 0);
  ctx.drawImage(sp, Math.round(f.x - sp.width / 2), Math.round(yy - sp.height / 2));
  ctx.restore();
}

function render(dt) {
  var g = game;
  ctx.save();
  if (shake > 0) { shake -= dt; shakeX = (Math.random() - 0.5) * 6 * shake * 2; shakeY = (Math.random() - 0.5) * 6 * shake * 2; ctx.translate(shakeX | 0, shakeY | 0); }
  ctx.drawImage(buildMap(curBiome), 0, 0);
  // animated bits at the base
  var fl = byH('decor', 'flag', 26);
  if (fl) ctx.drawImage(fl, 98, 190 - Math.round(Math.sin(g.time * 5) * 1));
  var tf = fxSprite('flame', 0.45 + Math.sin(g.time * 14) * 0.05);
  if (tf) { ctx.drawImage(tf, 96 - tf.width / 2 + 5, 218 - tf.height / 2); ctx.drawImage(tf, 96 - tf.width / 2 + 5, 272 - tf.height / 2); }
  if (curBiome === 'castle') {
    var pf = fxSprite('purple_fire', 0.8 + Math.sin(g.time * 9) * 0.06);
    if (pf) { ctx.drawImage(pf, 250, 156); ctx.drawImage(pf, 470, 154); ctx.drawImage(pf, 590, 330); }
  }
  if (g.baseHit > 0) { ctx.fillStyle = 'rgba(255,40,40,' + (g.baseHit * 1.4).toFixed(2) + ')'; ctx.fillRect(0, 140, 110, 190); }

  // entities sorted by y
  var ents = g.ents.slice().sort(function (a, b) { return a.y - b.y; });
  for (var i = 0; i < ents.length; i++) drawEntity(ents[i]);
  for (i = 0; i < g.projs.length; i++) drawProj(g.projs[i]);
  for (i = 0; i < g.fx.length; i++) drawFx(g.fx[i]);

  drawAmbient(dt);

  // floating numbers
  ctx.font = 'bold 8px "Courier New",monospace'; ctx.textAlign = 'center';
  for (i = 0; i < g.floats.length; i++) {
    var f = g.floats[i], a = 1 - f.age / 0.8;
    ctx.globalAlpha = Math.max(0, a);
    var fy = f.y - f.age * 22;
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.strokeText(f.text, f.x | 0, fy | 0);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x | 0, fy | 0);
  }
  ctx.globalAlpha = 1;

  // end-of-game particles
  if (endFx.length) {
    for (i = endFx.length - 1; i >= 0; i--) {
      var p = endFx[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.win ? 50 : -8) * dt;
      var sp = fxSprite(p.t, p.s); ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      if (sp) ctx.drawImage(sp, p.x - sp.width / 2, p.y - sp.height / 2);
      if (p.age > p.life) endFx.splice(i, 1);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (fadeIn > 0) { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, fadeIn) + ')'; ctx.fillRect(0, 0, W, H); fadeIn -= dt * 1.6; }
  if (g.phase === 'lost') { ctx.fillStyle = 'rgba(40,0,0,.35)'; ctx.fillRect(0, 0, W, H); }
}

/* ------------------------------------------------------------------ save */
var KEY = 'laststand_wavedefense_v1';
function loadSave() { try { return JSON.parse(localStorage.getItem(KEY)) || { saves: {}, best: {} }; } catch (e) { return { saves: {}, best: {} }; } }
function writeSave(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } }
function saveProgress() {
  if (!game || game.phase === 'lost' || game.phase === 'won') return;
  var s = loadSave(); s.saves[game.mode.id] = game.serialize();
  s.best[game.mode.id] = Math.max(s.best[game.mode.id] || 0, game.wave - 1); writeSave(s);
}

/* ------------------------------------------------------------------ HUD + screens */
var els = {};
function icon(n, cls) { return '<img class="' + (cls || '') + '" src="' + url('ui/' + n) + '" alt="">'; }
function buildHud() {
  var rec = LS.UNIT_ORDER.map(function (t) {
    var d = UNITS[t];
    return '<button class="btn rec" data-t="' + t + '"><img class="sp" src="' + url('characters/' + t + '_0') + '" alt=""><span class="nm">' + d.name.toUpperCase() +
      '</span><span class="cs">' + icon('coin') + d.cost + '</span></button>';
  }).join('');
  hud.innerHTML =
    '<div id="top">' +
      '<div class="chip" id="cWave">' + icon('crown') + '<span id="vWave">WAVE 1/25</span></div>' +
      '<div class="chip coin">' + icon('coin') + '<span id="vCoin">0</span></div>' +
      '<div class="chip">' + icon('swords') + '<span id="vArmy">0/22</span></div>' +
      '<div class="chip"><img class="pix" src="' + url('decor/skull') + '" alt=""><span id="vEnemy">0</span></div>' +
      '<div class="hpwrap">' + icon('heart') + '<div class="hpbar"><i id="vHp"></i><span id="vHpT"></span></div></div>' +
      '<span class="spacer"></span>' +
      '<button class="btn sq" id="bSpeed">x1</button>' +
      '<button class="btn sq" id="bPause">' + icon('pause') + '</button>' +
    '</div>' +
    '<div id="banner"></div><div id="toast"></div>' +
    '<button class="btn gold" id="startbtn" style="display:none">MULAI WAVE ▶</button>' +
    '<div id="bottom">' + rec +
      '<button class="btn side" id="bUp">' + icon('shield') + '<span>UPGRADE</span></button>' +
    '</div>';
  ['vWave', 'vCoin', 'vArmy', 'vEnemy', 'vHp', 'vHpT', 'banner', 'toast', 'startbtn', 'bSpeed', 'bUp', 'bPause'].forEach(function (k) { els[k] = $(k); });
  hud.querySelectorAll('.rec').forEach(function (b) { els['r_' + b.dataset.t] = b; });
  press(els.bPause, function () { openPause(); });
  press(els.bSpeed, function () { speed = speed === 1 ? 2 : 1; els.bSpeed.textContent = 'x' + speed; });
  press(els.bUp, function () { openUpgrades(); });
  press(els.startbtn, function () { if (game) game.skipPrep(); });
  hud.querySelectorAll('.rec').forEach(function (b) {
    press(b, function () {
      if (!game || paused) return;
      var r = game.recruit(b.dataset.t);
      if (r === 'coins') toast('Koin tidak cukup!'); else if (r === 'cap') toast('Batas pasukan penuh – beli Kapasitas!');
    });
  });
  hud.style.display = 'none';
}
var lastDown = -9999;
function press(el, fn) {
  el.addEventListener('pointerdown', function (ev) {
    ev.preventDefault(); lastDown = performance.now(); el.classList.add('press'); fn(ev);
  });
  var up = function () { el.classList.remove('press'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
  // synthesized click that follows a handled pointerdown (incl. "ghost" clicks on a freshly shown screen) is ignored;
  // a click with no preceding pointerdown (keyboard / assistive tech) still works.
  el.addEventListener('click', function (ev) { if (performance.now() - lastDown < 700) return; fn(ev); });
}
var toastT = 0;
function toast(t) { els.toast.textContent = t; els.toast.classList.add('show'); toastT = 1.6; }
var bannerT = 0;
function banner(html, boss, dur) { els.banner.innerHTML = html; els.banner.className = boss ? 'boss' : ''; els.banner.style.display = 'block'; bannerT = dur || 2.2; }

function updateHud() {
  var g = game; if (!g) return;
  els.vWave.textContent = 'WAVE ' + g.wave + '/' + g.total;
  els.vCoin.textContent = g.coins;
  els.vArmy.textContent = g.countPlayers() + '/' + g.unitCap();
  els.vEnemy.textContent = g.countEnemies();
  var pct = Math.max(0, g.baseHp / g.baseMax * 100);
  els.vHp.style.width = pct + '%';
  els.vHpT.textContent = Math.ceil(g.baseHp) + '/' + g.baseMax;
  LS.UNIT_ORDER.forEach(function (t) { els['r_' + t].classList.toggle('off', g.coins < UNITS[t].cost); });
  var showStart = g.phase === 'prep';
  els.startbtn.style.display = showStart ? 'block' : 'none';
  if (showStart) els.startbtn.textContent = 'MULAI WAVE ' + g.wave + ' ▶  ' + Math.max(0, Math.ceil(g.prepT)) + 's';
}

function showScreen(html, cls) { screens.innerHTML = '<div class="screen ' + (cls || '') + '">' + html + '</div>'; return screens.firstChild; }
function clearScreen() { screens.innerHTML = ''; }

var paused = false, speed = 1, inGame = false;

function openMenu() {
  inGame = false; paused = false; game = null; hud.style.display = 'none'; endFx.length = 0;
  var s = loadSave();
  var modeBtn = function (m) {
    var M = MODES[m], sv = s.saves[m], best = s.best[m] || 0;
    return '<button class="btn mode ' + (m === 'easy' ? 'green' : m === 'hard' ? 'red' : '') + '" data-m="' + m + '">' + M.label + '<small>' + M.waves + ' WAVE</small><small class="best">' +
      (best ? 'Terbaik: W' + best : 'Belum main') + '</small></button>';
  };
  var hasSave = Object.keys(s.saves).length > 0;
  var el = showScreen('<div class="title">LAST STAND</div><div class="subtitle">WAVE DEFENSE</div>' +
    '<div class="modes">' + modeBtn('easy') + modeBtn('normal') + modeBtn('hard') + '</div>' +
    '<div class="menurow">' + (hasSave ? '<button class="btn gold mbtn" id="mCont">LANJUTKAN</button>' : '') + '</div>' +
    '<div class="hint">Rekrut pasukan, bertahanlah dari serbuan musuh, dan lindungi markasmu. Boss muncul setiap 10 wave. Pilih mode untuk mulai baru.</div>' +
    '<div class="hint">Di buat oleh</div>' +
    '<div class="hint">Rizki</div>', 'menu');
  var bg = img('backgrounds', 'grass');
  if (bg) el.style.backgroundImage = 'url(' + url('backgrounds/grass') + ')';
  el.querySelectorAll('.mode').forEach(function (b) { press(b, function () { startGame(b.dataset.m, null); }); });
  var mc = $('mCont');
  if (mc) press(mc, function () { openContinue(); });
}
function openContinue() {
  var s = loadSave(), rows = '';
  ['easy', 'normal', 'hard'].forEach(function (m) {
    var sv = s.saves[m]; if (!sv) return;
    rows += '<button class="btn mbtn" style="width:100%;margin-top:6px" data-m="' + m + '">' + MODES[m].label + ' — Wave ' + sv.wave + '/' + MODES[m].waves + ' · ' + sv.coins + ' koin · ' + sv.army.length + ' pasukan</button>';
  });
  var el = showScreen('<div class="panel dlg"><h2>LANJUTKAN</h2>' + rows + '<div class="row"><button class="btn mbtn" id="cBack">KEMBALI</button></div></div>', 'dim');
  el.querySelectorAll('[data-m]').forEach(function (b) { press(b, function () { startGame(b.dataset.m, s.saves[b.dataset.m]); }); });
  press($('cBack'), openMenu);
}

function openPause() {
  if (!game || game.phase === 'won' || game.phase === 'lost') return;
  paused = true; saveProgress();
  var el = showScreen('<div class="panel dlg"><h2>PAUSE</h2><div class="stat">Wave ' + game.wave + '/' + game.total + ' · ' + game.mode.label + '<br>Musuh dikalahkan: ' + game.kills + '</div>' +
    '<div class="row"><button class="btn green mbtn" id="pRes">LANJUT</button></div>' +
    '<div class="row"><button class="btn mbtn" id="pRst">ULANG</button><button class="btn red mbtn" id="pMenu">MENU</button></div></div>', 'dim');
  press($('pRes'), function () { clearScreen(); paused = false; });
  press($('pRst'), function () { startGame(game.mode.id, null); });
  press($('pMenu'), function () { saveProgress(); openMenu(); });
}

function openUpgrades() {
  if (!game) return;
  paused = true;
  var render2 = function () {
    var g = game, rows = '';
    LS.UP_ORDER.forEach(function (k) {
      var u = UPGRADES[k], lv = g.up[k], max = lv >= u.max, c = g.upCost(k), pips = '';
      for (var i = 0; i < u.max; i++) pips += '<i class="' + (i < lv ? 'on' : '') + '"></i>';
      rows += '<button class="btn up ' + (max || g.coins < c ? 'off' : '') + '" data-k="' + k + '">' + icon(u.icon) +
        '<span class="t">' + u.name.toUpperCase() + ' <small>' + u.desc + '</small><span class="pips">' + pips + '</span></span>' +
        '<span class="c">' + (max ? 'MAX' : icon('coin') + c) + '</span></button>';
    });
    var el = showScreen('<div class="panel dlg"><h2>UPGRADE</h2><div class="stat" style="margin-bottom:4px">Koin: <span style="color:#ffd84a">' + g.coins + '</span></div><div class="ups">' + rows + '</div>' +
      '<div class="row"><button class="btn green mbtn" id="uClose">TUTUP</button></div></div>', 'dim');
    el.querySelectorAll('.up').forEach(function (b) {
      press(b, function () { var r = g.buyUpgrade(b.dataset.k); if (r === 'ok') render2(); });
    });
    press($('uClose'), function () { clearScreen(); paused = false; });
  };
  render2();
}

function endScreen(win) {
  var g = game;
  var s = loadSave(); s.best[g.mode.id] = Math.max(s.best[g.mode.id] || 0, win ? g.total : g.wave); delete s.saves[g.mode.id]; writeSave(s);
  for (var i = 0; i < (win ? 40 : 26); i++) endFx.push({ t: win ? (i % 2 ? 'sparkle' : 'spark2') : (i % 2 ? 'smoke1' : 'purple_fire'), x: win ? Math.random() * W : 20 + Math.random() * 180, y: win ? -10 : 300 + Math.random() * 40,
    vx: (Math.random() - 0.5) * 30, vy: win ? 20 + Math.random() * 40 : -20 - Math.random() * 30, s: 0.7 + Math.random() * 0.8, life: 2 + Math.random() * 2, age: -Math.random() * 1.5, win: win });
  setTimeout(function () {
    if (!game || game !== g) return;
    var el = showScreen('<div class="panel dlg">' + (win ? icon('crown', 'pix') : '') + '<h2 style="color:' + (win ? '#ffd84a' : '#ff6a5a') + '">' + (win ? 'KEMENANGAN!' : 'MARKAS HANCUR') + '</h2>' +
      '<div class="stat">' + (win ? 'Semua ' + g.total + ' wave berhasil dipertahankan!' : 'Bertahan sampai wave ' + g.wave + ' dari ' + g.total) + '<br>Musuh dikalahkan: ' + g.kills + '</div>' +
      '<div class="row"><button class="btn gold mbtn" id="eAgain">MAIN LAGI</button><button class="btn mbtn" id="eMenu">MENU</button></div></div>', 'dim');
    if (win) el.querySelector('img').style.cssText = 'height:calc(var(--u)*30px);width:auto;margin-bottom:calc(var(--u)*4px)';
    press($('eAgain'), function () { startGame(g.mode.id, null); });
    press($('eMenu'), openMenu);
  }, 1400);
}

/* ------------------------------------------------------------------ game control */
function setBiome(b, instant) {
  if (b === curBiome && mapCache[b]) return;
  curBiome = b; buildMap(b); initAmbient(); if (!instant) fadeIn = 1;
}

function startGame(modeId, saved) {
  clearScreen(); paused = false; inGame = true; endFx.length = 0; speed = 1; els.bSpeed.textContent = 'x1';
  game = saved ? LS.Game.restore(saved) : new LS.Game(modeId);
  hud.style.display = 'block';
  setBiome(LS.biomeFor(game.wave), true); fadeIn = 1;
  game.onWaveStart = function (w) {
    var boss = w % 10 === 0;
    banner(boss ? 'BOSS WAVE ' + w + '!<small>Bersiaplah!</small>' : 'WAVE ' + w + (w === game.total ? '<small>WAVE TERAKHIR!</small>' : ''), boss, 2.4);
    if (boss) shake = 0.4;
  };
  game.onWaveClear = function (w, bonus, biomeChanged) {
    banner('WAVE ' + w + ' SELESAI<small>+' + bonus + ' koin</small>', false, 2.2);
    saveProgress();
    if (biomeChanged) setBiome(LS.biomeFor(game.wave));
  };
  game.onShake = function (a) { shake = Math.max(shake, a); };
  game.onEnd = function (win) { saveProgress(); endScreen(win); };
  banner('WAVE ' + game.wave + ' SEGERA DIMULAI<small>Rekrut pasukan sekarang!</small>', false, 3);
  last = performance.now();
}

var last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!game) { ctx.drawImage(buildMap('grass'), 0, 0); return; }
  if (!paused) {
    var steps = speed;
    for (var i = 0; i < steps; i++) game.update(dt);
  }
  render(paused ? 0 : dt);
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) els.banner.style.display = 'none'; }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) els.toast.classList.remove('show'); }
  updateHud();
}

/* ------------------------------------------------------------------ layout / boot */
function layout() {
  var vw = window.innerWidth, vh = window.innerHeight;
  var sc = Math.min(vw / W, vh / H);
  stage.style.width = (W * sc) + 'px'; stage.style.height = (H * sc) + 'px';
  stage.style.setProperty('--u', String(sc));
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', function () { setTimeout(layout, 120); });
document.addEventListener('visibilitychange', function () { if (document.hidden && game && inGame && !paused) { openPause(); } });
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
layout();

function boot() {
  if (loadFailed.length) {
    $('ltxt').innerHTML = 'Gagal memuat ' + loadFailed.length + ' aset.<br><button class="btn" onclick="location.reload()">COBA LAGI</button>';
    console.error('Missing assets:', loadFailed); return;
  }
  buildHud(); initAmbient();
  $('loading').style.display = 'none';
  openMenu();
  requestAnimationFrame(frame);
}
window.__LS = { get game() { return game; }, startGame: startGame, mapCache: mapCache, setBiome: setBiome, IMG: IMG, failed: loadFailed };
loadAll(boot);
})();
