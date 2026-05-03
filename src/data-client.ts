/**
 * DataClient — abstracts how the MCP server reaches the StudioMeyer Agents
 * data layer. Default backend is HTTP (talks to the StudioMeyer host's
 * /sma-bridge/* endpoints with a per-customer API key) so the MCP server
 * can ship as a stand-alone npm package without any DB access.
 *
 * The HTTP backend is what real customers use. Tests override this with
 * an in-memory client (via the `DataClient` interface) to avoid network.
 */

import type {
  SmaReportSnapshot,
  SmaAgentPersonaSnapshot,
  CustomerCustomConfig,
  FindingRow,
} from "./types.js";

export interface DataClient {
  /** Phase 2 read tools */
  getLatestReport(): Promise<SmaReportSnapshot | null>;
  listReports(limit?: number): Promise<SmaReportSnapshot[]>;
  searchFindings(opts: { query?: string; limit?: number; agentKuerzel?: string }): Promise<FindingRow[]>;
  loadAgentPersona(agentKuerzel: string): Promise<SmaAgentPersonaSnapshot | null>;
  listAgentPersonas(): Promise<SmaAgentPersonaSnapshot[]>;
  exportRawData(): Promise<{ reports: SmaReportSnapshot[]; personas: SmaAgentPersonaSnapshot[]; config: CustomerCustomConfig }>;

  /** Phase 3 config tools */
  getConfig(): Promise<CustomerCustomConfig>;
  upsertConfig(patch: Partial<CustomerCustomConfig>, updatedBy: string): Promise<CustomerCustomConfig>;
}

interface HttpClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Optional fetch override for testing. Default uses globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Default timeout per request, ms */
  timeoutMs?: number;
}

export class HttpDataClient implements DataClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: HttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          ...((init?.headers as Record<string, string> | undefined) ?? {}),
        },
      });
      if (res.status === 401) {
        throw new Error(
          "SMA API: API-Key ungueltig oder widerrufen. Erstelle einen neuen Key unter https://studiomeyer.io/portal/agents/keys",
        );
      }
      if (res.status === 403) {
        let parsed: { error?: string; upgradeUrl?: string; message?: string } = {};
        try {
          parsed = (await res.json()) as { error?: string; upgradeUrl?: string; message?: string };
        } catch {
          /* ignore non-JSON 403 */
        }
        if (parsed.error === "pro-tier-required") {
          throw new Error(
            `SMA: Pro-Tier-Feature. ${parsed.message ?? "Standard-Customers (99 EUR/Mo) bekommen den Bericht alle 14 Tage per E-Mail."} Upgrade: ${parsed.upgradeUrl ?? "https://studiomeyer.io/services/agents"}`,
          );
        }
        if (parsed.error === "insufficient_scope") {
          throw new Error(`SMA: Key hat keinen write-Scope. Erstelle einen neuen Key mit write-Scope.`);
        }
        throw new Error(`SMA API forbidden: HTTP 403`);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`SMA API ${path} failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
      }
      return await res.json() as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async getLatestReport(): Promise<SmaReportSnapshot | null> {
    return this.request<SmaReportSnapshot | null>("/api/sma-bridge/reports/latest");
  }

  async listReports(limit = 10): Promise<SmaReportSnapshot[]> {
    return this.request<SmaReportSnapshot[]>(`/api/sma-bridge/reports?limit=${encodeURIComponent(String(limit))}`);
  }

  async searchFindings(opts: { query?: string; limit?: number; agentKuerzel?: string } = {}): Promise<FindingRow[]> {
    const params = new URLSearchParams();
    if (opts.query) params.set("query", opts.query);
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.agentKuerzel) params.set("agent", opts.agentKuerzel);
    const q = params.toString();
    return this.request<FindingRow[]>(`/api/sma-bridge/findings${q ? `?${q}` : ""}`);
  }

  async loadAgentPersona(agentKuerzel: string): Promise<SmaAgentPersonaSnapshot | null> {
    return this.request<SmaAgentPersonaSnapshot | null>(`/api/sma-bridge/personas/${encodeURIComponent(agentKuerzel)}`);
  }

  async listAgentPersonas(): Promise<SmaAgentPersonaSnapshot[]> {
    return this.request<SmaAgentPersonaSnapshot[]>("/api/sma-bridge/personas");
  }

  async exportRawData(): Promise<{ reports: SmaReportSnapshot[]; personas: SmaAgentPersonaSnapshot[]; config: CustomerCustomConfig }> {
    return this.request("/api/sma-bridge/export");
  }

  async getConfig(): Promise<CustomerCustomConfig> {
    return this.request<CustomerCustomConfig>("/api/sma-bridge/config");
  }

  async upsertConfig(patch: Partial<CustomerCustomConfig>, updatedBy: string): Promise<CustomerCustomConfig> {
    return this.request<CustomerCustomConfig>("/api/sma-bridge/config", {
      method: "POST",
      body: JSON.stringify({ ...patch, updatedBy }),
    });
  }
}

/**
 * In-memory client for tests + dry-runs. Pre-populate fields, MCP tools call it.
 */
export class InMemoryDataClient implements DataClient {
  reports: SmaReportSnapshot[] = [];
  personas: SmaAgentPersonaSnapshot[] = [];
  findings: FindingRow[] = [];
  config: CustomerCustomConfig;

  constructor(customerSlug: string) {
    this.config = {
      customerSlug,
      focusTopics: [],
      keywordPriorities: [],
      additionalCompetitors: [],
      excludedCompetitors: [],
      reportStyle: null,
      alertThreshold: null,
      globalNote: null,
      updatedAt: new Date(0).toISOString(),
      updatedBy: "default",
    };
  }

  async getLatestReport(): Promise<SmaReportSnapshot | null> {
    if (this.reports.length === 0) return null;
    return this.reports
      .slice()
      .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0];
  }

  async listReports(limit = 10): Promise<SmaReportSnapshot[]> {
    return this.reports
      .slice()
      .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
      .slice(0, limit);
  }

  async searchFindings(opts: { query?: string; limit?: number; agentKuerzel?: string } = {}): Promise<FindingRow[]> {
    let rows = this.findings.slice();
    if (opts.agentKuerzel) {
      rows = rows.filter((r) => r.agent === opts.agentKuerzel);
    }
    if (opts.query) {
      const q = opts.query.toLowerCase();
      rows = rows.filter((r) => r.insight.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q)));
    }
    return rows.slice(0, opts.limit ?? 50);
  }

  async loadAgentPersona(agentKuerzel: string): Promise<SmaAgentPersonaSnapshot | null> {
    return this.personas.find((p) => p.agentKuerzel === agentKuerzel) ?? null;
  }

  async listAgentPersonas(): Promise<SmaAgentPersonaSnapshot[]> {
    return this.personas.slice();
  }

  async exportRawData() {
    return { reports: this.reports.slice(), personas: this.personas.slice(), config: this.config };
  }

  async getConfig(): Promise<CustomerCustomConfig> {
    return this.config;
  }

  async upsertConfig(patch: Partial<CustomerCustomConfig>, updatedBy: string): Promise<CustomerCustomConfig> {
    this.config = {
      ...this.config,
      ...patch,
      customerSlug: this.config.customerSlug,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    return this.config;
  }
}
