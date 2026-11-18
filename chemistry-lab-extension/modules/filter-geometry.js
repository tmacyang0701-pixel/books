// Shared apparatus positions keep heating, tool contact and 3D rendering consistent.
export const FILTER_HEAT_RADIUS=.35;
export function filterHeatContact(items){const {dish,heater}=items;return Boolean(dish?.present&&heater?.present&&Math.hypot(dish.x-heater.x,dish.z-heater.z)<=FILTER_HEAT_RADIUS&&Math.abs((dish.y||0)-((heater.y||0)+.37))<.08);}
export function filterRodPose(state){const {items,config:c,data:d}=state;if(!items.rod?.present)return null;
 if(c.stir&&items.dish?.present){const dish=items.dish,phase=state.elapsed*2.8,active=d.heater&&d.dish>0;return{mode:'stir',x:dish.x+Math.cos(active?phase:0)*.18,z:dish.z+Math.sin(active?phase:0)*.18,y:(dish.y||0)+.28+Math.min(.04,Math.max(0,d.dish)/45*.16),axis:{x:-.18,y:1,z:.05},moving:active};}
 if(c.guide&&items.funnel?.present){const funnel=items.funnel;return{mode:'guide',x:funnel.x-.48,z:funnel.z,y:(funnel.y||0)+.87,axis:{x:-.6,y:.8,z:0},moving:false};}
 return null;
}
