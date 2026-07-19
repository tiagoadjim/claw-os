import type { BrowserWindow } from 'electron';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { syncMacTrafficLightPosition } from '../main/traffic-light-layout';

export function createWindowApi(mainWindow: BrowserWindow): CompleteHostServiceRegistry['window'] {
  return {
    syncTrafficLightPosition: (payload) => {
      syncMacTrafficLightPosition(mainWindow, payload.sidebarCollapsed);
    },
    minimize: () => {
      mainWindow.minimize();
    },
    maximize: () => {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    },
    close: () => {
      mainWindow.close();
    },
    isMaximized: () => mainWindow.isMaximized(),
    setKiosk: (payload) => {
      const enabled = Boolean(payload?.enabled);
      // Keep fullscreen and kiosk in sync so the window is truly edge-to-edge
      // on every platform (on Linux setKiosk maps to fullscreen already, but
      // toggling both keeps behaviour consistent and reversible).
      mainWindow.setKiosk(enabled);
      if (mainWindow.isFullScreen() !== enabled) {
        mainWindow.setFullScreen(enabled);
      }
      return mainWindow.isKiosk();
    },
    isKiosk: () => mainWindow.isKiosk(),
  };
}
