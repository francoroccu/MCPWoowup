/**
 * Sincronización WoowUp (MCP) → Postgres.
 * Por cada cuenta: switch_account → get_account (confirmación) → stats mensuales.
 * Combinaciones guardadas por mes: total, cada canal habilitado, one-shot vs
 * automatizaciones, y canal × tipo (para poder filtrar ambas cosas a la vez).
 */
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { monthBounds } from "../months";
import { WoowUpSession } from "./client";
import {
  RESTRICTED_ROLES, TOOLS, parseAccount, parseAccountList, parseStats, statsArgs, switchArgs,
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
            await syncAccount(session, item.slug, item.name, opts.months, log);
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
  s: WoowUpSession, slug: string, listedName: string, months: string[], log: (m: string) => void,
) {
  await s.call(TOOLS.switchAccount, switchArgs(slug));
  const profile = parseAccount(slug, await s.call(TOOLS.getAccount));
  if (profile.name === slug && listedName) profile.name = listedName;
  const restricted = profile.role ? RESTRICTED_ROLES.includes(profile.role) : false;

  const d = db();
  await d
    .insert(schema.accounts)
    .values({ ...profile, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.accounts.slug,
      set: {
        name: profile.name, country: profile.country, currency: profile.currency, timezone: profile.timezone,
        status: profile.status, role: profile.role, channels: profile.channels, updatedAt: new Date(),
      },
    });

  const combos: { channel: string; groupType: string }[] = [];
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
    log(`✓ ${slug} ${month} (${combos.length} combinaciones)`);
  }
}
