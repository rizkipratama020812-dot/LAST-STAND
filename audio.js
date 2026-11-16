/* WAVE OF DOOM - procedural SFX (WebAudio, no audio files). */
(function (root) {
'use strict';
var AC = root.AudioContext || root.webkitAudioContext;
var ctx = null, master = null, analyser = null, noiseBuf = null, enabled = true, unlocked = false;
var KEY = 'waveofdoom_sfx', MKEY = 'waveofdoom_music';
var musicOn = true;
try { if (localStorage.getItem(KEY) === '0') enabled = false; if (localStorage.getItem(MKEY) === '0') musicOn = false; } catch (e) { }

function init() {
  if (ctx || !AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.55;
    analyser = ctx.createAnalyser(); analyser.fftSize = 256; master.connect(analyser);
    var comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    var len = ctx.sampleRate, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBuf = b;
  } catch (e) { ctx = null; }
}

function unlock() {
  init(); if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  musicKick();
  if (!unlocked) {          // silent blip: required by some mobile browsers
    var o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.0001;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.02); unlocked = true;
  }
}

function env(g, t, a, d, v) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
// oscillator: freq f0 -> f1 over dur
function tone(type, f0, f1, dur, vol, delay) {
  var t = ctx.currentTime + (delay || 0);
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  env(g, t, Math.min(0.01, dur / 4), dur, vol);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
// filtered noise burst: filter sweeps f0 -> f1
function noise(ftype, f0, f1, dur, vol, delay, q) {
  var t = ctx.currentTime + (delay || 0);
  var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true;
  f.type = ftype; f.Q.value = q || 1; f.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  env(g, t, 0.005, dur, vol);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

var SOUNDS = {
  click:   function () { tone('square', 900, 700, 0.05, 0.12); },
  error:   function () { tone('sawtooth', 170, 120, 0.14, 0.18); tone('sawtooth', 140, 100, 0.12, 0.14, 0.09); },
  recruit: function () { tone('triangle', 520, 520, 0.09, 0.2); tone('triangle', 780, 780, 0.14, 0.2, 0.07); noise('highpass', 3500, 5000, 0.05, 0.05); },
  upgrade: function () { tone('square', 660, 660, 0.08, 0.13); tone('square', 880, 880, 0.08, 0.13, 0.08); tone('square', 1320, 1320, 0.16, 0.13, 0.16); },
  coin:    function () { tone('square', 1250, 1250, 0.05, 0.07); tone('square', 1900, 1900, 0.09, 0.07, 0.05); },
  slash:   function () { noise('bandpass', 3200, 900, 0.13, 0.3, 0, 1.2); tone('sawtooth', 380, 180, 0.07, 0.06); },
  heavy:   function () { noise('lowpass', 900, 160, 0.26, 0.45); tone('sine', 120, 45, 0.25, 0.35); },
  arrow:   function () { noise('highpass', 2800, 1400, 0.09, 0.16); tone('triangle', 900, 300, 0.09, 0.1); },
  magic:   function () { tone('sine', 420, 1300, 0.28, 0.2); tone('triangle', 640, 1700, 0.24, 0.1, 0.03); noise('highpass', 5000, 7000, 0.18, 0.05); },
  dark:    function () { tone('sawtooth', 240, 70, 0.34, 0.16); noise('lowpass', 700, 150, 0.3, 0.14); },
  hit:     function () { noise('bandpass', 1300, 600, 0.06, 0.24, 0, 2); tone('square', 190, 90, 0.06, 0.08); },
  die:     function () { tone('square', 320, 60, 0.26, 0.12); noise('lowpass', 1200, 200, 0.18, 0.16); },
  boom:    function () { noise('lowpass', 1800, 110, 0.4, 0.5); tone('sine', 130, 40, 0.38, 0.4); },
  bossdie: function () { noise('lowpass', 1500, 60, 1.0, 0.7); tone('sine', 110, 28, 1.0, 0.55); tone('sawtooth', 90, 30, 0.8, 0.12); },
  boss:    function () { tone('sawtooth', 70, 38, 1.1, 0.3); tone('sawtooth', 105, 55, 1.0, 0.18, 0.05); noise('lowpass', 500, 90, 0.9, 0.2); },
  basehit: function () { tone('sine', 85, 40, 0.28, 0.45); noise('lowpass', 500, 120, 0.22, 0.3); },
  horn:    function () { tone('sawtooth', 196, 196, 0.32, 0.14); tone('sawtooth', 294, 294, 0.5, 0.14, 0.22); tone('square', 392, 392, 0.5, 0.06, 0.22); },
  clear:   function () { [523, 659, 784, 1047].forEach(function (f, i) { tone('square', f, f, 0.12, 0.12, i * 0.09); }); },
  victory: function () { [523, 659, 784, 1047, 784, 1047, 1319].forEach(function (f, i) { tone('square', f, f, 0.18, 0.14, i * 0.14); tone('triangle', f / 2, f / 2, 0.18, 0.12, i * 0.14); }); },
  defeat:  function () { [392, 330, 262, 196, 131].forEach(function (f, i) { tone('sawtooth', f, f * 0.96, 0.4, 0.14, i * 0.26); }); noise('lowpass', 600, 80, 1.2, 0.2, 0.3); }
};
// minimum gap (ms) between two plays of the same sound, protects low-end phones in big fights
var GAP = { hit: 55, slash: 60, arrow: 70, magic: 90, dark: 120, die: 70, coin: 80, boom: 90, heavy: 90, basehit: 120, recruit: 50 };
var last = {}, bucketT = 0, bucketN = 0;

function play(name) {
  if (!enabled || !SOUNDS[name]) return;
  if (!ctx) init();
  if (!ctx || ctx.state !== 'running') { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
  var now = performance.now();
  var gap = GAP[name] || 0;
  if (gap && last[name] && now - last[name] < gap) return;
  if (now - bucketT > 100) { bucketT = now; bucketN = 0; }       // at most 7 sounds per 100 ms
  if (bucketN >= 7 && name !== 'victory' && name !== 'defeat' && name !== 'boss' && name !== 'click') return;
  bucketN++; last[name] = now;
  try { SOUNDS[name](); } catch (e) { }
}

function setEnabled(v) {
  enabled = !!v;
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) { }
  if (enabled) { unlock(); play('click'); }
}


/* ---------------------------------------------------------------- music (chiptune loops, generated live) */
var MUSIC_VOL = 0.5;
var TRACKS = {
  // calm heroic lobby theme, A minor, 100 BPM
  lobby: { step: 0.3, vol: 0.5, drums: 'lobby', leadWave: 'square', leadVol: 0.075, bassWave: 'triangle', bassVol: 0.3,
    bassPat: { 0: 0, 2: 12, 4: 0, 6: 7 }, arpPat: [0, 1, 2, 3, 2, 1, 0, 1],
    root: [57, 53, 60, 55, 57, 53, 55, 52], bass: [45, 41, 48, 43, 45, 41, 43, 40], major: [0, 1, 1, 1, 0, 1, 1, 1],
    lead: [[76, 0, 81, 0, 79, 76, 72, 0], [77, 0, 81, 0, 84, 81, 77, 0], [79, 0, 76, 79, 84, 0, 83, 79], [81, 0, 79, 0, 74, 0, 71, 0],
           [76, 0, 81, 83, 84, 0, 83, 81], [81, 0, 84, 0, 89, 0, 84, 81], [83, 0, 86, 0, 79, 83, 86, 0], [88, 0, 83, 0, 80, 0, 83, 0]] },
  // driving battle theme, D minor, 132 BPM
  battle: { step: 0.2273, vol: 0.34, drums: 'battle', leadWave: 'square', leadVol: 0.07, bassWave: 'triangle', bassVol: 0.32,
    bassPat: { 0: 0, 1: 0, 2: 12, 3: 0, 4: 0, 5: 0, 6: 12, 7: 7 }, arpPat: [0, 1, 2, 3, 2, 1, 2, 3],
    root: [62, 58, 60, 57, 62, 58, 55, 57], bass: [38, 34, 36, 33, 38, 34, 31, 33], major: [0, 1, 1, 1, 0, 1, 0, 1],
    lead: [[81, 0, 81, 86, 0, 84, 81, 0], [82, 0, 82, 86, 0, 89, 86, 0], [84, 0, 84, 88, 0, 91, 88, 0], [88, 0, 86, 85, 0, 81, 85, 88],
           [86, 0, 89, 93, 0, 89, 86, 0], [86, 0, 89, 94, 0, 89, 86, 0], [79, 82, 86, 91, 0, 86, 82, 0], [88, 0, 85, 0, 81, 85, 88, 93]] },
  // dark, heavy boss theme, E phrygian, 150 BPM
  boss: { step: 0.2, vol: 0.4, drums: 'boss', leadWave: 'sawtooth', leadVol: 0.05, bassWave: 'sawtooth', bassVol: 0.17,
    bassPat: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 12, 5: 0, 6: 0, 7: 0 }, arpPat: [0, 2, 1, 2, 0, 2, 1, 3],
    root: [64, 65, 64, 65, 64, 60, 62, 59], bass: [40, 41, 40, 41, 40, 36, 38, 35], major: [0, 1, 0, 1, 0, 1, 1, 1],
    lead: [[88, 0, 88, 91, 0, 88, 86, 0], [89, 0, 89, 93, 0, 89, 84, 0], [83, 0, 88, 0, 91, 0, 95, 0], [93, 0, 89, 0, 84, 0, 89, 0],
           [88, 0, 91, 0, 95, 0, 91, 88], [84, 0, 88, 0, 91, 0, 88, 84], [86, 0, 90, 0, 93, 0, 90, 86], [83, 0, 87, 0, 90, 0, 95, 90]] }
};
var music = { want: null, track: 'lobby', timer: null, step: 0, next: 0, gain: null, duck: false };
function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function tAt(type, f, t, dur, vol, f1) {
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.setValueAtTime(vol, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(music.gain); o.start(t); o.stop(t + dur + 0.03);
}
function nAt(ftype, f0, t, dur, vol, q) {
  var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = ftype; f.frequency.value = f0; f.Q.value = q || 1;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(music.gain); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
}
function kick(t, v) { tAt('sine', 150, t, 0.16, v, 42); }
function snare(t, v) { nAt('bandpass', 1800, t, 0.12, v, 0.8); }
function hat(t, v) { nAt('highpass', 8500, t, 0.035, v); }
function drums(T, bar, s, t) {
  if (T.drums === 'lobby') {
    if (s === 0 || s === 4) kick(t, 0.42);
    if (s === 2 || s === 6 || ((bar === 3 || bar === 7) && s === 7)) snare(t, 0.2);
    hat(t, s & 1 ? 0.04 : 0.065);
    if (bar === 7 && s === 5) snare(t, 0.14);
  } else if (T.drums === 'battle') {
    if (s === 0 || s === 3 || s === 4 || (s === 6 && (bar & 1))) kick(t, 0.4);
    if (s === 2 || s === 6) snare(t, 0.22);
    if (bar === 7 && s >= 5) snare(t, 0.14);
    hat(t, s & 1 ? 0.05 : 0.08);
  } else {
    if (s === 0 || s === 2 || s === 3 || s === 4 || s === 6 || s === 7) kick(t, 0.44);
    if (s === 2 || s === 6) snare(t, 0.26);
    if (bar === 7 && s >= 4) snare(t, 0.16);
    hat(t, 0.075);
    if (s === 0 && (bar & 3) === 0) nAt('lowpass', 900, t, 0.5, 0.18);     // crash-like rumble
  }
}
function playStep(T, i, t) {
  var bar = (i >> 3) & 7, s = i & 7, st = T.step;
  var n = T.lead[bar][s];
  if (n) { tAt(T.leadWave, mf(n), t, st * 1.9, T.leadVol); tAt('triangle', mf(n) * 1.004, t, st * 1.9, T.leadVol * 0.9); }
  var third = T.major[bar] ? 4 : 3, arp = [0, third, 7, 12][T.arpPat[s]];
  tAt('square', mf(T.root[bar] + 12 + arp), t, st * 0.8, 0.03);
  var bo = T.bassPat[s];
  if (bo !== undefined) tAt(T.bassWave, mf(T.bass[bar] + bo), t, st * 1.8, T.bassVol);
  drums(T, bar, s, t);
}
function musicTick() {
  if (!ctx || ctx.state !== 'running' || !music.gain) return;
  var now = ctx.currentTime, T = TRACKS[music.track];
  if (music.next < now - 0.3) music.next = now + 0.05;      // we were suspended: resync
  while (music.next < now + 0.25) { playStep(T, music.step, music.next); music.step++; music.next += T.step; }
}
function musicTarget() { return TRACKS[music.track].vol * (music.duck ? 0.25 : 1); }
function musicRamp(to, dur, dip) {
  var t = ctx.currentTime, p = music.gain.gain;
  p.cancelScheduledValues(t);
  p.setValueAtTime(dip ? 0.0001 : Math.max(0.0001, p.value), t);
  p.linearRampToValueAtTime(Math.max(0.0001, to), t + dur);
}
function musicKick(dip) {
  if (!music.want || !musicOn || !ctx) return;
  if (!music.gain) { music.gain = ctx.createGain(); music.gain.gain.value = 0.0001; music.gain.connect(master); }
  musicRamp(musicTarget(), dip ? 0.5 : 1.2, dip);
  if (!music.timer) { music.step = 0; music.next = ctx.currentTime + 0.1; music.timer = setInterval(musicTick, 40); }
}
function musicHalt(fade) {
  if (!music.timer || !ctx || !music.gain) return;
  musicRamp(0.0001, fade);
  var h = music.timer;
  setTimeout(function () { if (music.timer === h && (!music.want || !musicOn)) { clearInterval(h); music.timer = null; } }, fade * 1000 + 100);
}
function musicPlay(name) {
  name = TRACKS[name] ? name : 'lobby';
  var changed = music.track !== name || music.want !== name;
  music.want = name; init(); if (!ctx) return;
  if (music.track !== name) { music.track = name; music.step = 0; if (music.timer) music.next = ctx.currentTime + 0.05; }
  else if (!music.timer) music.track = name;
  if (changed || !music.timer) musicKick(changed && !!music.timer);
}
function musicStop() { music.want = null; musicHalt(0.8); }
function musicDuck(v) { music.duck = !!v; if (ctx && music.gain && music.timer && music.want && musicOn) musicRamp(musicTarget(), 0.3); }
function setMusicEnabled(v) {
  musicOn = !!v;
  try { localStorage.setItem(MKEY, musicOn ? '1' : '0'); } catch (e) { }
  if (musicOn) { unlock(); musicKick(); } else musicHalt(0.25);
}
function level() {
  if (!analyser) return 0;
  var d = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(d);
  var m = 0; for (var i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i] - 128)); return m / 128;
}

['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'].forEach(function (ev) { root.addEventListener(ev, unlock, { passive: true, capture: true }); });
document.addEventListener('visibilitychange', function () {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else if (enabled) ctx.resume();
});

root.SFX = { play: play, unlock: unlock, setEnabled: setEnabled, isEnabled: function () { return enabled; }, supported: !!AC,
  musicPlay: musicPlay, musicStop: musicStop, musicDuck: musicDuck, setMusicEnabled: setMusicEnabled, isMusicEnabled: function () { return musicOn; },
  debug: function () { return { state: ctx && ctx.state, timer: !!music.timer, step: music.step, want: music.want, track: music.track, level: level() }; } };
})(window);
