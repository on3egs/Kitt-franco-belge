(function(){
  var message='Téléchargement en cours.';
  document.addEventListener('click',function(event){
    var link=event.target.closest('[data-netshield-download]');
    if(!link)return;
    var statuses=document.querySelectorAll('[data-download-status]');
    for(var i=0;i<statuses.length;i++)statuses[i].textContent=message;
    if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window))return;
    try{
      window.speechSynthesis.cancel();
      var utterance=new SpeechSynthesisUtterance(message);
      utterance.lang='fr-FR';utterance.rate=.88;utterance.pitch=.5;utterance.volume=1;
      var voices=window.speechSynthesis.getVoices();
      var french=voices.filter(function(voice){return /^fr([-_]|$)/i.test(voice.lang||'');});
      var robot=french.find(function(voice){return /robot/i.test(voice.name||'');});
      if(robot)utterance.voice=robot;else if(french.length)utterance.voice=french[0];
      window.speechSynthesis.speak(utterance);
    }catch(_){/* Speech support varies; the download link remains usable. */}
  });
})();
