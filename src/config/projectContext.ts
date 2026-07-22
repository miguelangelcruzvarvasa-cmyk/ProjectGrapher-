export const PROJECT_ANALYSIS_RULES = {
  allowedExtensions: [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.cs', '.php', '.swift', '.html', '.css',
    '.scss', '.sass', '.less', '.vue', '.svelte', '.dart'
  ],
  ignoredDirectories: [
    'node_modules', '.git', 'dist', 'build', 'venv', '.venv', 'env', '.env',
    'virtualenv', '.virtualenv', '__pycache__', '.pytest_cache', '.mypy_cache',
    '.ruff_cache', 'site-packages', 'dist-packages', 'pip-packages', 'Lib', 'lib64',
    'Scripts', 'Include', 'conda-meta', '.conda', 'envs', '.envs',
    '.next', '.cache', '.vscode', '.idea', 'vendor', 'coverage',
    'tmp', 'temp', '.sass-cache', '.parcel-cache', 'public/build',
    'out', 'target', 'node_modules_old', 'bower_components',
    'jspm_packages', '.npm', '.yarn', '.pnpm', 'obj', 'bin', 'debug', 'release',
    'ios', 'android', '.expo', 'Pods', '.gradle', 'fastlane',
    'assets', 'static', 'public', 'images', 'img', 'media', 'fonts', 'locales',
    'i18n', 'screenshots', 'videos', 'uploads', 'backups',
    'docs', 'documentation', '__tests__', 'tests', 'test', 'spec', 'e2e',
    '.dart_tool'
  ],
  ignoredFiles: [
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'composer.lock', 'Gemfile.lock', '.DS_Store', 'thumbs.db',
    '.env', '.env.local', '.env.development.local', 'pip-log.txt',
    'npm-debug.log', 'yarn-debug.log', 'yarn-error.log',
    'README.md', 'LICENSE', 'CONTRIBUTING.md', 'CHANGELOG.md',
    'pubspec.lock'
  ],
  maxFileSizeBytes: 1024 * 1024
} as const;

export const CONTEXT_WORKBENCH_DEFAULTS = {
  agentTask: '',
  errorTraceInput: '',
  semanticQuery: '',
  memoryNote: '',
  semanticPlaceholder: 'Describe la intención funcional que quieres ubicar dentro del proyecto.',
  taskPlaceholder: 'Describe la tarea concreta que quieres delegar al agente.',
  errorPlaceholder: 'Pega aquí el error o stack trace real del proyecto cargado.',
  projectMemoryPlaceholder: 'Escribe notas persistentes del proyecto, riesgos y decisiones útiles para futuras sesiones.'
} as const;

export const SNAPSHOT_EXPORT_CONFIG = {
  deterministicExportName: 'snapshot.md',
  aiExportName: 'agent_handoff_ai.md',
  maxHotspots: 6,
  maxNodeConnectionsPerHotspot: 5,
  maxDirectories: 8,
  maxEntryPoints: 6,
  maxGraphLeaders: 8,
  maxSourceGroups: 5,
  maxFilesPerSourceGroup: 3,
  maxCriticalFlows: 4,
  maxFilesPerFlow: 4,
  maxLayerFiles: 6
} as const;
