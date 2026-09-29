// Synthé — instrument multi-touch et compositeur génératif en Web Audio.
// Voix polyphoniques (FM, soustractive, nappe, pincée), réverbération à convolution générée,
// délai ping-pong stéréo, compresseur, séquenceur à anticipation précise, MIDI et enregistrement.
import { observeSize, h, saveBlob, stamp, canvasToBlob, clamp } from '../core/kit.js';

export const info = {
  title: 'Synthé · comment ça marche',
  html: `<p>Tout le son est <b>synthétisé en temps réel</b> par la Web Audio API : aucun échantillon n’est chargé.</p>
  <ul>
    <li><b>Verre</b> : synthèse FM, un oscillateur en module un autre avec un indice qui décroît.</li>
    <li><b>Analogique</b> : deux dents de scie désaccordées et une sous-octave dans un filtre passe-bas.</li>
    <li><b>Nappe</b> : trois oscillateurs lents et doux. <b>Pincé</b> : enveloppe de filtre très rapide.</li>
  </ul>
  <p>Le signal traverse un <b>délai ping-pong</b> synchronisé au tempo, une <b>réverbération à convolution</b> dont la réponse impulsionnelle est calculée au lancement, puis un compresseur.</p>
  <p>Le <b>Compositeur</b> écrit la musique en direct : progression d’accords, basse syncopée, arpèges en rythmes euclidiens, charleston et grosse caisse de synthèse. Les notes sont planifiées à l’avance sur l’horloge audio pour un tempo parfaitement stable, et les visuels sont synchronisés sur cette horloge.</p>
  <p>Chaque couloir est une note de la gamme choisie : impossible de jouer faux. La hauteur du doigt règle la brillance du son.</p>
  <h3>iPhone</h3><p>Le son est joué même quand le bouton silencieux est activé (API Audio Session d’iOS).</p>
  <h3>Clavier et MIDI</h3><p>Rangées <code>A S D F G H J K L</code> et <code>Q W E R T Y U I O P</code> (position physique, AZERTY compris). Dans Edge, branchez un clavier MIDI puis touchez <b>MIDI</b>.</p>`,
};

const SCALES = [
  { id: 'penta', label: 'Pentatonique', steps: [0, 2, 4, 7, 9] },
  { id: 'dorien', label: 'Dorien', steps: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'lydien', label: 'Lydien', steps: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'hirajoshi', label: 'Hirajōshi', steps: [0, 2, 3, 7, 8] },
  { id: 'arabe', label: 'Double harmonique', steps: [0, 1, 4, 5, 7, 8, 11] },
];
const TIMBRES = [
  { id: 'verre', label: 'Verre' },
  { id: 'analog', label: 'Analogique' },
  { id: 'nappe', label: 'Nappe' },
  { id: 'pince', label: 'Pincé' },
];
const SOLFEGE = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const ROOT = 50; // Ré 3
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const PROGRESSIONS = [[0, 5, 3, 4], [0, 3, 5, 4], [5, 3, 0, 4], [0, 4, 5, 3], [0, 6, 5, 4]];

/* ——— Moteur audio ——— */
function makeImpulse(ac, seconds = 3.2, decay = 2.6) {
  const rate = ac.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const env = Math.pow(1 - t / seconds, decay) * (t < 0.012 ? t / 0.012 : 1);
      // bruit filtré qui s'assombrit avec le temps (air absorbant les aigus)
      const k = 0.15 + 0.8 * (1 - t / seconds);
      lp = lp + k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * env;
    }
    // premières réflexions
    for (const [ms, g] of [[11, 0.5], [19, 0.35], [27, 0.3], [41, 0.22]]) {
      const idx = Math.floor((ms + ch * 3) * rate / 1000);
      if (idx < len) d[idx] += g * (Math.random() > 0.5 ? 1 : -1);
    }
  }
  return buf;
}

