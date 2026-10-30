(() => {
  const read = document.getElementById('read');
  const stop = document.getElementById('stop');
  const status = document.getElementById('voice-status');
  if (!('speechSynthesis' in window)) {
    read.disabled = true;
    status.textContent = 'La lecture vocale n’est pas disponible dans ce navigateur. Toute la présentation reste lisible sur cette page.';
    return;
  }
  const synth = window.speechSynthesis;
  let current;
  const reset = message => { current = undefined; read.disabled = false; stop.disabled = true; status.textContent = message; };
  read.addEventListener('click', () => {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance('Découvrez Kyronext OS, une création Kyronext Systems, By Manix. C’est une véritable distribution Linux Live, basée sur Debian 13 avec le bureau KDE Plasma. La version 0.1 Developer Preview démarre sur un PC virtuel AMD 64 bits et présente une interface graphite et rouge personnalisable. Le nom officiel reste Kyronext OS. Ce projet indépendant n’est pas affilié à Knight Rider. L’image publique n’est pas encore disponible. Vous pouvez télécharger la fiche technique sur cette page. Cette préversion ne propose aucun installateur actif ni modèle d’intelligence artificielle. La compatibilité des ordinateurs physiques doit être testée individuellement.');
    utterance.lang = 'fr-FR'; utterance.rate = 0.96;
    const voices = synth.getVoices();
    utterance.voice = voices.find(v => v.lang.toLowerCase().startsWith('fr') && v.localService) || voices.find(v => v.lang.toLowerCase().startsWith('fr')) || null;
    current = utterance;
    utterance.onend = () => { if (current === utterance) reset('Présentation terminée.'); };
    utterance.onerror = () => { if (current === utterance) reset('Lecture interrompue ou indisponible. Le texte reste consultable.'); };
    read.disabled = true; stop.disabled = false;
    status.textContent = 'Lecture en cours avec la synthèse de votre navigateur ; la disponibilité et le traitement dépendent de votre système.';
    synth.speak(utterance);
  });
  stop.addEventListener('click', () => { current = undefined; synth.cancel(); reset('Lecture arrêtée.'); });
  window.addEventListener('pagehide', () => synth.cancel());
})();
