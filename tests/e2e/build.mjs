/** Compila y corre la prueba e2e reemplazando la base de datos por PGlite. */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const out = resolve(here, ".out/run.cjs");

await build({
  entryPoints: [resolve(here, "run.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: out,
  tsconfig: resolve(root, "tsconfig.json"),
  external: ["@electric-sql/pglite", "next/*", "next"],
  logLevel: "warning",
  logOverride: { "unsupported-directive": "silent" },
  plugins: [
    {
      name: "test-db",
      setup(b) {
        b.onResolve({ filter: /^@\/db\/client$/ }, () => ({ path: resolve(here, "test-db.ts") }));
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: resolve(here, "empty.ts") }));
        b.onResolve({ filter: /^next\/cache$/ }, () => ({ path: resolve(here, "next-cache.ts") }));
        b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: resolve(here, "next-headers.ts") }));
      },
    },
  ],
});
const r = spawnSync(process.execPath, [out], { stdio: "inherit", cwd: root });
process.exit(r.status ?? 1);
