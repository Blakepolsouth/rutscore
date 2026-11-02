// Personalized link previews for shared hunt forecasts, e.g.
//   /?p=<property code>&n=Georgia+lease&s=8&w=Saturday&pt=6:22–8:30+AM
// Group-text apps read the page's meta tags without running JavaScript, so we rewrite them here.
const TIER = s => s >= 9 ? "Get in the stand" : s >= 7 ? "Good movement" : s >= 5 ? "Fair movement" : s >= 3 ? "Slow movement" : "Stay home";
const clean = (v, max) => String(v || "").replace(/[\u0000-\u001f<>"`]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const attr = v => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function setMeta(html, prop, value) {
  const isOg = prop.startsWith("og:");
  const re = isOg ? new RegExp(`<meta property="${prop}" content="[^"]*">`) : new RegExp(`<meta name="${prop}" content="[^"]*">`);
  const tag = isOg ? `<meta property="${prop}" content="${attr(value)}">` : `<meta name="${prop}" content="${attr(value)}">`;
  return re.test(html) ? html.replace(re, tag) : html.replace("</head>", `${tag}\n</head>`);
}
export default async (request, context) => {
  const url = new URL(request.url), q = url.searchParams;
  if (!q.has("n") && !q.has("s")) return;
  const res = await context.next();
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  const name = clean(q.get("n"), 40) || "this property";
  const s = parseInt(q.get("s"), 10), score = s >= 1 && s <= 10 ? s : null;
  const when = clean(q.get("w"), 12), whenTxt = when ? (when.toLowerCase() === "today" ? "today" : when) : "";
  const prime = clean(q.get("pt"), 24);
  const rr = parseInt(q.get("r"), 10), rut = rr >= 1 && rr <= 10 ? rr : null;
  const title = score ? (rut ? `${name}: Rut ${rut} · Hunt ${score} ${whenTxt}` : `${name}: Hunt Score ${score}/10 ${whenTxt}`).trim() + " | Rut Score" : `${name} hunt forecast | Rut Score`;
  const desc = score ? `${TIER(score)}${prime ? `. Prime ${prime}` : ""}. Tap for the rut and deer movement forecast, and which stand fits the wind.` : `Deer movement forecast for ${name}: best time to hunt and which stand fits today's wind.`;
  const image = rut ? `${url.origin}/og/rut-${rut}.png` : score ? `${url.origin}/og/hunt-${score}.png` : `${url.origin}/og.png`;
  let html = await res.text();
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`);
  for (const [k, v] of [["og:title", title], ["og:description", desc], ["og:image", image], ["og:url", url.href], ["twitter:title", title], ["twitter:description", desc], ["twitter:image", image], ["description", desc]]) html = setMeta(html, k, v);
  const headers = new Headers(res.headers); headers.delete("content-length"); headers.set("cache-control", "public, max-age=0, must-revalidate");
  return new Response(html, { status: res.status, headers });
};
export const config = { path: "/*", excludedPath: ["/*.js", "/*.css", "/*.png", "/*.json", "/*.webmanifest", "/*.txt", "/*.ico", "/api/*", "/og/*"] };
