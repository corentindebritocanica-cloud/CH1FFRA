// Fractale — ray-marching de fractales 3D (Mandelbulb, Mandelbox, éponge de Menger) par estimation de distance.
// Ombres douces, occlusion ambiante, halo de proximité, résolution dynamique et affinage à l'arrêt.
import { createGL, fullscreen, drawFullscreen, guardContext } from '../core/gl.js';
import { trackPointers, observeSize, canvasToBlob, clamp } from '../core/kit.js';

export const info = {
  title: 'Fractale · comment ça marche',
  html: `<p>Aucun polygone ici : chaque pixel lance un rayon dans une scène définie par une <b>fonction de distance</b>. Le rayon avance par bonds sûrs (<i>sphere tracing</i>) jusqu’à toucher la surface fractale.</p>
  <ul>
    <li><b>Mandelbulb</b> : extension 3D de l’ensemble de Mandelbrot en coordonnées sphériques, puissance ${'<i>n</i>'} animée.</li>
    <li><b>Mandelbox</b> : repliements de boîte et de sphère itérés.</li>
    <li><b>Éponge de Menger</b> : un cube évidé récursivement.</li>
  </ul>
  <p>L’éclairage combine ombres douces, occlusion ambiante, reflet spéculaire et un halo calculé à partir du nombre de pas. La couleur vient d’un <b>piège d’orbite</b> : la distance minimale atteinte pendant les itérations.</p>
  <p>La <b>résolution s’adapte</b> en continu pour tenir la fluidité, puis l’image s’affine à pleine définition dès que vous arrêtez de bouger, et le GPU se met au repos.</p>
  <h3>Gestes</h3><p>Glissez pour tourner, pincez ou utilisez la molette pour zoomer, touchez deux fois pour recadrer.</p>
  <h3>Clavier</h3><p><code>←</code> <code>→</code> <code>↑</code> <code>↓</code> tourner · <code>+</code> <code>−</code> zoom · <code>M</code> changer de fractale · <code>R</code> recadrer.</p>`,
};

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 res;
uniform vec3 camPos;
uniform mat3 camRot;
uniform float morph;
uniform int kind;
uniform int maxSteps;
uniform float detail;
uniform float bound;
uniform int palette;
uniform float time;

vec3 pal(float t) {
  if (palette == 0) return 0.5 + 0.5 * cos(6.28318 * (vec3(1.0) * t + vec3(0.0, 0.33, 0.67)));
  if (palette == 1) return vec3(0.55, 0.32, 0.18) + vec3(0.45, 0.3, 0.2) * cos(6.28318 * (vec3(1.0) * t + vec3(0.0, 0.08, 0.16)));
  if (palette == 2) return 0.5 + 0.5 * cos(6.28318 * (vec3(0.8, 0.9, 1.0) * t + vec3(0.55, 0.6, 0.7)));
  return vec3(0.85, 0.82, 0.78) - 0.35 * cos(6.28318 * (vec3(0.3) * t));
}

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float deBulb(vec3 p, out vec4 trap) {
  float power = 8.0 + 2.5 * sin(morph);
  vec3 z = p;
  float dr = 1.0, r = 0.0;
  trap = vec4(abs(z), dot(z, z));
  for (int i = 0; i < 9; i++) {
    r = length(z);
    if (r > 2.0) break;
    float theta = acos(clamp(z.z / r, -1.0, 1.0)) * power;
    float phi = atan(z.y, z.x) * power;
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    z = pow(r, power) * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta)) + p;
    trap = min(trap, vec4(abs(z), dot(z, z)));
  }
  return 0.5 * log(max(r, 1e-6)) * r / dr;
}

float deBox(vec3 pos, out vec4 trap) {
  const float S = -2.2;
  float mr2 = 0.22 + 0.12 * sin(morph);
  vec4 scalev = vec4(S, S, S, abs(S)) / mr2;
  float c1 = abs(S - 1.0), c2 = pow(abs(S), -10.0);
  vec4 p = vec4(pos, 1.0), p0 = p;
  trap = vec4(1e5);
  for (int i = 0; i < 11; i++) {
    p.xyz = clamp(p.xyz, -1.0, 1.0) * 2.0 - p.xyz;
    float r2 = dot(p.xyz, p.xyz);
    trap = min(trap, vec4(abs(p.xyz) * 0.3, r2));
    p *= clamp(max(mr2 / r2, mr2), 0.0, 1.0);
    p = p * scalev + p0;
  }
  return (length(p.xyz) - c1) / p.w - c2;
}

float sdBox(vec3 p, vec3 b) { vec3 d = abs(p) - b; return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0)); }

