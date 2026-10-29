const assert=require('node:assert/strict');
(async()=>{
 const {PatrolCampaign,GARAGE,contracts,EQUIPMENT}=await import('./game/patrol.mjs');
 const {blueprintFor,blueprintProgress}=await import('./game/construction.mjs');
 const {heightAt}=await import('./game/world.mjs');
 function frozenReturn(campaign){const before=campaign.active.elapsed;for(let i=0;i<100;i++)campaign.tick(.1,{x:0,z:0,driving:false,speed:0});assert.equal(campaign.active.elapsed,before);assert.equal(campaign.interact({...GARAGE,driving:true}),false)}
 const p=new PatrolCampaign(),car={x:6,z:-46},at={...car,car,kittVisible:true,driving:true,speed:0};
 assert.equal(contracts().length,12);
 assert.equal(p.accept('rescue-nevada').ok,false);
 assert.equal(p.accept('rescue-flag').ok,true);
 assert.equal(p.accept('trial-flag').ok,false);
 p.tick(.1,at);assert.equal(p.active.stage,'work');
 assert.equal(p.interact(at),false,'E doit laisser sortir de KITT');
 p.interact({...at,driving:false});
 for(let i=0;i<45;i++)p.tick(.1,{...at,driving:false});
 assert.equal(p.active.stage,'return');assert.equal(p.state.credits,0);frozenReturn(p);
 p.interact({...GARAGE,driving:false});assert.equal(p.state.credits,80);
 p.interact({...GARAGE,driving:false});assert.equal(p.state.credits,80);assert.equal(p.state.completed,1);

 let reloaded=new PatrolCampaign(p.snapshot());
 assert.equal(reloaded.state.xp,65);assert.equal(reloaded.state.credits,80);
 assert.equal(reloaded.purchase('scanner').ok,false);
 assert.equal(reloaded.accept('signal-flag').ok,true);
 const site=reloaded.site(),scanner={...site,car:site,kittVisible:true,driving:false,speed:0};
 assert.equal(reloaded.scan({...scanner,kittVisible:false}).ok,false);
 assert.equal(reloaded.scan(scanner).found,3);assert.equal(reloaded.energy,75);
 assert.equal(reloaded.scan(scanner).ok,false);
 reloaded=new PatrolCampaign(reloaded.snapshot());assert.equal(reloaded.active.revealed.length,3);
 for(const clue of reloaded.clues())reloaded.interact({...scanner,...clue});
 assert.equal(reloaded.active.stage,'return');frozenReturn(reloaded);
 reloaded.interact({...GARAGE,driving:false});assert.equal(reloaded.state.xp,140);
 assert.equal(reloaded.accept('rescue-nevada').ok,true);reloaded.cancel();assert.equal(reloaded.state.credits,180);

 assert.equal(reloaded.accept('trial-flag').ok,true);
 for(let i=0;i<5;i++){
  const gate=reloaded.target();reloaded.tick(.04,{...gate,driving:false,speed:3});assert.equal(reloaded.active.index,i);
  if(i===2){reloaded.tick(.04,{...gate,driving:true,speed:3,airborne:false});assert.equal(reloaded.active.index,2,'La troisième balise exige le Turbo');}
  reloaded.tick(.04,{...gate,driving:true,speed:3,airborne:i===2});
 }
 assert.equal(reloaded.active.stage,'return');frozenReturn(reloaded);
 reloaded.interact({...GARAGE,driving:false});assert.equal(reloaded.state.completed,3);assert.ok(reloaded.state.credits>280);
 const expired=new PatrolCampaign();expired.accept('trial-flag');
 for(let i=0;i<1202;i++)expired.tick(.1,{x:100,z:100,driving:false,speed:0});
 assert.equal(expired.active,null);assert.equal(expired.state.credits,0);

 const equipment=new PatrolCampaign({credits:2000});
 for(const item of EQUIPMENT){for(let i=0;i<3;i++)assert.equal(equipment.purchase(item.id).ok,true);assert.equal(equipment.purchase(item.id).ok,false);assert.equal(equipment.state.upgrades[item.id],3)}
 assert.equal(equipment.state.credits,200);assert.equal(new PatrolCampaign(equipment.snapshot()).state.upgrades.scanner,3);
 const enhanced=equipment.scan({...scanner});assert.equal(enhanced.radius,62);assert.equal(equipment.scanCooldown,2);

 const build=new PatrolCampaign(),blocks=new Map(),get=(x,y,z)=>blocks.get(`${x},${y},${z}`)||null;
 assert.equal(build.accept('build-flag').ok,true);const cells=blueprintFor('flag');assert.equal(cells.length,62);
 for(const b of cells.slice(0,-1))blocks.set(`${b.x},${b.y},${b.z}`,b.type);
 assert.equal(build.validateBuild(blueprintProgress('flag',get)),false);
 const last=cells.at(-1);blocks.set(`${last.x},${last.y},${last.z}`,last.type);
 assert.equal(build.validateBuild(blueprintProgress('flag',get)),true);
 build.interact({...GARAGE,driving:false});assert.equal(build.state.credits,140);
 assert.equal(build.accept('build-flag').ok,false);
 for(let x=-24;x<=24;x++)for(const sign of [-1,1])assert.ok(Math.abs(heightAt(x,sign*24)-heightAt(x,sign*25))<=1,'Le bord du poste doit rester franchissable');
 console.log('OK contrats : dépannage, scanner, vrai Turbo, chrono/prime figés au retour, paiement unique, garage, sauvegarde et plan de 62 blocs.');
})().catch(e=>{console.error(e);process.exitCode=1});
