(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const hub = $('mediaHub'), radioAudio = $('radioAudio'), videoPlayer = $('videoPlayer');
  const stationsKey = 'kyronext.radio.stations.v1';
  let stations = [];
  try { stations = JSON.parse(localStorage.getItem(stationsKey) || '[]'); } catch (_) { stations = []; }
  const saveStations = () => localStorage.setItem(stationsKey, JSON.stringify(stations.slice(0, 12)));
  const setStatus = text => { $('mediaStatus').textContent = text; };
  function renderStations() {
    const target = $('radioStations'); target.innerHTML = '';
    if (!stations.length) { target.innerHTML = '<div class="radio-empty">Aucune radio enregistrée. Ajoute un flux audio HTTPS ci-dessus.</div>'; return; }
    stations.forEach((station, index) => {
      const row = document.createElement('div'); row.className = 'radio-station';
      row.innerHTML = `<strong>${station.name.replace(/[&<>"']/g, '')}</strong><button type="button" data-index="${index}">ÉCOUTER</button><button type="button" data-remove="${index}" aria-label="Supprimer ${station.name}">×</button>`;
      row.querySelector('[data-index]').addEventListener('click', () => playRadio(station));
      row.querySelector('[data-remove]').addEventListener('click', () => { stations.splice(index, 1); saveStations(); renderStations(); });
      target.appendChild(row);
    });
  }
  function validUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch (_) { return ''; } }
  function playRadio(station) {
    const url = validUrl(station.url); if (!url) { setStatus('URL RADIO INVALIDE'); return; }
    window.pauseCdPlayer?.(); videoPlayer.pause(); radioAudio.src = url;
    radioAudio.play().then(() => setStatus(`RADIO : ${station.name}`)).catch(() => setStatus('TOUCHE LECTURE POUR AUTORISER LE FLUX'));
  }
  function addRadio() {
    const name = $('radioName').value.trim() || 'Radio locale'; const url = validUrl($('radioUrl').value.trim());
    if (!url) { setStatus('ENTRE UNE URL HTTP(S) VALIDE'); $('radioUrl').focus(); return; }
    stations.unshift({name, url}); saveStations(); renderStations(); $('radioName').value = ''; $('radioUrl').value = ''; playRadio(stations[0]);
  }
  function show(kind) {
    window.pauseCdPlayer?.(); hub.classList.add('open'); hub.setAttribute('aria-hidden', 'false');
    $('radioView').hidden = kind !== 'radio'; $('videoView').hidden = kind !== 'video';
    $('mediaRadioTab').classList.toggle('active', kind === 'radio'); $('mediaVideoTab').classList.toggle('active', kind === 'video');
    $('mediaTitle').textContent = kind === 'radio' ? 'RADIO KYRONEXT' : 'VIDÉO KYRONEXT';
    setStatus('PRÊT');
  }
  function close() { hub.classList.remove('open'); hub.setAttribute('aria-hidden', 'true'); }
  $('mediaBack').addEventListener('click', close); $('mediaRadioTab').addEventListener('click', () => show('radio')); $('mediaVideoTab').addEventListener('click', () => show('video')); $('radioAdd').addEventListener('click', addRadio);
  $('radioUrl').addEventListener('keydown', event => { if (event.key === 'Enter') addRadio(); });
  $('videoFile').addEventListener('change', event => {
    const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith('video/')) { setStatus('FORMAT VIDÉO INVALIDE'); return; }
    if (videoPlayer.src.startsWith('blob:')) URL.revokeObjectURL(videoPlayer.src); videoPlayer.src = URL.createObjectURL(file); $('videoStatus').textContent = file.name; videoPlayer.play().catch(() => {}); setStatus('VIDÉO CHARGÉE');
  });
  $('cdNavReturn').addEventListener('click', () => window.closeCdPlayer?.());
  $('cdNavConversation').addEventListener('click', () => { window.closeCdPlayer?.(); $('input')?.focus(); });
  $('cdNavVehicle').addEventListener('click', () => { window.closeCdPlayer?.(); $('cmdVehicle')?.click(); });
  $('cdNavRadio').addEventListener('click', () => { window.closeCdPlayer?.(); show('radio'); });
  $('cdNavVideo').addEventListener('click', () => { window.closeCdPlayer?.(); show('video'); });
  $('cdNavCamera').addEventListener('click', () => { window.closeCdPlayer?.(); $('cmdVigilance')?.click(); });
  $('cdNavSettings').addEventListener('click', () => { window.closeCdPlayer?.(); $('cmdSettings')?.click(); });
  radioAudio.addEventListener('playing', () => setStatus('RADIO EN LECTURE')); radioAudio.addEventListener('error', () => setStatus('FLUX RADIO INDISPONIBLE')); videoPlayer.addEventListener('ended', () => setStatus('VIDÉO TERMINÉE'));
  window.openMediaHub = show; window.closeMediaHub = close; window.stopRadioForCd = () => { radioAudio.pause(); };
  renderStations();
  const requestedMedia = new URLSearchParams(location.search).get('media');
  if (requestedMedia === 'radio' || requestedMedia === 'video') {
    show(requestedMedia);
    const splash = document.getElementById('kxSplash'); splash?.classList.add('is-hidden'); if (splash) splash.style.display = 'none';
  }
})();
