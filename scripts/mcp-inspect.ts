/**
 * Diagnóstico del MCP de WoowUp. Correr ANTES del primer sync:
 *   npm run mcp:inspect                 → lista herramientas + esquemas
 *   npm run mcp:inspect -- depor        → además llama list_accounts, get_account
 *                                          y get_campaigns_stats del mes pasado para esa cuenta
 * Guarda todo en ./mcp-inspect-output/ para ajustar src/lib/woowup/mapping.ts.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { WoowUpSession } from "../src/lib/woowup/client";
import { TOOLS, parseAccount, parseAccountList, parseStats, statsArgs, switchArgs } from "../src/lib/woowup/mapping";
import { addMonths, currentMonth, monthBounds } from "../src/lib/months";

const out = "mcp-inspect-output";
mkdirSync(out, { recursive: true });
const save = (name: string, data: unknown) => writeFileSync(`${out}/${name}.json`, JSON.stringify(data, null, 2));

async function main() {
  const s = await WoowUpSession.open();
  const tools = await s.listTools();
  save("tools", tools);
  console.log("Herramientas disponibles:");
  for (const t of tools) console.log(`  • ${t.name} — params: ${Object.keys((t.inputSchema as { properties?: object })?.properties ?? {}).join(", ")}`);

  const accounts = await s.call(TOOLS.listAccounts);
  save("list_accounts", accounts);
  const parsed = parseAccountList(accounts);
  console.log(`\nlist_accounts → ${parsed.length} cuentas detectadas: ${parsed.map((a) => a.slug).join(", ")}`);

  const slug = process.argv[2];
  if (slug) {
    await s.call(TOOLS.switchAccount, switchArgs(slug));
    const acc = await s.call(TOOLS.getAccount);
    save(`get_account_${slug}`, acc);
    console.log("\nget_account interpretado:", parseAccount(slug, acc));
    const { from, to } = monthBounds(addMonths(currentMonth(), -1));
    const args = statsArgs({ from, to });
    console.log("\nget_campaigns_stats con:", args);
    const stats = await s.call(TOOLS.stats, args);
    save(`stats_${slug}`, stats);
    console.log("interpretado:", parseStats(stats));
  }
  console.log(`\nRespuestas crudas guardadas en ./${out}/`);
  await s.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
