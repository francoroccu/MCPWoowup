"use client";
import { useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const PALETTE = ["#2563eb", "#06b6d4", "#10b981", "#f59e0b", "#1a2332", "#8b5cf6", "#ec4899", "#64748b"];
const compact = (n: number) => new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export interface TrendPoint {
  label: string;
  sent: number;
  revenue: number | null;
  ctr: number | null; // en %
}

export function TrendChart({
  data, showRevenue, highlight, title = "Últimos 12 meses",
}: { data: TrendPoint[]; showRevenue: boolean; highlight?: string; title?: string }) {
  const [right, setRight] = useState<"revenue" | "ctr">(showRevenue ? "revenue" : "ctr");
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="h-display text-sm">{title}</h3>
        <div className="flex gap-1 text-xs">
          {showRevenue && (
            <button onClick={() => setRight("revenue")} className={`rounded px-2 py-1 font-semibold ${right === "revenue" ? "bg-pd-navy text-white" : "text-pd-slate"}`}>Envíos + revenue</button>
          )}
          <button onClick={() => setRight("ctr")} className={`rounded px-2 py-1 font-semibold ${right === "ctr" ? "bg-pd-navy text-white" : "text-pd-slate"}`}>Envíos + CTR</button>
        </div>
      </div>
      <div className="h-72 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e3e7ee" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#4a5568" }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tickFormatter={compact} tick={{ fontSize: 11, fill: "#4a5568" }} axisLine={false} tickLine={false} width={48} />
            <YAxis
              yAxisId="r" orientation="right" axisLine={false} tickLine={false} width={52}
              tick={{ fontSize: 11, fill: "#4a5568" }}
              tickFormatter={(v: number) => (right === "ctr" ? `${v.toFixed(1)}%` : compact(v))}
            />
            <Tooltip
              formatter={(v, name) =>
                name === "CTR" ? `${Number(v).toFixed(2)}%` : new Intl.NumberFormat("es-AR").format(Math.round(Number(v)))
              }
              contentStyle={{ borderRadius: 8, border: "1px solid #e3e7ee", fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="l" dataKey="sent" name="Envíos" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={36}>
              {data.map((d) => (
                <Cell key={d.label} fill={!highlight || d.label === highlight ? "#2563eb" : "#bfd0f7"} />
              ))}
            </Bar>
            {right === "revenue" ? (
              <Line yAxisId="r" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            ) : (
              <Line yAxisId="r" dataKey="ctr" name="CTR" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface StackPoint {
  label: string;
  [brand: string]: number | string | null;
}

export function BrandStackChart({
  datasets, brands,
}: {
  datasets: { key: string; label: string; data: StackPoint[] }[];
  brands: { slug: string; name: string }[];
}) {
  const [active, setActive] = useState(datasets[0]?.key);
  const ds = datasets.find((d) => d.key === active) ?? datasets[0];
  if (!ds) return null;
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="h-display text-sm">Aporte de cada marca por mes</h3>
        <div className="flex gap-1 text-xs">
          {datasets.map((d) => (
            <button key={d.key} onClick={() => setActive(d.key)} className={`rounded px-2 py-1 font-semibold ${active === d.key ? "bg-pd-navy text-white" : "text-pd-slate"}`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-72 mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={ds.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e3e7ee" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#4a5568" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "#4a5568" }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              formatter={(v) => new Intl.NumberFormat("es-AR").format(Math.round(Number(v)))}
              contentStyle={{ borderRadius: 8, border: "1px solid #e3e7ee", fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {brands.map((b, i) => (
              <Bar key={b.slug} dataKey={b.slug} name={b.name} stackId="a" fill={PALETTE[i % PALETTE.length]} maxBarSize={40} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
