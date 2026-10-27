/* Synthèse arcade stéréo : aucun fichier audio téléchargé. */
window.PacmanSfx=(()=>{
 'use strict';
 let context=null,master=null,bus=null,volume=.7,muted=false,voices=0,chompStep=0;
 let ambience=null,playing=false,powered=false,lastUpdate=0;const counts={};
 try{const v=localStorage.getItem('pacman3dVolume');if(v!==null)volume=Math.max(0,Math.min(1,Number(v)||0));muted=localStorage.getItem('pacman3dMuted')==='1'}catch{}
 function setup(){
  if(context)return true;
  try{context=new(window.AudioContext||window.webkitAudioContext)()}catch{return false}
  master=context.createGain();master.gain.value=muted?0:volume*.65;
  const compressor=context.createDynamicsCompressor();compressor.threshold.value=-16;compressor.ratio.value=5;compressor.attack.value=.003;compressor.release.value=.15;
  master.connect(compressor);compressor.connect(context.destination);bus=context.createGain();bus.connect(master);
  const echo=context.createDelay(.6),feedback=context.createGain(),wet=context.createGain();echo.delayTime.value=.105;feedback.gain.value=.16;wet.gain.value=.08;bus.connect(echo);echo.connect(wet);wet.connect(master);echo.connect(feedback);feedback.connect(echo);
  const a=context.createOscillator(),b=context.createOscillator(),lfo=context.createOscillator(),mod=context.createGain(),gain=context.createGain();
  a.type='triangle';b.type='sine';a.frequency.value=105;b.frequency.value=210;lfo.frequency.value=1.8;mod.gain.value=16;gain.gain.value=0;
  lfo.connect(mod);mod.connect(a.frequency);a.connect(gain);b.connect(gain);gain.connect(bus);a.start();b.start();lfo.start();ambience={a,b,lfo,mod,gain};
  return true;
 }
 function unlock(){if(setup()&&context.state==='suspended')context.resume().catch(()=>{})}
 function mark(name){counts[name]=(counts[name]||0)+1}
 function tone(freq,duration=.1,type='triangle',level=.1,delay=0,target=0,pan=0){
  if(!setup()||muted||voices>=24)return;
  const t=context.currentTime+delay,o=context.createOscillator(),gain=context.createGain(),p=context.createStereoPanner?.();voices++;
  o.type=type;o.frequency.setValueAtTime(freq,t);if(target)o.frequency.exponentialRampToValueAtTime(Math.max(20,target),t+duration);
  gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(level,t+.006);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  o.connect(gain);if(p){p.pan.value=pan;gain.connect(p);p.connect(bus)}else gain.connect(bus);
  o.onended=()=>{voices--;o.disconnect();gain.disconnect();p?.disconnect()};o.start(t);o.stop(t+duration+.02);
 }
 function arpeggio(notes,step=.07,level=.11){notes.forEach((f,i)=>{tone(f,.17,'triangle',level,i*step);tone(f*2,.12,'sine',level*.24,i*step+.012)})}
 function chomp(pan=0){mark('chomp');const f=chompStep++%2?580:420;tone(f,.085,'square',.07,0,f*1.8,pan);tone(f*.5,.065,'sine',.025,0,f*.8,pan)}
 function power(){mark('power');arpeggio([330,440,660,880,1320],.055,.1);tone(110,.45,'sawtooth',.045,0,440)}
 function ghost(combo=1){mark('ghost');const f=330*2**Math.min(3,Math.max(0,combo-1));tone(f,.22,'square',.085,0,f*2);tone(f*1.5,.24,'triangle',.055,.06,f*3)}
 function fruit(){mark('fruit');arpeggio([523.25,659.25,783.99,1046.5],.065,.12)}
 function ready(){unlock();mark('ready');arpeggio([392,493.88,587.33,783.99,587.33,783.99],.105,.1)}
 function clear(){mark('clear');arpeggio([523,659,784,1047,1319,1568],.11,.12);tone(261.63,.9,'sine',.06)}
 function death(){mark('death');for(let i=0;i<6;i++)tone(700-i*90,.12,'sawtooth',.075,i*.08,Math.max(30,280-i*45));tone(120,.6,'sine',.11,.1,30)}
 function ui(){unlock();mark('ui');tone(660,.055,'triangle',.08);tone(990,.06,'sine',.045,.045)}
 function turn(){mark('turn');tone(280,.035,'sine',.018,0,420)}
 function extraLife(){mark('extraLife');arpeggio([659,784,1047,1319,1047,1568],.085,.11)}
 function combo(mult=2){mark('combo');const base=440*Math.min(4,mult);arpeggio([base,base*1.25,base*1.5],.045,.09)}
 function pause(){mark('pause');tone(440,.07,'triangle',.055);tone(330,.1,'triangle',.045,.075)}
 function update(active,power,level=1,turbo=false){
  playing=!!active;powered=!!power;if(!ambience)return;
  const t=context.currentTime;
  if(t-lastUpdate<.075)return;lastUpdate=t;
  const duck=(window.cdPlayerDucking||window.kittMicDucking)? .28 : 1;
  master.gain.setTargetAtTime(muted?0:volume*.65*duck,t,.035);
  ambience.gain.gain.setTargetAtTime(active?(power?.026:.009):0,t,.09);
  ambience.a.frequency.setTargetAtTime(power?190:100+Math.min(level,12)*6,t,.08);
  ambience.b.frequency.setTargetAtTime(power?285:200+Math.min(level,12)*12,t,.08);
  ambience.lfo.frequency.setTargetAtTime(power?6:turbo?3.5:1.8,t,.1);
 }
 function setVolume(v){volume=Math.max(0,Math.min(1,Number(v)||0));try{localStorage.setItem('pacman3dVolume',String(volume))}catch{}if(master)master.gain.setTargetAtTime(muted?0:volume*.65,context.currentTime,.03)}
 function setMuted(value){muted=!!value;try{localStorage.setItem('pacman3dMuted',muted?'1':'0')}catch{}setVolume(volume)}
 function stop(){update(false,false)}
 window.addEventListener('blur',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
 return{unlock,chomp,power,ghost,fruit,ready,clear,death,ui,turn,extraLife,combo,pause,update,setVolume,setMuted,stop,
 context:()=>{setup();return context},master:()=>master,
 state:()=>({state:context?.state,volume,muted,voices,playing,powered,counts:{...counts}})};
})();
