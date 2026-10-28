/* KITT Cockpit — additive navigation and local tools for every public page. */
(() => {
  'use strict';
  if (customElements.get('kitt-cockpit')) return;
  const VERSION = '20261026-1';
  const CATALOG = [
    ['/jeux/', 'Arcade KITT · tous les jeux', 'Applications', 'Jeux de construction, course, arcade et coopération.', 'time'],
    ['https://kitt.kitt-franco-belge.be/static/games/kitt-blocks/', 'KITT · Monde en blocs', 'Applications', 'Minecraft, voxel, Halloween, moutons et salles de 16 joueurs.', 'time'],
    ['/', 'Centre de commande', 'Découvrir', 'Choisissez votre parcours dans l’univers KITT.', 'brief'],
    ['/videos', 'Galerie vidéo', 'Communauté', 'Explorez les vidéos et préparez vos repères de lecture.', 'time'],
    ['/musique', 'Musique', 'Communauté', 'Retrouvez les créations musicales et notez vos favoris.', 'time'],
    ['/documents', 'Documents', 'Communauté', 'Retrouvez les PDF et organisez vos notes de lecture.', 'units'],
    ['/soumettre', 'Partager une vidéo', 'Participer', 'Préparez le titre, la source et les informations de votre vidéo.', 'url'],
    ['/soumettre-musique', 'Partager une musique', 'Participer', 'Préparez les crédits et le lien de votre création.', 'url'],
    ['/soumettre-pdf', 'Partager un document', 'Participer', 'Préparez le titre, la description et la source du document.', 'url'],
    ['/karr', 'KARR', 'Découvrir', 'Explorez le personnage et les technologies du projet.', 'brief'],
    ['/manix', 'Manix', 'Découvrir', 'Découvrez le créateur et préparez votre idée de projet.', 'brief'],
    ['/kyronex/', 'Terminal KITT', 'Applications', 'Accédez aux commandes existantes du terminal.', 'network'],
    ['/kyronex', 'Tableau de bord KYRONEX', 'Applications', 'Retrouvez les connexions et les commandes du tableau de bord.', 'network'],
    ['/kyronext-os/', 'Kyronext OS', 'Applications', 'Explorez les applications de votre cockpit virtuel.', 'units'],
    ['/shadow-of-karr/', 'Shadow of KARR', 'Applications', 'Retrouvez le jeu et gardez vos notes de progression.', 'time'],
    ['/field-vault/app/', 'Field Vault · application', 'Applications', 'Organisez vos ressources et votre préparation hors ligne.', 'units'],
    ['/field-vault/app/guide.html', 'Field Vault · mode d’emploi', 'Guides', 'Repérez les étapes du guide et mémorisez votre lecture.', 'brief'],
    ['/guide-logiciels/', 'Catalogue des logiciels', 'Guides', 'Comparez les usages et choisissez votre logiciel.', 'download'],
    ['/nouveautes/', 'Guide du nouveau cockpit', 'Guides', 'Découvrez vos outils personnels, les raccourcis et les ambiances.', 'brief'],
    ['/kyronext-studio/', 'Kyronext Studio', 'Logiciels', 'Découvrez le lecteur et préparez son installation.', 'download'],
    ['/sentinel/', 'KITT Sentinel', 'Logiciels', 'Préparez la supervision de vos appareils.', 'network'],
    ['/netshield/', 'Manix NetShield', 'Logiciels', 'Préparez votre installation Windows et AGX.', 'network'],
    ['/field-vault/', 'KYRONEXT Field Vault', 'Logiciels', 'Découvrez le coffre de ressources hors ligne.', 'download'],
    ['/soutenir/', 'Soutenir le projet', 'Participer', 'Choisissez une façon de contribuer et notez votre proposition.', 'brief'],
    ['/privacy', 'Confidentialité', 'Informations', 'Repérez les informations qui concernent vos données.', 'brief'],
    ['/privacy/', 'Confidentialité · document', 'Informations', 'Conservez vos questions et vos repères dans le document.', 'brief'],
    ['/data-deletion', 'Suppression des données', 'Informations', 'Préparez les références utiles à votre demande.', 'brief'],
    ['/data-deletion/', 'Suppression · document', 'Informations', 'Préparez votre demande en suivant les indications de la page.', 'brief'],
    ['/mentions-legales', 'Mentions légales', 'Informations', 'Retrouvez les mentions et notez vos questions.', 'brief'],
    ['/admin', 'Administration', 'Administration', 'Organisez vos opérations sans modifier les commandes existantes.', 'brief'],
    ['/admin-videos', 'Administration vidéo', 'Administration', 'Préparez les vérifications avant publication.', 'url'],
    ['/admin-musique', 'Administration musique', 'Administration', 'Préparez les crédits et les vérifications de publication.', 'url'],
    ['/admin-pdfs', 'Administration documents', 'Administration', 'Organisez la revue des documents.', 'url'],
    ['/404', 'Retrouver une page', 'Informations', 'Utilisez la recherche pour retrouver votre destination.', 'brief'],
  ].map(([path, title, group, hint, tool]) => ({path, title, group, hint, tool}));
  const TASKS = {
    'Découvrir':['Choisir une rubrique à explorer','Conserver un lien utile dans mes favoris','Noter une idée ou une question'],
    'Communauté':['Repérer le contenu recherché','Noter son titre et sa source','Préparer un repère ou un commentaire'],
    'Participer':['Vérifier les informations et les crédits','Préparer une description claire','Relire les indications avant de soumettre'],
    'Applications':['Consulter les commandes et l’aide de l’application','Régler les sons et les animations à mon goût','Noter ma progression avant de quitter'],
    'Guides':['Repérer la section qui me concerne','Noter les prérequis utiles','Marquer mon point de reprise'],
    'Logiciels':['Choisir le paquet adapté à mon appareil','Lire les prérequis et le guide','Conserver le lien de téléchargement officiel'],
    'Informations':['Repérer le passage qui répond à ma question','Noter les références nécessaires','Préparer mon message si un contact est nécessaire'],
    'Administration':['Relire les éléments à publier','Vérifier les sources, liens et crédits','Relire le résultat avant validation'],
  };
  const KEY = 'kitt-cockpit-v1';
  const get = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  let stored; try { stored=JSON.parse(get(KEY)||'{}'); } catch { stored={}; }
  if (!stored || typeof stored!=='object' || Array.isArray(stored)) stored={};
  const state = {
    theme:['kitt','karr','kyro'].includes(stored.theme)?stored.theme:'kitt',
    motion:['cinema','soft','off'].includes(stored.motion)?stored.motion:'cinema',
    volume:Number.isFinite(stored.volume)?Math.max(0,Math.min(1,stored.volume)):.22,
    reading:stored.reading==='large'?'large':'normal', contrast:stored.contrast==='high'?'high':'normal',
    favorites:Array.isArray(stored.favorites)?stored.favorites.filter(p=>CATALOG.some(x=>x.path===p)).slice(0,40):[],
    recent:Array.isArray(stored.recent)?stored.recent.filter(p=>CATALOG.some(x=>x.path===p)).slice(0,8):[],
    pages:stored.pages && typeof stored.pages==='object'&&!Array.isArray(stored.pages)?stored.pages:{},
  };
  let storageOK=true;
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));storageOK=true;}catch{storageOK=false;}};
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let element, audio, lastSound=0, currentPath='', current, observer, scanTimer;
  const activeSounds=new Set();
  const soundOn=()=>get('kitt-sound')!=='off';
  function stopSounds(){for(const node of activeSounds){try{node.stop();}catch{}}activeSounds.clear();}
  const tones={hover:[620,780,.045],click:[340,850,.10],scanner:[160,1300,.32],boot:[110,700,.35],notification:[660,990,.2],glitch:[170,70,.12],ambient:[90,150,.18]};
  function play(kind='click'){
    if(navigator.userActivation && !navigator.userActivation.hasBeenActive)return;
    if(!soundOn()||document.hidden||state.volume===0||performance.now()-lastSound<75)return;
    lastSound=performance.now();
    try{
      audio??=new (window.AudioContext||window.webkitAudioContext)();
      audio.resume().then(()=>{
        if(!soundOn()||document.hidden)return;
        const [from,to,length]=tones[kind]||tones.click, now=audio.currentTime;
        [1,1.5].forEach((harmonic,i)=>{
          const oscillator=audio.createOscillator(), gain=audio.createGain();
          oscillator.type=i?'sine':'triangle';oscillator.frequency.setValueAtTime(from*harmonic,now);
          oscillator.frequency.exponentialRampToValueAtTime(to*harmonic,now+length);
          gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(state.volume*(i?.025:.09),now+.008);
          gain.gain.exponentialRampToValueAtTime(.0001,now+length);
          oscillator.connect(gain);gain.connect(audio.destination);activeSounds.add(oscillator);
          oscillator.onended=()=>{activeSounds.delete(oscillator);oscillator.disconnect();gain.disconnect();};
          oscillator.start(now);oscillator.stop(now+length+.02);
        });
      }).catch(()=>{});
    }catch{/* No sound must ever block a control. */}
  }
  window.kittCockpitSound=play;
  window.addEventListener('kitt-sound-change',()=>{if(!soundOn())stopSounds();element?.syncSettings();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSounds();document.documentElement.dataset.kcPaused=String(document.hidden);element?.setAttribute('data-paused',String(document.hidden));});
  function preferences(){
    const root=document.documentElement;
    root.dataset.kcTheme=state.theme;root.dataset.kcMotion=motionQuery.matches?'off':state.motion;
    root.dataset.kcContrast=state.contrast;root.dataset.kcReading=state.reading;
    element?.setAttribute('data-motion',root.dataset.kcMotion);
    window.dispatchEvent(new Event('kitt-motion-change'));
  }
  motionQuery.addEventListener('change',preferences);preferences();
  function pageState(){
    const p=state.pages[currentPath];
    if(!p||typeof p!=='object'||Array.isArray(p))state.pages[currentPath]={};
    const entry=state.pages[currentPath];
    if(typeof entry.note!=='string')entry.note='';
    entry.note=entry.note.slice(0,10000);
    if(!Array.isArray(entry.tasks))entry.tasks=[];
    return entry;
  }
  const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const make=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;};
  const duration=s=>{s=Math.max(0,Math.round(s));return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(n=>String(n).padStart(2,'0')).join(':');};
  const groups=['Tout','Découvrir','Communauté','Logiciels','Applications','Guides','Participer','Informations'];
  class Cockpit extends HTMLElement{
    connectedCallback(){
      const shadow=this.attachShadow({mode:'open'});
      shadow.innerHTML=`<link rel="stylesheet" href="/site-assets/cockpit-panel.css?v=${VERSION}">
        <button class="launcher" aria-haspopup="dialog" aria-controls="panel" title="Ouvrir le cockpit · Alt + K"><span class="scanner" aria-hidden="true"></span>Cockpit <span class="shortcut">ALT K</span></button>
        <dialog id="panel" aria-labelledby="title"><header><span class="scanner" aria-hidden="true"></span><div class="identity"><small>KNIGHT INTERFACE · BY MANIX</small><h2 id="title">Votre cockpit personnel</h2></div><button class="close" aria-label="Fermer le cockpit">×</button></header>
        <nav aria-label="Outils du cockpit"><button data-tab="explore" aria-current="true">Explorer</button><button data-tab="reading">Cette page</button><button data-tab="saved">Favoris</button><button data-tab="notes">Carnet</button><button data-tab="tools">Outils</button><button data-tab="settings">Ambiance</button></nav>
        <section class="view" id="explore"><div class="section-note"><strong id="context-title"></strong><span id="context-hint"></span></div><label for="search">Rechercher une rubrique, un logiciel ou un guide</label><input class="search" id="search" type="search" placeholder="Ex. musique, NetShield, guide…" autocomplete="off"><div class="pills" id="categories"></div><div class="grid" id="results"></div></section>
        <section class="view" id="reading" hidden><h3 id="page-title"></h3><div class="row"><button class="btn primary" id="favorite">Ajouter aux favoris</button><button class="btn" id="copy">Copier le lien</button><button class="btn" id="share">Partager</button></div><h3>Votre point de reprise</h3><div class="row"><button class="btn" id="bookmark">Marquer ma position</button><button class="btn" id="resume">Reprendre ma lecture</button><button class="btn" id="top">Haut de page ↑</button><button class="btn" id="print">Imprimer</button></div><p class="muted" id="bookmark-info"></p><h3>Sommaire de cette page</h3><div class="outline" id="outline"></div><h3>À découvrir ensuite</h3><div class="grid" id="related"></div></section>
        <section class="view" id="saved" hidden><h3>Mes pages favorites</h3><div id="favorites" class="list"></div><h3>Dernières rubriques visitées</h3><div id="recent" class="list"></div><p class="muted">Ces listes restent dans ce navigateur. Aucune synchronisation avec un serveur.</p></section>
        <section class="view" id="notes" hidden><h3>Mon carnet pour cette page</h3><label for="note">Idées, repères et questions</label><textarea id="note" maxlength="10000" placeholder="Une idée à garder, un passage à retrouver…"></textarea><p class="muted" id="note-status"></p><button class="btn" id="export">Exporter mon carnet en texte</button><h3>Mon parcours</h3><div class="meter"><i id="task-meter"></i></div><div id="tasks"></div><p class="muted">Vos cases sont des repères personnels, pas une vérification automatique.</p><h3>Minuteur de concentration</h3><label for="minutes">Durée en minutes</label><input id="minutes" type="number" min="1" max="180" value="15"><div class="timer" id="timer" role="timer">00:15:00</div><div class="row"><button class="btn primary" id="timer-start">Démarrer</button><button class="btn" id="timer-pause" disabled>Pause</button><button class="btn" id="timer-reset">Réinitialiser</button></div><p class="muted">Le minuteur reste actif tant que cette page est ouverte.</p></section>
        <section class="view" id="tools" hidden><h3>Des outils pratiques, directement ici</h3><label for="tool">Choisir un outil</label><select id="tool"><option value="download">Estimer un téléchargement</option><option value="time">Convertir un repère vidéo / audio</option><option value="url">Examiner un lien avant partage</option><option value="network">Calculer un sous-réseau IPv4</option><option value="units">Convertir un espace de stockage</option><option value="brief">Préparer une fiche de projet</option></select><div id="tool-form"></div><output class="result" id="tool-result" aria-live="polite">Choisissez un outil et renseignez les valeurs.</output><button class="btn" id="tool-copy" style="margin-top:12px">Copier le résultat</button><p class="muted">Calculs locaux : ces outils n’envoient aucune donnée et ne changent aucun réglage de vos appareils.</p></section>
        <section class="view" id="settings" hidden><h3>Composez votre ambiance</h3><div class="two"><div><label for="theme">Couleur du cockpit</label><select id="theme"><option value="kitt">KITT · rouge scanner</option><option value="karr">KARR · ambre</option><option value="kyro">KYRONEXT · bleu glacier</option></select></div><div><label for="motion">Animations</label><select id="motion"><option value="cinema">Cinéma</option><option value="soft">Discrètes</option><option value="off">Arrêtées</option></select></div></div><p class="muted" id="motion-hint"></p><label class="check"><input id="sound" type="checkbox"><span>Effets sonores du site</span></label><label for="volume">Volume des SFX <output id="volume-label"></output></label><input id="volume" type="range" min="0" max="100" step="1"><div class="row"><button class="btn" data-preview="scanner">Scanner</button><button class="btn" data-preview="boot">Démarrage</button><button class="btn" data-preview="notification">Confirmation</button></div><h3>Confort de lecture</h3><label class="check"><input id="contrast" type="checkbox"><span>Renforcer le contraste des textes</span></label><label class="check"><input id="text-size" type="checkbox"><span>Agrandir les textes de lecture</span></label><button class="btn" id="fullscreen">Passer en plein écran</button><h3>Connexion de ce navigateur</h3><span class="connection" id="connection"></span><p class="muted">Ce statut indique la connexion du navigateur, pas la disponibilité d’un Jetson.</p></section>
        <div class="status" role="status" aria-live="polite" id="status">Vos outils locaux · Échap pour fermer · Alt + K pour ouvrir</div></dialog>`;
      this.$=id=>shadow.getElementById(id);this.dialog=this.$('panel');this.tab='explore';this.category='Tout';
      this.remaining=900;this.deadline=0;this.clock=null;this.returnFocus=null;
      shadow.querySelector('.launcher').addEventListener('click',()=>this.open());
      shadow.querySelector('.close').addEventListener('click',()=>this.close());
      this.dialog.addEventListener('close',()=>this.returnFocus?.focus());
      this.dialog.addEventListener('click',e=>{if(e.target===this.dialog){const r=this.dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.close();}});
      shadow.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>this.selectTab(b.dataset.tab)));
      groups.forEach(group=>{const b=make('button',group);b.type='button';b.setAttribute('aria-pressed',String(group===this.category));b.addEventListener('click',()=>{this.category=group;this.$('categories').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));this.renderSearch();});this.$('categories').append(b);});
      this.$('search').addEventListener('input',()=>this.renderSearch());
      this.$('favorite').onclick=()=>{state.favorites=state.favorites.includes(currentPath)?state.favorites.filter(p=>p!==currentPath):[currentPath,...state.favorites].slice(0,40);save();this.renderPage();this.message('Favoris mis à jour.');play('notification');};
      this.$('copy').onclick=()=>this.copy(location.origin+location.pathname+location.hash);
      this.$('share').onclick=async()=>{const data={title:current.title,url:location.origin+location.pathname+location.hash};try{if(navigator.share)await navigator.share(data);else await this.copy(data.url);}catch(e){if(e.name!=='AbortError')this.message('Partage indisponible. Utilisez « Copier le lien ».');}};
      this.$('bookmark').onclick=()=>{pageState().position=scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight);save();this.renderBookmark();this.message('Point de reprise enregistré.');};
      this.$('resume').onclick=()=>{const position=pageState().position;if(typeof position==='number'){this.close();scrollTo({top:Math.max(0,Math.min(1,position))*(document.documentElement.scrollHeight-innerHeight),behavior:this.scrollBehavior()});}};
      this.$('top').onclick=()=>{this.close();scrollTo({top:0,behavior:this.scrollBehavior()});};
      this.$('print').onclick=()=>{this.close();window.print();};
      this.$('note').addEventListener('input',()=>{pageState().note=this.$('note').value;save();this.$('note-status').textContent=storageOK?'Enregistré dans ce navigateur.':'Stockage indisponible : exportez votre carnet avant de fermer.';});
      this.$('export').onclick=()=>{const p=pageState(), tasks=TASKS[current.group]||TASKS.Informations;const text=[current.title,location.origin+location.pathname,'',p.note,'',...tasks.map((t,i)=>`${p.tasks[i]?'[x]':'[ ]'} ${t}`)].join('\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=make('a');a.href=url;a.download='carnet-kitt.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.message('Carnet exporté.');};
      this.$('timer-start').onclick=()=>this.startTimer();this.$('timer-pause').onclick=()=>this.pauseTimer();this.$('timer-reset').onclick=()=>{this.pauseTimer();this.remaining=this.minutes()*60;this.$('timer').textContent=duration(this.remaining);this.$('timer-start').textContent='Démarrer';};
      this.$('minutes').oninput=()=>{if(!this.clock){this.remaining=this.minutes()*60;this.$('timer').textContent=duration(this.remaining);}};
      this.$('tool').onchange=()=>this.renderTool();this.$('tool-copy').onclick=()=>this.copy(this.$('tool-result').textContent);
      for(const id of ['theme','motion'])this.$(id).onchange=()=>{state[id]=this.$(id).value;save();preferences();this.syncSettings();};
      this.$('sound').onchange=()=>{try{localStorage.setItem('kitt-sound',this.$('sound').checked?'on':'off');}catch{}window.dispatchEvent(new CustomEvent('kitt-sound-change',{detail:this.$('sound').checked}));if(this.$('sound').checked)play('notification');};
      this.$('volume').oninput=()=>{state.volume=Number(this.$('volume').value)/100;save();this.$('volume-label').textContent=`${Math.round(state.volume*100)} %`;};
      shadow.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{if(soundOn())play(b.dataset.preview);else this.message('Activez les effets sonores pour écouter un aperçu.');});
      this.$('contrast').onchange=()=>{state.contrast=this.$('contrast').checked?'high':'normal';save();preferences();};
      this.$('text-size').onchange=()=>{state.reading=this.$('text-size').checked?'large':'normal';save();preferences();};
      this.$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else this.message('Le plein écran n’est pas disponible dans ce navigateur.');}catch{this.message('Le navigateur a refusé le passage en plein écran.');}};
      document.addEventListener('fullscreenchange',()=>{this.$('fullscreen').textContent=document.fullscreenElement?'Quitter le plein écran':'Passer en plein écran';});
      shadow.addEventListener('click',e=>{if(e.target.closest('button,a')&&!e.target.closest('[data-preview]'))play('click');});
      this.syncSettings();
    }
    scrollBehavior(){return document.documentElement.dataset.kcMotion==='off'?'instant':'smooth';}
    message(text){this.$('status').textContent=text;}
    async copy(text){try{await navigator.clipboard.writeText(text);this.message('Copié dans le presse-papiers.');play('notification');}catch{this.message('Copie indisponible : sélectionnez le texte à copier.');}}
    open(tab){refreshPage();this.returnFocus=document.activeElement===this?this.shadowRoot.activeElement:document.activeElement;this.selectTab(tab||this.tab);if(!this.dialog.open)this.dialog.showModal();if(this.tab==='explore')this.$('search').focus();play('scanner');}
    close(){this.dialog.close();}
    selectTab(tab){this.tab=tab;this.shadowRoot.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.tab===tab)));this.shadowRoot.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==tab);if(tab==='explore')this.renderSearch();if(tab==='reading')this.renderPage();if(tab==='saved')this.renderSaved();if(tab==='notes')this.renderNotes();if(tab==='settings')this.syncSettings();}
    syncSettings(){if(!this.$)return;for(const id of ['theme','motion'])this.$(id).value=state[id];this.$('volume').value=String(state.volume*100);this.$('volume-label').textContent=`${Math.round(state.volume*100)} %`;this.$('sound').checked=soundOn();this.$('contrast').checked=state.contrast==='high';this.$('text-size').checked=state.reading==='large';this.$('motion-hint').textContent=motionQuery.matches?'Votre préférence système pour réduire les animations est prioritaire.':'Les effets se mettent en pause quand cet onglet est masqué.';this.$('connection').textContent=navigator.onLine?'Navigateur connecté':'Navigateur hors connexion';this.$('connection').className='connection'+(navigator.onLine?'':' offline');}
    card(item){const card=make('article',null,'card'), badge=make('span',item.group,'badge'), a=make('a',item.title), desc=make('small',item.hint);a.href=item.path;card.append(badge,a,desc);return card;}
    renderSearch(){const q=normalize(this.$('search').value);const list=CATALOG.filter(x=>(current?.group==='Administration'||x.group!=='Administration')&&(this.category==='Tout'||x.group===this.category)&&q.split(/\s+/).filter(Boolean).every(word=>normalize(x.title+' '+x.hint+' '+x.group).includes(word)));const target=this.$('results');target.replaceChildren(...list.map(x=>this.card(x)));if(!list.length)target.append(make('p','Aucun résultat. Essayez « guide », « vidéo » ou « KITT ».','empty'));}
    renderBookmark(){const pos=pageState().position;this.$('resume').disabled=typeof pos!=='number';this.$('bookmark-info').textContent=typeof pos==='number'?`Reprise enregistrée à ${Math.round(pos*100)} % de la page.`:'Marquez une position pour reprendre votre lecture plus tard.';}
    renderPage(){this.$('page-title').textContent=current.title;this.$('favorite').textContent=state.favorites.includes(currentPath)?'Retirer de mes favoris':'Ajouter aux favoris';this.$('favorite').disabled=!CATALOG.some(x=>x.path===currentPath);this.renderBookmark();this.renderOutline();this.$('related').replaceChildren(...CATALOG.filter(x=>x.path!==currentPath&&x.group===current.group).slice(0,4).map(x=>this.card(x)));}
    renderOutline(){const target=this.$('outline');target.replaceChildren();const headings=[...document.querySelectorAll('main h1,main h2,main h3,[role=main] h2')].filter(h=>h.textContent.trim()&&h.getClientRects().length).slice(0,45);headings.forEach((heading,i)=>{const b=make('button',heading.textContent.trim().slice(0,140));b.onclick=()=>{this.close();heading.scrollIntoView({behavior:this.scrollBehavior(),block:'start'});if(!heading.hasAttribute('tabindex'))heading.tabIndex=-1;heading.focus({preventScroll:true});};target.append(b);});if(!headings.length)target.append(make('p','Cette interface ne comporte pas de sections de lecture. Ses commandes restent accessibles directement dans la page.','muted'));}
    renderSaved(){for(const [key,id] of [['favorites','favorites'],['recent','recent']]){const box=this.$(id);box.replaceChildren();state[key].forEach(path=>{const item=CATALOG.find(x=>x.path===path);if(!item)return;const row=make('div',null,'saved-row'),a=make('a',item.title);a.href=path;row.append(a);if(key==='favorites'){const b=make('button','Retirer','btn compact');b.setAttribute('aria-label',`Retirer ${item.title} des favoris`);b.onclick=()=>{state.favorites=state.favorites.filter(p=>p!==path);save();this.renderSaved();};row.append(b);}box.append(row);});if(!box.children.length)box.append(make('p',key==='favorites'?'Ajoutez une page depuis l’onglet « Cette page ».':'Vos prochaines rubriques apparaîtront ici.','empty'));}}
    renderNotes(){const p=pageState();this.$('note').value=p.note;this.$('note-status').textContent=storageOK?'Notes personnelles enregistrées uniquement dans ce navigateur.':'Stockage indisponible : utilisez l’export texte.';const tasks=TASKS[current.group]||TASKS.Informations;const box=this.$('tasks');box.replaceChildren();const meter=()=>{this.$('task-meter').style.width=`${tasks.filter((_,i)=>p.tasks[i]).length/tasks.length*100}%`;};tasks.forEach((text,i)=>{const label=make('label',null,'check'),input=make('input'),span=make('span',text);input.type='checkbox';input.checked=!!p.tasks[i];input.onchange=()=>{p.tasks[i]=input.checked;save();meter();if(input.checked)play('notification');};label.append(input,span);box.append(label);});meter();}
    minutes(){return Math.max(1,Math.min(180,Number(this.$('minutes').value)||15));}
    startTimer(){if(this.clock)return;if(this.remaining<=0)this.remaining=this.minutes()*60;this.deadline=Date.now()+this.remaining*1000;this.$('timer-start').disabled=true;this.$('timer-pause').disabled=false;this.$('minutes').disabled=true;this.clock=setInterval(()=>{this.remaining=Math.max(0,Math.ceil((this.deadline-Date.now())/1000));this.$('timer').textContent=duration(this.remaining);if(!this.remaining){this.pauseTimer();this.message('Minuteur terminé. Une pause ?');play('notification');}},500);this.message('Minuteur démarré pour cette page.');}
    pauseTimer(){if(this.clock){this.remaining=Math.max(0,Math.ceil((this.deadline-Date.now())/1000));clearInterval(this.clock);this.clock=null;}this.$('timer-start').disabled=false;this.$('timer-start').textContent='Reprendre';this.$('timer-pause').disabled=true;this.$('minutes').disabled=false;}
    renderTool(){const type=this.$('tool').value,box=this.$('tool-form');box.replaceChildren();const fields={download:[['size','Taille du fichier (Mio)','number','230'],['speed','Débit disponible (Mbit/s)','number','20']],time:[['timevalue','Durée : secondes ou HH:MM:SS','text','01:30']],url:[['urlvalue','Lien à examiner','url','https://']],network:[['ip','Adresse IPv4','text','192.168.50.2'],['prefix','Préfixe CIDR (1 à 30)','number','24']],units:[['amount','Quantité (Gio)','number','1']],brief:[['goal','Votre objectif','text',''],['device','Votre matériel / plateforme','text',''],['needs','Contraintes, questions ou étapes','textarea','']]}[type];fields.forEach(([id,title,inputType,value])=>{const label=make('label',title);label.htmlFor='tool-'+id;const input=make(inputType==='textarea'?'textarea':'input');input.id='tool-'+id;if(inputType!=='textarea')input.type=inputType;input.value=value;if(inputType==='number'){input.min='0';input.step='any';}box.append(label,input);});const b=make('button',type==='brief'?'Créer ma fiche':'Calculer / examiner','btn primary');b.style.marginTop='15px';b.onclick=()=>this.calculate(type);box.append(b);this.$('tool-result').textContent='Renseignez les valeurs puis lancez le calcul.';}
    calculate(type){const value=id=>this.$('tool-'+id).value.trim();let result='';try{
      if(type==='download'){const size=Number(value('size')),speed=Number(value('speed'));if(!Number.isFinite(size)||!Number.isFinite(speed)||size<=0||speed<=0)throw Error('Indiquez une taille et un débit supérieurs à zéro.');result=`Durée théorique : ${duration(size*8.388608/speed)}\n${size} Mio à ${speed} Mbit/s.\nLe temps réel dépend du serveur, du Wi-Fi et des autres téléchargements.`;}
      if(type==='time'){const raw=value('timevalue');if(!/^\d+(?::\d{1,2}){0,2}$/.test(raw))throw Error('Utilisez des secondes entières ou le format HH:MM:SS.');const parts=raw.split(':').map(Number);if(parts.slice(1).some(n=>n>59))throw Error('Minutes et secondes doivent rester entre 0 et 59.');const seconds=parts.reduce((a,n)=>a*60+n,0);if(!Number.isSafeInteger(seconds))throw Error('Cette durée est trop grande.');result=`${duration(seconds)}\n${seconds} secondes\n${(seconds/60).toLocaleString('fr-FR',{maximumFractionDigits:2})} minutes` ;}
      if(type==='url'){const url=new URL(value('urlvalue'));if(!['https:','http:'].includes(url.protocol))throw Error('Utilisez un lien HTTP ou HTTPS.');result=`Domaine : ${url.hostname}\nProtocole : ${url.protocol==='https:'?'HTTPS':'HTTP (non chiffré)'}\nParamètres : ${[...url.searchParams.keys()].length}\nIdentifiants intégrés : ${url.username||url.password?'oui — retirez-les avant partage':'non'}\nExamen de la structure uniquement : la disponibilité et le contenu du lien ne sont pas vérifiés.`;}
      if(type==='network'){const raw=value('ip');if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(raw))throw Error('Saisissez quatre nombres séparés par des points.');const octets=raw.split('.').map(Number),prefix=Number(value('prefix'));if(octets.some(n=>n>255)||!Number.isInteger(prefix)||prefix<1||prefix>30)throw Error('IPv4 : nombres de 0 à 255 ; préfixe : entier de 1 à 30.');const number=octets.reduce((n,o)=>n*256+o,0)>>>0,mask=(0xffffffff<<(32-prefix))>>>0,network=(number&mask)>>>0,broadcast=(network|(~mask>>>0))>>>0;const ip=n=>[24,16,8,0].map(s=>(n>>>s)&255).join('.');result=`Réseau : ${ip(network)}/${prefix}\nMasque : ${ip(mask)}\nPremière adresse : ${ip(network+1)}\nDernière adresse : ${ip(broadcast-1)}\nDiffusion : ${ip(broadcast)}\nCe calcul ne teste pas la connexion et ne modifie pas le réseau.`;}
      if(type==='units'){const n=Number(value('amount'));if(!Number.isFinite(n)||n<0||n>1e9)throw Error('Saisissez une quantité de 0 à 1 milliard de Gio.');result=`${n.toLocaleString('fr-FR')} Gio\n${(n*1024).toLocaleString('fr-FR')} Mio\n${(n*1073741824).toLocaleString('fr-FR')} octets\n${(n*1.073741824).toLocaleString('fr-FR',{maximumFractionDigits:3})} Go (décimal)`;}
      if(type==='brief'){if(!value('goal'))throw Error('Indiquez votre objectif.');result=`FICHE DE PROJET · ${current.title}\nObjectif : ${value('goal')}\nMatériel : ${value('device')||'À préciser'}\nContraintes et questions :\n${value('needs')||'À préciser'}\n\nPage de référence : ${location.origin+location.pathname}`;}
      this.$('tool-result').textContent=result;play('notification');
    }catch(e){this.$('tool-result').textContent=e.message||'Vérifiez les valeurs saisies.';}}
  }
  customElements.define('kitt-cockpit',Cockpit);
  const revealed=new WeakSet();
  function scan(){
    refreshPage();
    document.querySelectorAll('main > section,main > div > section,.software-card,.resource-card').forEach(n=>{if(revealed.has(n)||n.closest('[role=dialog]')||current.group==='Applications')return;revealed.add(n);n.classList.add('kc-reveal');observer.observe(n);});
    if(element.dialog.open&&element.tab==='reading')element.renderOutline();
  }
  function refreshPage(){
    if(currentPath===location.pathname&&current)return;
    currentPath=location.pathname;current=CATALOG.find(x=>x.path===currentPath)||{path:currentPath,title:document.title.split('—')[0]||'Cette page',group:'Informations',hint:'Retrouvez une rubrique avec la recherche et gardez vos repères.',tool:'brief'};
    document.documentElement.dataset.kcContext=current.group==='Applications'?'application':'page';
    if(CATALOG.some(x=>x.path===currentPath)){state.recent=[currentPath,...state.recent.filter(p=>p!==currentPath)].slice(0,8);save();}
    if(!element?.$)return;
    element.$('context-title').textContent=current.title;element.$('context-hint').textContent=current.hint;
    element.$('tool').value=current.tool;element.renderTool();element.selectTab(element.tab);
  }
  function boot(){
    element=document.createElement('kitt-cockpit');document.body.append(element);preferences();
    const bar=make('div',null,'kc-progress');bar.setAttribute('aria-hidden','true');document.body.append(bar);
    let frame=0;const progress=()=>{if(frame)return;frame=requestAnimationFrame(()=>{const max=document.documentElement.scrollHeight-innerHeight;bar.style.transform=`scaleX(${max>0?Math.max(0,Math.min(1,scrollY/max)):0})`;frame=0;});};
    addEventListener('scroll',progress,{passive:true});addEventListener('resize',progress,{passive:true});progress();
    observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('kc-visible');observer.unobserve(e.target);}}),{threshold:.04});
    new MutationObserver(()=>{clearTimeout(scanTimer);scanTimer=setTimeout(scan,180);}).observe(document.querySelector('#root')||document.body,{childList:true,subtree:true});
    addEventListener('popstate',()=>{refreshPage();setTimeout(scan,100);});addEventListener('kitt-route-change',()=>{refreshPage();setTimeout(scan,100);});
    addEventListener('kitt-open-cockpit',e=>element.open(e.detail?.tab));
    addEventListener('keydown',e=>{if(e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();element.dialog.open?element.close():element.open();}});
    addEventListener('online',()=>element.syncSettings());addEventListener('offline',()=>element.syncSettings());
    document.addEventListener('click',e=>{if(current?.group==='Applications')return;if(e.target instanceof Element&&e.target.closest('a,button')&&!e.target.closest('kitt-cockpit'))play('click');});
    document.addEventListener('pointerover',e=>{if(state.motion!=='cinema'||current?.group==='Applications'||e.pointerType!=='mouse')return;if(e.target instanceof Element&&e.target.matches('.software-card,.kc-mission-card,.resource-card'))play('hover');},{passive:true});
    scan();
    if(!document.querySelector('#root')&&current.group!=='Applications'){
      const main=document.querySelector('main');if(main){const beacon=make('aside',null,'kc-page-beacon'),copy=make('div'),strong=make('strong',current.title),hint=make('span',current.hint),button=make('button','Ouvrir mes outils →','kc-open');copy.append(strong,hint);button.onclick=()=>element.open('reading');beacon.append(copy,button);main.prepend(beacon);}
    }
    window.kittCockpit={version:VERSION,catalog:CATALOG,open:tab=>element.open(tab)};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
