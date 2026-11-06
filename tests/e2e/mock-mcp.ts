/**
 * Servidor MCP simulado de WoowUp (Streamable HTTP) para pruebas de punta a punta.
 * Reproduce el formato real de mcp.woowup.com relevado el 06/11/2026 (nombres de
 * parámetros, claves de respuesta, roles numéricos, páginas base 0, moneda "USD"
 * en cuentas chilenas).
 */
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export interface CallLog {
  tool: string;
  args: Record<string, unknown>;
  account: string | null;
}

const ACCOUNTS = {
  "acc-a": { id: 1, name: "Marca A [Grupo prueba]", country: "CHL", rol: 9, role: "OWNER", campaigns: 130 },
  "acc-b": { id: 2, name: "Marca B [Grupo prueba]", country: "PER", rol: 1, role: "CONSULT", campaigns: 12 },
} as const;
type Slug = keyof typeof ACCOUNTS;

/** Números deterministas a partir de los argumentos: permite verificar qué se pidió. */
function statsFor(slug: Slug, from: string, channel?: string, groupType?: string) {
  const m = Number(from.slice(5, 7));
  const chF = channel === "email" ? 0.7 : channel === "whatsapp" ? 0.3 : 1;
  const gtF = groupType === "custom" ? 0.6 : groupType === "triggered" ? 0.4 : 1;
  const base = (slug === "acc-a" ? 100_000 : 40_000) * (1 + m / 100) * chF * gtF;
  const sent = Math.round(base);
  return {
    sent,
    bounce: Math.round(sent * 0.012),
    open: Math.round(sent * 0.3),
    clicked: Math.round(sent * 0.02),
    spam: Math.round(sent * 0.0003),
    unsubscribe: Math.round(sent * 0.002),
    revenue: ACCOUNTS[slug].role === "CONSULT" ? "REDACTED" : Math.round(sent * 75),
    tickets: Math.round(sent * 0.0008),
  };
}

function campaignsFor(slug: Slug, from: string) {
  const n = ACCOUNTS[slug].campaigns;
  return Array.from({ length: n }, (_, i) => {
    const triggered = i < 6;
    const sent = 1000 + i * 37;
    return {
      id: triggered ? 1000 + i : Number(`${from.slice(2, 4)}${from.slice(5, 7)}${String(i).padStart(3, "0")}`),
      name: triggered ? `Flujo ${i}` : `Campaña ${i}`,
      subject: `Asunto ${i}`,
      status: "active",
      stage: "sent",
      type: triggered ? ["abandoned-cart", "customer-created", "last-purchase", "risky-customers", "customer-birthday", "browser-abandonment-product"][i] : "custom",
      lastsent: `${from.slice(0, 7)}-28 10:00:00`,
      startdate: triggered ? "2026-01-10T12:00:00+00:00" : `${from.slice(0, 7)}-${String((i % 28) + 1).padStart(2, "0")}T12:00:00+00:00`,
      channel: i % 5 === 0 ? "whatsapp" : "email",
      stats: {
        revenue: ACCOUNTS[slug].role === "CONSULT" ? "REDACTED" : sent * 80, tickets: Math.round(sent * 0.001),
        sent, bounce: Math.round(sent * 0.01), open: Math.round(sent * 0.3), clicked: Math.round(sent * 0.025), spam: 0, unsubscribe: Math.round(sent * 0.002),
      },
    };
  });
}

function buildServer(log: CallLog[]) {
  let current: Slug | null = null;
  const server = new Server({ name: "woowup-mock", version: "0.0.1" }, { capabilities: { tools: {} } });
  const tools = ["list_accounts", "switch_account", "get_account", "get_campaigns_stats", "list_campaigns"];
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((name) => ({ name, description: name, inputSchema: { type: "object" as const, properties: {} } })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    log.push({ tool: name, args, account: current });
    const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
    const err = (msg: string) => ({ isError: true, content: [{ type: "text" as const, text: msg }] });
    switch (name) {
      case "list_accounts":
        return ok({ current_account: "acc-a", accounts: Object.entries(ACCOUNTS).map(([slug, a]) => ({ id: a.id, slug, name: a.name, rol: a.rol, is_current: false })) });
      case "switch_account": {
        const slug = args.account_slug as Slug;
        if (!(slug in ACCOUNTS)) return err(`cuenta desconocida: ${slug}`);
        current = slug;
        return ok({ switched_to: slug, account_id: ACCOUNTS[slug].id, account_name: ACCOUNTS[slug].name, role: ACCOUNTS[slug].role, message: `Switched to '${ACCOUNTS[slug].name}'` });
      }
      case "get_account": {
        if (!current) return err("sin cuenta seleccionada");
        const a = ACCOUNTS[current];
        return ok({ id: a.id, slug: current, title: a.name, timezone: -3, currency: "USD", country: a.country, status: "active", features: { whatsapp: false, sms: false, email_marketing: false } });
      }
      case "get_campaigns_stats": {
        if (!current) return err("sin cuenta seleccionada");
        return ok({ active_account: { slug: current }, data: statsFor(current, String(args.from_date), args.channel as string, args.group_type as string) });
      }
      case "list_campaigns": {
        if (!current) return err("sin cuenta seleccionada");
        const all = campaignsFor(current, String(args.from_date));
        const page = Number(args.page ?? 0); // base 0, como el MCP real
        const limit = Math.min(Number(args.limit ?? 20), 100);
        return ok({ active_account: { slug: current }, data: all.slice(page * limit, (page + 1) * limit) });
      }
      default:
        return err(`herramienta desconocida: ${name}`);
    }
  });
  return server;
}

/** Levanta el servidor; exige el header Authorization correcto como haría WoowUp. */
export async function startMockMcp(token: string): Promise<{ url: string; log: CallLog[]; close: () => Promise<void> }> {
  const log: CallLog[] = [];
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const http: HttpServer = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    const sid = req.headers["mcp-session-id"] as string | undefined;
    let transport = sid ? sessions.get(sid) : undefined;
    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport!);
        },
      });
      await buildServer(log).connect(transport);
    }
    await transport.handleRequest(req, res, body);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", () => r()));
  const port = (http.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    log,
    close: () => new Promise<void>((r) => { sessions.forEach((t) => t.close()); http.close(() => r()); }),
  };
}
