"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, hasDatabase, schema } from "@/db/client";
import { mcpConfigured } from "@/lib/woowup/client";
import { runSync } from "@/lib/woowup/sync";
import { addMonths, currentMonth, isMonth, monthRange } from "@/lib/months";

const guard = () => {
  if (!hasDatabase()) throw new Error("Modo demo: conectá DATABASE_URL para editar.");
};

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function createGroup(form: FormData) {
  guard();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return;
  await db().insert(schema.accountGroups).values({ slug: slugify(name), name }).onConflictDoNothing();
  revalidatePath("/", "layout");
}

export async function deleteGroup(form: FormData) {
  guard();
  await db().delete(schema.accountGroups).where(eq(schema.accountGroups.slug, String(form.get("slug"))));
  revalidatePath("/", "layout");
}

export async function updateAccount(form: FormData) {
  guard();
  const slug = String(form.get("slug"));
  const groupSlug = String(form.get("groupSlug") ?? "") || null;
  const name = String(form.get("name") ?? "").trim();
  await db()
    .update(schema.accounts)
    .set({ groupSlug, hidden: form.get("hidden") === "on", ...(name ? { name } : {}) })
    .where(eq(schema.accounts.slug, slug));
  revalidatePath("/", "layout");
}

export async function syncNow(form: FormData) {
  guard();
  if (!mcpConfigured()) throw new Error("Falta configurar WOOWUP_MCP_URL / WOOWUP_MCP_TOKEN");
  const fromRaw = String(form.get("from") ?? "");
  const now = currentMonth();
  const from = isMonth(fromRaw) ? fromRaw : addMonths(now, -1);
  await runSync({ months: monthRange(from, now), trigger: "manual" });
  revalidatePath("/", "layout");
}
