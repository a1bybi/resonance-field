/* ============================================================
   Resonance Field — generative audio
   Everything is synthesised at runtime: no audio files.
   Signal path: voices → dry bus → limiter → speakers
                        └→ reverb send
   ============================================================ */

window.RF = window.RF || {};

RF.Audio = (function () {
  'use strict';

  var ctx = null;
  var master = null;
  var dry = null;
  var reverbSend = null;
  var padGain = null;
  var padFilter = null;
  var padOscs = [];
  var noiseBuffer = null;
  var started = false;
  var enabled = true;
  var lastDamage = 0;
  var shimmerTimer = 0;
  var arpTimer = 1.2;
  var arpStep = 0;

  // Minor pentatonic — every object frequency maps onto this scale.
  var SCALE = [0, 3, 5, 7, 10];
  var ROOTS = [220.0, 246.94, 293.66, 329.63]; // A3 B3 D4 E4

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function makeReverbImpulse(seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(2, len, rate);
    for (var c = 0; c < 2; c++) {
      var data = buf.getChannelData(c);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  function makeNoise(seconds) {
    var rate = ctx.sampleRate;
    var len = Math.floor(rate * seconds);
    var buf = ctx.createBuffer(1, len, rate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function buildPad() {
    padGain = ctx.createGain();
    padGain.gain.value = 0.0;

    padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1100;
    padFilter.Q.value = 0.6;

    var padHP = ctx.createBiquadFilter();
    padHP.type = 'highpass';
    padHP.frequency.value = 140;
    padHP.Q.value = 0.6;

    padGain.connect(padHP);
    padHP.connect(padFilter);
    padFilter.connect(dry);

    /* The bed lives in the 110–520 Hz octaves on purpose: a phone speaker rolls
       off below ~250 Hz, so a sub-bass pad reads as silence on the device most
       people will play on. The 55 Hz voice stays, but only as body for
       headphones, and the high-pass above keeps it from eating headroom. */
    var voices = [
      { f: 220.0, type: 'sine', g: 0.17 },      // A3 — the body of the bed
      { f: 329.63, type: 'triangle', g: 0.17 }, // E4 — the fifth that sings on small speakers
      { f: 440.0, type: 'sine', g: 0.14 },      // A4 — air
      { f: 554.37, type: 'triangle', g: 0.06 }, // C#5 — a little colour
      { f: 110.0, type: 'sine', g: 0.13 },      // A2 — weight on headphones
      { f: 55.0, type: 'sine', g: 0.05 },       // A1 — a whisper of sub
    ];

    voices.forEach(function (v, i) {
      var osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.value = v.f;
      osc.detune.value = i % 2 ? 4 : -4;

      var g = ctx.createGain();
      g.gain.value = v.g;

      // slow amplitude drift so the bed never feels static
      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.013;
      var lfoGain = ctx.createGain();
      lfoGain.gain.value = v.g * 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      lfo.start();

      osc.connect(g);
      g.connect(padGain);
      osc.start();
      padOscs.push(osc, lfo);
    });

    // Air: filtered noise, very low level.
    var air = ctx.createBufferSource();
    air.buffer = makeNoise(6);
    air.loop = true;
    var airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 1200;
    airFilter.Q.value = 0.4;
    var airGain = ctx.createGain();
    airGain.gain.value = 0.018;
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(dry);
    air.start();

    padGain.gain.setTargetAtTime(0.44, ctx.currentTime, 1.6);
  }

  function init() {
    if (started) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0.0;

    dry = ctx.createGain();
    dry.gain.value = 0.82;

    var limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.2;

    dry.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);

    var convolver = ctx.createConvolver();
    convolver.buffer = makeReverbImpulse(2.4, 2.6);
    reverbSend = ctx.createGain();
    reverbSend.gain.value = 0.5;
    reverbSend.connect(convolver);
    var wet = ctx.createGain();
    wet.gain.value = 0.42;
    convolver.connect(wet);
    wet.connect(master);

    noiseBuffer = makeNoise(1.0);
    buildPad();
    started = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!master || !ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(enabled ? 0.9 : 0.0, ctx.currentTime, 0.12);
  }

  function isEnabled() {
    return enabled;
  }

  function voice(dest, freq, type, t0, dur, peak, glideTo) {
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);

    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(env);
    env.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noteAt(freqIndex, degree, t0, dur, peak, type) {
    var root = ROOTS[freqIndex] || 220;
    var oct = Math.floor(degree / SCALE.length);
    var semi = SCALE[((degree % SCALE.length) + SCALE.length) % SCALE.length];
    var f = root * Math.pow(2, semi / 12 + oct);
    voice(dry, f, type || 'sine', t0, dur, peak);
    if (reverbSend) voice(reverbSend, f * 2, 'sine', t0, dur * 1.2, peak * 0.35);
  }

  /* A resonance burst: rising arpeggio whose length and pitch follow the chain. */
  function resonance(freqIndex, count, chain) {
    if (!ctx || !enabled) return;
    var t = now() + 0.01;
    var steps = Math.min(4, Math.max(2, count));
    var offset = Math.min(9, (chain - 1) * 2);
    for (var i = 0; i < steps; i++) {
      noteAt(freqIndex, offset + i, t + i * 0.055, 0.9 - i * 0.1, 0.16, i % 2 ? 'triangle' : 'sine');
    }
    // soft glassy overtone
    noteAt(freqIndex, offset + 5, t + 0.04, 1.6, 0.055, 'sine');
  }

  /* Echo pickup — a bright two-note chime. */
  function collect() {
    if (!ctx || !enabled) return;
    var t = now() + 0.01;
    voice(dry, 1318.5, 'sine', t, 0.5, 0.13);
    voice(dry, 1975.5, 'sine', t + 0.07, 0.7, 0.09);
    if (reverbSend) voice(reverbSend, 2637, 'sine', t + 0.07, 1.1, 0.05);
  }

  /* Single harmonic brushing the field — tiny tick of contact. */
  function tick(freqIndex) {
    if (!ctx || !enabled) return;
    var t = now();
    var root = ROOTS[freqIndex] || 220;
    voice(dry, root * 2, 'sine', t, 0.12, 0.035);
  }

  function damage() {
    if (!ctx || !enabled) return;
    var t = now();
    if (t - lastDamage < 0.22) return;
    lastDamage = t;
    voice(dry, 92, 'sine', t, 0.4, 0.16, 42);
    voice(dry, 138, 'triangle', t, 0.25, 0.05, 60);

    if (noiseBuffer) {
      var src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(120, t + 0.35);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      src.connect(f);
      f.connect(g);
      g.connect(dry);
      src.start(t);
      src.stop(t + 0.4);
    }
  }

  function ui() {
    if (!ctx || !enabled) return;
    var t = now();
    voice(dry, 880, 'sine', t, 0.14, 0.07);
    voice(reverbSend, 1320, 'sine', t, 0.2, 0.03);
  }

  function modeShift(up) {
    if (!ctx || !enabled) return;
    var t = now();
    voice(dry, up ? 330 : 392, 'sine', t, 0.22, 0.05, up ? 494 : 262);
  }

  function gameOver() {
    if (!ctx || !enabled) return;
    var t = now();
    [0, 3, 5, -2].forEach(function (semi, i) {
      var f = 220 * Math.pow(2, semi / 12);
      voice(dry, f, 'sine', t + i * 0.16, 1.8, 0.07);
      voice(reverbSend, f, 'sine', t + i * 0.16, 2.2, 0.045);
    });
  }

  /* Slow generative bell that drifts through the scale while playing. */
  function update(dt, intensity) {
    if (!ctx || !started) return;
    shimmerTimer -= dt;
    if (shimmerTimer <= 0) {
      shimmerTimer = 3.2 + Math.random() * 3.4;
      var freqIndex = Math.floor(Math.random() * 4);
      var deg = Math.floor(Math.random() * 5) + 3;
      noteAt(freqIndex, deg, now() + 0.02, 2.6, 0.05, 'sine');
    }

    /* A slow arpeggio in the 400–1300 Hz octave. It is the part of the score
       that stays audible on a phone speaker, where anything below ~400 Hz
       barely comes through. */
    arpTimer -= dt;
    if (arpTimer <= 0) {
      arpTimer = 1.9 + Math.random() * 1.1;
      var arpFreq = Math.floor(Math.random() * 4);
      var arpDeg = 5 + ((arpStep + Math.floor(Math.random() * 3)) % 5);
      noteAt(arpFreq, arpDeg, now() + 0.03, 1.5, 0.075, arpStep % 2 ? 'triangle' : 'sine');
      if (reverbSend) noteAt(arpFreq, arpDeg + 2, now() + 0.05, 1.9, 0.03, 'sine');
      arpStep = (arpStep + 1) % 5;
    }
    if (padFilter) {
      var target = 900 + intensity * 1500;
      padFilter.frequency.setTargetAtTime(target, now(), 0.8);
    }
  }

  return {
    init: init,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    resonance: resonance,
    collect: collect,
    tick: tick,
    damage: damage,
    ui: ui,
    modeShift: modeShift,
    gameOver: gameOver,
    update: update,
  };
})();
