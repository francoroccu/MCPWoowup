import Link from "next/link";

export function PageHeader({
  crumbs, title, subtitle, badges,
}: {
  crumbs: { label: string; href?: string }[];
  title: string;
  subtitle?: string;
  badges?: React.ReactNode;
}) {
  return (
    <div>
      <nav className="text-xs font-semibold text-pd-slate flex flex-wrap gap-1">
        {crumbs.map((c, i) => (
          <span key={i} className="flex gap-1">
            {c.href ? <Link href={c.href} className="hover:text-pd-blue">{c.label}</Link> : <span>{c.label}</span>}
            {i < crumbs.length - 1 && <span className="text-pd-slate/40">/</span>}
          </span>
        ))}
      </nav>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="h-display text-3xl">{title}</h1>
        {badges}
      </div>
      {subtitle && <p className="text-sm text-pd-slate mt-1">{subtitle}</p>}
    </div>
  );
}

export function Badge({ children, tone = "cyan" }: { children: React.ReactNode; tone?: "cyan" | "orange" | "slate" }) {
  const cls = {
    cyan: "bg-pd-cyan/10 text-cyan-700",
    orange: "bg-pd-orange/15 text-amber-700",
    slate: "bg-pd-slate/10 text-pd-slate",
  }[tone];
  return <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${cls}`}>{children}</span>;
}
