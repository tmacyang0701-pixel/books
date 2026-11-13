import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CodeAccessState} from '../ui/code-access.js';
import {slideHtml,exportHtml} from '../ui/core.js';

const page={kind:'代码',title:'实现',content:[],code:'int SECRET_CXX_TOKEN = 42;',pseudocode:'先计算，再输出',narration:''};
const lesson={id:'lesson-a',title:'Example',model:'test',targetLevel:5,pages:[page]};

test('incorrect passwords do not unlock and correct password applies only to selected pages',async()=>{
  const access=new CodeAccessState();
  for(const password of ['', 'wkn%sy24','WKN%sy24 '])assert.equal(await access.unlock(password,[[lesson.id,0]]),false);
  assert.equal(access.has(lesson.id,0),false);
  assert.equal(await access.unlock('WKN%sy24',[[lesson.id,0]]),true);
  assert.equal(access.has(lesson.id,0),true);
  assert.equal(access.has(lesson.id,1),false);
  assert.equal(access.has('lesson-b',0),false);
});
test('relocking, deleting, or a fresh page session removes access',async()=>{
  const access=new CodeAccessState();
  await access.unlock('WKN%sy24',[[lesson.id,0],[lesson.id,1],['lesson-b',0]]);
  access.lock(lesson.id,0);assert.equal(access.has(lesson.id,0),false);
  access.forgetLesson(lesson.id);assert.equal(access.has(lesson.id,1),false);
  assert.equal(access.has('lesson-b',0),true);
  assert.equal(new CodeAccessState().has('lesson-b',0),false);
});
test('cancelled password requests cannot grant access after verification completes',async()=>{
  const access=new CodeAccessState();
  assert.equal(await access.unlock('WKN%sy24',[[lesson.id,0]],()=>false),false);
  assert.equal(access.has(lesson.id,0),false);
});
test('locked slides omit C++ source and run controls while keeping pseudocode visible',()=>{
  const locked=slideHtml(page,{interactive:true,lesson});
  assert.ok(!locked.includes('SECRET_CXX_TOKEN'));assert.ok(!locked.includes('run-lesson-code'));
  assert.ok(locked.includes('unlock-lesson-code'));assert.ok(locked.includes(page.pseudocode));
  const unlocked=slideHtml(page,{interactive:true,lesson,codeUnlocked:true});
  assert.ok(unlocked.includes('SECRET_CXX_TOKEN'));assert.ok(unlocked.includes('run-lesson-code'));assert.ok(unlocked.includes('lock-lesson-code'));
});
test('exports omit complete code by default and include it only when requested after unlocking',()=>{
  assert.ok(!exportHtml(lesson).includes('SECRET_CXX_TOKEN'));
  const allowed=exportHtml(lesson,{includeCode:true});
  assert.ok(allowed.includes('SECRET_CXX_TOKEN'));assert.ok(!allowed.includes('run-lesson-code'));
});
