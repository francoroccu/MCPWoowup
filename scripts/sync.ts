/**
 * Sincronización por línea de comandos (ideal para el backfill inicial).
 *   npm run backfill                       → enero 2026 → mes actual, todas las cuentas
 *   npm run sync -- --from 2026-09         → desde septiembre
 *   npm run sync -- --account depor        → solo una cuenta (repetible)
 */
import "dotenv/config";
import { runSync } from "../src/lib/woowup/sync";
import { addMonths, currentMonth, isMonth, monthRange } from "../src/lib/months";

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const accounts = args.flatMap((a, i) => (a === "--account" ? [args[i + 1]] : []));
const to = get("--to") ?? currentMonth();
const from = get("--from") ?? addMonths(currentMonth(), -1);
if (!isMonth(from) || !isMonth(to)) {
  console.error("Formato de mes inválido. Usar YYYY-MM.");
  process.exit(1);
}

runSync({ months: monthRange(from, to), trigger: "cli", accounts, log: console.log })
  .then((r) => {
    console.log(`\nListo. OK: ${r.ok.length} · Con error: ${r.failed.length} (run #${r.runId})`);
    for (const f of r.failed) console.log(`  - ${f.account}: ${f.message}`);
    process.exit(r.failed.length && !r.ok.length ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
