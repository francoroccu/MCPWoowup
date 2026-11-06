import Link from "next/link";
import { notFound } from "next/navigation";
import { getTree } from "@/lib/data";
import { FiltersBar } from "@/components/FiltersBar";
import { KpiCards } from "@/components/KpiCards";
import { MonthlyTable } from "@/components/MonthlyTable";
import { BrandStackChart, TrendChart, type StackPoint } from "@/components/Charts";
import { Badge, PageHeader } from "@/components/PageHeader";
import { CHANNEL_LABEL, GROUP_TYPE_LABEL, fmtInt, fmtMoney, fmtPct, kpis, sumCounts } from "@/lib/metrics";
import { addMonths, monthLabel } from "@/lib/months";
import { buildSeries, commonCurrency, parseFilters } from "@/lib/views";

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
  const s = await buildSeries(accounts, f);
  const channels = [...new Set(accounts.flatMap((a) => a.channels))];
  const qs = new URLSearchParams({ from: f.from, to: f.to, channel: f.channel, type: f.groupType }).toString();
  const sameCurrency = currency !== "MIXED";

  const stack = (metric: "sent" | "clicks" | "revenue"): StackPoint[] =>
    s.months.map((m) => {
      const p: StackPoint = { label: monthLabel(m) };
      for (const a of accounts) {
        const r = (s.byAccount.get(a.slug) ?? []).find((x) => x.month === m);
        p[a.slug] = r ? (r[metric] ?? 0) : 0;
      }
      return p;
    });

  const brandTotals = accounts
    .map((a) => {
      const c = sumCounts(s.byAccount.get(a.slug) ?? []);
      return { a, c, k: kpis(c) };
    })
    .sort((x, y) => (y.c.revenue ?? y.c.sent) - (x.c.revenue ?? x.c.sent));

  const prevLabel = `${monthLabel(addMonths(f.from, -s.months.length), true)} – ${monthLabel(addMonths(f.from, -1), true)} (período anterior)`;

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: "Portafolio", href: `/?${qs}` }, { label: group.name }]}
        title={group.name}
        subtitle={`Cuenta madre · ${monthLabel(f.from)} ${f.from.slice(0, 4)} → ${monthLabel(f.to)} ${f.to.slice(0, 4)} · ${CHANNEL_LABEL[f.channel]} · ${GROUP_TYPE_LABEL[f.groupType]}`}
        badges={<Badge>{accounts.length} marcas</Badge>}
      />
      <FiltersBar f={f} channels={channels} />

      {accounts.length === 0 ? (
        <div className="card p-8 text-center text-pd-slate">
          Esta cuenta madre todavía no tiene marcas. Asignalas en <Link href="/admin" className="text-pd-blue underline">Administración</Link>.
        </div>
      ) : (
        <>
          <KpiCards total={s.total} prev={s.prevTotal} currency={currency} showLights={f.channel === "email"} prevLabel={prevLabel} />

          <div className="grid lg:grid-cols-2 gap-4">
            <TrendChart
              showRevenue={sameCurrency && s.total.revenue != null}
              data={s.series.map((p) => ({ label: monthLabel(p.month), sent: p.sent, revenue: sameCurrency ? p.revenue : null, ctr: p.k.ctr == null ? null : p.k.ctr * 100 }))}
            />
            <BrandStackChart
              brands={accounts.map((a) => ({ slug: a.slug, name: a.name }))}
              datasets={[
                ...(sameCurrency && s.total.revenue != null ? [{ key: "revenue", label: "Revenue", data: stack("revenue") }] : []),
                { key: "sent", label: "Envíos", data: stack("sent") },
                { key: "clicks", label: "Clics", data: stack("clicks") },
              ]}
            />
          </div>

          <section className="space-y-2">
            <h2 className="h-display text-lg">Marcas de {group.name}</h2>
            <div className="card overflow-x-auto">
              <table className="tbl w-full">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th className="!text-right">Envíos</th>
                    <th className="!text-right">% envíos</th>
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
                  {brandTotals.map(({ a, c, k }) => (
                    <tr key={a.slug}>
                      <td className="font-semibold">
                        <Link href={`/cuentas/${a.slug}?${qs}`} className="hover:text-pd-blue">{a.name} →</Link>
                      </td>
                      <td className="num text-right">{fmtInt(c.sent)}</td>
                      <td className="num text-right">{fmtPct(s.total.sent ? c.sent / s.total.sent : null)}</td>
                      <td className="num text-right">{fmtPct(k.deliveryRate)}</td>
                      <td className="num text-right">{fmtPct(k.ctr, 2)}</td>
                      <td className="num text-right">{fmtPct(k.ctor)}</td>
                      <td className="num text-right">{fmtPct(k.unsubRate, 2)}</td>
                      <td className="num text-right font-semibold">
                        {c.revenueRedacted && c.revenue == null ? <span className="text-xs text-pd-orange">sin permisos</span> : fmtMoney(c.revenue, a.currency)}
                      </td>
                      <td className="num text-right">{sameCurrency && s.total.revenue ? fmtPct((c.revenue ?? 0) / s.total.revenue) : "—"}</td>
                      <td className="num text-right">{fmtMoney(k.rpe, a.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="h-display text-lg">Consolidado mes a mes</h2>
            <MonthlyTable series={s.series} currency={currency} />
          </section>
        </>
      )}
    </div>
  );
}
