/**
 * Sincronización WoowUp (MCP) → Postgres.
 * Por cada cuenta: switch_account → get_account (confirmación) → stats mensuales.
 * Combinaciones guardadas por mes: total, cada canal habilitado, one-shot vs
 * automatizaciones, y canal × tipo (para poder filtrar ambas cosas a la vez).
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { monthBounds } from "../months";
import { WoowUpSession } from "./client";
import {
  CAMPAIGNS_PAGE_SIZE, RESTRICTED_ROLES, TOOLS, listCampaignsArgs, parseAccount, parseAccountList, parseCampaignList, splitAccountName,
  parseStats, statsArgs, switchArgs,
} from "./mapping";

export interface SyncOptions {
  months: string[];
  trigger: "cron" | "manual" | "cli";
  accounts?: string[]; // limitar a slugs específicos
  concurrency?: number;
  log?: (msg: string) => void;
}

export interface SyncResult {
  runId: number;
  ok: string[];
  failed: { account: string; message: string }[];
}

const GROUP_TYPES = ["all", "custom", "triggered"] as const;

export async function runSync(opts: SyncOptions): Promise<SyncResult> {
  const log = opts.log ?? (() => {});
  const d = db();
  const [run] = await d
    .insert(schema.syncRuns)
    .values({ trigger: opts.trigger, months: opts.months, status: "running" })
    .returning({ id: schema.syncRuns.id });

  const ok: string[] = [];
  const failed: { account: string; message: string }[] = [];

  try {
    const first = await WoowUpSession.open();
    let list = parseAccountList(await first.call(TOOLS.listAccounts));
    if (opts.accounts?.length) list = list.filter((a) => opts.accounts!.includes(a.slug));
    log(`Cuentas a sincronizar: ${list.length} · meses: ${opts.months.join(", ")}`);

    const queue = [...list];
    const concurrency = Math.max(1, Math.min(opts.concurrency ?? Number(process.env.SYNC_CONCURRENCY ?? 3), 6));
    const sessions: WoowUpSession[] = [first];
    for (let i = 1; i < Math.min(concurrency, queue.length); i++) sessions.push(await WoowUpSession.open());

    await Promise.all(
      sessions.map(async (session) => {
        while (queue.length) {
          const item = queue.shift()!;
          try {
            await syncAccount(session, item.slug, item, opts.months, log);
            ok.push(item.slug);
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            failed.push({ account: item.slug, message });
            log(`✗ ${item.slug}: ${message}`);
          }
        }
      }),
    );
    await Promise.all(sessions.map((s) => s.close()));
  } catch (e) {
    failed.push({ account: "*", message: e instanceof Error ? e.message : String(e) });
  }

  const status = failed.length === 0 ? "ok" : ok.length ? "partial" : "error";
  await d
    .update(schema.syncRuns)
    .set({ status, finishedAt: new Date(), accountsOk: ok.length, accountsFailed: failed.length, errors: failed })
    .where(eq(schema.syncRuns.id, run.id));
  return { runId: run.id, ok, failed };
}

async function syncAccount(
  s: WoowUpSession, slug: string, listed: { name: string; role: string | null }, months: string[], log: (m: string) => void,
) {
  await s.call(TOOLS.switchAccount, switchArgs(slug));
  const profile = parseAccount(slug, await s.call(TOOLS.getAccount), listed);
  // "Converse [Comercial depor]" → marca Converse dentro de la cuenta madre Comercial Depor
  const { brand, group } = splitAccountName(profile.name);
  profile.name = brand;
  const groupSlug = group ? group.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") : null;
  if (group && groupSlug) await db().insert(schema.accountGroups).values({ slug: groupSlug, name: group }).onConflictDoNothing();
  const restricted = profile.role ? RESTRICTED_ROLES.includes(profile.role) : false;

  const d = db();
  await d
    .insert(schema.accounts)
    .values({ ...profile, groupSlug, updatedAt: new Date() })
    .onConflictDoUpdate({
      // nombre y cuenta madre no se pisan: pueden haberse editado en Administración
      target: schema.accounts.slug,
      set: {
        country: profile.country, currency: profile.currency, timezone: profile.timezone,
        status: profile.status, role: profile.role, updatedAt: new Date(),
      },
    });
  const known = await d.select({ channels: schema.accounts.channels }).from(schema.accounts).where(eq(schema.accounts.slug, slug));
  profile.channels = known[0]?.channels ?? [];

  const combos: { channel: string; groupType: string }[] = [];
  const seenChannels = new Set<string>(profile.channels);
  for (const channel of ["all", ...profile.channels]) for (const groupType of GROUP_TYPES) combos.push({ channel, groupType });

  for (const month of months) {
    const { from, to } = monthBounds(month);
    const rows = [];
    for (const c of combos) {
      const payload = await s.call(TOOLS.stats, statsArgs({ from, to, channel: c.channel, groupType: c.groupType }));
      const counts = parseStats(payload, { revenueRestricted: restricted });
      rows.push({ accountSlug: slug, month, channel: c.channel, groupType: c.groupType, ...counts, raw: payload as object, syncedAt: new Date() });
    }
    await d
      .insert(schema.monthlyMetrics)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.monthlyMetrics.accountSlug, schema.monthlyMetrics.month, schema.monthlyMetrics.channel, schema.monthlyMetrics.groupType],
        set: {
          sent: sql`excluded.sent`, delivered: sql`excluded.delivered`, bounces: sql`excluded.bounces`,
          opens: sql`excluded.opens`, clicks: sql`excluded.clicks`, spam: sql`excluded.spam`,
          unsubscribes: sql`excluded.unsubscribes`, conversions: sql`excluded.conversions`,
          revenue: sql`excluded.revenue`, revenueRedacted: sql`excluded.revenue_redacted`,
          campaigns: sql`excluded.campaigns`, raw: sql`excluded.raw`, syncedAt: sql`excluded.synced_at`,
        },
      });
    const { count: nCampaigns, channels } = await syncCampaigns(s, slug, month, from, to, restricted);
    channels.forEach((c) => seenChannels.add(c));
    log(`✓ ${slug} ${month} (${combos.length} combinaciones, ${nCampaigns} campañas)`);
  }
  // canales reales deducidos de las campañas (el campo features de WoowUp no es confiable)
  await d.update(schema.accounts).set({ channels: [...seenChannels].filter((c) => ["email", "sms", "whatsapp", "push"].includes(c)) }).where(eq(schema.accounts.slug, slug));
}

/** Reemplaza las campañas del mes de una cuenta con lo que devuelve list_campaigns (paginado). */
async function syncCampaigns(
  s: WoowUpSession, slug: string, month: string, from: string, to: string, restricted: boolean,
): Promise<{ count: number; channels: string[] }> {
  const all = [];
  for (let page = 0; page < 30; page++) {
    const { items, hasMore } = parseCampaignList(await s.call(TOOLS.listCampaigns, listCampaignsArgs({ from, to, page })), {
      revenueRestricted: restricted,
    });
    all.push(...items);
    if (hasMore === false || (hasMore === null && items.length < CAMPAIGNS_PAGE_SIZE) || items.length === 0) break;
  }
  // dedupe por id (por si la paginación repite)
  const unique = [...new Map(all.map((c) => [c.campaignId, c])).values()];
  const d = db();
  const t = schema.campaignMetrics;
  await d.delete(t).where(and(eq(t.accountSlug, slug), eq(t.month, month)));
  for (let i = 0; i < unique.length; i += 200) {
    await d.insert(t).values(
      unique.slice(i, i + 200).map(({ campaigns: _c, raw, ...c }) => ({
        ...c, accountSlug: slug, month, raw: raw as object, syncedAt: new Date(),
      })),
    );
  }
  return { count: unique.length, channels: [...new Set(unique.map((c) => c.channel))] };
}
