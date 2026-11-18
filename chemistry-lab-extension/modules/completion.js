// Keep completion attached to this attempt; resetting creates a fresh state.
export function takeCompletion(engine,{automatic=false,finished=false}={}){
 const s=engine.state;
 if(s.failure||s.completion||(automatic&&!finished))return null;
 const criteria=engine.criteria();
 if(!criteria.length||!criteria.every(c=>c.met))return null;
 s.completion={automatic,at:s.elapsed,criteria:criteria.map(c=>({...c}))};
 return s.completion;
}
