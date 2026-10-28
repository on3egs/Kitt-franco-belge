import * as THREE from 'three';
export const PROFILES={
  MICHAEL:{name:'Michael Knight',tag:'Pilote de la Fondation FLAG',shirt:0x161b23,pants:0x344b68,hair:0x39271e,accent:0xea3948},
  LILOU:{name:'Lilou',tag:'Tenue rose · profil privé',shirt:0xda3a89,pants:0xc62d77,hair:0x513329,accent:0xffbedc},
  ALEXIA:{name:'Alexia',tag:'Lunettes · profil privé',shirt:0x1b202c,pants:0xc9bd9a,hair:0x40291f,accent:0xd95489},
  BONNIE:{name:'Bonnie Barstow',tag:'Ingénieure en chef de FLAG',shirt:0x8b3947,pants:0x292b38,hair:0x8b6039,accent:0xe9b881},
  DEVON:{name:'Devon Miles',tag:'Directeur de la Fondation FLAG',shirt:0x2f4156,pants:0x303742,hair:0xaaa89f,accent:0xc9a76a},
  APRIL:{name:'April Curtis',tag:'Ingénieure FLAG',shirt:0x3d596a,pants:0x252c39,hair:0x4a3022,accent:0x65c9d5},
  RC3:{name:'Reginald Cornelius III',tag:'Pilote de FLAG',shirt:0x4a3531,pants:0x303849,hair:0x382c26,accent:0xffb94d},
  ANONYMOUS:{name:'Pilote anonyme',tag:'Recrue de la Fondation FLAG',shirt:0x394d5c,pants:0x26323b,hair:0x3a312a,accent:0x69d9ed},
  PILOT_FEMME:{name:'Pilote FLAG',tag:'Avatar débloqué · tenue claire',shirt:0x7195a4,pants:0x35445a,hair:0x70452f,accent:0xffc68e},
  PILOT_MASC:{name:'Pilote FLAG',tag:'Avatar débloqué · tenue sombre',shirt:0x34495c,pants:0x252d38,hair:0x38271f,accent:0xe3b46c}
};
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.72,...extra});
function box(g,w,h,d,x,y,z,m){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;g.add(o);return o}
export function avatar(profile='MICHAEL',label=''){
  const p=PROFILES[profile]||PROFILES.MICHAEL,g=new THREE.Group(),skin=material(0xd9a781),hair=material(p.hair),shirt=material(p.shirt),pants=material(p.pants),shoe=material(0x171a22),white=material(0xecede9),dark=material(0x302b2c),accent=material(p.accent);
  const head=new THREE.Group();head.position.y=1.62;g.add(head);box(head,.53,.55,.46,0,0,0,skin);box(head,.58,.16,.51,0,.26,0,hair);box(head,.57,.43,.13,0,.01,.22,hair);
  if(['LILOU','ALEXIA','BONNIE','APRIL','PILOT_FEMME'].includes(profile)){box(head,.12,.42,.25,-.24,-.11,.08,hair);box(head,.12,.48,.25,.24,-.14,.08,hair);box(head,.3,.12,.03,-.05,.13,-.24,hair)}
  for(const x of [-.13,.13]){box(head,.095,.062,.025,x,.035,-.241,white);box(head,.038,.058,.028,x,.035,-.258,dark)}box(head,.12,.025,.025,0,-.15,-.241,accent);
  if(profile==='ALEXIA'||profile==='BONNIE'||profile==='APRIL')for(const x of [-.135,.135]){for(const y of [-.015,.092])box(head,.23,.025,.03,x,y,-.28,accent);for(const dx of [-.103,.103])box(head,.025,.12,.03,x+dx,.04,-.28,accent)}
  box(g,.55,.62,.32,0,1.05,0,shirt);box(g,.2,.06,.02,.13,1.19,-.17,accent);box(g,.16,.035,.025,.13,1.18,-.19,white);
  if(profile==='MICHAEL'||profile==='DEVON'){box(g,.12,.48,.04,0,1.1,-.18,material(profile==='DEVON'?0x273548:0x802a31));box(g,.025,.52,.04,.12,1.1,-.19,material(p.accent))}
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
// Camion Goliath : silhouette massive, remorque noire et accents rouges originaux.
export function goliath(){const g=new THREE.Group(),black=material(0x080b10,{metalness:.72,roughness:.3}),edge=material(0x48101b,{metalness:.55,roughness:.35}),glass=material(0x182d39,{metalness:.45,roughness:.2}),cell=material(0x10232d,{transparent:true,opacity:.56,depthWrite:false}),rubber=material(0x07090c),wheels=[];
  box(g,3.1,.3,7.1,0,.35,2.35,black);box(g,3.2,.15,7.2,0,3.5,2.35,edge);box(g,3.1,3.1,.2,0,1.9,-1.12,black);box(g,3.1,3.1,.2,0,1.9,5.82,black);
  for(const x of [-1.5,1.5]){box(g,.16,3.1,2.25,x,1.9,.1,black);box(g,.16,3.1,1.45,x,1.9,4.6,black);box(g,.17,1.55,2.2,x,2.72,2.38,cell);for(const z of [1.25,1.8,2.35,2.9,3.45])box(g,.2,2.0,.08,x,1.9,z,edge)}box(g,3.15,.18,7.1,0,3.47,2.35,black);box(g,3.5,.18,.18,0,1.15,-2.1,edge);
  box(g,2.8,2.7,2.7,0,1.5,-2.65,black);box(g,2.36,1.18,1.15,0,2.42,-2.95,glass);box(g,2.9,.22,.25,0,2.95,-4.03,edge);box(g,2.5,.11,.08,0,1.08,-4.02,new THREE.MeshBasicMaterial({color:0xff243e}));
  for(const x of [-1.58,1.58])for(const z of [-2.9,-1.35,1.1,3.4,5]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.57,.57,.35,14),rubber);w.rotation.z=Math.PI/2;w.position.set(x,.57,z);g.add(w);wheels.push(w);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.37,10),edge);hub.rotation.z=Math.PI/2;hub.position.copy(w.position);g.add(hub)}
  const bars=[];for(let i=0;i<11;i++)bars.push(box(g,.18,.11,.06,(i-5)*.2,1.42,-4.08,new THREE.MeshBasicMaterial({color:0x401019})));
  const glow=new THREE.PointLight(0xff173b,5,12,2);glow.position.set(0,1.5,-4.1);g.add(glow);g.userData={wheels,bars};return g}
