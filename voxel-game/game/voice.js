// Lecture locale des dialogues du jeu.
const FEMALE_SPEAKERS = new Set(['LILOU', 'ALEXIA', 'BONNIE', 'BONNIE_BARSTOW', 'APRIL', 'APRIL_CURTIS', 'PILOT_FEMME']);
const MALE_SPEAKERS = new Set(['MICHAEL', 'MICHAEL_KNIGHT', 'DEVON', 'DEVON_MILES', 'RC3', 'REGINALD_CORNELIUS_III', 'ANONYMOUS', 'PILOT_MASC', 'KITT', 'KARR', 'GOLIATH', 'MARCEL', 'MARCEL_BARMAN']);

function normalizeSpeaker(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function genderForSpeaker(speaker) {
  const key = normalizeSpeaker(speaker);
  return FEMALE_SPEAKERS.has(key) ? 'female' : MALE_SPEAKERS.has(key) ? 'male' : 'male';
}

export class Narrator {
  constructor() {
    this.enabled = true; this.volume = 1; this.muted = false;
    this.maleVoice = ''; this.femaleVoice = ''; this.requests = 0;
    this.lastText = ''; this.lastError = ''; this.available = 'speechSynthesis' in window;
  }
  configure({ enabled = true, volume = 1, muted = false, maleVoice = '', femaleVoice = '' }) {
    this.enabled = enabled; this.volume = volume; this.muted = muted;
    this.maleVoice = maleVoice; this.femaleVoice = femaleVoice;
    if (!enabled || muted) this.cancel();
  }
  speak(text, force = false, speaker = '') {
    if (!this.available || this.muted || (!this.enabled && !force)) return false;
    this.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const french = voices.filter(voice => /^fr(?:-|$)/i.test(voice.lang));
    const key = normalizeSpeaker(speaker);
    const female = genderForSpeaker(key) === 'female';
    const femaleNames = /\b(?:siwis|hortense|amelie|denise|julie|audrey|marie|celine|sarah|alice|camille|manon|mathilde|helene|virginie|lea|claire|sylvie|margot|female|femme)\b/i;
    const maleNames = /\b(?:tom|gilles|thomas|henri|paul|nicolas|mathieu|antoine|alexandre|julien|guy|male|homme)\b/i;
    const preferred = female ? this.femaleVoice : this.maleVoice;
    const voiceName = female ? femaleNames : maleNames;
    utterance.voice = voices.find(voice => preferred && (voice.voiceURI === preferred || voice.name === preferred))
      || french.find(voice => voiceName.test(voice.name))
      || french.find(voice => /^fr-BE/i.test(voice.lang))
      || french[0] || null;
    utterance.lang = utterance.voice?.lang || 'fr-FR';
    utterance.rate = key === 'KARR' ? 0.86 : 0.94;
    utterance.pitch = key === 'KARR' ? 0.68 : female ? 1.03 : 0.94;
    utterance.volume = this.volume;
    utterance.onerror = event => { this.lastError = event.error; };
    this.lastText = text; this.requests++;
    speechSynthesis.speak(utterance);
    return true;
  }
  cancel() { if (this.available) speechSynthesis.cancel(); }
  inspect() {
    return { supported: this.available, enabled: this.enabled, requests: this.requests, lastText: this.lastText, error: this.lastError,
      frenchVoices: this.available ? speechSynthesis.getVoices().filter(voice => /^fr/i.test(voice.lang)).length : 0 };
  }
}
