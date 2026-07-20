import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronLeft,
  ExternalLink,
  KeyRound,
  Loader2,
  LockKeyhole,
  MessageSquareMore,
  PlugZap,
  Puzzle,
  Repeat2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TitleBar } from '@/components/layout/TitleBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useSettingsStore } from '@/stores/settings';
import { useGatewayStore } from '@/stores/gateway';
import { hostApi } from '@/lib/host-api';
import { hostEvents } from '@/lib/host-events';
import logo from '@/assets/logo.svg';

const COMPOSIO_KEYS_URL = 'https://platform.composio.dev/settings';
const AGENT_SUGGESTIONS = ['Luna', 'Alex', 'Friday'];
const STEP_IDS = ['welcome', 'identity', 'model', 'connectors', 'capabilities', 'complete'] as const;
type StepId = (typeof STEP_IDS)[number];

type ChatGptState = 'idle' | 'connecting' | 'connected' | 'error';
type ManualOAuth = { authorizationUrl: string; message?: string } | null;

export function Setup() {
  const { t } = useTranslation('setup');
  const navigate = useNavigate();
  const markSetupComplete = useSettingsStore((state) => state.markSetupComplete);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const gatewayStatus = useGatewayStore((state) => state.status);
  const startGateway = useGatewayStore((state) => state.start);
  const [stepIndex, setStepIndex] = useState(0);
  const [agentName, setAgentName] = useState('Luna');
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [chatGptState, setChatGptState] = useState<ChatGptState>('idle');
  const [chatGptError, setChatGptError] = useState<string | null>(null);
  const [manualOAuth, setManualOAuth] = useState<ManualOAuth>(null);
  const [manualCode, setManualCode] = useState('');
  const [composioKey, setComposioKey] = useState('');
  const [composioReady, setComposioReady] = useState(false);
  const [configuringComposio, setConfiguringComposio] = useState(false);
  const [selectedBundles, setSelectedBundles] = useState<string[]>(['skills', 'automation', 'plugins']);
  const [readinessStarted, setReadinessStarted] = useState(false);

  const stepId: StepId = STEP_IDS[stepIndex] ?? 'welcome';
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEP_IDS.length - 1;
  const canContinue = stepId !== 'identity' || agentName.trim().length > 0;

  useEffect(() => {
    void hostApi.composio.getConfig().then((config) => setComposioReady(config.sessionReady)).catch(() => {});
    void hostApi.providers.accounts().then((accounts) => {
      if (accounts.some((account) => account.vendorId === 'openai' && account.authMode === 'oauth_browser')) {
        setChatGptState('connected');
      }
    }).catch(() => {});
    void hostApi.agents.list().then((snapshot) => {
      const current = snapshot.agents.find((agent) => agent.id === snapshot.defaultAgentId) ?? snapshot.agents[0];
      if (current?.name && current.name.toLowerCase() !== 'main') setAgentName(current.name);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const offCode = hostEvents.onOAuthCode((payload) => {
      if ('mode' in payload && payload.mode === 'manual') {
        setManualOAuth({ authorizationUrl: payload.authorizationUrl, message: payload.message });
      }
      setChatGptError(null);
    });
    const offSuccess = hostEvents.onOAuthSuccess((payload) => {
      if (payload.provider !== 'openai') return;
      setChatGptState('connected');
      setManualOAuth(null);
      setManualCode('');
      setChatGptError(null);
    });
    const offError = hostEvents.onOAuthError((payload) => {
      setChatGptState('error');
      setChatGptError(payload.message);
    });
    return () => { offCode(); offSuccess(); offError(); };
  }, []);

  useEffect(() => {
    if (stepId !== 'complete' || readinessStarted) return;
    setReadinessStarted(true);
    if (gatewayStatus.state === 'stopped' || gatewayStatus.state === 'error') {
      void startGateway().catch(() => {});
    }
    void hostApi.uv.installAll().catch(() => {});
  }, [gatewayStatus.state, readinessStarted, startGateway, stepId]);

  const saveAgentIdentity = useCallback(async () => {
    const name = agentName.trim();
    if (!name) return;
    setSavingIdentity(true);
    try {
      const snapshot = await hostApi.agents.list();
      const defaultAgent = snapshot.agents.find((agent) => agent.id === snapshot.defaultAgentId) ?? snapshot.agents[0];
      if (defaultAgent && defaultAgent.name !== name) {
        await hostApi.agents.update(defaultAgent.id, { name });
      }
    } finally {
      setSavingIdentity(false);
    }
  }, [agentName]);

  const handleNext = async () => {
    if (isLast) {
      markSetupComplete();
      navigate('/');
      return;
    }
    if (stepId === 'identity') await saveAgentIdentity();
    if (stepId === 'capabilities') {
      await hostApi.settings.setMany({ selectedBundles }).catch(() => {});
    }
    setStepIndex((current) => Math.min(current + 1, STEP_IDS.length - 1));
  };

  const handleSkipSetup = () => {
    markSetupComplete();
    navigate('/');
  };

  const startChatGptSignIn = async () => {
    setChatGptState('connecting');
    setChatGptError(null);
    setManualOAuth(null);
    try {
      await hostApi.providers.requestOAuth({ provider: 'openai', accountId: 'openai', label: 'ChatGPT' });
    } catch (error) {
      setChatGptState('error');
      setChatGptError(String(error));
    }
  };

  const cancelChatGptSignIn = async () => {
    await hostApi.providers.cancelOAuth().catch(() => {});
    setChatGptState('idle');
    setManualOAuth(null);
    setManualCode('');
  };

  const submitManualOAuth = async () => {
    if (!manualCode.trim()) return;
    try {
      await hostApi.providers.submitOAuth({ code: manualCode.trim() });
    } catch (error) {
      setChatGptError(String(error));
    }
  };

  const setupComposio = async () => {
    if (!composioKey.trim()) return;
    setConfiguringComposio(true);
    try {
      await hostApi.composio.initialize({ apiKey: composioKey.trim() });
      setComposioKey('');
      setComposioReady(true);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setConfiguringComposio(false);
    }
  };

  const progress = ((stepIndex + 1) / STEP_IDS.length) * 100;

  return (
    <div data-testid="setup-page" className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar />
      <div className="h-1 bg-black/5 dark:bg-white/5"><motion.div className="h-full bg-brand" animate={{ width: `${progress}%` }} /></div>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-8 pb-8 pt-10">
          <header className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src={logo} alt="Claw OS" className="h-8 w-8" />
              <span className="font-semibold">Claw OS</span>
            </div>
            <span className="text-meta font-medium text-muted-foreground">{stepIndex + 1} / {STEP_IDS.length}</span>
          </header>

          <AnimatePresence mode="wait">
            <motion.section key={stepId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
              <div className="mb-8 text-center">
                <h1 className="mb-2 font-serif text-4xl font-normal tracking-tight md:text-5xl">{t(`steps.${stepId}.title`)}</h1>
                <p className="text-subtitle font-medium text-foreground/65">{t(`steps.${stepId}.description`)}</p>
              </div>

              <div className="flex-1 rounded-3xl border border-border/70 bg-card p-7 shadow-sm md:p-10">
                {stepId === 'welcome' && (
                  <div data-testid="setup-welcome-step" className="space-y-8">
                    <div className="text-center">
                      <Badge className="mb-5 border-0 bg-brand/10 text-brand"><Sparkles className="mr-1 h-3.5 w-3.5" />{t('welcome.eyebrow')}</Badge>
                      <h2 className="mb-3 font-serif text-3xl font-normal tracking-tight">{t('welcome.title')}</h2>
                      <p className="mx-auto max-w-xl leading-7 text-muted-foreground">{t('welcome.description')}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {([
                        ['talk', MessageSquareMore],
                        ['connect', PlugZap],
                        ['grow', Puzzle],
                      ] as const).map(([key, Icon]) => (
                        <div key={key} className="rounded-2xl bg-surface-input/70 p-4 text-center"><Icon className="mx-auto mb-3 h-5 w-5 text-brand" /><p className="text-sm font-medium">{t(`welcome.features.${key}`)}</p></div>
                      ))}
                    </div>
                    <div>
                      <p className="mb-3 text-center text-sm font-medium">{t('welcome.language')}</p>
                      <div className="flex justify-center gap-2">
                        {SUPPORTED_LANGUAGES.map((item) => (
                          <Button key={item.code} data-testid={`setup-language-${item.code}`} variant={language === item.code ? 'secondary' : 'outline'} className={cn('rounded-full px-6', language === item.code && 'bg-black/5 dark:bg-white/10')} onClick={() => setLanguage(item.code)}>{item.label}</Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {stepId === 'identity' && (
                  <div className="mx-auto max-w-xl space-y-7">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-brand/10 text-brand"><Bot className="h-10 w-10" /></div>
                    <div>
                      <label htmlFor="agent-name" className="mb-2 block text-sm font-semibold">{t('identity.label')}</label>
                      <Input id="agent-name" data-testid="setup-agent-name" autoFocus value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder={t('identity.placeholder')} className="h-13 rounded-xl bg-surface-input text-lg" maxLength={48} />
                    </div>
                    <div>
                      <p className="mb-2 text-meta text-muted-foreground">{t('identity.suggestions')}</p>
                      <div className="flex flex-wrap gap-2">{AGENT_SUGGESTIONS.map((name) => <Button key={name} variant="outline" size="sm" className="rounded-full" onClick={() => setAgentName(name)}>{name}</Button>)}</div>
                    </div>
                    <p className="flex items-center gap-2 text-meta text-muted-foreground"><LockKeyhole className="h-4 w-4" />{t('identity.private')}</p>
                  </div>
                )}

                {stepId === 'model' && (
                  <div className="space-y-4">
                    <div className={cn('rounded-2xl border p-5', chatGptState === 'connected' ? 'border-green-500/30 bg-green-500/5' : 'border-brand/25 bg-brand/5')}>
                      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
                        <div className="flex gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background"><BrainCircuit className="h-6 w-6" /></div><div><div className="mb-1 flex items-center gap-2"><h2 className="font-semibold">{t('model.chatgptTitle')}</h2><Badge className="border-0 bg-brand/10 text-brand">{t('model.recommended')}</Badge></div><p className="max-w-lg text-sm leading-6 text-muted-foreground">{t('model.chatgptDescription')}</p></div></div>
                        <Button data-testid="setup-chatgpt-signin" className="shrink-0 rounded-xl" disabled={chatGptState === 'connecting' || chatGptState === 'connected'} onClick={() => void startChatGptSignIn()}>{chatGptState === 'connecting' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{chatGptState === 'connected' && <CheckCircle2 className="mr-2 h-4 w-4" />}{chatGptState === 'connected' ? t('model.connected') : chatGptState === 'connecting' ? t('model.signingIn') : t('model.signIn')}</Button>
                      </div>
                      <p className="mt-4 flex items-center gap-2 text-meta text-muted-foreground"><ShieldCheck className="h-4 w-4" />{t('model.subscriptionNote')}</p>
                    </div>
                    {manualOAuth && <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5"><h3 className="font-semibold">{t('model.manualTitle')}</h3><p className="mt-1 text-sm text-muted-foreground">{manualOAuth.message || t('model.manualDescription')}</p><div className="mt-4 flex gap-2"><Input data-testid="setup-chatgpt-manual-code" value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder={t('model.manualPlaceholder')} className="bg-surface-input" /><Button onClick={() => void submitManualOAuth()}>{t('model.submitCode')}</Button></div><Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => void cancelChatGptSignIn()}>{t('model.cancel')}</Button></div>}
                    {chatGptError && <p className="text-sm text-red-700 dark:text-red-400">{t('model.error', { error: chatGptError })}</p>}
                    <div className="rounded-2xl border border-border/70 p-5"><h2 className="font-semibold">{t('model.otherTitle')}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{t('model.otherDescription')}</p></div>
                  </div>
                )}

                {stepId === 'connectors' && (
                  <div className="mx-auto max-w-xl text-center">
                    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand/10 text-brand"><PlugZap className="h-8 w-8" /></div>
                    <h2 className="mb-3 font-serif text-3xl font-normal tracking-tight">{t('connectors.title')}</h2>
                    <p className="mb-7 leading-7 text-muted-foreground">{t('connectors.description')}</p>
                    {composioReady ? <div data-testid="setup-composio-ready" className="rounded-2xl border border-green-500/25 bg-green-500/5 p-5 text-green-700 dark:text-green-400"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" /><p className="font-semibold">{t('connectors.enabled')}</p><p className="mt-1 text-sm text-muted-foreground">{t('connectors.browseLater')}</p></div> : <><label htmlFor="setup-composio-key" className="mb-2 block text-left text-sm font-semibold">{t('connectors.apiKey')}</label><div className="flex flex-col gap-2 sm:flex-row"><Input id="setup-composio-key" data-testid="setup-composio-key" type="password" autoComplete="off" value={composioKey} onChange={(event) => setComposioKey(event.target.value)} placeholder={t('connectors.placeholder')} className="h-11 bg-surface-input" /><Button data-testid="setup-composio-submit" className="h-11 shrink-0 rounded-xl" disabled={!composioKey.trim() || configuringComposio} onClick={() => void setupComposio()}>{configuringComposio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}{configuringComposio ? t('connectors.enabling') : t('connectors.enable')}</Button></div><Button variant="ghost" className="mt-3 text-meta text-muted-foreground" onClick={() => void hostApi.shell.openExternal(COMPOSIO_KEYS_URL)}>{t('connectors.getKey')}<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Button></>}
                  </div>
                )}

                {stepId === 'capabilities' && (
                  <div className="space-y-3">
                    <p className="pb-2 text-center text-sm text-muted-foreground">{t('capabilities.selectHint')}</p>
                    {([
                      ['skills', Puzzle],
                      ['automation', Repeat2],
                      ['plugins', PlugZap],
                    ] as const).map(([key, Icon]) => {
                      const selected = selectedBundles.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          data-testid={`setup-capability-${key}`}
                          aria-pressed={selected}
                          onClick={() => setSelectedBundles((current) => (
                            current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
                          ))}
                          className={cn(
                            'flex w-full items-center gap-4 rounded-2xl border p-5 text-left transition-colors',
                            selected
                              ? 'border-brand/25 bg-brand/5'
                              : 'border-border/70 bg-surface-input/70 hover:bg-black/5 dark:hover:bg-white/10',
                          )}
                        >
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon className="h-5 w-5" /></div>
                          <div className="flex-1"><h2 className="font-semibold">{t(`capabilities.${key}Title`)}</h2><p className="mt-1 text-sm text-muted-foreground">{t(`capabilities.${key}Description`)}</p></div>
                          <span className={cn('flex items-center gap-1.5 text-meta font-semibold', selected ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')}>
                            {selected && <CheckCircle2 className="h-5 w-5" />}
                            {t(selected ? 'capabilities.selected' : 'capabilities.notSelected')}
                          </span>
                        </button>
                      );
                    })}
                    <div className="pt-4 text-center"><p className="text-sm font-medium">{t('capabilities.managed')}</p><p className="mt-1 text-meta text-muted-foreground">{t('capabilities.customizeLater')}</p></div>
                  </div>
                )}

                {stepId === 'complete' && (
                  <div className="text-center">
                    <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-green-500/10 text-green-700 dark:text-green-400"><Sparkles className="h-10 w-10" /></div>
                    <h2 className="mb-2 font-serif text-3xl font-normal tracking-tight">{t('complete.title', { name: agentName.trim() || 'Luna' })}</h2>
                    <p className="mx-auto mb-7 max-w-xl leading-7 text-muted-foreground">{t('complete.subtitle')}</p>
                    <div className="mx-auto grid max-w-2xl gap-3 text-left sm:grid-cols-2">
                      <ReadyCard label={t('complete.agent')} value={agentName.trim()} />
                      <ReadyCard label={t('complete.model')} value={chatGptState === 'connected' ? 'ChatGPT' : t('complete.later')} />
                      <ReadyCard label={t('complete.connectors')} value={composioReady ? t('complete.connected') : t('complete.later')} />
                      <ReadyCard label={t('complete.capabilities')} value={t('complete.capabilityCount', { count: selectedBundles.length })} />
                    </div>
                    <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">{gatewayStatus.state === 'running' && gatewayStatus.gatewayReady !== false ? <CheckCircle2 className="h-4 w-4 text-green-700 dark:text-green-400" /> : <Loader2 className="h-4 w-4 animate-spin" />}{gatewayStatus.state === 'running' && gatewayStatus.gatewayReady !== false ? t('complete.gatewayReady') : t('complete.gatewayStarting')}</p>
                    <div className="mx-auto mt-5 max-w-md rounded-2xl bg-brand/5 p-4 text-sm font-medium text-brand">{t('complete.firstPrompt')}</div>
                  </div>
                )}
              </div>
            </motion.section>
          </AnimatePresence>

          <footer className="mx-auto mt-6 flex w-full max-w-3xl items-center justify-between gap-3">
            <div>{!isFirst && <Button variant="ghost" onClick={() => setStepIndex((current) => Math.max(0, current - 1))}><ChevronLeft className="mr-2 h-4 w-4" />{t('nav.back')}</Button>}</div>
            <div className="flex items-center gap-2">
              {!isLast && <Button data-testid="setup-skip-button" variant="ghost" className="text-muted-foreground" onClick={handleSkipSetup}>{t('nav.skipSetup')}</Button>}
              <Button data-testid="setup-next-button" className="rounded-xl px-5" disabled={!canContinue || savingIdentity} onClick={() => void handleNext()}>{savingIdentity && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isLast ? t('nav.getStarted') : t('nav.next')}{!isLast && <ArrowRight className="ml-2 h-4 w-4" />}</Button>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}

function ReadyCard({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-input/70 p-4"><span className="text-sm text-muted-foreground">{label}</span><span className="flex items-center gap-1.5 text-sm font-semibold"><Check className="h-4 w-4 text-green-700 dark:text-green-400" />{value}</span></div>;
}

export default Setup;
