import * as THREE from 'three';

// Bras voxel simples, dessinés près de la caméra pour la vue à la première personne.
const BLOCK_COLORS = {
  herbe:0x64884b, terre:0x805a40, pierre:0x78818a, sable:0xd6b77e,
  bois:0x886039, feuilles:0x356d43, bitume:0x303744, metal:0x303c49,
  verre:0x477b94, rouge:0xff273b, bleu:0x20bcf4, marquage:0xe8d7a1,
  frite:0xf2bd45, gaufre:0xb87938, citrouille:0xe97b25
};
const ACTION_TIME = {mine:.27, place:.25, attack:.34, use:.3};
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const smooth = t=>{t=clamp(t,0,1);return t*t*(3-2*t)};

/**
 * Crée les avant-bras et la main dans l'espace caméra. Le module reste autonome :
 * l'appelant fournit l'objet tenu et déclenche les animations selon ses actions.
 */
export function createFirstPersonArms(camera, options={}){
  if(!camera?.isCamera)throw new TypeError('Une caméra Three.js est requise pour les bras en vue subjective.');
  const root=new THREE.Group();root.name='KITT_FIRST_PERSON_ARMS';root.frustumCulled=false;camera.add(root);
  const boxGeo=new THREE.BoxGeometry(1,1,1),edgeGeo=new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1));
  const materials=new Set();
  const standard=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.82,...extra});materials.add(m);return m};
  const flat=(color,extra={})=>{const m=new THREE.MeshBasicMaterial({color,...extra});materials.add(m);return m};
  const colors={sleeve:options.sleeveColor??0x17222d,trim:options.accentColor??0xe5374b,skin:options.skinColor??0xd9a781,glove:0x262c31};
  const sleeveMat=standard(colors.sleeve),trimMat=standard(colors.trim,{metalness:.18}),skinMat=standard(colors.skin),gloveMat=standard(colors.glove);
  const scannerMat=standard(0x151d27,{metalness:.55,roughness:.4}),scannerGlow=standard(colors.trim,{emissive:colors.trim,emissiveIntensity:1.6,roughness:.35}),batonMat=standard(0x252b32,{metalness:.55,roughness:.38});
  const makeBox=(parent,material,size,position,rotation=[0,0,0])=>{
    const mesh=new THREE.Mesh(boxGeo,material);mesh.scale.set(size[0],size[1],size[2]);mesh.position.set(position[0],position[1],position[2]);mesh.rotation.set(rotation[0],rotation[1],rotation[2]);mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=20;parent.add(mesh);return mesh;
  };
  const makeArm=side=>{
    const pivot=new THREE.Group();pivot.name=side>0?'bras_droit':'bras_gauche';pivot.position.set(side*.52,-.08,-.82);pivot.scale.setScalar(.78);root.add(pivot);
    // Manche sombre de pilote, bordure rouge KITT et pli de coude en petits volumes.
    makeBox(pivot,sleeveMat,[.225,.35,.235],[-side*.025,-.135,.015],[side*.12,0,side*.12]);
    makeBox(pivot,sleeveMat,[.218,.13,.22],[-side*.045,-.31,-.055],[side*.1,0,side*.1]);
    makeBox(pivot,trimMat,[.232,.055,.243],[-side*.045,-.305,-.065]);
    makeBox(pivot,gloveMat,[.208,.145,.19],[-side*.07,-.365,-.155],[.08,0,side*.05]);
    // Quatre phalanges carrées et un pouce rendent la main lisible à l'écran.
    for(let i=0;i<4;i++)makeBox(pivot,skinMat,[.043,.09,.064],[-side*.115+i*.052,-.435,-.205],[.05,0,(i-1.5)*.045]);
    makeBox(pivot,skinMat,[.063,.105,.074],[-side*.177,-.365,-.164],[0,0,side*.42]);
    makeBox(pivot,skinMat,[.18,.09,.12],[-side*.07,-.37,-.19]);
    // Petite diode rouge sur le poignet, visible quand la main se rapproche de la caméra.
    makeBox(pivot,scannerGlow,[.065,.025,.018],[-side*.045,-.3,-.191]);
    return pivot;
  };
  const right=makeArm(1),left=makeArm(-1);
  const held=new THREE.Group();held.name='bloc_tenu';held.position.set(-.185,-.205,-.36);held.rotation.set(.22,-.28,.18);right.add(held);
  let heldMat=standard(BLOCK_COLORS.herbe),heldMesh=new THREE.Mesh(boxGeo,heldMat);heldMesh.scale.set(.205,.205,.205);heldMesh.castShadow=false;heldMesh.receiveShadow=false;heldMesh.renderOrder=21;held.add(heldMesh);
  let heldEdges=new THREE.LineSegments(edgeGeo,flat(0x162019,{transparent:true,opacity:.68}));heldEdges.scale.copy(heldMesh.scale);heldEdges.renderOrder=22;held.add(heldEdges);
  const weapon=new THREE.Group();weapon.name='arme_tenue';weapon.position.set(-.15,-.21,-.35);weapon.rotation.set(.18,-.25,.15);right.add(weapon);
  const scanner=new THREE.Group();scanner.name='ray_scanner';weapon.add(scanner);
  makeBox(scanner,scannerMat,[.115,.21,.09],[0,-.03,0],[.12,0,.08]);
  makeBox(scanner,scannerGlow,[.25,.055,.06],[-.08,.095,-.025]);
  makeBox(scanner,gloveMat,[.075,.32,.07],[-.03,-.03,0],[0,0,-.16]);
  makeBox(scanner,trimMat,[.092,.05,.09],[-.03,.135,0]);
  const baton=new THREE.Group();baton.name='matraque_neon';weapon.add(baton);
  makeBox(baton,batonMat,[.075,.39,.075],[-.025,.015,0],[0,0,-.18]);
  makeBox(baton,trimMat,[.083,.06,.083],[-.025,.18,0],[0,0,-.18]);
  makeBox(baton,scannerGlow,[.025,.19,.083],[-.025,.01,-.044],[0,0,-.18]);
  held.visible=false;left.visible=false;weapon.visible=false;scanner.visible=false;baton.visible=false;
  let elapsed=0,action='idle',actionAge=10,requestedAction='idle',itemId='',weaponId='',baseItemColor=BLOCK_COLORS.herbe;
  const resetItemMaterial=color=>{
    heldMat.color.setHex(color);heldMat.emissive.setHex(color);heldMat.emissiveIntensity=(color===BLOCK_COLORS.rouge||color===BLOCK_COLORS.bleu)?0.22:0;
    heldEdges.material.color.setHex(color===BLOCK_COLORS.sable||color===BLOCK_COLORS.frite?0x453323:0x162019);
  };
  const setItem=item=>{
    const value=typeof item==='string'?{id:item}:item;
    if(!value){itemId='';held.visible=false;return}
    const nextId=value.id||value.name||'bloc',nextColor=Number.isInteger(value.color)?value.color:(BLOCK_COLORS[nextId]??0x886039);
    if(nextId===itemId&&nextColor===baseItemColor){held.visible=!weaponId;return}
    itemId=nextId;baseItemColor=nextColor;
    resetItemMaterial(baseItemColor);held.visible=!weaponId;
  };
  const setWeapon=id=>{
    weaponId=typeof id==='string'?id:'';
    const active=!!weaponId&&weaponId!=='none',isBaton=/matraque|baton|club|melee/i.test(weaponId);
    weapon.visible=active;scanner.visible=active&&!isBaton;baton.visible=active&&isBaton;
    held.visible=!!itemId&&!active;
  };
  const trigger=name=>{
    const next=ACTION_TIME[name]?name:'idle';action=next;actionAge=0;requestedAction=next;
  };
  const setPalette=palette=>{
    if(!palette)return;
    if(Number.isInteger(palette.sleeveColor)){colors.sleeve=palette.sleeveColor;sleeveMat.color.setHex(colors.sleeve)}
    if(Number.isInteger(palette.accentColor)){colors.trim=palette.accentColor;trimMat.color.setHex(colors.trim);scannerGlow.color.setHex(colors.trim);scannerGlow.emissive.setHex(colors.trim)}
    if(Number.isInteger(palette.skinColor)){colors.skin=palette.skinColor;skinMat.color.setHex(colors.skin)}
  };
  const update=(state={},dt=1/60)=>{
    dt=clamp(Number(dt)||0,0,.05);elapsed+=dt;actionAge+=dt;
    if(state.action&&state.action!==requestedAction)trigger(state.action);
    if(!state.action)requestedAction='idle';
    if(action!=='idle'&&actionAge>(ACTION_TIME[action]||.3)){action='idle';actionAge=10}
    if(Object.hasOwn(state,'item'))setItem(state.item);
    if(Object.hasOwn(state,'weapon'))setWeapon(state.weapon);
    if(state.palette)setPalette(state.palette);
    const show=state.visible!==false&&!state.inVehicle;
    root.visible=show;
    if(!show)return;
    const moving=clamp(Number(state.moving)||0,0,1),sprinting=!!state.sprinting,walk=elapsed*(sprinting?13:9.4),bob=Math.sin(walk*2)*moving*(sprinting?.045:.022);
    const actionProgress=ACTION_TIME[action]?smooth(actionAge/ACTION_TIME[action]):0,envelope=ACTION_TIME[action]?Math.sin(actionProgress*Math.PI):0;
    right.position.y=-.08+bob;left.position.y=-.08-bob;left.position.z=-.82;
    right.position.x=.52+Math.sin(walk)*moving*(sprinting?.045:.024);left.position.x=-.52-Math.sin(walk)*moving*(sprinting?.045:.024);
    right.rotation.set(Math.sin(walk)*moving*(sprinting?.18:.1),0,Math.sin(walk+Math.PI/2)*moving*(sprinting?.11:.055));
    left.rotation.set(-Math.sin(walk)*moving*(sprinting?.18:.1),0,-Math.sin(walk+Math.PI/2)*moving*(sprinting?.11:.055));
    const twoHands=['place','attack','use'].includes(action)||sprinting&&moving>.5;
    left.visible=twoHands;
    if(action==='mine'){right.rotation.x+=.95*envelope;right.rotation.z-=.14*envelope}
    else if(action==='place'){right.position.z=-.82-.13*envelope;right.rotation.x-=.68*envelope;left.position.z=-.82-.08*envelope;left.rotation.x-=.3*envelope}
    else if(action==='attack'){right.rotation.x-=.88*envelope;right.rotation.z-=.35*envelope;left.rotation.x-=.38*envelope}
    else if(action==='use'){right.position.z=-.82-.09*envelope;right.rotation.x-=.42*envelope;left.rotation.x-=.2*envelope}
    if(action==='idle'||action==='mine')right.position.z=-.82+(sprinting?-.025:0);
    if(held.visible)held.rotation.z=.18+Math.sin(elapsed*1.4)*.035;
    if(weapon.visible)weapon.rotation.x=.18+Math.sin(elapsed*1.4)*.02;
  };
  const inspect=()=>({visible:root.visible,rightVisible:right.visible,leftVisible:left.visible,itemId,weaponId,weaponStyle:baton.visible?'matraque':scanner.visible?'scanner':'aucun',action,meshes:root.children.reduce((n,g)=>n+g.children.length,0)});
  const dispose=()=>{
    root.removeFromParent();
    edgeGeo.dispose();boxGeo.dispose();
    for(const material of materials)material.dispose();materials.clear();
  };
  return {group:root,update,trigger,setItem,setWeapon,setPalette,inspect,dispose};
}
