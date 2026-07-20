import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  apiKey: 'comp_test_key',
  enabled: false,
  mcpUrl: '',
  settings: new Map<string, unknown>(),
}));

vi.mock('../../electron/utils/store', () => ({
  getSetting: vi.fn(async (key: string) => state.settings.get(key) ?? ''),
  setSetting: vi.fn(async (key: string, value: unknown) => { state.settings.set(key, value); }),
}));

vi.mock('../../electron/services/composio/composio-config', () => ({
  getComposioConfig: vi.fn(async () => ({
    enabled: state.enabled,
    mcpUrl: state.mcpUrl,
    apiKey: state.apiKey,
  })),
  setComposioConfig: vi.fn(async (patch: { apiKey?: string; enabled?: boolean; mcpUrl?: string }) => {
    if (patch.apiKey !== undefined) state.apiKey = patch.apiKey;
    if (patch.enabled !== undefined) state.enabled = patch.enabled;
    if (patch.mcpUrl !== undefined) state.mcpUrl = patch.mcpUrl;
  }),
  syncComposioGatewayMcpConfig: vi.fn(async () => true),
}));

import {
  createComposioConnectionLink,
  disconnectComposioAccount,
  initializeComposioSession,
  listComposioConnections,
  listComposioToolkits,
  resetComposioSession,
} from '../../electron/services/composio/composio-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Composio Main client', () => {
  beforeEach(() => {
    state.apiKey = 'comp_test_key';
    state.enabled = false;
    state.mcpUrl = '';
    state.settings.clear();
    vi.restoreAllMocks();
  });

  it('creates one Tool Router session and persists its MCP endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      session_id: 'trs_claw_os',
      mcp: { type: 'http', url: 'https://app.composio.dev/tool_router/v3/trs_claw_os/mcp' },
    }, 201));

    await initializeComposioSession('  comp_new_key  ');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://backend.composio.dev/api/v3.1/tool_router/session');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' });
    expect(state.apiKey).toBe('comp_new_key');
    expect(state.settings.get('composioSessionId')).toBe('trs_claw_os');
    expect(state.settings.get('composioUserId')).toMatch(/^claw-os-/);
    expect(state.enabled).toBe(true);
    expect(state.mcpUrl).toContain('/trs_claw_os/mcp');
  });

  it('normalizes and exhausts the paginated live toolkit catalog instead of using a local allowlist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        items: [{
          slug: 'notion',
          name: 'Notion',
          auth_schemes: ['oauth2'],
          no_auth: false,
          meta: {
            description: 'Workspace tools',
            logo: 'https://assets.composio.dev/logos/notion.png',
            tools_count: 42,
            triggers_count: 3,
            categories: [{ id: 'productivity', name: 'Productivity' }],
          },
        }],
        total_items: 1001,
        next_cursor: 'next-page',
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [{ slug: 'linear', name: 'Linear', meta: {} }],
        total_items: 1001,
        next_cursor: null,
      }));

    const result = await listComposioToolkits();

    expect(result.totalItems).toBe(1001);
    expect(result.nextCursor).toBeNull();
    expect(result.items).toEqual([expect.objectContaining({
      slug: 'notion',
      name: 'Notion',
      toolsCount: 42,
      categories: [{ id: 'productivity', name: 'Productivity' }],
    }), expect.objectContaining({ slug: 'linear', name: 'Linear' })]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v3.1/toolkits?');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('cursor=next-page');
  });

  it('uses the session link endpoint for hosted connector authentication', async () => {
    state.settings.set('composioSessionId', 'trs_claw_os');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      redirect_url: 'https://app.composio.dev/link/lt_123',
      connected_account_id: 'ca_123',
    }, 201));

    const result = await createComposioConnectionLink('GitHub');

    expect(result).toEqual({
      redirectUrl: 'https://app.composio.dev/link/lt_123',
      connectedAccountId: 'ca_123',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/tool_router/session/trs_claw_os/link');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ toolkit: 'github' }));
  });

  it('lists only connections for the local Composio user and verifies ownership before delete', async () => {
    state.settings.set('composioUserId', 'claw-os-local-user');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({
        items: [{ id: 'ca_owned', toolkit: { slug: 'gmail' }, status: 'ACTIVE' }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [{ id: 'ca_owned', toolkit: { slug: 'gmail' }, status: 'ACTIVE' }],
      }))
      .mockResolvedValueOnce(jsonResponse({}, 200));

    expect(await listComposioConnections()).toEqual([expect.objectContaining({ id: 'ca_owned', toolkitSlug: 'gmail' })]);
    await disconnectComposioAccount('ca_owned');

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('user_ids=claw-os-local-user');
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain('/api/v3.1/connected_accounts/ca_owned');
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('DELETE');
  });

  it('removes the remote session and clears local Composio configuration', async () => {
    state.enabled = true;
    state.mcpUrl = 'https://app.composio.dev/tool_router/v3/trs_reset/mcp';
    state.settings.set('composioSessionId', 'trs_reset');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 200));

    await resetComposioSession();

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/v3.1/tool_router/session/trs_reset');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
    expect(state.settings.get('composioSessionId')).toBe('');
    expect(state.apiKey).toBe('');
    expect(state.enabled).toBe(false);
    expect(state.mcpUrl).toBe('');
  });
});
