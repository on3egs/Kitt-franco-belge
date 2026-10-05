#!/usr/bin/env python3
"""
KYRONEX — Reverse geocoding offline (OpenStreetMap local)
Extrait les rues + villes depuis fichiers PBF et les stocke dans SQLite.
Utilisable sans internet pour couvrir Belgique / Luxembourg / Nord-France.

Usage:
  python3 geo_offline.py setup      -- telecharge + indexe les donnees
  python3 geo_offline.py test LAT LON
  python3 geo_offline.py status

Copyright 2026 ByManix (Emmanuel Gelinne) — ELv2
"""

import math
import os
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path

try:
    import osmium
    HAS_OSMIUM = True
except ImportError:
    HAS_OSMIUM = False

# ── Chemins ──────────────────────────────────────────────────────────────────
BASE_DIR  = Path(__file__).parent
DATA_DIR  = BASE_DIR / "geo_data"
DB_PATH   = DATA_DIR / "streets.sqlite"
PBF_DIR   = DATA_DIR / "pbf"

DATA_DIR.mkdir(exist_ok=True)
PBF_DIR.mkdir(exist_ok=True)

# ── Sources PBF Geofabrik (gratuit) ──────────────────────────────────────────
PBF_SOURCES = {
    "belgium":     "https://download.geofabrik.de/europe/belgium-latest.osm.pbf",
    "luxembourg":  "https://download.geofabrik.de/europe/luxembourg-latest.osm.pbf",
    "france":      "https://download.geofabrik.de/europe/france-latest.osm.pbf",
}

# ── Handler osmium — extraction rues et villes ────────────────────────────────
class _StreetHandler(osmium.SimpleHandler):
    """Extrait les ways highway=* nommees (rues) depuis le PBF."""

    HIGHWAY_TYPES = {
        'motorway','trunk','primary','secondary','tertiary',
        'unclassified','residential','living_street','service',
        'pedestrian','footway','path','cycleway','track',
        'motorway_link','trunk_link','primary_link','secondary_link','tertiary_link',
    }

    def __init__(self, cursor):
        super().__init__()
        self.cur = cursor
        self.count = 0

    def way(self, w):
        name = w.tags.get('name')
        if not name:
            return
        if w.tags.get('highway') not in self.HIGHWAY_TYPES:
            return
        lats, lons = [], []
        for n in w.nodes:
            if n.location.valid():
                lats.append(n.location.lat)
                lons.append(n.location.lon)
        if not lats:
            return
        lat = sum(lats) / len(lats)
        lon = sum(lons) / len(lons)
        self.cur.execute(
            "INSERT OR IGNORE INTO streets(name,lat,lon,lat_g,lon_g) VALUES(?,?,?,?,?)",
            (name, lat, lon, int(lat * 100), int(lon * 100))
        )
        self.count += 1
        if self.count % 20000 == 0:
            print(f"  {self.count:,} rues extraites...", flush=True)


class _PlaceHandler(osmium.SimpleHandler):
    """Extrait les nodes place=city/town/village/hamlet."""

    PLACE_TYPES = {'city','town','village','hamlet','suburb','neighbourhood'}

    def __init__(self, cursor):
        super().__init__()
        self.cur = cursor
        self.count = 0

    def node(self, n):
        name = n.tags.get('name')
        if not name:
            return
        place = n.tags.get('place')
        if place not in self.PLACE_TYPES:
            return
        lat = n.location.lat
        lon = n.location.lon
        self.cur.execute(
            "INSERT OR IGNORE INTO places(name,type,lat,lon,lat_g,lon_g) VALUES(?,?,?,?,?,?)",
            (name, place, lat, lon, int(lat * 100), int(lon * 100))
        )
        self.count += 1


