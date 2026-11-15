// Runs every afternoon. For each saved alert, checks the next 3 days of deer movement and sends one
// phone notification per day that reaches the person's number (never twice for the same day).
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { vapidKeys } from "../lib/shared.mjs";
import { planAlerts, wordAlert } from "../lib/plan.mjs";
import { buildModel, primeFor, tierOf, fetchForecast, fmtRange, DL, keyDate, SITE } from "../../public/engine.js";

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
    if (!plan.messages.length) { if (plan.changed) await store.setJSON(id, { ...rec, notified: plan.notified }); return; }
    try {
      for (const m of plan.messages) {
        const words = wordAlert(m, {
          icon: "🦌", place: rec.spot.name, dayName: k => DL[keyDate(k).getUTCDay()], tierName: s => tierOf(s).name,
          scoreText: d => d.rut != null ? `Rut ${d.rut} · Hunt ${d.score}` : `Hunt ${d.score}/10`,
          extra: d => { const { w } = primeFor(d); return w.start ? ` Prime ${fmtRange(w.start, w.end, M.tz)}.` : ""; }
        });
        const q = new URLSearchParams(); if (rec.spot.code) q.set("p", rec.spot.code); q.set("d", m.d.key);
        await webpush.sendNotification(rec.subscription, JSON.stringify({ ...words, tag: `hunt-${id}-${m.d.key}-${m.type}`, url: "/?" + q.toString() }), { TTL: 12 * 3600 });
        sent++;
      }
      await store.setJSON(id, { ...rec, notified: plan.notified });
    } catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { await store.delete(id); removed++; } }
  });
  console.log(`Hunt alerts: ${records.length} alerts, ${spots.size} locations, ${sent} sent, ${removed} expired removed, ${Date.now() - started} ms`);
};

// 21:00 UTC = 4 PM Eastern in winter, 5 PM in summer: in time to plan tomorrow's hunt.
export const config = { schedule: "0 21 * * *" };
