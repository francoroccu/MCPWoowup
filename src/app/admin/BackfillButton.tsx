"use client";
import { useState } from "react";
import { syncMonth } from "./actions";

const pad = (n: number) => String(n).padStart(2, "0");
function months(from: string) {
  const now = new Date();
  const to = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  while (`${y}-${pad(m)}` <= to && out.length < 60) {
    out.push(`${y}-${pad(m)}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function BackfillButton({ disabled }: { disabled: boolean }) {
  const [from, setFrom] = useState(`${new Date().getFullYear() - 1}-01`);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const run = async () => {
    const list = months(from);
    setRunning(true);
    setLog([]);
    setProgress(0);
    for (let i = 0; i < list.length; i++) {
      try {
        const r = await syncMonth(list[i]);
        setLog((l) => [...l, `✓ ${list[i]}: ${r.ok} cuentas${r.failed.length ? ` · ${r.failed.length} con error (${r.failed.map((f) => f.account).join(", ")})` : ""}`]);
      } catch (e) {
        setLog((l) => [...l, `✗ ${list[i]}: ${e instanceof Error ? e.message : "error"}`]);
      }
      setProgress((i + 1) / list.length);
    }
    setRunning(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="label">Desde</span>
          <input id="backfill-from" type="month" className="field" value={from} onChange={(e) => setFrom(e.target.value)} disabled={running || disabled} />
        </label>
        <button className="btn" onClick={run} disabled={running || disabled}>
          {running ? `Cargando… ${Math.round(progress * 100)}%` : `Cargar ${months(from).length} meses`}
        </button>
      </div>
      {(running || log.length > 0) && (
        <>
          <div className="h-1.5 rounded-full bg-pd-line overflow-hidden">
            <div className="h-full bg-pd-blue transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
          <ul className="num text-xs space-y-0.5 max-h-48 overflow-auto">
            {log.map((l, i) => <li key={i} className={l.startsWith("✗") || l.includes("con error") ? "text-pd-red" : "text-pd-slate"}>{l}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
