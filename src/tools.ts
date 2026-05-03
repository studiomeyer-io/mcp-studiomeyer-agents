/**
 * Tool definitions — pure functions, MCP-handler-agnostic. The server.ts
 * file wires them into the @modelcontextprotocol/sdk transport.
 *
 * 14 tools total:
 *   8 read-only (Phase 2: data + persona-replay)
 *   6 set / get (Phase 3: self-service config)
 */

import { z } from "zod";
import type { DataClient } from "./data-client.js";
import { validateConfigPatch } from "./validation.js";
import {
  ALLOWED_ALERT_THRESHOLDS,
  ALLOWED_REPORT_STYLES,
  SMA_AGENTS,
  type CustomerCustomConfig,
} from "./types.js";

export interface ToolDef<I extends z.ZodTypeAny = z.ZodTypeAny, O = unknown> {
  name: string;
  title: string;
  description: string;
  inputSchema: I;
  /** True = read-only (server can advertise readOnlyHint). */
  readOnly: boolean;
  handler: (input: z.infer<I>, ctx: { client: DataClient; updatedBy: string }) => Promise<O>;
}

// ─── Phase 2 — Read tools ──────────────────────────

export const getLatestReportTool: ToolDef = {
  name: "sma_get_latest_report",
  title: "Get latest report",
  description:
    "Returns the most recent 14-day report (or weekly / ad-hoc) for the customer. " +
    "Includes both Markdown form (for direct reading) and structured sectionsJson (for parsing).",
  inputSchema: z.object({}).strict(),
  readOnly: true,
  handler: async (_input, { client }) => {
    const r = await client.getLatestReport();
    if (!r) return { ok: false, message: "Noch kein Bericht — der erste Bericht entsteht 7-10 Tage nach Onboarding." };
    return { ok: true, report: r };
  },
};

export const listReportsTool: ToolDef = {
  name: "sma_list_reports",
  title: "List reports",
  description: "Lists the last N reports (default 10, max 50). Use sma_compare_periods for diffing.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe("Max reports to return (default 10, max 50)"),
  }).strict(),
  readOnly: true,
  handler: async (input, { client }) => {
    const reports = await client.listReports(input.limit);
    return { ok: true, count: reports.length, reports };
  },
};

export const searchFindingsTool: ToolDef = {
  name: "sma_search_findings",
  title: "Search findings",
  description:
    "Full-text search across all 10 agent finding tables (filtered to your customer slug). " +
    "Optional filter by agent (kuerzel like 'smasicht', 'smatraf', 'smakonk', etc.).",
  inputSchema: z.object({
    query: z.string().optional().describe("Text query (matches insight content + tags)"),
    agentKuerzel: z.string().optional().describe("Filter to single agent (e.g. 'smasicht')"),
    limit: z.number().int().min(1).max(200).optional().describe("Max results (default 50, max 200)"),
  }).strict(),
  readOnly: true,
  handler: async (input, { client }) => {
    const rows = await client.searchFindings(input);
    return { ok: true, count: rows.length, findings: rows };
  },
};

export const loadAgentPersonaTool: ToolDef = {
  name: "sma_load_agent_persona",
  title: "Load agent persona",
  description:
    "Returns one of the 9 worker agent personas (system prompt + last 30 findings) so your own AI " +
    "can simulate a strategy chat with that agent. The agent identifiers are: " +
    SMA_AGENTS.filter((a) => a.module !== "master").map((a) => `${a.kuerzel} (${a.name})`).join(", ") +
    ".",
  inputSchema: z.object({
    agentKuerzel: z.string().describe("Agent kuerzel — see description for valid values"),
  }).strict(),
  readOnly: true,
  handler: async (input, { client }) => {
    const valid = SMA_AGENTS.find((a) => a.kuerzel === input.agentKuerzel);
    if (!valid) {
      const choices = SMA_AGENTS.map((a) => a.kuerzel).join(", ");
      return { ok: false, message: `Unknown agent kuerzel "${input.agentKuerzel}" — valid: ${choices}` };
    }
    const persona = await client.loadAgentPersona(input.agentKuerzel);
    if (!persona) {
      return { ok: false, message: `Agent ${input.agentKuerzel} hat noch keinen Persona-Snapshot — wartet auf naechsten Master-Synth-Lauf.` };
    }
    return { ok: true, persona };
  },
};

