// Lecteurs radio officiels : aucun morceau n'est copié ni hébergé par le jeu.
const stations = [
  { id: 'nrj-dance', name: 'NRJ Dance', mode: 'embed', url: 'https://www.nrj.be/embed/newradioplayer/NRJdance', site: 'https://www.nrj.be/webradios' },
  { id: 'contact', name: 'Radio Contact', mode: 'stream', url: 'https://audiostream.rtl.be/1/app-radio-contact', site: 'https://www.radiocontact.be/player/' },
  { id: 'tipik', name: 'Tipik', mode: 'stream', url: 'https://radio.rtbf.be/tipik/mp3-160/me', site: 'https://www.rtbf.be/' },
  { id: 'belrtl', name: 'Bel RTL', mode: 'embed', url: 'https://www.belrtl.be/player/Iframe/belrtl?channel=Bel', site: 'https://www.belrtl.be/player/' },
  { id: 'nostalgie', name: 'Nostalgie', mode: 'stream', url: 'https://stream.rcs.revma.com/5gd04cwptg0uv', site: 'https://www.nostalgie.be/radio/comment-ecouter-nostalgie' },
];

export class KittRadio {
  constructor(root, onState = () => {}) {
    this.root = root;
    this.onState = onState;
    let savedStation = '', savedVolume = '55';
    try { savedStation = localStorage.getItem('kitt.radio.station') || ''; savedVolume = localStorage.getItem('kitt.radio.volume') || '55'; } catch {}
    this.station = stations.find(item => item.id === savedStation) || stations[0];
    this.on = false;
    this.volume = Number(savedVolume) / 100;
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.audio.volume = this.volume;
    this.audio.addEventListener('playing', () => this.setStatus('EN DIRECT · ' + this.station.name, 'playing'));
    this.audio.addEventListener('waiting', () => this.setStatus('TÉLÉCHARGEMENT DU FLUX…', 'loading'));
    this.audio.addEventListener('error', () => this.setStatus('Flux indisponible. Réessaie ou ouvre la radio officielle.', 'error'));
    this.select = root.querySelector('#radioStation');
    this.powerButton = root.querySelector('#radioPower');
    this.status = root.querySelector('#radioStatus');
    this.mount = root.querySelector('#radioPlayerMount');
    this.volumeInput = root.querySelector('#radioVolume');
    this.select.replaceChildren(...stations.map(item => new Option(item.name, item.id)));
    this.select.value = this.station.id;
    this.volumeInput.value = String(Math.round(this.volume * 100));
    this.volumeInput.disabled = this.station.mode === 'embed';
    this.volumeInput.title = this.station.mode === 'embed' ? 'Volume réglé dans le lecteur officiel' : 'Volume du flux radio';
    this.select.addEventListener('change', () => this.choose(this.select.value));
    this.powerButton.addEventListener('click', () => this.toggle());
    this.volumeInput.addEventListener('input', () => {
      this.volume = Number(this.volumeInput.value) / 100;
      this.audio.volume = this.volume;
      try { localStorage.setItem('kitt.radio.volume', this.volumeInput.value); } catch {}
    });
    root.querySelector('#radioOfficialLink').href = this.station.site;
  }

  setStatus(message, state = '') {
    this.status.textContent = message;
    this.root.dataset.state = state;
    this.onState({ on: this.on, station: this.station.name, state });
  }

  choose(id) {
    const next = stations.find(item => item.id === id);
    if (!next) return;
    this.stopSource();
    this.station = next;
    this.volumeInput.disabled = next.mode === 'embed';
    this.volumeInput.title = next.mode === 'embed' ? 'Volume réglé dans le lecteur officiel' : 'Volume du flux radio';
    try { localStorage.setItem('kitt.radio.station', next.id); } catch {}
    this.root.querySelector('#radioOfficialLink').href = next.site;
    if (this.on) this.startSource();
    else this.setStatus('PRÊTE · ' + next.name);
  }

  stopSource() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.mount.replaceChildren();
  }

  startSource() {
    if (this.station.mode === 'embed') {
      const frame = document.createElement('iframe');
      frame.title = 'Lecteur officiel ' + this.station.name;
      frame.src = this.station.url;
      frame.allow = 'autoplay; encrypted-media';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.loading = 'eager';
      this.mount.replaceChildren(frame);
      this.setStatus('LECTEUR OFFICIEL · appuie sur lecture dans le lecteur', 'embed');
      return;
    }
    this.audio.src = this.station.url;
    this.audio.load();
    this.setStatus('CONNEXION · ' + this.station.name, 'loading');
    this.audio.play().then(() => this.setStatus('EN DIRECT · ' + this.station.name, 'playing')).catch(() => this.setStatus('Appuie encore sur ALLUMER pour autoriser la lecture.', 'error'));
  }

  toggle() {
    this.on = !this.on;
    this.powerButton.setAttribute('aria-pressed', String(this.on));
    this.powerButton.textContent = this.on ? '⏻ COUPER' : '⏻ ALLUMER';
    this.root.classList.toggle('is-on', this.on);
    if (this.on) this.startSource();
    else { this.stopSource(); this.setStatus('RADIO ÉTEINTE'); }
    return this.on;
  }

  shutdown() {
    this.on = false;
    this.stopSource();
    this.setStatus('RADIO ÉTEINTE');
  }
}
