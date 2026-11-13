import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startLearningService} from '../ui/service-control.js';
const jobId='a'.repeat(32),health={service:'codearena-learning',version:12,runCaseSchema:2,capabilities:['topicSyntaxLabs','knowledgeTopics','pageChat','socraticPageChat','imagePageChat','runCases','codeAnalysis']};
test('old native component requests one installation update before attempting launch',async()=>{
  const messages=[];
  await assert.rejects(startLearningService({sendNative:async p=>{messages.push(p);return {error:'old host'}},getHealth:async()=>health}),/本地组件仍是旧版/);
  assert.deepEqual(messages,[{mode:'capabilities'}]);
});
test('page launch polls native task then verifies the new HTTP service',async()=>{
  const messages=[];let count=0,checked=0;
  const answer=await startLearningService({sendNative:async p=>{messages.push(p);if(p.mode==='capabilities')return {capabilities:['learningServiceControl']};if(p.mode==='learning_service_start')return {id:jobId};return {status:++count===1?'running':'completed'};},getHealth:async()=>{checked++;return health;},sleep:async()=>{}});
  assert.equal(answer,health);assert.equal(checked,1);assert.deepEqual(messages[1],{mode:'learning_service_start',restart:true});
});
test('native startup errors are surfaced without claiming readiness',async()=>{
  await assert.rejects(startLearningService({sendNative:async p=>p.mode==='capabilities'?{capabilities:['learningServiceControl']}:p.mode==='learning_service_start'?{id:jobId}:{status:'failed',message:'permission denied'},getHealth:async()=>assert.fail('should not claim healthy')}),/permission denied/);
});
test('an old HTTP backend cannot count as a successful page launch',async()=>{
  await assert.rejects(startLearningService({sendNative:async p=>p.mode==='capabilities'?{capabilities:['learningServiceControl']}:p.mode==='learning_service_start'?{id:jobId}:{status:'completed'},getHealth:async()=>({service:'codearena-learning',version:1})}),/尚未就绪/);
});
