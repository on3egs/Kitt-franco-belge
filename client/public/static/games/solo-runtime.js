/* Commandes manette communes ; aucune connexion réseau. */
(() => {
  'use strict';
  if(window.__kyronextSoloRuntime)return;window.__kyronextSoloRuntime=true;
  let raf=0,held=new Set(),lastRepeat=0;
  const game=()=>document.body.dataset.arcadeGame||(/asteroids_pro/.test(location.pathname)?'asteroids':/space_invaders_pro/.test(location.pathname)?'space':/pacman-3d/.test(location.pathname)?'pacman3d':/space-invaders-3d/.test(location.pathname)?'invaders3d':'racer');
  const keyFor=code=>({Space:' ',KeyP:'p',KeyC:'c',KeyB:'b',KeyQ:'q',KeyR:'r',ShiftLeft:'Shift'}[code]||code);
  const dispatch=(type,code,repeat=false)=>document.dispatchEvent(new KeyboardEvent(type,{key:keyFor(code),code,bubbles:true,cancelable:true,repeat}));
  function release(){held.forEach(code=>dispatch('keyup',code));held.clear()}
  function frame(now){
    raf=0;
    const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);
    if(!pad){release();return}
    raf=requestAnimationFrame(frame);
    if(document.hidden||document.activeElement?.matches('input,textarea,select,[contenteditable]')){release();return}
    const down=i=>!!pad.buttons[i]?.pressed,next=new Set();
    const axis=(i)=>Math.abs(pad.axes[i]||0)>.28?pad.axes[i]:0;
    if(axis(0)<0||down(14))next.add('ArrowLeft');if(axis(0)>0||down(15))next.add('ArrowRight');
    if(axis(1)<0||down(12))next.add('ArrowUp');if(axis(1)>0||down(13))next.add('ArrowDown');
    if(down(0))next.add('Space');
    if(down(1)||down(4))next.add(game()==='asteroids'?'KeyB':game()==='space'?'ShiftLeft':game()==='space-invaders'?'KeyB':game()==='racer'?'KeyQ':'KeyC');
    if(down(2))next.add('KeyB');
    if(down(3)&&game()==='tetris')next.add('ArrowUp');
    if(down(8))next.add('KeyR');
    if(down(9))next.add(['space','racer'].includes(game())?'Escape':'KeyP');
    held.forEach(code=>{if(!next.has(code))dispatch('keyup',code)});
    next.forEach(code=>{if(!held.has(code))dispatch('keydown',code)});
    if(['tetris','space-invaders'].includes(game())&&now-lastRepeat>110){lastRepeat=now;next.forEach(code=>{const repeatKeys=game()==='tetris'?['ArrowLeft','ArrowRight','ArrowDown']:['ArrowLeft','ArrowRight','Space'];if(held.has(code)&&repeatKeys.includes(code))dispatch('keydown',code,true)})}
    held=next;
  }
  window.addEventListener('gamepadconnected',()=>{if(!raf)raf=requestAnimationFrame(frame)});
  window.addEventListener('gamepaddisconnected',release);
  window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});
  if(Array.from(navigator.getGamepads?.()||[]).some(p=>p?.connected))raf=requestAnimationFrame(frame);
})();
