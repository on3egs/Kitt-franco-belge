// Lecture locale des dialogues ; aucune photo ni aucun PIN ne sont transmis.
export class Narrator {
  constructor(){this.enabled=true;this.volume=1;this.muted=false;this.maleVoice='';this.femaleVoice='';this.requests=0;this.lastText='';this.lastError='';this.available='speechSynthesis'in window}
  configure({enabled=true,volume=1,muted=false,maleVoice='',femaleVoice=''}){this.enabled=enabled;this.volume=volume;this.muted=muted;this.maleVoice=maleVoice;this.femaleVoice=femaleVoice;if(!enabled||muted)this.cancel()}
  speak(text,force=false,speaker=''){
    if(!this.available||this.muted||!this.enabled&&!force)return false;
    this.cancel();const utterance=new SpeechSynthesisUtterance(text),voices=speechSynthesis.getVoices(),french=voices.filter(v=>/^fr(?:-|$)/i.test(v.lang));
    // Les navigateurs n'exposent pas toujours le genre : on privilégie des voix françaises connues, puis on retombe sur la meilleure voix disponible.
    const female=/lilou|alexia|bonnie|april|pilote_femme/i.test(speaker),femaleName=/hortense|amelie|am[eé]lie|denise|julie|audrey|marie|celine|céline|female|femme/i,maleName=/thomas|henri|paul|nicolas|male|homme/i,wanted=female?femaleName:maleName,pref=female?this.femaleVoice:this.maleVoice;
    utterance.voice=voices.find(v=>pref&&(v.voiceURI===pref||v.name===pref))||french.find(v=>wanted.test(v.name))||french.find(v=>(female?femaleName:maleName).test(v.name))||french.find(v=>/^fr-BE/i.test(v.lang))||french[0]||null;
    utterance.lang=utterance.voice?.lang||'fr-FR';utterance.rate=.94;utterance.volume=this.volume;utterance.onerror=e=>this.lastError=e.error;this.lastText=text;this.requests++;speechSynthesis.speak(utterance);return true;
  }
  cancel(){if(this.available)speechSynthesis.cancel()}
  inspect(){return {supported:this.available,enabled:this.enabled,requests:this.requests,lastText:this.lastText,error:this.lastError,frenchVoices:this.available?speechSynthesis.getVoices().filter(v=>/^fr/i.test(v.lang)).length:0}}
}
