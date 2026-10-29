// Emplacements fixes : mêmes coordonnées pour le terrain, les fantômes et les blocs.
export const OUTPOSTS={flag:{x:-21,z:21},nevada:{x:77,z:-19},forest:{x:-77,z:-19}};
export function outpostPad(x,z){return Object.values(OUTPOSTS).some(p=>Math.abs(x-p.x)<=3&&Math.abs(z-p.z)<=3)}
export function blueprintFor(sector){
 const p=OUTPOSTS[sector];if(!p)return[];const cells=[];
 for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){cells.push({x:p.x+dx,y:8,z:p.z+dz,type:'pierre'});cells.push({x:p.x+dx,y:12,z:p.z+dz,type:'bois'})}
 for(const dx of [-2,2])for(const dz of [-2,2])for(let y=9;y<=11;y++)cells.push({x:p.x+dx,y,z:p.z+dz,type:'metal'});
 return cells.sort((a,b)=>a.y-b.y||a.x-b.x||a.z-b.z);
}
export function blueprintProgress(sector,get){const cells=blueprintFor(sector),missing=cells.filter(b=>get(b.x,b.y,b.z)!==b.type);return{total:cells.length,done:cells.length-missing.length,missing}}
