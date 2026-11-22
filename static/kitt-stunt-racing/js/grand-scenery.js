/* Décors procéduraux déterministes, regroupés en instances pour PC et Jetson. */
window.RacerWorld=(()=>{
    const worlds=new Map();let backdrop=null;
    const color=n=>'#'+n.toString(16).padStart(6,'0');
    function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
    function environment(scene){
        const T=THREE,c=document.createElement('canvas');c.width=8;c.height=512;
        const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,512);
        [[0,'#02040d'],[.45,'#091329'],[.77,'#242344'],[1,'#5b334a']].forEach(([n,s])=>g.addColorStop(n,s));x.fillStyle=g;x.fillRect(0,0,8,512);
        const sky=new T.Mesh(new T.SphereGeometry(13000,20,12),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),side:T.BackSide,fog:false}));sky.position.x=1900;scene.add(sky);backdrop={canvas:c,texture:sky.material.map};
        const starGeo=new T.BufferGeometry(),points=[],rng=random(4107);for(let i=0;i<1100;i++){const a=rng()*Math.PI*2,b=rng()*Math.PI*.42;points.push(1900+Math.sin(b)*Math.cos(a)*7000,Math.cos(b)*7000,Math.sin(b)*Math.sin(a)*7000)}
        starGeo.setAttribute('position',new T.Float32BufferAttribute(points,3));scene.add(new T.Points(starGeo,new T.PointsMaterial({color:0xcbdcff,size:1.6,sizeAttenuation:false,transparent:true,opacity:.8,fog:false})));
        const floor=new T.Mesh(new T.PlaneGeometry(16000,16000),new T.MeshBasicMaterial({color:0x0a0f1b}));floor.rotation.x=-Math.PI/2;floor.position.set(1900,-12,0);scene.add(floor);
        return {sky};
    }
    function decorate(level,parent,line,env){
        const T=THREE,theme=level===4?{...RacerTracks.themes[Number(localStorage.getItem('kx-builder-world'))||5],name:'MON CIRCUIT'}:RacerTracks.themes[level],rng=random(level*821+601),group=new T.Group();group.name='WORLD_'+theme.kind;parent.add(group);
        const xs=line.map(p=>p.x),zs=line.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
        const batches=new Map(),dummy=new T.Object3D();
        const geometries={box:new T.BoxGeometry(1,1,1),cylinder:new T.CylinderGeometry(.5,.5,1,8),cone:new T.ConeGeometry(.5,1,7),rock:new T.DodecahedronGeometry(.5,0),sphere:new T.SphereGeometry(.5,10,6)};
        function instance(kind,x,y,z,w,h,d,tint,yaw=0,glow=false){const key=kind+(glow?'_glow':'');if(!batches.has(key))batches.set(key,[]);batches.get(key).push({x,y,z,w,h,d,tint,yaw})}
        const safe=(x,z,r=0)=>!line.some(p=>Math.hypot(p.x-x,p.z-z)<13+r);
        function atRoad(index,side,offset){const p=line[index],a=line[Math.max(0,index-1)],b=line[Math.min(line.length-1,index+1)];const yaw=Math.atan2(b.x-a.x,b.z-a.z);return{x:p.x+Math.cos(yaw)*side*offset,y:p.y,z:p.z-Math.sin(yaw)*side*offset,yaw}}
        function sign(text,sub,x,y,z,yaw,w=12,h=3){const c=document.createElement('canvas');c.width=768;c.height=192;const q=c.getContext('2d');q.fillStyle='#0a0e1b';q.fillRect(0,0,768,192);q.strokeStyle=color(theme.accent);q.lineWidth=8;q.strokeRect(4,4,760,184);q.textAlign='center';q.fillStyle='#fff2d8';q.font='bold 54px sans-serif';q.fillText(text,384,85,720);q.fillStyle=color(theme.accent);q.font='22px monospace';q.fillText(sub,384,139,720);const texture=new T.CanvasTexture(c);texture.encoding=T.sRGBEncoding;const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.y=yaw;group.add(mesh);return mesh}
        const ground=document.createElement('canvas');ground.width=ground.height=256;const gx=ground.getContext('2d');
        const palette={belgium:'#18302b',city:'#111c30',canyon:'#49303a',studio:'#11282d',storm:'#162638',neon:'#241e34',coast:'#123b49',industry:'#30262c',orbit:'#24283e',snow:'#a9b9c9',finale:'#212638'};
        gx.fillStyle=palette[theme.kind];gx.fillRect(0,0,256,256);
        const grit=random(level*2903+17);
        for(let i=0;i<720;i++){const shade=grit()>.5?255:0;gx.fillStyle=shade?'rgba(210,225,245,.035)':'rgba(0,0,0,.055)';gx.fillRect(grit()*256,grit()*256,1+grit()*3,1+grit()*3)}
        gx.strokeStyle='#ffffff0a';for(let i=0;i<256;i+=32){gx.strokeRect(i,0,32,256);gx.strokeRect(0,i,256,32)}
        const tex=new T.CanvasTexture(ground);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set((maxX-minX+400)/36,(maxZ-minZ+400)/36);tex.encoding=T.sRGBEncoding;
        const surface=new T.Mesh(new T.PlaneGeometry(maxX-minX+400,maxZ-minZ+400),new T.MeshBasicMaterial({map:tex}));surface.rotation.x=-Math.PI/2;surface.position.set((minX+maxX)/2,-2.025,(minZ+maxZ)/2);group.add(surface);

        // Lampadaires, balises et arbres/roches suivent toute la piste.
        let traveled=0,last=-100,lamps=0;
        for(let i=1;i<line.length-1;i++){
            traveled+=Math.hypot(line[i].x-line[i-1].x,line[i].z-line[i-1].z);
            if(traveled-last<32||line[i].y>5)continue;last=traveled;
            for(const side of [-1,1]){const p=atRoad(i,side,8.2);if(!safe(p.x,p.z,-6))continue;
                instance('cylinder',p.x,p.y+3,p.z,.13,6,.13,0x303f54);
                instance('box',p.x,p.y+6,p.z,1.6,.15,.7,theme.accent,p.yaw,true);
                instance('box',p.x,p.y+.6,p.z,.18,.8,.18,theme.secondary,0,true);lamps++;
            }
            const a=line[i-1],b=line[i],d=line[i+1],turn=(b.x-a.x)*(d.z-b.z)-(b.z-a.z)*(d.x-b.x);
            if(Math.abs(turn)>2&&i%3===0){const p=atRoad(i,turn>0?1:-1,10);sign(turn>0?'‹ ‹ ‹':'› › ›','',p.x,p.y+1.7,p.z,p.yaw+Math.PI,4.8,1.2)}
        }
        // Peuplement extérieur à la route : aucune forme dans les trajectoires.
        const count=level===4?120:420;
        for(let i=0;i<count;i++){
            const x=minX-130+rng()*(maxX-minX+260),z=minZ-130+rng()*(maxZ-minZ+260),h=5+rng()*14;
            if(!safe(x,z,8))continue;
            if(['canyon','orbit'].includes(theme.kind)){
                const rock=theme.kind==='canyon'?0x83514f:0x424b69;instance('rock',x,-2+h*.24,z,h,h*.5,h*.8,rock,rng()*6.28);
                if(i%4===0)instance('rock',x,-2+h*.66,z,h*.63,h*.5,h*.52,theme.kind==='canyon'?0xc77d66:0x69718a,rng()*6.28);
            }else if(['city','neon','industry','finale'].includes(theme.kind)&&i%3!==0){
                const width=8+rng()*9,height=12+rng()*44;if(!safe(x,z,width*.7))continue;
                instance('box',x,-2+height/2,z,width,height,width*.8,0x24334b);
                instance('box',x,height-1.8,z,width+1,.25,width*.8+1,theme.accent,0,true);
                for(let floor=2;floor<height-2;floor+=3.5)for(let col=-1;col<=1;col++){
                    if(rng()>.8)continue;const tint=rng()>.45?theme.secondary:0xffdba3;
                    instance('box',x+col*width*.28,floor-2,z+width*.405,width*.12,1.1,.04,tint,0,true);
                    instance('box',x+col*width*.28,floor-2,z-width*.405,width*.12,1.1,.04,tint,0,true);
                }
            }else{
                instance('cylinder',x,.3,z,.55,4.6,.55,0x5a4345);
                const leaves=theme.kind==='snow'?0xc8d8e1:theme.kind==='neon'?0xc48cb4:theme.kind==='coast'?0x416d64:theme.kind==='storm'?0x294e57:0x356655;
                if(['NL','JP','BE','IT'].includes(theme.country)){
                    const tint=theme.country==='JP'?0xc888ae:0x4c7462;
                    instance('sphere',x,4.8,z,6.4,6.6,6.4,tint);
                    instance('sphere',x-1.8,4.4,z+1.2,4.8,4.8,4.8,tint);
                }else{instance('cone',x,4.3,z,5.8,8,5.8,leaves);instance('cone',x,7.1,z,4.1,6,4.1,leaves);}
            }
        }
        // Stands et tribunes, avec public et drapeaux franco-belges.
        const start=line[0];
        for(const side of [-1,1]){
            const x=start.x+side*38,z=start.z+48;
            for(let tier=0;tier<5;tier++){
                instance('box',x+side*tier*1.5,-.9+tier*.7,z,9,1,42,0x253443);
                for(let row=0;row<22;row++){
                    instance('sphere',x+side*tier*1.5,-.05+tier*.7,z-19+row*1.8,.56,.7,.56,[theme.accent,theme.secondary,0xd8dfee,0xb75f68][row%4]);
                }
            }

        }
        sign(theme.name,'KYRONEXT GRAND TOUR · BY MANIX',start.x-32,8,start.z+12,0,18,4.5);
        // Monument emblématique par environnement.
        const mark=atRoad(Math.min(8,line.length-2),-1,58);
        if(level===1&&window.LegacyModels?.atomium){const atom=LegacyModels.atomium(env);atom.scale.setScalar(4.6);atom.position.set(mark.x,-2,mark.z);group.add(atom)}
        else if(theme.kind==='coast'){
            for(const side of [-1,1]){const x=start.x+side*14;instance('box',x,13,start.z+75,2,30,2,0x667482);instance('box',x,13,start.z+160,2,30,2,0x667482);instance('box',x,26,start.z+117,1,.6,90,theme.accent,0,true);for(let z=80;z<160;z+=8)instance('cylinder',x,14,start.z+z,.08,22,.08,0xadcdd2)}
            instance('box',start.x,27,start.z+75,30,1,2,0x47566e);instance('box',start.x,27,start.z+160,30,1,2,0x47566e);
        }else if(theme.kind==='industry'){
            for(let i=0;i<5;i++){const x=mark.x+i*8;instance('cylinder',x,10,mark.z,4,24,4,0x566079);instance('cylinder',x,23,mark.z,4.2,.5,4.2,theme.accent,0,true);instance('box',x,8,mark.z+10,6,20,8,0x343647)}
        }else if(theme.kind==='orbit'){
            for(let i=0;i<4;i++){instance('sphere',mark.x+i*18,2,mark.z,13,10,13,0x818ba7);instance('cylinder',mark.x+i*18,8,mark.z,.2,10,.2,theme.secondary,0,true)}
            sign('ORBITAL / 09','DEEP SPACE TRANSMISSION',mark.x+20,14,mark.z,0,26,5);
        }else if(theme.kind==='canyon'){
            for(let i=0;i<5;i++)instance('rock',mark.x+i*14,13+i%2*5,mark.z,24,35+i%2*10,19,0x985d5b,i*.1);
        }else if(theme.kind==='finale'){
            sign('BY MANIX','LE SIGNAL CONTINUE',mark.x,18,mark.z,0,34,8);
            for(const side of [-1,1]){instance('box',mark.x+side*21,12,mark.z,4,30,4,0x27354e);instance('box',mark.x+side*21,26,mark.z,4.3,1,4.3,theme.accent,0,true)}
        }
        const motion=WorldMotion.add(level,group,{theme,line,instance,bounds:{minX,maxX,minZ,maxZ}});
        let instances=0;
        for(const [key,items]of batches){const kind=key.replace('_glow',''),glow=key.endsWith('_glow');const mat=glow?new T.MeshBasicMaterial({color:0xffffff}):new T.MeshStandardMaterial({color:0xffffff,roughness:.78,metalness:.16});const mesh=new T.InstancedMesh(geometries[kind],mat,items.length);const tint=new T.Color();items.forEach((v,i)=>{dummy.position.set(v.x,v.y,v.z);dummy.rotation.set(0,v.yaw,0);dummy.scale.set(v.w,v.h,v.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,tint.setHex(v.tint))});mesh.instanceMatrix.needsUpdate=true;mesh.frustumCulled=false;mesh.castShadow=!glow;mesh.receiveShadow=!glow;group.add(mesh);instances+=items.length}
        group.userData.stats={instances,lamps,theme:theme.name,signs:group.children.filter(o=>o.geometry?.type==='PlaneGeometry').length};worlds.set(level,{group,theme,motion});
        return group.userData.stats;
    }
    function select(level,scene){
        const theme=worlds.get(level)?.theme||RacerTracks.themes[level];if(scene.fog)scene.fog.color.setHex(theme.fog);
        const outdoor=['BE','NL','IT','CH','FI'].includes(theme.country);
        for(const light of scene.children){if(light.isAmbientLight)light.intensity=outdoor?.48:.36;if(light.isHemisphereLight)light.intensity=outdoor?.7:.5;if(light.isDirectionalLight){light.intensity=outdoor?1.05:.78;light.color.setHex(theme.country==='NL'||theme.country==='IT'?0xffdeb3:0xdce9ff)}}
        if(backdrop){const x=backdrop.canvas.getContext('2d'),g=x.createLinearGradient(0,0,0,512),sky=theme.country==='NL'||theme.country==='IT'?['#18304b','#5b718a','#e5b7a1']:theme.country==='CH'||theme.country==='FI'?['#15273f','#48637c','#a4bdd0']:['#030812','#142039','#573149'];[[0,sky[0]],[.5,sky[1]],[1,sky[2]]].forEach(([n,c])=>g.addColorStop(n,c));x.fillStyle=g;x.fillRect(0,0,8,512);backdrop.texture.needsUpdate=true;}
        return theme;
    }
    function update(t,level){for(const animate of worlds.get(level)?.motion||[])animate(t)}
    return {environment,decorate,select,worlds,update};
})();
