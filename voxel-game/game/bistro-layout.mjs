// Implantation partagée par le décor et les collisions, à hauteur de joueur.
export const BISTRO_ORIGIN={x:-16.5,y:8,z:-13.5};
export const BISTRO_SPAWN={x:-17.5,y:8,z:-8,yaw:-Math.PI/2,pitch:-.04};
// Quatre bornes classiques longent le mur ouest, rapprochées de l'allée pour
// rester visibles. Le kiosque multijeux est juste devant le point d'accueil.
export const BISTRO_ARCADES=[
 // PAC-MAN avance dans l'allée pour dégager les étagères du fond du bar.
 {id:'pacman',name:'PAC-MAN',x:-22.1,z:-18.7},
 {id:'tetris',name:'TETRIS',x:-22.1,z:-16.5},
 {id:'space-invaders',name:'SPACE INVADERS',x:-22.1,z:-13},
 {id:'stunt',name:'STUNT',x:-22.1,z:-10.5},
 {id:'arcade-hub',name:'10 JEUX',x:-14.5,z:-8,front:'west'}
];
const local=[
 ['comptoir',1,-4.8,10,.95,1.2],['retour',-3.65,-3.8,.8,2.8,1.2],
 ['arrière-bar',.4,-7.12,12.5,.65,3.6],
 ...[-2.5,-.7,1.1,2.9,4.7].map(x=>['tabouret',x,-3.15,.55,.55,.91]),
 ...[.3,4.5].flatMap(z=>[['table',5,z,2.3,1.1,.84],['banquette',5,z-1.05,3.5,.7,1.25],['banquette',5,z+1.05,3.5,.7,1.25]]),
 ['table',-4.8,4.5,1.65,1.25,.84],
 ...[-1,1].map(s=>['chaise',-4.8+s*1.15,4.5,.55,.6,1]),
 ['juke-box',-6.5,1.8,1.05,.85,1.85],
 ...BISTRO_ARCADES.map(a=>['borne',a.x-BISTRO_ORIGIN.x,a.z-BISTRO_ORIGIN.z,1.12,1.15,1.9])
];
export const BISTRO_COLLIDERS=local.map(([id,x,z,w,d,h])=>({id,x:x+BISTRO_ORIGIN.x,z:z+BISTRO_ORIGIN.z,y:8,w,d,h}));
export function isInsideBistro(x,z){return x>-24&&x<-9&&z>-21&&z<-6}
export function bistroCollision(x,y,z,w=.28,h=1.72){
 if(x<-26||x>-7||z<-24||z>-4)return false;
 return BISTRO_COLLIDERS.some(b=>x+w>b.x-b.w/2&&x-w<b.x+b.w/2&&z+w>b.z-b.d/2&&z-w<b.z+b.d/2&&y+.015<b.y+b.h&&y+h-.01>b.y);
}
