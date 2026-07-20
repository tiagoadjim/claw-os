---
id: composio-session-connectors
title: Composio Session Connector Safety
type: ai-coding-rule
appliesTo:
  - gateway-backend-communication
  - nontechnical-onboarding-connectors
requiredTests:
  - tests/unit/composio-client.test.ts
  - tests/unit/composio-config.test.ts
  - tests/unit/composio-gateway-config.test.ts
  - tests/unit/acp-chat-service.test.ts
---

Composio project API keys are Main-owned secrets. Renderer responses may expose only configuration booleans and masked key hints.

Claw OS uses one persisted Tool Router session per local Composio configuration and stores its hosted MCP URL for OpenClaw. That URL must be registered as the Gateway-owned `mcp.servers.composio` entry; ACP bridge `session/new` and `session/load` requests must not carry Composio as a per-session MCP server. The Composio API key remains in the Main-owned secret store, is injected into the Gateway environment, and is referenced from `openclaw.json` rather than persisted there in plaintext.

Catalog, connected-account, link, and disconnect operations must be performed in Electron Main using the typed Host API. The catalog is fetched from Composio, must not be represented by a hard-coded supported-service allowlist, and must exhaust cursor pagination beyond Composio's 1,000-item page limit.

Connector authentication must use Composio hosted link sessions. The app opens the returned URL in the system browser and never collects third-party OAuth credentials in the Renderer.
