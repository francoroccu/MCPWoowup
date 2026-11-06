import Link from "next/link";
import { getCampaignsRange, getMetrics, getMetricsAll, getSyncRuns, getTree, isDemo, dataMode } from "@/lib/data";
import { buildInsights, insightCounts } from "@/lib/insights";
import { FiltersBar } from "@/components/FiltersBar";
import { CHANNEL_LABEL, GROUP_TYPE_LABEL, fmtInt, fmtMoney, fmtPct, kpis, pctChange, sumCounts, type MetricRow } from "@/lib/metrics";
import { addMonths, currentMonth, monthLabel } from "@/lib/months";
import { commonCurrency, filtersQs, monthTitle, parseFilters } from "@/lib/views";
import type { Account } from "@/lib/types";

export const dynamic = "force-dynamic";

const FLAG: Record<string, string> = { AR: "🇦🇷", CL: "🇨🇱", PE: "🇵🇪" };

export default async function Portfolio({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const f = parseFilters(await searchParams);
  const [{ groups, standalone }, runs] = await Promise.all([getTree(), getSyncRuns(10)]);
  const lastOk = runs.find((r) => r.status === "ok" || r.status === "partial");
  const lastRun = runs[0];
  const hoursSince = lastOk?.finishedAt ? (Date.now() - new Date(lastOk.finishedAt).getTime()) / 36e5 : null;
  const stale = !isDemo() && (hoursSince == null || hoursSince > 36 || lastRun?.status === "error");
  const all = [...groups.flatMap((g) => g.accounts), ...standalone];
  const prevM = addMonths(f.month, -1);
  const yoyM = addMonths(f.month, -12);
  const partial = f.month === currentMonth();
  const rows = await getMetrics({
    accountSlugs: all.map((a) => a.slug), from: yoyM, to: f.month, channel: f.channel, groupType: f.groupType,
  });
  const qs = filtersQs(f);
  const slugsAll = all.map((a) => a.slug);
  const [allRows, allCamps] = await Promise.all([
    getMetricsAll({ accountSlugs: slugsAll, from: yoyM, to: f.month }),
    getCampaignsRange({ accountSlugs: slugsAll, from: addMonths(f.month, -3), to: f.month }),
  ]);
  const alerts = (accounts: Account[], scope: "account" | "group") => {
    const s = accounts.map((a) => a.slug);
    return insightCounts(
      buildInsights({
        scope, month: f.month, accounts, qs, partial, campaignsComplete: dataMode() !== "snapshot",
        rows: allRows.filter((r) => s.includes(r.accountSlug)),
        campaigns: allCamps.filter((c) => s.includes(c.accountSlug)),
      }),
    );
  };

  const slice = (slugs: string[], month: string) => rows.filter((r: MetricRow) => r.month === month && slugs.includes(r.accountSlug));
  const complete = (slugs: string[], month: string) => slugs.every((s) => rows.some((r) => r.accountSlug === s && r.month === month && r.sent > 0));

  const Row = ({ name, href, accounts, child, scope = "account" }: { name: string; href: string; accounts: Account[]; child?: boolean; scope?: "account" | "group" }) => {
    const slugs = accounts.map((a) => a.slug);
    const al = alerts(accounts, scope);
    const c = sumCounts(slice(slugs, f.month));
    const k = kpis(c);
    const cur = commonCurrency(accounts);
    const dP = !partial && complete(slugs, prevM) ? pctChange(c.revenue, sumCounts(slice(slugs, prevM)).revenue) : null;
    const dY = !partial && complete(slugs, yoyM) ? pctChange(c.revenue, sumCounts(slice(slugs, yoyM)).revenue) : null;
    const countries = [...new Set(accounts.map((a) => a.country ?? ""))].map((x) => FLAG[x] ?? x).join(" ");
    const D = ({ d }: { d: number | null }) => (
      <td className={`num text-right ${d == null ? "text-pd-slate/50" : d >= 0 ? "text-pd-green" : "text-pd-red"}`}>
        {d == null ? "—" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}%`}
      </td>
    );
    return (
      <tr className={child ? "" : "font-semibold"}>
        <td className={child ? "pl-8" : ""}>
          <Link href={`${href}?${qs}`} className="hover:text-pd-blue">
            {child && <span className="mr-2 text-pd-slate/50">└</span>}
            {name}
          </Link>
          {!child && accounts.length > 1 && <span className="ml-2 rounded bg-pd-cyan/10 px-1.5 py-0.5 text-[10px] font-bold text-cyan-700">{accounts.length} marcas</span>}
        </td>
        <td>{countries}</td>
        <td className="num text-right">{fmtInt(c.sent)}</td>
        <td className="num text-right">{fmtInt(c.campaigns)}</td>
        <td className="num text-right">{fmtPct(k.deliveryRate)}</td>
        <td className="num text-right">{fmtPct(k.ctr, 2)}</td>
        <td className="num text-right">{fmtPct(k.ctor)}</td>
        <td className="num text-right">
          {cur === "MIXED" ? <span className="text-xs text-pd-slate">multi-moneda</span> : c.revenueRedacted && c.revenue == null ? <span className="text-xs text-pd-orange">sin permisos</span> : fmtMoney(c.revenue, cur, true)}
        </td>
        <D d={cur === "MIXED" ? null : dP} />
        <D d={cur === "MIXED" ? null : dY} />
        <td className="num text-right">{cur === "MIXED" ? "—" : fmtMoney(k.rpe, cur)}</td>
        <td>
          <Link href={`${href}?${qs}`} className="flex gap-1" title="Insights del mes: críticos · atención · oportunidades">
            {al.critical > 0 && <span className="num rounded bg-red-50 px-1.5 text-xs font-bold text-red-700">{al.critical}</span>}
            {al.warning > 0 && <span className="num rounded bg-amber-50 px-1.5 text-xs font-bold text-amber-800">{al.warning}</span>}
            {al.opportunity > 0 && <span className="num rounded bg-blue-50 px-1.5 text-xs font-bold text-pd-blue">{al.opportunity}</span>}
            {al.critical + al.warning + al.opportunity === 0 && <span className="text-xs text-pd-slate/50">—</span>}
          </Link>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="label">Portafolio</p>
        <h1 className="h-display text-3xl mt-1">Todas las cuentas · {monthTitle(f.month)}</h1>
        <p className="text-sm text-pd-slate mt-1">
          {CHANNEL_LABEL[f.channel]} · {GROUP_TYPE_LABEL[f.groupType]}
          {lastOk?.finishedAt && (
            <> · Datos al {new Date(lastOk.finishedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba", dateStyle: "short", timeStyle: "short" })}</>
          )}
        </p>
      </div>
      {stale && (
        <div className="rounded-card border border-pd-red/30 bg-red-50 p-3 text-sm text-red-800">
          <strong>Los datos pueden estar desactualizados.</strong>{" "}
          {lastRun?.status === "error"
            ? `La última sincronización falló: ${lastRun.errors[0]?.message ?? "sin detalle"}.`
            : hoursSince == null
              ? "Todavía no hubo una sincronización exitosa."
              : `La última sincronización exitosa fue hace ${Math.round(hoursSince)} horas.`}{" "}
          <Link href="/admin" className="font-semibold underline">Ver en Administración</Link>
        </div>
      )}
      <FiltersBar f={f} channels={[...new Set(all.flatMap((a) => a.channels))]} />

      <div className="card overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Cuenta madre / marca</th>
              <th>País</th>
              <th className="!text-right">Envíos</th>
              <th className="!text-right">Campañas</th>
              <th className="!text-right">Entrega</th>
              <th className="!text-right">CTR</th>
              <th className="!text-right">CTOR</th>
              <th className="!text-right">Revenue</th>
              <th className="!text-right">vs {monthLabel(prevM)}</th>
              <th className="!text-right">vs {monthLabel(yoyM)} {yoyM.slice(2, 4)}</th>
              <th className="!text-right">RPE</th>
              <th>Alertas</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <Row key={g.slug} name={g.name} href={`/grupos/${g.slug}`} accounts={g.accounts} scope="group" />,
              ...g.accounts.map((a) => <Row key={a.slug} name={a.name} href={`/cuentas/${a.slug}`} accounts={[a]} child />),
            ])}
            {standalone.map((a) => <Row key={a.slug} name={a.name} href={`/cuentas/${a.slug}`} accounts={[a]} />)}
            {all.length === 0 && (
              <tr><td colSpan={12} className="py-10 text-center text-pd-slate">
                Todavía no hay cuentas. Corré la primera sincronización desde <Link href="/admin" className="text-pd-blue underline">Administración</Link>.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-pd-slate">
        Alertas: insights del mes en <span className="font-semibold text-red-700">rojo</span> críticos, <span className="font-semibold text-amber-800">ámbar</span> atención y <span className="font-semibold text-pd-blue">azul</span> oportunidades.
        Variaciones de revenue vs. el mes anterior y vs. el mismo mes del año pasado; solo se muestran si ese mes tiene datos de todas las marcas.
        {partial && " El mes en curso es parcial y no se compara."} El revenue de una cuenta madre se suma solo si todas sus marcas usan la misma moneda.
      </p>
    </div>
  );
}
