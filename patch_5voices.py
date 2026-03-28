#!/usr/bin/env python3
# patch_voices_v3.py — 2 voix (GUY local + MANIX ElevenLabs), intégré dans la toolbar

TARGET = "/home/kitt/kitt-ai/static/index.html"
API_KEY = "40aaa0e0df0e0fc4da291cd6df708de3e967f065f09f418b6656d4a9a713e2a3"

NEW_BLOCK = """<!-- ══ VOICE SWITCH v3 ══════════════════════════════════════════════════════════════════ -->
<style>
.voice-switch {
  display:inline-flex;align-items:center;gap:0;
  border:1px solid rgba(255,34,34,0.25);
  overflow:hidden;
}
.voice-sw-btn {
  background:rgba(10,0,0,0.7);
  border:none;
  color:rgba(160,80,80,0.7);
  font-family:'Space Mono',monospace;
  font-size:0.5rem;
  letter-spacing:0.08em;
  padding:4px 9px;
  cursor:pointer;
  transition:all 0.18s;
  white-space:nowrap;
}
.voice-sw-btn:hover {
  background:rgba(255,34,34,0.12);
  color:#ff6666;
}
.voice-sw-btn.vox-active {
  background:rgba(255,34,34,0.18);
  color:#ff2222;
  box-shadow:0 0 8px rgba(255,34,34,0.25) inset;
}
.voice-sw-btn:not(:last-child) {
  border-right:1px solid rgba(255,34,34,0.2);
}
#vox-status {
  font-size:0.38rem;
  color:rgba(255,80,80,0.45);
  letter-spacing:0.06em;
  padding:0 4px;
  display:none;
}
</style>

<script>
(function(){
  var API_KEY = "%%APIKEY%%";
  var MANIX_ID = "AWQ8RBL5o63CDJoS98F9";
  var MANIX_PHRASE = "Bonjour. Je suis Manix, le cr\\u00e9ateur de KITT. Bienvenue dans le projet Knight Franco-Belge.";
  var GUY_PHRASE = "Bonjour Michael. Tous les syst\\u00e8mes sont op\\u00e9rationnels. Je suis pr\\u00eat \\u00e0 vous assister.";
  var ACTIVE_KEY = "kitt_voice_v3_active"; // 'guy' | 'manix'

  var _ctx = null;
  function getCtx(){
    if(!_ctx) _ctx = new(window.AudioContext||window.webkitAudioContext)();
    if(_ctx.state==="suspended") _ctx.resume();
    return _ctx;
  }

  // ── File séquentielle MANIX (évite le double audio) ──
  var _manixQueue = [];
  var _manixPlaying = false;
  var _manixGen = 0;

  function _playManixNext(gen){
    if(gen !== _manixGen){ _manixPlaying = false; return; }
    if(_manixQueue.length === 0){ _manixPlaying = false; return; }
    _manixPlaying = true;
    var text = _manixQueue.shift();
    fetch("https://api.elevenlabs.io/v1/text-to-speech/"+MANIX_ID+"/stream",{
      method:"POST",
      headers:{"Content-Type":"application/json","xi-api-key":API_KEY},
      body:JSON.stringify({
        text:text,
        model_id:"eleven_v3",
        voice_settings:{stability:0.55,similarity_boost:0.85,style:0.1,use_speaker_boost:true}
      })
    }).then(function(r){
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.arrayBuffer();
    }).then(function(buf){
      getCtx().decodeAudioData(buf, function(decoded){
        if(gen !== _manixGen){ _manixPlaying = false; return; } // génération changée — abandon
        var src = getCtx().createBufferSource();
        src.buffer = decoded;
        var vbNode = (typeof ensureVoiceboxAnalyser === 'function') ? ensureVoiceboxAnalyser() : getCtx().destination;
        src.connect(vbNode);
        scanner.classList.add('speaking');
        src.onended = function(){
          if(_manixQueue.length === 0){ scanner.classList.remove('speaking'); }
          _playManixNext(gen);
        };
        src.start(0);
        if(typeof startVoicebox === 'function') startVoicebox();
      });
    }).catch(function(e){
      console.warn("[MANIX TTS]", e.message);
      _playManixNext(gen);
    });
  }

  function fetchAndPlay(text, onDone){
    // Lecture directe (test / demo) — sans file
    fetch("https://api.elevenlabs.io/v1/text-to-speech/"+MANIX_ID+"/stream",{
      method:"POST",
      headers:{"Content-Type":"application/json","xi-api-key":API_KEY},
      body:JSON.stringify({
        text:text,
        model_id:"eleven_v3",
        voice_settings:{stability:0.55,similarity_boost:0.85,style:0.1,use_speaker_boost:true}
      })
    }).then(function(r){
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.arrayBuffer();
    }).then(function(buf){
      getCtx().decodeAudioData(buf, function(decoded){
        var src = getCtx().createBufferSource();
        src.buffer = decoded;
        src.connect(getCtx().destination);
        src.start(0);
        if(onDone) onDone();
      });
    }).catch(function(e){ console.warn("[MANIX TTS]", e.message); });
  }

  // ── Intercept queueAudioChunk ──
  function patchQueue(){
    if(typeof window.queueAudioChunk!=="function") return;
    if(window._voxPatched) return;
    window._voxPatched = true;
    var _orig = window.queueAudioChunk;
    window.queueAudioChunk = function(url, chunkText){
      if(window._voxActive==="manix"){
        if(chunkText && chunkText.trim()){
          _manixQueue.push(chunkText);
          if(!_manixPlaying){ _manixGen++; _playManixNext(_manixGen); }
        }
        return; // supprime le son local
      }
      return _orig.call(this, url, chunkText);
    };
  }
  patchQueue();
  if(document.readyState!=="complete") window.addEventListener("load", patchQueue);

  // ── Init depuis localStorage ──
  var _saved = localStorage.getItem(ACTIVE_KEY) || "guy";
  window._voxActive = _saved;

  function updateButtons(){
    var btns = document.querySelectorAll(".voice-sw-btn");
    btns.forEach(function(b){
      b.classList.toggle("vox-active", b.getAttribute("data-vox")===window._voxActive);
    });
  }

  function switchVoice(v){
    getCtx();
    window._voxActive = v;
    localStorage.setItem(ACTIVE_KEY, v);
    updateButtons();
    if(window._chunkQueue) window._chunkQueue.length = 0;
  }
  window._switchVoice = switchVoice;

  // Expose reset pour resetAudioQueue() qui est hors de cette closure
  window._resetManixQueue = function(){
    _manixGen++;
    _manixQueue = [];
    _manixPlaying = false;
  };

  // ── Inject les boutons dans la toolbar ctrl-btn ──
  function injectButtons(){
    var rstBtn = document.getElementById("resetbtn");
    if(!rstBtn) return;
    var parent = rstBtn.parentNode;

    var wrap = document.createElement("div");
    wrap.className = "voice-switch";
    wrap.style.cssText = "margin-left:4px;";

    var guyBtn = document.createElement("button");
    guyBtn.className = "voice-sw-btn" + (window._voxActive==="guy" ? " vox-active" : "");
    guyBtn.setAttribute("data-vox","guy");
    guyBtn.title = "Voix Guy Chapelier (locale \\u2014 Piper GPU)";
    guyBtn.textContent = "GUY";
    guyBtn.addEventListener("click", function(){ getCtx(); switchVoice("guy"); });
    guyBtn.addEventListener("dblclick", function(){
      getCtx();
      fetch("/audio/guy_sample.wav").then(function(r){
        if(!r.ok) throw new Error();
        return r.arrayBuffer();
      }).then(function(buf){
        getCtx().decodeAudioData(buf, function(d){
          var s=getCtx().createBufferSource(); s.buffer=d; s.connect(getCtx().destination); s.start(0);
        });
      }).catch(function(){});
    });

    var manixBtn = document.createElement("button");
    manixBtn.className = "voice-sw-btn" + (window._voxActive==="manix" ? " vox-active" : "");
    manixBtn.setAttribute("data-vox","manix");
    manixBtn.title = "Voix Manix (ElevenLabs cloud \\u2014 double-clic pour tester)";
    manixBtn.textContent = "MANIX";
    manixBtn.addEventListener("click", function(){ getCtx(); switchVoice("manix"); });
    manixBtn.addEventListener("dblclick", function(){
      getCtx();
      fetchAndPlay(MANIX_PHRASE, null);
    });

    wrap.appendChild(guyBtn);
    wrap.appendChild(manixBtn);

    if(rstBtn.nextSibling){
      parent.insertBefore(wrap, rstBtn.nextSibling);
    } else {
      parent.appendChild(wrap);
    }
  }

  if(document.readyState==="complete"||document.readyState==="interactive"){
    injectButtons();
  } else {
    document.addEventListener("DOMContentLoaded", injectButtons);
  }

  updateButtons();
})();
</script>
<!-- ══ FIN VOICE SWITCH v3 ══ -->""".replace("%%APIKEY%%", API_KEY)

REMOVE_OLD_MARKERS = [
    ("<!-- \u2550\u2550 ELEVENLABS TTS DEMO", "<!-- \u2550\u2550 FIN ELEVENLABS DEMO \u2550\u2550 -->"),
    ("<!-- \u2550\u2550 VOICE SWITCH v3", "<!-- \u2550\u2550 FIN VOICE SWITCH v3 \u2550\u2550 -->"),
]

with open(TARGET, "r", encoding="utf-8") as f:
    html = f.read()

# Supprimer les anciens blocs
for start_m, end_m in REMOVE_OLD_MARKERS:
    s = html.find(start_m)
    if s != -1:
        e = html.find(end_m, s)
        if e != -1:
            html = html[:s] + html[e+len(end_m):]
            print(f"Removed old block: {start_m[:30]}")

# Injecter avant </body>
html = html.replace("</body>", NEW_BLOCK + "\n</body>", 1)
print("Injected new voice switch v3")

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(html)
print("Done.")
