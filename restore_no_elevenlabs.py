#!/usr/bin/env python3
# restore_no_elevenlabs.py
# Supprime le bloc ElevenLabs de /home/kitt/kitt-ai/static/index.html
# et restaure window._elActive = false + window._elSpeak = null
# Usage : python3 restore_no_elevenlabs.py

TARGET = "/home/kitt/kitt-ai/static/index.html"

START_MARKER = "\u003c!-- \u2550\u2550 ELEVENLABS TTS DEMO"
END_MARKER   = "\u003c!-- \u2550\u2550 FIN ELEVENLABS DEMO \u2550\u2550 -->"

with open(TARGET, "r", encoding="utf-8") as f:
    html = f.read()

start = html.find(START_MARKER)
end   = html.find(END_MARKER)

if start == -1 or end == -1:
    print("Bloc ElevenLabs introuvable — rien a faire.")
else:
    end_full = end + len(END_MARKER)
    # Retire aussi les eventuels sauts de ligne autour du bloc
    removed = html[:start].rstrip("\n") + "\n" + html[end_full:].lstrip("\n")
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(removed)
    print("Bloc ElevenLabs supprime avec succes.")

# Desactiver aussi le hook _elActive dans le handler data.done si present
# (le hook if(window._elActive) window._elSpeak(text) dans kyronex)
# Ce code cherche et supprime la ligne d injection dans le handler
HOOK_LINE = "if(window._elActive) window._elSpeak(text);"
with open(TARGET, "r", encoding="utf-8") as f:
    html2 = f.read()

if HOOK_LINE in html2:
    html2 = html2.replace("\n" + HOOK_LINE, "")
    html2 = html2.replace(HOOK_LINE + "\n", "")
    html2 = html2.replace(HOOK_LINE, "")
    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(html2)
    print("Hook _elSpeak supprime.")
else:
    print("Hook _elSpeak absent ou deja supprime.")

print("Restauration terminee. Redemarrer le service si besoin:")
print("  sudo systemctl restart kitt-kyronex.service")
