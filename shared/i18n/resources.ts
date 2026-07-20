import type { LanguageCode } from '../language';

// EN
import enCommon from './locales/en/common.json';
import enSettings from './locales/en/settings.json';
import enDashboard from './locales/en/dashboard.json';
import enChat from './locales/en/chat.json';
import enChannels from './locales/en/channels.json';
import enAgents from './locales/en/agents.json';
import enSkills from './locales/en/skills.json';
import enCron from './locales/en/cron.json';
import enDreams from './locales/en/dreams.json';
import enSetup from './locales/en/setup.json';
import enMenu from './locales/en/menu.json';
import enConnectors from './locales/en/connectors.json';

// ES
import esCommon from './locales/es/common.json';
import esSettings from './locales/es/settings.json';
import esDashboard from './locales/es/dashboard.json';
import esChat from './locales/es/chat.json';
import esChannels from './locales/es/channels.json';
import esAgents from './locales/es/agents.json';
import esSkills from './locales/es/skills.json';
import esCron from './locales/es/cron.json';
import esDreams from './locales/es/dreams.json';
import esSetup from './locales/es/setup.json';
import esMenu from './locales/es/menu.json';
import esConnectors from './locales/es/connectors.json';

export const I18N_NAMESPACES = [
  'common',
  'settings',
  'dashboard',
  'chat',
  'channels',
  'agents',
  'skills',
  'cron',
  'dreams',
  'setup',
  'menu',
  'connectors',
] as const;

export const I18N_RESOURCES = {
  en: {
    common: enCommon,
    settings: enSettings,
    dashboard: enDashboard,
    chat: enChat,
    channels: enChannels,
    agents: enAgents,
    skills: enSkills,
    cron: enCron,
    dreams: enDreams,
    setup: enSetup,
    menu: enMenu,
    connectors: enConnectors,
  },
  es: {
    common: esCommon,
    settings: esSettings,
    dashboard: esDashboard,
    chat: esChat,
    channels: esChannels,
    agents: esAgents,
    skills: esSkills,
    cron: esCron,
    dreams: esDreams,
    setup: esSetup,
    menu: esMenu,
    connectors: esConnectors,
  },
} as const;

export type MenuLabels = typeof enMenu;

export const MENU_LABELS: Record<LanguageCode, MenuLabels> = {
  en: enMenu,
  es: esMenu,
};
