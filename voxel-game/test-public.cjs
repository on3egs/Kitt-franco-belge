// Contrôle après publication : aucune modification du monde, aucun PIN affiché.
require('dotenv/config');
const {io}=require('socket.io-client'),assert=require('node:assert/strict');
const base=new URL(process.env.PUBLIC_URL||'https://kitt.kitt-franco-belge.be/static/games/kitt-blocks/');
const sockets=[],room='VERIFY-'+Date.now().toString(36).toUpperCase();
function once(s,name){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Délai '+name)),15000);s.once(name,r=>{clearTimeout(t);resolve(r)})})}
async function connect(){const s=io(base.origin,{path:base.pathname+'socket.io',reconnection:false,timeout:15000});sockets.push(s);await once(s,'connect');return s}
const ack=(s,event,p)=>s.timeout(15000).emitWithAck(event,p);
(async()=>{try{
 const health=await (await fetch(new URL('api/health',base))).json();assert.equal(health.ok,true);assert.equal(health.capacity,16);
 for(const file of ['.env','server.js'])assert.equal((await fetch(new URL(file,base))).status,404);
 const a=await connect(),b=await connect();assert.equal((await ack(a,'room:join',{room,name:'Contrôle réseau A'})).ok,true);assert.equal((await ack(b,'room:join',{room,name:'Contrôle réseau B'})).players.length,2);
 const state=once(b,'player:state');a.emit('player:state',{x:1,y:8,z:12,yaw:1,driving:false});assert.equal((await state).x,1);
 const oldId=b.id,left=once(a,'player:left');b.disconnect();assert.equal(await left,oldId);
 if(process.env.ADMIN_PIN_LILOU){const auth=await connect();assert.equal((await ack(auth,'profile:login',{name:'LILOU',pin:process.env.ADMIN_PIN_LILOU})).ok,true);console.log('OK public : profil privé vérifié sans afficher son PIN.');}
 console.log('OK public : page, API, fichiers privés bloqués, deux clients, positions et départ.');
}finally{for(const s of sockets)s.disconnect()}})().catch(e=>{console.error(e.message);process.exitCode=1});
