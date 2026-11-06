import { snapshotInfo } from "@/lib/data";

/** Aviso del alcance de la carga cuando los datos vienen del snapshot del MCP. */
export function CampaignScopeNote({ count }: { count: number }) {
  const snap = snapshotInfo();
  if (!snap) return null;
  return (
    <p className="text-xs text-pd-slate">
      {count === 0 ? <strong className="text-pd-navy">El detalle de campañas de este mes todavía no se cargó. </strong> : null}
      Alcance de la carga actual: {snap.scope}.
    </p>
  );
}
