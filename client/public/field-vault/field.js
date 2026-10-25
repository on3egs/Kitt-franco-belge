let installPrompt;
const installButton = document.querySelector('#install');
const installHelp = document.querySelector('#installHelp');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
});

installButton?.addEventListener('click', async () => {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = undefined;
    return;
  }
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent);
  installHelp.textContent = isAppleMobile
    ? 'Dans Safari : Partager, puis « Sur l’écran d’accueil ».'
    : 'Utilisez « Installer l’application » dans le menu ou la barre d’adresse du navigateur.';
});
