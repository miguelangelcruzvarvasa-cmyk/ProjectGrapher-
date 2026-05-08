
import { ProjectFile, TreeNode, GraphLink } from '../types';

const ALLOWED_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', 
  '.c', '.cpp', '.h', '.cs', '.php', '.swift', '.html', '.css', 
  '.scss', '.sass', '.less', '.vue', '.svelte'
];
const IGNORED_DIRS = [
  // Dependencies & Build
  'node_modules', '.git', 'dist', 'build', 'venv', '__pycache__', 
  '.next', '.cache', '.vscode', '.idea', 'vendor', 'coverage', 
  'tmp', 'temp', '.sass-cache', '.parcel-cache', 'public/build',
  'out', 'target', 'node_modules_old', 'bower_components',
  'jspm_packages', '.npm', '.yarn', 'obj', 'bin', 'debug', 'release',
  
  // Mobile & Native
  'ios', 'android', '.expo', 'Pods', '.gradle', 'fastlane',
  
  // Assets & Media (Usually many small files)
  'assets', 'static', 'public', 'images', 'img', 'media', 'fonts', 'locales',
  'i18n', 'screenshots', 'videos', 'uploads', 'backups',
  
  // Documentation & Testing (Optional for architecture)
  'docs', 'documentation', '__tests__', 'tests', 'test', 'spec', 'e2e'
];

const IGNORED_FILES = [
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 
  'composer.lock', 'Gemfile.lock', '.DS_Store', 'thumbs.db',
  '.env', '.env.local', '.env.development.local', 'pip-log.txt',
  'npm-debug.log', 'yarn-debug.log', 'yarn-error.log',
  'README.md', 'LICENSE', 'CONTRIBUTING.md', 'CHANGELOG.md'
];

export const getExtension = (filename: string) => {
  const parts = filename.split('.');
  return parts.length > 1 ? `.${parts.pop()?.toLowerCase()}` : '';
};

export const findDependencies = (content: string, filename: string): string[] => {
  const deps: string[] = [];
  const ext = getExtension(filename);

  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    // Standard ESM imports
    const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      deps.push(match[1]);
    }
    // CJS require
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      deps.push(match[1]);
    }
    // Dynamic imports
    const dynamicImportRegex = /import\(['"]([^'"]+)['"]\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      deps.push(match[1]);
    }
  } else if (ext === '.py') {
    const importPy = /^import\s+([a-zA-Z0-9_.,\s]+)/gm;
    const fromPy = /^from\s+([a-zA-Z0-9_.]+)\s+import/gm;
    let match;
    while ((match = importPy.exec(content)) !== null) {
      deps.push(...match[1].split(',').map(s => s.trim().split('.')[0]));
    }
    while ((match = fromPy.exec(content)) !== null) {
      deps.push(match[1].split('.')[0]);
    }
  }

  return [...new Set(deps)];
};

export const shouldProcessFile = (path: string, size: number): boolean => {
  const filename = path.split('/').pop() || '';
  if (IGNORED_FILES.includes(filename)) return false;

  const parts = path.split('/');
  // Filter for common build, meta and dependency folders
  if (parts.some(part => IGNORED_DIRS.includes(part))) return false;
  
  const ext = getExtension(path);
  if (!ALLOWED_EXTENSIONS.includes(ext)) return false;
  if (size > 1024 * 1024) return false; // 1MB limit per file
  return true;
};

export const buildFileTree = (files: ProjectFile[]): TreeNode[] => {
  const root: TreeNode[] = [];

  files.forEach((file) => {
    const parts = file.path.split('/');
    let currentLevel = root;

    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join('/');
      const isFile = index === parts.length - 1;

      let existing = currentLevel.find((node) => node.name === part);

      if (!existing) {
        existing = {
          name: part,
          path,
          children: [],
          isFile,
          fileData: isFile ? file : undefined,
        };
        currentLevel.push(existing);
      }

      currentLevel = existing.children;
    });
  });

  // Sort: Folders first, then alphabetically
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(root);
  return root;
};

export const calculateAAMetrics = (files: ProjectFile[], links: GraphLink[]) => {
  if (files.length === 0) return { totalSize: 0, totalLines: 0, complexityAvg: 0, architectureHealth: 'Unknown' };
  
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const totalLines = files.reduce((acc, f) => acc + (f.content.split('\n').length || 0), 0);
  const complexityAvg = links.length / files.length;
  
  let architectureHealth = 'Óptima';
  if (complexityAvg > 8) architectureHealth = 'Crítica (Alta Acoplación)';
  else if (complexityAvg > 4) architectureHealth = 'Compleja';
  else if (complexityAvg > 2) architectureHealth = 'Modular';

  return {
    totalSize,
    totalLines,
    complexityAvg: complexityAvg.toFixed(2),
    architectureHealth
  };
};

export const generateTreeText = (nodes: TreeNode[], indent = ''): string => {
  let result = '';
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const marker = isLast ? '└── ' : '├── ';
    result += `${indent}${marker}${node.name}${!node.isFile ? '/' : ''}\n`;
    if (node.children.length > 0) {
      result += generateTreeText(node.children, indent + (isLast ? '    ' : '│   '));
    }
  });
  return result;
};
