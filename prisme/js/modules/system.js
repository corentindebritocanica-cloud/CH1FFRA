// Système — radiographie de l'appareil : rafraîchissement mesuré, écran, zones sûres, GPU (WebGL2 et WebGPU),
// capteurs de mouvement avec niveau à bulle, bancs d'essai processeur (Web Workers) et GPU (compute shader),
// stockage, réseau et inventaire de plus de 50 API web.
import { h, fmt, fmt1, fmt2, bytes, displayMode, platformName, browserName, probeOrientation, isIOS } from '../core/kit.js';
import { gpuName } from '../core/gl.js';

export const info = {
  title: 'Système · comment ça marche',
  html: `<p>Ce tableau de bord interroge directement le navigateur. Rien n’est estimé à partir d’une base de données : chaque valeur est <b>mesurée ou détectée</b> sur votre appareil.</p>
  <ul>
    <li><b>Rafraîchissement</b> : durée médiane entre deux images d’animation.</li>
    <li><b>Processeur</b> : l’ensemble de Mandelbrot est calculé pendant 1,5 s sur un cœur, puis sur tous les cœurs en parallèle avec des <b>Web Workers</b>.</li>
    <li><b>GPU</b> : un compute shader WebGPU enchaîne des multiplications-additions fusionnées sur des millions de fils d’exécution pour estimer la puissance de calcul en GFLOPS. Repli WebGL2 si besoin.</li>
    <li><b>Capteurs</b> : orientation et accélération, avec un niveau à bulle utilisable pour de vrai.</li>
  </ul>
  <p>Le bouton <b>Écouter</b> lit un résumé avec la synthèse vocale du système.</p>`,
};

