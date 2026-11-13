// 仅做分发完整性、语法和课程数据的基本检查，不代替浏览器或教学验收。
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import './check-exams.mjs';
import './check-tutor.mjs';
import './check-chat-media.mjs';
import { modules, lessons } from '../src/curriculum.js';
import {simulations,initialValues,lensImage,circuitValues,iceHeating} from '../src/simulations.js';
import {sceneFor,stepPresets} from '../src/simulation-scenes.js';
import {projects,requiredExperiments} from '../src/practice-projects.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['nativeMessaging']);
assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1/*', 'http://localhost/*']);
for (const path of ['index.html', 'styles.css', 'exams.css', 'tutor.css', 'start-learning.bat', 'restart-learning.bat', manifest.background.service_worker, ...Object.values(manifest.icons)]) assert.ok(existsSync(resolve(root,path)), '缺少分发文件：'+path);
for (const path of ['src/exam-bank.js', 'src/exam-extra.js', 'src/exam-view.js', 'src/tutor-api.js', 'src/tutor-view.js', 'src/chapter-chat.js', 'src/chat-images.js', 'src/chat-voice.js', 'src/service-control.js', 'scripts/check-exams.mjs']) execFileSync(process.execPath, ['--check',resolve(root,path)], { stdio: 'pipe' });
for (const path of ['background.js','src/app.js','src/curriculum.js','src/full-curriculum.js','src/practice-projects.js','src/simulations.js','src/simulation-view.js','src/simulation-scenes.js','src/simulation-lab.js','src/lab.js','src/world.js','scripts/check.mjs']) execFileSync(process.execPath, ['--check',resolve(root,path)], { stdio: 'pipe' });
assert.equal(modules.length, 7);
assert.equal(lessons.length, 64);
assert.equal(new Set(lessons.map(x=>x.id)).size, lessons.length);
for (const lesson of lessons) {
  assert.ok(lesson.sections.length >= 3 && lesson.takeaway && lesson.pitfall);
  assert.ok(Number.isInteger(lesson.question.answer) && lesson.question.options[lesson.question.answer]);
  assert.ok(modules.some(m=>m.id===lesson.module));
  if (lesson.lab) assert.ok(['fork','vacuum','wave',...simulations.map(s=>s.id)].includes(lesson.lab));
}
for(const m of modules){assert.ok(m.ready);assert.ok(lessons.some(l=>l.module===m.id));assert.ok(m.id==='acoustics'||simulations.some(l=>l.module===m.id));}
assert.equal(new Set(simulations.map(s=>s.id)).size,simulations.length);
assert.equal(projects.length,10);assert.equal(requiredExperiments.length,22);
for(const p of projects){assert.ok(modules.some(m=>m.id===p.module));assert.ok(['fork','vacuum','wave',...simulations.map(s=>s.id)].includes(p.lab));assert.equal(p.steps.length,3);assert.ok(p.evidence&&p.deliverable);}
for(const row of requiredExperiments)for(const id of row.slice(2))assert.ok(simulations.some(s=>s.id===id));
for(const s of simulations){
  assert.ok(lessons.some(l=>l.id===s.lesson),'missing related lesson '+s.id);
  assert.equal(s.guide.length,3);assert.ok(s.limit&&s.description);
  assert.equal(stepPresets[s.id]?.length,3,'missing experiment steps '+s.id);
  const base=initialValues(s),cases=[base,...stepPresets[s.id].map(p=>({...base,...p}))];
  for(const c of s.controls)for(const n of c.options?c.options.map((_,i)=>i):[c.min,c.max])cases.push({...base,[c.key]:n});
  for(const p of cases){const r=s.calculate(p);assert.ok(r.text&&r.metrics.length);for(const [label,n] of r.metrics)assert.ok(label&&(n===null||Number.isFinite(n)),s.id+' invalid result');const scene=sceneFor(s,p,r);assert.ok(scene.items.length>10,s.id+' missing apparatus');for(const item of scene.items){assert.ok([...item.pos,...item.scale,...item.color,...(item.orientation||[])].every(Number.isFinite),s.id+' invalid 3D geometry');assert.ok(item.scale.every(n=>n>0),s.id+' invalid mesh scale');}}
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
near(lensImage(30,10).v,15);near(lensImage(20,10).m,-1);near(lensImage(5,10).v,-10);assert.equal(lensImage(10,10).v,null);
const series=circuitValues({u:6,r1:10,r2:20});near(series.i,.2);near(series.u1+series.u2,6);
const parallel=circuitValues({u:6,r1:10,r2:20,mode:1});near(parallel.i,.9);near(parallel.i1+parallel.i2,parallel.i);
assert.equal(circuitValues({u:6,r1:10,r2:20,closed:0}).i,0);
assert.equal(iceHeating(100000,1).t,0);near(iceHeating(397000,1).t,10);
assert.equal(iceHeating(500000,.5).t,100);
const run=(id,patch={})=>{const d=simulations.find(s=>s.id===id);return d.calculate({...initialValues(d),...patch}).metrics;};
near(run('density')[1][1],2.7);near(run('buoyancy')[0][1],1);near(run('pressure')[0][1],2000);
near(run('lever')[0][1],run('lever')[1][1]);near(run('ohm')[0][1],.2);near(run('joule',{i:2})[0][1],4*run('joule',{i:1})[0][1]);
assert.equal(run('induction',{closed:0})[1][1],0);assert.equal(run('induction',{direction:1})[1][1],0);
near(run('communication')[0][1],1);near(run('energy-budget')[0][1]+run('energy-budget')[1][1],run('energy-budget')[2][1]);
const html = readFileSync(resolve(root,'index.html'), 'utf8');
assert.equal(html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1], manifest.content_security_policy.extension_pages, '页面和扩展的连接策略必须一致');
assert.ok(!/<script[^>]*src=["']https?:/i.test(html));
assert.ok(manifest.content_security_policy.extension_pages.includes("script-src 'self'"));
console.log(`检查通过：Manifest V3、分发文件、语法、${modules.length} 个模块、${lessons.length} 节课程、${simulations.length+3} 个交互实验；模型边界、光学/力学/电学数值回归。`);
