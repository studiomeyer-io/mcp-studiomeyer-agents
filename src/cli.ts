#!/usr/bin/env node
/**
 * CLI entry — invoked as `mcp-studiomeyer-agents` (via package.json bin).
 *
 * Subcommands:
 *   (default)   — start stdio server (used by Claude Desktop, Claude Code, Cursor)
 *   version     — print version + spec info
 *   tools       — list tools without starting the server (debugging)
 */

import { ALL_TOOLS } from "./tools.js";
import { startStdioServer } from "./server.js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  try {
    const pkgPath = resolve(__dirname, "../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = readPackageVersion();

function printVersion(): void {
  process.stdout.write(`mcp-studiomeyer-agents v${VERSION}\n`);
  process.stdout.write(`MCP spec: 2025-06-18 (compatible with 2024-11-05 + 2025-11-25)\n`);
  process.stdout.write(`Tools: ${ALL_TOOLS.length} (${ALL_TOOLS.filter((t) => t.readOnly).length} read + ${ALL_TOOLS.filter((t) => !t.readOnly).length} write)\n`);
}

function printTools(): void {
  process.stdout.write(`Tools (${ALL_TOOLS.length}):\n\n`);
  for (const tool of ALL_TOOLS) {
    const tag = tool.readOnly ? "[read]" : "[write]";
    process.stdout.write(`  ${tag} ${tool.name}\n    ${tool.title}\n    ${tool.description.slice(0, 200)}${tool.description.length > 200 ? "..." : ""}\n\n`);
  }
}

const cmd = process.argv[2];

if (cmd === "version" || cmd === "--version" || cmd === "-v") {
  printVersion();
  process.exit(0);
}

if (cmd === "tools" || cmd === "--tools") {
  printTools();
  process.exit(0);
}

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  process.stdout.write(`mcp-studiomeyer-agents v${VERSION}

Usage:
  mcp-studiomeyer-agents              Start stdio server (default — used by Claude Desktop, Claude Code, Cursor)
  mcp-studiomeyer-agents version      Print version + spec info
  mcp-studiomeyer-agents tools        List all tools without starting the server
  mcp-studiomeyer-agents help         Show this help

Environment:
  SMA_API_KEY    (required)  Per-customer API key from studiomeyer.io/dashboard/agents/keys
  SMA_API_BASE   (optional)  Override host base URL (default https://studiomeyer.io)

Install for Claude Desktop:
  claude mcp add sma -s user --env SMA_API_KEY=<your-key> -- npx -y mcp-studiomeyer-agents

Docs: https://studiomeyer.io/services/agents
`);
  process.exit(0);
}

// Default: start stdio server
const apiKey = process.env.SMA_API_KEY;
if (!apiKey) {
  process.stderr.write("Error: SMA_API_KEY env var missing.\n");
  process.stderr.write("Get one at https://studiomeyer.io/dashboard/agents/keys\n");
  process.exit(2);
}

const baseUrl = process.env.SMA_API_BASE;

startStdioServer({
  apiKey,
  baseUrl,
}).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Failed to start MCP server: ${msg}\n`);
  process.exit(1);
});
