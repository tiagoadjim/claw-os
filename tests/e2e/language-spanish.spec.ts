import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test.describe('Spanish language localization', () => {
  test('offers only English and Spanish in the setup wizard', async ({ launchElectronApp }) => {
    const app = await launchElectronApp();
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('setup-page')).toBeVisible();
      await expect(page.getByTestId('setup-language-en')).toBeVisible();
      await expect(page.getByTestId('setup-language-es')).toBeVisible();
      await expect(page.locator('button', { hasText: 'Русский' })).toHaveCount(0);
      await expect(page.locator('button', { hasText: '中文' })).toHaveCount(0);
      await expect(page.locator('button', { hasText: '日本語' })).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('switches setup and the main navigation to Spanish', async ({ launchElectronApp }) => {
    const app = await launchElectronApp();
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('setup-language-es').click();
      await expect(page.getByRole('heading', { level: 2 })).toContainText('Un solo lugar para tu agente de IA');
      await page.getByTestId('setup-skip-button').click();
      await expect(page.getByTestId('main-layout')).toBeVisible();
      await expect(page.getByTestId('sidebar-nav-connectors')).toContainText('Conectores');
      await expect(page.getByTestId('sidebar-nav-settings')).toContainText('Configuración');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('persists Spanish across relaunches of the same profile', async ({ electronApp, launchElectronApp }) => {
    const firstWindow = await getStableWindow(electronApp);
    await firstWindow.getByTestId('setup-language-es').click();
    await firstWindow.getByTestId('setup-skip-button').click();
    await expect(firstWindow.getByTestId('sidebar-nav-connectors')).toContainText('Conectores');
    await closeElectronApp(electronApp);

    const relaunched = await launchElectronApp();
    try {
      const page = await getStableWindow(relaunched);
      await expect(page.getByTestId('setup-page')).toHaveCount(0);
      await expect(page.getByTestId('sidebar-nav-connectors')).toContainText('Conectores');
    } finally {
      await closeElectronApp(relaunched);
    }
  });
});
