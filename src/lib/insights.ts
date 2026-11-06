/**
 * Motor de insights: reglas deterministas sobre los datos sincronizados.
 * Cada insight separa DATO (lo que devolvió WoowUp), CÁLCULO (fórmula aplicada),
 * HIPÓTESIS (interpretación, nunca presentada como hecho) y ACCIÓN sugerida.
 * Las referencias de email retail son orientativas, no benchmarks de la cuenta.
 */
import { addMonths } from "./months";
import { fmtInt, fmtMoney, fmtPct, kpis, sumCounts, type Counts, type Kpis, type MetricRow } from "./metrics";
import type { Account, CampaignRow } from "./types";

export type Severity = "critical" | "warning" | "opportunity" | "positive" | "info";
export type Area = "Entregabilidad" | "Engagement" | "Revenue" | "Automatizaciones" | "Frecuencia" | "Canales" | "Campañas" | "Marcas" | "Datos";
export type Level = "Alto" | "Medio" | "Bajo";

export interface Insight {
  id: string; // estable por regla + sujeto → permite seguir el estado de la mejora
  severity: Severity;
  area: Area;
  title: string;
  dato: string;
  calculo?: string;
  hipotesis?: string;
  accion?: string;
  impacto?: Level;
  esfuerzo?: Level;
  brand?: string; // en vistas de cuenta madre
  link?: { label: string; href: string };
}

export interface InsightInput {
  scope: "account" | "group";
  month: string;
  accounts: Account[];
  rows: MetricRow[]; // todos los canales × tipos, meses M-12..M
  campaigns: CampaignRow[]; // meses M-3..M
  partial: boolean;
  qs: string; // query de filtros para los links
  campaignsComplete?: boolean; // false si solo se cargó una parte de las campañas del mes
}

const SEV_ORDER: Record<Severity, number> = { critical: 0, warning: 1, opportunity: 2, positive: 3, info: 4 };
const LVL: Record<Level, number> = { Alto: 0, Medio: 1, Bajo: 2 };

const CORE_FLOWS: { type: string; name: string; impacto: Level }[] = [
  { type: "abandoned_cart", name: "Carrito abandonado", impacto: "Alto" },
  { type: "welcome", name: "Bienvenida", impacto: "Alto" },
  { type: "browse_abandonment", name: "Producto visitado", impacto: "Medio" },
  { type: "post_purchase", name: "Post-compra / cross-sell", impacto: "Medio" },
  { type: "winback", name: "Reactivación de inactivos", impacto: "Medio" },
  { type: "birthday", name: "Cumpleaños", impacto: "Bajo" },
];
const CH: Record<string, string> = { email: "email", sms: "SMS", whatsapp: "WhatsApp", push: "push", all: "todos los canales" };

type Snap = Counts & { k: Kpis };

