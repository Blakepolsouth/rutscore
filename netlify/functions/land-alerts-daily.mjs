// Runs every morning. Sends one push when rain has washed out an attractant site, and one when a feeder
// is about to run empty (2 days or less). Never twice for the same refresh or fill.
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { vapidKeys } from "../lib/shared.mjs";

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } }
  }));
  return out;
}
const dayIn = tz => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } };
const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const nice = s => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export async function rainFor(lat, lon) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum&past_days=45&forecast_days=1&timezone=auto&precipitation_unit=inch`;
  const j = await (await fetch(u)).json(); const days = {};
  j.daily.time.forEach((d, i) => days[d] = j.daily.precipitation_sum[i] || 0);
  return days;
}
export function rainSince(days, laid, today) { let s = 0; for (const [d, v] of Object.entries(days)) if (d > laid && d <= today) s += v; return Math.round(s * 100) / 100; }

export default async () => {
  const started = Date.now();
  const store = getStore({ name: "land-alerts", consistency: "strong" });
  const keys = await vapidKeys();
  webpush.setVapidDetails("https://rutscore.com", keys.publicKey, keys.privateKey);
  const { blobs } = await store.list();
  const recs = (await mapLimit(blobs, 16, async b => ({ id: b.key, rec: await store.get(b.key, { type: "json" }) }))).filter(x => x && x.rec);

  const spots = new Map();
  recs.forEach(({ rec }) => rec.items.filter(i => i.type === "rain").forEach(i => spots.set(i.lat.toFixed(2) + "," + i.lon.toFixed(2), i)));
  const rain = new Map();
  await mapLimit([...spots.entries()], 6, async ([k, i]) => rain.set(k, await rainFor(i.lat, i.lon)));

  let sent = 0, removed = 0;
  await mapLimit(recs, 8, async ({ id, rec }) => {
    const today = dayIn(rec.tz), msgs = [], notified = { ...(rec.notified || {}) };
    for (const it of rec.items) {
      if (it.type === "rain") {
        const days = rain.get(it.lat.toFixed(2) + "," + it.lon.toFixed(2)); if (!days || notified[it.key] === it.laid) continue;
        const got = rainSince(days, it.laid, today);
        if (got >= it.limit) { msgs.push({ it, mark: it.laid, title: `🌧 ${it.name}: time to refresh`, body: `${got}″ of rain at ${it.prop} since you put it out ${nice(it.laid)}. It's likely washed out.` }); }
      } else if (it.type === "feeder") {
        if (notified[it.key] === it.empty) continue;
        const left = diff(today, it.empty);
        if (left <= 2) msgs.push({ it, mark: it.empty, title: `🌽 ${it.name} ${left < 0 ? "is empty" : left === 0 ? "runs empty today" : `runs empty in ${left} day${left === 1 ? "" : "s"}`}`, body: `${it.prop}: time to refill.${left >= 0 ? ` Projected empty ${nice(it.empty)}.` : ""}` });
      }
    }
    if (!msgs.length) return;
    // One notification per phone per day: combine if several are due.
    const payload = msgs.length === 1 ? { title: msgs[0].title, body: msgs[0].body } : { title: `🦌 ${msgs.length} things need you on your land`, body: msgs.map(m => m.title.replace(/^\S+\s/, "")).join(" · ") };
    try {
      await webpush.sendNotification(rec.subscription, JSON.stringify({ ...payload, tag: "land-" + id + "-" + today, url: "/land/" }), { TTL: 12 * 3600 });
      msgs.forEach(m => notified[m.it.key] = m.mark); sent++;
      await store.setJSON(id, { ...rec, notified });
    } catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { await store.delete(id); removed++; } }
  });
  console.log(`Land alerts: ${recs.length} phones, ${spots.size} rain spots, ${sent} sent, ${removed} removed, ${Date.now() - started} ms`);
};

// 12:30 UTC = 7:30 AM Eastern in winter: before the morning check of the land.
export const config = { schedule: "30 12 * * *" };
