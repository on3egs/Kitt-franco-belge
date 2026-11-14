// ============================================
// KITT STUNT RACING v7 — Constructeur de circuit
// By Manix - KITT FRANCO BELGE
// ============================================
window.KE = (function () {
    'use strict';

    const OPS_KEY = 'kittStuntRacingCustomOps';

    // Types de pièces proposés à la construction
    const PIECES = [
        { id: 'straight20', label: '━ ROUTE 20m', op: () => ({ type: 'straight', len: 20, dy: 0 }) },
        { id: 'straight40', label: '━ ROUTE 40m', op: () => ({ type: 'straight', len: 40, dy: 0 }) },
        { id: 'up', label: '↗ MONTÉE', op: () => ({ type: 'straight', len: 22, dy: 1.8 }) },
        { id: 'down', label: '↘ DESCENTE', op: () => ({ type: 'straight', len: 22, dy: -1.8 }) },
        { id: 'curveL45', label: '⟲ VIRAGE G 45°', op: () => ({ type: 'curve', radius: 40, angle: 45, dy: 0 }) },
        { id: 'curveR45', label: '⟳ VIRAGE D 45°', op: () => ({ type: 'curve', radius: 40, angle: -45, dy: 0 }) },
        { id: 'curveL90', label: '⟲ VIRAGE G 90°', op: () => ({ type: 'curve', radius: 50, angle: 90, dy: 0 }) },
        { id: 'curveR90', label: '⟳ VIRAGE D 90°', op: () => ({ type: 'curve', radius: 50, angle: -90, dy: 0 }) },
        { id: 'jump', label: '⤒ SAUT', op: () => ({ type: 'jump' }) },
        { id: 'loop', label: '🔁 BOUCLE', op: () => ({ type: 'loop' }) },
        { id: 'checkpoint', label: '🚩 CHECKPOINT', op: () => ({ type: 'checkpoint' }) },
        { id: 'straight10', label: '━ ROUTE 10m', op: () => ({ type: 'straight', len: 10, dy: 0 }) }
    ];

    let ops = [];
    let selected = -1;
    let past = [], future = [];
    const copy = value => JSON.parse(JSON.stringify(value));
    function commit(next) {
        const res = window.KITT.rebuildCustom(next);
        if (!res.ok) { selected = Math.min(selected, ops.length - 1); buildToolbar(); updateStats(); toast('⚠ ' + res.error); return; }
        past.push(copy(ops)); if (past.length > 40) past.shift();
        future = []; ops = copy(next);
        selected = Math.max(0, Math.min(selected, ops.length - 1));
        saveOps(); buildToolbar(); updateStats(); frameTrack();
    }
    function frameTrack(top = false) {
        const line = window.KITT.levelData[4].line;
        if (!line.length) return;
        const xs = line.map(p => p.x), zs = line.map(p => p.z);
        cam.focus = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: 0,
            z: (Math.min(...zs) + Math.max(...zs)) / 2 };
        cam.dist = Math.max(65, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 1.35);
        cam.pitch = top ? 1.55 : 0.85;
    }
    let openState = false;
    // Caméra éditeur
    const cam = { yaw: 0.6, pitch: 0.85, dist: 55, focus: { x: 0, y: 0, z: 0 } };
    let dragging = false, lastX = 0, lastY = 0;

    // ---------- persistance ----------
    function loadOps() {
        try {
            const raw = localStorage.getItem(OPS_KEY);
            const arr = raw ? JSON.parse(raw) : null;
            if (Array.isArray(arr) && arr.length) return arr;
        } catch (e) { /* noop */ }
        // Circuit de départ par défaut (première visite)
        return [
            { type: 'straight', len: 30, dy: 0 },
            { type: 'curve', radius: 45, angle: -45, dy: 0 },
            { type: 'checkpoint' },
            { type: 'straight', len: 22, dy: 1.8 },
            { type: 'jump' },
            { type: 'curve', radius: 50, angle: 90, dy: 0 },
            { type: 'checkpoint' },
            { type: 'straight', len: 30, dy: -1.0 },
            { type: 'loop' },
            { type: 'checkpoint' },
            { type: 'curve', radius: 45, angle: -45, dy: 0 },
            { type: 'straight', len: 30, dy: 0 }
        ];
    }

    function saveOps() {
        try { localStorage.setItem(OPS_KEY, JSON.stringify(ops)); return true; }
        catch (e) { toast('⚠ Sauvegarde indisponible : exporte ton circuit en JSON'); return false; }
    }

    // ---------- pose finale du circuit (mathématiques pures) ----------
    // ⚠ Le circuit personnalisé est construit à KITT.customOffsetX (décalage
    // du niveau 4) : la caméra de l'éditeur doit viser cette zone, sinon elle
    // regarde un point vide à ~1,2 km de la piste.
    function endPose(list) {
        const K = window.KITT;
        const ox = (K && K.customOffsetX) ? K.customOffsetX : 0;
        const p = { x: ox, z: 0, y: 0, yaw: 0 };
        for (const o of list) {
            const f = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
            if (o.type === 'straight' || o.type === 'gap') {
                p.x += f.x * (o.len || 10);
                p.z += f.z * (o.len || 10);
                p.y += o.dy || 0;
            } else if (o.type === 'jump') {
                p.x += f.x * 34; p.z += f.z * 34;       // rampe 10 + trou 14 + réception 10
            } else if (o.type === 'curve') {
                const steps = Math.max(4, Math.ceil(Math.abs(o.angle) / 6));
                const stepRad = (o.angle * Math.PI / 180) / steps;
                const stepLen = Math.abs((o.radius || 40) * stepRad);
                const dyStep = (o.dy || 0) / steps;
                for (let i = 0; i < steps; i++) {
                    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
                    p.x += fx * stepLen; p.z += fz * stepLen;
                    p.y += dyStep; p.yaw += stepRad;
                }
            }
            // 'loop' et 'checkpoint' ne changent pas la pose finale
        }
        return p;
    }

    function countCheckpoints(list) {
        // La construction réelle ajoute aussi des checkpoints auto tous les 3 morceaux
        let pieces = 0, manual = 0;
        for (const o of list) {
            if (o.type === 'checkpoint') { manual++; pieces = 0; }
            else pieces++;
        }
        return manual;
    }

    function lengthApprox(list) {
        let L = 0;
        for (const o of list) {
            if (o.type === 'straight' || o.type === 'gap') L += o.len || 10;
            else if (o.type === 'jump') L += 34;
            else if (o.type === 'curve') L += Math.abs((o.radius || 40) * (o.angle * Math.PI / 180));
            else if (o.type === 'loop') L += 70;
        }
        return Math.round(L);
    }

    // ---------- reconstruction ----------
    function rebuild(silent) {
        const K = window.KITT;
        if (!K || !K.rebuildCustom) return;
        const res = K.rebuildCustom(ops);
        const pose = endPose(ops);
        cam.focus.x = pose.x; cam.focus.y = pose.y; cam.focus.z = pose.z;
        updateStats();
        if (!silent) {
            if (res && res.ok) toast('✔ Circuit reconstruit (' + ops.length + ' pièces)');
            else if (res && res.error) toast('⚠ ' + res.error);
        }
    }

    // ---------- UI ----------
    function toast(msg) {
        const old = document.querySelector('.ed-toast');
        if (old) old.remove();
        const t = document.createElement('div');
        t.className = 'ed-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2200);
    }

    function buildToolbar() {
        const bar = document.getElementById('editor-toolbar');
        if (!bar) return;
        let html = '<h2>STUDIO CIRCUIT</h2><p class="ed-hint">Sélectionne une pièce pour la modifier. Les nouvelles pièces sont insérées après la sélection.</p>';
        html += '<div class="ed-stats" id="ed-stats"></div>';
        html += '<canvas id="ed-map" width="540" height="220" aria-label="Plan du circuit"></canvas>';
        html += '<div class="ed-pieces"><button class="ed-btn" data-act="frame">Vue générale</button><button class="ed-btn" data-act="top">Vue du dessus</button></div>';
        html += '<ol class="ed-sequence">';
        ops.forEach((o, i) => {
            const label = {straight:'Ligne droite',curve:'Virage',jump:'Saut',loop:'Boucle',checkpoint:'Checkpoint',gap:'Trou'}[o.type] || 'Pièce';
            html += '<li><button class="ed-btn ' + (i === selected ? 'selected' : '') + '" data-select="' + i + '">' + (i + 1) + ' · ' + label + '</button></li>';
        });
        html += '</ol>';
        const active = ops[selected];
        if (active) {
            html += '<div class="ed-properties">';
            for (const [key, label, min, max] of [['len','Longueur (m)',5,100],['radius','Rayon (m)',15,100],['angle','Angle (°)',-180,180],['dy','Dénivelé (m)',-5,5]]) {
                if (key in active) html += '<label>' + label + '<input type="number" data-field="' + key + '" min="' + min + '" max="' + max + '" step="1" value="' + Number(active[key]) + '"></label>';
            }
            html += '</div><div class="ed-pieces"><button class="ed-btn" data-act="duplicate">Dupliquer</button><button class="ed-btn warn" data-act="delete">Supprimer</button><button class="ed-btn" data-act="prev">↑ Déplacer</button><button class="ed-btn" data-act="next">↓ Déplacer</button></div>';
        }
        html += '<div class="ed-section"><div class="ed-section-label">PIÈCES — cliquer pour ajouter</div><div class="ed-pieces">';
        for (const p of PIECES) html += '<button class="ed-btn" data-piece="' + p.id + '">' + p.label + '</button>';
        html += '</div></div>';
        html += '<div class="ed-section"><div class="ed-section-label">ACTIONS</div><div class="ed-pieces">';
        html += '<button class="ed-btn warn" data-act="undo">↩ ANNULER</button><button class="ed-btn" data-act="redo">↪ RÉTABLIR</button>';
        html += '<button class="ed-btn warn" data-act="clear">🧹 EFFACER</button>';
        html += '<button class="ed-btn action" data-act="test">🏁 TESTER</button>';
        html += '<button class="ed-btn action" data-act="save">💾 SAUVEGARDER</button>';
        html += '<button class="ed-btn" data-act="export">Exporter JSON</button><button class="ed-btn" data-act="import">Importer JSON</button><input id="ed-import" type="file" accept=".json,application/json" hidden>';
        html += '<button class="ed-btn" data-act="menu">☰ MENU</button>';
        html += '</div></div>';
        bar.innerHTML = html;
        bar.querySelector('#ed-import').onchange = async event => {
            const file = event.target.files[0]; if (!file) return;
            if (file.size > 64000) { toast('⚠ Fichier trop volumineux (64 Ko maximum)'); return; }
            try {
                const data = JSON.parse(await file.text());
                const next = Array.isArray(data) ? data : data.pieces;
                commit(next);
            } catch (error) { toast('⚠ Fichier de circuit invalide'); }
        };
        bar.querySelectorAll('[data-select]').forEach(btn => btn.onclick = () => {
            selected = Number(btn.dataset.select); buildToolbar(); updateStats();
        });
        bar.querySelectorAll('[data-field]').forEach(input => input.onchange = () => {
            const next = copy(ops); next[selected][input.dataset.field] = Number(input.value);
            commit(next);
        });

        bar.querySelectorAll('[data-piece]').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = PIECES.find(x => x.id === btn.dataset.piece);
                if (!p) return;
                if (window.KA) KA.sfx.click();
                const next = copy(ops);
                next.splice(selected + 1, 0, p.op());
                selected++; commit(next);
            });
        });
        bar.querySelectorAll('[data-act]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.KA) KA.sfx.click();
                const act = btn.dataset.act;
                if (act === 'frame' || act === 'top') frameTrack(act === 'top');
                else if (act === 'undo' || act === 'redo') {
                    const from = act === 'undo' ? past : future, to = act === 'undo' ? future : past;
                    if (!from.length) return;
                    const next = from[from.length - 1];
                    if (!window.KITT.rebuildCustom(next).ok) return;
                    from.pop(); to.push(copy(ops)); ops = next; selected = ops.length - 1;
                    saveOps(); buildToolbar(); updateStats(); frameTrack();
                }
                else if (act === 'duplicate') { const next = copy(ops); next.splice(selected, 0, copy(ops[selected])); commit(next); }
                else if (act === 'delete') { const next = copy(ops); next.splice(selected, 1); commit(next); }
                else if (act === 'prev' || act === 'next') {
                    const target = selected + (act === 'prev' ? -1 : 1);
                    if (target < 0 || target >= ops.length) return;
                    const next = copy(ops); [next[selected], next[target]] = [next[target], next[selected]];
                    selected = target; commit(next);
                }
                else if (act === 'clear') {
                    if (btn.dataset.armed) { selected = 0; commit([{type:'straight',len:30,dy:0}]); }
                    else { btn.dataset.armed = '1'; btn.textContent = '⚠️ CONFIRMER ?'; setTimeout(() => { delete btn.dataset.armed; btn.textContent = '🧹 EFFACER'; }, 2500); }
                }
                else if (act === 'test') {
                    if (ops.length < 2) { toast('⚠ Ajoute au moins 2 pièces !'); return; }
                    close();
                    if (window.KITT && KITT.startRace) KITT.startRace(4);
                }
                else if (act === 'save') { if (saveOps()) toast('💾 Circuit sauvegardé'); }
                else if (act === 'import') bar.querySelector('#ed-import').click();
                else if (act === 'export') {
                    const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,pieces:ops},null,2)],{type:'application/json'}));
                    const link=document.createElement('a');link.href=url;link.download='circuit-kitt.json';link.click();
                    setTimeout(()=>URL.revokeObjectURL(url),1000);
                }
                else if (act === 'menu') { close(); if (window.KITT && KITT.backToMenu) KITT.backToMenu(); }
            });
        });
    }

    function updateStats() {
        const canvas = document.getElementById('ed-map');
        const data = window.KITT.levelData[4];
        if (canvas && data && data.line.length) {
            const ctx = canvas.getContext('2d'), line = data.line;
            const xs = line.map(p => p.x), zs = line.map(p => p.z);
            const minX = Math.min(...xs), minZ = Math.min(...zs);
            const scale = Math.min(500 / Math.max(1, Math.max(...xs) - minX), 180 / Math.max(1, Math.max(...zs) - minZ));
            ctx.fillStyle = '#070f1e'; ctx.fillRect(0,0,540,220);
            ctx.strokeStyle = '#51e0e8'; ctx.lineWidth = 4; ctx.beginPath();
            line.forEach((p,i) => ctx[i ? 'lineTo' : 'moveTo'](20 + (p.x-minX)*scale,200-(p.z-minZ)*scale)); ctx.stroke();
            [line[0],line[line.length-1]].forEach((p,i) => {ctx.fillStyle=i?'#ff586d':'#b4ff74';ctx.beginPath();ctx.arc(20+(p.x-minX)*scale,200-(p.z-minZ)*scale,6,0,Math.PI*2);ctx.fill();});
        }
        const el = document.getElementById('ed-stats');
        if (!el) return;
        const loops = ops.filter(o => o.type === 'loop').length;
        el.innerHTML =
            '🧩 Pièces : <strong>' + ops.length + '</strong><br>' +
            '└ Longueur : <strong>' + lengthApprox(ops) + ' m</strong><br>' +
            '🚩 Checkpoints : <strong>' + (data ? data.checkpoints.length : countCheckpoints(ops)) + '</strong>' +
            (loops ? '<br>🔁 Boucle : <strong>' + (loops > 1 ? '⚠ une seule supportée' : 'oui') + '</strong>' : '');
    }

    // ---------- caméra ----------
    function bindCamera() {
        const canvas = document.getElementById('game-canvas');
        if (!canvas || canvas.dataset.edBound) return;
        canvas.dataset.edBound = '1';
        canvas.addEventListener('pointerdown', (e) => {
            if (!openState) return;
            dragging = true; lastX = e.clientX; lastY = e.clientY;
        });
        window.addEventListener('pointermove', (e) => {
            if (!dragging || !openState) return;
            if (e.shiftKey) {
                const dx=(e.clientX-lastX)*cam.dist*.0015, dz=(e.clientY-lastY)*cam.dist*.0015;
                cam.focus.x -= Math.cos(cam.yaw)*dx + Math.sin(cam.yaw)*dz;
                cam.focus.z += Math.sin(cam.yaw)*dx - Math.cos(cam.yaw)*dz;
            } else {
                cam.yaw -= (e.clientX - lastX) * 0.005;
                cam.pitch = Math.max(0.15, Math.min(1.55, cam.pitch + (e.clientY - lastY) * 0.005));
            }
            lastX = e.clientX; lastY = e.clientY;
        });
        window.addEventListener('pointerup', () => { dragging = false; });
        canvas.addEventListener('wheel', (e) => {
            if (!openState) return;
            e.preventDefault();
            cam.dist = Math.max(14, Math.min(1800, cam.dist * (1 + Math.sign(e.deltaY) * 0.12)));
        }, { passive: false });
    }

    function updateCamera(dt) {
        const K = window.KITT;
        if (!K || !K.camera) return;
        const c = K.camera;
        const cy = Math.cos(cam.pitch), sy = Math.sin(cam.pitch);
        c.position.set(
            cam.focus.x + Math.sin(cam.yaw) * cy * cam.dist,
            cam.focus.y + sy * cam.dist,
            cam.focus.z + Math.cos(cam.yaw) * cy * cam.dist
        );
        c.up.set(0, 1, 0);
        c.lookAt(cam.focus.x, cam.focus.y + 1, cam.focus.z);
    }

    // ---------- cycle de vie ----------
    function open() {
        ops = loadOps();
        selected = ops.length - 1; past = []; future = [];
        openState = true;
        buildToolbar();
        bindCamera();
        const scr = document.getElementById('editor-screen');
        if (scr) scr.classList.remove('hidden');
        rebuild(true);
        frameTrack();
        toast('🧱 Bienvenue dans le constructeur — ' + ops.length + ' pièces chargées');
    }

    function close() {
        openState = false;
        const scr = document.getElementById('editor-screen');
        if (scr) scr.classList.add('hidden');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { /* rien : chargement paresseux */ });
    }

    return {
        open, close,
        isOpen: () => openState,
        updateCamera,
        getOps: () => ops.slice()
    };
})();
