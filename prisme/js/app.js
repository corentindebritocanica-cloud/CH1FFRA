// Prisme — coque de l'application : accueil, navigation, scène, réglages, installation, hors-ligne, clavier.
import {
  $, h, toast, haptic, loop, store, settings, setSetting, onSetting, quality, isIOS, isTouch, isEdge,
  displayMode, isStandalone, platformName, browserName, measureRefreshRate, keepAwake, saveBlob, stamp,
  stripAccents, requestMotion, bytes, reducedMotion,
} from './core/kit.js';
import { gpuName } from './core/gl.js';

const VERSION = '1.0.0';
// Aperçu intégré (claude.ai) : service worker, téléchargements, partage et installation y sont indisponibles.
const PREVIEW = !!window.PRISME_PREVIEW;

/* Les six rayons du prisme : chaque expérience porte sa longueur d'onde réelle. */
const MODULES = [
  {
    id: 'synthe', nm: 680, color: '#ff4d5e', name: 'Synthé', tag: 'Instrument génératif',
    desc: 'Synthèse polyphonique, réverbération à convolution et compositeur automatique.',
    badges: ['Web Audio', 'Multi-touch', 'MIDI'], load: () => import('./modules/synth.js'),
  },
  {
    id: 'fractale', nm: 610, color: '#ff8a3d', name: 'Fractale', tag: 'Mandelbulb en 3D',
    desc: 'Ray-marching temps réel, ombres douces et résolution adaptative.',
    badges: ['WebGL2', 'Ray-marching'], load: () => import('./modules/fractal.js'),
  },
  {
    id: 'vision', nm: 580, color: '#ffd23f', name: 'Vision', tag: 'Caméra augmentée',
    desc: 'Huit filtres GPU appliqués en direct à votre caméra, capture en un geste.',
    badges: ['Caméra', 'Shaders'], load: () => import('./modules/vision.js'),
  },
  {
    id: 'systeme', nm: 530, color: '#45e08a', name: 'Système', tag: "Radiographie de l'appareil",
    desc: 'Écran, GPU, capteurs, niveau à bulle, 60 API web et bancs d’essai.',
    badges: ['Workers', 'Capteurs', 'Bench'], load: () => import('./modules/system.js'),
  },
  {
    id: 'fluide', nm: 470, color: '#3db2ff', name: 'Fluide', tag: 'Mécanique des fluides',
    desc: 'Navier-Stokes résolu sur le GPU. Touchez, glissez, inclinez l’appareil.',
    badges: ['WebGL2', 'Gyroscope'], load: () => import('./modules/fluid.js'),
  },
  {
    id: 'nebuleuse', nm: 410, color: '#9b6bff', name: 'Nébuleuse', tag: 'Un million d’étoiles',
    desc: 'Particules calculées par compute shaders WebGPU, repli WebGL2.',
    badges: ['WebGPU', 'Compute'], load: () => import('./modules/galaxy.js'),
  },
];
const byId = Object.fromEntries(MODULES.map((m) => [m.id, m]));

const home = $('#home');
const stage = $('#stage');
const host = $('#stage-host');
const dockEl = $('#dock');

/* ——————————————————— Accueil ——————————————————— */

