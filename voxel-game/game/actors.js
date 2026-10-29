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
export function goliath(){const g=new THREE.Group(),black=material(0x20242a,{metalness:.28,roughness:.55}),edge=material(0x991d31,{metalness:.24,roughness:.42,emissive:0x39030c,emissiveIntensity:.65}),glass=material(0x416b7a,{metalness:.16,roughness:.26}),cell=material(0x29515d,{transparent:true,opacity:.7,depthWrite:false}),rubber=material(0x101216),wheels=[];
  box(g,3.1,.3,7.1,0,.35,2.35,black);box(g,3.2,.15,7.2,0,3.5,2.35,edge);box(g,3.1,3.1,.2,0,1.9,-1.12,black);box(g,3.1,3.1,.2,0,1.9,5.82,black);
  for(const x of [-1.5,1.5]){box(g,.16,3.1,2.25,x,1.9,.1,black);box(g,.16,3.1,1.45,x,1.9,4.6,black);box(g,.17,1.55,2.2,x,2.72,2.38,cell);box(g,.07,.32,6.65,x*1.08,.83,2.25,edge);box(g,.07,.12,6.65,x*1.08,1.04,2.25,material(0xe1b653,{emissive:0x6b2c0c,emissiveIntensity:.45}));box(g,.09,.48,4.9,x*1.08,2.68,2.35,black);box(g,.1,.16,4.6,x*1.1,2.68,2.35,edge);for(const z of [1.25,1.8,2.35,2.9,3.45])box(g,.2,2.0,.08,x,1.9,z,edge)}box(g,3.15,.18,7.1,0,3.47,2.35,black);box(g,3.5,.18,.18,0,1.15,-2.1,edge);
  // Cabine longue nez, pare-brise, vitres latérales, calandre et échappements de semi.
  box(g,2.8,2.35,2.85,0,1.45,-2.62,black);box(g,2.48,.38,1.58,0,2.7,-2.28,black);box(g,2.36,1.18,1.15,0,2.34,-2.97,glass);
  for(const s of [-1,1]){box(g,.08,.96,.88,s*1.415,2.27,-2.73,glass);box(g,.035,.58,.62,s*1.46,1.9,-1.78,glass);box(g,.08,.12,.28,s*1.52,2.35,-3.2,edge);box(g,.08,.48,.08,s*1.62,2.28,-3.26,black);box(g,.1,.09,.44,s*1.66,2.55,-3.28,glass);box(g,.12,.09,.28,s*1.47,1.58,-1.5,edge);box(g,.13,.22,.18,s*1.48,2.82,-1.6,edge)}
  box(g,2.9,.22,.25,0,2.95,-4.03,edge);box(g,2.5,.12,.18,0,.86,-4.0,black);for(let i=0;i<7;i++)box(g,.075,.66,.035,(i-3)*.29,1.42,-4.04,edge);
  for(const s of [-1,1]){box(g,.36,.28,.08,s*1.03,1.38,-4.08,new THREE.MeshBasicMaterial({color:0xffd17a}));box(g,.18,2.3,.12,s*1.23,2.04,-.78,black);box(g,.13,2.5,.13,s*1.25,2.42,-.78,edge);box(g,.14,2.35,.14,s*1.22,2.02,-.25,black)}
  box(g,2.65,.08,.08,0,2.98,-2.2,edge);box(g,3.4,.16,.16,0,.72,-4.15,edge);box(g,.14,.72,.14,-1.08,1.9,-.98,edge);box(g,.14,.72,.14,1.08,1.9,-.98,edge);
  for(const x of [-1.58,1.58])for(const z of [-2.9,-1.35,1.1,3.4,5]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.57,.57,.35,14),rubber);w.rotation.z=Math.PI/2;w.position.set(x,.57,z);g.add(w);wheels.push(w);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.37,10),material(0x8e9297,{metalness:.45}));hub.rotation.z=Math.PI/2;hub.position.copy(w.position);g.add(hub)}
  const bars=[];for(let i=0;i<11;i++)bars.push(box(g,.18,.11,.06,(i-5)*.2,1.42,-4.08,new THREE.MeshBasicMaterial({color:0x401019})));
  const glow=new THREE.PointLight(0xff173b,5,12,2);glow.position.set(0,1.5,-4.1);g.add(glow);g.userData={wheels,bars};return g}
