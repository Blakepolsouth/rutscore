// Builds one "When is the rut in <State>?" page per state, the /rut/ index, sitemap.xml and robots.txt.
// Runs on Netlify at every deploy, so the year in titles stays current. Edit dates in data/rut-states.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = path.join(root, "public");
const SITE = "https://rutscore.com";
const states = JSON.parse(fs.readFileSync(path.join(root, "data", "rut-states.json"), "utf8"));
const now = new Date(), YEAR = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // season label: fall year
const SEASON = `${YEAR}`;
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MF = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const REGIONS = ["Northeast", "Southeast", "Midwest", "Plains", "West"];

// Dates as day-of-season (day 0 = July 1) so windows that cross New Year work.
const SEASON_START = Date.UTC(2001, 6, 1);
const toDay = md => { const [m, d] = md.split("-").map(Number); const y = m >= 7 ? 2001 : 2002; return Math.round((Date.UTC(y, m - 1, d) - SEASON_START) / 864e5); };
const fromDay = n => { const t = new Date(SEASON_START + n * 864e5); return { m: t.getUTCMonth(), d: t.getUTCDate() }; };
const fmt = n => { const x = fromDay(n); return `${MN[x.m]} ${x.d}`; };
const fmtLong = n => { const x = fromDay(n); return `${MF[x.m]} ${x.d}`; };
function phases(win) {
  const s = toDay(win[0]), e = toDay(win[1]);
  return [
    ["Pre-rut", s - 24, s - 11, "Scrapes and rubs show up and bucks start cruising. Movement builds, especially at dusk."],
    ["Seeking & chasing", s - 10, s - 1, "The best time to be in the woods. Bucks are on their feet in daylight looking for does. Sit all day if you can."],
    ["Peak breeding", s, e, "Bucks lock down with does. Movement gets spotty, but big bucks can show up any time of day."],
    ["Post-rut", e + 1, e + 21, "Worn-out bucks focus on food. Hunt food sources in the evening, especially after a cold front."],
    ["Second rut", s + 26, s + 36, "Does that weren't bred come back into heat about 28 days later, which can spark a short burst of chasing."]
  ];
}

for (const st of states) { st.slug = slug(st.name); st.path = `/rut/${st.slug}/`; }

