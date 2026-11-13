import { World, forkScene, vacuumScene, waveScene, signal, harmonics } from './world.js';

export const experiments = [
  { id: 'fork', number: '01', title: '看见音叉的振动', subtitle: '音叉与悬球', description: '借助轻质小球，将微小振动转换为可见的运动。', lesson: 'vibration', tags: ['转换法', '声音的产生'] },
  { id: 'vacuum', number: '02', title: '抽走空气，还能听见吗？', subtitle: '真空罩中的电铃', description: '保持电铃工作，比较不同空气条件下的传声。', lesson: 'medium', tags: ['控制变量', '实验推理'] },
  { id: 'wave', number: '03', title: '调出不一样的声音', subtitle: '声音的三个特性', description: '把音调、响度和音色，放进同一个对照实验。', lesson: 'pitch', tags: ['频率与振幅', '波形对比'] },
];

const stepSets = {
  fork: [
    { title: '观察静置音叉', action: '先旋转视角，找到叉股、悬球和支架，比较它们的位置。', observe: '未敲击时，叉股和悬球保持静止。', conclusion: '这是对照状态。接下来只改变音叉是否振动。', preset: { active: false, amplitude: .6 } },
    { title: '敲击，借悬球观察', action: '点击“播放本步”，模拟敲击音叉，观察与叉股接触的小球。', observe: '叉股往复振动，轻质小球被弹开。', conclusion: '微小振动可通过小球的运动被观察到；这是转换法。', preset: { active: true, amplitude: .6 } },
    { title: '轻触止振', action: '切换到本步，模拟手指轻触叉股使其停止振动，与上一步对照。', observe: '叉股停止振动，悬球不再被弹开。', conclusion: '振动停止后，声源不再发声；已发出的声波仍可继续传播。', preset: { active: false, amplitude: .6 } },
    { title: '再敲击，自主比较', action: '再次播放，可调整振动幅度；同一音叉的频率保持不变。', observe: '幅度越大，小球被弹开的示意幅度也越大。', conclusion: '声音的产生依赖振动；用力不同主要改变振幅，不能据此认为音调变高。', preset: { active: true, amplitude: .8 }, editable: ['amplitude'] },
  ],
  vacuum: [
    { title: '保留空气', action: '播放电铃振动，可点击“试听”；保持设备音量和观察位置不变。', observe: '电铃振动，罩内有空气，声音可通过空气传出。', conclusion: '声源振动与介质传声是两个不同的条件。', preset: { air: 100 } },
    { title: '逐渐抽气', action: '本步减少罩内空气，电铃振动状态不变。播放后与前一步试听比较。', observe: '电铃仍振动，空气减少，示意声音变弱。', conclusion: '在控制声源和接收位置的条件下，现象支持空气参与传声。', preset: { air: 20 } },
    { title: '推理：理想真空', action: '把模型切到没有空气、且不考虑支架传声的理想条件。', observe: '电铃仍振动，但没有空气介质传出声音；试听无声。', conclusion: '真空不能传声。这是理想化推理，普通抽气实验不能直接达到绝对真空。', preset: { air: 0 } },
    { title: '放回空气，重复对照', action: '恢复空气，再试听；也可以调整空气保留比例进行比较。', observe: '电铃振动不变，空气恢复后，示意声音恢复。', conclusion: '重复对照有助于排除电铃停止工作的干扰。真实实验仍可能有支架传声。', preset: { air: 100 }, editable: ['air'] },
  ],
  wave: [
    { title: '建立基准', action: '用 220 Hz 纯音建立对照，观察相同 12 ms 时间窗口内的波形。', observe: '橙色粒子在原位附近往复振动，扰动向前传播。', conclusion: '空气中的声是纵波。粒子的往复振动不等于粒子从声源一路飞到耳朵。', preset: { frequency: 220, amplitude: .35, type: 'pure' } },
    { title: '只改变频率', action: '保持振幅与波形种类不变，将频率由 220 Hz 提高到 440 Hz，再试听。', observe: '同一时间内，波形周期变多；试听音调更高。', conclusion: '频率描述振动快慢，通常频率越高，音调越高。', preset: { frequency: 440, amplitude: .35, type: 'pure' }, editable: ['frequency'] },
    { title: '只改变振幅', action: '恢复 220 Hz 纯音，将相对振幅从 0.35 增到 0.65，比较图形和听感。', observe: '波形变高，周期数不变。相同设备设置下试听通常更响。', conclusion: '控制其他条件时，振幅增大通常使响度增大。它不等于音调变高。', preset: { frequency: 220, amplitude: .65, type: 'pure' }, editable: ['amplitude'] },
    { title: '改变谐波组成', action: '恢复 220 Hz、相对振幅 0.35，切换波形种类，比较纯音与合成音。', observe: '基频相同，波形的细节和音色改变。', conclusion: '谐波组成会影响音色。模型将信号峰值调为相同，但能量和主观响度未必相同。', preset: { frequency: 220, amplitude: .35, type: 'rich' }, editable: ['type'] },
    { title: '自主探究', action: '自行调整参数。每次先提出预测，再只改变一个参数并对比。', observe: '区分周期数、高度和形状的变化，注意橙色粒子始终在原位附近振动。', conclusion: '音调、响度和音色应分别判断。频率与振幅不能互相代替。', preset: { frequency: 220, amplitude: .35, type: 'pure' }, editable: ['frequency', 'amplitude', 'type'] },
  ],
};

