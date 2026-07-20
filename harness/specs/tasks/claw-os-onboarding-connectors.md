---
id: claw-os-onboarding-connectors
title: Claw OS onboarding and Composio connectors
scenario: gateway-backend-communication
taskType: runtime-bridge
intent: Make first-run setup and third-party integrations approachable to non-technical users while keeping Main responsible for secrets and network transport.
touchedAreas:
  - AGENTS.md
  - README*.md
  - electron-builder.yml
  - index.html
  - package.json
  - pnpm-lock.yaml
  - electron/gateway/**
  - electron/main/**
  - electron/shared/**
  - electron/utils/**
  - electron/utils/store.ts
  - resources/**
  - shared/**
  - src/**
  - tests/**
  - harness/specs/tasks/claw-os-onboarding-connectors.md
  - harness/specs/scenarios/gateway-backend-communication.md
  - harness/specs/scenarios/nontechnical-onboarding-connectors.md
  - harness/specs/rules/composio-session-connectors.md
  - src/pages/Setup/index.tsx
  - src/pages/Connectors/index.tsx
  - src/components/layout/Sidebar.tsx
  - src/lib/host-api.ts
  - shared/host-api/contract.ts
  - electron/services/composio/**
  - electron/services/composio-api.ts
expectedUserBehavior:
  - A first-time user can choose English or Spanish, name the default agent, sign in with ChatGPT, and optionally configure Composio without terminal knowledge.
  - The Connectors page browses the live Composio toolkit catalog and starts hosted authentication for any supported service.
  - Connected services are available to the agent through one Main-managed Composio session registered in the OpenClaw Gateway MCP registry.
requiredProfiles:
  - fast
  - comms
  - e2e
requiredTests:
  - tests/unit/composio-client.test.ts
  - tests/unit/composio-config.test.ts
  - tests/unit/composio-gateway-config.test.ts
  - tests/unit/acp-chat-service.test.ts
  - tests/e2e/connectors.spec.ts
  - tests/e2e/language-spanish.spec.ts
acceptance:
  - Renderer never receives the raw Composio API key after it is saved.
  - Renderer uses only the typed hostApi.composio facade for Composio network operations.
  - The Composio catalog is requested dynamically rather than maintained as a hard-coded allowlist.
  - Catalog and connected-account listing exhaust cursor pagination instead of stopping at the 1,000-item page limit.
  - OAuth and API-key connector flows use Composio-hosted link sessions.
  - ACP session/new and session/load never receive a non-empty per-session MCP server list because OpenClaw bridge mode rejects it.
  - Composio is registered under OpenClaw mcp.servers with its API key supplied through the Gateway environment rather than written to openclaw.json.
  - English and Spanish are the only selectable application locales.
  - User-visible product naming is Claw OS while legacy storage identifiers remain compatible.
docs:
  required: true
---

This task intentionally keeps Composio API calls, session lifecycle, and secret handling in Electron Main. The Renderer only displays typed summaries and opens a hosted Composio authentication URL returned by Main.
