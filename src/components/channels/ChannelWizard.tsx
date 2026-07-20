import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Loader2,
  ExternalLink,
  ClipboardPaste,
  Check,
  AlertCircle,
  ArrowLeft,
  QrCode,
  RefreshCw,
  PartyPopper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hostApi } from '@/lib/host-api';
import { hostEvents } from '@/lib/host-events';
import { cn } from '@/lib/utils';
import type { ChannelErrorEvent, ChannelQrEvent, ChannelSuccessEvent } from '@shared/host-events/contract';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import telegramIcon from '@/assets/channels/telegram.svg';
import discordIcon from '@/assets/channels/discord.svg';
import whatsappIcon from '@/assets/channels/whatsapp.svg';

export type WizardChannelType = 'telegram' | 'whatsapp' | 'discord';

interface ChannelWizardProps {
  channelType: WizardChannelType;
  onClose: () => void;
  onSaved: (channelType: WizardChannelType) => void | Promise<void>;
}

type WizardPhase = 'guide' | 'token' | 'invite' | 'qr' | 'success';

const PHASE_SEQUENCE: Record<WizardChannelType, WizardPhase[]> = {
  telegram: ['guide', 'token', 'success'],
  whatsapp: ['guide', 'qr', 'success'],
  discord: ['guide', 'token', 'invite', 'success'],
};

const WIZARD_ICONS: Record<WizardChannelType, string> = {
  telegram: telegramIcon,
  whatsapp: whatsappIcon,
  discord: discordIcon,
};

const BOTFATHER_URL = 'https://t.me/BotFather';
const USERINFOBOT_URL = 'https://t.me/userinfobot';
const DISCORD_PORTAL_URL = 'https://discord.com/developers/applications';
// View Channels + Send Messages + Add Reactions + Embed Links + Attach Files
// + Read Message History.
const DISCORD_INVITE_PERMISSIONS = 117824;

function openExternal(url: string) {
  void hostApi.shell.openExternal(url).catch(() => {
    window.open(url, '_blank');
  });
}

function normalizeQrImageSource(data: { qr?: string; raw?: string }): string | null {
  const qr = typeof data.qr === 'string' ? data.qr.trim() : '';
  if (qr) {
    if (qr.startsWith('data:image') || qr.startsWith('http://') || qr.startsWith('https://')) {
      return qr;
    }
    return `data:image/png;base64,${qr}`;
  }
  const raw = typeof data.raw === 'string' ? data.raw.trim() : '';
  if (raw.startsWith('data:image') || raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw;
  }
  return null;
}

