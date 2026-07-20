import { randomUUID } from 'node:crypto';
import type {
  ComposioConnection,
  ComposioToolkit,
  ComposioToolkitListResult,
} from '@shared/host-api/contract';
import { getSetting, setSetting } from '../../utils/store';
import {
  getComposioConfig,
  setComposioConfig,
  syncComposioGatewayMcpConfig,
} from './composio-config';

const COMPOSIO_API_ORIGIN = 'https://backend.composio.dev';
const API_V31 = `${COMPOSIO_API_ORIGIN}/api/v3.1`;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function composioRequest<T>(apiKey: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const errorRecord = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const message = errorRecord ? asString(errorRecord.message) : '';
    throw new Error(message || `Composio request failed (${response.status})`);
  }
  return payload as T;
}

async function requireApiKey(): Promise<string> {
  const apiKey = (await getComposioConfig()).apiKey.trim();
  if (!apiKey) throw new Error('Connect Composio before browsing connectors.');
  return apiKey;
}

async function getOrCreateUserId(): Promise<string> {
  const current = (await getSetting('composioUserId')).trim();
  if (current) return current;
  const userId = `claw-os-${randomUUID()}`;
  await setSetting('composioUserId', userId);
  return userId;
}

export async function initializeComposioSession(apiKeyInput?: string): Promise<void> {
  const suppliedKey = apiKeyInput?.trim();
  if (suppliedKey) await setComposioConfig({ apiKey: suppliedKey });
  const apiKey = await requireApiKey();
  const userId = await getOrCreateUserId();

  const payload = await composioRequest<JsonRecord>(apiKey, `${API_V31}/tool_router/session`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      manage_connections: {
        enable: true,
        enable_wait_for_connections: false,
        enable_connection_removal: true,
      },
    }),
  });
  const sessionId = asString(payload.session_id);
  const mcp = isRecord(payload.mcp) ? payload.mcp : null;
  const mcpUrl = mcp ? asString(mcp.url) : '';
  if (!sessionId || !mcpUrl) throw new Error('Composio did not return a usable MCP session.');

  await Promise.all([
    setSetting('composioSessionId', sessionId),
    setComposioConfig({ enabled: true, mcpUrl }),
  ]);
  await syncComposioGatewayMcpConfig();
}

