"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  month: string;
  channel: string;
  groupType: string;
  monthOptions: { value: string; label: string }[]; // del más reciente al más antiguo
  channels: { value: string; label: string }[];
}

const TYPES = [
  { value: "all", label: "One-shot + automatizaciones" },
  { value: "custom", label: "Solo one-shot" },
  { value: "triggered", label: "Solo automatizaciones" },
];

export function Filters(p: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    next.set(key, value);
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const idx = p.monthOptions.findIndex((o) => o.value === p.month);
  const newer = idx > 0 ? p.monthOptions[idx - 1] : null;
  const older = idx >= 0 && idx < p.monthOptions.length - 1 ? p.monthOptions[idx + 1] : null;

  const arrow = "h-10 w-10 shrink-0 rounded-md border border-pd-line bg-white text-lg font-bold text-pd-navy hover:border-pd-blue hover:text-pd-blue disabled:opacity-30 disabled:hover:border-pd-line disabled:hover:text-pd-navy";

  return (
    <div className={`card p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_1fr_1fr] gap-3 transition ${pending ? "opacity-60" : ""}`}>
      <label className="flex flex-col gap-1">
        <span className="label">Mes</span>
        <div className="flex gap-2">
          <button type="button" aria-label="Mes anterior" className={arrow} disabled={!older} onClick={() => older && set("month", older.value)}>‹</button>
          <select className="field flex-1 font-semibold" value={p.month} onChange={(e) => set("month", e.target.value)}>
            {p.monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button type="button" aria-label="Mes siguiente" className={arrow} disabled={!newer} onClick={() => newer && set("month", newer.value)}>›</button>
        </div>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Canal</span>
        <select className="field" value={p.channel} onChange={(e) => set("channel", e.target.value)}>
          {p.channels.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Tipo de campaña</span>
        <select className="field" value={p.groupType} onChange={(e) => set("type", e.target.value)}>
          {TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    </div>
  );
}
