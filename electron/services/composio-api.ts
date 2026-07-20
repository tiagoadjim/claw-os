import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { getComposioConfigView, setComposioConfig } from './composio/composio-config';

export function createComposioApi(): CompleteHostServiceRegistry['composio'] {
  return {
    getConfig: () => getComposioConfigView(),
    setConfig: async (payload) => {
      await setComposioConfig({
        enabled: typeof payload?.enabled === 'boolean' ? payload.enabled : undefined,
        mcpUrl: typeof payload?.mcpUrl === 'string' ? payload.mcpUrl : undefined,
        apiKey: typeof payload?.apiKey === 'string' ? payload.apiKey : undefined,
      });
      return { success: true };
    },
  };
}