export async function resetComposioSession(): Promise<void> {
  const [config, sessionId] = await Promise.all([
    getComposioConfig(),
    getSetting('composioSessionId'),
  ]);

  if (config.apiKey && sessionId) {
    await composioRequest<unknown>(
      config.apiKey,
      `${API_V31}/tool_router/session/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' },
    ).catch(() => undefined);
  }

  await Promise.all([
    setSetting('composioSessionId', ''),
    setComposioConfig({ enabled: false, mcpUrl: '', apiKey: '' }),
  ]);
  await syncComposioGatewayMcpConfig();
}

async function requireSession(): Promise<{ apiKey: string; sessionId: string }> {
  const apiKey = await requireApiKey();
  let sessionId = (await getSetting('composioSessionId')).trim();
  if (!sessionId) {
    await initializeComposioSession();
    sessionId = (await getSetting('composioSessionId')).trim();
  }
  if (!sessionId) throw new Error('Composio session is unavailable.');
  return { apiKey, sessionId };
}

function normalizeToolkit(value: unknown): ComposioToolkit | null {
  if (!isRecord(value)) return null;
  const slug = asString(value.slug);
  if (!slug) return null;
  const meta = isRecord(value.meta) ? value.meta : {};
  const categories = Array.isArray(meta.categories)
    ? meta.categories.flatMap((category) => {
      if (!isRecord(category)) return [];
      const id = asString(category.id);
      const name = asString(category.name);
      return id || name ? [{ id: id || name, name: name || id }] : [];
    })
    : [];
  return {
    slug,
    name: asString(value.name) || slug,
    description: asString(meta.description),
    logo: asString(meta.logo) || null,
    categories,
    toolsCount: asNumber(meta.tools_count),
    triggersCount: asNumber(meta.triggers_count),
    authSchemes: Array.isArray(value.auth_schemes)
      ? value.auth_schemes.filter((item): item is string => typeof item === 'string')
      : [],
    noAuth: value.no_auth === true,
  };
}

export async function listComposioToolkits(input?: { search?: string; cursor?: string }): Promise<ComposioToolkitListResult> {
  const apiKey = await requireApiKey();
  const items: ComposioToolkit[] = [];
  const seenCursors = new Set<string>();
  let cursor = input?.cursor?.trim() || '';
  let totalItems = 0;

  while (true) {
    const query = new URLSearchParams({ limit: '1000', sort_by: input?.search ? 'alphabetically' : 'usage' });
    if (input?.search?.trim()) query.set('search', input.search.trim());
    if (cursor) query.set('cursor', cursor);
    const payload = await composioRequest<JsonRecord>(apiKey, `${API_V31}/toolkits?${query.toString()}`);
    if (Array.isArray(payload.items)) {
      items.push(...payload.items.flatMap((item) => normalizeToolkit(item) ?? []));
    }
    totalItems = Math.max(totalItems, asNumber(payload.total_items), items.length);

    const nextCursor = asString(payload.next_cursor);
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return {
    items,
    nextCursor: null,
    totalItems,
  };
}

function normalizeConnection(value: unknown): ComposioConnection | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id) || asString(value.nanoid);
  const toolkit = isRecord(value.toolkit) ? value.toolkit : null;
  const toolkitSlug = toolkit ? asString(toolkit.slug) : asString(value.toolkit_slug);
  if (!id || !toolkitSlug) return null;
  return {
    id,
    toolkitSlug,
    status: asString(value.status) || 'UNKNOWN',
    createdAt: asString(value.created_at) || null,
    updatedAt: asString(value.updated_at) || null,
  };
}

export async function listComposioConnections(): Promise<ComposioConnection[]> {
  const apiKey = await requireApiKey();
  const userId = await getOrCreateUserId();
  const connections: ComposioConnection[] = [];
  const seenCursors = new Set<string>();
  let cursor = '';

  while (true) {
    const query = new URLSearchParams({ user_ids: userId, limit: '1000', account_type: 'ALL' });
    if (cursor) query.set('cursor', cursor);
    const payload = await composioRequest<JsonRecord>(apiKey, `${API_V31}/connected_accounts?${query.toString()}`);
    if (Array.isArray(payload.items)) {
      connections.push(...payload.items.flatMap((item) => normalizeConnection(item) ?? []));
    }

    const nextCursor = asString(payload.next_cursor);
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return connections;
}

export async function createComposioConnectionLink(toolkitSlug: string): Promise<{
  redirectUrl: string;
  connectedAccountId: string | null;
}> {
  const slug = toolkitSlug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) throw new Error('Invalid Composio toolkit.');
  const { apiKey, sessionId } = await requireSession();
  const payload = await composioRequest<JsonRecord>(
    apiKey,
    `${API_V31}/tool_router/session/${encodeURIComponent(sessionId)}/link`,
    { method: 'POST', body: JSON.stringify({ toolkit: slug }) },
  );
  const redirectUrl = asString(payload.redirect_url);
  if (!/^https:\/\//i.test(redirectUrl)) throw new Error('Composio did not return a secure sign-in link.');
  return {
    redirectUrl,
    connectedAccountId: asString(payload.connected_account_id) || null,
  };
}

export async function disconnectComposioAccount(connectedAccountId: string): Promise<void> {
  const id = connectedAccountId.trim();
  if (!id) throw new Error('Connected account id is required.');
  const accounts = await listComposioConnections();
  if (!accounts.some((account) => account.id === id)) {
    throw new Error('Connected account was not found for this Claw OS profile.');
  }
  const apiKey = await requireApiKey();
  await composioRequest<unknown>(apiKey, `${API_V31}/connected_accounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
