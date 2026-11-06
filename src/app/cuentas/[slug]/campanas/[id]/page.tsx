import { notFound } from "next/navigation";
import { getAccounts, getCampaignHistory, getGroups, getMetrics } from "@/lib/data";
import { TrendChart } from "@/components/Charts";
import { Badge, PageHeader } from "@/components/PageHeader";
import {
  emailLight, fmtInt, fmtMoney, fmtPct, kpis, sumCounts, type Channel, type Kpis, type Light,
} from "@/lib/metrics";
import { monthLabel } from "@/lib/months";
import { filtersQs, monthTitle, parseFilters } from "@/lib/views";

export const dynamic = "force-dynamic";

const CH_LABEL: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", push: "Push" };
const LIGHT: Record<Exclude<Light, null>, string> = { ok: "bg-pd-green", warn: "bg-pd-orange", bad: "bg-pd-red" };

export default async function CampaignPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { slug, id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const f = parseFilters(await searchParams);
  const [accounts, groups, history] = await Promise.all([
    getAccounts({ includeHidden: true }), getGroups(), getCampaignHistory(slug, id),
  ]);
  const account = accounts.find((a) => a.slug === slug);
  if (!account || history.length === 0) notFound();
  const group = groups.find((g) => g.slug === account.groupSlug);
  const qs = filtersQs(f);

  const c = history.find((h) => h.month === f.month) ?? history[history.length - 1];
  const k = kpis(c);
  const isAuto = c.groupType === "triggered";
  const restricted = c.revenueRedacted && c.revenue == null;

  // Promedio de la cuenta en el mismo mes, mismo canal y mismo tipo → contexto para leer la campaña
  const ref = sumCounts(await getMetrics({
    accountSlugs: [slug], from: c.month, to: c.month, channel: c.channel as Channel, groupType: c.groupType,
  }));
  const rk = kpis(ref);
  const share = ref.revenue ? (c.revenue ?? 0) / ref.revenue : null;
  const sentShare = ref.sent ? c.sent / ref.sent : null;

  const lbl = (m: string) => monthLabel(m, history.length > 12);
  const loc = (n: number, d: number) => n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const metrics: { label: string; value: string; key?: keyof Kpis; pp?: boolean; inverse?: boolean }[] = [
    { label: "Envíos", value: fmtInt(c.sent) },
    { label: "Tasa de entrega", value: fmtPct(k.deliveryRate), key: "deliveryRate", pp: true },
    { label: "Open rate", value: c.channel === "sms" ? "—" : fmtPct(k.openRate), key: "openRate", pp: true },
    { label: "CTR", value: fmtPct(k.ctr, 2), key: "ctr", pp: true },
    { label: "CTOR", value: fmtPct(k.ctor), key: "ctor", pp: true },
    { label: "Desuscripción", value: fmtPct(k.unsubRate, 2), key: "unsubRate", pp: true, inverse: true },
    { label: "Conversiones", value: fmtInt(c.conversions) },
    { label: "Revenue", value: restricted ? "Sin permisos" : fmtMoney(c.revenue, account.currency) },
    { label: "Revenue por envío", value: restricted ? "—" : fmtMoney(k.rpe, account.currency), key: "rpe" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[
          { label: "Portafolio", href: `/?${qs}` },
          ...(group ? [{ label: group.name, href: `/grupos/${group.slug}?${qs}` }] : []),
          { label: account.name, href: `/cuentas/${slug}?${qs}` },
          { label: "Campaña" },
        ]}
        title={c.name}
        subtitle={
          isAuto
            ? `Automatización · datos de ${monthTitle(c.month)} · activa en ${history.length} ${history.length === 1 ? "mes" : "meses"}`
            : `One-shot · enviada el ${c.sentAt ? c.sentAt.split("-").reverse().join("/") : "—"}`
        }
        badges={
          <>
            <Badge>{CH_LABEL[c.channel] ?? c.channel}</Badge>
            <Badge tone={isAuto ? "slate" : "cyan"}>{isAuto ? "Automatización" : "One-shot"}</Badge>
            {c.campaignType && <Badge tone="slate">{c.campaignType}</Badge>}
            {c.status && <Badge tone="slate">{c.status}</Badge>}
          </>
        }
      />
      {c.subject && (
        <div className="card p-4 text-sm"><span className="label mr-2">Asunto</span>{c.subject}</div>
      )}

      <section className="space-y-2">
        <h2 className="h-display text-lg">Resultado en {monthTitle(c.month)}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {metrics.map((m) => {
            const v = m.key ? k[m.key] : null;
            const r = m.key ? rk[m.key] : null;
            const diff = v != null && r != null ? (m.pp ? v - r : r ? (v - r) / r : null) : null;
            const light = c.channel === "email" && m.key ? emailLight(m.key, v) : null;
            const good = diff != null && (m.inverse ? diff < 0 : diff > 0);
            return (
              <div key={m.label} className="card p-4">
                <div className="flex items-center gap-2">
                  {light && <span className={`h-2 w-2 rounded-full ${LIGHT[light]}`} />}
                  <span className="label">{m.label}</span>
                </div>
                <div className="num mt-2 text-xl font-semibold">{m.value}</div>
                {m.key && (
                  <div className="mt-1 text-xs text-pd-slate">
                    prom. cuenta {m.key === "rpe" ? fmtMoney(r, account.currency) : fmtPct(r, m.key === "ctr" || m.key === "unsubRate" ? 2 : 1)}
                    {diff != null && Math.abs(diff) > 0.00005 && (
                      <span className={`num ml-1 font-semibold ${good ? "text-pd-green" : "text-pd-red"}`}>
                        {diff > 0 ? "▲" : "▼"} {m.pp ? `${loc(diff * 100, 2)} pp` : `${loc(diff * 100, 0)}%`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-pd-slate">
          "Prom. cuenta" = todas las campañas {isAuto ? "automáticas" : "one-shot"} de {CH_LABEL[c.channel] ?? c.channel} de {account.name} en {monthTitle(c.month)}.
          Esta campaña explica el <strong>{fmtPct(sentShare)}</strong> de esos envíos
          {share != null && !restricted && <> y el <strong>{fmtPct(share)}</strong> de ese revenue</>}.
        </p>
      </section>

      {history.length > 1 && (
        <section className="space-y-3">
          <h2 className="h-display text-lg">Evolución mes a mes</h2>
          <TrendChart
            title={`${history.length} meses con actividad`}
            highlight={lbl(c.month)}
            showRevenue={!restricted}
            data={history.map((h) => {
              const hk = kpis(h);
              return { label: lbl(h.month), sent: h.sent, revenue: h.revenue, ctr: hk.ctr == null ? null : hk.ctr * 100 };
            })}
          />
          <div className="card overflow-x-auto">
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>Mes</th><th className="!text-right">Envíos</th><th className="!text-right">Entrega</th>
                  <th className="!text-right">Open</th><th className="!text-right">CTR</th><th className="!text-right">CTOR</th>
                  <th className="!text-right">Desusc.</th><th className="!text-right">Conv.</th>
                  <th className="!text-right">Revenue</th><th className="!text-right">RPE</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((h) => {
                  const hk = kpis(h);
                  return (
                    <tr key={h.month} className={h.month === c.month ? "font-semibold" : ""}>
                      <td>{monthTitle(h.month)}</td>
                      <td className="num text-right">{fmtInt(h.sent)}</td>
                      <td className="num text-right">{fmtPct(hk.deliveryRate)}</td>
                      <td className="num text-right">{h.channel === "sms" ? "—" : fmtPct(hk.openRate)}</td>
                      <td className="num text-right">{fmtPct(hk.ctr, 2)}</td>
                      <td className="num text-right">{fmtPct(hk.ctor)}</td>
                      <td className="num text-right">{fmtPct(hk.unsubRate, 2)}</td>
                      <td className="num text-right">{fmtInt(h.conversions)}</td>
                      <td className="num text-right">{restricted ? "—" : fmtMoney(h.revenue, account.currency)}</td>
                      <td className="num text-right">{restricted ? "—" : fmtMoney(hk.rpe, account.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
