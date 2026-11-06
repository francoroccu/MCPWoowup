import { NextResponse } from "next/server";
import { hasDatabase } from "@/db/client";
import { mcpConfigured } from "@/lib/woowup/client";
import { runSync } from "@/lib/woowup/sync";
import { addMonths, currentMonth } from "@/lib/months";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron diario (vercel.json). Re-sincroniza el mes en curso y el anterior
 * (la atribución de revenue sigue moviéndose días después del envío).
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasDatabase() || !mcpConfigured()) {
    return NextResponse.json({ skipped: true, reason: "Falta DATABASE_URL o configuración del MCP" });
  }
  const now = currentMonth();
  const result = await runSync({ months: [addMonths(now, -1), now], trigger: "cron" });
  return NextResponse.json(result);
}
