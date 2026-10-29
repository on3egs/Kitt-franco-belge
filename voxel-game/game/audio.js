// Sons originaux synthétisés : interface, musique, pas, voiture et bestiaire.
export class SoundEngine{
  constructor(){this.ctx=null;this.muted=false;this.volume=.25;this.musicVolume=.32;this.effectsVolume=.8;this.events={};this.nextMusic=0;this.note=0;this.nextAmbient=0;this.lastStep=0;this.nextEngine=0;this.nextGoliath=0;this.nextBrake=0;this.nextSkid=0;this.peak=0}
  unlock(){try{if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.musicBus=this.ctx.createGain();this.effectsBus=this.ctx.createGain();const compressor=this.ctx.createDynamicsCompressor();compressor.threshold.value=-16;compressor.ratio.value=5;this.musicBus.connect(compressor);this.effectsBus.connect(compressor);compressor.connect(this.master);this.analyser=this.ctx.createAnalyser();this.analyser.fftSize=256;this.master.connect(this.analyser);this.analyser.connect(this.ctx.destination);this.configure(this)}this.ctx.resume().catch(()=>{})}catch{}}
  configure({volume=this.volume,musicVolume=this.musicVolume,effectsVolume=this.effectsVolume,muted=this.muted}){Object.assign(this,{volume,musicVolume,effectsVolume,muted});if(this.ctx){this.master.gain.setTargetAtTime(muted?0:volume*.42,this.ctx.currentTime,.025);this.musicBus.gain.value=musicVolume;this.effectsBus.gain.value=effectsVolume}}
  count(name){this.events[name]=(this.events[name]||0)+1}
  oscillator(frequency,duration=.15,{wave='triangle',gain=.2,end=frequency,delay=0,pan=0,music=false}={}){
    if(!this.ctx||this.ctx.state!=='running')return;const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=wave;o.frequency.setValueAtTime(Math.max(20,frequency),t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));g.connect(p);p.connect(music?this.musicBus:this.effectsBus)}else g.connect(music?this.musicBus:this.effectsBus);o.start(t);o.stop(t+duration+.02);
  }
  noise(duration=.13,gain=.2,frequency=900){if(!this.ctx||this.ctx.state!=='running')return;const n=Math.floor(this.ctx.sampleRate*duration),b=this.ctx.createBuffer(1,n,this.ctx.sampleRate),data=b.getChannelData(0);for(let i=0;i<n;i++)data[i]=(Math.random()*2-1)*(1-i/n);const src=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),g=this.ctx.createGain();src.buffer=b;filter.type='lowpass';filter.frequency.value=frequency;g.gain.value=gain;src.connect(filter);filter.connect(g);g.connect(this.effectsBus);src.start()}
  play(name,{pan=0,gain=1}={}){if(!this.ctx||this.ctx.state!=='running')return;this.count(name);const o=(f,d,w='triangle',g=.2,end=f,delay=0)=>this.oscillator(f,d,{wave:w,gain:g*gain,end,delay,pan});
    switch(name){
      case'hover':o(560,.045,'sine',.07);break;case'click':o(800,.09,'triangle',.18,440);break;
      case'start':o(220,.18,'triangle',.2);o(330,.18,'triangle',.17,330,.1);o(440,.3,'sine',.15,660,.2);break;
      case'break':this.noise(.13,.35*gain,1400);o(90,.08,'triangle',.2,45);break;case'place':o(190,.09,'square',.1,80);break;
      case'jump':o(120,.14,'triangle',.16,310);break;case'land':this.noise(.09,.12*gain,350);break;case'turbo':this.noise(.65,.35*gain,2300);o(90,.7,'sawtooth',.13,650);break;
      case'brake':this.noise(.16,.18*gain,780);o(260,.1,'sine',.08,130);break;case'skid':this.noise(.26,.13*gain,3200);o(780,.22,'sawtooth',.035,420);break;case'reward':[523,659,784,1047].forEach((f,i)=>o(f,.12,'sine',.11,f*1.08,i*.07));break;
      case'goliath':o(42,.8,'sawtooth',.2,27);o(58,.75,'triangle',.16,34,.18);this.noise(.65,.12*gain,220);break;
      case'goliathEngine':o(39,.42,'sawtooth',.075*gain,31);o(52,.38,'triangle',.045*gain,44,.08);break;
      case'step':this.noise(.06,.12*gain,500);break;case'engine':o(48,.2,'sawtooth',.055*gain,48+gain*18);break;
      case'scanner':o(420,.22,'sine',.07,920);o(920,.22,'sine',.06,420,.22);break;
      case'sheep':for(let i=0;i<5;i++)o(185+i%2*32,.13,'sawtooth',.16,220-i*8,i*.075);break;
      case'ghost':o(260,.85,'sine',.18,490);o(490,.75,'sine',.15,210,.55);break;
      case'pumpkin':o(67,.65,'sawtooth',.1,42);o(113,.45,'triangle',.1,77,.2);break;
      case'bat':o(1400,.06,'sine',.11,2100);o(2100,.06,'sine',.08,1200,.12);this.noise(.08,.05*gain,3500);break;
      case'demon':o(72,.55,'sawtooth',.16,38);o(126,.4,'triangle',.12,70,.22);break;
      case'enemyBreak':this.noise(.2,.32*gain,1500);o(180,.28,'sawtooth',.18,55);o(520,.16,'square',.09,280,.06);o(780,.22,'sine',.06,1060,.12);break;
      case'pulse':o(980,.16,'sawtooth',.18,190,.02);o(480,.2,'sine',.12,90,.08);break;
      case'hit':o(155,.12,'square',.13,68);break;
      case'upgrade':[440,554,659,880].forEach((f,i)=>o(f,.19,'sine',.14,f*1.2,i*.11));break;
      case'rain':this.noise(.55,.035*gain,1800);break;
      case'pet':o(440,.15,'sine',.15,660);o(660,.25,'sine',.12,880,.12);break;
    }
  }
  tick(time,{menu=false,halloween=true,moving=false,grounded=false,driving=false,speed=0,braking=false,skidding=false,goliath=false}={}){
    if(!this.ctx||this.ctx.state!=='running'||document.hidden)return;
    if(time>this.nextMusic){this.nextMusic=time+(menu?.55:.36);const notes=halloween?[110,130.81,164.81,123.47,98,130.81,146.83,123.47]:[110,164.81,220,146.83,130.81,196,261.63,164.81];this.count(menu?'menuMusic':'gameMusic');this.oscillator(notes[this.note++%notes.length],menu?.65:.3,{gain:menu?.13:.08,music:true,wave:'triangle'});if(menu&&this.note%4===0)this.oscillator(notes[(this.note+2)%notes.length]/2,1.5,{gain:.07,music:true,wave:'sine'})}
    if(moving&&grounded&&!driving&&time-this.lastStep>.32){this.lastStep=time;this.play('step')}
    if(driving&&time>this.nextEngine){this.nextEngine=time+.16;this.play('engine',{gain:.42+Math.abs(speed)/15})}
    if(driving&&braking&&time>this.nextBrake){this.nextBrake=time+.34;this.play('brake',{gain:.35+Math.abs(speed)/22})}
    if(driving&&skidding&&time>this.nextSkid){this.nextSkid=time+.42;this.play('skid',{gain:.45+Math.abs(speed)/25})}
    if(goliath&&time>this.nextGoliath){this.nextGoliath=time+.38;this.play('goliathEngine',{gain:.4})}
  }
  inspect(){let peak=0;if(this.analyser){const data=new Float32Array(256);this.analyser.getFloatTimeDomainData(data);for(const v of data)peak=Math.max(peak,Math.abs(v))}return {state:this.ctx?.state||'locked',muted:this.muted,volume:this.volume,events:{...this.events},peak}}
  close(){this.ctx?.close()}
}
