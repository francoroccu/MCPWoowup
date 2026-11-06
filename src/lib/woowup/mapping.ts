/**
 * ÚNICO lugar donde se asume la forma del MCP de WoowUp.
 * Antes del primer sync real: correr `npm run mcp:inspect` y ajustar aquí
 * los nombres de parámetros y las claves de respuesta si difieren.
 */
import type { Counts } from "../metrics";

// ── Nombres de herramientas ──────────────────────────────────────────
export const TOOLS = {
  listAccounts: "list_accounts",
  switchAccount: "switch_account",
  getAccount: "get_account",
  stats: "get_campaigns_stats",
  listCampaigns: "list_campaigns",
} as const;

// ── Argumentos ───────────────────────────────────────────────────────
export function switchArgs(slug: string) {
  return { slug };
}

/**
 * Regla del proyecto: siempre filter_by="activity" (nunca "sent" para automatizaciones).
 * channel/group_type se omiten cuando son "all".
 */
export function statsArgs(p: { from: string; to: string; channel?: string; groupType?: string }) {
  return {
    from_date: p.from,
    to_date: p.to,
    filter_by: "activity",
    ...(p.channel && p.channel !== "all" ? { channel: p.channel } : {}),
    ...(p.groupType && p.groupType !== "all" ? { group_type: p.groupType } : {}),
  };
}

// ── Lectura defensiva de respuestas ──────────────────────────────────
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Busca la primera clave presente, primero en contenedores típicos y luego en profundidad. */
function pick(root: unknown, keys: string[]): unknown {
  if (!isObj(root)) return undefined;
  const containers = [root, root.totals, root.total, root.summary, root.stats, root.data, root.result, root.metrics];
  for (const c of containers) {
    if (!isObj(c)) continue;
    for (const k of keys) if (k in c && c[k] !== undefined) return c[k];
  }
  // búsqueda en profundidad (limitada) como último recurso
  const stack: { v: unknown; d: number }[] = [{ v: root, d: 0 }];
  while (stack.length) {
    const { v, d } = stack.shift()!;
    if (!isObj(v) || d > 3) continue;
    for (const k of keys) if (k in v && v[k] !== undefined) return v[k];
    for (const child of Object.values(v)) if (isObj(child)) stack.push({ v: child, d: d + 1 });
  }
  return undefined;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (isObj(v)) {
    for (const k of ["total", "count", "value", "amount", "unique"]) if (typeof v[k] === "number") return v[k] as number;
  }
  if (typeof v === "string") {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return v.trim() !== "" && Number.isFinite(n) && /\d/.test(v) ? n : null;
  }
  return null;
}

function isRedacted(v: unknown): boolean {
  return typeof v === "string" && /redact|\*\*\*|hidden|restricted|no disponible/i.test(v);
}

const KEYS = {
  sent: ["sent", "sends", "total_sent", "sent_count", "messages_sent", "envios"],
  delivered: ["delivered", "deliveries", "delivered_count"],
  bounces: ["bounces", "bounced", "bounce", "bounce_count", "total_bounces"],
  opens: ["unique_opens", "opens", "opened", "open_count"],
  clicks: ["unique_clicks", "clicks", "clicked", "click_count"],
  spam: ["spam", "spam_reports", "complaints", "spam_count"],
  unsubscribes: ["unsubscribes", "unsubscribed", "unsubscriptions", "optouts", "opt_outs"],
  conversions: ["conversions", "orders", "purchases", "transactions", "sales_count"],
  revenue: ["revenue", "attributed_revenue", "total_revenue", "sales_amount", "income"],
  campaigns: ["campaigns", "campaigns_count", "total_campaigns", "campaign_count"],
};

export function parseStats(payload: unknown, opts: { revenueRestricted?: boolean } = {}): Counts {
  const n = (k: keyof typeof KEYS) => num(pick(payload, KEYS[k])) ?? 0;
  const sent = n("sent");
  const bounces = n("bounces");
  const deliveredRaw = num(pick(payload, KEYS.delivered));
  const revRaw = pick(payload, KEYS.revenue);
  const redacted = Boolean(opts.revenueRestricted) || isRedacted(revRaw);
  return {
    sent,
    bounces,
    delivered: deliveredRaw ?? Math.max(sent - bounces, 0),
    opens: n("opens"),
    clicks: n("clicks"),
    spam: n("spam"),
    unsubscribes: n("unsubscribes"),
    conversions: n("conversions"),
    campaigns: n("campaigns"),
    revenue: redacted ? null : num(revRaw),
    revenueRedacted: redacted,
  };
}

