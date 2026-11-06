/**
 * Prueba de punta a punta: MCP simulado → runSync → Postgres → consultas → insights.
 *   npm run test:e2e
 */
import { resolve } from "node:path";
import { migrate } from "./test-db";
import { startMockMcp } from "./mock-mcp";
import { runSync } from "../../src/lib/woowup/sync";
import {
  getAccounts, getActionStatuses, getCampaigns, getCampaignsRange, getMetrics, getMetricsAll, getSyncRuns, isDemo,
} from "../../src/lib/data";
import { setActionStatus } from "../../src/app/acciones/actions";
import { buildInsights } from "../../src/lib/insights";
import { addMonths, currentMonth } from "../../src/lib/months";
import { db, schema } from "./test-db";
import { createSessionValue } from "../../src/lib/auth";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function main() {
  await migrate(resolve(process.cwd(), "drizzle"));
  const mcp = await startMockMcp("test-token");
  Object.assign(process.env, { WOOWUP_MCP_URL: mcp.url, WOOWUP_MCP_TOKEN: "test-token", SYNC_CONCURRENCY: "2" });

  const M = addMonths(currentMonth(), -1);
  const months = [addMonths(M, -1), M];

  // 1) Sync completo
  const r1 = await runSync({ months, trigger: "cli" });
  check("sync sin errores", r1.failed.length === 0, JSON.stringify(r1.failed));
  check("dos cuentas sincronizadas", r1.ok.length === 2, r1.ok.join(","));

  // 2) Reglas del proyecto sobre las llamadas al MCP
  const statCalls = mcp.log.filter((c) => c.tool === "get_campaigns_stats" || c.tool === "list_campaigns");
  check("filter_by=activity en todas las llamadas de métricas", statCalls.every((c) => c.args.filter_by === "activity"), `${statCalls.length} llamadas`);
  check("ninguna llamada de datos sin cuenta seleccionada", statCalls.every((c) => c.account));
  const gaFirst = ["acc-a", "acc-b"].every((s) => {
    const i = mcp.log.findIndex((c) => c.account === s && c.tool === "get_account");
    const j = mcp.log.findIndex((c) => c.account === s && c.tool === "get_campaigns_stats");
    return i >= 0 && i < j;
  });
  check("get_account confirma la cuenta antes de pedir datos", gaFirst);

  // 3) Datos guardados
  const accounts = await getAccounts();
  const accA = accounts.find((a) => a.slug === "acc-a");
  check("moneda inferida del país (WoowUp informa USD)", accA?.currency === "CLP" && accounts.find((a) => a.slug === "acc-b")?.currency === "PEN");
  check("rol numérico interpretado", accA?.role === "OWNER" && accounts.find((a) => a.slug === "acc-b")?.role === "CONSULT");
  check("cuenta madre creada desde el nombre \"Marca [Grupo]\"", accA?.name === "Marca A" && accounts.every((a) => a.groupSlug === "grupo-prueba"));
  check("canales deducidos de las campañas", JSON.stringify([...(accA?.channels ?? [])].sort()) === '["email","whatsapp"]', JSON.stringify(accA?.channels));
  const allRows = await getMetricsAll({ accountSlugs: ["acc-a", "acc-b"], from: months[0], to: M });
  // Primer sync: canales aún desconocidos → total, one-shot y automatizaciones = 3 por cuenta y mes
  check("combinaciones por mes en el primer sync", allRows.length === 6 * months.length, `${allRows.length} filas`);
  const a = (await getMetrics({ accountSlugs: ["acc-a"], from: M, to: M }))[0];
  check("totales de acc-a leídos", !!a && a.sent > 0 && a.delivered === a.sent - a.bounces && a.revenue != null, a ? `sent ${a.sent}, revenue ${a.revenue}` : "");
  const b = (await getMetrics({ accountSlugs: ["acc-b"], from: M, to: M }))[0];
  check("rol CONSULT: revenue redactado y no estimado", !!b && b.revenue === null && b.revenueRedacted === true);
  const custom = (await getMetrics({ accountSlugs: ["acc-a"], from: M, to: M, groupType: "custom" }))[0];
  check("one-shot separado de automatizaciones", !!custom && custom.sent < a.sent);

  // 4) Campañas y paginación
  const campsA = (await getCampaigns({ accountSlugs: ["acc-a"], month: M }));
  check("paginación de list_campaigns (130 campañas en 2 páginas)", campsA.length === 130, `${campsA.length}`);
  check("automatizaciones identificadas", campsA.filter((c) => c.groupType === "triggered").length === 6);
  check("fecha de envío normalizada", campsA.some((c) => c.sentAt && /^\d{4}-\d{2}-\d{2}$/.test(c.sentAt)));
  const campsB = await getCampaigns({ accountSlugs: ["acc-b"], month: M });
  check("campañas de cuenta CONSULT sin revenue", campsB.every((c) => c.revenue === null && c.revenueRedacted));

  // 5) Idempotencia: re-sincronizar no duplica
  const r2 = await runSync({ months: [M], trigger: "cron" });
  const allRows2 = await getMetricsAll({ accountSlugs: ["acc-a", "acc-b"], from: months[0], to: M });
  const camps2 = await getCampaignsRange({ accountSlugs: ["acc-a"], from: M, to: M });
  const keys = allRows2.map((r) => `${r.accountSlug}|${r.month}|${r.channel}|${r.groupType}`);
  check("re-sync sin duplicados", r2.failed.length === 0 && new Set(keys).size === keys.length && camps2.length === 130);
  // Segundo sync: ya conoce los canales → cada cuenta (total + email + whatsapp) × 3 tipos = 9
  check("desglose por canal desde el segundo sync", allRows2.filter((r) => r.month === M).length === 18, `${allRows2.filter((r) => r.month === M).length} filas en ${M}`);
  const runs = await getSyncRuns();
  check("historial de sincronizaciones", runs.length === 2 && runs.every((x) => x.status === "ok"), runs.map((x) => `${x.trigger}:${x.status}`).join(", "));

  // 6) Seguridad: las server actions exigen sesión aunque se invoquen fuera del middleware
  process.env.APP_PASSWORD = "clave-equipo";
  process.env.AUTH_SECRET = "secreto-de-prueba";
  process.env.TEST_SESSION = "";
  let blocked = false;
  try {
    await setActionStatus("g:grupo", "g-test", "Mejora de prueba", "hecho");
  } catch {
    blocked = true;
  }
  check("server action sin sesión: rechazada", blocked);
  process.env.TEST_SESSION = "9999999999.firma-falsa";
  blocked = false;
  try {
    await setActionStatus("g:grupo", "g-test", "Mejora de prueba", "hecho");
  } catch {
    blocked = true;
  }
  check("server action con cookie falsificada: rechazada", blocked);
  process.env.TEST_SESSION = (await createSessionValue()).value;

  // 7) Agrupación y plan de mejoras
  await db().insert(schema.accountGroups).values({ slug: "grupo", name: "Grupo prueba" });
  await db().update(schema.accounts).set({ groupSlug: "grupo" });
  await runSync({ months: [M], trigger: "cron" });
  check("re-sync no pisa la cuenta madre asignada a mano", (await getAccounts()).every((x) => x.groupSlug === "grupo"));
  await setActionStatus("g:grupo", "g-test", "Mejora de prueba", "en_curso");
  await setActionStatus("g:grupo", "g-test", "Mejora de prueba", "hecho");
  check("estado de mejora guardado y actualizado", (await getActionStatuses("g:grupo"))["g-test"] === "hecho");

  // 7) Insights sobre datos sincronizados
  const ins = buildInsights({
    scope: "group", month: M, accounts: await getAccounts(), rows: allRows2,
    campaigns: await getCampaignsRange({ accountSlugs: ["acc-a", "acc-b"], from: addMonths(M, -3), to: M }),
    partial: false, qs: "",
  });
  check("insights generados sobre datos reales del sync", ins.length > 0, ins.map((i) => i.title).slice(0, 3).join(" | "));
  check("insight de permisos para la cuenta CONSULT", ins.some((i) => i.id.endsWith("permisos")));
  check("no está en modo demo", !isDemo());

  // 8) Errores de autenticación
  process.env.WOOWUP_MCP_TOKEN = "token-incorrecto";
  const r3 = await runSync({ months: [M], trigger: "manual" });
  check("token inválido: el sync falla y queda registrado", r3.ok.length === 0 && r3.failed.length > 0, r3.failed[0]?.message.slice(0, 80));

  await mcp.close();
  console.log(failures ? `\n${failures} verificación(es) fallaron` : "\nTodas las verificaciones pasaron");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