export function mountLab(root, id, { focus = 0, note = '', saveNote, toast } = {}) {
  const experiment = experiments.find(x => x.id === id), steps = stepSets[id];
  let index = Math.min(focus, steps.length - 1), params = {}, time = 0, playing = false, frame = null, last = null, disposed = false, world;
  let audio = null, soundTimer = null, audioToken = 0;
  const abort = new AbortController(), opts = { signal: abort.signal };
  const labels = { frequency: '频率', amplitude: '相对振幅', air: '空气保留比例（示意）', type: '波形种类' };
  const controls = id === 'vacuum' ? ['air'] : id === 'fork' ? ['amplitude'] : ['frequency', 'amplitude', 'type'];
  root.innerHTML = `
    <div class="lab-heading"><div><span class="eyebrow">实验 ${experiment.number}</span><h2>${experiment.title}</h2></div><button class="button secondary" id="lab-expand">展开实验</button></div>
    <div class="lab-layout">
      <div class="lab-visual">
        <div class="scene-stage"><div class="scene-badge"><span class="status-dot"></span>3D 交互实验</div><span class="scene-model">${id === 'wave' ? '粒子为纵向振动示意' : '运动慢放 · 振幅放大'}</span>
          <canvas id="lab-world" tabindex="0" aria-label="${experiment.subtitle}三维场景，可拖拽旋转，滚轮或双指缩放，方向键旋转，Home 复位"></canvas>
          <div id="webgl-error" class="webgl-error" role="alert" hidden><strong>3D 画面暂不可用</strong><p>请启用浏览器图形加速后重试。实验讲解仍可阅读。</p><button class="button" id="webgl-retry">恢复 3D 画面</button></div>
          <div class="scene-caption">${id === 'fork' ? '蓝灰色：音叉　橙色：轻质悬球' : id === 'vacuum' ? '罩内电铃持续振动　绿色粒子：空气示意' : '橙色：追踪粒子　扰动沿水平方向传播'}</div>
          <div class="camera-tools"><button id="zoom-in" aria-label="放大场景">＋</button><button id="zoom-out" aria-label="缩小场景">−</button><button id="camera-reset" aria-label="复位视角">↺</button></div>
        </div>
        <div class="playbar"><button class="button" id="lab-play">播放本步</button><button class="button secondary" id="lab-sound">试听 2 秒</button><button class="icon-text" id="lab-reset">重做实验</button><span id="lab-state">已暂停</span></div>
        ${id === 'wave' ? '<div class="wave-panel"><div><strong>声信号波形</strong><span>相同的 12 ms 时间窗口 · 纵轴为相对值</span></div><canvas id="wave-chart" role="img" aria-label="随频率、相对振幅和波形种类变化的声信号图"></canvas></div>' : ''}
        <p class="model-note">${id === 'fork' ? '本模型呈现转换法；悬球运动为定性示意，未模拟碰撞数值和自然衰减。试听使用合成音，音叉振动慢放。' : id === 'vacuum' ? '空气粒子数量和试听音量只表示趋势，不代表真实压强或分贝。理想真空步骤忽略支架等固体传声。' : '3D 运动为慢放；波形图按标示频率计算，试听按实际频率合成。波形种类不代表真实乐器。'}拖动旋转，滚轮／双指缩放。试听请从低设备音量开始。</p>
      </div>
      <aside class="lab-guide" aria-label="实验步骤与参数"><div class="step-nav" aria-label="实验步骤">${steps.map((s,i) => `<button data-step="${i}" title="${s.title}" aria-label="第 ${i+1} 步：${s.title}">${i+1}</button>`).join('')}</div>
        <div class="step-counter" id="step-counter"></div><h3 id="step-title"></h3>
        <div class="guide-section"><span>操作</span><p id="step-action"></p></div><div class="guide-section"><span>观察</span><p id="step-observe"></p></div>
        <div class="parameters">${controls.map(key => key === 'type' ? '<label>波形种类<select id="param-type"><option value="pure">纯音</option><option value="rich">合成音 A · 多种谐波</option><option value="hollow">合成音 B · 奇次谐波</option></select></label>' : `<label for="param-${key}">${labels[key]}<output id="value-${key}"></output><input id="param-${key}" type="range" min="${key === 'frequency' ? 110 : key === 'air' ? 0 : .1}" max="${key === 'frequency' ? 880 : key === 'air' ? 100 : .9}" step="${key === 'frequency' ? 10 : key === 'air' ? 5 : .05}"></label>`).join('')}<small>灰色参数由当前对照步骤固定。</small></div>
        <details class="conclusion"><summary>查看本步结论</summary><p id="step-conclusion"></p></details>
        <div class="step-actions"><button class="button secondary" id="step-prev">上一步</button><button class="button" id="step-next">下一步 →</button></div>
      </aside>
    </div>
    <div class="lab-notebook"><label for="lab-note">我的实验记录</label><textarea id="lab-note" rows="2" maxlength="2000" placeholder="我改变了什么？观察到什么？证据支持什么结论？"></textarea><button class="button secondary" id="save-note">保存记录</button><span id="note-state" role="status"></span></div>`;
  const get = key => root.querySelector('#' + key);
  get('lab-note').value = note;
  function stopSound() {
    audioToken++;
    clearTimeout(soundTimer); soundTimer = null;
    if (audio) { audio.close().catch(() => {}); audio = null; }
    if (!disposed) { get('lab-sound').textContent = '试听 2 秒'; get('lab-sound').setAttribute('aria-pressed', 'false'); }
  }
  async function playSound() {
    if (audio) { stopSound(); return; }
    if ((id === 'fork' && !params.active) || (id === 'vacuum' && params.air === 0)) { toast?.(id === 'fork' ? '音叉未振动，声源不发声。' : '理想真空中没有空气传声，保持无声。'); return; }
    const token = ++audioToken;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('audio-unavailable');
      const context = new Audio(); audio = context;
      await context.resume();
      if (disposed || token !== audioToken) { context.close().catch(() => {}); return; }
      const oscillator = context.createOscillator(), gain = context.createGain();
      const f = id === 'wave' ? params.frequency : 440, type = id === 'wave' ? params.type : 'pure';
      const h = harmonics(type), real = new Float32Array(h.length+1), imaginary = new Float32Array(h.length+1);
      h.forEach((v,i) => { imaginary[i+1] = v; });
      oscillator.setPeriodicWave(context.createPeriodicWave(real, imaginary, { disableNormalization: true }));
      oscillator.frequency.value = f;
      const volume = id === 'vacuum' ? .07 * params.air / 100 : .09 * params.amplitude;
      const now = context.currentTime;
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now+.05); gain.gain.setValueAtTime(volume, now+1.8); gain.gain.linearRampToValueAtTime(0, now+2);
      oscillator.connect(gain).connect(context.destination); oscillator.start(now); oscillator.stop(now+2.05);
      get('lab-sound').textContent = '停止试听'; get('lab-sound').setAttribute('aria-pressed', 'true'); soundTimer = setTimeout(stopSound, 2100);
    } catch { stopSound(); toast?.('当前设备未能播放声音，可继续观察实验与波形。'); }
  }
  function stop() { playing = false; last = null; if (frame !== null) cancelAnimationFrame(frame); frame = null; stopSound(); if (!disposed) updatePlay(); }
  function updatePlay() { get('lab-play').textContent = playing ? '暂停' : '播放本步'; get('lab-play').setAttribute('aria-pressed', String(playing)); get('lab-state').textContent = playing ? '正在演示' : '已暂停'; }
  function draw() {
    if (!world || disposed) return;
    world.update(id === 'fork' ? forkScene(time, params.active, true, params.amplitude) : id === 'vacuum' ? vacuumScene(time, params.air) : waveScene(time, params.frequency, params.amplitude, params.type));
  }
  function chart() {
    if (id !== 'wave') return;
    const canvas = get('wave-chart'), rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    if (!rect.width) return;
    canvas.width = rect.width * dpr; canvas.height = 125 * dpr;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr); const width = rect.width, left = 28, right = width-12, middle = 52;
    ctx.strokeStyle = '#dce6df'; ctx.lineWidth = 1;
    for (let x = left; x <= right; x += (right-left)/8) { ctx.beginPath(); ctx.moveTo(x,8); ctx.lineTo(x,98); ctx.stroke(); }
    for (const y of [14,52,90]) { ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke(); }
    ctx.strokeStyle = '#268572'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = left; x <= right; x++) {
      const t = (x-left)/(right-left)*.012, y = middle - params.amplitude * 33 * signal(2*Math.PI*params.frequency*t, params.type);
      if (x === left) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke(); ctx.fillStyle = '#6a7974'; ctx.font = '11px system-ui'; ctx.fillText('0',left-14,middle+4); ctx.fillText('0 ms',left,117); ctx.fillText('6 ms',(left+right)/2-12,117); ctx.fillText('12 ms',right-33,117);
  }
  function show() {
    const step = steps[index];
    get('step-counter').textContent = `步骤 ${index+1} / ${steps.length}`;
    for (const [key,value] of Object.entries({ title: step.title, action: step.action, observe: step.observe, conclusion: step.conclusion })) get('step-'+key).textContent = value;
    if (id === 'wave' && index === 1) get('step-observe').textContent = `当前 ${params.frequency} Hz，在 12 ms 中有 ${Number((params.frequency*.012).toFixed(2))} 个周期。与 220 Hz 基准相比，音调${params.frequency > 220 ? '更高' : params.frequency < 220 ? '更低' : '相同'}，相对振幅保持 0.35。`;
    if (id === 'wave' && index === 2) get('step-observe').textContent = `当前相对振幅 ${params.amplitude.toFixed(2)}，与 0.35 基准相比${params.amplitude > .35 ? '增大' : params.amplitude < .35 ? '减小' : '相同'}；频率仍为 220 Hz，同一时间内的周期数不变。`;
    if (id === 'wave' && index === 3) get('step-observe').textContent = params.type === 'pure' ? '当前恢复纯音；对比合成音时，基频保持 220 Hz，观察波形细节与音色的变化。' : '当前加入谐波，基频保持 220 Hz；波形细节和音色与纯音不同。';
    if (id === 'vacuum' && index === 3) get('step-observe').textContent = params.air === 0 ? '空气比例为 0%，处于忽略固体传声的理想真空条件；电铃仍振动，试听无声。' : `空气保留比例为 ${params.air}%（示意），电铃仍振动；恢复空气会恢复空气传声。`;
    root.querySelectorAll('[data-step]').forEach((button,i) => button.setAttribute('aria-current', i === index ? 'step' : 'false'));
    for (const key of controls) {
      const input = get('param-'+key); input.value = params[key]; input.disabled = !step.editable?.includes(key);
      if (key !== 'type') get('value-'+key).textContent = key === 'frequency' ? params[key]+' Hz' : key === 'air' ? params[key]+'%' : params[key].toFixed(2);
    }
    get('step-prev').disabled = index === 0;
    get('step-next').disabled = index === steps.length-1;
    get('step-next').textContent = index === steps.length-1 ? '已到最后一步' : '下一步 →';
    updatePlay(); draw(); chart();
  }
  function selectStep(next) { stop(); index = next; params = { ...steps[index].preset }; time = 0; root.querySelector('.conclusion').open = false; show(); }
  function tick(now) {
    if (!playing || disposed) return;
    if (last !== null) time += Math.min((now-last)/1000, .06);
    last = now; draw(); frame = requestAnimationFrame(tick);
  }
  get('lab-play').addEventListener('click', () => { if (!world.ready) return; if (playing) stop(); else { playing = true; last = null; frame = requestAnimationFrame(tick); } updatePlay(); }, opts);
  get('lab-sound').addEventListener('click', playSound, opts);
  get('step-prev').addEventListener('click', () => { if (index > 0) selectStep(index-1); }, opts);
  get('step-next').addEventListener('click', () => { if (index < steps.length-1) selectStep(index+1); }, opts);
  root.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => selectStep(Number(button.dataset.step)), opts));
  for (const key of controls) get('param-'+key).addEventListener('input', e => { stop(); params[key] = key === 'type' ? e.target.value : Number(e.target.value); time = 0; show(); }, opts);
  get('lab-reset').addEventListener('click', () => { world.reset(); selectStep(0); }, opts);
  get('zoom-in').addEventListener('click', () => world.zoom(.85), opts);
  get('zoom-out').addEventListener('click', () => world.zoom(1.18), opts);
  get('camera-reset').addEventListener('click', () => world.reset(), opts);
  get('webgl-retry').addEventListener('click', () => world.recover(), opts);
  function collapse() { root.classList.remove('expanded'); document.body.classList.remove('lab-open'); get('lab-expand').textContent = '展开实验'; chart(); }
  get('lab-expand').addEventListener('click', () => { if (root.classList.contains('expanded')) collapse(); else { root.classList.add('expanded'); document.body.classList.add('lab-open'); get('lab-expand').textContent = '退出展开'; chart(); } }, opts);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') collapse(); }, opts);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, opts);
  window.addEventListener('pagehide', stop, opts);
  get('save-note').addEventListener('click', () => { const ok = saveNote?.(get('lab-note').value); get('note-state').textContent = ok ? '已保存在本机' : '本机存储不可用，请复制保留记录。'; }, opts);
  world = new World(get('lab-world'), status => {
    const failed = status !== 'ready';
    get('webgl-error').hidden = !failed; get('lab-play').disabled = failed; get('lab-sound').disabled = failed;
    if (failed) { stop(); get('webgl-error').querySelector('p').textContent = status === 'lost' ? '图形上下文已中断，演示和试听已停止。请恢复画面，或重新打开此页面。' : '请启用浏览器图形加速后重试。实验讲解仍可阅读。'; }
    if (!failed) draw();
  });
  const resize = new ResizeObserver(chart); if (id === 'wave') resize.observe(get('wave-chart'));
  selectStep(index);
  return () => { stop(); collapse(); disposed = true; abort.abort(); resize.disconnect(); world.dispose(); };
}
