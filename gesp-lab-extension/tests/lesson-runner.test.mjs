import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeLessonCode,executionHtml} from '../ui/lesson-runner.js';
import {slideHtml,exportHtml} from '../ui/core.js';

test('the selected lesson source and entered stdin are sent to the native runner',async()=>{
  const code='#include <iostream>\nint main(){std::cout<<2;}';
  let sent;
  const result=await executeLessonCode(async value=>{sent=value;return {status:'OK',output:'2',error:'diagnostic',timeMs:10};},code,'10\n');
  assert.deepEqual(sent,{mode:'run',code,input:'10\n'});assert.equal(result.status,'OK');assert.equal(result.error,'diagnostic');
});
test('compile failures and malicious diagnostic text are rendered as text',()=>{
  const html=executionHtml({status:'CE',compile:'<script>error()</script>'});
  assert.ok(html.includes('编译失败'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
test('native bridge errors are reported and oversized submissions never execute',async()=>{
  await assert.rejects(()=>executeLessonCode(async()=>({error:'not installed'}),'int main(){}',''),/not installed/);
  await assert.rejects(()=>executeLessonCode(async()=>assert.fail('must not send'),'a'.repeat(220000),''),/过大/);
});
test('run controls appear on interactive code slides and not in exported HTML',()=>{
  const page={kind:'代码',title:'解法',content:[],code:'int main(){}',narration:''};
  assert.ok(slideHtml(page,{interactive:true,codeUnlocked:true}).includes('data-action="run-lesson-code"'));
  assert.ok(!exportHtml({title:'测试',targetLevel:5,model:'test',pages:[page]}).includes('run-lesson-code'));
});
