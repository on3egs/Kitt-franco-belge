"""Ajoute le jeu au catalogue existant de l'AGX sans remplacer son site."""
from pathlib import Path
from datetime import datetime
import subprocess
import urllib.request
import shutil

root = Path('/home/kitt')
catalog = root / 'kitt-ai/static/games/index.html'
config = root / '.cloudflared/config.yml'
backup = root / 'backups' / ('kitt-block-mode-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True, exist_ok=True)
shutil.copy2(catalog, backup / 'games-index.html')
shutil.copy2(config, backup / 'cloudflared-config.yml')
original_catalog = catalog.read_text()
original_config = config.read_text()
route = '''  - hostname: kitt.kitt-franco-belge.be
    path: ^/static/games/kitt-blocks(/.*)?$
    service: http://127.0.0.1:8812
'''
card = '''      <a class="game-card race" href="/static/games/kitt-blocks/"><span class="game-number">11 / CONSTRUCTION &amp; RÉSEAU</span><span class="game-icon">▦</span><strong>KITT · MONDE EN BLOCS</strong><small>Construire · profils · KITT · salles de 16</small><span class="game-enter">EXPLORER LE MONDE FLAG ↗</span></a>
'''
try:
    with urllib.request.urlopen('http://127.0.0.1:8812/static/games/kitt-blocks/api/health', timeout=10) as response:
        assert response.status == 200
    updated_config = original_config
    if 'path: ^/static/games/kitt-blocks' not in updated_config:
        marker = '  - hostname: kitt.kitt-franco-belge.be\n'
        assert marker in updated_config, 'Route générale KITT introuvable'
        updated_config = updated_config.replace(marker, route + marker, 1)
    config.write_text(updated_config)
    validation = subprocess.run(['cloudflared', 'tunnel', '--config', str(config), 'ingress', 'validate'], capture_output=True, text=True)
    assert validation.returncode == 0, 'Configuration Cloudflare refusée'
    updated_catalog = original_catalog
    if 'href="/static/games/kitt-blocks/"' not in updated_catalog:
        assert '    </section>' in updated_catalog, 'Grille du catalogue introuvable'
        updated_catalog = updated_catalog.replace('    </section>', card + '    </section>', 1)
        updated_catalog = updated_catalog.replace('Dix expériences.', 'Onze expériences.').replace('10 JEUX · SOLO · RECORDS LOCAUX', '11 JEUX · SOLO & COOP · RECORDS LOCAUX').replace('Sélection des dix jeux', 'Sélection des onze jeux')
    catalog.write_text(updated_catalog)
    subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'cloudflared-kitt'], check=True)
    print('Catalogue et tunnel publiés. Sauvegarde : ' + str(backup))
except Exception:
    catalog.write_text(original_catalog)
    config.write_text(original_config)
    subprocess.run(['sudo', '-n', 'systemctl', 'restart', 'cloudflared-kitt'], check=False)
    raise