function features() {
  const cv = document.createElement('canvas');
  const css = (p) => { try { return CSS.supports(p); } catch { return false; } };
  const cssKV = (k, v) => { try { return CSS.supports(k, v); } catch { return false; } };
  let simd = false;
  try { simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch { simd = false; }
  const list = [
    ['Graphismes', [
      ['WebGPU', 'gpu' in navigator], ['WebGL 2', !!cv.getContext('webgl2')], ['OffscreenCanvas', 'OffscreenCanvas' in window],
      ['WebCodecs', 'VideoEncoder' in window], ['Couleurs P3', cssKV('color', 'color(display-p3 1 0 0)')], ['WebXR', 'xr' in navigator],
    ]],
    ['Calcul', [
      ['WebAssembly', typeof WebAssembly === 'object'], ['Wasm SIMD', simd], ['Web Workers', 'Worker' in window],
      ['SharedWorker', 'SharedWorker' in window], ['Mémoire partagée', typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated === true],
      ['Compression Streams', 'CompressionStream' in window], ['Web Locks', !!navigator.locks], ['Intl.Segmenter', 'Segmenter' in Intl],
    ]],
    ['Son et médias', [
      ['Web Audio', 'AudioContext' in window || 'webkitAudioContext' in window], ['AudioWorklet', 'AudioWorkletNode' in window],
      ['Web MIDI', 'requestMIDIAccess' in navigator], ['MediaRecorder', 'MediaRecorder' in window], ['Synthèse vocale', 'speechSynthesis' in window],
      ['Reconnaissance vocale', 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window], ['Media Session', 'mediaSession' in navigator],
      ['Image dans l’image', !!document.pictureInPictureEnabled], ['Audio Session (iOS)', 'audioSession' in navigator],
    ]],
    ['Application', [
      ['Service Worker', 'serviceWorker' in navigator], ['Notifications push', 'PushManager' in window], ['Notifications', 'Notification' in window],
      ['Pastille d’icône', 'setAppBadge' in navigator], ['Partage', 'share' in navigator], ['Verrou d’écran', 'wakeLock' in navigator],
      ['Window Controls Overlay', 'windowControlsOverlay' in navigator], ['Ouverture de fichiers', 'launchQueue' in window],
      ['Plein écran', !!document.fullscreenEnabled], ['Transitions de vue', 'startViewTransition' in document], ['Navigation API', 'navigation' in window],
    ]],
    ['Appareil', [
      ['Orientation', 'DeviceOrientationEvent' in window], ['Vibration', 'vibrate' in navigator], ['Géolocalisation', 'geolocation' in navigator],
      ['Manettes', 'getGamepads' in navigator], ['Bluetooth', 'bluetooth' in navigator], ['USB', 'usb' in navigator], ['HID', 'hid' in navigator],
      ['Port série', 'serial' in navigator], ['NFC', 'NDEFReader' in window], ['Pipette', 'EyeDropper' in window], ['Clés d’accès', 'PublicKeyCredential' in window],
    ]],
    ['Fichiers et stockage', [
      ['Accès aux fichiers', 'showSaveFilePicker' in window], ['Système de fichiers privé', !!navigator.storage?.getDirectory],
      ['IndexedDB', 'indexedDB' in window], ['Gestion du stockage', !!navigator.storage?.estimate], ['Presse-papiers', !!navigator.clipboard?.writeText],
      ['BroadcastChannel', 'BroadcastChannel' in window],
    ]],
    ['CSS moderne', [
      ['Sélecteur :has()', css('selector(:has(a))')], ['Requêtes de conteneur', cssKV('container-type', 'inline-size')], ['Imbrication', css('selector(&)')],
      ['Ancrage', cssKV('anchor-name', '--a')], ['@scope', 'CSSScopeRule' in window], ['Animations au défilement', cssKV('animation-timeline', 'scroll()')],
      ['Subgrid', cssKV('grid-template-columns', 'subgrid')], ['Flou d’arrière-plan', cssKV('backdrop-filter', 'blur(1px)') || cssKV('-webkit-backdrop-filter', 'blur(1px)')],
      ['text-wrap: balance', cssKV('text-wrap', 'balance')], ['Popover', Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover')],
    ]],
  ];
  cv.getContext('webgl2') && cv.getContext('webgl2').getExtension('WEBGL_lose_context')?.loseContext();
  return list;
}

const GFLOPS_WGSL = /* wgsl */`
@group(0) @binding(0) var<storage, read_write> outBuf: array<vec4f>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  var a = vec4f(f32(id.x) * 1e-7, 1.0, 0.5, 0.25);
  var b = vec4f(0.99991, 0.99992, 0.99993, 0.99994);
  let c = vec4f(0.0001);
  for (var i = 0u; i < 512u; i++) {
    a = fma(a, b, c); b = fma(b, a, c); a = fma(a, b, c); b = fma(b, a, c);
  }
  outBuf[id.x] = a + b;
}`;

async function gpuBenchWebGPU(onProgress) {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('adaptateur');
  const device = await adapter.requestDevice();
  const threads = 256 * 1024;
  const buf = device.createBuffer({ size: threads * 16, usage: GPUBufferUsage.STORAGE });
  const pipe = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: GFLOPS_WGSL }), entryPoint: 'main' } });
  const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] });
  const run = async (n) => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipe); pass.setBindGroup(0, bg);
    for (let i = 0; i < n; i++) pass.dispatchWorkgroups(threads / 256);
    pass.end();
    const t0 = performance.now();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    return performance.now() - t0;
  };
  await run(1); // préchauffage
  onProgress(0.2);
  let n = 2, ms = 0;
  // augmente la charge jusqu'à une mesure d'au moins 250 ms
  while (n <= 512) { ms = await run(n); onProgress(Math.min(0.95, 0.2 + Math.log2(n) / 10)); if (ms > 250) break; n *= 2; }
  const flops = threads * 512 * 4 * 4 * 2 * n;
  buf.destroy();
  device.destroy();
  return { gflops: flops / (ms / 1000) / 1e9, api: 'WebGPU compute' };
}

