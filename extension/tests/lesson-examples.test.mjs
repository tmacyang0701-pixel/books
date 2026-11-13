import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drinkExample,examplesForPage,usesOriginalSample} from '../ui/lesson-examples.js';
import {slideHtml,exportHtml} from '../ui/core.js';
const lesson={id:'drink',title:'饮品调制',problem:{id:'gesp-2026-09-5-2',title:'饮品调制',sampleInput:'2 5\n2 0\n3 10\n',sampleOutput:'4.000\n',sampleLabel:'自编示例'},pages:[]};

test('sample reference appears only where the page uses it',()=>{
  for(const kind of ['代码','复杂度','总结','易错'])assert.equal(usesOriginalSample({kind,title:'普通页面',content:[]},lesson),false);
  assert.equal(usesOriginalSample({kind:'题目',title:'读题'},lesson),true);
  assert.equal(usesOriginalSample({kind:'知识',title:'样例分析'},lesson),true);
  assert.equal(usesOriginalSample({kind:'知识',title:'概念',useOriginalSample:true},lesson),true);
  assert.equal(usesOriginalSample({kind:'题目',useOriginalSample:false},lesson),false);
  const html=slideHtml({kind:'复杂度',title:'复杂度',content:[]},{lesson});assert.ok(!html.includes('原题示例参考'));
});

test('drink examples balance sugar and use valid volumes, including fractional and impossible cases',()=>{
  const examples=examplesForPage({kind:'步骤',title:'详细步骤'},lesson);
  assert.deepEqual(examples.map(e=>e.output),['4.000','2.667','5.000','0.000']);
  for(const example of examples){
    const numbers=example.input.trim().split(/\s+/).map(Number),target=numbers[1],last=example.visual.frames.at(-1);
    const used=example.visual.nodes.slice(0,-1).map(n=>Number(last.values[n.id].match(/^取 ([\d.]+)/)[1]));
    assert.ok(used.every((v,i)=>v>=0&&v<=numbers[2+i*2]+.001));
    assert.ok(Math.abs(used.reduce((sum,v,i)=>sum+v*(numbers[3+i*2]-target),0))<.005);
    assert.ok(Math.abs(used.reduce((a,b)=>a+b,0)-Number(example.output))<.002);
  }
  const greedy=examplesForPage({kind:'思路',title:'贪心策略'},lesson)[0];
  assert.equal(greedy.output,'6.000');assert.match(greedy.explanation,/2 升/);
});

test('supplemental examples escape text, coexist with original when requested, and export all alternatives',()=>{
  const page={kind:'步骤',title:'示例',content:[],useOriginalSample:true,examples:[{title:'<script>',input:'a < b',output:'1',explanation:'<img>',visual:null}]};
  const html=slideHtml(page,{lesson,interactive:true});
  assert.ok(html.includes('原题示例参考'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img>'));
  const exported=exportHtml({...lesson,pages:[{kind:'步骤',title:'详细步骤',content:[],narration:''}]});
  for(const name of ['原题示例','小数用量','含糖量全都正好','只有高糖原料'])assert.ok(exported.includes(name));
  assert.ok(!exported.includes('data-example-frame'));
});

test('small exhaustive corner solutions independently check the illustrated greedy result',()=>{
  let seed=8;const random=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};
  for(let trial=0;trial<40;trial++){
    const n=3,t=5,items=Array.from({length:n},()=>({v:random(4)+1,d:random(11)-5}));let optimum=0;
    // One equality: an optimum vertex has at most one partially used ingredient.
    for(let pivot=0;pivot<n;pivot++)for(let mask=0;mask<(1<<n);mask++){
      const used=items.map((a,i)=>i===pivot?0:(mask>>i&1)*a.v);
      const delta=used.reduce((s,v,i)=>s+v*items[i].d,0);
      if(items[pivot].d===0){if(delta!==0)continue;used[pivot]=items[pivot].v;}
      else used[pivot]=-delta/items[pivot].d;
      if(used[pivot]<-1e-9||used[pivot]>items[pivot].v+1e-9)continue;
      optimum=Math.max(optimum,used.reduce((a,b)=>a+b,0));
    }
    const input=`${n} ${t}\n`+items.map(a=>`${a.v} ${t+a.d}`).join('\n');
    assert.ok(Math.abs(Number(drinkExample(input).output)-optimum)<=.000501,input);
  }
});
