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
import { z } from "zod";
import { ALL_TOOLS } from "./tools.js";
import { HttpDataClient, type DataClient } from "./data-client.js";
import { McpStudioMeyerError } from "./types.js";

// ─── Lightweight zod-to-jsonschema implementation ────
// We inline this rather than depending on `zod-to-json-schema` npm to keep
// our runtime dependency surface tiny (audit-friendly for an MCP package).
// Handles only the schema shapes our 14 tools use:
//   z.object({...}).strict(), z.string/.number/.int/.min/.max,
//   z.array/.max/.min, z.enum, z.optional, z.union.
// zod 4: shapes are told apart with instanceof, bounds come from the schema's
// own checks. The output stays exactly what the zod 3 version emitted (the
// tools/list contract), including its limits: a .describe() on an .optional()
// wrapper is not emitted, and strings get no length keywords.

export function zodToJsonSchema(schema: z.core.$ZodType): Record<string, unknown> {
  const desc = z.globalRegistry.get(schema)?.description;
  if (schema instanceof z.ZodObject) {
    const shape: Record<string, z.core.$ZodType> = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, innerSchema] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(innerSchema);
      // Same test as zod 3's isOptional(): does the field accept undefined?
      if (!z.safeParse(innerSchema, undefined).success) required.push(key);
    }
    return {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
      additionalProperties: false,
    };
  }
  if (schema instanceof z.ZodString) {
    return { type: "string", ...(desc ? { description: desc } : {}) };
  }
  if (schema instanceof z.ZodNumber) {
    const checks = schema.def.checks ?? [];
    const minCheck = checks.find((c) => c instanceof z.core.$ZodCheckGreaterThan);
    const maxCheck = checks.find((c) => c instanceof z.core.$ZodCheckLessThan);
    const intCheck = checks.find((c) => c instanceof z.core.$ZodCheckNumberFormat && c._zod.def.format.includes("int"));
    return {
      type: intCheck ? "integer" : "number",
      ...(minCheck ? { minimum: minCheck._zod.def.value } : {}),
      ...(maxCheck ? { maximum: maxCheck._zod.def.value } : {}),
      ...(desc ? { description: desc } : {}),
    };
  }
  if (schema instanceof z.ZodArray) {
    const checks = schema.def.checks ?? [];
    const minLength = checks.find((c) => c instanceof z.core.$ZodCheckMinLength);
    const maxLength = checks.find((c) => c instanceof z.core.$ZodCheckMaxLength);
    return {
      type: "array",
      items: zodToJsonSchema(schema.element),
      ...(minLength ? { minItems: minLength._zod.def.minimum } : {}),
      ...(maxLength ? { maxItems: maxLength._zod.def.maximum } : {}),
      ...(desc ? { description: desc } : {}),
    };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options, ...(desc ? { description: desc } : {}) };
  }
  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodUnion) {
    return { anyOf: schema.options.map(zodToJsonSchema) };
  }
  // Fallback: describes loosely
  return { ...(desc ? { description: desc } : {}) };
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
      // run() parses with the tool's inputSchema first, so invalid input still
      // throws a ZodError here and never reaches the handler.
      const result = await tool.run(request.params.arguments ?? {}, {
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
