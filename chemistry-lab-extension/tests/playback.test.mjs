import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInteractiveEngine} from '../modules/workbench.js';
import {LabPlayback} from '../modules/playback.js';
import {GUIDES} from '../data/guides.js';
import {takeCompletion} from '../modules/completion.js';

for(const id of Object.keys(GUIDES))test(`${id}: autoplay finishes even if speech never ends, with all goals met`,()=>{
 const e=createInteractiveEngine(id);e.workbench.demonstration=true;
 const p=new LabPlayback(e,{onStep:()=>{p.narrating=true;}});
 p.start();
 for(let i=0;i<1500&&p.running;i++)p.update(.2);
 assert.equal(p.finished,true);assert.equal(e.state.failure,null);
 assert.deepEqual(e.criteria().filter(c=>!c.met),[]);
 assert.equal(takeCompletion(e,{automatic:true,finished:false}),null);
 assert.ok(takeCompletion(e,{automatic:true,finished:p.finished}));
 assert.equal(takeCompletion(e,{automatic:true,finished:true}),null);
 p.start();assert.equal(e.state.completion,undefined);assert.equal(p.index,0);
});

test('pause freezes autoplay, resume continues, seek restores prerequisites',()=>{
 const e=createInteractiveEngine('purify'),p=new LabPlayback(e);p.start();p.update(2);p.pause();
 const elapsed=p.elapsed;p.update(30);assert.equal(p.elapsed,elapsed);
 p.resume();p.update(1);assert.ok(p.elapsed>elapsed);
 p.seek(3);assert.equal(e.state.data.dish,20);assert.equal(e.state.data.heater,true);
 while(p.running)p.update(.2);
 assert.equal(e.state.failure,null);assert.ok(e.criteria().every(c=>c.met));
});

test('manual completion only notifies once, resets, and excludes failed attempts',()=>{
 const e=createInteractiveEngine('purify'),w=e.workbench;
 assert.equal(takeCompletion(e),null);
 for(const pair of [['funnel','stand'],['receiver','stand'],['paper','funnel'],['wash','funnel'],['rod','funnel'],['feed','funnel'],['feed','funnel'],['receiver','dish'],['dish','heater'],['rod','dish']])assert.ok(w.combine(...pair),pair.join(' → '));
 e.setParam('heat',50);w.operate('heat-toggle');for(let i=0;i<41;i++)e.advance(1);
 assert.equal(takeCompletion(e),null,'crystals alone are not success');
 w.operate('heat-toggle');assert.ok(takeCompletion(e));assert.equal(takeCompletion(e),null);
 e.reset();assert.equal(takeCompletion(e),null);assert.equal(e.state.completion,undefined);
 Object.assign(e.state.data,{crystals:1});Object.assign(e.state.evidence,{filtered:true,stopInTime:true});e.state.config.stir=true;
 e.state.failure={message:'failed'};assert.equal(takeCompletion(e),null);
});
