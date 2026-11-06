"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Insight, Severity } from "@/lib/insights";

export const SEV: Record<Severity, { label: string; pill: string; dot: string }> = {
  critical: { label: "Crítico", pill: "bg-red-50 text-red-700 border-red-200", dot: "bg-pd-red" },
  warning: { label: "Atención", pill: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-pd-orange" },
  opportunity: { label: "Oportunidad", pill: "bg-blue-50 text-pd-blue border-blue-200", dot: "bg-pd-blue" },
  positive: { label: "Positivo", pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-pd-green" },
  info: { label: "Info", pill: "bg-slate-50 text-pd-slate border-slate-200", dot: "bg-pd-slate" },
};

const FILTERS: { key: "all" | Severity; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "critical", label: "Críticos" },
  { key: "warning", label: "Atención" },
  { key: "opportunity", label: "Oportunidades" },
  { key: "positive", label: "Positivos" },
];

export function InsightsPanel({ insights, monthName }: { insights: Insight[]; monthName: string }) {
  const [filter, setFilter] = useState<"all" | Severity>("all");
  const [expanded, setExpanded] = useState(false);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of insights) c[i.severity] = (c[i.severity] ?? 0) + 1;
    return c;
  }, [insights]);
  const list = insights.filter((i) => filter === "all" || i.severity === filter);
  const shown = expanded ? list : list.slice(0, 6);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="h-display text-lg">Insights de {monthName}</h2>
          <p className="text-xs text-pd-slate mt-0.5">
            Generados por reglas sobre los datos de WoowUp. <strong>Dato</strong> = lo que reporta la plataforma · <strong>Cálculo</strong> = fórmula aplicada ·
            <strong> Hipótesis</strong> = interpretación a validar, no un hecho.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const n = f.key === "all" ? insights.length : counts[f.key] ?? 0;
            if (f.key !== "all" && n === 0) return null;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? "bg-pd-navy text-white border-pd-navy" : "bg-white text-pd-slate border-pd-line hover:border-pd-blue"}`}
              >
                {f.key !== "all" && <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${SEV[f.key].dot}`} />}
                {f.label} <span className="num">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="card p-6 text-sm text-pd-slate">Sin hallazgos relevantes para este mes con los filtros de las reglas actuales.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {shown.map((i) => (
            <article key={i.id} className="card p-4 flex flex-col gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEV[i.severity].pill}`}>{SEV[i.severity].label}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-pd-slate">{i.area}</span>
                {i.brand && <span className="text-[11px] text-pd-slate">· {i.brand}</span>}
              </div>
              <h3 className="font-semibold leading-snug text-pd-navy">{i.title}</h3>
              <dl className="grid grid-cols-[78px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[13px] leading-snug">
                <dt className="label pt-0.5">Dato</dt>
                <dd className="text-pd-navy">{i.dato}</dd>
                {i.calculo && (<><dt className="label pt-0.5">Cálculo</dt><dd className="text-pd-slate">{i.calculo}</dd></>)}
                {i.hipotesis && (<><dt className="label pt-0.5">Hipótesis</dt><dd className="text-pd-slate italic">{i.hipotesis}</dd></>)}
                {i.accion && (<><dt className="label pt-0.5 text-pd-blue">Acción</dt><dd className="text-pd-navy font-medium">{i.accion}</dd></>)}
              </dl>
              {(i.impacto || i.link) && (
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs">
                  {i.impacto && <span className="text-pd-slate">Impacto <strong className="text-pd-navy">{i.impacto}</strong></span>}
                  {i.esfuerzo && <span className="text-pd-slate">· Esfuerzo <strong className="text-pd-navy">{i.esfuerzo}</strong></span>}
                  {i.link && <Link href={i.link.href} className="ml-auto font-semibold text-pd-blue hover:underline">{i.link.label} →</Link>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {list.length > 6 && (
        <div className="text-center">
          <button className="btn-ghost" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Ver menos" : `Ver los ${list.length} insights`}
          </button>
        </div>
      )}
    </section>
  );
}
