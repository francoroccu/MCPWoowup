import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export function mcpConfigured() {
  return Boolean(process.env.WOOWUP_MCP_URL && process.env.WOOWUP_MCP_TOKEN);
}

/**
 * Sesión MCP contra WoowUp. Es con estado: switch_account afecta a las
 * llamadas siguientes de ESTA sesión, por eso cada worker abre la suya.
 */
export class WoowUpSession {
  private client: Client;
  private constructor(client: Client) {
    this.client = client;
  }

  static async open(): Promise<WoowUpSession> {
    const url = process.env.WOOWUP_MCP_URL;
    const token = process.env.WOOWUP_MCP_TOKEN;
    if (!url || !token) throw new Error("Faltan WOOWUP_MCP_URL / WOOWUP_MCP_TOKEN");
    const header = process.env.WOOWUP_MCP_AUTH_HEADER || "Authorization";
    const prefix = process.env.WOOWUP_MCP_AUTH_PREFIX ?? "Bearer ";
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { [header]: `${prefix}${token}` } },
    });
    const client = new Client({ name: "patagonia-woowup-metrics", version: "0.1.0" });
    await client.connect(transport);
    return new WoowUpSession(client);
  }

  async listTools() {
    return (await this.client.listTools()).tools;
  }

  /** Llama una herramienta y devuelve el payload parseado (JSON si se puede). Reintenta 1 vez. */
  async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await this.client.callTool({ name, arguments: args });
        const text = extractText(res);
        if (res.isError) throw new Error(`${name}: ${text.slice(0, 300) || "error sin detalle"}`);
        if (res.structuredContent) return res.structuredContent;
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async close() {
    try {
      await this.client.close();
    } catch {
      /* noop */
    }
  }
}

function extractText(res: unknown): string {
  const content = (res as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (c && typeof c === "object" && (c as { type?: string }).type === "text" ? (c as { text: string }).text : ""))
    .join("\n")
    .trim();
}
