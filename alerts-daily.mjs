// Runs every afternoon. For each saved alert, checks the next 3 days of deer movement and sends one
// phone notification per day that reaches the person's number (never twice for the same day).
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { vapidKeys } from "../lib/shared.mjs";
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
    const todayKey = M.days[0].key;
    const notified = Object.fromEntries(Object.entries(rec.notified || {}).filter(([k]) => k >= todayKey));
    const hit = M.days.slice(1, 4).find(day => day.score >= rec.threshold && !notified[day.key]);
    if (!hit) { if (Object.keys(notified).length !== Object.keys(rec.notified || {}).length) await store.setJSON(id, { ...rec, notified }); return; }

    const dayName = DL[keyDate(hit.key).getUTCDay()], { w } = primeFor(hit);
    const q = new URLSearchParams(); if (rec.spot.code) q.set("p", rec.spot.code); q.set("d", hit.key);
    const payload = {
      title: hit.rut != null ? `🦌 ${rec.spot.name}: Rut ${hit.rut} · Hunt ${hit.score} ${dayName}` : `🦌 ${rec.spot.name}: Hunt Score ${hit.score}/10 ${dayName}`,
      body: `${tierOf(hit.score).name}.${w.start ? ` Prime ${fmtRange(w.start, w.end, M.tz)}.` : ""} Tap for the full hunt forecast.`,
      tag: "hunt-" + id + "-" + hit.key, url: "/?" + q.toString()
    };
    try {
      await webpush.sendNotification(rec.subscription, JSON.stringify(payload), { TTL: 12 * 3600 });
      notified[hit.key] = hit.score; sent++; await store.setJSON(id, { ...rec, notified });
    } catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) { await store.delete(id); removed++; } }
  });
  console.log(`Hunt alerts: ${records.length} alerts, ${spots.size} locations, ${sent} sent, ${removed} expired removed, ${Date.now() - started} ms`);
};

// 21:00 UTC = 4 PM Eastern in winter, 5 PM in summer: in time to plan tomorrow's hunt.
export const config = { schedule: "0 21 * * *" };
