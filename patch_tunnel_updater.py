import shutil

f = "/home/kitt/kitt-ai/tunnel_updater.py"
shutil.copy(f, f + ".bak")

with open(f, "r") as fp:
    content = fp.read()

# 1. Ajouter lhr.life aux patterns reconnus
old_patterns = '''_CF_PATTERNS = [
    r"https://[a-z0-9\\-]+\\.trycloudflare\\.com",   # quick tunnel
    r"https://[a-z0-9\\-]+\\.cfargotunnel\\.com",     # tunnel nommé
    r"https://[a-z0-9\\-\\.]+\\.workers\\.dev",         # worker tunnel
]'''
new_patterns = '''_CF_PATTERNS = [
    r"https://[a-z0-9\\-]+\\.trycloudflare\\.com",   # quick tunnel
    r"https://[a-z0-9\\-]+\\.cfargotunnel\\.com",     # tunnel nommé
    r"https://[a-z0-9\\-\\.]+\\.workers\\.dev",         # worker tunnel
    r"https://[a-z0-9]+\\.lhr\\.life",                  # localhost.run fallback
]'''

if old_patterns in content:
    content = content.replace(old_patterns, new_patterns)
    print("[OK] Pattern lhr.life ajouté")
else:
    print("[ERR] Pattern CF_PATTERNS non trouvé")

# 2. La méthode _method_env valide uniquement les URLs CF — étendre pour lhr.life
old_env = '''    url = os.environ.get("CLOUDFLARE_TUNNEL_URL", "").strip()
    if url and _extract_cf_url(url):
        return _extract_cf_url(url)
    return None'''
new_env = '''    url = os.environ.get("CLOUDFLARE_TUNNEL_URL", "").strip()
    if url and _extract_cf_url(url):
        return _extract_cf_url(url)
    # Accepter aussi les URLs localhost.run exportées par start_tunnel.sh
    if url and url.startswith("https://") and ".lhr.life" in url:
        return url
    return None'''

if old_env in content:
    content = content.replace(old_env, new_env)
    print("[OK] _method_env étendu pour lhr.life")
else:
    print("[WARN] _method_env pattern non trouvé (peut-être déjà patché)")

# 3. Ajouter méthode de lecture du log localhost.run
old_method4_end = '''def _method_process_output() -> str | None:'''
new_lhr_method = '''def _method_lhr_log() -> str | None:
    """Méthode 5 : parse le fichier log de localhost.run SSH tunnel."""
    try:
        lhr_log = os.environ.get("LHR_LOG", "/tmp/localhost_run.log")
        if not Path(lhr_log).exists():
            return None
        result = subprocess.run(
            ["tail", "-n", "20", lhr_log],
            capture_output=True, text=True, timeout=3
        )
        return _extract_cf_url(result.stdout)
    except Exception:
        return None

def _method_process_output() -> str | None:'''

if old_method4_end in content:
    content = content.replace(old_method4_end, new_lhr_method)
    print("[OK] _method_lhr_log ajoutée")
else:
    print("[WARN] insertion _method_lhr_log: marqueur non trouvé")

# 4. Ajouter _method_lhr_log dans la cascade get_tunnel_url
old_cascade = '''    methods = [
        ("env",     _method_env),
        ("metrics", _method_metrics_api),
        ("log",     _method_log_file),
        ("process", _method_process_output),
    ]'''
new_cascade = '''    methods = [
        ("env",     _method_env),
        ("metrics", _method_metrics_api),
        ("log",     _method_log_file),
        ("lhr_log", _method_lhr_log),
        ("process", _method_process_output),
    ]'''

if old_cascade in content:
    content = content.replace(old_cascade, new_cascade)
    print("[OK] _method_lhr_log ajoutée à la cascade")
else:
    print("[WARN] cascade methods: pattern non trouvé")

with open(f, "w") as fp:
    fp.write(content)

print("Patch tunnel_updater.py terminé.")
