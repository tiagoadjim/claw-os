import { describe, it, expect } from 'vitest';
import { buildComposioMcpServers } from '../../electron/services/composio/composio-config';

describe('buildComposioMcpServers', () => {
  const base = { enabled: true, mcpUrl: 'https://mcp.composio.dev/abc', apiKey: 'comp_key_123' };

  it('returns an http MCP server with the X-API-Key header when fully configured', () => {
    expect(buildComposioMcpServers(base)).toEqual([
      {
        type: 'http',
        name: 'composio',
        url: 'https://mcp.composio.dev/abc',
        headers: [{ name: 'X-API-Key', value: 'comp_key_123' }],
      },
    ]);
  });

  it('returns nothing when disabled', () => {
    expect(buildComposioMcpServers({ ...base, enabled: false })).toEqual([]);
  });

  it('returns nothing when the API key is missing', () => {
    expect(buildComposioMcpServers({ ...base, apiKey: '   ' })).toEqual([]);
  });

  it('returns nothing when the MCP URL is missing', () => {
    expect(buildComposioMcpServers({ ...base, mcpUrl: '' })).toEqual([]);
  });

  it('rejects non-http(s) MCP URLs', () => {
    expect(buildComposioMcpServers({ ...base, mcpUrl: 'ftp://mcp.composio.dev' })).toEqual([]);
  });

  it('trims the URL and API key', () => {
    expect(buildComposioMcpServers({ enabled: true, mcpUrl: '  https://x.dev  ', apiKey: '  k  ' })).toEqual([
      {
        type: 'http',
        name: 'composio',
        url: 'https://x.dev',
        headers: [{ name: 'X-API-Key', value: 'k' }],
      },
    ]);
  });
});
