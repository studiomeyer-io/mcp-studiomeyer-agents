# Changelog

All notable changes to `mcp-studiomeyer-agents` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Changed
- `zod` 3 to 4 (runtime dependency, now `^4.6.5`) and `vitest` 4 to 5 (dev).
  The tool schemas in `tools/list` are byte-identical to 0.1.0: the
  zod-to-JSON-Schema converter reads zod 4's own classes and checks instead
  of zod 3 internals. A plain bump would not have been enough, it emitted
  `inputSchema: {}` for all 14 tools.
- Invalid tool input is still rejected before any backend call, but the
  error text now comes in zod 4's wording, e.g. `Too big: expected number to
  be <=50` instead of `Number must be less than or equal to 50`. Clients that
  match on the old wording need an update.

## [0.1.0] - 2026-05-04

Initial release. Built in Session 985 of StudioMeyer's nex-hq alongside the
StudioMeyer Agents product launch.

### Added
- 14 MCP tools — 8 read-only Phase 2 (data + persona-replay) + 6 Phase 3 (self-service config).
- Stdio transport via `@modelcontextprotocol/sdk@1.18`.
- HTTP backend (`HttpDataClient`) talks to `https://studiomeyer.io/sma-bridge/*` with `Authorization: Bearer <SMA_API_KEY>`.
- In-memory backend (`InMemoryDataClient`) for tests and dry runs.
- Client-side validation mirrors host-side `validateCustomerConfig` for fast failure.
- CLI subcommands: default (start server), `version`, `tools`, `help`.
- MIT-licensed, audit-friendly minimal dependency set (`@modelcontextprotocol/sdk`, `zod` only).
- TypeScript strict mode with declarations.

### Notes
- Compatible with Claude Desktop, Claude Code, Cursor, Codex, Goose, and any MCP-aware client supporting stdio.
- Spec compatibility: 2025-06-18 default; backward-compatible to 2024-11-05; forward-compatible to 2025-11-25.
- All Phase 3 set tools are quota-enforced (e.g. max 5 focus topics, max 10 competitors).
- DSGVO Art. 20 covered via `sma_export_raw_data`; Art. 17 via host-side cancellation flow (not exposed in this MCP).
