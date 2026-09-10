/** Contrôle véhicule K-4000 — interface graphique. */

const diagLog = document.getElementById('diagLog');
const statusText = document.getElementById('statusText');
const relayInfo = document.getElementById('relayInfo');
const confirmModal = document.getElementById('confirmModal');
const confirmText = document.getElementById('confirmText');

let pendingAction = null;
let windowHoldTimers = {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(ts) {
  const d = ts ? new Date(ts * 1000) : new Date();
  return d.toLocaleTimeString('fr-FR', { hour12: false });
}

function logEntry(record) {
  const div = document.createElement('div');
  div.className = `log-entry ${record.status}`;
  const relay = record.relay !== null ? `R${record.relay}` : '—';
  const duration = record.duration_ms ? `${record.duration_ms}ms` : '';
  div.innerHTML = `
    <span class="ts">[${formatTime(record.timestamp)}]</span>
    <span class="fn">${record.function}</span>
    <span class="relay">${relay}</span>
    ${record.state !== undefined ? (record.state ? 'ON' : 'OFF') : ''}
    ${duration}
    <span style="color:#888;margin-left:6px;">${record.message || ''}</span>
  `;
  diagLog.prepend(div);
  while (diagLog.children.length > 50) diagLog.lastChild.remove();
}

function setStatus(text, type) {
  statusText.innerHTML = `<span class="${type}">${text}</span>`;
}

function highlightZone(fn, active) {
  document.querySelectorAll(`.interactive-zone[data-fn="${fn}"]`).forEach(el => {
    el.classList.toggle('active', active);
  });
}

// Fonction à état persistant : les zones feux reflètent l'état réel connu.
function setHeadlightsState(on) {
  document.querySelectorAll('.interactive-zone[data-fn="headlights"]').forEach(el => {
    el.classList.toggle('active', on);
  });
}

function setFunctionState(fn, on) {
  document.querySelectorAll("[data-state-function=\"" + fn + "\"]").forEach(el => {
    el.classList.toggle("active", on && el.textContent.endsWith("ON"));
  });
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------
async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function apiGet(path) {
  const res = await fetch(path);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------------------------------------------------------------------------
// Command dispatch
// ---------------------------------------------------------------------------
const CRITICAL_ACTIONS = { 'engine-start': true, 'engine-stop': true };

function needsConfirmation(action) {
  return !!CRITICAL_ACTIONS[action];
}

async function sendCommand(endpoint, body, btn) {
  const actionKey = endpoint + (body.action ? '-' + body.action : '');
  if (needsConfirmation(actionKey) && !body._confirmed) {
    pendingAction = { endpoint, body, btn };
    confirmText.textContent = `Confirmer l'action : ${endpoint.toUpperCase()} ${body.action || ''}`;
    confirmModal.classList.add('open');
    return;
  }
  delete body._confirmed;

  if (btn) {
    btn.classList.add('active');
    btn.disabled = true;
  }

  try {
    const data = await apiPost(`/api/vehicle/${endpoint}`, body);
    if (data.record) {
      logEntry(data.record);
      if (data.record.function === 'headlights') {
        // État persistant : pas d'auto-effacement, la zone suit l'état connu.
        if (data.record.status === 'completed') {
          setHeadlightsState(!!data.record.state);
        }
      } else if (["scanner", "fog_lights", "laser"].includes(data.record.function)) {
        if (data.record.status === "completed") {
          setFunctionState(data.record.function, !!data.record.state);
        }
      } else {
        highlightZone(data.record.function, data.record.status === 'active');
        if (data.record.status === 'completed' || data.record.status === 'error') {
          setTimeout(() => highlightZone(data.record.function, false), 1000);
        }
      }
    }
    if (endpoint === 'stop-all') setHeadlightsState(false);
    setStatus(`Commande ${endpoint} exécutée`, 'online');
  } catch (err) {
    logEntry({
      function: endpoint,
      relay: null,
      state: false,
      duration_ms: null,
      status: 'error',
      message: err.message,
      timestamp: Date.now() / 1000,
    });
    setStatus(`Erreur : ${err.message}`, 'offline');
  } finally {
    if (btn) {
      btn.classList.remove('active');
      btn.disabled = false;
    }
  }
}

function sendStateCommand(fn, state, btn) {
  sendCommand("accessory", { function: fn, state: state }, btn);
}

function confirmAction(ok) {
  confirmModal.classList.remove('open');
  if (ok && pendingAction) {
    pendingAction.body._confirmed = true;
    sendCommand(pendingAction.endpoint, pendingAction.body, pendingAction.btn);
  }
  pendingAction = null;
}

// ---------------------------------------------------------------------------
// Windows (timed hold with manual release)
// ---------------------------------------------------------------------------
function startWindow(side, direction) {
  if (windowHoldTimers[side]) return;
  sendCommand('windows', { side, direction });
  // Safety net: ensure we don't hold beyond max if release event is lost.
  windowHoldTimers[side] = setTimeout(() => stopWindow(side), 8500);
}

async function stopWindow(side) {
  const timer = windowHoldTimers[side];
  if (timer) {
    clearTimeout(timer);
    delete windowHoldTimers[side];
  }
  try {
    const res = await fetch('/api/vehicle/windows/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ side }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.record) logEntry(data.record);
  } catch (err) {
    // Ignore: window may have already completed.
  }
}

// ---------------------------------------------------------------------------
// SVG zones
// ---------------------------------------------------------------------------
document.querySelectorAll('.interactive-zone').forEach(zone => {
  zone.addEventListener('click', () => {
    const fn = zone.dataset.fn;
    if (!fn) return;
    zone.classList.add("tap-feedback");
    setTimeout(() => zone.classList.remove("tap-feedback"), 220);
    if (fn === 'headlights') {
      // Toggle based on current active state
      const active = zone.classList.contains('active');
      sendCommand('headlights', { state: !active });
    } else if (fn.startsWith('window_')) {
      const side = zone.dataset.side;
      const dir = zone.dataset.dir;
      if (side && dir) sendCommand('windows', { side, direction: dir });
    } else if (fn.startsWith('doors_')) {
      const action = zone.dataset.action;
      if (action) sendCommand('doors', { action });
    } else {
      sendCommand(fn === 'horn' ? 'honk' : fn, {});
    }
  });
});

// ---------------------------------------------------------------------------
// Diagnostic & status
// ---------------------------------------------------------------------------
async function refreshHistory() {
  try {
    const data = await apiGet('/api/vehicle/history?limit=20');
    diagLog.innerHTML = '';
    data.records.forEach(logEntry);
    // Resynchronise l'état graphique des feux avec le dernier état connu.
    const lastLights = data.records.find(r => r.function === 'headlights' && r.status === 'completed');
    const lastStopAll = data.records.find(r => r.function === 'stop_all' && r.status === 'completed');
    if (lastStopAll && (!lastLights || lastStopAll.timestamp > lastLights.timestamp)) {
      setHeadlightsState(false);
    } else if (lastLights) {
      setHeadlightsState(!!lastLights.state);
    }
    ["scanner", "fog_lights", "laser"].forEach(fn => {
      const last = data.records.find(r => r.function === fn && r.status === "completed");
      setFunctionState(fn, last ? !!last.state : false);
    });
  } catch (err) {
    setStatus(`Impossible de charger l'historique : ${err.message}`, 'offline');
  }
}

async function loadRelayInfo() {
  try {
    const data = await apiGet('/api/vehicle/relays/info');
    if (data.available) {
      const moduleSize = Number(data.module_size || 8);
      const installedCount = Number(data.installed_modules || 1) * moduleSize;
      relayInfo.dataset.relayCount = String(Number(data.relay_count || installedCount));
      relayInfo.dataset.installedRelayCount = String(installedCount);
      relayInfo.textContent = `RELAY ${data.port} | ${data.protocol.toUpperCase()} | ${installedCount}/${data.relay_count} ACCESSIBLES`;
      const config = await apiGet("/api/vehicle/config");
      buildRawRelayGrid(config);
      setStatus('Service véhicule connecté', 'online');
    } else {
      relayInfo.textContent = 'RELAY INDISPONIBLE';
      setStatus(data.error || 'Carte relais non détectée', 'warning');
    }
  } catch (err) {
    relayInfo.textContent = 'RELAY INCONNUE';
    setStatus(`Service indisponible : ${err.message}`, 'offline');
  }
}

function goBack() {
  window.location.href = '/';
}

function buildRawRelayGrid(config = {}) {
  const grid = document.getElementById('rawRelayGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const planned = Number(relayInfo.dataset.relayCount || 16);
  const installed = Number(relayInfo.dataset.installedRelayCount || 16);
  const labels = {};
  const windows = config.windows || {};
  (windows.polarity_relays || []).forEach(i => { labels[Number(i)] = "Polarité vitres"; });
  Object.entries(windows.selectors || {}).forEach(([name, relays]) => {
    if (name === "both") return;
    (relays || []).forEach(i => { labels[Number(i)] = "Vitre " + name; });
  });
  Object.values(config.functions || {}).forEach(item => {
    if (item.relay && !labels[Number(item.relay)]) labels[Number(item.relay)] = item.label;
  });
  for (let i = 1; i <= planned; i++) {
    const btn = document.createElement('button');
    btn.className = "ctrl-btn relay-test-btn";
    btn.textContent = "R" + i + "\n" + (labels[i] || "Non affecté");
    btn.setAttribute("aria-label", "Tester le relais " + i + " : " + (labels[i] || "Non affecté"));
    if (i <= installed) {
      btn.title = `Pulse relais ${i} pendant 0.5s`;
      btn.onclick = () => rawRelay(i, 0.5);
    } else {
      btn.disabled = true;
      btn.title = `Relais ${i} préparé, module matériel absent`;
      btn.classList.add('unavailable');
    }
    grid.appendChild(btn);
  }
}

async function rawRelay(relay, duration) {
  try {
    const data = await apiPost('/api/vehicle/raw', { relay, duration_seconds: duration });
    if (data.record) logEntry(data.record);
    setStatus(`Test relais ${relay} terminé`, 'online');
  } catch (err) {
    logEntry({
      function: `raw_relay_${relay}`,
      relay,
      state: false,
      duration_ms: duration * 1000,
      status: 'error',
      message: err.message,
      timestamp: Date.now() / 1000,
    });
    setStatus(`Erreur test relais ${relay}: ${err.message}`, 'offline');
  }
}

// ---------------------------------------------------------------------------
// Navigation horizontale tactile
// ---------------------------------------------------------------------------
const pagesTrack = document.getElementById("pagesTrack");
const pagesViewport = document.getElementById("pagesViewport");
let currentPage = 0;
let swipeStartX = null;
let swipeStartY = null;

function showPage(page) {
  currentPage = page === 1 ? 1 : 0;
  pagesTrack.classList.toggle("show-controls", currentPage === 1);
  document.body.dataset.vehiclePage = String(currentPage);
}

pagesViewport.addEventListener("touchstart", event => {
  if (event.touches.length !== 1) return;
  swipeStartX = event.touches[0].clientX;
  swipeStartY = event.touches[0].clientY;
}, { passive: true });

pagesViewport.addEventListener("touchend", event => {
  if (swipeStartX === null || !event.changedTouches.length) return;
  const dx = event.changedTouches[0].clientX - swipeStartX;
  const dy = event.changedTouches[0].clientY - swipeStartY;
  swipeStartX = null;
  swipeStartY = null;
  if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
  showPage(dx < 0 ? 1 : 0);
}, { passive: true });

document.addEventListener("keydown", event => {
  if (event.key === "ArrowRight") showPage(1);
  if (event.key === "ArrowLeft") showPage(0);
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
buildRawRelayGrid();
if (window.location.hash === "#controls") showPage(1);
loadRelayInfo();
refreshHistory();
setInterval(loadRelayInfo, 10000);
setInterval(refreshHistory, 5000);
