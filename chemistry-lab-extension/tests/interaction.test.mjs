import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {createInteractiveEngine} from '../modules/workbench.js';
import {LabScene} from '../modules/scene.js';
import {isLiquidSource,visibleBodyBounds} from '../modules/liquid-drag.js';

// Exercise real model geometry and raycasting without requiring a WebGL driver.
globalThis.document={getElementById:()=>null,createElement:()=>({getContext:()=>new Proxy({},{get:(o,k)=>o[k]??(()=>{})})})};
function sceneFor(engine){
 const scene=Object.create(LabScene.prototype),handlers=new Map();
 scene.scene=new THREE.Scene();scene.root=new THREE.Group();scene.connections=new THREE.Group();scene.dropHighlights=new THREE.Group();scene.scene.add(scene.root,scene.connections,scene.dropHighlights);
 Object.assign(scene,{models:new Map(),highlightBoxes:new Map(),ray:new THREE.Raycaster(),pointer:new THREE.Vector2(),plane:new THREE.Plane(new THREE.Vector3(0,1,0),0),camera:new THREE.PerspectiveCamera(43,1000/600,.1,100),theta:.48,phi:1.12,radius:11.7,target:new THREE.Vector3(0,.8,0),ring:new THREE.Object3D(),pourStream:new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,1),new THREE.MeshBasicMaterial()),callbacks:{onSelect:id=>engine.select(id),onMove:(id,x,z)=>engine.move(id,x,z),onDrop:(a,b)=>engine.workbench.combine(a,b)},renderer:{render:()=>{},domElement:{getBoundingClientRect:()=>({x:0,y:0,left:0,top:0,width:1000,height:600}),addEventListener:(name,fn)=>handlers.set(name,fn),setPointerCapture:()=>{},hasPointerCapture:()=>false}}});
 scene.positionCamera();scene.camera.updateMatrixWorld(true);scene.load(engine);scene.bind();scene.handlers=handlers;return scene;
}
function setupFilter(engine){const w=engine.workbench;for(const pair of [['funnel','stand'],['receiver','stand'],['paper','funnel'],['wash','funnel'],['rod','funnel']])assert.equal(w.combine(...pair),true,pair.join(' → '));}
function screenPoint(scene,point){const p=point.clone().project(scene.camera);return{clientX:(p.x+1)*500,clientY:(1-p.y)*300};}

test('a selected full cup clears the actual apparatus, including assembled rod height',()=>{
 const e=createInteractiveEngine('purify');setupFilter(e);e.select('feed');const scene=sceneFor(e);
 const cup=visibleBodyBounds(THREE,scene.models.get('feed'),o=>scene.isVisible(o));
 for(const[id,model]of scene.models)if(id!=='feed'){
  const box=visibleBodyBounds(THREE,model,o=>scene.isVisible(o));
  assert.ok(cup.min.y>=box.max.y+.24,`cup must clear ${id}`);
 }
 const first=scene.models.get('feed').position.y;scene.update(0);assert.equal(scene.models.get('feed').position.y,first,'lift must not accumulate each frame');
 const top=scene.models.get('feed').localToWorld(new THREE.Vector3(0,1.3,0)).project(scene.camera);
 assert.ok(top.y<1&&top.y>-1,`raised cup must remain in view: ${top.y}`);
 e.select('stand');scene.update(0);assert.equal(scene.models.get('feed').position.y,e.state.items.feed.y);
 e.select('feed');e.state.data.feed=0;scene.update(0);assert.equal(isLiquidSource(e,'feed'),false);assert.equal(scene.models.get('feed').position.y,0);
});

test('step prerequisites warn without consuming solution; preparation can continue',()=>{
 const e=createInteractiveEngine('purify'),w=e.workbench,initial=e.state.data.feed;
 const reject=part=>{assert.equal(w.combine('feed','funnel'),false);assert.match(e.state.alerts.at(-1).message,part);assert.equal(e.state.failure,null);assert.equal(e.state.data.feed,initial);};
 reject(/固定漏斗/);w.combine('funnel','stand');w.combine('receiver','stand');reject(/滤纸/);
 w.combine('paper','funnel');reject(/润湿/);w.combine('wash','funnel');reject(/玻璃棒/);
 w.combine('rod','funnel');assert.equal(w.combine('feed','funnel'),true);assert.equal(e.state.data.feed,initial-10);assert.equal(e.state.data.filtrate,10);assert.ok(e.state.pour);
});

