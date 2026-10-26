(function(){
  var scenarios={
    active:{title:'FILTRAGE DNS ACTIF · SIMULATION',copy:'Les domaines de la liste sont bloqués. Le DNS du PC n’est pas lu.',ad:'Bloqué → 0.0.0.0',site:'Autorisé → DNS amont',foot:'Compteurs fictifs : 124 requêtes · 18 blocages. Cette animation ne modifie aucun réglage Windows.',bars:[34,52,43,72,58,88,68]},
    paused:{title:'FILTRAGE SUSPENDU · SIMULATION',copy:'Le moteur transmet les requêtes sans appliquer la liste de blocage.',ad:'Transmis → DNS amont',site:'Transmis → DNS amont',foot:'Simulation : pendant une pause réelle, le DNS reste local et le moteur laisse passer les domaines.',bars:[42,38,60,51,72,59,83]},
    restored:{title:'DNS D’ORIGINE · SIMULATION',copy:'Les cartes utiliseraient leurs DNS sauvegardés avant l’installation.',ad:'Sans filtre Manix',site:'DNS précédent',foot:'Simulation : dans le logiciel, « Restaurer mes DNS » applique réellement la sauvegarde et demande les droits Windows.',bars:[55,44,69,40,63,47,72]}
  };
  var buttons=document.querySelectorAll('[data-demo-mode]');
  var board=document.querySelector('[data-demo-state]');
  var sound=document.querySelector('[data-sfx-toggle]');
  var audio=null;
  function beep(){
    if(!sound||!sound.checked)return;
    try{
      var Audio=window.AudioContext||window.webkitAudioContext;
      if(!Audio)return;
      if(!audio)audio=new Audio();
      if(audio.state==='suspended')audio.resume();
      var now=audio.currentTime;
      [[880,0],[587,.105],[988,.21]].forEach(function(tone){
        var osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter();
        osc.type='square';osc.frequency.setValueAtTime(tone[0],now+tone[1]);
        filter.type='lowpass';filter.frequency.setValueAtTime(1450,now+tone[1]);
        gain.gain.setValueAtTime(.0001,now+tone[1]);gain.gain.exponentialRampToValueAtTime(.045,now+tone[1]+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+tone[1]+.095);
        osc.connect(filter);filter.connect(gain);gain.connect(audio.destination);osc.start(now+tone[1]);osc.stop(now+tone[1]+.1);
      });
    }catch(_){/* Audio hardware or browser policy may disable optional cues. */}
  }
  if(sound){try{sound.checked=localStorage.getItem('manixNetShieldPcSfx')==='on';}catch(_){}sound.addEventListener('change',function(){try{localStorage.setItem('manixNetShieldPcSfx',sound.checked?'on':'off');}catch(_){}if(sound.checked)beep();});}
  if(board&&buttons.length)buttons.forEach(function(button){button.addEventListener('click',function(){
    var mode=button.getAttribute('data-demo-mode'),data=scenarios[mode];
    if(!data)return;
    board.setAttribute('data-demo-state',mode);
    document.querySelector('[data-demo-title]').textContent=data.title;
    document.querySelector('[data-demo-copy]').textContent=data.copy;
    document.querySelector('[data-demo-ad]').textContent=data.ad;
    document.querySelector('[data-demo-site]').textContent=data.site;
    document.querySelector('[data-demo-foot]').textContent=data.foot;
    document.querySelectorAll('[data-demo-bars] i').forEach(function(bar,index){bar.style.setProperty('--h',data.bars[index]+'%');});
    buttons.forEach(function(item){var selected=item===button;item.setAttribute('aria-pressed',selected?'true':'false');item.classList.toggle('secondary',!selected);});
    beep();
  });});
  var copyCommand=document.querySelector('[data-copy-dns-command]');
  if(copyCommand)copyCommand.addEventListener('click',function(){copyText(document.querySelector('[data-dns-check-command]').textContent.trim(),document.querySelector('[data-copy-status]'));});
  function copyText(value,status){
    function done(ok){status.textContent=ok?'Commande copiée. Collez-la dans PowerShell après activation.':'Copie indisponible. Sélectionnez le texte et copiez-le manuellement.';if(ok)beep();}
    if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(value).then(function(){done(true);},function(){done(false);});return;}
    var field=document.createElement('textarea');field.value=value;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();try{done(document.execCommand('copy'));}catch(_){done(false);}finally{field.remove();}
  }
  var input=document.querySelector('[data-rule-domain]'),ruleTypes=document.querySelectorAll('[data-rule-type]'),output=document.querySelector('[data-rule-output]'),result=document.querySelector('[data-rule-result]'),copyRule=document.querySelector('[data-rule-copy]'),selected='deny',normalized='';
  function validateDomain(value){
    var name=value.trim().replace(/\.$/,'').toLowerCase();
    if(name.length<3||name.length>253||!name.includes('.'))return null;
    var labels=name.split('.');
    if(labels.some(function(label){return label.length<1||label.length>63||!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);}))return null;
    return name;
  }
  function refreshRule(){
    if(!input)return;
    normalized=validateDomain(input.value)||'';
    output.textContent=normalized||'—';copyRule.disabled=!normalized;
    result.textContent=normalized?(selected==='allow'?'Aperçu : autoriser « '+normalized+' » et ses sous-domaines.':'Aperçu : bloquer « '+normalized+' » et ses sous-domaines.'):'Saisissez un domaine valide, sans protocole ni chemin (ex. ads.exemple.fr).';
  }
  if(input){input.addEventListener('input',refreshRule);ruleTypes.forEach(function(button){button.addEventListener('click',function(){selected=button.getAttribute('data-rule-type');ruleTypes.forEach(function(item){var active=item===button;item.setAttribute('aria-pressed',active?'true':'false');item.classList.toggle('secondary',!active);});refreshRule();beep();});});copyRule.addEventListener('click',function(){if(normalized)copyText(normalized,document.querySelector('[data-rule-copy-status]'));});}
})();
