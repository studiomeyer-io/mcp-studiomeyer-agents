import { describe, expect, it, beforeEach } from "vitest";
import {
  ALL_TOOLS,
  READ_ONLY_TOOL_NAMES,
  WRITE_TOOL_NAMES,
  getLatestReportTool,
  searchFindingsTool,
  loadAgentPersonaTool,
  setFocusTopicsTool,
  setReportStyleTool,
  setCompetitorWatchTool,
  setGlobalNoteTool,
  comparePeriodsTool,
  exportRawDataTool,
} from "../src/tools.js";
import { InMemoryDataClient } from "../src/data-client.js";
import type { SmaReportSnapshot, SmaAgentPersonaSnapshot } from "../src/types.js";

function makeClient(slug = "test-customer"): InMemoryDataClient {
  return new InMemoryDataClient(slug);
}

function makeReport(daysAgo: number, slug = "test-customer"): SmaReportSnapshot {
  return {
    id: 100 - daysAgo,
    customerSlug: slug,
    generatedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    reportType: "biweekly",
    markdown: `# Report ${daysAgo} days ago\n\nContent here.`,
    sectionsJson: { summary: `Day ${daysAgo}`, "wer-dich-findet": "..." },
    workersIncluded: 9,
    contentHash: `hash-${daysAgo}`,
  };
}

function makePersona(kuerzel: string, name: string, slug = "test-customer"): SmaAgentPersonaSnapshot {
  return {
    customerSlug: slug,
    agentKuerzel: kuerzel,
    agentName: name,
    personaSystemPrompt: `Ich bin ${name}.`,
    recentFindings: [{ insight: "Finding 1", createdAt: new Date().toISOString(), tags: ["customer:" + slug] }],
    lastRunAt: new Date().toISOString(),
    snapshottedAt: new Date().toISOString(),
  };
}

describe("ALL_TOOLS registry", () => {
  it("exports 14 tools", () => {
    expect(ALL_TOOLS).toHaveLength(14);
  });
  it("8 read-only + 6 write tools", () => {
    expect(READ_ONLY_TOOL_NAMES).toHaveLength(8);
    expect(WRITE_TOOL_NAMES).toHaveLength(6);
  });
  it("all tool names start with sma_", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.name).toMatch(/^sma_/);
    }
  });
  it("all tool names are unique", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it("each tool has title + description + inputSchema + handler", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.title).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.handler).toBe("function");
    }
  });
});

