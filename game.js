/* WAVE OF DOOM - renderer, UI, loop. Pure JS + Canvas. */
(function () {
'use strict';
var LS = window.LS, W = LS.W, H = LS.H;
var UNITS = LS.UNITS, ENEMIES = LS.ENEMIES, MODES = LS.MODES, UPGRADES = LS.UPGRADES;
var MAN = window.ASSET_MANIFEST;
var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d');
// internal render scale: 1.5x gives crisp sprites; very low-memory phones fall back to 1x
var RES = (navigator.deviceMemory && navigator.deviceMemory <= 2) ? 1 : 1.5;
cv.width = Math.round(W * RES); cv.height = Math.round(H * RES);
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
// sprite scaled so it is `h` logical px tall (= h*RES physical px); cached
function byH(folder, name, h) {
  var ph = Math.max(2, Math.round(h * RES));
  var k = folder + '/' + name + '@' + ph;
  if (scaledCache[k]) return scaledCache[k];
  var im = img(folder, name); if (!im) return null;
  var c = scaleTo(im, im.width * ph / im.height, ph);
  scaledCache[k] = c; return c;
}
// draw a physical-size canvas at logical coords, snapped to the physical pixel grid
function put(g, c, x, y) {
  g.drawImage(c, Math.round(x * RES) / RES, Math.round(y * RES) / RES, c.width / RES, c.height / RES);
}
function putC(g, c, x, y) { put(g, c, x - c.width / RES / 2, y - c.height / RES / 2); }

var FRAMES = {
  // [folder, frameCount, idle[], walk[], attack[]]
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
  var sc = def.h * scale * RES / idle.height;          // one scale for every frame of the unit
  var out = { frames: [], flash: [], idleW: idle.width * sc / RES };
  for (var i = 0; i < fm[1]; i++) {
    var im = img(fm[0], type + '_' + i); if (!im) { out.frames.push(null); out.flash.push(null); continue; }
    var c = scaleTo(im, im.width * sc, im.height * sc);
    out.frames.push(c);
    var f = document.createElement('canvas'); f.width = c.width; f.height = c.height;
    var fx = f.getContext('2d'); fx.drawImage(c, 0, 0);
    fx.globalCompositeOperation = 'source-atop'; fx.fillStyle = 'rgba(255,255,255,.6)'; fx.fillRect(0, 0, f.width, f.height);
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

var PATH_Y0 = 208, PATH_Y1 = 268;      // road band (logical px)
var BIOME = {
  grass:  { bg: 'grass',  ground: 'grass_ground',  path: 'grass_path',  gs: 1.0, ps: 1.3, rim: 'rgba(70,40,10,.55)', hi: 'rgba(255,235,170,.25)',
    back:  [['tree', 54], ['pine', 46], ['tree', 48], ['bush_b', 16], ['bush', 16], ['pine', 40], ['tree', 60]],
    small: [['flowers', 11], ['flowers_b', 11], ['flower_y', 11], ['rock', 11], ['bush', 13], ['bush_b', 13]] },
  forest: { bg: 'forest', ground: 'forest_ground', path: 'forest_path', gs: 1.5, ps: 1.3, rim: 'rgba(50,30,8,.55)', hi: 'rgba(255,225,160,.2)',
    back:  [['tree_f2', 74], ['tree_f3', 72], ['tree_f1', 46], ['pine_s', 36], ['tree_f2', 66], ['tree_f3', 60]],
    small: [['flower_y', 11], ['flower_y2', 11], ['stump', 14], ['rock_f', 11], ['bush_f', 14], ['stump2', 13]] },
  snow:   { bg: 'snow', ground: 'snow_ground', path: 'snow_path', gs: 1.5, ps: 1.3, rim: 'rgba(40,60,130,.6)', hi: 'rgba(255,255,255,.35)',
    back:  [['snow_pine1', 66], ['snow_pine2', 60], ['snow_dead', 50], ['snow_cliff', 36], ['snow_pine2', 54]],
    small: [['snow_bush1', 12], ['snow_rock1', 12], ['snow_rock2', 10], ['snow_bush1', 13]] },
  desert: { bg: 'desert', ground: 'desert_ground', path: 'desert_path', gs: 1.5, ps: 1.3, rim: 'rgba(90,50,10,.6)', hi: 'rgba(255,230,160,.25)', pathTint: 'rgba(110,60,20,.30)',
    back:  [['palm', 72], ['cactus2', 46], ['desert_rock', 38], ['palm', 66], ['cactus3', 32]],
    small: [['dry_grass', 12], ['sand_rock', 12], ['desert_stone', 10], ['bones', 11], ['skull', 9], ['cactus3', 18]] },
  autumn: { bg: 'grass', ground: 'grass_ground', path: 'grass_path', gs: 1.0, ps: 1.3, rim: 'rgba(80,40,10,.55)', hi: 'rgba(255,220,150,.25)',
    fGround: 'sepia(.9) saturate(1.9) hue-rotate(-8deg) brightness(1.02)', fDecor: 'hue-rotate(-62deg) saturate(1.3)', fBg: 'sepia(.3) saturate(1.15)', fPath: 'saturate(1.1) brightness(.95)',
    back:  [['tree', 56], ['pine', 44], ['tree', 50], ['bush_b', 16], ['tree', 62], ['pine', 40]],
    small: [['flowers', 11], ['flower_y', 11], ['rock', 11], ['bush', 13], ['stump', 13], ['bush_b', 13]] },
  ice:    { bg: 'snow', ground: 'snow_ground', path: 'snow_path', gs: 1.5, ps: 1.3, rim: 'rgba(20,70,150,.6)', hi: 'rgba(220,255,255,.45)',
    fAll: 'hue-rotate(-14deg) saturate(1.5) brightness(1.06)', fb: '#a8e0ff',
    back:  [['snow_pine1', 64], ['snow_cliff', 40], ['snow_pine2', 58], ['snow_cliff', 34], ['snow_pine1', 52]],
    small: [['snow_rock1', 12], ['snow_rock2', 10], ['snow_bush1', 12], ['crystal', 17, 'effects'], ['crystal', 13, 'effects']] },
  swamp:  { bg: 'forest', ground: 'forest_ground', path: 'forest_path', gs: 1.5, ps: 1.3, rim: 'rgba(20,30,5,.65)', hi: 'rgba(190,230,120,.18)', pathTint: 'rgba(40,60,10,.32)',
    fAll: 'hue-rotate(18deg) saturate(.85) brightness(.78)', fb: '#8aa860', fog: 'rgba(150,190,120,',
    back:  [['tree_f2', 74], ['tree_f3', 70], ['snow_dead', 52], ['tree_f2', 64], ['snow_dead', 46], ['tree_f3', 60]],
    small: [['stump', 14], ['bush_f', 14], ['bones', 11], ['rock_f', 11], ['stump2', 13], ['skull', 9]] },
  graveyard: { bg: 'grass', ground: 'grass_ground', path: 'grass_path', gs: 1.0, ps: 1.3, rim: 'rgba(5,5,25,.7)', hi: 'rgba(150,170,255,.22)',
    fAll: 'sepia(1) hue-rotate(196deg) saturate(.85) brightness(.72)', fb: '#6070b0', tint: '#9aa4e8', night: true,
    back:  [['snow_dead', 56], ['snow_dead', 48], ['fence_a', 22], ['lantern', 26], ['snow_dead', 60], ['fence_b', 22]],
    small: [['skull', 9], ['bones', 11], ['rock', 11], ['stump', 13], ['skull', 9], ['dry_grass', 12]] },
  volcano: { bg: 'desert', ground: 'desert_ground', path: 'desert_path', gs: 1.5, ps: 1.3, rim: 'rgba(40,5,0,.7)', hi: 'rgba(255,150,60,.3)', pathTint: 'rgba(30,8,4,.35)',
    fBg: 'hue-rotate(-28deg) saturate(1.5) brightness(.7)', fGround: 'sepia(1) saturate(2.4) hue-rotate(-32deg) brightness(.62)', fDecor: 'hue-rotate(-20deg) saturate(1.2) brightness(.85)', fPath: 'hue-rotate(-12deg) saturate(.9) brightness(.52)', fb: '#c05030', tint: '#f0907a', lava: true,
    back:  [['desert_rock', 42], ['snow_dead', 54], ['desert_rock', 36], ['snow_dead', 46], ['desert_rock', 40]],
    small: [['bones', 11], ['skull', 9], ['sand_rock', 12], ['desert_stone', 10], ['bones', 11]] },
  castle: { bg: 'grass', ground: 'castle_ground', path: 'castle_path', gs: 0.9, ps: 1.1, rim: 'rgba(10,0,20,.7)', hi: 'rgba(200,170,255,.18)', tint: '#6a4a8a', castle: true,
    back:  [],
    small: [['skull', 9], ['bones', 11], ['barrel_b', 15], ['crate', 14], ['skull', 9]] }
};

function tileMirror(g, tex, x0, y0, x1, y1, f) {
  if (!tex) return;
  var tw = tex.width / RES * f, th = tex.height / RES * f;
  for (var iy = 0, y = y0; y < y1; y += th, iy++) for (var ix = 0, x = x0; x < x1; x += tw, ix++) {
    g.save();
    g.translate(x + (ix & 1 ? tw : 0), y + (iy & 1 ? th : 0));
    g.scale(ix & 1 ? -1 : 1, iy & 1 ? -1 : 1);
    g.drawImage(tex, 0, 0, tw + 0.7, th + 0.7);
    g.restore();
  }
}
function gradeLayer(L, f, fb) {            // recolour one layer in place (canvas filter, multiply fallback)
  if (!f) return L;
  var t = newLayer(); t.g.setTransform(1, 0, 0, 1, 0, 0); t.g.drawImage(L.c, 0, 0);
  var g = L.g; g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, L.c.width, L.c.height);
  if ('filter' in g) { g.filter = f; g.drawImage(t.c, 0, 0); g.filter = 'none'; }
  else { g.drawImage(t.c, 0, 0); if (fb) { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.45; g.fillStyle = fb; g.fillRect(0, 0, L.c.width, L.c.height); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; } }
  g.setTransform(RES, 0, 0, RES, 0, 0); return L;
}
function newLayer() {
  var c = document.createElement('canvas'); c.width = Math.round(W * RES); c.height = Math.round(H * RES);
  var g = c.getContext('2d'); g.setTransform(RES, 0, 0, RES, 0, 0); return { c: c, g: g };
}
function scatter(g, rnd, list, n, xMin, xMax, yMin, yMax, avoid) {
  if (!list.length) return;
  var items = [], span = (xMax - xMin) / n;
  for (var i = 0; i < n; i++) {
    var it = list[Math.floor(rnd() * list.length)];
    var x = xMin + span * (i + 0.2 + rnd() * 0.6);
    if (avoid && x > avoid[0] && x < avoid[1]) continue;
    items.push({ n: it[0], h: it[1] * (0.92 + rnd() * 0.16), grp: it[2] || 'decor', x: x, y: yMin + rnd() * (yMax - yMin) });
  }
  items.sort(function (a, b) { return a.y - b.y; });
  items.forEach(function (o) {
    var s = byH(o.grp, o.n, o.h); if (!s) return;
    put(g, s, o.x - s.width / RES / 2, o.y - s.height / RES);
  });
}
function drawBase(g) {
  var cs = byH('buildings', 'castle_s', 94); if (cs) put(g, cs, 2, 198);
  var tw = byH('buildings', 'tower_s', 72); if (tw) put(g, tw, 6, 148);
  var hs = byH('buildings', 'house_s', 52); if (hs) put(g, hs, 56, 156);
  var tc = byH('decor', 'torch_a', 24);
  if (tc) { put(g, tc, 96, 222); put(g, tc, 96, 276); }
}

function buildMap(biome) {
  if (mapCache[biome]) return mapCache[biome];
  var B = BIOME[biome], rnd = mulberry(biome.length * 977 + biome.charCodeAt(0) * 31);
  var L = newLayer(), g = L.g, MAIN = L;
  // 1) scenic backdrop (sky / mountains / tree line) from the background asset
  var bgim = img('backgrounds', B.bg);
  g.fillStyle = '#7fb4e8'; g.fillRect(0, 0, W, H);
  if (bgim) {
    var sx = 6, sw = bgim.width - 12, sy = 42, sh = 62, sc = W / sw;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(bgim, sx, sy, sw, sh, 0, 0, W, sh * sc);
  }
  if (B.fBg) gradeLayer(L, B.fBg, B.fb);
  // 2) ground (mirror-tiled seamless texture) feathered into the backdrop
  var gl = newLayer();
  tileMirror(gl.g, img('tiles', B.ground), 0, 140, W, H, B.gs);
  gl.g.globalCompositeOperation = 'destination-in';
  var grad = gl.g.createLinearGradient(0, 140, 0, 176); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
  gl.g.fillStyle = grad; gl.g.fillRect(0, 0, W, H);
  if (B.fGround) gradeLayer(gl, B.fGround, B.fb);
  g.drawImage(gl.c, 0, 0, W, H);
  // 3) road band with wobbly edges
  var topE = [], botE = [];
  for (var x = 0; x <= W + 12; x += 10) {
    topE.push([x, PATH_Y0 + Math.round((rnd() - 0.5) * 6)]);
    botE.push([x, PATH_Y1 + Math.round((rnd() - 0.5) * 6)]);
  }
  function bandPath(c) {
    c.beginPath(); topE.forEach(function (p, i) { i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); });
    for (var i = botE.length - 1; i >= 0; i--) c.lineTo(botE[i][0], botE[i][1]); c.closePath();
  }
  var pl = newLayer(), pg = pl.g;
  tileMirror(pg, img('tiles', B.path), 0, PATH_Y0 - 8, W + 20, PATH_Y1 + 12, B.ps);
  if (B.pathTint) { pg.fillStyle = B.pathTint; pg.fillRect(0, 0, W, H); }
  pg.globalCompositeOperation = 'destination-in'; pg.fillStyle = '#000'; bandPath(pg); pg.fill();
  pg.globalCompositeOperation = 'source-over';
  // soft outline + highlight along both edges
  pg.lineJoin = 'round';
  pg.strokeStyle = B.rim; pg.lineWidth = 3;
  pg.beginPath(); topE.forEach(function (p, i) { i ? pg.lineTo(p[0], p[1]) : pg.moveTo(p[0], p[1]); }); pg.stroke();
  pg.beginPath(); botE.forEach(function (p, i) { i ? pg.lineTo(p[0], p[1]) : pg.moveTo(p[0], p[1]); }); pg.stroke();
  pg.strokeStyle = B.hi; pg.lineWidth = 1;
  pg.beginPath(); topE.forEach(function (p, i) { i ? pg.lineTo(p[0], p[1] + 2) : pg.moveTo(p[0], p[1] + 2); }); pg.stroke();
  if (B.fPath) gradeLayer(pl, B.fPath, B.fb);
  g.drawImage(pl.c, 0, 0, W, H);
  g.imageSmoothingEnabled = false;

  // 4) landmarks
  if (biome === 'grass') {
    var rv = byH('decor', 'river_bridge', 150);
    if (rv) {
      var rl = newLayer(), rx = 392 - rv.width / RES / 2, ry = 178;
      for (var yy = ry - 19; yy > 130; yy -= 19) rl.g.drawImage(rv, 0, Math.round(10 * RES), rv.width, Math.round(20 * RES), rx, yy, rv.width / RES, 19.6);
      put(rl.g, rv, rx, ry);
      rl.g.globalCompositeOperation = 'destination-in';
      var rgd = rl.g.createLinearGradient(0, 140, 0, 172); rgd.addColorStop(0, 'rgba(0,0,0,0)'); rgd.addColorStop(1, 'rgba(0,0,0,1)');
      rl.g.fillStyle = rgd; rl.g.fillRect(0, 0, W, H);
      g.drawImage(rl.c, 0, 0, W, H);
    }
  }
  if (B.castle) {
    var wl = byH('decor', 'wall_h', 46), ga = byH('decor', 'gate_arch', 76);
    if (wl) for (var wx = 118; wx < W; wx += wl.width / RES - 2) put(g, wl, wx, 142);
    if (ga) put(g, ga, 470, 112);
    var bn = byH('decor', 'banner_red', 34);
    if (bn) { put(g, bn, 250, 150); put(g, bn, 360, 150); put(g, bn, 600, 150); }
  }
  // 5) decoration: tall things behind the road, small things along its edges
  var avoid = biome === 'grass' ? [352, 434] : null;
  var DL = B.fDecor ? newLayer() : null, dg = DL ? DL.g : g;
  scatter(dg, rnd, B.back, 9, 128, 636, 152, 182, avoid);
  scatter(dg, rnd, B.small, 8, 130, 632, 190, 205, avoid);
  scatter(dg, rnd, B.small, 8, 130, 632, 280, 298, avoid);
  if (DL) { gradeLayer(DL, B.fDecor, B.fb); g.drawImage(DL.c, 0, 0, W, H); }

  // 5b) colour grade the whole scene (recolours the shared art into a new biome)
  if (B.fAll) gradeLayer(L, B.fAll, B.fb);
  if (B.night) {                      // moon + stars in the sky strip
    var ng = g.createLinearGradient(0, 0, 0, 150); ng.addColorStop(0, 'rgba(8,10,45,.6)'); ng.addColorStop(0.7, 'rgba(8,10,45,.45)'); ng.addColorStop(1, 'rgba(8,10,45,0)'); g.fillStyle = ng; g.fillRect(0, 0, W, 150);
    for (var si = 0; si < 40; si++) { g.fillStyle = 'rgba(255,255,230,' + (0.35 + rnd() * 0.5).toFixed(2) + ')'; g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * 70), 1, 1); }
    g.fillStyle = '#f4f1d0'; g.beginPath(); g.arc(540, 40, 17, 0, 6.283); g.fill();
    g.fillStyle = '#d0cca0'; g.fillRect(534, 34, 4, 4); g.fillRect(546, 46, 5, 4); g.fillRect(540, 30, 3, 3);
  }
  if (B.lava) {                       // glowing horizon + lava cracks
    var lg = g.createLinearGradient(0, 100, 0, 170); lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(1, 'rgba(255,110,30,.45)');
    g.fillStyle = lg; g.fillRect(0, 100, W, 70);
    for (var li = 0; li < 9; li++) {
      var lx = 130 + li * 56 + rnd() * 20, ly = 300 - rnd() * 4, ls = 5 + Math.floor(rnd() * 4);
      for (var k = 0; k < ls; k++) { g.fillStyle = k & 1 ? '#ff7a1a' : '#ffc040'; g.fillRect(lx + k * 3, ly - ((k * 5) % 7), 3, 2); }
    }
  }
  if (B.fog) {                        // low swamp mist
    [[150, 196], [262, 296]].forEach(function (b) {
      var fg = g.createLinearGradient(0, b[0], 0, b[1]); fg.addColorStop(0, B.fog + '0)'); fg.addColorStop(0.5, B.fog + '.28)'); fg.addColorStop(1, B.fog + '0)');
      g.fillStyle = fg; g.fillRect(0, b[0], W, b[1] - b[0]);
    });
  }
  // 6) mood tint for the dark castle, then the player's base on top
  if (B.tint) {
    g.globalCompositeOperation = 'multiply'; g.fillStyle = B.tint; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    var vg = g.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 420); vg.addColorStop(0, 'rgba(20,0,30,0)'); vg.addColorStop(1, 'rgba(20,0,30,.5)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }
  drawBase(g);
  mapCache[biome] = L.c;
  return L.c;
}

/* ------------------------------------------------------------------ ambient */
var amb = [];
function initAmbient() {
  amb = [];
  var n = { snow: 46, ice: 40, castle: 26, desert: 22, volcano: 30, autumn: 22, swamp: 24, graveyard: 20 }[curBiome] || 18;
  for (var i = 0; i < n; i++) amb.push({ x: Math.random() * W, y: Math.random() * H, v: 0.4 + Math.random(), ph: Math.random() * 6 });
}
function drawAmbient(dt) {
  var b = curBiome, t = game ? game.time : 0;
  for (var i = 0; i < amb.length; i++) {
    var p = amb[i];
    if (b === 'snow') { p.y += (14 + p.v * 14) * dt; p.x += Math.sin(p.ph + t) * 6 * dt - 4 * dt; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(p.x | 0, p.y | 0, p.v > 1 ? 2 : 1, p.v > 1 ? 2 : 1); }
    else if (b === 'ice') { p.y += (8 + p.v * 8) * dt; p.x += Math.sin(p.ph + t) * 5 * dt; ctx.fillStyle = p.v > 1 ? 'rgba(200,245,255,.95)' : 'rgba(150,215,255,.7)'; ctx.fillRect(p.x | 0, p.y | 0, 1, p.v > 1 ? 2 : 1); }
    else if (b === 'autumn') { p.y += (12 + p.v * 10) * dt; p.x += (Math.sin(p.ph + t * 2) * 14 - 6) * dt; ctx.fillStyle = p.v > 1 ? 'rgba(230,120,30,.9)' : 'rgba(200,70,30,.85)'; ctx.fillRect(p.x | 0, p.y | 0, 2, 1); }
    else if (b === 'swamp') { p.y += Math.sin(p.ph + t) * 5 * dt; p.x += Math.sin(p.ph * 2 + t * 0.7) * 6 * dt; ctx.fillStyle = 'rgba(200,230,90,' + (0.35 + 0.45 * Math.abs(Math.sin(p.ph + t * 2))).toFixed(2) + ')'; ctx.fillRect(p.x | 0, p.y | 0, 2, 2); }
    else if (b === 'graveyard') { p.y -= (3 + p.v * 4) * dt; p.x += Math.sin(p.ph + t) * 8 * dt; ctx.fillStyle = 'rgba(170,200,255,' + (0.3 + 0.4 * Math.abs(Math.sin(p.ph + t))).toFixed(2) + ')'; ctx.fillRect(p.x | 0, p.y | 0, 2, 2); }
    else if (b === 'volcano') { p.y -= (16 + p.v * 20) * dt; p.x += Math.sin(p.ph + t * 3) * 6 * dt; ctx.fillStyle = p.v > 1 ? 'rgba(255,200,70,.95)' : 'rgba(255,100,30,.9)'; ctx.fillRect(p.x | 0, p.y | 0, 1, 2); }
    else if (b === 'forest') { p.y += (8 + p.v * 6) * dt; p.x += Math.sin(p.ph + t * 1.5) * 12 * dt; ctx.fillStyle = 'rgba(150,210,80,.8)'; ctx.fillRect(p.x | 0, p.y | 0, 2, 1); }
    else if (b === 'desert') { p.x -= (40 + p.v * 30) * dt; p.y += Math.sin(p.ph + t) * 4 * dt; ctx.fillStyle = 'rgba(240,210,150,.55)'; ctx.fillRect(p.x | 0, p.y | 0, 3, 1); }
    else if (b === 'castle') { p.y -= (10 + p.v * 12) * dt; p.x += Math.sin(p.ph + t * 2) * 8 * dt; ctx.fillStyle = p.v > 1 ? 'rgba(255,140,50,.9)' : 'rgba(190,90,255,.8)'; ctx.fillRect(p.x | 0, p.y | 0, 1, 2); }
    else { p.x += 10 * dt; p.y += Math.sin(p.ph + t) * 5 * dt; ctx.fillStyle = 'rgba(255,255,210,.7)'; ctx.fillRect(p.x | 0, p.y | 0, 1, 1); }
    if (p.y > H) { p.y = -4; p.x = Math.random() * W; } if (p.y < -6) { p.y = H; p.x = Math.random() * W; }
    if (p.x < -6) p.x = W + 4; if (p.x > W + 6) p.x = -4;
  }
}

/* ------------------------------------------------------------------ rendering */
var game = null, shake = 0, shakeX = 0, shakeY = 0;
var endFx = [];

function frameIndex(e) {
  var fm = FRAMES[e.type];
  if (e.state === 'attack') {
    var a = fm[4], prog = 1 - Math.max(0, e.atkT) / 0.42;
    return a[Math.min(a.length - 1, Math.floor(prog * a.length))];
  }
  if (e.state === 'walk') { var w = fm[3]; return w[Math.floor(e.anim * 8) % w.length]; }
  return fm[2][0];
}

// Player units face right, enemies are mirrored so they always face left (toward the base).
function drawEntity(e) {
  var sp = getUnitSprites(e.type, e.scale); if (!sp) return;
  var dir = e.side === 0 ? 1 : -1;
  var x = Math.round(e.x), y = Math.round(e.y);
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(x, y - 1, (sp.idleW * 0.45) | 0, 3 * e.scale, 0, 0, 6.283); ctx.fill();

  var fi = frameIndex(e), fr = sp.frames[fi] || sp.frames[0];
  if (!fr) return;
  var fw = fr.width / RES, fh = fr.height / RES;
  var lunge = 0, bob = 0;
  if (e.state === 'attack') { var pr = Math.min(1, 1 - e.atkT / 0.42); lunge = Math.sin(pr * Math.PI) * 4 * dir * e.scale; }
  else if (e.state === 'walk') bob = -Math.abs(Math.sin(e.anim * 10)) * 1.6;
  else bob = Math.sin(e.anim * 3 + e.id) * 0.5;
  var off = fw > sp.idleW * 1.3 ? -sp.idleW / 2 : -fw / 2;     // body stays put when a weapon swings out wide
  var src = (e.hurtT > 0 && sp.flash[fi]) ? sp.flash[fi] : fr;

  ctx.save();
  ctx.translate(Math.round((x + lunge) * RES) / RES, Math.round((y + bob) * RES) / RES);
  if (e.state === 'dead') {
    var t = Math.min(1, e.deadT / 0.8);
    ctx.globalAlpha = 1 - t * t;
    ctx.rotate(-dir * t * 1.45);
    if (dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(fr, off, -fh + t * 4, fw, fh);
    ctx.restore(); return;
  }
  if (dir < 0) ctx.scale(-1, 1);
  ctx.drawImage(src, off, -fh, fw, fh);
  ctx.restore();

  // health bar
  var bw = e.boss ? 34 : 16, bx = x - bw / 2, by = y - fh - (e.boss ? 9 : 5) + bob;
  ctx.fillStyle = '#000'; ctx.fillRect((bx - 1) | 0, (by - 1) | 0, bw + 2, 4);
  ctx.fillStyle = '#3a1010'; ctx.fillRect(bx | 0, by | 0, bw, 2);
  var pct = Math.max(0, e.hp / e.maxhp);
  ctx.fillStyle = e.side === 0 ? (pct > 0.5 ? '#5ad65a' : pct > 0.25 ? '#e6c83a' : '#e0502a') : '#e0382e';
  ctx.fillRect(bx | 0, by | 0, Math.round(bw * pct), 2);
  if (e.boss) { var cr = byH('ui', 'crown', 11); if (cr) put(ctx, cr, x - 6, by - 12 + Math.sin(game.time * 4)); }
}

function drawProj(p) {
  if (p.kind === 'arrow') {
    var a = byH('characters', 'arrow', 7); if (!a) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
    ctx.drawImage(a, -a.width / RES / 2, -a.height / RES / 2, a.width / RES, a.height / RES); ctx.restore();
  } else if (p.kind === 'orb') {
    var o = fxSprite('mage_orb', 1 + 0.15 * Math.sin(game.time * 20)); if (o) putC(ctx, o, p.x, p.y);
  } else {
    var d = fxSprite('purple_fire', 0.55); if (d) putC(ctx, d, p.x, p.y);
  }
}

function drawFx(f) {
  var t = f.age / f.dur, name = f.type;
  if (name === 'slash1' || name === 'slash2' || name === 'slash3') name = ['slash1', 'slash2', 'slash3'][Math.min(2, Math.floor(t * 3))];
  var sp = fxSprite(name, f.s * (0.75 + 0.5 * t)); if (!sp) return;
  ctx.globalAlpha = Math.max(0, 1 - t * t);
  var yy = f.y - (f.type === 'smoke1' || f.type === 'dust' ? t * 12 : 0);
  putC(ctx, sp, f.x, yy);
  ctx.globalAlpha = 1;
}

function render(dt) {
  var g = game;
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (shake > 0) { shake -= dt; shakeX = (Math.random() - 0.5) * 6 * shake * 2; shakeY = (Math.random() - 0.5) * 6 * shake * 2; ctx.translate(shakeX | 0, shakeY | 0); }
  ctx.drawImage(buildMap(curBiome), 0, 0, W, H);
  // animated bits at the base
  var fl = byH('decor', 'flag', 26);
  if (fl) put(ctx, fl, 98, 190 - Math.round(Math.sin(g.time * 5) * 1));
  var tf = fxSprite('flame', 0.45 + Math.sin(g.time * 14) * 0.05);
  if (tf) { putC(ctx, tf, 101, 218); putC(ctx, tf, 101, 272); }
  if (curBiome === 'volcano') {
    var vf = fxSprite('flame', 1.1 + Math.sin(g.time * 10) * 0.07);
    if (vf) { putC(ctx, vf, 230, 190); putC(ctx, vf, 400, 188); putC(ctx, vf, 580, 190); }
  }
  if (curBiome === 'castle') {
    var pf = fxSprite('purple_fire', 0.8 + Math.sin(g.time * 9) * 0.06);
    if (pf) { putC(ctx, pf, 215, 192); putC(ctx, pf, 330, 192); putC(ctx, pf, 560, 192); }
  }
  if (g.baseHit > 0) { ctx.fillStyle = 'rgba(255,40,40,' + (g.baseHit * 1.4).toFixed(2) + ')'; ctx.fillRect(0, 140, 110, 160); }

  var ents = g.ents.slice().sort(function (a, b) { return a.y - b.y; });
  var i;
  for (i = 0; i < ents.length; i++) drawEntity(ents[i]);
  for (i = 0; i < g.projs.length; i++) drawProj(g.projs[i]);
  for (i = 0; i < g.fx.length; i++) drawFx(g.fx[i]);

  drawAmbient(dt);

  ctx.font = 'bold 8px "Courier New",monospace'; ctx.textAlign = 'center';
  for (i = 0; i < g.floats.length; i++) {
    var f = g.floats[i], a = 1 - f.age / 0.8;
    ctx.globalAlpha = Math.max(0, a);
    var fy = f.y - f.age * 22;
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.strokeText(f.text, f.x | 0, fy | 0);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x | 0, fy | 0);
  }
  ctx.globalAlpha = 1;

  if (endFx.length) {
    for (i = endFx.length - 1; i >= 0; i--) {
      var p = endFx[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.win ? 50 : -8) * dt;
      var sp = fxSprite(p.t, p.s); ctx.globalAlpha = Math.max(0, 1 - Math.max(0, p.age) / p.life);
      if (sp) putC(ctx, sp, p.x, p.y);
      if (p.age > p.life) endFx.splice(i, 1);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (fadeIn > 0) { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, fadeIn) + ')'; ctx.fillRect(0, 0, W, H); fadeIn -= dt * 1.6; }
  if (g.phase === 'lost') { ctx.fillStyle = 'rgba(40,0,0,.35)'; ctx.fillRect(0, 0, W, H); }
}

/* ------------------------------------------------------------------ save */
var KEY = 'waveofdoom_v2', OLDKEY = 'waveofdoom_v1';
function readDB() {
  try { var d = JSON.parse(localStorage.getItem(KEY)); if (d && d.users) return d; } catch (e) { }
  return { users: {}, current: null };
}
function writeDB(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { } }
function userKey(n) { return n.trim().toLowerCase(); }
function curUser() { var d = readDB(); return d.current && d.users[d.current] ? d.users[d.current] : null; }
function login(name) {                    // local "login": creates the kingdom the first time, loads it afterwards
  var d = readDB(), k = userKey(name);
  if (!d.users[k]) {
    d.users[k] = { name: name.trim(), saves: {}, best: {}, created: Date.now() };
    if (!Object.keys(d.users).some(function (x) { return x !== k; })) {          // adopt a pre-accounts save for the very first kingdom
      try { var old = JSON.parse(localStorage.getItem(OLDKEY)); if (old && old.saves) { d.users[k].saves = old.saves; d.users[k].best = old.best || {}; } } catch (e) { }
    }
  }
  d.current = k; writeDB(d); return d.users[k];
}
function logout() { var d = readDB(); d.current = null; writeDB(d); }
function deleteUser() { var d = readDB(); if (d.current) delete d.users[d.current]; d.current = null; writeDB(d); }
function loadSave() { var u = curUser(); return u ? u : { name: '', saves: {}, best: {} }; }
function writeSave(o) { var d = readDB(), k = d.current; if (!k || !d.users[k]) return; d.users[k] = o; writeDB(d); }
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
      '<button class="btn sq fsb" id="bFs" aria-label="Layar penuh"></button>' +
      '<button class="btn sq" id="bMus"></button>' +
      '<button class="btn sq" id="bSnd"></button>' +
      '<button class="btn sq" id="bSpeed">x1</button>' +
      '<button class="btn sq" id="bPause">' + icon('pause') + '</button>' +
    '</div>' +
    '<div id="banner"></div><div id="toast"></div>' +
    '<button class="btn gold" id="startbtn" style="display:none">MULAI WAVE ▶</button>' +
    '<div id="bottom">' + rec +
      '<button class="btn side" id="bUp">' + icon('shield') + '<span>UPGRADE</span></button>' +
    '</div>';
  ['vWave', 'vCoin', 'vArmy', 'vEnemy', 'vHp', 'vHpT', 'banner', 'toast', 'startbtn', 'bSpeed', 'bUp', 'bPause', 'bSnd', 'bMus'].forEach(function (k) { els[k] = $(k); });
  hud.querySelectorAll('.rec').forEach(function (b) { els['r_' + b.dataset.t] = b; });
  press(els.bPause, function () { openPause(); });
  $('bFs').addEventListener('click', toggleFs); refreshFs();
  press(els.bMus, function () { SFX.setMusicEnabled(!SFX.isMusicEnabled()); refreshSnd(); });
  refreshSnd(); press(els.bSnd, function () { SFX.setEnabled(!SFX.isEnabled()); refreshSnd(); });
  press(els.bSpeed, function () { speed = speed === 1 ? 2 : 1; els.bSpeed.textContent = 'x' + speed; });
  press(els.bUp, function () { openUpgrades(); });
  press(els.startbtn, function () { if (game) game.skipPrep(); });
  hud.querySelectorAll('.rec').forEach(function (b) {
    press(b, function () {
      if (!game || paused) return;
      var r = game.recruit(b.dataset.t);
      if (r === 'coins') { SFX.play('error'); toast('Koin tidak cukup!'); } else if (r === 'cap') { SFX.play('error'); toast('Batas pasukan penuh – beli Kapasitas!'); }
    });
  });
  hud.style.display = 'none';
}
var lastDown = -9999;
function press(el, fn) {
  el.addEventListener('pointerdown', function (ev) {
    ev.preventDefault(); lastDown = performance.now(); el.classList.add('press');
    if (!el.classList.contains('rec') && !el.classList.contains('up')) SFX.play('click');
    fn(ev);
  });
  var up = function () { el.classList.remove('press'); };
  el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
  // synthesized click that follows a handled pointerdown (incl. "ghost" clicks on a freshly shown screen) is ignored;
  // a click with no preceding pointerdown (keyboard / assistive tech) still works.
  el.addEventListener('click', function (ev) { if (performance.now() - lastDown < 700) return; fn(ev); });
}
var SPK_ON = '<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="#fff" d="M2 6h3l4-3v10l-4-3H2z"/><path fill="#ffd84a" d="M11 5h1v6h-1zM13 3h1v10h-1z"/></svg>';
var SPK_OFF = '<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="#8892b8" d="M2 6h3l4-3v10l-4-3H2z"/><path fill="#ff5a4a" d="M11 5h1v1h-1zM12 6h1v1h-1zM13 7h1v2h-1zM12 9h1v1h-1zM11 10h1v1h-1zM13 5h1v1h-1zM13 10h1v1h-1z"/></svg>';
var NOTE_ON = '<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="#ffd84a" d="M6 2h8v2H8v7H6z"/><path fill="#fff" d="M2 10h4v3H2zM8 9h4v3H8z"/><path fill="#ffd84a" d="M12 4h2v6h-2z"/></svg>';
var NOTE_OFF = '<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="#8892b8" d="M6 2h8v2H8v7H6z"/><path fill="#6b7396" d="M2 10h4v3H2zM8 9h4v3H8z"/><path fill="#8892b8" d="M12 4h2v6h-2z"/><path fill="#ff5a4a" d="M1 2h2v1H1zM3 3h2v1H3zM5 4h2v1H5zM7 5h2v1H7zM9 6h2v1H9zM11 7h2v1h-2zM13 8h2v1h-2z" opacity=".0"/><path fill="#ff5a4a" d="M2 3h2v2H2zM4 5h2v2H4zM6 7h2v2H6zM8 9h2v2H8zM10 11h2v2h-2zM12 13h2v2h-2z" opacity=".0"/></svg>';
function refreshSnd() {
  var on = SFX.isEnabled();
  if (els.bSnd) els.bSnd.innerHTML = on ? SPK_ON : SPK_OFF;
  if (els.bMus) els.bMus.innerHTML = SFX.isMusicEnabled() ? NOTE_ON : NOTE_OFF;
  var mb = $('mSnd'); if (mb) mb.textContent = 'SUARA: ' + (on ? 'ON' : 'OFF');
  var mm = $('mMus'); if (mm) mm.textContent = 'MUSIK: ' + (SFX.isMusicEnabled() ? 'ON' : 'OFF');
}
/* ---- fullscreen + landscape lock (button in the menu corner and in the HUD) ---- */
var FS_ENTER = '<svg viewBox="0 0 24 24" fill="none" class="fsico"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 3H5V6M16 21H19V18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
var FS_EXIT = '<svg viewBox="0 0 24 24" fill="none" class="fsico"><rect x="7" y="3" width="10" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M10 6H14M10 18H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
function fsSupported() { var d = document.documentElement; return !!(d.requestFullscreen || d.webkitRequestFullscreen); }
function refreshFs() {
  var on = !!fsEl(), ok = fsSupported();
  document.querySelectorAll('.fsb').forEach(function (b) { b.innerHTML = on ? FS_EXIT : FS_ENTER; b.style.display = ok ? '' : 'none'; b.title = on ? 'Keluar layar penuh' : 'Layar penuh (landscape)'; });
}
async function toggleFs() {
  try {
    if (!fsEl()) {
      var d = document.documentElement;
      if (d.requestFullscreen) await d.requestFullscreen({ navigationUI: 'hide' }); else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen();
      try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { }
    } else {
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { }
      if (document.exitFullscreen) await document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
  } catch (e) { }
  refreshFs(); setTimeout(layout, 150);
}
['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
  document.addEventListener(ev, function () {
    if (!fsEl()) { try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { } }
    refreshFs(); setTimeout(layout, 150);
  });
});
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

var BIOME_NAME = { grass: 'Padang Rumput', autumn: 'Musim Gugur', forest: 'Hutan', snow: 'Salju', ice: 'Gletser', desert: 'Gurun', swamp: 'Rawa', graveyard: 'Kuburan', volcano: 'Gunung Api', castle: 'Kastil Gelap' };
var BIOME_DOT = { auto: '#ffd84a', grass: '#5ab83a', autumn: '#e8892a', forest: '#2f7a34', snow: '#dbe8ff', ice: '#7fd4ff', desert: '#e6c068', swamp: '#6b8a3a', graveyard: '#6a62b8', volcano: '#d8452a', castle: '#7a4a9a' };
function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function menuBg(el) { var bg = img('backgrounds', 'grass'); if (bg) el.style.backgroundImage = 'url(' + url('backgrounds/grass') + ')'; }
function toMenuState() { inGame = false; paused = false; game = null; hud.style.display = 'none'; endFx.length = 0; SFX.musicDuck(false); SFX.musicPlay('lobby'); }
function fsBtn() { return '<button class="btn sq fsb" id="mFs" aria-label="Layar penuh"></button>'; }
function bindFs() { var f = $('mFs'); if (f) { f.addEventListener('click', toggleFs); refreshFs(); } }

function openLogin(msg) {
  toMenuState();
  var d = readDB(), names = Object.keys(d.users).map(function (k) { return d.users[k].name; });
  var chips = names.length ? '<div class="hint" style="margin-top:calc(var(--u)*8px)">Kerajaan di perangkat ini:</div><div class="menurow">' +
    names.slice(0, 6).map(function (n, i) { return '<button class="btn mbtn" data-n="' + i + '">' + esc(n) + '</button>'; }).join('') + '</div>' : '';
  var el = showScreen('<div class="title">WAVE OF DOOM</div><div class="subtitle">PIXEL DEFENSE RPG</div>' +
    '<div class="panel dlg loginbox"><h2>MASUK KERAJAAN</h2><div class="stat">Nama pengguna kamu menjadi nama kerajaanmu.</div>' +
    '<input id="uName" type="text" maxlength="16" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Nama Kerajaan">' +
    '<div class="err" id="uErr">' + (msg || '') + '</div>' +
    '<div class="row"><button class="btn gold mbtn" id="uGo">MASUK</button></div></div>' + chips +
    '<div class="credit">DIBUAT OLEH<b>RIZKI</b></div>' + fsBtn(), 'menu');
  menuBg(el); bindFs();
  var inp = $('uName'), go = function () {
    var n = inp.value.replace(/\s+/g, ' ').trim();
    if (n.length < 3) { $('uErr').textContent = 'Nama minimal 3 karakter.'; return; }
    if (!/^[A-Za-z0-9 _\-.]+$/.test(n)) { $('uErr').textContent = 'Hanya huruf, angka, spasi, _ - .'; return; }
    login(n); openMenu();
  };
  press($('uGo'), go);
  inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); go(); } ev.stopPropagation(); });
  el.querySelectorAll('[data-n]').forEach(function (b) { press(b, function () { login(names[+b.dataset.n]); openMenu(); }); });
}

