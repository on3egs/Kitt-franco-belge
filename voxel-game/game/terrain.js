import * as THREE from 'three';
import {CHUNK,HEIGHT,BLOCKS,hash} from './world.mjs?v=truck-roads-20261029';

function texture(type,color){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const c=canvas.getContext('2d');c.fillStyle=`#${color.toString(16).padStart(6,'0')}`;c.fillRect(0,0,32,32);
  for(let i=0;i<180;i++){c.fillStyle=i%2?'#ffffff16':'#00000020';c.fillRect(hash(i,1)*32,hash(i,8)*32,1+hash(i,4)*3,1+hash(i,5)*3)}
  c.strokeStyle='#00000038';c.strokeRect(.5,.5,31,31);
  if(type==='metal'){c.strokeStyle='#9bc4d044';c.strokeRect(2,2,28,28);for(const x of [4,27])for(const y of [4,27]){c.fillStyle='#d8e5ec77';c.fillRect(x,y,2,2)}}
  if(type==='verre'){c.strokeStyle='#b0ecff88';c.beginPath();c.moveTo(4,28);c.lineTo(28,4);c.stroke()}
  if(type==='bois'){c.strokeStyle='#30200e66';for(let x=4;x<32;x+=7){c.beginPath();c.moveTo(x,0);c.lineTo(x+2,32);c.stroke()}}
  if(type==='gaufre'){c.strokeStyle='#573716aa';for(let x=4;x<32;x+=7){c.strokeRect(x,3,5,26)}}
  if(type==='citrouille'){c.fillStyle='#492e35';c.fillRect(6,9,6,6);c.fillRect(20,9,6,6);c.fillRect(8,21,16,4);c.fillStyle='#ffd563';c.fillRect(7,10,4,4);c.fillRect(21,10,4,4)}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=THREE.NearestFilter;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
export function materials(){return Object.entries(BLOCKS).map(([id,b])=>new THREE.MeshStandardMaterial({map:texture(id,b.color),roughness:id==='metal'?.48:.95,metalness:id==='metal'?.35:0,transparent:id==='verre',opacity:id==='verre'?.58:1,depthWrite:id!=='verre',emissive:id==='rouge'?0xff0926:id==='bleu'?0x159dff:0,emissiveIntensity:1.8,vertexColors:true}))}
const types=Object.keys(BLOCKS);
// Fusion de rectangles adjacents, après suppression des faces intérieures.
export function chunkMesh(world,cx,cz,mats){
  const origin=[cx*CHUNK,0,cz*CHUNK],dims=[CHUNK,HEIGHT,CHUNK],groups=types.map(()=>({p:[],n:[],uv:[],c:[]}));
  for(let d=0;d<3;d++)for(const sign of [-1,1]){
    const u=(d+1)%3,v=(d+2)%3,w=dims[u],h=dims[v],mask=new Array(w*h),q=[0,0,0];q[d]=sign;
    for(let slice=0;slice<dims[d];slice++){
      for(let j=0;j<h;j++)for(let i=0;i<w;i++){
        const a=[...origin];a[d]+=slice;a[u]+=i;a[v]+=j;const type=world.get(...a),other=world.get(a[0]+q[0],a[1]+q[1],a[2]+q[2]);
        mask[i+j*w]=type&&(!other||(other==='verre'&&type!=='verre'))?type:null;
      }
      for(let j=0;j<h;j++)for(let i=0;i<w;){const type=mask[i+j*w];if(!type){i++;continue}let rw=1,rh=1;while(i+rw<w&&mask[i+rw+j*w]===type)rw++;outer:while(j+rh<h){for(let k=0;k<rw;k++)if(mask[i+k+(j+rh)*w]!==type)break outer;rh++}
        const p=[...origin];p[d]+=slice+(sign>0?1:0);p[u]+=i;p[v]+=j;const du=[0,0,0],dv=[0,0,0];du[u]=rw;dv[v]=rh;
        const verts=[p,p.map((a,k)=>a+du[k]),p.map((a,k)=>a+du[k]+dv[k]),p.map((a,k)=>a+dv[k])],uv=[[0,0],[rw,0],[rw,rh],[0,rh]],g=groups[types.indexOf(type)],shade=d===1?(sign>0?1:.55):d===0?.82:.91;
        for(const k of sign>0?[0,1,2,0,2,3]:[0,3,2,0,2,1]){g.p.push(...verts[k]);const n=[0,0,0];n[d]=sign;g.n.push(...n);g.uv.push(...uv[k]);g.c.push(shade,shade,shade)}
        for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)mask[i+x+(j+y)*w]=null;i+=rw;
      }
    }
  }
  const geo=new THREE.BufferGeometry(),p=[],n=[],uv=[],colors=[];for(let i=0;i<groups.length;i++){const g=groups[i];if(!g.p.length)continue;geo.addGroup(p.length/3,g.p.length/3,i);for(const v of g.p)p.push(v);for(const v of g.n)n.push(v);for(const v of g.uv)uv.push(v);for(const v of g.c)colors.push(v)}
  geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,mats);mesh.receiveShadow=true;mesh.castShadow=true;return mesh;
}
export function voxelRay(world,origin,dir,reach=6){
  const p=[Math.floor(origin.x),Math.floor(origin.y),Math.floor(origin.z)],o=[origin.x,origin.y,origin.z],d=[dir.x,dir.y,dir.z],step=d.map(v=>v<0?-1:1),delta=d.map(v=>v===0?Infinity:Math.abs(1/v)),next=d.map((v,i)=>v===0?Infinity:(v<0?o[i]-p[i]:p[i]+1-o[i])/Math.abs(v));let distance=0,normal=[0,0,0];
  while(distance<=reach){const type=world.get(...p);if(type)return{x:p[0],y:p[1],z:p[2],normal,type};let axis=next[0]<next[1]?0:1;if(next[2]<next[axis])axis=2;distance=next[axis];p[axis]+=step[axis];next[axis]+=delta[axis];normal=[0,0,0];normal[axis]=-step[axis]}
  return null;
}
