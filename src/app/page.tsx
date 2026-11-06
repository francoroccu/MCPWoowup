import Link from "next/link";
import { getMetrics, getTree } from "@/lib/data";
import { FiltersBar } from "@/components/FiltersBar";
import { CHANNEL_LABEL, GROUP_TYPE_LABEL, fmtInt, fmtMoney, fmtPct, kpis, pctChange, sumCounts, type MetricRow } from "@/lib/metrics";
import { addMonths, monthLabel, monthRange } from "@/lib/months";
import { commonCurrency, hasFullCoverage, parseFilters } from "@/lib/views";
import type { Account } from "@/lib/types";

export const dynamic = "force-dynamic";

const FLAG: Record<string, string> = { AR: "🇦🇷", CL: "🇨🇱", PE: "🇵🇪" };

export default async function Portfolio({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const f = parseFilters(await searchParams);
  const { groups, standalone } = await getTree();
  const all = [...groups.flatMap((g) => g.accounts), ...standalone];
  const n = monthRange(f.from, f.to).length;
  const q = { accountSlugs: all.map((a) => a.slug), channel: f.channel, groupType: f.groupType };
  const [rows, prev] = await Promise.all([
    getMetrics({ ...q, from: f.from, to: f.to }),
    getMetrics({ ...q, from: addMonths(f.from, -n), to: addMonths(f.from, -1) }),
  ]);
  const by = (rs: MetricRow[], slugs: string[]) => sumCounts(rs.filter((r) => slugs.includes(r.accountSlug)));
  const qs = new URLSearchParams({ from: f.from, to: f.to, channel: f.channel, type: f.groupType }).toString();

  const Row = ({ name, href, accounts, child }: { name: string; href: string; accounts: Account[]; child?: boolean }) => {
    const slugs = accounts.map((a) => a.slug);
    const c = by(rows, slugs);
    const p = by(prev, slugs);
    const k = kpis(c);
    const cur = commonCurrency(accounts);
    const d = hasFullCoverage(prev, slugs, n) ? pctChange(c.revenue, p.revenue) : null;
    const countries = [...new Set(accounts.map((a) => a.country ?? ""))].map((x) => FLAG[x] ?? x).join(" ");
    return (
      <tr className={child ? "" : "font-semibold"}>
        <td className={child ? "pl-8" : ""}>
          <Link href={`${href}?${qs}`} className="hover:text-pd-blue">
            {child && <span className="mr-2 text-pd-slate/50">└</span>}
            {name}
          </Link>
          {!child && accounts.length > 1 && <span className="ml-2 rounded bg-pd-cyan/10 px-1.5 py-0.5 text-[10px] font-bold text-pd-cyan">{accounts.length} marcas</span>}
        </td>
        <td>{countries}</td>
        <td className="num text-right">{fmtInt(c.sent)}</td>
        <td className="num text-right">{fmtPct(k.deliveryRate)}</td>
        <td className="num text-right">{fmtPct(k.ctr, 2)}</td>
        <td className="num text-right">{fmtPct(k.ctor)}</td>
        <td className="num text-right">
          {cur === "MIXED" ? <span className="text-xs text-pd-slate">multi-moneda</span> : c.revenueRedacted && c.revenue == null ? <span className="text-xs text-pd-orange">sin permisos</span> : fmtMoney(c.revenue, cur, true)}
        </td>
        <td className={`num text-right ${d == null ? "" : d >= 0 ? "text-pd-green" : "text-pd-red"}`}>
          {d == null ? "—" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}%`}
        </td>
        <td className="num text-right">{cur === "MIXED" ? "—" : fmtMoney(k.rpe, cur)}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="label">Portafolio</p>
        <h1 className="h-display text-3xl mt-1">Todas las cuentas</h1>
        <p className="text-sm text-pd-slate mt-1">
          {monthLabel(f.from)} {f.from.slice(0, 4)} → {monthLabel(f.to)} {f.to.slice(0, 4)} · {CHANNEL_LABEL[f.channel]} · {GROUP_TYPE_LABEL[f.groupType]}
        </p>
      </div>
      <FiltersBar f={f} channels={["email", "sms", "whatsapp", "push"]} />

      <div className="card overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Cuenta madre / marca</th>
              <th>País</th>
              <th className="!text-right">Envíos</th>
              <th className="!text-right">Entrega</th>
              <th className="!text-right">CTR</th>
              <th className="!text-right">CTOR</th>
              <th className="!text-right">Revenue</th>
              <th className="!text-right">Δ vs período ant.</th>
              <th className="!text-right">RPE</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <Row key={g.slug} name={g.name} href={`/grupos/${g.slug}`} accounts={g.accounts} />,
              ...g.accounts.map((a) => <Row key={a.slug} name={a.name} href={`/cuentas/${a.slug}`} accounts={[a]} child />),
            ])}
            {standalone.map((a) => (
              <Row key={a.slug} name={a.name} href={`/cuentas/${a.slug}`} accounts={[a]} />
            ))}
            {all.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-pd-slate">
                Todavía no hay cuentas. Corré la primera sincronización desde <Link href="/admin" className="text-pd-blue underline">Administración</Link>.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-pd-slate">
        El revenue de una cuenta madre se suma solo si todas sus marcas usan la misma moneda. Δ compara contra los {n} meses anteriores al rango elegido, solo si ese período tiene datos completos.
      </p>
    </div>
  );
}
