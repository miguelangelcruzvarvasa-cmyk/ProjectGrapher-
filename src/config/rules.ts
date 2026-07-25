export const TOPOLOGY_ANALYSIS_RULES = {
  allowedExtensions: [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java',
    '.cs', '.php', '.sql', '.json', '.yaml', '.yml', '.html', '.css', '.scss', '.vue', '.svelte'
  ],
  ignoredDirectories: [
    'node_modules', '.git', '.claude', '.angular', 'worktrees', 'worktree', '.worktrees',
    'dist', 'build', 'out', 'target', 'venv', '.venv', 'env', '.env',
    'virtualenv', '__pycache__', '.pytest_cache', '.mypy_cache',
    'site-packages', 'dist-packages', '.next', '.nuxt', '.svelte-kit', '.turbo',
    '.output', '.cache', '.vite', '.vscode', '.idea', 'vendor', 'coverage',
    'tmp', 'temp', '.sass-cache', '.npm', '.yarn', '.pnpm', 'ios', 'android'
  ],
  ignoredFiles: [
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock',
    '.DS_Store', 'thumbs.db', '.env', 'README.md', 'LICENSE'
  ],
  maxFileSizeBytes: 1024 * 1024 // 1 MB
} as const;

export const REPO_TYPE_COLORS: Record<string, string> = {
  frontend: '#3b82f6',   // Blue
  backend: '#10b981',    // Emerald
  database: '#f59e0b',   // Amber
  microservice: '#8b5cf6',// Purple
  library: '#ec4899',    // Pink
  unknown: '#6b7280'     // Gray
};
