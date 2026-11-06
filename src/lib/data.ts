import "server-only";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, hasDatabase, schema } from "@/db/client";
import { DEMO_ACCOUNTS, DEMO_GROUPS, demoCampaigns, demoRows } from "./demo";
import type { Channel, GroupType, MetricRow } from "./metrics";
import type { Account, CampaignRow, Group, GroupWithAccounts, SyncRun } from "./types";

export const isDemo = () => !hasDatabase();

let _demoCache: MetricRow[] | null = null;
const demoData = () => (_demoCache ??= demoRows());

export async function getGroups(): Promise<Group[]> {
  if (isDemo()) return DEMO_GROUPS;
  return db().select().from(schema.accountGroups).orderBy(asc(schema.accountGroups.name));
}

export async function getAccounts(opts: { includeHidden?: boolean } = {}): Promise<Account[]> {
  if (isDemo()) return DEMO_ACCOUNTS;
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
  if (isDemo()) {
    return demoData().filter(
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
  if (isDemo()) return [];
  return db().select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.id)).limit(limit);
}

const toCampaign = (r: typeof schema.campaignMetrics.$inferSelect): CampaignRow => ({
  accountSlug: r.accountSlug, month: r.month, campaignId: r.campaignId, name: r.name, channel: r.channel,
  groupType: r.groupType === "triggered" ? "triggered" : "custom", campaignType: r.campaignType, status: r.status,
  sentAt: r.sentAt, subject: r.subject, sent: r.sent, delivered: r.delivered, bounces: r.bounces, opens: r.opens,
  clicks: r.clicks, spam: r.spam, unsubscribes: r.unsubscribes, conversions: r.conversions, revenue: r.revenue,
  revenueRedacted: r.revenueRedacted, campaigns: 1,
});

/** Campañas con actividad en un mes, para un conjunto de cuentas. */
export async function getCampaigns(q: { accountSlugs: string[]; month: string }): Promise<CampaignRow[]> {
  if (q.accountSlugs.length === 0) return [];
  if (isDemo()) return demoCampaigns().filter((c) => q.accountSlugs.includes(c.accountSlug) && c.month === q.month);
  const c = schema.campaignMetrics;
  const rows = await db().select().from(c).where(and(inArray(c.accountSlug, q.accountSlugs), eq(c.month, q.month)));
  return rows.map(toCampaign);
}

/** Historia mensual de una campaña (útil para automatizaciones). */
export async function getCampaignHistory(accountSlug: string, campaignId: string): Promise<CampaignRow[]> {
  if (isDemo()) return demoCampaigns().filter((c) => c.accountSlug === accountSlug && c.campaignId === campaignId).sort((a, b) => a.month.localeCompare(b.month));
  const c = schema.campaignMetrics;
  const rows = await db().select().from(c).where(and(eq(c.accountSlug, accountSlug), eq(c.campaignId, campaignId))).orderBy(asc(c.month));
  return rows.map(toCampaign);
}
