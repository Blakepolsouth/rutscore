/* Rut Score engine — Hunt Score (deer movement) and Rut Score (rut intensity) shared by the app and the alert server. No DOM access. */

/* ───────── Sun & moon (after Agafonkin's SunCalc, BSD) ───────── */
const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
const toDays = ms => ms / dayMs - 0.5 + J1970 - J2000;
const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const alt = (H, phi, d) => Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
const sid = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
function sunCoords(d) { const M = rad * (357.5291 + 0.98560028 * d); const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)); const L = M + C + rad * 102.9372 + Math.PI; return { dec: dec(L, 0), ra: ra(L, 0) }; }
function moonCoords(d) { const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d); const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dist = 385001 - 20905 * Math.cos(M); return { ra: ra(l, b), dec: dec(l, b), dist }; }
function sunAlt(ms, lat, lon) { const d = toDays(ms), c = sunCoords(d); return alt(sid(d, rad * -lon) - c.ra, rad * lat, c.dec) / rad; }
function moonAlt(ms, lat, lon) { const d = toDays(ms), c = moonCoords(d); return alt(sid(d, rad * -lon) - c.ra, rad * lat, c.dec) / rad; }
export function moonPhase(ms) {
  const d = toDays(ms), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI };
}
export function phaseName(p) {
  if (p < .035 || p > .965) return "New moon"; if (p < .215) return "Waxing crescent"; if (p < .285) return "First quarter";
  if (p < .465) return "Waxing gibbous"; if (p < .535) return "Full moon"; if (p < .715) return "Waning gibbous";
  if (p < .785) return "Last quarter"; return "Waning crescent";
}
export function dayEvents(startMs, lat, lon, hours) {
  const step = 5 * 60000, n = (hours || 24) * 12, ev = { majors: [], minors: [], sunrise: null, sunset: null };
  let pm = null, ps = null, max = { a: -99, t: 0, i: 0 }, min = { a: 99, t: 0, i: 0 };
  for (let i = 0; i <= n; i++) {
    const t = startMs + i * step, m = moonAlt(t, lat, lon), s = sunAlt(t, lat, lon);
    if (m > max.a) max = { a: m, t, i }; if (m < min.a) min = { a: m, t, i };
    if (pm !== null && (pm < 0) !== (m < 0)) { const f = pm / (pm - m); ev.minors.push({ t: t - step + f * step, kind: m > 0 ? "Moonrise" : "Moonset" }); }
    if (ps !== null) { const h = -0.833; if (ps < h && s >= h) ev.sunrise = t - step + ((h - ps) / (s - ps)) * step; if (ps >= h && s < h) ev.sunset = t - step + ((ps - h) / (ps - s)) * step; }
    pm = m; ps = s;
  }
  if (max.i > 0 && max.i < n) ev.majors.push({ t: max.t, kind: "Moon overhead" });
  if (min.i > 0 && min.i < n) ev.majors.push({ t: min.t, kind: "Moon underfoot" });
  ev.majors.sort((a, b) => a.t - b.t); return ev;
}

