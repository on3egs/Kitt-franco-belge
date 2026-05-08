"""Configuration globale KARR Control Center."""
import os

VERSION = "3.1"
SYSTEM_NAME = "KARR"
SUBTITLE = "KINETIC YIELDING RESPONSIVE ONBOARD NEURAL EXPERT"

# Chemins
KARR_AI_PATH = "/home/kitt/kitt-ai"
LLAMA_SERVER_URL = "http://localhost:8080"
KYRONEX_URL = "https://127.0.0.1:3000"
SESSION_ID = f"karr-control-{os.getpid()}"
USER_NAME = "Manix"

# Services systemd
SERVICES = [
    ("kitt-kyronex", "LLM+STT+TTS"),
    ("kitt-tunnel",  "Tunnel WAN"),
    ("kitt-watchdog","IA Watchdog"),
    ("kitt-x11",     "X11 Session"),
]

# Audio (PulseAudio)
AUDIO_SINK   = "alsa_output.usb-CF-IC_HK-MIC_2025-0825-1200-00.analog-stereo"
AUDIO_SOURCE = "alsa_input.usb-CF-IC_HK-MIC_2025-0825-1200-00.analog-stereo"
DEFAULT_VOLUME     = 70   # % volume sortie
DEFAULT_MIC_GAIN   = 65   # % gain micro

# Profils audio
AUDIO_PROFILES = {
    "NORMAL": {"volume": 70, "mic": 65},
    "NIGHT":  {"volume": 35, "mic": 55},
    "STUDIO": {"volume": 85, "mic": 75},
    "KARR":   {"volume": 100,"mic": 70},
}

# Bluetooth
BT_DEVICES = {
    "81:1E:32:51:66:CF": "RT-B6 Speaker",
    "41:42:33:D9:F8:87": "BLS-B35",
    "DC:23:50:96:98:D9": "LK Device",
}

# Réseau
IP_LOCAL  = "192.168.129.22"
IP_NX     = "192.168.129.23"
IP_STATIC = "192.168.1.4"

# Jetson GPIO/sysfs
TEGRA_RELEASE = "/etc/nv_tegra_release"
THERMAL_ZONES = {
    "cpu":  "/sys/class/thermal/thermal_zone0/temp",
    "gpu":  "/sys/class/thermal/thermal_zone1/temp",
    "soc":  "/sys/class/thermal/thermal_zone5/temp",
}

# Rafraîchissement (secondes)
REFRESH_MONITOR = 1.0
REFRESH_AUDIO   = 0.5
REFRESH_DISPLAY = 0.1

# LLM local llama-server
LLM_CTX_TOKENS = 2048
LLM_MAX_TOKENS = 512
