const ENV = import.meta.env as Record<string, string | undefined>;

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isDev = import.meta.env.DEV;

export const APP_CONFIG = {
  projectFallbackName: ENV.VITE_PROJECT_FALLBACK_NAME || 'Unnamed Project',
  contextDirectoryLabel: ENV.VITE_CONTEXT_DIRECTORY_LABEL || 'contexto',
  frontendPort: parseNumber(ENV.VITE_FRONTEND_PORT, 3000),
  backendPort: parseNumber(ENV.PORT, 8080),
  backendHost: ENV.VITE_API_HOST || '127.0.0.1',
  apiBaseUrl: ENV.VITE_API_URL || '',
  customProviderUrlPlaceholder: ENV.VITE_CUSTOM_PROVIDER_URL_PLACEHOLDER || 'https://api.your-provider.com/v1',
  providerKeyPlaceholder: ENV.VITE_PROVIDER_KEY_PLACEHOLDER || 'sk-...'
} as const;

export const resolveContextDirectoryLabel = (projectName?: string | null) =>
  `${APP_CONFIG.contextDirectoryLabel}/${projectName || APP_CONFIG.projectFallbackName}`;
