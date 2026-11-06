"use client";
import { useMemo, useState, useTransition } from "react";
import type { Insight, Level } from "@/lib/insights";
import { setActionStatus } from "@/app/acciones/actions";
import { SEV } from "./InsightsPanel";

type Status = "pendiente" | "en_curso" | "hecho" | "descartado";
const STATUS: { value: Status; label: string; cls: string }[] = [
  { value: "pendiente", label: "Pendiente", cls: "text-pd-slate" },
  { value: "en_curso", label: "En curso", cls: "text-pd-blue" },
  { value: "hecho", label: "Hecho", cls: "text-emerald-700" },
  { value: "descartado", label: "Descartado", cls: "text-pd-slate/60" },
];
const L: Record<Level, number> = { Alto: 3, Medio: 2, Bajo: 1 };

/** Prioridad = impacto alto y esfuerzo bajo primero (quick wins). */
const score = (i: Insight) => L[i.impacto ?? "Bajo"] * 2 - L[i.esfuerzo ?? "Medio"] + (i.severity === "critical" ? 3 : i.severity === "warning" ? 1 : 0);

export function ActionPlan({
  insights, scopeKey, initial, persist,
}: {
  insights: Insight[];
  scopeKey: string;
  initial: Record<string, Status>;
  persist: boolean; // sin base de datos el estado vive solo en la página
}) {
  const [state, setState] = useState<Record<string, Status>>(initial);
  const [hideDone, setHideDone] = useState(false);
  const [, start] = useTransition();
  const items = useMemo(() => insights.filter((i) => i.accion).sort((a, b) => score(b) - score(a)), [insights]);
  const st = (id: string) => state[id] ?? "pendiente";
  const done = items.filter((i) => st(i.id) === "hecho").length;
  const visible = items.filter((i) => !hideDone || !["hecho", "descartado"].includes(st(i.id)));

  const update = (i: Insight, status: Status) => {
    setState((s) => ({ ...s, [i.id]: status }));
    if (persist) start(() => setActionStatus(scopeKey, i.id, i.title, status));
  };

  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="h-display text-lg">Plan de mejoras</h2>
          <p className="text-xs text-pd-slate mt-0.5">
            Acciones sugeridas por los insights, ordenadas por impacto y esfuerzo. {done} de {items.length} hechas.
            {!persist && " En la vista previa el estado no se guarda."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-pd-slate">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Ocultar hechas y descartadas
        </label>
      </div>
      <div className="h-1.5 rounded-full bg-pd-line overflow-hidden">
        <div className="h-full bg-pd-green transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>
      <div className="card overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <th>Mejora</th>
              <th>Área</th>
              <th>Impacto</th>
              <th>Esfuerzo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => {
              const s = st(i.id);
              const quick = i.impacto === "Alto" && i.esfuerzo === "Bajo";
              return (
                <tr key={i.id} className={s === "hecho" || s === "descartado" ? "opacity-55" : ""}>
                  <td className="!whitespace-normal min-w-[280px] max-w-[560px]">
                    <div className={`font-medium ${s === "hecho" ? "line-through" : ""}`}>{i.accion}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-pd-slate">
                      <span className={`inline-block h-2 w-2 rounded-full ${SEV[i.severity].dot}`} />
                      {i.title}
                      {i.brand && <span>· {i.brand}</span>}
                      {quick && <span className="rounded bg-pd-green/10 px-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Quick win</span>}
                    </div>
                  </td>
                  <td className="text-xs">{i.area}</td>
                  <td className="text-xs font-semibold">{i.impacto ?? "—"}</td>
                  <td className="text-xs">{i.esfuerzo ?? "—"}</td>
                  <td>
                    <select
                      aria-label={`Estado de: ${i.accion}`}
                      className={`field py-1 text-xs font-semibold ${STATUS.find((x) => x.value === s)?.cls}`}
                      value={s}
                      onChange={(e) => update(i, e.target.value as Status)}
                    >
                      {STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
