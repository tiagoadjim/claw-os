/**
 * Composio Settings Component
 *
 * Connects Composio as an MCP server so OpenClaw agents can use Composio's
 * third-party app integrations as tools. The user provides their Composio API
 * key (stored securely in the Main process, never persisted in the renderer)
 * and the MCP URL generated for their account.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { hostApi, type ComposioConfigResult } from '@/lib/host-api';
import { cn } from '@/lib/utils';

const COMPOSIO_DOCS_URL = 'https://docs.composio.dev/';

export function ComposioSettings() {
  const { t } = useTranslation('settings');

  const [config, setConfig] = useState<ComposioConfigResult | null>(null);
  const [mcpUrlDraft, setMcpUrlDraft] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await hostApi.composio.getConfig();
      setConfig(next);
      setMcpUrlDraft(next.mcpUrl);
    } catch {
      // Leave config null; the section still renders with defaults.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enabled = config?.enabled ?? false;
  const hasApiKey = config?.hasApiKey ?? false;
  const configured = enabled && hasApiKey && (config?.mcpUrl.trim().length ?? 0) > 0;

  const handleToggle = async (value: boolean) => {
    setConfig((prev) => (prev ? { ...prev, enabled: value } : prev));
    try {
      await hostApi.composio.setConfig({ enabled: value });
    } catch {
      void refresh();
    }
  };

  const commitMcpUrl = async () => {
    const next = mcpUrlDraft.trim();
    if (next === (config?.mcpUrl ?? '')) return;
    try {
      await hostApi.composio.setConfig({ mcpUrl: next });
      await refresh();
    } catch {
      void refresh();
    }
  };

  const handleSaveKey = async () => {
    const key = apiKeyDraft.trim();
    if (!key) return;
    setSavingKey(true);
    try {
      await hostApi.composio.setConfig({ apiKey: key });
      setApiKeyDraft('');
      await refresh();
      toast.success(t('composio.saved'));
    } catch {
      void refresh();
    } finally {
      setSavingKey(false);
    }
  };

  const handleClearKey = async () => {
    try {
      await hostApi.composio.setConfig({ apiKey: '' });
      await refresh();
    } catch {
      void refresh();
    }
  };

  return (
    <div data-testid="settings-composio">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif text-foreground mb-2 font-normal tracking-tight">
            {t('composio.title')}
          </h2>
          <p className="text-meta text-muted-foreground">{t('composio.description')}</p>
        </div>
        {configured && (
          <span
            data-testid="settings-composio-configured"
            className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-meta font-medium text-green-700 dark:text-green-400"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('composio.keySaved')}
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium text-foreground/80">{t('composio.enable')}</Label>
            <p className="text-meta text-muted-foreground mt-1">{t('composio.enableDesc')}</p>
          </div>
          <Switch
            data-testid="settings-composio-enable"
            checked={enabled}
            onCheckedChange={(value) => void handleToggle(value)}
          />
        </div>

        {/* API key */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground/80">{t('composio.apiKey')}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              data-testid="settings-composio-api-key"
              type="password"
              autoComplete="off"
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSaveKey();
                }
              }}
              placeholder={hasApiKey ? (config?.apiKeyMasked ?? '') : t('composio.apiKeyPlaceholder')}
              className="max-w-md flex-1"
            />
            <Button
              data-testid="settings-composio-save-key"
              variant="secondary"
              disabled={!apiKeyDraft.trim() || savingKey}
              onClick={() => void handleSaveKey()}
            >
              {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : t('composio.save')}
            </Button>
            {hasApiKey && (
              <Button
                data-testid="settings-composio-clear-key"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => void handleClearKey()}
              >
                {t('composio.clearKey')}
              </Button>
            )}
          </div>
          <p className={cn('text-meta', hasApiKey ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
            {hasApiKey ? t('composio.keySaved') : t('composio.apiKeyDesc')}
          </p>
        </div>

        {/* MCP URL */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground/80">{t('composio.mcpUrl')}</Label>
          <Input
            data-testid="settings-composio-mcp-url"
            value={mcpUrlDraft}
            onChange={(event) => setMcpUrlDraft(event.target.value)}
            onBlur={() => void commitMcpUrl()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            placeholder={t('composio.mcpUrlPlaceholder')}
            className="max-w-md"
          />
          <p className="text-meta text-muted-foreground">{t('composio.mcpUrlDesc')}</p>
        </div>

        <Button
          variant="ghost"
          className="h-auto gap-1.5 px-0 text-meta text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={() => void window.electron.openExternal(COMPOSIO_DOCS_URL)}
        >
          {t('composio.docs')}
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default ComposioSettings;
