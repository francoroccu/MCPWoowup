"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  from: string;
  to: string;
  channel: string;
  groupType: string;
  monthOptions: { value: string; label: string }[];
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

  const Sel = (props: { label: string; k: string; value: string; options: { value: string; label: string }[] }) => (
    <label className="flex flex-col gap-1">
      <span className="label">{props.label}</span>
      <select className="field" value={props.value} onChange={(e) => set(props.k, e.target.value)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className={`card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 transition ${pending ? "opacity-60" : ""}`}>
      <Sel label="Desde" k="from" value={p.from} options={p.monthOptions} />
      <Sel label="Hasta" k="to" value={p.to} options={p.monthOptions} />
      <Sel label="Canal" k="channel" value={p.channel} options={p.channels} />
      <Sel label="Tipo de campaña" k="type" value={p.groupType} options={TYPES} />
    </div>
  );
}
