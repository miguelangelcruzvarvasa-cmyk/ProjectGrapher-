import { AI_PROVIDER_DICTIONARY, AI_PROVIDER_FALLBACK, AIProviderId } from './aiProviders';

const ENV = import.meta.env as Record<string, string | undefined>;

export const DEFAULT_AI_PROVIDER = AI_PROVIDER_FALLBACK;

export const DEFAULT_AI_MODELS: Record<string, string> = Object.fromEntries(
  Object.values(AI_PROVIDER_DICTIONARY).map((provider) => [
    provider.id,
    ENV[provider.defaultModelEnv] || ''
  ])
);

export const getDefaultAiModel = (provider: string) =>
  DEFAULT_AI_MODELS[provider as AIProviderId] || ENV.VITE_DEFAULT_FALLBACK_MODEL || '';
