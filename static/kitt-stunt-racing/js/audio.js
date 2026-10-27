/* Audio local original pour KITT Stunt Racing. Aucun fichier musical tiers. */
(() => {
  let context, engineOsc, engineGain, musicOsc, musicGain, skidNoise;
  const getContext = () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    context ||= new Ctx();
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  };
  const tone = (frequency=440, duration=.12, wave='sine', volume=.06) => {
    const c=getContext(); if(!c)return;
    const o=c.createOscillator(),g=c.createGain();o.type=wave;o.frequency.setValueAtTime(frequency,c.currentTime);
    g.gain.setValueAtTime(volume,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+duration);
    o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+duration);
  };
  const sfx={
    beep:(f=460,d=.09)=>tone(f,d,'square',.035), turbo:()=>tone(155,.36,'sawtooth',.045),
    scanner:()=>{tone(760,.07,'sine',.04);setTimeout(()=>tone(520,.12,'sine',.035),80)},
    record:()=>[660,880,1100].forEach((f,i)=>setTimeout(()=>tone(f,.2,'triangle',.05),i*120)),
    fanfare:()=>[523,659,784].forEach((f,i)=>setTimeout(()=>tone(f,.16,'triangle',.04),i*110)),
    countBeep:()=>tone(520,.07,'square',.035),countGo:()=>tone(900,.18,'square',.04),
    loopSuccess:()=>tone(1040,.24,'triangle',.04),checkpoint:()=>tone(740,.11,'sine',.035),
    thud:(v=.2)=>tone(90+Math.min(80,Math.max(0,v*80)),.12,'triangle',.06)
  };
  window.KA={
    sfx, ensure(){getContext()}, musicOn(){return !!musicOsc},
    toggleMusic(){const c=getContext();if(!c)return false;if(musicOsc){musicOsc.stop();musicOsc=null;musicGain=null;return false}musicOsc=c.createOscillator();musicGain=c.createGain();musicOsc.type='triangle';musicOsc.frequency.value=110;musicGain.gain.value=.018;musicOsc.connect(musicGain);musicGain.connect(c.destination);musicOsc.start();return true},
    setEngine(kmh,throttle,active,boost){const c=getContext();if(!c)return;if(!engineOsc){engineOsc=c.createOscillator();engineGain=c.createGain();engineOsc.type='sawtooth';engineOsc.frequency.value=48;engineGain.gain.value=0;engineOsc.connect(engineGain);engineGain.connect(c.destination);engineOsc.start()}engineOsc.frequency.setTargetAtTime(42+Math.min(150,kmh*.72)+(boost?35:0),c.currentTime,.08);engineGain.gain.setTargetAtTime(active?Math.min(.045,.009+Math.max(0,throttle)*.025):0,c.currentTime,.12)},
    setSkid(value){if(value>.65&&!skidNoise){const c=getContext();if(!c)return;const b=c.createBuffer(1,c.sampleRate,c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;skidNoise=c.createBufferSource();skidNoise.buffer=b;skidNoise.loop=true;const f=c.createBiquadFilter(),g=c.createGain();f.type='bandpass';f.frequency.value=1300;g.gain.value=.012;skidNoise.connect(f);f.connect(g);g.connect(c.destination);skidNoise.start();skidNoise._gain=g}else if(value<=.65&&skidNoise){skidNoise.stop();skidNoise=null}},
    stopVehicle(){if(engineGain&&context)engineGain.gain.setTargetAtTime(0,context.currentTime,.08);if(skidNoise){skidNoise.stop();skidNoise=null}}
  };
})();
