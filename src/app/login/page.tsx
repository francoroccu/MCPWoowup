import { authMode } from "@/lib/auth";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const mode = authMode();
  return (
    <main className="min-h-screen grid place-items-center px-4" style={{ background: "linear-gradient(135deg,#1a2332 0%,#2563eb 100%)" }}>
      <div className="w-full max-w-sm card p-8">
        <p className="label">Patagonia Digital</p>
        <h1 className="h-display text-2xl mt-1">Métricas WoowUp</h1>
        <p className="text-sm text-pd-slate mt-2">Acceso exclusivo del equipo.</p>
        {mode === "misconfigured" ? (
          <p className="mt-6 rounded-md bg-pd-orange/10 p-3 text-sm text-pd-navy">
            Falta configurar <code className="num">APP_PASSWORD</code> en las variables de entorno.
            Con datos reales conectados la plataforma no se abre sin contraseña.
          </p>
        ) : (
          <form action={login} className="mt-6 space-y-3">
            <input type="hidden" name="next" value={sp.next ?? "/"} />
            <input name="password" type="password" required autoFocus placeholder="Contraseña del equipo" className="field w-full" />
            {sp.error && <p className="text-sm text-pd-red">Contraseña incorrecta.</p>}
            <button className="btn w-full justify-center">Ingresar</button>
          </form>
        )}
      </div>
    </main>
  );
}
