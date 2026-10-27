(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#world");
  const ctx = canvas?.getContext("2d", { alpha: false });
  if (!ctx) return;

  const W = 960, H = 540, TILE = 32, COLS = 30, ROWS = 15, MAP_TOP = 32;
  const RECORD_KEY = "kitt.signal-zero.record.v1";
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const intro = $("#intro"), game = $("#game"), startButton = $("#start-button");
  const pauseOverlay = $("#pause-overlay"), endOverlay = $("#end-overlay");
  const keys = new Set();
  let state = null, raf = 0, lastFrame = 0, toastTimer = 0;
  let audio = null, soundEnabled = true;
  let bestRecord = readRecord();

  function readRecord() {
    try { return JSON.parse(localStorage.getItem(RECORD_KEY) || "null"); }
    catch { return null; }
  }
  function timeLabel(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  function updateBestLabel() {
    $("#best-record").textContent = bestRecord
      ? `MEILLEUR TEMPS : ${timeLabel(bestRecord.time)} · ${bestRecord.rescued} SURVIVANTS`
      : "AUCUNE MISSION ENREGISTRÉE";
  }
  updateBestLabel();

  const k = (x, y) => `${x},${y}`;
  function buildWorld() {
    const solid = new Set();
    for (let x = 0; x < COLS; x++) { solid.add(k(x, 0)); solid.add(k(x, ROWS - 1)); }
    for (let y = 0; y < ROWS; y++) { solid.add(k(0, y)); solid.add(k(COLS - 1, y)); }
    const blocks = [
      [5, 2, 5, 3], [20, 2, 4, 3], [5, 10, 5, 3], [19, 10, 5, 3],
      [12, 2, 2, 2], [12, 11, 2, 2], [26, 5, 2, 2],
    ];
    for (const [x, y, width, height] of blocks) {
      for (let by = y; by < y + height; by++) for (let bx = x; bx < x + width; bx++) solid.add(k(bx, by));
    }
    for (const [x, y] of [[10, 6], [10, 8], [18, 6], [18, 8], [3, 5], [3, 9], [16, 5], [16, 10], [25, 9], [26, 8]]) solid.add(k(x, y));
    const at = (x, y) => ({ x: x * TILE + TILE / 2, y: MAP_TOP + y * TILE + TILE / 2 });
    const items = [
      { kind: "part", ...at(11, 6), hidden: true }, { kind: "part", ...at(17, 3), hidden: true },
      { kind: "part", ...at(13, 13), hidden: true }, { kind: "part", ...at(25, 12), hidden: true },
      { kind: "fuel", ...at(3, 2), hidden: false }, { kind: "fuel", ...at(16, 8), hidden: true },
      { kind: "fuel", ...at(27, 12), hidden: true },
      { kind: "food", ...at(3, 12), hidden: false }, { kind: "food", ...at(17, 1), hidden: true },
      { kind: "food", ...at(25, 7), hidden: true },
      { kind: "battery", ...at(11, 8), hidden: true }, { kind: "battery", ...at(17, 13), hidden: true },
      { kind: "battery", ...at(8, 7), hidden: false },
    ];
    const survivors = [
      { ...at(11, 1), name: "LÉA", rescued: false },
      { ...at(25, 8), name: "MARC", rescued: false },
      { ...at(15, 13), name: "ÉLISE", rescued: false },
    ];
    const car = { ...at(3, 7), angle: 0 };
    return { solid, blocks, items, survivors, car, relay: at(27, 1), at };
  }

  function newRun() {
    const world = buildWorld();
    const player = world.at(1.5, 7.5);
    state = {
      mode: "playing", world, player: { ...player, faceX: 1, faceY: 0 },
      energy: 100, fuel: 25, cold: 12, threat: 8, health: 3, food: 1, parts: 0,
      rescued: 0, elapsed: 0, scannerUntil: 0, scannerCooldown: 0,
      damageUntil: 0, coldDamage: 0, enemy: null, particles: [],
      log: [], lastHud: 0, lastToast: 0, messageClock: 0,
    };
    keys.clear(); pauseOverlay.hidden = true; endOverlay.hidden = true;
    intro.hidden = true; game.hidden = false;
    $("#relay-hint").textContent = "La balise attend tes instructions.";
    radio("KITT", "Canal sécurisé ouvert. Je reste en veille près de toi.");
    updateHud();
    canvas.focus({ preventScroll: true });
    unlockAudio(); tone(640, 0.08, "triangle");
    lastFrame = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    showToast("Mission lancée. Cherche les caches et reste près de KITT.");
  }

  function unlockAudio() {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audio && AudioContext) audio = new AudioContext();
      if (audio?.state === "suspended") audio.resume().catch(() => {});
    } catch { audio = null; }
  }
  function tone(frequency, duration = 0.09, wave = "sine", volume = 0.075) {
    if (!soundEnabled || !audio) return;
    try {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = wave; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + duration);
    } catch { /* Audio remains optional. */ }
  }
  function sound(kind) {
    const notes = { pickup: [740, "square"], scan: [520, "sawtooth"], rescue: [880, "triangle"], alert: [190, "sawtooth"], repair: [620, "triangle"], hit: [120, "square"], win: [980, "triangle"] };
    const [freq, wave] = notes[kind] || [440, "sine"];
    tone(freq, kind === "win" ? 0.3 : 0.11, wave, kind === "alert" ? 0.1 : 0.055);
    if (kind === "win") window.setTimeout(() => tone(1240, 0.3, "triangle", 0.055), 160);
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message; toast.classList.add("visible");
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
  }
  function radio(speaker, message) {
    if (!state) return;
    state.log.unshift({ time: timeLabel(state.elapsed), speaker, message });
    state.log = state.log.slice(0, 5);
    const list = $("#radio-log");
    list.replaceChildren(...state.log.map((entry) => {
      const li = document.createElement("li"), time = document.createElement("time"), text = document.createElement("span");
      time.textContent = entry.time; text.textContent = `${entry.speaker} : ${entry.message}`;
      li.append(time, text); return li;
    }));
  }

  function solidAt(px, py) {
    if (py < MAP_TOP || py >= MAP_TOP + ROWS * TILE) return true;
    const { car, relay } = state.world;
    if (Math.abs(px - car.x) < 32 && Math.abs(py - car.y) < 17) return true;
    if (Math.abs(px - relay.x) < 19 && Math.abs(py - relay.y) < 27) return true;
    const tx = Math.floor(px / TILE), ty = Math.floor((py - MAP_TOP) / TILE);
    return state.world.solid.has(k(tx, ty));
  }
  function walkable(px, py) {
    const radius = 8;
    return !solidAt(px - radius, py - radius) && !solidAt(px + radius, py - radius) &&
      !solidAt(px - radius, py + radius) && !solidAt(px + radius, py + radius);
  }
  function isNear(a, b, distance = 38) { return Math.hypot(a.x - b.x, a.y - b.y) <= distance; }

  function scan() {
    if (!state || state.mode !== "playing") return;
    if (state.scannerCooldown > 0) return showToast(`Scanner en recharge · ${state.scannerCooldown.toFixed(1)} s`);
    if (state.energy < 10) return showToast("Batterie trop faible pour lancer le scanner.");
    state.energy = Math.max(0, state.energy - 10);
    state.threat = Math.min(100, state.threat + 17);
    state.scannerUntil = state.elapsed + 3.8;
    state.scannerCooldown = 3.4;
    sound("scan");
    radio("KITT", "Balayage actif. Des échos apparaissent dans le secteur.");
    showToast("Écho détecté : les caches cachées brillent quelques secondes.");
    updateHud();
  }

  function interact() {
    if (!state || state.mode !== "playing") return;
    const { player, world } = state;
    const survivor = world.survivors.find((person) => !person.rescued && isNear(player, person, 40));
    if (survivor) {
      survivor.rescued = true; state.rescued += 1; state.energy = Math.max(0, state.energy - 2);
      sound("rescue"); radio(survivor.name, "Je suis avec toi. Merci de ne pas m’avoir laissé ici.");
      showToast(`${survivor.name} rejoint le convoi.`); updateHud(); return;
    }
    if (isNear(player, world.relay, 46)) {
      const missing = [];
      if (state.parts < 3) missing.push(`${3 - state.parts} pièce${state.parts === 2 ? "" : "s"}`);
      if (state.rescued < 2) missing.push(`${2 - state.rescued} survivant${state.rescued === 1 ? "" : "s"}`);
      if (state.fuel < 35) missing.push(`${Math.ceil(35 - state.fuel)} carburant`);
      if (missing.length) {
        const message = `Il manque : ${missing.join(" · ")}.`;
        $("#relay-hint").textContent = message; showToast(message); radio("KITT", message); return;
      }
      finish(true); return;
    }
    if (isNear(player, world.car, 65)) {
      if (state.energy <= 72 && state.fuel >= 8) {
        state.fuel -= 8; state.energy = Math.min(100, state.energy + 34);
        state.cold = Math.max(0, state.cold - 28); sound("repair");
        showToast("KITT recharge ton équipement depuis la batterie auxiliaire.");
        radio("KITT", "Recharge de secours terminée. Scanner prêt.");
      } else if (state.health < 3 && state.food > 0) {
        state.food -= 1; state.health += 1; state.cold = Math.max(0, state.cold - 16); sound("repair");
        showToast("Tu reprends des forces au chaud dans KITT."); radio("KITT", "État stabilisé. Une ration a été utilisée.");
      } else if (state.cold > 30) {
        state.cold = Math.max(0, state.cold - 22); state.energy = Math.min(100, state.energy + 8);
        showToast("Tu te réchauffes quelques instants dans l’habitacle."); radio("KITT", "Chauffage d’appoint en marche.");
      } else {
        showToast("KITT est prêt. Reviens avec une ration ou un peu de carburant pour te ravitailler.");
      }
      updateHud(); return;
    }
    showToast("Rien à portée. Approche-toi d’un survivant, de KITT ou de la balise.");
  }

  function updateHud() {
    if (!state) return;
    const setBar = (id, value, text) => { $(`#${id}-meter`).style.width = `${Math.max(0, Math.min(100, value))}%`; $(`#${id}-value`).textContent = text; };
    setBar("battery", state.energy, `${Math.round(state.energy)}%`);
    setBar("fuel", state.fuel, `${Math.round(state.fuel)} / 100`);
    setBar("cold", state.cold, `${Math.round(state.cold)}%`);
    setBar("threat", state.threat, `${Math.round(state.threat)}%`);
    $("#parts-count").textContent = `${Math.min(state.parts, 3)} / 3`;
    $("#survivors-count").textContent = `${Math.min(state.rescued, 2)} / 2`;
    $("#fuel-count").textContent = `${Math.round(state.fuel)} / 35`;
    $("#food-count").textContent = String(state.food);
    $("#parts-inventory").textContent = String(state.parts);
    $("#health-count").textContent = `${"♥ ".repeat(state.health).trim()}${state.health < 1 ? "—" : ""}`;
    const completed = Number(state.parts >= 3) + Number(state.rescued >= 2) + Number(state.fuel >= 35);
    $("#objective-count").textContent = `${String(completed).padStart(2, "0")} / 03`;
    $("#obj-parts").classList.toggle("complete", state.parts >= 3);
    $("#obj-survivors").classList.toggle("complete", state.rescued >= 2);
    $("#obj-fuel").classList.toggle("complete", state.fuel >= 35);
    $("#clock").textContent = timeLabel(state.elapsed);
  }

  function finish(won) {
    if (!state || state.mode !== "playing") return;
    state.mode = won ? "won" : "lost"; keys.clear();
    if (won) {
      sound("win");
      const result = { time: state.elapsed, rescued: state.rescued, score: Math.round(state.parts * 100 + state.rescued * 250 + state.fuel + state.energy) };
      if (!bestRecord || result.score > bestRecord.score) {
        bestRecord = result;
        try { localStorage.setItem(RECORD_KEY, JSON.stringify(bestRecord)); } catch { /* Record is optional. */ }
        updateBestLabel();
      }
      $("#end-kicker").textContent = "TRANSMISSION RÉTABLIE";
      $("#end-title").textContent = "BALISE ACTIVE";
      $("#end-copy").textContent = `Tu as rétabli le signal en ${timeLabel(state.elapsed)} et ramené ${state.rescued} survivant${state.rescued > 1 ? "s" : ""}. KITT reprend la route.`;
      radio("KITT", "Signal rétabli. Tous les survivants peuvent rentrer.");
    } else {
      sound("alert");
      $("#end-kicker").textContent = "SIGNAL PERDU";
      $("#end-title").textContent = "MISSION INTERROMPUE";
      $("#end-copy").textContent = "KITT a sécurisé la zone. Recharge et tente un autre itinéraire.";
      radio("KITT", "Je reste avec toi. Nous pouvons recommencer quand tu le souhaites.");
    }
    endOverlay.hidden = false;
  }

  function radioClock() { return timeLabel(state?.elapsed ?? 0); }
  function damage() {
    if (state.elapsed < state.damageUntil) return;
    state.health -= 1; state.damageUntil = state.elapsed + 2.2;
    state.threat = Math.max(25, state.threat - 22); state.enemy = null;
    sound("hit");
    radio("KITT", "Impact détecté. Éloigne-toi de la patrouille et reviens vers moi.");
    showToast(`Impact ! État du pilote : ${Math.max(0, state.health)} vie${state.health === 1 ? "" : "s"}.`);
    if (state.health <= 0) finish(false);
    updateHud();
  }

  function update(dt) {
    if (!state || state.mode !== "playing") return;
    const { player, world } = state;
    state.elapsed += dt;
    state.energy = Math.max(0, state.energy - dt * 0.035);
    state.cold = Math.min(100, state.cold + dt * 0.055);
    state.threat = Math.max(0, state.threat - dt * (state.scannerUntil > state.elapsed ? 0 : 0.16));
    state.scannerCooldown = Math.max(0, state.scannerCooldown - dt);
    if (isNear(player, world.car, 68)) state.cold = Math.max(0, state.cold - dt * 0.75);

    let vx = Number(keys.has("right")) - Number(keys.has("left"));
    let vy = Number(keys.has("down")) - Number(keys.has("up"));
    const moving = vx !== 0 || vy !== 0;
    const sprint = moving && keys.has("sprint") && state.energy > 2;
    if (moving) {
      const magnitude = Math.hypot(vx, vy); vx /= magnitude; vy /= magnitude;
      const speed = sprint ? 218 : 148;
      const nx = player.x + vx * speed * dt, ny = player.y + vy * speed * dt;
      if (walkable(nx, player.y)) player.x = nx;
      if (walkable(player.x, ny)) player.y = ny;
      player.faceX = vx; player.faceY = vy;
      if (sprint) { state.energy = Math.max(0, state.energy - dt * 5.8); state.threat = Math.min(100, state.threat + dt * 1.1); }
    }
    if (state.cold > 86 && state.elapsed > state.coldDamage) {
      state.coldDamage = state.elapsed + 8; state.health -= 1;
      radio("KITT", "Température critique. Reviens à l’abri avant de perdre connaissance.");
      showToast("Le froid t’épuise. Rejoins KITT pour te réchauffer.");
      if (state.health <= 0) finish(false);
    }

    for (const item of world.items) {
      if (item.collected || !isNear(player, item, 18)) continue;
      item.collected = true;
      if (item.kind === "part") state.parts += 1;
      if (item.kind === "fuel") state.fuel = Math.min(100, state.fuel + 18);
      if (item.kind === "food") state.food += 1;
      if (item.kind === "battery") state.energy = Math.min(100, state.energy + 22);
      sound("pickup");
      const names = { part: "Pièce de relais", fuel: "Carburant", food: "Ration", battery: "Cellule de batterie" };
      showToast(`${names[item.kind]} récupéré.`); radio("KITT", `${names[item.kind]} ajoutée à l’inventaire.`); updateHud();
    }

    if (state.threat >= 55 && !state.enemy) {
      state.enemy = { x: 27.5 * TILE, y: MAP_TOP + 12.5 * TILE, vx: 0, vy: 0, pulse: 0 };
      radio("KITT", "Patrouille KARR détectée. Le scanner l’a alertée."); sound("alert");
    }
    if (state.enemy) {
      const enemy = state.enemy, dx = player.x - enemy.x, dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1, speed = 40 + state.threat * 0.32;
      const nx = enemy.x + dx / distance * speed * dt, ny = enemy.y + dy / distance * speed * dt;
      if (walkable(nx, enemy.y)) enemy.x = nx;
      else if (Math.random() < dt * 2) enemy.y += (Math.random() < 0.5 ? -1 : 1) * TILE;
      if (walkable(enemy.x, ny)) enemy.y = ny;
      else if (Math.random() < dt * 2) enemy.x += (Math.random() < 0.5 ? -1 : 1) * TILE;
      enemy.pulse += dt;
      if (distance < 22) damage();
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    if (state.elapsed - state.lastHud > 0.18) { state.lastHud = state.elapsed; updateHud(); }
  }

  function drawGround() {
    const { blocks } = state.world;
    ctx.fillStyle = "#111b20"; ctx.fillRect(0, MAP_TOP, W, H - MAP_TOP);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const px = x * TILE, py = MAP_TOP + y * TILE;
      const road = y === 7 || y === 8 || x === 14 || x === 15;
      ctx.fillStyle = road ? ((x + y) % 2 ? "#252b31" : "#22282e") : ((x * 7 + y * 11) % 3 ? "#14211e" : "#17231f");
      ctx.fillRect(px, py, TILE, TILE);
      if (!road && (x * 13 + y * 17) % 11 === 0) { ctx.fillStyle = "#26372b"; ctx.fillRect(px + 8, py + 12, 3, 3); ctx.fillRect(px + 23, py + 24, 2, 2); }
      if (road && (y === 7 || y === 8) && x % 3 !== 1) { ctx.fillStyle = "#a28a58"; ctx.fillRect(px + 9, py + 15, 13, 2); }
      if (road && (x === 14 || x === 15) && y % 3 !== 1) { ctx.fillStyle = "#a28a58"; ctx.fillRect(px + 15, py + 9, 2, 13); }
      if ((x + y * 2) % 37 === 0 && !state.world.solid.has(k(x, y))) { ctx.fillStyle = "#3c4c3b"; ctx.fillRect(px + 2, py + 26, 7, 3); }
    }
    for (const [x, y, width, height] of blocks) drawBuilding(x, y, width, height);
    for (const [x, y] of [[10, 6], [10, 8], [18, 6], [18, 8], [3, 5], [3, 9], [16, 5], [16, 10], [25, 9], [26, 8]]) drawRubble(x, y);
    drawRelay(); drawCar();
  }
  function drawBuilding(x, y, width, height) {
    const px = x * TILE, py = MAP_TOP + y * TILE, w = width * TILE, h = height * TILE;
    ctx.fillStyle = "#0b1018"; ctx.fillRect(px - 4, py - 4, w + 8, h + 8);
    ctx.fillStyle = "#242936"; ctx.fillRect(px, py, w, h);
    ctx.fillStyle = "#303746"; ctx.fillRect(px + 3, py + 3, w - 6, h - 6);
    ctx.fillStyle = "#1a202b"; ctx.fillRect(px + 7, py + 8, w - 14, h - 16);
    ctx.strokeStyle = "#495160"; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, w - 4, h - 4);
    for (let wx = px + 12; wx < px + w - 8; wx += 24) for (let wy = py + 13; wy < py + h - 8; wy += 24) {
      ctx.fillStyle = (wx + wy) % 3 ? "#36414b" : "#77583d"; ctx.fillRect(wx, wy, 8, 6);
    }
    ctx.fillStyle = "#141b23"; ctx.fillRect(px + w * .36, py + h - 11, w * .28, 6);
  }
  function drawRubble(tx, ty) {
    const x = tx * TILE, y = MAP_TOP + ty * TILE;
    ctx.fillStyle = "#30353b"; ctx.fillRect(x + 6, y + 12, 20, 10);
    ctx.fillStyle = "#41464c"; ctx.fillRect(x + 10, y + 8, 8, 5); ctx.fillRect(x + 20, y + 15, 7, 6);
    ctx.fillStyle = "#11161a"; ctx.fillRect(x + 8, y + 23, 15, 2);
  }
  function drawCar() {
    const car = state.world.car, x = car.x, y = car.y;
    ctx.save(); ctx.translate(x, y); ctx.rotate(car.angle);
    ctx.fillStyle = "#07090e"; ctx.fillRect(-31, -16, 64, 32);
    ctx.fillStyle = "#171d27"; ctx.fillRect(-26, -14, 52, 28);
    ctx.fillStyle = "#222b38"; ctx.fillRect(-10, -11, 25, 22);
    ctx.fillStyle = "#6c7888"; ctx.fillRect(-6, -9, 14, 18);
    ctx.fillStyle = "#05070b"; ctx.fillRect(-24, -13, 9, 7); ctx.fillRect(16, -13, 9, 7); ctx.fillRect(-24, 6, 9, 7); ctx.fillRect(16, 6, 9, 7);
    ctx.fillStyle = "#e23851"; ctx.fillRect(-29, -2, 4, 4); ctx.fillRect(27, -2, 4, 4);
    ctx.fillStyle = "#ff384e"; ctx.fillRect(-26, -2, 52, 4);
    ctx.globalAlpha = .26 + Math.sin(state.elapsed * (reducedMotion ? 0 : 5)) * .08;
    ctx.fillStyle = "#f2344d"; ctx.fillRect(-32, -7, 66, 14);
    ctx.restore();
    ctx.fillStyle = "#f1d8a3"; ctx.font = "9px 'Share Tech Mono',monospace"; ctx.textAlign = "center"; ctx.fillText("KITT · ABRI", x, y + 29);
  }
  function drawRelay() {
    const { x, y } = state.world.relay;
    ctx.fillStyle = "#141b23"; ctx.fillRect(x - 18, y - 24, 36, 52);
    ctx.fillStyle = "#343c49"; ctx.fillRect(x - 14, y - 20, 28, 46);
    ctx.fillStyle = "#131921"; ctx.fillRect(x - 5, y - 52, 10, 33);
    ctx.strokeStyle = "#66707d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 54); ctx.lineTo(x - 18, y - 33); ctx.moveTo(x, y - 54); ctx.lineTo(x + 18, y - 33); ctx.stroke();
    const pulse = .55 + Math.sin(state.elapsed * (reducedMotion ? 0 : 4)) * .35;
    ctx.fillStyle = `rgba(255,50,73,${pulse})`; ctx.fillRect(x - 4, y - 62, 8, 7); ctx.fillRect(x - 1, y - 70, 2, 8);
    ctx.fillStyle = "#e2c17e"; ctx.font = "9px monospace"; ctx.textAlign = "center"; ctx.fillText("BALISE", x, y + 39);
  }
  function drawItem(item) {
    if (item.collected) return;
    const distance = Math.hypot(state.player.x - item.x, state.player.y - item.y);
    const scannerReveals = state.scannerUntil > state.elapsed && distance < 260;
    if (item.hidden && distance > 82 && !scannerReveals) return;
    const colors = { part: "#f1b95a", fuel: "#ff765e", food: "#8fe0a6", battery: "#64dff1" };
    const color = colors[item.kind], t = state.elapsed;
    ctx.save(); ctx.globalAlpha = item.hidden && distance > 82 ? .7 : 1;
    ctx.fillStyle = color; ctx.globalAlpha *= .16 + Math.sin(reducedMotion ? 1 : t * 5) * .05;
    ctx.beginPath(); ctx.arc(item.x, item.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = color; ctx.strokeStyle = "#071018"; ctx.lineWidth = 2;
    if (item.kind === "part") { ctx.fillRect(item.x - 8, item.y - 6, 16, 12); ctx.fillRect(item.x - 3, item.y - 9, 8, 3); ctx.fillStyle = "#fff1c8"; ctx.fillRect(item.x - 4, item.y - 2, 4, 4); }
    else if (item.kind === "fuel") { ctx.fillRect(item.x - 6, item.y - 8, 12, 16); ctx.fillRect(item.x - 2, item.y - 11, 5, 4); ctx.fillStyle = "#17131a"; ctx.fillRect(item.x - 3, item.y - 3, 6, 5); }
    else if (item.kind === "food") { ctx.fillRect(item.x - 7, item.y - 5, 14, 11); ctx.fillRect(item.x - 3, item.y - 8, 7, 4); ctx.fillStyle = "#eaffda"; ctx.fillRect(item.x - 2, item.y - 3, 4, 7); ctx.fillRect(item.x - 4, item.y - 1, 8, 3); }
    else { ctx.fillRect(item.x - 6, item.y - 9, 12, 18); ctx.fillStyle = "#0b1a20"; ctx.fillRect(item.x - 2, item.y - 6, 4, 12); ctx.fillRect(item.x - 5, item.y - 2, 10, 4); }
    ctx.restore();
  }
  function drawSurvivor(person) {
    if (person.rescued) return;
    const nearby = isNear(state.player, person, 52);
    const blink = Math.floor(state.elapsed * (reducedMotion ? 1 : 3)) % 2 === 0;
    ctx.fillStyle = "#7fe5dc"; ctx.globalAlpha = blink ? .9 : .5;
    ctx.beginPath(); ctx.arc(person.x, person.y, nearby ? 19 : 12, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = "#202a36"; ctx.fillRect(person.x - 6, person.y - 5, 12, 17);
    ctx.fillStyle = "#e4bc97"; ctx.fillRect(person.x - 5, person.y - 12, 10, 9);
    ctx.fillStyle = "#89bde5"; ctx.fillRect(person.x - 7, person.y + 2, 14, 11);
    ctx.fillStyle = "#f1eadb"; ctx.font = "10px monospace"; ctx.textAlign = "center";
    ctx.fillText(nearby ? `${person.name} · E` : "SOS", person.x, person.y - 20);
  }
  function drawPlayer() {
    const p = state.player, flicker = state.elapsed < state.damageUntil && Math.floor(state.elapsed * 12) % 2 === 0;
    if (flicker) return;
    const angle = Math.atan2(p.faceY, p.faceX);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
    ctx.fillStyle = "#0a0d12"; ctx.fillRect(-8, -9, 19, 18);
    ctx.fillStyle = "#d5b295"; ctx.fillRect(3, -5, 8, 10);
    ctx.fillStyle = "#d4454c"; ctx.fillRect(-8, -8, 11, 16);
    ctx.fillStyle = "#f4d2b3"; ctx.fillRect(6, -3, 4, 2);
    ctx.fillStyle = "#5b6776"; ctx.fillRect(-6, -12, 6, 3); ctx.fillRect(-6, 9, 6, 3);
    ctx.restore();
  }
  function drawEnemy() {
    const enemy = state.enemy; if (!enemy) return;
    ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(Math.sin(enemy.pulse * 3) * .08);
    ctx.fillStyle = "#30111c"; ctx.fillRect(-14, -9, 28, 18);
    ctx.fillStyle = "#f13552"; ctx.fillRect(-11, -7, 22, 14);
    ctx.fillStyle = "#ffe3e6"; ctx.fillRect(-5, -2, 10, 4);
    ctx.fillStyle = "#080b10"; ctx.fillRect(-19, -13, 8, 3); ctx.fillRect(11, 10, 8, 3);
    ctx.restore();
  }
  function drawEffects() {
    const { player } = state;
    const grad = ctx.createRadialGradient(player.x, player.y, 60, player.x, player.y, 420);
    grad.addColorStop(0, "rgba(1,4,12,.03)"); grad.addColorStop(.55, "rgba(1,4,12,.30)"); grad.addColorStop(1, "rgba(1,4,12,.74)");
    ctx.fillStyle = grad; ctx.fillRect(0, MAP_TOP, W, H - MAP_TOP);
    if (state.scannerUntil > state.elapsed) {
      const progress = (state.scannerUntil - state.elapsed) / 3.8;
      ctx.save(); ctx.globalAlpha = .55 * progress; ctx.strokeStyle = "#ff4058"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(player.x, player.y, 35 + (1 - progress) * 230, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .07 * progress; ctx.fillStyle = "#e12a46"; ctx.beginPath(); ctx.arc(player.x, player.y, 260, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    for (const p of state.particles) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#b9c5d2"; ctx.font = "10px monospace"; ctx.textAlign = "left"; ctx.fillText(`ZONE NORD · ${timeLabel(state.elapsed)}`, 14, 20);
    ctx.textAlign = "right"; ctx.fillStyle = state.threat > 55 ? "#ff6678" : "#758599"; ctx.fillText(state.threat > 55 ? "SIGNAL DÉTECTÉ" : "CANAL DISCRET", W - 14, 20);
    const radarX = W - 38, radarY = 58;
    ctx.strokeStyle = "#6d829c88"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(radarX, radarY, 19, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#6bd6e7"; ctx.fillRect(radarX - 2, radarY - 2, 4, 4);
    const dx = (state.world.relay.x - player.x) / (W / 2), dy = (state.world.relay.y - player.y) / (H / 2);
    ctx.fillStyle = "#ff445d"; ctx.fillRect(radarX + Math.max(-13, Math.min(13, dx * 150)) - 2, radarY + Math.max(-13, Math.min(13, dy * 150)) - 2, 4, 4);
    ctx.fillStyle = "#8495a8"; ctx.font = "8px monospace"; ctx.textAlign = "center"; ctx.fillText("RADAR", radarX, radarY + 31);
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#090e13"; ctx.fillRect(0, 0, W, H);
    drawGround();
    for (const item of state.world.items) drawItem(item);
    for (const person of state.world.survivors) drawSurvivor(person);
    drawEnemy(); drawPlayer(); drawEffects();
  }

  function loop(now) {
    if (!state) return;
    const dt = Math.min(.06, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
    if (state.mode === "playing") update(dt);
    if (!game.hidden) draw();
    raf = requestAnimationFrame(loop);
  }

  function setPaused(value) {
    if (!state || !["playing", "paused"].includes(state.mode)) return;
    state.mode = value ? "paused" : "playing";
    pauseOverlay.hidden = !value;
    if (value) { keys.clear(); radio("KITT", "Mission suspendue. Le temps est arrêté."); }
    else { lastFrame = performance.now(); canvas.focus({ preventScroll: true }); radio("KITT", "Canal rétabli. Je t’écoute."); }
  }
  function triggerKey(key, down) {
    const map = { arrowup: "up", z: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", q: "left", arrowright: "right", d: "right", shift: "sprint" };
    const move = map[key]; if (move) down ? keys.add(move) : keys.delete(move);
  }
  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    if (event.repeat) return;
    if (!state) return;
    if (key === "escape" || key === "p") { setPaused(state.mode === "playing"); return; }
    if (state.mode !== "playing") return;
    triggerKey(key, true);
    if (key === "e") interact();
    if (key === "f") scan();
  }
  function handleKeyUp(event) { triggerKey(event.key.toLowerCase(), false); }
  window.addEventListener("keydown", handleKeyDown, { passive: false });
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", () => keys.clear());
  document.addEventListener("visibilitychange", () => { if (document.hidden && state?.mode === "playing") setPaused(true); });

  for (const button of document.querySelectorAll("[data-hold]")) {
    const direction = button.dataset.hold;
    const down = (event) => { event.preventDefault(); if (state?.mode === "playing") { keys.add(direction); button.setPointerCapture?.(event.pointerId); } };
    const up = () => keys.delete(direction);
    button.addEventListener("pointerdown", down);
    for (const type of ["pointerup", "pointercancel", "lostpointercapture", "pointerleave"]) button.addEventListener(type, up);
    button.addEventListener("click", (event) => {
      if (event.detail === 0 && state?.mode === "playing") {
        keys.add(direction);
        window.setTimeout(() => keys.delete(direction), 160);
      }
    });
  }
  document.querySelector('[data-action="scan"]').addEventListener("click", scan);
  document.querySelector('[data-action="interact"]').addEventListener("click", interact);
  $("#pause-button").addEventListener("click", () => setPaused(state?.mode === "playing"));
  $("#resume-button").addEventListener("click", () => setPaused(false));
  $("#start-button").addEventListener("click", newRun);
  $("#replay-button").addEventListener("click", newRun);
  $("#abandon-button").addEventListener("click", () => { if (state?.mode === "playing" || state?.mode === "paused") finish(false); });
  $("#sound-toggle").addEventListener("click", (event) => {
    soundEnabled = !soundEnabled; event.currentTarget.setAttribute("aria-pressed", String(soundEnabled));
    event.currentTarget.title = soundEnabled ? "Couper le son" : "Activer le son";
    event.currentTarget.innerHTML = soundEnabled ? "♫ <span>SON</span>" : "♩ <span>MUET</span>";
    if (soundEnabled) unlockAudio(); else audio?.suspend?.();
  });
  $("#fullscreen-toggle").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { showToast("Le plein écran n’est pas disponible dans ce navigateur."); }
  });

  updateBestLabel();
  let swipeStart = null;
  canvas.addEventListener("pointerdown", (event) => {
    canvas.focus({ preventScroll: true });
    if (state?.mode !== "playing") return;
    swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!swipeStart || state?.mode !== "playing" || swipeStart.id !== event.pointerId) return;
    const dx = event.clientX - swipeStart.x, dy = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.hypot(dx, dy) < 22) return;
    const direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
    keys.add(direction); window.setTimeout(() => keys.delete(direction), 190);
  });
  canvas.addEventListener("pointercancel", () => { swipeStart = null; });
  document.addEventListener("pointerdown", () => { if (state?.mode === "playing") unlockAudio(); }, { passive: true });
})();
