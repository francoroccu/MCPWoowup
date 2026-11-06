/**
 * Aplica las migraciones de ./drizzle en cada deploy (vercel-build).
 * Sin DATABASE_URL (modo demo) no hace nada.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

if (!process.env.DATABASE_URL) {
  console.log("[migrate] Sin DATABASE_URL: se omiten las migraciones (modo demo).");
} else {
  await migrate(drizzle(neon(process.env.DATABASE_URL)), { migrationsFolder: "./drizzle" });
  console.log("[migrate] Migraciones aplicadas.");
}
