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
        next=RacerTracks.balance(next,selected);
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
        cam.focus = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...line.map(p=>p.y))+Math.max(...line.map(p=>p.y)))/2,
            z: (Math.min(...zs) + Math.max(...zs)) / 2 };
        cam.dist = Math.max(65, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 1.08);
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
        return RacerTracks.template('grandprix');
        /* Ancien tracé conservé pour la lecture des sauvegardes.
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
        ]; */
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
        let html = '<div class="studio-top"><button class="ed-btn studio-menu" data-act="menu">← MENU</button><div class="studio-title"><span>KYRONEXT / BY MANIX</span><h2>Le studio des circuits.</h2></div><div class="studio-top-actions"><button class="ed-btn" data-act="save">SAUVEGARDER</button><button class="ed-btn action" data-act="test">▶ TESTER MA PISTE</button></div></div>';
        html += '<aside class="studio-sidebar"><section><span class="studio-step">01 / UN POINT DE DÉPART</span><h3>Choisis un modèle.</h3><div class="studio-presets"><button data-template="sprint">Sprint</button><button data-template="grandprix">Grand prix</button><button data-template="stunt">Looping</button></div></section>';
        html += '<section><span class="studio-step">02 / TES PIÈCES</span><h3>Un clic, une nouvelle route.</h3><div class="studio-palette">';
        const icons = {straight20:'━',straight40:'━━',up:'↗',down:'↘',curveL45:'↶',curveR45:'↷',curveL90:'↰',curveR90:'↱',jump:'↟',loop:'∞',checkpoint:'⚑',straight10:'─'};
        for (const piece of PIECES) html += '<button class="ed-btn" data-piece="'+piece.id+'"><b>'+icons[piece.id]+'</b><span>'+piece.label.replace(/^[^A-ZÉ]+/,'')+'</span></button>';
        html += '</div><p class="studio-tip">La pièce s’insère après celle que tu as sélectionnée. Le retour au départ se raccorde automatiquement.</p></section>';
        const active=ops[selected];
        if(active){html+='<section class="studio-properties"><span class="studio-step">PIÈCE '+(selected+1)+' / '+ops.length+'</span><div class="ed-properties">';for(const[key,label,min,max]of[['len','Longueur (m)',5,300],['radius','Rayon (m)',15,150],['angle','Angle (°)',-180,180],['dy','Pente',-5,5]]){if(key in active)html+='<label>'+label+'<input type="number" data-field="'+key+'" min="'+min+'" max="'+max+'" step="1" value="'+Number(active[key])+'"></label>'}html+='</div><div class="studio-piece-actions"><button class="ed-btn" data-act="duplicate">DUPLIQUER</button><button class="ed-btn warn" data-act="delete">SUPPRIMER</button><button class="ed-btn" data-act="prev">← DÉPLACER</button><button class="ed-btn" data-act="next">DÉPLACER →</button></div></section>'}
        html+='<section><span class="studio-step">03 / TON AMBIANCE</span><label class="studio-world-label" for="studio-world">Le pays du décor</label><select id="studio-world"><option value="5">Pays-Bas / moulins et canaux</option><option value="1">Belgique / Atomium</option><option value="6">Japon / cerisiers et néons</option><option value="9">Finlande / neige et aurore</option><option value="10">Suisse / Alpes et télécabine</option></select></section>';
        html+='<details class="studio-files"><summary>MES FICHIERS DE CIRCUIT</summary><div><button class="ed-btn" data-act="export">EXPORTER JSON</button><button class="ed-btn" data-act="import">IMPORTER JSON</button><button class="ed-btn warn" data-act="clear">EFFACER</button></div></details><input id="ed-import" type="file" accept=".json,application/json" hidden></aside>';
        html+='<div class="studio-map"><div class="studio-map-head"><span>VUE D’ENSEMBLE</span><button class="ed-btn" data-act="frame">3D</button><button class="ed-btn" data-act="top">DESSUS</button></div><canvas id="ed-map" width="540" height="220" aria-label="Plan de ta piste fermée"></canvas><div id="ed-stats" class="ed-stats"></div></div>';
        html+='<div class="studio-timeline"><div class="studio-timeline-head"><span>TON PARCOURS / CLIQUE UNE PIÈCE</span><div><button class="ed-btn" data-act="undo" '+(!past.length?'disabled':'')+'>↶ ANNULER</button><button class="ed-btn" data-act="redo" '+(!future.length?'disabled':'')+'>↷ RÉTABLIR</button></div></div><ol class="ed-sequence">';
        ops.forEach((op,i)=>{const names={straight:'Ligne droite',curve:op.angle>0?'Virage +':'Virage −',jump:'Saut',loop:'Looping',checkpoint:'Passage',gap:'Saut'};html+='<li><button class="ed-btn '+(i===selected?'selected':'')+'" data-select="'+i+'" aria-pressed="'+(i===selected)+'"><span>'+String(i+1).padStart(2,'0')+'</span>'+names[op.type]+'</button></li>'});
        html+='</ol></div><div class="studio-camera-tip">GLISSER : TOURNER · MOLETTE : ZOOMER · MAJ + GLISSER : DÉPLACER</div>';

        bar.innerHTML = html;
        bar.querySelectorAll('[data-template]').forEach(button=>button.onclick=()=>{selected=0;commit(RacerTracks.template(button.dataset.template))});
        bar.querySelector('#studio-world').value=localStorage.getItem('kx-builder-world')||'5';
        bar.querySelector('#studio-world').onchange=event=>{localStorage.setItem('kx-builder-world',event.target.value);window.KITT.rebuildCustom(ops);updateStats();frameTrack()};
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
        const L=Math.round(data?.length||0),closure=Math.round(data?.closureLength||0);
        el.innerHTML='<span><b>'+ops.length+'</b> PIÈCES</span><span><b>'+L+' m</b> PAR TOUR</span><span class="studio-closed">● CIRCUIT FERMÉ</span><small>'+(closure>1?'Raccord automatique : '+closure+' m.':'Les deux extrémités sont raccordées.')+' Sauvegarde locale automatique.</small>';

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
        if(innerWidth>900)c.setViewOffset(innerWidth,innerHeight,-145,0,innerWidth,innerHeight);else c.setViewOffset(innerWidth,innerHeight,0,innerHeight*.12,innerWidth,innerHeight);
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
        document.body.classList.add('studio-open');
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
        document.body.classList.remove('studio-open');
        window.KITT?.camera?.clearViewOffset();
        const scr = document.getElementById('editor-screen');
        if (scr) scr.classList.add('hidden');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { /* rien : chargement paresseux */ });
    }

    window.addEventListener('keydown',event=>{
        if(!openState||event.target.matches?.('input,select,textarea'))return;
        let action='';if((event.ctrlKey||event.metaKey)&&event.code==='KeyZ')action=event.shiftKey?'redo':'undo';
        else if((event.ctrlKey||event.metaKey)&&event.code==='KeyY')action='redo';
        else if(event.code==='Delete')action='delete';
        if(action){event.preventDefault();document.querySelector('[data-act="'+action+'"]')?.click()}
    });
    return {
        open, close,
        isOpen: () => openState,
        updateCamera,
        getOps: () => ops.slice()
    };
})();
