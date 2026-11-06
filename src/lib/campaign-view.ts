import "server-only";
import { getCampaigns } from "./data";
import type { CampaignItem } from "@/components/CampaignsTable";
import type { Account } from "./types";

/** Campañas del mes listas para la UI (con marca, moneda y link a la ficha). */
export async function campaignItems(accounts: Account[], month: string, qs: string): Promise<CampaignItem[]> {
  const bySlug = new Map(accounts.map((a) => [a.slug, a]));
  const rows = await getCampaigns({ accountSlugs: accounts.map((a) => a.slug), month });
  return rows.map((c) => ({
    ...c,
    brandName: bySlug.get(c.accountSlug)?.name,
    currency: bySlug.get(c.accountSlug)?.currency ?? null,
    href: `/cuentas/${c.accountSlug}/campanas/${encodeURIComponent(c.campaignId)}?${qs}`,
  }));
}
