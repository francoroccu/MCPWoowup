import { notFound } from "next/navigation";
import { getAccounts, getGroups, getMetrics } from "@/lib/data";
import { FiltersBar } from "@/components/FiltersBar";
import { KpiCards } from "@/components/KpiCards";
import { MonthlyTable } from "@/components/MonthlyTable";
import { TrendChart } from "@/components/Charts";
import { Badge, PageHeader } from "@/components/PageHeader";
import { CampaignHighlights } from "@/components/CampaignHighlights";
import { CampaignsTable } from "@/components/CampaignsTable";
import { CampaignScopeNote } from "@/components/CampaignScopeNote";
import {
  CHANNEL_LABEL, GROUP_TYPE_LABEL, fmtInt, fmtMoney, fmtPct, kpis, sumCounts, type Channel, type Counts, type GroupType,
} from "@/lib/metrics";
import { monthLabel } from "@/lib/months";
import { buildMonthView, filtersQs, monthTitle, parseFilters } from "@/lib/views";
import { campaignItems } from "@/lib/campaign-view";
import { loadInsights } from "@/lib/insight-view";
import { InsightsPanel } from "@/components/InsightsPanel";
import { ActionPlan } from "@/components/ActionPlan";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug } = await params;
  const f = parseFilters(await searchParams);
  const [accounts, groups] = await Promise.all([getAccounts({ includeHidden: true }), getGroups()]);
  const account = accounts.find((a) => a.slug === slug);
  if (!account) notFound();
  const group = groups.find((g) => g.slug === account.groupSlug);
  const qs = filtersQs(f);
  const restricted = account.role === "CONSULT" || account.role === "OPERATOR";

  const base = { accountSlugs: [slug], from: f.month, to: f.month };
  const [v, campaigns, byChannel, byType, ins] = await Promise.all([
    buildMonthView([account], f),
    campaignItems([account], f.month, qs),
    Promise.all(
      (["all", ...account.channels] as Channel[]).map(async (ch) => ({
        key: ch, label: CHANNEL_LABEL[ch] ?? ch, c: sumCounts(await getMetrics({ ...base, channel: ch, groupType: f.groupType })),
      })),
    ),
    Promise.all(
      (["custom", "triggered"] as GroupType[]).map(async (gt) => ({
        key: gt, label: GROUP_TYPE_LABEL[gt], c: sumCounts(await getMetrics({ ...base, channel: f.channel, groupType: gt })),
      })),
    ),
    loadInsights("account", slug, [account], f.month, qs),
  ]);

  const MixTable = ({ title, rows, totalSent }: { title: string; rows: { key: string; label: string; c: Counts }[]; totalSent: number }) => (
    <div className="card overflow-x-auto">
      <div className="px-4 pt-3 pb-2 h-display text-sm">{title}</div>
      <table className="tbl w-full">
        <thead>
          <tr>
            <th></th>
            <th className="!text-right">Envíos</th>
            <th className="!text-right">% envíos</th>
            <th className="!text-right">CTR</th>
            <th className="!text-right">CTOR</th>
            <th className="!text-right">Revenue</th>
            <th className="!text-right">RPE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, c }) => {
            const k = kpis(c);
            return (
              <tr key={key} className={key === "all" ? "font-semibold" : ""}>
                <td>{label}</td>
                <td className="num text-right">{fmtInt(c.sent)}</td>
                <td className="num text-right">{fmtPct(totalSent ? c.sent / totalSent : null)}</td>
                <td className="num text-right">{fmtPct(k.ctr, 2)}</td>
                <td className="num text-right">{fmtPct(k.ctor)}</td>
                <td className="num text-right">{restricted ? <span className="text-xs text-pd-orange">sin permisos</span> : fmtMoney(c.revenue, account.currency)}</td>
                <td className="num text-right">{fmtMoney(k.rpe, account.currency)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[
          { label: "Portafolio", href: `/?${qs}` },
          ...(group ? [{ label: group.name, href: `/grupos/${group.slug}?${qs}` }] : []),
          { label: account.name },
        ]}
        title={account.name}
        subtitle={`${group ? `Marca de ${group.name}` : "Cuenta"} · ${monthTitle(f.month)}${v.partial ? " (en curso)" : ""} · ${CHANNEL_LABEL[f.channel]} · ${GROUP_TYPE_LABEL[f.groupType]}`}
        badges={
          <>
            {account.country && <Badge tone="slate">{account.country}</Badge>}
            {account.currency && <Badge tone="slate">{account.currency}</Badge>}
            {account.channels.map((c) => <Badge key={c}>{c}</Badge>)}
            {account.role && <Badge tone={restricted ? "orange" : "slate"}>Rol {account.role}</Badge>}
          </>
        }
      />
      {restricted && (
        <div className="rounded-card border border-pd-orange/40 bg-pd-orange/10 p-3 text-sm">
          <strong>Revenue no disponible por permisos.</strong> El rol en esta cuenta es {account.role}: WoowUp redacta revenue y datos personales.
          El análisis se apoya en métricas de engagement; no se estima revenue.
        </div>
      )}
      <FiltersBar f={f} channels={account.channels} />
      <KpiCards current={v.current} prev={v.prev} yoy={v.yoy} currency={account.currency} showLights={f.channel === "email"} partial={v.partial} />
      <InsightsPanel insights={ins.insights} monthName={monthTitle(f.month)} />
      <ActionPlan insights={ins.insights} scopeKey={ins.scopeKey} initial={ins.statuses} persist={ins.persist} />

      <section className="space-y-3">
        <h2 className="h-display text-lg">Campañas de {monthTitle(f.month)}</h2>
            <CampaignScopeNote count={campaigns.length} />
        <CampaignHighlights items={campaigns} byRevenue={!restricted && v.current.revenue != null} monthName={monthTitle(f.month)} />
        <CampaignsTable items={campaigns} showBrand={false} showRevenue initialChannel={f.channel} initialType={f.groupType} />
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <MixTable title={`Por canal · ${GROUP_TYPE_LABEL[f.groupType]}`} rows={byChannel} totalSent={byChannel[0]?.c.sent ?? 0} />
        <MixTable title={`One-shot vs automatizaciones · ${CHANNEL_LABEL[f.channel]}`} rows={byType} totalSent={byType.reduce((t, r) => t + r.c.sent, 0)} />
      </div>

      <TrendChart
        highlight={monthLabel(f.month)}
        showRevenue={!restricted && v.current.revenue != null}
        data={v.history.map((p) => ({ label: monthLabel(p.month), sent: p.sent, revenue: p.revenue, ctr: p.k.ctr == null ? null : p.k.ctr * 100 }))}
      />

      <details>
        <summary className="cursor-pointer select-none h-display text-sm text-pd-blue hover:underline">
          Ver tabla histórica de los últimos 12 meses
        </summary>
        <div className="mt-3"><MonthlyTable series={v.history} currency={account.currency} /></div>
      </details>
    </div>
  );
}
