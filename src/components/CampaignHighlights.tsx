import Link from "next/link";
import { fmtInt, fmtMoney, fmtPct, kpis } from "@/lib/metrics";
import type { CampaignItem } from "./CampaignsTable";

/** Mínimo de envíos para entrar al ranking (evita pruebas y seeds). */
const MIN_SENT = 1000;

export function CampaignHighlights({
  items, byRevenue, monthName,
}: {
  items: CampaignItem[];
  byRevenue: boolean; // si no hay revenue (permisos o multi-moneda) se rankea por clics
  monthName: string;
}) {
  const eligible = items.filter((i) => i.sent >= MIN_SENT);
  const metric = (i: CampaignItem) => (byRevenue ? i.revenue ?? 0 : i.clicks);
  const sorted = [...eligible].sort((a, b) => metric(b) - metric(a));
  const top = sorted.slice(0, 5);
  const bottom = sorted.length > 5 ? sorted.slice(-5).reverse() : [];

  const oneShot = items.filter((i) => i.groupType === "custom");
  const autos = items.filter((i) => i.groupType === "triggered");
  const sum = (xs: CampaignItem[], f: (i: CampaignItem) => number) => xs.reduce((t, i) => t + f(i), 0);
  const autoRev = sum(autos, (i) => i.revenue ?? 0);
  const totalRev = sum(items, (i) => i.revenue ?? 0);
  const best = top[0];

  const List = ({ title, rows, tone }: { title: string; rows: CampaignItem[]; tone: "good" | "bad" }) => (
    <div className="card p-4">
      <h3 className="h-display text-sm flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${tone === "good" ? "bg-pd-green" : "bg-pd-red"}`} />
        {title}
      </h3>
      <ol className="mt-3 space-y-2">
        {rows.map((i, n) => {
          const k = kpis(i);
          return (
            <li key={`${i.accountSlug}-${i.campaignId}`} className="flex items-start gap-3 text-sm">
              <span className="num w-4 text-pd-slate">{n + 1}</span>
              <div className="min-w-0 flex-1">
                <Link href={i.href} className="font-semibold hover:text-pd-blue block truncate" title={i.name}>{i.name}</Link>
                <div className="text-xs text-pd-slate">
                  {i.brandName ? `${i.brandName} · ` : ""}{i.channel} · {i.groupType === "triggered" ? "automatización" : "one-shot"} · {fmtInt(i.sent)} envíos · CTR {fmtPct(k.ctr, 2)}
                </div>
              </div>
              <span className="num font-semibold whitespace-nowrap">{byRevenue ? fmtMoney(i.revenue, i.currency, true) : `${fmtInt(i.clicks)} clics`}</span>
            </li>
          );
        })}
        {rows.length === 0 && <li className="text-sm text-pd-slate">Se necesitan más de 5 campañas con al menos {fmtInt(MIN_SENT)} envíos.</li>}
      </ol>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="label">One-shot enviadas</div>
          <div className="num mt-2 text-2xl font-semibold">{fmtInt(oneShot.length)}</div>
          <div className="text-xs text-pd-slate mt-1">{(oneShot.length / 4.345).toFixed(1)} por semana en {monthName}</div>
        </div>
        <div className="card p-4">
          <div className="label">Automatizaciones activas</div>
          <div className="num mt-2 text-2xl font-semibold">{fmtInt(autos.length)}</div>
          <div className="text-xs text-pd-slate mt-1">{[...new Set(autos.map((a) => a.campaignType).filter(Boolean))].length} tipos de flujo</div>
        </div>
        <div className="card p-4">
          <div className="label">Revenue de automatizaciones</div>
          <div className="num mt-2 text-2xl font-semibold">{byRevenue ? fmtPct(totalRev ? autoRev / totalRev : null) : "—"}</div>
          <div className="text-xs text-pd-slate mt-1">del revenue de campañas del mes</div>
        </div>
        <div className="card p-4">
          <div className="label">Mejor campaña</div>
          <div className="mt-2 font-semibold truncate" title={best?.name}>{best ? best.name : "—"}</div>
          <div className="text-xs text-pd-slate mt-1">{best ? (byRevenue ? fmtMoney(best.revenue, best.currency) : `${fmtInt(best.clicks)} clics`) : ""}</div>
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <List title={`Top 5 por ${byRevenue ? "revenue" : "clics"}`} rows={top} tone="good" />
        <List title={`Bottom 5 por ${byRevenue ? "revenue" : "clics"}`} rows={bottom} tone="bad" />
      </div>
      <p className="text-xs text-pd-slate">
        Ranking entre campañas con al menos {fmtInt(MIN_SENT)} envíos en el mes.
        {!byRevenue && " Se usa clics porque el revenue no está disponible (permisos o marcas con distinta moneda)."}
      </p>
    </div>
  );
}
