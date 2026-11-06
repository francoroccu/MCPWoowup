export const CHANNELS = ["all", "email", "sms", "whatsapp", "push"] as const;
export const GROUP_TYPES = ["all", "custom", "triggered"] as const;
export type Channel = (typeof CHANNELS)[number];
export type GroupType = (typeof GROUP_TYPES)[number];

export const CHANNEL_LABEL: Record<Channel, string> = {
  all: "Todos los canales",
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
};
export const GROUP_TYPE_LABEL: Record<GroupType, string> = {
  all: "One-shot + automatizaciones",
  custom: "One-shot",
  triggered: "Automatizaciones",
};

export interface Counts {
  sent: number;
  delivered: number;
  bounces: number;
  opens: number;
  clicks: number;
  spam: number;
  unsubscribes: number;
  conversions: number;
  revenue: number | null;
  revenueRedacted: boolean;
  campaigns: number;
}

export interface MetricRow extends Counts {
  accountSlug: string;
  month: string;
  channel: Channel;
  groupType: GroupType;
}

export function emptyCounts(): Counts {
  return {
    sent: 0, delivered: 0, bounces: 0, opens: 0, clicks: 0, spam: 0,
    unsubscribes: 0, conversions: 0, revenue: null, revenueRedacted: false, campaigns: 0,
  };
}

export function sumCounts(rows: Counts[]): Counts {
  const t = emptyCounts();
  for (const r of rows) {
    t.sent += r.sent;
    t.delivered += r.delivered;
    t.bounces += r.bounces;
    t.opens += r.opens;
    t.clicks += r.clicks;
    t.spam += r.spam;
    t.unsubscribes += r.unsubscribes;
    t.conversions += r.conversions;
    t.campaigns += r.campaigns;
    if (r.revenue != null) t.revenue = (t.revenue ?? 0) + r.revenue;
    if (r.revenueRedacted) t.revenueRedacted = true;
  }
  return t;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export interface Kpis {
  deliveryRate: number | null; // (sent − bounces) / sent
  openRate: number | null; // opens / delivered
  ctr: number | null; // clicks / delivered
  ctor: number | null; // clicks / opens
  bounceRate: number | null;
  spamRate: number | null;
  unsubRate: number | null;
  rpe: number | null; // revenue / sent
  avgTicket: number | null; // revenue / conversions
}

export function kpis(c: Counts): Kpis {
  const rev = c.revenue;
  return {
    deliveryRate: div(c.sent - c.bounces, c.sent),
    openRate: div(c.opens, c.delivered),
    ctr: div(c.clicks, c.delivered),
    ctor: div(c.clicks, c.opens),
    bounceRate: div(c.bounces, c.sent),
    spamRate: div(c.spam, c.delivered),
    unsubRate: div(c.unsubscribes, c.delivered),
    rpe: rev == null ? null : div(rev, c.sent),
    avgTicket: rev == null ? null : div(rev, c.conversions),
  };
}

export function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null;
  return (curr - prev) / Math.abs(prev);
}

/** Semáforo orientativo (referencias de email retail, NO benchmarks de la cuenta). */
export type Light = "ok" | "warn" | "bad" | null;
export function emailLight(metric: keyof Kpis, v: number | null): Light {
  if (v == null) return null;
  switch (metric) {
    case "deliveryRate": return v > 0.97 ? "ok" : v > 0.94 ? "warn" : "bad";
    case "bounceRate": return v < 0.02 ? "ok" : v < 0.04 ? "warn" : "bad";
    case "spamRate": return v < 0.001 ? "ok" : v < 0.003 ? "warn" : "bad";
    case "unsubRate": return v < 0.003 ? "ok" : v < 0.006 ? "warn" : "bad";
    case "ctr": return v >= 0.01 ? "ok" : v >= 0.005 ? "warn" : "bad";
    case "ctor": return v >= 0.08 ? "ok" : v >= 0.05 ? "warn" : "bad";
    default: return null;
  }
}

// ── Formato ──────────────────────────────────────────────────────────
const nf = new Intl.NumberFormat("es-AR");
export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : nf.format(Math.round(n)));
export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null ? "—" : `${(n * 100).toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
export function fmtMoney(n: number | null | undefined, currency?: string | null, compact = false) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: compact || Math.abs(n) >= 1000 ? 0 : 2,
      notation: compact ? "compact" : "standard",
    }).format(n);
  } catch {
    return nf.format(n);
  }
}
export const fmtCompact = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
