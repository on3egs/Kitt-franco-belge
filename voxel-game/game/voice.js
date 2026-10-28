// Lecture locale des dialogues ; aucune photo ni aucun PIN ne sont transmis.
export class Narrator {
  constructor(){this.enabled=true;this.volume=1;this.muted=false;this.requests=0;this.lastText='';this.lastError='';this.available='speechSynthesis'in window}
  configure({enabled=true,volume=1,muted=false}){this.enabled=enabled;this.volume=volume;this.muted=muted;if(!enabled||muted)this.cancel()}
  speak(text,force=false){
    if(!this.available||this.muted||!this.enabled&&!force)return false;
    this.cancel();const utterance=new SpeechSynthesisUtterance(text);const voices=speechSynthesis.getVoices();utterance.voice=voices.find(v=>/^fr-BE/i.test(v.lang))||voices.find(v=>/^fr/i.test(v.lang))||null;utterance.lang=utterance.voice?.lang||'fr-FR';utterance.rate=.94;utterance.volume=this.volume;utterance.onerror=e=>this.lastError=e.error;this.lastText=text;this.requests++;speechSynthesis.speak(utterance);return true;
  }
  cancel(){if(this.available)speechSynthesis.cancel()}
  inspect(){return {supported:this.available,enabled:this.enabled,requests:this.requests,lastText:this.lastText,error:this.lastError,frenchVoices:this.available?speechSynthesis.getVoices().filter(v=>/^fr/i.test(v.lang)).length:0}}
}
