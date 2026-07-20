import { APP_CONFIG } from './appConfig';

const ENV = import.meta.env as Record<string, string | undefined>;

export const AI_PROVIDER_OPTIONS = [
  {
    id: 'gemini',
    label: ENV.VITE_LABEL_GEMINI || 'Google Gemini',
    shortLabel: ENV.VITE_SHORT_LABEL_GEMINI || 'Gemini',
    defaultModelEnv: 'VITE_DEFAULT_GEMINI_MODEL',
    serverKeyEnv: 'GEMINI_API_KEY'
  },
  {
    id: 'openai',
    label: ENV.VITE_LABEL_OPENAI || 'OpenAI',
    shortLabel: ENV.VITE_SHORT_LABEL_OPENAI || 'OpenAI',
    defaultModelEnv: 'VITE_DEFAULT_OPENAI_MODEL',
    serverKeyEnv: 'OPENAI_API_KEY'
  },
  {
    id: 'groq',
    label: ENV.VITE_LABEL_GROQ || 'Groq',
    shortLabel: ENV.VITE_SHORT_LABEL_GROQ || 'Groq',
    defaultModelEnv: 'VITE_DEFAULT_GROQ_MODEL',
    serverKeyEnv: 'GROQ_API_KEY'
  },
  {
    id: 'deepseek',
    label: ENV.VITE_LABEL_DEEPSEEK || 'DeepSeek',
    shortLabel: ENV.VITE_SHORT_LABEL_DEEPSEEK || 'DeepSeek',
    defaultModelEnv: 'VITE_DEFAULT_DEEPSEEK_MODEL',
    serverKeyEnv: 'DEEPSEEK_API_KEY'
  },
  {
    id: 'openrouter',
    label: ENV.VITE_LABEL_OPENROUTER || 'OpenRouter',
    shortLabel: ENV.VITE_SHORT_LABEL_OPENROUTER || 'OpenRouter',
    defaultModelEnv: 'VITE_DEFAULT_OPENROUTER_MODEL',
    serverKeyEnv: 'OPENROUTER_API_KEY'
  },
  {
    id: 'mistral',
    label: ENV.VITE_LABEL_MISTRAL || 'Mistral AI',
    shortLabel: ENV.VITE_SHORT_LABEL_MISTRAL || 'Mistral',
    defaultModelEnv: 'VITE_DEFAULT_MISTRAL_MODEL',
    serverKeyEnv: 'MISTRAL_API_KEY'
  },
  {
    id: 'ollama',
    label: ENV.VITE_LABEL_OLLAMA || 'Ollama (Local)',
    shortLabel: ENV.VITE_SHORT_LABEL_OLLAMA || 'Ollama',
    defaultModelEnv: 'VITE_DEFAULT_OLLAMA_MODEL',
    serverKeyEnv: ''
  },
  {
    id: 'custom',
    label: ENV.VITE_LABEL_CUSTOM || 'Personalizado',
    shortLabel: ENV.VITE_SHORT_LABEL_CUSTOM || 'Proveedor personalizado',
    defaultModelEnv: 'VITE_DEFAULT_FALLBACK_MODEL',
    serverKeyEnv: 'CUSTOM_PROVIDER_KEY'
  }
] as const;

export type AIProviderId = typeof AI_PROVIDER_OPTIONS[number]['id'];

export const AI_PROVIDER_DICTIONARY = Object.fromEntries(
  AI_PROVIDER_OPTIONS.map((provider) => [provider.id, provider])
) as Record<AIProviderId, typeof AI_PROVIDER_OPTIONS[number]>;

export const AI_PROVIDER_FALLBACK = (ENV.VITE_DEFAULT_AI_PROVIDER as AIProviderId | undefined) || 'gemini';

export const AI_PROVIDER_INPUTS = {
  keyPlaceholder: APP_CONFIG.providerKeyPlaceholder,
  customUrlPlaceholder: APP_CONFIG.customProviderUrlPlaceholder
} as const;
