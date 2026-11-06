import "server-only";
import { and, asc, desc, eq, getTableColumns, gte, inArray, lte } from "drizzle-orm";
import { db, hasDatabase, schema } from "@/db/client";
import { DEMO_ACCOUNTS, DEMO_GROUPS, demoCampaigns, demoRows } from "./demo";
import type { Channel, GroupType, MetricRow } from "./metrics";
import type { Account, CampaignRow, Group, GroupWithAccounts, SyncRun } from "./types";

import snapshotJson from "../../data/snapshot.json";

/** Datos tomados del MCP de WoowUp y guardados en el repo (scripts/build-snapshot.mjs). */
interface Snapshot {
  generatedAt?: string;
  source?: string;
  scope?: string;
  campaignMonths?: string[];
  groups?: Group[];
  accounts?: Account[];
  rows?: MetricRow[];
  campaigns?: CampaignRow[];
}
const SNAP = snapshotJson as unknown as Snapshot;

/** db = Postgres sincronizado · snapshot = carga desde el MCP guardada en el repo · demo = datos ficticios */
export function dataMode(): "db" | "snapshot" | "demo" {
  if (hasDatabase()) return "db";
  return SNAP.accounts && SNAP.accounts.length > 0 ? "snapshot" : "demo";
}
export const isDemo = () => dataMode() === "demo";
export const isReadOnly = () => !hasDatabase();
export const snapshotInfo = () => (dataMode() === "snapshot" ? { generatedAt: SNAP.generatedAt ?? null, scope: SNAP.scope ?? null, source: SNAP.source ?? null } : null);

let _demoCache: MetricRow[] | null = null;
const demoData = () => (_demoCache ??= demoRows());
/** Fuente en memoria cuando no hay base de datos. */
function src() {
  if (dataMode() === "snapshot") {
    return { groups: SNAP.groups ?? [], accounts: SNAP.accounts ?? [], rows: SNAP.rows ?? [], campaigns: SNAP.campaigns ?? [] };
  }
  return { groups: DEMO_GROUPS, accounts: DEMO_ACCOUNTS, rows: demoData(), campaigns: demoCampaigns() };
}

export async function getGroups(): Promise<Group[]> {
  if (!hasDatabase()) return src().groups;
  return db().select().from(schema.accountGroups).orderBy(asc(schema.accountGroups.name));
}

export async function getAccounts(opts: { includeHidden?: boolean } = {}): Promise<Account[]> {
  if (!hasDatabase()) return src().accounts;
  const rows = await db().select().from(schema.accounts).orderBy(asc(schema.accounts.name));
  return opts.includeHidden ? rows : rows.filter((a) => !a.hidden);
}

/** Árbol: cuentas madre con sus marcas + cuentas sueltas (sin madre). */
export async function getTree(): Promise<{ groups: GroupWithAccounts[]; standalone: Account[] }> {
  const [groups, accounts] = await Promise.all([getGroups(), getAccounts()]);
  return {
    groups: groups.map((g) => ({ ...g, accounts: accounts.filter((a) => a.groupSlug === g.slug) })),
    standalone: accounts.filter((a) => !a.groupSlug || !groups.some((g) => g.slug === a.groupSlug)),
  };
}

export async function getMetrics(q: {
  accountSlugs: string[];
  from: string;
  to: string;
  channel?: Channel;
  groupType?: GroupType;
}): Promise<MetricRow[]> {
  if (q.accountSlugs.length === 0) return [];
  const channel = q.channel ?? "all";
  const groupType = q.groupType ?? "all";
  if (!hasDatabase()) {
    return src().rows.filter(
      (r) =>
        q.accountSlugs.includes(r.accountSlug) && r.month >= q.from && r.month <= q.to &&
        r.channel === channel && r.groupType === groupType,
    );
  }
  const m = schema.monthlyMetrics;
  const rows = await db()
    .select()
    .from(m)
    .where(
      and(
        inArray(m.accountSlug, q.accountSlugs),
        gte(m.month, q.from),
        lte(m.month, q.to),
        eq(m.channel, channel),
        eq(m.groupType, groupType),
      ),
    )
    .orderBy(asc(m.month));
  return rows.map((r) => ({ ...r, channel: r.channel as Channel, groupType: r.groupType as GroupType }));
}

