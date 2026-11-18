import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {problemSource,librarySources,filterLibrary,isSourceTag} from '../ui/library-filters.js';
const bank=JSON.parse(fs.readFileSync(new URL('../data/gesp/index.json',import.meta.url))).problems;

test('source filtering identifies all ten imported questions from index metadata',()=>{
  assert.deepEqual(new Set(librarySources(bank)),new Set(['学而思','CCF GESP']));
  assert.equal(filterLibrary(bank,{level:5,source:'学而思'}).length,10);
  assert.equal(filterLibrary(bank,{level:5,source:'CCF GESP'}).length,26);
  assert.equal(filterLibrary(bank,{level:5}).length,36);
  assert.equal(filterLibrary(bank,{level:4,source:'学而思'}).length,0);
});

test('source combines with session, knowledge and search instead of replacing them',()=>{
  const filters={level:5,source:'学而思',session:'2026-11-21 小猴模考训练 I'};
  assert.equal(filterLibrary(bank,filters).length,4);
  assert.deepEqual(filterLibrary(bank,{...filters,tag:'队列',query:'炸弹'}).map(p=>p.title),['炸弹猴']);
  assert.equal(filterLibrary(bank,{...filters,tag:'队列',query:'水果'}).length,0);
});

test('explicit source labels take priority and uploaded sources can join the options',()=>{
  assert.equal(problemSource({tags:['来源：学而思'],source:{organization:'小猴编程'}}),'学而思');
  assert.equal(problemSource({source:{organization:'学校题库'}}),'学校题库');
  assert.equal(problemSource({kind:'uploaded'}),'我的上传');
  assert.equal(problemSource({kind:'generated'}),'AI 生成');
  assert.equal(problemSource({}),'其他来源');
  assert.ok(librarySources([...bank,{kind:'uploaded'}]).includes('我的上传'));
  assert.equal(isSourceTag('来源：学而思'),true);assert.equal(isSourceTag('排序'),false);
});
