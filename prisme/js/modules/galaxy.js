// Nébuleuse — jusqu'à deux millions de particules simulées par compute shaders WebGPU.
// Chaque particule est intégrée puis projetée et accumulée atomiquement dans un tampon HDR (splatting),
// tonemappé ensuite en plein écran. Repli WebGL2 : transform feedback + points en mélange additif.
import { createGL, program, fullscreen, drawFullscreen, createTarget, floatFormats, guardContext } from '../core/gl.js';
import { trackPointers, observeSize, canvasToBlob, clamp, fmt } from '../core/kit.js';

export const info = {
  title: 'Nébuleuse · comment ça marche',
  html: `<p>Sur les appareils compatibles, Prisme utilise <b>WebGPU</b>, l’API graphique moderne arrivée avec iOS 26 et déjà présente dans Edge. Chaque image, un <b>compute shader</b> met à jour la position et la vitesse de chaque particule, la projette à l’écran puis l’ajoute avec des opérations <b>atomiques</b> dans un tampon d’accumulation. Une seconde passe transforme ces densités en lumière.</p>
  <ul>
    <li><b>Galaxie</b> : bulbe central et halo de matière noire (courbe de rotation plate). Les bras spiraux sont une onde de densité qui tourne moins vite que les étoiles.</li>
    <li><b>Attracteur</b> : le système chaotique d’Aizawa, trois équations différentielles couplées.</li>
    <li><b>Tourbillon</b> : un flot à divergence nulle obtenu par le rotationnel analytique d’un potentiel vectoriel.</li>
  </ul>
  <p>Sans WebGPU, le même modèle tourne en <b>WebGL2</b> grâce au <i>transform feedback</i>, avec moins de particules.</p>
  <h3>Gestes</h3><p>Un doigt crée un puits gravitationnel. Deux doigts font tourner la caméra et zooment. Touchez deux fois pour une onde de choc.</p>
  <h3>Clavier et souris</h3><p>Clic gauche : attirer · clic droit ou Maj+glisser : tourner · molette : zoom · <code>1</code>–<code>3</code> est réservé à la navigation, utilisez <code>G</code>, <code>A</code>, <code>T</code> pour les modes · <code>B</code> onde de choc.</p>`,
};

const MODES = [
  { id: 0, label: 'Galaxie', dist: 6.2, pitch: 0.62, exposure: 0.7, decay: 0.55 },
  { id: 1, label: 'Attracteur', dist: 7.2, pitch: 0.28, exposure: 0.6, decay: 0.7 },
  { id: 2, label: 'Tourbillon', dist: 5.2, pitch: 0.2, exposure: 0.8, decay: 0.75 },
];

/* ——— Mathématiques de caméra (matrices colonne-major) ——— */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

/* ——— Physique commune (WGSL) ——— */
const WGSL_COMMON = /* wgsl */`
struct Particle { pos: vec4f, vel: vec4f };
struct Params {
  viewProj: mat4x4f,
  attr0: vec4f,
  attr1: vec4f,
  res: vec2f,
  dt: f32,
  time: f32,
  mode: u32,
  count: u32,
  exposure: f32,
  decay: f32,
};
@group(0) @binding(0) var<uniform> P: Params;
`;

