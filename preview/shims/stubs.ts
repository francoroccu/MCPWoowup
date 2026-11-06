/** Reemplazos de módulos de servidor para la vista previa (siempre modo demo). */

// @/db/client
export const hasDatabase = () => false;
export const db = (): never => {
  throw new Error("Sin base de datos en la vista previa");
};
export const schema = {} as never;

// @/lib/woowup/client
export const mcpConfigured = () => false;

// app/admin/actions (los formularios están deshabilitados en demo)
const noop = async (_: FormData) => {};
export const createGroup = noop;
export const deleteGroup = noop;
export const updateAccount = noop;
export const syncNow = noop;

// drizzle-orm (solo se usa fuera del modo demo)
const op = (..._args: unknown[]) => undefined;
export const and = op, asc = op, desc = op, eq = op, gte = op, inArray = op, lte = op, sql = op;
