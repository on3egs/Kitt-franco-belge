#!/usr/bin/env python3
# patch_5voices.py v2 — systeme 5 voix + vote + fix double TTS
import sys

TARGET = "/home/kitt/kitt-ai/static/index.html"
API_KEY = "40aaa0e0df0e0fc4da291cd6df708de3e967f065f09f418b6656d4a9a713e2a3"

# Le bloc complet a injecter
NEW_BLOCK = """<!-- \u2550\u2550 ELEVENLABS TTS DEMO \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
<style>
#el-panel{
  position:fixed;bottom:0;left:0;right:0;
  background:#0a0000;border-top:2px solid #ff2222;
  padding:14px 16px 20px;z-index:9999;
  transform:translateY(100%);transition:transform .35s ease;
  font-family:'Space Mono',monospace;
  max-height:90vh;overflow-y:auto;
}
#el-panel.open{transform:translateY(0);}
#el-toggle-btn{
  position:fixed;bottom:14px;right:14px;
  background:#0a0000;border:1px solid #ff2222;color:#ff2222;
  font-family:'Space Mono',monospace;font-size:.55rem;letter-spacing:.1em;
  padding:8px 14px;cursor:pointer;z-index:10000;
  box-shadow:0 0 10px rgba(255,34,34,.3);
}
#el-toggle-btn:hover{background:rgba(255,34,34,.15);}
.el-voice-row{
  display:flex;align-items:center;gap:6px;
  margin-bottom:10px;flex-wrap:wrap;padding:8px;
  border:1px solid rgba(255,34,34,.15);
  transition:border-color .2s;
}
.el-voice-row.el-active-row{border-color:rgba(255,34,34,.6);background:rgba(255,34,34,.04);}
.el-voice-label{
  color:rgba(180,180,180,.8);font-size:.5rem;letter-spacing:.06em;
  flex:1;min-width:130px;
}
.el-voice-row.el-active-row .el-voice-label{color:#ff4444;font-weight:bold;}
.el-active-badge{
  color:#ff2222;font-size:.42rem;letter-spacing:.1em;
  border:1px solid rgba(255,34,34,.5);padding:2px 6px;
  display:none;
}
.el-voice-row.el-active-row .el-active-badge{display:inline;}
.el-play-btn,.el-sel-btn,.el-vote-btn{
  font-family:'Space Mono',monospace;font-size:.45rem;
  padding:5px 10px;cursor:pointer;white-space:nowrap;border:1px solid;
}
.el-play-btn{background:rgba(255,34,34,.08);border-color:rgba(255,34,34,.4);color:#ff6666;}
.el-play-btn:hover{background:rgba(255,34,34,.2);}
.el-sel-btn{background:rgba(255,34,34,.15);border-color:#ff2222;color:#ff2222;}
.el-sel-btn:hover{background:rgba(255,34,34,.3);}
.el-vote-btn{background:rgba(50,0,0,.4);border-color:rgba(255,34,34,.2);color:rgba(255,120,120,.7);}
.el-vote-btn:hover{background:rgba(255,34,34,.15);}
.el-vote-count{color:rgba(255,160,160,.7);font-size:.45rem;min-width:24px;text-align:center;}
#el-status{font-size:.45rem;color:rgba(255,100,100,.55);margin-top:8px;letter-spacing:.07em;min-height:16px;}
#el-scanner{height:2px;background:#1a0000;overflow:hidden;margin-bottom:10px;flex-shrink:0;}
#el-scanner::after{
  content:'';display:block;width:30%;height:100%;
  background:linear-gradient(90deg,transparent,#ff2222,transparent);
  animation:el-scan 1.8s ease-in-out infinite;
}
@keyframes el-scan{0%{margin-left:-30%}100%{margin-left:130%}}
#el-title{color:#ff2222;font-size:.52rem;letter-spacing:.18em;margin-bottom:10px;}
#el-chat-status{
  font-size:.44rem;letter-spacing:.08em;margin-bottom:10px;padding:5px 10px;
  border:1px solid rgba(255,34,34,.3);display:inline-block;
}
</style>

<button id="el-toggle-btn">&#9654; VOIX KITT</button>

<div id="el-panel">
  <div id="el-scanner"></div>
  <div id="el-title">// SYSTEME VOCAL KITT \u2014 VOTE COMMUNAUTAIRE</div>
  <div id="el-chat-status">VOIX CHAT : KITT (locale)</div>
  <div id="el-voices"></div>
  <div id="el-status"></div>
</div>

<script>
(function(){
  var VOICES = [
    {id:"M2Xs2gEdangnlb92hK6y", label:"Guy Chapelier \u2014 Effets K2000", fx:true},
    {id:"M2Xs2gEdangnlb92hK6y", label:"Guy Chapelier \u2014 Voix brute",   fx:false},
    {id:"5i6t4fEPqzuWZpdkx2r5", label:"KITT V1.0",                         fx:false},
    {id:"PV4tiLtLyiTJlYv4Dh0t", label:"IA CPU KITT",                       fx:false},
    {id:"Kyp1iAnky4vW503kK46o", label:"KITT V2.0",                         fx:false}
  ];
  var API_KEY = "%%APIKEY%%";
  var TEST_PHRASE = "Bonjour Michael. Tous les systemes sont operationnels. Je suis pret a vous assister.";
  var VOTE_KEY  = "kitt_voice_votes_v3";
  var ACTIVE_KEY = "kitt_voice_active_v3";
  var EL_ON_KEY  = "kitt_el_on_v3";

  var activeIdx = parseInt(localStorage.getItem(ACTIVE_KEY)||"0");
  var votes = JSON.parse(localStorage.getItem(VOTE_KEY)||"[0,0,0,0,0]");
  if(!Array.isArray(votes)||votes.length!==5) votes=[0,0,0,0,0];
  var elOn = localStorage.getItem(EL_ON_KEY)==="1";

  // ── Intercept queueAudioChunk (reassignment directe, pas Object.defineProperty) ──
  // On attend que la page soit completement chargee pour etre sur que la fonction existe
  function patchQueueAudioChunk(){
    if(typeof window.queueAudioChunk !== "function") return;
    var _orig = window.queueAudioChunk;
    window.queueAudioChunk = function(url, chunkText){
      if(window._elActive){ return; }
      return _orig.call(this, url, chunkText);
    };
    window._origQueueAudioChunk = _orig;
  }
  // Patch immediat + apres DOMContentLoaded par securite
  patchQueueAudioChunk();
  if(document.readyState !== "complete"){
    window.addEventListener("load", patchQueueAudioChunk);
  }

  // ── Applique l etat initial ──
  window._elActive = elOn;

  // ── AudioContext (cree au 1er geste) ──
  var _ctx = null;
  function getCtx(){
    if(!_ctx) _ctx = new(window.AudioContext||window.webkitAudioContext)();
    if(_ctx.state==="suspended") _ctx.resume();
    return _ctx;
  }

  // ── Effets K2000 ──
  function applyFxAndPlay(buffer, fx){
    var ctx = getCtx();
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    if(fx){
      var hpf  = ctx.createBiquadFilter(); hpf.type="highpass";  hpf.frequency.value=180;  hpf.Q.value=0.8;
      var lpf  = ctx.createBiquadFilter(); lpf.type="lowpass";   lpf.frequency.value=4500; lpf.Q.value=0.7;
      var pres = ctx.createBiquadFilter(); pres.type="peaking";  pres.frequency.value=2000; pres.gain.value=1.8; pres.Q.value=1.5;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value=-18; comp.knee.value=12; comp.ratio.value=3;
      comp.attack.value=0.003; comp.release.value=0.15;
      var delay  = ctx.createDelay(0.3); delay.delayTime.value=0.065;
      var fbGain = ctx.createGain(); fbGain.gain.value=0.28;
      var revGain= ctx.createGain(); revGain.gain.value=0.35;
      var outG   = ctx.createGain(); outG.gain.value=0.85;
      delay.connect(fbGain); fbGain.connect(delay);
      src.connect(hpf); hpf.connect(lpf); lpf.connect(pres); pres.connect(comp);
      comp.connect(outG); comp.connect(delay); delay.connect(revGain);
      outG.connect(ctx.destination); revGain.connect(ctx.destination);
    } else {
      src.connect(ctx.destination);
    }
    src.start(0);
  }

  // ── Fetch ElevenLabs ──
  function fetchAndPlay(voiceId, fx, text, onDone){
    fetch("https://api.elevenlabs.io/v1/text-to-speech/"+voiceId+"/stream",{
      method:"POST",
      headers:{"Content-Type":"application/json","xi-api-key":API_KEY},
      body:JSON.stringify({
        text:text,
        model_id:"eleven_multilingual_v2",
        voice_settings:{stability:0.55,similarity_boost:0.82,style:0.12,use_speaker_boost:true}
      })
    }).then(function(r){
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.arrayBuffer();
    }).then(function(buf){
      getCtx().decodeAudioData(buf, function(decoded){
        applyFxAndPlay(decoded, fx);
        if(onDone) onDone();
      }, function(e){ setStatus("Erreur decodage: "+e); });
    }).catch(function(e){ setStatus("Erreur: "+e.message); });
  }

  // ── UI ──
  var panel      = document.getElementById("el-panel");
  var toggleBtn  = document.getElementById("el-toggle-btn");
  var statusEl   = document.getElementById("el-status");
  var chatStatus = document.getElementById("el-chat-status");
  var container  = document.getElementById("el-voices");
  var panelOpen  = false;

  function setStatus(msg){ statusEl.textContent = msg; }

  function updateChatStatus(){
    if(window._elActive){
      chatStatus.textContent = "VOIX CHAT : " + VOICES[activeIdx].label.toUpperCase();
      chatStatus.style.color = "#ff4444";
      chatStatus.style.borderColor = "rgba(255,34,34,.6)";
    } else {
      chatStatus.textContent = "VOIX CHAT : KITT (locale)";
      chatStatus.style.color = "rgba(180,180,180,.5)";
      chatStatus.style.borderColor = "rgba(255,34,34,.2)";
    }
  }

  function updateRows(){
    document.querySelectorAll(".el-voice-row").forEach(function(row, i){
      var isActive = (window._elActive && i===activeIdx);
      row.classList.toggle("el-active-row", isActive);
    });
    updateChatStatus();
  }

  // Construit les lignes
  VOICES.forEach(function(v, i){
    var row = document.createElement("div");
    row.className = "el-voice-row";

    var lbl   = document.createElement("span"); lbl.className="el-voice-label"; lbl.textContent=v.label;
    var badge = document.createElement("span"); badge.className="el-active-badge"; badge.textContent="ACTIF";

    var playBtn = document.createElement("button");
    playBtn.className="el-play-btn"; playBtn.textContent="[DEMO]";
    playBtn.setAttribute("data-idx",i); playBtn.setAttribute("data-action","play");

    var selBtn = document.createElement("button");
    selBtn.className="el-sel-btn"; selBtn.textContent="UTILISER";
    selBtn.setAttribute("data-idx",i); selBtn.setAttribute("data-action","select");

    var voteBtn = document.createElement("button");
    voteBtn.className="el-vote-btn"; voteBtn.textContent="VOTER";
    voteBtn.setAttribute("data-idx",i); voteBtn.setAttribute("data-action","vote");

    var cnt = document.createElement("span");
    cnt.className="el-vote-count"; cnt.id="el-cnt-"+i; cnt.textContent=votes[i];

    row.appendChild(lbl); row.appendChild(badge);
    row.appendChild(playBtn); row.appendChild(selBtn);
    row.appendChild(voteBtn); row.appendChild(cnt);
    container.appendChild(row);
  });

  // ── Event delegation ──
  container.addEventListener("click", function(e){
    var btn = e.target.closest("[data-action]");
    if(!btn) return;
    var idx    = parseInt(btn.getAttribute("data-idx"));
    var action = btn.getAttribute("data-action");
    getCtx(); // debloquer AudioContext pendant le geste

    if(action==="play"){
      setStatus("Chargement demo: "+VOICES[idx].label+"...");
      fetchAndPlay(VOICES[idx].id, VOICES[idx].fx, TEST_PHRASE, function(){
        setStatus("Demo: "+VOICES[idx].label);
      });
    }

    if(action==="select"){
      activeIdx = idx;
      window._elActive = true;
      localStorage.setItem(ACTIVE_KEY, idx);
      localStorage.setItem(EL_ON_KEY, "1");
      // Hook _elSpeak pour le chat
      window._elSpeak = function(text){
        var v = VOICES[activeIdx];
        fetchAndPlay(v.id, v.fx, text, null);
      };
      // Vide la file audio locale si elle tourne encore
      if(window._chunkQueue) window._chunkQueue.length = 0;
      updateRows();
      setStatus("Voix KITT selectionnee : "+VOICES[idx].label);
    }

    if(action==="vote"){
      votes[idx]++;
      localStorage.setItem(VOTE_KEY, JSON.stringify(votes));
      document.getElementById("el-cnt-"+idx).textContent = votes[idx];
      setStatus("Vote enregistre \u2014 "+VOICES[idx].label);
    }
  });

  // Bouton DESACTIVER (revenir au TTS local)
  var deselBtn = document.createElement("button");
  deselBtn.id = "el-desel-btn";
  deselBtn.style.cssText = "margin-top:10px;background:rgba(40,0,0,.6);border:1px solid rgba(255,34,34,.25);color:rgba(180,80,80,.8);font-family:'Space Mono',monospace;font-size:.44rem;padding:5px 12px;cursor:pointer;letter-spacing:.1em;";
  deselBtn.textContent = "[ REVENIR AU TTS LOCAL ]";
  deselBtn.addEventListener("click", function(){
    getCtx();
    window._elActive = false;
    localStorage.setItem(EL_ON_KEY, "0");
    updateRows();
    setStatus("TTS local reactiva.");
  });
  panel.appendChild(deselBtn);

  // Toggle panel
  toggleBtn.addEventListener("click", function(){
    panelOpen = !panelOpen;
    panel.classList.toggle("open", panelOpen);
    toggleBtn.textContent = panelOpen ? "X FERMER" : "\u25b6 VOIX KITT";
    if(panelOpen) updateRows();
  });

  // Initialisation etat
  if(elOn){
    window._elSpeak = function(text){
      var v = VOICES[activeIdx];
      fetchAndPlay(v.id, v.fx, text, null);
    };
  }
  updateRows();

})();
</script>
<!-- \u2550\u2550 FIN ELEVENLABS DEMO \u2550\u2550 -->""".replace("%%APIKEY%%", API_KEY)

with open(TARGET, "r", encoding="utf-8") as f:
    html = f.read()

START_MARKER = "<!-- \u2550\u2550 ELEVENLABS TTS DEMO"
END_MARKER   = "<!-- \u2550\u2550 FIN ELEVENLABS DEMO \u2550\u2550 -->"

start = html.find(START_MARKER)
end   = html.find(END_MARKER)

if start == -1 or end == -1:
    print("MARKERS NOT FOUND — injecting before </body>")
    html = html.replace("</body>", NEW_BLOCK + "\n</body>", 1)
else:
    end_full = end + len(END_MARKER)
    html = html[:start] + NEW_BLOCK + html[end_full:]
    print("Block replaced OK.")

with open(TARGET, "w", encoding="utf-8") as f:
    f.write(html)

print("Done.")
