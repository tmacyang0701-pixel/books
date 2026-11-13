import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pagePseudocode} from '../ui/pseudocode.js';
import {slideHtml,exportHtml} from '../ui/core.js';

test('existing drink pseudocode and examples use the same meaningful Chinese names without changing C++',()=>{
  const page={kind:'代码',title:'实现',content:[],narration:'',code:'double ans = 0, sum_pos_dev = 0;',pseudocode:'ans = 0; sum_pos = v * d; sum_neg = 0; target = sum_pos; high, low',pseudocodeExample:'sum_pos = 15, sum_neg = 10, target = 10, added_vol = 4'};
  const before=structuredClone(page),lesson={title:'饮品调制',problem:{id:'gesp-2026-09-5-2'},pages:[page]};
  const pseudo=pagePseudocode(page,lesson);
  assert.match(pseudo.code,/目标浓度原料体积/);assert.match(pseudo.code,/高糖偏差总量/);assert.match(pseudo.example,/高糖偏差总量 = 15/);
  assert.doesNotMatch(pseudo.code+pseudo.example,/\b(ans|sum_pos|sum_neg|high|low|target|added_vol)\b/);
  assert.deepEqual(page,before);
  const exported=exportHtml(lesson);
  assert.match(exported,/高糖偏差总量/);assert.ok(!exported.includes(page.code));
  assert.ok(slideHtml(page,{lesson,codeUnlocked:true}).includes(page.code));
});

test('identifier replacement leaves quoted outputs, longer identifiers and unknown names intact',()=>{
  const page={code:'example',pseudocode:'ans ← cnt; answer_count ← 1; 输出 "ans" 和 \'cnt\'; constructor; omega',pseudocodeExample:'cnt = 2'};
  const pseudo=pagePseudocode(page,{});
  assert.match(pseudo.code,/结果 ← 计数/);assert.match(pseudo.code,/answer_count/);assert.match(pseudo.code,/"ans"/);assert.match(pseudo.code,/'cnt'/);
  assert.match(pseudo.code,/constructor; omega/);
});

test('Goldbach fallback uses Chinese state names and keeps the equality endpoint',()=>{
  const pseudo=pagePseudocode({code:'example'},{problem:{id:'gesp-2026-09-5-1'}});
  assert.match(pseudo.code,/质数标记/);assert.match(pseudo.code,/方案数/);assert.match(pseudo.code,/包含端点/);
  assert.doesNotMatch(pseudo.code,/\b(isPrime|answer|ans|a|b|n|p)\b/);
  assert.match(pseudo.example,/5 \+ 5/);
});

test('already Chinese pseudocode stays unchanged, and non-code pages do not acquire it',()=>{
  const page={code:'example',pseudocode:'方案数 ← 0\n输出方案数',pseudocodeExample:'输出 0'};
  assert.deepEqual(pagePseudocode(page),{code:page.pseudocode,example:page.pseudocodeExample});
  assert.equal(pagePseudocode({...page,code:''}),null);
});
