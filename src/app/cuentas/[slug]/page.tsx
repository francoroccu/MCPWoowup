import { notFound } from "next/navigation";
import { getGroups, getAccounts, getMetrics } from "@/lib/data";
import { FiltersBar } from "@/components/FiltersBar";
import { KpiCards } from "@/components/KpiCards";
import { MonthlyTable } from "@/components/MonthlyTable";
import { TrendChart } from "@/components/Charts";
import { Badge, PageHeader } from "@/components/PageHeader";
import {
  CHANNEL_LABEL, GROUP_TYPE_LABEL, fmtInt, fmtMoney, fmtPct, kpis, sumCounts, type Channel, type GroupType,
} from "@/lib/metrics";
import { addMonths, monthLabel } from "@/lib/months";
import { buildSeries, parseFilters } from "@/lib/views";

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
  const qs = new URLSearchParams({ from: f.from, to: f.to, channel: f.channel, type: f.groupType }).toString();

  const s = await buildSeries([account], f);
  const restricted = account.role === "CONSULT" || account.role === "OPERATOR";

  // Mix del rango: por canal (respetando el tipo elegido) y por tipo (respetando el canal elegido)
  const base = { accountSlugs: [slug], from: f.from, to: f.to };
  const byChannel = await Promise.all(
    (["all", ...account.channels] as Channel[]).map(async (ch) => ({
      key: ch, label: CHANNEL_LABEL[ch] ?? ch, c: sumCounts(await getMetrics({ ...base, channel: ch, groupType: f.groupType })),
    })),
  );
  const byType = await Promise.all(
    (["custom", "triggered"] as GroupType[]).map(async (gt) => ({
      key: gt, label: GROUP_TYPE_LABEL[gt], c: sumCounts(await getMetrics({ ...base, channel: f.channel, groupType: gt })),
    })),
  );
  const prevLabel = `${monthLabel(addMonths(f.from, -s.months.length), true)} – ${monthLabel(addMonths(f.from, -1), true)} (período anterior)`;
  const customCampaigns = byType.find((t) => t.key === "custom")?.c.campaigns ?? 0;
  const weeks = Math.max(1, s.months.length * 4.345);

  const MixTable = ({ title, rows, totalSent }: { title: string; rows: { key: string; label: string; c: ReturnType<typeof sumCounts> }[]; totalSent: number }) => (
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
        subtitle={`${group ? `Marca de ${group.name}` : "Cuenta"} · ${monthLabel(f.from)} ${f.from.slice(0, 4)} → ${monthLabel(f.to)} ${f.to.slice(0, 4)} · ${CHANNEL_LABEL[f.channel]} · ${GROUP_TYPE_LABEL[f.groupType]}`}
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
      <KpiCards total={s.total} prev={s.prevTotal} currency={account.currency} showLights={f.channel === "email"} prevLabel={prevLabel} />

      <TrendChart
        showRevenue={!restricted && s.total.revenue != null}
        data={s.series.map((p) => ({ label: monthLabel(p.month), sent: p.sent, revenue: p.revenue, ctr: p.k.ctr == null ? null : p.k.ctr * 100 }))}
      />

      <div className="grid lg:grid-cols-2 gap-4">
        <MixTable title={`Por canal · ${GROUP_TYPE_LABEL[f.groupType]}`} rows={byChannel} totalSent={byChannel[0]?.c.sent ?? 0} />
        <div className="space-y-2">
          <MixTable title={`One-shot vs automatizaciones · ${CHANNEL_LABEL[f.channel]}`} rows={byType} totalSent={byType.reduce((t, r) => t + r.c.sent, 0)} />
          <p className="text-xs text-pd-slate px-1">
            Frecuencia one-shot: <span className="num font-semibold text-pd-navy">{(customCampaigns / weeks).toFixed(1)}</span> campañas por semana en el rango
            ({fmtInt(customCampaigns)} campañas / {weeks.toFixed(0)} semanas).
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="h-display text-lg">Mes a mes</h2>
        <MonthlyTable series={s.series} currency={account.currency} />
      </section>
    </div>
  );
}
