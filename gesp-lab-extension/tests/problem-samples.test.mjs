import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeProblem,problemSamplesHtml,sampleReferenceHtml} from '../ui/core.js';

test('all 18 course samples survive normalization and appear in preview and lesson references',()=>{
  let count=0;
  const folder=new URL('../data/gesp/level-5/',import.meta.url);
  for(const name of fs.readdirSync(folder).filter(name=>name.startsWith('xiaohou-'))){
    const p=normalizeProblem(JSON.parse(fs.readFileSync(new URL(name,folder))));
    count+=p.samples.length;
    assert.equal(p.sampleInput,p.samples[0].input);
    for(const html of [problemSamplesHtml(p,{compact:true}),sampleReferenceHtml(p)]){
      for(const s of p.samples){assert.ok(html.includes(s.input));assert.ok(html.includes(s.output));}
    }
  }
  assert.equal(count,18);
});

test('multi-sample rendering escapes all text and preserves leading spaces',()=>{
  const p=normalizeProblem({title:'x',description:'x',samples:[{input:'  <img>\n',output:'<script>',explanation:'<iframe>'}]});
  assert.equal(p.cases[0].input,'  <img>\n');
  const html=problemSamplesHtml(p);
  assert.ok(html.includes('  &lt;img&gt;\n'));
  for(const tag of ['img','script','iframe']){assert.ok(html.includes(`&lt;${tag}&gt;`));assert.ok(!html.includes(`<${tag}>`));}
  for(const samples of [null,{},[null],[{input:'a'}],[{input:'a',output:'b',explanation:4}]])assert.throws(()=>normalizeProblem({title:'x',description:'x',samples}));
});

test('legacy single-sample questions still render',()=>{
  const html=problemSamplesHtml({sampleInput:'2\n',sampleOutput:'4\n',sampleLabel:'自编示例'});
  assert.ok(html.includes('自编示例'));assert.ok(html.includes('2\n'));assert.ok(html.includes('4\n'));
});
