import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unpackPracticeRecords,variantsForProblem} from '../ui/practice-source.js';
test('switching source scopes variants and switching back restores them',()=>{
  const rows=unpackPracticeRecords([{sourceProblemId:'A',problems:[{id:'a'}]},{sourceProblemId:'B',problems:[{id:'b'}]}]);
  assert.deepEqual(variantsForProblem(rows,{id:'A'}).map(p=>p.id),['a']);
  assert.deepEqual(variantsForProblem(rows,{id:'B'}).map(p=>p.id),['b']);
  assert.deepEqual(variantsForProblem(rows,{id:'C'}),[]);
  assert.deepEqual(variantsForProblem(rows,{id:'A'}).map(p=>p.id),['a']);
  assert.deepEqual(variantsForProblem(rows,null),[]);
});
test('legacy lesson batches resolve after history loads; unknown and topic records do not leak',()=>{
  const rows=unpackPracticeRecords([{lessonId:'old',problems:[{id:'legacy'}]},{problems:[{id:'unknown'}]},{topic:'素数',problems:[{id:'topic',knowledgeTopic:'素数'}]}]);
  assert.deepEqual(variantsForProblem(rows,{id:'A'}),[]);
  assert.deepEqual(variantsForProblem(rows,{id:'A'},[{id:'old',problemId:'A'}]).map(p=>p.id),['legacy']);
  assert.deepEqual(variantsForProblem(rows,{id:'B'},[{id:'old',problemId:'A'}]),[]);
});
test('late generation result stays with its original problem after selection changes',()=>{
  const result={sourceProblemId:'A',problems:[{id:'new'}]};
  const rows=unpackPracticeRecords([result]);
  assert.deepEqual(variantsForProblem(rows,{id:'B'}),[]);
  assert.equal(variantsForProblem(rows,{id:'A'}).length,1);
  assert.equal(result.problems[0].sourceProblemId,undefined);
});
