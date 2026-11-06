import { fmtInt, fmtMoney, fmtPct, pctChange } from "@/lib/metrics";
import { monthLabel } from "@/lib/months";
import type { MonthPoint } from "@/lib/views";

export function MonthlyTable({ series, currency }: { series: MonthPoint[]; currency: string | null | "MIXED" }) {
  const money = currency && currency !== "MIXED" ? currency : null;
  const showRevenue = currency !== "MIXED";
  const rows = [...series].reverse();
  return (
    <div className="card overflow-x-auto">
      <table className="tbl w-full">
        <thead>
          <tr>
            <th>Mes</th>
            <th className="!text-right">Envíos</th>
            <th className="!text-right">Entrega</th>
            <th className="!text-right">Open rate</th>
            <th className="!text-right">Clics</th>
            <th className="!text-right">CTR</th>
            <th className="!text-right">CTOR</th>
            <th className="!text-right">Rebote</th>
            <th className="!text-right">Desusc.</th>
            {showRevenue && (
              <>
                <th className="!text-right">Revenue</th>
                <th className="!text-right">Δ mes ant.</th>
                <th className="!text-right">RPE</th>
                <th className="!text-right">Ticket</th>
              </>
            )}
            <th className="!text-right">% autom.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const idx = series.findIndex((s) => s.month === r.month);
            const prev = idx > 0 ? series[idx - 1] : null;
            const d = pctChange(r.revenue, prev?.revenue ?? null);
            const empty = r.sent === 0;
            return (
              <tr key={r.month} className={empty ? "text-pd-slate/50" : ""}>
                <td className="font-semibold">{monthLabel(r.month)} {r.month.slice(0, 4)}</td>
                <td className="num text-right">{fmtInt(r.sent)}</td>
                <td className="num text-right">{fmtPct(r.k.deliveryRate)}</td>
                <td className="num text-right">{fmtPct(r.k.openRate)}</td>
                <td className="num text-right">{fmtInt(r.clicks)}</td>
                <td className="num text-right">{fmtPct(r.k.ctr, 2)}</td>
                <td className="num text-right">{fmtPct(r.k.ctor)}</td>
                <td className="num text-right">{fmtPct(r.k.bounceRate, 2)}</td>
                <td className="num text-right">{fmtPct(r.k.unsubRate, 2)}</td>
                {showRevenue && (
                  <>
                    <td className="num text-right font-semibold">
                      {r.revenueRedacted && r.revenue == null ? <span className="text-pd-orange text-xs">Sin permisos</span> : fmtMoney(r.revenue, money)}
                    </td>
                    <td className={`num text-right ${d == null ? "" : d >= 0 ? "text-pd-green" : "text-pd-red"}`}>
                      {d == null ? "—" : `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}%`}
                    </td>
                    <td className="num text-right">{fmtMoney(r.k.rpe, money)}</td>
                    <td className="num text-right">{fmtMoney(r.k.avgTicket, money)}</td>
                  </>
                )}
                <td className="num text-right">{fmtPct(r.autoRevenueShare)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-pd-slate">
        Entrega = (envíos − rebotes) / envíos · CTR = clics / entregados · CTOR = clics / aperturas · RPE = revenue / envíos ·
        Ticket = revenue / conversiones · % autom. = revenue de automatizaciones / revenue total. El open rate de email está inflado por Apple MPP.
      </p>
    </div>
  );
}
