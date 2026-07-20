---
id: nontechnical-onboarding-connectors
title: Non-technical onboarding and connectors
type: product-experience
ownedPaths:
  - src/pages/Setup/**
  - src/pages/Connectors/**
  - src/components/layout/Sidebar.tsx
  - shared/i18n/**
requiredProfiles:
  - fast
  - e2e
requiredRules:
  - composio-session-connectors
  - renderer-main-boundary
  - docs-sync
---

The first-run experience explains outcomes rather than runtime internals. Advanced settings remain available after setup, but the happy path is language, agent identity, model access, connectors, capabilities, and readiness.

The Connectors catalog is live and searchable. It must not encode a finite list of supported SaaS products in the Renderer because Composio adds and updates toolkits independently of Claw OS releases.
