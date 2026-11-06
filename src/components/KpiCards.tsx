import {
  emailLight, fmtCompact, fmtMoney, fmtPct, pctChange,
  type Counts, type Kpis, type Light,
} from "@/lib/metrics";

type Total = Counts & { k: Kpis; autoRevenueShare?: number | null };

interface Props {
  total: Total;
  prev: Total & { complete?: boolean };
  currency: string | null | "MIXED";
  showLights: boolean; // solo tiene sentido con canal email
  prevLabel: string;
}

const LIGHT: Record<Exclude<Light, null>, string> = { ok: "bg-pd-green", warn: "bg-pd-orange", bad: "bg-pd-red" };

function Delta({ value, kind, inverse }: { value: number | null; kind: "rel" | "pp"; inverse?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="text-pd-slate/60">sin comparación</span>;
  if (Math.abs(value) < (kind === "pp" ? 0.00005 : 0.0005)) return <span className="text-pd-slate">= sin cambios</span>;
  const good = inverse ? value < 0 : value > 0;
  const txt =
    kind === "pp"
      ? `${value > 0 ? "+" : ""}${(value * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} pp`
      : `${value > 0 ? "+" : ""}${(value * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
  return <span className={value === 0 ? "text-pd-slate" : good ? "text-pd-green" : "text-pd-red"}>{value > 0 ? "▲" : value < 0 ? "▼" : "•"} {txt}</span>;
}

export function KpiCards({ total, prev, currency, showLights, prevLabel }: Props) {
  const money = currency && currency !== "MIXED" ? currency : null;
  const revenueBlocked = total.revenueRedacted && total.revenue == null;
  const cmp = prev.complete !== false;
  const pp = (a: number | null, b: number | null) => (!cmp || a == null || b == null ? null : a - b);
  const rel = (a: number | null, b: number | null) => (cmp ? pctChange(a, b) : null);

  const cards: {
    label: string; value: string; delta: React.ReactNode; light?: Light; note?: string;
  }[] = [
    { label: "Envíos", value: fmtCompact(total.sent), delta: <Delta value={rel(total.sent, prev.sent)} kind="rel" /> },
    {
      label: "Tasa de entrega", value: fmtPct(total.k.deliveryRate),
      delta: <Delta value={pp(total.k.deliveryRate, prev.k.deliveryRate)} kind="pp" />,
      light: showLights ? emailLight("deliveryRate", total.k.deliveryRate) : null,
    },
    {
      label: "CTR", value: fmtPct(total.k.ctr, 2), delta: <Delta value={pp(total.k.ctr, prev.k.ctr)} kind="pp" />,
      light: showLights ? emailLight("ctr", total.k.ctr) : null,
    },
    {
      label: "CTOR", value: fmtPct(total.k.ctor), delta: <Delta value={pp(total.k.ctor, prev.k.ctor)} kind="pp" />,
      light: showLights ? emailLight("ctor", total.k.ctor) : null,
    },
    {
      label: "Revenue atribuido",
      value: revenueBlocked ? "No disponible" : currency === "MIXED" ? "Multi-moneda" : fmtMoney(total.revenue, money, true),
      note: revenueBlocked ? "Revenue no disponible por permisos" : currency === "MIXED" ? "Ver detalle por marca" : undefined,
      delta: <Delta value={rel(total.revenue, prev.revenue)} kind="rel" />,
    },
    {
      label: "Revenue por envío",
      value: revenueBlocked || currency === "MIXED" ? "—" : fmtMoney(total.k.rpe, money),
      delta: <Delta value={rel(total.k.rpe, prev.k.rpe)} kind="rel" />,
    },
    {
      label: "% revenue automatizaciones",
      value: fmtPct(total.autoRevenueShare ?? null),
      delta: <span className="text-pd-slate/60">del revenue CRM</span>,
    },
    {
      label: "Desuscripción", value: fmtPct(total.k.unsubRate, 2),
      delta: <Delta value={pp(total.k.unsubRate, prev.k.unsubRate)} kind="pp" inverse />,
      light: showLights ? emailLight("unsubRate", total.k.unsubRate) : null,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center gap-2">
              {c.light && <span className={`h-2 w-2 rounded-full ${LIGHT[c.light]}`} title="Referencia orientativa email retail" />}
              <span className="label">{c.label}</span>
            </div>
            <div className="num mt-2 text-2xl font-semibold text-pd-navy">{c.value}</div>
            <div className="mt-1 text-xs">{c.note ? <span className="text-pd-orange font-semibold">{c.note}</span> : c.delta}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-pd-slate">
        {cmp
          ? <>Variaciones vs. {prevLabel}. pp = puntos porcentuales.</>
          : <>Sin comparación: no hay histórico completo para {prevLabel}. Se habilita al sincronizar esos meses.</>}
      </p>
    </div>
  );
}
