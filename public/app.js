/* Rut Score app — UI layer. Scoring lives in engine.js. */
import {
  buildModel, primeFor, tierOf, grade, gradeTier, reason, phaseName, fetchForecast, parseCoords,
  encodeProperty, decodeProperty, shareURL, bestStand, standWind, windDuring, RUT, DIRS, DIR_NAMES,
  sitAdvice, dirName, dirShort, bearingBetween, destPoint, rutTier,
  fmtT as fT, fmtRange as fR, tzShort, DN, DL, MN, keyDate, compass, inHg, clamp, SITE
} from "./engine.js";

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem("rs_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("rs_" + k, JSON.stringify(v)); } catch (e) {} }
};
const PREVIEW = !/^https?:$/.test(location.protocol) || /claude|claudeusercontent|localhost/.test(location.hostname);
const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const SAMPLE = { id: "sample", sample: true, name: "Sample land · Middle Georgia", lat: 32.84, lon: -83.63, rut: "chasing", stands: [{ name: "Creek bottom", bearing: 315, lat: 32.8418, lon: -83.6322 }, { name: "Ridge ladder", bearing: 90, lat: 32.8389, lon: -83.6281 }, { name: "Food plot blind", bearing: 180, lat: 32.8376, lon: -83.6327 }] };

let PROPS = store.get("props", []), PROP = null, MODEL = null, SEL = 0, DEMO = false, SHARED = null;
const fmtT = (ms, short) => fT(ms, MODEL ? MODEL.tz : "UTC", short);
const fmtRange = (a, b) => fR(a, b, MODEL ? MODEL.tz : "UTC");
const saveProps = () => store.set("props", PROPS);
const newId = () => Math.random().toString(36).slice(2, 10);

/* ───────── Property picker ───────── */
function renderSampleBanner() { $("sampleBanner").hidden = !(PROP && PROP.sample) || !$("addPanel").hidden; }
$("sampleAdd").onclick = () => openAdd(null);
function renderPropSelect() {
  renderSampleBanner();
  const sel = $("propSelect"); sel.innerHTML = "";
  const list = PROPS.slice();
  if (PROP && (PROP.sample || PROP.shared)) list.unshift(PROP);
  list.forEach(p => { const o = document.createElement("option"); o.value = p.id; o.textContent = p.sample ? "Sample land (add yours)" : p.shared ? `${p.name} (shared with you)` : p.name; sel.appendChild(o); });
  if (PROP) sel.value = PROP.id;
}
$("propSelect").onchange = () => { const p = PROPS.find(x => x.id === $("propSelect").value); if (p) selectProp(p); };
function selectProp(p) { if (typeof resetStandForm === "function" && NEW_STAND) { try { resetStandForm(); } catch (e) {} } SPROP_KEY = ""; PROP = p; if (!p.sample && !p.shared) store.set("sel", p.id); renderPropSelect(); load(); }

