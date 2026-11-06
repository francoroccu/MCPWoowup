/**
 * Vista previa navegable: monta las MISMAS páginas de src/app en el navegador,
 * con los datos demo. Se compila con `npm run build:preview` a un único HTML.
 */
import { createRoot } from "react-dom/client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "./shims/next-link";
import { NotFoundError } from "./shims/next-navigation";
import { getRoute, subscribe } from "./router";
import Portfolio from "@/app/page";
import GroupPage from "@/app/grupos/[slug]/page";
import AccountPage from "@/app/cuentas/[slug]/page";
import CampaignPage from "@/app/cuentas/[slug]/campanas/[id]/page";
import AdminPage from "@/app/admin/page";

type Sp = Promise<Record<string, string>>;

async function resolve(path: string, query: URLSearchParams): Promise<ReactNode> {
  const searchParams: Sp = Promise.resolve(Object.fromEntries(query.entries()));
  const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (seg.length === 0) return Portfolio({ searchParams });
  if (seg[0] === "admin") return AdminPage();
  if (seg[0] === "grupos" && seg[1]) return GroupPage({ params: Promise.resolve({ slug: seg[1] }), searchParams });
  if (seg[0] === "cuentas" && seg[1] && seg[2] === "campanas" && seg[3])
    return CampaignPage({ params: Promise.resolve({ slug: seg[1], id: encodeURIComponent(seg[3]) }), searchParams });
  if (seg[0] === "cuentas" && seg[1]) return AccountPage({ params: Promise.resolve({ slug: seg[1] }), searchParams });
  throw new NotFoundError();
}

function App() {
  const [route, setRoute] = useState(getRoute());
  const [view, setView] = useState<ReactNode>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => subscribe(() => setRoute(getRoute())), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    resolve(route.path, route.query)
      .then((el) => alive && setView(el))
      .catch((e) => {
        if (!alive) return;
        setView(
          <div className="card p-8 text-center">
            <p className="h-display text-lg">{e instanceof NotFoundError ? "No encontramos esa página" : "Algo falló al cargar la vista"}</p>
            <Link href="/" className="btn mt-4">Volver al portafolio</Link>
          </div>,
        );
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [route]);

  return (
    <>
      <header className="text-white" style={{ background: "linear-gradient(135deg,#1a2332 0%,#1e3a8a 70%,#2563eb 100%)" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="h-display text-lg">Patagonia Digital</span>
            <span className="text-xs font-semibold uppercase tracking-widest text-pd-cyan">Métricas WoowUp</span>
          </Link>
          <nav className="flex gap-5 text-sm font-semibold text-white/80">
            <Link href="/" className={`hover:text-white ${route.path === "/" ? "text-white" : ""}`}>Portafolio</Link>
            <Link href="/admin" className={`hover:text-white ${route.path === "/admin" ? "text-white" : ""}`}>Administración</Link>
          </nav>
          <div className="ml-auto">
            <span className="rounded-full bg-pd-orange px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-pd-navy">
              Vista previa · datos ficticios
            </span>
          </div>
        </div>
      </header>
      <main className={`mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 transition-opacity ${loading ? "opacity-60" : ""}`}>{view}</main>
      <footer className="mx-auto max-w-7xl px-4 sm:px-6 pb-8 text-xs text-pd-slate">
        patagoniadigital.tech · Vista previa con datos demo. En producción la fuente es el MCP de WoowUp (filter_by = activity).
        Las referencias de semáforo son orientativas de email retail, no benchmarks de cada cuenta.
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
