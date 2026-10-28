// Service autonome : seuls les fichiers du jeu sont servis publiquement.
require('dotenv').config();
const express=require('express'),http=require('node:http'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {Server}=require('socket.io');
async function createGameServer(options={}){
  const {BLOCKS,HEIGHT,key,generatedBlock}=await import('./game/world.mjs');
  const base=(options.basePath??process.env.BASE_PATH??'').replace(/\/$/,''),bind=options.bind??process.env.BIND??'127.0.0.1',port=options.port??Number(process.env.PORT||8080);
  const dataDir=options.dataDir||process.env.DATA_DIR||path.join(__dirname,'data','rooms');fs.mkdirSync(dataDir,{recursive:true});
  const pins=options.pins||{LILOU:process.env.ADMIN_PIN_LILOU,ALEXIA:process.env.ADMIN_PIN_ALEXIA};
  const app=express(),server=http.createServer(app),router=express.Router(),rooms=new Map(),tokens=new Map(),attempts=new Map();
  const allowed=(process.env.PUBLIC_ORIGIN||'').split(',').filter(Boolean);
  const io=new Server(server,{path:`${base}/socket.io`,maxHttpBufferSize:64*1024,allowRequest:(req,done)=>{const origin=req.headers.origin;let ok=!origin;try{ok=ok||new URL(origin).host===req.headers.host||allowed.includes(origin)}catch{}done(null,ok)},cors:{origin:true,methods:['GET','POST']}});
  const roomId=raw=>String(raw||'FLAG-PUBLIC').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,24)||'FLAG-PUBLIC';
  const validBlock=b=>b&&Number.isInteger(b.x)&&Number.isInteger(b.y)&&Number.isInteger(b.z)&&Math.abs(b.x)<=4096&&Math.abs(b.z)<=4096&&b.y>=0&&b.y<HEIGHT&&(b.type==='air'||Object.hasOwn(BLOCKS,b.type));
  function getRoom(id){if(rooms.has(id))return rooms.get(id);if(rooms.size>=32)return null;const r={id,players:new Map(),blocks:new Map(),dirty:false};try{const rows=JSON.parse(fs.readFileSync(path.join(dataDir,id+'.json'),'utf8'));for(const [k,t]of rows){const [x,y,z]=k.split(',').map(Number);if(validBlock({x,y,z,type:t}))r.blocks.set(k,t)}}catch{}rooms.set(id,r);return r}
  function list(){return [...rooms.values()].filter(r=>!r.id.startsWith('PRIVE-')).map(r=>({id:r.id,players:r.players.size,capacity:16}))}
  function broadcastList(){io.emit('room:list',list())}
  function flush(){for(const r of rooms.values())if(r.dirty){const file=path.join(dataDir,r.id+'.json');fs.writeFileSync(file+'.tmp',JSON.stringify([...r.blocks]));fs.renameSync(file+'.tmp',file);r.dirty=false}}
  getRoom('FLAG-PUBLIC');
  router.get('/api/health',(_q,res)=>res.json({ok:true,rooms:rooms.size,capacity:16,seed:'FLAG-1982'}));
  router.use('/game',express.static(path.join(__dirname,'game'),{dotfiles:'deny',index:false}));
  router.use('/vendor/three/build',express.static(path.join(__dirname,'node_modules/three/build'),{index:false}));
  router.use('/vendor/three/examples/jsm',express.static(path.join(__dirname,'node_modules/three/examples/jsm'),{index:false}));
  router.get('/block-mode.html',(_q,res)=>res.sendFile(path.join(__dirname,'block-mode.html')));
  const hostPage=fs.existsSync(path.join(__dirname,'index.html'))?'index.html':'game/catalog.html';
  router.get('/',(_q,res)=>res.sendFile(path.join(__dirname,base?'block-mode.html':hostPage)));
  for(const f of ['Mentions.txt','License.txt','tunnel.json'])router.get('/'+f,(_q,res)=>res.sendFile(path.join(__dirname,f)));
  app.disable('x-powered-by');app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');if(base&&req.path===base)return res.redirect(308,base+'/');next()});app.use(base||'/',router);app.use((_q,res)=>res.status(404).send('Page introuvable'));
  const reply=(fn,value)=>{if(typeof fn==='function')fn(value)};
  function leave(s){const r=rooms.get(s.data.room);if(r){r.players.delete(s.id);s.to(r.id).emit('player:left',s.id);s.leave(r.id);if(!r.players.size&&!r.blocks.size&&r.id!=='FLAG-PUBLIC')rooms.delete(r.id)}s.data.room=null;broadcastList()}
  io.on('connection',s=>{
    const limits=new Map();function limited(action,max){const now=Date.now(),b=limits.get(action);if(!b||now-b.time>1000){limits.set(action,{time:now,n:1});return false}return ++b.n>max}
    s.on('room:list',()=>{if(!limited('list',4))s.emit('room:list',list())});
    s.on('profile:login',(raw,done)=>{
      const p=raw&&typeof raw==='object'?raw:{},id=s.handshake.address,now=Date.now();let tries=attempts.get(id);if(!tries||now-tries.time>60000){tries={time:now,n:0};attempts.set(id,tries)}
      if(++tries.n>8)return reply(done,{ok:false,error:'Trop de tentatives. Réessayez dans une minute.'});
      const name=String(p.name||'').toUpperCase(),expected=pins[name],input=Buffer.from(String(p.pin||''));
      if(!['LILOU','ALEXIA'].includes(name)||!expected||expected.startsWith('REMPLACER_')||input.length!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(input,Buffer.from(expected)))return reply(done,{ok:false,error:'PIN incorrect ou profil non configuré.'});
      s.data.profile=name;const token=crypto.randomBytes(32).toString('hex');tokens.set(token,{profile:name,expires:now+3600000});reply(done,{ok:true,profile:name,token});
    });
    s.on('profile:resume',(p,done)=>{const session=tokens.get(p?.token);if(!session||session.expires<Date.now())return reply(done,{ok:false});s.data.profile=session.profile;reply(done,{ok:true,profile:session.profile})});
    s.on('profile:logout',()=>{s.data.profile=null;const p=rooms.get(s.data.room)?.players.get(s.id);if(p){p.profile='MICHAEL';p.fly=false;s.to(s.data.room).emit('player:state',p)}});
    s.on('room:join',(p,done)=>{
      if(limited('join',3))return reply(done,{ok:false,error:'Veuillez patienter avant de changer de salle.'});
      const id=roomId(p?.room),r=getRoom(id);if(!r)return reply(done,{ok:false,error:'Le serveur a atteint sa limite de salles.'});if(r.players.size>=16&&!r.players.has(s.id))return reply(done,{ok:false,error:'Salle complète : 16/16 joueurs.'});
      leave(s);rooms.set(id,r);s.join(id);s.data.room=id;
      const anonymous=!s.data.profile&&p?.anonymous===true;
      const name=s.data.profile?{LILOU:'Lilou',ALEXIA:'Alexia'}[s.data.profile]:anonymous?'':String(p?.name||'Pilote').replace(/[\u0000-\u001f<>]/g,'').slice(0,20)||'Pilote';
      const freeProfiles=['ANONYMOUS','PILOT_FEMME','PILOT_MASC'],profile=s.data.profile||(!anonymous?'MICHAEL':freeProfiles.includes(p?.profile)?p.profile:'ANONYMOUS');
      const slot=r.players.size,player={id:s.id,name,profile,anonymous,x:slot%2===0?-1:1,y:8,z:12+Math.floor(slot/2)*2,yaw:0,driving:false,fly:false};r.players.set(s.id,player);s.data.lastState=Date.now();reply(done,{ok:true,room:id,players:[...r.players.values()],blocks:[...r.blocks]});s.to(id).emit('player:joined',player);broadcastList();
    });
    s.on('room:leave',()=>leave(s));
    s.on('player:state',state=>{
      const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!p||limited('state',25)||!state||!['x','y','z','yaw'].every(k=>Number.isFinite(state[k])))return;
      if(Math.abs(state.x)>4096||Math.abs(state.z)>4096||state.y< -15||state.y>HEIGHT+120)return;
      const now=Date.now(),dt=Math.max(.05,(now-s.data.lastState)/1000),distance=Math.hypot(state.x-p.x,state.y-p.y,state.z-p.z);if(!s.data.profile&&distance>4+dt*35)return;
      Object.assign(p,{x:state.x,y:state.y,z:state.z,yaw:state.yaw,driving:!!state.driving});s.data.lastState=now;s.to(r.id).volatile.emit('player:state',p);
    });
    s.on('world:block',(b,done)=>{
      const r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!p)return reply(done,{ok:false,error:'Rejoignez une salle.'});if(limited('blocks',12))return reply(done,{ok:false,error:'Construction trop rapide.'});if(!validBlock(b))return reply(done,{ok:false,error:'Bloc invalide.'});
      if(Math.hypot(b.x+.5-p.x,b.y+.5-(p.y+1.3),b.z+.5-p.z)>8)return reply(done,{ok:false,error:'Ce bloc est trop loin.'});
      if(r.blocks.size>=50000&&!r.blocks.has(key(b.x,b.y,b.z)))return reply(done,{ok:false,error:'Limite de construction atteinte.'});
      const block={x:b.x,y:b.y,z:b.z,type:b.type};r.blocks.set(key(b.x,b.y,b.z),b.type);r.dirty=true;io.to(r.id).emit('world:block',block);reply(done,{ok:true,block});
    });
    s.on('admin:tool',(p,done)=>{const r=rooms.get(s.data.room),player=r?.players.get(s.id);if(!s.data.profile||!player)return reply(done,{ok:false,error:'Profil privé requis.'});if(p?.action==='fly'){player.fly=!player.fly;reply(done,{ok:true,enabled:player.fly})}else if(p?.action==='teleport'){Object.assign(player,{x:0,y:8,z:12});io.to(r.id).emit('player:state',player);reply(done,{ok:true,position:{x:0,y:8,z:12,vy:0}})}else reply(done,{ok:false,error:'Outil inconnu.'})});
    s.on('disconnect',()=>leave(s));
  });
  const timer=setInterval(()=>{flush();for(const [t,v]of tokens)if(v.expires<Date.now())tokens.delete(t);for(const [ip,v]of attempts)if(Date.now()-v.time>60000)attempts.delete(ip)},1000);timer.unref();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,bind,resolve)});
  return {server,io,port:server.address().port,base,close:async()=>{clearInterval(timer);flush();await new Promise(resolve=>io.close(resolve))}};
}
module.exports={createGameServer};
if(require.main===module)createGameServer().then(service=>{console.log(`KITT Bloc : port ${service.port}, chemin ${service.base||'/'}`);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>service.close().then(()=>process.exit(0)))}).catch(e=>{console.error(e.message);process.exit(1)});
