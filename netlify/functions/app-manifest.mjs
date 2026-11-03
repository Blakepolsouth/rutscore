// /app.webmanifest?s=<codes> — same app manifest, but the Home Screen app starts with this phone's saved properties.
// (iPhone keeps Home Screen apps' storage separate from Safari, so this is how saved land comes along when someone installs.)
const base = {"name": "Rut Score", "short_name": "Rut Score", "description": "How hot is the rut, and will deer move today? Rut Score, Hunt Score and which stand fits the wind.", "id": "/", "start_url": "/", "scope": "/", "display": "standalone", "orientation": "portrait", "background_color": "#14170f", "theme_color": "#14170f", "icons": [{"src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"}, {"src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"}, {"src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]};   // keep in sync with public/manifest.webmanifest
export default async (req) => {
  const s = new URL(req.url).searchParams.get("s") || "";
  const ok = /^[A-Za-z0-9_~-]{1,6000}$/.test(s);
  const m = { ...base, id: "/", start_url: ok ? `/?restore=${s}` : "/" };
  return new Response(JSON.stringify(m), { headers: { "content-type": "application/manifest+json", "cache-control": "no-store" } });
};
export const config = { path: "/app.webmanifest" };