/* ───────── Render ───────── */
function render() {
  if (!MODEL || !PROP) return;
  const D = MODEL.days[SEL], s = D.summary, t = tierOf(D.score);
  $("bug").classList.remove("loading"); $("bug").style.setProperty("--tier", t.c);
  $("bugPlace").textContent = PROP.name;
  const tzn = tzShort(MODEL.tz, D.start + 12 * 3600e3);
  $("tzLbl").textContent = MODEL.tz !== DEVICE_TZ ? `Times in ${tzn}` : tzn;
  const dt = keyDate(D.key);
  $("dayName").textContent = (D.isToday ? "Today · " : "") + `${DL[dt.getUTCDay()]}, ${MN[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
  $("score").innerHTML = `${D.score}<sup>/10</sup>`;
  $("verdict").innerHTML = `<span>${t.name}</span>`;
  const rt = rutTier(D.rut), rb = $("rutBadge");
  rb.style.setProperty("--rut", rt.c); $("rutNum").textContent = D.rut == null ? "?" : D.rut;
  $("rutName").textContent = D.rut == null ? "Set your rut" : (s.rutKey && s.rutKey !== "none" ? RUT[s.rutKey].short + " · " : "") + rt.name;
  const { w, passed } = primeFor(D);
  $("primeLbl").textContent = w.label ? `Prime time · ${w.label}` : "Prime time";
  $("prime").textContent = w.start ? fmtRange(w.start, w.end) : "–";
  $("primeNote").textContent = passed ? (w.start ? `Earlier window ${fmtRange(passed.start, passed.end)} has passed.` : "Today's shooting light is over. Check tomorrow.") : `Legal light ${fmtT(D.legalStart)} – ${fmtT(D.legalEnd)}`;
  $("why").textContent = reason(s);
  const al = $("alert");
  if (s.storms) { al.hidden = false; al.textContent = "⚡ Storms forecast during shooting hours. Stay out of tree stands when there's lightning."; }
  else if (s.gust > 30) { al.hidden = false; al.textContent = `💨 Gusts up to ${Math.round(s.gust)} mph. Check your stand straps and climb carefully.`; }
  else al.hidden = true;
  renderStand(D, w); renderWeek(); renderChart(D, w); renderTimes(D, w); renderStats(D); renderTicker(D, w); renderAlerts();
  $("rutSel").value = PROP.rut || "";
  $("rutNote").textContent = s.rutKey ? `${s.rutEstimated ? "Estimated: " : ""}${RUT[s.rutKey].note}` + (s.rutEstimated ? " Rut timing varies by area, so set it above if you know yours." : "")
    : "Rut timing in the South varies a lot from county to county. Set it above for a better score.";
  $("live").classList.toggle("sample", DEMO || !!PROP.sample); $("liveTxt").textContent = DEMO || PROP.sample ? "SAMPLE" : "LIVE";
  if (!$("shareBox").hidden) fillShareSheet();
  prepareCard();
}
function arrowSVG(deg) {
  if (deg == null) return "";
  const to = (deg + 180) % 360;
  return `<svg class="arrow" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="var(--field)" stroke="var(--line)" stroke-width="2"/>
    <text x="32" y="13" text-anchor="middle" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" font-size="10" fill="var(--muted)">N</text>
    <g transform="rotate(${to} 32 32)"><path d="M32 12 L40 30 L34 28 L34 50 L30 50 L30 28 L24 30 Z" fill="var(--gold)"/></g></svg>`;
}
let LAST_RATED = null, LAST_WIND = null;
function renderHowto() {
  const own = !PROP.sample && !PROP.shared, hasStands = (PROP.stands || []).length > 0;
  const show = !store.get("howtoHidden", false) && (PROP.sample || (own && !hasStands));
  $("standHowto").hidden = !show;
  $("howtoNote").textContent = PROP.sample ? "This sample land has 3 stands so you can see it in action. Add your own land to set up yours." : "Start below: name your first stand, then tap the map where it is.";
}
$("howtoClose").onclick = () => { store.set("howtoHidden", true); $("standHowto").hidden = true; };
function renderStand(D, w) {
  renderHowto();
  const stands = PROP.stands || [], pick = $("standPick"), list = $("standList");
  const wind = w.start ? windDuring(D, w) : { deg: D.summary.wdir, mph: D.summary.wind };
  LAST_WIND = wind;
  $("standWindLbl").textContent = wind.deg != null ? `${compass(wind.deg)} wind ${Math.round(wind.mph)} mph${w.start ? " at prime time" : ""}` : "";
  if (!stands.length) {
    LAST_RATED = [];
    pick.style.setProperty("--tier", "var(--muted)");
    pick.innerHTML = `${arrowSVG(wind.deg)}<div class="txt"><b>Play the wind</b><small>${esc(sitAdvice(wind.deg))} Add your stands and Rut Score will pick the best one.</small></div>`;
    list.innerHTML = ""; if (!PROP.sample && !PROP.shared) $("addStandBox").open = true;
    renderStandMap(); return;
  }
  const r = bestStand(stands, D, w.start ? w : { start: D.legalStart, end: D.legalEnd });
  LAST_RATED = r.rated;
  const best = r.best, tc = best.check.k === "good" ? "var(--good)" : best.check.k === "cross" ? "var(--fair)" : "var(--bad)";
  pick.style.setProperty("--tier", tc);
  pick.innerHTML = best.check.k === "bad"
    ? `${arrowSVG(wind.deg)}<div class="txt"><b>No stand fits this wind</b><small>Every stand has the wind blowing toward the deer. ${esc(sitAdvice(wind.deg))}</small></div>`
    : `${arrowSVG(wind.deg)}<div class="txt"><b>Hunt the ${esc(best.name)}</b><small>${esc(best.check.label)}</small></div>`;
  list.innerHTML = "";
  r.rated.forEach(st => {
    const row = document.createElement("div"); row.className = "stand";
    const tier = TIER_COLOR(st.check.k), word = { good: "Good wind", cross: "Crosswind", swirl: "Swirling", bad: "Bad wind", unknown: "No data" }[st.check.k];
    row.innerHTML = `<div class="nm" title="Edit this stand">${st.lat != null ? "📍 " : ""}${esc(st.name)}<small>Deer from the ${dirName(st.bearing)} · ${Math.round(st.bearing)}°</small></div><span class="wv" style="--tier:${tier}">${word}</span>`;
    if (!PROP.sample && !PROP.shared) {
      row.querySelector(".nm").onclick = () => editStand(st.name);
      const x = document.createElement("button"); x.type = "button"; x.className = "x"; x.textContent = "✕"; x.setAttribute("aria-label", `Remove ${st.name}`); x.onclick = () => removeStand(st.name); row.appendChild(x);
    }
    list.appendChild(row);
  });
  renderStandMap();
}
const TIER_COLOR = k => k === "good" ? "var(--good)" : k === "cross" ? "var(--fair)" : k === "swirl" ? "var(--tough)" : k === "bad" ? "var(--bad)" : "var(--muted)";
const HEX = { good: "#7bd34b", cross: "#ffc233", swirl: "#ff8a3d", bad: "#d7263d", unknown: "#a9ad95" };
function renderWeek() {
  const wk = $("week"); wk.innerHTML = "";
  const best = MODEL.days.reduce((a, d) => d.score > a.score ? d : a, MODEL.days[0]), bd = keyDate(best.key);
  $("bestDay").innerHTML = `Best hunt: <span style="color:var(--gold)">${best.isToday ? "Today" : DN[bd.getUTCDay()]} ${best.score}/10</span>`;
  MODEL.days.forEach((d, i) => {
    const t = tierOf(d.score), dt = keyDate(d.key), b = document.createElement("button");
    b.className = "day"; b.type = "button"; b.style.setProperty("--tier", t.c); b.setAttribute("aria-pressed", i === SEL ? "true" : "false");
    b.setAttribute("aria-label", `${DL[dt.getUTCDay()]}: Hunt Score ${d.score} out of 10${d.rut != null ? `, Rut Score ${d.rut}` : ""}, ${t.name}`);
    b.innerHTML = `<span class="dn"${d.isToday ? ' style="font-size:11px"' : ""}>${d.isToday ? "Today" : DN[dt.getUTCDay()]}</span><span class="ds">${d.score}</span><span class="bar"></span><span class="rr">${d.rut != null ? "RUT " + d.rut : "&nbsp;"}</span><span class="dd">${MN[dt.getUTCMonth()]} ${dt.getUTCDate()}</span>`;
    b.onclick = () => { SEL = i; render(); };
    wk.appendChild(b);
  });
}
function renderChart(D, w) {
  const hrs = D.hunt; if (!hrs.length) { $("chart").innerHTML = ""; return; }
  const W = 380, top = 14, base = 104, left = 4, bw = (W - left * 2) / hrs.length, x0 = hrs[0].ms; let g = "";
  const X = ms => clamp(left + ((ms - x0) / 3600e3) * bw, 0, W);
  [2.5, 5, 7.5, 10].forEach(v => { const y = base - (v / 10) * (base - top); g += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-dasharray="${v === 10 ? "0" : "2 4"}"/>`; });
  if (w.start) { const a = X(w.start), b = X(w.end); if (b > a) g += `<rect x="${a}" y="${top - 8}" width="${b - a}" height="${base - top + 8}" fill="var(--gold)" fill-opacity=".14" stroke="var(--gold)" stroke-width="1.5" rx="2"/><text x="${(a + b) / 2}" y="${top - 1}" fill="var(--gold)" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" font-size="10" text-anchor="middle" letter-spacing="1">PRIME</text>`; }
  hrs.forEach((x, i) => {
    const v = clamp(x.score, 0, 10), hgt = Math.max(3, (v / 10) * (base - top)), t = tierOf(Math.round(v)), bx = left + i * bw + 1.5;
    g += `<rect x="${bx}" y="${base - hgt}" width="${bw - 3}" height="${hgt}" rx="1.5" fill="${t.c}" fill-opacity="${x.ms + 3600e3 < Date.now() && D.isToday ? .35 : 1}"><title>${fmtT(x.ms)} · ${v.toFixed(1)}</title></rect>`;
    if (x.code >= 95) g += `<text x="${bx + (bw - 3) / 2}" y="${base - hgt - 3}" font-size="10" text-anchor="middle">⚡</text>`;
    if (x.hr % 2 === 0) g += `<text x="${bx + (bw - 3) / 2}" y="${base + 16}" fill="var(--muted)" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="600" font-size="11" text-anchor="middle">${fmtT(x.ms, "ap")}</text>`;
  });
  [D.legalStart, D.legalEnd].forEach(ms => { const x = X(ms); g += `<line x1="${x}" x2="${x}" y1="${top - 8}" y2="${base}" stroke="var(--good)" stroke-width="1.5" stroke-dasharray="3 3"/>`; });
  if (D.isToday) { const nx = X(Date.now()); if (nx > 0 && nx < W) g += `<line x1="${nx}" x2="${nx}" y1="${top - 8}" y2="${base}" stroke="var(--red)" stroke-width="2"/><text x="${nx}" y="${base + 28}" fill="var(--red)" font-family="Barlow Condensed,Arial Narrow,sans-serif" font-weight="800" font-size="10" text-anchor="middle">NOW</text>`; }
  $("chart").innerHTML = g; $("clockLbl").textContent = `${fmtT(D.legalStart)} – ${fmtT(D.legalEnd)}`;
}
function renderTimes(D, w) {
  const ev = D.ev, c = [{ t: D.legalStart, n: "Legal start", cls: "legal" }, { t: D.legalEnd, n: "Legal end", cls: "legal" }];
  if (ev.sunrise) c.push({ t: ev.sunrise, n: "Sunrise", cls: "" }); if (ev.sunset) c.push({ t: ev.sunset, n: "Sunset", cls: "" });
  ev.majors.forEach(m => c.push({ t: m.t, n: "Major", cls: "major" })); ev.minors.forEach(m => c.push({ t: m.t, n: "Minor", cls: "" }));
  c.sort((a, b) => a.t - b.t);
  if (w && w.start) c.unshift({ n: "Prime", cls: "prime", txt: fmtRange(w.start, w.end) });
  $("times").innerHTML = c.map(x => `<span class="chip ${x.cls}"><em>${x.n}</em>${x.txt || fmtT(x.t)}</span>`).join("");
}
function renderStats(D) {
  const s = D.summary, arrow = s.pTrend <= -0.8 ? "▼ Falling" : s.pTrend >= 0.8 ? "▲ Rising" : "▶ Steady";
  const solG = clamp(.35 + D.ev.majors.length * .2 + D.ev.minors.length * .08, 0, 1);
  const rut = s.rutKey ? RUT[s.rutKey] : null;
  const rows = [
    ["Temp", `${Math.round(s.tmax)}° / ${Math.round(s.tmin)}°`, s.hasPrev && Math.round(s.dT) ? `${s.dT > 0 ? "+" : ""}${Math.round(s.dT)}° vs. yesterday's high` : "About the same as yesterday", s.ts],
    ["Pressure", `${inHg(s.pNoon)} inHg ${arrow}`, `${s.pTrend > 0 ? "+" : ""}${(s.pTrend * 0.02953).toFixed(2)} inHg from 6 AM to 6 PM`, s.p],
    ["Wind", `${compass(s.wdir)} ${Math.round(s.wind)} mph`, s.gust ? `Gusts to ${Math.round(s.gust)} mph` : "Shooting-hours average", s.w],
    ["Rain", s.storms ? "Thunderstorms" : s.rainIn > 0.25 ? "Wet day" : s.rainIn > 0.02 ? "Light showers" : "Dry", (s.rainPct != null ? `${Math.round(s.rainPct)}% chance · ` : "") + `${s.rainIn.toFixed(2)} in`, s.r],
    ["Rut", D.rut != null ? `${D.rut}/10 · ${rut.name}` : "Not set", rut ? (s.rutEstimated ? "Estimated for your area" : "Set by you") : "Set it below for a Rut Score", D.rut != null ? D.rut / 10 : .5],
    ["Moon", phaseName(s.phase), `${Math.round(s.illum * 100)}% lit`, .3 + .7 * s.ps],
    ["Solunar", `${D.ev.majors.length} major · ${D.ev.minors.length} minor`, D.ev.majors.length ? "Majors: " + D.ev.majors.map(m => fmtT(m.t)).join(", ") : "No major period today", solG]
  ];
  $("stats").innerHTML = rows.map(r => `<div class="row"><div class="k">${r[0]}</div><div class="v"><b>${esc(r[1])}</b><small>${esc(r[2])}</small></div><div class="grade" style="--tier:${gradeTier(r[3])}">${grade(r[3])}</div></div>`).join("");
}
function renderTicker(D, w) {
  const s = D.summary, st = (PROP.stands || []).length ? bestStand(PROP.stands, D, w.start ? w : { start: D.legalStart, end: D.legalEnd }) : null;
  const items = [
    D.rut != null ? `${PROP.name}: Rut Score ${D.rut}/10 · Hunt Score ${D.score}/10` : `${PROP.name}: Hunt Score ${D.score}/10`, w.start ? `Prime time ${fmtRange(w.start, w.end)}` : "",
    st && st.best.check.k !== "bad" ? `Hunt the ${st.best.name}` : "",
    `Legal light ${fmtT(D.legalStart)} – ${fmtT(D.legalEnd)}`, `Wind ${compass(s.wdir)} ${Math.round(s.wind)} mph`,
    s.hasPrev ? `High ${Math.round(s.tmax)}° (${s.dT > 0 ? "+" : ""}${Math.round(s.dT)}°)` : "", s.rutKey ? RUT[s.rutKey].name : "",
    ...MODEL.days.filter((d, i) => i !== SEL).sort((a, b) => b.score - a.score).slice(0, 2).map(d => `Best this week: ${DL[keyDate(d.key).getUTCDay()]} ${d.score}/10`),
    DEMO ? "Sample data — live forecast loads when hosted" : "Forecast updates hourly"
  ].filter(Boolean);
  const html = items.map(i => `<span>${esc(i)}</span>`).join(""); $("track").innerHTML = html + html;
}