class Engine {
  constructor() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* iOS < 16.4 */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ac = new AC({ latencyHint: 'interactive' });
    const ac = this.ac;
    this.bus = ac.createGain();
    this.bus.gain.value = 0.9;
    this.dry = ac.createGain(); this.dry.gain.value = 0.85;
    this.revSend = ac.createGain(); this.revSend.gain.value = 0.32;
    this.dlySend = ac.createGain(); this.dlySend.gain.value = 0.22;
    this.bus.connect(this.dry); this.bus.connect(this.revSend); this.bus.connect(this.dlySend);

    this.reverb = ac.createConvolver();
    this.reverb.buffer = makeImpulse(ac);
    this.revSend.connect(this.reverb);

    // Délai ping-pong stéréo
    this.dL = ac.createDelay(2); this.dR = ac.createDelay(2);
    this.fb = ac.createGain(); this.fb.gain.value = 0.38;
    this.dTone = ac.createBiquadFilter(); this.dTone.type = 'lowpass'; this.dTone.frequency.value = 3200;
    const merger = ac.createChannelMerger(2);
    this.dlySend.connect(this.dL);
    this.dL.connect(this.dR);
    this.dR.connect(this.dTone);
    this.dTone.connect(this.fb);
    this.fb.connect(this.dL);
    this.dL.connect(merger, 0, 0);
    this.dR.connect(merger, 0, 1);
    this.delayOut = ac.createGain(); this.delayOut.gain.value = 0.7;
    merger.connect(this.delayOut);

    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 10; this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master = ac.createGain(); this.master.gain.value = 0.85;
    this.dry.connect(this.comp); this.reverb.connect(this.comp); this.delayOut.connect(this.comp);
    this.comp.connect(this.master);
    this.analyser = ac.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.78;
    this.master.connect(this.analyser);
    this.analyser.connect(ac.destination);
    this.noise = (() => {
      const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    })();
    this.setTempo(92);
  }
  setTempo(bpm) {
    this.bpm = bpm;
    const t = this.ac.currentTime;
    const beat = 60 / bpm;
    this.dL.delayTime.setTargetAtTime(beat * 0.75, t, 0.05);
    this.dR.delayTime.setTargetAtTime(beat * 0.75, t, 0.05);
  }
  async resume() { if (this.ac.state !== 'running') await this.ac.resume().catch(() => {}); }

  /** Crée une voix. Renvoie un objet contrôlable (glissé de hauteur, brillance, relâchement). */
  voice(timbre, freq, { vel = 0.8, bright = 0.6, when = this.ac.currentTime, pan = 0, gain = 1 } = {}) {
    const ac = this.ac;
    const out = ac.createGain();
    out.gain.value = 0;
    const panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (panner) { panner.pan.value = pan; out.connect(panner); panner.connect(this.bus); } else out.connect(this.bus);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.connect(out);
    const oscs = [];
    const osc = (type, f, detune = 0, g = 1, dest = filter) => {
      const o = ac.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = detune;
      const og = ac.createGain(); og.gain.value = g;
      o.connect(og); og.connect(dest);
      o.start(when);
      oscs.push({ o, ratio: f / freq });
      return { o, og };
    };
    const cut = (b) => 180 * 2 ** (b * 6.6);
    const peak = vel * 0.32 * gain;
    let release = 0.4;
    const A = out.gain;
    A.setValueAtTime(0, when);

    if (timbre === 'verre') {
      const car = osc('sine', freq, 0, 1);
      const mod = ac.createOscillator();
      mod.type = 'sine'; mod.frequency.value = freq * 3.5;
      const idx = ac.createGain();
      idx.gain.setValueAtTime(freq * (1.5 + bright * 4), when);
      idx.gain.exponentialRampToValueAtTime(freq * 0.2 + 1, when + 1.6);
      mod.connect(idx); idx.connect(car.o.frequency);
      mod.start(when);
      oscs.push({ o: mod, ratio: 3.5 });
      osc('sine', freq * 2, 3, 0.12);
      filter.frequency.value = 12000;
      A.linearRampToValueAtTime(peak, when + 0.004);
      A.setTargetAtTime(peak * 0.45, when + 0.01, 0.6);
      release = 1.4;
    } else if (timbre === 'analog') {
      osc('sawtooth', freq, -7, 0.55);
      osc('sawtooth', freq, 7, 0.55);
      osc('square', freq / 2, 0, 0.3);
      filter.Q.value = 4;
      filter.frequency.setValueAtTime(cut(bright) * 1.8, when);
      filter.frequency.setTargetAtTime(cut(bright), when + 0.01, 0.25);
      A.linearRampToValueAtTime(peak * 0.8, when + 0.01);
      A.setTargetAtTime(peak * 0.6, when + 0.02, 0.3);
      release = 0.35;
    } else if (timbre === 'nappe') {
      osc('sawtooth', freq, -9, 0.4);
      osc('sawtooth', freq, 9, 0.4);
      osc('triangle', freq * 2, 0, 0.25);
      filter.frequency.value = cut(bright * 0.7);
      A.linearRampToValueAtTime(peak * 0.7, when + 0.6);
      release = 1.8;
    } else { // pincé
      osc('sawtooth', freq, 0, 0.6);
      osc('triangle', freq, 5, 0.6);
      filter.Q.value = 6;
      filter.frequency.setValueAtTime(cut(bright) * 3, when);
      filter.frequency.exponentialRampToValueAtTime(Math.max(120, cut(bright) * 0.25), when + 0.35);
      A.linearRampToValueAtTime(peak, when + 0.003);
      A.setTargetAtTime(0.0001, when + 0.005, 0.28);
      release = 0.3;
    }
    let ended = false;
    return {
      out,
      setFreq(f, glide = 0.04) {
        const t = ac.currentTime;
        for (const { o, ratio } of oscs) o.frequency.setTargetAtTime(f * ratio, t, glide);
      },
      setBright(b) { if (timbre !== 'verre') filter.frequency.setTargetAtTime(cut(timbre === 'nappe' ? b * 0.7 : b), ac.currentTime, 0.05); },
      release(at = ac.currentTime) {
        if (ended) return;
        ended = true;
        if (at <= ac.currentTime + 0.01) {
          // Relâchement immédiat : on fige la valeur courante pour éviter un clic.
          A.cancelScheduledValues(at);
          A.setValueAtTime(A.value, at);
        }
        A.setTargetAtTime(0, at, release / 4);
        const stop = at + release * 1.6 + 0.05;
        for (const { o } of oscs) { try { o.stop(stop); } catch { /* déjà arrêté */ } }
        oscs[0].o.onended = () => { try { out.disconnect(); panner?.disconnect(); } catch { /* ignoré */ } };
      },
    };
  }
  note(timbre, freq, when, dur, opts = {}) {
    const v = this.voice(timbre, freq, { ...opts, when });
    v.release(when + dur);
    return v;
  }
  kick(when, vel = 1) {
    const ac = this.ac;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.setValueAtTime(130, when);
    o.frequency.exponentialRampToValueAtTime(42, when + 0.14);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.9 * vel, when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.42);
    o.connect(g); g.connect(this.comp);
    o.start(when); o.stop(when + 0.45);
    o.onended = () => g.disconnect();
  }
  hat(when, vel = 1, open = false) {
    const ac = this.ac;
    const s = ac.createBufferSource();
    s.buffer = this.noise;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ac.createGain();
    const len = open ? 0.22 : 0.05;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.14 * vel, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len);
    s.connect(f); f.connect(g); g.connect(this.bus);
    s.start(when, Math.random() * 0.5); s.stop(when + len + 0.02);
    s.onended = () => g.disconnect();
  }
  close() { try { this.ac.close(); } catch { /* ignoré */ } }
}

