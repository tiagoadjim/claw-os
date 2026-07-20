/**
 * Simple Composio status entry. Connector setup and account management live in
 * the dedicated Connectors experience; Settings only points users there.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, PlugZap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { hostApi, type ComposioConfigResult } from '@/lib/host-api';

const COMPOSIO_DOCS_URL = 'https://docs.composio.dev/';

export function ComposioSettings() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const [config, setConfig] = useState<ComposioConfigResult | null>(null);

  useEffect(() => {
    let active = true;
    void hostApi.composio.getConfig()
      .then((next) => {
        if (active) setConfig(next);
      })
      .catch(() => {
        if (active) setConfig(null);
      });
    return () => { active = false; };
  }, []);

  const ready = config?.sessionReady ?? false;

  return (
    <div data-testid="settings-composio">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-2 font-serif text-3xl font-normal tracking-tight text-foreground">
            {t('composio.title')}
          </h2>
          <p className="text-meta text-muted-foreground">{t('composio.description')}</p>
        </div>
        <span
          data-testid={ready ? 'settings-composio-configured' : 'settings-composio-not-configured'}
          className={ready
            ? 'mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-meta font-medium text-green-700 dark:text-green-400'
            : 'mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-black/5 px-3 py-1 text-meta font-medium text-muted-foreground dark:bg-white/5'}
        >
          {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PlugZap className="h-3.5 w-3.5" />}
          {ready ? t('composio.statusReady') : t('composio.statusNotReady')}
        </span>
      </div>

      <div className="rounded-2xl border border-border/70 bg-surface-input/60 p-5">
        <p className="mb-4 text-sm leading-6 text-muted-foreground">{t('composio.manageDesc')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button data-testid="settings-composio-manage" className="rounded-xl" onClick={() => navigate('/connectors')}>
            <PlugZap className="mr-2 h-4 w-4" />
            {t('composio.manage')}
          </Button>
          <Button
            variant="ghost"
            className="h-auto gap-1.5 px-2 text-meta text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => void hostApi.shell.openExternal(COMPOSIO_DOCS_URL)}
          >
            {t('composio.docs')}
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ComposioSettings;
