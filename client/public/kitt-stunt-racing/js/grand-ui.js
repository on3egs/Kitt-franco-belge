window.GrandUI=(()=>{
    const flags={BE:'🇧🇪',FR:'🇫🇷',US:'🇺🇸',NL:'🇳🇱',JP:'🇯🇵',IT:'🇮🇹',DE:'🇩🇪',FI:'🇫🇮',CH:'🇨🇭'};
    function refresh(){
        const first=document.getElementById('btn-level1');if(!first||!window.KITT)return;
        let grid=document.getElementById('grand-course-grid');if(!grid){grid=document.createElement('div');grid.id='grand-course-grid';first.before(grid)}
        for(let level=1;level<=10;level++){
            const button=document.getElementById(level===4?'btn-custom':'btn-level'+level),data=KITT.levelData[level],theme=RacerTracks.themes[level];if(!button||!data)continue;
            button.classList.add('course-choice');button.style.setProperty('--course-accent','#'+theme.accent.toString(16).padStart(6,'0'));
            const xs=data.line.map(p=>p.x),zs=data.line.map(p=>p.z),minX=Math.min(...xs),minZ=Math.min(...zs),width=Math.max(1,Math.max(...xs)-minX),depth=Math.max(1,Math.max(...zs)-minZ),scale=Math.min(158/width,66/depth);
            const ox=90-width*scale/2,oz=42-depth*scale/2;
            const points=data.line.filter((_,i)=>i%2===0||i===data.line.length-1).map(p=>(ox+(p.x-minX)*scale).toFixed(1)+','+(oz+(p.z-minZ)*scale).toFixed(1)).join(' ');
            button.innerHTML='<span class="course-number">'+String(level).padStart(2,'0')+' <b>'+(level===4?'TON CIRCUIT':flags[theme.country])+'</b></span><svg class="course-map" viewBox="0 0 180 86" aria-hidden="true"><polyline points="'+points+'"/></svg><strong>'+theme.name+'</strong><span class="course-country">'+theme.destination+'</span><span class="course-distance">'+Math.round(data.length)+' M / TOUR <i>FERMÉ ●</i></span>';
            button.setAttribute('aria-label',(level===4?'Jouer mon circuit':theme.destination)+', '+Math.round(data.length)+' mètres par tour');grid.appendChild(button);
        }
    }
    return {refresh};
})();