const WGSL_SIM = WGSL_COMMON + /* wgsl */`
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> accum: array<atomic<u32>>;

fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453); }

fn aizawa(p: vec3f) -> vec3f {
  let a = 0.95; let b = 0.7; let c = 0.6; let d = 3.5; let e = 0.25; let f = 0.1;
  return vec3f(
    (p.z - b) * p.x - d * p.y,
    d * p.x + (p.z - b) * p.y,
    c + a * p.z - p.z * p.z * p.z / 3.0 - (p.x * p.x + p.y * p.y) * (1.0 + e * p.z) + f * p.z * p.x * p.x * p.x);
}

fn curlFlow(p: vec3f, t: f32) -> vec3f {
  let ax_dy = 1.3 * cos(1.3 * p.y + 0.3 * t) + 1.4 * cos(2.8 * p.y - 0.2 * t);
  let ax_dz = 1.05 * cos(2.1 * p.z + 0.2 * t);
  let ay_dz = 1.7 * cos(1.7 * p.z + 0.25 * t) + 1.2 * cos(2.4 * p.z + 0.15 * t);
  let ay_dx = 1.15 * cos(2.3 * p.x + 0.1 * t);
  let az_dx = 1.5 * cos(1.5 * p.x + 0.35 * t) + 1.3 * cos(2.6 * p.x - 0.1 * t);
  let az_dy = 0.95 * cos(1.9 * p.y + 0.15 * t);
  return vec3f(az_dy - ay_dz, ax_dz - az_dx, ay_dx - ax_dy);
}

fn starColor(p: vec3f, v: vec3f, seed: f32) -> vec3f {
  if (P.mode == 0u) {
    let r = length(p.xz);
    let ang = atan2(p.z, p.x);
    let arm = cos(2.0 * (ang - 0.22 * P.time) - 5.0 * log(r + 0.05));
    let m = smoothstep(0.25, 1.0, arm) * smoothstep(0.12, 0.55, r);
    let warm = vec3f(1.0, 0.68, 0.42);
    let cool = vec3f(0.5, 0.68, 1.0);
    var c = select(warm, mix(warm, cool, 0.5), seed > 0.6);
    c = mix(c, cool * 1.3, m * 0.85) * (0.3 + 1.1 * m);
    if (seed > 0.985 && m > 0.45) { c = vec3f(1.6, 0.45, 0.8); }
    c += vec3f(1.0, 0.78, 0.45) * exp(-r * r * 14.0) * 1.3;
    return c;
  }
  if (P.mode == 1u) {
    let s = clamp(length(v) * 0.4, 0.0, 1.0);
    var c = mix(vec3f(0.42, 0.22, 1.0), vec3f(0.15, 0.85, 1.0), s);
    return mix(c, vec3f(1.2, 1.1, 1.0), s * s * 0.3);
  }
  let h = p.y * 0.25 + seed * 0.18 + P.time * 0.04;
  return (0.55 + 0.45 * cos(6.28318 * (vec3f(0.0, 0.33, 0.67) + h))) * vec3f(1.0, 0.85, 1.05);
}

@compute @workgroup_size(256)
fn simulate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= P.count) { return; }
  var p = particles[i].pos.xyz;
  var v = particles[i].vel.xyz;
  let seed = particles[i].pos.w;
  let dt = P.dt;

  if (P.mode == 0u) {
    let r2 = dot(p, p);
    let acc = -p * (0.35 / pow(r2 + 0.02, 1.5) + 0.9 / (r2 + 0.25));
    v += acc * dt;
  } else if (P.mode == 1u) {
    let q = vec3f(p.x, p.z, p.y + 0.45);
    let f = aizawa(q);
    v = mix(v, vec3f(f.x, f.z, f.y) * 0.9, 0.08);
  } else {
    let flow = curlFlow(p * 1.15, P.time) * 0.3 - p * max(0.0, length(p) - 1.7) * 1.2;
    v = mix(v, flow, 0.06);
  }
  for (var k = 0; k < 2; k++) {
    let A = select(P.attr0, P.attr1, k == 1);
    if (A.w != 0.0) {
      let d = A.xyz - p;
      let d2 = dot(d, d) + 0.03;
      v += d * (A.w / (d2 * sqrt(d2))) * dt * 0.1;
    }
  }
  p += v * dt;
  if (!(length(p) < 14.0)) {
    p = (vec3f(hash(seed * 91.7), hash(seed * 13.1), hash(seed * 47.3)) - 0.5) * 0.6;
    v = vec3f(0.0);
  }
  particles[i].pos = vec4f(p, seed);
  particles[i].vel = vec4f(v, 0.0);

  let clip = P.viewProj * vec4f(p, 1.0);
  if (clip.w <= 0.05) { return; }
  let ndc = clip.xy / clip.w;
  if (abs(ndc.x) >= 1.0 || abs(ndc.y) >= 1.0) { return; }
  let w = u32(P.res.x);
  let px = min(u32((ndc.x * 0.5 + 0.5) * P.res.x), w - 1u);
  let py = min(u32((0.5 - ndc.y * 0.5) * P.res.y), u32(P.res.y) - 1u);
  let idx = (py * w + px) * 3u;
  let c = starColor(p, v, seed) * (48.0 / max(0.6, clip.w * 0.3));
  atomicAdd(&accum[idx], u32(c.r));
  atomicAdd(&accum[idx + 1u], u32(c.g));
  atomicAdd(&accum[idx + 2u], u32(c.b));
}
`;

const WGSL_FADE = WGSL_COMMON + /* wgsl */`
@group(0) @binding(2) var<storage, read_write> accum: array<u32>;
@compute @workgroup_size(16, 16)
fn fade(@builtin(global_invocation_id) gid: vec3u) {
  let w = u32(P.res.x);
  if (gid.x >= w || gid.y >= u32(P.res.y)) { return; }
  let i = (gid.y * w + gid.x) * 3u;
  accum[i] = u32(f32(accum[i]) * P.decay);
  accum[i + 1u] = u32(f32(accum[i + 1u]) * P.decay);
  accum[i + 2u] = u32(f32(accum[i + 2u]) * P.decay);
}
`;

