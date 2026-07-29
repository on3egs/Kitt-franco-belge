#!/bin/bash
# --- Reparation PulseAudio si casse (zombie qui refuse les connexions) ---
export XDG_RUNTIME_DIR=/run/user/1000
if ! pactl info >/dev/null 2>&1; then
    echo "[AUDIO] PulseAudio casse, redemarrage propre..."
    pulseaudio --kill 2>/dev/null; sleep 1
    pkill -9 -x pulseaudio 2>/dev/null; sleep 1
    pulseaudio --start --exit-idle-time=-1 2>/dev/null; sleep 3
fi
# Configuration audio KARR - HK-USB + sortie interne en parallele, flux 16000 Hz
# Noms de cartes EN DUR (stables) — la detection dynamique echouait au boot
export XDG_RUNTIME_DIR=/run/user/$(id -u)

HK=alsa_output.usb-CF-IC_HK-MIC_2025-0825-1200-00.analog-stereo
INTERNAL=alsa_output.hw_1_3
HKSRC=alsa_input.usb-CF-IC_HK-MIC_2025-0825-1200-00.analog-stereo

# 1) Volumes materiels (PCM HK retombe a 0 sans ca ; demarre avant PA, marche quand meme)
amixer -c HKMIC set PCM 100% unmute 2>/dev/null
amixer -c HKMIC set Mic 100% cap unmute 2>/dev/null
for iec in 0 1 2 3; do amixer -c HDA set IEC958,$iec unmute 2>/dev/null; done

# 2) Attendre que PulseAudio soit pret (au boot il demarre apres ce script)
for i in $(seq 1 60); do
  pactl info >/dev/null 2>&1 && break
  sleep 1
done

# 3) Attendre que HK-USB et la sortie interne existent
for i in $(seq 1 40); do
  pactl list sinks short | grep -Fq "$HK" && pactl list sinks short | grep -Fq "$INTERNAL" && break
  sleep 1
done

# 4) Creer la sortie parallele exposee en 16000 Hz
pactl unload-module module-combine-sink 2>/dev/null
sleep 1
for t in 1 2 3 4 5 6 7 8; do
  pactl list sinks short | grep -q combined_sink && break
  pactl load-module module-combine-sink sink_name=combined_sink slaves="$HK,$INTERNAL" rate=16000 channels=2 adjust_time=1 2>/dev/null
  sleep 1
done

# 5) Sortie par defaut + volumes
pactl set-default-sink combined_sink
pactl set-sink-volume combined_sink 100%
pactl set-sink-volume "$HK" 80%
pactl set-sink-volume "$INTERNAL" 115%

# 6) Micro : HK-USB uniquement, source STT par defaut a 90%
pactl set-default-source "$HKSRC"
pactl set-source-volume "$HKSRC" 90%

# 7) Anti-suspension + re-forcage volumes hardware (alsa-restore remet PCM a 100% sinon)
pactl unload-module module-suspend-on-idle 2>/dev/null
sleep 1
amixer -c HKMIC set PCM 100% unmute 2>/dev/null
for iec in 0 1 2 3; do amixer -c HDA set IEC958,$iec unmute 2>/dev/null; done

# Force final volumes apres deferred_volume PA (ne pas deplacer)
sleep 2
pactl set-sink-volume "$HK" 80% 2>/dev/null
pactl set-sink-volume "$INTERNAL" 115% 2>/dev/null
pactl set-sink-volume combined_sink 100% 2>/dev/null
