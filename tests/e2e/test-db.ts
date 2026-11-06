/** Reemplazo de @/db/client para pruebas: Postgres en memoria (PGlite) con las migraciones reales. */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "../../src/db/schema";

const client = new PGlite();
const instance = drizzle(client, { schema });

export async function migrate(dir: string) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(resolve(dir, f), "utf8").replaceAll("--> statement-breakpoint", ""));
  }
}

export const hasDatabase = () => true;
export const db = () => instance as unknown as ReturnType<typeof import("drizzle-orm/neon-http").drizzle<typeof schema>>;
export { schema };