const WGSL_DRAW = WGSL_COMMON + /* wgsl */`
@group(0) @binding(2) var<storage, read> accum: array<u32>;
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
fn load(x: i32, y: i32) -> vec3f {
  let w = i32(P.res.x);
  let h = i32(P.res.y);
  let cx = clamp(x, 0, w - 1);
  let cy = clamp(y, 0, h - 1);
  let i = u32(cy * w + cx) * 3u;
  return vec3f(f32(accum[i]), f32(accum[i + 1u]), f32(accum[i + 2u]));
}
@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let x = i32(pos.x);
  let y = i32(pos.y);
  var c = load(x, y);
  let glow = load(x + 2, y) + load(x - 2, y) + load(x, y + 2) + load(x, y - 2);
  c = (c + glow * 0.12) * (P.exposure / 256.0);
  c = 1.0 - exp(-c);
  let uv = pos.xy / P.res;
  let bg = vec3f(0.012, 0.01, 0.028) + vec3f(0.03, 0.015, 0.05) * (1.0 - length(uv - 0.5));
  return vec4f(pow(c, vec3f(0.85)) + bg, 1.0);
}
`;

/* ——— Même physique en GLSL (repli WebGL2) ——— */
const GLSL_COMMON = `
uniform float dt; uniform float time; uniform int mode; uniform vec4 attr0; uniform vec4 attr1;
float hash(float n) { return fract(sin(n) * 43758.5453); }
vec3 aizawa(vec3 p) {
  float a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;
  return vec3((p.z - b) * p.x - d * p.y, d * p.x + (p.z - b) * p.y,
    c + a * p.z - p.z * p.z * p.z / 3.0 - (p.x * p.x + p.y * p.y) * (1.0 + e * p.z) + f * p.z * p.x * p.x * p.x);
}
vec3 curlFlow(vec3 p, float t) {
  float ax_dy = 1.3 * cos(1.3 * p.y + 0.3 * t) + 1.4 * cos(2.8 * p.y - 0.2 * t);
  float ax_dz = 1.05 * cos(2.1 * p.z + 0.2 * t);
  float ay_dz = 1.7 * cos(1.7 * p.z + 0.25 * t) + 1.2 * cos(2.4 * p.z + 0.15 * t);
  float ay_dx = 1.15 * cos(2.3 * p.x + 0.1 * t);
  float az_dx = 1.5 * cos(1.5 * p.x + 0.35 * t) + 1.3 * cos(2.6 * p.x - 0.1 * t);
  float az_dy = 0.95 * cos(1.9 * p.y + 0.15 * t);
  return vec3(az_dy - ay_dz, ax_dz - az_dx, ay_dx - ax_dy);
}
vec3 starColor(vec3 p, vec3 v, float seed) {
  if (mode == 0) {
    float r = length(p.xz);
    float ang = atan(p.z, p.x);
    float arm = cos(2.0 * (ang - 0.22 * time) - 5.0 * log(r + 0.05));
    float m = smoothstep(0.25, 1.0, arm) * smoothstep(0.12, 0.55, r);
    vec3 warm = vec3(1.0, 0.68, 0.42), cool = vec3(0.5, 0.68, 1.0);
    vec3 c = seed > 0.6 ? mix(warm, cool, 0.5) : warm;
    c = mix(c, cool * 1.3, m * 0.85) * (0.3 + 1.1 * m);
    if (seed > 0.985 && m > 0.45) c = vec3(1.6, 0.45, 0.8);
    c += vec3(1.0, 0.78, 0.45) * exp(-r * r * 14.0) * 1.3;
    return c;
  }
  if (mode == 1) {
    float s = clamp(length(v) * 0.4, 0.0, 1.0);
    vec3 c = mix(vec3(0.42, 0.22, 1.0), vec3(0.15, 0.85, 1.0), s);
    return mix(c, vec3(1.2, 1.1, 1.0), s * s * 0.3);
  }
  float h = p.y * 0.25 + seed * 0.18 + time * 0.04;
  return (0.55 + 0.45 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + h))) * vec3(1.0, 0.85, 1.05);
}
`;

