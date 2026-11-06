/**
 * Servidor MCP simulado de WoowUp (Streamable HTTP) para pruebas de punta a punta.
 * Imita el contrato que asume src/lib/woowup/mapping.ts. No valida el contrato
 * real de WoowUp: eso se hace con `npm run mcp:inspect` contra el servidor real.
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
  "acc-a": { name: "Marca A", country: "CL", currency: "CLP", role: "ADMIN", channels: ["email", "whatsapp"], campaigns: 130 },
  "acc-b": { name: "Marca B", country: "PE", currency: "PEN", role: "CONSULT", channels: ["email"], campaigns: 12 },
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
    bounces: Math.round(sent * 0.012),
    unique_opens: Math.round(sent * 0.3),
    unique_clicks: Math.round(sent * 0.02),
    spam: Math.round(sent * 0.0003),
    unsubscribes: Math.round(sent * 0.002),
    conversions: Math.round(sent * 0.0008),
    revenue: ACCOUNTS[slug].role === "CONSULT" ? "REDACTED" : Math.round(sent * 75),
    campaigns_count: groupType === "triggered" ? 5 : 20,
  };
}

function campaignsFor(slug: Slug, from: string) {
  const n = ACCOUNTS[slug].campaigns;
  return Array.from({ length: n }, (_, i) => {
    const triggered = i < 6;
    const sent = 1000 + i * 37;
    return {
      id: triggered ? `${slug}-flow-${i}` : `${slug}-${from.slice(0, 7)}-${i}`,
      name: triggered ? `Flujo ${i}` : `Campaña ${i}`,
      channel: i % 5 === 0 ? "whatsapp" : "email",
      group_type: triggered ? "triggered" : "custom",
      campaign_type: triggered ? ["abandoned_cart", "welcome", "post_purchase", "winback", "birthday", "browse_abandonment"][i] : "newsletter",
      status: triggered ? "active" : "sent",
      sent_at: triggered ? null : `${from.slice(0, 7)}-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
      subject: `Asunto ${i}`,
      stats: {
        sent, bounces: Math.round(sent * 0.01), unique_opens: Math.round(sent * 0.3), unique_clicks: Math.round(sent * 0.025),
        spam: 0, unsubscribes: Math.round(sent * 0.002), conversions: Math.round(sent * 0.001),
        revenue: ACCOUNTS[slug].role === "CONSULT" ? "REDACTED" : sent * 80,
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
        return ok({ accounts: Object.entries(ACCOUNTS).map(([slug, a]) => ({ slug, name: a.name })) });
      case "switch_account": {
        const slug = args.slug as Slug;
        if (!(slug in ACCOUNTS)) return err(`cuenta desconocida: ${slug}`);
        current = slug;
        return ok({ ok: true, account: slug });
      }
      case "get_account": {
        if (!current) return err("sin cuenta seleccionada");
        const a = ACCOUNTS[current];
        return ok({ account: { slug: current, name: a.name, country: a.country, currency: a.currency, role: a.role, status: "active", timezone: "America/Santiago", channels: a.channels } });
      }
      case "get_campaigns_stats": {
        if (!current) return err("sin cuenta seleccionada");
        return ok({ totals: statsFor(current, String(args.from_date), args.channel as string, args.group_type as string) });
      }
      case "list_campaigns": {
        if (!current) return err("sin cuenta seleccionada");
        const all = campaignsFor(current, String(args.from_date));
        const page = Number(args.page ?? 1);
        const limit = Number(args.limit ?? 100);
        return ok({ campaigns: all.slice((page - 1) * limit, page * limit), pagination: { page, total_pages: Math.ceil(all.length / limit) } });
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