export const listAgentPersonasTool: ToolDef = {
  name: "sma_list_agent_personas",
  title: "List all agent personas",
  description: "Returns all 9 worker agent personas in one call (lighter than 9 separate sma_load_agent_persona).",
  inputSchema: z.object({}).strict(),
  readOnly: true,
  handler: async (_input, { client }) => {
    const personas = await client.listAgentPersonas();
    return { ok: true, count: personas.length, personas };
  },
};

export const comparePeriodsTool: ToolDef = {
  name: "sma_compare_periods",
  title: "Compare two reports",
  description:
    "Compares two reports (by index in the report list — 0 = latest, 1 = previous, etc.). " +
    "Returns the markdown of both for your AI to diff.",
  inputSchema: z.object({
    indexA: z.number().int().min(0).max(50).optional().describe("Index of first report (default 0 = latest)"),
    indexB: z.number().int().min(0).max(50).optional().describe("Index of second report (default 1 = previous)"),
  }).strict(),
  readOnly: true,
  handler: async (input, { client }) => {
    const reports = await client.listReports(50);
    const indexA = input.indexA ?? 0;
    const indexB = input.indexB ?? 1;
    if (indexA >= reports.length || indexB >= reports.length) {
      return {
        ok: false,
        message: `Nicht genug Reports — du hast ${reports.length}, brauchst mindestens ${Math.max(indexA, indexB) + 1}.`,
      };
    }
    return {
      ok: true,
      reportA: reports[indexA],
      reportB: reports[indexB],
      hint: "Compare reportA vs reportB to identify changes between periods (e.g. visibility shifts, new competitors, new findings).",
    };
  },
};

export const exportRawDataTool: ToolDef = {
  name: "sma_export_raw_data",
  title: "Export all data (DSGVO)",
  description:
    "Returns all your StudioMeyer Agents data — reports, personas, config — in one JSON. " +
    "DSGVO Art. 20 right to data portability. Useful for backup or migration.",
  inputSchema: z.object({}).strict(),
  readOnly: true,
  handler: async (_input, { client }) => {
    const dump = await client.exportRawData();
    return {
      ok: true,
      reports_count: dump.reports.length,
      personas_count: dump.personas.length,
      ...dump,
    };
  },
};

export const getConfigTool: ToolDef = {
  name: "sma_get_config",
  title: "Get current customer config",
  description: "Returns your current self-service config (focus topics, keywords, competitors, report style, alert threshold, global note).",
  inputSchema: z.object({}).strict(),
  readOnly: true,
  handler: async (_input, { client }) => {
    const config = await client.getConfig();
    return { ok: true, config };
  },
};

// ─── Phase 3 — Set tools (validated client-side + host-side) ──

export const setFocusTopicsTool: ToolDef = {
  name: "sma_set_focus_topics",
  title: "Set additional focus topics",
  description:
    "Add up to 5 extra topics that all agents should give more attention. Each topic max 100 chars. " +
    "Replaces the previous list — pass the full new array.",
  inputSchema: z.object({
    focusTopics: z.array(z.string()).max(5).describe("Up to 5 topics, each max 100 chars"),
  }).strict(),
  readOnly: false,
  handler: async (input, { client, updatedBy }) => {
    validateConfigPatch({ focusTopics: input.focusTopics });
    const config = await client.upsertConfig({ focusTopics: input.focusTopics }, updatedBy);
    return { ok: true, config };
  },
};

export const setKeywordPrioritiesTool: ToolDef = {
  name: "sma_set_keyword_priorities",
  title: "Set keyword priorities",
  description:
    "Set up to 10 high-priority keywords. These come BEFORE profile keywords in agent system prompts. " +
    "Each keyword max 80 chars. Replaces previous list.",
  inputSchema: z.object({
    keywordPriorities: z.array(z.string()).max(10).describe("Up to 10 keywords, each max 80 chars"),
  }).strict(),
  readOnly: false,
  handler: async (input, { client, updatedBy }) => {
    validateConfigPatch({ keywordPriorities: input.keywordPriorities });
    const config = await client.upsertConfig({ keywordPriorities: input.keywordPriorities }, updatedBy);
    return { ok: true, config };
  },
};

