// Génération déterministe partagée par le navigateur et le serveur.
import {truckRoad,flagParking} from './roads.mjs';
export const CHUNK = 16, HEIGHT = 48, SEED = 'FLAG-1982';
export const BLOCKS = {
  herbe: {name:'Herbe',color:0x64884b}, terre:{name:'Terre',color:0x805a40},
  pierre:{name:'Pierre',color:0x78818a}, sable:{name:'Sable du Nevada',color:0xd6b77e},
  bois:{name:'Bois',color:0x886039}, feuilles:{name:'Feuillage',color:0x356d43},
  bitume:{name:'Bitume',color:0x303744}, metal:{name:'Métal FLAG',color:0x303c49},
  verre:{name:'Verre teinté',color:0x477b94}, rouge:{name:'Scanner rouge',color:0xff273b},
  bleu:{name:'Néon bleu',color:0x20bcf4}, marquage:{name:'Marquage routier',color:0xe8d7a1},
  frite:{name:'Frites',color:0xf2bd45}, gaufre:{name:'Gaufre',color:0xb87938},citrouille:{name:'Citrouille Halloween',color:0xe97b25}
};
export const mod=(x,n)=>((x%n)+n)%n;
export const key=(x,y,z)=>`${x},${y},${z}`;
export function hash(x,z){let h=Math.imul(x|0,374761393)^Math.imul(z|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295}
// Les tables restent côté droit pour laisser une allée libre entre l'entrée et les bornes.
const BISTRO_TABLES=[[-16,-11],[-13,-11],[-16,-16],[-13,-16]];
const BISTRO_CHAIRS=BISTRO_TABLES.flatMap(([x,z])=>[[x+1,z],[x-1,z],[x,z+1]]);
const BISTRO_ARCADES=[[-23,-18],[-23,-14]];
export function noise(x,z){const ix=Math.floor(x),iz=Math.floor(z);let u=x-ix,v=z-iz;u=u*u*(3-2*u);v=v*v*(3-2*v);const a=hash(ix,iz)*(1-u)+hash(ix+1,iz)*u,b=hash(ix,iz+1)*(1-u)+hash(ix+1,iz+1)*u;return a*(1-v)+b*v}
const cache=new Map();
export function column(x,z){
  x=Math.floor(x);z=Math.floor(z);const id=`${x},${z}`;if(cache.has(id))return cache.get(id);
  const biome=z < -100?'MONTAGNES':z>92?'VILLE':x>65?'NEVADA':x < -55?'FORÊT':'FLAG';
  let height=5+Math.floor(noise(x*.032,z*.032)*6+noise(x*.10+7,z*.10)*2);
  if(biome==='MONTAGNES')height+=Math.floor(noise(x*.018,z*.018)*16);
  const road=Math.abs(x)<=3||Math.abs(z+28)<=3||truckRoad(x,z)||flagParking(x,z);
  const smooth=Math.min(1,Math.max(0,(Math.abs(x)-5)/14));
  height=Math.round(7*(1-smooth)+height*smooth);
  if(Math.abs(x)<25&&Math.abs(z)<25||road)height=7;
  const result={height,biome,road};cache.set(id,result);if(cache.size>18000)cache.delete(cache.keys().next().value);return result;
}
export const heightAt=(x,z)=>column(x,z).height;
export function generatedBlock(x,y,z){
  if(y<0||y>=HEIGHT)return null;
  const {height:h,biome,road}=column(x,z);
  if(y<=h){if(y===h){if(road)return x===0&&mod(z,7)<4||z===-28&&mod(x,7)<4?'marquage':'bitume';return biome==='NEVADA'?'sable':biome==='MONTAGNES'?'pierre':'herbe'}return y<h-2?'pierre':'terre'}
  // Hangar FLAG : volume creux, baie ouverte face à la cour et toiture à néons.
  // Petit bistrot FLAG en blocs : sol, salle vitrée, mobilier et deux bornes.
  if(x>=-25&&x<=-9&&z>=-22&&z<=-6){
    if(y===8)return'bitume';
    if(y===13)return x===-25||x===-9||z===-22||z===-6?(z===-6&&mod(x,2)===0?'rouge':'metal'):'metal';
    if(y>=9&&y<=12&&(x===-25||x===-9||z===-22||z===-6)){
      if(z===-6&&x>=-19&&x<=-17&&y<=11)return null;
      if((x===-25||x===-9)&&z>=-20&&z<=-17&&y>=10&&y<=11)return'verre';
      if(z===-22&&x>=-21&&x<=-13&&y>=10&&y<=11)return'verre';
      return'metal';
    }
    if(y===9&&BISTRO_TABLES.some(([tx,tz])=>tx===x&&tz===z))return'metal';
    if(y===10&&BISTRO_TABLES.some(([tx,tz])=>tx===x&&tz===z))return'bois';
    if(y===9&&BISTRO_CHAIRS.some(([cx,cz])=>cx===x&&cz===z))return'bois';
    if(x===-11&&z>=-13&&z<=-9&&(y===9||y===10))return y===10?'bois':'metal';
    if(x===-12&&z>=-13&&z<=-9&&y===11&&z%2===0)return'rouge';
    const arcade=BISTRO_ARCADES.find(([ax,az])=>ax===x&&az===z);
    if(arcade&&y===9)return'metal';
    if(arcade&&y===10)return arcade[1]===-18?'rouge':'bleu';
    if(arcade&&y===11)return'metal';
  }
  if(x>=9&&x<=21&&z>=-14&&z<=2&&y>=8&&y<=14){
    if(y===14)return x===9||x===21?'rouge':'metal';
    if(x===9||x===21||z===-14)return y===11&&z>-12?'verre':'metal';
    if(z===2&&(x<13||x>17||y>12))return'metal';
  }
  if(!road&&(x===-8||x===8)&&mod(z,16)===0&&y<=11&&Math.abs(z)<90)return y===11?'rouge':'metal';
  if(x===-5&&z===-4&&y===8)return'frite';
  if(x===-5&&z===-6&&y===8)return'gaufre';
  if(Math.abs(x)===5&&mod(z,16)===8&&y===h+1&&Math.abs(z)<80)return'citrouille';
  if(biome==='FORÊT'){
    const cx=Math.floor(x/8)*8+4,cz=Math.floor(z/8)*8+4,base=heightAt(cx,cz),tall=5+Math.floor(hash(cx,cz)*3);
    if(hash(cx,cz)>.25){if(x===cx&&z===cz&&y<=base+tall)return'bois';if(Math.abs(x-cx)<=2&&Math.abs(z-cz)<=2&&y>=base+tall-2&&y<=base+tall+1&&(Math.abs(x-cx)+Math.abs(z-cz)<4))return'feuilles'}
  }
  if(biome==='NEVADA'&&mod(x,13)===6&&mod(z,11)===5&&y<=h+3)return'feuilles';
  if(biome==='VILLE'){
    const cx=Math.floor(x/24)*24+12,cz=Math.floor(z/24)*24+12,base=heightAt(cx,cz),roof=base+9+Math.floor(hash(cx,cz)*15);
    if(Math.abs(x-cx)<=4&&Math.abs(z-cz)<=4&&y>base&&y<=roof){if(y===roof)return'bleu';if(Math.abs(x-cx)===4||Math.abs(z-cz)===4)return y%3===0?'metal':'verre'}
  }
  return null;
}
export class World {
  constructor(){this.edits=new Map()}
  get(x,y,z){return this.edits.has(key(x,y,z))?this.edits.get(key(x,y,z)):generatedBlock(x,y,z)}
  set(x,y,z,type){this.edits.set(key(x,y,z),type==='air'?null:type)}
  snapshot(rows=[]){this.edits.clear();for(const [id,t] of rows)this.edits.set(id,t==='air'?null:t)}
}
