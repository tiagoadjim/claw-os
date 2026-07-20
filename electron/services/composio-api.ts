import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import type { GatewayManager } from '../gateway/manager';
import {
  getComposioConfigView,
  setComposioConfig,
  syncComposioGatewayMcpConfig,
} from './composio/composio-config';
import {
  createComposioConnectionLink,
  disconnectComposioAccount,
  initializeComposioSession,
  listComposioConnections,
  listComposioToolkits,
  resetComposioSession,
} from './composio/composio-client';

async function restartGatewayIfRunning(gatewayManager: GatewayManager): Promise<void> {
  if (gatewayManager.getStatus().state === 'running') {
    await gatewayManager.restart();
  }
}

export function createComposioApi(gatewayManager: GatewayManager): CompleteHostServiceRegistry['composio'] {
  return {
    getConfig: () => getComposioConfigView(),
    setConfig: async (payload) => {
      await setComposioConfig({
        enabled: typeof payload?.enabled === 'boolean' ? payload.enabled : undefined,
        mcpUrl: typeof payload?.mcpUrl === 'string' ? payload.mcpUrl : undefined,
        apiKey: typeof payload?.apiKey === 'string' ? payload.apiKey : undefined,
      });
      await syncComposioGatewayMcpConfig();
      await restartGatewayIfRunning(gatewayManager);
      return { success: true };
    },
    initialize: async (payload) => {
      await initializeComposioSession(payload?.apiKey);
      await restartGatewayIfRunning(gatewayManager);
      return getComposioConfigView();
    },
    listToolkits: (payload) => listComposioToolkits(payload),
    listConnections: async () => ({ items: await listComposioConnections() }),
    connect: async (payload) => ({
      success: true,
      ...(await createComposioConnectionLink(payload.toolkitSlug)),
    }),
    disconnect: async (payload) => {
      await disconnectComposioAccount(payload.connectedAccountId);
      return { success: true };
    },
    reset: async () => {
      await resetComposioSession();
      await restartGatewayIfRunning(gatewayManager);
      return { success: true };
    },
  };
}