/* ───────── Data ───────── */
function sampleData() {
  const tz = DEVICE_TZ, n = new Date(), y = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1);
  const h = { time: [], temperature_2m: [], pressure_msl: [], wind_speed_10m: [], wind_direction_10m: [], wind_gusts_10m: [], cloud_cover: [], precipitation: [], precipitation_probability: [], weather_code: [] };
  let seed = 11; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let k = 0; k < 8 * 24; k++) {
    const t = new Date(y.getTime() + k * 3600e3), hr = k % 24, day = Math.floor(k / 24), front = k - 24 * 2.7; h.time.push(Math.round(t.getTime() / 1000));
    h.pressure_msl.push(+(1013 - 5 * Math.exp(-(front ** 2) / (2 * 20 ** 2)) + (front > 0 ? 7 * Math.min(1, front / 30) : 0)).toFixed(1));
    const w = Math.max(1, 5 + 4 * Math.sin((hr - 10) / 24 * 2 * Math.PI) + (Math.abs(front) < 10 ? 8 : 0) + rnd() * 2);
    h.wind_speed_10m.push(+w.toFixed(1)); h.wind_gusts_10m.push(+(w * 1.6).toFixed(1)); h.wind_direction_10m.push(front < 0 ? 190 : day > 5 ? 110 : 315);
    const storm = front > -2 && front < 2; h.cloud_cover.push(Math.round(clamp(front < 0 && front > -20 ? 85 : 30 + rnd() * 30, 0, 100)));
    h.precipitation.push(storm ? 0.2 : 0); h.precipitation_probability.push(storm ? 70 : Math.round(rnd() * 10)); h.weather_code.push(storm ? 61 : 1);
    h.temperature_2m.push(+((front < 0 ? 72 : 54) + 11 * Math.sin((hr - 9) / 24 * 2 * Math.PI) + day * .6).toFixed(1));
  }
  return { hourly: h, timezone: tz };
}
async function load(opt) {
  opt = opt || {};
  const keepKey = opt.keepDay && MODEL && MODEL.days[SEL] ? MODEL.days[SEL].key : null, p = PROP; if (!p) return;
  $("bug").classList.add("loading"); $("bugPlace").textContent = p.name;
  let data; DEMO = false;
  try { data = await fetchForecast(p); }
  catch (e) { if (PREVIEW) { data = sampleData(); DEMO = true; } else { if (!MODEL || !opt.keepDay) showError(); return; } }
  if (p !== PROP) return;
  MODEL = buildModel(data.hourly, data.timezone || "UTC", p, { rut: p.rut || null });
  const want = opt.day || keepKey, i = want ? MODEL.days.findIndex(d => d.key === want) : -1; SEL = i >= 0 ? i : 0;
  render();
}
function showError() {
  MODEL = null; const b = $("bug"); b.classList.remove("loading"); b.style.setProperty("--tier", "var(--muted)");
  $("score").innerHTML = "–<sup>/10</sup>"; $("verdict").innerHTML = "<span>No signal</span>"; $("prime").textContent = "–"; $("primeNote").textContent = "";
  $("why").innerHTML = 'Couldn\'t reach the forecast. Check your connection, then <button class="btn" id="retryBtn" type="button" style="padding:6px 12px;font-size:14px">Try again</button>';
  $("retryBtn").onclick = () => load();
}