function artFor(id, c) {
  const svg = (inner) => `<svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${inner}</svg>`;
  switch (id) {
    case 'synthe': {
      let bars = '';
      for (let i = 0; i < 17; i++) {
        const x = 16 + i * 10.5;
        bars += `<rect x="${x}" y="22" width="5" height="78" rx="2.5" fill="${c}" opacity="${0.35 + (i % 5) * 0.12}" style="animation-delay:${(-i * 0.13).toFixed(2)}s;animation-duration:${(1.1 + (i % 4) * 0.25).toFixed(2)}s"/>`;
      }
      let d = 'M0 60';
      for (let x = 0; x <= 260; x += 4) d += ` L${x} ${(60 + Math.sin(x / 9) * 18 * Math.sin(x / 47)).toFixed(1)}`;
      return svg(`<g class="art-bars">${bars}</g><path class="art-wave" d="${d}" stroke="#fff" stroke-width="1.6" fill="none" opacity=".85"/>`);
    }
    case 'fractale': {
      let g = '';
      for (let i = 0; i < 7; i++) {
        const r = 52 - i * 7;
        g += `<rect x="${100 - r}" y="${60 - r}" width="${r * 2}" height="${r * 2}" rx="${4 + i}" fill="none" stroke="${c}" stroke-width="1.2" opacity="${0.25 + i * 0.1}" transform="rotate(${i * 12} 100 60)"/>`;
      }
      return svg(`<g class="art-spin">${g}</g><g class="art-spin rev"><circle cx="100" cy="60" r="10" fill="${c}" opacity=".9"/><circle cx="100" cy="60" r="22" fill="none" stroke="#fff" stroke-opacity=".3"/></g>`);
    }
    case 'vision': {
      let blades = '';
      for (let i = 0; i < 8; i++) blades += `<path d="M100 60 L${100 + 60 * Math.cos(i * 0.785)} ${60 + 60 * Math.sin(i * 0.785)} A60 60 0 0 1 ${100 + 60 * Math.cos(i * 0.785 + 0.9)} ${60 + 60 * Math.sin(i * 0.785 + 0.9)} Z" fill="${c}" opacity="${0.12 + (i % 3) * 0.1}" stroke="#000" stroke-width="1"/>`;
      return svg(`<g class="art-spin">${blades}</g><circle cx="100" cy="60" r="18" fill="#05060a" stroke="${c}" stroke-width="1.5"/><circle cx="94" cy="54" r="4" fill="#fff" opacity=".8"/>`);
    }
    case 'systeme': {
      let cells = '';
      for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) {
        const d = ((x * 7 + y * 13) % 11) * 0.21;
        cells += `<rect class="art-blink" x="${28 + x * 17}" y="${22 + y * 20}" width="12" height="12" rx="3" fill="${c}" style="animation-delay:${d.toFixed(2)}s"/>`;
      }
      return svg(cells);
    }
    case 'fluide':
      return svg(`<defs><filter id="blur-f"><feGaussianBlur stdDeviation="9"/></filter></defs><g filter="url(#blur-f)">
        <circle class="art-blob" cx="70" cy="62" r="30" fill="${c}"/><circle class="art-blob" style="animation-delay:-3s" cx="128" cy="52" r="26" fill="#9b6bff"/>
        <circle class="art-blob" style="animation-delay:-6s" cx="104" cy="82" r="20" fill="#fff" opacity=".7"/></g>`);
    case 'nebuleuse': {
      let dots = '';
      for (let i = 0; i < 180; i++) {
        const arm = i % 3;
        const t = (i / 180) * 3.2;
        const r = 6 + t * 18;
        const a = t * 1.6 + (arm * Math.PI * 2) / 3;
        const j = Math.sin(i * 12.9898) * 4;
        dots += `<circle cx="${(100 + Math.cos(a) * r + j).toFixed(1)}" cy="${(60 + Math.sin(a) * r * 0.62 + j * 0.5).toFixed(1)}" r="${(1.6 - t * 0.3).toFixed(2)}" fill="${i % 7 ? c : '#fff'}" opacity="${(1 - t / 3.6).toFixed(2)}"/>`;
      }
      return svg(`<g class="art-spin" style="transform-origin:100px 60px">${dots}</g><circle cx="100" cy="60" r="7" fill="#fff" opacity=".9"/>`);
    }
    default: return '';
  }
}

function renderGrid() {
  const grid = $('#grid');
  grid.replaceChildren(...MODULES.map((m, i) => {
    const card = h('button', {
      class: 'card', type: 'button', 'data-id': m.id, style: { '--c': m.color },
      'aria-label': `${m.name} : ${m.tag}. Touche ${i + 1}.`,
    },
    h('span', { class: 'card-top mono' },
      h('span', { class: 'card-nm' }, `λ ${m.nm} nm`),
      h('kbd', { class: 'card-key only-desktop' }, String(i + 1))),
    h('span', { class: 'card-art', html: artFor(m.id, m.color) }),
    h('span', { class: 'card-name' }, m.name),
    h('span', { class: 'card-tag' }, m.tag),
    h('span', { class: 'card-desc' }, m.desc),
    h('span', { class: 'badges' }, m.badges.map((b) => h('span', { class: 'badge', 'data-badge': b }, b))));
    card.addEventListener('click', () => { haptic('light'); open(m.id, card); });
    card.addEventListener('pointerenter', () => m.load().catch(() => {}), { once: true });
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
      card.style.setProperty('--rx', `${(0.5 - py) * 7}deg`);
      card.style.setProperty('--ry', `${(px - 0.5) * 9}deg`);
    });
    card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
    return card;
  }));
}

