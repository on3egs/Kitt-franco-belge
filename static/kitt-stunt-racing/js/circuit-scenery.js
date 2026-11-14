/* Décor des stands : uniquement visuel, aucune collision ni force physique. */
function addCircuitScenery(level, offsetX) {
    const group = new THREE.Group();
    group.userData.hideInEditor = true;
    const dummy = new THREE.Object3D();
    const structure = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({color:0x263340, roughness:.76, metalness:.32}), 15);
    const beams = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({color:level % 2 ? 0xf32d3c : 0x34b9e8}), 12);
    let count = 0, lights = 0;
    function place(mesh, index, x, y, z, w, h, d) {
        dummy.position.set(offsetX+x, y, z); dummy.scale.set(w,h,d);
        dummy.rotation.set(0,0,0); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
    }
    // Garage, verrière et toit, construits à l'extérieur de la chaussée.
    [[-22,1.5,25,13,3,24],[-22,4.5,25,13,.35,24],[-28.6,3,25,.3,3,24],
     [-15.4,3,25,.3,3,24],[-22,3,13,.3,3,13],[-22,3,37,.3,3,13],
     [21,.15,26,12,.3,26],[25,1,26,1,2,26],[25,2,26,1,2,22],
     [25,3,26,1,2,18],[25,4,26,1,2,14],[25,5,26,1,2,10],
     [14.6,2.6,15,.3,5.2,.3],[14.6,2.6,37,.3,5.2,.3],
     [14.6,5.2,26,.3,.3,22]].forEach(spec=>place(structure,count++,...spec));
    [[-15.2,4.7,25,.18,.18,24],[-28.8,4.7,25,.18,.18,24],
     [-22,4.7,12.8,13,.18,.18],[-22,4.7,37.2,13,.18,.18],
     [14.4,.65,26,.16,.13,22],[14.4,5.3,26,.16,.16,22],
     [24,1.1,26,.15,.12,26],[24,2.1,26,.15,.12,22],
     [24,3.1,26,.15,.12,18],[24,4.1,26,.15,.12,14],
     [24,5.1,26,.15,.12,10],[14.4,2.8,26,.16,.1,22]].forEach(spec=>place(beams,lights++,...spec));
    structure.instanceMatrix.needsUpdate = true; beams.instanceMatrix.needsUpdate = true;
    structure.frustumCulled = false; beams.frustumCulled = false;
    group.add(structure,beams);
    // Enseigne calculée une fois au chargement du niveau, sans image distante.
    const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=128;
    const c=canvas.getContext('2d');
    c.fillStyle='#070c15';c.fillRect(0,0,512,128);
    c.strokeStyle=level%2?'#e52b3d':'#41d7ff';c.lineWidth=5;c.strokeRect(4,4,504,120);
    c.fillStyle='#f8e6c5';c.textAlign='center';c.font='bold 46px sans-serif';c.fillText('KYRONEXT',256,55);
    c.fillStyle='#f46c5e';c.font='bold 21px monospace';c.fillText('STUNT RACING  //  CIRCUIT '+String(level).padStart(2,'0'),256,94);
    const tex=new THREE.CanvasTexture(canvas); tex.encoding=THREE.sRGBEncoding;
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(12,3),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
    sign.position.set(offsetX-22,6.5,12.7);group.add(sign);
    const pylon=new THREE.Mesh(new THREE.BoxGeometry(1.5,7,1.5),new THREE.MeshStandardMaterial({color:0x28313c,metalness:.3,roughness:.7}));
    pylon.position.set(offsetX+16,3.5,10);group.add(pylon);
    const panel=new THREE.Mesh(new THREE.PlaneGeometry(7,1.75),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
    panel.position.set(offsetX+16,7,10);group.add(panel);
    currentLevelGroup.add(group);
}
