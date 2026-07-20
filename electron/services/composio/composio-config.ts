/**
 * Composio integration config (Main process).
 *
 * Composio is wired into OpenClaw as an MCP server: the user pastes their
 * Composio API key and the MCP URL generated for their account, and we expose
 * that server to OpenClaw agents (via the ACP session `mcpServers`) so they can
 * use Composio's third-party app integrations (Gmail, Slack, GitHub, …) as
 * tools.
 *
 * The API key is a secret, so it lives in the Main-owned provider store and is
 * never returned to the renderer in raw form (only masked / a boolean).
 */
import type { McpServer } from '@agentclientprotocol/sdk';
import { getClawXProviderStore } from '../providers/store-instance';
import { getSetting, setSetting } from '../../utils/store';

const COMPOSIO_API_KEY_STORE_KEY = 'composioApiKey';
const COMPOSIO_MCP_SERVER_NAME = 'composio';

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
  const config = await getComposioConfig();
  return {
    enabled: config.enabled,
    mcpUrl: config.mcpUrl,
    hasApiKey: config.apiKey.length > 0,
    apiKeyMasked: maskApiKey(config.apiKey),
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
 * Pure builder: the ACP MCP servers Composio contributes for a given config.
 * Returns an empty list unless Composio is enabled and both an https MCP URL
 * and an API key are present.
 */
export function buildComposioMcpServers(config: ComposioConfig): McpServer[] {
  if (!config.enabled) return [];
  const url = config.mcpUrl.trim();
  const apiKey = config.apiKey.trim();
  if (!url || !apiKey) return [];
  if (!/^https?:\/\//i.test(url)) return [];
  return [
    {
      type: 'http',
      name: COMPOSIO_MCP_SERVER_NAME,
      url,
      headers: [{ name: 'X-API-Key', value: apiKey }],
    },
  ];
}

/** Resolve the Composio MCP servers from persisted config (best-effort). */
export async function getComposioMcpServers(): Promise<McpServer[]> {
  try {
    return buildComposioMcpServers(await getComposioConfig());
  } catch {
    return [];
  }
}
