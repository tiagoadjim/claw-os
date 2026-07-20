import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  apiKey: 'comp_secret_key',
  settings: new Map<string, unknown>(),
  openclawConfig: {} as Record<string, unknown>,
  writes: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../electron/services/providers/store-instance', () => ({
  getClawXProviderStore: vi.fn(async () => ({
    get: vi.fn(() => state.apiKey),
    set: vi.fn((_key: string, value: string) => { state.apiKey = value; }),
    delete: vi.fn(() => { state.apiKey = ''; }),
  })),
}));

vi.mock('../../electron/utils/store', () => ({
  getSetting: vi.fn(async (key: string) => state.settings.get(key)),
  setSetting: vi.fn(async (key: string, value: unknown) => { state.settings.set(key, value); }),
}));

vi.mock('../../electron/utils/channel-config', () => ({
  readOpenClawConfig: vi.fn(async () => structuredClone(state.openclawConfig)),
  writeOpenClawConfig: vi.fn(async (config: Record<string, unknown>) => {
    state.openclawConfig = structuredClone(config);
    state.writes.push(structuredClone(config));
  }),
}));

vi.mock('../../electron/utils/config-mutex', () => ({
  withConfigLock: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import {
  COMPOSIO_GATEWAY_API_KEY_ENV,
  getComposioGatewayEnv,
  syncComposioGatewayMcpConfig,
} from '../../electron/services/composio/composio-config';

describe('Composio Gateway MCP synchronization', () => {
  beforeEach(() => {
    state.apiKey = 'comp_secret_key';
    state.settings = new Map<string, unknown>([
      ['composioEnabled', true],
      ['composioMcpUrl', 'https://mcp.composio.dev/session'],
    ]);
    state.openclawConfig = {
      mcp: {
        sessionIdleTtlMs: 1234,
        servers: { operator: { command: 'operator-mcp' } },
      },
    };
    state.writes = [];
  });

  it('adds the managed server without exposing the API key or replacing operator servers', async () => {
    await expect(syncComposioGatewayMcpConfig()).resolves.toBe(true);

    expect(state.openclawConfig).toMatchObject({
      mcp: {
        sessionIdleTtlMs: 1234,
        servers: {
          operator: { command: 'operator-mcp' },
          composio: {
            enabled: true,
            url: 'https://mcp.composio.dev/session',
            transport: 'streamable-http',
            headers: { 'X-API-Key': `\${${COMPOSIO_GATEWAY_API_KEY_ENV}}` },
          },
        },
      },
    });
    expect(JSON.stringify(state.openclawConfig)).not.toContain(state.apiKey);
    await expect(getComposioGatewayEnv()).resolves.toEqual({
      [COMPOSIO_GATEWAY_API_KEY_ENV]: state.apiKey,
    });
  });

  it('removes only the managed server when Composio is disabled', async () => {
    state.settings.set('composioEnabled', false);
    state.openclawConfig = {
      mcp: {
        servers: {
          operator: { command: 'operator-mcp' },
          composio: { url: 'https://old.example/mcp' },
        },
      },
    };

    await expect(syncComposioGatewayMcpConfig()).resolves.toBe(true);
    expect(state.openclawConfig).toEqual({
      mcp: { servers: { operator: { command: 'operator-mcp' } } },
    });
    await expect(getComposioGatewayEnv()).resolves.toEqual({});
  });

  it('does not rewrite an already synchronized registry entry', async () => {
    await syncComposioGatewayMcpConfig();
    state.writes = [];
    await expect(syncComposioGatewayMcpConfig()).resolves.toBe(false);
    expect(state.writes).toHaveLength(0);
  });
});
