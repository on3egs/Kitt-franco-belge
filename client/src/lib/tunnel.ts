const KITT_URL = "https://api.github.com/repos/on3egs/Kitt-franco-belge/contents/tunnel_kitt.json";
const KARR_URL = "https://api.github.com/repos/on3egs/Kitt-franco-belge/contents/tunnel_karr.json";

async function _fetchTunnel(apiUrl: string): Promise<string | null> {
  try {
    const r = await fetch(`${apiUrl}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github.v3.raw" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.status === "online" && d.url ? d.url : null;
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
