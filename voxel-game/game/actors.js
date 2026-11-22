import * as THREE from 'three';
export const PROFILES={
  MICHAEL:{name:'Michael Knight',tag:'Pilote de la Fondation FLAG',shirt:0x161b23,pants:0x344b68,hair:0x39271e,accent:0xea3948},
  LILOU:{name:'Lilou',tag:'Tenue rose · lunettes · profil privé',shirt:0xe43c87,pants:0xd52e78,hair:0x38251f,accent:0xff91c4},
  ALEXIA:{name:'Alexia',tag:'T-shirt sombre · pantalon clair · profil privé',shirt:0x17191e,pants:0xe2d4b3,hair:0x493226,accent:0xa7b6c8},
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
  const p=PROFILES[profile]||PROFILES.MICHAEL,g=new THREE.Group(),skin=material(0xd9a781,{roughness:.86}),hair=material(p.hair,{roughness:.9}),shirt=material(p.shirt,{roughness:.82}),pants=material(p.pants,{roughness:.88}),shoe=material(0x171a22,{roughness:.48,metalness:.08}),white=material(0xecede9),dark=material(0x302b2c),accent=material(p.accent,{roughness:.5,metalness:.12}),seam=material(0xffffff,{transparent:true,opacity:.2}),metal=material(0xc3a86a,{metalness:.68,roughness:.3});
  const head=new THREE.Group();head.position.y=1.62;g.add(head);box(head,.53,.55,.46,0,0,0,skin);box(head,.58,.16,.51,0,.26,0,hair);box(head,.57,.43,.13,0,.01,.22,hair);
  // Traits plus lisibles : oreilles, nez, sourcils et nuances du visage.
  for(const s of [-1,1]){box(head,.09,.14,.12,s*.29,-.025,0,skin);box(head,.105,.045,.035,s*.13,.105,-.26,dark)}
  box(head,.105,.105,.12,0,-.055,-.285,skin);box(head,.16,.035,.035,0,-.19,-.265,dark);
  const femme=['LILOU','ALEXIA','BONNIE','APRIL','PILOT_FEMME'].includes(profile);
  if(femme){
    // Cheveux longs jusqu'aux épaules : une masse arrière et deux mèches lisibles en silhouette.
    box(head,.57,.48,.17,0,-.22,.25,hair);
    // Placées au bord du visage pour rester visibles depuis l'angle de la caméra du menu.
    box(head,.14,.62,.2,-.27,-.2,-.13,hair);box(head,.14,.62,.2,.27,-.2,-.13,hair);
    if(profile==='LILOU'){
      // Mèche latérale inspirée de la frange balayée de Lilou.
      box(head,.13,.32,.045,-.17,.02,-.257,hair);box(head,.24,.09,.045,-.12,.205,-.255,hair);
    }else if(profile==='ALEXIA'){
      // Frange légère en mèches, sans couvrir les yeux ni ajouter de lunettes.
      box(head,.19,.085,.045,-.12,.205,-.255,hair);box(head,.18,.075,.045,.08,.215,-.255,hair);
    }else box(head,.3,.12,.03,-.05,.13,-.24,hair);
  }
  for(const x of [-.13,.13]){box(head,.095,.062,.025,x,.035,-.241,white);box(head,.038,.058,.028,x,.035,-.258,dark)}box(head,.12,.025,.025,0,-.15,-.241,accent);
  if(profile==='LILOU'){
    // Lunettes carrées rose vif : deux verres et une monture voxel posée devant les yeux.
    const lens=material(0xffb0d2,{transparent:true,opacity:.34,roughness:.28,depthWrite:false}),frame=material(0xd82976,{roughness:.38,metalness:.12});
    for(const x of [-.13,.13]){
      box(head,.19,.12,.012,x,.035,-.272,lens);
      for(const y of [-.035,.105])box(head,.22,.022,.035,x,y,-.292,frame);
      for(const dx of [-.099,.099])box(head,.022,.14,.035,x+dx,.035,-.292,frame);
    }
    box(head,.055,.025,.035,0,.035,-.292,frame);
    // Petites branches visibles sur les tempes.
    box(head,.09,.025,.025,-.285,.035,-.24,frame);box(head,.09,.025,.025,.285,.035,-.24,frame);
  }
  if(profile==='BONNIE'||profile==='APRIL')for(const x of [-.135,.135]){for(const y of [-.015,.092])box(head,.23,.025,.03,x,y,-.28,accent);for(const dx of [-.103,.103])box(head,.025,.12,.03,x+dx,.04,-.28,accent)}
  // Cou et épaules donnent une transition nette entre tête, buste et bras.
  box(g,.2,.18,.2,0,1.39,0,skin);box(g,.68,.16,.38,0,1.31,0,shirt);box(g,.55,.62,.32,0,1.05,0,shirt);
  box(g,.2,.06,.02,.13,1.19,-.17,accent);box(g,.16,.035,.025,.13,1.18,-.19,white);
  box(g,.5,.045,.035,0,.78,-.18,dark);box(g,.11,.1,.035,0,.78,-.205,metal);
  for(const s of [-1,1]){box(g,.16,.2,.025,s*.17,1.05,-.18,material(p.shirt,{roughness:.7}));box(g,.025,.34,.025,s*.245,1.08,-.18,seam)}
  if(profile==='MICHAEL'||profile==='DEVON'){box(g,.12,.48,.04,0,1.1,-.18,material(profile==='DEVON'?0x273548:0x802a31));box(g,.025,.52,.04,.12,1.1,-.19,material(p.accent))}
  if(profile==='LILOU'){
    // Col ras-du-cou et petits motifs clairs pour distinguer son ensemble rose.
    box(g,.22,.055,.025,0,1.34,-.166,material(0xffb2d1));box(g,.055,.13,.035,.22,1.23,-.18,material(0xffbfd9));
    box(g,.07,.035,.025,-.16,1.13,-.175,material(0xffd1e4));box(g,.04,.04,.025,.18,1.02,-.175,material(0xffd1e4));
  }
  if(profile==='ALEXIA'){
    // T-shirt noir simple avec un petit motif discret bleu-gris, pantalon crème et poignets sombres.
    box(g,.25,.2,.025,0,1.02,-.174,material(0x313b4a));box(g,.08,.08,.035,0,1.045,-.196,material(0x7794ad));
  }
  const arms=[],legs=[];for(const s of [-1,1]){const a=new THREE.Group();a.position.set(s*.39,1.31,0);box(a,.24,.18,.29,0,-.08,0,shirt);box(a,.2,.34,.27,0,-.31,0,shirt);box(a,.19,.07,.28,0,-.47,0,accent);box(a,.18,.2,.23,0,-.59,0,skin);box(a,.08,.12,.1,s*.03,-.69,-.015,skin);g.add(a);arms.push(a);const l=new THREE.Group();l.position.set(s*.15,.75,0);box(l,.27,.16,.29,0,-.09,0,pants);box(l,.24,.42,.27,0,-.36,0,pants);box(l,.26,.07,.29,0,-.59,0,material(p.pants,{roughness:.7}));box(l,.25,.14,.37,0,-.68,-.045,shoe);box(l,.26,.045,.38,0,-.75,-.045,dark);g.add(l);legs.push(l)}
  if(profile==='ALEXIA'){
    // Semelles et bandes au bas du pantalon restent lisibles sans changer l'animation des jambes.
    for(const l of legs){box(l,.25,.045,.38,0,-.505,-.045,material(0x24252a));box(l,.255,.045,.385,0,-.675,-.045,material(0x050608));}
  }
  box(arms[1],.22,.07,.28,0,-.35,0,accent);
  g.userData={arms,legs,head,profile,label};return g;
}
export function walkAvatar(g,time,amount){const {arms,legs}=g.userData;for(let i=0;i<2;i++){legs[i].rotation.x=Math.sin(time*10+i*Math.PI)*.55*amount;arms[i].rotation.x=-legs[i].rotation.x*.65}}
export function nameLabel(name){const c=document.createElement('canvas');c.width=512;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#08131bdc';ctx.fillRect(0,0,512,80);ctx.fillStyle='#d9edf3';ctx.textAlign='center';ctx.font='bold 30px monospace';ctx.fillText(name.slice(0,24),256,51);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false}));s.scale.set(2.8,.44,1);s.position.y=2.4;return s}
// Petits marquages fabriques dans le navigateur : aucun fichier image a charger.
function vehicleDecal(title,subtitle,color='#65c9ff',background='#101820',subtitleColor='#e9f2f5'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;const ctx=canvas.getContext('2d');
  ctx.fillStyle=background;ctx.fillRect(0,0,512,160);ctx.strokeStyle=color;ctx.lineWidth=8;ctx.strokeRect(5,5,502,150);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.font='bold 62px Arial,sans-serif';ctx.fillText(title,256,72);
  ctx.fillStyle=subtitleColor;ctx.font='bold 24px Arial,sans-serif';ctx.fillText(subtitle,256,128);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true});
}
function sideDecal(parent,material,x,y,z,width,height,side){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);mesh.position.set(x,y,z);mesh.rotation.y=side>0?Math.PI/2:-Math.PI/2;parent.add(mesh);return mesh;
}
// Facettes de jante simples : lisibles de près, mais avec peu de triangles.
function addWheelRim(parent,x,y,z,radius,width,metal,sides=5){
  for(const side of [-1,1]){
    const faceX=x+side*(width*.5+.012),axis=new THREE.CylinderGeometry(radius*.72,radius*.72,.035,10);
    const disc=new THREE.Mesh(axis,metal);disc.rotation.z=Math.PI/2;disc.position.set(faceX,y,z);parent.add(disc);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(radius*.22,radius*.22,.045,8),metal);cap.rotation.z=Math.PI/2;cap.position.set(faceX+side*.022,y,z);parent.add(cap);
    for(let i=0;i<sides;i++){const a=i*Math.PI*2/sides,spoke=box(parent,.035,radius*.62,.055,faceX+side*.025,y+Math.cos(a)*radius*.32,z+Math.sin(a)*radius*.32,metal);spoke.rotation.x=a}
  }
}
export function car(remote=false){
  const g=new THREE.Group(),black=material(0x101823,{metalness:.65,roughness:.3}),glass=material(0x214451,{metalness:.4,roughness:.18,side:THREE.DoubleSide}),trim=material(0x5e6e7d,{metalness:.8}),rubber=material(0x0a0c10),red=new THREE.MeshBasicMaterial({color:0xff1835});
  // Profil bas et long capot : c'est la silhouette Trans Am qui distingue KITT.
  box(g,1.85,.42,3.9,0,.66,0,black);box(g,1.65,.19,1.4,0,.91,-1.12,black);box(g,1.4,.53,1.32,0,1.12,.35,glass);
  // Toit T-top, montant central, pare-brise incline et lunette arriere.
  box(g,.2,.1,1.02,-.62,1.4,.35,black);box(g,.2,.1,1.02,.62,1.4,.35,black);
  box(g,.13,.1,.98,0,1.4,.35,black);box(g,1.25,.1,.12,0,1.4,-.13,black);box(g,1.25,.1,.12,0,1.4,.83,black);
  box(g,.49,.035,.68,-.3,1.405,.35,glass);box(g,.49,.035,.68,.3,1.405,.35,glass);
  const windscreen=new THREE.Mesh(new THREE.PlaneGeometry(1.34,.5),glass);windscreen.position.set(0,1.13,-.29);windscreen.rotation.x=.58;g.add(windscreen);
  const rearGlass=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.46),glass);rearGlass.position.set(0,1.13,1.0);rearGlass.rotation.x=-.55;g.add(rearGlass);
  for(const s of [-1,1]){const pillar=box(g,.11,.62,.12,s*.7,1.12,-.08,black);pillar.rotation.x=.48;const rearPillar=box(g,.11,.59,.12,s*.7,1.12,.83,black);rearPillar.rotation.x=-.42;box(g,.08,.48,.98,s*.72,1.1,.38,black)}
  // Lames de capot, phares escamotables, jupe avant et feux arriere.
  for(const s of [-1,1]){box(g,.035,.018,1.05,s*.53,1.012,-1.12,trim);box(g,.48,.045,.33,s*.43,1.025,-1.62,black);box(g,.22,.035,.17,s*.43,1.055,-1.64,trim);box(g,.14,.08,.05,s*.77,.72,-1.78,red);box(g,.1,.1,.06,s*.87,.52,-1.94,trim);box(g,.6,.06,.05,s*.57,.85,1.97,red)}
  for(const s of [-1,1]){box(g,.08,.12,.16,s*.86,.66,-.25,black);box(g,.035,.055,.42,s*.934,.67,.22,trim);box(g,.04,.11,.42,s*.936,.56,.3,black)}
  box(g,1.7,.12,.5,0,.91,1.62,black);box(g,1.98,.12,.16,0,.62,-1.95,trim);box(g,1.88,.12,.12,0,.48,-1.96,black);box(g,1.76,.12,.08,0,.79,1.98,red);box(g,1.9,.09,.16,0,.98,1.83,black);
  const wheels=[];for(const x of [-.94,.94])for(const z of [-1.17,1.26]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.22,16),rubber);w.rotation.z=Math.PI/2;w.position.set(x,.38,z);g.add(w);wheels.push(w);addWheelRim(g,x,.38,z,.34,.22,trim,5)}
  box(g,1.35,.13,.045,0,.92,-1.986,rubber);const segments=[];for(let i=0;i<9;i++){const m=new THREE.MeshBasicMaterial({color:0x4c0715});segments.push(box(g,.13,.07,.05,(i-4)*.145,.93,-2.02,m))}
  const glow=new THREE.PointLight(0xff1537,remote?0:4,7,2);glow.position.set(0,.9,-2.1);g.add(glow);
  for(const x of [-.7,.7]){box(g,.3,.09,.05,x,.74,-1.99,new THREE.MeshBasicMaterial({color:0xd9eaff}));if(!remote){const l=new THREE.SpotLight(0xd8eaff,8,19,.4,.7,1);l.position.set(x,.7,-2);l.target.position.set(x,0,-16);g.add(l,l.target)}}
  g.userData={segments,wheels,glow};return g;
}
// Camion Goliath : silhouette massive, remorque noire et accents rouges originaux.
export function goliath(){const g=new THREE.Group(),black=material(0x20242a,{metalness:.28,roughness:.55}),edge=material(0x991d31,{metalness:.24,roughness:.42,emissive:0x39030c,emissiveIntensity:.65}),glass=material(0x416b7a,{metalness:.16,roughness:.26}),trim=material(0x9ba0a4,{metalness:.5,roughness:.38}),cell=material(0x29515d,{transparent:true,opacity:.7,depthWrite:false}),rubber=material(0x101216),wheels=[];
  box(g,3.1,.3,7.1,0,.35,2.35,black);box(g,3.2,.15,7.2,0,3.5,2.35,edge);box(g,3.1,3.1,.2,0,1.9,-1.12,black);box(g,3.1,3.1,.2,0,1.9,5.82,black);
  for(const x of [-1.5,1.5]){box(g,.16,3.1,2.25,x,1.9,.1,black);box(g,.16,3.1,1.45,x,1.9,4.6,black);box(g,.17,1.55,2.2,x,2.72,2.38,cell);box(g,.07,.32,6.65,x*1.08,.83,2.25,edge);box(g,.07,.12,6.65,x*1.08,1.04,2.25,material(0xe1b653,{emissive:0x6b2c0c,emissiveIntensity:.45}));box(g,.09,.48,4.9,x*1.08,2.68,2.35,black);box(g,.1,.16,4.6,x*1.1,2.68,2.35,edge);for(const z of [1.25,1.8,2.35,2.9,3.45])box(g,.2,2.0,.08,x,1.9,z,edge)}box(g,3.15,.18,7.1,0,3.47,2.35,black);box(g,3.5,.18,.18,0,1.15,-2.1,edge);
  // Cabine longue nez, pare-brise, vitres latérales, calandre et échappements de semi.
  box(g,2.8,2.35,2.85,0,1.45,-2.62,black);box(g,2.48,.38,1.58,0,2.7,-2.28,black);box(g,2.36,1.18,1.15,0,2.34,-2.97,glass);
  for(const s of [-1,1]){box(g,.08,.96,.88,s*1.415,2.27,-2.73,glass);box(g,.035,.58,.62,s*1.46,1.9,-1.78,glass);box(g,.08,.12,.28,s*1.52,2.35,-3.2,edge);box(g,.08,.48,.08,s*1.62,2.28,-3.26,black);box(g,.1,.09,.44,s*1.66,2.55,-3.28,glass);box(g,.12,.09,.28,s*1.47,1.58,-1.5,edge);box(g,.13,.22,.18,s*1.48,2.82,-1.6,edge)}
  box(g,2.9,.22,.25,0,2.95,-4.03,edge);box(g,2.5,.12,.18,0,.86,-4.0,black);for(let i=0;i<7;i++)box(g,.075,.66,.035,(i-3)*.29,1.42,-4.04,edge);
  for(const s of [-1,1]){box(g,.36,.28,.08,s*1.03,1.38,-4.08,new THREE.MeshBasicMaterial({color:0xffd17a}));box(g,.18,2.3,.12,s*1.23,2.04,-.78,black);box(g,.13,2.5,.13,s*1.25,2.42,-.78,edge);box(g,.14,2.35,.14,s*1.22,2.02,-.25,black);box(g,.24,.18,.08,s*1.18,1.28,-2.0,edge);box(g,.09,.07,.06,s*1.44,2.1,-1.92,glass)}
  // Face avant du tracteur : grande calandre, pare-chocs lourd et protections.
  box(g,1.38,.64,.07,0,1.42,-4.045,black);for(let i=0;i<5;i++)box(g,1.24,.045,.04,0,1.22+i*.1,-4.09,trim);
  box(g,3.4,.16,.16,0,.72,-4.15,edge);box(g,3.1,.12,.12,0,.92,-4.13,black);for(const s of [-1,1]){box(g,.12,.58,.13,s*1.48,1.02,-4.1,edge);box(g,.16,.13,.12,s*1.43,.77,-4.16,material(0xe3c980,{emissive:0x55300c,emissiveIntensity:.28}))}
  for(const s of [-1,1]){box(g,.08,.72,.09,s*1.08,1.22,-4.08,edge);box(g,.12,.72,.1,s*1.08,1.55,-4.06,black)}
  // Porte arriere du semi et plaques GOLIATH faites en texture de texte locale.
  box(g,2.72,2.55,.07,0,1.94,5.94,material(0x171a1e,{metalness:.35}));box(g,.055,2.45,.04,0,1.94,5.99,edge);
  for(const x of [-1.28,1.28]){box(g,.07,2.45,.07,x,1.94,5.99,edge);box(g,.2,.22,.08,x,3.0,5.99,material(0xc6ccd0,{metalness:.5}))}
  const goliathMark=vehicleDecal('GOLIATH','TRANSPORT LOURD','#ff4355','#101216');sideDecal(g,goliathMark,-1.59,2.18,2.45,2.15,.66,-1);sideDecal(g,goliathMark,1.59,2.18,2.45,2.15,.66,1);
  const rearMark=vehicleDecal('GOLIATH','SEMI-REMORQUE','#ff4355','#101216');const rearPlate=new THREE.Mesh(new THREE.PlaneGeometry(2.05,.55),rearMark);rearPlate.position.set(0,2.38,6.0);g.add(rearPlate);
  // Jupe arriere a bandes visibles et raccord d'attelage sous la remorque.
  box(g,3.05,.2,.18,0,.69,5.98,edge);for(let i=0;i<8;i++){const stripe=box(g,.24,.11,.04,-1.05+i*.3,.7,6.085,i%2?material(0xf0d5c8):edge);stripe.rotation.y=.28}
  box(g,.38,.28,1.15,0,.38,-1.4,black);box(g,.6,.1,.9,0,.3,-1.45,edge);
  for(const x of [-1.58,1.58])for(const z of [-2.9,-1.35,1.1,3.4,5]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.57,.57,.35,14),rubber);w.rotation.z=Math.PI/2;w.position.set(x,.57,z);g.add(w);wheels.push(w);addWheelRim(g,x,.57,z,.57,.35,material(0x8e9297,{metalness:.45}),6)}
  // Garde-boue et feux de gabarit du semi, visibles depuis les bas-côtés.
  for(const side of [-1,1]){for(const z of [-2.9,-1.35,1.1,3.4,5])box(g,.5,.12,1.24,side*1.58,1.2,z,black);for(const z of [-.6,1,2.6,4.2,5.6])box(g,.07,.09,.17,side*1.64,.65,z,new THREE.MeshBasicMaterial({color:0xffbb44}));box(g,.34,.16,.08,side*1.15,.9,6.1,new THREE.MeshBasicMaterial({color:0xff263d}))}
  const bars=[];for(let i=0;i<11;i++)bars.push(box(g,.18,.11,.06,(i-5)*.2,1.42,-4.08,new THREE.MeshBasicMaterial({color:0x401019})));
  const glow=new THREE.PointLight(0xff173b,5,12,2);glow.position.set(0,1.5,-4.1);g.add(glow);g.userData={wheels,bars};return g}
