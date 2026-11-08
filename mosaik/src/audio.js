/* Mosaik – Klang. Alles wird live erzeugt, keine Dateien. */
(function (root) {
  "use strict";
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  const A = {
    ctx: null, out: null, rev: null, sfx: null, mus: null,
    soundOn: true, musicOn: true,
    root: 60, scale: [0, 2, 4, 7, 9],
    streak: 0, lastHit: 0, musicTimer: null,

    init() {
      if (this.ctx) { if (this.ctx.state !== "running") this.ctx.resume(); return; }
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
      this.out = c.createGain(); this.out.gain.value = 0.85;
      this.out.connect(comp); comp.connect(c.destination);
      // Hall aus abklingendem Rauschen
      const len = Math.floor(c.sampleRate * 3.2);
      const buf = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (t < 0.01 ? t / 0.01 : 1); }
      }
      const conv = c.createConvolver(); conv.buffer = buf;
      const damp = c.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 5200;
      this.rev = c.createGain(); this.rev.gain.value = 0.42;
      this.rev.connect(conv); conv.connect(damp); damp.connect(this.out);
      this.sfx = c.createGain(); this.sfx.gain.value = this.soundOn ? 1 : 0; this.sfx.connect(this.out);
      this.mus = c.createGain(); this.mus.gain.value = this.musicOn ? 0.5 : 0; this.mus.connect(this.out);
      this.musRev = c.createGain(); this.musRev.gain.value = this.musicOn ? 1 : 0; this.musRev.connect(this.rev);
      this.sfxRev = c.createGain(); this.sfxRev.gain.value = this.soundOn ? 1 : 0; this.sfxRev.connect(this.rev);
      // iOS: stummen Puffer abspielen, damit der Kontext wirklich startet
      const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
      if (this.musicOn) this.startMusic();
    },

    setSound(on) { this.soundOn = on; if (this.sfx) { this.sfx.gain.value = on ? 1 : 0; this.sfxRev.gain.value = on ? 1 : 0; } },
    setMusic(on) {
      this.musicOn = on;
      if (!this.mus) return;
      const t = this.ctx.currentTime;
      this.mus.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.4);
      this.musRev.gain.setTargetAtTime(on ? 1 : 0, t, 0.4);
      if (on) this.startMusic(); else this.stopMusic();
    },
    setWorld(w) { this.root = w.music.root; this.scale = w.music.scale; },

    note(deg, oct = 0) {
      const n = this.scale.length;
      const o = Math.floor(deg / n);
      return this.root + this.scale[((deg % n) + n) % n] + 12 * (o + oct);
    },

    // Kalimba/Marimba-artiger Ton
    pluck(midi, vel = 0.5, when = 0, bus = "sfx", dur = 1.6) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + when, f = mtof(midi);
      const g = c.createGain(); g.gain.value = 0;
      const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(9000, f * 6); lp.Q.value = 0.5;
      g.connect(lp);
      const dry = bus === "sfx" ? this.sfx : this.mus, wet = bus === "sfx" ? this.sfxRev : this.musRev;
      lp.connect(dry);
      const send = c.createGain(); send.gain.value = 0.55; lp.connect(send); send.connect(wet);
      const parts = [[1, 1, dur], [2.0, 0.18, dur * 0.4], [3.98, 0.08, dur * 0.18], [5.4, 0.035, dur * 0.1]];
      for (const [m, a, d] of parts) {
        const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f * m;
        const og = c.createGain(); og.gain.setValueAtTime(0, t);
        og.gain.linearRampToValueAtTime(a * vel, t + 0.004);
        og.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(og); og.connect(g); o.start(t); o.stop(t + d + 0.05);
      }
      g.gain.setValueAtTime(1, t);
    },

    // Glasglocke
    bell(midi, vel = 0.35, when = 0, bus = "sfx") {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + when, f = mtof(midi);
      const dry = bus === "sfx" ? this.sfx : this.mus, wet = bus === "sfx" ? this.sfxRev : this.musRev;
      const g = c.createGain(); g.gain.value = 0.6; g.connect(dry);
      const send = c.createGain(); send.gain.value = 1.1; g.connect(send); send.connect(wet);
      for (const [m, a, d] of [[1, 1, 2.6], [2.76, 0.32, 1.4], [5.4, 0.14, 0.7], [8.93, 0.05, 0.35]]) {
        const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f * m;
        const og = c.createGain(); og.gain.setValueAtTime(0, t);
        og.gain.linearRampToValueAtTime(a * vel, t + 0.006);
        og.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(og); og.connect(g); o.start(t); o.stop(t + d + 0.05);
      }
    },

    // Leises Holzklacken
    tick(vel = 0.25) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime;
      const len = Math.floor(c.sampleRate * 0.04);
      const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
      const s = c.createBufferSource(); s.buffer = b;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500 + Math.random() * 500; bp.Q.value = 3;
      const g = c.createGain(); g.gain.value = vel;
      s.connect(bp); bp.connect(g); g.connect(this.sfx); s.start(t);
      const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(720 + Math.random() * 80, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.06);
      const og = c.createGain(); og.gain.setValueAtTime(vel * 0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(og); og.connect(this.sfx); o.start(t); o.stop(t + 0.1);
    },

    // Sanftes, tiefes "Plopp" bei einem Fehler
    oops() {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime;
      for (const [f0, f1, a] of [[220, 110, 0.32], [233, 116, 0.16]]) {
        const o = c.createOscillator(); o.type = "triangle";
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.28);
        const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
        o.connect(lp); lp.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.45);
      }
      this.streak = 0;
    },

    // Richtiges Feld: Ton steigt mit der Serie
    hit() {
      const now = performance.now();
      if (now - this.lastHit > 1600) this.streak = 0;
      this.lastHit = now;
      const deg = this.streak % 11;
      this.pluck(this.note(deg, 0), 0.5);
      if (this.streak >= 5 && this.streak % 5 === 0) this.bell(this.note(deg + 5, 1), 0.12, 0.05);
      this.streak++;
    },
    empty() { this.tick(0.22); },

    clueDone(n) {
      for (let i = 0; i < Math.min(n, 3); i++) this.bell(this.note(7 + i * 2, 1), 0.16, 0.05 + i * 0.07);
    },
    hint() { [0, 2, 4].forEach((d, i) => this.bell(this.note(d + 5, 1), 0.12, i * 0.08)); },
    ui() { this.tick(0.12); },
    star(i) { this.bell(this.note(4 + i * 2, 1), 0.3); this.pluck(this.note(4 + i * 2, 0), 0.25); },

    // Große Enthüllung: Akkord-Schwelle und Arpeggio
    reveal(dur = 2.4) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime;
      const chord = [0, 2, 4, 7].map(d => this.note(d, -1));
      for (const m of chord) for (const det of [-6, 6]) {
        const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = mtof(m); o.detune.value = det;
        const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(2200, t + dur * 0.7); lp.frequency.linearRampToValueAtTime(600, t + dur + 2.5);
        const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 3);
        o.connect(lp); lp.connect(g); g.connect(this.sfx);
        const s = c.createGain(); s.gain.value = 0.8; g.connect(s); s.connect(this.sfxRev);
        o.start(t); o.stop(t + dur + 3.1);
      }
      const n = 14;
      for (let i = 0; i < n; i++) this.pluck(this.note(i, 0), 0.32 + i * 0.012, (i / n) * dur * 0.8, "sfx", 2.2);
      this.bell(this.note(n, 0), 0.32, dur * 0.85);
      this.bell(this.note(n + 2, 0), 0.22, dur * 0.85 + 0.12);
      this.bell(this.note(n + 4, 0), 0.18, dur * 0.85 + 0.24);
      for (let i = 0; i < 10; i++) this.bell(this.note(10 + Math.floor(Math.random() * 8), 1), 0.05, dur * 0.9 + 0.3 + Math.random() * 1.8);
    },

    // Generative Hintergrundmusik: einzelne Töne mit viel Hall
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      const step = () => {
        const deg = Math.floor(Math.random() * 7);
        this.pluck(this.note(deg, -1), 0.22, 0, "mus", 3.2);
        if (Math.random() < 0.35) this.pluck(this.note(deg + 2 + Math.floor(Math.random() * 3), -1), 0.14, 0.6 + Math.random() * 0.6, "mus", 3);
        if (Math.random() < 0.18) this.bell(this.note(deg + 7, 0), 0.05, 1.2, "mus");
        this.musicTimer = setTimeout(step, 2600 + Math.random() * 3400);
      };
      this.musicTimer = setTimeout(step, 600);
    },
    stopMusic() { clearTimeout(this.musicTimer); this.musicTimer = null; },
  };
  root.MosaikAudio = A;
})(window);
