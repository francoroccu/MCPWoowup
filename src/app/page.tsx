import Link from "next/link";
import { getMetrics, getTree } from "@/lib/data";
import { FiltersBar } from "@/components/FiltersBar";
import { CHANNEL_LABEL, GROUP_TYPE_LABEL, fmtInt, fmtMoney, fmtPct, kpis, pctChange, sumCounts, type MetricRow } from "@/lib/metrics";
import { addMonths, currentMonth, monthLabel } from "@/lib/months";
import { commonCurrency, filtersQs, monthTitle, parseFilters } from "@/lib/views";
import type { Account } from "@/lib/types";

export const dynamic = "force-dynamic";

const FLAG: Record<string, string> = { AR: "🇦🇷", CL: "🇨🇱", PE: "🇵🇪" };

export default async function Portfolio({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const f = parseFilters(await searchParams);
  const { groups, standalone } = await getTree();
  const all = [...groups.flatMap((g) => g.accounts), ...standalone];
  const prevM = addMonths(f.month, -1);
  const yoyM = addMonths(f.month, -12);
  const partial = f.month === currentMonth();
  const rows = await getMetrics({
    accountSlugs: all.map((a) => a.slug), from: yoyM, to: f.month, channel: f.channel, groupType: f.groupType,
  });
  const qs = filtersQs(f);

  const slice = (slugs: string[], month: string) => rows.filter((r: MetricRow) => r.month === month && slugs.includes(r.accountSlug));
  const complete = (slugs: string[], month: string) => slugs.every((s) => rows.some((r) => r.accountSlug === s && r.month === month && r.sent > 0));

  const Row = ({ name, href, accounts, child }: { name: string; href: string; accounts: Account[]; child?: boolean }) => {
    const slugs = accounts.map((a) => a.slug);
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
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="label">Portafolio</p>
        <h1 className="h-display text-3xl mt-1">Todas las cuentas · {monthTitle(f.month)}</h1>
        <p className="text-sm text-pd-slate mt-1">{CHANNEL_LABEL[f.channel]} · {GROUP_TYPE_LABEL[f.groupType]}</p>
      </div>
      <FiltersBar f={f} channels={["email", "sms", "whatsapp", "push"]} />

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
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <Row key={g.slug} name={g.name} href={`/grupos/${g.slug}`} accounts={g.accounts} />,
              ...g.accounts.map((a) => <Row key={a.slug} name={a.name} href={`/cuentas/${a.slug}`} accounts={[a]} child />),
            ])}
            {standalone.map((a) => <Row key={a.slug} name={a.name} href={`/cuentas/${a.slug}`} accounts={[a]} />)}
            {all.length === 0 && (
              <tr><td colSpan={11} className="py-10 text-center text-pd-slate">
                Todavía no hay cuentas. Corré la primera sincronización desde <Link href="/admin" className="text-pd-blue underline">Administración</Link>.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-pd-slate">
        Variaciones de revenue vs. el mes anterior y vs. el mismo mes del año pasado; solo se muestran si ese mes tiene datos de todas las marcas.
        {partial && " El mes en curso es parcial y no se compara."} El revenue de una cuenta madre se suma solo si todas sus marcas usan la misma moneda.
      </p>
    </div>
  );
}
