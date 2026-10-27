(() => {
  const size = document.getElementById('installerSize');
  const sha = document.getElementById('installerSha');
  fetch('download-info.json', {cache: 'no-store'})
    .then(response => { if (!response.ok) throw new Error('metadata indisponible'); return response.json(); })
    .then(info => {
      if (size) size.textContent = 'Fichier prêt · ' + info.sizeFormatted + ' · SHA-256 vérifié';
      if (sha) sha.textContent = info.sha256;
    })
    .catch(() => {
      if (size) size.textContent = 'Installateur en préparation locale · aucune taille annoncée avant vérification.';
      if (sha) sha.textContent = 'L’empreinte sera affichée dès que le fichier final sera généré.';
    });
  const link = document.getElementById('downloadButton');
  const status = document.getElementById('downloadStatus');
  if (!link || !status) return;
  link.addEventListener('click', () => {
    const message = 'Téléchargement de KYRONEXT OS pour Windows. Installation par utilisateur, sans Jetson ni connexion à un serveur.';
    status.textContent = message;
    try {
      if (window.KittVoice) window.KittVoice.speak(message, { lang: 'fr-FR', rate: .82, pitch: .7, replacePending: true });
      else if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) { const announcement = new SpeechSynthesisUtterance(message); announcement.lang = 'fr-FR'; announcement.rate = .82; announcement.pitch = .7; window.speechSynthesis.speak(announcement); }
    } catch (_) { status.textContent = 'Le téléchargement démarre. La voix du navigateur n’est pas disponible.'; }
  });
})();
