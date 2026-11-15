import { CROPS, PARTNER, calendar } from "./landdata.js";

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k, d) { try { const v = localStorage.getItem("rs_" + k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem("rs_" + k, JSON.stringify(v)); } catch {} } };
const num = (v, d = 0) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
const r1 = n => Math.round(n * 10) / 10, r2 = n => Math.round(n * 100) / 100;
const fmt = n => n >= 100 ? Math.round(n).toLocaleString() : r1(n).toLocaleString();
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const TODAY = iso(new Date());
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const nice = s => parse(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const uid = () => Math.random().toString(36).slice(2, 9);
let tt; function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2400); }

/* properties come from Rut Score itself */
const SAMPLE = { id: "sample", name: "Sample land · Middle Georgia", lat: 32.84, lon: -83.63 };
const PROPS = store.get("props", []).filter(p => !p.sample);
const LIST = PROPS.length ? PROPS : [SAMPLE];
const LAND = store.get("land", {});
const saveLand = () => { store.set("land", LAND); scheduleSync(); };
let pid = new URLSearchParams(location.search).get("p") || store.get("landProp", LIST[0].id);
if (!LIST.some(p => p.id === pid)) pid = LIST[0].id;
const prop = () => LIST.find(p => p.id === pid);
const L = () => (LAND[pid] = LAND[pid] || { state: "", plots: [], sites: [], feeders: [] });

/* state data (rut windows) */
let STATES = [];
async function loadStates() { try { STATES = await (await fetch("/land/rut.json")).json(); } catch { STATES = []; } }
function guessState(lat, lon) {
  const boxes = [["GA", 30.3, 35, -85.6, -80.8], ["FL", 24.4, 31, -87.6, -80], ["AL", 30.1, 35, -88.5, -84.9], ["SC", 32, 35.2, -83.4, -78.5], ["TN", 35, 36.7, -90.3, -81.6], ["NC", 33.8, 36.6, -84.3, -75.4], ["MS", 30.1, 35, -91.7, -88.1], ["TX", 25.8, 36.5, -106.7, -93.5], ["OH", 38.4, 42, -84.8, -80.5], ["MI", 41.7, 48.3, -90.4, -82.4], ["PA", 39.7, 42.3, -80.5, -74.7], ["WI", 42.5, 47.1, -92.9, -86.8], ["IL", 36.9, 42.5, -91.5, -87.5], ["IN", 37.8, 41.8, -88.1, -84.8], ["KY", 36.5, 39.1, -89.6, -81.9], ["VA", 36.5, 39.5, -83.7, -75.2], ["MO", 36, 40.6, -95.8, -89.1], ["AR", 33, 36.5, -94.6, -89.6], ["LA", 29, 33, -94, -89], ["IA", 40.4, 43.5, -96.6, -90.1], ["MN", 43.5, 49.4, -97.2, -89.5], ["NY", 40.5, 45, -79.8, -71.9], ["OK", 33.6, 37, -103, -94.4], ["KS", 37, 40, -102.1, -94.6]];
  const b = boxes.find(([, a, b2, c, d]) => lat >= a && lat <= b2 && lon >= c && lon <= d); return b ? b[0] : "";
}

