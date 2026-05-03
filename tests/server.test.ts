import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMcpServer, zodToJsonSchema } from "../src/server.js";
import { InMemoryDataClient } from "../src/data-client.js";
import { McpStudioMeyerError } from "../src/types.js";

describe("zodToJsonSchema", () => {
  it("handles empty object.strict()", () => {
    const schema = z.object({}).strict();
    expect(zodToJsonSchema(schema)).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
  });

  it("handles object with optional + required string", () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    }).strict();
    const out = zodToJsonSchema(schema) as { properties: Record<string, unknown>; required?: string[] };
    expect(out.properties.required).toMatchObject({ type: "string" });
    expect(out.properties.optional).toMatchObject({ type: "string" });
    expect(out.required).toEqual(["required"]);
  });

  it("handles number with int + min + max", () => {
    const schema = z.object({
      n: z.number().int().min(1).max(50),
    });
    const out = zodToJsonSchema(schema) as { properties: { n: { type: string; minimum: number; maximum: number } } };
    expect(out.properties.n).toMatchObject({ type: "integer", minimum: 1, maximum: 50 });
  });

  it("handles array with maxItems", () => {
    const schema = z.object({
      items: z.array(z.string()).max(5),
    });
    const out = zodToJsonSchema(schema) as { properties: { items: { type: string; items: { type: string }; maxItems: number } } };
    expect(out.properties.items).toMatchObject({ type: "array", items: { type: "string" }, maxItems: 5 });
  });

  it("handles enum", () => {
    const schema = z.object({
      pick: z.enum(["a", "b", "c"]),
    });
    const out = zodToJsonSchema(schema) as { properties: { pick: { type: string; enum: string[] } } };
    expect(out.properties.pick).toMatchObject({ type: "string", enum: ["a", "b", "c"] });
  });
});

describe("createMcpServer", () => {
  it("rejects missing api key", () => {
    expect(() => createMcpServer({ apiKey: "" })).toThrow(McpStudioMeyerError);
  });

  it("rejects too-short api key", () => {
    expect(() => createMcpServer({ apiKey: "abc" })).toThrow(McpStudioMeyerError);
  });

  it("creates server with valid api key + custom dataClient", () => {
    const client = new InMemoryDataClient("test-customer");
    const server = createMcpServer({ apiKey: "valid-test-key-12345", dataClient: client });
    expect(server).toBeDefined();
  });
});
