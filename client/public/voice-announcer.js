(function (root) {
  'use strict';
  var pending = [], active = false, waiting = false;
  function run() {
    if (active || !pending.length || !root.speechSynthesis || !root.SpeechSynthesisUtterance) return;
    var synth = root.speechSynthesis, voices = synth.getVoices();
    if (!voices.length && !waiting) {
      waiting = true;
      synth.addEventListener('voiceschanged', function () { waiting = false; run(); }, { once: true });
      root.setTimeout(function () { waiting = false; run(); }, 800);
      return;
    }
    var item = pending.shift();
    var utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = item.lang || 'fr-FR'; utterance.rate = item.rate || 0.82; utterance.pitch = item.pitch || 0.82; utterance.volume = item.volume || 1;
    var lang = utterance.lang.toLowerCase().replace('_', '-');
    var french = voices.filter(function (voice) { return voice.lang.toLowerCase().replace('_', '-').indexOf(lang.slice(0, 2)) === 0; });
    var robot = french.find(function (voice) { return /robot|compact|natural/i.test(voice.name); });
    if (robot) utterance.voice = robot; else if (french.length) utterance.voice = french[0];
    active = true;
    var done = function () { if (!active) return; active = false; root.setTimeout(run, 120); };
    utterance.onend = done; utterance.onerror = done;
    try { synth.speak(utterance); } catch (_) { done(); }
  }
  root.KittVoice = {
    speak: function (text, options) {
      if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) return false;
      options = options || {};
      if (options.replacePending) pending.length = 0;
      pending.push({ text: String(text || '').trim(), lang: options.lang, rate: options.rate, pitch: options.pitch, volume: options.volume });
      run(); return true;
    },
    stop: function () { pending.length = 0; active = false; if (root.speechSynthesis) root.speechSynthesis.cancel(); }
  };
  try {
    var arrival = root.sessionStorage.getItem('kittVoiceOnArrival');
    if (arrival) { root.sessionStorage.removeItem('kittVoiceOnArrival'); root.setTimeout(function () { root.KittVoice.speak(arrival, { lang: 'fr-FR', rate: 0.8, pitch: 0.8, replacePending: true }); }, 350); }
  } catch (_) { /* stockage facultatif */ }
})(window);
