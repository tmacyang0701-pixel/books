import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageQuestions,questionsHtml} from '../ui/page-questions.js';
const lesson={problem:{id:'gesp-2026-09-5-1',title:'哥德巴赫猜想'}};

test('different Goldbach pages ask about their own concepts instead of repeating generic prompts',()=>{
  const pages=[
    {kind:'题目',title:'题目描述'},
    {kind:'题目',title:'样例分析与约束'},
    {kind:'知识',title:'埃拉托斯特尼筛法'},
    {kind:'思路',title:'枚举与去重',content:['用筛法预处理质数表']},
    {kind:'步骤',title:'详细步骤演示 (n=26)'},
    {kind:'代码',title:'C++ 完整实现',code:'int main(){}'},
    {kind:'复杂度',title:'复杂度分析'},
    {kind:'易错',title:'常见易错点'},
    {kind:'总结',title:'课程总结'},
  ];
  const questions=pages.map(page=>pageQuestions(page,lesson));
  assert.equal(new Set(questions.map(JSON.stringify)).size,pages.length);
  for(const q of questions){assert.equal(q.length,3);assert.equal(new Set(q).size,3);}
  assert.ok(questions[2].some(q=>q.includes('p×p')));
  assert.ok(questions[3].some(q=>q.includes('n/2')));
  assert.ok(questions[4].some(q=>q.includes('n=26')));
  assert.ok(!questions[3].some(q=>q.includes('p×p')),'an incidental sieve mention must not override enumeration focus');
});

test('generated per-page questions take priority and malformed optional data falls back locally',()=>{
  const page={title:'前缀和',questions:['为什么用前缀和相减？','为什么用前缀和相减？',null,'x','a'.repeat(81),'区间左端点怎么处理？']};
  const questions=pageQuestions(page,{});
  assert.equal(questions.length,3);
  assert.equal(questions[0],'为什么用前缀和相减？');assert.equal(questions[1],'区间左端点怎么处理？');
  assert.equal(pageQuestions({...page,questions:'invalid'},{}).length,3);
});

test('unrelated lessons and pages cannot inherit Goldbach-specific suggestions',()=>{
  const binary=pageQuestions({title:'二分查找',kind:'知识',content:['维护左右端点']},{problem:{title:'找数'}});
  const gcd=pageQuestions({title:'辗转相除法',kind:'知识'},{problem:{title:'晚宴'}});
  assert.ok(binary.some(q=>q.includes('区间')));assert.ok(gcd.some(q=>q.includes('取余')));
  assert.ok(![...binary,...gcd].some(q=>/质数|n\/2|p×p/.test(q)));
});

test('suggestions send a guided question and escape authored HTML in labels and attributes',()=>{
  const html=questionsHtml({title:'数组',questions:['<img src=x onerror="alert(1)"> 是什么？']},{});
  assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('请引导我思考'));assert.ok(html.includes('先给一个小提示或小问题'));
});
