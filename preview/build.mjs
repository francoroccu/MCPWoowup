/**
 * Compila la vista previa navegable a un único HTML autocontenido:
 *   npm run build:preview  →  preview/dist/metricas-woowup-demo.html
 */
import { build } from "esbuild";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const out = resolve(here, "dist");
mkdirSync(out, { recursive: true });

const stubs = resolve(here, "shims/stubs.ts");
const alias = {
  "next/link": resolve(here, "shims/next-link.tsx"),
  "next/navigation": resolve(here, "shims/next-navigation.ts"),
};

const result = await build({
  entryPoints: [resolve(here, "main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  write: false,
  jsx: "automatic",
  tsconfig: resolve(root, "tsconfig.json"),
  alias,
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  logLevel: "warning",
  logOverride: { "unsupported-directive": "silent" },
  plugins: [
    {
      name: "server-stubs",
      setup(b) {
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: stubs }));
        b.onResolve({ filter: /^@\/db\/client$/ }, () => ({ path: stubs }));
        b.onResolve({ filter: /^@\/lib\/woowup\/client$/ }, () => ({ path: stubs }));
        b.onResolve({ filter: /^\.\/actions$/ }, (a) => (a.importer.includes(`${"app"}/admin`) ? { path: stubs } : undefined));
        b.onResolve({ filter: /^drizzle-orm$/ }, () => ({ path: stubs }));
      },
    },
  ],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// CSS: Tailwind sobre el código de la app + la vista previa
const cssIn = resolve(out, "in.css");
writeFileSync(cssIn, readFileSync(resolve(root, "src/app/globals.css"), "utf8").replace(/^@import url\([^)]*\);\s*/m, ""));
execSync(`npx tailwindcss -c preview/tailwind.preview.config.ts -i ${cssIn} -o ${resolve(out, "out.css")} --minify`, { cwd: root, stdio: "inherit" });
const css = readFileSync(resolve(out, "out.css"), "utf8");

const html = `<title>Métricas WoowUp</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800&family=Open+Sans:wght@400;600&family=Source+Code+Pro:wght@400;600&display=swap">
<style>:root{color-scheme:light}html,body{background:#f7f8fa;color:#1a2332}${css}</style>
<div id="root"></div>
<script>${js}</script>
`;
const file = resolve(out, "metricas-woowup-demo.html");
writeFileSync(file, html);
console.log(`OK → ${file} (${(html.length / 1024).toFixed(0)} KB)`);
