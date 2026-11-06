import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { dataMode, snapshotInfo } from "@/lib/data";
import { authMode } from "@/lib/auth";
import { logout } from "./login/actions";

export const metadata: Metadata = {
  title: "Métricas WoowUp · Patagonia Digital",
  description: "Métricas mensuales de WoowUp por cuenta madre y marca",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = dataMode();
  const snap = snapshotInfo();
  const withAuth = authMode() === "password";
  return (
    <html lang="es">
      <body>
        <header className="text-white" style={{ background: "linear-gradient(135deg,#1a2332 0%,#1e3a8a 70%,#2563eb 100%)" }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="h-display text-lg">Patagonia Digital</span>
              <span className="text-xs font-semibold uppercase tracking-widest text-pd-cyan">Métricas WoowUp</span>
            </Link>
            <nav className="flex gap-5 text-sm font-semibold text-white/80">
              <Link href="/" className="hover:text-white">Portafolio</Link>
              <Link href="/admin" className="hover:text-white">Administración</Link>
            </nav>
            <div className="ml-auto flex items-center gap-3">
              {mode === "demo" && (
                <span className="rounded-full bg-pd-orange px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-pd-navy">
                  Modo demo · datos ficticios
                </span>
              )}
              {mode === "snapshot" && snap && (
                <span
                  title={snap.scope ?? undefined}
                  className="rounded-full bg-pd-green px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-pd-navy"
                >
                  Datos reales WoowUp · carga del{" "}
                  {snap.generatedAt ? new Date(snap.generatedAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Cordoba" }) : "—"}
                </span>
              )}
              {withAuth && (
                <form action={logout}>
                  <button className="text-sm text-white/70 hover:text-white">Salir</button>
                </form>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 sm:px-6 pb-8 text-xs text-pd-slate">
          patagoniadigital.tech · Fuente: MCP de WoowUp (filter_by = activity). Las referencias de semáforo son orientativas de email retail, no benchmarks de cada cuenta.
        </footer>
      </body>
    </html>
  );
}
