/**
 * Datos DEMO para ver la plataforma sin base de datos ni MCP.
 * Los números son ficticios y deterministas (misma semilla → mismos datos).
 */
import type { Account, Group } from "./types";
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