const GLSL_UPDATE = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aPos;
layout(location = 1) in vec4 aVel;
out vec4 vPos;
out vec4 vVel;
${GLSL_COMMON}
void main() {
  vec3 p = aPos.xyz, v = aVel.xyz;
  float seed = aPos.w;
  if (mode == 0) {
    float r2 = dot(p, p);
    v += -p * (0.35 / pow(r2 + 0.02, 1.5) + 0.9 / (r2 + 0.25)) * dt;
  } else if (mode == 1) {
    vec3 f = aizawa(vec3(p.x, p.z, p.y + 0.45));
    v = mix(v, vec3(f.x, f.z, f.y) * 0.9, 0.08);
  } else {
    vec3 flow = curlFlow(p * 1.15, time) * 0.3 - p * max(0.0, length(p) - 1.7) * 1.2;
    v = mix(v, flow, 0.06);
  }
  for (int k = 0; k < 2; k++) {
    vec4 A = k == 0 ? attr0 : attr1;
    if (A.w != 0.0) {
      vec3 d = A.xyz - p;
      float d2 = dot(d, d) + 0.03;
      v += d * (A.w / (d2 * sqrt(d2))) * dt * 0.1;
    }
  }
  p += v * dt;
  if (!(length(p) < 14.0)) {
    p = (vec3(hash(seed * 91.7), hash(seed * 13.1), hash(seed * 47.3)) - 0.5) * 0.6;
    v = vec3(0.0);
  }
  vPos = vec4(p, seed);
  vVel = vec4(v, 0.0);
}`;

const GLSL_DISCARD_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`;

const GLSL_POINTS_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aPos;
layout(location = 1) in vec4 aVel;
uniform mat4 viewProj;
uniform float pointSize;
uniform float gain;
out vec3 vCol;
${GLSL_COMMON}
void main() {
  vec4 clip = viewProj * vec4(aPos.xyz, 1.0);
  gl_Position = clip;
  gl_PointSize = pointSize;
  vCol = starColor(aPos.xyz, aVel.xyz, aPos.w) * gain / max(0.6, clip.w * 0.3);
}`;

const GLSL_POINTS_FS = `#version 300 es
precision highp float;
in vec3 vCol;
out vec4 o;
void main() { o = vec4(vCol, 1.0); }`;

const GLSL_TONEMAP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 texel;
uniform float exposure;
void main() {
  vec3 c = texture(uTex, vUv).rgb;
  vec3 g = texture(uTex, vUv + vec2(2.0, 0.0) * texel).rgb + texture(uTex, vUv - vec2(2.0, 0.0) * texel).rgb
         + texture(uTex, vUv + vec2(0.0, 2.0) * texel).rgb + texture(uTex, vUv - vec2(0.0, 2.0) * texel).rgb;
  c = 1.0 - exp(-(c + g * 0.12) * exposure);
  vec3 bg = vec3(0.012, 0.01, 0.028) + vec3(0.03, 0.015, 0.05) * (1.0 - length(vUv - 0.5));
  o = vec4(pow(c, vec3(0.85)) + bg, 1.0);
}`;