export interface ParsedAccount {
  slug: string;
  name: string;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  status: string | null;
  role: string | null;
  channels: string[];
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** list_accounts → [{slug, name}] */
export function parseAccountList(payload: unknown): { slug: string; name: string }[] {
  const arr = Array.isArray(payload)
    ? payload
    : isObj(payload)
      ? ((payload.accounts ?? payload.data ?? payload.items ?? payload.results) as unknown[])
      : [];
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(isObj)
    .map((a) => ({
      slug: str(a.slug) ?? str(a.account_slug) ?? str(a.id) ?? "",
      name: str(a.name) ?? str(a.account_name) ?? str(a.slug) ?? "",
    }))
    .filter((a) => a.slug);
}

/** get_account → perfil normalizado */
export function parseAccount(slug: string, payload: unknown): ParsedAccount {
  const root = isObj(payload) ? ((isObj(payload.account) ? payload.account : payload) as Obj) : {};
  const chRaw = root.channels ?? root.enabled_channels ?? root.active_channels;
  let channels: string[] = [];
  if (Array.isArray(chRaw)) channels = chRaw.map((c) => (typeof c === "string" ? c : str((c as Obj)?.name) ?? "")).filter(Boolean);
  else if (isObj(chRaw)) channels = Object.entries(chRaw).filter(([, v]) => v === true || (isObj(v) && v.enabled === true)).map(([k]) => k);
  channels = channels.map((c) => c.toLowerCase()).filter((c) => ["email", "sms", "whatsapp", "push"].includes(c));
  return {
    slug,
    name: str(root.name) ?? str(root.account_name) ?? slug,
    country: str(root.country) ?? str(root.country_code),
    currency: str(root.currency) ?? str(root.currency_code),
    timezone: str(root.timezone) ?? str(root.time_zone),
    status: str(root.status),
    role: (str(root.role) ?? str(root.user_role))?.toUpperCase() ?? null,
    channels: channels.length ? channels : ["email"],
  };
}

export const RESTRICTED_ROLES = ["CONSULT", "OPERATOR"];

// ── Campañas ─────────────────────────────────────────────────────────
export const CAMPAIGNS_PAGE_SIZE = 100;

/** list_campaigns con stats del período (filter_by=activity, regla del proyecto). */
export function listCampaignsArgs(p: { from: string; to: string; page: number }) {
  return {
    from_date: p.from,
    to_date: p.to,
    filter_by: "activity",
    with_stats: true,
    limit: CAMPAIGNS_PAGE_SIZE,
    page: p.page,
  };
}

export interface ParsedCampaign extends Counts {
  campaignId: string;
  name: string;
  channel: string;
  groupType: "custom" | "triggered";
  campaignType: string | null;
  status: string | null;
  sentAt: string | null;
  subject: string | null;
  raw: unknown;
}

export function parseCampaignList(
  payload: unknown,
  opts: { revenueRestricted?: boolean } = {},
): { items: ParsedCampaign[]; hasMore: boolean | null } {
  const root = isObj(payload) ? payload : {};
  const arr = Array.isArray(payload)
    ? payload
    : ((root.campaigns ?? root.data ?? root.items ?? root.results) as unknown[]);
  if (!Array.isArray(arr)) return { items: [], hasMore: false };
  const items = arr.filter(isObj).map((c): ParsedCampaign => {
    const stats = c.stats ?? c.metrics ?? c.summary ?? c;
    const gt = String(c.group_type ?? c.groupType ?? c.group ?? "").toLowerCase();
    const sentRaw = str(c.sent_at) ?? str(c.send_date) ?? str(c.scheduled_at) ?? str(c.date) ?? str(c.created_at);
    return {
      ...parseStats(stats, opts),
      campaignId: String(c.id ?? c.campaign_id ?? c.uuid ?? ""),
      name: str(c.name) ?? str(c.title) ?? `Campaña ${c.id ?? ""}`,
      channel: (str(c.channel) ?? str(c.channel_type) ?? str(c.media) ?? "email").toLowerCase(),
      groupType: gt.includes("trigger") || gt.includes("auto") ? "triggered" : "custom",
      campaignType: str(c.campaign_type) ?? str(c.type),
      status: str(c.status),
      sentAt: sentRaw ? sentRaw.slice(0, 10) : null,
      subject: str(c.subject),
      raw: c,
    };
  }).filter((c) => c.campaignId);
  const meta = (isObj(root.pagination) ? root.pagination : isObj(root.meta) ? root.meta : root) as Obj;
  const hasMore =
    typeof meta.has_more === "boolean" ? meta.has_more
    : typeof meta.next === "string" || typeof meta.next_page === "number" ? true
    : typeof meta.total_pages === "number" && typeof meta.page === "number" ? (meta.page as number) < (meta.total_pages as number)
    : null; // desconocido → se decide por tamaño de página
  return { items, hasMore };
}
