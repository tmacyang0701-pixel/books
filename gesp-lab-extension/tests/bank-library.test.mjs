import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeProblem,recommendProblems} from '../ui/core.js';
import {belongsToLibrary,libraryPage,filterLibrary} from '../ui/library-filters.js';
import {classificationLabel,cspDetails,contestProse} from '../ui/csp-library.js';
const root=new URL('../',import.meta.url);
const catalog=JSON.parse(fs.readFileSync(new URL('data/xiaohou-bank/index.json',root)));

test('bank catalog records load without losing samples or inventing an unassigned GESP level',()=>{
  const seen=new Set();
  for(const row of catalog.problems){
    assert.ok(!seen.has(row.id));seen.add(row.id);
    const raw=JSON.parse(fs.readFileSync(new URL(row.file,root))),p=normalizeProblem(raw);
    assert.equal(p.level,raw.level);assert.equal(p.level,row.level);
    assert.equal(p.samples.length,p.cases.length);
    assert.equal(p.cases.reduce((sum,c)=>sum+c.score,0),p.cases.length?100:0);
    p.samples.forEach((s,i)=>{assert.equal(p.cases[i].input,s.input);assert.equal(p.cases[i].expected,s.output);});
    assert.ok(p.tags.includes('来源：学而思'));assert.ok(p.levelBasis);
    for(const a of p.assets||[])if(a.localPath)assert.ok(fs.existsSync(new URL(a.localPath,root)));
  }
});

test('ungraded questions remain browsable without appearing in an arbitrary GESP group',()=>{
  const p=normalizeProblem({id:'u',title:'待分类题',description:'题干',collection:'xiaohou-bank',group:'csp-s',level:null,levelStatus:'竞赛拓展',tags:[]});
  assert.equal(p.level,null);assert.equal(classificationLabel(p),'竞赛拓展');
  assert.equal(belongsToLibrary(p,{group:'bank'}),true);
  assert.equal(belongsToLibrary(p,{group:'ungraded'}),true);
  assert.equal(belongsToLibrary(p,{group:'csp-s'}),true);
  for(let level=1;level<=8;level++)assert.equal(belongsToLibrary(p,{level}),false);
  assert.doesNotMatch(cspDetails(p),/GESP null/);
});

test('bank provenance and original difficulty combine with topic filters',()=>{
  const entries=[
    {id:'a',collection:'xiaohou-bank',group:'csp-j',level:5,title:'甲',bankCode:'X59',bankOrigin:'CSP-J',platformDifficulty:'普及-',knowledgePoints:['贪心'],tags:['来源：学而思']},
    {id:'b',collection:'xiaohou-bank',group:'csp-s',level:null,title:'乙',bankOrigin:'CSP-S',platformDifficulty:'提高+/省选-',knowledgePoints:['贪心'],tags:['来源：学而思']}
  ];
  assert.deepEqual(filterLibrary(entries,{group:'bank',origin:'CSP-J',difficulty:'普及-',tag:'贪心'}).map(p=>p.id),['a']);
  assert.deepEqual(filterLibrary(entries,{group:'bank',query:'x59'}).map(p=>p.id),['a']);
  assert.equal(filterLibrary(entries,{group:'bank',origin:'CSP-J',difficulty:'提高+/省选-'}).length,0);
  assert.deepEqual(filterLibrary(entries,{group:'ungraded'}).map(p=>p.id),['b']);
  assert.ok(recommendProblems(entries,{id:'x',group:'csp-s',level:null}).every(p=>p.group==='csp-s'));
});

test('pagination exposes every record exactly once and clamps an old page after filtering',()=>{
  const rows=Array.from({length:9129},(_,id)=>({id}));
  const first=libraryPage(rows,1),last=libraryPage(rows,46);
  assert.equal(first.items.length,200);assert.equal(last.items.length,129);
  const collected=Array.from({length:first.pages},(_,i)=>libraryPage(rows,i+1).items).flat();
  assert.deepEqual(collected,rows);
  assert.equal(libraryPage(rows.slice(0,3),46).page,1);
  assert.deepEqual(libraryPage([],2).items,[]);
});

test('uncached images keep an explicit source link while cached images load locally',()=>{
  assert.match(contestProse('![图](data/xiaohou-bank/assets/images/abcdef.png)'),/<img/);
  assert.match(contestProse('![图](https://example.com/a.png)'),/未缓存/);
  assert.doesNotMatch(contestProse('![图](javascript:alert)'),/<a|<img/);
});