const GLSL_FADE = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(0.0); }`;

/* ——— Conditions initiales ——— */
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function aizawaWalker() {
  const w = { x: 0.1, y: 0, z: 0, fx: 0, fy: 0, fz: 0 };
  w.step = () => {
    const { x, y, z } = w;
    w.fx = (z - 0.7) * x - 3.5 * y;
    w.fy = 3.5 * x + (z - 0.7) * y;
    w.fz = 0.6 + 0.95 * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x;
    w.x += w.fx * 0.004; w.y += w.fy * 0.004; w.z += w.fz * 0.004;
  };
  for (let i = 0; i < 4000; i++) w.step();
  return w;
}

function initialState(n, mode) {
  const data = new Float32Array(n * 8);
  const aiz = mode === 1 ? aizawaWalker() : null;
  for (let i = 0; i < n; i++) {
    const o = i * 8;
    const seed = Math.random();
    let x, y, z, vx = 0, vy = 0, vz = 0;
    if (mode === 0) {
      if (Math.random() < 0.14) {
        x = gauss() * 0.22; y = gauss() * 0.14; z = gauss() * 0.22;
        vx = gauss() * 0.35; vy = gauss() * 0.25; vz = gauss() * 0.35;
      } else {
        const arm = i % 2;
        const r = 0.18 + Math.pow(Math.random(), 0.9) * 2.4;
        const th = arm * Math.PI + Math.log(r + 0.05) * 2.5 + gauss() * (0.28 + 0.1 * r);
        x = r * Math.cos(th); z = r * Math.sin(th);
        y = gauss() * 0.035 * (1 + r * 0.4);
        const r2 = r * r;
        const a = r * (0.35 / Math.pow(r2 + 0.02, 1.5) + 0.9 / (r2 + 0.25));
        const vc = Math.sqrt(r * a) * (0.97 + Math.random() * 0.05);
        vx = Math.sin(th) * vc; vz = -Math.cos(th) * vc;
      }
    } else if (mode === 1) {
      // Particules semées le long d'une trajectoire : elles démarrent directement sur l'attracteur.
      for (let k = 0; k < 3; k++) aiz.step();
      const j = 0.012;
      x = aiz.x + gauss() * j; y = aiz.z - 0.45 + gauss() * j; z = aiz.y + gauss() * j;
      vx = aiz.fx * 0.9; vy = aiz.fz * 0.9; vz = aiz.fy * 0.9;
    } else {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.cbrt(Math.random()) * 1.7;
      const s = Math.sqrt(1 - u * u);
      x = r * s * Math.cos(t); y = r * u; z = r * s * Math.sin(t);
    }
    data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = seed;
    data[o + 4] = vx; data[o + 5] = vy; data[o + 6] = vz; data[o + 7] = 0;
  }
  return data;
}

/* ——— Moteur WebGPU ——— */
async function createWebGPU(canvas, onLost) {
  if (!navigator.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 256 * 1024 * 1024),
      maxBufferSize: Math.min(adapter.limits.maxBufferSize, 256 * 1024 * 1024),
    },
  });
  const context = canvas.getContext('webgpu');
  if (!context) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  let destroyed = false;
  device.lost.then((info) => { if (!destroyed) { console.warn('WebGPU perdu', info?.reason, info?.message); onLost(); } });
  device.addEventListener?.('uncapturederror', (e) => console.error('WebGPU', e.error?.message));

  const mod = (code) => device.createShaderModule({ code });
  const simPipe = device.createComputePipeline({ layout: 'auto', compute: { module: mod(WGSL_SIM), entryPoint: 'simulate' } });
  const fadePipe = device.createComputePipeline({ layout: 'auto', compute: { module: mod(WGSL_FADE), entryPoint: 'fade' } });
  const drawMod = mod(WGSL_DRAW);
  const drawPipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: drawMod, entryPoint: 'vs' },
    fragment: { module: drawMod, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const params = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const paramData = new ArrayBuffer(128);
  const pf = new Float32Array(paramData);
  const pu = new Uint32Array(paramData);
  let particles = null, accum = null, count = 0, w = 0, h = 0;
  let simBG, fadeBG, drawBG;
  const maxBinding = device.limits.maxStorageBufferBindingSize;

  function bind() {
    if (!particles || !accum) return;
    simBG = device.createBindGroup({ layout: simPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: params } }, { binding: 1, resource: { buffer: particles } }, { binding: 2, resource: { buffer: accum } }] });
    fadeBG = device.createBindGroup({ layout: fadePipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: params } }, { binding: 2, resource: { buffer: accum } }] });
    drawBG = device.createBindGroup({ layout: drawPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: params } }, { binding: 2, resource: { buffer: accum } }] });
  }

  return {
    kind: 'WebGPU',
    maxPixels: Math.floor(maxBinding / 12),
    setParticles(n, mode) {
      particles?.destroy();
      count = n;
      particles = device.createBuffer({ size: n * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(particles, 0, initialState(n, mode));
      bind();
    },
    reset(mode) { device.queue.writeBuffer(particles, 0, initialState(count, mode)); },
    resize(nw, nh) {
      if (nw === w && nh === h) return;
      w = nw; h = nh;
      canvas.width = w; canvas.height = h;
      accum?.destroy();
      accum = device.createBuffer({ size: Math.max(16, w * h * 12), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      bind();
    },
    frame(u) {
      if (!simBG) return;
      pf.set(u.viewProj, 0);
      pf.set(u.attr0, 16);
      pf.set(u.attr1, 20);
      pf[24] = w; pf[25] = h; pf[26] = u.dt; pf[27] = u.time;
      pu[28] = u.mode; pu[29] = count; pf[30] = u.exposure; pf[31] = u.decay;
      device.queue.writeBuffer(params, 0, paramData);
      const enc = device.createCommandEncoder();
      if (u.decay <= 0.001) enc.clearBuffer(accum);
      const cp = enc.beginComputePass();
      if (u.decay > 0.001) {
        cp.setPipeline(fadePipe);
        cp.setBindGroup(0, fadeBG);
        cp.dispatchWorkgroups(Math.ceil(w / 16), Math.ceil(h / 16));
      }
      cp.setPipeline(simPipe);
      cp.setBindGroup(0, simBG);
      cp.dispatchWorkgroups(Math.ceil(count / 256));
      cp.end();
      const rp = enc.beginRenderPass({ colorAttachments: [{
        view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      rp.setPipeline(drawPipe);
      rp.setBindGroup(0, drawBG);
      rp.draw(3);
      rp.end();
      device.queue.submit([enc.finish()]);
    },
    destroy() {
      destroyed = true;
      particles?.destroy(); accum?.destroy(); params.destroy();
      context.unconfigure?.();
      device.destroy();
    },
  };
}

/* ——— Moteur WebGL2 (repli) ——— */
function createWebGL(canvas) {
  const gl = createGL(canvas);
  if (!gl) return null;
  const fmtF = floatFormats(gl);
  if (!fmtF) return null;
  const upd = program(gl, GLSL_UPDATE, GLSL_DISCARD_FS, { feedback: ['vPos', 'vVel'] });
  const pts = program(gl, GLSL_POINTS_VS, GLSL_POINTS_FS);
  const tone = fullscreen(gl, GLSL_TONEMAP);
  const fade = fullscreen(gl, GLSL_FADE);
  let bufs = [], vaos = [], tf = gl.createTransformFeedback(), cur = 0, count = 0, target = null, w = 0, h = 0;
  const emptyVao = gl.__vao;

  function makeVao(buf) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(emptyVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, null); // sinon conflit avec la cible du transform feedback
    return vao;
  }
  const setCommon = (prog, u) => {
    gl.uniform1f(prog.u.dt, u.dt);
    gl.uniform1f(prog.u.time, u.time);
    gl.uniform1i(prog.u.mode, u.mode);
    gl.uniform4fv(prog.u.attr0, u.attr0);
    gl.uniform4fv(prog.u.attr1, u.attr1);
  };

  return {
    kind: 'WebGL2',
    gl,
    maxPixels: 16e6,
    setParticles(n, mode) {
      bufs.forEach((b) => gl.deleteBuffer(b));
      vaos.forEach((v) => gl.deleteVertexArray(v));
      count = n;
      const data = initialState(n, mode);
      bufs = [0, 1].map(() => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY); return b; });
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      vaos = bufs.map(makeVao);
      cur = 0;
    },
    reset(mode) {
      const data = initialState(count, mode);
      bufs.forEach((b) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); });
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
    resize(nw, nh) {
      if (nw === w && nh === h) return;
      w = nw; h = nh;
      canvas.width = w; canvas.height = h;
      target?.dispose();
      target = createTarget(gl, w, h, fmtF.rgba, gl.NEAREST);
    },
    frame(u) {
      if (!target || !count) return;
      // 1. Intégration par transform feedback
      upd.use();
      setCommon(upd, u);
      gl.bindVertexArray(vaos[cur]);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bufs[1 - cur]);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.endTransformFeedback();
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      cur = 1 - cur;
      // 2. Rémanence : atténue l'accumulation précédente
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, w, h);
      gl.enable(gl.BLEND);
      gl.bindVertexArray(emptyVao);
      fade.use();
      gl.blendColor(0, 0, 0, u.decay);
      gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 3. Points en mélange additif
      gl.blendFunc(gl.ONE, gl.ONE);
      pts.use();
      setCommon(pts, u);
      gl.uniformMatrix4fv(pts.u.viewProj, false, u.viewProj);
      gl.uniform1f(pts.u.pointSize, 1.0);
      gl.uniform1f(pts.u.gain, 48 / 256);
      gl.bindVertexArray(vaos[cur]);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.disable(gl.BLEND);
      // 4. Tonemapping vers l'écran
      gl.bindVertexArray(emptyVao);
      tone.use();
      gl.uniform1i(tone.u.uTex, target.bind(0));
      gl.uniform2f(tone.u.texel, 1 / w, 1 / h);
      gl.uniform1f(tone.u.exposure, u.exposure);
      drawFullscreen(gl, null);
    },
    destroy() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}

/* ——— Module ——— */
// Après deux pertes du périphérique WebGPU, on bascule durablement sur WebGL2.
let gpuFailures = 0;

export async function create(ctx) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Simulation de particules');
  ctx.host.append(canvas);
  const low = ctx.quality === 'low';
  let lost = false;

  let engine = null;
  if (gpuFailures < 2) {
    try {
      engine = await createWebGPU(canvas, () => { lost = true; gpuFailures++; ctx.remount(); });
    } catch (err) { console.warn('WebGPU indisponible', err); engine = null; }
  }
  let offGuard = () => {};
  if (!engine) {
    // Un canvas déjà lié à un contexte ne peut pas en changer : on repart d'un canvas neuf.
    const fresh = canvas.cloneNode();
    canvas.replaceWith(fresh);
    engine = createWebGL(fresh);
    if (!engine) throw new Error('Ni WebGPU ni WebGL2 avec textures flottantes ne sont disponibles.');
    offGuard = guardContext(fresh, () => { lost = true; }, () => ctx.remount());
  }
  const view = engine.kind === 'WebGPU' ? canvas : ctx.host.querySelector('canvas');

  const counts = engine.kind === 'WebGPU'
    ? [{ value: 1 << 18, label: '262 k' }, { value: 1 << 20, label: '1 M' }, { value: 1 << 21, label: '2 M' }]
    : [{ value: 1 << 16, label: '65 k' }, { value: 1 << 18, label: '262 k' }, { value: 1 << 19, label: '524 k' }];
  const state = {
    mode: 0,
    count: counts[low ? 0 : 1].value,
    trails: true,
    orbit: true,
    yaw: 0.4, pitch: MODES[0].pitch, dist: MODES[0].dist,
    time: 0,
  };
  engine.setParticles(state.count, state.mode);

  let cssW = 1, cssH = 1;
  const offSize = observeSize(view, (w, h, dpr) => {
    cssW = w; cssH = h;
    let s = Math.min(dpr, low ? 1.25 : 2);
    const maxPx = Math.min(engine.maxPixels, low ? 2.2e6 : 4.2e6);
    if (w * h * s * s > maxPx) s = Math.sqrt(maxPx / (w * h));
    engine.resize(Math.max(2, Math.round(w * s)), Math.max(2, Math.round(h * s)));
  });

  /* Caméra */
  const FOV = (50 * Math.PI) / 180;
  function camera() {
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const eye = [state.dist * cp * Math.sin(state.yaw), state.dist * sp, state.dist * cp * Math.cos(state.yaw)];
    const zAxis = norm(eye);
    const xAxis = norm(cross([0, 1, 0], zAxis));
    const yAxis = cross(zAxis, xAxis);
    const viewM = new Float32Array([
      xAxis[0], yAxis[0], zAxis[0], 0,
      xAxis[1], yAxis[1], zAxis[1], 0,
      xAxis[2], yAxis[2], zAxis[2], 0,
      -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1]);
    const aspect = cssW / cssH;
    const f = 1 / Math.tan(FOV / 2), near = 0.05, far = 100, nf = 1 / (near - far);
    const proj = new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
    return { eye, xAxis, yAxis, zAxis, viewProj: mul(proj, viewM), aspect };
  }
  function worldAt(px, py) {
    const cam = camera();
    const nx = (px / cssW) * 2 - 1, ny = 1 - (py / cssH) * 2;
    const t = Math.tan(FOV / 2);
    const dir = norm([
      -cam.zAxis[0] + cam.xAxis[0] * nx * t * cam.aspect + cam.yAxis[0] * ny * t,
      -cam.zAxis[1] + cam.xAxis[1] * nx * t * cam.aspect + cam.yAxis[1] * ny * t,
      -cam.zAxis[2] + cam.xAxis[2] * nx * t * cam.aspect + cam.yAxis[2] * ny * t]);
    const denom = dot(dir, cam.zAxis);
    const k = Math.abs(denom) > 1e-5 ? -dot(cam.eye, cam.zAxis) / denom : state.dist;
    return [cam.eye[0] + dir[0] * k, cam.eye[1] + dir[1] * k, cam.eye[2] + dir[2] * k];
  }

  /* Interaction */
  const attractors = new Map();
  let shock = 0, lastTap = 0, lastInteract = 0;
  const offPointers = trackPointers(view, {
    down(p, all) {
      lastInteract = performance.now();
      const orbitGesture = p.type === 'mouse' ? (p.button === 2 || p.shift) : all.size >= 2;
      if (all.size >= 2) attractors.clear();
      if (!orbitGesture) {
        attractors.set(p.id, worldAt(p.x, p.y));
        ctx.haptic('light');
      }
      const now = performance.now();
      if (all.size === 1 && now - lastTap < 300) { shock = 0.35; ctx.haptic('heavy'); }
      lastTap = now;
    },
    move(p, isDown, all) {
      if (!isDown) return;
      lastInteract = performance.now();
      const orbitGesture = p.type === 'mouse' ? (p.button === 2 || p.shift) : all.size >= 2;
      if (orbitGesture) {
        const k = (all.size >= 2 ? 0.5 : 1) * 3.2 / Math.max(p.w, p.h);
        state.yaw -= p.dx * k;
        state.pitch = clamp(state.pitch + p.dy * k, -1.4, 1.4);
      } else if (attractors.has(p.id)) {
        attractors.set(p.id, worldAt(p.x, p.y));
      }
    },
    up(p) { attractors.delete(p.id); },
    pinch({ scale }) { state.dist = clamp(state.dist / scale, 1.2, 14); },
    wheel(e) { state.dist = clamp(state.dist * Math.exp(e.deltaY * 0.001), 1.2, 14); lastInteract = performance.now(); },
  });

  // Compense la densité : moins de particules, chacune plus lumineuse.
  const exposureFor = (m) => m.exposure * ((1 << 20) / state.count) ** 0.6 * ((view.width * view.height) / 1.7e6) ** 0.5;

  /* Boucle */
  let fpsClock = 0;
  const offLoop = ctx.loop.add((t, dt) => {
    if (lost) return;
    const step = Math.min(dt, 1 / 30);
    state.time += step;
    if (state.orbit && performance.now() - lastInteract > 2000 && !attractors.size) state.yaw += step * 0.06;
    const cam = camera();
    const list = [...attractors.values()];
    const strength = shock > 0 ? -9 : 1.6;
    const a0 = shock > 0 ? [0, 0, 0, strength] : list[0] ? [...list[0], strength] : [0, 0, 0, 0];
    const a1 = list[1] ? [...list[1], strength] : [0, 0, 0, 0];
    shock = Math.max(0, shock - step);
    const m = MODES[state.mode];
    engine.frame({
      viewProj: cam.viewProj, attr0: a0, attr1: a1, dt: step, time: state.time, mode: state.mode,
      exposure: exposureFor(m),
      decay: state.trails ? m.decay : 0,
    });
    fpsClock += dt;
    if (fpsClock > 0.5) {
      fpsClock = 0;
      ctx.setStatus(`${fmt.format(state.count)} particules · ${engine.kind}${engine.kind === 'WebGPU' ? ' compute' : ''} · ${Math.round(1000 / ctx.loop.frameMs(20))} ips`);
    }
  });

  /* Commandes */
  const d = ctx.dock;
  function setMode(i) {
    state.mode = i;
    modeSeg.set(i);
    state.dist = MODES[i].dist;
    state.pitch = MODES[i].pitch;
    engine.reset(i);
  }
  const modeSeg = d.segment(MODES.map((m) => ({ value: m.id, label: m.label })), state.mode, (v) => setMode(v));
  d.row();
  d.segment(counts, state.count, (v) => { state.count = v; engine.setParticles(v, state.mode); }, { label: 'Nombre' });
  d.toggle('Traînées', state.trails, (v) => { state.trails = v; });
  d.toggle('Orbite', state.orbit, (v) => { state.orbit = v; });
  d.button('Big bang', () => { engine.reset(state.mode); ctx.haptic('heavy'); });

  ctx.setStatus(`${fmt.format(state.count)} particules · ${engine.kind}`);
  ctx.hint(engine.kind === 'WebGPU' ? 'Un million d’étoiles' : 'Mode WebGL2', ctx.isTouch
    ? 'Un doigt attire les étoiles. Deux doigts tournent et zooment. Double-touchez pour une onde de choc.'
    : 'Clic gauche : attirer. Clic droit : tourner. Molette : zoom. Double-clic : onde de choc.');

  return {
    shortcuts: [['G / A / T', 'Galaxie, Attracteur, Tourbillon'], ['B', 'Onde de choc'], ['R', 'Big bang']],
    key(e) {
      const k = e.key.toLowerCase();
      if (k === 'g') { setMode(0); return true; }
      if (k === 'a') { setMode(1); return true; }
      if (k === 't') { setMode(2); return true; }
      if (k === 'b') { shock = 0.35; return true; }
      if (k === 'r') { engine.reset(state.mode); return true; }
      return false;
    },
    capture() {
      const cam = camera();
      const m = MODES[state.mode];
      engine.frame({ viewProj: cam.viewProj, attr0: [0, 0, 0, 0], attr1: [0, 0, 0, 0], dt: 0.0001, time: state.time, mode: state.mode, exposure: exposureFor(m), decay: state.trails ? m.decay : 0 });
      return canvasToBlob(view);
    },
    destroy() {
      offLoop(); offPointers(); offSize(); offGuard();
      engine.destroy();
    },
  };
}
