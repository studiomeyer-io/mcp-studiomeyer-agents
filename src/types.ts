/**
 * Public types — re-exported from the host service so this package stays type-safe.
 *
 * NOTE: this file is intentionally a small mirror of the StudioMeyer host
 * library types — we don't import them directly because mcp-studiomeyer-agents
 * is published independently of the host. If host types drift, the data layer
 * still matches the JSON contract documented here.
 */

export interface SmaReportSnapshot {
  id?: number;
  customerSlug: string;
  generatedAt: string; // ISO
  reportType: "biweekly" | "weekly" | "ad-hoc";
  markdown: string;
  sectionsJson: Record<string, unknown>;
  workersIncluded: number;
  contentHash: string;
}

export interface SmaAgentPersonaSnapshot {
  customerSlug: string;
  agentKuerzel: string;
  agentName: string;
  personaSystemPrompt: string;
  recentFindings: Array<{ insight: string; createdAt: string; tags: string[] }>;
  lastRunAt: string | null;
  snapshottedAt: string;
}

export interface CustomerCustomConfig {
  customerSlug: string;
  focusTopics: string[];
  keywordPriorities: string[];
  additionalCompetitors: string[];
  excludedCompetitors: string[];
  reportStyle?: "formal" | "locker" | "kompakt" | "ausfuehrlich" | null;
  alertThreshold?: "very-low" | "low" | "normal" | "high" | null;
  globalNote?: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface FindingRow {
  agent: string;
  agentName: string;
  id: string;
  insight: string;
  tags: string[];
  createdAt: string;
}

export interface AgentDef {
  kuerzel: string;
  name: string;
  module: "website" | "geo" | "business" | "master";
}

/**
 * Hardcoded list — must match agents/lib/studiomeyer-agents-product.ts SMA_AGENTS.
 * If host drifts, this will fall behind — the host's tests check parity.
 */
export const SMA_AGENTS: readonly AgentDef[] = [
  { kuerzel: "smasicht", name: "Sichtbarkeits-Agent", module: "website" },
  { kuerzel: "smatraf", name: "Traffic-Agent", module: "website" },
  { kuerzel: "smakonk", name: "Web-Konkurrenz-Agent", module: "website" },
  { kuerzel: "smatech", name: "Technik-Agent", module: "website" },
  { kuerzel: "smakivis", name: "KI-Sichtbarkeits-Agent", module: "geo" },
  { kuerzel: "smabrand", name: "Brand-Mention-Agent", module: "geo" },
  { kuerzel: "smacita", name: "Citation-Source-Agent", module: "geo" },
  { kuerzel: "smatrend", name: "Branchen-Trend-Agent", module: "business" },
  { kuerzel: "smainno", name: "Innovations-Agent", module: "business" },
  { kuerzel: "smamast", name: "Master-Synthesizer", module: "master" },
] as const;

export const ALLOWED_REPORT_STYLES = ["formal", "locker", "kompakt", "ausfuehrlich"] as const;
export const ALLOWED_ALERT_THRESHOLDS = ["very-low", "low", "normal", "high"] as const;

export const CONFIG_LIMITS = {
  maxFocusTopics: 5,
  maxKeywordPriorities: 10,
  maxAdditionalCompetitors: 10,
  maxExcludedCompetitors: 10,
  maxFocusTopicLen: 100,
  maxKeywordLen: 80,
  maxCompetitorLen: 80,
  maxGlobalNoteLen: 500,
} as const;

export class McpStudioMeyerError extends Error {
  constructor(
    message: string,
    public code:
      | "auth-failed"
      | "tenant-not-found"
      | "validation-failed"
      | "rate-limited"
      | "not-implemented"
      | "config-quota-exceeded"
      | "config-invalid-value"
      | "config-control-chars"
      | "config-too-long"
      | "config-empty"
      | "internal-error",
  ) {
    super(message);
    this.name = "McpStudioMeyerError";
  }
}
