import {test} from 'node:test';
import assert from 'node:assert/strict';
import {practiceCandidates} from '../ui/practice-picker.js';
test('picker searches titles and tags, filters levels, and removes duplicate and topic entries',()=>{
  const a={id:'a',title:'A+B 求和',level:1,tags:['循环']},b={id:'b',title:'饮品调制',level:5,tags:['贪心']};
  const groups=[[a,b],[a,{id:'topic',kind:'knowledge-topic',title:'贪心',level:5}]];
  assert.deepEqual(practiceCandidates(groups).map(p=>p.id),['a','b']);
  assert.deepEqual(practiceCandidates(groups,'Ａ＋Ｂ').map(p=>p.id),['a']);
  assert.deepEqual(practiceCandidates(groups,'贪心','5').map(p=>p.id),['b']);
  assert.deepEqual(practiceCandidates(groups,'饮品','1'),[]);
});