export async function getSyncRuns(limit = 15): Promise<SyncRun[]> {
  if (!hasDatabase()) {
    if (dataMode() !== "snapshot" || !SNAP.generatedAt) return [];
    const at = new Date(SNAP.generatedAt);
    return [{ id: 0, trigger: "mcp", months: SNAP.campaignMonths ?? [], startedAt: at, finishedAt: at, status: "ok", accountsOk: SNAP.accounts?.length ?? 0, accountsFailed: 0, errors: [] }];
  }
  return db().select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(limit);
}

const toCampaign = (r: Omit<typeof schema.campaignMetrics.$inferSelect, "raw">): CampaignRow => ({
  accountSlug: r.accountSlug, month: r.month, campaignId: r.campaignId, name: r.name, channel: r.channel,
  groupType: r.groupType === "triggered" ? "triggered" : "custom", campaignType: r.campaignType, status: r.status,
  sentAt: r.sentAt, subject: r.subject, sent: r.sent, delivered: r.delivered, bounces: r.bounces, opens: r.opens,
  clicks: r.clicks, spam: r.spam, unsubscribes: r.unsubscribes, conversions: r.conversions, revenue: r.revenue,
  revenueRedacted: r.revenueRedacted, campaigns: 1,
});

/** Columnas de campañas sin la respuesta cruda (raw), que solo sirve para auditoría. */
function campaignCols() {
  const { raw: _raw, ...cols } = getTableColumns(schema.campaignMetrics);
  return cols;
}

/** Campañas con actividad en un mes, para un conjunto de cuentas. */
export async function getCampaigns(q: { accountSlugs: string[]; month: string }): Promise<CampaignRow[]> {
  if (q.accountSlugs.length === 0) return [];
  if (!hasDatabase()) return src().campaigns.filter((c) => q.accountSlugs.includes(c.accountSlug) && c.month === q.month);
  const c = schema.campaignMetrics;
  const rows = await db().select(campaignCols()).from(c).where(and(inArray(c.accountSlug, q.accountSlugs), eq(c.month, q.month)));
  return rows.map(toCampaign);
}

/** Historia mensual de una campaña (útil para automatizaciones). */
export async function getCampaignHistory(accountSlug: string, campaignId: string): Promise<CampaignRow[]> {
  if (!hasDatabase()) return src().campaigns.filter((c) => c.accountSlug === accountSlug && c.campaignId === campaignId).sort((a, b) => a.month.localeCompare(b.month));
  const c = schema.campaignMetrics;
  const rows = await db().select(campaignCols()).from(c).where(and(eq(c.accountSlug, accountSlug), eq(c.campaignId, campaignId))).orderBy(asc(c.month));
  return rows.map(toCampaign);
}

/** Todas las combinaciones canal × tipo para un rango (insumo de los insights). */
export async function getMetricsAll(q: { accountSlugs: string[]; from: string; to: string }): Promise<MetricRow[]> {
  if (q.accountSlugs.length === 0) return [];
  if (!hasDatabase()) return src().rows.filter((r) => q.accountSlugs.includes(r.accountSlug) && r.month >= q.from && r.month <= q.to);
  const m = schema.monthlyMetrics;
  const rows = await db()
    .select()
    .from(m)
    .where(and(inArray(m.accountSlug, q.accountSlugs), gte(m.month, q.from), lte(m.month, q.to)));
  return rows.map((r) => ({ ...r, channel: r.channel as Channel, groupType: r.groupType as GroupType }));
}

/** Campañas de un rango de meses (para comparar automatizaciones contra su propia historia). */
export async function getCampaignsRange(q: { accountSlugs: string[]; from: string; to: string }): Promise<CampaignRow[]> {
  if (q.accountSlugs.length === 0) return [];
  if (!hasDatabase()) return src().campaigns.filter((c) => q.accountSlugs.includes(c.accountSlug) && c.month >= q.from && c.month <= q.to);
  const c = schema.campaignMetrics;
  const rows = await db()
    .select(campaignCols())
    .from(c)
    .where(and(inArray(c.accountSlug, q.accountSlugs), gte(c.month, q.from), lte(c.month, q.to)));
  return rows.map(toCampaign);
}

export type ActionStatus = "pendiente" | "en_curso" | "hecho" | "descartado";

/** Estado guardado de las mejoras de una cuenta o cuenta madre. */
export async function getActionStatuses(scopeKey: string): Promise<Record<string, ActionStatus>> {
  if (!hasDatabase()) return {};
  const t = schema.actionItems;
  const rows = await db().select().from(t).where(eq(t.scopeKey, scopeKey));
  return Object.fromEntries(rows.map((r) => [r.insightId, r.status as ActionStatus]));
}
