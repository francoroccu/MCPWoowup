import { getAccounts, getGroups, getSyncRuns, isReadOnly } from "@/lib/data";
import { mcpConfigured } from "@/lib/woowup/client";
import { addMonths, currentMonth, monthLabel } from "@/lib/months";
import { createGroup, deleteGroup, syncNow, updateAccount } from "./actions";
import { BackfillButton } from "./BackfillButton";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Dot = ({ on }: { on: boolean }) => <span className={`inline-block h-2 w-2 rounded-full ${on ? "bg-pd-green" : "bg-pd-red"}`} />;

export default async function AdminPage() {
  const demo = isReadOnly();
  const [groups, accounts, runs] = await Promise.all([getGroups(), getAccounts({ includeHidden: true }), getSyncRuns()]);
  const mcp = mcpConfigured();
  const now = currentMonth();
  const disabled = demo;

  return (
    <div className="space-y-8">
      <div>
        <p className="label">Administración</p>
        <h1 className="h-display text-3xl mt-1">Cuentas, agrupación y sincronización</h1>
      </div>

      <section className="grid md:grid-cols-3 gap-3">
        <div className="card p-4 text-sm space-y-2">
          <div className="label">Estado</div>
          <div className="flex items-center gap-2"><Dot on={!demo} /> Base de datos {demo ? "no conectada (modo demo)" : "conectada"}</div>
          <div className="flex items-center gap-2"><Dot on={mcp} /> MCP de WoowUp {mcp ? "configurado" : "sin configurar"}</div>
          <div className="flex items-center gap-2"><Dot on={!!process.env.CRON_SECRET} /> Cron diario {process.env.CRON_SECRET ? "activo (09:00 UTC)" : "sin CRON_SECRET"}</div>
        </div>
        <form action={syncNow} className="card p-4 text-sm space-y-3 md:col-span-2">
          <div className="label">Sincronizar ahora</div>
          <p className="text-pd-slate">
            Trae de WoowUp los meses elegidos para todas las cuentas y actualiza la base. El cron diario ya re-sincroniza el mes en curso y el anterior.
            Desde la web se pueden traer hasta 3 meses; para el histórico completo hay que correr <code className="num">npm run backfill</code> desde una terminal (evita el límite de tiempo de Vercel).
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="label">Desde</span>
              <select name="from" className="field" defaultValue={addMonths(now, -1)}>
                {[0, 1, 2].map((d) => {
                  const m = addMonths(now, -d);
                  return <option key={m} value={m}>{monthLabel(m)} {m.slice(0, 4)}</option>;
                })}
              </select>
            </label>
            <button className="btn" disabled={disabled || !mcp}>Sincronizar</button>
          </div>
        </form>
      </section>

      <section className="card p-4 text-sm space-y-3">
        <div className="label">Carga de histórico</div>
        <p className="text-pd-slate">
          Trae todos los meses desde el elegido hasta hoy, de a un mes por vez (cada mes es una llamada corta, así no se corta por tiempo).
          Se usa una vez al poner en marcha la plataforma o si se agregan cuentas nuevas. Mantené la página abierta hasta que termine.
        </p>
        <BackfillButton disabled={disabled || !mcp} />
      </section>

      <section className="space-y-3">
        <h2 className="h-display text-lg">Cuentas madre</h2>
        <div className="card p-4 flex flex-wrap gap-2 items-center">
          {groups.map((g) => (
            <form key={g.slug} action={deleteGroup} className="flex items-center gap-1 rounded-full border border-pd-line bg-pd-light pl-3 pr-1 py-1 text-sm font-semibold">
              {g.name}
              <input type="hidden" name="slug" value={g.slug} />
              <button disabled={disabled} title="Eliminar (las marcas quedan sueltas)" className="h-6 w-6 rounded-full text-pd-slate hover:bg-pd-red/10 hover:text-pd-red disabled:opacity-40">×</button>
            </form>
          ))}
          <form action={createGroup} className="flex gap-2 ml-auto">
            <input name="name" placeholder="Nueva cuenta madre (ej: Comercial Depor)" className="field w-72" disabled={disabled} required />
            <button className="btn" disabled={disabled}>Crear</button>
          </form>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="h-display text-lg">Marcas (cuentas WoowUp)</h2>
        <p className="text-sm text-pd-slate">Las cuentas aparecen solas al sincronizar. Asigná cada una a su cuenta madre; las ocultas no se muestran en el portafolio.</p>
        <div className="card overflow-x-auto">
          <table className="tbl w-full">
            <thead>
              <tr>
                <th>Nombre visible</th><th>Slug WoowUp</th><th>País</th><th>Moneda</th><th>Rol</th><th>Canales</th><th>Cuenta madre</th><th>Oculta</th><th></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => {
                const fid = `acc-${a.slug}`;
                return (
                  <tr key={a.slug}>
                    <td><input form={fid} name="name" defaultValue={a.name} className="field py-1 w-48" disabled={disabled} /></td>
                    <td className="num text-xs text-pd-slate">{a.slug}</td>
                    <td>{a.country ?? "—"}</td>
                    <td>{a.currency ?? "—"}</td>
                    <td className={a.role === "CONSULT" || a.role === "OPERATOR" ? "text-amber-700 font-semibold" : ""}>{a.role ?? "—"}</td>
                    <td className="text-xs">{a.channels.join(", ")}</td>
                    <td>
                      <select form={fid} name="groupSlug" defaultValue={a.groupSlug ?? ""} className="field py-1" disabled={disabled}>
                        <option value="">— Sin cuenta madre —</option>
                        {groups.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
                      </select>
                    </td>
                    <td className="text-center"><input form={fid} type="checkbox" name="hidden" defaultChecked={a.hidden} disabled={disabled} /></td>
                    <td>
                      <form id={fid} action={updateAccount}>
                        <input type="hidden" name="slug" value={a.slug} />
                        <button className="btn-ghost py-1" disabled={disabled}>Guardar</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="h-display text-lg">Historial de sincronizaciones</h2>
        <div className="card overflow-x-auto">
          <table className="tbl w-full">
            <thead><tr><th>#</th><th>Origen</th><th>Inicio</th><th>Meses</th><th>Estado</th><th>OK</th><th>Errores</th></tr></thead>
            <tbody>
              {runs.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-pd-slate">{demo ? "Disponible al conectar la base de datos." : "Todavía no hubo sincronizaciones."}</td></tr>}
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="num">{r.id}</td>
                  <td>{r.trigger}</td>
                  <td className="num text-xs">{new Date(r.startedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba" })}</td>
                  <td className="text-xs">{r.months.join(", ")}</td>
                  <td className={r.status === "ok" ? "text-pd-green font-semibold" : r.status === "running" ? "text-pd-blue" : "text-pd-red font-semibold"}>{r.status}</td>
                  <td className="num">{r.accountsOk}</td>
                  <td className="text-xs max-w-md whitespace-normal">{r.errors.map((e) => `${e.account}: ${e.message}`).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
