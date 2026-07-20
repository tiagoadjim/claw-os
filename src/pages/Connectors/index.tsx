import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, KeyRound, Loader2, PlugZap, RefreshCw, Search, ShieldCheck, Unplug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { hostApi, type ComposioConfigResult, type ComposioConnection, type ComposioToolkit } from '@/lib/host-api';
import { cn } from '@/lib/utils';

const COMPOSIO_KEYS_URL = 'https://platform.composio.dev/settings';

export function Connectors() {
  const { t } = useTranslation('connectors');
  const [config, setConfig] = useState<ComposioConfigResult | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [toolkits, setToolkits] = useState<ComposioToolkit[]>([]);
  const [connections, setConnections] = useState<ComposioConnection[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'connected'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const refreshConfig = useCallback(async () => {
    const next = await hostApi.composio.getConfig();
    setConfig(next);
    return next;
  }, []);

  const refreshCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalog, connected] = await Promise.all([
        hostApi.composio.listToolkits(),
        hostApi.composio.listConnections(),
      ]);
      setToolkits(catalog.items);
      setConnections(connected.items);
    } catch (nextError) {
      setError(String(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshConfig().then(async (next) => {
      if (cancelled || !next.hasApiKey) return;
      if (!next.sessionReady) {
        try {
          const initialized = await hostApi.composio.initialize();
          if (!cancelled) setConfig(initialized);
        } catch (nextError) {
          if (!cancelled) setError(String(nextError));
          return;
        }
      }
      if (!cancelled) void refreshCatalog();
    }).catch((nextError) => {
      if (!cancelled) setError(String(nextError));
    });
    return () => { cancelled = true; };
  }, [refreshCatalog, refreshConfig]);

  useEffect(() => {
    const onFocus = () => {
      if (config?.sessionReady) void refreshCatalog();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [config?.sessionReady, refreshCatalog]);

  const connectionByToolkit = useMemo(() => {
    const entries = connections.map((connection) => [connection.toolkitSlug, connection] as const);
    return new Map(entries);
  }, [connections]);

  const visibleToolkits = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return toolkits.filter((toolkit) => {
      if (filter === 'connected' && !connectionByToolkit.has(toolkit.slug) && !toolkit.noAuth) return false;
      if (!query) return true;
      return [toolkit.name, toolkit.slug, toolkit.description, ...toolkit.categories.map((category) => category.name)]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [connectionByToolkit, filter, search, toolkits]);

  const handleSetup = async () => {
    const key = apiKey.trim();
    if (!key) return;
    setSettingUp(true);
    setError(null);
    try {
      const next = await hostApi.composio.initialize({ apiKey: key });
      setConfig(next);
      setApiKey('');
      toast.success(t('toast.setupComplete'));
      await refreshCatalog();
    } catch (nextError) {
      setError(String(nextError));
      toast.error(t('toast.failed', { error: String(nextError) }));
    } finally {
      setSettingUp(false);
    }
  };

  const handleConnect = async (toolkit: ComposioToolkit) => {
    setBusySlug(toolkit.slug);
    try {
      const result = await hostApi.composio.connect({ toolkitSlug: toolkit.slug });
      await hostApi.shell.openExternal(result.redirectUrl);
      toast.success(t('toast.linkOpened', { name: toolkit.name }));
      window.setTimeout(() => void refreshCatalog(), 5000);
    } catch (nextError) {
      toast.error(t('toast.failed', { error: String(nextError) }));
    } finally {
      setBusySlug(null);
    }
  };

  const handleDisconnect = async (connection: ComposioConnection) => {
    setBusySlug(connection.toolkitSlug);
    try {
      await hostApi.composio.disconnect(connection.id);
      await refreshCatalog();
      toast.success(t('toast.disconnected'));
    } catch (nextError) {
      toast.error(t('toast.failed', { error: String(nextError) }));
    } finally {
      setBusySlug(null);
    }
  };

  const handleReset = async () => {
    await hostApi.composio.reset();
    setResetDialogOpen(false);
    setToolkits([]);
    setConnections([]);
    setError(null);
    setConfig(await hostApi.composio.getConfig());
    toast.success(t('toast.reset'));
  };

  return (
    <div data-testid="connectors-page" className="-m-6 min-h-[calc(100vh-2.5rem)] bg-background">
      <div className="mx-auto w-full max-w-6xl px-10 pb-14 pt-16">
        <header className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-meta font-medium text-brand">
              <PlugZap className="h-4 w-4" />
              {t('poweredBy')}
            </div>
            <h1 className="mb-3 font-serif text-5xl font-normal tracking-tight text-foreground md:text-6xl">
              {t('title')}
            </h1>
            <p className="max-w-2xl text-subtitle font-medium text-foreground/70">{t('subtitle')}</p>
          </div>
          {config?.sessionReady && (
            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="connectors-change-key"
                variant="ghost"
                className="rounded-full text-muted-foreground"
                onClick={() => setResetDialogOpen(true)}
              >
                {t('reset.action')}
              </Button>
              <Button
                data-testid="connectors-refresh"
                variant="outline"
                className="rounded-full border-black/10 bg-transparent dark:border-white/10"
                onClick={() => void refreshCatalog()}
                disabled={loading}
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
                {t('refresh')}
              </Button>
            </div>
          )}
        </header>

        {!config?.sessionReady ? (
          <section data-testid="connectors-setup" className="mx-auto max-w-2xl rounded-3xl border border-border/70 bg-surface-modal p-8 shadow-sm">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand">
              <KeyRound className="h-6 w-6" />
            </div>
            <h2 className="mb-2 font-serif text-3xl font-normal tracking-tight">{t('setup.title')}</h2>
            <p className="mb-7 text-sm leading-6 text-muted-foreground">{t('setup.description')}</p>
            <label className="mb-2 block text-sm font-medium" htmlFor="composio-key">{t('setup.apiKey')}</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="composio-key"
                data-testid="connectors-api-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleSetup();
                }}
                placeholder={t('setup.placeholder')}
                className="h-11 bg-surface-input"
              />
              <Button
                data-testid="connectors-setup-submit"
                className="h-11 shrink-0 rounded-xl px-5"
                disabled={!apiKey.trim() || settingUp}
                onClick={() => void handleSetup()}
              >
                {settingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                {settingUp ? t('setup.saving') : t('setup.action')}
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-meta text-muted-foreground">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" />{t('setup.secure')}</span>
              <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => void hostApi.shell.openExternal(COMPOSIO_KEYS_URL)}>
                {t('setup.help')}<ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
            {error && <p className="mt-4 text-sm text-red-700 dark:text-red-400">{t('error')}</p>}
          </section>
        ) : (
          <>
            <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative max-w-xl flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  data-testid="connectors-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('search')}
                  className="h-11 rounded-xl bg-surface-input pl-11"
                />
              </div>
              <div className="flex rounded-xl bg-black/5 p-1 dark:bg-white/5">
                {(['all', 'connected'] as const).map((value) => (
                  <Button
                    key={value}
                    data-testid={`connectors-filter-${value}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => setFilter(value)}
                    className={cn('rounded-lg px-4', filter === value && 'bg-background shadow-sm')}
                  >
                    {t(value)}
                  </Button>
                ))}
              </div>
            </div>

            {!loading && !error && <p className="mb-4 text-meta text-muted-foreground">{t('results', { count: visibleToolkits.length })}</p>}
            {loading ? (
              <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{t('loading')}</div>
            ) : error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center text-red-700 dark:text-red-400">{t('error')}</div>
            ) : visibleToolkits.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-16 text-center text-muted-foreground">{t('empty')}</div>
            ) : (
              <div data-testid="connectors-grid" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleToolkits.map((toolkit) => {
                  const connection = connectionByToolkit.get(toolkit.slug);
                  const isActive = connection?.status.toUpperCase() === 'ACTIVE';
                  const isReadyWithoutAuth = toolkit.noAuth && !connection;
                  return (
                    <article key={toolkit.slug} data-testid={`connector-card-${toolkit.slug}`} className="flex min-h-52 flex-col rounded-2xl border border-border/70 bg-card p-5 transition-shadow hover:shadow-sm">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-white">
                            {toolkit.logo ? <img src={toolkit.logo} alt="" className="h-8 w-8 object-contain" /> : <PlugZap className="h-5 w-5 text-brand" />}
                          </div>
                          <div className="min-w-0">
                            <h2 className="truncate text-base font-semibold">{toolkit.name}</h2>
                            <p className="truncate text-meta text-muted-foreground">{toolkit.categories[0]?.name ?? toolkit.slug}</p>
                          </div>
                        </div>
                        {(connection || isReadyWithoutAuth) && <Badge className={cn('shrink-0 border-0', isActive || isReadyWithoutAuth ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400')}><Check className="mr-1 h-3 w-3" />{isReadyWithoutAuth ? t('card.active') : isActive ? t('connected') : t('card.pending')}</Badge>}
                      </div>
                      <p className="mb-4 line-clamp-2 flex-1 text-sm leading-5 text-muted-foreground">{toolkit.description}</p>
                      <div className="mb-4 flex flex-wrap gap-2 text-tiny text-muted-foreground">
                        {toolkit.toolsCount > 0 && <span>{t('card.tools', { count: toolkit.toolsCount })}</span>}
                        {toolkit.triggersCount > 0 && <span>· {t('card.triggers', { count: toolkit.triggersCount })}</span>}
                        {toolkit.noAuth && <span>· {t('card.noAuth')}</span>}
                      </div>
                      {connection ? (
                        <Button variant="outline" className="w-full rounded-xl border-black/10 bg-transparent dark:border-white/10" disabled={busySlug === toolkit.slug} onClick={() => void handleDisconnect(connection)}>
                          {busySlug === toolkit.slug ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unplug className="mr-2 h-4 w-4" />}
                          {t('card.disconnect')}
                        </Button>
                      ) : isReadyWithoutAuth ? (
                        <Button data-testid={`connector-ready-${toolkit.slug}`} variant="secondary" className="w-full rounded-xl" disabled>
                          <Check className="mr-2 h-4 w-4" />
                          {t('card.active')}
                        </Button>
                      ) : (
                        <Button data-testid={`connector-connect-${toolkit.slug}`} className="w-full rounded-xl" disabled={busySlug === toolkit.slug} onClick={() => void handleConnect(toolkit)}>
                          {busySlug === toolkit.slug ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                          {busySlug === toolkit.slug ? t('card.connecting') : t('card.connect')}
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <ConfirmDialog
        open={resetDialogOpen}
        title={t('reset.title')}
        message={t('reset.description')}
        confirmLabel={t('reset.confirm')}
        cancelLabel={t('reset.cancel')}
        variant="destructive"
        onConfirm={handleReset}
        onCancel={() => setResetDialogOpen(false)}
        onError={(nextError) => toast.error(t('toast.failed', { error: String(nextError) }))}
      />
    </div>
  );
}

export default Connectors;
