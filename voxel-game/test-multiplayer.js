// Test d'intégration réel : deux clients, capacité 16, validation et reprise du monde.
const {io}=require('socket.io-client'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {createGameServer}=require('./server');
const event=(s,name)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('Événement manquant : '+name)),5000);s.once(name,v=>{clearTimeout(t);resolve(v)})});
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'kitt-network-')),pin=crypto.randomBytes(10).toString('hex'),clients=[];let service;
 const start=async()=>service=await createGameServer({port:0,dataDir:data,pins:{LILOU:pin,ALEXIA:pin}});
 const connect=async()=>{const s=io(`http://127.0.0.1:${service.port}`,{reconnection:false});clients.push(s);await event(s,'connect');return s};
 const ack=(s,name,p)=>s.timeout(5000).emitWithAck(name,p);
 try{
  await start();const url=`http://127.0.0.1:${service.port}`;for(const file of ['.env','server.js','package.json','test-multiplayer.js'])assert.equal((await fetch(url+'/'+file)).status,404,'Fichier privé servi : '+file);assert.equal((await fetch(url+'/block-mode.html')).status,200);
  const a=await connect(),b=await connect();assert.equal((await ack(a,'profile:login',{name:'LILOU',pin:'incorrect'})).ok,false);const auth=await ack(a,'profile:login',{name:'LILOU',pin});assert.equal(auth.ok,true);
  assert.equal((await ack(a,'room:join',{room:'TEST',name:'Lilou'})).ok,true);assert.equal((await ack(b,'room:join',{room:'TEST',name:'Alex'})).players.length,2);
  const moved=event(b,'player:state');a.emit('player:state',{x:1,y:8,z:12,yaw:.4,id:'spoof',profile:'ALEXIA',driving:false});const position=await moved;assert.equal(position.id,a.id);assert.equal(position.profile,'LILOU');assert.equal(position.x,1);
  const blockEvent=event(b,'world:block');assert.equal((await ack(a,'world:block',{x:1,y:8,z:10,type:'metal'})).ok,true);assert.equal((await blockEvent).type,'metal');
  assert.equal((await ack(a,'world:block',{x:1,y:8,z:10,type:'unknown'})).ok,false);assert.equal((await ack(a,'world:block',{x:150,y:8,z:10,type:'metal'})).ok,false);assert.equal((await ack(b,'admin:tool',{action:'fly'})).ok,false);assert.equal((await ack(a,'admin:tool',{action:'fly'})).enabled,true);
  for(let i=2;i<16;i++){const s=await connect();const r=await ack(s,'room:join',{room:'TEST',name:'Pilote'+i});assert.equal(r.ok,true);assert.ok(r.blocks.some(([k,t])=>k==='1,8,10'&&t==='metal'))}
  const extra=await connect();assert.equal((await ack(extra,'room:join',{room:'TEST'})).ok,false,'Le 17e joueur doit être refusé');
  const oldId=b.id,departed=event(a,'player:left');b.disconnect();assert.equal(await departed,oldId);
  const isolated=await ack(extra,'room:join',{room:'ISOLATED',name:'Seul'});assert.equal(isolated.ok,true);assert.equal(isolated.blocks.length,0);
  for(const c of clients)c.disconnect();await service.close();service=null;await start();const resumed=await connect();const snapshot=await ack(resumed,'room:join',{room:'TEST'});assert.ok(snapshot.blocks.some(([k,t])=>k==='1,8,10'&&t==='metal'),'Les blocs doivent survivre au redémarrage');
 }finally{for(const c of clients)c.disconnect();if(service)await service.close();if(path.resolve(data).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(data,{recursive:true,force:true})}
 console.log('OK réseau : HTTP privé, PIN, deux clients, positions, blocs, validation, admin et 16 places.');
})().catch(e=>{console.error(e);process.exitCode=1});