/* Le faisceau : lumière blanche → prisme → six rayons cliquables. */
function renderBeam() {
  const el = $('#beam');
  const W = 1000, H = 220;
  const apex = [430, 18], bl = [352, 196], br = [508, 196];
  const entry = [392, 118], exitX = 470;
  let rays = '';
  MODULES.forEach((m, i) => {
    const y0 = 112 + i * 3.2;
    const y1 = 14 + i * 38.4;
    const d = `M${exitX} ${y0} L${W} ${y1}`;
    rays += `<g data-id="${m.id}" role="link" aria-label="Ouvrir ${m.name}">
      <path class="ray-glow" d="${d}" stroke="${m.color}"/>
      <path class="ray" d="${d}" stroke="${m.color}"/>
      <path class="ray-pulse" d="${d}" stroke="#fff" style="animation-delay:${(-i * 0.55).toFixed(2)}s"/>
      <path class="ray-hit" d="${d}"/>
      <text class="ray-label" x="${W - 6}" y="${y1 - 7}" text-anchor="end">${m.nm} nm · ${m.name}</text>
    </g>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="prism-fill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".6" stop-color="#9ab" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".12"/>
    </linearGradient></defs>
    <path class="incoming-glow" d="M0 132 L${entry[0]} ${entry[1]}"/>
    <path class="incoming" d="M0 132 L${entry[0]} ${entry[1]}"/>
    ${rays}
    <path d="M${entry[0]} ${entry[1]} L${exitX} ${112}" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none"/>
    <path class="prism" d="M${apex} L${br} L${bl} Z"/>
    <path d="M${apex} L460 196 L${br} Z" fill="#c7b8ff" fill-opacity=".06"/>
    <path d="M${apex} L460 196" stroke="#fff" stroke-opacity=".28" stroke-width="1"/>
  </svg>`;
  el.querySelectorAll('g[data-id]').forEach((g) => {
    const id = g.dataset.id;
    const card = () => document.querySelector(`.card[data-id="${id}"]`);
    g.addEventListener('pointerenter', () => { g.classList.add('on'); card()?.style.setProperty('border-color', byId[id].color); });
    g.addEventListener('pointerleave', () => { g.classList.remove('on'); card()?.style.removeProperty('border-color'); });
    g.addEventListener('click', () => { haptic('light'); open(id, card()); });
  });
}

/* Ligne de détection de l'appareil, en tête de page. */
let deviceInfo = { hz: 60, gpu: null, webgpu: false };
async function detectDevice() {
  const line = $('#device-line');
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  deviceInfo.gpu = gpuName(gl);
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  deviceInfo.webgpu = !!navigator.gpu;
  if (navigator.gpu) {
    try { deviceInfo.webgpu = !!(await navigator.gpu.requestAdapter()); } catch { deviceInfo.webgpu = false; }
  }
  deviceInfo.hz = await measureRefreshRate();
  const dpr = window.devicePixelRatio || 1;
  const parts = [
    `<b>${platformName()}</b>`,
    `${screen.width}×${screen.height} @${Math.round(dpr * 100) / 100}x`,
    `${deviceInfo.hz} Hz`,
    deviceInfo.gpu ? deviceInfo.gpu : null,
    deviceInfo.webgpu ? 'WebGPU ✓' : 'WebGL2',
    isStandalone() ? 'App installée' : browserName(),
  ].filter(Boolean);
  line.innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
  document.querySelectorAll('[data-badge="WebGPU"]').forEach((b) => b.classList.add(deviceInfo.webgpu ? 'ok' : 'no'));
  document.querySelectorAll('[data-badge="MIDI"]').forEach((b) => b.classList.toggle('no', !navigator.requestMIDIAccess));
}

/* ——————————————————— Scène ——————————————————— */

let current = null; // { meta, instance, cleanups, card }
let opening = false;

function createDock() {
  dockEl.replaceChildren();
  let row = null;
  const ensure = () => { if (!row) { row = h('div', { class: 'dock-row' }); dockEl.append(row); } return row; };
  const api = {
    row({ wrap = false } = {}) { row = h('div', { class: `dock-row${wrap ? ' wrap' : ''}` }); dockEl.append(row); return api; },
    label(text) { ensure().append(h('span', { class: 'seg-label' }, text)); return api; },
    segment(options, value, onChange, { label } = {}) {
      const r = ensure();
      if (label) r.append(h('span', { class: 'seg-label' }, label));
      const group = h('div', { role: 'radiogroup', 'aria-label': label || 'Choix', style: { display: 'contents' } });
      const buttons = options.map((o) => {
        const b = h('button', { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(o.value === value) },
          o.color ? h('span', { class: 'dot', style: { background: o.color, opacity: 1 } }) : null, o.label);
        b.addEventListener('click', () => { set(o.value); haptic('light'); onChange(o.value); });
        return b;
      });
      const set = (v) => buttons.forEach((b, i) => b.setAttribute('aria-checked', String(options[i].value === v)));
      group.append(...buttons);
      r.append(group);
      return { set };
    },
    toggle(label, value, onChange, { cls = '' } = {}) {
      const b = h('button', { class: `chip ${cls}`, type: 'button', 'aria-pressed': String(!!value) }, h('span', { class: 'dot' }), label);
      let state = !!value;
      const set = (v) => { state = !!v; b.setAttribute('aria-pressed', String(state)); };
      b.addEventListener('click', async () => {
        haptic('light');
        const next = !state;
        const res = await onChange(next);
        set(res === undefined ? next : res);
      });
      ensure().append(b);
      return { set, get: () => state, el: b };
    },
    button(label, onClick, { accent } = {}) {
      const b = h('button', { class: 'chip', type: 'button', style: accent ? { color: accent } : null }, label);
      b.addEventListener('click', () => { haptic('light'); onClick(); });
      ensure().append(b);
      return { el: b, setLabel: (t) => { b.textContent = t; } };
    },
    slider(label, { min = 0, max = 1, step = 0.01, value = 0.5, format = (v) => v } = {}, onInput) {
      const id = `sl-${label.replace(/\W+/g, '').toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`;
      const input = h('input', { type: 'range', id, min, max, step, value });
      const out = h('output', { for: id }, format(+value));
      const paint = () => input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`);
      input.addEventListener('input', () => { out.textContent = format(+input.value); paint(); onInput(+input.value); });
      paint();
      ensure().append(h('div', { class: 'slider' }, h('label', { for: id }, label), input, out));
      return { set: (v) => { input.value = v; out.textContent = format(+v); paint(); } };
    },
  };
  return api;
}

/** Signale les rangées de commandes qui débordent (dégradé de fin pour inviter à faire défiler). */
function markScrollingRows() {
  requestAnimationFrame(() => {
    dockEl.querySelectorAll('.dock-row').forEach((r) => {
      const update = () => r.classList.toggle('scrolls', r.scrollWidth > r.clientWidth + 2 && r.scrollLeft + r.clientWidth < r.scrollWidth - 4);
      update();
      r.addEventListener('scroll', update, { passive: true });
    });
  });
}
addEventListener('resize', () => markScrollingRows());

function makeContext(meta) {
  const cleanups = [];
  return {
    ctx: {
      id: meta.id,
      color: meta.color,
      host,
      dock: createDock(),
      setStatus: (text) => { $('#stage-status').textContent = text || ''; },
      toast, haptic, loop, settings, isIOS, isTouch,
      quality: quality(),
      preview: PREVIEW,
      requestMotion,
      onCleanup: (fn) => cleanups.push(fn),
      hint(title, text) {
        const el = h('div', { class: 'hint' }, h('strong', {}, title), text);
        host.append(el);
        let gone = false;
        const hide = () => { if (!gone) { gone = true; el.classList.add('gone'); setTimeout(() => el.remove(), 700); } };
        host.addEventListener('pointerdown', hide, { once: true });
        setTimeout(hide, 5200);
        return hide;
      },
      remount: () => remount(),
    },
    cleanups,
  };
}

async function mount(meta) {
  host.replaceChildren();
  $('#stage-title').textContent = meta.name;
  $('#stage-status').textContent = 'Chargement…';
  stage.style.setProperty('--accent', meta.color);
  const { ctx, cleanups } = makeContext(meta);
  try {
    const mod = await meta.load();
    const instance = await mod.create(ctx);
    $('#btn-capture').hidden = PREVIEW || !instance?.capture;
    markScrollingRows();
    return { meta, instance, cleanups, info: mod.info };
  } catch (err) {
    console.error(err);
    cleanups.forEach((fn) => { try { fn(); } catch { /* ignoré */ } });
    host.replaceChildren(h('div', { class: 'hint' }, h('strong', {}, 'Indisponible sur cet appareil'), String(err?.message || err)));
    $('#stage-status').textContent = 'Erreur';
    return { meta, instance: null, cleanups: [], info: null };
  }
}

function unmount() {
  if (!current) return;
  try { current.instance?.destroy?.(); } catch (e) { console.error(e); }
  current.cleanups.forEach((fn) => { try { fn(); } catch { /* ignoré */ } });
  host.replaceChildren();
  dockEl.replaceChildren();
}

async function remount() {
  if (!current) return;
  const { meta, card } = current;
  unmount();
  current = { ...(await mount(meta)), card };
}

function withTransition(update, card) {
  if (!document.startViewTransition || reducedMotion.matches) { update(); return Promise.resolve(); }
  if (card) card.style.viewTransitionName = 'hero-card';
  const t = document.startViewTransition(() => {
    if (card) card.style.viewTransitionName = '';
    stage.style.viewTransitionName = card ? 'hero-card' : '';
    update();
  });
  return t.finished.finally(() => { stage.style.viewTransitionName = ''; });
}

let navSeq = 0; // chaque navigation invalide les chargements en cours

async function open(id, card, { push = true } = {}) {
  const meta = byId[id];
  if (!meta || opening) return;
  if (current?.meta.id === id) return;
  opening = true;
  const seq = ++navSeq;
  closeSheet(true);
  closePalette();
  if (current) { unmount(); current = null; }
  card ??= document.querySelector(`.card[data-id="${id}"]`);
  meta.load().catch(() => {});
  if (push && location.hash !== `#${id}`) history.pushState({ id }, '', `#${id}`);
  await withTransition(() => {
    home.hidden = true;
    stage.hidden = false;
    stage.classList.remove('immersive');
    $('#btn-reveal').hidden = true;
    $('#stage-title').textContent = meta.name;
  }, card);
  if (seq !== navSeq) { opening = false; return; }
  const mounted = { ...(await mount(meta)), card };
  opening = false;
  if (seq !== navSeq) {
    // Retour demandé pendant le chargement : on libère aussitôt le module.
    current = mounted;
    unmount();
    current = null;
    return;
  }
  current = mounted;
  keepAwake(true);
  document.title = `${meta.name} · Prisme`;
}

async function close({ fromPop = false } = {}) {
  if (!current && !opening) return;
  navSeq++;
  const card = current?.card;
  if (current) unmount();
  current = null;
  keepAwake(false);
  closeSheet(true);
  await withTransition(() => {
    stage.hidden = true;
    home.hidden = false;
  }, null);
  if (card) {
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest' });
  }
  if (!fromPop && location.hash) history.replaceState(null, '', location.pathname + location.search);
  document.title = 'Prisme';
}

window.addEventListener('popstate', () => {
  const id = location.hash.slice(1);
  if (byId[id]) open(id, null, { push: false });
  else if (current || opening) close({ fromPop: true });
});

$('#btn-back').addEventListener('click', () => { haptic('light'); if (history.state?.id) history.back(); else close(); });
$('#btn-info').addEventListener('click', () => {
  if (!current?.info) return;
  openSheet(current.info.title || current.meta.name, current.info.html);
});
$('#btn-capture').addEventListener('click', () => capture());
$('#btn-immersive').addEventListener('click', () => setImmersive(true));
$('#btn-reveal').addEventListener('click', () => setImmersive(false));

function setImmersive(on) {
  stage.classList.toggle('immersive', on);
  $('#btn-reveal').hidden = !on;
  if (on) toast('Interface masquée · touchez « Afficher » pour revenir', { duration: 2000 });
}

async function capture() {
  if (PREVIEW) { toast('Capture disponible dans l’app installée', { type: 'warn' }); return; }
  if (!current?.instance?.capture) { toast('Capture indisponible ici', { type: 'warn' }); return; }
  const flash = $('#flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');
  haptic('medium');
  try {
    const blob = await current.instance.capture();
    const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
    const res = await saveBlob(blob, `prisme-${current.meta.id}-${stamp()}.${ext}`, { title: `Prisme · ${current.meta.name}` });
    if (res === 'saved' || res === 'downloaded') toast('Image enregistrée');
  } catch (err) {
    console.error(err);
    toast('La capture a échoué', { type: 'error' });
  }
}

/* ——————————————————— Feuille modale ——————————————————— */

const sheet = $('#sheet');
const backdrop = $('#sheet-backdrop');
let sheetReturnFocus = null;
let sheetTimer = 0;
const sheetOpen = () => !sheet.hidden && !sheet.classList.contains('closing');
function openSheet(title, content) {
  clearTimeout(sheetTimer);
  if (!sheetOpen()) sheetReturnFocus = document.activeElement;
  $('#sheet-title').textContent = title;
  const body = $('#sheet-body');
  body.replaceChildren();
  if (typeof content === 'string') body.innerHTML = content; else body.append(content);
  sheet.classList.remove('closing');
  sheet.hidden = false;
  backdrop.hidden = false;
  $('#sheet-close').focus({ preventScroll: true });
}
function closeSheet(instant = false) {
  if (sheet.hidden) return;
  clearTimeout(sheetTimer);
  const done = () => { sheet.hidden = true; backdrop.hidden = true; sheet.classList.remove('closing'); sheetReturnFocus?.focus?.({ preventScroll: true }); };
  if (instant || reducedMotion.matches) { done(); return; }
  sheet.classList.add('closing');
  sheetTimer = setTimeout(done, 240);
}
$('#sheet-close').addEventListener('click', () => closeSheet());
backdrop.addEventListener('click', () => closeSheet());
// Glisser la feuille vers le bas pour la fermer (téléphone)
{
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => { if ($('#sheet-body').scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) sheet.style.transform = `translate(-50%, ${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    sheet.style.transform = '';
    if (dy > 110 && innerWidth < 700) closeSheet();
  });
}

/* ——————————————————— Réglages ——————————————————— */

function settingsView() {
  const wrap = h('div', { style: { display: 'grid', gap: '12px' } });
  const seg = (key, opts) => {
    const g = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': key });
    opts.forEach(([v, label]) => {
      const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(settings[key] === v) }, label);
      b.addEventListener('click', () => {
        setSetting(key, v);
        g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        haptic('light');
      });
      g.append(b);
    });
    return g;
  };
  const tog = (key, id) => {
    const input = h('input', { type: 'checkbox', class: 'toggle', id, role: 'switch' });
    input.checked = !!settings[key];
    input.addEventListener('change', () => { setSetting(key, input.checked); haptic('light'); });
    return input;
  };
  const row = (title, sub, control, forId) => h('div', { class: 'row' },
    h(forId ? 'label' : 'div', { class: 'row-text', for: forId }, h('b', {}, title), sub ? h('span', {}, sub) : null), control);

  wrap.append(
    h('h3', {}, 'Affichage'),
    row('Qualité graphique', 'Auto adapte la résolution à votre appareil.', seg('quality', [['auto', 'Auto'], ['high', 'Élevée'], ['low', 'Éco']])),
    row('Compteur d’images', 'Images par seconde et durée de rendu.', tog('fps', 'set-fps'), 'set-fps'),
    h('h3', {}, 'Toucher'),
    row('Retour haptique', isIOS ? 'Moteur Taptic (iOS 18 ou plus récent).' : 'Vibrations sur les appareils compatibles.', tog('haptics', 'set-haptics'), 'set-haptics'),
  );

  const installRow = h('div', { class: 'row' },
    h('div', { class: 'row-text' }, h('b', {}, 'Application'), h('span', {}, PREVIEW
      ? 'Aperçu dans claude.ai. Publiez Prisme sur GitHub Pages pour l’installer (voir le README).'
      : isStandalone() ? `Installée · mode ${displayMode()}` : 'Ajoutez Prisme à votre écran d’accueil.')));
  if (!isStandalone() && !PREVIEW) {
    const b = h('button', { class: 'btn primary', type: 'button' }, 'Installer');
    b.addEventListener('click', () => install());
    installRow.append(b);
  }
  const swRow = h('div', { class: 'row' },
    h('div', { class: 'row-text' }, h('b', {}, 'Mode hors-ligne'), h('span', { id: 'set-sw' }, $('#sw-status').textContent)));
  if ('serviceWorker' in navigator) {
    const b = h('button', { class: 'btn', type: 'button' }, 'Vérifier');
    b.addEventListener('click', async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) { toast('Service worker indisponible', { type: 'warn' }); return; }
      await reg.update().catch(() => {});
      toast(reg.installing || reg.waiting ? 'Mise à jour en cours…' : 'Prisme est à jour');
    });
    swRow.append(b);
  }
  const storageLine = h('span', {}, 'Calcul…');
  navigator.storage?.estimate?.().then((e) => { storageLine.textContent = `${bytes(e.usage)} utilisés sur ${bytes(e.quota)} disponibles`; }).catch(() => { storageLine.textContent = 'Estimation indisponible'; });
  let armed = false;
  const reset = h('button', { class: 'btn danger', type: 'button' }, 'Effacer');
  reset.addEventListener('click', async () => {
    if (!armed) { armed = true; reset.textContent = 'Confirmer'; haptic('medium'); setTimeout(() => { armed = false; reset.textContent = 'Effacer'; }, 4000); return; }
    store.clear();
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
      await Promise.all(regs.map((r) => r.unregister()));
    } catch { /* ignoré */ }
    location.reload();
  });
  wrap.append(
    h('h3', {}, 'Application'), installRow, swRow,
    row('Données locales', null, reset),
    h('p', { class: 'muted' }, storageLine),
    h('h3', {}, 'À propos'),
    h('p', { class: 'muted' }, `Prisme ${VERSION} · HTML, CSS et JavaScript sans dépendance. Polices Unbounded et JetBrains Mono (licence SIL OFL). Aucune donnée ne quitte l’appareil.`),
  );
  return wrap;
}
$('#btn-settings').addEventListener('click', () => { haptic('light'); openSheet('Réglages', settingsView()); });

onSetting((key) => {
  if (key === 'fps') updateFpsHud();
  if (key === 'quality' && current) { remount(); toast('Qualité appliquée'); }
});

/* ——————————————————— Installation ——————————————————— */

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  if (PREVIEW) return;
  e.preventDefault();
  deferredPrompt = e;
  $('#btn-install').hidden = false;
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  $('#btn-install').hidden = true;
  toast('Prisme est installée', { duration: 3500 });
  haptic('success');
});
if (isIOS && !isStandalone() && !PREVIEW) $('#btn-install').hidden = false;
$('#btn-install').addEventListener('click', () => install());

async function install() {
  haptic('light');
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (outcome === 'accepted') $('#btn-install').hidden = true;
    deferredPrompt = null;
    return;
  }
  const share = '<svg class="inline-ico"><use href="#i-share"/></svg>';
  const html = isIOS
    ? `<p>Installée, Prisme s’ouvre en plein écran comme une app native, sans barre Safari, et fonctionne hors-ligne.</p>
       <ol class="steps">
         <li><span>Touchez ${share} <b>Partager</b>. Sur iOS 26, il se trouve dans le menu <b>•••</b> à côté de la barre d’adresse.</span></li>
         <li><span>Faites défiler et choisissez <b>Sur l’écran d’accueil</b>.</span></li>
         <li><span>Laissez <b>Ouvrir comme app web</b> activé, puis touchez <b>Ajouter</b>.</span></li>
       </ol>
       <p class="muted">L’icône Prisme apparaît sur votre écran d’accueil, avec son écran de lancement.</p>`
    : `<p>Installée, Prisme s’ouvre dans sa propre fenêtre, apparaît dans le menu Démarrer et fonctionne hors-ligne.</p>
       <ol class="steps">
         <li><span>Dans ${isEdge ? 'Edge' : 'votre navigateur'}, ouvrez le menu <b>···</b> en haut à droite.</span></li>
         <li><span>Choisissez <b>Applications</b>, puis <b>Installer Prisme</b>. Vous pouvez aussi cliquer l’icône d’installation dans la barre d’adresse.</span></li>
         <li><span>Confirmez avec <b>Installer</b>. Vous pourrez l’épingler à la barre des tâches.</span></li>
       </ol>
       <p class="muted">L’installation nécessite une adresse HTTPS (GitHub Pages, par exemple).</p>`;
  openSheet('Installer Prisme', html);
}

/* ——————————————————— Hors-ligne (service worker) ——————————————————— */

function setSwStatus(state, text) {
  const el = $('#sw-status');
  el.dataset.state = state;
  el.textContent = text;
  const s = document.getElementById('set-sw');
  if (s) s.textContent = text;
}
async function registerSW() {
  if (PREVIEW) { setSwStatus('pending', 'Aperçu · hors-ligne une fois installée'); return; }
  if (!('serviceWorker' in navigator)) { setSwStatus('error', 'Hors-ligne indisponible'); return; }
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    const ready = () => setSwStatus(navigator.onLine ? 'ready' : 'offline', navigator.onLine ? 'Disponible hors-ligne' : 'Hors-ligne · tout fonctionne');
    if (reg.active) ready();
    navigator.serviceWorker.ready.then(ready);
    // Mise à jour : la nouvelle version attend l'accord de l'utilisateur, puis on recharge une seule fois.
    let accepted = false;
    const offer = (worker) => toast('Nouvelle version de Prisme prête', {
      action: 'Recharger', duration: Infinity,
      onAction: () => { accepted = true; worker.postMessage('skip-waiting'); },
    });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (accepted) location.reload(); });
  } catch (err) {
    console.warn('Service worker', err);
    setSwStatus('error', 'Hors-ligne indisponible ici');
  }
}
window.addEventListener('online', () => { setSwStatus('ready', 'Disponible hors-ligne'); toast('Connexion rétablie'); });
window.addEventListener('offline', () => { setSwStatus('offline', 'Hors-ligne · tout fonctionne'); toast('Hors-ligne : Prisme continue de fonctionner', { type: 'warn' }); });

/* ——————————————————— Compteur d'images ——————————————————— */

let fpsOff = null;
function updateFpsHud() {
  const hud = $('#fps-hud');
  hud.hidden = !settings.fps;
  fpsOff?.();
  fpsOff = null;
  if (!settings.fps) return;
  const cv = $('#fps-canvas');
  const cx = cv.getContext('2d');
  const hist = new Float32Array(60);
  let i = 0, acc = 0;
  fpsOff = loop.add((t, dt) => {
    hist[i++ % 60] = dt * 1000;
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    const ms = loop.frameMs(30);
    $('#fps-text').textContent = `${Math.round(1000 / ms)} ips · ${ms.toFixed(1)} ms`;
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.fillStyle = 'rgba(69,224,138,.9)';
    for (let k = 0; k < 60; k++) {
      const v = hist[(i + k) % 60];
      const hgt = Math.min(cv.height, (v / 50) * cv.height);
      cx.fillStyle = v > 20 ? 'rgba(255,77,94,.95)' : 'rgba(69,224,138,.9)';
      cx.fillRect(k * 2, cv.height - hgt, 1.4, hgt);
    }
  });
}

/* ——————————————————— Palette de commandes & clavier ——————————————————— */

const palette = $('#palette');
const pInput = $('#palette-input');
const pList = $('#palette-list');
let pItems = [];
let pSel = 0;

function commands() {
  const list = MODULES.map((m, i) => ({ label: `Ouvrir ${m.name}`, sub: m.tag, key: String(i + 1), color: m.color, run: () => open(m.id) }));
  if (current) {
    list.push({ label: 'Retour à l’accueil', key: 'Échap', run: () => close() });
    if (!PREVIEW) list.push({ label: 'Capturer l’image', key: 'S', run: () => capture() });
    list.push({ label: 'Masquer l’interface', key: 'H', run: () => setImmersive(true) });
    list.push({ label: 'Comment ça marche', run: () => $('#btn-info').click() });
  }
  list.push({ label: settings.fps ? 'Masquer le compteur d’images' : 'Afficher le compteur d’images', key: 'P', run: () => setSetting('fps', !settings.fps) });
  list.push({ label: 'Réglages', run: () => $('#btn-settings').click() });
  if (document.fullscreenEnabled) list.push({ label: document.fullscreenElement ? 'Quitter le plein écran' : 'Plein écran', key: 'F', run: () => toggleFullscreen() });
  if (!isStandalone() && !PREVIEW) list.push({ label: 'Installer l’application', run: () => install() });
  list.push({ label: 'Raccourcis clavier', key: '?', run: () => showHelp() });
  return list;
}
function renderPalette() {
  const q = stripAccents(pInput.value.trim());
  pItems = commands().filter((c) => !q || stripAccents(`${c.label} ${c.sub || ''}`).includes(q));
  pSel = Math.min(pSel, Math.max(0, pItems.length - 1));
  pList.replaceChildren(...pItems.map((c, i) => {
    const li = h('li', { role: 'option', 'aria-selected': String(i === pSel), id: `pc-${i}` },
      h('span', { class: 'sw', style: { background: c.color || 'rgba(255,255,255,.25)' } }), c.label,
      c.key ? h('span', { class: 'hint-k' }, c.key) : null);
    li.addEventListener('click', () => runCommand(i));
    li.addEventListener('pointermove', () => { if (pSel !== i) { pSel = i; renderPalette(); } });
    return li;
  }));
  pInput.setAttribute('aria-activedescendant', `pc-${pSel}`);
}
function runCommand(i) { const c = pItems[i]; closePalette(); c?.run(); }
function openPalette() { palette.hidden = false; pInput.value = ''; pSel = 0; renderPalette(); pInput.focus(); }
function closePalette() { palette.hidden = true; }
$('#btn-palette').addEventListener('click', openPalette);
palette.addEventListener('click', (e) => { if (e.target === palette) closePalette(); });
pInput.addEventListener('input', () => { pSel = 0; renderPalette(); });
pInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { pSel = (pSel + 1) % Math.max(1, pItems.length); renderPalette(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { pSel = (pSel - 1 + pItems.length) % Math.max(1, pItems.length); renderPalette(); e.preventDefault(); }
  else if (e.key === 'Enter') { runCommand(pSel); e.preventDefault(); }
  else if (e.key === 'Escape') { closePalette(); e.preventDefault(); }
});

function toggleFullscreen() {
  if (!document.fullscreenEnabled) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

function showHelp() {
  const extra = current?.instance?.shortcuts || [];
  const rows = [
    ['1 – 6', 'Ouvrir une expérience'], ['Échap', 'Retour à l’accueil'], ['Ctrl + K', 'Palette de commandes'],
    ['S', 'Capturer l’image'], ['H', 'Masquer l’interface'], ['F', 'Plein écran'], ['P', 'Compteur d’images'], ['?', 'Cette aide'],
    ...extra,
  ];
  openSheet('Raccourcis clavier', `<dl class="kv">${rows.map(([k, v]) => `<dt>${v}</dt><dd><kbd>${k}</kbd></dd>`).join('')}</dl>`);
}

document.addEventListener('keydown', (e) => {
  if (!palette.hidden) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (e.key === 'Escape') {
    if (sheetOpen()) { closeSheet(); return; }
    if (stage.classList.contains('immersive')) { setImmersive(false); return; }
    if (current) { $('#btn-back').click(); return; }
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || sheetOpen()) return;
  if (current?.instance?.key?.(e)) { e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  if (/^[1-6]$/.test(e.key)) { open(MODULES[+e.key - 1].id); e.preventDefault(); }
  else if (k === 's' && current) capture();
  else if (k === 'h' && current) setImmersive(!stage.classList.contains('immersive'));
  else if (k === 'f') toggleFullscreen();
  else if (k === 'p') setSetting('fps', !settings.fps);
  else if (e.key === '?') showHelp();
});
// Le déclencheur haptique ne doit jamais propager son clic à l'application.
$('#haptic-label').addEventListener('click', (e) => e.stopPropagation());

/* ——————————————————— Démarrage ——————————————————— */

function boot() {
  renderBeam();
  renderGrid();
  updateFpsHud();
  $('#app-version').textContent = `v${VERSION}`;
  const splash = $('#splash');
  let seenThisSession = false;
  try { seenThisSession = !!sessionStorage.getItem('prisme-splash'); sessionStorage.setItem('prisme-splash', '1'); } catch { /* stockage bloqué */ }
  if (store.get('seen-splash', false) && seenThisSession) splash.classList.add('skip');
  store.set('seen-splash', true);
  setTimeout(() => splash.remove(), 1800);
  const id = location.hash.slice(1);
  if (byId[id]) {
    history.replaceState(null, '', location.pathname + location.search);
    open(id);
  }
  // Ne pas concurrencer l'écran de lancement pour la mesure du rafraîchissement.
  setTimeout(detectDevice, 400);
  registerSW();
  // Demande de stockage persistant (évite l'éviction du cache hors-ligne sur iOS)
  if (isStandalone()) navigator.storage?.persist?.().catch(() => {});
  // Pastille d'app (Badging API) effacée à l'ouverture
  navigator.clearAppBadge?.().catch?.(() => {});
}

// iOS : empêcher le zoom par double-tap / pincement sur l'interface
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => { if (e.target.closest('.stage')) e.preventDefault(); }, { passive: false });

boot();
