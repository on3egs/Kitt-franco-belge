/* Tracés fermés, raccords et thèmes originaux du Grand Tour KYRONEXT. */
window.RacerTracks=(()=>{
    const themes={
        1:{country:"BE",destination:"Belgique · Bruxelles",name:'GRAND PRIX BELGE',subtitle:'Atomium · stands · grandes courbes',accent:0xffbc6f,secondary:0x61dae3,fog:0x10182b,kind:'belgium'},
        2:{country:"FR",destination:"France · Paris",name:'MIDNIGHT CITY',subtitle:'Métropole · néons · boulevard nocturne',accent:0x4ee7ff,secondary:0xff557f,fog:0x0b132b,kind:'city'},
        3:{country:"US",destination:"États-Unis · Arizona",name:'CANYON LOOP',subtitle:'Roches cuivrées · looping · belvédère',accent:0xff945b,secondary:0x63e5f0,fog:0x291b28,kind:'canyon'},
        4:{country:"NL",destination:"Atelier · Pays-Bas",name:'MON CIRCUIT',subtitle:'Ton tracé · raccord automatique · By Manix',accent:0x83f4bd,secondary:0x7baaff,fog:0x101f28,kind:'studio'},
        5:{country:"NL",destination:"Pays-Bas · Moulins",name:'WINDMILL PARK',subtitle:'Moulins animés · canaux · tulipes',accent:0x71cdff,secondary:0xb9a2ff,fog:0x12192f,kind:'storm'},
        6:{country:"JP",destination:"Japon · Kyoto",name:'NEON DISTRICT',subtitle:'Portiques lumineux · jardins · centre-ville',accent:0xee8aff,secondary:0x59f2db,fog:0x25142d,kind:'neon'},
        7:{country:"IT",destination:"Italie · Riviera",name:'COASTAL BRIDGE',subtitle:'Mer · grand pont · panorama',accent:0x5fe5e0,secondary:0xffd18d,fog:0x142d3c,kind:'coast'},
        8:{country:"DE",destination:"Allemagne · Ruhr",name:'IRON WORKS',subtitle:'Fonderie · grues · acier et cuivre',accent:0xffa258,secondary:0xffd98b,fog:0x281b26,kind:'industry'},
        9:{country:"FI",destination:"Finlande · Laponie",name:'AURORA LAPLAND',subtitle:'Neige · sapins · aurore boréale',accent:0x9bb8ff,secondary:0xc49bff,fog:0x101326,kind:'snow'},
        10:{country:"CH",destination:"Suisse · Alpes",name:'MANIX GRAND FINAL',subtitle:'Alpes · télécabine · grand duel',accent:0xffd88a,secondary:0xff516f,fog:0x221622,kind:'finale'}
    };
    const straight=(len,dy=0)=>({type:'straight',len,dy});
    const curve=(radius,angle=90)=>({type:'curve',radius,angle,dy:0});
    const cp=()=>({type:'checkpoint'});
    function template(name='grandprix'){
        const length=name==='sprint'?55:name==='stunt'?80:90,radius=name==='sprint'?35:50;
        const result=[straight(length),curve(radius),cp(),straight(65),curve(radius),cp(),straight(length),curve(radius),cp(),straight(65),curve(radius)];
        if(name==='stunt')result.splice(1,0,{type:'loop'});
        return result;
    }
    function build(level,api){
        const {straight:s,curve:c,checkpoint:check,loop}=api;
        if(level===3){s(75,0);check();loop(11);s(45,0);c(55,90,0);check();s(115,1.4);c(55,90,0);check();s(212.2,-1.4);c(55,90,0);check();s(115,0);c(55,90,0);return}
        const lengths={1:[135,95],2:[170,110],5:[160,135],6:[125,95],7:[210,125],8:[145,105],9:[155,145],10:[220,165]};
        const [long,short]=lengths[level]||[135,100];
        const radius=level===10?65:level===2?58:level===7?62:level===6?46:52;
        for(let side=0;side<4;side++){
            const len=side%2?short:long;
            if((level===5||level===6||level===9)&&side%2===0){
                s(len*.32,0);c(65,22,0);c(65,-44,0);c(65,22,0);s(len*.32,0);
            }else if(level===7&&side%2===0){s(len*.28,3);s(len*.44,0);s(len*.28,-3)}
            else if(level===8&&side%2===0){s(len*.4,1.7);s(len*.2,0);s(len*.4,-1.7)}
            else s(len,0);
            c(radius,90,0);
            if(side<3)check();
        }
    }

    function distance(line){let total=0;for(let i=1;i<line.length;i++)total+=Math.hypot(line[i].x-line[i-1].x,line[i].y-line[i-1].y,line[i].z-line[i-1].z);return total}
    function closePath(p,start,line,makeRoad){
        const gap=Math.hypot(p.x-start.x,p.z-start.z),heading=Math.atan2(Math.sin(p.yaw),Math.cos(p.yaw));
        if(gap<.05&&Math.abs(heading)<.001&&Math.abs(p.y-start.y)<.02){p.x=start.x;p.z=start.z;p.y=start.y;p.yaw=0;line.push({...start});return 0}
        const T=THREE,forward=new T.Vector3(Math.sin(p.yaw),0,Math.cos(p.yaw)),finishForward=new T.Vector3(0,0,1);
        const end=new T.Vector3(p.x,p.y,p.z),goal=new T.Vector3(start.x,start.y,start.z);
        const xs=line.map(v=>v.x),zs=line.map(v=>v.z),maxX=Math.max(start.x,...xs),minX=Math.min(start.x,...xs);
        const side=p.x>=start.x?1:-1,sideX=side>0?maxX+110:minX-110;
        const mid=new T.Vector3(sideX,(p.y+start.y)/2,(p.z+start.z)/2);
        const midDirection=goal.clone().sub(mid).setY(0).normalize();
        const span=Math.max(65,Math.min(160,gap*.45+55));
        const paths=[new T.CubicBezierCurve3(end,end.clone().addScaledVector(forward,span),mid.clone().addScaledVector(midDirection,-span),mid),new T.CubicBezierCurve3(mid,mid.clone().addScaledVector(midDirection,span),goal.clone().addScaledVector(finishForward,-span),goal)];
        let added=0;
        for(const path of paths){const pts=path.getSpacedPoints(Math.max(12,Math.ceil(path.getLength()/5)));for(let i=1;i<pts.length;i++){
            const a=pts[i-1],b=pts[i],dx=b.x-a.x,dz=b.z-a.z,horizontal=Math.hypot(dx,dz);
            if(horizontal<.01)continue;
            const yaw=Math.atan2(dx,dz);makeRoad((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,yaw,horizontal+.12,b.y-a.y);
            line.push({x:b.x,y:b.y,z:b.z});added+=a.distanceTo(b);
        }}
        p.x=start.x;p.y=start.y;p.z=start.z;p.yaw=0;
        return added;
    }
    function balance(list,selected=-1){
        if(!Array.isArray(list))return list;
        const ops=JSON.parse(JSON.stringify(list)),p={x:0,z:0,yaw:0},straightParts=[];
        const advance=len=>{p.x+=Math.sin(p.yaw)*len;p.z+=Math.cos(p.yaw)*len};
        for(let index=0;index<ops.length;index++){
            const op=ops[index];if(!op||typeof op!=='object')return list;
            if(op.type==='straight'){straightParts.push({index,x:Math.sin(p.yaw),z:Math.cos(p.yaw),len:op.len});advance(op.len||20)}
            else if(op.type==='curve'){const count=Math.max(4,Math.ceil(Math.abs(op.angle)/6)),step=op.angle*Math.PI/180/count,len=Math.abs(op.radius*step);for(let i=0;i<count;i++){advance(len);p.yaw+=step}}
            else if(op.type==='loop')advance(92.2);
            else if(op.type==='jump')advance(30.08);
            else if(op.type==='gap')advance((op.len||10)*.72);
        }
        if(Math.abs(Math.atan2(Math.sin(p.yaw),Math.cos(p.yaw)))>.001||Math.hypot(p.x,p.z)<.03)return ops;
        let best=null;
        for(const a of straightParts)for(const b of straightParts){
            if(a.index===b.index||a.index===selected||b.index===selected)continue;
            const det=a.x*b.z-b.x*a.z;if(Math.abs(det)<.4)continue;
            const da=(-p.x*b.z+p.z*b.x)/det,db=(-p.z*a.x+p.x*a.z)/det;
            if(a.len+da<5||a.len+da>300||b.len+db<5||b.len+db>300)continue;
            const cost=Math.abs(da)+Math.abs(db)+Math.max(0,-da)+Math.max(0,-db);
            if(!best||cost<best.cost)best={a,b,da,db,cost};
        }
        if(best){ops[best.a.index].len=+(best.a.len+best.da).toFixed(2);ops[best.b.index].len=+(best.b.len+best.db).toFixed(2)}
        return ops;
    }
    return {themes,template,build,closePath,distance,balance};
})();
