# mcp-studiomeyer-agents

**MCP Server fuer StudioMeyer Agents Customers** — bring your AI-Audit Fleet data into your own Claude, ChatGPT, Cursor, or Codex.

You're a [StudioMeyer Agents](https://studiomeyer.io/services/agents) customer. We run 10 KI-Agents for you (Sichtbarkeit, Traffic, Konkurrenz, Technik, KI-Sichtbarkeit, Brand-Mention, Citation-Source, Branchen-Trend, Innovations, Master-Synthesizer). They work for you in 14-day cycles and deliver a clean PDF report.

This MCP server lets your **own AI** chat with that data. Ask your Claude or ChatGPT:

- *"Was sagt mein Sichtbarkeits-Agent diese Woche?"*
- *"Vergleich meinen letzten Bericht mit dem vorherigen — was ist anders?"*
- *"Welche Konkurrenten beobachtet ihr fuer mich gerade?"*
- *"Lade alle 9 Agent-Personas und mach mir eine Strategie-Sitzung."*

Plus: configure your agents from your AI without leaving the chat.

- *"Setz ein Fokus-Thema 'EU AI Act' fuer die naechsten Berichte."*
- *"Schliess die Konkurrenten X und Y aus."*
- *"Stell den Bericht-Stil auf 'kompakt'."*

## Install

```bash
# Claude Desktop / Claude Code
claude mcp add sma -s user --env SMA_API_KEY=<your-api-key> -- npx -y mcp-studiomeyer-agents

# Cursor / Codex / Goose: see your tool's MCP config docs.
# Generic stdio config:
{
  "command": "npx",
  "args": ["-y", "mcp-studiomeyer-agents"],
  "env": { "SMA_API_KEY": "<your-key>" }
}
```

Get your API key at [studiomeyer.io/dashboard/agents/keys](https://studiomeyer.io/dashboard/agents/keys) (Customer-Dashboard, Pro+ Customers can generate multiple keys for different tools).

## Tools

### Read-only (Phase 2)

| Tool | What |
|---|---|
| `sma_get_latest_report` | Most recent 14-day report (Markdown + structured JSON). |
| `sma_list_reports` | Last N reports (default 10, max 50). |
| `sma_search_findings` | Full-text search across all 10 agent finding tables. |
| `sma_load_agent_persona` | Load one agent persona (system prompt + last 30 findings) — for AI-driven strategy chat. |
| `sma_list_agent_personas` | All 9 worker personas in one call. |
| `sma_compare_periods` | Compare two reports for diffing. |
| `sma_export_raw_data` | DSGVO Art. 20 data portability — your full data dump. |
| `sma_get_config` | Show your current self-service config. |

### Self-Service Config (Phase 3)

| Tool | What |
|---|---|
| `sma_set_focus_topics` | Up to 5 extra topics agents focus on. |
| `sma_set_keyword_priorities` | Up to 10 high-priority keywords. |
| `sma_set_competitor_watch` | Add / exclude competitors (max 10 each). |
| `sma_set_report_style` | formal / locker / kompakt / ausfuehrlich. |
| `sma_set_alert_threshold` | very-low / low / normal / high (Pro tier). |
| `sma_set_global_note` | Free-form note (max 500 chars) all agents see. |

All set tools are validated client-side AND server-side. Quotas and length limits are documented in tool descriptions and enforced both at MCP-call time and at the host DB layer.

## Examples

### Strategy session with multiple agent personas

```
You: Lade die Personas vom KI-Sichtbarkeits-Agent und vom Konkurrenz-Agent. Wir machen jetzt zusammen Strategie fuer mein Q3 — wo bin ich schwach in KI, wer macht es besser, was sollte ich tun?

Claude: [calls sma_load_agent_persona kivisibility]
Claude: [calls sma_load_agent_persona smakonk]
Claude: Basierend auf deinen Personas — der KI-Sichtbarkeits-Agent zeigt MEDIUM auf Perplexity und MISSING auf Grok. Konkurrent X ist auf beiden in Top-3. Drei konkrete Massnahmen ...
```

### Configure your agents

```
You: Setz mir bitte folgende Fokus-Themen fuer die naechsten Berichte: 'EU AI Act 2026', 'GenAI Adoption KMU', 'Wikidata Knowledge Graph'.

Claude: [calls sma_set_focus_topics with focusTopics: [...]]
Claude: Erledigt. Deine 3 Fokus-Themen sind aktiv. Ab dem naechsten Cron-Lauf (in ca. 24h) bekommen alle 10 Agents diese Themen als Pflicht-Beobachtung mit.
```

### Compare two reports

```
You: Vergleich meinen letzten Bericht mit dem davor — was hat sich bei meiner KI-Sichtbarkeit geaendert?

Claude: [calls sma_compare_periods]
Claude: Aenderungen: ChatGPT-Sichtbarkeit von MEDIUM auf STRONG (gut!), Brand-Mentions auf Reddit +3 (alle positiv), Konkurrent Y hat eine neue Pricing-Page (relevant fuer Section 4) ...
```

## Architecture

This package talks to `https://studiomeyer.io/sma-bridge/*` over HTTPS with `Authorization: Bearer <SMA_API_KEY>`. The bridge is multi-tenant — your key only sees your data, never another customer's.

- **No direct DB access** — the package is published as a stand-alone npm package, no SQL credentials in your environment.
- **No personal data leakage** — all server-side queries are scoped to the customer slug bound to your API key.
- **Audit trail** — Phase-3 set tools write an audit row server-side with your `updated_by` tag (default `mcp-customer`).
- **DSGVO Art. 20 / Art. 17** — `sma_export_raw_data` returns your full dataset; cancellation deletes everything within 30 days.

## Hosting

The host is operated by StudioMeyer (Mallorca + Hamburg) on Hetzner Frankfurt and Supabase EU. EU-only data residency.

## License

MIT — but the **service** behind the data is paid (Standard EUR 99 / Pro EUR 199 monthly, see [studiomeyer.io/services/agents](https://studiomeyer.io/services/agents)). This MCP package is the open client; the data lives behind your customer API key.

---

Built with care by [Matthias Meyer (StudioMeyer)](https://studiomeyer.io). Questions: matthias@studiomeyer.io.
