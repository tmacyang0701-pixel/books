import {GUIDES,applyOperations} from '../data/guides.js';
export class LabPlayback{
 constructor(engine,{onStep=()=>{},onChange=()=>{}}={}){this.engine=engine;this.steps=GUIDES[engine.lab.id];if(!this.steps?.length)throw Error('当前实验暂无演示');this.onStep=onStep;this.onChange=onChange;this.index=0;this.elapsed=0;this.running=false;this.finished=false;this.narrating=false;this.pace=1;}
 get current(){return this.steps[this.index];}
 get duration(){return Math.min(16,Math.max(5,this.current.text.length*.115));}
 get progress(){return Math.min(1,this.elapsed/this.duration);}
 start(){this.index=0;this.finished=false;this.running=true;this.engine.reset();this.enter();}
 enter(){this.elapsed=0;this.narrating=false;this.engine.state.speed=1;this.engine.state.paused=!this.running;const step=this.current;this.engine.workbench?.demoStep(this.index);if(step.focus)this.engine.select(step.focus);applyOperations(this.engine,step.operations);this.onStep(step,this.index);this.onChange();}
 simulate(seconds){const paused=this.engine.state.paused;this.engine.state.paused=false;while(seconds>1e-7){const part=Math.min(1,seconds);this.engine.advance(part);seconds-=part;}this.engine.state.paused=paused;}
 update(dt){if(!this.running||this.finished||!Number.isFinite(dt)||dt<=0)return;let available=dt*this.pace;while(available>1e-7&&this.running){const part=Math.min(available,Math.max(0,this.duration-this.elapsed));this.simulate(this.current.seconds*part/this.duration);this.elapsed+=part;available-=part;if(this.engine.state.failure){this.pause();break;}if(this.elapsed>=this.duration-1e-7){this.engine.observe('自动演示：'+this.current.title);if(this.index===this.steps.length-1){this.finished=true;this.running=false;this.engine.state.paused=true;this.onChange();break;}this.index++;this.enter();}else break;} }
 pause(){this.running=false;this.engine.state.paused=true;this.onChange();}
 resume(){if(this.finished)return;this.running=true;this.engine.state.paused=false;this.onChange();}
 seek(index){if(!Number.isInteger(index)||index<0||index>=this.steps.length)return;const running=this.running;this.engine.reset();this.engine.state.speed=1;for(let i=0;i<index;i++){const step=this.steps[i];this.engine.workbench?.demoStep(i);applyOperations(this.engine,step.operations);this.simulate(step.seconds);this.engine.observe('自动演示：'+step.title);}this.index=index;this.finished=false;this.running=running;this.enter();}
}
