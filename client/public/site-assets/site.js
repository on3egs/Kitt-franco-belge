document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);button.textContent='Empreinte copiée';}catch{button.textContent='Sélectionnez et copiez l’empreinte ci-dessus';}}));(() => {
  if (location.pathname === '/' || document.querySelector('.kitt-page-quick-links')) return;
  const nav = document.createElement('nav');
  nav.className = 'kitt-page-quick-links';
  nav.setAttribute('aria-label', 'Navigation rapide');
  const back = document.createElement('button');
  back.type = 'button';
  back.setAttribute('aria-label', 'Retour à la page précédente');
  back.textContent = '← Retour';
  back.addEventListener('click', () => history.length > 1 ? history.back() : location.assign('/'));
  const home = document.createElement('a');
  home.href = '/';
  home.setAttribute('aria-label', 'Accueil KITT Franco-Belge');
  home.textContent = '⌂ Accueil';
  nav.append(back, home);
  document.body.append(nav);
})();