function openMenu() {
  var u = curUser(); if (!u) { openLogin(); return; }
  toMenuState();
  var hasSave = Object.keys(u.saves).length > 0;
  var el = showScreen('<div class="title">WAVE OF DOOM</div><div class="subtitle">PIXEL DEFENSE RPG</div>' +
    '<div class="kname">' + icon('crown', 'pix') + '<span>KERAJAAN <b>' + esc(u.name.toUpperCase()) + '</b></span></div>' +
    '<div class="mainmenu"><button class="btn green mbtn big" id="mNew">NEW GAME</button>' +
    '<button class="btn gold mbtn big' + (hasSave ? '' : ' dis') + '" id="mCont">LANJUT GAME</button>' +
    '<button class="btn mbtn big" id="mSet">PENGATURAN</button></div>' +
    '<div class="credit">DIBUAT OLEH<b>RIZKI</b></div>' + fsBtn(), 'menu');
  menuBg(el); bindFs();
  press($('mNew'), openNewGame);
  press($('mCont'), function () { if (hasSave) openContinue(); else toast('Belum ada game tersimpan'); });
  press($('mSet'), openSettings);
}

function openNewGame() {
  var u = curUser(); if (!u) { openLogin(); return; }
  var selB = 'auto', selM = 'normal';
  var ids = ['auto'].concat(LS.BIOME_IDS);
  var chips = ids.map(function (b) {
    return '<button class="btn bchip" data-b="' + b + '"><i style="background:' + BIOME_DOT[b] + '"></i>' + (b === 'auto' ? 'Otomatis' : BIOME_NAME[b]) + '</button>';
  }).join('');
  var diff = ['easy', 'normal', 'hard'].map(function (m) {
    return '<button class="btn mode ' + (m === 'easy' ? 'green' : m === 'hard' ? 'red' : '') + '" data-m="' + m + '">' + MODES[m].label + '<small>' + MODES[m].waves + ' WAVE</small></button>';
  }).join('');
  var el = showScreen('<div class="panel ngp"><h2>NEW GAME</h2>' +
    '<div class="ngrow"><div class="ngl"><canvas id="ngPrev" width="160" height="90"></canvas><div class="ngname" id="ngName"></div></div>' +
    '<div class="ngr"><div class="lbl">PILIH BIOME</div><div class="bgrid">' + chips + '</div></div></div>' +
    '<div class="lbl" style="margin-top:calc(var(--u)*6px)">TINGKAT KESULITAN</div><div class="modes" style="margin-top:calc(var(--u)*4px)">' + diff + '</div>' +
    '<div class="warn" id="ngWarn"></div>' +
    '<div class="row"><button class="btn mbtn" id="ngBack">KEMBALI</button><button class="btn gold mbtn" id="ngGo">MULAI</button></div></div>', 'menu');
  menuBg(el);
  var pv = $('ngPrev'), pg = pv.getContext('2d');
  var refresh = function () {
    el.querySelectorAll('[data-b]').forEach(function (b) { b.classList.toggle('sel', b.dataset.b === selB); });
    el.querySelectorAll('[data-m]').forEach(function (b) { b.classList.toggle('sel', b.dataset.m === selM); });
    var show = selB === 'auto' ? 'grass' : selB;
    pg.imageSmoothingEnabled = false; pg.clearRect(0, 0, 160, 90);
    var mp = buildMap(show); pg.drawImage(mp, 0, 120 * mp.height / H, mp.width, 180 * mp.height / H, 0, 0, 160, 90);
    $('ngName').textContent = selB === 'auto' ? 'Berganti sesuai wave' : BIOME_NAME[selB];
    $('ngWarn').textContent = u.saves[selM] ? 'Game ' + MODES[selM].label + ' yang tersimpan akan ditimpa.' : '';
  };
  el.querySelectorAll('[data-b]').forEach(function (b) { press(b, function () { selB = b.dataset.b; refresh(); }); });
  el.querySelectorAll('[data-m]').forEach(function (b) { press(b, function () { selM = b.dataset.m; refresh(); }); });
  press($('ngBack'), openMenu);
  press($('ngGo'), function () { startGame(selM, null, selB); });
  refresh();
}