/* ───────── Time zones ───────── */
const FMT = {};
export function parts(ms, tz) {
  let f = FMT[tz];
  if (!f) {
    try { f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
    catch (err) { f = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
    FMT[tz] = f;
  }
  const o = {}; f.formatToParts(new Date(ms)).forEach(x => o[x.type] = x.value);
  return { key: `${o.year}-${o.month}-${o.day}`, hr: (+o.hour) % 24, min: +o.minute };
}
export function tzShort(tz, ms) {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(ms || Date.now())).find(p => p.type === "timeZoneName").value; }
  catch (e) { return ""; }
}
export function fmtT(ms, tz, short) {
  const pt = parts(ms, tz); let h = pt.hr, m = pt.min; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return short ? (m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`) + (short === "ap" ? ap[0].toLowerCase() : "") : `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
export function fmtRange(a, b, tz) {
  const d1 = parts(a, tz), d2 = parts(b, tz), ap1 = d1.hr >= 12, ap2 = d2.hr >= 12;
  const part = d => { const h = d.hr % 12 || 12, m = d.min; return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`; };
  return ap1 === ap2 ? `${part(d1)}–${part(d2)} ${ap2 ? "PM" : "AM"}` : `${part(d1)} ${ap1 ? "PM" : "AM"}–${part(d2)} ${ap2 ? "PM" : "AM"}`;
}
export const DN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const keyDate = k => new Date(k + "T12:00:00Z");
export const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const DIR_NAMES = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
export const compass = d => d == null ? "" : DIRS[Math.round(d / 45) % 8];
export const inHg = hpa => (hpa * 0.02953).toFixed(2);

/* ───────── Rut ───────── */
export const RUT = {
  pre: { name: "Pre-rut", short: "Pre-rut", bonus: .5, midday: .08, note: "Bucks are making scrapes and rubs and starting to cruise." },
  chasing: { name: "Seeking & chasing", short: "Chasing", bonus: 1.1, midday: .3, note: "Bucks are on their feet looking for does, often in daylight. Sit all day if you can." },
  peak: { name: "Peak breeding", short: "Breeding", bonus: .8, midday: .22, note: "Bucks are locked down with does. Movement is spotty but big bucks can show up any time." },
  post: { name: "Post-rut", short: "Post-rut", bonus: .25, midday: .06, note: "Worn-out bucks focus on food. Hunt food sources in the evening." },
  none: { name: "No rut", short: "No rut", bonus: 0, midday: 0, note: "Deer follow food and bedding patterns. Dawn and dusk are everything." }
};
/* Rough northern rut calendar by date. The South varies county to county, so we ask instead of guessing. */
export function rutEstimate(lat, dateKey) {
  if (lat < 35) return null;
  const [, m, d] = dateKey.split("-").map(Number), md = m * 100 + d;
  if (md >= 1015 && md < 1101) return "pre";
  if (md >= 1101 && md < 1112) return "chasing";
  if (md >= 1112 && md < 1122) return "peak";
  if (md >= 1122 && md <= 1231) return "post";
  return "none";
}

/* Rut Score 1-10: how hot the rut is. Uses the date within the northern calendar when estimating,
   or the hunter's chosen phase. A cold snap during the rut adds a point. Returns null when unknown. */
export function rutScore(rutKey, estimated, dateKey, dT) {
  if (!rutKey) return null;
  let v;
  if (estimated) {
    const [, m, d] = dateKey.split("-").map(Number), md = m * 100 + d;
    const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
    const day = (mm, dd) => (mm === 10 ? dd : mm === 11 ? 31 + dd : mm === 12 ? 61 + dd : 0), x = day(m, d);
    if (md >= 1015 && md < 1101) v = lerp(4, 6.5, (x - 15) / 16);
    else if (md >= 1101 && md < 1112) v = x <= day(11, 8) ? lerp(8, 10, (x - day(11, 1)) / 7) : lerp(10, 8.5, (x - day(11, 8)) / 3);
    else if (md >= 1112 && md < 1122) v = lerp(8, 6.5, (x - day(11, 12)) / 10);
    else if (md >= 1122 && md <= 1231) { v = lerp(4.5, 2.5, (x - day(11, 22)) / 39); if (md >= 1205 && md <= 1215) v = Math.max(v, 5); }
    else v = 1;
  } else v = { pre: 5, chasing: 9, peak: 7, post: 3, none: 1 }[rutKey] || 1;
  if (rutKey !== "none" && rutKey !== "post" && dT <= -8) v += 1;
  return Math.round(clamp(v, 1, 10));
}
export function rutTier(v) {
  if (v == null) return { name: "Set your rut", c: "var(--muted)" };
  if (v >= 9) return { name: "Red hot", c: "var(--gold)" };
  if (v >= 7) return { name: "Heating up", c: "var(--gold)" };
  if (v >= 4) return { name: "Building", c: "var(--fair)" };
  if (v >= 2) return { name: "Winding down", c: "var(--muted)" };
  return { name: "Off season", c: "var(--muted)" };
}

/* ───────── Scoring ───────── */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function avg(a) { a = a.filter(v => v != null && !isNaN(v)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function circAvg(a) { a = a.filter(v => v != null); if (!a.length) return null; let s = 0, c = 0; a.forEach(d => { s += Math.sin(d * rad); c += Math.cos(d * rad); }); return (Math.atan2(s, c) / rad + 360) % 360; }
export const angDiff = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };
function pScore(dp3) { if (dp3 >= 0.5 && dp3 <= 2) return 1; if (dp3 > 2) return .8; if (dp3 > -0.5) return .65; if (dp3 >= -2) return .75; return .45; }
function wScore(w) { if (w < 2) return .7; if (w <= 10) return 1; if (w <= 15) return .7; if (w <= 20) return .4; return .15; }
function rScore(pr, code) { if (code >= 95) return .1; if (pr > 0.1) return .35; if (pr > 0.01) return .75; return 1; }
function tempScore(dT, tmax) { let s = dT <= -10 ? 1 : dT <= -4 ? .85 : dT < 4 ? .65 : dT < 10 ? .45 : .3; if (tmax > 80) s *= .85; return s; }
function lightScore(t, ev, rut) {
  const near = [ev.sunrise, ev.sunset].filter(x => x != null).map(x => Math.abs(t - x) / 60000);
  const d = near.length ? Math.min(...near) : 999;
  if (d <= 90) return 1 - .3 * d / 90;
  return .32 + (rut ? rut.midday : 0);
}
function sScore(t, ev) {
  const v = [];
  ev.majors.forEach(m => { const d = Math.abs(t - m.t) / 60000; if (d <= 60) v.push(1 - .4 * d / 60); });
  ev.minors.forEach(m => { const d = Math.abs(t - m.t) / 60000; if (d <= 40) v.push(.75 - .3 * d / 40); });
  return v.length ? Math.max(...v) : .2;
}
const phaseScore = p => Math.abs(Math.cos(2 * Math.PI * p));
export const TIERS = { good: "var(--good)", fair: "var(--fair)", tough: "var(--tough)", bad: "var(--bad)" };
export function tierOf(s) {
  if (s >= 7) return { k: "good", c: TIERS.good, name: s >= 9 ? "Get in the stand" : "Good movement" };
  if (s >= 5) return { k: "fair", c: TIERS.fair, name: "Fair movement" };
  if (s >= 3) return { k: "tough", c: TIERS.tough, name: "Slow movement" };
  return { k: "bad", c: TIERS.bad, name: "Stay home" };
}
export const grade = v => v >= .85 ? "A" : v >= .7 ? "B" : v >= .5 ? "C" : v >= .3 ? "D" : "F";
export const gradeTier = v => v >= .7 ? TIERS.good : v >= .5 ? TIERS.fair : v >= .3 ? TIERS.tough : TIERS.bad;

/* Stand check: `bearing` = compass direction (0-359°) deer come from, looking out from the stand.
   Wind that blows from the deer toward you carries your scent behind you. */
export function standWind(bearing, windDeg, windMph) {
  if (windDeg == null) return { k: "unknown", ok: .5, label: "No wind data" };
  if (windMph != null && windMph < 2) return { k: "swirl", ok: .45, label: "Calm and swirling: risky" };
  const d = angDiff(windDeg, bearing);
  if (d <= 50) return { k: "good", ok: 1 - d / 200, label: "Good wind: your scent blows away from the deer" };
  if (d <= 100) return { k: "cross", ok: .6 - (d - 50) / 250, label: "Crosswind: OK, watch your downwind side" };
  return { k: "bad", ok: .1, label: "Bad wind: deer will smell you coming" };
}

/* Build the 7-day model. h = Open-Meteo hourly (unix seconds). opts.rut = key from RUT or null (estimate) */
export function buildModel(h, tz, place, opts) {
  opts = opts || {}; const now = opts.now || Date.now();
  const H = h.time.map((t, i) => {
    const ms = t * 1000, pt = parts(ms, tz);
    return {
      key: pt.key, hr: pt.hr, ms,
      p: h.pressure_msl[i], w: h.wind_speed_10m[i], wd: h.wind_direction_10m ? h.wind_direction_10m[i] : null, g: h.wind_gusts_10m ? h.wind_gusts_10m[i] : null,
      c: h.cloud_cover[i], pr: h.precipitation[i] || 0, code: h.weather_code[i] || 0, tmp: h.temperature_2m[i],
      pp: h.precipitation_probability ? h.precipitation_probability[i] : null
    };
  });
  H.forEach((x, i) => { const prev = H[Math.max(0, i - 3)]; x.dp3 = (x.p != null && prev.p != null) ? x.p - prev.p : 0; });
  const todayKey = parts(now, tz).key;
  const keys = [...new Set(H.map(x => x.key))];
  const dayMax = k => Math.max(...H.filter(x => x.key === k).map(x => x.tmp));
  const days = keys.filter(k => k >= todayKey).slice(0, 7).map(k => {
    const hrs = H.filter(x => x.key === k), start = hrs[0].ms - hrs[0].hr * 3600e3;
    const ev = dayEvents(start, place.lat, place.lon, Math.max(24, hrs.length)), mp = moonPhase(start + 12 * 3600e3);
    const rutKey = opts.rut && RUT[opts.rut] ? opts.rut : rutEstimate(place.lat, k), rut = rutKey ? RUT[rutKey] : null;
    const legalStart = ev.sunrise != null ? ev.sunrise - 30 * 60000 : start + 6 * 3600e3;
    const legalEnd = ev.sunset != null ? ev.sunset + 30 * 60000 : start + 19 * 3600e3;
    hrs.forEach(x => {
      const mid = x.ms + 30 * 60000;
      x.legal = x.ms + 3600e3 > legalStart && x.ms < legalEnd;
      x.f = { l: lightScore(mid, ev, rut), p: pScore(x.dp3), w: wScore(x.w), r: rScore(x.pr, x.code), s: sScore(mid, ev) };
      x.score = 10 * (.38 * x.f.l + .2 * x.f.p + .17 * x.f.w + .12 * x.f.r + .13 * x.f.s);
    });
    const hunt = hrs.filter(x => x.legal);
    const win = bestWindow(hunt), mean = avg(hunt.map(x => x.score));
    const i = keys.indexOf(k), prevMax = i > 0 ? dayMax(keys[i - 1]) : null;
    const tmax = dayMax(k), dT = prevMax == null ? 0 : tmax - prevMax, ts = tempScore(dT, tmax);
    const ps = phaseScore(mp.phase);
    const raw = .55 * win.avg + .25 * mean + .2 * 10 * (.8 * ts + .2 * ps);
    let score = Math.round(clamp((raw - 2.6) * 1.3 + (rut ? rut.bonus : 0), 1, 10));
    const storms = hunt.filter(x => x.code >= 95);
    if (storms.length) score = Math.min(score, 4);
    const summary = {
      p: avg(hunt.map(x => x.f.p)), w: avg(hunt.map(x => x.f.w)), r: avg(hunt.map(x => x.f.r)), ts, ps,
      wind: avg(hunt.map(x => x.w)), gust: Math.max(...hunt.map(x => x.g || 0)), wdir: circAvg(hunt.map(x => x.wd)), cloud: avg(hunt.map(x => x.c)),
      rainIn: hrs.reduce((a, x) => a + x.pr, 0), rainPct: hrs.some(x => x.pp != null) ? Math.max(...hrs.map(x => x.pp || 0)) : null,
      pNoon: (hrs.find(x => x.hr === 12) || hrs[0]).p,
      pTrend: (hrs.find(x => x.hr === 18) || hrs[hrs.length - 1]).p - (hrs.find(x => x.hr === 6) || hrs[0]).p,
      tmax, tmin: Math.min(...hrs.map(x => x.tmp)), dT, hasPrev: prevMax != null,
      phase: mp.phase, illum: mp.fraction, storms: storms.length, rutKey, rutEstimated: !(opts.rut && RUT[opts.rut])
    };
    const rs = rutScore(rutKey, summary.rutEstimated, k, dT);
    return { key: k, start, hrs, hunt, ev, win, score, rut: rs, summary, legalStart, legalEnd, isToday: k === todayKey };
  });
  return { days, tz };
}
export function bestWindow(hrs, fromMs) {
  let best = { avg: -1, i: 0 };
  for (let i = 0; i < hrs.length - 1; i++) {
    if (fromMs && hrs[i + 1].ms + 3600e3 <= fromMs) continue;
    const a = (hrs[i].score + hrs[i + 1].score) / 2; if (a > best.avg) best = { avg: a, i };
  }
  if (best.avg < 0) return { avg: 0, start: null, end: null };
  return { avg: best.avg, start: hrs[best.i].ms, end: hrs[best.i].ms + 2 * 3600e3 };
}
/* Snap the window to sunrise/sunset (deer hunters think in "first light" and "last light") */
export function snapWindow(w, D) {
  if (w.start == null) return w;
  const ev = D.ev, mid = (w.start + w.end) / 2;
  if (ev.sunrise && Math.abs(mid - ev.sunrise) < 100 * 60000) return { ...w, start: D.legalStart, end: ev.sunrise + 90 * 60000, label: "First light" };
  if (ev.sunset && Math.abs(mid - ev.sunset) < 100 * 60000) return { ...w, start: ev.sunset - 90 * 60000, end: D.legalEnd, label: "Last light" };
  return { ...w, label: "Midday" };
}
export function primeFor(D, now) {
  now = now || Date.now();
  let w = snapWindow(D.win, D), passed = null;
  if (D.isToday && w.end && w.end < now) {
    const nx = bestWindow(D.hunt, now);
    if (nx.start && nx.end > now) { passed = w; w = snapWindow(nx, D); } else { passed = w; w = { start: null, end: null }; }
  }
  return { w, passed };
}
/* Wind during a window (circular average of the hours inside it) */
export function windDuring(D, w) {
  const hrs = D.hrs.filter(x => w.start != null && x.ms + 3600e3 > w.start && x.ms < w.end);
  return { deg: circAvg(hrs.map(x => x.wd)), mph: avg(hrs.map(x => x.w)) };
}
export function bestStand(stands, D, w) {
  if (!stands || !stands.length || !w || w.start == null) return null;
  const wind = windDuring(D, w);
  const rated = stands.map(s => ({ ...s, check: standWind(s.bearing, wind.deg, wind.mph) })).sort((a, b) => b.check.ok - a.check.ok);
  return { wind, rated, best: rated[0] };
}

/* With no stands saved: where to sit for today's wind */
export function sitAdvice(windDeg) {
  if (windDeg == null) return "";
  return `Sit where deer approach from the ${dirName(windDeg)}, so your scent blows away behind you.`;
}
export const dirName = b => DIR_NAMES[Math.round((((b % 360) + 360) % 360) / 45) % 8];
export const dirShort = b => DIRS[Math.round((((b % 360) + 360) % 360) / 45) % 8];
export function bearingBetween(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * rad, p2 = lat2 * rad, dl = (lon2 - lon1) * rad;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
export function destPoint(lat, lon, bearing, meters) {
  const d = meters / 6371000, b = bearing * rad, p1 = lat * rad, l1 = lon * rad;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / rad, lon: l2 / rad };
}

/* Plain-English reason: two short sentences */
export function reason(s) {
  if (s.storms) return "Thunderstorms are forecast during shooting hours. Deer often move right before and after a storm, but don't sit in a tree stand with lightning around.";
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  let a;
  if (s.hasPrev && s.dT <= -10) a = `temps are dropping ${Math.abs(Math.round(s.dT))}° from yesterday, which gets deer on their feet`;
  else if (s.hasPrev && s.dT <= -4) a = `a ${Math.abs(Math.round(s.dT))}° cool-down from yesterday should help movement`;
  else if (s.hasPrev && s.dT >= 10) a = `a ${Math.round(s.dT)}° warm-up will keep deer bedded during the day`;
  else if (s.tmax > 80) a = "heat will keep deer bedded until dark";
  else a = "temperatures are steady, so expect a normal dawn and dusk pattern";
  if (s.pTrend >= 1) a += ", and pressure is rising behind a front";
  else if (s.pTrend <= -2) a += ", and pressure is falling fast ahead of a storm, so deer may feed early";
  let b;
  if (s.wind > 15) b = `Wind around ${Math.round(s.wind)} mph will keep deer tucked in thick cover.`;
  else if (s.wind < 2) b = "Calm air means swirling scent, so play the wind carefully.";
  else b = `Expect a ${compass(s.wdir)} wind around ${Math.round(s.wind)} mph.`;
  if (s.rutKey === "chasing" || s.rutKey === "peak") b += " The rut adds daytime buck movement.";
  return cap(a) + ". " + b;
}

/* ───────── Data ───────── */
export function forecastURL(p) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&hourly=temperature_2m,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,precipitation_probability,weather_code&timezone=auto&timeformat=unixtime&past_days=1&forecast_days=7&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch`;
}
export async function fetchForecast(p) {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
  try { const r = await fetch(forecastURL(p), { signal: ctl.signal }); if (!r.ok) throw new Error("forecast " + r.status); return await r.json(); }
  finally { clearTimeout(to); }
}

/* Read coordinates in the forms hunters paste: decimal, N/S/E/W, degrees-minutes-seconds, or a Google Maps link */
export function parseCoords(input) {
  if (!input) return null;
  let s = String(input).trim();
  const g = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i) || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (g) return valid(+g[1], +g[2]);
  s = s.replace(/[″"]/g, "''").replace(/[′’]/g, "'").replace(/[º˚]/g, "°");
  const part = "(\\d+(?:\\.\\d+)?)\\s*°?\\s*(?:(\\d+(?:\\.\\d+)?)\\s*'?\\s*)?(?:(\\d+(?:\\.\\d+)?)\\s*(?:''|\")?\\s*)?";
  const dms = new RegExp(`^([NS])?\\s*${part}([NS])?[\\s,;]+([EW])?\\s*${part}([EW])?$`, "i");
  const m = s.match(dms);
  if (m && (/[°'NSEW]/i.test(s) || m[3] || m[8])) {
    const toDec = (d, mi, se) => (+d) + (mi ? +mi / 60 : 0) + (se ? +se / 3600 : 0);
    let lat = toDec(m[2], m[3], m[4]), lon = toDec(m[7], m[8], m[9]);
    const ns = (m[1] || m[5] || "").toUpperCase(), ew = (m[6] || m[10] || "").toUpperCase();
    if (ns === "S") lat = -lat; if (ew === "W") lon = -lon;
    if (!ew && /-/.test(s.split(/[\s,;]+/).slice(-1)[0])) lon = -Math.abs(lon);
    return valid(lat, lon);
  }
  const d = s.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (d) return valid(+d[1], +d[2]);
  return null;
  function valid(lat, lon) { return isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat: +lat.toFixed(5), lon: +lon.toFixed(5) } : null; }
}

/* Property share codes: name, location, rut setting and stands in one URL-safe string */
export function encodeProperty(p) {
  const o = { n: p.name, a: p.lat, o: p.lon, r: p.rut || "", s: (p.stands || []).map(s => s.lat != null ? [s.name, Math.round(s.bearing), +(+s.lat).toFixed(5), +(+s.lon).toFixed(5)] : [s.name, Math.round(s.bearing)]) };
  const json = JSON.stringify(o), b = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeProperty(code) {
  try {
    const b = code.replace(/-/g, "+").replace(/_/g, "/"), pad = b + "===".slice((b.length + 3) % 4);
    const json = typeof atob === "function" ? decodeURIComponent(escape(atob(pad))) : Buffer.from(pad, "base64").toString("utf8");
    const o = JSON.parse(json);
    if (!isFinite(o.a) || !isFinite(o.o) || Math.abs(o.a) > 90 || Math.abs(o.o) > 180) return null;
    const clean = v => String(v || "").replace(/[\u0000-\u001f<>]/g, "").slice(0, 40);
    return {
      name: clean(o.n) || "Shared property", lat: +o.a, lon: +o.o, rut: RUT[o.r] ? o.r : "",
      stands: (Array.isArray(o.s) ? o.s : []).slice(0, 20).map(x => {
        const st = { name: clean(x[0]) || "Stand", bearing: ((+x[1] % 360) + 360) % 360 };
        if (isFinite(x[2]) && isFinite(x[3]) && Math.abs(x[2]) <= 90 && Math.abs(x[3]) <= 180) { st.lat = +x[2]; st.lon = +x[3]; }
        return st;
      }).filter(x => isFinite(x.bearing))
    };
  } catch (e) { return null; }
}

export const SITE = "https://rutscore.com";
export function shareURL(prop, D, tz) {
  const q = new URLSearchParams({ p: encodeProperty(prop) });
  if (D) {
    if (!D.isToday) q.set("d", D.key);
    const { w } = primeFor(D);
    q.set("s", String(D.score)); q.set("n", prop.name); if (D.rut != null) q.set("r", String(D.rut));
    q.set("w", D.isToday ? "today" : DL[keyDate(D.key).getUTCDay()]);
    if (w.start) q.set("pt", fmtRange(w.start, w.end, tz));
  }
  return SITE + "/?" + q.toString();
}
