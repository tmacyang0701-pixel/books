// 沿用主项目 science_lab.js 的原生 WebGL 思路；独立扩展不依赖业务宿主。
const subtract = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const d = Math.hypot(...a) || 1; return a.map(v => v / d); };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const multiply = (a, b) => {
  const c = new Float32Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) c[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return c;
};
function viewMatrix(eye, target, aspect) {
  const z = unit(subtract(eye, target)), x = unit(cross([0, 1, 0], z)), y = cross(z, x);
  const view = new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  const f = 1 / Math.tan(Math.PI / 7), near = 0.1, far = 70;
  return multiply(new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]), view);
}

export const palette = { teal: [0.12, 0.52, 0.45], blue: [0.34, 0.52, 0.64], steel: [0.66, 0.77, 0.8], dark: [0.14, 0.27, 0.29], orange: [0.91, 0.49, 0.24], light: [0.85, 0.9, 0.86], glass: [0.58, 0.8, 0.82], gray: [0.62, 0.65, 0.61] };
export const shape = (kind, pos, scale, color, alpha = 1, angle = 0) => ({ kind, pos, scale, color, alpha, angle });

export class World {
  constructor(canvas, onStatus = () => {}, {reuseContext=true} = {}) {
    // Keep one released context between routes. Rapidly creating 48 independent
    // contexts can exhaust the browser/GPU budget even when old canvases are removed.
    if(World.idleCanvas&&!World.idleCanvas.isConnected&&World.idleCanvas.getContext('webgl')?.isContextLost())World.idleCanvas=null;
    if(reuseContext&&World.idleCanvas&&!World.idleCanvas.isConnected){
      const reused=World.idleCanvas;World.idleCanvas=null;
      for(const attribute of [...reused.attributes])reused.removeAttribute(attribute.name);
      for(const attribute of [...canvas.attributes])reused.setAttribute(attribute.name,attribute.value);
      canvas.replaceWith(reused);canvas=reused;
    }
    this.canvas = canvas;
    this.onStatus = onStatus;
    this.items = [];
    this.target = [0, 1.5, 0];
    this.camera = [0.38, 0.25, 10];
    this.abort = new AbortController();
    const opts = { signal: this.abort.signal };
    this.pointers = new Map();
    const gesture = () => {
      const p = [...this.pointers.values()];
      return p.length > 1 ? { gap: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) } : p.length ? { x: p[0][0], y: p[0][1] } : null;
    };
    canvas.addEventListener('pointerdown', e => { this.pointers.set(e.pointerId, [e.clientX, e.clientY]); canvas.setPointerCapture(e.pointerId); this.gesture = gesture(); }, opts);
    canvas.addEventListener('pointermove', e => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const next = gesture(), prev = this.gesture;
      if (prev && next) {
        if (next.gap && prev.gap) this.camera[2] = clamp(this.camera[2] * prev.gap / next.gap, 6, 18);
        else if (next.x !== undefined && prev.x !== undefined) {
          this.camera[0] -= (next.x - prev.x) * 0.007;
          this.camera[1] = clamp(this.camera[1] + (next.y - prev.y) * 0.006, -0.05, 1.2);
        }
      }
      this.gesture = next; this.draw();
    }, opts);
    const release = e => { this.pointers.delete(e.pointerId); this.gesture = gesture(); };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, release, opts);
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom(Math.exp(e.deltaY * 0.001)); }, { ...opts, passive: false });
    canvas.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', 'Home'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'Home') this.reset();
      if (e.key === '+') this.zoom(0.85);
      if (e.key === '-') this.zoom(1.18);
      if (e.key === 'ArrowLeft') this.camera[0] -= 0.1;
      if (e.key === 'ArrowRight') this.camera[0] += 0.1;
      if (e.key === 'ArrowUp') this.camera[1] = clamp(this.camera[1] + 0.1, -0.05, 1.2);
      if (e.key === 'ArrowDown') this.camera[1] = clamp(this.camera[1] - 0.1, -0.05, 1.2);
      this.draw();
    }, opts);
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.ready = false; this.meshes = null; this.program = null; canvas.dataset.rendered = 'false'; this.onStatus('lost'); }, opts);
    canvas.addEventListener('webglcontextrestored', () => this.init(), opts);
    canvas.addEventListener('webglcontextcreationerror', e => {canvas.dataset.contextError=e.statusMessage;}, opts);
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(canvas);
    this.init();
  }
  init() {
    try {
      this.clearResources();
      const gl = this.canvas.getContext('webgl', { alpha: true, antialias: true });
      if (!gl) throw new Error('webgl-context-unavailable');
      if (gl.isContextLost()) throw new Error('webgl-context-lost');
      this.gl = gl;
      this.lossExtension = gl.getExtension('WEBGL_lose_context');
      const shader = (type, source) => {
        const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const message=gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('shader: '+message); }
        return s;
      };
      const vs = shader(gl.VERTEX_SHADER, 'attribute vec3 aPos;attribute vec3 aNormal;uniform mat4 uView;uniform vec3 uPos;uniform vec3 uScale;uniform mat3 uRotation;varying vec3 vNormal;void main(){vNormal=normalize(uRotation*(aNormal/uScale));gl_Position=uView*vec4(uRotation*(aPos*uScale)+uPos,1.);}');
      const fs = shader(gl.FRAGMENT_SHADER, 'precision mediump float;uniform vec4 uColor;uniform float uUnlit;varying vec3 vNormal;void main(){vec3 n=normalize(vNormal);float key=max(dot(n,normalize(vec3(-.5,1.,.8))),0.);float rim=max(dot(n,normalize(vec3(.8,.3,-.6))),0.);float light=mix(.42+.53*key+.15*rim,1.,uUnlit);gl_FragColor=vec4(uColor.rgb*light,uColor.a);}');
      this.program = gl.createProgram(); gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program); gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error('program');
      this.uniforms = Object.fromEntries(['uView', 'uPos', 'uScale', 'uRotation', 'uColor', 'uUnlit'].map(key => [key, gl.getUniformLocation(this.program, key)]));
      this.attrs = [gl.getAttribLocation(this.program, 'aPos'), gl.getAttribLocation(this.program, 'aNormal')];
      this.meshes = new Map();
      const upload = (name, data, lines = false) => { const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); this.meshes.set(name, { buffer, count: data.length / 6, lines }); };
      const cube = [], corners = [[-.5,-.5,-.5],[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5]];
      for (const [face, normal] of [[[0,3,2,1],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[0,4,7,3],[-1,0,0]],[[1,2,6,5],[1,0,0]],[[3,7,6,2],[0,1,0]],[[0,1,5,4],[0,-1,0]]]) for (const i of [0,1,2,0,2,3]) cube.push(...corners[face[i]], ...normal);
      upload('box', cube);
      for (const [name, maxLat] of [['sphere', Math.PI], ['dome', Math.PI / 2]]) {
        const data = [], point = (lat, lon) => [Math.sin(lat) * Math.cos(lon), Math.cos(lat), Math.sin(lat) * Math.sin(lon)];
        for (let row = 0; row < 14; row++) for (let col = 0; col < 28; col++) {
          const a = point(row * maxLat / 14, col * Math.PI / 14), b = point((row + 1) * maxLat / 14, col * Math.PI / 14), c = point((row + 1) * maxLat / 14, (col + 1) * Math.PI / 14), d = point(row * maxLat / 14, (col + 1) * Math.PI / 14);
          for (const p of [a,b,c,a,c,d]) data.push(...p, ...p);
        }
        upload(name, data);
      }
      const sides = [], caps = [];
      for (let i = 0; i < 48; i++) {
        const a = i * Math.PI / 24, b = (i + 1) * Math.PI / 24;
        for (const [angle, y] of [[a,-.5],[b,-.5],[b,.5],[a,-.5],[b,.5],[a,.5]]) sides.push(Math.cos(angle), y, Math.sin(angle), Math.cos(angle), 0, Math.sin(angle));
        for (const y of [-.5,.5]) for (const p of [[0,y,0],[Math.cos(a),y,Math.sin(a)],[Math.cos(b),y,Math.sin(b)]]) caps.push(...p, 0, y * 2, 0);
      }
      upload('tube', sides); upload('cylinder', [...sides, ...caps]);
      upload('line', [-.5,0,0,0,1,0,.5,0,0,0,1,0], true);
      this.ready = true; delete this.canvas.dataset.renderError; delete this.canvas.dataset.contextError; this.draw(); this.onStatus('ready');
    } catch(error) {
      this.canvas.dataset.renderError=error.message;
      this.ready = false; this.clearResources(); this.onStatus('unavailable');
    }
  }
  recover() {
    if (this.gl?.isContextLost()) {
      const extension = this.lossExtension;
      if (extension) { extension.restoreContext(); return; }
    }
    this.init();
  }
  update(items) { this.items = items; this.draw(); }
  reset() { this.camera = [0.38, 0.25, 10]; this.draw(); }
  zoom(factor) { this.camera[2] = clamp(this.camera[2] * factor, 6, 18); this.draw(); }
  draw() {
    if (!this.ready || this.disposed) return;
    const gl = this.gl, canvas = this.canvas, rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.8), w = Math.round(rect.width * ratio), h = Math.round(rect.height * ratio);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const [az, el, dist] = this.camera, target = this.target;
    const eye = [target[0] + Math.sin(az) * Math.cos(el) * dist, target[1] + Math.sin(el) * dist, target[2] + Math.cos(az) * Math.cos(el) * dist];
    this.matrix = viewMatrix(eye, target, w / h);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.uView, false, this.matrix);
    const opaque = this.items.filter(x => x.alpha === 1), transparent = this.items.filter(x => x.alpha < 1).sort((a, b) => Math.hypot(...subtract(b.pos, eye)) - Math.hypot(...subtract(a.pos, eye)));
    for (const item of [...opaque, ...transparent]) {
      const mesh = this.meshes.get(item.kind); if (!mesh) continue;
      gl.depthMask(item.alpha === 1); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      for (const a of this.attrs) gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(this.attrs[0], 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(this.attrs[1], 3, gl.FLOAT, false, 24, 12);
      const c=Math.cos(item.angle||0),s=Math.sin(item.angle||0);
      gl.uniform3fv(this.uniforms.uPos, item.pos); gl.uniform3fv(this.uniforms.uScale, item.scale); gl.uniformMatrix3fv(this.uniforms.uRotation,false,item.orientation||[c,s,0,-s,c,0,0,0,1]); gl.uniform4fv(this.uniforms.uColor, [...item.color, item.alpha]); gl.uniform1f(this.uniforms.uUnlit, mesh.lines ? 1 : 0);
      gl.drawArrays(mesh.lines ? gl.LINES : gl.TRIANGLES, 0, mesh.count);
    }
    gl.depthMask(true); canvas.dataset.rendered = 'true';
    this.onDraw?.();
  }
  project(point){
    if(!this.matrix)return null;
    const v=[...point,1],q=[0,0,0,0];
    for(let r=0;r<4;r++)for(let c=0;c<4;c++)q[r]+=this.matrix[c*4+r]*v[c];
    if(q[3]<=.1)return null;
    return [(q[0]/q[3]+1)*this.canvas.clientWidth/2,(1-q[1]/q[3])*this.canvas.clientHeight/2];
  }
  clearResources() {
    if (!this.gl) return;
    this.meshes?.forEach(mesh => this.gl.deleteBuffer(mesh.buffer));
    if (this.program) this.gl.deleteProgram(this.program);
    this.meshes = null; this.program = null;
  }
  dispose() {
    if(this.disposed)return;
    this.disposed = true; this.ready = false; this.abort.abort(); this.resize.disconnect(); this.clearResources();this.onDraw=null;
    if(this.gl&&!this.gl.isContextLost()&&!World.idleCanvas)World.idleCanvas=this.canvas;
    else this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export function ground() {
  const items = [shape('cylinder', [0,-.14,0], [3.9,.2,2.55], [.84,.88,.83])];
  for (let i = -3; i <= 3; i++) {
    items.push(shape('line', [0,-.025,i * .6], [6,1,1], palette.teal, .13));
    // 纵深网格用细立方体，保留透视与深度。
    items.push(shape('box', [i,-.025,0], [.009,.009,4], palette.teal, .13));
  }
  return items;
}

export function forkScene(time, active = true, ball = true, amplitude = 0.6) {
  const p = palette, objects = ground(), vibration = active ? Math.sin(time * Math.PI * 4) * .13 * amplitude : 0;
  objects.push(shape('box', [-.65,.14,0], [2,.28,1.2], [.68,.46,.28]), shape('cylinder', [-.65,.66,0], [.13,.85,.13], p.steel), shape('box', [-.65,1.16,0], [1.1,.23,.28], p.steel));
  for (const side of [-1,1]) for (let i = 0; i < 12; i++) {
    const bend = vibration * (i / 11) ** 2 * side;
    objects.push(shape('box', [-.65 + side * .46 + bend,1.29 + i * .14,0], [.19,.155,.28], p.steel));
  }
  // 悬球以运动放大接触振动，路径为教学示意，并非碰撞数值解。
  if (ball) {
    objects.push(shape('cylinder', [1.18,1.77,0], [.045,3.5,.045], p.dark), shape('box', [.62,3.5,0], [1.18,.07,.07], p.dark));
    const theta = active ? .05 + .22 * Math.max(0, Math.sin(time * 5)) * amplitude : 0;
    const anchor = [.035,3.46,0], length = .9, x = anchor[0] + length * Math.sin(theta), y = anchor[1] - length * Math.cos(theta);
    objects.push(shape('box', [(anchor[0]+x)/2,(anchor[1]+y)/2,0], [.018,length,.018], p.gray, 1, theta), shape('sphere', [x,y,0], [.13,.13,.13], p.orange));
  }
  objects.push(shape('cylinder', [-2.18,1.16,.05], [.085,1.3,.085], [.64,.4,.22], 1, -.65), shape('sphere', [-1.78,1.7,.05], [.24,.27,.24], p.dark));
  return objects;
}

export function vacuumScene(time, air) {
  const p = palette, objects = ground();
  objects.push(shape('cylinder', [0,.08,0], [1.85,.19,1.55], p.dark), shape('box', [0,.33,0], [1.45,.24,.9], p.orange), shape('box', [0,.82,0], [.65,.8,.45], p.teal));
  for (const side of [-1,1]) objects.push(shape('sphere', [side*.54,1.52,0], [.5,.34,.4], p.steel), shape('cylinder', [side*.36,1.22,0], [.045,.45,.045], p.dark, 1, side*.55));
  const knock = Math.sin(time * 14) * .3;
  objects.push(shape('sphere', [knock,1.6,0], [.09,.09,.09], p.orange), shape('box', [knock/2,1.29,0], [.04,.62,.04], p.dark, 1, -knock));
  const count = Math.round(air / 100 * 42);
  for (let i = 0; i < count; i++) {
    const a = i * 2.39996 + time * .12, r = .72 + (i % 5) * .13, y = .45 + ((i * .237 + time * .1) % 1) * 1.9;
    objects.push(shape('sphere', [Math.cos(a)*r,y,Math.sin(a)*r*.85], [.045,.045,.045], p.teal, .55));
  }
  objects.push(shape('tube', [0,1.34,0], [1.7,2.5,1.45], p.glass, .12), shape('dome', [0,2.59,0], [1.7,.8,1.45], p.glass, .14), shape('sphere', [0,3.46,0], [.17,.14,.17], p.steel, .8));
  objects.push(shape('box', [2.3,.17,0], [1.1,.32,.72], p.gray), shape('cylinder', [2.3,.55,0], [.12,.62,.12], p.dark), shape('box', [2.3,.89,0], [.7,.08,.15], p.orange), shape('box', [1.75,.14,0], [1.1,.09,.09], p.dark));
  return objects;
}

const normalizedWaves = new Map();
export function harmonics(type) {
  if (!normalizedWaves.has(type)) {
    const h = type === 'rich' ? [1,.42,.24,.14] : type === 'hollow' ? [1,0,.34,0,.16] : [1];
    let peak = 0;
    for (let n = 0; n < 8192; n++) peak = Math.max(peak, Math.abs(h.reduce((sum,v,i) => sum + v * Math.sin((i+1)*n*Math.PI/4096), 0)));
    normalizedWaves.set(type, h.map(v=>v/peak));
  }
  return normalizedWaves.get(type);
}
export function signal(phase, type = 'pure') {
  return harmonics(type).reduce((sum,v,i) => sum + v * Math.sin((i+1) * phase), 0);
}
export function waveScene(time, frequency, amplitude, type) {
  const p = palette, objects = ground(), phase = time * 2 * Math.PI * frequency / 110;
  const displacement = .15 * amplitude * signal(phase, type);
  objects.push(shape('box', [-2.85,1.2,0], [.56,2.2,1.65], p.dark), shape('sphere', [-2.49+displacement,1.3,0], [.15,.76,.76], p.steel), shape('sphere', [-2.36+displacement,1.3,0], [.13,.25,.25], p.orange));
  for (let row = 0; row < 4; row++) for (let col = 0; col < 20; col++) {
    const x = -1.9 + col * .27, dx = amplitude * .12 * signal(phase - col * .65 * frequency / 220, type);
    const tracer = row === 1 && col === 9;
    objects.push(shape('sphere', [x+dx,.8+row*.34,0], [tracer?.095:.055,tracer?.095:.055,tracer?.095:.055], tracer ? p.orange : p.teal, tracer ? 1 : .72));
  }
  return objects;
}