float deMenger(vec3 p, out vec4 trap) {
  float d = sdBox(p, vec3(1.0));
  float s = 1.0;
  trap = vec4(1.0, 1.0, 1.0, 1.0);
  float tw = 0.18 * sin(morph);
  for (int m = 0; m < 5; m++) {
    p.xy *= rot(tw);
    p.yz *= rot(tw * 0.7);
    vec3 a = mod(p * s, 2.0) - 1.0;
    s *= 3.0;
    vec3 r = abs(1.0 - 3.0 * abs(a));
    float da = max(r.x, r.y), db = max(r.y, r.z), dc = max(r.z, r.x);
    float c = (min(da, min(db, dc)) - 1.0) / s;
    if (c > d) { d = c; trap = vec4(r * 0.33, float(m) / 4.0); }
  }
  return d;
}

float map(vec3 p, out vec4 trap) {
  if (kind == 0) return deBulb(p, trap);
  if (kind == 1) return deBox(p, trap);
  return deMenger(p, trap);
}
float mapD(vec3 p) { vec4 t; return map(p, t); }

vec3 calcNormal(vec3 p, float e) {
  const vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * mapD(p + k.xyy * e) + k.yyx * mapD(p + k.yyx * e) + k.yxy * mapD(p + k.yxy * e) + k.xxx * mapD(p + k.xxx * e));
}

float softShadow(vec3 ro, vec3 rd, float k, float scale) {
  float res = 1.0, t = 0.01 * scale;
  for (int i = 0; i < 28; i++) {
    float h = mapD(ro + rd * t);
    res = min(res, k * h / t);
    t += clamp(h, 0.004 * scale, 0.25 * scale);
    if (res < 0.004 || t > 3.0 * scale) break;
  }
  return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n, float scale) {
  float occ = 0.0, w = 1.0;
  for (int i = 1; i <= 5; i++) {
    float hh = 0.012 * scale + 0.06 * scale * float(i);
    occ += (hh - mapD(p + n * hh)) * w;
    w *= 0.7;
  }
  return clamp(1.0 - 2.2 * occ / scale, 0.0, 1.0);
}

vec2 sphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd), c = dot(ro, ro) - r * r, h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

