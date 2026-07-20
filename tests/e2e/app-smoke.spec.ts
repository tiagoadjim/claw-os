import { closeElectronApp, expect, installIpcMocks, test } from './fixtures/electron';

test.describe('Claw OS Electron smoke flows', () => {
  test('shows the setup wizard on a fresh profile', async ({ page }) => {
    await expect(page.getByTestId('setup-page')).toBeVisible();
    await expect(page.getByTestId('setup-welcome-step')).toBeVisible();
    await expect(page.getByTestId('setup-skip-button')).toBeVisible();
  });

  test('can skip setup and navigate to the models page', async ({ page }) => {
    await expect(page.getByTestId('setup-page')).toBeVisible();
    await page.getByTestId('setup-skip-button').click();

    await expect(page.getByTestId('main-layout')).toBeVisible();
    await page.getByTestId('sidebar-nav-models').click();

    await expect(page.getByTestId('models-page')).toBeVisible();
    await expect(page.getByTestId('models-page-title')).toBeVisible();
    await expect(page.getByTestId('providers-settings')).toBeVisible();
  });

  test('guides a non-technical user through identity, model, connectors, and capabilities', async ({ electronApp, page }) => {
    await installIpcMocks(electronApp, {
      hostApi: {
        '["agents","list",null]': {
          success: true,
          defaultAgentId: 'main',
          agents: [{ id: 'main', name: 'main', isDefault: true }],
          configuredChannelTypes: [],
          channelOwners: {},
          channelAccountOwners: {},
        },
        '["agents","update",{"id":"main","name":"Nova"}]': {
          success: true,
          defaultAgentId: 'main',
          agents: [{ id: 'main', name: 'Nova', isDefault: true }],
          configuredChannelTypes: [],
          channelOwners: {},
          channelAccountOwners: {},
        },
      },
    });

    await page.getByTestId('setup-next-button').click();
    await expect(page.getByTestId('setup-agent-name')).toBeVisible();
    await page.getByTestId('setup-agent-name').fill('Nova');
    await page.getByTestId('setup-next-button').click();
    await expect(page.getByTestId('setup-chatgpt-signin')).toBeVisible();
    await page.getByTestId('setup-next-button').click();
    await expect(page.getByTestId('setup-composio-key')).toBeVisible();
    await page.getByTestId('setup-next-button').click();
    await expect(page.getByText('Everyday skills')).toBeVisible();
    await expect(page.getByText('Channels and plugins')).toBeVisible();
    await expect(page.getByTestId('setup-capability-plugins')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('setup-capability-plugins').click();
    await expect(page.getByTestId('setup-capability-plugins')).toHaveAttribute('aria-pressed', 'false');
  });

  test('persists skipped setup across relaunch for the same isolated profile', async ({ electronApp, launchElectronApp }) => {
    const firstWindow = await electronApp.firstWindow();
    await firstWindow.waitForLoadState('domcontentloaded');
    await firstWindow.getByTestId('setup-skip-button').click();
    await expect(firstWindow.getByTestId('main-layout')).toBeVisible();

    await closeElectronApp(electronApp);

    const relaunchedApp = await launchElectronApp();
    try {
      const relaunchedWindow = await relaunchedApp.firstWindow();
      await relaunchedWindow.waitForLoadState('domcontentloaded');

      await expect(relaunchedWindow.getByTestId('main-layout')).toBeVisible();
      await expect(relaunchedWindow.getByTestId('setup-page')).toHaveCount(0);
    } finally {
      await closeElectronApp(relaunchedApp);
    }
  });
});
