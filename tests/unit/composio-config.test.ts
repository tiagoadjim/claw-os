import { describe, it, expect } from 'vitest';
import {
  buildComposioGatewayMcpServer,
  COMPOSIO_GATEWAY_API_KEY_ENV,
} from '../../electron/services/composio/composio-config';

describe('buildComposioGatewayMcpServer', () => {
  const base = { enabled: true, mcpUrl: 'https://mcp.composio.dev/abc', apiKey: 'comp_key_123' };

  it('returns a Gateway MCP server whose secret header references the injected environment', () => {
    const server = buildComposioGatewayMcpServer(base);
    expect(server).toEqual({
      enabled: true,
      url: 'https://mcp.composio.dev/abc',
      transport: 'streamable-http',
      headers: { 'X-API-Key': `\${${COMPOSIO_GATEWAY_API_KEY_ENV}}` },
    });
    expect(JSON.stringify(server)).not.toContain('comp_key_123');
  });

  it('returns nothing when disabled', () => {
    expect(buildComposioGatewayMcpServer({ ...base, enabled: false })).toBeNull();
  });

  it('returns nothing when the API key is missing', () => {
    expect(buildComposioGatewayMcpServer({ ...base, apiKey: '   ' })).toBeNull();
  });

  it('returns nothing when the MCP URL is missing', () => {
    expect(buildComposioGatewayMcpServer({ ...base, mcpUrl: '' })).toBeNull();
  });

  it('requires an https MCP URL', () => {
    expect(buildComposioGatewayMcpServer({ ...base, mcpUrl: 'http://mcp.composio.dev' })).toBeNull();
    expect(buildComposioGatewayMcpServer({ ...base, mcpUrl: 'ftp://mcp.composio.dev' })).toBeNull();
  });

  it('trims the URL while keeping the API key out of the registry entry', () => {
    expect(buildComposioGatewayMcpServer({ enabled: true, mcpUrl: '  https://x.dev  ', apiKey: '  k  ' })).toEqual({
      enabled: true,
      url: 'https://x.dev',
      transport: 'streamable-http',
      headers: { 'X-API-Key': `\${${COMPOSIO_GATEWAY_API_KEY_ENV}}` },
    });
  });
});
