/**
 * Composio Page
 * Native, embedded Composio experience. Renders the Composio web app inside an
 * Electron <webview>. Supports a full-screen kiosk mode (auto-started at boot
 * when enabled) plus an always-available "Go to PC" button that leaves the
 * kiosk and returns to the regular ClawX app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  LogOut,
  Maximize2,
  Monitor,
  RotateCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settings';
import { hostApi } from '@/lib/host-api';
import { cn } from '@/lib/utils';

/** Minimal subset of the Electron <webview> element API we rely on. */
interface ElectronWebViewElement extends HTMLElement {
  src: string;
  reload: () => void;
  getURL: () => string;
}

interface WebviewFailEvent extends Event {
  errorCode?: number;
  errorDescription?: string;
  isMainFrame?: boolean;
}

export function Composio() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const composioUrl = useSettingsStore((state) => state.composioUrl);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<ElectronWebViewElement | null>(null);

  const [kiosk, setKiosk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Reflect the window's real kiosk state on mount so the overlay is shown when
  // the app was launched straight into the Composio kiosk.
  useEffect(() => {
    let cancelled = false;
    void hostApi.window
      .isKiosk()
      .then((value) => {
        if (!cancelled) setKiosk(Boolean(value));
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, []);

  // Create the <webview> imperatively — this avoids JSX intrinsic-element typing
  // pitfalls and gives us direct access to the Electron webview lifecycle events.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const webview = document.createElement('webview') as unknown as ElectronWebViewElement;
    webview.setAttribute('src', composioUrl);
    webview.setAttribute('partition', 'persist:composio');
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('data-testid', 'composio-webview');
    webview.style.width = '100%';
    webview.style.height = '100%';
    webview.style.border = '0';
    webviewRef.current = webview;

    const handleStart = () => {
      setLoading(true);
      setFailed(false);
    };
    const handleStop = () => setLoading(false);
    const handleFail = (event: Event) => {
      const detail = event as WebviewFailEvent;
      // -3 == ERR_ABORTED (in-page navigations / redirects), ignore it.
      if (detail.errorCode === -3) return;
      // Sub-frame failures should not blank out the whole page.
      if (detail.isMainFrame === false) return;
      setLoading(false);
      setFailed(true);
    };

    webview.addEventListener('did-start-loading', handleStart);
    webview.addEventListener('did-stop-loading', handleStop);
    webview.addEventListener('did-fail-load', handleFail);
    container.appendChild(webview);

    return () => {
      webview.removeEventListener('did-start-loading', handleStart);
      webview.removeEventListener('did-stop-loading', handleStop);
      webview.removeEventListener('did-fail-load', handleFail);
      webview.remove();
      webviewRef.current = null;
    };
  }, [composioUrl]);

  const reload = useCallback(() => {
    setFailed(false);
    setLoading(true);
    const webview = webviewRef.current;
    if (webview) {
      webview.reload();
    }
  }, []);

  const openExternal = useCallback(() => {
    const target = webviewRef.current?.getURL?.() || composioUrl;
    void window.electron.openExternal(target);
  }, [composioUrl]);

  const enterKiosk = useCallback(async () => {
    try {
      await hostApi.window.setKiosk(true);
    } catch {
      // Ignore — the window may not support kiosk in this environment.
    }
    setKiosk(true);
  }, []);

  // "Go to PC": leave the locked kiosk and return to the regular ClawX app so
  // the user can reach the rest of their computer again.
  const goToPc = useCallback(async () => {
    try {
      await hostApi.window.setKiosk(false);
    } catch {
      // Ignore — best effort exit.
    }
    setKiosk(false);
    navigate('/');
  }, [navigate]);

  // Escape is the universal "get me out" key in kiosk mode.
  useEffect(() => {
    if (!kiosk) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void goToPc();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [kiosk, goToPc]);

  return (
    <div
      data-testid="composio-page"
      data-kiosk={kiosk ? 'true' : 'false'}
      className={cn(
        'flex min-h-0 flex-col bg-background',
        kiosk ? 'fixed inset-0 z-[100]' : 'h-full',
      )}
    >
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-surface-sidebar px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Monitor className="h-4 w-4 shrink-0 text-foreground/70" strokeWidth={2} />
          <span className="truncate text-sm font-semibold text-foreground/90">
            {t('composio.title')}
          </span>
          {loading && (
            <Loader2
              data-testid="composio-loading"
              className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
            />
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            data-testid="composio-reload"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5"
            title={t('composio.reload')}
            aria-label={t('composio.reload')}
            onClick={reload}
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            data-testid="composio-open-external"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-foreground/80 hover:bg-black/5 dark:hover:bg-white/5"
            title={t('composio.openExternal')}
            aria-label={t('composio.openExternal')}
            onClick={openExternal}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>

          {kiosk ? (
            <Button
              data-testid="composio-exit-kiosk"
              variant="default"
              size="sm"
              className="h-8 gap-1.5 rounded-lg"
              onClick={() => void goToPc()}
            >
              <LogOut className="h-4 w-4" />
              {t('composio.goToPc')}
            </Button>
          ) : (
            <Button
              data-testid="composio-enter-kiosk"
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5 rounded-lg"
              onClick={() => void enterKiosk()}
            >
              <Maximize2 className="h-4 w-4" />
              {t('composio.kioskMode')}
            </Button>
          )}
        </div>
      </div>

      {/* Webview area */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0 flex bg-background" />

        {failed && (
          <div
            data-testid="composio-error"
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/95 p-6 text-center"
          >
            <AlertTriangle className="h-10 w-10 text-yellow-500" />
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">{t('composio.errorTitle')}</p>
              <p className="max-w-md text-meta text-muted-foreground">{t('composio.errorDesc')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={reload}>
                <RotateCw className="h-4 w-4" />
                {t('composio.retry')}
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={openExternal}>
                <ExternalLink className="h-4 w-4" />
                {t('composio.openExternal')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Composio;
