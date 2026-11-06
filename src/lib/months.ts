/** Utilidades de meses en formato YYYY-MM. */

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let m = from;
  while (m <= to && out.length < 120) {
    out.push(m);
    m = addMonths(m, 1);
  }
  return out;
}

/** Primer y último día del mes; si es el mes en curso, corta en hoy. */
export function monthBounds(month: string, today = new Date()): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  let to = `${month}-${String(last).padStart(2, "0")}`;
  const todayStr = today.toISOString().slice(0, 10);
  if (to > todayStr) to = todayStr;
  return { from, to };
}

const NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export function monthLabel(month: string, withYear = false): string {
  const [y, m] = month.split("-").map(Number);
  return withYear ? `${NAMES[m - 1]} ${String(y).slice(2)}` : NAMES[m - 1];
}

export function isMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/** Rango por defecto: enero del año en curso → mes actual. */
export function defaultRange(now = new Date()) {
  return { from: `${now.getFullYear()}-01`, to: currentMonth(now) };
}
