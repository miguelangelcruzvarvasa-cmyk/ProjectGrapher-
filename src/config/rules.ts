import { PROJECT_ANALYSIS_RULES } from './projectContext';

// Comparte lista de directorios/archivos ignorados con el motor single-repo
// (PROJECT_ANALYSIS_RULES) para no desincronizar los filtros de ruido entre modos.
export const TOPOLOGY_ANALYSIS_RULES = {
  allowedExtensions: [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java',
    '.cs', '.php', '.sql', '.json', '.yaml', '.yml', '.html', '.css', '.scss', '.vue', '.svelte'
  ],
  ignoredDirectories: PROJECT_ANALYSIS_RULES.ignoredDirectories,
  ignoredFiles: PROJECT_ANALYSIS_RULES.ignoredFiles,
  maxFileSizeBytes: PROJECT_ANALYSIS_RULES.maxFileSizeBytes
} as const;

export const REPO_TYPE_COLORS: Record<string, string> = {
  frontend: '#3b82f6',   // Blue
  backend: '#10b981',    // Emerald
  database: '#f59e0b',   // Amber
  microservice: '#8b5cf6',// Purple
  library: '#ec4899',    // Pink
  unknown: '#6b7280'     // Gray
};
