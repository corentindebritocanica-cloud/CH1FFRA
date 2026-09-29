// Prisme — aides WebGL2 : compilation, programmes, cibles de rendu flottantes, triangle plein écran.

export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function createGL(canvas, attrs = {}) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    ...attrs,
  });
  if (!gl) return null;
  // Vertex array vide : le triangle plein écran est généré par gl_VertexID.
  gl.__vao = gl.createVertexArray();
  gl.bindVertexArray(gl.__vao);
  return gl;
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh);
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)}| ${l}`).join('\n');
    console.error(`${log}\n${numbered}`);
    throw new Error(`Shader : ${log}`);
  }
  return sh;
}

/** Crée un programme et indexe ses uniformes : prog.u.nom → location. */
export function program(gl, vsSrc, fsSrc, { feedback } = {}) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
  if (feedback) gl.transformFeedbackVaryings(p, feedback, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`Liaison : ${gl.getProgramInfoLog(p)}`);
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u, use() { gl.useProgram(p); return this; } };
}

/** Programme plein écran : il suffit de fournir le fragment shader. */
export const fullscreen = (gl, fs) => program(gl, FULLSCREEN_VS, fs);

export function drawFullscreen(gl, target) {
  if (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, target.w, target.h);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function createTarget(gl, w, h, fmt, filter = gl.LINEAR) {
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return {
    tex, fbo, w, h, texel: [1 / w, 1 / h],
    bind(unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); return unit; },
    dispose() { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); },
  };
}

export function createDouble(gl, w, h, fmt, filter) {
  let a = createTarget(gl, w, h, fmt, filter);
  let b = createTarget(gl, w, h, fmt, filter);
  return {
    w, h, texel: a.texel,
    get read() { return a; },
    get write() { return b; },
    swap() { [a, b] = [b, a]; },
    dispose() { a.dispose(); b.dispose(); },
  };
}

function renderable(gl, internal, format, type) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, type, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteTexture(tex);
  gl.deleteFramebuffer(fbo);
  return ok;
}

/**
 * Formats flottants rendables (demi-précision de préférence : filtrage linéaire garanti en WebGL2).
 * Repli R → RG → RGBA si un format n'est pas rendable (certains GPU mobiles).
 */
export function floatFormats(gl) {
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  const HF = gl.HALF_FLOAT;
  const cand = {
    r: { internal: gl.R16F, format: gl.RED, type: HF },
    rg: { internal: gl.RG16F, format: gl.RG, type: HF },
    rgba: { internal: gl.RGBA16F, format: gl.RGBA, type: HF },
  };
  if (!renderable(gl, cand.rgba.internal, cand.rgba.format, HF)) return null;
  if (!renderable(gl, cand.rg.internal, cand.rg.format, HF)) cand.rg = cand.rgba;
  if (!renderable(gl, cand.r.internal, cand.r.format, HF)) cand.r = cand.rg;
  return cand;
}

/** Surveille la perte de contexte GPU (fréquente sur iOS en arrière-plan). */
export function guardContext(canvas, onLost, onRestored) {
  const lost = (e) => { e.preventDefault(); onLost?.(); };
  const restored = () => onRestored?.();
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}

export function gpuName(gl) {
  if (!gl) return null;
  let r = null;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { r = null; }
  return r ? cleanGpuName(r) : null;
}

export function cleanGpuName(r) {
  const m = /ANGLE \(([^,]+),\s*([^,]+?)(?:\s*\(0x[0-9a-f]+\))?(?:\s*Direct3D.*|\s*OpenGL.*|\s*Vulkan.*|,.*)?\)$/i.exec(r);
  let name = m ? m[2] : r;
  name = name.replace(/\s*\(0x[0-9a-f]+\)/gi, '').replace(/\s+(vs|ps)_\d_\d/g, '').trim();
  if (/^WebKit WebGL$/i.test(name)) return 'GPU';
  return name;
}
