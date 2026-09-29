// Prisme — boîte à outils partagée : environnement, stockage, haptique, boucle d'animation,
// partage de fichiers, capteurs, verrou d'écran, petites aides DOM.

export const ua = navigator.userAgent;
export const isIOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isIPhone = /iPhone/.test(ua);
export const isEdge = /Edg\//.test(ua);
export const isWindows = /Windows/.test(ua);
export const isAndroid = /Android/.test(ua);
export const isMac = /Macintosh/.test(ua) && !isIOS;
export const isTouch = matchMedia('(pointer: coarse)').matches;
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function displayMode() {
  for (const m of ['window-controls-overlay', 'fullscreen', 'standalone', 'minimal-ui']) {
    if (matchMedia(`(display-mode: ${m})`).matches) return m;
  }
  return navigator.standalone === true ? 'standalone' : 'browser';
}
export const isStandalone = () => displayMode() !== 'browser';

export function platformName() {
  if (isIPhone) return 'iPhone';
  if (isIOS) return 'iPad';
  if (isAndroid) return 'Android';
  if (isWindows) return 'Windows';
  if (isMac) return 'Mac';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Appareil';
}
export function browserName() {
  if (isEdge) return 'Edge';
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome';
  if (/FxiOS|Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Navigateur';
}

/* ——— Stockage local (toujours protégé : navigation privée, stockage bloqué) ——— */
const NS = 'prisme:';
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(NS + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) { try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch { /* stockage indisponible */ } },
  clear() {
    try { Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k)); } catch { /* rien */ }
  },
};

/* ——— Réglages ——— */
const DEFAULTS = { quality: 'auto', haptics: true, fps: false };
export const settings = { ...DEFAULTS, ...store.get('settings', {}) };
const settingListeners = new Set();
export function setSetting(key, value) {
  settings[key] = value;
  store.set('settings', settings);
  settingListeners.forEach((fn) => fn(key, value));
}
export function onSetting(fn) { settingListeners.add(fn); return () => settingListeners.delete(fn); }

/** Niveau de qualité effectif : "high" ou "low". */
export function quality() {
  if (settings.quality !== 'auto') return settings.quality;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  return cores <= 2 || mem <= 2 ? 'low' : 'high';
}

/* ——— Haptique ———
   Android/Edge : Vibration API. iPhone (iOS 18+) : l'API n'existe pas, mais basculer un <input type=checkbox switch>
   natif déclenche le moteur Taptic ; on clique donc un interrupteur caché, dans le geste de l'utilisateur. */
let hapticLabel = null;
export function haptic(kind = 'light') {
  if (!settings.haptics) return;
  if (typeof navigator.vibrate === 'function' && !isIOS) {
    const pattern = { light: 6, medium: 12, heavy: 22, success: [8, 50, 12], error: [20, 40, 20, 40, 20] }[kind] ?? 8;
    try { navigator.vibrate(pattern); } catch { /* ignoré */ }
    return;
  }
  if (isIOS) {
    hapticLabel ??= document.getElementById('haptic-label');
    if (!hapticLabel) return;
    hapticLabel.click();
    if (kind === 'success' || kind === 'error') setTimeout(() => hapticLabel.click(), 90);
  }
}

/* ——— Boucle d'animation partagée ——— */
class Loop {
  constructor() {
    this.fns = new Set();
    this.running = false;
    this.last = 0;
    this.times = new Float32Array(120);
    this.ti = 0;
    this.tick = this.tick.bind(this);
  }
  add(fn) {
    this.fns.add(fn);
    if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame(this.tick); }
    return () => this.fns.delete(fn);
  }
  tick(now) {
    if (!this.fns.size) { this.running = false; return; }
    const raw = now - this.last;
    this.last = now;
    this.times[this.ti++ % this.times.length] = raw;
    const dt = Math.min(0.05, Math.max(0, raw / 1000));
    for (const fn of this.fns) {
      try { fn(now / 1000, dt); } catch (err) { console.error(err); this.fns.delete(fn); }
    }
    requestAnimationFrame(this.tick);
  }
  /** Durée moyenne d'image (ms) sur les n dernières images. */
  frameMs(n = 30) {
    const len = Math.min(n, this.ti, this.times.length);
    if (!len) return 16.7;
    let s = 0;
    for (let i = 1; i <= len; i++) s += this.times[(this.ti - i + this.times.length * 4) % this.times.length];
    return s / len;
  }
}
export const loop = new Loop();

/** Mesure la fréquence de rafraîchissement réelle (60, 90, 120 Hz…). */
export function measureRefreshRate(ms = 600) {
  return new Promise((resolve) => {
    const deltas = [];
    let last = 0;
    const start = performance.now();
    const step = (t) => {
      if (last) deltas.push(t - last);
      last = t;
      if (t - start < ms) requestAnimationFrame(step);
      else {
        deltas.sort((a, b) => a - b);
        const med = deltas[Math.floor(deltas.length / 2)] || 16.7;
        const hz = 1000 / med;
        const common = [30, 48, 60, 75, 90, 100, 120, 144, 165, 240];
        resolve(common.reduce((a, b) => (Math.abs(b - hz) < Math.abs(a - hz) ? b : a)));
      }
    };
    requestAnimationFrame(step);
  });
}

