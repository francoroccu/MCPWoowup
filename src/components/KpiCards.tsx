import {
  emailLight, fmtCompact, fmtMoney, fmtPct, pctChange,
  type Light,
} from "@/lib/metrics";
import { monthLabel } from "@/lib/months";
import type { Snapshot } from "@/lib/views";

interface Props {
  current: Snapshot;
  prev: Snapshot;
  yoy: Snapshot;
  currency: string | null | "MIXED";
  showLights: boolean; // solo con canal email
  partial: boolean;
}

const LIGHT: Record<Exclude<Light, null>, string> = { ok: "bg-pd-green", warn: "bg-pd-orange", bad: "bg-pd-red" };

type Kind = "rel" | "pp";

function Delta({ value, kind, inverse, label }: { value: number | null; kind: Kind; inverse?: boolean; label: string }) {
  let body: React.ReactNode;
  if (value == null || !Number.isFinite(value)) body = <span className="text-pd-slate/50">—</span>;
  else if (Math.abs(value) < (kind === "pp" ? 0.00005 : 0.0005)) body = <span className="text-pd-slate">=</span>;
  else {
    const good = inverse ? value < 0 : value > 0;
    const txt = kind === "pp"
      ? `${value > 0 ? "+" : ""}${(value * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} pp`
      : `${value > 0 ? "+" : ""}${(value * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
    body = <span className={good ? "text-pd-green" : "text-pd-red"}>{value > 0 ? "▲" : "▼"} {txt}</span>;
  }
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-pd-slate/70">{label}</span>
      <span className="num font-semibold">{body}</span>
    </div>
  );
}

export function KpiCards({ current: c, prev, yoy, currency, showLights, partial }: Props) {
  const money = currency && currency !== "MIXED" ? currency : null;
  const revenueBlocked = c.revenueRedacted && c.revenue == null;
  const mk = (ref: Snapshot) => ({
    ok: ref.complete && !partial,
    rel: (a: number | null, b: number | null) => (ref.complete && !partial ? pctChange(a, b) : null),
    pp: (a: number | null, b: number | null) => (!ref.complete || a == null || b == null ? null : a - b),
  });
  const P = mk(prev);
  const Y = mk(yoy);
  const lp = `vs ${monthLabel(prev.month)}`;
  const ly = `vs ${monthLabel(yoy.month)} ${yoy.month.slice(2, 4)}`;

  const cards: { label: string; value: string; kind: Kind; get: (s: Snapshot) => number | null; inverse?: boolean; light?: Light; note?: string; noDelta?: boolean }[] = [
    { label: "Envíos", value: fmtCompact(c.sent), kind: "rel", get: (s) => s.sent },
    { label: "Tasa de entrega", value: fmtPct(c.k.deliveryRate), kind: "pp", get: (s) => s.k.deliveryRate, light: showLights ? emailLight("deliveryRate", c.k.deliveryRate) : null },
    { label: "CTR", value: fmtPct(c.k.ctr, 2), kind: "pp", get: (s) => s.k.ctr, light: showLights ? emailLight("ctr", c.k.ctr) : null },
    { label: "CTOR", value: fmtPct(c.k.ctor), kind: "pp", get: (s) => s.k.ctor, light: showLights ? emailLight("ctor", c.k.ctor) : null },
    {
      label: "Revenue atribuido",
      value: revenueBlocked ? "No disponible" : currency === "MIXED" ? "Multi-moneda" : fmtMoney(c.revenue, money, true),
      note: revenueBlocked ? "Revenue no disponible por permisos" : currency === "MIXED" ? "Ver detalle por marca" : undefined,
      kind: "rel", get: (s) => s.revenue,
    },
    { label: "Revenue por envío", value: revenueBlocked || currency === "MIXED" ? "—" : fmtMoney(c.k.rpe, money), kind: "rel", get: (s) => s.k.rpe },
    { label: "% revenue automatizaciones", value: fmtPct(c.autoRevenueShare), kind: "pp", get: (s) => s.autoRevenueShare },
    { label: "Desuscripción", value: fmtPct(c.k.unsubRate, 2), kind: "pp", get: (s) => s.k.unsubRate, inverse: true, light: showLights ? emailLight("unsubRate", c.k.unsubRate) : null },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="card p-4 flex flex-col">
            <div className="flex items-center gap-2">
              {card.light && <span className={`h-2 w-2 rounded-full ${LIGHT[card.light]}`} title="Referencia orientativa email retail" />}
              <span className="label">{card.label}</span>
            </div>
            <div className="num mt-2 text-2xl font-semibold text-pd-navy">{card.value}</div>
            <div className="mt-auto pt-2 space-y-0.5">
              {card.note ? (
                <span className="text-xs text-pd-orange font-semibold">{card.note}</span>
              ) : (
                <>
                  <Delta label={lp} kind={card.kind} inverse={card.inverse}
                    value={card.kind === "rel" ? P.rel(card.get(c), card.get(prev)) : P.pp(card.get(c), card.get(prev))} />
                  <Delta label={ly} kind={card.kind} inverse={card.inverse}
                    value={card.kind === "rel" ? Y.rel(card.get(c), card.get(yoy)) : Y.pp(card.get(c), card.get(yoy))} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-pd-slate">
        pp = puntos porcentuales. Las variaciones solo se muestran si el mes de comparación tiene datos de todas las marcas
        {partial && <> · <strong className="text-pd-orange">Mes en curso:</strong> los volúmenes y el revenue son parciales y no se comparan; las tasas sí.</>}
      </p>
    </div>
  );
}
