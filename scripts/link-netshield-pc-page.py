from pathlib import Path
import re

page=Path('client/public/netshield/index.html')
text=page.read_text(encoding='utf-8')
text=text.replace('Téléchargez Manix NetShield pour Windows 11 et découvrez son filtrage DNS sur Jetson AGX Orin, avec guide illustré KITT.', 'Téléchargez le filtre DNS autonome Manix NetShield PC pour Windows 11 ou découvrez l’édition réseau pour Jetson AGX Orin.')
text,n=re.subn(r'(<a class="button" href=")https://github\.com/on3egs/Kitt-franco-belge/releases/download/netshield-pc-v1\.0\.0/Manix-NetShield-PC-1\.0\.0-Setup\.exe("[^>]*>).*?(</a>)',r'\1pc.html\2Ouvrir la page dédiée NetShield PC →\3',text,count=1)
if n!=1:raise SystemExit('PC link could not be replaced exactly once')
marker='<link rel="stylesheet" href="/site-assets/cockpit.css?v=20261026-1">'
if 'src="pc-download.js"' not in text:
 if marker not in text:raise SystemExit('Cockpit stylesheet marker missing')
 text=text.replace(marker,'<script src="pc-download.js" defer></script>\n'+marker,1)
page.write_text(text,encoding='utf-8')