/* ───────── header: property + state ───────── */
function renderHeader() {
  $("#propSel").innerHTML = LIST.map(p => `<option value="${esc(p.id)}"${p.id === pid ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  const st = L().state || guessState(prop().lat, prop().lon);
  $("#stateSel").innerHTML = `<option value="">Choose…</option>` + STATES.map(s => `<option value="${s.abbr}"${s.abbr === st ? " selected" : ""}>${esc(s.name)}</option>`).join("");
  if (!L().state && st) { L().state = st; store.set("land", LAND); }
}
$("#propSel").addEventListener("change", e => { pid = e.target.value; store.set("landProp", pid); renderAll(); });
$("#stateSel").addEventListener("change", e => { L().state = e.target.value; saveLand(); renderCal(); });

/* ───────── tabs ───────── */
let tab = store.get("landTab", "cal");
function setTab(t) { tab = t; store.set("landTab", t); $$(".ltabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.t === t))); ["cal", "seed", "attract", "feeder"].forEach(k => $("#t-" + k).hidden = k !== t); if (t === "attract") loadRain(); }
$(".ltabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setTab(b.dataset.t); });

/* ───────── 1. calendar ───────── */
const frac = (m, d) => (m - 1 + (d - 1) / 31) / 12;
function segs(from, to) { const a = frac(...from), b = frac(...to) + 1 / 12 / 31; return a <= b ? [[a, b]] : [[a, 1], [0, b]]; }
function renderCal() {
  const p = prop(), st = STATES.find(s => s.abbr === L().state), rows = calendar(p.lat);
  const now = new Date(), nf = frac(now.getMonth() + 1, now.getDate());
  if (st && st.win) { const [a, b] = st.win.map(x => x.split("-").map(Number)); rows.splice(5, 0, { k: "rut", label: "Peak rut (typical)", from: a, to: b, color: "var(--red)" }); }
  const active = rows.filter(r => segs(r.from, r.to).some(([a, b]) => nf >= a && nf <= b));
  const soon = rows.filter(r => !active.includes(r) && segs(r.from, r.to).some(([a]) => a > nf && a - nf < 45 / 365));
  $("#t-cal").innerHTML = `
    <h2>Feed & plot calendar</h2>
    <p class="muted">${st ? esc(st.name) : "Choose your state above"} · typical timing for this latitude. Your county extension office has exact planting dates.</p>
    <div class="result"><div class="lbl">Right now</div>${active.length ? active.map(r => `<div>● ${esc(r.label)}</div>`).join("") : "<div>Off-season. Good time to plan and soil-test.</div>"}
      ${soon.length ? `<div class="lbl" style="margin-top:6px">Coming up</div>${soon.map(r => `<div>○ ${esc(r.label)} starts ${new Date(2026, r.from[0] - 1, r.from[1]).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>`).join("")}` : ""}</div>
    <div class="cal"><div class="months">${["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map(m => `<span>${m}</span>`).join("")}</div>
      <div class="calwrap"><div class="now" style="left:${nf * 100}%" title="Today"></div>
      ${rows.map(r => `<div class="bar">${segs(r.from, r.to).map(([a, b]) => `<i style="left:${a * 100}%;width:${(b - a) * 100}%;background:${r.color}"></i>`).join("")}<span>${esc(r.label)}</span></div>`).join("")}</div></div>
    ${st && !st.win ? `<div class="item"><b class="lbl" style="color:var(--chalk)">Rut timing in ${esc(st.name)} varies by area</b>${(st.zones || []).map(([z, w]) => `<div class="ltip"><b>${esc(z)}:</b> ${esc(w)}</div>`).join("")}</div>` : ""}
    <p class="ltip">Protein and minerals in spring and summer feed antler growth and fawning does. Fall plots and attractants pull deer in for the season. After the rut, bucks are worn down, and a reliable food source helps them recover.</p>`;
}

/* ───────── 2. seed calculator ───────── */
const cropBy = k => CROPS.find(c => c[0] === k);
const partnerSeeds = () => (PARTNER?.products || []).filter(x => x.kind === "seed");
function defaultRow(k = "wheat") { const c = cropBy(k); return { crop: k, rate: (c[3] + c[4]) / 2, bag: c[5] }; }
function renderSeed() {
  const l = L(); if (!l.plots.length) { l.plots.push({ id: uid(), name: "Food plot 1", acres: 1, rows: [defaultRow("wheat"), defaultRow("crimson")] }); store.set("land", LAND); }
  const opts = sel => [...partnerSeeds().map((x, i) => `<option value="p${i}"${sel === "p" + i ? " selected" : ""}>${esc(PARTNER.name)}: ${esc(x.name)}</option>`),
    ...CROPS.map(c => `<option value="${c[0]}"${sel === c[0] ? " selected" : ""}>${esc(c[1])} (${c[3] === c[4] ? c[3] : c[3] + "–" + c[4]} lb/ac)</option>`), `<option value="custom"${sel === "custom" ? " selected" : ""}>Other / my bag's rate</option>`].join("");
  $("#t-seed").innerHTML = `<h2>Seed calculator</h2>
    <p class="muted">Pick your plot size and what you're planting. Rates are broadcast pounds per acre from university extension guides. Your bag's label always wins.</p>
    ${l.plots.map(pl => {
      const total = pl.rows.reduce((t, r) => t + pl.acres * r.rate, 0);
      return `<div class="item" data-plot="${pl.id}">
        <div class="ihead"><input data-f="name" value="${esc(pl.name)}" aria-label="Plot name" style="font-weight:700"><button class="x" data-del type="button">Remove</button></div>
        <div class="row3"><label class="f"><span>Acres</span><input data-f="acres" inputmode="decimal" value="${pl.acres}"></label><label class="f"><span>Or length (ft)</span><input data-f="len" inputmode="numeric" placeholder="—" value="${pl.len || ""}"></label><label class="f"><span>× width (ft)</span><input data-f="wid" inputmode="numeric" placeholder="—" value="${pl.wid || ""}"></label></div>
        ${pl.rows.map((r, i) => { const lbs = pl.acres * r.rate, bags = r.bag ? Math.ceil(lbs / r.bag - 1e-9) : 0;
          return `<div class="row3" data-row="${i}"><label class="f" style="grid-column:1/-1"><span>Seed ${i + 1}</span><select data-r="crop">${opts(r.crop)}</select></label>
            <label class="f"><span>Lb / acre</span><input data-r="rate" inputmode="decimal" value="${r.rate}"></label><label class="f"><span>Bag size (lb)</span><input data-r="bag" inputmode="decimal" value="${r.bag}"></label>
            <div class="f"><span>You need</span><b style="font-size:18px">${fmt(lbs)} lb</b><span style="text-transform:none;letter-spacing:0">${bags} bag${bags === 1 ? "" : "s"} <button class="x" data-rmrow="${i}" type="button">remove</button></span></div></div>`; }).join("")}
        <button class="add" data-addrow type="button">+ Add a seed to this blend</button>
        <div class="result"><div class="lbl">Total for ${fmt(pl.acres)} acre${pl.acres === 1 ? "" : "s"}</div><div class="big">${fmt(total)}<small> lb of seed</small></div></div>
      </div>`; }).join("")}
    <button class="add" id="addPlot" type="button">+ Add another plot</button>
    <p class="ltip">Clover often comes coated, so you need more product than the pure-seed rate. Plant big seed (grains, peas) ½–1 inch deep and small seed (clover, brassicas) no deeper than ¼ inch.</p>`;
}
$("#t-seed").addEventListener("change", seedInput); $("#t-seed").addEventListener("input", e => { if (e.target.matches("input")) seedInput(e, true); });
function seedInput(e, typing) {
  const card = e.target.closest("[data-plot]"); if (!card) return;
  const pl = L().plots.find(x => x.id === card.dataset.plot), f = e.target.dataset.f, rf = e.target.dataset.r;
  if (f === "name") pl.name = e.target.value.slice(0, 40);
  if (f === "acres") { pl.acres = Math.max(0, num(e.target.value)); pl.len = pl.wid = ""; }
  if (f === "len" || f === "wid") { pl[f] = num(e.target.value) || ""; if (pl.len && pl.wid) pl.acres = r2(pl.len * pl.wid / 43560); }
  if (rf) {
    const i = +e.target.closest("[data-row]").dataset.row, row = pl.rows[i];
    if (rf === "crop") { const v = e.target.value;
      if (v.startsWith("p")) { const x = partnerSeeds()[+v.slice(1)]; Object.assign(row, { crop: v, rate: x.rate, bag: x.bag }); }
      else if (v === "custom") row.crop = "custom"; else Object.assign(row, defaultRow(v)); }
    else row[rf] = Math.max(0, num(e.target.value));
  }
  store.set("land", LAND);
  if (!typing || f === "len" || f === "wid" || f === "acres" || rf) { const a = document.activeElement, sel = a && a.dataset && (a.dataset.f || a.dataset.r), card2 = a && a.closest && a.closest("[data-plot]"), row2 = a && a.closest && a.closest("[data-row]"); renderSeed();
    if (typing && sel) { const q = `[data-plot="${card2.dataset.plot}"] ${row2 ? `[data-row="${row2.dataset.row}"] ` : ""}[data-${a.dataset.f ? "f" : "r"}="${sel}"]`; const n = $(q); if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch {} } } }
}
$("#t-seed").addEventListener("click", e => {
  const card = e.target.closest("[data-plot]"), l = L();
  if (e.target.id === "addPlot") { l.plots.push({ id: uid(), name: `Food plot ${l.plots.length + 1}`, acres: 1, rows: [defaultRow("wheat")] }); saveLand(); renderSeed(); return; }
  if (!card) return; const pl = l.plots.find(x => x.id === card.dataset.plot);
  if (e.target.matches("[data-del]")) { if (confirm(`Remove ${pl.name}?`)) { l.plots = l.plots.filter(x => x !== pl); saveLand(); renderSeed(); } }
  if (e.target.matches("[data-addrow]")) { pl.rows.push(defaultRow("whiteclover")); saveLand(); renderSeed(); }
  if (e.target.dataset.rmrow != null) { pl.rows.splice(+e.target.dataset.rmrow, 1); if (!pl.rows.length) pl.rows.push(defaultRow()); saveLand(); renderSeed(); }
});

/* ───────── 3. attractant + rain refresher ───────── */
let RAIN = null; // { pid, days: {date: inches}, today }
async function loadRain(force) {
  const p = prop(), key = `rain_${p.lat.toFixed(2)}_${p.lon.toFixed(2)}`, cache = store.get(key, null);
  if (!force && cache && Date.now() - cache.at < 3600e3) { RAIN = { pid, ...cache }; renderAttract(); return; }
  if (!RAIN || RAIN.pid !== pid) { RAIN = null; renderAttract(); }
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&daily=precipitation_sum&past_days=45&forecast_days=7&timezone=auto&precipitation_unit=inch`;
    const j = await (await fetch(u)).json(), days = {};
    j.daily.time.forEach((d, i) => days[d] = j.daily.precipitation_sum[i] || 0);
    const v = { at: Date.now(), days, today: j.daily.time[45] || TODAY }; store.set(key, v); RAIN = { pid, ...v };
  } catch { RAIN = { pid, error: true }; }
  renderAttract();
}
function rainSince(laid) {
  if (!RAIN || !RAIN.days) return null;
  const today = RAIN.today || TODAY; let sum = 0, known = true;
  if (daysBetween(laid, today) > 44) known = false;
  for (const [d, v] of Object.entries(RAIN.days)) if (d > laid && d <= today) sum += v;
  let ahead = 0, aheadTo = null; for (const [d, v] of Object.entries(RAIN.days)) if (d > today && daysBetween(today, d) <= 3) { ahead += v; if (v >= 0.05) aheadTo = d; }
  return { sum: r2(sum), known, ahead: r2(ahead), aheadTo };
}
const partnerAtt = () => (PARTNER?.products || []).filter(x => x.kind === "attractant");
function renderAttract() {
  const l = L(); if (!l.sites.length) { l.sites.push({ id: uid(), name: "Site 1", product: "", lbs: 5, bag: 20, laid: TODAY, limit: 1 }); store.set("land", LAND); }
  const cards = l.sites.map(s => {
    const r = rainSince(s.laid), pct = r ? Math.min(1, r.sum / (s.limit || 1)) : 0;
    const status = !r ? (RAIN && RAIN.error ? "Rain data unavailable" : "Checking rain…") : !r.known ? "Put out over 6 weeks ago: refresh" : pct >= 1 ? "Refresh now" : pct >= .5 ? "Getting thin" : "Fresh";
    const col = !r ? "var(--muted)" : !r.known || pct >= 1 ? "var(--bad)" : pct >= .5 ? "var(--fair)" : "var(--good)";
    return `<div class="item" data-site="${s.id}">
      <div class="ihead"><input data-a="name" value="${esc(s.name)}" aria-label="Site name" style="font-weight:700"><button class="x" data-del type="button">Remove</button></div>
      <div class="status" style="color:${col}">${status}</div>
      ${r && r.known ? `<div class="meter" aria-label="${r.sum} of ${s.limit} inches"><i style="width:${pct * 100}%;background:${col}"></i></div>
        <div>${r.sum}″ of rain since you put it out ${s.laid === TODAY ? "today" : nice(s.laid)} · refresh at ${s.limit}″</div>
        ${r.ahead >= 0.1 ? `<div class="ltip">🌧 About ${r.ahead}″ more on the way in the next 3 days.${pct >= .5 ? ` Hold off and refresh after it passes, around ${nice(r.aheadTo)}.` : ""}</div>` : ""}` : ""}
      <div class="row2"><label class="f"><span>Put out on</span><input type="date" data-a="laid" value="${s.laid}" max="${TODAY}"></label><label class="f"><span>Refresh after (in)</span><input data-a="limit" inputmode="decimal" value="${s.limit}"></label></div>
      <div class="row3">${partnerAtt().length ? `<label class="f" style="grid-column:1/-1"><span>Product</span><select data-a="pick"><option value="">Other</option>${partnerAtt().map((x, i) => `<option value="${i}"${s.product === x.name ? " selected" : ""}>${esc(PARTNER.name)}: ${esc(x.name)}</option>`).join("")}</select></label>` : `<label class="f" style="grid-column:1/-1"><span>Product</span><input data-a="product" value="${esc(s.product)}" placeholder="What you put out"></label>`}
        <label class="f"><span>Lb per refresh</span><input data-a="lbs" inputmode="decimal" value="${s.lbs}"></label><label class="f"><span>Bag size (lb)</span><input data-a="bag" inputmode="decimal" value="${s.bag}"></label>
        <div class="f"><span>Per refresh</span><b>${s.bag ? r1(s.lbs / s.bag) : "–"} bag${s.bag && s.lbs / s.bag === 1 ? "" : "s"}</b></div></div>
      <button class="btn" data-fresh type="button">✅ I refreshed it today</button>
    </div>`;
  }).join("");
  const due = l.sites.filter(s => { const r = rainSince(s.laid); return r && (!r.known || r.sum >= s.limit); }).length;
  const lbs = l.sites.reduce((t, s) => t + num(s.lbs), 0);
  $("#t-attract").innerHTML = `<h2>Attractant & rain refresher</h2>
    <p class="muted">Rain washes attractant out. Log when you put it out and we track the rain at ${esc(prop().name)}, so you know when it's time to refresh.</p>
    <div class="result"><div class="lbl">${l.sites.length} site${l.sites.length === 1 ? "" : "s"}</div><div class="big">${due}<small> need${due === 1 ? "s" : ""} a refresh</small></div><div class="muted">One round of refreshes takes about ${fmt(lbs)} lb.</div></div>
    ${cards}<button class="add" id="addSite" type="button">+ Add a site</button>
    <p class="ltip">Not sure when to refresh? Many hunters use about an inch of rain as the cue. Check your product's label and adjust "Refresh after" to match.</p>`;
}
$("#t-attract").addEventListener("change", e => {
  const card = e.target.closest("[data-site]"); if (!card) return; const s = L().sites.find(x => x.id === card.dataset.site), a = e.target.dataset.a;
  if (a === "name" || a === "product") s[a] = e.target.value.slice(0, 40);
  if (a === "laid" && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) s.laid = e.target.value > TODAY ? TODAY : e.target.value;
  if (a === "limit") s.limit = Math.max(0.1, num(e.target.value, 1));
  if (a === "lbs" || a === "bag") s[a] = Math.max(0, num(e.target.value));
  if (a === "pick") { const x = partnerAtt()[+e.target.value]; if (x) Object.assign(s, { product: x.name, lbs: x.rate, bag: x.bag }); else s.product = ""; }
  saveLand(); renderAttract();
});
$("#t-attract").addEventListener("click", e => {
  const l = L();
  if (e.target.id === "addSite") { l.sites.push({ id: uid(), name: `Site ${l.sites.length + 1}`, product: "", lbs: 5, bag: 20, laid: TODAY, limit: 1 }); saveLand(); renderAttract(); return; }
  const card = e.target.closest("[data-site]"); if (!card) return; const s = l.sites.find(x => x.id === card.dataset.site);
  if (e.target.matches("[data-fresh]")) { s.laid = TODAY; saveLand(); renderAttract(); toast(`${s.name} refreshed. Rain clock reset.`); }
  if (e.target.matches("[data-del]") && confirm(`Remove ${s.name}?`)) { l.sites = l.sites.filter(x => x !== s); saveLand(); renderAttract(); }
});

/* ───────── 4. spin feeder planner ───────── */
function feederMath(f) {
  const perDay = num(f.secs) * num(f.spins) * num(f.rate), days = perDay > 0 ? num(f.cap) / perDay : Infinity;
  const empty = isFinite(days) ? iso(new Date(parse(f.filled).getTime() + Math.floor(days) * 864e5)) : null;
  const left = empty ? daysBetween(TODAY, empty) : Infinity;
  const tot = f.mix.reduce((t, m) => t + num(m.pct), 0) || 1;
  const mix = f.mix.map(m => { const share = num(m.pct) / tot, fill = num(f.cap) * share, wk = perDay * 7 * share; return { ...m, fill, wk, bags: m.bag ? Math.ceil(fill / m.bag - 1e-9) : 0 }; });
  return { perDay, days, empty, left, mix };
}
function renderFeeder() {
  const l = L(); if (!l.feeders.length) { l.feeders.push({ id: uid(), name: "Feeder 1", cap: 250, secs: 5, spins: 2, rate: 0.25, filled: TODAY, mix: [{ name: "Corn", pct: 70, bag: 50 }, { name: "Protein", pct: 30, bag: 40 }] }); store.set("land", LAND); }
  $("#t-feeder").innerHTML = `<h2>Spin feeder planner</h2>
    <p class="muted">Set your mix and timer. We'll tell you how much it throws, when it runs empty and what to buy to refill it.</p>
    ${l.feeders.map(f => { const m = feederMath(f), col = m.left <= 2 ? "var(--bad)" : m.left <= 7 ? "var(--fair)" : "var(--good)";
      return `<div class="item" data-feeder="${f.id}">
        <div class="ihead"><input data-g="name" value="${esc(f.name)}" aria-label="Feeder name" style="font-weight:700"><button class="x" data-del type="button">Remove</button></div>
        <div class="result"><div class="status" style="color:${col}">${!m.empty ? "Set your timer" : m.left < 0 ? `Ran empty about ${nice(m.empty)}` : m.left === 0 ? "Runs empty today" : `Runs empty ${nice(m.empty)} (${m.left} day${m.left === 1 ? "" : "s"})`}</div>
          <div class="big">${fmt(m.perDay)}<small> lb a day</small></div><div class="muted">${isFinite(m.days) ? `A full feeder lasts about ${Math.floor(m.days)} days` : ""}</div></div>
        <div class="row3"><label class="f"><span>Holds (lb)</span><input data-g="cap" inputmode="decimal" value="${f.cap}"></label><label class="f"><span>Feedings / day</span><input data-g="spins" inputmode="decimal" value="${f.spins}"></label><label class="f"><span>Seconds each</span><input data-g="secs" inputmode="decimal" value="${f.secs}"></label></div>
        <div class="row2"><label class="f"><span>Throws (lb / second)</span><input data-g="rate" inputmode="decimal" value="${f.rate}"></label><label class="f"><span>Last filled</span><input type="date" data-g="filled" value="${f.filled}" max="${TODAY}"></label></div>
        <p class="ltip">Throw rate varies by feeder. To measure yours, run it for 10 seconds into a bucket, weigh it, and divide by 10.</p>
        <div class="lbl">Mix</div>
        ${m.mix.map((x, i) => `<div class="row3" data-mix="${i}"><label class="f"><span>Feed</span><input data-m="name" value="${esc(x.name)}"></label><label class="f"><span>% of mix</span><input data-m="pct" inputmode="decimal" value="${x.pct}"></label><label class="f"><span>Bag (lb)</span><input data-m="bag" inputmode="decimal" value="${x.bag}"></label>
          <div class="f" style="grid-column:1/-1"><span style="text-transform:none;letter-spacing:0">To fill: <b>${fmt(x.fill)} lb</b> (${x.bags} bag${x.bags === 1 ? "" : "s"}) · uses ${fmt(x.wk)} lb a week ${f.mix.length > 1 ? `<button class="x" data-rmmix="${i}" type="button">remove</button>` : ""}</span></div></div>`).join("")}
        <button class="add" data-addmix type="button">+ Add a feed to the mix</button>
        <button class="btn" data-filled type="button">✅ I filled it today</button>
      </div>`; }).join("")}
    <button class="add" id="addFeeder" type="button">+ Add a feeder</button>`;
}
$("#t-feeder").addEventListener("change", e => {
  const card = e.target.closest("[data-feeder]"); if (!card) return; const f = L().feeders.find(x => x.id === card.dataset.feeder), g = e.target.dataset.g, mm = e.target.dataset.m;
  if (g === "name") f.name = e.target.value.slice(0, 40);
  else if (g === "filled" && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) f.filled = e.target.value > TODAY ? TODAY : e.target.value;
  else if (g) f[g] = Math.max(0, num(e.target.value));
  if (mm) { const x = f.mix[+e.target.closest("[data-mix]").dataset.mix]; x[mm] = mm === "name" ? e.target.value.slice(0, 30) : Math.max(0, num(e.target.value)); }
  saveLand(); renderFeeder();
});
$("#t-feeder").addEventListener("click", e => {
  const l = L();
  if (e.target.id === "addFeeder") { l.feeders.push({ id: uid(), name: `Feeder ${l.feeders.length + 1}`, cap: 250, secs: 5, spins: 2, rate: 0.25, filled: TODAY, mix: [{ name: "Corn", pct: 100, bag: 50 }] }); saveLand(); renderFeeder(); return; }
  const card = e.target.closest("[data-feeder]"); if (!card) return; const f = l.feeders.find(x => x.id === card.dataset.feeder);
  if (e.target.matches("[data-filled]")) { f.filled = TODAY; saveLand(); renderFeeder(); toast(`${f.name} marked full.`); }
  if (e.target.matches("[data-addmix]")) { f.mix.push({ name: "Protein", pct: 20, bag: 40 }); saveLand(); renderFeeder(); }
  if (e.target.dataset.rmmix != null) { f.mix.splice(+e.target.dataset.rmmix, 1); saveLand(); renderFeeder(); }
  if (e.target.matches("[data-del]") && confirm(`Remove ${f.name}?`)) { l.feeders = l.feeders.filter(x => x !== f); saveLand(); renderFeeder(); }
});

/* ───────── rain + refill alerts ───────── */
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const b64 = s => { const p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
function items() {
  const out = [];
  for (const p of LIST) { if (p.sample) continue; const l = LAND[p.id]; if (!l) continue;
    (l.sites || []).forEach(s => out.push({ type: "rain", key: s.id, name: s.name, prop: p.name, lat: +p.lat.toFixed(3), lon: +p.lon.toFixed(3), laid: s.laid, limit: s.limit }));
    (l.feeders || []).forEach(f => { const m = feederMath(f); if (m.empty) out.push({ type: "feeder", key: f.id, name: f.name, prop: p.name, empty: m.empty }); }); }
  return out.slice(0, 40);
}
function renderAlerts() {
  const on = store.get("landAlerts", false);
  $("#lAlertBtn").textContent = on ? "🔕 Turn off land alerts" : "🔔 Turn on land alerts";
  $("#lAlertNote").textContent = PROPS.length === 0 ? "Add your land in Rut Score first, then come back here." : isIOS && !standalone ? "On iPhone, alerts work once Rut Score is on your Home Screen. Open Rut Score and tap Get the app." : on ? `On for ${items().length} site${items().length === 1 ? "" : "s"} and feeder${items().length === 1 ? "" : "s"}.` : "";
}
let syncT; function scheduleSync() { if (!store.get("landAlerts", false)) return; clearTimeout(syncT); syncT = setTimeout(() => sync(false), 1200); }
async function sub() { const reg = await navigator.serviceWorker.ready; let s = await reg.pushManager.getSubscription(); if (!s) { const { publicKey } = await (await fetch("/api/alerts")).json(); s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) }); } return s; }
async function sync(confirm) {
  try { const s = await sub(); const r = await fetch("/api/land-alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync", subscription: s.toJSON(), items: items(), confirm, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) }); if (!r.ok) throw 0; }
  catch { if (confirm) { store.set("landAlerts", false); renderAlerts(); toast("Couldn't turn on alerts. Try again."); } }
}
$("#lAlertBtn").addEventListener("click", async () => {
  if (store.get("landAlerts", false)) { store.set("landAlerts", false); renderAlerts(); try { const s = await sub(); await fetch("/api/land-alerts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "off", subscription: s.toJSON() }) }); } catch {} toast("Land alerts off"); return; }
  if (!PROPS.length) { location.href = "/?add=1"; return; }
  if (!pushOK() || (isIOS && !standalone)) { renderAlerts(); return; }
  if (await Notification.requestPermission() !== "granted") { $("#lAlertNote").textContent = "Notifications are blocked. Allow them in your settings, then try again."; return; }
  store.set("landAlerts", true); renderAlerts(); await sync(true); toast("Land alerts on");
});

/* ───────── boot ───────── */
function renderAll() { renderHeader(); renderCal(); renderSeed(); renderAttract(); renderFeeder(); renderAlerts(); setTab(tab); }
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => {});
loadStates().then(renderAll);
