const KITT_URL = "https://api.github.com/repos/on3egs/Kitt-franco-belge/contents/tunnel_kitt.json";
const KARR_URL = "https://api.github.com/repos/on3egs/Kitt-franco-belge/contents/tunnel_karr.json";

// Au-delà de cette durée, une URL de tunnel ÉPHÉMÈRE (localhost.run) est
// considérée périmée : son URL aléatoire a changé et l'ancienne renvoie 503.
const MAX_AGE_MIN = 120;

async function _fetchTunnel(apiUrl: string): Promise<string | null> {
  try {
    const r = await fetch(`${apiUrl}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github.v3.raw" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.status !== "online" || !d.url) return null;
    // Tunnel permanent (Cloudflare nommé) : URL fixe, on ignore l'âge.
    // Tunnel éphémère : on rejette s'il est trop vieux (évite une URL morte).
    if (!d.permanent && d.last_update) {
      const ageMin = (Date.now() - new Date(d.last_update).getTime()) / 60000;
      if (ageMin > MAX_AGE_MIN) return null;
    }
    return d.url;
  } catch {
    return null;
  }
}

/** Retourne la base URL du Jetson disponible (KITT en priorité, sinon KARR) */
export async function getApiBase(): Promise<string | null> {
  const kitt = await _fetchTunnel(KITT_URL);
  if (kitt) return kitt;
  const karr = await _fetchTunnel(KARR_URL);
  return karr;
}