/* ───────── Maps on phones: one finger scrolls the page, two fingers move the map ───────── */
const TOUCH = matchMedia("(pointer: coarse)").matches;
const mapOpts = () => ({ zoomControl: true, attributionControl: true, dragging: !TOUCH, tap: false, touchZoom: true });
function twoFingerHint(id) {
  if (!TOUCH) return;
  const el = $(id), hint = el.parentElement.querySelector(".twofinger"); let t = null;
  el.addEventListener("touchmove", e => {
    if (e.touches.length !== 1 || !hint) return;
    hint.classList.add("show"); clearTimeout(t); t = setTimeout(() => hint.classList.remove("show"), 1400);
  }, { passive: true });
}

/* ───────── Add / move a property ───────── */
let PENDING = null, EDITING = null, MAP = null, MARKER = null, LAYERS = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; js.onload = () => res(window.L); js.onerror = rej; document.head.appendChild(js);
  });
}
async function initMap() {
  if (MAP) { setTimeout(() => MAP.invalidateSize(), 50); return; }
  let L; try { L = await loadLeaflet(); } catch (e) { $("mapHint").textContent = "Map couldn't load. Paste coordinates instead."; return; }
  const start = PENDING || EDITING || (PROPS[0] && { lat: PROPS[0].lat, lon: PROPS[0].lon }) || null;
  MAP = L.map("map", mapOpts()).setView(start ? [start.lat, start.lon] : [36.5, -86.5], start ? 15 : 5);
  LAYERS = {
    sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }),
    map: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" })
  };
  LAYERS.sat.addTo(MAP); twoFingerHint("map");
  if (start) setPending(start.lat, start.lon, "pin");
  MAP.on("click", ev => setPending(ev.latlng.lat, ev.latlng.lng, "pin"));
  setTimeout(() => MAP.invalidateSize(), 80);
}
function setLayer(k) {
  if (!MAP) return; Object.values(LAYERS).forEach(l => MAP.removeLayer(l)); LAYERS[k].addTo(MAP);
  $("layerSat").setAttribute("aria-pressed", k === "sat"); $("layerMap").setAttribute("aria-pressed", k === "map");
}
$("layerSat").onclick = () => setLayer("sat"); $("layerMap").onclick = () => setLayer("map");
function setPending(lat, lon, from) {
  PENDING = { lat: +(+lat).toFixed(5), lon: +(+lon).toFixed(5) };
  $("pinned").hidden = false; $("pinnedTxt").textContent = `${PENDING.lat.toFixed(5)}, ${PENDING.lon.toFixed(5)}`;
  $("savePropBtn").disabled = false;
  if (MAP && window.L) {
    const icon = L.divIcon({ className: "", html: '<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 39C15 39 2 22 2 14a13 13 0 0 1 26 0c0 8-13 25-13 25z" fill="#ff6a13" stroke="#14170f" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#14170f"/></svg>', iconSize: [30, 40], iconAnchor: [15, 39] });
    if (!MARKER) { MARKER = L.marker([PENDING.lat, PENDING.lon], { draggable: true, icon }).addTo(MAP); MARKER.on("dragend", () => { const ll = MARKER.getLatLng(); setPending(ll.lat, ll.lng, "drag"); }); }
    else MARKER.setLatLng([PENDING.lat, PENDING.lon]);
    if (from !== "pin" && from !== "drag") MAP.setView([PENDING.lat, PENDING.lon], 16);
    $("mapHint").textContent = "Drag the pin to fine-tune";
  }
}
function openAdd(editProp) {
  EDITING = editProp || null; PENDING = editProp ? { lat: editProp.lat, lon: editProp.lon } : null;
  $("addPanel").hidden = false; $("addTitle").textContent = editProp ? `Move the pin for ${editProp.name}` : "Add your hunting land";
  $("propName").value = editProp ? editProp.name : ""; $("savePropBtn").textContent = editProp ? "Save new location" : "Save property";
  $("savePropBtn").disabled = !PENDING; $("pinned").hidden = !PENDING; if (PENDING) $("pinnedTxt").textContent = `${PENDING.lat.toFixed(5)}, ${PENDING.lon.toFixed(5)}`;
  showTab("map"); renderSampleBanner(); $("jumpScores").hidden = false; $("addPanel").scrollIntoView({ block: "start", behavior: "smooth" });
}
function showTab(k) {
  document.querySelectorAll(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.tab === k ? "true" : "false"));
  document.querySelectorAll(".tabpane").forEach(p => p.hidden = p.dataset.pane !== k);
  if (k === "map") initMap();
}
document.querySelectorAll(".tab").forEach(t => t.onclick = () => showTab(t.dataset.tab));
$("addPropBtn").onclick = () => openAdd(null);
function closeAdd() { $("addPanel").hidden = true; $("jumpScores").hidden = true; renderSampleBanner(); }
$("addClose").onclick = closeAdd;
$("jumpScores").onclick = () => { $("bug").scrollIntoView({ block: "start", behavior: "smooth" }); };
try {
  new IntersectionObserver(es => { es.forEach(e => { if (!$("addPanel").hidden) $("jumpScores").hidden = !e.isIntersecting; }); }, { threshold: 0.15 }).observe($("addPanel"));
} catch (e) {}
$("coordIn").addEventListener("input", () => {
  const v = $("coordIn").value.trim(); if (!v) { $("coordMsg").textContent = ""; return; }
  const c = parseCoords(v);
  if (c) { setPending(c.lat, c.lon, "coords"); $("coordMsg").textContent = "Got it. Name the property below and save."; }
  else $("coordMsg").textContent = "Couldn't read that yet. Try a format like 32.8407, -83.6324.";
});
$("hereBtn").onclick = () => {
  if (!navigator.geolocation) { $("hereMsg").textContent = "Location isn't available in this browser."; return; }
  $("hereMsg").textContent = "Finding you…";
  navigator.geolocation.getCurrentPosition(pos => {
    setPending(pos.coords.latitude, pos.coords.longitude, "gps");
    const acc = Math.round(pos.coords.accuracy || 0); $("hereMsg").textContent = acc ? `Located within ${acc < 1000 ? Math.max(acc, 1) + " m" : (acc / 1000).toFixed(1) + " km"}.` : "Located.";
  }, () => { $("hereMsg").textContent = "Location is off for this site. Turn it on in your browser settings, or drop a pin instead."; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
};
let mapSeq = 0;
$("mapSearch").addEventListener("submit", async e => {
  e.preventDefault(); const q = $("mapQ").value.trim(); if (q.length < 2) return;
  const c = parseCoords(q); if (c) { setPending(c.lat, c.lon, "coords"); return; }
  const seq = ++mapSeq, res = $("mapResults"); res.hidden = false; res.innerHTML = `<div class="note" style="padding:8px">Searching…</div>`;
  try {
    const j = await (await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`)).json(); if (seq !== mapSeq) return;
    const feats = (j.features || []).filter(f => f.geometry && f.properties && f.properties.name);
    if (!feats.length) { res.innerHTML = `<div class="note" style="padding:8px">No match. Try the nearest town plus the state.</div>`; return; }
    res.innerHTML = "";
    feats.forEach(f => {
      const p = f.properties, [lon, lat] = f.geometry.coordinates, b = document.createElement("button"); b.type = "button";
      b.innerHTML = `<span class="txt"><b>${esc(p.name)}</b> <small>${esc([p.county, p.state].filter(Boolean).join(", "))}</small></span><span>›</span>`;
      b.onclick = () => { res.hidden = true; if (MAP) MAP.setView([lat, lon], p.osm_value === "county" ? 10 : 14); $("mapHint").textContent = "Now tap your land to drop a pin"; };
      res.appendChild(b);
    });
  } catch (err) { res.innerHTML = `<div class="note" style="padding:8px">Search needs an internet connection.</div>`; }
});
$("savePropBtn").onclick = () => {
  if (!PENDING) return;
  const name = ($("propName").value.trim() || "My hunting land").slice(0, 40);
  if (EDITING) { Object.assign(EDITING, { lat: PENDING.lat, lon: PENDING.lon, name }); saveProps(); closeAdd(); selectProp(EDITING); toast("Location updated"); return; }
  const p = { id: newId(), name, lat: PENDING.lat, lon: PENDING.lon, rut: "", stands: [] };
  PROPS.push(p); saveProps(); closeAdd(); selectProp(p); toast(`${name} saved`);
  setTimeout(() => { $("addStandBox").open = true; $("standCard").scrollIntoView({ block: "start", behavior: "smooth" }); }, 400);
};

/* ───────── Stand map ───────── */
let SMAP = null, SLAYER = null, SMARKERS = [], SPROP_KEY = "";
async function initStandMap() {
  if (SMAP) return SMAP;
  let L; try { L = await loadLeaflet(); } catch (e) { $("standHint").hidden = false; $("standHint").textContent = "Map couldn't load"; return null; }
  if (SMAP) return SMAP;
  SMAP = L.map("standMap", { ...mapOpts(), scrollWheelZoom: false }); twoFingerHint("standMap");
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }).addTo(SMAP);
  SLAYER = L.layerGroup().addTo(SMAP);
  SMAP.on("click", ev => { if ($("addStandBox").open && !PROP.sample && !PROP.shared) placeNewStand(ev.latlng.lat, ev.latlng.lng); });
  return SMAP;
}
function pinIcon(color, label) {
  return L.divIcon({ className: "standpin", iconSize: [26, 26], iconAnchor: [13, 13],
    html: `<svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" fill="${color}" stroke="#14170f" stroke-width="3"/><circle cx="13" cy="13" r="3" fill="#14170f"/></svg>` });
}
function arrowIcon(bearing) {
  return L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 15],
    html: `<svg width="30" height="30" viewBox="0 0 30 30" style="transform:rotate(${bearing}deg)"><path d="M15 2 L25 24 L15 18 L5 24 Z" fill="#ff6a13" stroke="#14170f" stroke-width="2"/></svg>` });
}
async function renderStandMap() {
  if (!PROP) return;
  const map = await initStandMap(); if (!map || !window.L) return;
  SLAYER.clearLayers(); SMARKERS = [];
  const stands = (PROP.stands || []).filter(s => s.lat != null);
  L.marker([PROP.lat, PROP.lon], { icon: L.divIcon({ className: "", iconSize: [22, 30], iconAnchor: [11, 29], html: '<svg width="22" height="30" viewBox="0 0 30 40"><path d="M15 39C15 39 2 22 2 14a13 13 0 0 1 26 0c0 8-13 25-13 25z" fill="#efe9da" stroke="#14170f" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#14170f"/></svg>' }), interactive: false }).addTo(SLAYER);
  const rated = LAST_RATED || [];
  stands.forEach(st => {
    if (EDIT_STAND && EDIT_STAND.name === st.name) return;
    const r = rated.find(x => x.name === st.name), k = r ? r.check.k : "unknown";
    const tip = destPoint(st.lat, st.lon, st.bearing, 60);
    L.polyline([[st.lat, st.lon], [tip.lat, tip.lon]], { color: HEX[k], weight: 3, opacity: .9, interactive: false }).addTo(SLAYER);
    const m = L.marker([st.lat, st.lon], { icon: pinIcon(HEX[k]) }).addTo(SLAYER);
    m.bindTooltip(st.name, { permanent: true, direction: "top", offset: [0, -12], className: "standtip" });
    if (!PROP.sample && !PROP.shared) m.on("click", () => editStand(st.name));
    SMARKERS.push(m);
  });
  if (NEW_STAND.lat != null) drawNewStand();
  const key = PROP.id + "|" + stands.length;
  if (key !== SPROP_KEY) {
    SPROP_KEY = key;
    const pts = [[PROP.lat, PROP.lon], ...stands.map(s => [s.lat, s.lon])];
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 17 }); else map.setView(pts[0], 16);
  }
  $("mapLegend").hidden = !stands.length;
  const hint = $("standHint");
  if ($("addStandBox").open && !PROP.sample && !PROP.shared) { hint.hidden = false; hint.textContent = NEW_STAND.lat == null ? "Tap to place the stand" : "Drag the arrow tip toward the deer"; }
  else hint.hidden = true;
  setTimeout(() => map.invalidateSize(), 60);
}

