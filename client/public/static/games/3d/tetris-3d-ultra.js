// Tetris 3D Ultra — puits 5×5×14, rotation 3 axes, caméra stable.
// By Manix · KITT Franco-Belge · Kyronext
(function () {
  "use strict";
  const W = 5, D = 5, H = 14, CELL = 1.05;
  const UP = new THREE.Vector3(0, 1, 0);
  const COLORS = {
    I: 0x63e9ff, O: 0xffcc00, T: 0xff4488, L: 0xff9900,
    J: 0x6348ff, S: 0x00ff88, Z: 0xff4444
  };
  const SHAPES = {
    I: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [2, 0, 0]],
    O: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]],
    T: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [0, 1, 0]],
    L: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [1, 1, 0]],
    J: [[-1, 0, 0], [0, 0, 0], [1, 0, 0], [-1, 1, 0]],
    S: [[0, 0, 0], [1, 0, 0], [-1, 1, 0], [0, 1, 0]],
    Z: [[-1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]
  };
  const TYPES = Object.keys(SHAPES);
  const KICKS = [
    [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
    [0, 1, 0], [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
    [2, 0, 0], [-2, 0, 0], [0, 0, 2], [0, 0, -2]
  ];

  let scene, camera, renderer, clock;
  let wellGroup, pieceGroup, ghostGroup, pileGroup, fx = [];
  let grid, bag = [], queue = [], current, held = null, canHold = true;
  let score = 0, level = 1, layers = 0, combo = 0, high = 0;
  let state = "menu", paused = false, over = false;
  let lastDrop = 0, lastLock = 0, lastMove = 0, soft = false;
  let keys = Object.create(null);
  let audioCtx = null, startedAt = 0, submitted = false;
  let camYaw = 0.72, camPitch = 0.92, camDist = 16.5, dragging = false, lastMX = 0, lastMY = 0;
  let geo, edgeGeo;

  function worldX(x) { return (x - (W - 1) / 2) * CELL; }
  function worldY(y) { return y * CELL + CELL * 0.5; }
  function worldZ(z) { return (z - (D - 1) / 2) * CELL; }

  function emptyGrid() {
    grid = [];
    for (let y = 0; y < H; y++) {
      grid[y] = [];
      for (let x = 0; x < W; x++) {
        grid[y][x] = [];
        for (let z = 0; z < D; z++) grid[y][x][z] = null;
      }
    }
  }

  function unlockAudio() {
    if (audioCtx) {
      if (audioCtx.state === "suspended") audioCtx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  function beep(freq, dur, vol, type) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    const t = audioCtx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function rot(cells, axis) {
    return cells.map(([x, y, z]) => {
      if (axis === "x") return [x, -z, y];
      if (axis === "y") return [z, y, -x];
      return [-y, x, z];
    });
  }

  function occupied(cells, ox, oy, oz) {
    for (const [x, y, z] of cells) {
      const nx = ox + x, ny = oy + y, nz = oz + z;
      if (nx < 0 || nx >= W || nz < 0 || nz >= D || ny < 0 || ny >= H) return true;
      if (grid[ny][nx][nz]) return true;
    }
    return false;
  }

  function camMove(sx, sz) {
    camera.updateMatrixWorld();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    function snap(v) {
      if (Math.abs(v.x) >= Math.abs(v.z)) return { x: Math.sign(v.x) || 1, z: 0 };
      return { x: 0, z: Math.sign(v.z) || 1 };
    }
    const r = snap(right), f = snap(fwd);
    return { x: r.x * sx + f.x * sz, z: r.z * sx + f.z * sz };
  }

  function makeBlock(color, ghost) {
    const mat = ghost
      ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, wireframe: true })
      : new THREE.MeshStandardMaterial({
          color, emissive: color, emissiveIntensity: 0.22,
          roughness: 0.28, metalness: 0.35
        });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !ghost;
    mesh.receiveShadow = !ghost;
    if (!ghost) {
      const edges = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
      mesh.add(edges);
    }
    return mesh;
  }

  function syncGroup(group, cells, ox, oy, oz, color, ghost) {
    while (group.children.length) group.remove(group.children[0]);
    for (const [x, y, z] of cells) {
      const b = makeBlock(color, ghost);
      b.position.set(worldX(ox + x), worldY(oy + y), worldZ(oz + z));
      group.add(b);
    }
  }

  function wellCenter() {
    return new THREE.Vector3(0, H * CELL * 0.32, 0);
  }

  function buildWell() {
    if (wellGroup) scene.remove(wellGroup);
    wellGroup = new THREE.Group();
    const hw = W * CELL / 2, hd = D * CELL / 2, hh = H * CELL;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W * CELL, D * CELL),
      new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.9, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    wellGroup.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1c1228, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
      roughness: 0.85, metalness: 0.08
    });
    const wallNS = new THREE.PlaneGeometry(W * CELL, hh);
    const wallEW = new THREE.PlaneGeometry(D * CELL, hh);
    const n = new THREE.Mesh(wallNS, wallMat); n.position.set(0, hh / 2, -hd); wellGroup.add(n);
    const s = new THREE.Mesh(wallNS, wallMat.clone()); s.position.set(0, hh / 2, hd); wellGroup.add(s);
    const w = new THREE.Mesh(wallEW, wallMat.clone()); w.rotation.y = Math.PI / 2; w.position.set(-hw, hh / 2, 0); wellGroup.add(w);
    const e = new THREE.Mesh(wallEW, wallMat.clone()); e.rotation.y = Math.PI / 2; e.position.set(hw, hh / 2, 0); wellGroup.add(e);
    const gridH = new THREE.GridHelper(Math.max(W, D) * CELL, Math.max(W, D), 0x3a2030, 0x221018);
    gridH.position.y = 0.02;
    wellGroup.add(gridH);
    const pts = [];
    const c = [
      [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
      [-hw, hh, -hd], [hw, hh, -hd], [hw, hh, hd], [-hw, hh, hd]
    ];
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    for (const [a, b] of edges) pts.push(...c[a], ...c[b]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    wellGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xff6b9d, transparent: true, opacity: 0.7 })));
    for (let y = 1; y < H; y++) {
      const ring = [];
      const yy = y * CELL;
      const r = [[-hw, yy, -hd], [hw, yy, -hd], [hw, yy, hd], [-hw, yy, hd]];
      for (let i = 0; i < 4; i++) ring.push(...r[i], ...r[(i + 1) % 4]);
      const rg = new THREE.BufferGeometry();
      rg.setAttribute("position", new THREE.Float32BufferAttribute(ring, 3));
      wellGroup.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x334455, transparent: true, opacity: y % 2 ? 0.18 : 0.32 })));
    }
    scene.add(wellGroup);
  }

  function rebuildPile() {
    while (pileGroup.children.length) {
      const c = pileGroup.children[0];
      pileGroup.remove(c);
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        for (let z = 0; z < D; z++) {
          const cell = grid[y][x][z];
          if (!cell) continue;
          const b = makeBlock(COLORS[cell]);
          b.position.set(worldX(x), worldY(y), worldZ(z));
          pileGroup.add(b);
        }
  }

  function fillBag() {
    const next = TYPES.slice();
    for (let i = next.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [next[i], next[j]] = [next[j], next[i]];
    }
    bag = bag.concat(next);
  }
  function takeType() {
    if (!bag.length) fillBag();
    return bag.shift();
  }
  function ensureQueue() {
    while (queue.length < 4) queue.push(takeType());
  }

  function spawn(type) {
    ensureQueue();
    current = {
      type,
      cells: SHAPES[type].map((c) => c.slice()),
      x: 2, y: H - 3, z: 2
    };
    if (occupied(current.cells, current.x, current.y, current.z)) {
      endGame();
      return;
    }
    lastDrop = lastLock = performance.now();
    paintPiece();
    paintMini("next-box", queue[0]);
    paintMini("hold-box", held);
    paintRadar();
  }

  function paintPiece() {
    if (!current) return;
    syncGroup(pieceGroup, current.cells, current.x, current.y, current.z, COLORS[current.type], false);
    let gy = current.y;
    while (!occupied(current.cells, current.x, gy - 1, current.z)) gy--;
    syncGroup(ghostGroup, current.cells, current.x, gy, current.z, COLORS[current.type], true);
  }

  function tryMove(dx, dy, dz) {
    if (!current || state !== "play" || paused) return false;
    const nx = current.x + dx, ny = current.y + dy, nz = current.z + dz;
    if (occupied(current.cells, nx, ny, nz)) return false;
    current.x = nx; current.y = ny; current.z = nz;
    if (dy === 0) beep(420, 0.04, 0.04, "sine");
    paintPiece();
    paintRadar();
    lastLock = performance.now();
    return true;
  }

  function tryRotate(axis) {
    if (!current || state !== "play" || paused) return;
    const rotated = rot(current.cells, axis);
    for (const [kx, ky, kz] of KICKS) {
      const nx = current.x + kx, ny = current.y + ky, nz = current.z + kz;
      if (!occupied(rotated, nx, ny, nz)) {
        current.cells = rotated;
        current.x = nx; current.y = ny; current.z = nz;
        lastLock = performance.now();
        beep(640, 0.07, 0.06, "triangle");
        paintPiece();
        paintRadar();
        return;
      }
    }
  }

  function hardDrop() {
    if (!current || state !== "play" || paused) return;
    let n = 0;
    while (tryMove(0, -1, 0)) n++;
    score += n * 2;
    lock();
  }

  function lock() {
    if (!current) return;
    for (const [x, y, z] of current.cells) {
      grid[current.y + y][current.x + x][current.z + z] = current.type;
    }
    beep(140, 0.12, 0.07, "sawtooth");
    current = null;
    canHold = true;
    clearLayers();
    rebuildPile();
    ensureQueue();
    spawn(queue.shift());
    updateHud();
  }

  function burst(y) {
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      m.scale.setScalar(0.28);
      m.position.set((Math.random() - 0.5) * W * CELL, worldY(y), (Math.random() - 0.5) * D * CELL);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8);
      m.userData.life = 0.45;
      scene.add(m);
      fx.push(m);
    }
  }

  function clearLayers() {
    const full = [];
    for (let y = 0; y < H; y++) {
      let ok = true;
      for (let x = 0; x < W && ok; x++)
        for (let z = 0; z < D && ok; z++)
          if (!grid[y][x][z]) ok = false;
      if (ok) full.push(y);
    }
    if (!full.length) { combo = 0; return; }
    for (const y of full) burst(y);
    const pts = [200, 500, 900, 1600][Math.min(full.length, 4) - 1] * level * (combo + 1);
    score += pts;
    layers += full.length;
    combo++;
    beep(280 + full.length * 90, 0.28, 0.1, "sine");
    if (layers >= level * 8) level++;
    const keep = [];
    for (let y = 0; y < H; y++) if (full.indexOf(y) < 0) keep.push(grid[y]);
    while (keep.length < H) {
      const row = [];
      for (let x = 0; x < W; x++) {
        row[x] = [];
        for (let z = 0; z < D; z++) row[x][z] = null;
      }
      keep.push(row);
    }
    grid = keep;
    if (score > high) {
      high = score;
      try { localStorage.setItem("tetris3dUltraHS", String(high)); } catch (e) { /* facultatif */ }
    }
  }

  function hold() {
    if (!current || !canHold || state !== "play" || paused) return;
    const t = current.type;
    if (held) queue.unshift(held);
    held = t;
    canHold = false;
    spawn(queue.shift());
    paintMini("hold-box", held);
  }

  function paintMini(id, type) {
    const box = document.getElementById(id);
    if (!box) return;
    box.innerHTML = "";
    const map = {};
    if (type) for (const [x, y] of SHAPES[type]) map[(y + 1) * 4 + (x + 1)] = true;
    for (let i = 0; i < 16; i++) {
      const c = document.createElement("div");
      c.className = "cell";
      if (type && map[i]) c.style.background = "#" + COLORS[type].toString(16).padStart(6, "0");
      box.appendChild(c);
    }
  }

  function paintRadar() {
    const rad = document.getElementById("radar");
    if (!rad) return;
    rad.style.gridTemplateColumns = "repeat(" + W + ", 22px)";
    rad.innerHTML = "";
    const landY = current ? (function () {
      let y = current.y;
      while (!occupied(current.cells, current.x, y - 1, current.z)) y--;
      return y;
    }()) : 0;
    const pie = {};
    if (current) {
      for (const [x, y, z] of current.cells) pie[(current.z + z) * W + (current.x + x)] = true;
    }
    for (let z = D - 1; z >= 0; z--) {
      for (let x = 0; x < W; x++) {
        const el = document.createElement("div");
        el.className = "rad";
        let occ = false;
        for (let y = 0; y <= landY; y++) if (grid[y] && grid[y][x][z]) occ = true;
        if (current && pie[z * W + x]) el.classList.add("pie");
        else if (occ) el.classList.add("occ");
        rad.appendChild(el);
      }
    }
  }

  function updateHud() {
    document.getElementById("score").textContent = "SCORE " + score.toLocaleString("fr-FR");
    document.getElementById("level").textContent = "NIVEAU " + level + " · COUCHES " + layers;
    document.getElementById("best").textContent = "RECORD " + high.toLocaleString("fr-FR");
    const c = document.getElementById("combo");
    c.classList.toggle("on", combo > 0);
    c.textContent = "COMBO ×" + combo;
  }

  function endGame() {
    over = true;
    state = "over";
    if (tuneTimer) { clearInterval(tuneTimer); tuneTimer = 0; }
    document.getElementById("over").classList.add("show");
    document.getElementById("final").textContent = "SCORE " + score.toLocaleString("fr-FR");
    beep(120, 0.8, 0.1, "sawtooth");
    if (!submitted && window.ManixScores && window.ManixScores.save) {
      submitted = true;
      let pilot = "PILOTE";
      try { pilot = localStorage.getItem("manixArcadePlayerName")?.trim().slice(0, 20) || pilot; } catch (e) { /* facultatif */ }
      window.ManixScores.save("Tetris 3D Ultra", pilot, score, level, startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0);
    }
  }

  function startGame() {
    unlockAudio();
    state = "play";
    over = false;
    paused = false;
    score = 0; level = 1; layers = 0; combo = 0;
    held = null; canHold = true; bag = []; queue = []; submitted = false;
    startedAt = Date.now();
    emptyGrid();
    rebuildPile();
    ensureQueue();
    spawn(queue.shift());
    document.getElementById("menu").classList.remove("show");
    document.getElementById("over").classList.remove("show");
    document.getElementById("pause").classList.remove("show");
    updateHud();
    startTune();
  }

  let tuneTimer = 0, tuneStep = 0;
  const TUNE = [392, 494, 523, 587, 523, 494, 392, 330, 392, 440, 494, 392, 330, 262, 330, 392];
  function startTune() {
    if (!audioCtx) return;
    if (tuneTimer) clearInterval(tuneTimer);
    tuneStep = 0;
    tuneTimer = setInterval(() => {
      if (state !== "play" || paused || over || !audioCtx) return;
      const f = TUNE[tuneStep % TUNE.length];
      beep(f, 0.16, 0.035, "triangle");
      if (tuneStep % 4 === 0) beep(98, 0.12, 0.03, "sine");
      tuneStep++;
    }, 220);
  }

  function togglePause() {
    if (state !== "play" || over) return;
    paused = !paused;
    document.getElementById("pause").classList.toggle("show", paused);
    lastDrop = lastLock = performance.now();
  }

  function gravityMs() {
    return Math.max(90, 780 - (level - 1) * 55);
  }

  function update(now) {
    if (state !== "play" || paused || over || !current) return;
    const grounded = occupied(current.cells, current.x, current.y - 1, current.z);
    if (!grounded) lastLock = now;
    if (now - lastDrop > (soft ? 50 : gravityMs())) {
      if (!tryMove(0, -1, 0) && grounded && now - lastLock > 420) lock();
      lastDrop = now;
    } else if (grounded && now - lastLock > 480) lock();
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.userData.life -= 0.016;
      p.position.addScaledVector(p.userData.v, 0.016);
      p.userData.v.y -= 18 * 0.016;
      p.material.opacity = Math.max(0, p.userData.life * 2);
      if (p.userData.life <= 0) { scene.remove(p); fx.splice(i, 1); }
    }
  }

  function placeCamera() {
    const c = wellCenter();
    const sp = Math.sin(camPitch), cp = Math.cos(camPitch);
    camera.position.set(
      c.x + Math.sin(camYaw) * sp * camDist,
      c.y + cp * camDist * 0.85 + 3.2,
      c.z + Math.cos(camYaw) * sp * camDist
    );
    camera.lookAt(c);
  }

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090814);
    scene.fog = new THREE.Fog(0x090814, 18, 42);
    camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
    if (THREE.PCFSoftShadowMap) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById("game-container").appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0x6677aa, 0.55));
    const sun = new THREE.DirectionalLight(0xfff0dd, 0.9);
    sun.position.set(8, 16, 10);
    sun.castShadow = true;
    scene.add(sun);
    scene.add(new THREE.DirectionalLight(0x8866ff, 0.25).translateX(-10).translateY(8));
    geo = new THREE.BoxGeometry(CELL * 0.92, CELL * 0.92, CELL * 0.92);
    edgeGeo = new THREE.EdgesGeometry(geo);
    pieceGroup = new THREE.Group();
    ghostGroup = new THREE.Group();
    pileGroup = new THREE.Group();
    scene.add(pieceGroup, ghostGroup, pileGroup);
    const stars = new THREE.BufferGeometry();
    const v = [];
    for (let i = 0; i < 400; i++) v.push((Math.random() - 0.5) * 80, Math.random() * 40 - 5, (Math.random() - 0.5) * 80);
    stars.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xaad, size: 0.08 })));
    buildWell();
    emptyGrid();
    clock = new THREE.Clock();
    placeCamera();
    addEventListener("resize", () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  }

  function handleMoveKey(code) {
    if (code === "ArrowLeft" || code === "KeyA" || code === "KeyQ") {
      const m = camMove(-1, 0); tryMove(m.x, 0, m.z); return true;
    }
    if (code === "ArrowRight" || code === "KeyD") {
      const m = camMove(1, 0); tryMove(m.x, 0, m.z); return true;
    }
    if (code === "KeyZ" || code === "KeyW" || code === "KeyF") {
      const m = camMove(0, 1); tryMove(m.x, 0, m.z); return true;
    }
    if (code === "KeyS" || code === "KeyV") {
      const m = camMove(0, -1); tryMove(m.x, 0, m.z); return true;
    }
    return false;
  }

  function bind() {
    addEventListener("keydown", (e) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) e.preventDefault();
      keys[e.code] = true;
      unlockAudio();
      if (e.repeat) {
        if (state !== "play" || paused || over) return;
        handleMoveKey(e.code);
        return;
      }
      if (e.code === "Enter" && state === "menu") { startGame(); return; }
      if (e.code === "KeyP") { togglePause(); return; }
      if (state !== "play" || paused || over) return;
      if (handleMoveKey(e.code)) return;
      if (e.code === "ArrowDown") soft = true;
      else if (e.code === "ArrowUp" || e.code === "KeyE") tryRotate("y");
      else if (e.code === "KeyX") tryRotate("x");
      else if (e.code === "KeyC") tryRotate("z");
      else if (e.code === "Space") hardDrop();
      else if (e.code === "ShiftLeft" || e.code === "ShiftRight") hold();
    });
    addEventListener("keyup", (e) => {
      keys[e.code] = false;
      if (e.code === "ArrowDown") soft = false;
    });
    addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true; lastMX = e.clientX; lastMY = e.clientY;
    });
    addEventListener("pointerup", () => { dragging = false; });
    addEventListener("pointermove", (e) => {
      if (!dragging) return;
      camYaw -= (e.clientX - lastMX) * 0.008;
      camPitch = Math.max(0.35, Math.min(1.25, camPitch + (e.clientY - lastMY) * 0.006));
      lastMX = e.clientX; lastMY = e.clientY;
      placeCamera();
    });
    addEventListener("wheel", (e) => {
      camDist = Math.max(10, Math.min(28, camDist + e.deltaY * 0.01));
      placeCamera();
    }, { passive: true });
    document.getElementById("start").onclick = startGame;
    document.getElementById("restart").onclick = startGame;
    document.getElementById("resume").onclick = togglePause;
    for (const b of document.querySelectorAll("#mobile [data-a]")) {
      b.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        if (state !== "play" || paused) return;
        const a = b.dataset.a;
        if (a === "left") { const m = camMove(-1, 0); tryMove(m.x, 0, m.z); }
        if (a === "right") { const m = camMove(1, 0); tryMove(m.x, 0, m.z); }
        if (a === "in") { const m = camMove(0, 1); tryMove(m.x, 0, m.z); }
        if (a === "out") { const m = camMove(0, -1); tryMove(m.x, 0, m.z); }
        if (a === "rotY") tryRotate("y");
        if (a === "rotX") tryRotate("x");
        if (a === "rotZ") tryRotate("z");
        if (a === "drop") hardDrop();
        if (a === "hold") hold();
        if (a === "soft") soft = true;
      });
      b.addEventListener("pointerup", () => { if (b.dataset.a === "soft") soft = false; });
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    update(performance.now());
    renderer.render(scene, camera);
  }

  function boot() {
    try { high = Number(localStorage.getItem("tetris3dUltraHS")) || 0; } catch (e) { high = 0; }
    initThree();
    bind();
    updateHud();
    paintMini("next-box", null);
    paintMini("hold-box", null);
    paintRadar();
    loop();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  if (/(?:^|[?&])autoplay=1(?:&|$)/.test(location.search)) {
    addEventListener("load", () => setTimeout(() => { if (state === "menu") startGame(); }, 280));
  }

  window.TETRIS_3D_ULTRA = {
    startGame, getScore: () => score,
    debug: () => ({ state, score, level, layers, current, W, D, H })
  };
})();
