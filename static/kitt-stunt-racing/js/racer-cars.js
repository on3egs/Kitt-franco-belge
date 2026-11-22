/* Trans Am de Legacy Transmission, adaptées au châssis et aux roues Cannon du jeu. */
window.RacerCars = (() => {
    const T = window.THREE;
    if (!T) return null;
    const isBox = (mesh, w, h, d) => mesh.geometry?.type === 'BoxGeometry' &&
        Math.abs(mesh.geometry.parameters.width-w)<.001 && Math.abs(mesh.geometry.parameters.height-h)<.001 && Math.abs(mesh.geometry.parameters.depth-d)<.001;

    // Un lot par matériau pour les détails fixes ; roues, LED et dégâts restent animables.
    function compact(group, excluded = new Set()) {
        group.updateMatrixWorld(true);
        const inverse = group.matrixWorld.clone().invert(), batches = new Map(), originals = [];
        function collect(node) {
            if (excluded.has(node)) return;
            if (node.isMesh && !Array.isArray(node.material)) {
                const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
                geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,node.matrixWorld));
                if (!geometry.attributes.normal) geometry.computeVertexNormals();
                if (!geometry.attributes.uv) geometry.setAttribute('uv',new T.BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
                if (!batches.has(node.material)) batches.set(node.material,[]);
                batches.get(node.material).push(geometry);
                originals.push(node);
            } else for (const child of [...node.children]) collect(child);
        }
        for (const child of [...group.children]) collect(child);
        for (const mesh of originals) mesh.parent.remove(mesh);
        for (const [material, geometries] of batches) {
            const merged = new T.BufferGeometry();
            for (const [name,size] of [['position',3],['normal',3],['uv',2]]) {
                const data=new Float32Array(geometries.reduce((n,g)=>n+g.attributes[name].array.length,0));
                let offset=0;for(const g of geometries){data.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length}
                merged.setAttribute(name,new T.BufferAttribute(data,size));
            }
            merged.computeBoundingSphere();
            const mesh=new T.Mesh(merged,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
            for(const g of geometries)g.dispose();
        }
    }

    function build(karr, env) {
        const model=LegacyModels.car(karr,env), data=model.userData;
        const body=model.children.find(mesh=>mesh.geometry?.type==='ExtrudeGeometry');
        const mirrors=model.children.filter(mesh=>isBox(mesh,.17,.09,.19)).sort((a,b)=>b.position.x-a.position.x);
        const front=model.children.find(mesh=>isBox(mesh,1.73,.035,.16));
        const rear=model.children.find(mesh=>isBox(mesh,1.80,.06,.25));
        const tails=model.children.filter(mesh=>isBox(mesh,.52,.055,.04));
        data.paint=body.material;
        if(karr){
            data.twoTone={value:1};
            const original=data.paint.onBeforeCompile;
            data.paint.onBeforeCompile=shader=>{
                original(shader);shader.uniforms.legacyTwoTone=data.twoTone;
                shader.fragmentShader='uniform float legacyTwoTone;\n'+shader.fragmentShader.replace('bodyHeight<0.58 ?', 'legacyTwoTone>0.5 && bodyHeight<0.58 ?');
            };
            data.paint.customProgramCacheKey=()=> 'legacy-karr-two-tone';
        }
        data.parts={mirrorLeft:mirrors[0],mirrorRight:mirrors[1],frontBumper:front,rearBumper:rear};
        data.tails=tails;
        const dynamic=new Set([...data.wheels,...data.leds,...tails,...Object.values(data.parts)]);
        compact(model,dynamic);
        for(const wheel of data.wheels)compact(wheel);
        model.rotation.y=Math.PI;model.position.y=-.66;model.scale.set(1.06,1,.94);
        model.name=karr?'LEGACY_KARR':'LEGACY_KITT';
        return model;
    }

    function installPlayer(owner, wheels, env, originalRuntime, vehicle) {
        const originals=[...owner.children], wheelOriginals=wheels.map(w=>[...w.children]);
        const models=[build(false,env),build(true,env)], damage=[];
        for(const model of models){
            owner.add(model);owner.updateMatrixWorld(true);
            const records={};
            for(const [name,mesh] of Object.entries(model.userData.parts)){
                owner.attach(mesh);
                records[name]={mesh,position:mesh.position.clone(),quaternion:mesh.quaternion.clone(),scale:mesh.scale.clone(),detached:false};
                mesh.visible=false;
            }
            damage.push(records);
            model.visible=false;
        }
        const newWheels=models[0].userData.wheels;
        for(const model of models)for(const wheel of model.userData.wheels)wheel.parent.remove(wheel);
        newWheels.forEach((wheel,i)=>{
            const axleIndex=i===0?1:i===1?3:i===2?0:2;
            wheel.position.set(0,0,0);wheel.rotation.set(0,0,-Math.PI/2);wheel.rotateY(Math.PI);wheel.visible=false;
            wheels[axleIndex].add(wheel);
        });
        const scanner=new T.Object3D();scanner.material=new T.MeshBasicMaterial({color:0xff202f});
        const light=new T.PointLight(0xff202f,.9,10);light.position.set(0,-.08,2.5);owner.add(light);
        const state={models,originalRuntime,active:null,damage};
        state.restore=()=>{
            for(const info of vehicle.wheelInfos)info.radius=.5;
            originals.forEach(child=>{child.visible=true});
            models.forEach(model=>{model.visible=false});
            damage.forEach(parts=>Object.values(parts).forEach(p=>p.mesh.visible=false));
            wheelOriginals.forEach(children=>children.forEach(child=>child.visible=true));
            newWheels.forEach(w=>w.visible=false);light.visible=false;state.active=null;owner.userData.legacyActive=false;
            return originalRuntime;
        };
        state.use=profile=>{
            if(!['manix','kitt','karr-black','karr-cedric'].includes(profile.carClass))return null;
            const karr=profile.carClass.startsWith('karr'), index=karr?1:0, model=models[index];
            for(const info of vehicle.wheelInfos){info.radius=.4;info.suspensionLength=info.suspensionRestLength;}
            if(karr)model.userData.twoTone.value=profile.carClass==='karr-cedric'||profile.id==='virginie'?1:0;
            originals.forEach(child=>{child.visible=child.isSpotLight||child.type==='Object3D'});
            owner.userData.driverParts.variantGroup.visible=false;
            wheelOriginals.forEach(children=>children.forEach(child=>child.visible=false));
            newWheels.forEach(w=>w.visible=true);model.visible=true;state.active=model;owner.userData.legacyActive=true;
            Object.values(damage[index]).forEach(p=>p.mesh.visible=!p.detached);
            light.visible=true;light.color.setHex(karr?0xffa40c:0xff202f);
            return {scannerMesh:scanner,scannerLight:light,scannerGlowSprite:null,tailLeftMat:model.userData.tails[0].material,tailRightMat:model.userData.tails[1].material,carDamageParts:damage[index]};
        };
        state.animate=t=>{
            if(!state.active)return;
            const {leds,glow,karr}=state.active.userData,center=(Math.sin(t*5.4)*.5+.5)*8;
            leds.forEach((led,i)=>{const v=Math.max(.04,1-Math.abs(i-center)/3);led.material.color.setRGB(v,karr?v*.58:v*.025,karr?v*.025:v*.045)});
            glow.position.x=(center-4)*.082;
        };
        return state;
    }

    function rival(env){const root=new T.Group(),model=build(true,env);root.name='KARR_AI';root.add(model);root.userData.legacyModel=model;root.userData.scanner=model.userData.leds[4];
        const tag=document.createElement('canvas');tag.width=256;tag.height=80;const q=tag.getContext('2d');q.fillStyle='#100e18';q.fillRect(0,0,256,80);q.strokeStyle='#ffbd57';q.lineWidth=4;q.strokeRect(2,2,252,76);q.fillStyle='#ffcf83';q.textAlign='center';q.font='bold 42px monospace';q.fillText('KARR',128,55);const label=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(tag),depthWrite:false}));label.position.set(0,2.3,0);label.scale.set(2.6,.8,1);root.add(label);return root}
    return {installPlayer,rival,compact};
})();
