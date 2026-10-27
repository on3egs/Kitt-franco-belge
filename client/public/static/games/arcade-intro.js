(() => {
  "use strict";
  let active=false,timers=[],finish=null;
  const labels={pacman:"PAC-MAN // NEON MAZE",tetris:"TETRIS // BLOCK MATRIX",tron:"TRON // LIGHT CYCLES",shadowkarr:"SHADOW OF KARR // CAMPAIGN"};
  function cancel(){finish?.(false)}
  function show(game,done){
    if(active)return;
    const overlay=document.getElementById("kyronext-arcade-intro");
    if(!overlay){done?.();return}
    active=true;
    const skip=overlay.querySelector("[data-intro-skip]"),status=overlay.querySelector("[data-intro-status]");
    overlay.classList.remove("is-live");overlay.hidden=false;overlay.setAttribute("aria-hidden","false");
    overlay.querySelector("[data-intro-game]").textContent=labels[game]||game;
    status.textContent="INITIALISATION DU SYSTÈME";
    const close=launch=>{
      if(!active)return;active=false;timers.forEach(clearTimeout);timers=[];
      overlay.hidden=true;overlay.setAttribute("aria-hidden","true");overlay.classList.remove("is-live");
      skip?.removeEventListener("click",skipIntro);document.removeEventListener("keydown",escape);finish=null;
      if(launch)done?.();
    };
    const skipIntro=()=>close(true),escape=e=>{if(e.key==="Escape"){close(false);window.KyronextArcade?.stop?.()}};
    finish=close;skip.hidden=false;skip.addEventListener("click",skipIntro);document.addEventListener("keydown",escape);
    requestAnimationFrame(()=>{if(active)overlay.classList.add("is-live")});
    const schedule=(fn,ms)=>timers.push(setTimeout(fn,ms));
    schedule(()=>status.textContent="SIGNAL KYRONEXT VERROUILLÉ",700);
    schedule(()=>status.textContent="MOTEUR ARCADE PRÊT",1500);
    schedule(()=>close(true),matchMedia("(prefers-reduced-motion: reduce)").matches?500:2400);
  }
  window.KyronextArcadeIntro={show,cancel,isActive:()=>active,duration:2400};
})();