function openContinue() {
  var s = loadSave(), rows = '';
  ['easy', 'normal', 'hard'].forEach(function (m) {
    var sv = s.saves[m]; if (!sv) return;
    rows += '<button class="btn mbtn" style="width:100%;margin-top:6px" data-m="' + m + '">' + MODES[m].label + ' · ' + (sv.biome && sv.biome !== 'auto' ? BIOME_NAME[sv.biome] : 'Biome otomatis') + '<br><small style="font-size:calc(var(--u)*8px)">Wave ' + sv.wave + '/' + MODES[m].waves + ' · ' + sv.coins + ' koin · ' + sv.army.length + ' pasukan</small></button>';
  });
  if (!rows) { openMenu(); return; }
  var el = showScreen('<div class="panel dlg"><h2>LANJUT GAME</h2><div class="stat">Kerajaan ' + esc(s.name) + '</div>' + rows + '<div class="row"><button class="btn mbtn" id="cBack">KEMBALI</button></div></div>', 'menu');
  menuBg(el);
  el.querySelectorAll('[data-m]').forEach(function (b) { press(b, function () { startGame(b.dataset.m, s.saves[b.dataset.m]); }); });
  press($('cBack'), openMenu);
}

function openSettings(confirmDel) {
  var u = curUser(); if (!u) { openLogin(); return; }
  var best = ['easy', 'normal', 'hard'].map(function (m) { return MODES[m].label + ': ' + (u.best[m] ? 'W' + u.best[m] : '-'); }).join(' · ');
  var el = showScreen('<div class="panel dlg"><h2>PENGATURAN</h2><div class="stat">Kerajaan <b style="color:#ffd84a">' + esc(u.name) + '</b><br><small>Rekor: ' + best + '</small></div>' +
    '<div class="row"><button class="btn mbtn" id="mSnd"></button><button class="btn mbtn" id="mMus"></button></div>' +
    '<div class="row"><button class="btn mbtn" id="sOut">GANTI KERAJAAN</button></div>' +
    '<div class="row">' + (confirmDel === true ? '<button class="btn red mbtn" id="sDelY">YAKIN HAPUS?</button>' : '<button class="btn red mbtn" id="sDel">HAPUS DATA</button>') + '</div>' +
    '<div class="row"><button class="btn gold mbtn" id="sBack">KEMBALI</button></div></div>', 'menu');
  menuBg(el);
  refreshSnd(); press($('mSnd'), function () { SFX.setEnabled(!SFX.isEnabled()); refreshSnd(); });
  press($('mMus'), function () { SFX.setMusicEnabled(!SFX.isMusicEnabled()); refreshSnd(); });
  press($('sOut'), function () { logout(); openLogin(); });
  if (confirmDel === true) press($('sDelY'), function () { deleteUser(); openLogin(); });
  else press($('sDel'), function () { openSettings(true); });
  press($('sBack'), openMenu);
}

