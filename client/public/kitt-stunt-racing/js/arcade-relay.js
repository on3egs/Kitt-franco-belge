(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const networkMode = params.get("network");
  if (!networkMode) return;
  const identity = window.KYRONEX_ARCADE_IDENTITY || "KYRONEXT";
  const configured = String(window.KYRONEX_ARCADE_RELAY_ORIGIN || "").replace(/\/$/, "");
  const base = configured || location.origin;
  const url = base.replace(/^http:/, "ws:").replace(/^https:/, "wss:") + "/api/arcade/ws";
  const status = document.createElement("div");
  status.id = "kyronex-racer-network";
  status.textContent = "RACER // " + identity + " // connexion…";
  Object.assign(status.style, { position:"fixed", top:"12px", left:"50%", zIndex:"30000",
    transform:"translateX(-50%)", padding:"8px 12px", border:"1px solid #ff4054",
    borderRadius:"6px", color:"#ffdfe3", background:"rgba(18,0,5,.88)",
    font:"700 12px ui-monospace,monospace", pointerEvents:"none" });
  document.body.appendChild(status);
  let socket = null;
  let reconnect = 0;
  let replay = false;
  let aiTimer = 0;
  let started = performance.now();
  let stateTimer = 0;
  let sequence = 0;
  const racerState = { progress:0, lane:0, speed:0, action:"départ", score:0, status:"EN COURS" };
  let remoteState = null;
  let remoteIdentity = "ADVERSAIRE";
  const remotePanel = document.createElement("section");
  remotePanel.id = "kyronex-racer-remote";
  remotePanel.innerHTML = '<strong></strong><canvas width="300" height="180"></canvas><small></small>';
  Object.assign(remotePanel.style,{position:"fixed",right:"14px",bottom:"14px",zIndex:"30000",width:"300px",padding:"10px",border:"1px solid #ff4054",borderRadius:"10px",background:"rgba(5,0,12,.9)",color:"#ffe6ea",font:"700 11px ui-monospace,monospace",pointerEvents:"none",display:"none"});
  document.body.appendChild(remotePanel);
  function drawRemote() {
    if (!remoteState) return;
    remotePanel.style.display="block"; remotePanel.querySelector("strong").textContent="ADVERSAIRE // "+remoteIdentity;
    remotePanel.querySelector("small").textContent=`PROGRESSION ${remoteState.progress||0}% · VITESSE ${remoteState.speed||0} · ${remoteState.action||"—"}`;
    const c=remotePanel.querySelector("canvas"),x=c.getContext("2d");x.clearRect(0,0,300,180);x.fillStyle="#101a30";x.fillRect(0,0,300,180);x.fillStyle="#283955";x.fillRect(85,0,130,180);x.strokeStyle="#dcecff";x.setLineDash([12,10]);x.beginPath();x.moveTo(150,0);x.lineTo(150,180);x.stroke();x.setLineDash([]);const y=160-(Math.min(100,remoteState.progress||0)*1.35);x.fillStyle="#ff4054";x.fillRect(140+(remoteState.lane||0)*32,y,20,28);x.fillStyle="#fff";x.fillText(remoteState.status||"EN COURS",10,18);
  }
  function sendVisualState() { if(socket?.readyState!==WebSocket.OPEN)return; racerState.progress=Math.min(100,Math.round((performance.now()-started)/300)); racerState.score=Math.round(racerState.progress*10); socket.send(JSON.stringify({type:"state",data:{kind:"racer_snapshot",seq:++sequence,ts:Date.now(),state:{...racerState}}})); }
  function connect() {
    try {
      socket = new WebSocket(url);
      socket.onopen = () => {
        socket.send(JSON.stringify({ type:"join", game:"racer", mode:networkMode === "ai" ? "ai" : "classic", identity }));
        status.textContent = "RACER // " + identity + " // recherche de l’adversaire…";
      };
      socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
        if (message.type === "joined") { status.textContent = message.mode === "ai"
          ? "RACER IA // " + identity + " (" + message.role + ") — " + message.players + "/2"
          : "RACER // " + identity + " — " + message.players + "/2 connectées";
          if (message.mode === "classic") { clearInterval(stateTimer); stateTimer=setInterval(sendVisualState,50); }
        }
        if (message.type === "player_joined") { status.textContent = networkMode === "ai"
          ? "RACER IA // adversaire connecté — " + message.identity
          : "RACER // adversaire connecté — " + message.identity + " — " + message.players + "/2 connectées";
          if (networkMode !== "ai") { clearInterval(stateTimer); stateTimer=setInterval(sendVisualState,50); }
        }
        if (message.type === "duel_start") {
          status.textContent = "RACER IA VS IA // " + message.identities.join(" contre ");
          started = performance.now();
          clearInterval(aiTimer);
          aiTimer = setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({
              type:"ai_state", data:{ progress:Math.min(100, Math.round((performance.now()-started)/300)), score:Math.round((performance.now()-started)/10), action:"conduite" }
            }));
          }, 250);
          clearInterval(stateTimer); stateTimer=setInterval(sendVisualState,50);
        }
        if (message.type === "event" && message.data?.kind === "key" && !replay) {
          replay = true;
          window.dispatchEvent(new KeyboardEvent(message.data.event || "keydown", { key:message.data.key, code:message.data.code }));
          replay = false;
        }
        if (message.type === "event" && message.data?.kind === "orientation" && !replay) {
          replay = true;
          const orientation = new Event("deviceorientation");
          Object.assign(orientation, { alpha:message.data.alpha, beta:message.data.beta, gamma:message.data.gamma });
          window.dispatchEvent(orientation);
          replay = false;
        }
        if (message.type === "state" && message.data?.kind === "racer_snapshot") { remoteState=message.data.state||{}; remoteIdentity=message.identity||"ADVERSAIRE"; drawRemote(); }
        if (message.type === "player_left") status.textContent = "RACER // connexion perdue — reconnexion…";
      };
      socket.onerror = () => { status.textContent = "RACER // erreur du relais"; };
      socket.onclose = () => {
        clearInterval(aiTimer);
        clearInterval(stateTimer); stateTimer=0;
        if (!reconnect) reconnect = setTimeout(() => { reconnect = 0; connect(); }, 1500);
      };
    } catch (_) { status.textContent = "RACER // relais indisponible"; }
  }
  function send(event, kind = "key") {
    if (replay || !socket || socket.readyState !== WebSocket.OPEN || networkMode === "ai") return;
    socket.send(JSON.stringify({ type:"event", data:{ kind, event:event.type, key:event.key, code:event.code, alpha:event.alpha, beta:event.beta, gamma:event.gamma } }));
    if (kind === "key") { racerState.action=event.key||"action"; if(event.key==="ArrowLeft"||event.key==="a") racerState.lane=Math.max(-1,racerState.lane-1); if(event.key==="ArrowRight"||event.key==="d") racerState.lane=Math.min(1,racerState.lane+1); if(event.key==="ArrowUp"||event.key==="w") racerState.speed=Math.min(100,racerState.speed+10); if(event.key==="ArrowDown"||event.key==="s") racerState.speed=Math.max(0,racerState.speed-10); }
  }
  window.addEventListener("keydown", send, { passive:true });
  window.addEventListener("keyup", send, { passive:true });
  window.addEventListener("deviceorientation", event => send(event, "orientation"), { passive:true });
  window.addEventListener("beforeunload", () => { clearInterval(aiTimer); clearInterval(stateTimer); socket?.close(1000, "sortie"); });
  connect();
})();
