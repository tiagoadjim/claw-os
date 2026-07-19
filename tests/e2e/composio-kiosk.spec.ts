import type { ElectronApplication } from '@playwright/test';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

async function isMainWindowKiosk(app: ElectronApplication): Promise<boolean> {
  return await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    return win ? win.isKiosk() : false;
  });
}

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

      // Enter kiosk mode.
      await page.getByTestId('composio-enter-kiosk').click();
      await expect(page.getByTestId('composio-exit-kiosk')).toBeVisible();
      await expect(page.getByTestId('composio-page')).toHaveAttribute('data-kiosk', 'true');
      await expect.poll(() => isMainWindowKiosk(app)).toBe(true);

      // "Go to PC" leaves the kiosk and navigates back to the chat page.
      await page.getByTestId('composio-exit-kiosk').click();
      await expect(page.getByTestId('chat-page')).toBeVisible();
      await expect.poll(() => isMainWindowKiosk(app)).toBe(false);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('exposes Composio settings that couple kiosk autostart with launch at startup', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);

      await page.getByTestId('sidebar-nav-settings').click();
      await expect(page.getByTestId('settings-composio')).toBeVisible();

      const kioskSwitch = page.getByTestId('settings-composio-kiosk');
      await expect(kioskSwitch).toHaveAttribute('data-state', 'unchecked');

      await kioskSwitch.click();
      await expect(kioskSwitch).toHaveAttribute('data-state', 'checked');
    } finally {
      await closeElectronApp(app);
    }
  });
});
