export const PROJECT_ANALYSIS_RULES = {
  allowedExtensions: [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.cs', '.php', '.swift', '.html', '.css',
    '.scss', '.sass', '.less', '.vue', '.svelte', '.dart', '.json', '.md'
  ],
  ignoredDirectories: [
    'node_modules', '.git', '.angular', 'worktrees', 'worktree', '.worktrees', '.worktree',
    'dist', 'build', 'out', 'target', 'venv', '.venv', 'env', '.env',
    'virtualenv', '.virtualenv', '__pycache__', '.pytest_cache', '.mypy_cache',
    '.ruff_cache', 'site-packages', 'dist-packages', 'pip-packages', 'Lib', 'lib64',
    'Scripts', 'Include', 'conda-meta', '.conda', 'envs', '.envs',
    '.next', '.nuxt', '.svelte-kit', '.turbo', '.output', '.cache', '.vite', '.vscode', '.idea', 'vendor', 'coverage',
    'tmp', 'temp', '.sass-cache', '.parcel-cache', 'public/build',
    'node_modules_old', 'bower_components',
    'jspm_packages', '.npm', '.yarn', '.pnpm', 'obj', 'bin', 'debug', 'release',
    'ios', 'android', '.expo', 'Pods', '.gradle', 'fastlane',
    'assets', 'static', 'public', 'images', 'img', 'media', 'fonts', 'locales',
    'i18n', 'screenshots', 'videos', 'uploads', 'backups',
    'docs', 'documentation', '__tests__', 'tests', 'test', 'spec', 'e2e',
    '.dart_tool',
    // Carpetas de config de asistentes/agentes de IA y editores (no son código del proyecto)
    '.claude', '.cursor', '.windsurf', '.continue', '.aider', '.aider.tags.cache.v3',
    '.copilot', '.github-copilot', '.zed', '.trae', '.codeium', '.amazonq', '.qodo',
    '.mimocode', '.vs', '.history',
    // Exportes propios de ProjectGrapher (snapshots, briefs, etc.). Si no se
    // ignoran, un análisis posterior del mismo proyecto los vuelve a leer como
    // "código fuente" y contamina la detección de stack con menciones de texto
    // de proyectos ya analizados anteriormente.
    'contexto',
    // Servidor MCP auxiliar de ProjectGrapher: es una herramienta de soporte
    // para agentes, no arquitectura del proyecto en sí. Si no se ignora,
    // contamina hotspots/entry points/capas con su propio server.py.
    'mcp_server'
  ],
  ignoredFiles: [
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'composer.lock', 'Gemfile.lock', '.DS_Store', 'thumbs.db',
    '.env', '.env.local', '.env.development.local', 'pip-log.txt',
    'npm-debug.log', 'yarn-debug.log', 'yarn-error.log',
    'LICENSE', 'CONTRIBUTING.md', 'CHANGELOG.md',
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