# ── Creation base SQLite ──────────────────────────────────────────────────────
def _init_db(db):
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA synchronous=NORMAL")
    db.execute("""
        CREATE TABLE IF NOT EXISTS streets(
            id    INTEGER PRIMARY KEY,
            name  TEXT NOT NULL,
            lat   REAL NOT NULL,
            lon   REAL NOT NULL,
            lat_g INTEGER NOT NULL,
            lon_g INTEGER NOT NULL
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_streets ON streets(lat_g, lon_g)")
    db.execute("""
        CREATE TABLE IF NOT EXISTS places(
            id    INTEGER PRIMARY KEY,
            name  TEXT NOT NULL,
            type  TEXT NOT NULL,
            lat   REAL NOT NULL,
            lon   REAL NOT NULL,
            lat_g INTEGER NOT NULL,
            lon_g INTEGER NOT NULL
        )
    """)
    db.execute("CREATE INDEX IF NOT EXISTS idx_places ON places(lat_g, lon_g)")
    db.execute("""
        CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT)
    """)
    db.commit()


# ── Telechargement PBF ────────────────────────────────────────────────────────
def _download(region, url):
    dest = PBF_DIR / f"{region}.osm.pbf"
    if dest.exists():
        print(f"  {region} deja present ({dest.stat().st_size//1024//1024} MB), skip.")
        return dest
    print(f"  Telechargement {region}...")
    tmp = dest.with_suffix('.tmp')
    t0 = time.time()
    def _progress(block_num, block_size, total_size):
        if total_size > 0:
            pct = min(100, block_num * block_size * 100 // total_size)
            mb  = block_num * block_size // 1024 // 1024
            print(f"\r  {pct}% — {mb} MB", end='', flush=True)
    urllib.request.urlretrieve(url, tmp, reporthook=_progress)
    print()
    tmp.rename(dest)
    print(f"  OK — {dest.stat().st_size//1024//1024} MB en {time.time()-t0:.0f}s")
    return dest


# ── Extraction PBF → SQLite ───────────────────────────────────────────────────
def _extract(pbf_path, db):
    # Index nœuds toujours sur disque — evite les OOM (Jetson RAM partagee CPU/GPU)
    cache_path = f'/tmp/osm_loc_{pbf_path.stem}'
    idx = f'sparse_file_array,{cache_path}'
    print(f"  Index nœuds sur disque : {cache_path}")

    print(f"  Extraction rues de {pbf_path.name}...")
    cur = db.cursor()
    h_streets = _StreetHandler(cur)
    h_streets.apply_file(str(pbf_path), locations=True, idx=idx)
    db.commit()
    print(f"  {h_streets.count:,} rues ajoutees")

    print(f"  Extraction villes/communes de {pbf_path.name}...")
    h_places = _PlaceHandler(cur)
    h_places.apply_file(str(pbf_path), locations=True, idx=idx)
    db.commit()
    print(f"  {h_places.count:,} lieux ajoutes")

    # Nettoyage cache disque
    import glob
    for f in glob.glob(f'/tmp/osm_loc_{pbf_path.stem}*'):
        try: os.remove(f)
        except: pass


# ── API publique : reverse geocoding ─────────────────────────────────────────
_db_cache = None

def _get_db():
    global _db_cache
    if _db_cache is None:
        if not DB_PATH.exists():
            return None
        _db_cache = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=3)
        _db_cache.execute("PRAGMA journal_mode=WAL")
    return _db_cache


def _dist2(lat1, lon1, lat2, lon2):
    """Distance approximative au carre (deg^2), suffisant pour trouver le plus proche."""
    return (lat1 - lat2) ** 2 + (lon1 - lon2) ** 2


def reverse(lat: float, lon: float, radius: int = 3) -> dict | None:
    """
    Retourne {'road': 'Rue des Lilas', 'city': 'Arlon'} ou None.
    radius = nb de cellules de grille (~1km chacune) autour du point.
    """
    db = _get_db()
    if db is None:
        return None

    lat_g = int(lat * 100)
    lon_g = int(lon * 100)

    # Chercher la rue la plus proche
    rows = db.execute("""
        SELECT name, lat, lon FROM streets
        WHERE lat_g BETWEEN ? AND ?
          AND lon_g BETWEEN ? AND ?
        LIMIT 500
    """, (lat_g - radius, lat_g + radius, lon_g - radius, lon_g + radius)).fetchall()

    road = None
    if rows:
        best = min(rows, key=lambda r: _dist2(lat, lon, r[1], r[2]))
        road = best[0]

    # Chercher la ville la plus proche (rayon plus grand)
    r2 = radius + 5
    prows = db.execute("""
        SELECT name, type, lat, lon FROM places
        WHERE lat_g BETWEEN ? AND ?
          AND lon_g BETWEEN ? AND ?
        LIMIT 200
    """, (lat_g - r2, lat_g + r2, lon_g - r2, lon_g + r2)).fetchall()

    city = None
    if prows:
        # Priorite : city > town > village > hamlet
        priority = {'city': 0, 'town': 1, 'village': 2, 'suburb': 3, 'neighbourhood': 4, 'hamlet': 5}
        scored = sorted(prows, key=lambda r: (priority.get(r[1], 9), _dist2(lat, lon, r[2], r[3])))
        city = scored[0][0]

    if road is None and city is None:
        return None
    return {'road': road, 'city': city}


def reverse_str(lat: float, lon: float) -> str | None:
    """Retourne 'Rue des Lilas, Arlon' ou None."""
    r = reverse(lat, lon)
    if r is None:
        return None
    parts = [x for x in [r.get('road'), r.get('city')] if x]
    return ', '.join(parts) if parts else None


def is_ready() -> bool:
    """True si la base est disponible et non vide."""
    db = _get_db()
    if db is None:
        return False
    try:
        n = db.execute("SELECT COUNT(*) FROM streets").fetchone()[0]
        return n > 0
    except Exception:
        return False


# ── Commande setup ────────────────────────────────────────────────────────────
def cmd_setup():
    if not HAS_OSMIUM:
        print("ERREUR : pip install osmium requis")
        sys.exit(1)

    print("=== KYRONEX — Setup geocoding offline ===")
    print(f"Base SQLite : {DB_PATH}")
    print()

    db = sqlite3.connect(str(DB_PATH))
    _init_db(db)

    for region, url in PBF_SOURCES.items():
        print(f"[{region}]")
        already = db.execute("SELECT value FROM meta WHERE key=?", (f"loaded_{region}",)).fetchone()
        if already:
            print(f"  {region} deja indexe, skip.")
            print()
            continue
        pbf = _download(region, url)
        _extract(pbf, db)
        db.execute("INSERT OR REPLACE INTO meta VALUES(?,?)", (f"loaded_{region}", "1"))
        db.commit()
        print()

    n_streets = db.execute("SELECT COUNT(*) FROM streets").fetchone()[0]
    n_places  = db.execute("SELECT COUNT(*) FROM places").fetchone()[0]
    db_size   = DB_PATH.stat().st_size // 1024 // 1024
    print(f"=== Termine ===")
    print(f"Rues    : {n_streets:,}")
    print(f"Lieux   : {n_places:,}")
    print(f"Taille  : {db_size} MB")
    db.close()


def cmd_test(lat, lon):
    result = reverse(lat, lon)
    if result:
        print(f"Rue    : {result.get('road', '—')}")
        print(f"Ville  : {result.get('city', '—')}")
        print(f"String : {reverse_str(lat, lon)}")
    else:
        print("Aucun resultat (base vide ou coordonnees hors zone)")


def cmd_status():
    db = _get_db()
    if db is None:
        print("Base SQLite absente — lancer : python3 geo_offline.py setup")
        return
    n_streets = db.execute("SELECT COUNT(*) FROM streets").fetchone()[0]
    n_places  = db.execute("SELECT COUNT(*) FROM places").fetchone()[0]
    db_size   = DB_PATH.stat().st_size // 1024 // 1024
    regions   = db.execute("SELECT key FROM meta WHERE key LIKE 'loaded_%'").fetchall()
    print(f"Rues    : {n_streets:,}")
    print(f"Lieux   : {n_places:,}")
    print(f"Taille  : {db_size} MB")
    print(f"Regions : {', '.join(r[0].replace('loaded_','') for r in regions)}")
    print(f"Pret    : {'OUI' if n_streets > 0 else 'NON'}")


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if cmd == 'setup':
        cmd_setup()
    elif cmd == 'test' and len(sys.argv) == 4:
        cmd_test(float(sys.argv[2]), float(sys.argv[3]))
    elif cmd == 'status':
        cmd_status()
    else:
        print("Usage:")
        print("  python3 geo_offline.py setup")
        print("  python3 geo_offline.py test LAT LON")
        print("  python3 geo_offline.py status")
