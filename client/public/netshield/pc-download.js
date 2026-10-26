(function(){
  var message='Téléchargement en cours.';
  function speak(){
    if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window))return false;
    try{
      window.speechSynthesis.cancel();
      var utterance=new SpeechSynthesisUtterance(message);
      utterance.lang='fr-FR';utterance.rate=.88;utterance.pitch=.5;utterance.volume=1;
      var voices=window.speechSynthesis.getVoices();
      var french=voices.filter(function(voice){return /^fr([-_]|$)/i.test(voice.lang||'');});
      var robot=french.find(function(voice){return /robot/i.test(voice.name||'');});
      if(robot)utterance.voice=robot;else if(french.length)utterance.voice=french[0];
      window.speechSynthesis.speak(utterance);return true;
    }catch(_){return false;}
  }
  document.addEventListener('click',function(event){
    var demo=event.target.closest('[data-robot-voice-demo]');if(!demo)return;
    var status=document.querySelector('[data-voice-preview-status]');
    if(speak()){if(status)status.textContent='Aperçu vocal lancé · aucun fichier téléchargé.';}
    else if(status)status.textContent='La synthèse vocale n’est pas disponible dans ce navigateur.';
  });
  document.addEventListener('click',function(event){
    var link=event.target.closest('[data-netshield-download]');
    if(!link)return;
    var statuses=document.querySelectorAll('[data-download-status]');
    for(var i=0;i<statuses.length;i++)statuses[i].textContent=message;
    speak(); /* Speech support varies; the download link remains usable. */
  });
})();