/* ───────── Add / edit a stand ───────── */
let NEW_STAND = { lat: null, lon: null, bearing: null }, NEW_LAYER = null, EDIT_STAND = null;
function setBearing(b, from) {
  NEW_STAND.bearing = ((Math.round(b) % 360) + 360) % 360;
  $("dirVal").textContent = `${dirName(NEW_STAND.bearing)} (${NEW_STAND.bearing}°)`;
  $("dirPick").querySelectorAll("button").forEach(x => x.setAttribute("aria-checked", from === "button" && +x.dataset.i * 45 === NEW_STAND.bearing ? "true" : "false"));
  if (from !== "drag" && NEW_STAND.lat != null) drawNewStand();
  checkStandForm();
}
function placeNewStand(lat, lon) {
  NEW_STAND.lat = +lat.toFixed(5); NEW_STAND.lon = +lon.toFixed(5);
  if (NEW_STAND.bearing == null) { const wb = LAST_WIND && LAST_WIND.deg != null ? LAST_WIND.deg : 0; setBearing(wb, "auto"); $("dirVal").textContent += " (suggested: drag to adjust)"; }
  $("placeMsg").textContent = "📍 Stand pinned. Drag it to fine-tune.";
  $("arrowMethod").classList.add("active");
  drawNewStand(); renderStandMapHint(); checkStandForm();
}
function renderStandMapHint() { const h = $("standHint"); h.hidden = false; h.textContent = "Drag the arrow tip toward the deer"; }
function drawNewStand() {
  if (!SMAP || !window.L) return;
  if (NEW_LAYER) SLAYER.removeLayer(NEW_LAYER);
  NEW_LAYER = L.layerGroup().addTo(SLAYER);
  const b = NEW_STAND.bearing ?? 0, tip = destPoint(NEW_STAND.lat, NEW_STAND.lon, b, 70);
  const line = L.polyline([[NEW_STAND.lat, NEW_STAND.lon], [tip.lat, tip.lon]], { color: "#ff6a13", weight: 4, dashArray: "6 6" }).addTo(NEW_LAYER);
  const pin = L.marker([NEW_STAND.lat, NEW_STAND.lon], { draggable: true, icon: pinIcon("#ff6a13") }).addTo(NEW_LAYER);
  const head = L.marker([tip.lat, tip.lon], { draggable: true, icon: arrowIcon(b) }).addTo(NEW_LAYER);
  pin.on("drag", () => { const ll = pin.getLatLng(), t = destPoint(ll.lat, ll.lng, NEW_STAND.bearing ?? 0, 70); head.setLatLng([t.lat, t.lon]); line.setLatLngs([ll, [t.lat, t.lon]]); });
  pin.on("dragend", () => { const ll = pin.getLatLng(); NEW_STAND.lat = +ll.lat.toFixed(5); NEW_STAND.lon = +ll.lng.toFixed(5); });
  head.on("drag", () => {
    const hl = head.getLatLng(), pl = pin.getLatLng(), nb = bearingBetween(pl.lat, pl.lng, hl.lat, hl.lng);
    line.setLatLngs([pl, hl]); head.setIcon(arrowIcon(nb)); setBearing(nb, "drag");
  });
  head.on("dragend", () => drawNewStand());
}
$("dirPick").innerHTML = DIRS.map((d, i) => `<button type="button" role="radio" aria-checked="false" data-i="${i}" aria-label="${DIR_NAMES[i]}">${d}</button>`).join("");
$("dirPick").querySelectorAll("button").forEach(b => b.onclick = () => setBearing(+b.dataset.i * 45, "button"));
const checkStandForm = () => { $("saveStandBtn").disabled = NEW_STAND.bearing == null || !PROP || PROP.sample || PROP.shared; };
$("addStandBox").addEventListener("toggle", () => { renderStandMap(); if ($("addStandBox").open) $("standMapWrap").scrollIntoView({ block: "nearest", behavior: "smooth" }); });
function resetStandForm() {
  NEW_STAND = { lat: null, lon: null, bearing: null }; EDIT_STAND = null; if (NEW_LAYER && SLAYER) { SLAYER.removeLayer(NEW_LAYER); NEW_LAYER = null; }
  $("standName").value = ""; $("dirVal").textContent = "not set"; $("placeMsg").textContent = "Tap the satellite map above. You can drag the pin to fine-tune. Skip this if you'd rather not pin it.";
  $("arrowMethod").classList.remove("active"); $("dirPick").querySelectorAll("button").forEach(x => x.setAttribute("aria-checked", "false"));
  $("saveStandBtn").textContent = "Save stand"; $("cancelStandBtn").hidden = true; stopCompass(); checkStandForm();
}
function editStand(name) {
  const st = (PROP.stands || []).find(s => s.name === name); if (!st) return;
  resetStandForm(); EDIT_STAND = st;
  $("standName").value = st.name; NEW_STAND = { lat: st.lat ?? null, lon: st.lon ?? null, bearing: null };
  setBearing(st.bearing, "edit");
  if (st.lat != null) { $("placeMsg").textContent = "📍 Drag the pin or arrow on the map to change it."; $("arrowMethod").classList.add("active"); }
  $("saveStandBtn").textContent = "Save changes"; $("cancelStandBtn").hidden = false;
  $("addStandBox").open = true; renderStandMap();
}
$("cancelStandBtn").onclick = () => { resetStandForm(); renderStandMap(); };
$("saveStandBtn").onclick = () => {
  if (NEW_STAND.bearing == null || !PROP) return;
  if (PROP.sample || PROP.shared) { toast("Save this property first"); return; }
  const name = ($("standName").value.trim() || `Stand ${(PROP.stands || []).length + 1}`).slice(0, 30);
  const st = { name, bearing: NEW_STAND.bearing }; if (NEW_STAND.lat != null) { st.lat = NEW_STAND.lat; st.lon = NEW_STAND.lon; }
  PROP.stands = (PROP.stands || []).filter(s => s.name !== name && (!EDIT_STAND || s.name !== EDIT_STAND.name)); PROP.stands.push(st); saveProps();
  const wasEdit = !!EDIT_STAND; resetStandForm(); $("addStandBox").open = false; SPROP_KEY = ""; render(); toast(wasEdit ? `${name} updated` : `${name} saved`);
};
function removeStand(name) { PROP.stands = (PROP.stands || []).filter(s => s.name !== name); saveProps(); SPROP_KEY = ""; render(); toast(`${name} removed`); }