const head = (title, desc, canon, extra = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${canon}">
<meta name="theme-color" content="#14170f">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}${canon}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon-192.png">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@700;800;900&family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/app.css">
<link rel="stylesheet" href="/rut.css">
${extra}</head>`;
const topbar = `<header class="top"><a class="brand" href="/" style="color:inherit;text-decoration:none"><b>Rut<span>Score</span></b></a><a class="btn" href="/?add=1" style="text-decoration:none">＋ Check my land</a></header>`;

// Small inline script: live "rut right now" badge from the state's typical window.
const nowScript = `<script>
(function(){
  var S=Date.UTC(2001,6,1);
  function toDay(md){var p=md.split("-"),m=+p[0],d=+p[1],y=m>=7?2001:2002;return Math.round((Date.UTC(y,m-1,d)-S)/864e5);}
  function today(){var t=new Date(),m=t.getMonth()+1,d=t.getDate();return toDay(m+"-"+d);}
  function lerp(a,b,t){return a+(b-a)*Math.max(0,Math.min(1,t));}
  function rut(win){var s=toDay(win[0]),e=toDay(win[1]),x=today(),v,ph;
    if(x>=s-24&&x<s-10){v=lerp(4,6.5,(x-(s-24))/14);ph="Pre-rut";}
    else if(x>=s-10&&x<s){v=lerp(8,10,(x-(s-10))/8);ph="Seeking & chasing";}
    else if(x>=s&&x<=e){v=lerp(9,7,(x-s)/Math.max(1,e-s));ph="Peak breeding";}
    else if(x>e&&x<=e+21){v=lerp(4.5,2.5,(x-e)/21);ph="Post-rut";if(x>=s+26&&x<=s+36){v=5;ph="Second rut";}}
    else if(x>=s+26&&x<=s+36){v=5;ph="Second rut";}
    else{v=1;ph=x<s?"Before the rut":"Rut is over";}
    return{v:Math.round(Math.max(1,Math.min(10,v))),ph:ph};}
  function tier(v){return v>=9?"Red hot":v>=7?"Heating up":v>=4?"Building":v>=2?"Winding down":"Off season";}
  document.querySelectorAll("[data-win]").forEach(function(el){
    var w=el.getAttribute("data-win").split(","),r=rut(w),n=el.querySelector(".n"),t=el.querySelector(".t");
    if(n)n.textContent=r.v; if(t)t.textContent=r.ph+" · "+tier(r.v); el.style.setProperty("--rut",r.v>=7?"var(--gold)":r.v>=4?"var(--fair)":"var(--muted)");
  });
})();
</script>`;

for (const st of states) {
  const title = `When Is the Rut in ${st.name}? ${SEASON} ${st.name} Rut Dates | Rut Score`;
  const peakTxt = st.win ? `${fmtLong(toDay(st.win[0]))} to ${fmtLong(toDay(st.win[1]))}` : null;
  const desc = st.noRut
    ? `Rut timing for deer in ${st.name}, plus a free Rut Score and Hunt Score for your own hunting land.`
    : st.win
      ? `${st.name}'s rut typically peaks ${peakTxt}${st.varies ? ", varying by area" : ""}. See pre-rut, chasing and post-rut dates, plus a live Rut Score for your own land.`
      : `${st.name}'s rut varies widely by area. See typical timing by region, plus a live Rut Score for your own land.`;
  const ph = st.win ? phases(st.win) : null;
  const neighbors = states.filter(x => x !== st && x.region === st.region);
  const faq = [];
  if (st.win) {
    faq.push([`When is the peak of the rut in ${st.name}?`, `Peak breeding in ${st.name} typically falls around ${peakTxt}${st.varies ? ", though timing varies by area" : ""}. The best daytime buck movement usually comes in the seeking and chasing phase just before that, around ${fmtLong(ph[1][1])} to ${fmtLong(ph[1][2])}.`]);
    faq.push([`When does the rut start in ${st.name}?`, `Pre-rut activity in ${st.name}, like scrapes, rubs and bucks cruising, typically picks up around ${fmtLong(ph[0][1])}.`]);
    faq.push([`Is there a second rut in ${st.name}?`, `Yes. Does that weren't bred come back into heat about 28 days later, so a smaller second rut often shows up around ${fmtLong(ph[4][1])} to ${fmtLong(ph[4][2])}.`]);
  } else if (!st.noRut) {
    faq.push([`When is the rut in ${st.name}?`, `${st.name}'s rut varies widely by area. ${(st.zones || []).map(z => `${z[0]}: ${z[1].toLowerCase()}.`).join(" ")} Check timing for your specific county.`]);
  }
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };

  const nowCard = st.noRut ? "" : st.win
    ? `<div class="rutnow" data-win="${st.win.join(",")}"><b class="n">–</b><div><em>${esc(st.name)} rut right now</em><span class="t">Calculating…</span><small>Statewide estimate. Your land may differ${st.varies ? ", especially here" : ""}.</small></div></div>`
    : `<div class="rutnow varies"><b class="n">?</b><div><em>${esc(st.name)} rut right now</em><span class="t">Varies by county</span><small>Set your own rut timing in Rut Score for a score on your land.</small></div></div>`;

  const html = head(title, desc, st.path, faq.length ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n` : "") + `
<body style="padding-block:0 32px">
<div class="wrap">
  ${topbar}
  <nav class="crumbs"><a href="/rut/">Rut dates by state</a> › ${esc(st.name)}</nav>
  <article class="rutpage">
    <h1>When is the rut in ${esc(st.name)}?</h1>
    ${nowCard}
    <p class="lede">${esc(st.text)}</p>
    ${st.species ? `<p class="note">Deer here: ${esc(st.species)}.</p>` : ""}
    ${ph ? `<h2>${esc(st.name)} rut calendar</h2>
    <div class="caltable" role="table" aria-label="${esc(st.name)} rut phases">
      ${ph.map(p => `<div class="calrow${p[0] === "Seeking & chasing" ? " hot" : ""}" role="row"><div class="ph" role="cell">${esc(p[0])}</div><div class="dt" role="cell">${fmt(p[1])} – ${fmt(p[2])}</div><div class="ds" role="cell">${esc(p[3])}</div></div>`).join("\n      ")}
    </div>
    <p class="note">Typical statewide dates, estimated from state wildlife agency descriptions and published rut studies. Timing shifts by area and a little year to year.</p>` : ""}
    ${st.zones ? `<h2>Rut timing by region</h2><div class="zones">${st.zones.map(z => `<div class="zone"><b>${esc(z[0])}</b><span>${esc(z[1])}</span></div>`).join("")}</div>` : ""}
    ${st.official ? `<p>For county-level detail, see the <a href="${esc(st.official[1])}" target="_blank" rel="noopener">${esc(st.official[0])}</a>.</p>` : ""}
    <div class="ctabox">
      <h2>What's the Rut Score on your land?</h2>
      <p>Statewide dates are a starting point. Rut Score gives your own property a live <b>Rut Score</b> and <b>Hunt Score</b> every day, the best time to hunt, and which stand fits today's wind. Free, no sign-up.</p>
      <a class="btn big" href="/?add=1" style="text-decoration:none;text-align:center">＋ Check my land</a>
    </div>
    ${faq.length ? `<h2>${esc(st.name)} rut questions</h2><div class="faq">${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>` : ""}
    ${neighbors.length ? `<h2>Nearby states</h2><div class="linkgrid">${neighbors.map(n => `<a href="${n.path}">${esc(n.name)}</a>`).join("")}</div>` : ""}
    <p><a href="/rut/">See rut dates for every state</a></p>
  </article>
  <footer><div>Rut dates are estimates and vary by area and year. Always follow your state's season dates, legal shooting hours and hunting regulations.</div><div>rutscore.com</div></footer>
</div>
${nowScript}
</body>
</html>
`;
  const dir = path.join(pub, "rut", st.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

// Index page
const groups = REGIONS.map(r => {
  const list = states.filter(s => s.region === r).sort((a, b) => a.name.localeCompare(b.name));
  return `<h2>${r}</h2><div class="statelist">${list.map(s => s.win
    ? `<a class="staterow" href="${s.path}" data-win="${s.win.join(",")}"><b class="n">–</b><span class="nm">${esc(s.name)}</span><span class="t"></span><span class="pk">Peak ~${fmt(toDay(s.win[0]))}–${fmt(toDay(s.win[1]))}</span></a>`
    : `<a class="staterow varies" href="${s.path}"><b class="n">?</b><span class="nm">${esc(s.name)}</span><span class="t">${s.noRut ? "No single rut" : "Varies by county"}</span><span class="pk">${s.noRut ? "" : "See regions"}</span></a>`).join("")}</div>`;
}).join("\n");
const idxTitle = `When Is the Rut? ${SEASON} Deer Rut Dates by State | Rut Score`;
const idxDesc = `Peak rut dates for all 50 states, a live "rut right now" score for each, and a free Rut Score for your own hunting land.`;
fs.mkdirSync(path.join(pub, "rut"), { recursive: true });
fs.writeFileSync(path.join(pub, "rut", "index.html"), head(idxTitle, idxDesc, "/rut/") + `
<body style="padding-block:0 32px">
<div class="wrap">
  ${topbar}
  <article class="rutpage">
    <h1>When is the rut? Rut dates by state</h1>
    <p class="lede">Typical peak breeding dates for every state, with a live estimate of where the rut stands right now. Tap your state for the full calendar, then check the Rut Score on your own land.</p>
    ${groups}
    <p class="note">Statewide estimates from state wildlife agency descriptions and published rut studies. Timing varies by area and year, and Southern states can vary by weeks from county to county.</p>
  </article>
  <footer><div>Always follow your state's season dates, legal shooting hours and hunting regulations.</div><div>rutscore.com</div></footer>
</div>
${nowScript}
</body>
</html>
`);

// sitemap + robots
const today = now.toISOString().slice(0, 10);
const urls = ["/", "/rut/", ...states.map(s => s.path)].map(u => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>${u === "/" ? "daily" : "weekly"}</changefreq></url>`).join("\n");
fs.writeFileSync(path.join(pub, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
fs.writeFileSync(path.join(pub, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Built ${states.length} state rut pages, /rut/, sitemap.xml and robots.txt (season ${SEASON})`);
