import Link from "next/link";
import { notFound } from "next/navigation";
import { getTree } from "@/lib/data";
import { FiltersBar } from "@/components/FiltersBar";
import { KpiCards } from "@/components/KpiCards";
import { MonthlyTable } from "@/components/MonthlyTable";
import { BrandStackChart, TrendChart, type StackPoint } from "@/components/Charts";
import { Badge, PageHeader } from "@/components/PageHeader";
import { CampaignHighlights } from "@/components/CampaignHighlights";
import { CampaignsTable } from "@/components/CampaignsTable";
import { CHANNEL_LABEL, GROUP_TYPE_LABEL, fmtInt, fmtMoney, fmtPct } from "@/lib/metrics";
import { addMonths, monthLabel } from "@/lib/months";
import { buildMonthView, commonCurrency, filtersQs, monthTitle, parseFilters } from "@/lib/views";
import { campaignItems } from "@/lib/campaign-view";
import { getMetrics } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug } = await params;
  const f = parseFilters(await searchParams);
  const { groups } = await getTree();
  const group = groups.find((g) => g.slug === slug);
  if (!group) notFound();

  const accounts = group.accounts;
  const currency = commonCurrency(accounts);
  const sameCurrency = currency !== "MIXED";
  const qs = filtersQs(f);
  const channels = [...new Set(accounts.flatMap((a) => a.channels))];
  const [v, campaigns, histRows] = await Promise.all([
    buildMonthView(accounts, f),
    campaignItems(accounts, f.month, qs),
    getMetrics({
      accountSlugs: accounts.map((a) => a.slug), from: addMonths(f.month, -11), to: f.month, channel: f.channel, groupType: f.groupType,
    }),
  ]);
  const hasRevenue = sameCurrency && v.current.revenue != null;

  const stack = (metric: "sent" | "clicks" | "revenue"): StackPoint[] =>
    v.history.map((h) => {
      const p: StackPoint = { label: monthLabel(h.month) };
      for (const a of accounts) {
        const r = histRows.find((x) => x.accountSlug === a.slug && x.month === h.month);
        p[a.slug] = r ? (r[metric] ?? 0) : 0;
      }
      return p;
    });

  const brands = accounts
    .map((a) => ({ a, s: v.byAccount.get(a.slug)! }))
    .sort((x, y) => (y.s.revenue ?? y.s.sent) - (x.s.revenue ?? x.s.sent));

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: "Portafolio", href: `/?${qs}` }, { label: group.name }]}
        title={group.name}
        subtitle={`Cuenta madre · ${monthTitle(f.month)}${v.partial ? " (en curso)" : ""} · ${CHANNEL_LABEL[f.channel]} · ${GROUP_TYPE_LABEL[f.groupType]}`}
        badges={<Badge>{accounts.length} marcas</Badge>}
      />
      <FiltersBar f={f} channels={channels} />

      {accounts.length === 0 ? (
        <div className="card p-8 text-center text-pd-slate">
          Esta cuenta madre todavía no tiene marcas. Asignalas en <Link href="/admin" className="text-pd-blue underline">Administración</Link>.
        </div>
      ) : (
        <>
          <KpiCards current={v.current} prev={v.prev} yoy={v.yoy} currency={currency} showLights={f.channel === "email"} partial={v.partial} />

          <section className="space-y-2">
            <h2 className="h-display text-lg">Marcas de {group.name} en {monthTitle(f.month)}</h2>
            <div className="card overflow-x-auto">
              <table className="tbl w-full">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th className="!text-right">Envíos</th>
                    <th className="!text-right">% envíos</th>
                    <th className="!text-right">Campañas</th>
                    <th className="!text-right">Entrega</th>
                    <th className="!text-right">CTR</th>
                    <th className="!text-right">CTOR</th>
                    <th className="!text-right">Desusc.</th>
                    <th className="!text-right">Revenue</th>
                    <th className="!text-right">% revenue</th>
                    <th className="!text-right">RPE</th>
                  </tr>
                </thead>
                <tbody>
                  {brands.map(({ a, s }) => (
                    <tr key={a.slug}>
                      <td className="font-semibold"><Link href={`/cuentas/${a.slug}?${qs}`} className="hover:text-pd-blue">{a.name} →</Link></td>
                      <td className="num text-right">{fmtInt(s.sent)}</td>
                      <td className="num text-right">{fmtPct(v.current.sent ? s.sent / v.current.sent : null)}</td>
                      <td className="num text-right">{fmtInt(s.campaigns)}</td>
                      <td className="num text-right">{fmtPct(s.k.deliveryRate)}</td>
                      <td className="num text-right">{fmtPct(s.k.ctr, 2)}</td>
                      <td className="num text-right">{fmtPct(s.k.ctor)}</td>
                      <td className="num text-right">{fmtPct(s.k.unsubRate, 2)}</td>
                      <td className="num text-right font-semibold">
                        {s.revenueRedacted && s.revenue == null ? <span className="text-xs text-pd-orange">sin permisos</span> : fmtMoney(s.revenue, a.currency)}
                      </td>
                      <td className="num text-right">{hasRevenue && v.current.revenue ? fmtPct((s.revenue ?? 0) / v.current.revenue) : "—"}</td>
                      <td className="num text-right">{fmtMoney(s.k.rpe, a.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="h-display text-lg">Campañas de {monthTitle(f.month)}</h2>
            <CampaignHighlights items={campaigns} byRevenue={hasRevenue} monthName={monthTitle(f.month)} />
            <CampaignsTable
              items={campaigns} showBrand showRevenue={sameCurrency}
              initialChannel={f.channel} initialType={f.groupType}
            />
          </section>

          <div className="grid lg:grid-cols-2 gap-4">
            <TrendChart
              highlight={monthLabel(f.month)}
              showRevenue={hasRevenue}
              data={v.history.map((p) => ({ label: monthLabel(p.month), sent: p.sent, revenue: sameCurrency ? p.revenue : null, ctr: p.k.ctr == null ? null : p.k.ctr * 100 }))}
            />
            <BrandStackChart
              brands={accounts.map((a) => ({ slug: a.slug, name: a.name }))}
              datasets={[
                ...(hasRevenue ? [{ key: "revenue", label: "Revenue", data: stack("revenue") }] : []),
                { key: "sent", label: "Envíos", data: stack("sent") },
                { key: "clicks", label: "Clics", data: stack("clicks") },
              ]}
            />
          </div>

          <details className="group">
            <summary className="cursor-pointer select-none h-display text-sm text-pd-blue hover:underline">
              Ver tabla histórica de los últimos 12 meses
            </summary>
            <div className="mt-3"><MonthlyTable series={v.history} currency={currency} /></div>
          </details>
        </>
      )}
    </div>
  );
}
