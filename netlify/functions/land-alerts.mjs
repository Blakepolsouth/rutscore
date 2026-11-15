// /api/land-alerts — rain and feeder alerts for the Land Manager.
//   POST { action: "sync", subscription, items: [{type:"rain",key,name,prop,lat,lon,laid,limit} | {type:"feeder",key,name,prop,empty}], tz }
//   POST { action: "off", subscription }
// One record per phone, stored in Netlify Blobs. Checked daily by land-alerts-daily.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const validSub = s => s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string";
const clean = (v, n) => String(v || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, n);
const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function cleanItem(x) {
  if (!x || typeof x !== "object") return null;
  const base = { key: clean(x.key, 20), name: clean(x.name, 40) || "Your site", prop: clean(x.prop, 60) || "Your land" };
  if (!base.key) return null;
  if (x.type === "rain" && isDate(x.laid) && isFinite(x.lat) && isFinite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180)
    return { type: "rain", ...base, lat: +(+x.lat).toFixed(3), lon: +(+x.lon).toFixed(3), laid: x.laid, limit: Math.min(10, Math.max(0.1, +x.limit || 1)) };
  if (x.type === "feeder" && isDate(x.empty)) return { type: "feeder", ...base, empty: x.empty };
  return null;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: "Send JSON" }, 400); }
  const { action, subscription } = body || {};
  if (!validSub(subscription)) return json({ error: "Missing subscription" }, 400);
  const store = getStore({ name: "land-alerts", consistency: "strong" });
  const id = createHash("sha256").update(subscription.endpoint).digest("hex").slice(0, 32);
  if (action === "off") { await store.delete(id); return json({ ok: true }); }
  if (action !== "sync") return json({ error: "Unknown action" }, 400);
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40).map(cleanItem).filter(Boolean);
  const existing = await store.get(id, { type: "json" });
  // Keep "already told you" marks only for items that haven't changed (a refresh or refill resets them).
  const notified = {};
  for (const it of items) { const mark = it.type === "rain" ? it.laid : it.empty; if (existing?.notified?.[it.key] === mark) notified[it.key] = mark; }
  await store.setJSON(id, {
    subscription: { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
    tz: clean(body.tz, 60) || "America/New_York", items, notified, updated: Date.now()
  });
  return json({ ok: true, items: items.length });
};

export const config = { path: "/api/land-alerts" };
