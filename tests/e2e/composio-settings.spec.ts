import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test.describe('Composio settings', () => {
  test('routes non-technical users to the dedicated Connectors setup', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);

      await page.getByTestId('sidebar-nav-settings').click();
      await expect(page.getByTestId('settings-composio')).toBeVisible();
      await expect(page.getByTestId('settings-composio-not-configured')).toBeVisible();

      await page.getByTestId('settings-composio-manage').click();
      await expect(page.getByTestId('connectors-page')).toBeVisible();
      await expect(page.getByTestId('connectors-setup')).toBeVisible();
      await expect(page.getByTestId('connectors-api-key')).toHaveAttribute('type', 'password');
    } finally {
      await closeElectronApp(app);
    }
  });
});