vec3 background(vec3 rd) {
  float g = 0.5 + 0.5 * rd.y;
  vec3 c = mix(vec3(0.012, 0.012, 0.02), vec3(0.05, 0.045, 0.07), g);
  c += pal(0.15) * 0.05 * pow(max(0.0, 1.0 - abs(rd.y)), 6.0);
  return c;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  vec3 rd = normalize(camRot * vec3(uv, -1.6));
  vec3 ro = camPos;
  vec3 col = background(rd);
  vec2 bs = sphere(ro, rd, bound);
  float glow = 0.0;
  if (bs.y > 0.0) {
    float t = max(bs.x, 0.0);
    float tEnd = bs.y;
    vec4 trap;
    bool hit = false;
    int steps = 0;
    for (int i = 0; i < 400; i++) {
      if (i >= maxSteps) break;
      vec3 p = ro + rd * t;
      float d = map(p, trap);
      float eps = detail * t;
      steps = i;
      if (d < eps) { hit = true; break; }
      glow += exp(-d * 60.0 / bound) * 0.018;
      t += d * (kind == 0 ? 0.85 : 0.95);
      if (t > tEnd) break;
    }
    float scale = bound / 1.25;
    if (hit) {
      vec3 p = ro + rd * t;
      vec3 n = calcNormal(p, max(detail * t * 0.5, 1e-5));
      float fre0 = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 2.0);
      vec3 base = pal(clamp(sqrt(trap.w) * 0.55 + trap.x * 0.35 + 0.05 * trap.y, 0.0, 1.0) + 0.14 * n.y + 0.2 * fre0);
      base = mix(base, vec3(0.9), 0.08);
      vec3 L = normalize(vec3(0.6, 0.75, 0.35));
      float dif = clamp(dot(n, L), 0.0, 1.0);
      float sha = dif > 0.001 ? softShadow(p + n * 0.002 * scale, L, 10.0, scale) : 0.0;
      float ao = calcAO(p, n, scale);
      float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
      vec3 hal = normalize(L - rd);
      float spe = pow(clamp(dot(n, hal), 0.0, 1.0), 48.0) * dif * sha;
      float sky = clamp(0.5 + 0.5 * n.y, 0.0, 1.0);
      vec3 lin = vec3(1.25, 1.1, 0.95) * dif * sha * 2.1;
      lin += vec3(0.35, 0.42, 0.6) * sky * ao * 0.9;
      lin += vec3(0.5, 0.35, 0.3) * clamp(dot(n, -L), 0.0, 1.0) * ao * 0.35;
      col = base * lin + spe * 1.4 + fre * ao * 0.35 * pal(0.3);
      col *= 0.55 + 0.45 * ao;
      float fog = 1.0 - exp(-0.02 * t * t / (scale * scale));
      col = mix(col, background(rd), fog);
    }
    col += pal(0.62 + 0.1 * sin(time * 0.2)) * glow * (hit ? 0.25 : 0.9);
  }
  vec2 q = gl_FragCoord.xy / res;
  col *= 0.35 + 0.65 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.18);
  col = aces(col * 1.1);
  col = pow(col, vec3(0.4545));
  o = vec4(col, 1.0);
}`;

const KINDS = [
  { id: 0, label: 'Mandelbulb', bound: 1.25, dist: 3.3, min: 1.35, max: 6 },
  { id: 1, label: 'Mandelbox', bound: 5.2, dist: 11.5, min: 1.2, max: 22 },
  { id: 2, label: 'Menger', bound: 1.8, dist: 4.4, min: 0.4, max: 8 },
];

export async function create(ctx) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Fractale 3D interactive');
  ctx.host.append(canvas);
  const gl = createGL(canvas);
  if (!gl) throw new Error('WebGL2 est nécessaire pour le ray-marching.');
  const P = fullscreen(gl, FS);
  const low = ctx.quality === 'low';

  const state = {
    kind: 0, palette: 0, morph: true, orbit: true,
    yaw: 0.6, pitch: 0.35, dist: KINDS[0].dist,
    vYaw: 0, vPitch: 0, phase: 0,
  };
  let cssW = 1, cssH = 1, dpr = 1;
  const maxScale = () => Math.min(dpr, low ? 1.25 : 2);
  let scale = low ? 0.5 : 0.8;
  let dirty = true, refined = false, lastInteract = performance.now(), holdUp = 0, adaptClock = 0;

  const offSize = observeSize(canvas, (w, h, r) => { cssW = w; cssH = h; dpr = r; scale = Math.min(scale, maxScale()); dirty = true; refined = false; });

  function setSize(s) {
    const w = Math.max(2, Math.round(cssW * s)), h = Math.max(2, Math.round(cssH * s));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  function camera() {
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const pos = [state.dist * cp * Math.sin(state.yaw), state.dist * sp, state.dist * cp * Math.cos(state.yaw)];
    const f = pos.map((v) => -v / state.dist);
    let r = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0]; // f × up(0,1,0)
    const rl = Math.hypot(...r) || 1;
    r = r.map((v) => v / rl);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    // colonnes : droite, haut, -avant
    return { pos, rot: [r[0], r[1], r[2], u[0], u[1], u[2], -f[0], -f[1], -f[2]] };
  }

  function draw(t, final) {
    const k = KINDS[state.kind];
    setSize(final ? maxScale() : scale);
    const { pos, rot } = camera();
    P.use();
    gl.uniform2f(P.u.res, canvas.width, canvas.height);
    gl.uniform3fv(P.u.camPos, pos);
    gl.uniformMatrix3fv(P.u.camRot, false, rot);
    gl.uniform1f(P.u.morph, state.phase);
    gl.uniform1i(P.u.kind, k.id);
    gl.uniform1i(P.u.maxSteps, final ? (low ? 180 : 260) : (low ? 90 : 130));
    gl.uniform1f(P.u.detail, (final ? 0.6 : 1.2) / canvas.height);
    gl.uniform1f(P.u.bound, k.bound);
    gl.uniform1i(P.u.palette, state.palette);
    gl.uniform1f(P.u.time, t);
    drawFullscreen(gl, null);
  }

  let lost = false;
  const offLoop = ctx.loop.add((t, dt) => {
    if (lost) return;
    const now = performance.now();
    const idle = now - lastInteract;
    // Inertie et orbite automatique
    if (Math.abs(state.vYaw) > 1e-4 || Math.abs(state.vPitch) > 1e-4) {
      state.yaw += state.vYaw; state.pitch = clamp(state.pitch + state.vPitch, -1.45, 1.45);
      state.vYaw *= 0.9; state.vPitch *= 0.9; dirty = true;
    }
    if (state.orbit && idle > 2500) { state.yaw += dt * 0.12; dirty = true; }
    if (state.morph) { state.phase += dt * 0.35; dirty = true; }

    if (dirty) {
      draw(t, false);
      dirty = false;
      refined = false;
      // Résolution dynamique : vise ~60 images/s
      adaptClock += dt;
      if (adaptClock > 0.5) {
        adaptClock = 0;
        const ms = ctx.loop.frameMs(20);
        if (ms > 21 && scale > 0.3) { scale = Math.max(0.3, scale * 0.85); holdUp = now + 2500; }
        else if (ms < 17.8 && now > holdUp && scale < maxScale()) scale = Math.min(maxScale(), scale * 1.07);
        ctx.setStatus(`${KINDS[state.kind].label} · ${canvas.width}×${canvas.height} · ${Math.round(1000 / ms)} ips`);
      }
    } else if (!refined && idle > 450) {
      draw(t, true);
      refined = true;
      ctx.setStatus(`${KINDS[state.kind].label} · ${canvas.width}×${canvas.height} · affinée, GPU au repos`);
    }
  });

  const touchMoved = () => { lastInteract = performance.now(); dirty = true; };
  let lastTap = 0;
  const offPointers = trackPointers(canvas, {
    down(p, all) {
      touchMoved();
      state.vYaw = state.vPitch = 0;
      const now = performance.now();
      if (all.size === 1 && now - lastTap < 300) reset();
      lastTap = now;
    },
    move(p, isDown, all) {
      if (!isDown || all.size > 1) return;
      const k = 3.2 / Math.max(p.w, p.h);
      state.vYaw = -p.dx * k;
      state.vPitch = p.dy * k;
      state.yaw += state.vYaw;
      state.pitch = clamp(state.pitch + state.vPitch, -1.45, 1.45);
      touchMoved();
    },
    up() { touchMoved(); },
    pinch({ scale: s }) { zoom(1 / s); },
    wheel(e) { zoom(Math.exp(e.deltaY * 0.0012)); },
  });
  function zoom(f) {
    const k = KINDS[state.kind];
    state.dist = clamp(state.dist * f, k.min, k.max);
    touchMoved();
  }
  function reset() {
    const k = KINDS[state.kind];
    state.dist = k.dist; state.yaw = 0.6; state.pitch = 0.35; state.vYaw = state.vPitch = 0;
    touchMoved();
    ctx.haptic('medium');
  }
  function setKind(i) {
    state.kind = i;
    ctx.setStatus(`${KINDS[i].label} · ray-marching WebGL2`);
    kindSeg.set(i);
    state.dist = KINDS[i].dist;
    touchMoved();
  }

  const offGuard = guardContext(canvas, () => { lost = true; }, () => ctx.remount());

  const d = ctx.dock;
  const kindSeg = d.segment(KINDS.map((k) => ({ value: k.id, label: k.label })), state.kind, (v) => setKind(v));
  d.row();
  d.segment([
    { value: 0, label: 'Opale', color: '#b48cff' },
    { value: 1, label: 'Cuivre', color: '#ff8a3d' },
    { value: 2, label: 'Glacier', color: '#3db2ff' },
    { value: 3, label: 'Marbre', color: '#e8e2da' },
  ], state.palette, (v) => { state.palette = v; touchMoved(); });
  d.toggle('Morphose', state.morph, (v) => { state.morph = v; touchMoved(); });
  d.toggle('Orbite', state.orbit, (v) => { state.orbit = v; touchMoved(); });

  ctx.setStatus(`${KINDS[state.kind].label} · ray-marching WebGL2`);
  ctx.hint('Glissez pour tourner', 'Pincez pour plonger dans la fractale. Double-touchez pour recadrer.');

  return {
    shortcuts: [['← → ↑ ↓', 'Tourner'], ['+ / −', 'Zoom'], ['M', 'Fractale suivante'], ['R', 'Recadrer']],
    key(e) {
      const step = 0.08;
      switch (e.key) {
        case 'ArrowLeft': state.yaw -= step; touchMoved(); return true;
        case 'ArrowRight': state.yaw += step; touchMoved(); return true;
        case 'ArrowUp': state.pitch = clamp(state.pitch + step, -1.45, 1.45); touchMoved(); return true;
        case 'ArrowDown': state.pitch = clamp(state.pitch - step, -1.45, 1.45); touchMoved(); return true;
        case '+': case '=': zoom(0.9); return true;
        case '-': case '_': zoom(1.1); return true;
        case 'm': case 'M': setKind((state.kind + 1) % KINDS.length); return true;
        case 'r': case 'R': reset(); return true;
        default: return false;
      }
    },
    capture() {
      draw(performance.now() / 1000, true);
      refined = true;
      return canvasToBlob(canvas);
    },
    destroy() {
      offLoop(); offPointers(); offSize(); offGuard();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
