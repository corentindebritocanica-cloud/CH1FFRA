// Fluide — simulation de Navier-Stokes incompressible sur le GPU (méthode des « stable fluids »).
// Advection semi-lagrangienne, confinement de vorticité, projection de pression par Jacobi,
// relief par normales du colorant, halo lumineux (bloom) multi-échelles, gravité pilotée par le gyroscope.
import { createGL, fullscreen, drawFullscreen, createTarget, createDouble, floatFormats, guardContext } from '../core/gl.js';
import { trackPointers, observeSize, hsv, canvasToBlob, probeOrientation } from '../core/kit.js';

export const info = {
  title: 'Fluide · comment ça marche',
  html: `<p>Chaque image résout les <b>équations de Navier-Stokes</b> d’un fluide incompressible directement sur le GPU, en une douzaine de passes de shaders WebGL2 sur des textures flottantes 16 bits.</p>
  <ul>
    <li><b>Advection</b> semi-lagrangienne : vitesse et couleur sont transportées par le champ de vitesse.</li>
    <li><b>Confinement de vorticité</b> : le rotationnel est mesuré puis réinjecté pour préserver les tourbillons fins.</li>
    <li><b>Projection</b> : 20 itérations de Jacobi résolvent l’équation de Poisson de la pression pour rendre le champ sans divergence.</li>
    <li><b>Rendu</b> : relief calculé à partir du gradient du colorant, puis halo lumineux sur une pyramide de textures.</li>
  </ul>
  <h3>Gestes</h3>
  <p>Glissez un ou plusieurs doigts pour injecter de l’encre. Activez <b>Gravité</b> puis inclinez l’appareil : l’encre coule vers le bas. <b>Rêve</b> laisse le fluide s’animer seul.</p>
  <h3>Clavier</h3><p><code>Espace</code> éclaboussure · <code>C</code> vider · <code>G</code> gravité.</p>`,
};

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
`;

const SH = {
  splat: HEAD + `
uniform sampler2D uTarget; uniform float aspect; uniform vec3 color; uniform vec2 point; uniform float radius;
void main() {
  vec2 p = vUv - point; p.x *= aspect;
  vec3 s = exp(-dot(p, p) / radius) * color;
  o = vec4(texture(uTarget, vUv).xyz + s, 1.0);
}`,
  advect: HEAD + `
uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 texel; uniform float dt; uniform float dissipation;
void main() {
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texel;
  o = texture(uSource, coord) / (1.0 + dissipation * dt);
}`,
  divergence: HEAD + `
