/**
 * Arma data/snapshot.json a partir de los datos tomados del MCP de WoowUp
 * (data/raw/*.txt = métricas mensuales por tipo; data/raw/campaigns/*.tsv = campañas).
 * La plataforma usa este snapshot cuando no hay base de datos conectada.
 *   node scripts/build-snapshot.mjs
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const RAW = "data/raw";
const COUNTRY = { CHL: ["CL", "CLP"], PER: ["PE", "PEN"], ARG: ["AR", "ARS"], COL: ["CO", "COP"], MEX: ["MX", "MXN"] };

// Perfil tomado de list_accounts / get_account (data/raw/accounts.tsv). La moneda se infiere del país:
// WoowUp informa "USD" en estas cuentas, pero los montos están en moneda local.
const ACCOUNTS = Object.fromEntries(
  readFileSync(`${RAW}/accounts.tsv`, "utf8").trim().split("\n").slice(1).map((l) => {
    const [slug, id, name, country, rol] = l.split("\t");
    return [slug, { id: Number(id), name, country, role: Number(rol) }];
  }),
);
const ROLE = { 1: "CONSULT", 2: "OPERATOR", 7: "ANALYTICS", 8: "ADMIN", 9: "OWNER" };
const TYPE = {
  "customer-created": "welcome", "abandoned-cart": "abandoned_cart", "browser-abandonment-product": "browse_abandonment",
  "risky-customers": "winback", "customer-birthday": "birthday", "last-purchase": "post_purchase",
  "lost-customers": "winback", "browser-abandonment-category": "browse_abandonment",
  "browser-abandonment-product-low-price": "price_drop", "first-purchase": "anniversary",
};

const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
/** "Converse [Comercial depor]" → { brand: "Converse", group: "Comercial Depor" } */
function splitName(full) {
  const m = full.match(/^\s*(.*?)\s*\[(.+)\]\s*$/);
  if (!m) return { brand: full.trim(), group: null };
  const group = m[2].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  return { brand: m[1].trim(), group };
}

const groups = new Map();
const accounts = [];
for (const [slug, a] of Object.entries(ACCOUNTS)) {
  const { brand, group } = splitName(a.name);
  const groupSlug = group ? slugify(group) : null;
  if (group) groups.set(groupSlug, { slug: groupSlug, name: group });
  const [country, currency] = COUNTRY[a.country] ?? [a.country, null];
  accounts.push({
    slug, name: brand, groupSlug, country, currency, timezone: null, status: "active",
    role: ROLE[a.role] ?? null, channels: [], hidden: false, woowupId: a.id,
  });
}

const rows = [];
const empty = () => ({ sent: 0, delivered: 0, bounces: 0, opens: 0, clicks: 0, spam: 0, unsubscribes: 0, conversions: 0, revenue: 0, revenueRedacted: false, campaigns: 0 });
for (const file of readdirSync(RAW).filter((f) => f.endsWith(".txt"))) {
  const slug = file.replace(/\.txt$/, "");
  const byMonth = new Map();
  for (const line of readFileSync(`${RAW}/${file}`, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [month, gt, sent, bounce, open, clicked, spam, unsub, revenue, tickets] = line.trim().split(/\s+/);
    const n = (x) => Number(x);
    const r = {
      accountSlug: slug, month, channel: "all", groupType: gt,
      sent: n(sent), bounces: n(bounce), delivered: Math.max(n(sent) - n(bounce), 0), opens: n(open), clicks: n(clicked),
      spam: n(spam), unsubscribes: n(unsub), conversions: n(tickets), revenue: n(revenue), revenueRedacted: false, campaigns: 0,
    };
    rows.push(r);
    const all = byMonth.get(month) ?? { ...empty(), accountSlug: slug, month, channel: "all", groupType: "all" };
    for (const k of ["sent", "delivered", "bounces", "opens", "clicks", "spam", "unsubscribes", "conversions", "revenue"]) all[k] += r[k];
    byMonth.set(month, all);
  }
  rows.push(...byMonth.values());
}

const campaigns = [];
const campDir = `${RAW}/campaigns`;
if (existsSync(campDir)) {
  for (const file of readdirSync(campDir).filter((f) => f.endsWith(".tsv"))) {
    const month = file.replace(/\.tsv$/, "");
    const [header, ...lines] = readFileSync(`${campDir}/${file}`, "utf8").trim().split("\n");
    const cols = header.split("\t");
    for (const line of lines) {
      const v = Object.fromEntries(line.split("\t").map((x, i) => [cols[i], x]));
      const n = (k) => Number(v[k] || 0);
      campaigns.push({
        accountSlug: v.account, month, campaignId: v.id, name: v.name, channel: v.channel,
        groupType: v.type === "custom" ? "custom" : "triggered", campaignType: TYPE[v.type] ?? v.type,
        status: null, sentAt: v.sent_at || null, subject: null,
        sent: n("sent"), bounces: n("bounce"), delivered: Math.max(n("sent") - n("bounce"), 0), opens: n("open"), clicks: n("clicked"),
        spam: n("spam"), unsubscribes: n("unsubscribe"), conversions: n("tickets"), revenue: n("revenue"), revenueRedacted: false, campaigns: 1,
      });
    }
  }
}
// Las cuentas sin campañas one-shot cuentan como "campañas" las del detalle cargado
for (const c of campaigns) {
  const r = rows.find((x) => x.accountSlug === c.accountSlug && x.month === c.month && x.channel === "all" && x.groupType === c.groupType);
  if (r) r.campaigns++;
  const a = rows.find((x) => x.accountSlug === c.accountSlug && x.month === c.month && x.channel === "all" && x.groupType === "all");
  if (a) a.campaigns++;
}

const SCOPE = `${accounts.length} cuentas (todas las de WoowUp) · métricas ene–nov 2026 (nov parcial al 06/11) · detalle de campañas: octubre 2026 en todas las marcas (top 12 por revenue)`;
const snapshot = {
  generatedAt: new Date().toISOString(),
  source: "MCP de WoowUp (get_campaigns_stats y list_campaigns, filter_by=activity)",
  scope: SCOPE,
  campaignMonths: [...new Set(campaigns.map((c) => c.month))],
  groups: [...groups.values()],
  accounts,
  rows,
  campaigns,
};
writeFileSync("data/snapshot.json", JSON.stringify(snapshot));
console.log(`snapshot: ${accounts.length} cuentas, ${groups.size} grupos, ${rows.length} filas, ${campaigns.length} campañas`);
