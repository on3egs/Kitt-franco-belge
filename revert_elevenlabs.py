#!/usr/bin/env python3
"""
revert_elevenlabs.py
Supprime TOUTES les modifications ElevenLabs :
  1. Portail GitHub Pages (client/public/kyronex/index.html)
  2. Interface chat Jetson (/home/kitt/kitt-ai/static/index.html)
  3. Git commit + push automatique
La cle API reste dans .env (jamais dans git).
"""

import subprocess, sys, os, re

REPO   = "C:/Users/ON3EG/Documents/kitt-franco-belge"
PORTAL = os.path.join(REPO, "client/public/kyronex/index.html")
JETSON = "kitt@192.168.129.22"

# ════════════════════════════════════════════════════════════════
#  1. PORTAIL KYRONEX — nettoyage local
# ════════════════════════════════════════════════════════════════
print("=== Portail kyronex/index.html ===")

with open(PORTAL, "r", encoding="utf-8") as f:
    html = f.read()

original_len = len(html)

# ── CSS bienvenue + p-divider (de /* ── MESSAGE DE BIENVENUE jusqu'a } apres @keyframes eq-bar) ──
html = re.sub(
    r'\n\s*/\* ── MESSAGE DE BIENVENUE.*?/\* Séparateur discret \*/\n.*?\}\n',
    '\n',
    html, flags=re.DOTALL
)

# ── CSS p-divider seul si reste ──
html = re.sub(
    r'\n\s*/\* Séparateur discret \*/\n.*?\.p-divider \{.*?\}\n',
    '\n',
    html, flags=re.DOTALL
)

# ── HTML : bloc MESSAGE DE BIENVENUE + p-divider ──
html = re.sub(
    r'\n\s*<!-- ── MESSAGE DE BIENVENUE ── -->.*?<div class="p-divider"></div>\n',
    '\n',
    html, flags=re.DOTALL
)

# ── HTML : appels welcomeInit ──
html = html.replace(
    "      if (typeof window.welcomeInit === 'function') window.welcomeInit();\n", ""
)

# ── JS : script bienvenue complet (de <!-- ── MESSAGE DE BIENVENUE — AUTOPLAY jusqu'a </script> suivant) ──
html = re.sub(
    r'\n<!-- ── MESSAGE DE BIENVENUE — AUTOPLAY.*?</script>\n\n',
    '\n',
    html, flags=re.DOTALL
)

# ── JS + HTML : bloc KITT VOICE DEMO (kittParle + bouton) ──
# Retire le bouton demo dans le HTML portal
html = re.sub(
    r'\n\s*<!-- ── DEMO VOIX KITT — TEMPORAIRE ── -->.*?<!-- ── FIN DEMO ── -->\n',
    '\n',
    html, flags=re.DOTALL
)
# Retire le script kittParle
html = re.sub(
    r'\n<!-- ── KITT VOICE DEMO — TEMPORAIRE.*?<!-- ── FIN KITT VOICE DEMO ── -->\n',
    '\n',
    html, flags=re.DOTALL
)

# ── Nettoyage lignes vides excessives ──
html = re.sub(r'\n{3,}', '\n\n', html)

with open(PORTAL, "w", encoding="utf-8") as f:
    f.write(html)

print(f"  Avant : {original_len} chars | Apres : {len(html)} chars | Retires : {original_len - len(html)} chars")
print("  OK")

# ════════════════════════════════════════════════════════════════
#  2. JETSON — supprime bloc 5-voix via restore_no_elevenlabs.py
# ════════════════════════════════════════════════════════════════
print("\n=== Jetson static/index.html ===")

restore_script = os.path.join(REPO, "restore_no_elevenlabs.py")
if not os.path.exists(restore_script):
    print("  WARN: restore_no_elevenlabs.py introuvable, Jetson non modifie.")
else:
    r = subprocess.run(
        ["scp", restore_script, f"{JETSON}:/tmp/restore_el.py"],
        capture_output=True, text=True
    )
    if r.returncode != 0:
        print(f"  WARN: SCP echoue ({r.stderr.strip()}) — Jetson peut-etre inaccessible.")
    else:
        r2 = subprocess.run(
            ["ssh", JETSON, "python3 /tmp/restore_el.py"],
            capture_output=True, text=True
        )
        print(f"  {r2.stdout.strip() or r2.stderr.strip()}")
        if "termine" in r2.stdout or "supprime" in r2.stdout:
            # Redemarrage service pour appliquer
            subprocess.run(["ssh", JETSON, "sudo systemctl restart kitt-kyronex.service"],
                           capture_output=True)
            print("  Service kitt-kyronex redémarre.")

# ════════════════════════════════════════════════════════════════
#  3. GIT — commit + push
# ════════════════════════════════════════════════════════════════
print("\n=== Git ===")

os.chdir(REPO)
subprocess.run(["git", "add", "client/public/kyronex/index.html"], check=True)

# Verifie s'il y a quelque chose a committer
status = subprocess.run(["git", "diff", "--cached", "--stat"],
                        capture_output=True, text=True).stdout.strip()
if not status:
    print("  Rien a committer (deja propre).")
else:
    subprocess.run([
        "git", "commit", "-m",
        "revert(kyronex): supprime toutes les modifications ElevenLabs\n\n"
        "- Retire le message de bienvenue audio (welcomeInit/welcomePlay)\n"
        "- Retire le bouton demo voix KITT (kittParle)\n"
        "- Retire le CSS/HTML associes\n"
        "- Cle API conservee dans .env (hors git)\n\n"
        "Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
    ], check=True)

    # Pull --rebase puis push
    subprocess.run(["git", "stash"], capture_output=True)
    subprocess.run(["git", "pull", "--rebase"], capture_output=True)
    subprocess.run(["git", "stash", "pop"], capture_output=True)
    r = subprocess.run(["git", "push"], capture_output=True, text=True)
    if r.returncode == 0:
        print("  Push OK — GitHub Actions va redéployer.")
    else:
        print(f"  Push ERREUR : {r.stderr.strip()}")

print("\n=== Terminé ===")
print("  Cle API : toujours dans .env (jamais dans git)")
print("  Pour ré-activer ElevenLabs : python3 patch_5voices.py (Jetson)")
print("                               + re-ajouter le script welcome dans kyronex/index.html")
