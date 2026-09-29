// Vision — la caméra passe dans des shaders WebGL2 en temps réel : contours néon, ASCII, imagerie
// thermique, kaléidoscope, trame d'imprimerie, glitch, peinture (filtre de Kuwahara) et rétro tramé.
// Sans caméra : source de démonstration animée, ou photo / vidéo importée.
import { createGL, fullscreen, drawFullscreen, guardContext } from '../core/gl.js';
import { observeSize, canvasToBlob, h } from '../core/kit.js';

export const info = {
  title: 'Vision · comment ça marche',
  html: `<p>L’image de la caméra est envoyée au GPU à chaque trame puis traitée par un <b>fragment shader</b> : chaque pixel de l’écran est calculé en parallèle.</p>
  <ul>
    <li><b>Néon</b> : filtre de Sobel, la couleur dépend de l’orientation du contour.</li>
    <li><b>ASCII</b> : l’image est découpée en cellules, chaque cellule reçoit un caractère selon sa luminosité, depuis un atlas de glyphes dessiné au lancement.</li>
    <li><b>Thermique</b> : la luminance est convertie avec une palette de caméra infrarouge.</li>
    <li><b>Trame</b> : trois trames cyan, magenta et jaune orientées comme en imprimerie offset.</li>
    <li><b>Peinture</b> : filtre de Kuwahara, qui lisse les aplats en préservant les contours.</li>
    <li><b>Rétro</b> : tramage ordonné de Bayer sur une palette de quatre couleurs.</li>
  </ul>
  <p>Glissez horizontalement pour changer de filtre. Le déclencheur enregistre l’image filtrée en pleine résolution. Rien n’est envoyé sur Internet.</p>`,
};

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform sampler2D uGlyph;
uniform vec2 uRes;
uniform vec2 uSrcRes;
uniform float uTime;
uniform float uMirror;
uniform float uAmount;
uniform float uDpr;

