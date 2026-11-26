(() => {
  const lab = document.getElementById('kx-build');
  const consoleLines = document.getElementById('kx-build-console');
  const status = document.getElementById('mission-status');
  const progress = document.getElementById('mission-progress');
  const launch = document.getElementById('mission-launch');
  const choices = [...lab.querySelectorAll('select')];
  const frame = document.querySelector('.kx-frame');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let timers = [];
  let trigger;

  document.querySelectorAll('.kx-mission-links a').forEach(link => {
    link.addEventListener('click', event => {
      const card = document.getElementById(link.hash.slice(1));
      if (!card) return;
      event.preventDefault();
      const open = new MouseEvent('click', { bubbles: true, cancelable: true });
      open.kyronexTrigger = link;
      card.dispatchEvent(open);
    });
  });

  function reset() {
    timers.forEach(clearTimeout);
    timers = [];
    progress.value = 0;
    status.textContent = 'Prêt pour le diagnostic';
    launch.disabled = false;
  }

  lab.addEventListener('kyronex:open', ({ detail }) => {
    trigger = detail.trigger;
    reset();
    choices.forEach((select, index) => {
      select.selectedIndex = (detail.unit === '08' ? [0, 1, 2, 3] : [0, 0, 1, 2])[index];
    });
    choices[0].dispatchEvent(new Event('change'));
    document.getElementById('kx-build-message').textContent = detail.unit === '08'
      ? 'Banc Hervé. Compare les plateformes Jetson et prépare un profil à valider sur le matériel.'
      : 'Mission Jo Knight Rider. Compose une unité embarquée et déroule sa séquence de départ.';
    frame.inert = true;
    lab.querySelector('button').focus();
  });

  new MutationObserver(() => {
    if (!lab.hidden) return;
    reset();
    frame.inert = false;
    trigger?.focus();
  }).observe(lab, { attributes: true, attributeFilter: ['hidden'] });

  lab.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...lab.querySelectorAll('button:not(:disabled), select')];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  choices.forEach(select => select.addEventListener('change', event => {
    if (!event.isTrusted) return;
    reset();
    consoleLines.replaceChildren();
  }));

  launch.addEventListener('click', () => {
    reset();
    const [owner, profile, jetson, model] = choices.map(select => select.value);
    const note = [
      'Choisir une plateforme avant de comparer les modèles.',
      'Orin Nano 8 Go : estimer le poids du modèle et du contexte sur une configuration compacte.',
      'Orin NX 16 Go : comparer les besoins de mémoire pour plusieurs tailles de contexte.',
      'AGX Orin : confirmer la variante et la mémoire avant de choisir le modèle.',
    ][choices[2].selectedIndex];
    const bench = lab.classList.contains('kx-build-08');
    const steps = [
      bench ? 'Banc virtuel ouvert' : 'Cockpit virtuel initialisé',
      `Profil ${profile} · ${choices[0].selectedIndex ? owner : 'propriétaire à définir'}`,
      choices[2].selectedIndex ? `Plateforme retenue pour étude : ${jetson}` : 'Plateforme à choisir',
      choices[3].selectedIndex ? `Famille ${model} · variante et quantification à définir` : 'Famille LLM à sélectionner',
      note,
    ];
    launch.disabled = true;
    status.textContent = 'Diagnostic simulé en cours';
    consoleLines.replaceChildren();
    steps.forEach((step, index) => {
      timers.push(setTimeout(() => {
        const line = document.createElement('p');
        const number = document.createElement('b');
        number.textContent = String(index + 1).padStart(2, '0');
        line.append(number, ` ${step}`);
        consoleLines.append(line);
        progress.value = index + 1;
        if (index === steps.length - 1) {
          status.textContent = 'Diagnostic terminé · hypothèses à valider';
          launch.disabled = false;
        }
      }, reducedMotion.matches ? 0 : 320 * (index + 1)));
    });
  });
})();