function openPause() {
  if (!game || game.phase === 'won' || game.phase === 'lost') return;
  paused = true; saveProgress(); SFX.musicDuck(true);
  var el = showScreen('<div class="panel dlg"><h2>PAUSE</h2><div class="stat"><b style="color:#ffd84a">Kerajaan ' + esc(loadSave().name) + '</b><br>Wave ' + game.wave + '/' + game.total + ' · ' + game.mode.label + '<br>Musuh dikalahkan: ' + game.kills + '</div>' +
    '<div class="row"><button class="btn green mbtn" id="pRes">LANJUT</button></div>' +
    '<div class="row"><button class="btn mbtn" id="pRst">ULANG</button><button class="btn red mbtn" id="pMenu">MENU</button></div></div>', 'dim');
  press($('pRes'), function () { clearScreen(); paused = false; SFX.musicDuck(false); });
  press($('pRst'), function () { startGame(game.mode.id, null, game.biomeSel); });
  press($('pMenu'), function () { saveProgress(); SFX.musicDuck(false); openMenu(); });
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
      press(b, function () { var r = g.buyUpgrade(b.dataset.k); if (r === 'ok') render2(); else SFX.play('error'); });
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
    press($('eAgain'), function () { startGame(g.mode.id, null, g.biomeSel); });
    press($('eMenu'), openMenu);
  }, 1400);
}

