/**
 * Datos DEMO para ver la plataforma sin base de datos ni MCP.
 * Los números son ficticios y deterministas (misma semilla → mismos datos).
 */
import type { Account, CampaignRow, Group } from "./types";
import type { Channel, GroupType, MetricRow } from "./metrics";
import { currentMonth, monthRange } from "./months";

export const DEMO_GROUPS: Group[] = [
  { slug: "comercial-depor", name: "Comercial Depor" },
  { slug: "grupo-demo-peru", name: "Grupo Demo Perú" },
];

const acc = (
  slug: string, name: string, groupSlug: string | null, country: string, currency: string,
  channels: string[], role = "ADMIN",
): Account => ({
  slug, name, groupSlug, country, currency, timezone: null, status: "active", role, channels, hidden: false,
});

export const DEMO_ACCOUNTS: Account[] = [
  acc("depor", "Depor", "comercial-depor", "CL", "CLP", ["email", "sms", "whatsapp"]),
  acc("blockstore", "Blockstore", "comercial-depor", "CL", "CLP", ["email", "whatsapp"]),
  acc("depor-outlet", "Depor Outlet (demo)", "comercial-depor", "CL", "CLP", ["email"]),
  acc("demo-peru-moda", "Moda Perú (demo)", "grupo-demo-peru", "PE", "PEN", ["email", "sms"]),
  acc("demo-peru-hogar", "Hogar Perú (demo)", "grupo-demo-peru", "PE", "PEN", ["email", "sms", "push"], "CONSULT"),
  acc("demo-argentina", "Retail Argentina (demo)", null, "AR", "ARS", ["email", "whatsapp"]),
];

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const CH_PROFILE: Record<string, { share: number; open: number; ctr: number; ticketMult: number }> = {
  email: { share: 0.72, open: 0.32, ctr: 0.018, ticketMult: 1 },
  sms: { share: 0.15, open: 0, ctr: 0.025, ticketMult: 0.9 },
  whatsapp: { share: 0.1, open: 0.78, ctr: 0.09, ticketMult: 1.2 },
  push: { share: 0.03, open: 0.06, ctr: 0.012, ticketMult: 0.8 },
};
const SIZE: Record<string, number> = {
  depor: 900_000, blockstore: 260_000, "depor-outlet": 120_000,
  "demo-peru-moda": 340_000, "demo-peru-hogar": 180_000, "demo-argentina": 410_000,
};
const TICKET: Record<string, number> = { CLP: 48_000, PEN: 210, ARS: 95_000 };
const SEASON = [0.85, 0.8, 0.95, 0.9, 1.1, 1.0, 1.05, 0.95, 0.9, 1.0, 1.35, 1.5];