// Camion-atelier de la Fondation FLAG, distinct du semi-remorque Goliath.
export function flagWorkshopTruck(){const g=new THREE.Group(),navy=material(0x263d54,{metalness:.22,roughness:.5}),blue=material(0x3f8fc3,{metalness:.16,roughness:.45,emissive:0x092644,emissiveIntensity:.22}),glass=material(0x79b2c5,{metalness:.1,roughness:.24}),white=material(0xf0f2ed,{metalness:.08,roughness:.48}),rubber=material(0x101216),wheels=[];
  box(g,2.55,.2,5.8,0,.7,.35,navy);box(g,2.42,1.7,3.55,0,1.72,1.45,navy);box(g,2.44,.16,3.56,0,2.64,1.45,blue);
  box(g,2.32,1.62,1.75,0,1.68,-2.15,blue);box(g,.2,.48,.42,0,2.68,-2.28,navy);box(g,1.94,.86,.06,0,2.07,-3.055,glass);box(g,.08,.78,.07,-.04,2.07,-3.10,white);
  for(const side of [-1,1]){box(g,.06,.84,.76,side*1.18,2.03,-2.26,glass);box(g,.08,.7,.05,side*1.24,2.01,-3.04,navy);box(g,.13,.14,.28,side*1.29,2.4,-2.85,blue);box(g,.08,.52,.08,side*1.39,2.3,-2.84,navy);box(g,.1,.1,.4,side*1.43,2.58,-2.84,white);box(g,.1,.09,.22,side*1.22,1.56,-1.85,white);box(g,.13,.2,.16,side*1.18,2.8,-1.95,white)}
  box(g,2.48,.12,.12,0,1.05,-3.08,white);box(g,2.18,.1,.08,0,.84,-3.1,navy);for(let i=0;i<5;i++)box(g,.07,.42,.035,(i-2)*.19,1.22,-3.105,white);box(g,.24,.17,.11,-1.04,1.08,-3.14,white);box(g,.24,.17,.11,1.04,1.08,-3.14,white);
  box(g,.06,1.12,.035,-1.22,1.78,-.95,white);box(g,.06,1.12,.035,1.22,1.78,-.95,white);box(g,.08,1.55,.04,0,1.82,-.95,blue);
  // Marque FLAG simplifiee sur les deux flancs.
  for(const side of [-1,1]){box(g,1.48,.62,.035,side*1.225,1.8,1.55,white);box(g,.78,.3,.055,side*1.25,1.8,1.55,blue);box(g,.13,.13,.06,side*1.285,1.8,1.55,white)}
  // Rangements de dépannage et bandes de visibilité d'un véritable atelier mobile.
  for(const side of [-1,1]){for(const z of [-.1,.8,1.7,2.35]){box(g,.055,.58,.58,side*1.245,.92,z,blue);box(g,.07,.035,.38,side*1.28,1.12,z,white);box(g,.08,.08,.08,side*1.29,.92,z,white)}for(const z of [-.2,.4,1.0,1.6,2.2])box(g,.07,.16,.36,side*1.27,.68,z,white);box(g,.18,.48,.16,side*1.26,2.42,-1.55,blue)}
  box(g,2.35,.13,.12,0,.8,3.28,white);for(let i=0;i<6;i++)box(g,.08,.3,.04,(i-2.5)*.32,1.42,3.245,blue);box(g,.12,1.12,.12,-1.23,1.78,2.9,white);box(g,.12,1.12,.12,1.23,1.78,2.9,white);
  for(const x of [-1.18,1.18])for(const z of [-1.7,.12,2.65]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.44,.44,.27,14),rubber);w.rotation.z=Math.PI/2;w.position.set(x,.48,z);g.add(w);wheels.push(w);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.29,10),white);hub.rotation.z=Math.PI/2;hub.position.copy(w.position);g.add(hub)}
  const beacon=new THREE.PointLight(0x50b8ff,1.2,6,2);beacon.position.set(0,2.9,.5);g.add(beacon);g.userData={wheels,beacon};return g}
export function scanCar(g,time,speed=0,gold=false){const phase=(Math.sin(time*3)+1)*4;g.userData.segments.forEach((s,i)=>{const glow=Math.max(.06,1-Math.abs(i-phase)*.55);s.material.color.setRGB(glow,gold?0.48:0.008,0.035)});g.userData.wheels.forEach(w=>w.rotation.x+=speed*.03)}
