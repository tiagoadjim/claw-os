/**
 * Composio integration config (Main process).
 *
 * Composio is wired into OpenClaw through a Tool Router MCP session. The user
 * provides a Composio project key; Electron Main creates the session, stores
 * its MCP URL, and registers it in OpenClaw's Gateway-owned `mcp.servers`.
 *
 * The API key is a secret, so it lives in the Main-owned provider store and is
 * never returned to the renderer in raw form (only masked / a boolean).
 */
import { getClawXProviderStore } from '../providers/store-instance';
import { getSetting, setSetting } from '../../utils/store';
import { readOpenClawConfig, writeOpenClawConfig } from '../../utils/channel-config';
import { withConfigLock } from '../../utils/config-mutex';

const COMPOSIO_API_KEY_STORE_KEY = 'composioApiKey';
const COMPOSIO_MCP_SERVER_NAME = 'composio';
export const COMPOSIO_GATEWAY_API_KEY_ENV = 'CLAW_OS_COMPOSIO_API_KEY';

export interface ComposioGatewayMcpServer {
  enabled: true;
  url: string;
  transport: 'streamable-http';
  headers: Record<string, string>;
}

export interface ComposioConfig {
  enabled: boolean;
  mcpUrl: string;
  apiKey: string;
}

export interface ComposioConfigView {
  enabled: boolean;
  mcpUrl: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  sessionReady: boolean;
}

export interface ComposioConfigPatch {
  enabled?: boolean;
  mcpUrl?: string;
  apiKey?: string;
}

async function readApiKey(): Promise<string> {
  const store = await getClawXProviderStore();
  const value = store.get(COMPOSIO_API_KEY_STORE_KEY);
  return typeof value === 'string' ? value : '';
}

async function writeApiKey(apiKey: string): Promise<void> {
  const store = await getClawXProviderStore();
  if (apiKey) {
    store.set(COMPOSIO_API_KEY_STORE_KEY, apiKey);
  } else {
    store.delete(COMPOSIO_API_KEY_STORE_KEY);
  }
}

function maskApiKey(apiKey: string): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 8) return '••••';
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}

export async function getComposioConfig(): Promise<ComposioConfig> {
  const [enabled, mcpUrl, apiKey] = await Promise.all([
    getSetting('composioEnabled'),
    getSetting('composioMcpUrl'),
    readApiKey(),
  ]);
  return {
    enabled: Boolean(enabled),
    mcpUrl: (mcpUrl ?? '').trim(),
    apiKey,
  };
}

export async function getComposioConfigView(): Promise<ComposioConfigView> {
  const [config, sessionId] = await Promise.all([
    getComposioConfig(),
    getSetting('composioSessionId'),
  ]);
  return {
    enabled: config.enabled,
    mcpUrl: config.mcpUrl,
    hasApiKey: config.apiKey.length > 0,
    apiKeyMasked: maskApiKey(config.apiKey),
    sessionReady: Boolean(sessionId && config.mcpUrl),
  };
}

export async function setComposioConfig(patch: ComposioConfigPatch): Promise<void> {
  if (typeof patch.enabled === 'boolean') {
    await setSetting('composioEnabled', patch.enabled);
  }
  if (typeof patch.mcpUrl === 'string') {
    await setSetting('composioMcpUrl', patch.mcpUrl.trim());
  }
  if (typeof patch.apiKey === 'string') {
    await writeApiKey(patch.apiKey.trim());
  }
}

/**
 * Pure builder for the Gateway-owned OpenClaw MCP registry entry. The API key
 * is referenced through the Gateway environment so it never lands in
 * openclaw.json as plaintext.
 */
export function buildComposioGatewayMcpServer(config: ComposioConfig): ComposioGatewayMcpServer | null {
  if (!config.enabled) return null;
  const url = config.mcpUrl.trim();
  const apiKey = config.apiKey.trim();
  if (!url || !apiKey) return null;
  if (!/^https:\/\//i.test(url)) return null;
  return {
    enabled: true,
    url,
    transport: 'streamable-http',
    headers: { 'X-API-Key': `\${${COMPOSIO_GATEWAY_API_KEY_ENV}}` },
  };
}

/** Secret environment injected only into the OpenClaw Gateway process. */
export async function getComposioGatewayEnv(): Promise<Record<string, string>> {
  const config = await getComposioConfig();
  return buildComposioGatewayMcpServer(config)
    ? { [COMPOSIO_GATEWAY_API_KEY_ENV]: config.apiKey.trim() }
    : {};
}

/**
 * Reconcile Claw OS' managed Composio entry without disturbing operator-owned
 * MCP servers. Returns true only when openclaw.json changed.
 */
export async function syncComposioGatewayMcpConfig(): Promise<boolean> {
  const desired = buildComposioGatewayMcpServer(await getComposioConfig());
  return withConfigLock(async () => {
    const config = await readOpenClawConfig();
    const existingMcp = config.mcp && typeof config.mcp === 'object' && !Array.isArray(config.mcp)
      ? config.mcp as Record<string, unknown>
      : {};
    const existingServers = existingMcp.servers
      && typeof existingMcp.servers === 'object'
      && !Array.isArray(existingMcp.servers)
      ? existingMcp.servers as Record<string, unknown>
      : {};
    const current = existingServers[COMPOSIO_MCP_SERVER_NAME];

    if (desired && JSON.stringify(current) === JSON.stringify(desired)) return false;
    if (!desired && current === undefined) return false;

    const nextServers = { ...existingServers };
    if (desired) nextServers[COMPOSIO_MCP_SERVER_NAME] = desired;
    else delete nextServers[COMPOSIO_MCP_SERVER_NAME];

    if (Object.keys(nextServers).length > 0) {
      config.mcp = { ...existingMcp, servers: nextServers };
    } else {
      const { servers: _servers, ...mcpWithoutServers } = existingMcp;
      if (Object.keys(mcpWithoutServers).length > 0) config.mcp = mcpWithoutServers;
      else delete config.mcp;
    }
    await writeOpenClawConfig(config);
    return true;
  });
}