/* ------------------------------------------------------------------ game control */
function setBiome(b, instant) {
  if (b === curBiome && mapCache[b]) return;
  curBiome = b; buildMap(b); initAmbient(); if (!instant) fadeIn = 1;
}

function startGame(modeId, saved, biome) {
  SFX.musicDuck(false); SFX.musicPlay('battle'); clearScreen(); paused = false; inGame = true; endFx.length = 0; speed = 1; els.bSpeed.textContent = 'x1';
  game = saved ? LS.Game.restore(saved) : new LS.Game(modeId, { biome: biome });
  hud.style.display = 'block';
  setBiome(game.biomeAt(game.wave), true); fadeIn = 1;
  game.onWaveStart = function (w) {
    var boss = w % 10 === 0;
    SFX.play('horn'); SFX.musicPlay(boss ? 'boss' : 'battle');
    banner(boss ? 'BOSS WAVE ' + w + '!<small>Bersiaplah!</small>' : 'WAVE ' + w + (w === game.total ? '<small>WAVE TERAKHIR!</small>' : ''), boss, 2.4);
    if (boss) shake = 0.4;
  };
  game.onWaveClear = function (w, bonus, biomeChanged) {
    SFX.play('clear'); SFX.musicPlay('battle');
    banner('WAVE ' + w + ' SELESAI<small>+' + bonus + ' koin</small>', false, 2.2);
    saveProgress();
    if (biomeChanged) setBiome(game.biomeAt(game.wave));
  };
  game.onShake = function (a) { shake = Math.max(shake, a); };
  game.onSound = function (n) { SFX.play(n); };
  game.onEnd = function (win) { saveProgress(); SFX.musicStop(); SFX.play(win ? 'victory' : 'defeat'); endScreen(win); };
  banner('WAVE ' + game.wave + ' SEGERA DIMULAI<small>Rekrut pasukan sekarang!</small>', false, 3);
  last = performance.now();
}

var last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!game) { ctx.setTransform(RES, 0, 0, RES, 0, 0); ctx.drawImage(buildMap('grass'), 0, 0, W, H); return; }
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
