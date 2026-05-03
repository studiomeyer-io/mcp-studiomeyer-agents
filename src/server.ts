/**
 * MCP Server entry point — wires the 14 tools into the official
 * @modelcontextprotocol/sdk Server with stdio transport.
 *
 * Auth: SMA_API_KEY env var (per-customer key generated on the host
 * Customer-Dashboard at studiomeyer.io/dashboard/agents/keys).
 *
 * Default base URL: https://studiomeyer.io (override via SMA_API_BASE).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { ALL_TOOLS } from "./tools.js";
import { HttpDataClient, type DataClient } from "./data-client.js";
import { McpStudioMeyerError } from "./types.js";

// ─── Lightweight zod-to-jsonschema implementation ────
// We inline this rather than depending on `zod-to-json-schema` npm to keep
// our runtime dependency surface tiny (audit-friendly for an MCP package).
// Handles only the schema shapes our 14 tools use:
//   z.object({...}).strict(), z.string/.number/.int/.min/.max,
//   z.array/.max/.min, z.enum, z.optional, z.union.

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { typeName?: string; [k: string]: unknown };
  switch (def.typeName) {
    case "ZodObject": {
      const shape = (def as { shape: () => Record<string, z.ZodTypeAny> }).shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, innerSchema] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(innerSchema);
        if (!innerSchema.isOptional()) required.push(key);
      }
      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      };
    }
    case "ZodString": {
      const desc = (def as { description?: string }).description;
      return { type: "string", ...(desc ? { description: desc } : {}) };
    }
    case "ZodNumber": {
      const checks = (def as { checks?: Array<{ kind: string; value: number }> }).checks ?? [];
      const minCheck = checks.find((c) => c.kind === "min");
      const maxCheck = checks.find((c) => c.kind === "max");
      const intCheck = checks.find((c) => c.kind === "int");
      const desc = (def as { description?: string }).description;
      return {
        type: intCheck ? "integer" : "number",
        ...(minCheck ? { minimum: minCheck.value } : {}),
        ...(maxCheck ? { maximum: maxCheck.value } : {}),
        ...(desc ? { description: desc } : {}),
      };
    }
    case "ZodArray": {
      const inner = (def as { type: z.ZodTypeAny }).type;
      const checks = (def as { exactLength?: { value: number }; minLength?: { value: number }; maxLength?: { value: number } });
      const desc = (def as { description?: string }).description;
      return {
        type: "array",
        items: zodToJsonSchema(inner),
        ...(checks.minLength ? { minItems: checks.minLength.value } : {}),
        ...(checks.maxLength ? { maxItems: checks.maxLength.value } : {}),
        ...(desc ? { description: desc } : {}),
      };
    }
    case "ZodEnum": {
      const values = (def as { values: string[] }).values;
      const desc = (def as { description?: string }).description;
      return { type: "string", enum: values, ...(desc ? { description: desc } : {}) };
    }
    case "ZodOptional": {
      const inner = (def as { innerType: z.ZodTypeAny }).innerType;
      return zodToJsonSchema(inner);
    }
    case "ZodUnion": {
      const options = (def as { options: z.ZodTypeAny[] }).options;
      return { anyOf: options.map(zodToJsonSchema) };
    }
    default: {
      // Fallback — describes loosely
      const desc = (def as { description?: string }).description;
      return { ...(desc ? { description: desc } : {}) };
    }
  }
}

export interface ServerOptions {
  /** API key for the host /sma-bridge endpoints. Required. */
  apiKey: string;
  /** Base URL of the StudioMeyer host. Defaults to https://studiomeyer.io */
  baseUrl?: string;
  /** Override the data client (for tests or custom backends). */
  dataClient?: DataClient;
  /** Updated-by tag for audit on Phase-3 set_* tools. Defaults to "mcp-customer". */
  updatedBy?: string;
}

export function createMcpServer(opts: ServerOptions) {
  if (!opts.apiKey || opts.apiKey.length < 8) {
    throw new McpStudioMeyerError("SMA_API_KEY missing or too short", "auth-failed");
  }

  const dataClient: DataClient =
    opts.dataClient ?? new HttpDataClient({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl ?? "https://studiomeyer.io",
    });

  const server = new Server(
    {
      name: "mcp-studiomeyer-agents",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: ALL_TOOLS.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: zodToJsonSchema(tool.inputSchema),
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
          idempotentHint: tool.readOnly,
          openWorldHint: true,
          title: tool.title,
        },
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = ALL_TOOLS.find((t) => t.name === request.params.name);
    if (!tool) {
      return {
        content: [{ type: "text" as const, text: `Unknown tool: ${request.params.name}` }],
        isError: true,
      };
    }
    try {
      const parsed = tool.inputSchema.parse(request.params.arguments ?? {});
      const result = await tool.handler(parsed, {
        client: dataClient,
        updatedBy: opts.updatedBy ?? "mcp-customer",
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof McpStudioMeyerError ? err.code : "internal-error";
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: msg, code }, null, 2) }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startStdioServer(opts: ServerOptions): Promise<void> {
  const server = createMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // No console output — stdio is the protocol channel.
}