export function demoRows(): MetricRow[] {
  const months = monthRange(`${new Date().getFullYear() - 1}-01`, currentMonth());
  const rows: MetricRow[] = [];
  for (const a of DEMO_ACCOUNTS) {
    const r = rng(hash(a.slug));
    const base = SIZE[a.slug] ?? 200_000;
    const ticket = TICKET[a.currency ?? "CLP"] ?? 100;
    const totalShare = a.channels.reduce((s, c) => s + CH_PROFILE[c].share, 0);
    for (const month of months) {
      const mi = Number(month.slice(5)) - 1;
      const partial = month === currentMonth() ? new Date().getDate() / 30 : 1;
      const vol = base * SEASON[mi] * (0.85 + r() * 0.3) * partial;
      const autoShare = 0.22 + r() * 0.1;
      const perChannel: MetricRow[] = [];
      for (const ch of a.channels) {
        const p = CH_PROFILE[ch];
        for (const gt of ["custom", "triggered"] as GroupType[]) {
          const factor = gt === "triggered" ? autoShare : 1 - autoShare;
          const sent = Math.round((vol * p.share) / totalShare * factor);
          const bounceRate = ch === "email" ? 0.008 + r() * 0.02 : 0.01 + r() * 0.03;
          const bounces = Math.round(sent * bounceRate);
          const delivered = sent - bounces;
          const ctrBoost = gt === "triggered" ? 2.4 : 1;
          const opens = Math.round(delivered * p.open * (0.85 + r() * 0.3) * (gt === "triggered" ? 1.3 : 1));
          const clicks = Math.round(delivered * p.ctr * ctrBoost * (0.75 + r() * 0.5));
          const conversions = Math.round(clicks * (gt === "triggered" ? 0.06 : 0.025) * (0.8 + r() * 0.4));
          const redacted = a.role === "CONSULT";
          perChannel.push({
            accountSlug: a.slug, month, channel: ch as Channel, groupType: gt,
            sent, delivered, bounces, opens, clicks,
            spam: Math.round(delivered * (ch === "email" ? 0.0004 + r() * 0.0008 : 0)),
            unsubscribes: Math.round(delivered * (0.0012 + r() * 0.0025)),
            conversions,
            revenue: redacted ? null : Math.round(conversions * ticket * p.ticketMult * (0.85 + r() * 0.3)),
            revenueRedacted: redacted,
            campaigns: gt === "custom" ? Math.max(1, Math.round((6 + r() * 10) * partial)) : 4 + Math.round(r() * 4),
          });
        }
      }
      rows.push(...perChannel);
      // Agregados: (canal, all), (all, tipo), (all, all)
      const agg = (filter: (x: MetricRow) => boolean, channel: Channel, groupType: GroupType) => {
        const xs = perChannel.filter(filter);
        const s = xs.reduce(
          (t, x) => {
            for (const k of ["sent", "delivered", "bounces", "opens", "clicks", "spam", "unsubscribes", "conversions", "campaigns"] as const) t[k] += x[k];
            if (x.revenue != null) t.revenue = (t.revenue ?? 0) + x.revenue;
            return t;
          },
          { sent: 0, delivered: 0, bounces: 0, opens: 0, clicks: 0, spam: 0, unsubscribes: 0, conversions: 0, campaigns: 0, revenue: null as number | null },
        );
        rows.push({ ...s, accountSlug: a.slug, month, channel, groupType, revenueRedacted: a.role === "CONSULT" });
      };
      for (const ch of a.channels) agg((x) => x.channel === ch, ch as Channel, "all");
      agg((x) => x.groupType === "custom", "all", "custom");
      agg((x) => x.groupType === "triggered", "all", "triggered");
      agg(() => true, "all", "all");
    }
  }
  return rows;
}

// ── Campañas demo ────────────────────────────────────────────────────
// Se reparten los totales mensuales de cada canal × tipo entre campañas,
// así la suma de campañas coincide con los totales de la cuenta.

const SEASONAL: Record<number, string[]> = {
  1: ["Liquidación de verano", "Rebajas enero"],
  2: ["Vuelta a clases", "San Valentín"],
  3: ["Vuelta a clases", "Nueva temporada otoño"],
  4: ["Semana Santa", "Lanzamiento otoño-invierno"],
  5: ["Día de la Madre", "Hot Sale"],
  6: ["CyberDay", "Día del Padre"],
  7: ["Vacaciones de invierno", "Liquidación invierno"],
  8: ["Día del Niño", "Mid Season Sale"],
  9: ["Fiestas Patrias", "Primavera"],
  10: ["CyberDay", "Halloween"],
  11: ["Black Friday", "Cyber Monday"],
  12: ["Navidad", "Último día de despacho"],
};
const GENERIC = ["Newsletter semanal", "Lanzamiento colección", "Recordatorio puntos Club", "Outlet", "Nuevos ingresos", "Envío gratis 48 h", "Top ventas", "Exclusivo app"];
const AUTOMATIONS: { name: string; type: string; channels: string[] }[] = [
  { name: "Carrito abandonado", type: "abandoned_cart", channels: ["email", "whatsapp", "sms"] },
  { name: "Bienvenida", type: "welcome", channels: ["email"] },
  { name: "Producto visitado", type: "browse_abandonment", channels: ["email", "push"] },
  { name: "Post-compra · cross-sell", type: "post_purchase", channels: ["email", "whatsapp"] },
  { name: "Cumpleaños", type: "birthday", channels: ["email", "sms"] },
  { name: "Reactivación 90 días", type: "winback", channels: ["email", "sms"] },
  { name: "Recompra", type: "replenishment", channels: ["email"] },
];
const CH_NAME: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", push: "Push" };
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