export function ChannelWizard({ channelType, onClose, onSaved }: ChannelWizardProps) {
  const { t } = useTranslation('channels');
  const [phase, setPhase] = useState<WizardPhase>('guide');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [token, setToken] = useState('');
  const [serverId, setServerId] = useState('');
  const [whoCanTalk, setWhoCanTalk] = useState<'everyone' | 'specific'>('everyone');
  const [allowedIds, setAllowedIds] = useState('');
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [botId, setBotId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const sequence = PHASE_SEQUENCE[channelType];
  const stepIndex = sequence.indexOf(phase);
  const totalSteps = sequence.length - 1; // success screen is not a "step"

  const onSavedRef = useRef(onSaved);
  const onCloseRef = useRef(onClose);
  const translateRef = useRef(t);
  useEffect(() => {
    onSavedRef.current = onSaved;
    onCloseRef.current = onClose;
    translateRef.current = t;
  }, [onSaved, onClose, t]);

  // WhatsApp login lifecycle: QR + success/error events from the gateway.
  useEffect(() => {
    if (channelType !== 'whatsapp') return;

    const removeQr = hostEvents.onChannelQr('whatsapp', (data: ChannelQrEvent) => {
      const nextQr = normalizeQrImageSource(data);
      if (!nextQr) return;
      setQrCode(nextQr);
      setBusy(false);
      setPhase((current) => (current === 'success' ? current : 'qr'));
    });

    const removeSuccess = hostEvents.onChannelSuccess('whatsapp', async (data: ChannelSuccessEvent) => {
      void data?.accountId;
      try {
        const saveResult = await hostApi.channels.saveConfig({
          channelType: 'whatsapp',
          config: { enabled: true },
        });
        if (!saveResult?.success) {
          throw new Error(saveResult?.error || 'Failed to save WhatsApp config');
        }
        setBusy(false);
        setPhase('success');
        try {
          await onSavedRef.current('whatsapp');
        } catch {
          // Page refresh failures should not block the success screen.
        }
      } catch (error) {
        setErrors([String(error)]);
        setBusy(false);
      }
    });

    const removeError = hostEvents.onChannelError('whatsapp', (payload: ChannelErrorEvent) => {
      const message = typeof payload === 'string' ? payload : String(payload.message || payload);
      setErrors([message]);
      setQrCode(null);
      setBusy(false);
      setPhase('guide');
    });

    return () => {
      removeQr();
      removeSuccess();
      removeError();
      hostApi.channels.cancelLogin('whatsapp').catch(() => {});
    };
  }, [channelType]);

  const pasteFromClipboard = useCallback(async (assign: (value: string) => void) => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) assign(text.trim());
    } catch {
      // Clipboard access denied — user can paste manually.
    }
  }, []);

  const startWhatsAppLogin = async () => {
    setErrors([]);
    setBusy(true);
    setQrCode(null);
    try {
      await hostApi.channels.startLogin('whatsapp');
      // QR arrives via the event listener; keep the spinner meanwhile.
    } catch (error) {
      setErrors([String(error)]);
      setBusy(false);
    }
  };

  const connectTelegram = async () => {
    setErrors([]);
    setBusy(true);
    try {
      const allowedUsers = whoCanTalk === 'everyone' ? '*' : allowedIds.trim();
      const config = { botToken: token.trim(), allowedUsers };
      const validation = await hostApi.channels.validateCredentials('telegram', config);
      if (!validation.valid) {
        setErrors(validation.errors?.length ? validation.errors : ['Validation failed']);
        setBusy(false);
        return;
      }
      setBotUsername(validation.details?.botUsername || null);
      const saveResult = await hostApi.channels.saveConfig({ channelType: 'telegram', config });
      if (!saveResult?.success) {
        throw new Error(saveResult?.error || 'Failed to save channel config');
      }
      if (saveResult.warning) toast.warning(saveResult.warning);
      setPhase('success');
      try {
        await onSaved('telegram');
      } catch {
        // Non-fatal: config is saved even if the page refresh fails.
      }
    } catch (error) {
      setErrors([String(error)]);
    } finally {
      setBusy(false);
    }
  };

  const verifyDiscordToken = async () => {
    setErrors([]);
    setBusy(true);
    try {
      const validation = await hostApi.channels.validateCredentials('discord', { token: token.trim() });
      if (!validation.valid) {
        setErrors(validation.errors?.length ? validation.errors : ['Validation failed']);
        return;
      }
      setBotUsername(validation.details?.botUsername || null);
      setBotId(validation.details?.botId || null);
      setPhase('invite');
    } catch (error) {
      setErrors([String(error)]);
    } finally {
      setBusy(false);
    }
  };

  const connectDiscord = async () => {
    setErrors([]);
    setBusy(true);
    try {
      const config = { token: token.trim(), guildId: serverId.trim() };
      const validation = await hostApi.channels.validateCredentials('discord', config);
      if (!validation.valid) {
        setErrors(validation.errors?.length ? validation.errors : ['Validation failed']);
        return;
      }
      const saveResult = await hostApi.channels.saveConfig({ channelType: 'discord', config });
      if (!saveResult?.success) {
        throw new Error(saveResult?.error || 'Failed to save channel config');
      }
      if (saveResult.warning) toast.warning(saveResult.warning);
      setPhase('success');
      try {
        await onSaved('discord');
      } catch {
        // Non-fatal: config is saved even if the page refresh fails.
      }
    } catch (error) {
      setErrors([String(error)]);
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setErrors([]);
    if (stepIndex > 0 && phase !== 'success') {
      const previous = sequence[stepIndex - 1];
      if (previous === 'qr') {
        setPhase('guide');
        return;
      }
      setPhase(previous);
    }
  };

  const wiz = (key: string, options?: Record<string, unknown>) => t(`wizard.${channelType}.${key}`, options);

  const guideSteps = t(`wizard.${channelType}.guideSteps`, { returnObjects: true });
  const guideStepList = Array.isArray(guideSteps) ? (guideSteps as string[]) : [];

  const renderGuide = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">{wiz('guideTitle')}</h3>
        <p className="text-sm text-foreground/70 leading-relaxed">{wiz('guideIntro')}</p>
      </div>

      <ol className="space-y-3">
        {guideStepList.map((step, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-sm font-semibold text-foreground">
              {index + 1}
            </span>
            <span className="text-sm text-foreground/85 leading-relaxed pt-1">{step}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-3 pt-2">
        {channelType === 'telegram' && (
          <Button
            variant="outline"
            className="h-11 rounded-full text-sm font-medium"
            onClick={() => openExternal(BOTFATHER_URL)}
          >
            {wiz('openBotFather')}
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        )}
        {channelType === 'discord' && (
          <Button
            variant="outline"
            className="h-11 rounded-full text-sm font-medium"
            onClick={() => openExternal(DISCORD_PORTAL_URL)}
          >
            {wiz('openPortal')}
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        )}

        {channelType === 'whatsapp' ? (
          <Button
            className="h-11 rounded-full text-sm font-semibold"
            disabled={busy}
            onClick={() => {
              void startWhatsAppLogin();
            }}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {wiz('generating')}
              </>
            ) : (
              <>
                <QrCode className="h-4 w-4 mr-2" />
                {wiz('showQr')}
              </>
            )}
          </Button>
        ) : (
          <Button
            className="h-11 rounded-full text-sm font-semibold"
            onClick={() => {
              setErrors([]);
              setPhase('token');
            }}
          >
            {wiz('haveToken')}
          </Button>
        )}
      </div>
    </div>
  );

  const renderTokenStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-2">{wiz('tokenTitle')}</h3>
        <p className="text-sm text-foreground/70 leading-relaxed">{wiz('tokenIntro')}</p>
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="wizard-token" className="text-sm font-semibold text-foreground/80">
          {wiz('tokenLabel')}
        </Label>
        <div className="flex gap-2">
          <Input
            id="wizard-token"
            autoFocus
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={wiz('tokenPlaceholder')}
            className="h-11 rounded-xl font-mono text-sm"
          />
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl px-3 shrink-0"
            onClick={() => {
              void pasteFromClipboard(setToken);
            }}
          >
            <ClipboardPaste className="h-4 w-4 mr-1.5" />
            {t('wizard.paste')}
          </Button>
        </div>
      </div>

      {channelType === 'telegram' && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground/80">{wiz('whoTitle')}</p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => setWhoCanTalk('everyone')}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                whoCanTalk === 'everyone'
                  ? 'border-blue-500/60 bg-blue-500/5'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  whoCanTalk === 'everyone' ? 'border-blue-500 bg-blue-500' : 'border-black/25 dark:border-white/25',
                )}
              >
                {whoCanTalk === 'everyone' && <Check className="h-3 w-3 text-white" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">{wiz('whoEveryone')}</span>
                <span className="block text-xs text-foreground/60 mt-0.5 leading-relaxed">
                  {wiz('whoEveryoneHint')}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setWhoCanTalk('specific')}
              className={cn(
                'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                whoCanTalk === 'specific'
                  ? 'border-blue-500/60 bg-blue-500/5'
                  : 'border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  whoCanTalk === 'specific' ? 'border-blue-500 bg-blue-500' : 'border-black/25 dark:border-white/25',
                )}
              >
                {whoCanTalk === 'specific' && <Check className="h-3 w-3 text-white" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-foreground">{wiz('whoSpecific')}</span>
                <span className="block text-xs text-foreground/60 mt-0.5 leading-relaxed">
                  {wiz('whoSpecificHint')}
                </span>
              </span>
            </button>
          </div>

          {whoCanTalk === 'specific' && (
            <div className="space-y-2 pl-1">
              <Label htmlFor="wizard-allowed-ids" className="text-sm font-semibold text-foreground/80">
                {wiz('idsLabel')}
              </Label>
              <Input
                id="wizard-allowed-ids"
                value={allowedIds}
                onChange={(event) => setAllowedIds(event.target.value)}
                placeholder={wiz('idsPlaceholder')}
                className="h-11 rounded-xl font-mono text-sm"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full text-xs text-foreground/70"
                onClick={() => openExternal(USERINFOBOT_URL)}
              >
                {wiz('openUserInfoBot')}
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      <Button
        className="w-full h-11 rounded-full text-sm font-semibold"
        disabled={
          busy ||
          !token.trim() ||
          (channelType === 'telegram' && whoCanTalk === 'specific' && !allowedIds.trim())
        }
        onClick={() => {
          if (channelType === 'telegram') {
            void connectTelegram();
          } else {
            void verifyDiscordToken();
          }
        }}
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('wizard.connecting')}
          </>
        ) : channelType === 'telegram' ? (
          t('wizard.connect')
        ) : (
          t('wizard.continue')
        )}
      </Button>
    </div>
  );

  const renderDiscordInviteStep = () => {
    const inviteUrl = botId
      ? `https://discord.com/oauth2/authorize?client_id=${botId}&scope=bot&permissions=${DISCORD_INVITE_PERMISSIONS}`
      : DISCORD_PORTAL_URL;
    const inviteSteps = t('wizard.discord.inviteSteps', { returnObjects: true });
    const inviteStepList = Array.isArray(inviteSteps) ? (inviteSteps as string[]) : [];

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold text-foreground mb-2">{wiz('inviteTitle')}</h3>
          <p className="text-sm text-foreground/70 leading-relaxed">{wiz('inviteIntro')}</p>
        </div>

        <ol className="space-y-3">
          {inviteStepList.map((step, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-sm font-semibold text-foreground">
                {index + 1}
              </span>
              <span className="text-sm text-foreground/85 leading-relaxed pt-1">{step}</span>
            </li>
          ))}
        </ol>

        <Button
          variant="outline"
          className="w-full h-11 rounded-full text-sm font-medium"
          onClick={() => openExternal(inviteUrl)}
        >
          {wiz('inviteButton')}
          <ExternalLink className="h-4 w-4 ml-2" />
        </Button>

        <div className="space-y-2.5">
          <Label htmlFor="wizard-server-id" className="text-sm font-semibold text-foreground/80">
            {wiz('serverIdLabel')}
          </Label>
          <div className="flex gap-2">
            <Input
              id="wizard-server-id"
              value={serverId}
              onChange={(event) => setServerId(event.target.value)}
              placeholder={wiz('serverIdPlaceholder')}
              className="h-11 rounded-xl font-mono text-sm"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl px-3 shrink-0"
              onClick={() => {
                void pasteFromClipboard(setServerId);
              }}
            >
              <ClipboardPaste className="h-4 w-4 mr-1.5" />
              {t('wizard.paste')}
            </Button>
          </div>
        </div>

        <Button
          className="w-full h-11 rounded-full text-sm font-semibold"
          disabled={busy || !serverId.trim()}
          onClick={() => {
            void connectDiscord();
          }}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('wizard.connecting')}
            </>
          ) : (
            t('wizard.connect')
          )}
        </Button>
      </div>
    );
  };

  const renderQrStep = () => {
    const qrSteps = t('wizard.whatsapp.qrSteps', { returnObjects: true });
    const qrStepList = Array.isArray(qrSteps) ? (qrSteps as string[]) : [];

    return (
      <div className="space-y-6 text-center">
        <h3 className="text-xl font-semibold text-foreground">{wiz('qrTitle')}</h3>
        <div className="inline-block rounded-3xl border border-black/10 dark:border-white/10 bg-white p-4 shadow-sm">
          {qrCode ? (
            <img src={qrCode} alt="QR" className="h-56 w-56 rounded-xl object-contain" />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        <ol className="mx-auto max-w-xs space-y-1.5 text-left">
          {qrStepList.map((step, index) => (
            <li key={index} className="flex items-start gap-2 text-sm text-foreground/80">
              <span className="font-semibold text-foreground/60">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <Button
          variant="outline"
          className="h-10 rounded-full text-sm"
          disabled={busy}
          onClick={() => {
            void startWhatsAppLogin();
          }}
        >
          <RefreshCw className={cn('h-3.5 w-3.5 mr-2', busy && 'animate-spin')} />
          {wiz('refreshQr')}
        </Button>
      </div>
    );
  };

  const renderSuccess = () => (
    <div className="space-y-6 py-4 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
        <PartyPopper className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <h3 className="text-2xl font-semibold text-foreground mb-2">{wiz('successTitle')}</h3>
        <p className="text-sm text-foreground/70 leading-relaxed">
          {wiz('successBody', { bot: botUsername || channelType })}
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {channelType === 'telegram' && botUsername && (
          <Button
            className="h-11 rounded-full px-6 text-sm font-semibold"
            onClick={() => openExternal(`https://t.me/${botUsername}`)}
          >
            {wiz('openBot')}
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
        )}
        <Button
          variant={channelType === 'telegram' && botUsername ? 'outline' : 'default'}
          className="h-11 rounded-full px-6 text-sm font-semibold"
          onClick={onClose}
        >
          {t('wizard.done')}
        </Button>
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <Card
        data-testid="channel-wizard"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border-0 bg-surface-modal shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-3 pb-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/5 bg-black/5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <img src={WIZARD_ICONS[channelType]} alt="" className="h-6 w-6 dark:invert" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate font-serif text-2xl font-normal tracking-tight">
                {wiz('title')}
              </CardTitle>
              {phase !== 'success' && (
                <p className="mt-0.5 text-xs font-medium text-foreground/50">
                  {t('wizard.stepOf', { current: stepIndex + 1, total: totalSteps })}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-6 pt-4">
          {errors.length > 0 && (
            <div className="mb-5 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0 text-destructive">
                  <p className="mb-1 font-semibold">{t('wizard.errorTitle')}</p>
                  <ul className="list-inside list-disc space-y-0.5">
                    {errors.map((error, index) => (
                      <li key={index} className="break-words">
                        {error}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-xs text-destructive/80">{t('wizard.errorHint')}</p>
                </div>
              </div>
            </div>
          )}

          {phase === 'guide' && renderGuide()}
          {phase === 'token' && renderTokenStep()}
          {phase === 'invite' && renderDiscordInviteStep()}
          {phase === 'qr' && renderQrStep()}
          {phase === 'success' && renderSuccess()}

          {phase !== 'guide' && phase !== 'success' && (
            <Button
              variant="ghost"
              className="mt-5 h-9 rounded-full px-4 text-sm text-foreground/60 hover:text-foreground"
              onClick={goBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('wizard.back')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ChannelWizard;
