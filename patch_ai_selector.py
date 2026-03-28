#!/usr/bin/env python3
"""Ajoute le sélecteur KITT/KARR dans le header du chat Jetson."""
import sys, re

def patch(html, this_ai):
    # CSS
    css = """
    /* ── Sélecteur KITT/KARR ── */
    .ai-switch {
      display: flex; gap: 0; margin: 6px auto 0; border: 1px solid #440000;
      width: fit-content;
    }
    .ai-switch-btn {
      padding: 4px 14px; font-family: 'Courier New', monospace;
      font-size: 0.55em; letter-spacing: 3px; color: #661111;
      background: transparent; border: none; cursor: pointer; transition: all 0.2s;
    }
    .ai-switch-btn.active { color: #ff2222; background: #1a0000; text-shadow: 0 0 8px #cc0000; }
    .ai-switch-btn:not(.active):hover { color: #aa2222; background: #0d0000; }
    .ai-switch .sw-sep { width: 1px; background: #440000; }
"""
    html = html.replace('/* Bouton principal */', css + '\n    /* Bouton principal */', 1)

    # HTML — après la div subtitle
    kitt_active = 'active' if this_ai == 'kitt' else ''
    karr_active = 'active' if this_ai == 'karr' else ''
    selector_html = f"""  <div class="ai-switch">
    <button class="ai-switch-btn {kitt_active}" data-ai="kitt" onclick="_switchAI('kitt')" onmouseenter="_playAIHover('kitt')">K.I.T.T.</button>
    <div class="sw-sep"></div>
    <button class="ai-switch-btn {karr_active}" data-ai="karr" onclick="_switchAI('karr')" onmouseenter="_playAIHover('karr')">K.A.R.R.</button>
  </div>"""
    html = html.replace(
        '  <div class="voicebox-container">',
        selector_html + '\n  <div class="voicebox-container">',
        1
    )

    # JS — avant </body>
    js = f"""
<script>
/* ── KITT/KARR switch ── */
(function() {{
  var THIS_AI = '{this_ai}';
  var TUNNEL_URLS = {{
    kitt: 'https://raw.githubusercontent.com/on3egs/Kitt-franco-belge/main/tunnel_kitt.json',
    karr: 'https://raw.githubusercontent.com/on3egs/Kitt-franco-belge/main/tunnel_karr.json'
  }};
  var BASE_AUDIO = 'https://on3egs.github.io/Kitt-franco-belge/kyronex/';
  var _hov = {{}}, _hovPlay = false;
  ['kitt','karr'].forEach(function(id) {{
    var a = new Audio(BASE_AUDIO + 'hover_' + id + '.mp3');
    a.preload = 'auto'; _hov[id] = a;
  }});
  window._playAIHover = function(id) {{
    if (_hovPlay) return; _hovPlay = true;
    var a = _hov[id]; if (!a) return;
    a.currentTime = 0; a.play().catch(function(){{}});
    a.onended = function() {{ _hovPlay = false; }};
  }};
  window._switchAI = function(which) {{
    if (which === THIS_AI) return;
    fetch(TUNNEL_URLS[which] + '?t=' + Date.now(), {{cache:'no-store'}})
      .then(function(r) {{ return r.json(); }})
      .then(function(d) {{
        if (d.status === 'online' && d.url) {{ window.location.href = d.url; }}
        else {{ alert(which.toUpperCase() + ' est hors ligne.'); }}
      }})
      .catch(function() {{ alert(which.toUpperCase() + ' inaccessible.'); }});
  }};
}})();
</script>
</body>"""
    html = html.replace('</body>', js, 1)
    return html

path = '/home/kitt/kitt-ai/static/index.html'
import subprocess, socket
hostname = socket.gethostname()
this_ai = 'karr' if 'nx' in hostname.lower() else 'kitt'
print(f'[INFO] Machine: {hostname} → AI: {this_ai}')

with open(path, 'r', encoding='utf-8') as f:
    html = f.read()

# Vérif pas déjà patché
if 'ai-switch' in html:
    print('[SKIP] Déjà patché.')
    sys.exit(0)

patched = patch(html, this_ai)

import shutil, datetime
bak = path + '.bak-aiswitch-' + datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
shutil.copy(path, bak)
print(f'[BAK] {bak}')

with open(path, 'w', encoding='utf-8') as f:
    f.write(patched)
print('[OK] Patché !')
