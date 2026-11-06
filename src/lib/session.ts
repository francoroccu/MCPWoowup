import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, authMode, verifySessionValue } from "./auth";

/**
 * Verificación de sesión DENTRO de cada server action. El middleware no alcanza:
 * una action puede invocarse contra cualquier ruta, incluida /login, que está excluida.
 */
export async function requireSession() {
  const mode = authMode();
  if (mode === "open-demo") return; // sin base de datos no hay nada que proteger
  const ok = mode === "password" && (await verifySessionValue((await cookies()).get(SESSION_COOKIE)?.value));
  if (!ok) throw new Error("No autorizado");
}