/* Phone compass: point the top of the phone toward where deer come from */
let COMPASS = null;
function stopCompass() {
  if (COMPASS) { window.removeEventListener(COMPASS.ev, COMPASS.fn, true); COMPASS = null; }
  $("compassBtn").textContent = "📱 Set from my phone"; $("compassRead").hidden = true;
}
$("compassBtn").onclick = async () => {
  if (COMPASS) { if (COMPASS.last != null) setBearing(COMPASS.last, "compass"); stopCompass(); toast("Direction set from your phone"); return; }
  if (!("DeviceOrientationEvent" in window)) { toast("This device doesn't have a compass. Use the arrow or buttons."); return; }
  try { if (typeof DeviceOrientationEvent.requestPermission === "function") { const r = await DeviceOrientationEvent.requestPermission(); if (r !== "granted") { toast("Compass access was declined."); return; } } } catch (e) {}
  const ev = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
  const fn = e => {
    let h = null;
    if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) h = (360 - e.alpha) % 360;
    if (h == null) return;
    const so = (screen.orientation && screen.orientation.angle) || 0; h = (h + so) % 360;
    COMPASS.last = h; const rd = $("compassRead"); rd.hidden = false; rd.textContent = `${dirShort(h)} ${Math.round(h)}°`;
  };
  COMPASS = { ev, fn, last: null }; window.addEventListener(ev, fn, true);
  $("compassBtn").textContent = "✓ Use this direction"; $("compassRead").hidden = false; $("compassRead").textContent = "Reading compass…";
  setTimeout(() => { if (COMPASS && COMPASS.last == null) { $("compassRead").textContent = "No compass reading. Use the arrow or buttons."; } }, 3000);
};

/* ───────── Rut + manage ───────── */
$("rutBadge").onclick = () => { $("rutSel").scrollIntoView({ block: "center", behavior: "smooth" }); $("rutSel").focus(); };
$("rutSel").onchange = () => { if (!PROP) return; PROP.rut = $("rutSel").value; if (!PROP.sample && !PROP.shared) saveProps(); load({ keepDay: true }); };
$("renameProp").onclick = () => { if (!PROP || PROP.sample) return; openAdd(PROP); showTab("coords"); $("propName").focus(); };
$("moveProp").onclick = () => { if (!PROP || PROP.sample) return; openAdd(PROP); };
$("deleteProp").onclick = () => { if (!PROP || PROP.sample) return; $("deleteConfirm").hidden = false; };
$("deleteYes").onclick = () => {
  PROPS = PROPS.filter(p => p !== PROP); saveProps(); $("deleteConfirm").hidden = true; toast("Property deleted");
  selectProp(PROPS[0] || SAMPLE); if (!PROPS.length) openAdd(null);
};

