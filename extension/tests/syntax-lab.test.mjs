import test from 'node:test';
import assert from 'node:assert/strict';
import {slideHtml} from '../ui/core.js';
import {labResult} from '../ui/syntax-lab.js';
const lab={title:'连接节点',task:'补写指针',starterCode:'int main(){ /* TODO */ }',input:'1',expectedOutput:'2',hint:'观察 next。'};
const page={kind:'语法',title:'节点',content:[],syntax:{code:'Node *next = nullptr;',notes:['指向 <Node> 的指针']},lab,code:'int main(){ secret_reference(); }'};
test('syntax and editable starter are public while reference solution stays locked',()=>{
 const html=slideHtml(page,{interactive:true,lesson:{id:'topic',topicSchema:2,problem:{kind:'knowledge-topic'},pages:[page]}});
 assert.match(html,/data-lab-code/);assert.match(html,/Node \*next = nullptr/);assert.match(html,/&lt;Node&gt;/);assert.ok(!html.includes('secret_reference'));assert.ok(!html.includes('伪代码示例'));
 const exported=slideHtml(page,{interactive:false,lesson:{topicSchema:2}});assert.ok(!exported.includes('data-lab-run'));assert.match(exported,/TODO/);
});
test('experiment checks only the original input and successful execution',()=>{
 assert.match(labResult({status:'OK',output:'2\r\n'},'1\n',lab),/✓ 输出与本例一致/);
 assert.match(labResult({status:'OK',output:'3'},'1',lab),/预期不同/);
 assert.match(labResult({status:'OK',output:'2'},'9',lab),/你修改了输入/);
 assert.ok(!labResult({status:'CE',compile:'syntax error'},'1',lab).includes('✓'));
});
