/* Tableau des temps conservé localement dans le navigateur. */
(() => {
  const key='kx-stunt-racing-scores-v1';
  const read=()=>{try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch{return[]}};
  const panel=()=>document.getElementById('scores-screen');
  window.KS={
    isOpen:()=>!!panel()&&!panel().classList.contains('hidden'),
    open(){const p=panel(),c=document.getElementById('scores-content');if(!p||!c)return;const rows=read().sort((a,b)=>a.time-b.time).slice(0,20);c.innerHTML=rows.length?'<ol>'+rows.map(r=>`<li><b>Niveau ${Number(r.level)||1}</b><span>${Number(r.time).toFixed(2)} s</span><small>${Number(r.speed)||0} km/h</small></li>`).join('')+'</ol>':'<p>Aucune course enregistrée pour le moment.</p>';p.classList.remove('hidden')},
    close(){panel()?.classList.add('hidden')},
    addRun(level,time,speed){const rows=read();rows.push({level:Number(level)||1,time:Number(time)||0,speed:Math.round(Number(speed)||0),date:new Date().toISOString()});rows.sort((a,b)=>a.time-b.time);try{localStorage.setItem(key,JSON.stringify(rows.slice(0,50)))}catch{}const best=rows.filter(r=>r.level===Number(level)).sort((a,b)=>a.time-b.time);return best.findIndex(r=>r.time===Number(time))+1}
  };
  addEventListener('DOMContentLoaded',()=>{document.getElementById('btn-scores-close')?.addEventListener('click',()=>KS.close());document.getElementById('btn-scores-reset')?.addEventListener('click',()=>{try{localStorage.removeItem(key)}catch{}KS.open()})});
})();
