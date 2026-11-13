import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageVisual,visualHtml,visualContext} from '../ui/visuals.js';
import {exportHtml} from '../ui/core.js';
const lesson={id:'x',problem:{id:'gesp-2026-09-5-1',title:'哥德巴赫猜想'}};

test('Goldbach pairing animations enumerate the correct nonduplicated solutions',()=>{
  const ten=pageVisual({kind:'题目',title:'题目',content:[]},lesson);
  assert.deepEqual(ten.frames.at(-1).active,['p3','p5']);
  const twentySix=pageVisual({kind:'步骤',title:'n=26',content:[]},lesson);
  assert.deepEqual(twentySix.frames.at(-1).active,['p3','p7','p13']);
});
test('sieve ends with exactly the primes through 30',()=>{
  const visual=pageVisual({kind:'知识',title:'筛法',content:[]},lesson);
  assert.deepEqual(visual.frames.at(-1).active.map(id=>Number(id.slice(1))),[2,3,5,7,11,13,17,19,23,29]);
  assert.ok(visual.frames[0].marked.includes('n0'));
});
test('visual labels and captions are escaped, and export needs no scripts',()=>{
  const visual={type:'flow',title:'"><script>alert(1)</script>',nodes:[{id:'a',label:'<img onerror=x>'}],frames:[{caption:'<iframe>',active:['a']}]};
  const html=visualHtml(visual,0,{interactive:true});
  assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('<svg'));
  const exported=exportHtml({...lesson,title:'演示',targetLevel:5,model:'test',pages:[{kind:'知识',title:'筛法',content:[],narration:''}]});
  assert.ok(exported.includes('<svg'));assert.ok(!exported.includes('data-visual='));assert.ok(!exported.includes('<script'));
});
test('chat receives the currently selected animation state',()=>{
  const visual=pageVisual({kind:'题目',title:'题目',content:[]},lesson);
  const context=JSON.parse(visualContext(visual,visual.frames.length-1));
  assert.equal(context.nodes.find(n=>n.label==='3 + 7').state,'当前关注/保留');
  assert.equal(context.nodes.find(n=>n.label==='2 + 8').state,'已排除');
});