/** Rythme euclidien : k impulsions réparties sur n pas. */
function euclid(k, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(((i * k) % n) < k ? 1 : 0);
  return out;
}

export async function create(ctx) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Instrument : chaque couloir vertical est une note');
  ctx.host.append(canvas);
  const g = canvas.getContext('2d', { alpha: false });

  const state = { scale: SCALES[0], timbre: 'verre', composer: false, tempo: 92, lanes: 10 };
  let W = 1, H = 1, dpr = 1;
  const offSize = observeSize(canvas, (w, hh, r) => {
    W = w; H = hh; dpr = Math.min(r, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr);
    state.lanes = clamp(Math.round(w / 44), 8, 22);
  });

  let engine = null;
  const unlockBtn = h('button', { class: 'btn primary', type: 'button', style: { position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)', zIndex: 3, height: '56px', padding: '0 28px', fontSize: '1.05rem', borderRadius: '999px' } }, 'Activer le son');
  ctx.host.append(unlockBtn);
  async function ensureAudio() {
    if (!engine) {
      engine = new Engine();
      unlockBtn.remove();
      ctx.setStatus(`${state.scale.label} · ${Math.round(engine.ac.sampleRate / 100) / 10} kHz · Web Audio`);
    }
    await engine.resume();
    return engine;
  }
  unlockBtn.addEventListener('click', () => { ensureAudio(); ctx.haptic('success'); });

  /* ——— Notes ——— */
  const laneMidi = (lane) => {
    const s = state.scale.steps;
    const oct = Math.floor(lane / s.length);
    return ROOT + oct * 12 + s[((lane % s.length) + s.length) % s.length];
  };
  const laneAt = (x) => clamp(Math.floor((x / W) * state.lanes), 0, state.lanes - 1);
  const noteName = (m) => SOLFEGE[m % 12] + (Math.floor(m / 12) - 1);

  // Retour visuel
  const orbs = new Map(); // pointeurs actifs
  const sparks = [];      // notes du compositeur
  const ripples = [];
  let pulse = 0;
  const laneGlow = new Float32Array(32);

  const play = new Map();
  function start(id, x, y, vel = 0.85) {
    if (!engine) return;
    const lane = laneAt(x);
    const bright = 1 - clamp(y / H, 0, 1);
    const v = engine.voice(state.timbre, mtof(laneMidi(lane)), { vel, bright, pan: (x / W - 0.5) * 0.8 });
    play.set(id, { v, lane });
    orbs.set(id, { x, y, lane, born: performance.now() });
    ripples.push({ x, y, t: 0, c: 1 });
    laneGlow[lane] = 1;
  }
  function move(id, x, y) {
    const p = play.get(id);
    if (!p) return;
    const lane = laneAt(x);
    if (lane !== p.lane) {
      p.lane = lane;
      p.v.setFreq(mtof(laneMidi(lane)), 0.03);
      laneGlow[lane] = 1;
      ctx.haptic('light');
    }
    p.v.setBright(1 - clamp(y / H, 0, 1));
    const o = orbs.get(id);
    if (o) { o.x = x; o.y = y; o.lane = lane; }
  }
  function stop(id) {
    const p = play.get(id);
    if (p) { p.v.release(); play.delete(id); }
    orbs.delete(id);
  }

  const onDown = async (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    await ensureAudio();
    const r = canvas.getBoundingClientRect();
    start(e.pointerId, e.clientX - r.left, e.clientY - r.top, 0.6 + (e.pressure && e.pointerType === 'pen' ? e.pressure * 0.4 : 0.25));
    ctx.haptic('light');
  };
  const onMove = (e) => { const r = canvas.getBoundingClientRect(); move(e.pointerId, e.clientX - r.left, e.clientY - r.top); };
  const onUp = (e) => stop(e.pointerId);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  const noCtx = (e) => e.preventDefault();
  canvas.addEventListener('contextmenu', noCtx);
  // iOS ne déverrouille parfois l'audio qu'à la fin du toucher
  const unlockEnd = () => { if (engine && engine.ac.state !== 'running') engine.ac.resume().catch(() => {}); };
  canvas.addEventListener('touchend', unlockEnd, { passive: true });

  /* ——— Clavier d'ordinateur (position physique des touches) ——— */
  const ROW_LOW = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
  const ROW_HIGH = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
  const keyLane = (code) => {
    let i = ROW_LOW.indexOf(code);
    if (i >= 0) return i;
    i = ROW_HIGH.indexOf(code);
    return i >= 0 ? i + state.scale.steps.length : -1;
  };
  const onKeyUp = (e) => {
    const lane = keyLane(e.code);
    if (lane >= 0) stop(`k${e.code}`);
  };
  window.addEventListener('keyup', onKeyUp);

  /* ——— MIDI (Edge, Chrome) ——— */
  let midi = null;
  const midiVoices = new Map();
  async function enableMidi(on) {
    if (!on) { midi?.inputs.forEach((i) => { i.onmidimessage = null; }); midi = null; return false; }
    if (!navigator.requestMIDIAccess) { ctx.toast('MIDI indisponible dans ce navigateur', { type: 'warn' }); return false; }
    try {
      await ensureAudio();
      midi = await navigator.requestMIDIAccess();
      const attach = () => midi.inputs.forEach((input) => { input.onmidimessage = onMidi; });
      attach();
      midi.onstatechange = attach;
      const n = midi.inputs.size;
      ctx.toast(n ? `${n} appareil${n > 1 ? 's' : ''} MIDI connecté${n > 1 ? 's' : ''}` : 'Aucun clavier MIDI détecté pour l’instant', { type: n ? 'ok' : 'warn' });
      return true;
    } catch {
      ctx.toast('Accès MIDI refusé', { type: 'warn' });
      return false;
    }
  }
  function onMidi(e) {
    const [st, note, vel] = e.data;
    const cmd = st & 0xf0;
    if (cmd === 0x90 && vel > 0) {
      const v = engine.voice(state.timbre, mtof(note), { vel: vel / 127, bright: 0.65 });
      midiVoices.get(note)?.release();
      midiVoices.set(note, v);
      const lane = nearestLane(note);
      laneGlow[lane] = 1;
      sparks.push({ lane, t: 0, c: 1, big: true });
    } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
      midiVoices.get(note)?.release();
      midiVoices.delete(note);
    }
  }
  function nearestLane(m) {
    let best = 0, bd = 1e9;
    for (let l = 0; l < state.lanes; l++) { const d = Math.abs(laneMidi(l) - m); if (d < bd) { bd = d; best = l; } }
    return best;
  }

  /* ——— Compositeur : séquenceur à anticipation sur l'horloge audio ——— */
  let timer = null, step = 0, nextTime = 0, prog = PROGRESSIONS[0];
  const events = []; // { time, fn } pour synchroniser les visuels
  let arpPattern = euclid(5, 8), arpIdx = 0;
  function chordTones(deg) {
    const n = state.scale.steps.length;
    return [0, 2, 4].map((k) => deg + k).map((d) => ROOT - 12 + Math.floor(d / n) * 12 + state.scale.steps[d % n]);
  }
  function schedule(s, t) {
    const e = engine;
    const stepDur = 60 / e.bpm / 4;
    const swing = s % 2 ? stepDur * 0.1 : 0;
    const within = s % 16;
    const deg = prog[Math.floor(s / 16) % prog.length] % state.scale.steps.length;
    const chord = chordTones(deg);
    if (within === 0) {
      chord.forEach((m, i) => e.note('nappe', mtof(m + 12), t, stepDur * 15.5, { vel: 0.32, bright: 0.35, pan: (i - 1) * 0.5 }));
      events.push({ time: t, fn: () => { chord.forEach((m) => { const l = nearestLane(m + 12); laneGlow[l] = Math.max(laneGlow[l], 0.6); }); } });
      if (Math.floor(s / 16) % 8 === 7) prog = PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)];
      if (Math.random() < 0.3) arpPattern = euclid([3, 5, 7][Math.floor(Math.random() * 3)], 8);
    }
    if (within === 0 || within === 6 || within === 10) {
      e.note('analog', mtof(chord[0] - 12), t + swing, stepDur * (within === 0 ? 3 : 1.6), { vel: 0.55, bright: 0.25 });
    }
    if (within === 0 || within === 8) { e.kick(t, within === 0 ? 1 : 0.75); events.push({ time: t, fn: () => { pulse = 1; } }); }
    if (s % 2 === 0) e.hat(t + swing, within % 4 === 2 ? 0.8 : 0.4, within === 14);
    if (arpPattern[within % 8]) {
      const pool = [...chord.map((m) => m + 24), chord[0] + 36];
      let m = pool[arpIdx++ % pool.length];
      if (Math.random() < 0.18) m = laneMidi(nearestLane(m) + (Math.random() < 0.5 ? 1 : -1));
      const vel = within % 4 === 0 ? 0.62 : 0.42;
      e.note(state.timbre, mtof(m), t + swing, stepDur * 1.6, { vel, bright: 0.7, pan: Math.random() * 0.8 - 0.4 });
      const lane = nearestLane(m);
      events.push({ time: t + swing, fn: () => { sparks.push({ lane, t: 0, c: vel }); laneGlow[lane] = 1; } });
    }
  }
  function tick() {
    if (!engine) return;
    const ac = engine.ac;
    while (nextTime < ac.currentTime + 0.14) {
      schedule(step, nextTime);
      nextTime += 60 / engine.bpm / 4;
      step++;
    }
  }
  async function setComposer(on) {
    state.composer = on;
    if (on) {
      await ensureAudio();
      step = 0;
      nextTime = engine.ac.currentTime + 0.08;
      clearInterval(timer);
      timer = setInterval(tick, 25);
      tick();
    } else {
      clearInterval(timer);
      timer = null;
    }
    return on;
  }

  /* ——— Enregistrement ——— */
  let recorder = null, chunks = [], recDest = null;
  async function setRecording(on) {
    await ensureAudio();
    if (on) {
      if (!window.MediaRecorder) { ctx.toast('Enregistrement non pris en charge', { type: 'warn' }); return false; }
      recDest ??= engine.ac.createMediaStreamDestination();
      engine.master.connect(recDest);
      const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      recorder = new MediaRecorder(recDest.stream, type ? { mimeType: type } : undefined);
      chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        const mime = recorder?.mimeType || type || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        const ext = mime.includes('mp4') ? 'm4a' : 'webm';
        const res = await saveBlob(blob, `prisme-synthe-${stamp()}.${ext}`, { title: 'Prisme · Synthé' });
        if (res === 'saved' || res === 'downloaded') ctx.toast('Enregistrement sauvegardé');
      };
      recorder.start(250);
      ctx.toast('Enregistrement en cours');
      return true;
    }
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    try { engine.master.disconnect(recDest); } catch { /* ignoré */ }
    return false;
  }

  /* ——— Rendu ——— */
  const dockEl = document.getElementById('dock');
  let floorY = H - 160, floorClock = 1;
  const freq = new Uint8Array(1024);
  const wave = new Uint8Array(2048);
  const accent = ctx.color;
  const offLoop = ctx.loop.add((t, dt) => {
    const now = engine ? engine.ac.currentTime : 0;
    while (events.length && events[0].time <= now) events.shift().fn();
    if (events.length > 400) events.splice(0, events.length - 400);

    floorClock += dt;
    if (floorClock > 0.5) {
      floorClock = 0;
      const dr = dockEl?.getBoundingClientRect();
      const cr = canvas.getBoundingClientRect();
      floorY = dr && dr.height ? Math.min(H - 20, dr.top - cr.top - 16) : H - 30;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#050407';
    g.fillRect(0, 0, W, H);
    if (pulse > 0) {
      const grd = g.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.7);
      grd.addColorStop(0, `rgba(255,77,94,${0.16 * pulse})`);
      grd.addColorStop(1, 'rgba(255,77,94,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
      pulse = Math.max(0, pulse - dt * 3.5);
    }

    // Couloirs
    const lw = W / state.lanes;
    for (let l = 0; l < state.lanes; l++) {
      const m = laneMidi(l);
      const isRoot = (m - ROOT) % 12 === 0;
      const glow = laneGlow[l];
      if (glow > 0.01) {
        const grd = g.createLinearGradient(0, H, 0, 0);
        grd.addColorStop(0, `rgba(255,90,110,${0.35 * glow})`);
        grd.addColorStop(1, 'rgba(255,90,110,0)');
        g.fillStyle = grd;
        g.fillRect(l * lw, 0, lw, H);
        laneGlow[l] = glow * Math.exp(-dt * 2.2);
      }
      g.fillStyle = isRoot ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.045)';
      g.fillRect(Math.round(l * lw), 0, 1, H);
      g.fillStyle = isRoot ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.38)';
      g.font = `500 ${lw < 36 ? 9 : 10}px "JetBrains Mono", ui-monospace, monospace`;
      g.textAlign = 'center';
      g.fillText(SOLFEGE[m % 12], l * lw + lw / 2, floorY);
    }

    if (engine) {
      // Spectre (axe logarithmique)
      engine.analyser.getByteFrequencyData(freq);
      const base = floorY - 18;
      const nyq = engine.ac.sampleRate / 2;
      g.beginPath();
      g.moveTo(0, base);
      const N = 96;
      for (let i = 0; i <= N; i++) {
        const f = 40 * Math.pow(16000 / 40, i / N);
        const bin = Math.min(freq.length - 1, Math.round((f / nyq) * freq.length));
        const v = freq[bin] / 255;
        g.lineTo((i / N) * W, base - v * v * H * 0.34);
      }
      g.lineTo(W, base);
      g.closePath();
      const sg = g.createLinearGradient(0, base - H * 0.34, 0, base);
      sg.addColorStop(0, 'rgba(255,138,61,.55)');
      sg.addColorStop(1, 'rgba(255,77,94,.05)');
      g.fillStyle = sg;
      g.fill();

      // Oscilloscope
      engine.analyser.getByteTimeDomainData(wave);
      g.beginPath();
      const mid = H * 0.36;
      for (let i = 0; i < wave.length; i += 4) {
        const x = (i / wave.length) * W;
        const y = mid + ((wave[i] - 128) / 128) * H * 0.16;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.strokeStyle = 'rgba(255,255,255,.55)';
      g.lineWidth = 1.5;
      g.shadowColor = accent;
      g.shadowBlur = 12;
      g.stroke();
      g.shadowBlur = 0;
    }

    // Étincelles du compositeur : elles montent dans leur couloir
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.t += dt;
      const x = s.lane * lw + lw / 2;
      const y = floorY - 30 - s.t * H * 0.45;
      const a = Math.max(0, 1 - s.t / 1.8) * s.c;
      if (a <= 0) { sparks.splice(i, 1); continue; }
      const r = (s.big ? 16 : 9) * (1 + s.t);
      const grd = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
      grd.addColorStop(0, `rgba(255,240,235,${a})`);
      grd.addColorStop(0.35, `rgba(255,90,110,${a * 0.6})`);
      grd.addColorStop(1, 'rgba(255,77,94,0)');
      g.fillStyle = grd;
      g.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    }

    // Ondes et doigts
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.t += dt;
      if (rp.t > 1.2) { ripples.splice(i, 1); continue; }
      g.beginPath();
      g.arc(rp.x, rp.y, 20 + rp.t * 160, 0, Math.PI * 2);
      g.strokeStyle = `rgba(255,255,255,${0.5 * (1 - rp.t / 1.2)})`;
      g.lineWidth = 1.5;
      g.stroke();
    }
    for (const o of orbs.values()) {
      const x = o.lane * lw + lw / 2;
      const beam = g.createLinearGradient(0, 0, 0, H);
      beam.addColorStop(0, 'rgba(255,77,94,0)');
      beam.addColorStop(o.y / H, 'rgba(255,200,205,.35)');
      beam.addColorStop(1, 'rgba(255,77,94,0)');
      g.fillStyle = beam;
      g.fillRect(o.lane * lw, 0, lw, H);
      const age = (performance.now() - o.born) / 1000;
      const r = 34 + Math.sin(age * 8) * 3;
      const grd = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * 2);
      grd.addColorStop(0, 'rgba(255,255,255,.95)');
      grd.addColorStop(0.3, 'rgba(255,120,135,.7)');
      grd.addColorStop(1, 'rgba(255,77,94,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(o.x, o.y, r * 2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
      g.fillText(noteName(laneMidi(o.lane)), o.x, o.y - r - 12);
    }
  });

  /* ——— Commandes ——— */
  const d = ctx.dock;
  d.segment(SCALES.map((s) => ({ value: s.id, label: s.label })), state.scale.id, (v) => {
    state.scale = SCALES.find((s) => s.id === v);
    if (engine) ctx.setStatus(`${state.scale.label} · ${Math.round(engine.ac.sampleRate / 100) / 10} kHz · Web Audio`);
  });
  d.row();
  d.segment(TIMBRES.map((t) => ({ value: t.id, label: t.label })), state.timbre, (v) => { state.timbre = v; });
  d.row();
  const compT = d.toggle('Compositeur', false, (v) => setComposer(v));
  if (!ctx.preview) d.toggle('Enregistrer', false, (v) => setRecording(v), { cls: 'rec' });
  if (navigator.requestMIDIAccess) d.toggle('MIDI', false, (v) => enableMidi(v));
  d.slider('Tempo', { min: 60, max: 140, step: 1, value: state.tempo, format: (v) => `${v} bpm` }, (v) => { state.tempo = v; engine?.setTempo(v); });

  // Pause audio quand l'app passe en arrière-plan (iOS coupe le son de toute façon)
  const onVis = () => {
    if (!engine) return;
    if (document.hidden) engine.ac.suspend().catch(() => {});
    else engine.ac.resume().catch(() => {});
  };
  document.addEventListener('visibilitychange', onVis);

  ctx.setStatus('Touchez « Activer le son »');

  return {
    shortcuts: [['A – L, Q – P', 'Jouer des notes'], ['Espace', 'Compositeur'], ['Maj + note', 'Son plus brillant']],
    key(e) {
      if (e.code === 'Space') { const next = !state.composer; setComposer(next); compT.set(next); return true; }
      const lane = keyLane(e.code);
      if (lane < 0) return false;
      if (e.repeat) return true;
      ensureAudio().then(() => {
        const x = ((lane % state.lanes) + 0.5) * (W / state.lanes);
        start(`k${e.code}`, x, e.shiftKey ? H * 0.05 : H * 0.4, 0.8);
      });
      return true;
    },
    capture() { return canvasToBlob(canvas); },
    destroy() {
      offLoop(); offSize();
      clearInterval(timer);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('lostpointercapture', onUp);
      canvas.removeEventListener('contextmenu', noCtx);
      canvas.removeEventListener('touchend', unlockEnd);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVis);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      midi?.inputs.forEach((i) => { i.onmidimessage = null; });
      engine?.close();
    },
  };
}
