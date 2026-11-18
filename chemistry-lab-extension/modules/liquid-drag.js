export function isLiquidSource(engine,id) {
 const w=engine?.workbench,p=engine?.state.items[id];
 return Boolean(w&&!w.demonstration&&!engine.state.failure&&p?.present&&!p.consumed&&!p.parent&&!p.solidContents&&['bottle','beaker','cylinder','dropper'].includes(p.type)&&w.visualFill(id)>.001&&Object.values(engine.state.items).some(q=>w.canCombine(id,q.id)));
}

// Labels, highlight boxes and invisible decorative meshes must not raise the cup.
export function visibleBodyBounds(THREE,model,isVisible) {
 const box=new THREE.Box3();
 model?.userData.body.traverse(node=>{
  if(!node.isMesh||!isVisible(node))return;
  if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
  box.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
 });
 return box;
}

export function liquidLiftHeight(THREE,models,id,isVisible) {
 let top=0;
 for(const [other,model]of models){
  if(other===id||!model.visible)continue;
  const box=visibleBodyBounds(THREE,model,isVisible);
  if(!box.isEmpty())top=Math.max(top,box.max.y);
 }
 const model=models.get(id),own=visibleBodyBounds(THREE,model,isVisible);
 const bottom=own.isEmpty()?0:own.min.y-model.position.y;
 return Math.max(model.position.y,top+.25-bottom);
}
