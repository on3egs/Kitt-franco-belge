const assert=require('node:assert/strict');
const THREE=require('three');

(async()=>{
  const {createFirstPersonArms}=await import('./game/first-person-arms.mjs');
  const camera=new THREE.PerspectiveCamera(72,16/9,.08,500);
  const arms=createFirstPersonArms(camera);
  assert.equal(arms.group.parent,camera,'Le modèle doit suivre la caméra.');
  let state=arms.inspect();
  assert.equal(state.visible,true);
  assert.equal(state.rightVisible,true,'Le bras principal apparaît au repos.');
  assert.equal(state.leftVisible,false,'Le second bras reste discret au repos.');

  arms.setItem('rouge');
  arms.update({moving:.8,sprinting:true},1/30);
  state=arms.inspect();
  assert.equal(state.itemId,'rouge');
  assert.equal(state.leftVisible,true,'Les deux mains sortent pendant le sprint.');

  arms.trigger('place');
  arms.update({},1/60);
  state=arms.inspect();
  assert.equal(state.action,'place');
  assert.equal(state.leftVisible,true,'La seconde main accompagne la pose d’un bloc.');

  arms.setWeapon('scanner');
  arms.update({},1/60);
  state=arms.inspect();
  assert.equal(state.weaponId,'scanner');
  assert.equal(state.weaponStyle,'scanner');

  arms.setWeapon('Matraque néon');
  arms.update({},1/60);
  assert.equal(arms.inspect().weaponStyle,'matraque','La matraque possède sa propre silhouette tenue.');

  arms.trigger('attack');
  arms.update({},1/60);
  assert.equal(arms.inspect().leftVisible,true,'L’attaque anime les deux bras.');
  arms.update({inVehicle:true},1/60);
  assert.equal(arms.inspect().visible,false,'Les mains se cachent pendant la conduite.');
  arms.update({visible:false},1/60);
  assert.equal(arms.inspect().visible,false,'Les mains se cachent quand le HUD/jeu est fermé.');

  arms.dispose();
  assert.equal(camera.children.includes(arms.group),false,'dispose détache et libère le modèle.');
  console.log('OK bras subjectifs : caméra, bloc tenu, sprint, pose, attaque, conduite et nettoyage.');
})().catch(error=>{console.error(error);process.exitCode=1});
