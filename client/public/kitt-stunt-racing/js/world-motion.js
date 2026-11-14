/* Repères de pays et animations : moulins, eau, drapeaux, aurore, télécabine. */
window.WorldMotion=(()=>{
    function flag(code){const c=document.createElement('canvas');c.width=192;c.height=128;const q=c.getContext('2d');
        const bars=(colors,vertical)=>colors.forEach((v,i)=>{q.fillStyle=v;q.fillRect(vertical?i*64:0,vertical?0:i*128/3,vertical?64:192,vertical?128:128/3)});
        if(code==='BE')bars(['#151515','#fbd33b','#e2444d'],true);
        else if(code==='FR')bars(['#315ac7','#f5f3e9','#e34755'],true);
        else if(code==='IT')bars(['#2e9e73','#faf8ef','#dc4e54'],true);
        else if(code==='NL')bars(['#c74450','#f8f7ed','#365ba9'],false);
        else if(code==='DE')bars(['#17191e','#c6454d','#f2c34b'],false);
        else if(code==='JP'){q.fillStyle='#f4f2e8';q.fillRect(0,0,192,128);q.fillStyle='#cd3d54';q.beginPath();q.arc(96,64,33,0,Math.PI*2);q.fill()}
        else if(code==='FI'){q.fillStyle='#f4f4eb';q.fillRect(0,0,192,128);q.fillStyle='#34568f';q.fillRect(53,0,28,128);q.fillRect(0,48,192,28)}
        else if(code==='CH'){q.fillStyle='#da3b45';q.fillRect(0,0,192,128);q.fillStyle='#fff7ed';q.fillRect(82,24,28,80);q.fillRect(56,50,80,28)}
        else if(code==='US'){for(let i=0;i<13;i++){q.fillStyle=i%2?'#f7f1e5':'#bb3d4a';q.fillRect(0,i*128/13,192,128/13+1)}q.fillStyle='#283d70';q.fillRect(0,0,80,69);q.fillStyle='#fff8ef';for(let row=0;row<9;row++)for(let col=0;col<(row%2?5:6);col++){q.beginPath();q.arc(7+col*12+(row%2?6:0),5+row*7,1.8,0,Math.PI*2);q.fill()}}
        else{q.fillStyle='#142233';q.fillRect(0,0,192,128);q.fillStyle='#ffe0a6';q.font='bold 28px monospace';q.textAlign='center';q.fillText('MANIX',96,77)}
        const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;return tex;
    }
    function add(level,parent,context){
        const T=THREE,{theme,line,instance}=context,code=theme.country||'BE',start=line[0],motions=[];
        const {minX,maxX,minZ,maxZ}=context.bounds;
        const mat=(color,metalness=.1)=>new T.MeshStandardMaterial({color,roughness:.65,metalness});
        const wall=mat(0xd9c5a4),dark=mat(0x3c3542),white=mat(0xede3cb),roof=mat(0x815953),glass=new T.MeshBasicMaterial({color:0x7cc9e0});
        function box(group,w,h,d,x,y,z,material){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m}
        function rod(group,a,b,r,material){const d=b.clone().sub(a),m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),6),material);m.position.copy(a.clone().add(b).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());group.add(m)}
        function compact(group,exclude=[]){RacerCars.compact(group,new Set(exclude));}
        // Les drapeaux suivent le pays du circuit et ondulent autour de leur hampe.
        const wind={value:0},flagMaterial=new T.MeshBasicMaterial({map:flag(code),side:T.DoubleSide});
        flagMaterial.onBeforeCompile=shader=>{shader.uniforms.grandWindTime=wind;shader.vertexShader='uniform float grandWindTime;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z+=sin(position.x*2.5+grandWindTime*2.2)*.19*max(0.0,position.x/3.0);')};
        const flagGeometry=new T.PlaneGeometry(3.2,2.1,12,5);flagGeometry.translate(1.6,0,0);
        for(const side of [-1,1])for(let i=0;i<3;i++){const x=start.x+side*32,z=start.z+14+i*22;instance('cylinder',x,5,z,.09,14,.09,0x7e8fa1);const f=new T.Mesh(flagGeometry,flagMaterial);f.position.set(x,10.4,z);f.rotation.y=side*.25;parent.add(f)}
        motions.push(t=>wind.value=t);
        if(code==='NL'){
            for(let i=0;i<3;i++){
                const group=new T.Group(),tower=new T.Mesh(new T.CylinderGeometry(2.2,3.8,13,12),wall);tower.position.y=4.5;group.add(tower);
                const cap=new T.Mesh(new T.ConeGeometry(3.7,4,12),roof);cap.position.y=13;group.add(cap);
                box(group,1.4,2.5,.1,0,.1,3.5,dark);for(const side of [-1,1])box(group,.7,1.2,.1,side*1.6,6,2.65,glass);
                const rotor=new T.Group();rotor.name='WINDMILL_ROTOR';rotor.position.set(0,10,3);group.add(rotor);
                for(let blade=0;blade<4;blade++){const arm=new T.Group();arm.rotation.z=blade*Math.PI/2;box(arm,.22,8,.25,0,3.6,0,dark);box(arm,1.3,4.9,.08,.65,4.8,.1,white);for(let slat=0;slat<8;slat++)box(arm,1.5,.045,.09,.65,2.8+slat*.56,.2,dark);rotor.add(arm)}
                compact(rotor);compact(group,[rotor]);
                let mx=start.x+(i%2?-48:38+i*12),mz=start.z+80+i*65;
                for(let attempt=0;attempt<8&&line.some(p=>Math.hypot(p.x-mx,p.z-mz)<24);attempt++)mx+=(i%2?-18:18);
                group.position.set(mx,-2,mz);group.rotation.y=.25;parent.add(group);motions.push(t=>rotor.rotation.z=-t*(.47+i*.07)+i);
            }
            const waterTime={value:0};const water=new T.Mesh(new T.PlaneGeometry(34,maxZ-minZ+150,12,90),new T.ShaderMaterial({uniforms:{time:waterTime},vertexShader:'uniform float time;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.z+=sin(p.y*.13+time)*.1;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'uniform float time;varying vec2 vUv;void main(){float w=pow(max(0.,sin(vUv.y*180.+vUv.x*17.+time*1.3)),12.);vec3 c=mix(vec3(.055,.16,.24),vec3(.18,.36,.42),vUv.x)+w*.12;gl_FragColor=vec4(c,1.);}'}));water.rotation.x=-Math.PI/2;water.position.set(start.x-37,-1.9,(minZ+maxZ)/2);parent.add(water);motions.push(t=>waterTime.value=t);
            for(let row=0;row<8;row++)for(let i=0;i<60;i++){const x=start.x-100-row*2.1,z=start.z+i*3.1;instance('box',x,-1.3,z,.10,1.3,.10,0x407a56);instance('sphere',x,-.58,z,.8,.6,.8,[0xec5365,0xffd05c,0xc889dc][row%3],0,true)}
        }
        if(code==='FR'){
            const tower=new T.Group(),metal=mat(0x927762,.75),corners=[[-9,-9],[9,-9],[-9,9],[9,9]];
            for(const [x,z]of corners){rod(tower,new T.Vector3(x,0,z),new T.Vector3(x*.24,32,z*.24),.55,metal);for(let h=3;h<30;h+=5){const f=1-h/42;rod(tower,new T.Vector3(x*f,h,z*f),new T.Vector3(-x*(f-.12),h+5,z*(f-.12)),.14,metal)}}
            box(tower,14,.8,14,0,12,0,metal);box(tower,8,.7,8,0,25,0,metal);rod(tower,new T.Vector3(0,30,0),new T.Vector3(0,45,0),.38,metal);compact(tower);tower.position.set(start.x-70,-2,start.z+130);parent.add(tower);
        }
        if(code==='JP'){
            const red=mat(0xa94a50),wood=mat(0x282c3d);for(let i=0;i<4;i++){const gate=new T.Group();box(gate,.5,7,.5,-4,3,0,red);box(gate,.5,7,.5,4,3,0,red);box(gate,10,.45,.65,0,6.5,0,red);box(gate,9,.25,.5,0,5.4,0,wood);compact(gate);gate.position.set(start.x-22-i*6,-2,start.z+35+i*22);parent.add(gate)}
        }
        if(code==='IT')for(let i=0;i<12;i++){const x=start.x-42-i%4*15,z=start.z+80+Math.floor(i/4)*24;instance('box',x,3,z,10,10,9,[0x9e7778,0xc29880,0xb5a18c][i%3]);instance('cone',x,9,z,14,4,13,0x9f5e54,Math.PI/4);for(const side of [-1,1])instance('box',x+side*2.6,4,z+4.55,1.4,2,.1,0x334e59)}
        if(code==='US'){
            const bird=new T.Group();const bmat=new T.MeshBasicMaterial({color:0x171d2e});box(bird,4,.08,.45,-1.6,0,0,bmat);box(bird,4,.08,.45,1.6,0,0,bmat);compact(bird);parent.add(bird);motions.push(t=>{bird.position.set(start.x+Math.cos(t*.13)*110,55+Math.sin(t*.4)*3,start.z+100+Math.sin(t*.13)*95);bird.rotation.y=-t*.13})
        }
        if(code==='FI'){
            const time={value:0},aurora=new T.Mesh(new T.PlaneGeometry(560,120,55,12),new T.ShaderMaterial({uniforms:{time},transparent:true,depthWrite:false,side:T.DoubleSide,vertexShader:'uniform float time;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;p.y+=sin(p.x*.025+time*.4)*18.;p.z+=cos(p.x*.02+time*.3)*20.;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',fragmentShader:'uniform float time;varying vec2 vUv;void main(){float a=sin(vUv.y*3.14159)*(.12+.15*sin(vUv.x*17.+time*.4));vec3 c=mix(vec3(.2,.65,.75),vec3(.4,.9,.55),vUv.x);gl_FragColor=vec4(c,max(0.,a));}'}));aurora.position.set((minX+maxX)/2,125,minZ-170);parent.add(aurora);motions.push(t=>time.value=t);
            const geo=new T.BufferGeometry(),snow=[];for(let i=0;i<550;i++)snow.push(minX-60+(i*83.31)%Math.max(1,maxX-minX+120),3+(i*7.3)%70,minZ-60+(i*43.17)%Math.max(1,maxZ-minZ+120));geo.setAttribute('position',new T.Float32BufferAttribute(snow,3));const flakes=new T.Points(geo,new T.PointsMaterial({color:0xd8e5f8,size:.2,transparent:true,opacity:.5}));parent.add(flakes);motions.push(t=>flakes.position.y=-(t*.8)%5);
        }
        if(code==='CH'){
            for(let i=0;i<8;i++){const height=65+i%3*28,x=minX-160-i*35,z=minZ-80+i*65;instance('cone',x,-2+height/2,z,height*.95,height,height*.9,0x58687d,i*.8);instance('cone',x,-2+height*.81,z,height*.37,height*.38,height*.35,0xd0dae4,i*.8)}
            const a=new T.Vector3(start.x-56,25,start.z+65),b=new T.Vector3(start.x-150,65,start.z+225),lineGeo=new T.BufferGeometry().setFromPoints([a,b]);parent.add(new T.Line(lineGeo,new T.LineBasicMaterial({color:0x768494})));
            const cabin=new T.Group();box(cabin,4,3,3,0,0,0,mat(0xb34753));box(cabin,3.7,1.3,3.1,0,.4,0,glass);box(cabin,.12,3,.12,0,2.5,0,dark);compact(cabin);parent.add(cabin);motions.push(t=>{const u=(Math.sin(t*.12)+1)/2;cabin.position.copy(a).lerp(b,u);cabin.position.y-=3.2});
        }
        return motions;
    }
    return {add};
})();
