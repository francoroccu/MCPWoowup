import "server-only";
import { getMetrics } from "./data";
import { addMonths, defaultRange, isMonth, monthRange } from "./months";
import {
  CHANNELS, GROUP_TYPES, emptyCounts, kpis, sumCounts,
  type Channel, type Counts, type GroupType, type Kpis, type MetricRow,
} from "./metrics";
import type { Account } from "./types";

export interface Filters {
  from: string;
  to: string;
  channel: Channel;
  groupType: GroupType;
}

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const d = defaultRange();
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  let from = isMonth(g("from")) ? g("from")! : d.from;
  let to = isMonth(g("to")) ? g("to")! : d.to;
  if (from > to) [from, to] = [to, from];
  const channel = (CHANNELS as readonly string[]).includes(g("channel") ?? "") ? (g("channel") as Channel) : "all";
  const groupType = (GROUP_TYPES as readonly string[]).includes(g("type") ?? "") ? (g("type") as GroupType) : "all";
  return { from, to, channel, groupType };
}

/** Moneda única del conjunto, o null si mezcla monedas (no se suman revenues). */
export function commonCurrency(accounts: Account[]): string | null | "MIXED" {
  const set = new Set(accounts.map((a) => a.currency ?? "?"));
  if (set.size === 0) return null;
  return set.size === 1 ? [...set][0] : "MIXED";
}

export interface MonthPoint extends Counts {
  month: string;
  k: Kpis;
  autoRevenueShare: number | null; // revenue automatizaciones / revenue total
}

export interface SeriesBundle {
  months: string[];
  series: MonthPoint[];
  total: Counts & { k: Kpis; autoRevenueShare: number | null };
  prevTotal: Counts & { k: Kpis; complete: boolean };
  byAccount: Map<string, MetricRow[]>;
}

/** Arma la serie mensual (sumando cuentas) + total del rango + total del período previo equivalente. */
export async function buildSeries(accounts: Account[], f: Filters): Promise<SeriesBundle> {
  const slugs = accounts.map((a) => a.slug);
  const months = monthRange(f.from, f.to);
  const prevFrom = addMonths(f.from, -months.length);
  const prevTo = addMonths(f.from, -1);

  const [rows, prevRows, autoRows, allTypeRows] = await Promise.all([
    getMetrics({ accountSlugs: slugs, from: f.from, to: f.to, channel: f.channel, groupType: f.groupType }),
    getMetrics({ accountSlugs: slugs, from: prevFrom, to: prevTo, channel: f.channel, groupType: f.groupType }),
    getMetrics({ accountSlugs: slugs, from: f.from, to: f.to, channel: f.channel, groupType: "triggered" }),
    f.groupType === "all"
      ? Promise.resolve(null)
      : getMetrics({ accountSlugs: slugs, from: f.from, to: f.to, channel: f.channel, groupType: "all" }),
  ]);
  const baseRows = allTypeRows ?? rows;

  const share = (auto: Counts, all: Counts) =>
    auto.revenue != null && all.revenue ? auto.revenue / all.revenue : null;

  const series: MonthPoint[] = months.map((month) => {
    const c = rows.length ? sumCounts(rows.filter((r) => r.month === month)) : emptyCounts();
    return {
      month, ...c, k: kpis(c),
      autoRevenueShare: share(
        sumCounts(autoRows.filter((r) => r.month === month)),
        sumCounts(baseRows.filter((r) => r.month === month)),
      ),
    };
  });
  const total = sumCounts(rows);
  const prev = sumCounts(prevRows);
  const byAccount = new Map<string, MetricRow[]>();
  for (const r of rows) byAccount.set(r.accountSlug, [...(byAccount.get(r.accountSlug) ?? []), r]);

  return {
    months,
    series,
    total: { ...total, k: kpis(total), autoRevenueShare: share(sumCounts(autoRows), sumCounts(baseRows)) },
    prevTotal: { ...prev, k: kpis(prev), complete: hasFullCoverage(prevRows, slugs, months.length) },
    byAccount,
  };
}

/** true si cada cuenta tiene datos en todos los meses del período (evita comparar contra huecos). */
export function hasFullCoverage(rows: MetricRow[], slugs: string[], monthsCount: number): boolean {
  if (slugs.length === 0) return false;
  return slugs.every((s) => new Set(rows.filter((r) => r.accountSlug === s && r.sent > 0).map((r) => r.month)).size >= monthsCount);
}