vec2 coverUv(vec2 uv) {
  float ca = uRes.x / uRes.y, sa = uSrcRes.x / uSrcRes.y;
  vec2 s = ca > sa ? vec2(1.0, sa / ca) : vec2(ca / sa, 1.0);
  uv = (uv - 0.5) * s + 0.5;
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  return uv;
}
vec3 src(vec2 uv) { return texture(uTex, coverUv(uv)).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 vignette(vec3 c) { vec2 q = vUv - 0.5; return c * (1.0 - dot(q, q) * 0.6); }
`;

const EFFECTS = [
  { id: 'original', label: 'Original', fs: `
void main() {
  vec3 c = src(vUv);
  c = mix(c, smoothstep(0.02, 0.98, c), 0.5 * uAmount);
  o = vec4(vignette(c), 1.0);
}` },
  { id: 'neon', label: 'Néon', fs: `
float L(vec2 d) { return luma(src(vUv + d / uRes * 1.5 * uDpr)); }
void main() {
  float tl = L(vec2(-1, 1)), t = L(vec2(0, 1)), tr = L(vec2(1, 1));
  float l = L(vec2(-1, 0)), r = L(vec2(1, 0));
  float bl = L(vec2(-1, -1)), b = L(vec2(0, -1)), br = L(vec2(1, -1));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
  float e = length(vec2(gx, gy));
  float ang = atan(gy, gx) / 6.28318;
  vec3 hue = 0.5 + 0.5 * cos(6.28318 * (ang + vec3(0.0, 0.33, 0.67)) + uTime * 0.6);
  vec3 c = hue * smoothstep(0.06, 0.45, e) * (1.4 + uAmount);
  c += src(vUv) * 0.07 * (1.0 - uAmount);
  o = vec4(c, 1.0);
}` },
  { id: 'ascii', label: 'ASCII', fs: `
void main() {
  float cell = floor(8.0 + 10.0 * (1.0 - uAmount)) * uDpr;
  vec2 fc = gl_FragCoord.xy;
  vec2 id = floor(fc / cell);
  vec2 center = (id + 0.5) * cell / uRes;
  vec3 c = (src(center) * 2.0 + src(center + vec2(cell * 0.25) / uRes) + src(center - vec2(cell * 0.25) / uRes)) / 4.0;
  float lum = clamp(luma(c) * 1.15, 0.0, 0.999);
  float g = floor(lum * 10.0);
  vec2 f = fract(fc / cell);
  f.y = 1.0 - f.y;
  float ink = texture(uGlyph, vec2((g + f.x) / 10.0, f.y)).r;
  vec3 tint = mix(vec3(0.95, 0.85, 0.3), c * 1.6 + 0.1, 0.65);
  o = vec4(tint * ink, 1.0);
}` },
  { id: 'thermique', label: 'Thermique', fs: `
vec3 heat(float t) {
  vec3 c0 = vec3(0.0, 0.0, 0.05), c1 = vec3(0.12, 0.0, 0.5), c2 = vec3(0.65, 0.0, 0.6);
  vec3 c3 = vec3(1.0, 0.25, 0.05), c4 = vec3(1.0, 0.8, 0.0), c5 = vec3(1.0, 1.0, 0.95);
  if (t < 0.2) return mix(c0, c1, t / 0.2);
  if (t < 0.4) return mix(c1, c2, (t - 0.2) / 0.2);
  if (t < 0.6) return mix(c2, c3, (t - 0.4) / 0.2);
  if (t < 0.8) return mix(c3, c4, (t - 0.6) / 0.2);
  return mix(c4, c5, (t - 0.8) / 0.2);
}
void main() {
  vec2 p = 2.0 * uDpr / uRes;
  float l = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) l += luma(src(vUv + vec2(x, y) * p));
  l /= 9.0;
  l = pow(l, 0.8 + uAmount);
  l += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.03;
  vec3 c = heat(clamp(l, 0.0, 1.0));
  c *= 0.92 + 0.08 * sin(gl_FragCoord.y * 1.5 / uDpr);
  o = vec4(c, 1.0);
}` },
  { id: 'kaleido', label: 'Kaléido', fs: `
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(p);
  float a = atan(p.y, p.x) + uTime * 0.15;
  float n = floor(4.0 + uAmount * 8.0);
  float seg = 6.28318 / n;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r * (0.9 - 0.2 * sin(uTime * 0.3));
  vec3 c = src(q + 0.5);
  c *= 1.0 - smoothstep(0.55, 0.75, r) * 0.6;
  o = vec4(c * 1.08, 1.0);
}` },
  { id: 'trame', label: 'Trame', fs: `
float dotScreen(vec2 fc, float angle, float val, float cell) {
  float s = sin(angle), c = cos(angle);
  vec2 rp = mat2(c, -s, s, c) * fc;
  vec2 g = fract(rp / cell) - 0.5;
  float rad = sqrt(clamp(val, 0.0, 1.0)) * 0.62;
  return 1.0 - smoothstep(rad - 0.08, rad + 0.08, length(g));
}
void main() {
  float cell = (5.0 + 7.0 * (1.0 - uAmount)) * uDpr;
  vec3 rgb = src(vUv);
  vec3 cmy = 1.0 - rgb;
  vec2 fc = gl_FragCoord.xy;
  float C = dotScreen(fc, 0.261, cmy.r, cell);
  float M = dotScreen(fc, 1.309, cmy.g, cell);
  float Y = dotScreen(fc, 0.0, cmy.b, cell);
  vec3 paper = vec3(0.97, 0.95, 0.9);
  vec3 c = paper * (1.0 - C * vec3(0.9, 0.12, 0.0)) * (1.0 - M * vec3(0.05, 0.85, 0.1)) * (1.0 - Y * vec3(0.0, 0.05, 0.85));
  o = vec4(c, 1.0);
}` },
  { id: 'glitch', label: 'Glitch', fs: `
