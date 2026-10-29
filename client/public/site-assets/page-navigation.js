/* Navigation de secours partagée par les pages HTML statiques. */
(() => {
  if (document.querySelector('[data-kitt-page-nav], .kitt-page-quick-links')) return;

  const links = [...document.querySelectorAll('a[href]')];
  const hasHome = links.some((link) => {
    try { return new URL(link.href, location.href).pathname === '/' || /accueil|home/i.test(`${link.textContent} ${link.getAttribute('aria-label') || ''}`); }
    catch { return false; }
  });
  const hasArcade = links.some((link) => {
    try { return ['/jeux', '/jeux/', '/static/games/index.html'].includes(new URL(link.href, location.href).pathname); }
    catch { return false; }
  });
  if (hasHome && hasArcade) return;

  const style = document.createElement('style');
  style.textContent = `
    [data-kitt-page-nav]{position:fixed;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:2147483000;display:flex;gap:6px;pointer-events:none}
    [data-kitt-page-nav] a,[data-kitt-page-nav] button{pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 12px;border:1px solid #ff676778;border-radius:999px;background:#100c14ed;color:#f5edf5;box-shadow:0 5px 20px #0008;font:700 11px/1 system-ui,sans-serif;text-decoration:none;cursor:pointer;backdrop-filter:blur(10px)}
    [data-kitt-page-nav] a:hover,[data-kitt-page-nav] button:hover{background:#4a1421;color:#fff;border-color:#ff9292}
    [data-kitt-page-nav] :focus-visible{outline:2px solid #ffd36e;outline-offset:3px}
    @media(max-width:520px){[data-kitt-page-nav]{top:max(8px,env(safe-area-inset-top));right:max(8px,env(safe-area-inset-right));gap:4px}[data-kitt-page-nav] a,[data-kitt-page-nav] button{min-height:36px;padding:0 9px;font-size:10px}}
  `;
  document.head.append(style);

  const nav = document.createElement('nav');
  nav.dataset.kittPageNav = '';
  nav.setAttribute('aria-label', 'Navigation du site KITT Franco-Belge');
  if (!hasArcade) {
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = '← Retour';
    back.setAttribute('aria-label', 'Retour à la page précédente ou aux jeux');
    back.addEventListener('click', () => {
      const fromThisSite = document.referrer && new URL(document.referrer).origin === location.origin;
      if (history.length > 1 && fromThisSite) history.back();
      else location.assign('/jeux');
    });
    nav.append(back);
  }
  if (!hasHome) {
    const home = document.createElement('a');
    home.href = '/';
    home.textContent = '⌂ Accueil';
    home.setAttribute('aria-label', 'Accueil KITT Franco-Belge');
    nav.append(home);
  }
  document.body.append(nav);
})();
