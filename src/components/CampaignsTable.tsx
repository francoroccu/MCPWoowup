"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtInt, fmtMoney, fmtPct, kpis } from "@/lib/metrics";
import type { CampaignRow } from "@/lib/types";

export type CampaignItem = CampaignRow & { brandName?: string; currency: string | null; href: string };

type SortKey = "name" | "sentAt" | "sent" | "deliveryRate" | "openRate" | "ctr" | "ctor" | "unsubRate" | "conversions" | "clicks" | "revenue" | "rpe";

const CH_LABEL: Record<string, string> = { email: "Email", sms: "SMS", whatsapp: "WhatsApp", push: "Push" };

export function CampaignsTable({
  items, showBrand, initialChannel = "all", initialType = "all", showRevenue,
}: {
  items: CampaignItem[];
  showBrand: boolean;
  initialChannel?: string;
  initialType?: string;
  showRevenue: boolean;
}) {
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState(initialChannel);
  const [type, setType] = useState(initialType);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: showRevenue ? "revenue" : "clicks", dir: -1 });
  const [limit, setLimit] = useState(15);

  const channels = useMemo(() => [...new Set(items.map((i) => i.channel))], [items]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const enriched = items
      .filter((i) => (channel === "all" || i.channel === channel) && (type === "all" || i.groupType === type))
      .filter((i) => !term || i.name.toLowerCase().includes(term) || (i.brandName ?? "").toLowerCase().includes(term) || (i.campaignType ?? "").toLowerCase().includes(term))
      .map((i) => ({ i, k: kpis(i) }));
    const val = (r: (typeof enriched)[number]): number | string => {
      switch (sort.key) {
        case "name": return r.i.name.toLowerCase();
        case "sentAt": return r.i.sentAt ?? "";
        case "sent": return r.i.sent;
        case "conversions": return r.i.conversions;
        case "clicks": return r.i.clicks;
        case "revenue": return r.i.revenue ?? -1;
        default: return (r.k[sort.key as keyof typeof r.k] as number | null) ?? -1;
      }
    };
    return enriched.sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [items, q, channel, type, sort]);

  const Th = ({ k, children, right = true }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={right ? "!text-right" : ""}>
      <button
        className="uppercase tracking-wider hover:text-pd-cyan"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === "name" ? 1 : -1 }))}
      >
        {children} {sort.key === k ? (sort.dir === -1 ? "↓" : "↑") : ""}
      </button>
    </th>
  );

  const pill = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold border transition ${active ? "bg-pd-navy text-white border-pd-navy" : "bg-white text-pd-slate border-pd-line hover:border-pd-blue"}`;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-pd-line">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campaña…" className="field w-56" />
        <div className="flex flex-wrap gap-1">
          <button className={pill(type === "all")} onClick={() => setType("all")}>Todas</button>
          <button className={pill(type === "custom")} onClick={() => setType("custom")}>One-shot</button>
          <button className={pill(type === "triggered")} onClick={() => setType("triggered")}>Automatizaciones</button>
        </div>
        <div className="flex flex-wrap gap-1">
          <button className={pill(channel === "all")} onClick={() => setChannel("all")}>Todos los canales</button>
          {channels.map((c) => (
            <button key={c} className={pill(channel === c)} onClick={() => setChannel(c)}>{CH_LABEL[c] ?? c}</button>
          ))}
        </div>
        <span className="ml-auto text-xs text-pd-slate">{rows.length} campañas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl w-full">
          <thead>
            <tr>
              <Th k="name" right={false}>Campaña</Th>
              {showBrand && <th>Marca</th>}
              <th>Canal</th>
              <Th k="sentAt" right={false}>Envío</Th>
              <Th k="sent">Envíos</Th>
              <Th k="deliveryRate">Entrega</Th>
              <Th k="openRate">Open</Th>
              <Th k="ctr">CTR</Th>
              <Th k="ctor">CTOR</Th>
              <Th k="unsubRate">Desusc.</Th>
              <Th k="conversions">Conv.</Th>
              {showRevenue && <Th k="revenue">Revenue</Th>}
              {showRevenue && <Th k="rpe">RPE</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map(({ i, k }) => (
              <tr key={`${i.accountSlug}-${i.campaignId}`}>
                <td className="max-w-[320px]">
                  <Link href={i.href} className="font-semibold hover:text-pd-blue block truncate" title={i.name}>{i.name}</Link>
                  <span className={`mt-0.5 inline-block rounded px-1.5 text-[10px] font-bold uppercase tracking-wider ${i.groupType === "triggered" ? "bg-pd-green/10 text-emerald-700" : "bg-pd-blue/10 text-pd-blue"}`}>
                    {i.groupType === "triggered" ? "Automatización" : "One-shot"}
                  </span>
                  {i.campaignType && <span className="ml-1 text-[11px] text-pd-slate">{i.campaignType}</span>}
                </td>
                {showBrand && <td className="text-pd-slate">{i.brandName}</td>}
                <td>{CH_LABEL[i.channel] ?? i.channel}</td>
                <td className="num text-xs text-pd-slate">{i.sentAt ? i.sentAt.split("-").reverse().slice(0, 2).join("/") : "continua"}</td>
                <td className="num text-right">{fmtInt(i.sent)}</td>
                <td className="num text-right">{fmtPct(k.deliveryRate)}</td>
                <td className="num text-right">{i.channel === "sms" ? "—" : fmtPct(k.openRate)}</td>
                <td className="num text-right">{fmtPct(k.ctr, 2)}</td>
                <td className="num text-right">{fmtPct(k.ctor)}</td>
                <td className="num text-right">{fmtPct(k.unsubRate, 2)}</td>
                <td className="num text-right">{fmtInt(i.conversions)}</td>
                {showRevenue && (
                  <td className="num text-right font-semibold">
                    {i.revenueRedacted && i.revenue == null ? <span className="text-xs text-pd-orange">sin permisos</span> : fmtMoney(i.revenue, i.currency)}
                  </td>
                )}
                {showRevenue && <td className="num text-right">{fmtMoney(k.rpe, i.currency)}</td>}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={13} className="py-8 text-center text-pd-slate">No hay campañas con estos filtros en el mes.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="p-3 text-center border-t border-pd-line">
          <button className="btn-ghost" onClick={() => setLimit((l) => l + 50)}>Ver más ({rows.length - limit} restantes)</button>
        </div>
      )}
    </div>
  );
}
