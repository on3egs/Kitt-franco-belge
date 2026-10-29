import * as THREE from 'three';
import {BISTRO_ORIGIN,BISTRO_ARCADES,BISTRO_COLLIDERS,isInsideBistro} from './bistro-layout.mjs?v=marcel-entry-20261029';

// Toutes les textures sont dessinées ici ; aucun visuel ni morceau protégé n'est chargé.
function canvasTexture(draw,w=512,h=512){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t}
function signTexture(title,subtitle,color='#ef5368',background='#131b23'){
 return canvasTexture((c,w,h)=>{c.fillStyle=background;c.fillRect(0,0,w,h);c.strokeStyle=color;c.lineWidth=6;c.strokeRect(8,8,w-16,h-16);c.shadowColor=color;c.shadowBlur=15;c.fillStyle=color;c.textAlign='center';c.font='bold 54px monospace';c.fillText(title,w/2,77);c.shadowBlur=0;c.fillStyle='#eadfbd';c.font='20px monospace';c.fillText(subtitle,w/2,119)},640,160);
}
export function createBistro(scene){
 const root=new THREE.Group();root.name='BISTRO_FLAG_1988';root.position.set(BISTRO_ORIGIN.x,8,BISTRO_ORIGIN.z);scene.add(root);
 const woodMap=canvasTexture((c,w,h)=>{c.fillStyle='#482a1f';c.fillRect(0,0,w,h);for(let i=0;i<90;i++){c.strokeStyle=i%3?'#674431':'#281c18';c.lineWidth=i%4+1;c.beginPath();c.moveTo(0,i*6);c.bezierCurveTo(160,i*6-5,340,i*6+4,w,i*6);c.stroke()}for(const y of [0,128,256,384]){c.fillStyle='#241c18';c.fillRect(0,y,w,3)}});
 const brickMap=canvasTexture((c,w,h)=>{c.fillStyle='#342d29';c.fillRect(0,0,w,h);for(let row=0;row<8;row++)for(let col=-1;col<5;col++){const shade=80+(row*13+col*7)%30;c.fillStyle=`rgb(${shade+28},${shade-22},${shade-30})`;c.fillRect(col*128+(row%2)*64+3,row*64+3,122,58);c.fillStyle='#b37b4b22';c.fillRect(col*128+(row%2)*64+6,row*64+5,115,2)}});
 brickMap.wrapS=brickMap.wrapT=THREE.RepeatWrapping;brickMap.repeat.set(3,1);
 const floorMap=canvasTexture((c,w,h)=>{for(let z=0;z<16;z++)for(let x=0;x<16;x++){c.fillStyle=(x+z)%2?'#363b3d':'#c8b997';c.fillRect(x*32,z*32,32,32);c.strokeStyle='#141b2360';c.strokeRect(x*32+.5,z*32+.5,31,31)}});
 const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.72,...extra});
 const M={wood:mat(0xcda477,{map:woodMap}),polish:mat(0xa26037,{roughness:.22,metalness:.12}),brick:mat(0xffffff,{map:brickMap}),floor:mat(0xffffff,{map:floorMap,roughness:.55}),cream:mat(0xe0c7a2),black:mat(0x141c24),chrome:mat(0xa0adb1,{roughness:.24,metalness:.78}),red:mat(0x862c3c,{roughness:.45}),blue:mat(0x184c64),glass:mat(0x8bd8d8,{roughness:.15,metalness:.25}),green:mat(0x396841),amber:mat(0x9c6a26),gold:mat(0xbb9a4c,{metalness:.6}),white:mat(0xf0ddaf),coffee:mat(0x321b10),skin:mat(0xd6a27d),hair:mat(0x241a17),vest:mat(0x72283a,{roughness:.53}),apron:mat(0x202933,{roughness:.76}),beer:mat(0xe1a632,{roughness:.22,metalness:.02}),foam:mat(0xffe9bd),clearGlass:new THREE.MeshPhysicalMaterial({color:0xd6f4ef,roughness:.08,metalness:.02,transparent:true,opacity:.34,side:THREE.DoubleSide}),neonRed:new THREE.MeshBasicMaterial({color:0xfa405e}),neonBlue:new THREE.MeshBasicMaterial({color:0x35ceec}),bulb:new THREE.MeshBasicMaterial({color:0xffd49b})};
 const batches=new Map(),boxGeo=new THREE.BoxGeometry(1,1,1),cylinderGeo=new THREE.CylinderGeometry(.5,.5,1,12),sphereGeo=new THREE.SphereGeometry(.5,10,6),dummy=new THREE.Object3D();
 function part(kind,m,w,h,d,x,y,z,ry=0,rx=0){const k=kind+':'+m.uuid;let batch=batches.get(k);if(!batch){batch={m,kind,matrices:[]};batches.set(k,batch)}dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.rotation.set(rx,ry,0,'YXZ');dummy.updateMatrix();batch.matrices.push(dummy.matrix.clone())}
 const box=(w,h,d,x,y,z,m,ry=0,rx=0)=>part('box',m,w,h,d,x,y,z,ry,rx);
 const cyl=(r,h,x,y,z,m)=>part('cylinder',m,r*2,h,r*2,x,y,z);
 const ball=(r,x,y,z,m)=>part('sphere',m,r*2,r*2,r*2,x,y,z);
 function panel(texture,w,h,x,y,z,ry=0,rx=0){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,0,'YXZ');root.add(mesh);return mesh}
 function directBox(parent,w,h,d,x,y,z,material){const mesh=new THREE.Mesh(boxGeo,material);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh}
 function mug(x,y,z){cyl(.105,.15,x,y+.075,z,M.white);cyl(.084,.007,x,y+.154,z,M.coffee);box(.08,.055,.04,x+.12,y+.09,z,M.white);cyl(.145,.022,x,y+.011,z,M.cream)}
 function bottle(x,y,z,color){cyl(.075,.23,x,y+.115,z,color);cyl(.033,.12,x,y+.29,z,color);cyl(.037,.035,x,y+.36,z,M.gold);box(.115,.095,.006,x,y+.13,z+.073,M.cream)}

 // Plancher et murs finis, plutôt qu'un hangar rempli de cubes de un mètre.
 box(15,.025,15,0,.013,0,M.floor);box(15,.09,15,0,4.91,0,M.black);
 box(15,2.2,.08,0,1.1,-7.46,M.wood);box(15,2.7,.08,0,3.55,-7.46,M.brick);
 for(const side of [-1,1]){box(.08,1.15,15,side*7.46,.575,0,M.wood);box(.08,.08,15,side*7.39,1.17,0,M.gold);box(.08,.13,15,side*7.4,.075,0,M.black)}
 for(const side of [-1,1]){box(.08,3.65,9,side*7.46,3.025,-3,M.brick);box(.08,3.65,2,side*7.46,3.025,6.5,M.brick);box(.08,.88,4,side*7.46,4.45,3.5,M.brick);for(const z of [1.5,3.5,5.5])box(.11,2.9,.055,side*7.38,2.55,z,M.chrome);for(const y of [1.18,3.97])box(.11,.07,4.1,side*7.38,y,3.5,M.chrome)}
 for(const x of [-7.35,-2.5,2.5,7.35])box(.18,.25,15,x,4.78,0,M.wood);
 for(const z of [-7.35,0,7.35])box(15,.25,.18,0,4.76,z,M.wood);
 for(const side of [-1,1]){box(.035,.035,14.6,side*7.32,3.92,0,side<0?M.neonBlue:M.neonRed);box(.05,.05,14.7,side*7.31,1.24,0,M.chrome)}

 // Comptoir en L, panneaux de façade, repose-pieds et plateau débordant.
 box(10,1.05,.83,1,.525,-4.8,M.wood);box(10.35,.15,1.04,1,1.12,-4.8,M.polish);
 box(.75,1.05,2.65,-3.65,.525,-3.9,M.wood);box(.96,.15,2.8,-3.65,1.12,-3.9,M.polish);
 box(9.7,.045,.045,1,.27,-4.1,M.chrome);box(.045,.045,2.5,-3.1,.27,-3.85,M.chrome);
 box(10.05,.055,.035,1,.98,-4.365,M.gold);box(10.1,.035,.035,1,.16,-4.365,M.gold);box(10.2,.045,.035,1,.9,-4.34,M.neonRed);
 for(let x=-3.7;x<=5.7;x+=1.35){box(1.08,.64,.045,x,.59,-4.33,M.gold);box(.96,.52,.05,x,.59,-4.295,M.polish);box(.86,.42,.035,x,.59,-4.26,M.red);box(.045,.48,.04,x-.43,.59,-4.235,M.gold);box(.045,.48,.04,x+.43,.59,-4.235,M.gold);box(.82,.035,.04,x,.8,-4.235,M.gold);box(.82,.035,.04,x,.38,-4.235,M.gold)}
 panel(signTexture('FLAG','BISTRO  ·  1988','#f0d088','#471d29'),1.62,.62,1,.59,-4.22);
 for(let x=-2.8;x<5.3;x+=1.35){box(.018,.44,.018,x,.64,-4.22,M.chrome);for(const y of [.47,.8])ball(.035,x,y,-4.19,M.gold)}
 for(const x of [-2.5,-.7,1.1,2.9,4.7]){cyl(.25,.06,x,.035,-3.15,M.black);cyl(.075,.66,x,.4,-3.15,M.chrome);cyl(.29,.11,x,.78,-3.15,M.red);cyl(.3,.04,x,.85,-3.15,M.red);box(.52,.3,.1,x,1.05,-2.92,M.red);box(.035,.32,.035,x-.2,.88,-2.92,M.chrome);box(.035,.32,.035,x+.2,.88,-2.92,M.chrome)}

 // Arrière-bar garni, vitrines, bouteilles et ardoise de spécialités belges.
 box(12.5,.82,.6,.4,.41,-7.1,M.wood);box(12.6,.08,.72,.4,.88,-7.1,M.polish);
 for(const x of [-4.4,4.9]){box(3,.07,.62,x,1.65,-7.09,M.polish);box(3,.07,.62,x,2.4,-7.09,M.polish);box(3,.07,.62,x,3.15,-7.09,M.polish);box(3,.035,.035,x,1.74,-6.76,M.neonBlue);for(let i=0;i<7;i++){bottle(x-1.15+i*.37,1.69,-7.1,i%3?M.green:M.amber);bottle(x-1.15+i*.37,2.44,-7.1,i%3?M.blue:M.green);cyl(.06,.18,x-1.1+i*.37,.98,-7.05,M.glass)}}
 const menu=canvasTexture((c,w,h)=>{c.fillStyle='#172725';c.fillRect(0,0,w,h);c.strokeStyle='#b39259';c.lineWidth=14;c.strokeRect(8,8,w-16,h-16);c.fillStyle='#f0e5b8';c.textAlign='center';c.font='bold 44px monospace';c.fillText('LA PAUSE FLAG',w/2,68);c.font='26px monospace';['CAFÉ · CHOCOLAT CHAUD','GAUFRE DE LIÈGE','FRITES · SAUCE MAISON','BRUXELLES ↔ PARIS','OUVERT · DEPUIS 1988'].forEach((s,i)=>c.fillText(s,w/2,125+i*55))},640,440);
 panel(menu,3.5,2.4,.3,2.65,-7.34);
 // Machine à café, groupe, tasses et trois robinets chromés.
 box(1.05,.54,.5,-1.75,1.18,-7.05,M.chrome);box(.92,.18,.4,-1.75,1.47,-7.05,M.black);for(const x of [-2,-1.55]){box(.07,.16,.16,x,1.02,-6.79,M.chrome);mug(x,.94,-6.65)}
 for(const x of [.5,1.05,1.6]){cyl(.045,.47,x,1.42,-4.91,M.chrome);box(.07,.06,.2,x,1.65,-4.82,M.chrome);box(.06,.15,.06,x,1.78,-4.77,M.black)}
 for(const x of [-2.7,.15,3.9])mug(x,1.2,-4.7);

 // Barman voxel et tablier, intégré dans les mêmes batches statiques.
 const barman=new THREE.Group();barman.name='Marcel · barman FLAG';barman.position.set(2,0,-6.12);root.add(barman);
 directBox(barman,.48,.7,.34,0,1.31,0,M.cream);directBox(barman,.52,.48,.38,0,1.22,.045,M.vest);
 directBox(barman,.17,.49,.035,0,1.39,.246,M.white);directBox(barman,.09,.34,.045,0,1.38,.274,M.red);
 for(const y of [1.48,1.31,1.14])ball(.025,0,y,.303,M.gold);
 directBox(barman,.39,.1,.34,0,.94,0,M.black);directBox(barman,.29,.35,.04,0,.95,.205,M.apron);directBox(barman,.06,.42,.045,-.19,1.13,.18,M.gold);directBox(barman,.06,.42,.045,.19,1.13,.18,M.gold);
 const head=new THREE.Group();head.position.set(0,1.82,.015);barman.add(head);
 directBox(head,.4,.47,.35,0,0,0,M.skin);directBox(head,.45,.11,.4,0,.2,0,M.hair);directBox(head,.08,.18,.36,-.19,.06,0,M.hair);directBox(head,.08,.18,.36,.19,.06,0,M.hair);
 directBox(head,.34,.11,.34,0,.29,0,M.black);directBox(head,.44,.045,.44,0,.22,.015,M.gold);directBox(head,.09,.13,.08,0,.28,.19,M.red);
 for(const x of [-.105,.105]){directBox(head,.055,.055,.025,x,.025,.184,M.black);directBox(head,.025,.025,.02,x,.025,.201,M.white)}
 directBox(head,.055,.07,.06,0,-.06,.204,M.skin);directBox(head,.27,.06,.04,0,-.15,.2,M.hair);directBox(head,.12,.045,.04,-.09,-.17,.208,M.black);directBox(head,.12,.045,.04,.09,-.17,.208,M.black);
 const badgeTexture=signTexture('MARCEL','BARMAN FLAG','#f5d07c','#19232b');const badge=new THREE.Mesh(new THREE.PlaneGeometry(.28,.11),new THREE.MeshBasicMaterial({map:badgeTexture,side:THREE.DoubleSide}));badge.position.set(.16,1.46,.29);barman.add(badge);
 function arm(side){const pivot=new THREE.Group();pivot.position.set(side*.31,1.57,.015);barman.add(pivot);directBox(pivot,.2,.48,.22,0,-.25,0,M.vest);directBox(pivot,.16,.22,.18,0,-.58,.035,M.skin);directBox(pivot,.205,.09,.23,0,-.06,0,M.gold);return pivot}
 const armLeft=arm(-1),armRight=arm(1);directBox(barman,.23,.08,.23,-.42,1.34,.03,M.gold);directBox(barman,.23,.08,.23,.42,1.34,.03,M.gold);
 const beerGlass=new THREE.Group();beerGlass.visible=false;root.add(beerGlass);
 const glassShell=new THREE.Mesh(new THREE.CylinderGeometry(.105,.12,.34,16,1,true),M.clearGlass);glassShell.position.y=.17;beerGlass.add(glassShell);
 const beerFill=new THREE.Mesh(new THREE.CylinderGeometry(.082,.092,.245,16),M.beer);beerFill.position.y=.145;beerGlass.add(beerFill);
 const foamCap=new THREE.Mesh(new THREE.CylinderGeometry(.091,.086,.052,16),M.foam);foamCap.position.y=.292;beerGlass.add(foamCap);
 const glassBase=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.026,16),M.clearGlass);glassBase.position.y=.013;beerGlass.add(glassBase);
 let serveAt=-Infinity,serveStartX=2,serveEndX=2,beerOrders=0;

 // Deux alcôves de diner : assises, dossiers capitonnés et vaisselle.
 for(const z of [.3,4.5]){
  for(const s of [-1,1]){box(3.45,.42,.7,5,.36,z+s*1.05,M.red);box(3.45,.82,.16,5,.84,z+s*1.32,M.red);box(3.48,.045,.75,5,.15,z+s*1.05,M.chrome);for(let x=3.55;x<6.6;x+=.5)box(.025,.5,.02,x,.9,z+s*1.225,M.gold)}
  box(2.3,.09,1.1,5,.8,z,M.cream);box(1.85,.06,.93,5,.745,z,M.chrome);cyl(.1,.7,4.4,.37,z,M.chrome);cyl(.1,.7,5.6,.37,z,M.chrome);mug(4.5,.85,z-.1);mug(5.5,.85,z+.1);
  box(.35,.18,.26,5,.93,z,M.red);for(let i=0;i<5;i++)box(.035,.25,.035,4.9+i*.045,1.11,z,M.gold);
 }
 box(1.65,.08,1.25,-4.8,.8,4.5,M.polish);cyl(.12,.72,-4.8,.4,4.5,M.chrome);cyl(.4,.04,-4.8,.04,4.5,M.black);mug(-4.45,.85,4.5);mug(-5.15,.85,4.5);
 for(const s of [-1,1]){box(.55,.1,.58,-4.8+s*1.15,.5,4.5,M.red);box(.1,.65,.58,-4.8+s*1.42,.84,4.5,M.red);for(const dx of [-.2,.2])for(const dz of [-.2,.2])box(.04,.45,.04,-4.8+s*1.15+dx,.25,4.5+dz,M.chrome)}

 // Suspensions : lumière chaude et diffuse, sans ombres coûteuses supplémentaires.
 const lights=[];for(const [x,z]of [[1,-3.5],[4.8,2.3],[-4.5,1]]){box(.035,1,.035,x,4.25,z,M.chrome);cyl(.34,.18,x,3.66,z,M.black);cyl(.29,.025,x,3.56,z,M.bulb);const light=new THREE.PointLight(0xffc78a,16,14,2);light.position.set(x,3.45,z);root.add(light);lights.push(light)}
 panel(signTexture('ARCADE','5 BORNES  /  14 JEUX','#41d9f4'),3.4,.85,-7.32,3.6,-2.5,Math.PI/2);

 const animated=[];
 function arcade(id,z,x=-6.5,face=1){
  const yaw=-Math.PI/2*face,accent=({'pacman':M.gold,'tetris':M.blue,'space-invaders':M.neonBlue,'stunt':M.neonRed,'arcade-hub':M.green})[id]||M.blue;
  const B=(w,h,d,lx,ly,lz,m,rx=0)=>box(w,h,d,x-face*lz,ly,z+face*lx,m,yaw,rx);
  B(1.04,.16,1.1,0,.08,0,M.black);B(.98,.75,.94,0,.5,.04,accent);B(.9,.76,.58,0,1.23,.18,M.black);
  for(const s of [-1,1]){B(.08,1.7,1.06,s*.49,.94,0,accent);B(.09,.055,1.06,s*.49,1.79,0,id==='pacman'?M.neonRed:M.neonBlue)}
  B(.93,.1,.45,0,.93,-.45,M.black,-.18);B(.92,.32,.7,0,1.78,0,accent);
  B(.25,.19,.025,.22,.4,-.45,M.chrome);B(.12,.025,.03,.22,.42,-.47,M.black);
  B(.035,.14,.035,-.2,1.055,-.5,M.chrome);part('sphere',M.red,.12,.12,.12,x+face*.5,1.14,z-face*.2);for(const lx of [.13,.31])part('cylinder',id==='pacman'?M.neonRed:M.neonBlue,.105,.03,.105,x+face*.49,1.005,z+face*lx);
  const screenCanvas=document.createElement('canvas');screenCanvas.width=256;screenCanvas.height=256;const texture=new THREE.CanvasTexture(screenCanvas);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;
  panel(texture,.74,.67,x+face*.365,1.37,z,face*Math.PI/2,-.12);
  const labels={'pacman':['PAC-MAN','PRESS START','#ffcd40'],'tetris':['TETRIS','PRESS START','#55ddf2'],'space-invaders':['SPACE','INVADERS','#55ddf2'],stunt:['STUNT','TURBO RUN','#ff5367'],'arcade-hub':['10 JEUX','PICK A GAME','#74df93']};
  panel(signTexture(...labels[id]),1.28,.36,x+face*.365,1.88,z,face*Math.PI/2);
  animated.push({id,canvas:screenCanvas,texture});
 }
 for(const machine of BISTRO_ARCADES)arcade(machine.id,machine.z-BISTRO_ORIGIN.z,machine.x-BISTRO_ORIGIN.x,machine.front==='west'?-1:1);

 // Juke-box : arche chromée et grille de haut-parleur, commandes FM au bistrot.
 box(.9,1.55,.7,-6.5,.83,1.8,M.wood);box(.97,.12,.75,-6.5,1.63,1.8,M.chrome);box(.08,1.6,.08,-6.02,.88,1.45,M.neonRed);box(.08,1.6,.08,-6.02,.88,2.15,M.neonBlue);
 panel(signTexture('FM 1988','RADIO DE BORD','#ffcc74'),.65,.3,-6.02,1.34,1.8,Math.PI/2);for(let y=.3;y<1.12;y+=.1)box(.03,.025,.57,-6.015,y,1.8,M.chrome);
 panel(signTexture('BISTRO FLAG','CAFÉ · FRITES · ARCADE','#ff4b63'),6.2,1.55,-1,4.4,8.06);
 box(9,.2,1.5,-1,3.4,8.2,M.red);box(9,.09,.08,-1,3.31,8.94,M.neonRed);
 panel(signTexture('BIENVENUE','LIÈGE · BRUXELLES · PARIS','#45e0e5'),3.8,.6,-1,2.9,-7.35);
 // Paillasson à plat, sans créer une marche dans l'entrée.
 const rug=panel(signTexture('FLAG','BONNE ROUTE','#dcc19b','#641d2d'),2.7,1.2,-1,.03,6.5,0,-Math.PI/2);rug.material.side=THREE.DoubleSide;
 for(const batch of batches.values()){const geo=batch.kind==='box'?boxGeo:batch.kind==='cylinder'?cylinderGeo:sphereGeo;const mesh=new THREE.InstancedMesh(geo,batch.m,batch.matrices.length);batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh)}
 function nearBarman(player){return isInsideBistro(player.x,player.z)&&Math.hypot(player.x-(BISTRO_ORIGIN.x+2),player.z-(BISTRO_ORIGIN.z-3.15))<1.45&&player.y<10.5}
 function serveBeer(player){if(!nearBarman(player))return null;const now=performance.now()/1000;if(now-serveAt<5)return{served:false,orders:beerOrders};serveAt=now;beerOrders++;serveStartX=barman.position.x;serveEndX=THREE.MathUtils.clamp(player.x-BISTRO_ORIGIN.x,-3.7,5.7);beerGlass.visible=true;return{served:true,orders:beerOrders}}
 function animateBarman(time,player){const idle=Math.sin(time*.58)*.48,busy=time-serveAt<1.2,move=busy?1-Math.max(0,time-serveAt)/1.2:0;barman.position.x=2+idle+(serveEndX-2)*move*.45;barman.rotation.z=Math.sin(time*.72)*.035;head.position.y=1.82+Math.sin(time*1.35)*.018;head.rotation.y=THREE.MathUtils.clamp((player.x-(BISTRO_ORIGIN.x+barman.position.x))*.12,-.32,.32);armLeft.rotation.x=Math.sin(time*1.4)*.045;armRight.rotation.x=busy?-.85*Math.sin(Math.min(1,(time-serveAt)/1.2)*Math.PI):Math.sin(time*.8)*.035;const served=time-serveAt;if(beerGlass.visible){if(served<.78){const t=THREE.MathUtils.smoothstep(served,0,.78);beerGlass.position.set(THREE.MathUtils.lerp(serveStartX+.43,serveEndX,t),1.22+Math.sin(t*Math.PI)*.14,THREE.MathUtils.lerp(-5.84,-4.46,t));beerGlass.rotation.z=Math.sin(t*Math.PI)*.12}else{beerGlass.position.set(serveEndX,1.22,-4.46);beerGlass.rotation.z=0}if(served>8)beerGlass.visible=false}}
 let lastScreen=-1;
 function update(time,player,high=true){const near=Math.hypot(player.x-BISTRO_ORIGIN.x,player.z-BISTRO_ORIGIN.z)<32;root.visible=near;lights.forEach((l,i)=>{l.visible=near&&(high||i===0);l.intensity=high?16:24});if(near)animateBarman(time,player);if(!near||Math.floor(time*5)===lastScreen)return;lastScreen=Math.floor(time*5);
  for(const a of animated){const c=a.canvas.getContext('2d');c.fillStyle='#020913';c.fillRect(0,0,256,256);if(a.id==='pacman'){c.strokeStyle='#205de3';c.lineWidth=4;for(let row=0;row<5;row++)for(let col=0;col<4;col++){c.strokeRect(12+col*62,30+row*41,42,23);c.fillStyle='#f0df9e';c.fillRect(61+col*62,39+row*41,3,3)}const px=30+(time*25)%195;c.fillStyle='#ffdc32';c.beginPath();c.moveTo(px,123);c.arc(px,123,12,.2+Math.sin(time*8)*.2,Math.PI*2-.2-Math.sin(time*8)*.2);c.fill();for(const [i,color]of ['#ff546a','#52d9dd','#f59fde'].entries()){c.fillStyle=color;c.fillRect(120+i*33,123+Math.sin(time*3+i)*4,17,18)}}else if(a.id==='tetris'){const colors=['#51d9ec','#9d67df','#e95d70','#edbf42','#76bf61'];for(let row=0;row<7;row++)for(let col=0;col<9;col++)if((col*3+row)%5<3){c.fillStyle=colors[(row+col)%5];c.fillRect(27+col*22,220-row*22,20,20)}c.fillStyle='#55dbe8';for(let i=0;i<4;i++)c.fillRect(72+i*22,30+(time*32)%75,20,20)}else if(a.id==='space-invaders'){for(let row=0;row<3;row++)for(let col=0;col<7;col++){c.fillStyle=['#ed5473','#5cdbeb','#91df77'][row];const x=28+col*30+Math.sin(time*2)*8;c.fillRect(x,54+row*32,20,14);c.fillRect(x+4,49+row*32,12,5)}c.fillStyle='#e8e8bb';c.fillRect(112+Math.sin(time*2.8)*72,216,30,15);c.fillStyle='#fa465d';c.fillRect(127,175+(time*48)%50,3,18)}else if(a.id==='stunt'){c.fillStyle='#172233';c.fillRect(0,0,256,256);c.fillStyle='#262d35';c.fillRect(0,156,256,100);c.fillStyle='#ffcb63';c.beginPath();c.moveTo(150,156);c.lineTo(218,114);c.lineTo(226,156);c.fill();c.fillStyle='#e53e53';c.fillRect(98+Math.sin(time*3)*22,132,48,22);c.fillStyle='#bfefff';c.fillRect(107+Math.sin(time*3)*22,137,12,6);c.strokeStyle='#39dff0';c.lineWidth=3;c.beginPath();c.moveTo(20,210);c.lineTo(80,210);c.stroke()}else{const icons=['◉','▥','▰','⊞','▧','▣','●','◌','▦','✦'];c.textAlign='center';c.font='bold 32px monospace';icons.forEach((icon,i)=>{c.fillStyle=['#53e8e8','#63a5ff','#ffb65c','#8fe184','#ffc969','#f36ad7','#e5c26d','#56d4ce','#f49bcb','#ff765e'][i];c.fillText(icon,40+(i%5)*44,88+Math.floor(i/5)*72)})}c.fillStyle='#f0e7c7';c.font='bold 12px monospace';c.fillText(a.id==='arcade-hub'?'10 JEUX FLAG':'FLAG 1988  HIGH SCORE',10,17);a.texture.needsUpdate=true}
 }
 return{root,update,isInside:isInsideBistro,nearBarman,serveBeer,inspect:()=>({name:'BISTRO FLAG 1988',counter:true,backbar:true,stools:5,booths:2,cabinets:animated.map(a=>a.id),bartender:{name:'Marcel',moving:true,orders:beerOrders,glassVisible:beerGlass.visible},colliders:BISTRO_COLLIDERS.length,batches:batches.size,staticParts:[...batches.values()].reduce((n,b)=>n+b.matrices.length,0),floorY:8}),dispose:()=>{scene.remove(root);root.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(!Array.isArray(o.material))o.material.dispose()}});badgeTexture.dispose();for(const a of animated)a.texture.dispose()}};
}
