import "server-only";
import { getMetrics } from "./data";
import { addMonths, currentMonth, isMonth, monthLabel, monthRange } from "./months";
import {
  CHANNELS, GROUP_TYPES, emptyCounts, kpis, sumCounts,
  type Channel, type Counts, type GroupType, type Kpis, type MetricRow,
} from "./metrics";
import type { Account } from "./types";

export interface Filters {
  month: string; // mes seleccionado YYYY-MM
  channel: Channel;
  groupType: GroupType;
}

/** Por defecto el último mes cerrado (el mes en curso está incompleto). */
export const defaultMonth = () => addMonths(currentMonth(), -1);

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const m = g("month");
  const month = isMonth(m) && m <= currentMonth() ? m : defaultMonth();
  const channel = (CHANNELS as readonly string[]).includes(g("channel") ?? "") ? (g("channel") as Channel) : "all";
  const groupType = (GROUP_TYPES as readonly string[]).includes(g("type") ?? "") ? (g("type") as GroupType) : "all";
  return { month, channel, groupType };
}

export const filtersQs = (f: Filters) =>
  new URLSearchParams({ month: f.month, channel: f.channel, type: f.groupType }).toString();

export const monthTitle = (m: string) => `${monthLabel(m)} ${m.slice(0, 4)}`;

/** Moneda única del conjunto, o "MIXED" si mezcla monedas (no se suman revenues). */
export function commonCurrency(accounts: Account[]): string | null | "MIXED" {
  const set = new Set(accounts.map((a) => a.currency ?? "?"));
  if (set.size === 0) return null;
  return set.size === 1 ? [...set][0] : "MIXED";
}

export interface MonthPoint extends Counts {
  month: string;
  k: Kpis;
  autoRevenueShare: number | null;
}

export type Snapshot = Counts & { k: Kpis; autoRevenueShare: number | null; complete: boolean; month: string };

export interface MonthView {
  current: Snapshot;
  prev: Snapshot; // mes anterior
  yoy: Snapshot; // mismo mes del año anterior
  history: MonthPoint[]; // 12 meses que terminan en el mes elegido
  byAccount: Map<string, Snapshot>; // mes elegido, por marca
  partial: boolean; // el mes elegido es el mes en curso
}

/** true si cada cuenta tiene envíos en ese mes (evita comparar contra huecos). */
function covered(rows: MetricRow[], slugs: string[], month: string) {
  return slugs.length > 0 && slugs.every((s) => rows.some((r) => r.accountSlug === s && r.month === month && r.sent > 0));
}

export async function buildMonthView(accounts: Account[], f: Filters): Promise<MonthView> {
  const slugs = accounts.map((a) => a.slug);
  const from = addMonths(f.month, -12); // incluye el mismo mes del año anterior
  const q = { accountSlugs: slugs, from, to: f.month, channel: f.channel };
  const [rows, autoRows, allTypeRows] = await Promise.all([
    getMetrics({ ...q, groupType: f.groupType }),
    getMetrics({ ...q, groupType: "triggered" }),
    f.groupType === "all" ? Promise.resolve(null) : getMetrics({ ...q, groupType: "all" }),
  ]);
  const baseRows = allTypeRows ?? rows;

  const snap = (month: string, subset = slugs): Snapshot => {
    const inM = (r: MetricRow) => r.month === month && subset.includes(r.accountSlug);
    const c = sumCounts(rows.filter(inM));
    const auto = sumCounts(autoRows.filter(inM));
    const all = sumCounts(baseRows.filter(inM));
    return {
      ...c, month, k: kpis(c),
      autoRevenueShare: auto.revenue != null && all.revenue ? auto.revenue / all.revenue : null,
      complete: covered(rows, subset, month),
    };
  };

  const history = monthRange(addMonths(f.month, -11), f.month).map((m) => {
    const s = snap(m);
    return { ...s } as MonthPoint;
  });
  const byAccount = new Map<string, Snapshot>(slugs.map((s) => [s, snap(f.month, [s])]));
  return {
    current: snap(f.month),
    prev: snap(addMonths(f.month, -1)),
    yoy: snap(addMonths(f.month, -12)),
    history,
    byAccount,
    partial: f.month === currentMonth(),
  };
}

export { emptyCounts };
