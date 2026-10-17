/* Block Burst: game rules, biomes, particles, sound, music and settings. No dependencies. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ data */
  var N = 8;
  var PALETTE = ['#ff5d5d', '#ff8a3d', '#ffc83d', '#b5e04a', '#4ad66d', '#2fd3b5', '#3ec6f0', '#4f8cff', '#7a6bff', '#c869f0', '#ff5fb0'];
  var RAW = [
    ['#'],
    ['##'], ['###'], ['####'], ['#####'],
    ['#', '#'], ['#', '#', '#'], ['#', '#', '#', '#'], ['#', '#', '#', '#', '#'],
    ['##', '##'], ['###', '###'], ['##', '##', '##'], ['###', '###', '###'],
    ['#.', '##'], ['.#', '##'], ['##', '#.'], ['##', '.#'],
    ['#..', '#..', '###'], ['..#', '..#', '###'], ['###', '#..', '#..'], ['###', '..#', '..#'],
    ['###', '.#.'], ['.#.', '###'], ['#.', '##', '#.'], ['.#', '##', '.#'],
    ['.##', '##.'], ['##.', '.##'], ['#.', '##', '.#'], ['.#', '##', '#.'],
    ['#.', '#.', '##'], ['.#', '.#', '##'], ['##', '#.', '#.'], ['##', '.#', '.#'],
    ['###', '#..'], ['###', '..#'], ['#..', '###'], ['..#', '###']
  ];
  var SHAPES = RAW.map(function (rows) {
    var cells = [];
    rows.forEach(function (row, r) {
      for (var c = 0; c < row.length; c++) if (row[c] === '#') cells.push([r, c]);
    });
    return { cells: cells, h: rows.length, w: rows[0].length };
  });

  /* Each biome: four sky colors, a dark base, a glow color (rgb), an ambient particle kind and a horizon scene. */
  var BIOMES = [
    { name: 'Sunset Dunes',  c: ['#ff7a59', '#ffb347', '#ff5f9e', '#7a3cff'], base: ['#3a1a5e', '#a23a6b'], glow: '255,150,90',  kind: 'dust',     scene: 'dunes' },
    { name: 'Neon Reef',     c: ['#00d4ff', '#2f7bff', '#00e5b0', '#a24bff'], base: ['#052a5e', '#0a5d8f'], glow: '60,210,240',  kind: 'bubble',   scene: 'waves' },
    { name: 'Aurora Tundra', c: ['#6bffd0', '#5a8bff', '#c06bff', '#3ee0ff'], base: ['#0a1640', '#1b2f73'], glow: '120,220,255', kind: 'snow',     scene: 'peaks' },
    { name: 'Candy Cloud',   c: ['#ff7ac0', '#ffb86b', '#7ac8ff', '#a98bff'], base: ['#5b2a8f', '#c04a9a'], glow: '255,140,210', kind: 'confetti', scene: 'clouds' },
    { name: 'Jungle Glow',   c: ['#37e07a', '#c4f54a', '#17b8a0', '#ff9f43'], base: ['#06362a', '#0f6b4a'], glow: '120,240,140', kind: 'firefly',  scene: 'grass' },
    { name: 'Lava Forge',    c: ['#ff4040', '#ff8f1f', '#ffd23f', '#c0245f'], base: ['#3b0a22', '#8a1d2d'], glow: '255,120,60',  kind: 'ember',    scene: 'volcano' },
    { name: 'Cosmic Nebula', c: ['#8f5bff', '#ff4fd8', '#3ec6f0', '#4f6bff'], base: ['#0b0724', '#2a0f5e'], glow: '190,120,255', kind: 'star',     scene: 'planet' }
  ];
  var CLEARS_PER_BIOME = 3; // every third clearing move moves to the next biome; emptying the board always does
  var MAX_TRACK = 80 * 1024 * 1024; // largest music file accepted

  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* --------------------------------------------------------------- helpers */
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function root(name, value) { document.documentElement.style.setProperty(name, value); }
  function hexToRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(hex, amt) {
    var c = hexToRgb(hex), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
    return 'rgb(' + Math.round(c[0] + (t - c[0]) * a) + ',' + Math.round(c[1] + (t - c[1]) * a) + ',' + Math.round(c[2] + (t - c[2]) * a) + ')';
  }
  function rrectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); rrectPath(ctx, x, y, w, h, r); }
  function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* -------------------------------------------------------------- elements */
  var appEl = document.querySelector('.app');
  var topEl = document.querySelector('.top');
  var wrapEl = $('boardWrap'), trayEl = $('tray'), toolsEl = $('tools');
  var boardEl = $('board'), bctx = boardEl.getContext('2d');
  var slots = Array.prototype.slice.call(document.querySelectorAll('.slot'));
  var slotCv = slots.map(function (s) { return s.querySelector('canvas'); });
  var scoreEl = $('score'), bestEl = $('best'), overEl = $('over');
  var bannerEl = $('banner'), pulseEl = $('pulse'), skyEl = $('sky'), noteEl = $('note');
  var ambEl = $('ambient'), actx = ambEl.getContext('2d');
  var burstEl = $('burst'), xctx = burstEl.getContext('2d');
  var shuffleBtn = $('shuffleBtn'), shuffleCountEl = $('shuffleCount');

  /* ----------------------------------------------------------------- state */
  /* Quality tiers. Weak phones get fewer particles, lower canvas resolution and no moving gradients;
     style.css reads the same tier from html[data-q]. */
  var DEVICE_DPR = window.devicePixelRatio || 1;
  var TIERS = {
    low:  { amb: 8,  ambFps: 20, adpr: 0.6, bdpr: 1,   dpr: 1.5, spark: 0.35, confetti: 30,  glow: false },
    mid:  { amb: 22, ambFps: 30, adpr: 1,   bdpr: 1.5, dpr: 2,   spark: 0.6,  confetti: 70,  glow: true },
    high: { amb: 46, ambFps: 0,  adpr: 1.5, bdpr: 2,   dpr: 3,   spark: 1,    confetti: 140, glow: true }
  };
  var tier = 'mid', TQ = TIERS.mid, dpr = Math.min(DEVICE_DPR, TQ.dpr), ready = false, ambAcc = 0;
  var cs = 40, boardPx = 320, slotW = 100, slotH = 100, gridAlpha = 0;
  var grid, pieces, score = 0, best = 0, bestAtStart = 0, streak = 0, over = false;
  var fx = [], drag = null, boardDirty = true, sheetOpen = false;
  var biomeIdx = 0, clearMoves = 0, layers = [];
  var shown = 0, target = 0;
  var AW = 0, AH = 0, adpr = 1, bdpr = 1;
  var parts = [], sparks = [], burstDirty = false;
  var spriteCache = {}, glowCache = {}, shadowCache = {};
  var AMB_COUNT = 0;

  try { best = parseInt(localStorage.getItem('blockburst-best'), 10) || 0; } catch (e) { best = 0; }
  var shuffles = 3, MAX_SHUFFLES = 3; // piece re-rolls per game; a perfect clear earns one more
  var games = 0, lastScore = 0, history = []; // kept for the progress widget (widget.html)
  try {
    var prevStats = JSON.parse(localStorage.getItem('blockburst-stats'));
    if (prevStats) {
      games = prevStats.games | 0; lastScore = prevStats.last | 0;
      if (Array.isArray(prevStats.history)) history = prevStats.history.slice(-60);
    }
  } catch (e) {}

  /* ---------------------------------------------------------------- sprites */
  function sprite(color, s) {
    var px = Math.max(4, Math.round(s * dpr));
    var key = color + '|' + px;
    var c = spriteCache[key];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = px;
    var x = c.getContext('2d'), g = px * 0.05, w = px - 2 * g, r = px * 0.24;
    var body = x.createLinearGradient(0, g, 0, px - g);
    body.addColorStop(0, shade(color, 0.38));
    body.addColorStop(0.5, color);
    body.addColorStop(1, shade(color, -0.28));
    x.fillStyle = body;
    rrect(x, g, g, w, w, r);
    x.fill();
    var rim = x.createLinearGradient(0, 0, px, px);
    rim.addColorStop(0, 'rgba(255,255,255,.75)');
    rim.addColorStop(0.5, 'rgba(255,255,255,0)');
    rim.addColorStop(1, 'rgba(0,0,0,.28)');
    x.lineWidth = px * 0.045;
    x.strokeStyle = rim;
    rrect(x, g + px * 0.025, g + px * 0.025, w - px * 0.05, w - px * 0.05, r * 0.85);
    x.stroke();
    var gloss = x.createLinearGradient(0, g, 0, g + w * 0.55);
    gloss.addColorStop(0, 'rgba(255,255,255,.55)');
    gloss.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gloss;
    rrect(x, g + w * 0.1, g + w * 0.07, w * 0.8, w * 0.36, r * 0.7);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.beginPath();
    x.ellipse(g + w * 0.22, g + w * 0.2, w * 0.07, w * 0.045, -0.5, 0, 6.283);
    x.fill();
    spriteCache[key] = c;
    return c;
  }
  /* One soft shadow, blurred once and reused for every block and for the dragged piece.
     Blurring live with shadowBlur on every redraw is very slow on weak phones. */
  function shadowSprite(s) {
    var px = Math.max(4, Math.round(s * dpr)), c = shadowCache[px];
    if (c) return c;
    var full = Math.ceil(px * 1.8), x;
    c = document.createElement('canvas');
    c.width = c.height = full;
    x = c.getContext('2d');
    x.shadowColor = 'rgba(10,4,36,0.55)';
    x.shadowBlur = px * 0.32;
    x.shadowOffsetY = px * 0.09;
    x.fillStyle = 'rgb(10,4,36)';
    var q = px * 0.86, o = (full - q) / 2;
    rrect(x, o, o, q, q, px * 0.22);
    x.fill();
    shadowCache[px] = c;
    return c;
  }
  function glowSprite(rgb) {
    var c = glowCache[rgb];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(' + rgb + ',1)');
    g.addColorStop(0.35, 'rgba(' + rgb + ',.45)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    glowCache[rgb] = c;
    return c;
  }

  /* -------------------------------------------------------------- game rules */
  function fits(s, r, c) {
    for (var i = 0; i < s.cells.length; i++) {
      var rr = r + s.cells[i][0], cc = c + s.cells[i][1];
      if (rr < 0 || cc < 0 || rr >= N || cc >= N || grid[rr][cc]) return false;
    }
    return true;
  }
  function canPlaceAnywhere(s) {
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (fits(s, r, c)) return true;
    return false;
  }
  function fullLines(g) {
    var rows = [], cols = [], i, j;
    for (i = 0; i < N; i++) {
      var rf = true, cf = true;
      for (j = 0; j < N; j++) { if (!g[i][j]) rf = false; if (!g[j][i]) cf = false; }
      if (rf) rows.push(i);
      if (cf) cols.push(i);
    }
    return { rows: rows, cols: cols };
  }
  function randShape() { return SHAPES[Math.floor(Math.random() * SHAPES.length)]; }
  function pickColors(n) {
    var pool = PALETTE.slice(), out = [];
    for (var i = 0; i < n; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  function makePiece(shape, color) { return { cells: shape.cells, w: shape.w, h: shape.h, color: color }; }
  function newPieces() {
    var cols, p;
    for (var t = 0; t < 40; t++) {
      cols = pickColors(3);
      p = [makePiece(randShape(), cols[0]), makePiece(randShape(), cols[1]), makePiece(randShape(), cols[2])];
      if (p.some(canPlaceAnywhere)) return p;
    }
    cols = pickColors(3);
    return [makePiece(SHAPES[0], cols[0]), makePiece(SHAPES[0], cols[1]), makePiece(SHAPES[0], cols[2])];
  }

  /* ------------------------------------------------------------ sound effects */
  /* All effects are synthesized with Web Audio, so there are no audio files to load. */
  var AudioCtor = window.AudioContext || window.webkitAudioContext;
  var audioCtx = null, sfxGain = null, noiseBuf = null, gestureSeen = false;
  var cfg = { sfx: true, sfxVol: 0.7, musicVol: 0.6, quality: 'auto', fit: 'auto', randomStart: false };   // what the controls show right now
  var saved = { sfx: true, sfxVol: 0.7, musicVol: 0.6, track: null, playing: false, photo: '', dim: '25', quality: 'auto', fit: 'auto', randomStart: false }; // last saved state

  function applySfx() { if (sfxGain) sfxGain.gain.value = cfg.sfx ? cfg.sfxVol : 0; }
  function semis(base, n) { return base * Math.pow(2, n / 12); }
  function tone(freq, when, dur, type, vol, toFreq) {
    if (!audioCtx || !cfg.sfx || cfg.sfxVol <= 0) return;
    var t = audioCtx.currentTime + when;
    var o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(sfxGain);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  function whoosh() {
    if (!audioCtx || !cfg.sfx || cfg.sfxVol <= 0 || !noiseBuf) return;
    var t = audioCtx.currentTime, src = audioCtx.createBufferSource(), f = audioCtx.createBiquadFilter(), g = audioCtx.createGain();
    src.buffer = noiseBuf;
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    src.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    src.start(t);
    src.stop(t + 1);
  }
  var SFX = {
    pick: function () { tone(660, 0, 0.06, 'sine', 0.12); },
    drop: function () { tone(210, 0, 0.14, 'triangle', 0.4, 90); tone(120, 0, 0.1, 'sine', 0.3, 60); },
    nope: function () { tone(180, 0, 0.09, 'square', 0.07, 120); },
    clear: function (n, streakNow) {
      var steps = [0, 4, 7, 12, 16, 19], count = Math.min(steps.length, 2 + n), shift = Math.min((streakNow || 1) - 1, 6);
      for (var i = 0; i < count; i++) {
        tone(semis(523.25, steps[i] + shift), 0.08 + i * 0.065, 0.28, 'triangle', 0.3);
        tone(semis(1046.5, steps[i] + shift), 0.08 + i * 0.065, 0.2, 'sine', 0.08);
      }
    },
    perfect: function () {
      [0, 4, 7, 12, 16, 19, 24, 28].forEach(function (st, i) {
        tone(semis(523.25, st), 0.1 + i * 0.07, 0.5, 'triangle', 0.3);
        tone(semis(1046.5, st), 0.1 + i * 0.07, 0.35, 'sine', 0.1);
      });
    },
    shuffle: function () { [0, 1, 2, 3, 4].forEach(function (i) { tone(280 + i * 70, i * 0.045, 0.05, 'square', 0.05); }); },
    biome: whoosh,
    over: function () { [7, 4, 0, -5].forEach(function (st, i) { tone(semis(392, st), i * 0.18, 0.4, 'sawtooth', 0.12); }); }
  };
  function sfx(name, a, b) { if (SFX[name]) { try { SFX[name](a, b); } catch (e) {} } }

  /* Browsers only allow sound after a tap, so the first tap or key press starts the audio. */
  function unlockAudio() {
    gestureSeen = true;
    if (AudioCtor && !audioCtx) {
      try {
        audioCtx = new AudioCtor();
        sfxGain = audioCtx.createGain();
        sfxGain.connect(audioCtx.destination);
        noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        applySfx();
      } catch (e) { audioCtx = null; AudioCtor = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (wantPlay && musicEl.paused && tracks.length) playMusic();
  }

  /* ------------------------------------------------------------------ music */
  /* Tracks the player adds are kept in IndexedDB so they are still there next time. */
  var musicEl = new Audio();
  var tracks = [], trackIdx = -1, musicUrl = '', wantPlay = false, dbReady = null;
  musicEl.preload = 'auto';

  function openDb() {
    if (dbReady) return dbReady;
    dbReady = new Promise(function (resolve) {
      try {
        var req = indexedDB.open('blockburst', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbReady;
  }
  function dbOp(mode, fn) {
    return openDb().then(function (db) {
      if (!db) throw new Error('no storage');
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('tracks', mode), req = fn(tx.objectStore('tracks'));
        tx.oncomplete = function () { resolve(req && req.result); };
        tx.onerror = tx.onabort = function () { reject(tx.error || new Error('storage error')); };
      });
    });
  }

  var trackListEl = $('trackList'), prevBtn = $('prevBtn'), playBtn = $('playBtn'), nextBtn = $('nextBtn');
  var iconPlay = $('iconPlay'), iconPause = $('iconPause');

  function renderMusic() {
    var playing = !musicEl.paused;
    musicEl.loop = tracks.length === 1;
    trackListEl.textContent = '';
    if (!tracks.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'No music added yet';
      trackListEl.appendChild(empty);
    }
    tracks.forEach(function (t, i) {
      var li = document.createElement('li');
      li.className = 'track' + (i === trackIdx ? ' on' : '') + (i === trackIdx && playing ? ' playing' : '');
      var main = document.createElement('button');
      main.type = 'button';
      main.className = 'track-main';
      main.dataset.i = i;
      main.innerHTML = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';
      var nm = document.createElement('span');
      nm.className = 'track-name';
      nm.textContent = t.name;
      main.appendChild(nm);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'track-del';
      del.dataset.i = i;
      del.setAttribute('aria-label', 'Remove ' + t.name);
      del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      li.appendChild(main);
      li.appendChild(del);
      trackListEl.appendChild(li);
    });
    iconPlay.hidden = playing;
    iconPause.hidden = !playing;
    playBtn.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    playBtn.disabled = !tracks.length;
    prevBtn.disabled = nextBtn.disabled = tracks.length < 2;
  }
  function setMusicVol() { musicEl.volume = clamp(cfg.musicVol, 0, 1); }
  function tryPlay() {
    var pr = musicEl.play();
    if (pr && pr.catch) pr.catch(function () { renderMusic(); });
  }
  function playTrack(i) {
    if (!tracks.length) return;
    trackIdx = ((i % tracks.length) + tracks.length) % tracks.length;
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    musicUrl = URL.createObjectURL(tracks[trackIdx].blob);
    musicEl.src = musicUrl;
    setMusicVol();
    wantPlay = true;
    tryPlay();
    renderMusic();
  }
  function playMusic() {
    if (!tracks.length) return;
    if (trackIdx < 0) trackIdx = 0;
    if (!musicEl.getAttribute('src')) { playTrack(trackIdx); return; }
    wantPlay = true;
    tryPlay();
    renderMusic();
  }
  function pauseMusic() { wantPlay = false; musicEl.pause(); renderMusic(); }
  function removeTrack(i) {
    var t = tracks[i];
    if (!t) return;
    var current = i === trackIdx;
    tracks.splice(i, 1);
    if (current) {
      musicEl.pause();
      musicEl.removeAttribute('src');
      musicEl.load();
      if (musicUrl) { URL.revokeObjectURL(musicUrl); musicUrl = ''; }
      trackIdx = -1;
      wantPlay = false;
    } else if (i < trackIdx) {
      trackIdx--;
    }
    if (typeof t.id === 'number') dbOp('readwrite', function (st) { return st['delete'](t.id); }).then(null, function () {});
    renderMusic();
  }
  function isAudioFile(f) { return (f.type && f.type.indexOf('audio/') === 0) || /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)$/i.test(f.name || ''); }
  function cleanName(n) { return String(n || '').replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() || 'Track'; }
  function addTracks(fileList) {
    var all = Array.prototype.slice.call(fileList || []);
    var list = all.filter(isAudioFile);
    if (!list.length) { if (all.length) note('Choose an mp3 or other audio file.'); return; }
    var skipped = 0, keptAll = true, firstNew = tracks.length;
    list = list.filter(function (f) { if (f.size > MAX_TRACK) { skipped++; return false; } return true; });
    if (skipped) note(skipped + (skipped > 1 ? ' files were' : ' file was') + ' over 80 MB and skipped.');
    list.reduce(function (p, f) {
      return p.then(function () {
        var blob = new Blob([f], { type: f.type || 'audio/mpeg' });
        var rec = { name: cleanName(f.name), blob: blob };
        return dbOp('readwrite', function (st) { return st.add({ name: rec.name, blob: blob }); })
          .then(function (id) { rec.id = id; }, function () { rec.id = 't' + Date.now() + Math.random(); keptAll = false; })
          .then(function () { tracks.push(rec); renderMusic(); });
      });
    }, Promise.resolve()).then(function () {
      if (!keptAll) note('Added for this session only. Storage is unavailable.');
      if (musicEl.paused && trackIdx < 0 && tracks.length > firstNew) playTrack(firstNew);
    });
  }
  musicEl.addEventListener('play', renderMusic);
  musicEl.addEventListener('pause', renderMusic);
  musicEl.addEventListener('ended', function () { if (tracks.length > 1) playTrack(trackIdx + 1); });
  musicEl.addEventListener('error', function () {
    if (!musicEl.getAttribute('src')) return;
    wantPlay = false;
    note('That audio file could not be played.');
    renderMusic();
  });
  trackListEl.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.dataset.i === undefined) return;
    unlockAudio();
    var i = parseInt(b.dataset.i, 10);
    if (b.className.indexOf('track-del') !== -1) removeTrack(i);
    else if (i === trackIdx && musicEl.getAttribute('src')) { if (musicEl.paused) playMusic(); else pauseMusic(); }
    else playTrack(i);
  });
  playBtn.addEventListener('click', function () { unlockAudio(); if (musicEl.paused) playMusic(); else pauseMusic(); });
  prevBtn.addEventListener('click', function () { unlockAudio(); playTrack(trackIdx < 0 ? 0 : trackIdx - 1); });
  nextBtn.addEventListener('click', function () { unlockAudio(); playTrack(trackIdx < 0 ? 0 : trackIdx + 1); });
  $('addMusic').addEventListener('click', function () { $('musicFile').value = ''; $('musicFile').click(); });
  $('musicFile').addEventListener('change', function () { addTracks($('musicFile').files); });

  /* ----------------------------------------------------------------- biomes */
  function waveD(y, amp, len, phase) {
    var d = 'M0 200 L0 ' + y.toFixed(1);
    for (var x = 0; x <= 400; x += 8) d += ' L' + x + ' ' + (y + amp * Math.sin(x / len * 6.283 + phase)).toFixed(1);
    return d + ' L400 200 Z';
  }
  function peaksD(base, minH, maxH, step, seed) {
    var r = rnd(seed), x = -10, d = 'M-10 200 L-10 ' + base;
    while (x < 410) {
      var px = x + step * (0.5 + r() * 0.5);
      d += ' L' + px.toFixed(1) + ' ' + (base - (minH + r() * (maxH - minH))).toFixed(1);
      x = px + step * (0.5 + r() * 0.5);
      d += ' L' + x.toFixed(1) + ' ' + (base - r() * minH * 0.3).toFixed(1);
    }
    return d + ' L410 200 Z';
  }
  function sceneSVG(kind) {
    var far = 'rgba(10,4,40,.16)', near = 'rgba(10,4,40,.30)', body = '';
    switch (kind) {
      case 'dunes':
        body = '<path d="M0 138 C70 102 130 108 200 138 S340 168 400 122 L400 200 L0 200Z" fill="' + far + '"/>' +
               '<path d="M0 168 C80 142 150 152 220 170 S350 152 400 162 L400 200 L0 200Z" fill="' + near + '"/>';
        break;
      case 'waves':
        body = '<path d="' + waveD(142, 9, 140, 0.4) + '" fill="' + far + '"/><path d="' + waveD(172, 7, 90, 2) + '" fill="' + near + '"/>';
        break;
      case 'peaks':
        body = '<path d="' + peaksD(170, 40, 105, 80, 7) + '" fill="' + far + '"/><path d="' + peaksD(190, 22, 60, 60, 21) + '" fill="' + near + '"/>';
        break;
      case 'clouds':
        body = '<g fill="rgba(255,255,255,.22)"><circle cx="30" cy="185" r="40"/><circle cx="100" cy="168" r="48"/><circle cx="180" cy="190" r="44"/><circle cx="262" cy="170" r="52"/><circle cx="345" cy="188" r="46"/><circle cx="400" cy="172" r="40"/></g>' +
               '<g fill="rgba(255,255,255,.2)"><circle cx="60" cy="205" r="42"/><circle cx="150" cy="208" r="46"/><circle cx="240" cy="206" r="44"/><circle cx="330" cy="208" r="48"/></g>';
        break;
      case 'grass':
        body = '<path d="' + peaksD(190, 30, 80, 14, 3) + '" fill="' + far + '"/><path d="' + peaksD(200, 18, 46, 10, 11) + '" fill="' + near + '"/>';
        break;
      case 'volcano':
        body = '<path d="M0 200 L0 160 L70 145 L125 92 L156 64 L184 64 L212 94 L275 142 L340 128 L400 152 L400 200Z" fill="' + far + '"/>' +
               '<ellipse cx="170" cy="64" rx="16" ry="4.5" fill="#ffb347" opacity=".85"/>' +
               '<path d="M0 200 L0 182 L90 172 L200 186 L310 170 L400 184 L400 200Z" fill="' + near + '"/>';
        break;
      case 'planet':
        body = '<circle cx="310" cy="190" r="78" fill="rgba(10,4,40,.28)"/>' +
               '<ellipse cx="310" cy="190" rx="124" ry="20" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="3" transform="rotate(-16 310 190)"/>' +
               '<circle cx="60" cy="176" r="26" fill="rgba(255,255,255,.1)"/>';
        break;
    }
    return '<svg class="scene" viewBox="0 0 400 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true">' + body + '</svg>';
  }
  function buildBiomes() {
    BIOMES.forEach(function (b) {
      var layer = document.createElement('div');
      layer.className = 'biome';
      var drift = document.createElement('div');
      drift.className = 'drift';
      drift.style.background =
        'radial-gradient(48% 42% at 18% 14%, ' + b.c[0] + ' 0%, transparent 72%),' +
        'radial-gradient(46% 46% at 88% 28%, ' + b.c[1] + ' 0%, transparent 72%),' +
        'radial-gradient(52% 46% at 72% 88%, ' + b.c[2] + ' 0%, transparent 72%),' +
        'radial-gradient(46% 42% at 8% 78%, ' + b.c[3] + ' 0%, transparent 72%),' +
        'linear-gradient(165deg, ' + b.base[0] + ', ' + b.base[1] + ')';
      layer.appendChild(drift);
      layer.insertAdjacentHTML('beforeend', sceneSVG(b.scene));
      skyEl.appendChild(layer);
      layers.push(layer);
    });
  }
  function showBanner(b) {
    bannerEl.textContent = '';
    var name = document.createElement('div');
    name.className = 'banner-name';
    name.textContent = b.name;
    var dots = document.createElement('div');
    dots.className = 'banner-dots';
    b.c.forEach(function (col) { var d = document.createElement('i'); d.style.background = col; dots.appendChild(d); });
    bannerEl.appendChild(name);
    bannerEl.appendChild(dots);
    bannerEl.classList.remove('show');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
  }
  /* widget.html reads these numbers from the same storage, so keep it up to date. */
  function saveStats() {
    var b = BIOMES[biomeIdx], json = JSON.stringify({ best: best, last: lastScore, games: games, history: history, biome: { name: b.name, c: b.c, base: b.base }, t: Date.now() });
    try { localStorage.setItem('blockburst-stats', json); } catch (e) {}
    /* inside the Android app, hand the same numbers to the home-screen widget */
    try { if (window.BlockBurstNative && window.BlockBurstNative.saveStats) window.BlockBurstNative.saveStats(json); } catch (e) {}
  }
  var fadeTimers = [];
  function showLayer(k, instant) {
    layers.forEach(function (l, j) {
      if (j === k) {
        clearTimeout(fadeTimers[j]);
        l.classList.add('show');
        if (instant) l.classList.add('on');
        else if (!l.classList.contains('on')) { void l.offsetWidth; l.classList.add('on'); }
      } else if (l.classList.contains('on')) {
        l.classList.remove('on');
        fadeTimers[j] = setTimeout(function () { l.classList.remove('show'); }, 1700);
      }
    });
  }
  function setBiome(i, announce) {
    biomeIdx = ((i % BIOMES.length) + BIOMES.length) % BIOMES.length;
    var b = BIOMES[biomeIdx];
    showLayer(biomeIdx, !ready);
    root('--glow', b.glow);
    saveStats();
    parts.forEach(function (p) { if (p.k !== b.kind && p.dying === 0) p.dying = 0.001 - Math.random() * 0.6; });
    if (announce) { showBanner(b); sfx('biome'); }
  }

  /* -------------------------------------------------------- ambient particles */
  function spawn(kind, anywhere) {
    var p = { k: kind, x: Math.random() * AW, y: Math.random() * AH, vx: 0, vy: 0, r: 2, ph: Math.random() * 6.283, age: 0, life: 0, rot: Math.random() * 6.283, vr: 0, col: '255,255,255', dying: 0 };
    var edge = !anywhere;
    switch (kind) {
      case 'dust':
        p.r = 1 + Math.random() * 2.2; p.vx = 8 + Math.random() * 10; p.vy = -(6 + Math.random() * 12); p.col = '255,226,180';
        if (edge) p.y = AH + 10;
        break;
      case 'bubble':
        p.r = 3 + Math.random() * 10; p.vy = -(18 + Math.random() * 28);
        if (edge) p.y = AH + 20;
        break;
      case 'snow':
        p.r = 1.4 + Math.random() * 3; p.vy = 14 + Math.random() * 26; p.vx = -6 + Math.random() * 12;
        if (edge) p.y = -10;
        break;
      case 'confetti':
        p.r = 3 + Math.random() * 3; p.vy = 16 + Math.random() * 24; p.vx = -8 + Math.random() * 16; p.vr = (Math.random() - 0.5) * 3;
        p.col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        if (edge) p.y = -10;
        break;
      case 'firefly':
        p.r = 2 + Math.random() * 2.5; p.vx = (Math.random() - 0.5) * 14; p.vy = (Math.random() - 0.5) * 14; p.life = 8 + Math.random() * 10;
        break;
      case 'ember':
        p.r = 1.2 + Math.random() * 2.6; p.vy = -(24 + Math.random() * 50); p.vx = -8 + Math.random() * 16;
        if (edge) p.y = AH + 10;
        break;
      case 'star':
        p.r = 0.7 + Math.random() * 1.8; p.vx = -2; p.life = 8 + Math.random() * 10;
        break;
    }
    return p;
  }
  function drawAmbient(p) {
    var env = Math.min(1, p.age / 1.2), c = actx, s, sz;
    if (p.life) env *= Math.sin(Math.PI * Math.min(1, p.age / p.life));
    if (p.dying > 0) env *= Math.max(0, 1 - p.dying);
    if (env < 0.02) return;
    switch (p.k) {
      case 'dust':
        c.globalAlpha = 0.6 * env * (0.6 + 0.4 * Math.sin(p.age * 2 + p.ph));
        c.fillStyle = 'rgb(' + p.col + ')';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill();
        break;
      case 'bubble':
        c.globalAlpha = 0.5 * env; c.strokeStyle = 'rgb(225,250,255)'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.stroke();
        c.globalAlpha = 0.1 * env; c.fillStyle = '#fff'; c.fill();
        c.globalAlpha = 0.6 * env;
        c.beginPath(); c.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, Math.max(0.8, p.r * 0.18), 0, 6.283); c.fill();
        break;
      case 'snow':
        c.globalAlpha = 0.8 * env; c.fillStyle = '#fff';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill();
        break;
      case 'confetti':
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.globalAlpha = 0.7 * env; c.fillStyle = p.col;
        c.fillRect(-p.r, -p.r * 0.55, p.r * 2, p.r * 1.1);
        c.restore();
        break;
      case 'firefly':
        s = Math.sin(p.age * 2.4 + p.ph); sz = p.r * 9;
        c.globalCompositeOperation = TQ.glow ? 'lighter' : 'source-over';
        c.globalAlpha = env * (0.35 + 0.65 * s * s);
        c.drawImage(glowSprite('230,255,120'), p.x - sz / 2, p.y - sz / 2, sz, sz);
        c.globalCompositeOperation = 'source-over';
        break;
      case 'ember':
        sz = p.r * 8;
        c.globalCompositeOperation = TQ.glow ? 'lighter' : 'source-over';
        c.globalAlpha = env * (0.55 + 0.45 * Math.sin(p.age * 9 + p.ph));
        c.drawImage(glowSprite('255,140,50'), p.x - sz / 2, p.y - sz / 2, sz, sz);
        c.globalAlpha = env * 0.9; c.fillStyle = 'rgb(255,220,140)';
        c.beginPath(); c.arc(p.x, p.y, p.r * 0.5, 0, 6.283); c.fill();
        c.globalCompositeOperation = 'source-over';
        break;
      case 'star':
        c.globalAlpha = (0.35 + 0.65 * Math.abs(Math.sin(p.age * 1.6 + p.ph))) * env; c.fillStyle = '#fff';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.283); c.fill();
        if (p.r > 1.6) { c.fillRect(p.x - p.r * 2.2, p.y - 0.4, p.r * 4.4, 0.8); c.fillRect(p.x - 0.4, p.y - p.r * 2.2, 0.8, p.r * 4.4); }
        break;
    }
    c.globalAlpha = 1;
  }
  function updateAmbient(dt) {
    if (!AMB_COUNT && !parts.length) return;
    actx.setTransform(adpr, 0, 0, adpr, 0, 0);
    actx.clearRect(0, 0, AW, AH);
    if (!AMB_COUNT) { parts.length = 0; return; }
    var kind = BIOMES[biomeIdx].kind;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.age += dt;
      if (p.dying !== 0) p.dying += dt;
      if (p.k === 'firefly') {
        p.vx = clamp(p.vx + (Math.random() - 0.5) * 30 * dt, -18, 18);
        p.vy = clamp(p.vy + (Math.random() - 0.5) * 30 * dt, -18, 18);
      }
      var sway = (p.k === 'bubble' || p.k === 'snow' || p.k === 'confetti') ? Math.sin(p.age * 1.3 + p.ph) * 10 * dt : 0;
      p.x += p.vx * dt + sway;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
      var gone = p.dying > 1 || (p.life && p.age > p.life);
      var off = p.y < -40 || p.y > AH + 40 || p.x < -40 || p.x > AW + 40;
      if (gone || off) { parts[i] = p = spawn(kind, gone); }
      drawAmbient(p);
    }
  }

  /* --------------------------------------------------------- burst particles */
  function emitSparks(x, y, color, n) {
    if (REDUCED) return;
    n = Math.max(1, Math.round(n * TQ.spark));
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = 90 + Math.random() * 230;
      sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90, g: 700, s: 2 + Math.random() * 4, life: 0, max: 0.55 + Math.random() * 0.5, col: color, rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 10, shape: Math.random() < 0.5 ? 0 : 1 });
    }
  }
  function emitConfetti() {
    if (REDUCED) return;
    for (var i = 0; i < TQ.confetti; i++) {
      sparks.push({ x: Math.random() * AW, y: -20 - Math.random() * 220, vx: (Math.random() - 0.5) * 120, vy: 120 + Math.random() * 200, g: 120, s: 4 + Math.random() * 4, life: 0, max: 2.4 + Math.random() * 1.2, col: PALETTE[Math.floor(Math.random() * PALETTE.length)], rot: Math.random() * 6.283, vr: (Math.random() - 0.5) * 8, shape: 2 });
    }
  }
  function updateBurst(dt) {
    if (!sparks.length) {
      if (burstDirty) { xctx.setTransform(1, 0, 0, 1, 0, 0); xctx.clearRect(0, 0, burstEl.width, burstEl.height); burstDirty = false; }
      return;
    }
    burstDirty = true;
    xctx.setTransform(bdpr, 0, 0, bdpr, 0, 0);
    xctx.clearRect(0, 0, AW, AH);
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.life += dt;
      if (s.life >= s.max) { sparks.splice(i, 1); continue; }
      s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      var k = 1 - s.life / s.max;
      xctx.globalAlpha = Math.min(1, k * 1.6);
      xctx.fillStyle = s.col;
      if (s.shape === 2) {
        xctx.globalCompositeOperation = 'source-over';
        xctx.save(); xctx.translate(s.x, s.y); xctx.rotate(s.rot); xctx.scale(Math.cos(s.rot * 0.7), 1);
        xctx.fillRect(-s.s, -s.s * 0.6, s.s * 2, s.s * 1.2);
        xctx.restore();
      } else {
        xctx.globalCompositeOperation = TQ.glow ? 'lighter' : 'source-over';
        if (s.shape === 0) { xctx.beginPath(); xctx.arc(s.x, s.y, s.s * (0.4 + k * 0.6), 0, 6.283); xctx.fill(); }
        else { xctx.save(); xctx.translate(s.x, s.y); xctx.rotate(s.rot); xctx.fillRect(-s.s, -s.s * 0.5, s.s * 2, s.s); xctx.restore(); }
      }
    }
    xctx.globalAlpha = 1;
    xctx.globalCompositeOperation = 'source-over';
  }

  /* ----------------------------------------------------------------- drawing */
  function drawSlot(i) {
    var cv = slotCv[i], x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, slotW, slotH);
    var s = pieces[i];
    if (!s) return;
    var t = Math.min(Math.min(slotW, slotH) * 0.86 / Math.max(s.w, s.h, 2), cs * 0.6);
    var ox = (slotW - s.w * t) / 2, oy = (slotH - s.h * t) / 2, sp = sprite(s.color, t);
    s.cells.forEach(function (p) { x.drawImage(sp, ox + p[1] * t, oy + p[0] * t, t, t); });
  }
  function drawTray() { for (var i = 0; i < 3; i++) drawSlot(i); }

  function drawBoard(now) {
    boardDirty = false;
    var ctx = bctx, i, j;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, boardPx, boardPx);

    // The grid is invisible at rest. It fades in only while a piece is being dragged.
    if (gridAlpha > 0.01) {
      ctx.beginPath();
      for (i = 0; i < N; i++) for (j = 0; j < N; j++) if (!grid[i][j]) rrectPath(ctx, j * cs + 1.5, i * cs + 1.5, cs - 3, cs - 3, cs * 0.2);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.11 * gridAlpha).toFixed(3) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.24 * gridAlpha).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      rrect(ctx, 0.75, 0.75, boardPx - 1.5, boardPx - 1.5, cs * 0.3);
      ctx.stroke();
    }

    // Soft shadows go down first so blocks stay readable on any background, then the blocks themselves.
    var sh = shadowSprite(cs), sw = cs * 1.8, so = cs * 0.4;
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) if (grid[i][j]) ctx.drawImage(sh, j * cs - so, i * cs - so, sw, sw);
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) if (grid[i][j]) ctx.drawImage(sprite(grid[i][j], cs), j * cs, i * cs, cs, cs);

    if (drag && drag.target) {
      var r0 = drag.target.r, c0 = drag.target.c, s = drag.s;
      var g2 = grid.map(function (row) { return row.slice(); });
      s.cells.forEach(function (p) { g2[r0 + p[0]][c0 + p[1]] = s.color; });
      var fl = fullLines(g2);
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      fl.rows.forEach(function (r) { rrectPath(ctx, 1.5, r * cs + 1.5, boardPx - 3, cs - 3, cs * 0.2); });
      fl.cols.forEach(function (c) { rrectPath(ctx, c * cs + 1.5, 1.5, cs - 3, boardPx - 3, cs * 0.2); });
      ctx.fill();
      ctx.globalAlpha = 0.62;
      var sp = sprite(s.color, cs);
      s.cells.forEach(function (p) { ctx.drawImage(sp, (c0 + p[1]) * cs, (r0 + p[0]) * cs, cs, cs); });
      ctx.restore();
    }

    fx = fx.filter(function (f) {
      var p = (now - f.t) / 360;
      if (p >= 1) return false;
      var sc = 1 + p * 0.25 - p * p * 0.9, size = cs * Math.max(0.1, sc), off = (cs - size) / 2;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.drawImage(sprite(f.color, cs), f.c * cs + off, f.r * cs + off, size, size);
      if (p < 0.4) {
        ctx.globalAlpha = (0.4 - p) * 2;
        ctx.fillStyle = '#ffffff';
        rrect(ctx, f.c * cs + off, f.r * cs + off, size, size, cs * 0.22);
        ctx.fill();
      }
      ctx.restore();
      return true;
    });
  }

  /* ---------------------------------------------------------------- layout */
  function applySize(s) {
    cs = Math.max(20, Math.floor(s / N));
    boardPx = cs * N;
    root('--cs', cs + 'px');
    root('--w', (boardPx + 24) + 'px');
    boardEl.style.width = boardPx + 'px';
    boardEl.style.height = boardPx + 'px';
    boardEl.width = Math.round(boardPx * dpr);
    boardEl.height = Math.round(boardPx * dpr);
    spriteCache = {}; shadowCache = {};
    boardDirty = true;
  }
  function sizeSlots() {
    slotW = slots[0].clientWidth;
    slotH = slots[0].clientHeight;
    slotCv.forEach(function (cv) { cv.width = Math.round(slotW * dpr); cv.height = Math.round(slotH * dpr); });
    if (pieces) drawTray();
  }
  /* Two layouts. Tall screens (phones, tablets in portrait) stack everything in one column.
     Wide screens (phones and tablets in landscape, desktops) put the board on the left and the
     score, pieces and buttons in a column on the right. */
  function layout() {
    var st = getComputedStyle(appEl);
    var padX = parseFloat(st.paddingLeft) + parseFloat(st.paddingRight);
    var padY = parseFloat(st.paddingTop) + parseFloat(st.paddingBottom);
    var availW = appEl.clientWidth - padX;
    var availH = document.body.clientHeight - padY;
    var gapY = 14, gapX = 28, s, k;
    var side = availW / availH >= 1.25 && availW >= 520;
    appEl.dataset.mode = side ? 'side' : 'stack';
    if (!side) {
      trayEl.dataset.orient = 'row';
      root('--slot-maxh', 'none');
      s = Math.min(availW - 24, 720);
      for (k = 0; k < 5; k++) {
        applySize(s);
        var total = topEl.offsetHeight + wrapEl.offsetHeight + trayEl.offsetHeight + toolsEl.offsetHeight + gapY * 3;
        if (total <= availH + 1 || s <= 200) break;
        s = Math.max(200, s - Math.ceil((total - availH) * 0.75));
      }
    } else {
      var maxS = Math.max(200, Math.min(availH - 24, 900));
      s = clamp(availW - 300 - gapX - 24, maxS * 0.72, maxS);
      if (availW - (s + 24) - gapX < 200) s = Math.max(200, availW - 200 - gapX - 24);
      applySize(s);
      var cw = clamp(availW - (boardPx + 24) - gapX, 200, 460);
      root('--cw', cw + 'px');
      var avail = Math.max(0, boardPx + 24 - topEl.offsetHeight - toolsEl.offsetHeight - gapY * 2);
      root('--mid', avail + 'px');
      var slotRow = (cw - 44) / 3, slotColW = cw - 26, slotColH = (avail - 44) / 3;
      var tRow = Math.min(slotRow, avail - 24) * 0.86 / 5;
      var tCol = Math.min(slotColW, slotColH) * 0.86 / 5;
      var col = tCol > tRow * 1.15;
      trayEl.dataset.orient = col ? 'col' : 'row';
      root('--slot-maxh', col ? 'none' : Math.max(40, avail - 24) + 'px');
    }
    sizeSlots();
    if (typeof applyPhotoFit === 'function') applyPhotoFit();
  }
  function sizeFx() {
    AW = window.innerWidth; AH = window.innerHeight;
    adpr = Math.min(DEVICE_DPR, TQ.adpr);
    bdpr = Math.min(DEVICE_DPR, TQ.bdpr);
    ambEl.width = Math.round(AW * adpr); ambEl.height = Math.round(AH * adpr);
    burstEl.width = Math.round(AW * bdpr); burstEl.height = Math.round(AH * bdpr);
  }

  /* ------------------------------------------------------------ score and UI */
  function setScore(n, instant) {
    target = n;
    if (instant) { shown = n; scoreEl.textContent = n; return; }
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');
  }
  function tweenScore() {
    if (shown === target) return;
    var step = Math.max(1, Math.ceil(Math.abs(target - shown) * 0.15));
    shown = shown < target ? Math.min(target, shown + step) : Math.max(target, shown - step);
    scoreEl.textContent = shown;
  }
  function popup(text, sub) {
    var el = document.createElement('div');
    el.className = 'pop';
    el.textContent = text;
    if (sub) { var sm = document.createElement('small'); sm.textContent = sub; el.appendChild(sm); }
    wrapEl.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1150);
  }
  function pulse(color) {
    var c = hexToRgb(color);
    root('--pc', c[0] + ',' + c[1] + ',' + c[2]);
    pulseEl.classList.remove('go');
    void pulseEl.offsetWidth;
    pulseEl.classList.add('go');
  }
  var noteTimer = 0;
  function note(text) {
    noteEl.textContent = text;
    clearTimeout(noteTimer);
    if (text) noteTimer = setTimeout(function () { noteEl.textContent = ''; }, 3500);
  }

  /* -------------------------------------------------------------- game flow */
  function place(idx, r, c) {
    var s = pieces[idx], now = performance.now();
    s.cells.forEach(function (p) { grid[r + p[0]][c + p[1]] = s.color; });
    sfx('drop');
    var gain = s.cells.length;
    var fl = fullLines(grid), n = fl.rows.length + fl.cols.length;
    if (n) {
      var set = {}, firstColor = null, rect = boardEl.getBoundingClientRect();
      fl.rows.forEach(function (rw) { for (var k = 0; k < N; k++) set[rw * N + k] = 1; });
      fl.cols.forEach(function (cl) { for (var k = 0; k < N; k++) set[k * N + cl] = 1; });
      Object.keys(set).forEach(function (key) {
        var rr = Math.floor(key / N), cc = key % N, col = grid[rr][cc];
        if (!firstColor) firstColor = col;
        fx.push({ r: rr, c: cc, color: col, t: now });
        emitSparks(rect.left + (cc + 0.5) * cs, rect.top + (rr + 0.5) * cs, col, 3);
        grid[rr][cc] = 0;
      });
      streak++;
      gain += n * n * 10 + (streak > 1 ? (streak - 1) * 15 : 0);
      var empty = grid.every(function (row) { return row.every(function (v) { return !v; }); });
      if (empty) { gain += 100; shuffles = Math.min(MAX_SHUFFLES + 2, shuffles + 1); updateShuffleUI(); shuffleBtn.classList.remove('got'); void shuffleBtn.offsetWidth; shuffleBtn.classList.add('got'); }
      popup('+' + gain, (empty ? 'Board cleared' : (n > 1 ? n + ' lines' : 'Line clear')) + (streak > 1 ? ' · streak x' + streak : ''));
      pulse(firstColor);
      sfx(empty ? 'perfect' : 'clear', n, streak);
      clearMoves++;
      if (empty) { clearMoves = 0; emitConfetti(); setBiome(biomeIdx + 1, true); }
      else if (clearMoves >= CLEARS_PER_BIOME) { clearMoves = 0; setBiome(biomeIdx + 1, true); }
    } else {
      streak = 0;
    }
    score += gain;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      try { localStorage.setItem('blockburst-best', String(best)); } catch (e) {}
      saveStats();
    }
    setScore(score, false);
    pieces[idx] = null;
    if (pieces.every(function (p) { return !p; })) pieces = newPieces();
    boardDirty = true;
    drawTray();
    if (pieces.every(function (p) { return !p || !canPlaceAnywhere(p); })) {
      over = true;
      setTimeout(showOver, 450);
    }
  }
  function showOver() {
    lastScore = score;
    games++;
    history.push({ s: score, t: Date.now() });
    if (history.length > 60) history.shift();
    saveStats();
    $('finalScore').textContent = score;
    $('newBest').hidden = !(score > bestAtStart);
    overEl.hidden = false;
    sfx('over');
  }
  function updateShuffleUI() {
    shuffleCountEl.textContent = shuffles;
    shuffleBtn.classList.toggle('empty', shuffles <= 0);
    shuffleBtn.setAttribute('aria-label', 'Shuffle pieces, ' + shuffles + ' left');
  }
  function rerollPieces(old) {
    for (var t = 0; t < 40; t++) {
      var cols = pickColors(3);
      var p = old.map(function (o, i) { return o ? makePiece(randShape(), cols[i]) : null; });
      if (p.some(function (x) { return x && canPlaceAnywhere(x); })) return p;
    }
    return old.map(function (o) { return o ? makePiece(SHAPES[0], pickColors(1)[0]) : null; });
  }
  function shufflePieces() {
    if (over || sheetOpen || drag) return;
    unlockAudio();
    if (shuffles <= 0) { sfx('nope'); note('No shuffles left this game. A board clear earns one.'); return; }
    if (!pieces.some(Boolean)) return;
    shuffles--;
    pieces = rerollPieces(pieces);
    drawTray();
    updateShuffleUI();
    sfx('shuffle');
    trayEl.classList.remove('shuffled');
    void trayEl.offsetWidth;
    trayEl.classList.add('shuffled');
  }
  /* "Start with random blocks": a few small shapes already on the board, never a full line. */
  function scatter() {
    var want = 3 + Math.floor(Math.random() * 3), placed = 0;
    for (var tries = 0; tries < 80 && placed < want; tries++) {
      var sh = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      if (sh.w > 3 || sh.h > 3) continue;
      var r = Math.floor(Math.random() * (N - sh.h + 1)), c = Math.floor(Math.random() * (N - sh.w + 1));
      if (!fits(sh, r, c)) continue;
      var col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      sh.cells.forEach(function (p) { grid[r + p[0]][c + p[1]] = col; });
      placed++;
    }
  }
  function start() {
    grid = [];
    for (var i = 0; i < N; i++) grid.push(new Array(N).fill(0));
    if (cfg.randomStart) scatter();
    shuffles = MAX_SHUFFLES;
    updateShuffleUI();
    pieces = newPieces();
    score = 0; streak = 0; over = false; fx = []; drag = null; clearMoves = 0;
    bestAtStart = best;
    overEl.hidden = true;
    bestEl.textContent = best;
    setScore(0, true);
    boardDirty = true;
    drawTray();
  }

  /* -------------------------------------------------------------- dragging */
  /* Pointer events can arrive 120 to 240 times a second. We only remember the latest position here and
     do the work once per frame in applyDrag. */
  function moveDrag(e) {
    var d = drag;
    if (!d) return;
    d.ex = e.clientX; d.ey = e.clientY; d.dirty = true;
  }
  function applyDrag() {
    var d = drag;
    if (!d || !d.dirty) return;
    d.dirty = false;
    var left = d.ex - d.w / 2, top = d.ey + d.dy, rect = d.rect;
    d.g.style.transform = 'translate(' + (left - d.pad) + 'px,' + (top - d.pad) + 'px)';
    var c = Math.round((left - rect.left) / cs), r = Math.round((top - rect.top) / cs);
    var t = fits(d.s, r, c) ? { r: r, c: c } : null;
    if (!t !== !d.target || (t && (t.r !== d.target.r || t.c !== d.target.c))) boardDirty = true;
    d.target = t;
  }
  function endDrag(e, drop) {
    var d = drag;
    if (!d) return;
    if (drop) applyDrag();
    drag = null;
    if (d.g.parentNode) d.g.parentNode.removeChild(d.g);
    slots[d.i].classList.remove('lifted');
    boardDirty = true;
    if (drop && d.target) place(d.i, d.target.r, d.target.c);
    else if (drop) sfx('nope');
  }
  slots.forEach(function (slot, i) {
    slot.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    slot.addEventListener('pointerdown', function (e) {
      if (over || sheetOpen || !pieces[i] || drag) return;
      e.preventDefault();
      try { slot.setPointerCapture(e.pointerId); } catch (err) {}
      var s = pieces[i], g = document.createElement('canvas'), w = s.w * cs, h = s.h * cs, pad = Math.ceil(cs * 0.6);
      g.width = Math.round((w + pad * 2) * dpr); g.height = Math.round((h + pad * 2) * dpr);
      g.style.width = (w + pad * 2) + 'px'; g.style.height = (h + pad * 2) + 'px';
      g.className = 'ghost';
      var gx = g.getContext('2d'), sp = sprite(s.color, cs), sh = shadowSprite(cs), lift = cs * 0.14;
      gx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.cells.forEach(function (p) { gx.drawImage(sh, pad + p[1] * cs - cs * 0.4, pad + p[0] * cs - cs * 0.4 + lift, cs * 1.8, cs * 1.8); });
      s.cells.forEach(function (p) { gx.drawImage(sp, pad + p[1] * cs, pad + p[0] * cs, cs, cs); });
      document.body.appendChild(g);
      // touch: the piece rides just above the finger so the finger never hides it
      drag = { i: i, s: s, g: g, w: w, h: h, pad: pad, rect: boardEl.getBoundingClientRect(), dy: e.pointerType === 'mouse' ? -h / 2 : -h - Math.max(28, cs * 0.9), target: null, dirty: false, ex: 0, ey: 0 };
      slot.classList.add('lifted');
      sfx('pick');
      moveDrag(e);
      applyDrag();
    });
    slot.addEventListener('pointermove', moveDrag);
    slot.addEventListener('pointerup', function (e) { endDrag(e, true); });
    slot.addEventListener('pointercancel', function (e) { endDrag(e, false); });
    slot.addEventListener('lostpointercapture', function (e) { if (drag && drag.i === i) endDrag(e, false); });
  });

  /* ------------------------------------------------------------ settings sheet */
  /* Controls change things right away so you can hear and see them. Save keeps them and closes the
     sheet. Closing any other way puts sound, volume and photo back to the last saved state. */
  var photoEl = $('photo'), photoBgEl = $('photoBg'), photoFgEl = $('photoFg'), fileEl = $('file'), sheetEl = $('sheet'), backdropEl = $('sheetBackdrop');
  var sfxOnEl = $('sfxOn'), sfxVolEl = $('sfxVol'), musicVolEl = $('musicVol'), dimEl = $('dim');
  var changeBtn = $('changeBtn'), removeBtn = $('removeBtn'), dimWrap = $('dimWrap');
  var fitWrap = $('fitWrap'), fitSeg = $('fitSeg'), qSeg = $('qSeg'), qHint = $('qHint'), randomEl = $('randomStart');
  var draftPhoto = '', photoObj = '', photoW = 0, photoH = 0;
  var QNAME = { low: 'Saver', mid: 'Balanced', high: 'Full' };

  /* ---- quality tier ---- */
  function detectTier() {
    var cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory;
    var t = (cores <= 2 || (mem && mem <= 2)) ? 'low'
          : (mem ? (mem >= 6 && cores >= 6 ? 'high' : 'mid') : (cores >= 8 ? 'high' : 'mid'));
    var auto = null;
    try { auto = localStorage.getItem('blockburst-qauto'); } catch (e) {}
    if (auto === 'low' || (auto === 'mid' && t === 'high')) t = auto; // an earlier slowdown on this device sticks
    return t;
  }
  function updateQHint() {
    qHint.textContent = cfg.quality === 'auto' ? 'Auto is using ' + QNAME[tier] + ' on this device. It lowers effects by itself if the game slows down.' : '';
  }
  function applyTier(t) {
    if (!TIERS[t]) t = 'mid';
    tier = t; TQ = TIERS[t];
    document.documentElement.setAttribute('data-q', t);
    dpr = Math.min(DEVICE_DPR, TQ.dpr);
    AMB_COUNT = REDUCED ? 0 : TQ.amb;
    if (ready) {
      var kind = BIOMES[biomeIdx].kind;
      while (parts.length > AMB_COUNT) parts.pop();
      while (parts.length < AMB_COUNT) parts.push(spawn(kind, true));
      sizeFx();
      layout();
    }
    updateQHint();
  }
  function setQualityPref(v) {
    cfg.quality = v;
    if (v === 'auto') {
      try { localStorage.removeItem('blockburst-qauto'); } catch (e) {}
      perf.n = 0; perf.sum = 0; perf.warm = 0;
      applyTier(detectTier());
    } else applyTier(v);
  }
  /* Auto mode: if frames stay slow for a couple of seconds, drop one tier and remember it. */
  var perf = { n: 0, sum: 0, warm: 0 };
  function watchFps(raw) {
    if (cfg.quality !== 'auto' || tier === 'low') return;
    if (raw > 250) { perf.n = 0; perf.sum = 0; return; } // tab was hidden or a dialog was open
    perf.warm += raw;
    if (perf.warm < 2500) return;
    perf.n++; perf.sum += raw;
    if (perf.n >= 100) {
      var avg = perf.sum / perf.n;
      perf.n = 0; perf.sum = 0;
      if (avg > 26) {
        var next = tier === 'high' ? 'mid' : 'low';
        try { localStorage.setItem('blockburst-qauto', next); } catch (e) {}
        applyTier(next);
        perf.warm = 1500;
      }
    }
  }

  /* ---- photo: fill or fit, for landscape and portrait photos on landscape and portrait screens ---- */
  function applyDim() { root('--dim', String(dimEl.value / 100)); }
  function dataUrlToBlobUrl(du) {
    try {
      var comma = du.indexOf(','), mime = du.slice(5, du.indexOf(';')), bin = atob(du.slice(comma + 1)), u8 = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
      return URL.createObjectURL(new Blob([u8], { type: mime }));
    } catch (e) { return du; }
  }
  /* A tiny blurred copy of the photo (halved step by step, then scaled up) for the sides of a "fit" photo. */
  function softCopy(img) {
    try {
      var src = img, cw = img.naturalWidth, ch = img.naturalHeight;
      while (Math.max(cw, ch) > 72) {
        var nw = Math.max(1, Math.round(cw / 2)), nh = Math.max(1, Math.round(ch / 2)), c2 = document.createElement('canvas');
        c2.width = nw; c2.height = nh;
        c2.getContext('2d').drawImage(src, 0, 0, nw, nh);
        src = c2; cw = nw; ch = nh;
      }
      var big = document.createElement('canvas'), bx;
      big.width = cw * 4; big.height = ch * 4;
      bx = big.getContext('2d');
      bx.imageSmoothingQuality = 'high';
      bx.drawImage(src, 0, 0, big.width, big.height);
      return big.toDataURL('image/jpeg', 0.7);
    } catch (e) { return ''; }
  }
  function applyPhotoFit() {
    if (!draftPhoto || !photoW) { photoEl.removeAttribute('data-fit'); photoEl.removeAttribute('data-axis'); return; }
    var vw = window.innerWidth, vh = window.innerHeight, va = vw / vh, pa = photoW / photoH;
    var visible = Math.min(va / pa, pa / va); // share of the photo a "fill" crop would keep
    var useFit = cfg.fit === 'fit' || (cfg.fit === 'auto' && visible < 0.5);
    var st = photoFgEl.style;
    if (useFit) {
      var k = Math.min(vw / photoW, vh / photoH), w = Math.round(photoW * k), h = Math.round(photoH * k);
      st.width = w + 'px'; st.height = h + 'px'; st.left = Math.round((vw - w) / 2) + 'px'; st.top = Math.round((vh - h) / 2) + 'px';
      photoEl.setAttribute('data-fit', 'fit');
      if (Math.abs(w - vw) < 2 && Math.abs(h - vh) < 2) photoEl.removeAttribute('data-axis');
      else photoEl.setAttribute('data-axis', w >= vw - 1 ? 'v' : 'h');
    } else {
      st.width = st.height = st.left = st.top = '';
      photoEl.setAttribute('data-fit', 'fill');
      photoEl.removeAttribute('data-axis');
      st.setProperty('--focus', pa < 1 ? '50% 30%' : '50% 50%'); // in a tall photo, faces sit in the upper part
    }
  }
  function measurePhoto(objUrl, token) {
    var img = new Image();
    img.onload = function () {
      if (draftPhoto !== token) return; // the photo changed while this one was loading
      photoW = img.naturalWidth; photoH = img.naturalHeight;
      var soft = softCopy(img);
      photoBgEl.style.backgroundImage = soft ? 'url("' + soft + '")' : '';
      applyPhotoFit();
    };
    img.src = objUrl;
  }
  function showPhoto(url) {
    draftPhoto = url || '';
    if (photoObj && photoObj.indexOf('blob:') === 0) URL.revokeObjectURL(photoObj);
    photoObj = url ? dataUrlToBlobUrl(url) : '';
    photoFgEl.style.backgroundImage = photoObj ? 'url("' + photoObj + '")' : '';
    photoBgEl.style.backgroundImage = '';
    photoW = photoH = 0;
    photoEl.removeAttribute('data-fit'); photoEl.removeAttribute('data-axis');
    photoFgEl.style.width = photoFgEl.style.height = photoFgEl.style.left = photoFgEl.style.top = '';
    document.body.classList.toggle('has-photo', !!url);
    $('changeLabel').textContent = url ? 'Change photo' : 'Add photo';
    removeBtn.hidden = !url;
    dimWrap.hidden = !url;
    fitWrap.hidden = !url;
    if (url) measurePhoto(photoObj, url);
  }
  function setSeg(seg, val) {
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-v') === val)); });
  }
  function syncUI() {
    sfxOnEl.checked = cfg.sfx;
    sfxVolEl.value = Math.round(cfg.sfxVol * 100);
    musicVolEl.value = Math.round(cfg.musicVol * 100);
    randomEl.checked = cfg.randomStart;
    setSeg(fitSeg, cfg.fit);
    setSeg(qSeg, cfg.quality);
  }
  function openSheet() {
    if (drag) endDrag(null, false);
    sheetOpen = true;
    sheetEl.hidden = false;
    backdropEl.hidden = false;
    renderMusic();
  }
  function closeSheet() { sheetOpen = false; sheetEl.hidden = true; backdropEl.hidden = true; }
  function discard() {
    cfg.sfx = saved.sfx; cfg.sfxVol = saved.sfxVol; cfg.musicVol = saved.musicVol;
    cfg.fit = saved.fit; cfg.randomStart = saved.randomStart;
    if (cfg.quality !== saved.quality) setQualityPref(saved.quality);
    dimEl.value = saved.dim;
    applyDim();
    showPhoto(saved.photo);
    syncUI();
    applySfx();
    setMusicVol();
    closeSheet();
  }
  function save() {
    saved.sfx = cfg.sfx; saved.sfxVol = cfg.sfxVol; saved.musicVol = cfg.musicVol;
    saved.track = (trackIdx >= 0 && tracks[trackIdx]) ? tracks[trackIdx].id : null;
    saved.playing = wantPlay;
    saved.dim = dimEl.value;
    saved.photo = draftPhoto;
    saved.quality = cfg.quality; saved.fit = cfg.fit; saved.randomStart = cfg.randomStart;
    var ok = true;
    try {
      localStorage.setItem('blockburst-settings', JSON.stringify({ sfx: saved.sfx, sfxVol: saved.sfxVol, musicVol: saved.musicVol, track: saved.track, playing: saved.playing, dim: saved.dim, quality: saved.quality, fit: saved.fit, randomStart: saved.randomStart }));
    } catch (e) { ok = false; }
    try {
      if (saved.photo) localStorage.setItem('blockburst-photo', saved.photo);
      else localStorage.removeItem('blockburst-photo');
    } catch (e) { ok = false; }
    note(ok ? 'Saved' : 'Saved for this session only. Storage is full or blocked.');
    closeSheet();
  }
  function loadPhoto(file) {
    if (!file) return;
    if (file.type && file.type.indexOf('image/') !== 0) { note('Choose an image file.'); return; }
    var objUrl = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      var cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * k));
      cv.height = Math.max(1, Math.round(img.naturalHeight * k));
      var px = cv.getContext('2d');
      px.fillStyle = '#17102f';
      px.fillRect(0, 0, cv.width, cv.height);
      px.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(objUrl);
      showPhoto(cv.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = function () { URL.revokeObjectURL(objUrl); note('That image could not be opened.'); };
    img.src = objUrl;
  }

  $('settingsBtn').addEventListener('click', openSheet);
  $('closeBtn').addEventListener('click', discard);
  backdropEl.addEventListener('click', discard);
  $('saveBtn').addEventListener('click', save);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheetOpen) discard(); });
  sfxOnEl.addEventListener('change', function () { cfg.sfx = sfxOnEl.checked; applySfx(); if (cfg.sfx) sfx('drop'); });
  sfxVolEl.addEventListener('input', function () { cfg.sfxVol = sfxVolEl.value / 100; applySfx(); });
  sfxVolEl.addEventListener('change', function () { sfx('drop'); });
  musicVolEl.addEventListener('input', function () { cfg.musicVol = musicVolEl.value / 100; setMusicVol(); });
  changeBtn.addEventListener('click', function () { fileEl.value = ''; fileEl.click(); });
  fileEl.addEventListener('change', function () { loadPhoto(fileEl.files && fileEl.files[0]); });
  removeBtn.addEventListener('click', function () { showPhoto(''); });
  dimEl.addEventListener('input', applyDim);
  $('biomeBtn').addEventListener('click', function () { unlockAudio(); setBiome(biomeIdx + 1, true); });
  $('again').addEventListener('click', start);
  shuffleBtn.addEventListener('click', shufflePieces);
  fitSeg.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    cfg.fit = b.getAttribute('data-v'); setSeg(fitSeg, cfg.fit); applyPhotoFit();
  });
  qSeg.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    setQualityPref(b.getAttribute('data-v')); setSeg(qSeg, cfg.quality);
  });
  randomEl.addEventListener('change', function () { cfg.randomStart = randomEl.checked; });
  document.addEventListener('pointerdown', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);

  /* Hooks for the Android app: music stops when the app goes to the background and picks up again on
     return, and the Back button closes the settings sheet before it closes the app. */
  var resumeMusic = false;
  function appHidden() { if (!musicEl.paused) { resumeMusic = true; musicEl.pause(); } }
  function appShown() { if (resumeMusic) { resumeMusic = false; if (wantPlay) tryPlay(); } }
  window.__bbPause = appHidden;
  window.__bbResume = appShown;
  window.__bbBack = function () { if (sheetOpen) { discard(); return true; } return false; };
  if (window.BlockBurstNative) document.addEventListener('visibilitychange', function () { if (document.hidden) appHidden(); else appShown(); });

  /* ------------------------------------------------------------------ loop */
  var last = performance.now();
  function frame(now) {
    var raw = now - last, dt = Math.min(0.05, raw / 1000);
    last = now;
    watchFps(raw);
    applyDrag();
    ambAcc += dt;
    if (!TQ.ambFps || ambAcc >= 1 / TQ.ambFps - 0.004) { updateAmbient(Math.min(ambAcc, 0.1)); ambAcc = 0; }
    updateBurst(dt);
    tweenScore();
    var want = drag ? 1 : 0;
    if (gridAlpha !== want) {
      gridAlpha += (want - gridAlpha) * Math.min(1, dt * 14);
      if (Math.abs(want - gridAlpha) < 0.01) gridAlpha = want;
      boardDirty = true;
    }
    if (boardDirty || fx.length) drawBoard(now);
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', function () { sizeFx(); layout(); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { sizeFx(); layout(); }, 200); });

  /* init */
  try {
    var raw = localStorage.getItem('blockburst-settings');
    if (raw) {
      var o = JSON.parse(raw);
      saved.sfx = o.sfx !== false;
      if (isFinite(o.sfxVol)) saved.sfxVol = clamp(+o.sfxVol, 0, 1);
      if (isFinite(o.musicVol)) saved.musicVol = clamp(+o.musicVol, 0, 1);
      saved.track = (o.track === undefined) ? null : o.track;
      saved.playing = !!o.playing;
      if (o.dim !== undefined && o.dim !== '') saved.dim = String(o.dim);
      if (o.quality === 'auto' || TIERS[o.quality]) saved.quality = o.quality;
      if (o.fit === 'auto' || o.fit === 'fill' || o.fit === 'fit') saved.fit = o.fit;
      saved.randomStart = !!o.randomStart;
    } else {
      var legacyDim = localStorage.getItem('blockburst-dim');
      if (legacyDim !== null && legacyDim !== '') saved.dim = legacyDim;
    }
  } catch (e) {}
  cfg.sfx = saved.sfx; cfg.sfxVol = saved.sfxVol; cfg.musicVol = saved.musicVol;
  cfg.quality = saved.quality; cfg.fit = saved.fit; cfg.randomStart = saved.randomStart;
  applyTier(cfg.quality === 'auto' ? detectTier() : cfg.quality);
  wantPlay = saved.playing;
  dimEl.value = saved.dim;
  applyDim();
  syncUI();
  setMusicVol();
  sizeFx();
  buildBiomes();
  for (var pi = 0; pi < AMB_COUNT; pi++) parts.push(spawn(BIOMES[0].kind, true));
  setBiome(0, false);
  start();
  try {
    var sp = localStorage.getItem('blockburst-photo');
    if (sp && sp.indexOf('data:image/') === 0) { saved.photo = sp; showPhoto(sp); }
  } catch (e) {}
  renderMusic();
  dbOp('readonly', function (st) { return st.getAll(); }).then(function (list) {
    tracks = (list || []).map(function (r) { return { id: r.id, name: r.name, blob: r.blob }; });
    if (saved.track !== null) {
      for (var ti = 0; ti < tracks.length; ti++) if (tracks[ti].id === saved.track) trackIdx = ti;
    }
    if (trackIdx < 0 && tracks.length && saved.playing) trackIdx = 0;
    renderMusic();
    if (wantPlay && gestureSeen && tracks.length) playMusic();
  }).then(null, function () { renderMusic(); });
  layout();
  ready = true;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  last = performance.now();
  requestAnimationFrame(frame);
})();