export const setCompetitorWatchTool: ToolDef = {
  name: "sma_set_competitor_watch",
  title: "Set competitor watch list",
  description:
    "Adjust competitors: pass `additionalCompetitors` to add (max 10) and `excludedCompetitors` to remove (max 10). " +
    "Effective list = profile.competitors + additional - excluded. Each entry max 80 chars.",
  inputSchema: z.object({
    additionalCompetitors: z.array(z.string()).max(10).optional().describe("Add to profile-list (max 10)"),
    excludedCompetitors: z.array(z.string()).max(10).optional().describe("Remove from profile-list (max 10)"),
  }).strict(),
  readOnly: false,
  handler: async (input, { client, updatedBy }) => {
    const patch: Partial<CustomerCustomConfig> = {};
    if (input.additionalCompetitors !== undefined) patch.additionalCompetitors = input.additionalCompetitors;
    if (input.excludedCompetitors !== undefined) patch.excludedCompetitors = input.excludedCompetitors;
    validateConfigPatch(patch);
    const config = await client.upsertConfig(patch, updatedBy);
    return { ok: true, config };
  },
};

export const setReportStyleTool: ToolDef = {
  name: "sma_set_report_style",
  title: "Set report style",
  description: "Choose the tone/length style for the 14-day report: " + ALLOWED_REPORT_STYLES.join(" / ") + ".",
  inputSchema: z.object({
    reportStyle: z.enum(ALLOWED_REPORT_STYLES).describe("One of: " + ALLOWED_REPORT_STYLES.join(", ")),
  }).strict(),
  readOnly: false,
  handler: async (input, { client, updatedBy }) => {
    validateConfigPatch({ reportStyle: input.reportStyle });
    const config = await client.upsertConfig({ reportStyle: input.reportStyle }, updatedBy);
    return { ok: true, config };
  },
};

export const setAlertThresholdTool: ToolDef = {
  name: "sma_set_alert_threshold",
  title: "Set game-changer alert threshold",
  description:
    "PRO TIER: how aggressive should immediate alerts be? " +
    ALLOWED_ALERT_THRESHOLDS.join(" / ") + ". `very-low` = alert at any innovation, `high` = only true game-changers.",
  inputSchema: z.object({
    alertThreshold: z.enum(ALLOWED_ALERT_THRESHOLDS).describe("One of: " + ALLOWED_ALERT_THRESHOLDS.join(", ")),
  }).strict(),
  readOnly: false,
  handler: async (input, { client, updatedBy }) => {
    validateConfigPatch({ alertThreshold: input.alertThreshold });
    const config = await client.upsertConfig({ alertThreshold: input.alertThreshold }, updatedBy);
    return { ok: true, config };
  },
};

export const setGlobalNoteTool: ToolDef = {
  name: "sma_set_global_note",
  title: "Set free-form note for all agents",
  description:
    "Free-form note (max 500 chars) that all agents see in their system prompt. " +
    "Useful for context like 'Our new product launches in 6 weeks — extra focus on that' or 'Skip mentions of company X — competitor merger blocked'.",
  inputSchema: z.object({
    globalNote: z.string().max(500).describe("Free-form note, max 500 chars. Empty string clears it."),
  }).strict(),
  readOnly: false,
  handler: async (input, { client, updatedBy }) => {
    if (input.globalNote === "") {
      const config = await client.upsertConfig({ globalNote: null }, updatedBy);
      return { ok: true, config };
    }
    validateConfigPatch({ globalNote: input.globalNote });
    const config = await client.upsertConfig({ globalNote: input.globalNote }, updatedBy);
    return { ok: true, config };
  },
};

// ─── Tool Registry ─────────────────────────────────

export const ALL_TOOLS: readonly ToolDef[] = [
  // Phase 2 read tools
  getLatestReportTool,
  listReportsTool,
  searchFindingsTool,
  loadAgentPersonaTool,
  listAgentPersonasTool,
  comparePeriodsTool,
  exportRawDataTool,
  getConfigTool,
  // Phase 3 set tools
  setFocusTopicsTool,
  setKeywordPrioritiesTool,
  setCompetitorWatchTool,
  setReportStyleTool,
  setAlertThresholdTool,
  setGlobalNoteTool,
] as const;

export const READ_ONLY_TOOL_NAMES = ALL_TOOLS.filter((t) => t.readOnly).map((t) => t.name);
export const WRITE_TOOL_NAMES = ALL_TOOLS.filter((t) => !t.readOnly).map((t) => t.name);
