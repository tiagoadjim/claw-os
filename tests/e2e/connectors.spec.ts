import {
  closeElectronApp,
  expect,
  getRecordedHostInvocations,
  getStableWindow,
  installIpcMocks,
  test,
} from './fixtures/electron';

test.describe('Claw OS connectors', () => {
  test('shows the live Composio catalog and opens hosted authentication', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, {
        recordHostInvocations: true,
        hostApi: {
          '["composio","getConfig",null]': {
            enabled: true,
            mcpUrl: 'https://app.composio.dev/tool_router/v3/trs_e2e/mcp',
            hasApiKey: true,
            apiKeyMasked: 'comp…e2e',
            sessionReady: true,
          },
          '["composio","listToolkits",null]': {
            items: [
              {
                slug: 'github',
                name: 'GitHub',
                description: 'Repositories, issues, and pull requests.',
                logo: null,
                categories: [{ id: 'developer-tools', name: 'Developer tools' }],
                toolsCount: 120,
                triggersCount: 8,
                authSchemes: ['oauth2'],
                noAuth: false,
              },
              {
                slug: 'public-search',
                name: 'Public Search',
                description: 'Search public information without an account.',
                logo: null,
                categories: [{ id: 'research', name: 'Research' }],
                toolsCount: 4,
                triggersCount: 0,
                authSchemes: [],
                noAuth: true,
              },
            ],
            nextCursor: null,
            totalItems: 1001,
          },
          '["composio","listConnections",null]': { items: [] },
          '["composio","connect",{"toolkitSlug":"github"}]': {
            success: true,
            redirectUrl: 'https://app.composio.dev/link/lt_e2e',
            connectedAccountId: 'ca_e2e',
          },
          '["shell","openExternal",{"url":"https://app.composio.dev/link/lt_e2e"}]': undefined,
        },
      });

      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-connectors').click();
      await expect(page.getByTestId('connectors-page')).toBeVisible();
      await expect(page.getByTestId('connector-card-github')).toContainText('GitHub');
      await expect(page.getByTestId('connector-card-github')).toContainText('120 actions');
      await expect(page.getByTestId('connector-ready-public-search')).toBeDisabled();
      await expect(page.getByTestId('connector-card-public-search')).toContainText('Works without sign in');

      await page.getByTestId('connector-connect-github').click();
      await expect.poll(async () => {
        const calls = await getRecordedHostInvocations(app);
        return calls.some((call) => call.module === 'composio' && call.action === 'connect');
      }).toBe(true);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('offers secure one-step Composio setup when no session exists', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      await installIpcMocks(app, {
        hostApi: {
          '["composio","getConfig",null]': {
            enabled: false,
            mcpUrl: '',
            hasApiKey: false,
            apiKeyMasked: null,
            sessionReady: false,
          },
        },
      });
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-connectors').click();
      await expect(page.getByTestId('connectors-setup')).toBeVisible();
      await expect(page.getByTestId('connectors-api-key')).toHaveAttribute('type', 'password');
      await expect(page.getByTestId('connectors-setup-submit')).toBeDisabled();
    } finally {
      await closeElectronApp(app);
    }
  });
});