function gpuBenchWebGL(onProgress) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1024;
  const gl = cv.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2');
  const vs = `#version 300 es
  void main() { vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const fs = `#version 300 es
  precision highp float; out vec4 o;
  void main() {
    vec4 a = vec4(gl_FragCoord.xy * 1e-6, 0.5, 0.25), b = vec4(0.99991, 0.99992, 0.99993, 0.99994), c = vec4(0.0001);
    for (int i = 0; i < 256; i++) { a = a * b + c; b = b * a + c; a = a * b + c; b = b * a + c; }
    o = (a + b) * 0.001;
  }`;
  const mk = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p); gl.useProgram(p);
  gl.bindVertexArray(gl.createVertexArray());
  const px = new Uint8Array(4);
  const run = (n) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return performance.now() - t0;
  };
  run(1);
  onProgress(0.3);
  let n = 1, ms = 0;
  while (n <= 256) { ms = run(n); if (ms > 250) break; n *= 2; }
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { gflops: (1024 * 1024 * 256 * 4 * 4 * 2 * n) / (ms / 1000) / 1e9, api: 'WebGL2 fragment' };
}

export async function create(ctx) {
  const root = h('div', { class: 'sys' });
  const grid = h('div', { class: 'sys-grid' });
  root.append(grid);
  ctx.host.append(root);
  const report = {};

  const panel = (title, wide, ...children) => {
    const el = h('section', { class: `panel${wide ? ' wide' : ''}` }, h('h3', {}, ...[].concat(title)), ...children);
    grid.append(el);
    return el;
  };
  const kv = (pairs) => h('dl', { class: 'kv' }, pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v ?? '—')]));

  /* ——— Rafraîchissement (live) ——— */
  const fpsNum = h('div', { class: 'big-num' }, '—', h('small', {}, 'ips'));
  const gauge = h('canvas', { class: 'gauge', width: 192, height: 192 });
  const spark = h('canvas', { class: 'spark', width: 600, height: 112 });
  const hzLine = h('p', { class: 'muted' }, 'Mesure en cours…');
  panel('Rafraîchissement', false, h('div', { class: 'gauge-row' }, gauge, h('div', {}, fpsNum, hzLine)), spark);

  /* ——— Écran ——— */
  const probe = h('div', { style: { position: 'fixed', inset: '0', pointerEvents: 'none', visibility: 'hidden', paddingTop: 'env(safe-area-inset-top)', paddingRight: 'env(safe-area-inset-right)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)' } });
  document.body.append(probe);
  const screenBox = h('div');
  panel('Écran', false, screenBox);
  const mq = (q) => matchMedia(q).matches;
  function renderScreen() {
    const dpr = window.devicePixelRatio || 1;
    const cs = getComputedStyle(probe);
    const sa = ['Top', 'Right', 'Bottom', 'Left'].map((s) => Math.round(parseFloat(cs[`padding${s}`]) || 0));
    const gamut = mq('(color-gamut: rec2020)') ? 'Rec. 2020' : mq('(color-gamut: p3)') ? 'Display P3' : 'sRGB';
    const orient = screen.orientation?.type?.replace('-primary', '').replace('-secondary', ' inversé').replace('portrait', 'Portrait').replace('landscape', 'Paysage') || (innerWidth > innerHeight ? 'Paysage' : 'Portrait');
    const pairs = [
      ['Écran (CSS)', `${screen.width} × ${screen.height} pt`],
      ['Écran (physique)', `${Math.round(screen.width * dpr)} × ${Math.round(screen.height * dpr)} px`],
      ['Fenêtre', `${innerWidth} × ${innerHeight}`],
      ['Densité', `${fmt2.format(dpr)}×`],
      ['Gamme de couleurs', gamut],
      ['HDR', mq('(dynamic-range: high)') ? 'Oui' : 'Non'],
      ['Orientation', orient],
      ['Zones sûres', `↑${sa[0]} →${sa[1]} ↓${sa[2]} ←${sa[3]}`],
      ['Mode d’affichage', displayMode()],
      ['Mouvements réduits', mq('(prefers-reduced-motion: reduce)') ? 'Oui' : 'Non'],
    ];
    Object.assign(report, Object.fromEntries(pairs));
    screenBox.replaceChildren(kv(pairs));
  }
  renderScreen();
  addEventListener('resize', renderScreen);
  screen.orientation?.addEventListener?.('change', renderScreen);

  /* ——— Processeur ——— */
  const cores = navigator.hardwareConcurrency || 1;
  const cpuScore = h('div', { class: 'score' }, '—');
  const cpuSub = h('p', { class: 'muted' }, 'Mandelbrot sur 1 cœur puis sur tous les cœurs.');
  const bars = h('div', { class: 'bench-bars' });
  const cpuBtn = h('button', { class: 'btn primary', type: 'button' }, 'Lancer le banc d’essai');
  panel('Processeur', false,
    kv([['Plateforme', `${platformName()} · ${browserName()}`], ['Cœurs logiques', String(cores)], ['Mémoire', navigator.deviceMemory ? `≥ ${navigator.deviceMemory} Go` : 'Non exposée'],
      ['Tas JavaScript', performance.memory ? bytes(performance.memory.jsHeapSizeLimit) : 'Non exposé']]),
    cpuScore, cpuSub, bars, cpuBtn);
  report['Cœurs'] = cores;

  const workers = new Set();
  function runWorkers(n, ms) {
    bars.replaceChildren(...Array.from({ length: n }, () => h('div', { class: 'bench-bar' }, h('i'))));
    return new Promise((resolve) => {
      let done = 0, total = 0;
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('../workers/bench.js', import.meta.url));
        workers.add(w);
        w.onmessage = (e) => {
          const m = e.data;
          if (m.type === 'progress') bars.children[i].firstChild.style.width = `${m.p * 100}%`;
          else {
            bars.children[i].firstChild.style.width = '100%';
            total += m.iters / (m.ms / 1000);
            w.terminate(); workers.delete(w);
            if (++done === n) resolve(total);
          }
        };
        w.postMessage({ id: i, ms });
      }
    });
  }
  cpuBtn.addEventListener('click', async () => {
    cpuBtn.disabled = true;
    ctx.haptic('medium');
    cpuScore.textContent = '…';
    cpuSub.textContent = 'Un cœur…';
    const single = await runWorkers(1, 1500);
    cpuSub.textContent = `Tous les cœurs (${cores})…`;
    const multi = await runWorkers(cores, 1500);
    const s = single / 1e6, m = multi / 1e6;
    cpuScore.textContent = `${fmt.format(Math.round(m))} M itér./s`;
    cpuSub.textContent = `1 cœur : ${fmt.format(Math.round(s))} M itér./s · accélération ×${fmt1.format(m / s)} sur ${cores} cœurs`;
    report['Processeur (multi)'] = `${Math.round(m)} M itér./s`;
    report['Processeur (1 cœur)'] = `${Math.round(s)} M itér./s`;
    cpuBtn.disabled = false;
    cpuBtn.textContent = 'Relancer';
    ctx.haptic('success');
  });

  /* ——— GPU ——— */
  const gpuBox = h('div');
  const gpuScore = h('div', { class: 'score' }, '—');
  const gpuSub = h('p', { class: 'muted' }, 'Multiplications-additions fusionnées sur 262 144 fils.');
  const gpuBar = h('div', { class: 'bench-bars' }, h('div', { class: 'bench-bar' }, h('i')));
  const gpuBtn = h('button', { class: 'btn primary', type: 'button' }, 'Mesurer les GFLOPS');
  panel('Processeur graphique', false, gpuBox, gpuScore, gpuSub, gpuBar, gpuBtn);
  (async () => {
    const cv = document.createElement('canvas');
    const gl = cv.getContext('webgl2');
    const pairs = [
      ['Moteur', gpuName(gl) || 'Inconnu'],
      ['WebGL 2', gl ? 'Oui' : 'Non'],
      ['Texture max', gl ? `${fmt.format(gl.getParameter(gl.MAX_TEXTURE_SIZE))} px` : '—'],
      ['Échantillons MSAA', gl ? String(gl.getParameter(gl.MAX_SAMPLES)) : '—'],
      ['Flottants rendables', gl?.getExtension('EXT_color_buffer_float') ? 'Oui' : 'Non'],
    ];
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    if (navigator.gpu) {
      try {
        const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
        if (a) {
          const i = a.info || {};
          pairs.push(['WebGPU', [i.vendor, i.architecture].filter(Boolean).join(' · ') || 'Disponible']);
          pairs.push(['Fonctions WebGPU', `${a.features.size} (${[...a.features].slice(0, 3).join(', ')}${a.features.size > 3 ? '…' : ''})`]);
          pairs.push(['Tampon max', bytes(a.limits.maxStorageBufferBindingSize)]);
          pairs.push(['Groupe de calcul', `${a.limits.maxComputeInvocationsPerWorkgroup} fils`]);
        } else pairs.push(['WebGPU', 'Aucun adaptateur']);
      } catch { pairs.push(['WebGPU', 'Erreur']); }
    } else pairs.push(['WebGPU', 'Non pris en charge']);
    report.GPU = pairs[0][1];
    gpuBox.replaceChildren(kv(pairs));
  })();
  gpuBtn.addEventListener('click', async () => {
    gpuBtn.disabled = true;
    ctx.haptic('medium');
    gpuScore.textContent = '…';
    const bar = gpuBar.querySelector('i');
    const prog = (p) => { bar.style.width = `${p * 100}%`; };
    try {
      let res;
      try { if (!navigator.gpu) throw new Error('webgpu'); res = await gpuBenchWebGPU(prog); } catch { res = gpuBenchWebGL(prog); }
      prog(1);
      const v = res.gflops;
      gpuScore.textContent = v > 1000 ? `${fmt2.format(v / 1000)} TFLOPS` : `${fmt.format(Math.round(v))} GFLOPS`;
      gpuSub.textContent = `Mesuré avec ${res.api}, en simple précision.`;
      report['GPU mesuré'] = gpuScore.textContent;
      ctx.haptic('success');
    } catch (err) {
      gpuScore.textContent = 'Indisponible';
      gpuSub.textContent = String(err?.message || err);
    }
    gpuBtn.disabled = false;
    gpuBtn.textContent = 'Relancer';
  });

  /* ——— Capteurs ——— */
  const bubble = h('div', { class: 'bubble' });
  const level = h('div', { class: 'level', 'aria-label': 'Niveau à bulle' }, h('div', { class: 'ring' }), bubble);
  const phone = h('div', { class: 'phone3d' });
  const sensorVals = h('div');
  const sensorBtn = h('button', { class: 'btn primary', type: 'button' }, 'Activer les capteurs');
  const sensorPanel = panel('Capteurs de mouvement', false, level, h('div', { class: 'cube-wrap' }, phone), sensorVals, sensorBtn);
  sensorVals.replaceChildren(kv([['Orientation', 'En attente'], ['Accélération', 'En attente']]));
  let orient = null, accel = null;
  const onOrient = (e) => { if (e.beta != null) orient = e; };
  const onMotion = (e) => { accel = e.accelerationIncludingGravity; };
  sensorBtn.addEventListener('click', async () => {
    const ok = await ctx.requestMotion();
    if (!ok) { ctx.toast('Accès aux capteurs refusé', { type: 'warn' }); return; }
    addEventListener('deviceorientation', onOrient);
    addEventListener('devicemotion', onMotion);
    sensorBtn.textContent = 'Recherche…';
    const live = await probeOrientation(1200);
    if (!live) {
      sensorBtn.textContent = 'Aucun capteur sur cet appareil';
      sensorBtn.disabled = true;
      return;
    }
    sensorBtn.remove();
    ctx.haptic('success');
  });

  /* ——— Stockage et réseau ——— */
  const netBox = h('div');
  panel('Stockage et réseau', false, netBox);
  (async () => {
    const pairs = [];
    const c = navigator.connection;
    pairs.push(['En ligne', navigator.onLine ? 'Oui' : 'Non']);
    if (c) {
      pairs.push(['Type estimé', c.effectiveType?.toUpperCase?.() || '—']);
      if (c.downlink) pairs.push(['Débit estimé', `${c.downlink} Mb/s`]);
      if (c.rtt != null) pairs.push(['Latence estimée', `${c.rtt} ms`]);
    }
    try {
      const e = await navigator.storage?.estimate?.();
      if (e) pairs.push(['Stockage utilisé', `${bytes(e.usage)} / ${bytes(e.quota)}`]);
      const persisted = await navigator.storage?.persisted?.();
      pairs.push(['Stockage persistant', persisted ? 'Oui' : 'Non']);
    } catch { /* ignoré */ }
    try {
      const keys = await caches.keys();
      let n = 0;
      for (const k of keys.filter((k) => k.startsWith('prisme-'))) n += (await (await caches.open(k)).keys()).length;
      pairs.push(['Fichiers hors-ligne', `${n} en cache`]);
    } catch { pairs.push(['Fichiers hors-ligne', 'Indisponible']); }
    pairs.push(['Service worker', navigator.serviceWorker?.controller ? 'Actif' : 'Inactif']);
    if (navigator.getBattery) {
      try {
        const b = await navigator.getBattery();
        pairs.push(['Batterie', `${Math.round(b.level * 100)} %${b.charging ? ' · en charge' : ''}`]);
      } catch { /* ignoré */ }
    }
    netBox.replaceChildren(kv(pairs));
  })();

  /* ——— Voix, pastille, rapport ——— */
  const speakBtn = h('button', { class: 'btn', type: 'button' }, 'Écouter le résumé');
  const badgeBtn = h('button', { class: 'btn', type: 'button' }, 'Tester la pastille d’icône');
  const copyBtn = h('button', { class: 'btn', type: 'button' }, 'Copier le rapport');
  panel('Actions', false, h('div', { class: 'btn-row' }, speakBtn, badgeBtn, copyBtn),
    h('p', { class: 'muted' }, isIOS ? 'Sur iPhone, la pastille s’affiche sur l’icône de l’app installée une fois les notifications autorisées.' : 'La pastille apparaît sur l’icône de l’app installée dans la barre des tâches.'));

  /* ——— Fonctionnalités ——— */
  const feats = features();
  const all = feats.flatMap(([, l]) => l);
  const yes = all.filter(([, v]) => v).length;
  report['API web'] = `${yes}/${all.length}`;
  const featPanel = panel([`API web · ${yes} / ${all.length} disponibles`], true);
  for (const [group, list] of feats) {
    featPanel.append(h('p', { class: 'muted', style: { marginTop: '4px' } }, group),
      h('div', { class: 'feat-grid' }, list.map(([name, ok]) => h('span', { class: `feat${ok ? ' yes' : ''}`, title: ok ? 'Disponible' : 'Indisponible' }, name))));
  }

  speakBtn.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) { ctx.toast('Synthèse vocale indisponible', { type: 'warn' }); return; }
    speechSynthesis.cancel();
    const text = `Bonjour. Ce ${platformName()} rafraîchit son écran à ${hz} images par seconde, avec une densité de ${fmt1.format(window.devicePixelRatio || 1)} pixels par point. `
      + `Il dispose de ${cores} cœurs logiques${report['Processeur (multi)'] ? `, qui calculent ${report['Processeur (multi)'].replace('M itér./s', 'millions d’itérations par seconde')}` : ''}. `
      + `${report['GPU mesuré'] ? `Son processeur graphique atteint ${report['GPU mesuré']}. ` : ''}`
      + `${yes} fonctionnalités web sur ${all.length} sont disponibles dans ce navigateur.`;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 1.02;
    const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('fr'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
    ctx.haptic('light');
  });
  let badged = false;
  badgeBtn.addEventListener('click', async () => {
    if (!('setAppBadge' in navigator)) { ctx.toast('Pastilles non prises en charge ici', { type: 'warn' }); return; }
    try {
      if (isIOS && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
      if (badged) { await navigator.clearAppBadge(); ctx.toast('Pastille retirée'); } else { await navigator.setAppBadge(6); ctx.toast('Pastille « 6 » posée sur l’icône de l’app'); }
      badged = !badged;
    } catch { ctx.toast('La pastille a été refusée', { type: 'warn' }); }
  });
  copyBtn.addEventListener('click', async () => {
    const text = ['Prisme · rapport système', `Date : ${new Date().toLocaleString('fr-FR')}`, `Appareil : ${platformName()} · ${browserName()}`, `Rafraîchissement : ${hz} Hz`,
      ...Object.entries(report).map(([k, v]) => `${k} : ${v}`)].join('\n');
    try { await navigator.clipboard.writeText(text); ctx.toast('Rapport copié'); } catch { ctx.toast('Copie refusée par le navigateur', { type: 'warn' }); }
  });

  /* ——— Boucle : IPS, jauge, capteurs ——— */
  const gctx = gauge.getContext('2d');
  const sctx = spark.getContext('2d');
  const hist = new Float32Array(120);
  let hi = 0, acc = 0, hz = 60;
  const offLoop = ctx.loop.add((t, dt) => {
    hist[hi++ % hist.length] = dt * 1000;
    acc += dt;
    if (orient) {
      const b = Math.max(-45, Math.min(45, orient.beta > 90 ? 180 - orient.beta : orient.beta < -90 ? -180 - orient.beta : orient.beta));
      const g = Math.max(-45, Math.min(45, orient.gamma));
      const R = level.clientWidth / 2 - 20;
      bubble.style.transform = `translate(${(-g / 45) * R}px, ${(-b / 45) * R}px)`;
      phone.style.transform = `rotateX(${orient.beta - 90}deg) rotateY(${orient.gamma}deg) rotateZ(${-(orient.alpha || 0) * 0.25}deg)`;
    }
    if (acc < 0.2) return;
    acc = 0;
    const ms = ctx.loop.frameMs(60);
    const fps = 1000 / ms;
    hz = Math.round(fps);
    fpsNum.firstChild.textContent = String(Math.round(fps));
    hzLine.textContent = `${fmt1.format(ms)} ms par image · écran ${fps > 100 ? 'ProMotion 120 Hz' : fps > 80 ? '90 Hz' : '60 Hz'}`;
    report['Rafraîchissement mesuré'] = `${Math.round(fps)} ips`;
    // jauge
    const W = gauge.width, c = W / 2;
    gctx.clearRect(0, 0, W, W);
    gctx.lineWidth = 14; gctx.lineCap = 'round';
    gctx.strokeStyle = 'rgba(255,255,255,.08)';
    gctx.beginPath(); gctx.arc(c, c, c - 12, Math.PI * 0.75, Math.PI * 2.25); gctx.stroke();
    const frac = Math.min(1, fps / 120);
    const grd = gctx.createLinearGradient(0, W, W, 0);
    grd.addColorStop(0, '#45e08a'); grd.addColorStop(1, '#3db2ff');
    gctx.strokeStyle = grd;
    gctx.beginPath(); gctx.arc(c, c, c - 12, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * frac)); gctx.stroke();
    // courbe des durées d'image
    const SW = spark.width, SH = spark.height;
    sctx.clearRect(0, 0, SW, SH);
    sctx.strokeStyle = 'rgba(255,255,255,.08)'; sctx.lineWidth = 1;
    for (const ref of [8.33, 16.67, 33.3]) { const y = SH - (ref / 40) * SH; sctx.beginPath(); sctx.moveTo(0, y); sctx.lineTo(SW, y); sctx.stroke(); }
    sctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const v = hist[(hi + i) % hist.length];
      const x = (i / (hist.length - 1)) * SW, y = SH - Math.min(1, v / 40) * SH;
      if (i) sctx.lineTo(x, y); else sctx.moveTo(x, y);
    }
    sctx.strokeStyle = '#45e08a'; sctx.lineWidth = 2.5; sctx.stroke();
    sctx.lineTo(SW, SH); sctx.lineTo(0, SH); sctx.closePath();
    const fg = sctx.createLinearGradient(0, 0, 0, SH);
    fg.addColorStop(0, 'rgba(69,224,138,.25)'); fg.addColorStop(1, 'rgba(69,224,138,0)');
    sctx.fillStyle = fg; sctx.fill();
    // capteurs
    if (orient) {
      const a = accel ? Math.hypot(accel.x || 0, accel.y || 0, accel.z || 0) : null;
      sensorVals.replaceChildren(kv([
        ['α (boussole)', `${fmt1.format(orient.alpha ?? 0)}°`], ['β (avant-arrière)', `${fmt1.format(orient.beta)}°`], ['γ (gauche-droite)', `${fmt1.format(orient.gamma)}°`],
        ['Accélération', a != null ? `${fmt2.format(a)} m/s²` : '—'],
      ]));
    }
  });

  ctx.setStatus(`${platformName()} · ${browserName()} · ${yes}/${all.length} API`);
  void sensorPanel;

  return {
    destroy() {
      offLoop();
      workers.forEach((w) => w.terminate());
      removeEventListener('resize', renderScreen);
      screen.orientation?.removeEventListener?.('change', renderScreen);
      removeEventListener('deviceorientation', onOrient);
      removeEventListener('devicemotion', onMotion);
      probe.remove();
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    },
  };
}