uniform sampler2D uVelocity; uniform vec2 texel;
void main() {
  vec2 C = texture(uVelocity, vUv).xy;
  float L = texture(uVelocity, vUv - vec2(texel.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(texel.x, 0.0)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, texel.y)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, texel.y)).y;
  if (vUv.x - texel.x < 0.0) L = -C.x;
  if (vUv.x + texel.x > 1.0) R = -C.x;
  if (vUv.y + texel.y > 1.0) T = -C.y;
  if (vUv.y - texel.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,
  curl: HEAD + `
uniform sampler2D uVelocity; uniform vec2 texel;
void main() {
  float L = texture(uVelocity, vUv - vec2(texel.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(texel.x, 0.0)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, texel.y)).x;
  float B = texture(uVelocity, vUv - vec2(0.0, texel.y)).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,
  vorticity: HEAD + `
uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform vec2 texel; uniform float curl; uniform float dt;
void main() {
  float L = texture(uCurl, vUv - vec2(texel.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(texel.x, 0.0)).x;
  float T = texture(uCurl, vUv + vec2(0.0, texel.y)).x;
  float B = texture(uCurl, vUv - vec2(0.0, texel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 0.0001;
  f *= curl * C;
  f.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + f * dt;
  o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,
  pressure: HEAD + `
uniform sampler2D uPressure; uniform sampler2D uDivergence; uniform vec2 texel;
void main() {
  float L = texture(uPressure, vUv - vec2(texel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(texel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, texel.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, texel.y)).x;
  float d = texture(uDivergence, vUv).x;
  o = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
}`,
  gradient: HEAD + `
uniform sampler2D uPressure; uniform sampler2D uVelocity; uniform vec2 texel;
void main() {
  float L = texture(uPressure, vUv - vec2(texel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(texel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, texel.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, texel.y)).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  o = vec4(v, 0.0, 1.0);
}`,
  scale: HEAD + `
uniform sampler2D uTexture; uniform float value;
void main() { o = value * texture(uTexture, vUv); }`,
  gravity: HEAD + `
uniform sampler2D uVelocity; uniform sampler2D uDye; uniform vec2 g; uniform float dt;
void main() {
  float m = clamp(dot(texture(uDye, vUv).rgb, vec3(0.45)), 0.0, 1.2);
  o = vec4(texture(uVelocity, vUv).xy + g * m * dt, 0.0, 1.0);
}`,
  bloomPrefilter: HEAD + `
uniform sampler2D uTexture; uniform vec3 curve; uniform float threshold;
void main() {
  vec3 c = texture(uTexture, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float rq = clamp(br - curve.x, 0.0, curve.y);
  rq = curve.z * rq * rq;
  c *= max(rq, br - threshold) / max(br, 0.0001);
  o = vec4(c, 0.0);
}`,
  blur: HEAD + `
uniform sampler2D uTexture; uniform vec2 texel;
void main() {
  vec4 s = texture(uTexture, vUv + texel * vec2(-1.0, -1.0));
  s += texture(uTexture, vUv + texel * vec2(1.0, -1.0));
  s += texture(uTexture, vUv + texel * vec2(-1.0, 1.0));
  s += texture(uTexture, vUv + texel * vec2(1.0, 1.0));
  o = s * 0.25;
}`,
  display: HEAD + `
uniform sampler2D uTexture; uniform sampler2D uBloom; uniform vec2 texel; uniform float shading; uniform float bloom; uniform float vignette;
void main() {
  vec3 c = texture(uTexture, vUv).rgb;
  if (shading > 0.5) {
    vec3 lc = texture(uTexture, vUv - vec2(texel.x, 0.0)).rgb;
    vec3 rc = texture(uTexture, vUv + vec2(texel.x, 0.0)).rgb;
    vec3 tc = texture(uTexture, vUv + vec2(0.0, texel.y)).rgb;
    vec3 bc = texture(uTexture, vUv - vec2(0.0, texel.y)).rgb;
    float dx = length(rc) - length(lc);
    float dy = length(tc) - length(bc);
    vec3 n = normalize(vec3(dx, dy, length(texel)));
    float diffuse = clamp(dot(n, normalize(vec3(-0.3, 0.4, 1.0))) + 0.7, 0.7, 1.0);
    float spec = pow(clamp(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0, 1.0), 40.0);
    c = c * diffuse + spec * 0.25 * min(1.0, length(c) * 4.0);
  }
  if (bloom > 0.5) {
    vec3 b = texture(uBloom, vUv).rgb;
    c += b;
  }
  vec2 q = vUv - 0.5;
  c *= 1.0 - vignette * dot(q, q) * 1.2;
  // tramage anti-bandes
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`,
};

const PALETTES = {
  spectre: (t) => hsv(t % 1, 1, 1),
  ocean: (t) => hsv(0.5 + 0.16 * Math.sin(t * 6.1), 0.55 + 0.4 * Math.abs(Math.sin(t * 3.3)), 1),
  magma: (t) => hsv((0.97 + 0.14 * Math.abs(Math.sin(t * 5.7))) % 1, 0.9, 1),
  aurore: (t) => { const hs = [0.33, 0.45, 0.52, 0.78, 0.86]; return hsv(hs[Math.floor(t * 17) % hs.length], 0.85, 1); },
  encre: (t) => { const v = 0.6 + 0.4 * Math.abs(Math.sin(t * 7)); return [v, v, v * 1.05]; },
};

export async function create(ctx) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Simulation de fluide interactive');
  ctx.host.append(canvas);
  const gl = createGL(canvas);
  if (!gl) throw new Error('WebGL2 est nécessaire pour la simulation.');
  const fmt = floatFormats(gl);
  if (!fmt) throw new Error('Ce GPU ne peut pas rendre dans des textures flottantes.');

  const low = ctx.quality === 'low';
  const cfg = {
    simRes: low ? 96 : 128,
    dyeRes: low ? 512 : 1024,
    densityDissipation: 0.9,
    velocityDissipation: 0.25,
    pressure: 0.8,
    iterations: low ? 14 : 22,
    curl: 28,
    splatRadius: 0.22,
    splatForce: 6000,
    shading: true,
    bloom: true,
    bloomIntensity: 0.75,
    bloomThreshold: 0.55,
    bloomKnee: 0.7,
    palette: 'spectre',
    dream: true,
    gravity: false,
  };

  const P = {};
  for (const [k, src] of Object.entries(SH)) P[k] = fullscreen(gl, src);

  let vel, dye, divergence, curlT, pressure, bloomBase, bloomMips = [];
  let simW = 0, simH = 0, dyeW = 0, dyeH = 0;

  const resFor = (base) => {
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspect < 1) aspect = 1 / aspect;
    const min = Math.round(base), max = Math.round(base * aspect);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? [max, min] : [min, max];
  };

  function allocate() {
    [vel, dye, divergence, curlT, pressure, bloomBase].forEach((t) => t?.dispose());
    bloomMips.forEach((t) => t.dispose());
    [simW, simH] = resFor(cfg.simRes);
    [dyeW, dyeH] = resFor(cfg.dyeRes);
    const L = gl.LINEAR, N = gl.NEAREST;
    vel = createDouble(gl, simW, simH, fmt.rg, L);
    dye = createDouble(gl, dyeW, dyeH, fmt.rgba, L);
    divergence = createTarget(gl, simW, simH, fmt.r, N);
    curlT = createTarget(gl, simW, simH, fmt.r, N);
    pressure = createDouble(gl, simW, simH, fmt.r, N);
    const [bw, bh] = resFor(256);
    bloomBase = createTarget(gl, bw, bh, fmt.rgba, L);
    bloomMips = [];
    for (let i = 0, w = bw >> 1, h = bh >> 1; i < 6 && w >= 2 && h >= 2; i++, w >>= 1, h >>= 1) bloomMips.push(createTarget(gl, w, h, fmt.rgba, L));
    ctx.setStatus(`Grille ${simW}×${simH} · encre ${dyeW}×${dyeH} · WebGL2`);
  }

  let lastSize = '';
  const offSize = observeSize(canvas, (w, h, dpr) => {
    const scale = Math.min(dpr, low ? 1.5 : 2);
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const key = String(Math.round((canvas.width / canvas.height) * 5));
    if (key !== lastSize || !vel) { lastSize = key; allocate(); randomSplats(6); }
  });

  /* ——— Passes ——— */
  function splat(x, y, dx, dy, color) {
    const aspect = canvas.width / canvas.height;
    P.splat.use();
    gl.uniform1i(P.splat.u.uTarget, vel.read.bind(0));
    gl.uniform1f(P.splat.u.aspect, aspect);
    gl.uniform2f(P.splat.u.point, x, y);
    gl.uniform3f(P.splat.u.color, dx, dy, 0);
    const r = (cfg.splatRadius / 100) * (aspect > 1 ? aspect : 1);
    gl.uniform1f(P.splat.u.radius, r);
    drawFullscreen(gl, vel.write);
    vel.swap();
    gl.uniform1i(P.splat.u.uTarget, dye.read.bind(0));
    gl.uniform3f(P.splat.u.color, color[0], color[1], color[2]);
    drawFullscreen(gl, dye.write);
    dye.swap();
  }

  let hueT = Math.random();
  const nextColor = (k = 0.15) => { hueT += 0.061; const c = PALETTES[cfg.palette](hueT); return [c[0] * k, c[1] * k, c[2] * k]; };

  function randomSplats(n) {
    for (let i = 0; i < n; i++) {
      const c = nextColor(1.2);
      splat(Math.random(), Math.random(), 1000 * (Math.random() - 0.5), 1000 * (Math.random() - 0.5), c);
    }
  }

  function step(dt) {
    gl.disable(gl.BLEND);
    P.curl.use();
    gl.uniform2fv(P.curl.u.texel, vel.texel);
    gl.uniform1i(P.curl.u.uVelocity, vel.read.bind(0));
    drawFullscreen(gl, curlT);

    P.vorticity.use();
    gl.uniform2fv(P.vorticity.u.texel, vel.texel);
    gl.uniform1i(P.vorticity.u.uVelocity, vel.read.bind(0));
    gl.uniform1i(P.vorticity.u.uCurl, curlT.bind(1));
    gl.uniform1f(P.vorticity.u.curl, cfg.curl);
    gl.uniform1f(P.vorticity.u.dt, dt);
    drawFullscreen(gl, vel.write);
    vel.swap();

    if (cfg.gravity && (grav[0] || grav[1])) {
      P.gravity.use();
      gl.uniform1i(P.gravity.u.uVelocity, vel.read.bind(0));
      gl.uniform1i(P.gravity.u.uDye, dye.read.bind(1));
      gl.uniform2f(P.gravity.u.g, grav[0] * 1400, grav[1] * 1400);
      gl.uniform1f(P.gravity.u.dt, dt);
      drawFullscreen(gl, vel.write);
      vel.swap();
    }

    P.divergence.use();
    gl.uniform2fv(P.divergence.u.texel, vel.texel);
    gl.uniform1i(P.divergence.u.uVelocity, vel.read.bind(0));
    drawFullscreen(gl, divergence);

    P.scale.use();
    gl.uniform1i(P.scale.u.uTexture, pressure.read.bind(0));
    gl.uniform1f(P.scale.u.value, cfg.pressure);
    drawFullscreen(gl, pressure.write);
    pressure.swap();

    P.pressure.use();
    gl.uniform2fv(P.pressure.u.texel, vel.texel);
    gl.uniform1i(P.pressure.u.uDivergence, divergence.bind(1));
    for (let i = 0; i < cfg.iterations; i++) {
      gl.uniform1i(P.pressure.u.uPressure, pressure.read.bind(0));
      drawFullscreen(gl, pressure.write);
      pressure.swap();
    }

    P.gradient.use();
    gl.uniform2fv(P.gradient.u.texel, vel.texel);
    gl.uniform1i(P.gradient.u.uPressure, pressure.read.bind(0));
    gl.uniform1i(P.gradient.u.uVelocity, vel.read.bind(1));
    drawFullscreen(gl, vel.write);
    vel.swap();

    P.advect.use();
    gl.uniform2fv(P.advect.u.texel, vel.texel);
    gl.uniform1i(P.advect.u.uVelocity, vel.read.bind(0));
    gl.uniform1i(P.advect.u.uSource, vel.read.bind(0));
    gl.uniform1f(P.advect.u.dt, dt);
    gl.uniform1f(P.advect.u.dissipation, cfg.velocityDissipation);
    drawFullscreen(gl, vel.write);
    vel.swap();

    gl.uniform1i(P.advect.u.uVelocity, vel.read.bind(0));
    gl.uniform1i(P.advect.u.uSource, dye.read.bind(1));
    gl.uniform1f(P.advect.u.dissipation, cfg.densityDissipation);
    drawFullscreen(gl, dye.write);
    dye.swap();
  }

  function applyBloom() {
    const knee = cfg.bloomThreshold * cfg.bloomKnee + 0.0001;
    P.bloomPrefilter.use();
    gl.uniform3f(P.bloomPrefilter.u.curve, cfg.bloomThreshold - knee, knee * 2, 0.25 / knee);
    gl.uniform1f(P.bloomPrefilter.u.threshold, cfg.bloomThreshold);
    gl.uniform1i(P.bloomPrefilter.u.uTexture, dye.read.bind(0));
    drawFullscreen(gl, bloomBase);
    P.blur.use();
    let last = bloomBase;
    for (const m of bloomMips) {
      gl.uniform2fv(P.blur.u.texel, last.texel);
      gl.uniform1i(P.blur.u.uTexture, last.bind(0));
      drawFullscreen(gl, m);
      last = m;
    }
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.BLEND);
    for (let i = bloomMips.length - 2; i >= 0; i--) {
      gl.uniform2fv(P.blur.u.texel, last.texel);
      gl.uniform1i(P.blur.u.uTexture, last.bind(0));
      drawFullscreen(gl, bloomMips[i]);
      last = bloomMips[i];
    }
    gl.disable(gl.BLEND);
    P.scale.use();
    gl.uniform1i(P.scale.u.uTexture, last.bind(0));
    gl.uniform1f(P.scale.u.value, cfg.bloomIntensity);
    drawFullscreen(gl, bloomBase);
  }

  function render() {
    if (cfg.bloom) applyBloom();
    P.display.use();
    gl.uniform1i(P.display.u.uTexture, dye.read.bind(0));
    gl.uniform1i(P.display.u.uBloom, bloomBase.bind(1));
    gl.uniform2f(P.display.u.texel, 1 / canvas.width, 1 / canvas.height);
    gl.uniform1f(P.display.u.shading, cfg.shading ? 1 : 0);
    gl.uniform1f(P.display.u.bloom, cfg.bloom ? 1 : 0);
    gl.uniform1f(P.display.u.vignette, 0.35);
    drawFullscreen(gl, null);
  }

  /* ——— Interaction ——— */
  const pointers = new Map();
  const offPointers = trackPointers(canvas, {
    down(p) {
      const c = nextColor();
      pointers.set(p.id, { x: p.x, y: p.y, color: c, moved: false });
      splat(p.x / p.w, 1 - p.y / p.h, 0, 0, c.map((v) => v * 4));
      ctx.haptic('light');
    },
    move(p, isDown) {
      if (isDown) {
        const s = pointers.get(p.id);
        if (!s) return;
        queue.push([p.x, p.y, s.x, s.y, p.w, p.h, s.color, 1]);
        s.x = p.x; s.y = p.y;
        if (Math.random() < 0.02) s.color = nextColor();
      } else if (p.type === 'mouse') {
        // Survol à la souris : léger sillage même sans clic
        const s = pointers.get('hover') || { x: p.x, y: p.y, color: nextColor(0.06) };
        queue.push([p.x, p.y, s.x, s.y, p.w, p.h, s.color, 0.35]);
        s.x = p.x; s.y = p.y;
        if (Math.random() < 0.03) s.color = nextColor(0.06);
        pointers.set('hover', s);
      }
    },
    up(p) { pointers.delete(p.id); },
  });
  const queue = [];
  function flushQueue() {
    const aspect = canvas.width / canvas.height;
    for (const [x, y, px, py, w, hh, color, k] of queue) {
      let dx = (x - px) / w, dy = -(y - py) / hh;
      if (aspect < 1) dx *= aspect; else dy /= aspect;
      if (Math.abs(dx) + Math.abs(dy) < 1e-5) continue;
      splat(x / w, 1 - y / hh, dx * cfg.splatForce * k, dy * cfg.splatForce * k, color);
    }
    queue.length = 0;
  }

  /* ——— Gravité (gyroscope) ——— */
  const grav = [0, 0];
  const onOrient = (e) => {
    if (e.beta == null) return;
    const b = (e.beta * Math.PI) / 180, g = (e.gamma * Math.PI) / 180;
    let gx = Math.sin(g) * Math.cos(b), gy = -Math.sin(b);
    const ang = ((screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI) / 180;
    const sx = gx * Math.cos(ang) - gy * Math.sin(ang);
    const sy = gx * Math.sin(ang) + gy * Math.cos(ang);
    grav[0] = grav[0] * 0.8 + sx * 0.2;
    grav[1] = grav[1] * 0.8 + sy * 0.2;
  };
  async function setGravity(on) {
    if (!on) { cfg.gravity = false; window.removeEventListener('deviceorientation', onOrient); return false; }
    const ok = await ctx.requestMotion();
    if (!ok) { ctx.toast('Accès aux capteurs refusé', { type: 'warn' }); return false; }
    window.addEventListener('deviceorientation', onOrient);
    const live = await probeOrientation(1200);
    if (!live) {
      window.removeEventListener('deviceorientation', onOrient);
      ctx.toast('Aucun gyroscope détecté sur cet appareil', { type: 'warn' });
      return false;
    }
    cfg.gravity = true;
    cfg.dream = false;
    dreamT.set(false);
    ctx.toast('Inclinez l’appareil : l’encre suit la gravité');
    return true;
  }

  /* ——— Boucle ——— */
  let dreamClock = 0;
  let lost = false;
  const offLoop = ctx.loop.add((t, dt) => {
    if (lost || !vel) return;
    if (cfg.dream) {
      dreamClock -= dt;
      if (dreamClock <= 0) {
        dreamClock = 0.35 + Math.random() * 0.9;
        const a = Math.random() * Math.PI * 2;
        const c = nextColor(0.9);
        splat(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, Math.cos(a) * 700, Math.sin(a) * 700, c);
      }
    }
    flushQueue();
    step(Math.min(dt, 1 / 30));
    render();
  });

  const offGuard = guardContext(canvas, () => { lost = true; ctx.setStatus('Contexte GPU perdu…'); }, () => ctx.remount());

  /* ——— Commandes ——— */
  const d = ctx.dock;
  d.segment([
    { value: 'spectre', label: 'Spectre', color: '#ff8a3d' },
    { value: 'ocean', label: 'Océan', color: '#3db2ff' },
    { value: 'magma', label: 'Magma', color: '#ff4d5e' },
    { value: 'aurore', label: 'Aurore', color: '#45e08a' },
    { value: 'encre', label: 'Encre', color: '#ffffff' },
  ], cfg.palette, (v) => { cfg.palette = v; randomSplats(3); });
  d.row();
  const dreamT = d.toggle('Rêve', cfg.dream, (v) => { cfg.dream = v; });
  const gravT = d.toggle('Gravité', cfg.gravity, (v) => setGravity(v));
  d.toggle('Éclat', cfg.bloom, (v) => { cfg.bloom = v; });
  d.toggle('Relief', cfg.shading, (v) => { cfg.shading = v; });
  d.button('Vider', () => clearAll());
  d.slider('Tourbillons', { min: 0, max: 60, step: 1, value: cfg.curl, format: (v) => String(v) }, (v) => { cfg.curl = v; });

  function clearAll() {
    P.scale.use();
    gl.uniform1f(P.scale.u.value, 0);
    for (const t of [dye, vel, pressure]) {
      gl.uniform1i(P.scale.u.uTexture, t.read.bind(0));
      drawFullscreen(gl, t.write);
      t.swap();
    }
  }

  ctx.hint('Touchez et glissez', 'Plusieurs doigts à la fois. Inclinez l’appareil avec « Gravité ».');

  return {
    shortcuts: [['Espace', 'Éclaboussure'], ['C', 'Vider'], ['G', 'Gravité']],
    key(e) {
      if (e.code === 'Space') { randomSplats(5 + Math.floor(Math.random() * 10)); return true; }
      if (e.key === 'c' || e.key === 'C') { clearAll(); return true; }
      if (e.key === 'g' || e.key === 'G') { setGravity(!cfg.gravity).then((v) => gravT.set(v)); return true; }
      return false;
    },
    capture() {
      step(0.001);
      render();
      return canvasToBlob(canvas);
    },
    destroy() {
      offLoop();
      offPointers();
      offSize();
      offGuard();
      window.removeEventListener('deviceorientation', onOrient);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

