/* ============================================================
   RESONANCE FIELD
   A one-thumb physics instrument. GDD v1.0 — MVP build.

   Structure
     1. Utilities
     2. Configuration
     3. Canvas + sprites
     4. State
     5. DOM / screens
     6. Input
     7. Entities & spawning
     8. Simulation (field, physics, resonance, coherence)
     9. Rendering
    10. Loop & test hooks
   ============================================================ */

(function () {
  'use strict';

  /* ─────────────────────────── 1. Utilities ─────────────────────────── */

  var TAU = Math.PI * 2;
  var clamp = function (v, a, b) {
    return v < a ? a : v > b ? b : v;
  };
  var lerp = function (a, b, t) {
    return a + (b - a) * t;
  };
  var rand = function (a, b) {
    return a + Math.random() * (b - a);
  };
  var randInt = function (a, b) {
    return Math.floor(rand(a, b + 1));
  };
  var easeOutCubic = function (t) {
    return 1 - Math.pow(1 - t, 3);
  };
  var hypot = Math.hypot;

  /* Optional vibration. Silent on devices that do not support it, and never
     required for feedback — the visuals and audio carry the game on their own. */
  function haptic(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {}
  }

  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ─────────────────────────── 2. Configuration ─────────────────────────── */

  var FREQS = [
    { name: 'I', label: 'A', color: '#5ff0d8', soft: '#9dfff0' },
    { name: 'II', label: 'B', color: '#a08cff', soft: '#d3c8ff' },
    { name: 'III', label: 'D', color: '#ffc06b', soft: '#ffe0ad' },
    { name: 'IV', label: 'E', color: '#ff8fb4', soft: '#ffc9da' },
  ];

  var THEMES = [
    { id: 'aurora', neb: ['#0fbfa6', '#5b3dff'], star: '#d6f7f0' },
    { id: 'ember', neb: ['#ff7a45', '#ff2f6d'], star: '#ffe4d2' },
    { id: 'abyss', neb: ['#3f7dff', '#7b3dff'], star: '#d5e0ff' },
  ];

  var MAX_ENTITIES = 44;
  var MAX_PARTICLES = 340;

  /* ─────────────────────────── 3. Canvas + sprites ─────────────────────────── */

  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d', { alpha: false });
  var W = 0;
  var H = 0;
  var DPR = 1;
  var bgGrad = null;
  var nebulaCanvas = null;
  var glowCache = {};
  var stars = [];
  var reducedMotion = false;

  try {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}

  function makeGlow(color) {
    var size = 128;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, hexA(color, 0.95));
    grad.addColorStop(0.12, hexA(color, 0.6));
    grad.addColorStop(0.34, hexA(color, 0.22));
    grad.addColorStop(0.62, hexA(color, 0.06));
    grad.addColorStop(1, hexA(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function glow(color) {
    if (!glowCache[color]) glowCache[color] = makeGlow(color);
    return glowCache[color];
  }

  function makeStars() {
    stars = [];
    var count = W < 700 ? 70 : 120;
    for (var i = 0; i < count; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        r: rand(0.4, 1.5),
        ph: rand(0, TAU),
        sp: rand(0.3, 1.4),
        a: rand(0.15, 0.7),
      });
    }
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#08080f');
    bgGrad.addColorStop(0.45, '#0a0917');
    bgGrad.addColorStop(1, '#05050b');

    makeStars();
    buildNebula();

    field.baseR = clamp(Math.min(W, H) * 0.085, 32, 58);
    field.maxR = clamp(Math.min(W, H) * 0.325, 108, 215);
    if (!field.placed) {
      field.x = field.targetX = W / 2;
      field.y = field.targetY = H / 2;
      field.placed = true;
    }
  }

  /* ─────────────────────────── 4. State ─────────────────────────── */

  var phase = 'menu'; // menu | playing | paused | over
  var runMode = 'endless'; // endless | zen
  var themeIndex = 0;
  var audioOn = true;

  var field = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    placed: false,
    baseR: 40,
    maxR: 140,
    r: 40,
    hold: 0,
    down: false,
    mode: 'attract',
    freq: 0,
  };

  var entities = [];
  var particles = [];
  var ripples = [];
  var texts = [];

  var state = {
    time: 0,
    score: 0,
    shownScore: 0,
    coherence: 100,
    chain: 0,
    chainTimer: 0,
    bestChain: 0,
    resonances: 0,
    best: 0,
    bestZen: 0,
    seed: 1,
    spawnTimer: 1.2,
    shake: 0,
    flashAlpha: 0,
    overTimer: 0,
    cause: '',
    hintTimer: 0,
    freqPulse: 0,
  };

  /* Tiny persistence adapter.
     Sandboxed previews block storage APIs, so this writes a single small
     cookie and silently falls back to memory when cookies are unavailable. */
  var Save = {
    key: 'rf_v1',
    read: function () {
      try {
        var m = document.cookie.match(/(?:^|;\s*)rf_v1=([^;]*)/);
        if (!m) return null;
        var v = JSON.parse(decodeURIComponent(m[1]));
        return v && typeof v === 'object' ? v : null;
      } catch (e) {
        return null;
      }
    },
    write: function (data) {
      try {
        document.cookie =
          'rf_v1=' + encodeURIComponent(JSON.stringify(data)) + '; max-age=31536000; path=/; SameSite=Lax';
      } catch (e) {}
    },
  };

  function persist() {
    Save.write({ e: state.best, z: state.bestZen, t: themeIndex });
  }

  for (var pi = 0; pi < MAX_PARTICLES; pi++) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, color: '#fff', drag: 0.9 });
  }

  /* ─────────────────────────── 5. DOM / screens ─────────────────────────── */

  var el = {
    hud: document.getElementById('hud'),
    score: document.getElementById('score'),
    coherenceWrap: document.getElementById('coherenceWrap'),
    coherenceFill: document.getElementById('coherenceFill'),
    bestInline: document.getElementById('bestInline'),
    chainBadge: document.getElementById('chainBadge'),
    chainValue: document.getElementById('chainValue'),
    modeBtn: document.getElementById('modeBtn'),
    modeLabel: document.getElementById('modeLabel'),
    freqChip: document.getElementById('freqChip'),
    freqDot: document.getElementById('freqDot'),
    freqName: document.getElementById('freqName'),
    hint: document.getElementById('hint'),
    start: document.getElementById('startScreen'),
    pause: document.getElementById('pauseScreen'),
    over: document.getElementById('overScreen'),
    beginBtn: document.getElementById('beginBtn'),
    soundBtn: document.getElementById('soundBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    resumeBtn: document.getElementById('resumeBtn'),
    restartBtn: document.getElementById('restartBtn'),
    quitBtn: document.getElementById('quitBtn'),
    againBtn: document.getElementById('againBtn'),
    menuBtn: document.getElementById('menuBtn'),
    finalScore: document.getElementById('finalScore'),
    finalBest: document.getElementById('finalBest'),
    statChain: document.getElementById('statChain'),
    statReso: document.getElementById('statReso'),
    statTime: document.getElementById('statTime'),
    overTip: document.getElementById('overTip'),
    overEyebrow: document.getElementById('overEyebrow'),
    overTitle: document.getElementById('overTitle'),
    statusLine: document.getElementById('statusLine'),
    flash: document.getElementById('flash'),
  };

  (function loadSave() {
    var saved = Save.read();
    if (!saved) return;
    if (typeof saved.e === 'number') state.best = saved.e;
    if (typeof saved.z === 'number') state.bestZen = saved.z;
    if (typeof saved.t === 'number' && saved.t >= 0 && saved.t < THEMES.length) themeIndex = saved.t;
  })();

  function show(node) {
    node.classList.remove('is-hidden');
  }
  function hide(node) {
    node.classList.add('is-hidden');
  }

  function applyMode(mode, silent) {
    field.mode = mode;
    el.modeBtn.setAttribute('data-mode', mode);
    var labels = { attract: 'ATTRACT', repel: 'REPEL', neutral: 'NEUTRAL' };
    el.modeLabel.textContent = labels[mode];
    el.modeBtn.setAttribute('aria-label', 'Field mode: ' + mode + '. Tap to change.');
    if (!silent) RF.Audio.modeShift(mode !== 'repel');
  }

  function cycleMode() {
    var order = ['attract', 'repel', 'neutral'];
    var next = order[(order.indexOf(field.mode) + 1) % 3];
    applyMode(next);
    emitRipple(field.x, field.y, field.r * 1.05, FREQS[field.freq].color, 0.6);
  }

  function syncStatus() {
    el.statusLine.textContent =
      (audioOn ? 'Sound on' : 'Sound off') + ' · best ' + Math.max(state.best, state.bestZen).toLocaleString('en-GB');
  }

  function setAudio(on) {
    audioOn = on;
    RF.Audio.setEnabled(on);
    document.body.classList.toggle('is-muted', !on);
    try {
      el.soundBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Enable sound');
    } catch (e) {}
    syncStatus();
  }

  /* ─────────────────────────── 6. Input ─────────────────────────── */

  var pointer = { down: false, id: null };
  var lastTap = 0;
  var lastTapX = 0;
  var lastTapY = 0;
  var modeLock = 0;

  function fieldTarget(x, y) {
    field.targetX = clamp(x, 0, W);
    field.targetY = clamp(y, 0, H);
  }

  canvas.addEventListener('pointerdown', function (e) {
    RF.Audio.init();
    if (phase === 'menu' || phase === 'paused' || phase === 'over') return;
    e.preventDefault();
    pointer.down = true;
    pointer.id = e.pointerId;
    field.down = true;
    fieldTarget(e.clientX, e.clientY);

    // Double tap = shift polarity
    var t = performance.now();
    if (t - lastTap < 330 && modeLock < t && hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 46) {
      cycleMode();
      lastTap = 0;
      modeLock = t + 350;
    } else {
      lastTap = t;
      lastTapX = e.clientX;
      lastTapY = e.clientY;
    }

    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
  });

  window.addEventListener(
    'pointermove',
    function (e) {
      if (phase !== 'playing') return;
      if (pointer.down && e.pointerId === pointer.id) {
        fieldTarget(e.clientX, e.clientY);
      } else if (e.pointerType === 'mouse' && !pointer.down) {
        fieldTarget(e.clientX, e.clientY);
      }
    },
    { passive: true }
  );

  function releasePointer(e) {
    if (!pointer.down) return;
    if (e && e.pointerId != null && pointer.id != null && e.pointerId !== pointer.id) return;
    pointer.down = false;
    pointer.id = null;
    field.down = false;
    emitRipple(field.x, field.y, field.r, FREQS[field.freq].color, 0.35);
  }

  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  window.addEventListener('blur', function () {
    pointer.down = false;
    field.down = false;
  });

  el.modeBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (phase !== 'playing') return;
    cycleMode();
    modeLock = performance.now() + 350;
    RF.Audio.ui();
  });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'm' || e.key === 'M') {
      if (phase === 'playing') cycleMode();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (phase === 'playing') doPause();
      else if (phase === 'paused') doResume();
    } else if (e.key === 'Enter') {
      if (phase === 'menu') startRun(runMode);
      else if (phase === 'over') startRun(runMode);
    }
  });

  /* ─────────────────────────── 7. Entities ─────────────────────────── */

  function makeEntity(kind, freq, x, y, vx, vy) {
    var e = {
      id: (state.seed = state.seed + 1),
      kind: kind,
      freq: freq,
      x: x,
      y: y,
      vx: vx,
      vy: vy,
      r: 10,
      mass: 1,
      rot: rand(0, TAU),
      spin: rand(-1.4, 1.4),
      charge: 0,
      cooldown: 0,
      seed: rand(0, 100),
      dead: false,
      age: 0,
      links: [],
      hitCd: 0,
    };

    if (kind === 'harmonic') {
      e.r = rand(8, 11.5);
      e.mass = 1;
      e.spin = rand(-0.9, 0.9);
    } else if (kind === 'dissonant') {
      e.r = rand(10.5, 13);
      e.mass = 1.85;
      e.spin = rand(-1.6, 1.6);
    } else if (kind === 'hazard') {
      e.r = rand(13, 15);
      e.mass = 2.4; // heavy: it can be shoved, but not thrown
      e.spin = rand(-0.55, 0.55);
      e.vx *= 0.5;
      e.vy *= 0.5;
    } else if (kind === 'echo') {
      e.r = 12.5;
      e.mass = 0.7;
      e.spin = rand(-0.6, 0.6);
    }
    return e;
  }

  function spawnAtEdge(kind, freq) {
    var side = randInt(0, 3);
    var m = 56;
    var x, y;
    if (side === 0) {
      x = rand(0, W);
      y = -m;
    } else if (side === 1) {
      x = W + m;
      y = rand(0, H);
    } else if (side === 2) {
      x = rand(0, W);
      y = H + m;
    } else {
      x = -m;
      y = rand(0, H);
    }
    var tx = rand(W * 0.15, W * 0.85);
    var ty = rand(H * 0.15, H * 0.85);
    var a = Math.atan2(ty - y, tx - x) + rand(-0.4, 0.4);
    var sp = rand(24, 54);
    return makeEntity(kind, freq, x, y, Math.cos(a) * sp, Math.sin(a) * sp);
  }

  function pickKind(diff) {
    var harmonic = 0.68 - 0.12 * diff;
    var dissonant = 0.2 + 0.06 * diff;
    var hazard = 0.08 + 0.05 * diff;
    var echo = 0.04 + 0.01 * diff;
    var roll = Math.random() * (harmonic + dissonant + hazard + echo);

    var echoes = 0;
    for (var i = 0; i < entities.length; i++) if (entities[i].kind === 'echo') echoes++;

    if (roll < harmonic) return 'harmonic';
    if (roll < harmonic + dissonant) return 'dissonant';
    if (roll < harmonic + dissonant + hazard) return 'hazard';
    return echoes < 2 ? 'echo' : 'harmonic';
  }

  function spawnWave() {
    if (entities.length >= MAX_ENTITIES) return;
    if (phase === 'menu') {
      entities.push(spawnAtEdge('harmonic', randInt(0, 3)));
      return;
    }
    var diff = clamp(state.time / 150, 0, 1);
    var kind = pickKind(diff);
    var freq = randInt(0, 3);
    var e = spawnAtEdge(kind, freq);

    // Zen is a garden: mostly harmonics, few hazards.
    if (runMode === 'zen') {
      if (kind === 'hazard' && Math.random() < 0.75) kind = 'harmonic';
      if (kind === 'dissonant' && Math.random() < 0.5) kind = 'harmonic';
      e = spawnAtEdge(kind, freq);
    }
    entities.push(e);
  }

  function seedRun() {
    entities.length = 0;
    var freqs = [0, 1, 2, 3];
    for (var i = 0; i < 9; i++) {
      var f = freqs[i % 4];
      var e = makeEntity(
        'harmonic',
        f,
        rand(W * 0.16, W * 0.84),
        rand(H * 0.16, H * 0.8),
        rand(-30, 30),
        rand(-30, 30)
      );
      entities.push(e);
    }
    for (var j = 0; j < 2; j++) {
      var d = spawnAtEdge('dissonant', randInt(0, 3));
      entities.push(d);
    }
  }

  /* ─────────────────────────── 8. Simulation ─────────────────────────── */

  function updateField(dt) {
    if (phase === 'playing') {
      if (field.down) field.hold = Math.min(1, field.hold + dt / 0.55);
      else field.hold = Math.max(0, field.hold - dt / 0.28);
    } else if (phase === 'menu') {
      field.hold = 0.42 + 0.18 * Math.sin(state.time * 0.8);
      field.targetX = W / 2;
      field.targetY = H * 0.5;
    }

    var k = 1 - Math.exp(-14 * dt);
    field.x = lerp(field.x, field.targetX, k);
    field.y = lerp(field.y, field.targetY, k);

    var eased = easeOutCubic(clamp(field.hold, 0, 1));
    field.r = lerp(field.baseR, field.maxR, eased);
  }

  function applyForces(e, dt) {
  var dx = field.x - e.x;
  var dy = field.y - e.y;
  var d = hypot(dx, dy) || 0.001;
  var infl = field.r * 1.26;

  if (field.mode !== 'neutral' && d < infl) {
    var t = 1 - d / infl;
    var power = 980 * t * t * (0.45 + 0.55 * field.hold);
    var toward = 0;

    if (e.kind === 'dissonant') {
      // Always pushed away. Stronger in Repel.
      toward = field.mode === 'repel' ? -1.45 : -0.65;
    } else if (e.kind === 'hazard') {
      // Only pushed in Repel.
      if (field.mode === 'repel') toward = -1.1;
    } else {
      // Harmonics & Echoes
      toward = field.mode === 'attract' ? 1.0 : -1.25; // stronger repel
    }

    var ax = (dx / d) * power * toward;
    var ay = (dy / d) * power * toward;

    // Gentle orbital swirl only in Attract mode
    if ((e.kind === 'harmonic' || e.kind === 'echo') && field.mode === 'attract') {
      ax += (-dy / d) * power * 0.22;
      ay += (dx / d) * power * 0.22;
    }

    var m = Math.max(0.25, e.mass || 1);
    e.vx += (ax / m) * dt;
    e.vy += (ay / m) * dt;
  }

  // Hazard gravity wells (still attract nearby harmonics)
  if (e.kind === 'harmonic' || e.kind === 'echo') {
    for (var i = 0; i < entities.length; i++) {
      var h = entities[i];
      if (h.kind !== 'hazard' || h.dead) continue;
      var hx = h.x - e.x;
      var hy = h.y - e.y;
      var hd2 = hx * hx + hy * hy;
      if (hd2 < 150 * 150 && hd2 > 1) {
        var hd = Math.sqrt(hd2);
        var hp = 42 * (1 - hd / 150);
        e.vx += (hx / hd) * hp * dt;
        e.vy += (hy / hd) * hp * dt;
      }
    }
  }

  // Special hazard pull — ONLY when NOT in Repel mode
  if (e.kind === 'hazard' && field.mode !== 'repel') {
    var pull = clamp((field.r - field.baseR) / (field.maxR - field.baseR), 0, 1);
    pull *= pull;
    var fdx = field.x - e.x;
    var fdy = field.y - e.y;
    var fd = hypot(fdx, fdy) || 1;
    e.vx += (fdx / fd) * 34 * pull * dt;
    e.vy += (fdy / fd) * 34 * pull * dt;
  }

  // Turbulence
  e.vx += Math.sin(state.time * 0.6 + e.seed) * 5 * dt;
  e.vy += Math.cos(state.time * 0.5 + e.seed * 1.7) * 5 * dt;

  var drag = Math.pow(0.55, dt);
  e.vx *= drag;
  e.vy *= drag;

  var speed = hypot(e.vx, e.vy);
  var maxSpeed = e.kind === 'hazard' ? 120 : 430;
  if (speed > maxSpeed) {
    e.vx = (e.vx / speed) * maxSpeed;
    e.vy = (e.vy / speed) * maxSpeed;
  }

  e.x += e.vx * dt;
  e.y += e.vy * dt;
  e.rot += e.spin * dt;
  e.age += dt;
  if (e.cooldown > 0) e.cooldown -= dt;
  if (e.hitCd > 0) e.hitCd -= dt;

  // Keep the population on stage
  var pad = 120;
  if (e.x < -pad || e.x > W + pad || e.y < -pad || e.y > H + pad) {
    if (e.kind === 'harmonic' || e.kind === 'echo') {
      e.x = clamp(e.x, -30, W + 30);
      e.y = clamp(e.y, -30, H + 30);
      var toX = field.x + rand(-120, 120);
      var toY = field.y + rand(-120, 120);
      var a = Math.atan2(toY - e.y, toX - e.x);
      e.vx = Math.cos(a) * rand(30, 60);
      e.vy = Math.sin(a) * rand(30, 60);
    } else {
      e.dead = true;
    }
  }
}

  function updateEntities(dt) {
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (!e.dead) applyForces(e, dt);
    }
    for (var j = 0; j < entities.length; j++) {
      if (entities[j].dead) {
        entities.splice(j, 1);
        j--;
      }
    }
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && (phase === 'playing' || phase === 'menu')) {
      var diff = clamp(state.time / 150, 0, 1);
      state.spawnTimer = lerp(1.5, 0.62, diff) * rand(0.75, 1.25);
      if (phase === 'menu') {
        if (entities.length < 14) spawnWave();
      } else {
        spawnWave();
      }
    }
  }

  /* Resonance: same-frequency harmonics held together inside the field. */
  function updateResonance(dt) {
    var i, j;

    for (i = 0; i < entities.length; i++) {
      var e = entities[i];
      e.links.length = 0;
      e.inField = false;
      e.dissonantNear = false;
    }

    var inFieldCount = 0;
    for (i = 0; i < entities.length; i++) {
      var h = entities[i];
      if (h.kind !== 'harmonic') continue;
      h.inField = hypot(h.x - field.x, h.y - field.y) < field.r * 0.94;
      if (h.inField) inFieldCount++;
    }

    if (phase === 'playing') {
      for (i = 0; i < entities.length; i++) {
        var a = entities[i];
        if (a.kind !== 'harmonic' || !a.inField) continue;
        for (j = i + 1; j < entities.length; j++) {
          var b = entities[j];
          if (b.kind !== 'harmonic' || !b.inField || b.freq !== a.freq) continue;
          if (a.cooldown > 0 || b.cooldown > 0) continue;

          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var reach = 66 + a.r + b.r;
          if (dx * dx + dy * dy > reach * reach) continue;

          a.links.push(b);
          b.links.push(a);
        }
      }

      for (i = 0; i < entities.length; i++) {
        var n = entities[i];
        if (n.kind !== 'harmonic' || n.links.length === 0) continue;

        var rate = n.links.length * 0.52;
        if (field.mode === 'neutral') rate *= 1.45;

        // Dissonance nearby muddies the resonance
        for (j = 0; j < entities.length; j++) {
          var d = entities[j];
          if (d.kind !== 'dissonant') continue;
          var ddx = d.x - n.x;
          var ddy = d.y - n.y;
          if (ddx * ddx + ddy * ddy < 90 * 90) {
            rate *= 0.55;
            break;
          }
        }

        n.charge += rate * dt;
        if (n.charge >= 1) fireResonance(n);
      }
    } else if (phase === 'menu') {
      // Slow, quiet shimmer on the title screen
      if (inFieldCount > 5 && Math.random() < dt * 0.5) {
        for (i = 0; i < entities.length; i++) {
          var m = entities[i];
          if (m.kind === 'harmonic' && m.inField) {
            m.charge = 0;
            emitParticles(m.x, m.y, 3, FREQS[m.freq].color, 30, 0.5, 1.6);
          }
        }
      }
    }

    // Cooldown decay + charge relaxation outside the field
    for (i = 0; i < entities.length; i++) {
      var q = entities[i];
      if (q.kind !== 'harmonic') continue;
      if (q.links.length === 0 && q.charge > 0) q.charge = Math.max(0, q.charge - dt * 0.9);
    }
  }

  function fireResonance(source) {
    var group = [source];
    var queue = [source];
    source.marked = true;

    while (queue.length) {
      var cur = queue.shift();
      for (var i = 0; i < cur.links.length; i++) {
        var nb = cur.links[i];
        if (!nb.marked) {
          nb.marked = true;
          group.push(nb);
          queue.push(nb);
        }
      }
    }

    for (var g = 0; g < group.length; g++) {
      var e = group[g];
      e.marked = false;
      e.charge = 0;
      e.cooldown = 1.7;
      // burst them apart so the player must gather again
      var ax = e.x - field.x;
      var ay = e.y - field.y;
      var d = hypot(ax, ay) || 1;
      var kick = 90 + group.length * 12;
      e.vx += (ax / d) * kick;
      e.vy += (ay / d) * kick;
    }

    state.chain += 1;
    state.chainTimer = 3.4;
    state.bestChain = Math.max(state.bestChain, state.chain);
    state.resonances += 1;

    var mult = Math.min(5, 1 + 0.3 * (state.chain - 1));
    var pts = Math.round(26 * group.length * mult);
    addScore(pts, field.x, field.y - field.r * 0.2, 'RESONANCE');
    state.coherence = Math.min(100, state.coherence + 3 + group.length * 0.8);

    field.freq = source.freq;
    state.freqPulse = 1;
    RF.Audio.resonance(source.freq, group.length, state.chain);

    var col = FREQS[source.freq].color;
    state.shake = Math.max(state.shake, group.length >= 3 ? 7 : 3.4);
    haptic(group.length >= 4 ? 18 : 10);
    emitRipple(field.x, field.y, field.r * 0.55, col, 0.9);
    for (var k = 0; k < group.length; k++) {
      emitParticles(group[k].x, group[k].y, 16 + group.length * 4, col, 150, 0.9, 3.4);
      emitRipple(group[k].x, group[k].y, 12, col, 0.5);
    }

    el.freqDot.style.background = col;
    el.freqDot.style.color = col;
    el.freqName.textContent = 'TUNED · ' + FREQS[source.freq].name;
  }

  function updateCoherence(dt) {
    if (runMode === 'zen' || phase !== 'playing') return;

    var drain = 1.05 + Math.min(1.25, state.time / 115);
    var dissonants = 0;
    var hazards = 0;

    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      var d = hypot(e.x - field.x, e.y - field.y);

      if (e.kind === 'dissonant' && d < field.r * 0.62) {
        dissonants++;
        drain += 10;
        emitParticles(e.x, e.y, 2, '#ff5a7a', 40, 0.6, 1.6);
      }

      if (e.kind === 'hazard') {
        if (d < field.r * 0.65) {
          hazards++;
          drain += 34;
          if (e.hitCd <= 0) {
            e.hitCd = 0.9;
            state.shake = Math.max(state.shake, 9);
            flash(0.5);
            RF.Audio.damage();
            haptic(22);
          }
        }
        // A hazard brushing the very center is a heavy hit, not instant death.
        if (d < e.r + 30 && e.hitCd <= 0) {
          e.hitCd = 1.2;
          state.coherence -= 10;
          e.vx = ((e.x - field.x) / (d || 1)) * 220;
          e.vy = ((e.y - field.y) / (d || 1)) * 220;
          state.shake = Math.max(state.shake, 13);
          flash(0.7);
          RF.Audio.damage();
          haptic(34);
          addScore(0, e.x, e.y, 'GRAZE', '#ff8a9d');
        }
      }
    }

    if (dissonants > 0) {
      state.shake = Math.max(state.shake, 2 + dissonants * 1.2);
      if (Math.random() < dt * 6) RF.Audio.damage();
    }

    if (entities.length > 38) drain += (entities.length - 38) * 0.35;

    state.coherence -= drain * dt;
    if (state.coherence <= 0) {
      state.coherence = 0;
      endRun('coherence');
    }
  }

  /* Echoes are swept up by the field itself — a burst of score and relief. */
  function updateCollectibles() {
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (e.kind !== 'echo' || e.dead) continue;
      var d = hypot(e.x - field.x, e.y - field.y);
      if (d < field.r * 0.92) {
        collectEcho(e);
      }
    }
  }

  function collectEcho(e) {
    e.dead = true;
    var mult = Math.min(5, 1 + 0.3 * Math.max(0, state.chain - 1));
    var pts = Math.round(180 * mult);
    addScore(pts, e.x, e.y - 14, 'ECHO', '#ffe9b0');
    state.coherence = Math.min(100, state.coherence + 16);
    state.shake = Math.max(state.shake, 4);
    state.freqPulse = 1;
    emitParticles(e.x, e.y, 30, '#ffe9b0', 200, 1.1, 3.2);
    emitRipple(e.x, e.y, 20, '#ffe9b0', 0.8);
    RF.Audio.collect();
  }

  function updateParticles(dt) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      var d = Math.pow(0.14, dt);
      p.vx *= d;
      p.vy *= d;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
    for (var r = ripples.length - 1; r >= 0; r--) {
      var rp = ripples[r];
      rp.life -= dt;
      rp.r += (rp.maxR - rp.r) * Math.min(1, dt * 3.2);
      if (rp.life <= 0) ripples.splice(r, 1);
    }
    for (var t = texts.length - 1; t >= 0; t--) {
      var tx = texts[t];
      tx.life -= dt;
      tx.y -= 22 * dt;
      if (tx.life <= 0) texts.splice(t, 1);
    }
    if (state.chainTimer > 0) {
      state.chainTimer -= dt;
      if (state.chainTimer <= 0) state.chain = 0;
    }
    state.shake *= Math.pow(0.02, dt);
    state.flashAlpha *= Math.pow(0.02, dt);
    state.freqPulse *= Math.pow(0.05, dt);
  }

  function update(dt) {
    state.time += dt;
    updateField(dt);
    updateEntities(dt);
    updateResonance(dt);
    updateCollectibles();
    updateCoherence(dt);
    updateParticles(dt);

    if (state.hintTimer > 0) {
      state.hintTimer -= dt;
      if (state.hintTimer <= 0) el.hint.classList.remove('is-on');
    }

    if (phase === 'over') {
      state.overTimer += dt;
      field.hold = Math.max(0, field.hold - dt * 1.6);
    }

    RF.Audio.update(dt, clamp(state.score / 5000, 0, 1));
  }

  function addScore(pts, x, y, label, color) {
    state.score += pts;
    if (pts > 0) {
      texts.push({
        x: x,
        y: y,
        life: 1.1,
        max: 1.1,
        text: (label ? label + ' ' : '') + '+' + pts,
        color: color || '#ffffff',
      });
    }
  }

  /* ─────────────────────────── 9. Rendering ─────────────────────────── */

  /* Nebula is pre-rendered at half resolution: one cheap layer per frame. */
  function buildNebula() {
    var scale = 0.5;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * scale));
    c.height = Math.max(1, Math.round(H * scale));
    var g = c.getContext('2d');
    var theme = THEMES[themeIndex];
    g.globalCompositeOperation = 'lighter';
    var blobs = [
      { x: 0.28, y: 0.24, r: 0.62, c: theme.neb[0], a: 0.17 },
      { x: 0.74, y: 0.68, r: 0.68, c: theme.neb[1], a: 0.14 },
      { x: 0.5, y: 0.98, r: 0.46, c: theme.neb[0], a: 0.09 },
    ];
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var bx = b.x * c.width;
      var by = b.y * c.height;
      var br = b.r * Math.max(c.width, c.height);
      var grad = g.createRadialGradient(bx, by, 0, bx, by, br);
      grad.addColorStop(0, hexA(b.c, b.a));
      grad.addColorStop(0.45, hexA(b.c, b.a * 0.32));
      grad.addColorStop(1, hexA(b.c, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);
    }
    nebulaCanvas = c;
  }

  function drawBackground(t) {
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    var theme = THEMES[themeIndex];
    var px = (field.targetX / W - 0.5) * 26;
    var py = (field.targetY / H - 0.5) * 26;

    if (nebulaCanvas) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.82 + 0.18 * Math.sin(t * 0.18);
      var driftX = Math.sin(t * 0.04) * 14 - px;
      var driftY = Math.cos(t * 0.033) * 10 - py;
      ctx.drawImage(nebulaCanvas, driftX - 20, driftY - 20, W + 56, H + 56);
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'lighter';
    // Star dust
    for (var s = 0; s < stars.length; s++) {
      var st = stars[s];
      var tw = 0.55 + 0.45 * Math.sin(t * st.sp + st.ph);
      ctx.globalAlpha = st.a * tw * 0.75;
      ctx.fillStyle = theme.star;
      ctx.beginPath();
      ctx.arc(st.x * W - px * 0.4, st.y * H - py * 0.4, st.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawField(t) {
    var f = field;
    var r = Math.max(1, f.r);
    var col = FREQS[f.freq].color;
    var pulse = 0.75 + 0.25 * Math.sin(t * 1.7);

    ctx.globalCompositeOperation = 'lighter';

    // Aura
    var g = ctx.createRadialGradient(f.x, f.y, r * 0.05, f.x, f.y, r * 1.22);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.1 + f.hold * 0.08) + ')');
    g.addColorStop(0.3, hexA(col, 0.09 + f.hold * 0.1));
    g.addColorStop(0.72, hexA(col, 0.05 + f.hold * 0.05));
    g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r * 1.22, 0, TAU);
    ctx.fill();

    // Rim
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = hexA(col, 0.42 + f.hold * 0.35);
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, TAU);
    ctx.stroke();

    // Second rotating ring
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(t * 0.35);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = hexA(col, 0.16 + f.hold * 0.12);
    ctx.setLineDash([3, 12]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.84, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Mode glyphs around the rim
    var glyphs = 6;
    ctx.strokeStyle = hexA(col, 0.5);
    ctx.lineWidth = 1.1;
    for (var i = 0; i < glyphs; i++) {
      var a = (i / glyphs) * TAU + t * 0.18;
      var gx = f.x + Math.cos(a) * r * 0.92;
      var gy = f.y + Math.sin(a) * r * 0.92;

      if (f.mode === 'neutral') {
        ctx.fillStyle = hexA(col, 0.5);
        ctx.beginPath();
        ctx.arc(gx, gy, 1.2, 0, TAU);
        ctx.fill();
      } else {
        var dir = f.mode === 'attract' ? -1 : 1;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(a + (dir > 0 ? 0 : Math.PI));
        ctx.beginPath();
        ctx.moveTo(-3, -3);
        ctx.lineTo(1.5, 0);
        ctx.lineTo(-3, 3);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Core
    var cg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 26 + f.hold * 26);
    cg.addColorStop(0, 'rgba(255,255,255,' + (0.36 + f.hold * 0.3) + ')');
    cg.addColorStop(0.35, hexA(col, 0.18 * pulse));
    cg.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 26 + f.hold * 26, 0, TAU);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
  }

  function drawLinks() {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < entities.length; i++) {
      var a = entities[i];
      if (a.kind !== 'harmonic' || a.links.length === 0) continue;
      for (var j = 0; j < a.links.length; j++) {
        var b = a.links[j];
        if (b.id < a.id) continue;
        var alpha = 0.14 + Math.min(a.charge, b.charge) * 0.5;
        ctx.strokeStyle = hexA(FREQS[a.freq].color, alpha);
        ctx.lineWidth = 0.9 + Math.min(a.charge, b.charge) * 1.6;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawEntities(t) {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      var col = e.kind === 'hazard' ? '#ff3b5c' : e.kind === 'echo' ? '#ffe9b0' : FREQS[e.freq].color;
      var gs = e.r * (e.kind === 'hazard' ? 6.2 : 6.8);
      var pulse = 1 + 0.06 * Math.sin(t * 2 + e.seed);
      ctx.globalAlpha = e.kind === 'hazard' ? 0.55 : 0.62;
      ctx.drawImage(glow(col), e.x - (gs * pulse) / 2, e.y - (gs * pulse) / 2, gs * pulse, gs * pulse);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    for (var j = 0; j < entities.length; j++) {
      var o = entities[j];
      if (o.kind === 'harmonic') drawHarmonic(o, t);
      else if (o.kind === 'dissonant') drawDissonant(o, t);
      else if (o.kind === 'hazard') drawHazard(o, t);
      else drawEcho(o, t);
    }
  }

  function drawHarmonic(e, t) {
    var col = FREQS[e.freq].color;
    var x = e.x;
    var y = e.y;
    var breathe = 1 + 0.05 * Math.sin(t * 2.4 + e.seed);

    ctx.beginPath();
    ctx.arc(x, y, e.r * breathe, 0, TAU);
    ctx.fillStyle = hexA(col, 0.92);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x - e.r * 0.24, y - e.r * 0.28, e.r * 0.38, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fill();

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = hexA(FREQS[e.freq].soft, 0.55);
    ctx.beginPath();
    ctx.arc(x, y, e.r * breathe + 1.6, 0, TAU);
    ctx.stroke();

    if (e.charge > 0.04) {
      ctx.beginPath();
      ctx.arc(x, y, e.r + 4.5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, e.charge));
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + e.charge * 0.55) + ')';
      ctx.stroke();
    }
  }

  function drawDissonant(e, t) {
    var r = e.r * (1 + 0.05 * Math.sin(t * 5 + e.seed));
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot);

    ctx.beginPath();
    for (var i = 0; i < 3; i++) {
      var a = (i / 3) * TAU - Math.PI / 2;
      var px = Math.cos(a) * r * 1.15;
      var py = Math.sin(a) * r * 1.15;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(58,10,28,0.9)';
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255,82,124,0.95)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,160,185,0.9)';
    ctx.fill();
    ctx.restore();

    // warning halo
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 2.1, 0, TAU);
    ctx.strokeStyle = 'rgba(255,70,110,' + (0.06 + 0.05 * Math.sin(t * 4 + e.seed)) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawHazard(e, t) {
    var r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot * 1.6);

    ctx.beginPath();
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * TAU;
      var a2 = a + TAU / 24;
      ctx.lineTo(Math.cos(a) * r * 1.42, Math.sin(a) * r * 1.42);
      ctx.lineTo(Math.cos(a2) * r * 0.94, Math.sin(a2) * r * 0.94);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(26,4,12,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,59,92,0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, TAU);
    ctx.fillStyle = 'rgba(4,2,7,0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,80,110,' + (0.5 + 0.25 * Math.sin(t * 3)) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0.4, 2.4);
    ctx.strokeStyle = 'rgba(255,120,150,0.5)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.restore();
  }

  function drawEcho(e, t) {
    var r = e.r;
    var pulse = 1 + 0.1 * Math.sin(t * 3 + e.seed);
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rot * 0.6);

    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = (i / 4) * TAU;
      var a2 = a + TAU / 8;
      ctx.lineTo(Math.cos(a) * r * 1.7 * pulse, Math.sin(a) * r * 1.7 * pulse);
      ctx.lineTo(Math.cos(a2) * r * 0.5, Math.sin(a2) * r * 0.5);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,238,190,0.92)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 1.9, 0, TAU);
    ctx.strokeStyle = 'rgba(255,235,180,' + (0.12 + 0.1 * Math.sin(t * 2)) + ')';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(e.x, e.y, 3.2, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fill();
  }

  function drawParticles() {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.active) continue;
      var a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.35 + a * 0.65), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (var r = 0; r < ripples.length; r++) {
      var rp = ripples[r];
      var alpha = Math.max(0, rp.life / rp.max) * 0.55;
      ctx.strokeStyle = hexA(rp.color, alpha);
      ctx.lineWidth = 1 + rp.life;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    for (var i = 0; i < texts.length; i++) {
      var tx = texts[i];
      var a = Math.min(1, tx.life / tx.max + 0.2);
      ctx.globalAlpha = a;
      ctx.font = '600 12px Satoshi, system-ui, sans-serif';
      ctx.fillStyle = tx.color;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText(tx.text, tx.x, tx.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  function drawLowCoherence() {
    if (runMode === 'zen' || phase !== 'playing') return;
    var danger = clamp(1 - state.coherence / 35, 0, 1);
    if (danger <= 0) return;
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(255,40,70,0)');
    g.addColorStop(1, 'rgba(255,30,60,' + danger * 0.28 + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function render(t) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.save();
    if (state.shake > 0.2 && !reducedMotion) {
      var s = Math.min(state.shake, 14);
      ctx.translate(rand(-s, s) * 0.5, rand(-s, s) * 0.5);
    }
    drawBackground(t);
    if (phase !== 'menu') drawField(t);
    else drawField(t);
    drawLinks();
    drawEntities(t);
    drawParticles();
    drawTexts();
    drawLowCoherence();
    ctx.restore();
  }

  var lastHud = { score: -1, coh: -1, chain: -1, best: -1 };

  function hudSync() {
    var shown = Math.round(state.shownScore);
    if (shown !== lastHud.score) {
      el.score.textContent = shown.toLocaleString('en-GB');
      lastHud.score = shown;
    }
    var coh = Math.round(state.coherence);
    if (coh !== lastHud.coh) {
      el.coherenceFill.style.width = clamp(coh, 0, 100) + '%';
      el.coherenceWrap.classList.toggle('is-low', coh < 34);
      lastHud.coh = coh;
    }
    if (state.chain !== lastHud.chain) {
      el.chainValue.textContent = state.chain;
      el.chainBadge.classList.toggle('is-on', state.chain >= 2);
      lastHud.chain = state.chain;
    }
    if (state.best !== lastHud.best) {
      el.bestInline.textContent = 'BEST ' + state.best.toLocaleString('en-GB');
      lastHud.best = state.best;
    }
    if (Math.abs(state.shownScore - state.score) > 0.4) {
      state.shownScore += (state.score - state.shownScore) * 0.18;
    } else {
      state.shownScore = state.score;
    }
    el.flash.style.opacity = state.flashAlpha.toFixed(3);
  }

  /* ─────────────────────────── 10. Flow, loop, hooks ─────────────────────────── */

  function flash(strength) {
    if (reducedMotion) return;
    state.flashAlpha = Math.max(state.flashAlpha, strength);
  }

  function emitParticles(x, y, count, color, speed, life, size) {
    for (var i = 0; i < particles.length && count > 0; i++) {
      var p = particles[i];
      if (p.active) continue;
      var a = rand(0, TAU);
      var sp = rand(speed * 0.25, speed);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.max = p.life = rand(life * 0.6, life * 1.3);
      p.size = rand(size * 0.5, size);
      p.color = color;
      count--;
    }
  }

  function emitRipple(x, y, r, color, life) {
    ripples.push({ x: x, y: y, r: r * 0.8, maxR: r * 2.1, life: life, max: life, color: color });
  }

  function startRun(mode) {
    runMode = mode || 'endless';
    phase = 'playing';
    state.time = 0;
    state.score = 0;
    state.shownScore = 0;
    state.coherence = 100;
    state.chain = 0;
    state.chainTimer = 0;
    state.bestChain = 0;
    state.resonances = 0;
    state.spawnTimer = 1.4;
    state.shake = 0;
    state.overTimer = 0;
    state.cause = '';
    state.hintTimer = 6;

    particles.forEach(function (p) {
      p.active = false;
    });
    ripples.length = 0;
    texts.length = 0;

    field.hold = 0;
    field.freq = 0;
    field.placed = true;
    if (!field.targetX) {
      field.targetX = W / 2;
      field.targetY = H / 2;
    }
    applyMode('attract', true);

    seedRun();
    RF.Audio.init();
    RF.Audio.ui();

    hide(el.start);
    hide(el.over);
    hide(el.pause);
    show(el.hud);
    el.hint.classList.add('is-on');
    el.freqDot.style.background = FREQS[0].color;
    el.freqName.textContent = 'TUNED · I';
    lastHud.score = -1;
    lastHud.coh = -1;
    lastHud.chain = -1;
  }

  function endRun(cause) {
    if (phase !== 'playing') return;
    phase = 'over';
    state.cause = cause || 'coherence';
    state.overTimer = 0;
    state.chain = 0;

    if (runMode === 'zen') {
      state.bestZen = Math.max(state.bestZen, state.score);
    } else {
      if (state.score > state.best) state.best = state.score;
    }
    persist();
    syncStatus();
    RF.Audio.gameOver();
    state.shake = Math.max(state.shake, 8);
    haptic([16, 70, 26]);

    setAudio(audioOn);
    el.overEyebrow.textContent = runMode === 'zen' ? 'Field complete' : 'The field settles';
    el.overTitle.textContent = runMode === 'zen' ? 'Session kept' : 'Run complete';
    el.finalScore.textContent = Math.round(state.score).toLocaleString('en-GB');
    el.finalBest.textContent = 'BEST ' + Math.max(state.best, state.bestZen).toLocaleString('en-GB');
    el.statChain.textContent = state.bestChain;
    el.statReso.textContent = state.resonances;
    var secs = Math.floor(state.time);
    el.statTime.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');

    var tips = [
      'Tip: switch to Neutral to hold a cluster without crushing it.',
      'Tip: swarm a dissonant with Repel to shove it out of your core.',
      'Tip: three or more harmonics resonate much faster than two.',
      'Tip: echoes are worth a burst of score. Sweep through them.',
      'Tip: a large field drags hazards toward you. Bloom with intent.',
    ];
    el.overTip.textContent = tips[Math.floor(Math.random() * tips.length)];

    setTimeout(function () {
      if (phase === 'over') {
        hide(el.hud);
        show(el.over);
      }
    }, 620);
  }

  function doPause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    field.down = false;
    pointer.down = false;
    show(el.pause);
    RF.Audio.ui();
  }

  function doResume() {
    if (phase !== 'paused') return;
    phase = 'playing';
    hide(el.pause);
  }

  function toMenu() {
    phase = 'menu';
    hide(el.pause);
    hide(el.over);
    hide(el.hud);
    show(el.start);
    field.hold = 0;
    syncStatus();
    entities.length = 0;
    seedMenu();
    applyMode('attract', true);
  }

  function seedMenu() {
    for (var i = 0; i < 12; i++) {
      var e = makeEntity(
        'harmonic',
        i % 4,
        rand(W * 0.08, W * 0.92),
        rand(H * 0.1, H * 0.9),
        rand(-18, 18),
        rand(-18, 18)
      );
      entities.push(e);
    }
  }

  /* UI wiring */
  el.beginBtn.addEventListener('click', function () {
    RF.Audio.init();
    startRun(runMode);
  });

  el.againBtn.addEventListener('click', function () {
    startRun(runMode);
  });

  el.menuBtn.addEventListener('click', toMenu);
  el.quitBtn.addEventListener('click', toMenu);
  el.resumeBtn.addEventListener('click', doResume);
  el.restartBtn.addEventListener('click', function () {
    hide(el.pause);
    startRun(runMode);
  });
  el.pauseBtn.addEventListener('click', doPause);
  /* Toggling sound is also the easiest way for a player to check the game is
     making noise, so turning it on answers with a two-note confirmation. */
  function toggleAudio() {
    RF.Audio.init();
    setAudio(!audioOn);
    if (audioOn) {
      RF.Audio.ui();
      setTimeout(function () {
        RF.Audio.ui();
      }, 120);
    }
  }

  el.soundBtn.addEventListener('click', toggleAudio);

  document.querySelectorAll('[data-runmode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      runMode = btn.getAttribute('data-runmode');
      document.querySelectorAll('[data-runmode]').forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      RF.Audio.ui();
    });
  });

  document.querySelectorAll('[data-theme]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      themeIndex = THEMES.findIndex(function (t) {
        return t.id === btn.getAttribute('data-theme');
      });
      if (themeIndex < 0) themeIndex = 0;
      buildNebula();
      persist();
      document.querySelectorAll('[data-theme]').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      RF.Audio.ui();
    });
  });

  el.statusLine.addEventListener('click', toggleAudio);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 120);
  });

  /* Main loop */
  var STEP = 1 / 60;
  var acc = 0;
  var last = performance.now();
  var raf = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (phase !== 'paused') {
      acc += dt;
      var guard = 0;
      while (acc >= STEP && guard < 5) {
        update(STEP);
        acc -= STEP;
        guard++;
      }
      if (guard >= 5) acc = 0;
    }
    render(now / 1000);
    hudSync();
  }

  /* Test hooks */
  window.render_game_to_text = function () {
    var payload = {
      phase: phase,
      mode: field.mode,
      run: runMode,
      score: Math.round(state.score),
      coherence: Math.round(state.coherence * 10) / 10,
      chain: state.chain,
      resonances: state.resonances,
      time: Math.round(state.time * 10) / 10,
      field: {
        x: Math.round(field.x),
        y: Math.round(field.y),
        r: Math.round(field.r),
        hold: Math.round(field.hold * 100) / 100,
      },
      counts: entities.reduce(
        function (acc2, e) {
          acc2[e.kind] = (acc2[e.kind] || 0) + 1;
          return acc2;
        },
        { harmonic: 0, dissonant: 0, hazard: 0, echo: 0 }
      ),
      entities: entities.slice(0, 24).map(function (e) {
        return {
          kind: e.kind,
          f: e.freq,
          x: Math.round(e.x),
          y: Math.round(e.y),
          charge: Math.round(e.charge * 100) / 100,
        };
      }),
      note: 'origin top-left, x right, y down',
    };
    return JSON.stringify(payload);
  };

  window.advanceTime = function (ms) {
    var steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (var i = 0; i < steps; i++) update(1 / 60);
    render(performance.now() / 1000);
    hudSync();
  };

  window.__rf = {
    start: startRun,
    menu: toMenu,
    pause: doPause,
    resume: doResume,
    setMode: function (m) {
      applyMode(m, true);
    },
    cycleMode: cycleMode,
    field: field,
    state: state,
    entities: entities,
    spawn: function (kind, freq, x, y) {
      entities.push(makeEntity(kind, freq || 0, x, y, 0, 0));
    },
    clearEntities: function () {
      entities.length = 0;
    },
    setCoherence: function (v) {
      state.coherence = v;
    },
    persist: persist,
    save: Save,
    end: endRun,
  };

  /* Leaving the app mid-run should never cost the player a run. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && phase === 'playing') doPause();
  });

  /* Boot */
  resize();
  seedMenu();
  applyMode('attract', true);
  setAudio(true);
  syncStatus();
  document.querySelectorAll('[data-theme]').forEach(function (b) {
    b.classList.toggle('is-active', b.getAttribute('data-theme') === THEMES[themeIndex].id);
  });
  el.bestInline.textContent = 'BEST ' + Math.max(state.best, state.bestZen).toLocaleString('en-GB');
  raf = requestAnimationFrame(frame);

  /* PWA: register only in a normal (non-sandboxed) hosting context. */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
})();
