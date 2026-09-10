(() => {
  'use strict';
  const storageKey = 'kyronext.cd-player.v1';
  const state = Object.assign({index:0, volume:80, repeat:'off', shuffle:false, position:0, ejected:false}, JSON.parse(localStorage.getItem(storageKey) || '{}'));
  const audio = new Audio(); audio.preload = 'metadata';
  let tracks = [], ducked = false, lastSaved = 0, volumeFade = null, musicCtx = null, musicSource = null, musicAnalyser = null, eqFrame = 0;
  const $ = id => document.getElementById(id);
  const player = $('cdPlayer'), disc = $('cdDisc'), list = $('cdPlaylist'), volume = $('cdVolume');
  function refreshCdClock() {
    const now = new Date();
    $('cdClockTime').textContent = now.toLocaleTimeString('fr-BE', {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    $('cdClockDate').textContent = now.toLocaleDateString('fr-BE', {weekday:'short', day:'2-digit', month:'short', year:'numeric'}).toUpperCase();
  }
  async function refreshCdStats() {
    try {
      const response = await fetch('/api/system/stats', {cache:'no-store'});
      if (!response.ok) return;
      const data = await response.json();
      $('cdCpu').textContent = `${Math.round(Number(data.cpu) || 0)}%`;
      $('cdGpu').textContent = `${Math.round(Number(data.gpu) || 0)}%`;
      const ram = Number(data.ram_used), total = Number(data.ram_total);
      $('cdRam').textContent = total > 0 ? `${Math.round(ram / total * 100)}%` : '--%';
      $('cdClockTemp').textContent = Number.isFinite(Number(data.temperature)) ? `${Number(data.temperature).toFixed(1)} °C` : '-- °C';
    } catch (_) { /* La lecture audio reste indépendante des statistiques. */ }
  }
  const persist = () => { state.position = audio.currentTime || 0; localStorage.setItem(storageKey, JSON.stringify(state)); };
  const time = value => { value = Math.max(0, Math.floor(value || 0)); return `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`; };
  const current = () => tracks[state.index];
  function stopVisualizer() { cancelAnimationFrame(eqFrame); eqFrame=0; $('cdEqualizer').classList.remove('playing'); $('cdEqualizer').querySelectorAll('i').forEach(bar=>bar.style.height='5%'); }
  function startVisualizer() {
    try {
      if (!musicCtx) {
        musicCtx = new (window.AudioContext || window.webkitAudioContext)();
        musicSource = musicCtx.createMediaElementSource(audio);
        musicAnalyser = musicCtx.createAnalyser(); musicAnalyser.fftSize = 64; musicAnalyser.smoothingTimeConstant = .76;
        musicSource.connect(musicAnalyser); musicAnalyser.connect(musicCtx.destination);
      }
      musicCtx.resume(); const bins=new Uint8Array(musicAnalyser.frequencyBinCount), bars=[...$('cdEqualizer').querySelectorAll('i')];
      $('cdEqualizer').classList.add('playing'); cancelAnimationFrame(eqFrame);
      const draw=()=>{ if(audio.paused){stopVisualizer();return;} musicAnalyser.getByteFrequencyData(bins); bars.forEach((bar,index)=>{const from=Math.floor(index*bins.length/bars.length),to=Math.max(from+1,Math.floor((index+1)*bins.length/bars.length));let total=0;for(let i=from;i<to;i++)total+=bins[i];bar.style.height=`${Math.max(5,Math.round((total/(to-from))/255*100))}%`;}); eqFrame=requestAnimationFrame(draw);}; draw();
    } catch (_) { $('cdEqualizer').classList.add('simulated'); }
  }
  function setStatus(text) { $('cdState').textContent = text; }
  function setVolume(value) { state.volume = Math.max(0, Math.min(100, Number(value))); volume.value = state.volume; $('cdVolumeValue').textContent = `${state.volume}%`; applyVolume(); persist(); }
  function applyVolume() { const target=(state.volume / 100) * (ducked ? .25 : 1), start=audio.volume; clearInterval(volumeFade); let step=0; volumeFade=setInterval(()=>{step++;audio.volume=start+(target-start)*(step/8);if(step>=8){audio.volume=target;clearInterval(volumeFade);}},20); }
  function updateButtons() { $('cdPlay').classList.toggle('active', !audio.paused); $('cdPause').classList.toggle('active', audio.paused && audio.currentTime > 0); $('cdShuffle').classList.toggle('active', state.shuffle); $('cdRepeat').classList.toggle('active', state.repeat !== 'off'); $('cdRepeat').title = `Répétition : ${state.repeat.toUpperCase()}`; }
  function renderTracks() { list.querySelectorAll('.cd-track').forEach(node => node.remove()); const empty = list.querySelector('.cd-empty'); if (empty) empty.remove(); if (!tracks.length) { list.insertAdjacentHTML('beforeend', '<p class="cd-empty">Aucun album chargé.<br>Dépose tes fichiers audio dans <b>app/media/cd</b>, puis ouvre AUDIO pour recharger.</p>'); return; } tracks.forEach((track,index) => { const button=document.createElement('button'); button.type='button'; button.className='cd-track'+(index===state.index?' active':''); button.innerHTML=`<span>${String(index+1).padStart(2,'0')}</span><span>${track.title}</span><span>${time(track.duration_seconds)}</span>`; button.addEventListener('click',()=>loadTrack(index,true)); list.appendChild(button); }); }
  function render() { const track=current(); $('cdTrackIndex').textContent=`Piste ${String((state.index||0)+1).padStart(2,'0')} / ${String(tracks.length).padStart(2,'0')}`; $('cdTitle').textContent=track?.title || 'Aucun CD chargé'; $('cdArtist').textContent=track?.artist || 'Bibliothèque locale'; $('cdAlbum').textContent=track?.album || 'Lecteur CD virtuel'; $('cdYear').textContent=track?.year || '—'; $('cdFormat').textContent=track?.format || '—'; $('cdElapsed').textContent=time(audio.currentTime); $('cdTotal').textContent=time(audio.duration); renderTracks(); updateButtons(); }
  async function loadLibrary(force=false) { if (state.ejected && !force) { render(); return; } try { const response=await fetch('/api/cd/library',{cache:'no-store'}); const data=await response.json(); tracks=data.tracks || []; state.index=Math.max(0,Math.min(state.index,Math.max(0,tracks.length-1))); state.ejected=false; render(); if (tracks.length && !audio.src) loadTrack(state.index,false); } catch (_) { setStatus('BIBLIOTHÈQUE INDISPONIBLE'); } }
  function loadTrack(index, autoplay=false) { if (!tracks.length) return; state.index=(index+tracks.length)%tracks.length; const track=current(); const resume = !autoplay && state.position || 0; audio.src=track.url; audio.load(); audio.onloadedmetadata=()=>{ if (resume && audio.duration > resume) audio.currentTime=resume; render(); if (autoplay) play(); }; state.position=0; render(); persist(); }
  function play() { if (!tracks.length) { setStatus('AUCUNE PISTE CHARGÉE'); return; } if (!audio.src) loadTrack(state.index,true); else audio.play().then(()=>{disc.classList.add('spinning');startVisualizer();setStatus('LECTURE');render();}).catch(()=>setStatus('TOUCHE PLAY POUR AUTORISER L’AUDIO')); }
  function pause() { audio.pause(); disc.classList.remove('spinning');stopVisualizer();setStatus('PAUSE');render();persist(); }
  function stop() { audio.pause(); audio.currentTime=0; disc.classList.remove('spinning');stopVisualizer();setStatus('STOP');render();persist(); }
  function next(forcePlay=false) { if (!tracks.length) return; const index=state.shuffle ? Math.floor(Math.random()*tracks.length) : (state.index+1)%tracks.length; loadTrack(index,forcePlay || !audio.paused); }
  function previous() { if (!tracks.length) return; if (audio.currentTime>3) { audio.currentTime=0; return; } loadTrack(state.index-1,!audio.paused); }
  function eject() { stop(); audio.removeAttribute('src'); audio.load(); tracks=[]; state.index=0; state.position=0; state.ejected=true; setStatus('CD ÉJECTÉ');render();persist(); }
  function cycleRepeat() { state.repeat=state.repeat==='off'?'track':state.repeat==='track'?'all':'off'; setStatus(`RÉPÉTITION ${state.repeat.toUpperCase()}`);updateButtons();persist(); }
  function toggleShuffle(force) { state.shuffle=typeof force==='boolean'?force:!state.shuffle;setStatus(state.shuffle?'ALÉATOIRE ACTIVÉ':'ALÉATOIRE DÉSACTIVÉ');updateButtons();persist(); }
  function toggleList() { list.classList.toggle('cd-list-hidden'); list.style.visibility=list.classList.contains('cd-list-hidden')?'hidden':'visible'; }
  function showAudioOptions() { $('cdUpload').click(); }
  async function importTracks(files) { if (!files.length) return; setStatus('IMPORTATION EN COURS'); const form=new FormData(); [...files].forEach(file=>form.append('files',file)); try { const response=await fetch('/api/cd/upload',{method:'POST',body:form}); const result=await response.json(); if(!response.ok || !result.ok) throw Error(result.error || 'Import impossible'); state.ejected=false; await loadLibrary(true); const first=tracks.findIndex(track=>result.imported.some(name=>track.title.toLowerCase()===name.replace(/\.[^.]+$/,'').replaceAll('_',' ').replaceAll('-',' ').toLowerCase())); if(first>=0) loadTrack(first,true); setStatus(`${result.imported.length} PISTE${result.imported.length>1?'S':''} AJOUTÉE${result.imported.length>1?'S':''}`); } catch(error) { setStatus(`ERREUR : ${error.message}`); } finally { $('cdUpload').value=''; } }
  async function open() { window.stopRadioForCd?.(); player.classList.add('open'); player.setAttribute('aria-hidden','false'); await loadLibrary(true); render(); }
  function close() { player.classList.remove('open'); player.setAttribute('aria-hidden','true'); persist(); }
  audio.addEventListener('timeupdate',()=>{ $('cdElapsed').textContent=time(audio.currentTime); $('cdTotal').textContent=time(audio.duration); if(Date.now()-lastSaved>2500){lastSaved=Date.now();persist();} });
  audio.addEventListener('ended',()=>{ if(state.repeat==='track'){audio.currentTime=0;play();} else if(state.repeat==='all'||state.index<tracks.length-1||state.shuffle){next(true);} else stop(); });
  $('cdNavReturn').addEventListener('click',close); $('cdPlay').addEventListener('click',play); $('cdPause').addEventListener('click',pause); $('cdStop').addEventListener('click',stop); $('cdNext').addEventListener('click',next); $('cdPrev').addEventListener('click',previous); $('cdEject').addEventListener('click',eject); $('cdRepeat').addEventListener('click',cycleRepeat); $('cdShuffle').addEventListener('click',()=>toggleShuffle()); $('cdList').addEventListener('click',toggleList); $('cdAudio').addEventListener('click',showAudioOptions); $('cdImport').addEventListener('click',showAudioOptions); $('cdUpload').addEventListener('change',event=>importTracks(event.target.files)); volume.addEventListener('input',event=>setVolume(event.target.value));
  for(let i=0;i<22;i++){const bar=document.createElement('i');bar.style.setProperty('--h',`${20+Math.round(Math.random()*80)}%`);bar.style.setProperty('--d',`${(i%6)*.08}s`);$('cdEqualizer').appendChild(bar);}
  setVolume(state.volume); window.openCdPlayer=open; window.closeCdPlayer=close; window.pauseCdPlayer=pause; window.cdPlayerDucking=active=>{ducked=!!active;applyVolume();player.classList.toggle('ducked',ducked);}; window.handleCdPlayerAction=action=>{ if(!action||!action.startsWith('cd_'))return; if(action==='cd_open')return open(); if(action==='cd_close')return close(); if(action==='cd_play'){ if(!player.classList.contains('open')) return open().then(play); return play(); } if(action==='cd_pause')return pause(); if(action==='cd_stop')return stop(); if(action==='cd_next')return next(); if(action==='cd_previous')return previous(); if(action==='cd_eject')return eject(); if(action==='cd_shuffle_on')return toggleShuffle(true); if(action==='cd_shuffle_off')return toggleShuffle(false); if(action==='cd_repeat_track'){state.repeat='track';updateButtons();persist();return;} if(action==='cd_repeat_all'){state.repeat='all';updateButtons();persist();return;} if(action==='cd_repeat_off'){state.repeat='off';updateButtons();persist();return;} if(action==='cd_volume_up')return setVolume(state.volume+10); if(action==='cd_volume_down')return setVolume(state.volume-10); const match=action.match(/^cd_volume_(\d+)$/);if(match)setVolume(match[1]);};
  window.SHOW_CD_HITBOXES=window.SHOW_CD_HITBOXES||false; player.classList.toggle('show-hitboxes',window.SHOW_CD_HITBOXES);
  refreshCdClock(); refreshCdStats(); setInterval(refreshCdClock, 1000); setInterval(refreshCdStats, 5000);
  if (new URLSearchParams(location.search).get('cd') === '1') {
    player.classList.add('no-transition');
    open();
    // Le mode direct du lecteur ne doit pas rester masqué par l'écran de démarrage.
    const splash = document.getElementById('kxSplash'); splash?.classList.add('is-hidden'); if (splash) splash.style.display = 'none';
  }
})();