export function buildInsights(inp: InsightInput): Insight[] {
  const out: Insight[] = [];
  const M = inp.month;
  const P = addMonths(M, -1);
  const Y = addMonths(M, -12);
  const slugsAll = inp.accounts.map((a) => a.slug);
  const prefix = inp.scope === "group" ? "g" : "a";

  const snap = (month: string, channel = "all", groupType = "all", slugs = slugsAll): Snap => {
    const c = sumCounts(inp.rows.filter((r) => r.month === month && r.channel === channel && r.groupType === groupType && slugs.includes(r.accountSlug)));
    return { ...c, k: kpis(c) };
  };
  const has = (month: string, slugs = slugsAll) =>
    slugs.every((s) => inp.rows.some((r) => r.accountSlug === s && r.month === month && r.channel === "all" && r.groupType === "all" && r.sent > 0));

  const cur = snap(M);
  if (cur.sent === 0) {
    out.push({
      id: `${prefix}-sin-datos`, severity: "info", area: "Datos", title: "Sin actividad registrada en el mes",
      dato: "No hay envíos sincronizados para este mes.",
      accion: "Verificar que la sincronización del mes corrió sin errores en Administración.",
    });
    return out;
  }
  const prev = snap(P);
  const yoy = snap(Y);
  const currencies = new Set(inp.accounts.map((a) => a.currency));
  const money = currencies.size === 1 ? inp.accounts[0]?.currency ?? null : null;
  const revenueOk = money !== null && cur.revenue != null;
  const restricted = inp.accounts.filter((a) => a.role === "CONSULT" || a.role === "OPERATOR");
  const canCompare = !inp.partial && has(P);
  const canYoy = !inp.partial && has(Y);
  const pct = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : (a - b) / b);
  const sign = (n: number) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(1).replace(".", ",")}%`;
  const pp = (n: number) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(2).replace(".", ",")} pp`;

  // ── Datos y permisos ──────────────────────────────────────────────
  if (restricted.length) {
    out.push({
      id: `${prefix}-permisos`, severity: "info", area: "Datos",
      title: "Revenue no disponible por permisos",
      dato: `Rol ${restricted.map((a) => `${a.role} en ${a.name}`).join(", ")}: WoowUp redacta revenue y datos personales.`,
      hipotesis: "Las conclusiones de esa cuenta se apoyan solo en engagement; no se estima revenue.",
      accion: "Solicitar a WoowUp un usuario con rol ADMIN o MANAGER para la cuenta, si el análisis de revenue es necesario.",
      impacto: "Medio", esfuerzo: "Bajo",
    });
  }
  if (inp.partial) {
    out.push({
      id: `${prefix}-parcial`, severity: "info", area: "Datos", title: "Mes en curso: datos parciales",
      dato: "Los volúmenes y el revenue del mes todavía se están acumulando; las comparaciones de volumen se omiten.",
    });
  }

  // ── Entregabilidad (email) ────────────────────────────────────────
  // Sin desglose por canal (primera carga) se evalúa el total: en las cuentas relevadas los envíos son de email
  const noChannelData = !inp.rows.some((r) => r.month === M && r.channel !== "all");
  const em = noChannelData ? snap(M) : snap(M, "email");
  const worstBrand = (k: "bounceRate" | "spamRate") => {
    const ranked = inp.accounts
      .map((a) => ({ a, s: noChannelData ? snap(M, "all", "all", [a.slug]) : snap(M, "email", "all", [a.slug]) }))
      .filter((x) => x.s.sent >= 1000)
      .sort((x, y) => (y.s.k[k] ?? 0) - (x.s.k[k] ?? 0));
    return ranked[0] ? `principalmente ${ranked[0].a.name} (${fmtPct(ranked[0].s.k[k], 2)})` : undefined;
  };
  if (em.sent > 0) {
    const emP = noChannelData ? snap(P) : snap(P, "email");
    const br = em.k.bounceRate ?? 0;
    const sr = em.k.spamRate ?? 0;
    if (br >= 0.02 || (em.k.deliveryRate ?? 1) < 0.97) {
      out.push({
        id: `${prefix}-rebote-email`, severity: br >= 0.03 ? "critical" : "warning", area: "Entregabilidad",
        brand: inp.scope === "group" ? worstBrand("bounceRate") : undefined,
        title: `Rebote de email en ${fmtPct(br, 2)}`,
        dato: `${fmtInt(em.bounces)} rebotes sobre ${fmtInt(em.sent)} envíos de email (mes anterior: ${fmtPct(emP.k.bounceRate, 2)}).`,
        calculo: "Rebote = rebotes / envíos · referencia orientativa email retail < 2%.",
        hipotesis: "Puede deberse a contactos viejos o importados sin validar, o a un envío a una base fría. Si sigue subiendo, afecta la reputación del dominio y la entrega de todas las campañas.",
        accion: "Excluir hard bounces y contactos sin aperturas en 180 días de los envíos masivos; validar la última base importada antes del próximo envío.",
        impacto: "Alto", esfuerzo: "Bajo",
      });
    }
    if (sr >= 0.001) {
      out.push({
        id: `${prefix}-spam-email`, severity: sr >= 0.003 ? "critical" : "warning", area: "Entregabilidad",
        brand: inp.scope === "group" ? worstBrand("spamRate") : undefined,
        title: `Quejas de spam en ${fmtPct(sr, 2)}`,
        dato: `${fmtInt(em.spam)} reportes de spam sobre ${fmtInt(em.delivered)} emails entregados.`,
        calculo: "Spam = reportes / entregados · referencia orientativa < 0,1% (Gmail y Yahoo exigen < 0,3%).",
        hipotesis: "Suele asociarse a envíos a segmentos que no esperan el mensaje o a frecuencia alta.",
        accion: "Revisar el origen de los segmentos del último mes, hacer visible el link de baja y bajar la frecuencia a inactivos.",
        impacto: "Alto", esfuerzo: "Medio",
      });
    }
  }

  // En cuentas madre, una marca con problemas de entregabilidad queda diluida en el total: se evalúa por marca
  if (inp.scope === "group" && inp.accounts.length > 1) {
    for (const a of inp.accounts) {
      const s = noChannelData ? snap(M, "all", "all", [a.slug]) : snap(M, "email", "all", [a.slug]);
      if (s.sent < 10000) continue;
      const b = s.k.bounceRate ?? 0;
      const sp = s.k.spamRate ?? 0;
      if (b < 0.02 && sp < 0.001) continue;
      out.push({
        id: `g-entregabilidad-${a.slug}`, severity: b >= 0.03 || sp >= 0.003 ? "critical" : "warning", area: "Entregabilidad", brand: a.name,
        title: `${a.name}: ${b >= 0.02 ? `rebote ${fmtPct(b, 2)}` : ""}${b >= 0.02 && sp >= 0.001 ? " y " : ""}${sp >= 0.001 ? `quejas de spam ${fmtPct(sp, 2)}` : ""}`,
        dato: `${fmtInt(s.bounces)} rebotes y ${fmtInt(s.spam)} reportes de spam sobre ${fmtInt(s.sent)} envíos de email.`,
        calculo: "Rebote = rebotes / envíos (ref. < 2%) · Spam = reportes / entregados (ref. < 0,1%; Gmail y Yahoo exigen < 0,3%).",
        hipotesis: "Suele venir de un envío a una base fría o importada sin validar. Si comparten dominio de envío, afecta la entrega de las otras marcas.",
        accion: `Identificar en ${a.name} la campaña que concentra los rebotes y quejas, excluir inactivos y hard bounces, y validar la base antes del próximo envío masivo.`,
        impacto: "Alto", esfuerzo: "Bajo",
        link: { label: `Ver ${a.name}`, href: `/cuentas/${a.slug}?${inp.qs}` },
      });
    }
  }

  // ── Revenue ───────────────────────────────────────────────────────
  if (revenueOk && canCompare && prev.revenue) {
    const d = pct(cur.revenue, prev.revenue)!;
    const dSent = pct(cur.sent, prev.sent) ?? 0;
    if (d <= -0.15) {
      out.push({
        id: `${prefix}-revenue-mom`, severity: d <= -0.3 ? "critical" : "warning", area: "Revenue",
        title: `Revenue CRM ${sign(d)} vs mes anterior`,
        dato: `${fmtMoney(cur.revenue, money)} vs ${fmtMoney(prev.revenue, money)}; envíos ${sign(dSent)}; CTR ${fmtPct(cur.k.ctr, 2)} vs ${fmtPct(prev.k.ctr, 2)}.`,
        calculo: "Variación = (revenue mes − revenue mes anterior) / revenue mes anterior.",
        hipotesis: dSent < -0.1
          ? "La caída acompaña a menos envíos: probablemente menos campañas o automatizaciones que dispararon menos."
          : "Con volumen similar, la caída apunta a conversión: oferta, segmentación o estacionalidad del mes anterior.",
        accion: "Revisar en la tabla de campañas qué campañas del mes anterior no se repitieron y el estado de las automatizaciones principales.",
        impacto: "Alto", esfuerzo: "Medio",
      });
    } else if (d >= 0.15) {
      out.push({
        id: `${prefix}-revenue-mom-up`, severity: "positive", area: "Revenue",
        title: `Revenue CRM ${sign(d)} vs mes anterior`,
        dato: `${fmtMoney(cur.revenue, money)} vs ${fmtMoney(prev.revenue, money)} con envíos ${sign(dSent)}.`,
        hipotesis: "Identificar qué campañas explican el crecimiento ayuda a repetirlo; el top 5 del mes es el punto de partida.",
      });
    }
  }
  if (revenueOk && canYoy && yoy.revenue) {
    const d = pct(cur.revenue, yoy.revenue)!;
    if (Math.abs(d) >= 0.1) {
      out.push({
        id: `${prefix}-revenue-yoy`, severity: d < 0 ? "warning" : "positive", area: "Revenue",
        title: `Revenue CRM ${sign(d)} vs el mismo mes del año pasado`,
        dato: `${fmtMoney(cur.revenue, money)} vs ${fmtMoney(yoy.revenue, money)}; RPE ${fmtMoney(cur.k.rpe, money)} vs ${fmtMoney(yoy.k.rpe, money)}.`,
        calculo: "Comparación interanual: neutraliza la estacionalidad del mes.",
        ...(d < 0
          ? {
              hipotesis: "Al aislar la estacionalidad, la caída indica que el CRM aporta menos que hace un año.",
              accion: "Comparar el calendario de campañas y las automatizaciones activas contra el mismo mes del año pasado.",
              impacto: "Alto" as Level, esfuerzo: "Medio" as Level,
            }
          : {}),
      });
    }
  }

  // ── Frecuencia / fatiga ───────────────────────────────────────────
  const os = snap(M, "all", "custom");
  const osP = snap(P, "all", "custom");
  const os3 = snap(addMonths(M, -3), "all", "custom");
  if (canCompare && os.sent > 0 && osP.sent > 0 && os3.sent > 0) {
    const volUp = pct(os.sent, os3.sent)!;
    const unsubUp = (os.k.unsubRate ?? 0) - (os3.k.unsubRate ?? 0);
    const rpeDown = revenueOk ? pct(os.k.rpe, os3.k.rpe) : pct(os.k.ctr, os3.k.ctr);
    if (volUp >= 0.25 && (unsubUp > 0.0005 || (rpeDown ?? 0) <= -0.15)) {
      out.push({
        id: `${prefix}-fatiga`, severity: "warning", area: "Frecuencia",
        title: "Señales de fatiga por presión de envíos one-shot",
        dato: `Envíos one-shot ${sign(volUp)} en 3 meses; desuscripción ${fmtPct(os3.k.unsubRate, 2)} → ${fmtPct(os.k.unsubRate, 2)}; ${revenueOk ? `RPE ${sign(rpeDown ?? 0)}` : `CTR ${sign(rpeDown ?? 0)}`}.`,
        calculo: `Comparación del mes contra ${monthName(addMonths(M, -3))} (3 meses antes), solo campañas one-shot.`,
        hipotesis: "Más envíos no se traducen en más ventas y crece la baja: la base está recibiendo más mensajes de los que valora.",
        accion: "Definir un tope de contactos por semana por cliente, priorizar segmentos con compra o clic reciente y pausar envíos masivos a inactivos de más de 120 días.",
        impacto: "Alto", esfuerzo: "Medio",
      });
    }
  }
  if (!inp.partial && os.campaigns > 0) {
    const perWeek = os.campaigns / inp.accounts.length / 4.345;
    if (perWeek < 1) {
      out.push({
        id: `${prefix}-frecuencia-baja`, severity: "opportunity", area: "Frecuencia",
        title: `Baja frecuencia one-shot (${perWeek.toFixed(1).replace(".", ",")} por semana por marca)`,
        dato: `${fmtInt(os.campaigns)} campañas one-shot en el mes.`,
        hipotesis: "Hay espacio para un calendario de comunicaciones más regular sin llegar a la saturación.",
        accion: "Armar un calendario mensual con al menos una comunicación semanal segmentada por interés o categoría.",
        impacto: "Medio", esfuerzo: "Medio",
      });
    }
  }

  // ── Automatizaciones ──────────────────────────────────────────────
  const auto = snap(M, "all", "triggered");
  const all = snap(M);
  if (revenueOk && all.revenue && auto.revenue != null) {
    const share = auto.revenue / all.revenue;
    if (share < 0.3) {
      out.push({
        id: `${prefix}-auto-share`, severity: "opportunity", area: "Automatizaciones",
        title: `Las automatizaciones generan solo el ${fmtPct(share)} del revenue CRM`,
        dato: `${fmtMoney(auto.revenue, money)} de ${fmtMoney(all.revenue, money)}.`,
        calculo: "Participación = revenue de campañas triggered / revenue total CRM.",
        hipotesis: "El CRM depende del calendario one-shot; los flujos automáticos suelen tener mejor RPE y escalan sin esfuerzo operativo.",
        accion: "Priorizar los flujos de ciclo de vida faltantes y revisar el timing de los existentes.",
        impacto: "Alto", esfuerzo: "Medio",
      });
    } else if (share >= 0.6) {
      out.push({
        id: `${prefix}-auto-share-alto`, severity: "positive", area: "Automatizaciones",
        title: `Las automatizaciones explican el ${fmtPct(share)} del revenue CRM`,
        dato: `${fmtMoney(auto.revenue, money)} de ${fmtMoney(all.revenue, money)}, con RPE ${fmtMoney(auto.k.rpe, money)} vs ${fmtMoney(os.k.rpe, money)} de one-shot.`,
        hipotesis: "Buena base de ciclo de vida. El riesgo es la dependencia: si un flujo deja de disparar, el impacto es inmediato.",
      });
    }
  }

  const campM = inp.campaigns.filter((c) => c.month === M);
  if (campM.length) {
    for (const a of inp.accounts) {
      const autos = campM.filter((c) => c.accountSlug === a.slug && c.groupType === "triggered");
      const types = new Set(autos.map((c) => c.campaignType));
      const missing = CORE_FLOWS.filter((f) => !types.has(f.type));
      if (missing.length && inp.campaignsComplete !== false) {
        const top = missing.filter((f) => f.impacto !== "Bajo");
        if (top.length) {
          out.push({
            id: `${prefix}-flujos-${a.slug}`, severity: top.some((f) => f.impacto === "Alto") ? "warning" : "opportunity",
            area: "Automatizaciones", brand: inp.scope === "group" ? a.name : undefined,
            title: `Faltan flujos de ciclo de vida: ${top.map((f) => f.name).join(", ")}`,
            dato: `${autos.length} automatizaciones con actividad en el mes${a.channels.length ? ` (canales: ${a.channels.join(", ")})` : ""}; no aparece ninguna de tipo ${top.map((f) => f.type).join(", ")}.`,
            hipotesis: "Puede que el flujo exista pero no haya disparado en el mes; si no existe, es revenue que se deja en la mesa.",
            accion: `Confirmar en WoowUp si ${top.length === 1 ? "el flujo existe" : "los flujos existen"} y, si no, implementar ${top.map((f) => f.name.toLowerCase()).join(", ")}${a.channels.includes("whatsapp") ? " (con un paso de WhatsApp para carrito)" : ""}.`,
            impacto: top[0].impacto, esfuerzo: "Medio",
          });
        }
      }

      // Flujos que dejaron de disparar vs su propia historia (promedio de los 3 meses previos)
      const weakFlows: { c: CampaignRow; ctr: number; avg: number }[] = [];
      for (const c of autos) {
        const hist = inp.campaigns.filter((h) => h.accountSlug === a.slug && h.campaignId === c.campaignId && h.month < M && h.month >= addMonths(M, -3));
        if (hist.length < 2 || inp.partial) continue;
        const avgSent = hist.reduce((t, h) => t + h.sent, 0) / hist.length;
        const avgCtr = hist.reduce((t, h) => t + (kpis(h).ctr ?? 0), 0) / hist.length;
        const dSent = avgSent ? (c.sent - avgSent) / avgSent : 0;
        const ck = kpis(c);
        if (avgSent >= 1000 && dSent <= -0.6) {
          out.push({
            id: `${prefix}-flujo-caido-${c.campaignId}`, severity: "critical", area: "Automatizaciones",
            brand: inp.scope === "group" ? a.name : undefined,
            title: `"${c.name}" disparó ${sign(dSent)} vs su promedio`,
            dato: `${fmtInt(c.sent)} envíos en ${monthName(M)} vs ${fmtInt(Math.round(avgSent))} de promedio en los 3 meses previos.`,
            calculo: "Variación = envíos del mes / promedio de envíos de los 3 meses anteriores − 1.",
            hipotesis: "Una caída así en un flujo automático suele indicar un problema técnico (trigger, integración con el e-commerce, segmento de entrada) más que un cambio de demanda.",
            accion: "Revisar en WoowUp el estado del flujo, el evento que lo dispara y la integración con la tienda; validar con una compra o carrito de prueba.",
            impacto: "Alto", esfuerzo: "Bajo",
            link: { label: "Ver la automatización", href: `/cuentas/${a.slug}/campanas/${encodeURIComponent(c.campaignId)}?${inp.qs}` },
          });
        } else if (avgCtr > 0 && ck.ctr != null && (ck.ctr - avgCtr) / avgCtr <= -0.4 && avgCtr - ck.ctr >= 0.01 && c.sent >= 3000) {
          weakFlows.push({ c, ctr: ck.ctr, avg: avgCtr });
        }
      }
      if (weakFlows.length) {
        const w = weakFlows.sort((x, y) => (x.ctr - x.avg) / x.avg - (y.ctr - y.avg) / y.avg);
        out.push({
          id: `${prefix}-flujos-ctr-${a.slug}`, severity: "warning", area: "Automatizaciones",
          brand: inp.scope === "group" ? a.name : undefined,
          title: w.length === 1 ? `"${w[0].c.name}" perdió clics` : `${w.length} automatizaciones perdieron clics`,
          dato: w.map((x) => `${x.c.name}: CTR ${fmtPct(x.ctr, 2)} vs ${fmtPct(x.avg, 2)}`).join(" · ") + ".",
          calculo: "CTR del mes vs promedio de los 3 meses previos; se marca con una caída ≥ 40% y ≥ 1 pp, en flujos con ≥ 3.000 envíos.",
          hipotesis: "Contenido o productos recomendados desactualizados, o un cambio en el segmento de entrada del flujo.",
          accion: `Revisar contenido, bloque de productos y asunto de ${w.length === 1 ? "ese flujo" : "esos flujos"} y testear una variante.`,
          impacto: "Medio", esfuerzo: "Bajo",
          link: { label: "Ver la automatización", href: `/cuentas/${a.slug}/campanas/${encodeURIComponent(w[0].c.campaignId)}?${inp.qs}` },
        });
      }
    }
  }

  // ── Canales ───────────────────────────────────────────────────────
  if (revenueOk) {
    const chs = [...new Set(inp.accounts.flatMap((a) => a.channels))];
    const bySnap = chs.map((ch) => ({ ch, s: snap(M, ch) })).filter((x) => x.s.sent > 0);
    const emailS = bySnap.find((x) => x.ch === "email");
    for (const x of bySnap) {
      if (x.ch === "email" || !emailS || !x.s.k.rpe || !emailS.s.k.rpe) continue;
      const ratio = x.s.k.rpe / emailS.s.k.rpe;
      const shareSent = x.s.sent / cur.sent;
      if (ratio >= 3 && shareSent < 0.2) {
        out.push({
          id: `${prefix}-canal-${x.ch}`, severity: "opportunity", area: "Canales",
          title: `${CH[x.ch]} rinde ${ratio.toFixed(1).replace(".", ",")}× más por envío que email`,
          dato: `RPE ${CH[x.ch]} ${fmtMoney(x.s.k.rpe, money)} vs email ${fmtMoney(emailS.s.k.rpe, money)}; ${CH[x.ch]} es el ${fmtPct(shareSent)} de los envíos.`,
          calculo: "RPE = revenue atribuido / envíos del canal.",
          hipotesis: `Hay margen para llevar a ${CH[x.ch]} más comunicaciones de alto valor. El costo por mensaje es mayor que en email, por lo que la comparación correcta es revenue neto de costo.`,
          accion: `Sumar ${CH[x.ch]} como paso de refuerzo en carrito abandonado y en campañas clave para clientes con compra reciente; medir revenue neto del costo de mensajes.`,
          impacto: "Medio", esfuerzo: "Bajo",
        });
      }
    }
  }
  for (const a of inp.accounts) {
    const unused = a.channels.filter((ch) => snap(M, ch, "all", [a.slug]).sent === 0);
    if (unused.length && !inp.partial) {
      out.push({
        id: `${prefix}-canal-sin-uso-${a.slug}`, severity: "opportunity", area: "Canales",
        brand: inp.scope === "group" ? a.name : undefined,
        title: `Canal habilitado sin envíos: ${unused.map((c) => CH[c]).join(", ")}`,
        dato: `${a.name} tiene ${unused.map((c) => CH[c]).join(" y ")} habilitado pero sin actividad en ${monthName(M)}.`,
        accion: "Definir un uso concreto (aviso de despacho, recordatorio de puntos o carrito) o deshabilitarlo para simplificar.",
        impacto: "Bajo", esfuerzo: "Bajo",
      });
    }
  }

  // ── Engagement ────────────────────────────────────────────────────
  if (canCompare && prev.k.ctr && cur.k.ctr != null) {
    const d = cur.k.ctr - prev.k.ctr;
    if (d <= -0.003 || (prev.k.ctr && d / prev.k.ctr <= -0.2)) {
      out.push({
        id: `${prefix}-ctr`, severity: "warning", area: "Engagement",
        title: `CTR en baja: ${fmtPct(cur.k.ctr, 2)} (${pp(d)})`,
        dato: `CTR ${fmtPct(prev.k.ctr, 2)} → ${fmtPct(cur.k.ctr, 2)}; CTOR ${fmtPct(prev.k.ctor)} → ${fmtPct(cur.k.ctor)}.`,
        calculo: "CTR = clics / entregados · CTOR = clics / aperturas.",
        hipotesis: (cur.k.ctor ?? 0) < (prev.k.ctor ?? 0)
          ? "Cae también el CTOR: el problema está en el contenido u oferta, no en la apertura."
          : "El CTOR se sostiene: el problema está en la apertura (asunto, horario o entrega).",
        accion: (cur.k.ctor ?? 0) < (prev.k.ctor ?? 0)
          ? "Testear oferta y bloques de productos personalizados en las próximas campañas."
          : "Testear asuntos y horarios de envío; revisar entregabilidad.",
        impacto: "Medio", esfuerzo: "Bajo",
      });
    }
  }

  // ── Campañas ──────────────────────────────────────────────────────
  if (campM.length && revenueOk) {
    const total = campM.reduce((t, c) => t + (c.revenue ?? 0), 0);
    const sorted = [...campM].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
    const top = sorted[0];
    if (total > 0 && top && (top.revenue ?? 0) / total >= 0.25) {
      out.push({
        id: `${prefix}-concentracion`, severity: "info", area: "Campañas",
        title: `Una campaña concentra el ${fmtPct((top.revenue ?? 0) / total)} del revenue`,
        dato: `"${top.name}" generó ${fmtMoney(top.revenue, money)} de ${fmtMoney(total, money)}.`,
        hipotesis: "Alta dependencia de una sola pieza: si falla o se pausa, el mes cae.",
        accion: "Replicar su mecánica (segmento, oferta o canal) en otras campañas y monitorearla de cerca.",
        impacto: "Medio", esfuerzo: "Bajo",
        link: { label: "Ver campaña", href: `/cuentas/${top.accountSlug}/campanas/${encodeURIComponent(top.campaignId)}?${inp.qs}` },
      });
    }
    const oneShots = campM.filter((c) => c.groupType === "custom" && c.sent >= 5000);
    const avgCtr = cur.k.ctr ?? 0;
    const weak = oneShots.filter((c) => (kpis(c).ctr ?? 0) < avgCtr * 0.5);
    if (weak.length >= 2 && inp.campaignsComplete !== false) {
      const sentWeak = weak.reduce((t, c) => t + c.sent, 0);
      out.push({
        id: `${prefix}-campanas-debiles`, severity: "warning", area: "Campañas",
        title: `${weak.length} campañas one-shot con CTR menor a la mitad del promedio`,
        dato: `Suman ${fmtInt(sentWeak)} envíos (${fmtPct(sentWeak / cur.sent)} del total del mes) con CTR < ${fmtPct(avgCtr * 0.5, 2)}. Ej.: ${weak.slice(0, 3).map((c) => `"${c.name}"`).join(", ")}.`,
        calculo: "Umbral = 50% del CTR promedio del mes; solo campañas con ≥ 5.000 envíos.",
        hipotesis: "Son envíos masivos que consumen frecuencia y reputación sin respuesta proporcional.",
        accion: "Restringir estas piezas a segmentos con interés comprobado (clic o compra en la categoría) o reemplazarlas por automatizaciones.",
        impacto: "Medio", esfuerzo: "Bajo",
      });
    }
  }

  // ── Marcas (solo cuenta madre) ────────────────────────────────────
  if (inp.scope === "group" && inp.accounts.length > 1) {
    const g = cur.k.ctr ?? 0;
    for (const a of inp.accounts) {
      const s = snap(M, "all", "all", [a.slug]);
      if (s.sent < 10000 || !g) continue;
      if ((s.k.ctr ?? 0) < g * 0.75) {
        out.push({
          id: `g-marca-ctr-${a.slug}`, severity: "warning", area: "Marcas", brand: a.name,
          title: `${a.name} tiene un CTR ${Math.round((1 - (s.k.ctr ?? 0) / g) * 100)}% menor al del grupo`,
          dato: `CTR ${fmtPct(s.k.ctr, 2)} vs ${fmtPct(g, 2)} del grupo, con ${fmtInt(s.sent)} envíos.`,
          hipotesis: "Las prácticas de la marca con mejor CTR (segmentación, contenido, flujos) pueden replicarse.",
          accion: `Comparar el calendario y los flujos de ${a.name} con la marca de mejor desempeño del grupo y adoptar lo que funciona.`,
          impacto: "Medio", esfuerzo: "Medio",
          link: { label: `Ver ${a.name}`, href: `/cuentas/${a.slug}?${inp.qs}` },
        });
      }
    }
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || LVL[a.impacto ?? "Bajo"] - LVL[b.impacto ?? "Bajo"]);
}

export function insightCounts(list: Insight[]) {
  return {
    critical: list.filter((i) => i.severity === "critical").length,
    warning: list.filter((i) => i.severity === "warning").length,
    opportunity: list.filter((i) => i.severity === "opportunity").length,
    positive: list.filter((i) => i.severity === "positive").length,
  };
}

const NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function monthName(m: string) {
  return `${NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
}
