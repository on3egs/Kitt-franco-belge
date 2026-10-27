(function(){
  var message='Téléchargement en cours.';
  function speak(){
    if(window.KittVoice)return window.KittVoice.speak(message,{lang:'fr-FR',rate:.78,pitch:.58,replacePending:true});
    if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window))return false;
    try{var utterance=new SpeechSynthesisUtterance(message);utterance.lang='fr-FR';utterance.rate=.78;utterance.pitch=.58;window.speechSynthesis.speak(utterance);return true;}catch(_){return false;}
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