void main() {
  vec2 uv = vUv;
  float t = floor(uTime * 12.0);
  float band = floor(uv.y * 24.0);
  float jump = step(0.86 - uAmount * 0.25, hash(vec2(band, t)));
  uv.x += (hash(vec2(t, band)) - 0.5) * 0.12 * jump;
  float k = (0.004 + 0.02 * uAmount) * (0.6 + jump);
  vec3 c = vec3(src(uv + vec2(k, 0.0)).r, src(uv).g, src(uv - vec2(k, 0.0)).b);
  c *= 0.85 + 0.15 * sin(gl_FragCoord.y * 3.14159 / (2.0 * uDpr));
  if (hash(vec2(band * 0.37, t)) > 0.97) c = 1.0 - c;
  c += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.08;
  o = vec4(c, 1.0);
}` },
  { id: 'peinture', label: 'Peinture', fs: `
void main() {
  vec2 p = (1.0 + uAmount * 1.5) * uDpr / uRes;
  vec3 m[4]; vec3 s[4];
  for (int k = 0; k < 4; k++) { m[k] = vec3(0.0); s[k] = vec3(0.0); }
  for (int j = -3; j <= 3; j++) {
    for (int i = -3; i <= 3; i++) {
      vec3 c = src(vUv + vec2(i, j) * p);
      vec3 c2 = c * c;
      if (i <= 0 && j <= 0) { m[0] += c; s[0] += c2; }
      if (i >= 0 && j <= 0) { m[1] += c; s[1] += c2; }
      if (i <= 0 && j >= 0) { m[2] += c; s[2] += c2; }
      if (i >= 0 && j >= 0) { m[3] += c; s[3] += c2; }
    }
  }
  float best = 1e9; vec3 outc = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec3 mean = m[k] / 16.0;
    vec3 v = abs(s[k] / 16.0 - mean * mean);
    float sig = v.r + v.g + v.b;
    if (sig < best) { best = sig; outc = mean; }
  }
  outc = mix(outc, smoothstep(0.0, 1.0, outc), 0.35);
  o = vec4(vignette(outc * 1.04), 1.0);
}` },
  { id: 'retro', label: 'Rétro', fs: `
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
void main() {
  float px = floor(2.0 + 3.0 * uAmount) * uDpr;
  vec2 cell = floor(gl_FragCoord.xy / px);
  vec2 uv = (cell + 0.5) * px / uRes;
  float l = luma(src(uv));
  l = clamp((l - 0.05) * 1.2, 0.0, 1.0);
  float q = floor(l * 3.0 + bayer(cell));
  vec3 pal0 = vec3(0.06, 0.12, 0.06), pal1 = vec3(0.19, 0.38, 0.19), pal2 = vec3(0.55, 0.67, 0.06), pal3 = vec3(0.61, 0.74, 0.06);
  vec3 c = q < 1.0 ? pal0 : q < 2.0 ? pal1 : q < 3.0 ? pal2 : pal3;
  o = vec4(c, 1.0);
}` },
];

function glyphAtlas() {
  const chars = ' .:-=+*#%@';
  const S = 48;
  const cv = document.createElement('canvas');
  cv.width = S * chars.length; cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#fff';
  g.font = `700 ${S * 0.82}px "JetBrains Mono", ui-monospace, monospace`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  [...chars].forEach((c, i) => g.fillText(c, i * S + S / 2, S / 2 + 2));
  return cv;
}

/** Source de démonstration animée, utilisée sans caméra. */
function demoSource() {
  const cv = document.createElement('canvas');
  cv.width = 960; cv.height = 640;
  const g = cv.getContext('2d');
  const colors = ['#ff4d5e', '#ff8a3d', '#ffd23f', '#45e08a', '#3db2ff', '#9b6bff'];
  return {
    el: cv, w: cv.width, h: cv.height,
    draw(t) {
      const sky = g.createLinearGradient(0, 0, 0, cv.height);
      sky.addColorStop(0, '#11142a'); sky.addColorStop(1, '#2a1030');
      g.fillStyle = sky; g.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < 6; i++) {
        const a = t * 0.5 + i;
        g.beginPath();
        g.arc(480 + Math.cos(a) * (180 + i * 25), 320 + Math.sin(a * 1.3) * 160, 60 + 25 * Math.sin(t + i), 0, Math.PI * 2);
        g.fillStyle = colors[i]; g.fill();
      }
      g.save();
      g.translate(480, 330); g.rotate(Math.sin(t * 0.4) * 0.2);
      g.beginPath(); g.moveTo(0, -150); g.lineTo(140, 110); g.lineTo(-140, 110); g.closePath();
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fill();
      g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
      g.restore();
      g.fillStyle = '#fff';
      g.font = '700 92px Unbounded, system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText('PRISME', 480, 600);
      g.strokeStyle = 'rgba(255,255,255,.15)'; g.lineWidth = 1;
      for (let x = 0; x < cv.width; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); }
    },
  };
}

export async function create(ctx) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Caméra filtrée en temps réel');
  ctx.host.append(canvas);
  const gl = createGL(canvas);
  if (!gl) throw new Error('WebGL2 est nécessaire pour les filtres.');
  const low = ctx.quality === 'low';

  const video = h('video', { playsinline: true, muted: true, autoplay: true, style: { position: 'absolute', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' } });
  video.muted = true;
  ctx.host.append(video);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  const glyphTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glyphTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  await document.fonts?.ready;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glyphAtlas());

  const programs = new Map();
  const prog = (i) => {
    if (!programs.has(i)) programs.set(i, fullscreen(gl, HEAD + EFFECTS[i].fs));
    return programs.get(i);
  };

  const state = { effect: 1, amount: 0.5, facing: 'user', source: 'none', mirror: true, srcW: 16, srcH: 9 };
  let stream = null, demo = null, still = null;
  let dpr = 1;

  const offSize = observeSize(canvas, (w, hh, r) => {
    dpr = Math.min(r, low ? 1.25 : 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr);
  });

  async function startCamera() {
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia indisponible');
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: state.facing, width: { ideal: low ? 1280 : 1920 }, height: { ideal: low ? 720 : 1080 } },
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    state.source = 'camera';
    state.mirror = state.facing === 'user';
    const s = stream.getVideoTracks()[0]?.getSettings?.() || {};
    ctx.setStatus(`Caméra ${state.facing === 'user' ? 'avant' : 'arrière'} · ${s.width || video.videoWidth}×${s.height || video.videoHeight}`);
  }
  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  function useDemo(reason) {
    stopCamera();
    demo = demoSource();
    still = null;
    state.source = 'demo';
    state.mirror = false;
    ctx.setStatus('Source de démonstration');
    if (reason) ctx.toast(reason, { type: 'warn', duration: 4000 });
  }

  try { await startCamera(); } catch (err) {
    useDemo(err?.name === 'NotAllowedError' ? 'Caméra refusée : source de démonstration. Vous pouvez importer une photo.' : 'Caméra indisponible : source de démonstration.');
  }

  // Import d'une photo ou d'une vidéo
  const fileInput = h('input', { type: 'file', accept: 'image/*,video/*', style: { display: 'none' } });
  ctx.host.append(fileInput);
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    stopCamera();
    demo = null;
    if (f.type.startsWith('video/')) {
      video.srcObject = null;
      video.src = URL.createObjectURL(f);
      video.loop = true;
      await video.play().catch(() => {});
      still = null;
      state.source = 'file-video';
    } else {
      // Image décodée puis redessinée (taille bornée) : l'orientation EXIF est respectée et le retournement Y s'applique.
      const url = URL.createObjectURL(f);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        still = cv;
      } catch {
        ctx.toast('Image illisible', { type: 'error' });
        return;
      } finally {
        URL.revokeObjectURL(url);
      }
      state.source = 'file-image';
      uploaded = false;
    }
    state.mirror = false;
    ctx.setStatus(`Fichier importé · ${f.name}`);
    fileInput.value = '';
  });

  let uploaded = false;
  function upload(t) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    if ((state.source === 'camera' || state.source === 'file-video') && video.readyState >= 2 && video.videoWidth) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      state.srcW = video.videoWidth; state.srcH = video.videoHeight;
    } else if (state.source === 'demo' && demo) {
      demo.draw(t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, demo.el);
      state.srcW = demo.w; state.srcH = demo.h;
    } else if (state.source === 'file-image' && still && !uploaded) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, still);
      state.srcW = still.width; state.srcH = still.height;
      uploaded = true;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  function render(t) {
    upload(t);
    const p = prog(state.effect).use();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, glyphTex);
    gl.uniform1i(p.u.uTex, 0);
    gl.uniform1i(p.u.uGlyph, 1);
    gl.uniform2f(p.u.uRes, canvas.width, canvas.height);
    gl.uniform2f(p.u.uSrcRes, state.srcW, state.srcH);
    gl.uniform1f(p.u.uTime, t);
    gl.uniform1f(p.u.uMirror, state.mirror ? 1 : 0);
    gl.uniform1f(p.u.uAmount, state.amount);
    gl.uniform1f(p.u.uDpr, dpr);
    drawFullscreen(gl, null);
  }

  let lost = false;
  let time = 0;
  const offLoop = ctx.loop.add((t, dt) => { if (!lost) { time += dt; render(time); } });
  const offGuard = guardContext(canvas, () => { lost = true; }, () => ctx.remount());

  // Glisser horizontalement pour changer de filtre
  let sx = null, sy = null;
  const onDown = (e) => { sx = e.clientX; sy = e.clientY; };
  const onUp = (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) setEffect((state.effect + (dx < 0 ? 1 : -1) + EFFECTS.length) % EFFECTS.length);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  const onVis = () => { if (!document.hidden && state.source !== 'none') video.play().catch(() => {}); };
  document.addEventListener('visibilitychange', onVis);

  /* Commandes */
  const d = ctx.dock;
  const seg = d.segment(EFFECTS.map((e, i) => ({ value: i, label: e.label })), state.effect, (v) => setEffect(v, false));
  function setEffect(i, fromSwipe = true) {
    state.effect = i;
    seg.set(i);
    if (fromSwipe) ctx.haptic('light');
    ctx.toast(EFFECTS[i].label, { duration: 900 });
  }
  d.row();
  if (!ctx.preview) d.button('Déclencher', () => document.getElementById('btn-capture')?.click(), { accent: '#ffd23f' });
  if (navigator.mediaDevices?.getUserMedia) {
    d.button('Retourner', async () => {
      state.facing = state.facing === 'user' ? 'environment' : 'user';
      try { await startCamera(); } catch { useDemo('Cette caméra est indisponible'); }
    });
  }
  d.button('Importer', () => fileInput.click());
  d.slider('Intensité', { min: 0, max: 1, step: 0.01, value: state.amount, format: (v) => `${Math.round(v * 100)} %` }, (v) => { state.amount = v; });

  ctx.hint('Glissez pour changer de filtre', ctx.preview ? 'Huit filtres GPU en direct. « Importer » accepte une photo ou une vidéo.' : 'Huit filtres GPU en direct. Le déclencheur enregistre l’image.');

  return {
    shortcuts: [['← / →', 'Filtre précédent / suivant']],
    key(e) {
      if (e.key === 'ArrowRight') { setEffect((state.effect + 1) % EFFECTS.length); return true; }
      if (e.key === 'ArrowLeft') { setEffect((state.effect - 1 + EFFECTS.length) % EFFECTS.length); return true; }
      return false;
    },
    capture() {
      render(time);
      return canvasToBlob(canvas, 'image/jpeg', 0.93);
    },
    destroy() {
      offLoop(); offSize(); offGuard();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      document.removeEventListener('visibilitychange', onVis);
      stopCamera();
      if (video.src) URL.revokeObjectURL(video.src);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