// Camion-atelier de la Fondation FLAG, distinct du semi-remorque Goliath.
export function flagWorkshopTruck(){const g=new THREE.Group(),navy=material(0x17293a,{metalness:.48,roughness:.38}),blue=material(0x276b9b,{metalness:.35,roughness:.38}),glass=material(0x508397,{metalness:.25,roughness:.2}),white=material(0xd9e3e9,{metalness:.18,roughness:.45}),rubber=material(0x0a0c10),wheels=[];
  box(g,2.55,.2,5.8,0,.7,.35,navy);box(g,2.42,1.7,3.55,0,1.72,1.45,navy);box(g,2.44,.16,3.56,0,2.64,1.45,blue);
  box(g,2.32,1.62,1.75,0,1.68,-2.15,blue);box(g,1.94,.86,.06,0,2.07,-3.055,glass);box(g,.08,.78,.07,-.04,2.07,-3.10,white);
  box(g,2.48,.12,.12,0,1.05,-3.08,white);box(g,.24,.17,.11,-1.04,1.08,-3.14,white);box(g,.24,.17,.11,1.04,1.08,-3.14,white);
  box(g,.06,1.12,.035,-1.22,1.78,-.95,white);box(g,.06,1.12,.035,1.22,1.78,-.95,white);box(g,.08,1.55,.04,0,1.82,-.95,blue);
  // Marque FLAG simplifiee sur les deux flancs.
  for(const side of [-1,1]){box(g,1.48,.62,.035,side*1.225,1.8,1.55,white);box(g,.78,.3,.055,side*1.25,1.8,1.55,blue);box(g,.13,.13,.06,side*1.285,1.8,1.55,white)}
  for(const x of [-1.18,1.18])for(const z of [-1.7,.12,2.65]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.44,.44,.27,14),rubber);w.rotation.z=Math.PI/2;w.position.set(x,.48,z);g.add(w);wheels.push(w);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.29,10),white);hub.rotation.z=Math.PI/2;hub.position.copy(w.position);g.add(hub)}
  const beacon=new THREE.PointLight(0x50b8ff,1.2,6,2);beacon.position.set(0,2.9,.5);g.add(beacon);g.userData={wheels,beacon};return g}
export function scanCar(g,time,speed=0,gold=false){const phase=(Math.sin(time*3)+1)*4;g.userData.segments.forEach((s,i)=>{const glow=Math.max(.06,1-Math.abs(i-phase)*.55);s.material.color.setRGB(glow,gold?0.48:0.008,0.035)});g.userData.wheels.forEach(w=>w.rotation.x+=speed*.03)}