test('wrong targets warn every time and empty receiving cup cannot skip filtration',()=>{
 const e=createInteractiveEngine('purify'),w=e.workbench;
 assert.equal(w.combine('feed','heater'),false);const first=e.state.alerts.at(-1);assert.equal(first.severity,'warning');assert.match(first.message,/不能用于/);
 assert.equal(w.combine('feed','heater'),false);assert.notEqual(e.state.alerts.at(-1),first);
 assert.equal(w.combine('receiver','dish'),false);assert.match(e.state.alerts.at(-1).message,/先过滤/);assert.equal(e.state.failure,null);
 e.reset();assert.equal(e.state.alerts.length,0);assert.equal(e.state.data.feed,50);assert.equal(e.state.data.filtrate,0);
});

test('operation buttons enforce the same prerequisites as dragging',()=>{
 const e=createInteractiveEngine('purify');
 assert.equal(e.workbench.operate('pour'),false);
 assert.equal(e.state.failure,null);assert.equal(e.state.data.feed,50);
 assert.match(e.state.alerts.at(-1).message,/固定漏斗/);
 assert.equal(e.workbench.operate('transfer'),false);assert.match(e.state.alerts.at(-1).message,/先过滤/);
 setupFilter(e);e.workbench.operate('pour');assert.equal(e.state.data.filtrate,10);
});

test('pouring happens on release without a hover delay and preserves lifted animation origin',()=>{
 const e=createInteractiveEngine('purify');setupFilter(e);e.select('feed');const scene=sceneFor(e),source=scene.models.get('feed');
 const origin=source.position.clone();scene.drag={id:'feed',moved:true};scene.hoverTarget=null;scene.hoverSince=performance.now();scene.findDropTarget=()=> 'funnel';
 scene.handlers.get('pointerup')({type:'pointerup',pointerId:1});
 assert.equal(e.state.data.filtrate,10);assert.equal(scene.drag,null);scene.update(0);
 assert.deepEqual(scene.pourMotion.origin.toArray(),origin.toArray());assert.ok(scene.models.get('feed').position.y>2);
});

test('cancelled dragging never pours; invalid hovered equipment reaches warning checks',()=>{
 const e=createInteractiveEngine('purify');setupFilter(e);e.select('feed');const scene=sceneFor(e);
 scene.drag={id:'feed',moved:true};scene.findDropTarget=()=> 'heater';scene.handlers.get('pointercancel')({type:'pointercancel'});assert.equal(e.state.data.filtrate,0);
 scene.drag={id:'feed',moved:true};scene.handlers.get('pointerup')({type:'pointerup'});assert.equal(e.state.data.filtrate,0);assert.match(e.state.alerts.at(-1).message,/不能用于/);
});

test('raycasting resolves the filter paper to its funnel, and returns invalid apparatus too',()=>{
 const e=createInteractiveEngine('purify');setupFilter(e);const scene=sceneFor(e);
 const model=scene.models.get('funnel'),point=model.localToWorld(new THREE.Vector3(0,.75,0));
 assert.equal(scene.findDropTarget('feed',screenPoint(scene,point)),'funnel');
 const heater=scene.models.get('heater').localToWorld(new THREE.Vector3(0,.1,0));
 assert.equal(scene.findDropTarget('feed',screenPoint(scene,heater)),'heater');
});

test('warnings are dialogs inside the fullscreen workspace with an always available reset',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(!html.includes('id="trialFailure"'));assert.ok(!html.includes('id="dropHint"'));
 assert.match(html,/<div id="labWorkspace"[^>]*><dialog id="operationWarning"/);
 for(const id of ['resetScene','resetFromWarning','operationWarningReason'])assert.ok(html.includes(`id="${id}"`));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
 const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),dynamic=[...app.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert.ok([...ids,...dynamic].includes(m[1]),m[1]);
});
