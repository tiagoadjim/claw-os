import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test.describe('Composio kiosk integration', () => {
  test('opens the Composio page from the sidebar', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('chat-page')).toBeVisible();

      await page.getByTestId('sidebar-nav-composio').click();

      await expect(page.getByTestId('composio-page')).toBeVisible();
      await expect(page.getByTestId('composio-reload')).toBeVisible();
      await expect(page.getByTestId('composio-open-external')).toBeVisible();
      await expect(page.getByTestId('composio-enter-kiosk')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('enters kiosk mode and the "Go to PC" button returns to the app', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);

      await page.getByTestId('sidebar-nav-composio').click();
      await expect(page.getByTestId('composio-page')).toBeVisible();

      // Enter kiosk mode. The page reflects kiosk intent via UI state, so this
      // stays deterministic even where the window manager cannot honour a real
      // full-screen transition (e.g. headless CI).
      await page.getByTestId('composio-enter-kiosk').click();
      await expect(page.getByTestId('composio-exit-kiosk')).toBeVisible();
      await expect(page.getByTestId('composio-page')).toHaveAttribute('data-kiosk', 'true');

      // "Go to PC" leaves the kiosk and navigates back to the chat page.
      await page.getByTestId('composio-exit-kiosk').click();
      await expect(page.getByTestId('chat-page')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('exposes a Composio settings section with a kiosk autostart toggle', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);

      await page.getByTestId('sidebar-nav-settings').click();
      await expect(page.getByTestId('settings-composio')).toBeVisible();

      // The feature is surfaced to users as "Production Mode".
      await expect(
        page.getByTestId('settings-composio').getByText('Production Mode', { exact: false }),
      ).toBeVisible();

      const kioskSwitch = page.getByTestId('settings-composio-kiosk');
      await expect(kioskSwitch).toHaveAttribute('data-state', 'unchecked');

      await kioskSwitch.click();
      await expect(kioskSwitch).toHaveAttribute('data-state', 'checked');
    } finally {
      await closeElectronApp(app);
    }
  });
});
