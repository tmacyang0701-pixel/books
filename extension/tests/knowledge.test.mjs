import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {knowledgeParts,knowledgeId,topicProblems,topicProblem,topicPage,knowledgeTag,knowledgeHtml} from '../ui/knowledge.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../data/gesp/knowledge.json',import.meta.url))),bank=JSON.parse(fs.readFileSync(new URL('../data/gesp/index.json',import.meta.url))).problems;
test('every level overview topic opens a single teaching topic; identity survives regeneration',()=>{
 const levels=JSON.parse(fs.readFileSync(new URL('../data/gesp/levels.json',import.meta.url))).levels;
 for(const level of levels)for(const topic of level.topics)for(const part of knowledgeParts(topic,catalog)){assert.ok(part);assert.ok(!catalog.groups[part]);const p=topicProblem(part,level.level);assert.equal(p.id,knowledgeId(part,level.level));assert.equal(p.kind,'knowledge-topic');assert.deepEqual(p.tags,[part]);assert.deepEqual(p.cases,[]);assert.match(p.description,/2～3 个小用例/);}
 assert.notEqual(knowledgeId('贪心',5),knowledgeId('贪心',6));assert.notEqual(knowledgeId('贪心',5),knowledgeId('排序',5));
});
test('single-topic bank selection excludes mixed algorithms and higher levels; bank hides LLM fallback',()=>{
 const list=[{id:'g',level:5,tags:['贪心'],session:'2026-09'},{id:'mixed',level:5,tags:['贪心','排序']},{id:'basic',level:4,tags:['贪心','循环']},{id:'high',level:6,tags:['贪心']}];
 const result=topicProblems(list,'贪心',5,catalog);assert.deepEqual(result.single.map(p=>p.id),['g','basic']);assert.equal(result.related.length,3);
 assert.equal(topicProblems(bank,'高精度',5,catalog).single.length,0);assert.ok(topicProblems(bank,'枚举',3,catalog).single.length);
 const props={topic:'贪心',level:5,catalog,bank:list,lessons:[],generated:[],card:p=>p.id};
 assert.ok(!knowledgeHtml(props).includes('data-action="knowledge-practice"'));
 assert.ok(knowledgeHtml({...props,bank:[]}).includes('data-action="knowledge-practice"'));
 assert.ok(knowledgeHtml({...props,bank:[],generated:[{id:'saved',level:5,knowledgeTopic:'贪心'}]}).includes('saved'));
});
test('related courseware links use problem identity and jump to the relevant concept page',()=>{
 const lesson={pages:[{title:'题目理解',content:['用贪心解决']},{title:'贪心策略',content:[]},{title:'完整代码',content:[]}]};assert.equal(topicPage(lesson,'贪心',catalog),1);
 const html=knowledgeHtml({topic:'贪心',level:5,catalog,bank:[{id:'drink',level:5,tags:['贪心','排序']}],lessons:[{id:'lesson',title:'饮品调制',problemId:'drink',targetLevel:5},{id:'wrong',title:'无关课件',problemId:'other'}],generated:[],card:p=>p.id});
 assert.match(html,/data-id="lesson"/);assert.ok(!html.includes('无关课件'));
 assert.ok(!knowledgeTag('<img src=x>',5).includes('<img'));
});
