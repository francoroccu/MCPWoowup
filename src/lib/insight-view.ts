import "server-only";
import { dataMode, getActionStatuses, getCampaignsRange, getMetricsAll, isReadOnly } from "./data";
import { buildInsights, type Insight } from "./insights";
import { addMonths, currentMonth } from "./months";
import type { Account } from "./types";

/** Insights del mes (todos los canales y tipos) + estado guardado del plan de mejoras. */
export async function loadInsights(scope: "account" | "group", scopeSlug: string, accounts: Account[], month: string, qs: string) {
  const slugs = accounts.map((a) => a.slug);
  const [rows, campaigns, statuses] = await Promise.all([
    getMetricsAll({ accountSlugs: slugs, from: addMonths(month, -12), to: month }),
    getCampaignsRange({ accountSlugs: slugs, from: addMonths(month, -3), to: month }),
    getActionStatuses(`${scope === "group" ? "g" : "a"}:${scopeSlug}`),
  ]);
  const insights: Insight[] = buildInsights({
    scope, month, accounts, rows, campaigns, partial: month === currentMonth(), qs,
    campaignsComplete: dataMode() !== "snapshot",
  });
  return { insights, statuses, scopeKey: `${scope === "group" ? "g" : "a"}:${scopeSlug}`, persist: !isReadOnly() };
}
