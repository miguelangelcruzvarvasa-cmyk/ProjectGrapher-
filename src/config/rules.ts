export const TOPOLOGY_ANALYSIS_RULES = {
  allowedExtensions: [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java',
    '.cs', '.php', '.swift', '.html', '.css', '.scss', '.vue', '.svelte', '.sql'
  ],
  ignoredDirectories: [
    'node_modules', '.git', '.claude', '.angular', 'dist', 'build', 'target',
    'venv', '.venv', '__pycache__', '.next', '.nuxt', '.turbo', 'vendor'
  ],
  ignoredFiles: [
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock', '.DS_Store'
  ],
  maxFileSizeBytes: 1024 * 1024
} as const;