/* ───────── Shared properties ───────── */
function sharedFromURL() {
  try {
    const q = new URLSearchParams(location.search), code = q.get("p"); if (!code) return null;
    const p = decodeProperty(code); if (!p) return null;
    const day = /^\d{4}-\d{2}-\d{2}$/.test(q.get("d") || "") ? q.get("d") : null;
    return { prop: p, day };
  } catch (e) { return null; }
}
$("sharedSave").onclick = () => {
  if (!SHARED) return;
  const p = { id: newId(), name: SHARED.name, lat: SHARED.lat, lon: SHARED.lon, rut: SHARED.rut || "", stands: SHARED.stands || [] };
  PROPS.push(p); saveProps(); $("sharedBanner").hidden = true; SHARED = null;
  try { history.replaceState(null, "", "/"); } catch (e) {}
  selectProp(p); toast(`${p.name} saved to your properties`);
};
$("sharedDismiss").onclick = () => { $("sharedBanner").hidden = true; };

/* ───────── Share ───────── */
function shareText() {
  const D = MODEL.days[SEL], { w } = primeFor(D), when = D.isToday ? "today" : DL[keyDate(D.key).getUTCDay()];
  const st = (PROP.stands || []).length ? bestStand(PROP.stands, D, w.start ? w : { start: D.legalStart, end: D.legalEnd }) : null;
  const standTxt = st && st.best.check.k !== "bad" ? ` Hunt the ${st.best.name} (${compass(st.wind.deg)} wind).` : "";
  const head = D.rut != null ? `RUT SCORE ${D.rut} · HUNT SCORE ${D.score}` : `HUNT SCORE ${D.score}/10`;
  const vibe = D.rut != null && D.rut >= 7 ? `${RUT[D.summary.rutKey] ? RUT[D.summary.rutKey].name : "Rut"} and ${tierOf(D.score).name.toLowerCase()}` : tierOf(D.score).name;
  return `🦌 ${head} ${when} at ${PROP.name}. ${vibe}!${w.start ? ` Prime ${fmtRange(w.start, w.end)}.` : ""}${standTxt} Who's in?\n${link()}`;
}
const link = () => shareURL(PROP, MODEL ? MODEL.days[SEL] : null, MODEL ? MODEL.tz : "UTC");
function cardBlob() {
  return new Promise(res => {
    try {
      const D = MODEL.days[SEL], t = tierOf(D.score), dt = keyDate(D.key), { w } = primeFor(D);
      const c = document.createElement("canvas"); c.width = 1080; c.height = 1350; const x = c.getContext("2d");
      const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), col = css("--" + t.k);
      x.fillStyle = css("--field"); x.fillRect(0, 0, 1080, 1350); x.fillStyle = css("--panel"); x.fillRect(60, 170, 960, 1000);
      x.strokeStyle = css("--gold"); x.lineWidth = 8; x.beginPath(); x.moveTo(60, 300); x.lineTo(1020, 300); x.stroke();
      x.fillStyle = css("--chalk"); x.font = "900 92px 'Big Shoulders Display',Impact,sans-serif"; x.fillText("RUT", 60, 120); x.fillStyle = css("--gold"); x.fillText("SCORE", 225, 120);
      x.fillStyle = css("--red"); x.fillRect(840, 52, 180, 70); x.fillStyle = "#fff"; x.font = "800 44px 'Barlow Condensed',sans-serif"; x.fillText(DEMO ? "SAMPLE" : "LIVE", 870, 104);
      x.fillStyle = css("--chalk"); x.font = "800 56px 'Barlow Condensed',sans-serif"; x.fillText(PROP.name.toUpperCase().slice(0, 30), 100, 262);
      // left: Rut Score (highlighted)  right: Hunt Score
      x.fillStyle = css("--gold"); x.fillRect(100, 340, 420, 470); x.fillStyle = css("--ink"); x.font = "800 46px 'Barlow Condensed',sans-serif"; x.fillText("RUT SCORE", 130, 400);
      x.font = "900 330px 'Big Shoulders Display',Impact,sans-serif"; x.fillText(D.rut != null ? String(D.rut) : "–", 130, 740);
      x.fillStyle = css("--muted"); x.font = "800 46px 'Barlow Condensed',sans-serif"; x.fillText("HUNT SCORE", 580, 400);
      x.fillStyle = col; x.font = "900 330px 'Big Shoulders Display',Impact,sans-serif"; x.fillText(String(D.score), 580, 740);
      x.fillStyle = col; x.save(); x.translate(100, 860); x.transform(1, 0, -.14, 1, 0, 0); x.fillRect(0, 0, 820, 110); x.restore();
      x.fillStyle = css("--field"); x.font = "900 80px 'Big Shoulders Display',sans-serif"; x.fillText(t.name.toUpperCase(), 130, 945);
      x.fillStyle = css("--muted"); x.font = "700 44px 'Barlow Condensed',sans-serif"; x.fillText(((D.isToday ? "TODAY · " : "") + DL[dt.getUTCDay()] + ", " + MN[dt.getUTCMonth()] + " " + dt.getUTCDate()).toUpperCase(), 100, 1045);
      x.fillStyle = css("--chalk"); x.font = "800 64px 'Big Shoulders Display',sans-serif"; x.fillText(w.start ? "PRIME " + fmtRange(w.start, w.end) : "", 100, 1125);
      x.fillStyle = css("--chalk"); x.fillRect(0, 1230, 1080, 120); x.fillStyle = css("--red"); x.fillRect(0, 1230, 260, 120);
      x.fillStyle = "#fff"; x.font = "900 52px 'Big Shoulders Display',sans-serif"; x.fillText("WHO'S IN?", 28, 1308);
      x.fillStyle = css("--ink"); x.font = "700 44px 'Barlow Condensed',sans-serif"; x.fillText("Get yours at rutscore.com", 300, 1306);
      c.toBlob(b => res(b), "image/png");
    } catch (e) { res(null); }
  });
}
let CARD = { key: "", file: null }, cardTimer = null, SHARING = false;
const cardKey = () => MODEL && PROP ? `${PROP.lat},${PROP.lon}|${PROP.name}|${MODEL.days[SEL].key}|${MODEL.days[SEL].score}|${MODEL.days[SEL].rut}|${DEMO}` : "";
function prepareCard() {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(async () => {
    const k = cardKey(); if (!k || CARD.key === k) return;
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    const b = await cardBlob(); if (b && cardKey() === k) CARD = { key: k, file: new File([b], "rut-score.png", { type: "image/png" }) };
  }, 500);
}
const mobileShare = () => !!navigator.share && matchMedia("(pointer: coarse)").matches;
function fillShareSheet() {
  const text = shareText(), url = link(), msg = text.replace("\n" + url, ""), D = MODEL.days[SEL];
  $("shareText").value = text;
  $("shSms").href = `sms:?&body=${encodeURIComponent(text)}`;
  $("shWa").href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  $("shFb").href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  $("shX").href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(url)}`;
  $("shMail").href = `mailto:?subject=${encodeURIComponent(D.rut != null ? `Rut Score ${D.rut} · Hunt Score ${D.score} at ${PROP.name}` : `Hunt Score ${D.score}/10 at ${PROP.name}`)}&body=${encodeURIComponent(text)}`;
}
function openShareSheet() { fillShareSheet(); const box = $("shareBox"); box.hidden = false; box.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
$("shareBtn").onclick = () => {
  if (!MODEL || SHARING) return;
  if (!mobileShare()) { openShareSheet(); return; }
  const text = shareText(), file = CARD.key === cardKey() ? CARD.file : null;
  let data = { text };
  try { if (file && navigator.canShare && navigator.canShare({ files: [file] })) data = { text, files: [file] }; } catch (e) {}
  SHARING = true; const btn = $("shareBtn"); btn.setAttribute("aria-busy", "true");
  const done = () => { SHARING = false; btn.removeAttribute("aria-busy"); }, guard = setTimeout(done, 15000);
  navigator.share(data)
    .catch(e => { if (e && e.name === "AbortError") return; if (data.files) return navigator.share({ text }).catch(err => { if (!err || err.name !== "AbortError") openShareSheet(); }); openShareSheet(); })
    .finally(() => { clearTimeout(guard); done(); });
};
$("shImg").onclick = async () => {
  if (!MODEL) return;
  const file = CARD.key === cardKey() && CARD.file ? CARD.file : await cardBlob().then(b => b && new File([b], "rut-score.png", { type: "image/png" }));
  if (!file) { toast("Couldn't make the image. Try again."); return; }
  if (mobileShare() && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = `rut-score-${PROP.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};