// Camion-atelier de la Fondation FLAG, distinct du semi-remorque Goliath.
export function flagWorkshopTruck(){const g=new THREE.Group(),navy=material(0x263d54,{metalness:.22,roughness:.5}),blue=material(0x3f8fc3,{metalness:.16,roughness:.45,emissive:0x092644,emissiveIntensity:.22}),glass=material(0x79b2c5,{metalness:.1,roughness:.24}),white=material(0xf0f2ed,{metalness:.08,roughness:.48}),rubber=material(0x101216),wheels=[];
  box(g,2.55,.2,5.8,0,.7,.35,navy);box(g,2.42,1.7,3.55,0,1.72,1.45,navy);box(g,2.44,.16,3.56,0,2.64,1.45,blue);
  box(g,2.32,1.62,1.75,0,1.68,-2.15,blue);box(g,.2,.48,.42,0,2.68,-2.28,navy);box(g,1.94,.86,.06,0,2.07,-3.055,glass);box(g,.08,.78,.07,-.04,2.07,-3.10,white);
  for(const side of [-1,1]){box(g,.06,.84,.76,side*1.18,2.03,-2.26,glass);box(g,.08,.7,.05,side*1.24,2.01,-3.04,navy);box(g,.13,.14,.28,side*1.29,2.4,-2.85,blue);box(g,.08,.52,.08,side*1.39,2.3,-2.84,navy);box(g,.1,.1,.4,side*1.43,2.58,-2.84,white);box(g,.1,.09,.22,side*1.22,1.56,-1.85,white);box(g,.13,.2,.16,side*1.18,2.8,-1.95,white);box(g,.035,.04,.68,side*1.225,1.67,-2.23,navy)}
  box(g,2.48,.12,.12,0,1.05,-3.08,white);box(g,2.18,.1,.08,0,.84,-3.1,navy);for(let i=0;i<5;i++)box(g,.07,.42,.035,(i-2)*.19,1.22,-3.105,white);box(g,.24,.17,.11,-1.04,1.08,-3.14,white);box(g,.24,.17,.11,1.04,1.08,-3.14,white);
  box(g,.06,1.12,.035,-1.22,1.78,-.95,white);box(g,.06,1.12,.035,1.22,1.78,-.95,white);box(g,.08,1.55,.04,0,1.82,-.95,blue);
  // Plaques peintes FLAG, bien visibles sur les deux flancs du caisson.
  const flagMark=vehicleDecal('FLAG','FONDATION · ATELIER','#216d9b','#f0f2ed','#263d54');
  for(const side of [-1,1]){box(g,.035,.62,1.48,side*1.225,1.8,1.55,white);sideDecal(g,flagMark,side*1.251,1.8,1.55,1.42,.56,side)}
  // Rangements de dépannage et bandes de visibilité d'un véritable atelier mobile.
  for(const side of [-1,1]){for(const z of [-.1,.8,1.7,2.35]){box(g,.055,.58,.58,side*1.245,.92,z,blue);box(g,.07,.035,.38,side*1.28,1.12,z,white);box(g,.08,.08,.08,side*1.29,.92,z,white)}for(const z of [-.2,.4,1.0,1.6,2.2])box(g,.07,.16,.36,side*1.27,.68,z,white);box(g,.18,.48,.16,side*1.26,2.42,-1.55,blue)}
  // Porte a rideau arriere, echelle de service et bande de pare-chocs.
  box(g,1.86,1.34,.035,0,1.79,3.245,navy);for(const y of [1.2,1.34,1.48,1.62,1.76,1.9,2.04,2.18,2.32])box(g,1.72,.025,.035,0,y,3.27,blue);
  box(g,.07,1.27,.06,-.95,1.8,3.28,white);box(g,.07,1.27,.06,.95,1.8,3.28,white);box(g,.08,.14,.06,0,1.55,3.29,white);
  const rearFlag=new THREE.Mesh(new THREE.PlaneGeometry(1.25,.42),flagMark);rearFlag.position.set(0,2.54,3.28);g.add(rearFlag);
  box(g,2.35,.13,.12,0,.8,3.28,white);for(let i=0;i<6;i++)box(g,.08,.3,.04,(i-2.5)*.32,1.42,3.245,blue);box(g,.12,1.12,.12,-1.23,1.78,2.9,white);box(g,.12,1.12,.12,1.23,1.78,2.9,white);
  // Gyrophares physiques rouge et bleu au-dessus du caisson et projecteurs de travail.
  box(g,.74,.12,.28,0,2.78,.42,navy);for(const s of [-1,1]){const beaconLens=new THREE.MeshStandardMaterial({color:s<0?0x3bb7ff:0xe43e50,emissive:s<0?0x12658a:0x741627,emissiveIntensity:.7});box(g,.25,.16,.24,s*.2,2.91,.42,beaconLens);box(g,.2,.1,.13,s*.93,2.74,-2.42,white)}
  for(const x of [-1.18,1.18])for(const z of [-1.7,.12,2.65]){const w=new THREE.Mesh(new THREE.CylinderGeometry(.44,.44,.27,14),rubber);w.rotation.z=Math.PI/2;w.position.set(x,.48,z);g.add(w);wheels.push(w);addWheelRim(g,x,.48,z,.44,.27,white,5)}
  // Marches antidérapantes, garde-boue et feux arrière de l'atelier.
  for(const side of [-1,1]){box(g,.35,.12,.7,side*1.3,.6,-2.2,white);for(const z of [-1.7,.12,2.65])box(g,.36,.09,1,side*1.18,.97,z,navy);box(g,.25,.18,.07,side*.98,1.03,3.33,new THREE.MeshBasicMaterial({color:0xff3547}))}
  const beacon=new THREE.PointLight(0x50b8ff,1.2,6,2);beacon.position.set(0,2.9,.5);g.add(beacon);g.userData={wheels,beacon};return g}
export function scanCar(g,time,speed=0,gold=false){const phase=(Math.sin(time*3)+1)*4;g.userData.segments.forEach((s,i)=>{const glow=Math.max(.06,1-Math.abs(i-phase)*.55);s.material.color.setRGB(glow,gold?0.48:0.008,0.035)});g.userData.wheels.forEach(w=>w.rotation.x+=speed*.03)}