const COUNT_KEYS = ["sent", "delivered", "bounces", "opens", "clicks", "spam", "unsubscribes", "conversions"] as const;

/** Reparte `total` según pesos; el último absorbe el redondeo. */
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const out = weights.map((w) => Math.floor((total * w) / sum));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

let _campCache: CampaignRow[] | null = null;
export function demoCampaigns(): CampaignRow[] {
  if (_campCache) return _campCache;
  const base = demoRows().filter((r) => r.channel !== "all" && r.groupType !== "all");
  const out: CampaignRow[] = [];
  const today = new Date();
  for (const row of base) {
    const r = rng(hash(`${row.accountSlug}|${row.month}|${row.channel}|${row.groupType}`));
    const m = Number(row.month.slice(5));
    const [y] = row.month.split("-").map(Number);
    const lastDay = row.month === currentMonth() ? Math.max(1, today.getDate()) : new Date(y, m, 0).getDate();
    let defs: { id: string; name: string; type: string; sentAt: string | null }[];
    if (row.groupType === "triggered") {
      defs = AUTOMATIONS.filter((a) => a.channels.includes(row.channel)).map((a) => ({
        id: `${row.accountSlug}-auto-${row.channel}-${a.type}`, name: `${a.name} · ${CH_NAME[row.channel]}`, type: a.type, sentAt: null,
      }));
      if (defs.length === 0) continue;
    } else {
      const n = Math.max(1, Math.min(row.campaigns, 12));
      const pool = [...SEASONAL[m], ...GENERIC];
      defs = Array.from({ length: n }, (_, i) => {
        const day = Math.min(lastDay, 1 + Math.floor(((i + r()) / n) * lastDay));
        const name = i < 2 ? SEASONAL[m][i] : pool[2 + ((i + Math.floor(r() * 5)) % (pool.length - 2))];
        return {
          id: `${row.accountSlug}-${row.month}-${row.channel}-${i + 1}`,
          name: `${name}${i >= 2 ? ` #${i - 1}` : ""}`,
          type: i < 2 ? "promotional" : "newsletter",
          sentAt: `${row.month}-${String(day).padStart(2, "0")}`,
        };
      });
    }
    // pesos: volumen base y "rendimiento" distinto por campaña
    const wSent = defs.map((_, i) => (row.groupType === "custom" && i < 2 ? 1.8 : 0.4) + r());
    const perf = defs.map(() => 0.45 + r() * 1.4);
    const perfRev = perf.map((p) => p * (0.6 + r() * 0.9));
    const parts: Record<string, number[]> = {};
    for (const k of COUNT_KEYS) {
      const w = k === "clicks" || k === "opens" ? wSent.map((w, i) => w * (k === "clicks" ? perf[i] : Math.sqrt(perf[i])))
        : k === "conversions" ? wSent.map((w, i) => w * perfRev[i])
        : wSent;
      parts[k] = split(row[k], w);
    }
    const rev = row.revenue == null ? null : split(Math.round(row.revenue), wSent.map((w, i) => w * perfRev[i]));
    defs.forEach((d, i) => {
      const c: CampaignRow = {
        accountSlug: row.accountSlug, month: row.month, campaignId: d.id, name: d.name, channel: row.channel,
        groupType: row.groupType as "custom" | "triggered", campaignType: d.type,
        status: row.groupType === "triggered" ? "active" : "sent", sentAt: d.sentAt,
        subject: row.channel === "email" ? `${d.name} 🛍️` : null,
        sent: 0, delivered: 0, bounces: 0, opens: 0, clicks: 0, spam: 0, unsubscribes: 0, conversions: 0,
        revenue: rev ? rev[i] : null, revenueRedacted: row.revenueRedacted, campaigns: 1,
      };
      for (const k of COUNT_KEYS) c[k] = parts[k][i];
      c.delivered = Math.min(c.delivered, c.sent);
      c.opens = Math.min(c.opens, Math.round(c.delivered * 0.95));
      if (c.channel !== "sms") c.clicks = Math.min(c.clicks, c.opens);
      out.push(c);
    });
  }
  return (_campCache = out);
}
