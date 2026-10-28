import * as THREE from 'three';
export const PROFILES={
  MICHAEL:{name:'Michael Knight',tag:'Pilote de la Fondation FLAG',shirt:0x161b23,pants:0x344b68,hair:0x39271e,accent:0xea3948},
  LILOU:{name:'Lilou',tag:'Tenue rose · profil privé',shirt:0xda3a89,pants:0xc62d77,hair:0x513329,accent:0xffbedc},
  ALEXIA:{name:'Alexia',tag:'Lunettes · profil privé',shirt:0x1b202c,pants:0xc9bd9a,hair:0x40291f,accent:0xd95489}
};
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.72,...extra});
function box(g,w,h,d,x,y,z,m){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;g.add(o);return o}
export function avatar(profile='MICHAEL',label=''){
  const p=PROFILES[profile]||PROFILES.MICHAEL,g=new THREE.Group(),skin=material(0xd9a781),hair=material(p.hair),shirt=material(p.shirt),pants=material(p.pants),shoe=material(0x171a22),white=material(0xecede9),dark=material(0x302b2c),accent=material(p.accent);
  const head=new THREE.Group();head.position.y=1.62;g.add(head);box(head,.53,.55,.46,0,0,0,skin);box(head,.58,.16,.51,0,.26,0,hair);box(head,.57,.43,.13,0,.01,.22,hair);
  if(profile!=='MICHAEL'){box(head,.12,.42,.25,-.24,-.11,.08,hair);box(head,.12,.48,.25,.24,-.14,.08,hair);box(head,.3,.12,.03,-.05,.13,-.24,hair)}
  for(const x of [-.13,.13]){box(head,.095,.062,.025,x,.035,-.241,white);box(head,.038,.058,.028,x,.035,-.258,dark)}box(head,.12,.025,.025,0,-.15,-.241,accent);
  if(profile==='ALEXIA')for(const x of [-.135,.135]){for(const y of [-.015,.092])box(head,.23,.025,.03,x,y,-.28,accent);for(const dx of [-.103,.103])box(head,.025,.12,.03,x+dx,.04,-.28,accent)}
  box(g,.55,.62,.32,0,1.05,0,shirt);box(g,.2,.06,.02,.13,1.19,-.17,accent);box(g,.16,.035,.025,.13,1.18,-.19,white);
  if(profile==='MICHAEL'){box(g,.12,.48,.04,0,1.1,-.18,material(0x802a31));box(g,.025,.52,.04,.12,1.1,-.19,material(0x98a4b0))}
  if(profile==='LILOU'){box(g,.28,.035,.02,0,1.32,-.17,accent);box(g,.06,.1,.03,0,1.25,-.19,white);box(head,.15,.14,.14,.25,.18,.2,accent)}
  const arms=[],legs=[];for(const s of [-1,1]){const a=new THREE.Group();a.position.set(s*.39,1.31,0);box(a,.2,.4,.27,0,-.18,0,shirt);box(a,.18,.2,.23,0,-.46,0,skin);g.add(a);arms.push(a);const l=new THREE.Group();l.position.set(s*.15,.75,0);box(l,.24,.58,.27,0,-.27,0,pants);box(l,.25,.14,.37,0,-.6,-.045,shoe);g.add(l);legs.push(l)}
  box(arms[1],.22,.07,.28,0,-.35,0,accent);
  g.userData={arms,legs,head,profile,label};return g;
}
export function walkAvatar(g,time,amount){const {arms,legs}=g.userData;for(let i=0;i<2;i++){legs[i].rotation.x=Math.sin(time*10+i*Math.PI)*.55*amount;arms[i].rotation.x=-legs[i].rotation.x*.65}}
export function nameLabel(name){const c=document.createElement('canvas');c.width=512;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#08131bdc';ctx.fillRect(0,0,512,80);ctx.fillStyle='#d9edf3';ctx.textAlign='center';ctx.font='bold 30px monospace';ctx.fillText(name.slice(0,24),256,51);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false}));s.scale.set(2.8,.44,1);s.position.y=2.4;return s}
export function car(remote=false){
  const g=new THREE.Group(),black=material(0x101823,{metalness:.65,roughness:.3}),glass=material(0x214451,{metalness:.4,roughness:.18}),trim=material(0x5e6e7d,{metalness:.8}),rubber=material(0x0a0c10),red=new THREE.MeshBasicMaterial({color:0xff1835});
  box(g,1.85,.42,3.9,0,.66,0,black);box(g,1.65,.19,1.4,0,.91,-1.12,black);box(g,1.4,.53,1.32,0,1.12,.35,glass);box(g,1.44,.1,1.1,0,1.4,.43,black);box(g,1.7,.12,.5,0,.91,1.62,black);box(g,1.98,.12,.16,0,.62,-1.95,trim);box(g,1.76,.12,.08,0,.79,1.98,red);
  const wheels=[];for(const x of [-.94,.94])for(const z of [-1.17,1.26]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.22,16),rubber);w.rotation.z=Math.PI/2;w.position.set(x,.38,z);g.add(w);wheels.push(w);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,.235,12),trim);hub.rotation.z=Math.PI/2;hub.position.copy(w.position);g.add(hub)}
  box(g,1.35,.13,.045,0,.92,-1.986,rubber);const segments=[];for(let i=0;i<9;i++){const m=new THREE.MeshBasicMaterial({color:0x4c0715});segments.push(box(g,.13,.07,.05,(i-4)*.145,.93,-2.02,m))}
  const glow=new THREE.PointLight(0xff1537,remote?0:4,7,2);glow.position.set(0,.9,-2.1);g.add(glow);
  for(const x of [-.7,.7]){box(g,.3,.09,.05,x,.74,-1.99,new THREE.MeshBasicMaterial({color:0xd9eaff}));if(!remote){const l=new THREE.SpotLight(0xd8eaff,8,19,.4,.7,1);l.position.set(x,.7,-2);l.target.position.set(x,0,-16);g.add(l,l.target)}}
  g.userData={segments,wheels,glow};return g;
}
export function scanCar(g,time,speed=0){const phase=(Math.sin(time*3)+1)*4;g.userData.segments.forEach((s,i)=>s.material.color.setRGB(Math.max(.06,1-Math.abs(i-phase)*.55),.008,.035));g.userData.wheels.forEach(w=>w.rotation.x+=speed*.03)}
