import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test.describe('Composio settings', () => {
  test('configures Composio as an MCP integration (enable + API key + MCP URL)', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);

      await page.getByTestId('sidebar-nav-settings').click();
      await expect(page.getByTestId('settings-composio')).toBeVisible();

      // Enable the integration.
      await page.getByTestId('settings-composio-enable').click();

      // Provide the MCP URL.
      const mcpUrl = page.getByTestId('settings-composio-mcp-url');
      await mcpUrl.fill('https://mcp.composio.dev/test');
      await mcpUrl.blur();

      // Provide and save the API key.
      await page.getByTestId('settings-composio-api-key').fill('comp_test_key_abcdef123456');
      await page.getByTestId('settings-composio-save-key').click();

      // Once enabled with a key and MCP URL, the section reports it is configured.
      await expect(page.getByTestId('settings-composio-configured')).toBeVisible();

      // The raw key is never echoed back — the input is cleared and a masked
      // placeholder is shown instead.
      await expect(page.getByTestId('settings-composio-api-key')).toHaveValue('');
      await expect(page.getByTestId('settings-composio-clear-key')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
