// Runs every afternoon. For each saved alert, checks the next 3 days of deer movement and sends one
// phone notification per day that reaches the person's number (never twice for the same day).
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { vapidKeys } from "../lib/shared.mjs";
import { planAlerts, wordAlert } from "../lib/plan.mjs";
import { buildModel, primeFor, tierOf, fetchForecast, fmtRange, fmtT, triggers, DL, keyDate, SITE } from "../../public/engine.js";

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = null; } }
  }));
  return out;
}

export default async () => {
  const started = Date.now();
  const store = getStore({ name: "hunt-alerts", consistency: "strong" });
  const keys = await vapidKeys();
  webpush.setVapidDetails("https://rutscore.com", keys.publicKey, keys.privateKey);

  const { blobs } = await store.list();
  const records = (await mapLimit(blobs, 16, async b => ({ id: b.key, rec: await store.get(b.key, { type: "json" }) }))).filter(x => x && x.rec);

  // One forecast per location, shared by everyone watching it.
  const spots = new Map();
  records.forEach(({ rec }) => { const k = rec.spot.lat.toFixed(2) + "," + rec.spot.lon.toFixed(2); if (!spots.has(k)) spots.set(k, rec.spot); });
  const data = new Map();
  await mapLimit([...spots.entries()], 6, async ([k, spot]) => { data.set(k, await fetchForecast(spot)); });

  let sent = 0, removed = 0;
  await mapLimit(records, 8, async ({ id, rec }) => {
    const d = data.get(rec.spot.lat.toFixed(2) + "," + rec.spot.lon.toFixed(2)); if (!d) return;
    const M = buildModel(d.hourly, d.timezone || "UTC", rec.spot, { rut: rec.spot.rut || null });
    const plan = planAlerts(M.days, rec);
    // Movement triggers (cold front, pressure drop, clearing after a storm…) for tomorrow, or a big one the day after.
    const todayKey = M.days[0].key, trig = Object.fromEntries(Object.entries(rec.trig || {}).filter(([k]) => k >= todayKey));
    let tg = null;
    if (rec.triggers !== false) for (const [i, D] of [[1, M.days[1]], [2, M.days[2]]]) {
      if (!D || trig[D.key]) continue;
      const best = triggers(D.summary, ms => fmtT(ms, M.tz)).find(x => x.power >= (i === 1 ? 2 : 3));
      if (best) { tg = { D, i, x: best }; break; }
    }
    if (!plan.messages.length && !tg) { if (plan.changed || Object.keys(trig).length !== Object.keys(rec.trig || {}).length) await store.setJSON(id, { ...rec, notified: plan.notified, trig }); return; }
    const whenOf = (i, k) => i === 1 ? "Tomorrow" : DL[keyDate(k).getUTCDay()];
    try {
      for (const m of plan.messages) {
        const words = wordAlert(m, {
          icon: "🦌", place: rec.spot.name, dayName: k => DL[keyDate(k).getUTCDay()], tierName: s => tierOf(s).name,
          scoreText: d => d.rut != null ? `Rut ${d.rut} · Hunt ${d.score}` : `Hunt ${d.score}/10`,
          extra: d => { const { w } = primeFor(d); return w.start ? ` Prime ${fmtRange(w.start, w.end, M.tz)}.` : ""; }
        });
        if (tg && m.d.key === tg.D.key && m.type !== "off") { words.body = `${tg.x.icon} ${tg.x.title}: ${tg.x.why} ` + words.body; trig[tg.D.key] = tg.x.id; tg = null; }
        const q = new URLSearchParams(); if (rec.spot.code) q.set("p", rec.spot.code); q.set("d", m.d.key);
        await webpush.sendNotification(rec.subscription, JSON.stringify({ ...words, tag: `hunt-${id}-${m.d.key}-${m.type}`, url: "/?" + q.toString() }), { TTL: 12 * 3600 });
        sent++;
      }
      if (tg) {
        const { w } = primeFor(tg.D), q = new URLSearchParams(); if (rec.spot.code) q.set("p", rec.spot.code); q.set("d", tg.D.key);
        await webpush.sendNotification(rec.subscription, JSON.stringify({
          title: `${tg.x.icon} ${whenOf(tg.i, tg.D.key)} at ${rec.spot.name}: ${(tg.x.title.charAt(0).toLowerCase() + tg.x.title.slice(1)).replace("than yesterday", tg.i === 1 ? "than today" : "than the day before").replace("yesterday's", tg.i === 1 ? "today's" : "the day before's")}`,
          body: `${tg.x.why} ${tg.x.tip}${w.start ? ` Prime ${fmtRange(w.start, w.end, M.tz)}.` : ""}`,
          tag: `trig-${id}-${tg.D.key}`, url: "/?" + q.toString()
        }), { TTL: 12 * 3600 });
        trig[tg.D.key] = tg.x.id; sent++;
      }
      await store.setJSON(id, { ...rec, notified: plan.notified, trig });
    } catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { await store.delete(id); removed++; } }
  });
  console.log(`Hunt alerts: ${records.length} alerts, ${spots.size} locations, ${sent} sent, ${removed} expired removed, ${Date.now() - started} ms`);
};

// 21:00 UTC = 4 PM Eastern in winter, 5 PM in summer: in time to plan tomorrow's hunt.
export const config = { schedule: "0 21 * * *" };
