"use server";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, hasDatabase, schema } from "@/db/client";

const VALID = ["pendiente", "en_curso", "hecho", "descartado"];

/** Guarda el estado de una mejora sugerida. */
export async function setActionStatus(scopeKey: string, insightId: string, title: string, status: string) {
  if (!hasDatabase() || !VALID.includes(status)) return;
  await db()
    .insert(schema.actionItems)
    .values({ scopeKey, insightId, title, status, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.actionItems.scopeKey, schema.actionItems.insightId],
      set: { status: sql`excluded.status`, title: sql`excluded.title`, updatedAt: sql`excluded.updated_at` },
    });
  revalidatePath("/", "layout");
}
