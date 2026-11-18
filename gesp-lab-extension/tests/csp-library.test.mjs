import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeProblem,recommendProblems} from '../ui/core.js';
import {filterLibrary} from '../ui/library-filters.js';
import {contestProse,cspDetails,theoryFeedback} from '../ui/csp-library.js';
import {practiceCandidates} from '../ui/practice-picker.js';

const root=new URL('../',import.meta.url);
const catalog=JSON.parse(fs.readFileSync(new URL('data/csp/index.json',root)));
const bank=catalog.problems;
const problems=bank.map(row=>normalizeProblem(JSON.parse(fs.readFileSync(new URL(row.file,root)))));

test('imported catalog retains usable samples, theory answers and local images',()=>{
  assert.equal(problems.length,115);
  assert.equal(new Set(problems.map(p=>p.id)).size,115);
  const coding=problems.filter(p=>p.kind!=='theory'),theory=problems.filter(p=>p.kind==='theory');
  assert.equal(coding.length,100);assert.equal(theory.length,15);
  assert.equal(coding.reduce((n,p)=>n+p.samples.length,0),290);
  for(const p of problems){
    const row=bank.find(r=>r.id===p.id);
    assert.equal(row.level,p.level);
    assert.ok(p.levelBasis && p.levelStatus==='学习参考');
    assert.ok(p.tags.includes('来源：学而思'));
    assert.ok(p.occurrences.every(r=>r.week&&r.periodLabel&&r.group));
    if(p.kind==='theory'){
      assert.ok(p.options.length>=2&&p.answer.length);
      assert.ok(p.answer.every(a=>p.options.some(o=>o.label===a)));
      assert.equal(theoryFeedback(p,p.answer),'回答正确。');
      assert.equal(p.cases.length,0);
    }else{
      assert.equal(p.cases.length,p.samples.length);
      assert.equal(p.cases.reduce((n,c)=>n+c.score,0),100);
      p.samples.forEach((s,i)=>{assert.equal(p.cases[i].input,s.input);assert.equal(p.cases[i].expected,s.output);});
    }
    for(const match of JSON.stringify(p).matchAll(/data\/csp\/assets\/images\/[a-f0-9]+\.png/g))assert.ok(fs.existsSync(new URL(match[0],root)));
    assert.doesNotMatch(p.description,/<img\b/i);
  }
});

test('CSP and GESP selectors reference the same records without duplication',()=>{
  assert.equal(filterLibrary(bank,{group:'csp-j'}).length,115);
  assert.equal(filterLibrary(bank,{group:'csp-s'}).length,0);
  const acrossLevels=Array.from({length:8},(_,i)=>filterLibrary(bank,{level:i+1,source:'学而思'})).flat();
  assert.deepEqual(new Set(acrossLevels.map(p=>p.id)),new Set(bank.map(p=>p.id)));
  assert.equal(acrossLevels.length,115);
  for(const p of bank)assert.equal(filterLibrary(bank,{level:p.level,tag:p.knowledgePoints[0]}).find(r=>r.id===p.id),p);
});

test('season, week and original contest group must match one occurrence together',()=>{
  const sample={id:'shared',group:'csp-j',level:5,tags:['来源：学而思'],knowledgePoints:['贪心'],occurrences:[
    {periodLabel:'2026 春季 第 9 周',week:9,group:'普及奠基组'},
    {periodLabel:'2026 秋季 第 8 周',week:8,group:'普及进阶组'}]};
  for(const selection of [{group:'csp-j'},{level:5}]){
    assert.equal(filterLibrary([sample],{...selection,session:'2026 春季 第 9 周',week:'8'}).length,0);
    assert.equal(filterLibrary([sample],{...selection,week:'9',contestGroup:'普及进阶组'}).length,0);
    assert.equal(filterLibrary([sample],{...selection,week:'8',contestGroup:'普及进阶组',tag:'贪心',source:'学而思'}).length,1);
  }
});

test('theory problems remain selectable in the library but never enter C++ practice or recommendations',()=>{
  assert.equal(filterLibrary(bank,{group:'csp-j',questionType:'theory'}).length,15);
  assert.equal(filterLibrary(bank,{group:'csp-j',questionType:'programming'}).length,100);
  assert.equal(practiceCandidates([bank,bank]).length,100);
  for(const p of problems)assert.ok(recommendProblems(bank,p,115).every(r=>r.kind!=='theory'));
});

test('theory grading compares whole answers and waits for a selection',()=>{
  const p={answer:['A','C']};
  assert.equal(theoryFeedback(p,[]),'请先选择答案。');
  assert.equal(theoryFeedback(p,['C','A']),'回答正确。');
  assert.match(theoryFeedback(p,['A']),/标准答案：A、C/);
  assert.match(theoryFeedback(p,['A','B','C']),/标准答案/);
});

test('contest content displays local images and escapes untrusted markup and metadata',()=>{
  assert.match(contestProse('![图](data/csp/assets/images/abcdef.png)'),/<img/);
  assert.doesNotMatch(contestProse('![图](https://example.org/track.png)'),/<img/);
  assert.doesNotMatch(contestProse('<script>alert(1)</script>'),/<script>/);
  const html=cspDetails({id:'x',group:'csp-j',level:5,levelBasis:'<img src=x onerror=alert(1)>',kind:'theory',answer:['A'],description:'说明',options:[{label:'A',text:'选项'}]});
  assert.match(html,/学习参考/);assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/type="radio"/);assert.match(html,/核对答案/);
});