/* ——— DOM ——— */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const fmt = new Intl.NumberFormat('fr-FR');
export const fmt1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const fmt2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export function bytes(n) {
  if (!Number.isFinite(n)) return '—';
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${fmt1.format(n)} ${u[i]}`;
}
export const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ——— Notifications éphémères ——— */
export function toast(message, { type = 'ok', action, onAction, duration = 2800 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const btn = action ? h('button', { type: 'button' }, action) : null;
  const el = h('div', { class: `toast glass ${type}`, role: 'status' }, h('span', { class: 'ti' }), h('span', {}, message), btn);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  if (btn) btn.addEventListener('click', () => { close(); onAction?.(); });
  host.append(el);
  while (host.children.length > 3) host.firstChild.remove();
  if (duration !== Infinity) setTimeout(close, action ? Math.max(duration, 6000) : duration);
  return close;
}

/* ——— Enregistrer / partager un fichier ———
   iPhone : feuille de partage native (Enregistrer l'image, AirDrop…). Edge : sélecteur « Enregistrer sous ».
   Repli : téléchargement classique. */
export async function saveBlob(blob, filename, { title = 'Prisme' } = {}) {
  const file = new File([blob], filename, { type: blob.type });
  const share = async () => {
    await navigator.share({ files: [file], title });
    return 'shared';
  };
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try { return await share(); } catch (err) {
      if (err?.name === 'AbortError') return 'aborted';
      if (err?.name === 'NotAllowedError') {
        // L'activation utilisateur a expiré pendant l'encodage : on redemande un geste.
        toast('Image prête', { action: 'Partager', onAction: () => share().catch(() => {}) });
        return 'deferred';
      }
    }
  }
  if (window.showSaveFilePicker && !isTouch) {
    try {
      const ext = filename.split('.').pop();
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Fichier Prisme', accept: { [blob.type]: [`.${ext}`] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return 'saved';
    } catch (err) {
      if (err?.name === 'AbortError') return 'aborted';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export function canvasToBlob(canvas, type = 'image/png', q = 0.92) {
  return new Promise((resolve, reject) => {
    try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Capture vide'))), type, q); } catch (e) { reject(e); }
  });
}
export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

/* ——— Capteurs de mouvement ———
   iOS exige une autorisation explicite, demandée pendant un geste utilisateur. */
export async function requestMotion() {
  try {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      const state = await DOE.requestPermission();
      return state === 'granted';
    }
    return !!DOE;
  } catch {
    return false;
  }
}
/** Vérifie qu'un capteur émet vraiment (les PC exposent l'API sans matériel). */
export function probeOrientation(ms = 900) {
  return new Promise((resolve) => {
    let done = false;
    const on = (e) => {
      if (done || e.beta == null) return;
      done = true; window.removeEventListener('deviceorientation', on); resolve(true);
    };
    window.addEventListener('deviceorientation', on);
    setTimeout(() => { if (!done) { done = true; window.removeEventListener('deviceorientation', on); resolve(false); } }, ms);
  });
}

/* ——— Verrou de mise en veille de l'écran ——— */
let wakeLock = null;
let wantWake = false;
export async function keepAwake(on) {
  wantWake = on;
  try {
    if (on && 'wakeLock' in navigator && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* refusé : sans conséquence */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWake) keepAwake(true);
});

/* ——— Gestion commune des pointeurs (multi-touch, souris, stylet) ——— */
export function trackPointers(el, { down, move, up, wheel, pinch } = {}) {
  const active = new Map();
  let pinchStart = null;
  const rect = () => el.getBoundingClientRect();
  const norm = (e) => {
    const r = rect();
    return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height, type: e.pointerType, buttons: e.buttons, pressure: e.pressure || 0.5, shift: e.shiftKey };
  };
  const pinchState = () => {
    const pts = [...active.values()];
    if (pts.length < 2) return null;
    const [a, b] = pts;
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button > 2) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    const p = norm(e);
    p.button = e.button;
    active.set(e.pointerId, p);
    if (active.size === 2 && pinch) pinchStart = pinchState();
    down?.(p, active);
  };
  const onMove = (e) => {
    const p = norm(e);
    const prev = active.get(e.pointerId);
    if (prev) { p.button = prev.button; p.dx = p.x - prev.x; p.dy = p.y - prev.y; active.set(e.pointerId, p); } else { p.dx = e.movementX || 0; p.dy = e.movementY || 0; }
    if (active.size >= 2 && pinch && pinchStart) {
      const s = pinchState();
      pinch({ scale: s.dist / (pinchStart.dist || 1), dx: s.cx - pinchStart.cx, dy: s.cy - pinchStart.cy, cx: s.cx, cy: s.cy });
      pinchStart = s;
    }
    move?.(p, !!prev, active);
  };
  const onUp = (e) => {
    const p = active.get(e.pointerId);
    if (!p) return; // pointerup puis lostpointercapture : un seul relâchement
    active.delete(e.pointerId);
    if (active.size < 2) pinchStart = null;
    up?.(p, active);
  };
  const onWheel = (e) => { if (wheel) { e.preventDefault(); wheel(e); } };
  const prevent = (e) => e.preventDefault();
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('lostpointercapture', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', prevent);
  el.addEventListener('gesturestart', prevent); // Safari : empêche le zoom natif
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('lostpointercapture', onUp);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('contextmenu', prevent);
    el.removeEventListener('gesturestart', prevent);
  };
}

/** Observe la taille d'un élément et renvoie les dimensions en pixels CSS et physiques. */
export function observeSize(el, cb) {
  const ro = new ResizeObserver(() => {
    const r = el.getBoundingClientRect();
    cb(r.width, r.height, window.devicePixelRatio || 1);
  });
  ro.observe(el);
  return () => ro.disconnect();
}

/** HSV → RGB (0..1). */
export function hsv(hh, s, v) {
  const i = Math.floor(hh * 6);
  const f = hh * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