describe("sma_get_latest_report", () => {
  let client: InMemoryDataClient;
  beforeEach(() => { client = makeClient(); });

  it("returns ok:false when no reports", async () => {
    const result = await getLatestReportTool.handler({}, { client, updatedBy: "test" }) as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  it("returns latest report when multiple exist", async () => {
    client.reports = [makeReport(3), makeReport(1), makeReport(2)];
    const result = await getLatestReportTool.handler({}, { client, updatedBy: "test" }) as { ok: boolean; report: SmaReportSnapshot };
    expect(result.ok).toBe(true);
    expect(result.report.contentHash).toBe("hash-1");
  });
});

describe("sma_search_findings", () => {
  let client: InMemoryDataClient;
  beforeEach(() => { client = makeClient(); });

  it("returns empty when nothing matches", async () => {
    client.findings = [
      { agent: "smasicht", agentName: "Sicht", id: "1", insight: "Foo", tags: ["customer:test-customer"], createdAt: new Date().toISOString() },
    ];
    const result = await searchFindingsTool.handler({ query: "nothingmatches" }, { client, updatedBy: "test" }) as { count: number };
    expect(result.count).toBe(0);
  });

  it("filters by agentKuerzel", async () => {
    client.findings = [
      { agent: "smasicht", agentName: "S", id: "1", insight: "A", tags: [], createdAt: "" },
      { agent: "smatraf", agentName: "T", id: "2", insight: "B", tags: [], createdAt: "" },
    ];
    const result = await searchFindingsTool.handler({ agentKuerzel: "smasicht" }, { client, updatedBy: "test" }) as { count: number };
    expect(result.count).toBe(1);
  });

  it("respects limit", async () => {
    client.findings = Array.from({ length: 100 }, (_, i) => ({
      agent: "smasicht",
      agentName: "S",
      id: String(i),
      insight: `f${i}`,
      tags: [],
      createdAt: "",
    }));
    const result = await searchFindingsTool.handler({ limit: 5 }, { client, updatedBy: "test" }) as { count: number };
    expect(result.count).toBe(5);
  });
});

describe("sma_load_agent_persona", () => {
  let client: InMemoryDataClient;
  beforeEach(() => { client = makeClient(); });

  it("returns ok:false for unknown kuerzel", async () => {
    const result = await loadAgentPersonaTool.handler(
      { agentKuerzel: "smabogus" },
      { client, updatedBy: "test" },
    ) as { ok: boolean; message: string };
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown");
  });

  it("returns ok:false when persona not snapshotted yet", async () => {
    const result = await loadAgentPersonaTool.handler(
      { agentKuerzel: "smasicht" },
      { client, updatedBy: "test" },
    ) as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  it("returns persona when present", async () => {
    client.personas = [makePersona("smasicht", "Sicht")];
    const result = await loadAgentPersonaTool.handler(
      { agentKuerzel: "smasicht" },
      { client, updatedBy: "test" },
    ) as { ok: boolean; persona: SmaAgentPersonaSnapshot };
    expect(result.ok).toBe(true);
    expect(result.persona.agentKuerzel).toBe("smasicht");
  });
});

describe("sma_compare_periods", () => {
  it("complains when not enough reports", async () => {
    const client = makeClient();
    client.reports = [makeReport(0)];
    const result = await comparePeriodsTool.handler({}, { client, updatedBy: "test" }) as { ok: boolean };
    expect(result.ok).toBe(false);
  });

  it("returns reportA + reportB when enough reports", async () => {
    const client = makeClient();
    client.reports = [makeReport(2), makeReport(1), makeReport(0)];
    const result = await comparePeriodsTool.handler({}, { client, updatedBy: "test" }) as {
      ok: boolean;
      reportA: SmaReportSnapshot;
      reportB: SmaReportSnapshot;
    };
    expect(result.ok).toBe(true);
    expect(result.reportA.contentHash).toBe("hash-0");
    expect(result.reportB.contentHash).toBe("hash-1");
  });
});

describe("sma_set_focus_topics", () => {
  let client: InMemoryDataClient;
  beforeEach(() => { client = makeClient(); });

  it("accepts up to 5 topics + persists", async () => {
    const result = await setFocusTopicsTool.handler(
      { focusTopics: ["a", "b"] },
      { client, updatedBy: "alice" },
    ) as { ok: boolean; config: { focusTopics: string[]; updatedBy: string } };
    expect(result.ok).toBe(true);
    expect(result.config.focusTopics).toEqual(["a", "b"]);
    expect(result.config.updatedBy).toBe("alice");
    expect(client.config.focusTopics).toEqual(["a", "b"]);
  });

  it("rejects 6 topics", async () => {
    await expect(
      setFocusTopicsTool.handler(
        { focusTopics: ["a", "b", "c", "d", "e", "f"] },
        { client, updatedBy: "alice" },
      ),
    ).rejects.toThrow();
  });
});

describe("sma_set_competitor_watch", () => {
  it("merges add + exclude", async () => {
    const client = makeClient();
    const result = await setCompetitorWatchTool.handler(
      { additionalCompetitors: ["x.com"], excludedCompetitors: ["y.com"] },
      { client, updatedBy: "test" },
    ) as { ok: boolean; config: { additionalCompetitors: string[]; excludedCompetitors: string[] } };
    expect(result.ok).toBe(true);
    expect(result.config.additionalCompetitors).toEqual(["x.com"]);
    expect(result.config.excludedCompetitors).toEqual(["y.com"]);
  });
});

describe("sma_set_report_style", () => {
  it("accepts each allowed style", async () => {
    const client = makeClient();
    for (const style of ["formal", "locker", "kompakt", "ausfuehrlich"] as const) {
      const result = await setReportStyleTool.handler(
        { reportStyle: style },
        { client, updatedBy: "test" },
      ) as { ok: boolean };
      expect(result.ok).toBe(true);
    }
  });
});

describe("sma_set_global_note", () => {
  it("clears note with empty string", async () => {
    const client = makeClient();
    client.config.globalNote = "previous";
    const result = await setGlobalNoteTool.handler(
      { globalNote: "" },
      { client, updatedBy: "test" },
    ) as { ok: boolean; config: { globalNote: string | null } };
    expect(result.ok).toBe(true);
    expect(result.config.globalNote).toBeNull();
  });
  it("rejects > 500 chars", async () => {
    const client = makeClient();
    await expect(
      setGlobalNoteTool.handler({ globalNote: "x".repeat(501) }, { client, updatedBy: "test" }),
    ).rejects.toThrow(/zu lang/);
  });
});

describe("sma_export_raw_data", () => {
  it("returns reports + personas + config", async () => {
    const client = makeClient();
    client.reports = [makeReport(0)];
    client.personas = [makePersona("smasicht", "Sicht")];
    const result = await exportRawDataTool.handler({}, { client, updatedBy: "test" }) as {
      ok: boolean;
      reports_count: number;
      personas_count: number;
    };
    expect(result.ok).toBe(true);
    expect(result.reports_count).toBe(1);
    expect(result.personas_count).toBe(1);
  });
});