async function copyText(t, msg) { try { await navigator.clipboard.writeText(t); toast(msg); } catch (e) { $("shareText").value = t; $("shareText").focus(); $("shareText").select(); toast("Selected — press copy"); } }
$("copyBtn").onclick = () => copyText($("shareText").value, "Copied — paste it in your group text");
$("copyLink").onclick = () => copyText(link(), "Link copied");
function toast(m) { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); }

/* ───────── Hunt alerts (web push) ───────── */
const alertsLocal = () => store.get("alerts", []);
const spotKey = p => `${(+p.lat).toFixed(3)},${(+p.lon).toFixed(3)}`;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent), isAndroid = /Android/.test(navigator.userAgent);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
function alertNote(msg) { const n = $("alertNote"); n.hidden = !msg; n.textContent = msg || ""; }
function renderAlerts() {
  if (!PROP) return;
  $("alertSpot").textContent = PROP.name;
  const list = alertsLocal(), mine = list.find(a => a.key === spotKey(PROP));
  $("alertBtn").textContent = mine ? `✓ Alerts on at ${mine.threshold}+ · Update` : "🔔 Turn on alerts";
  if (mine) $("alertThr").value = String(mine.threshold);
  $("alertList").innerHTML = "";
  list.forEach(a => {
    const row = document.createElement("div"); row.innerHTML = `<span>🔔 ${esc(a.name)} · ${a.threshold}+</span>`;
    const off = document.createElement("button"); off.type = "button"; off.textContent = "Turn off"; off.onclick = () => alertOff(a); row.appendChild(off);
    $("alertList").appendChild(row);
  });
  if (PROP.sample) alertNote("Add your own land first, then turn on alerts for it.");
  else if (PREVIEW) alertNote("Alerts work once Rut Score is live at rutscore.com.");
  else if (isIOS && !standalone) alertNote("On iPhone, add Rut Score to your Home Screen first (Share, then Add to Home Screen), then open it from there to turn on alerts.");
  else if (!pushSupported()) alertNote("This browser can't show alerts. Try Chrome, Edge, Firefox, or Safari from your Home Screen.");
  else alertNote("");
}
function b64ToBytes(s) { const p = "=".repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, c => c.charCodeAt(0)); }
async function pushSub() {
  const reg = await navigator.serviceWorker.ready; let sub = await reg.pushManager.getSubscription();
  if (!sub) { const { publicKey } = await (await fetch("/api/alerts")).json(); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }); }
  return sub;
}
$("alertBtn").onclick = async () => {
  if (!PROP || PROP.sample || PREVIEW || !pushSupported() || (isIOS && !standalone)) { renderAlerts(); return; }
  const btn = $("alertBtn"); btn.disabled = true;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { alertNote("Notifications are blocked for this site. Allow them in your browser or phone settings, then try again."); return; }
    const sub = await pushSub(), threshold = +$("alertThr").value;
    const r = await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON(), spot: { name: PROP.name, label: PROP.name, lat: PROP.lat, lon: PROP.lon, rut: PROP.rut || "", code: encodeProperty(PROP) }, threshold }) });
    if (!r.ok) throw new Error("subscribe " + r.status);
    const list = alertsLocal().filter(a => a.key !== spotKey(PROP)); list.unshift({ key: spotKey(PROP), name: PROP.name, lat: PROP.lat, lon: PROP.lon, threshold });
    store.set("alerts", list.slice(0, 10)); toast(`Alerts on for ${PROP.name}`);
  } catch (e) { alertNote("Couldn't turn on alerts right now. Please try again in a minute."); }
  finally { btn.disabled = false; renderAlerts(); }
};
async function alertOff(a) {
  try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) await fetch("/api/alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", subscription: sub.toJSON(), spot: { lat: a.lat, lon: a.lon } }) }); } catch (e) {}
  store.set("alerts", alertsLocal().filter(x => x.key !== a.key)); toast(`Alerts off for ${a.name}`); renderAlerts();
}

/* ───────── Install ("Get the app") ───────── */
let deferred = null;
function installSteps() {
  if (isIOS) return `<ol><li>Tap the <b>Share</b> button at the bottom of Safari: the square with the arrow pointing up.</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol>`;
  if (isAndroid) return `<ol><li>Tap the <b>⋮</b> menu at the top right of Chrome.</li><li>Tap <b>Install app</b> (not "Add to Home screen").</li><li>Tap <b>Install</b>.</li></ol>`;
  return `<ol><li>On your phone, open <b>rutscore.com</b>.</li><li>iPhone: tap Share, then <b>Add to Home Screen</b>. Android: tap ⋮, then <b>Install app</b>.</li><li>On this computer, Chrome and Edge show an install icon at the right end of the address bar.</li></ol>`;
}
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; if (!standalone) $("installBtn").hidden = false; });
window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; $("installTip").hidden = true; toast("Rut Score added to your phone"); });
if (!standalone) $("installBtn").hidden = false;
$("installBtn").onclick = async () => {
  if (deferred) { const d = deferred; deferred = null; d.prompt(); const r = await d.userChoice.catch(() => null); if (r && r.outcome === "accepted") $("installBtn").hidden = true; return; }
  const tip = $("installTip"); $("installSteps").innerHTML = installSteps(); tip.hidden = !tip.hidden;
};
$("installClose").onclick = () => { $("installTip").hidden = true; };
if ("serviceWorker" in navigator && !PREVIEW) navigator.serviceWorker.register(new URL("sw.js", import.meta.url), { scope: "/" }).catch(() => {});

/* ───────── Start ───────── */
const shared = sharedFromURL();
if (shared) {
  const match = PROPS.find(p => Math.abs(p.lat - shared.prop.lat) < 1e-4 && Math.abs(p.lon - shared.prop.lon) < 1e-4);
  if (match) { PROP = match; renderPropSelect(); load({ day: shared.day }); }
  else {
    SHARED = shared.prop; PROP = { ...shared.prop, id: "shared", shared: true };
    $("sharedTxt").textContent = `Someone shared “${SHARED.name}” with you${SHARED.stands.length ? ` (${SHARED.stands.length} stand${SHARED.stands.length > 1 ? "s" : ""})` : ""}.`;
    $("sharedBanner").hidden = false; renderPropSelect(); load({ day: shared.day });
  }
} else {
  const sel = store.get("sel", null), p = PROPS.find(x => x.id === sel) || PROPS[0];
  if (p) selectProp(p); else { PROP = SAMPLE; renderPropSelect(); load(); }
}
checkStandForm();
setInterval(() => { if (PROP && !document.hidden) load({ keepDay: true }); }, 60 * 60 * 1000);
window.__rut = { buildModel };
