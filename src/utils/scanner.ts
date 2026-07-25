import { TOPOLOGY_ANALYSIS_RULES } from '../config/rules';
import type { ProjectFile, Repository, ApiEndpoint, FrontendApiCall } from '../types/topology';

const IGNORED_PATH_REGEX = /(?:^|\/)(?:\.claude|\.angular|\.git|\.vscode|\.idea|\.cache|\.vite|\.next|\.nuxt|\.svelte-kit|\.turbo|\.output|node_modules|vendor|dist|build|worktrees|\.worktrees)(?:\/|$)/i;

export const PROJECT_SIGNATURE_FILES = new Set([
  'package.json', 'composer.json', 'requirements.txt', 'pyproject.toml',
  'pipfile', 'pom.xml', 'build.gradle', 'go.mod', 'artisan', 'angular.json',
  'vite.config.ts', 'vite.config.js', 'next.config.js', 'nuxt.config.ts',
  'appsettings.json', 'cargo.toml', 'dockerfile', 'makefile', '.git'
]);

export interface SubProjectGroup {
  repoName: string;
  subPath: string;
  files: File[];
}

export const groupFilesBySubProjects = (rootName: string, files: File[]): SubProjectGroup[] => {
  const signatureMap = new Map<string, string>();

  files.forEach((file) => {
    const rawPath = (file as any).webkitRelativePath || file.name;
    const normalizedPath = rawPath.replace(/\\/g, '/');
    if (IGNORED_PATH_REGEX.test(normalizedPath)) return;

    const parts = normalizedPath.split('/').filter(Boolean);
    const fileName = (parts[parts.length - 1] || '').toLowerCase();

    if (PROJECT_SIGNATURE_FILES.has(fileName)) {
      const subPathParts = parts.slice(1, -1);
      // Only consider direct 1st-level subdirectories as subproject roots (depth === 1)
      if (subPathParts.length === 1) {
        const subPath = subPathParts[0];
        if (subPath && !signatureMap.has(subPath)) {
          signatureMap.set(subPath, fileName);
        }
      }
    }
  });

  const subPaths = Array.from(signatureMap.keys());
  const distinctSubPaths: string[] = subPaths;

  if (distinctSubPaths.length >= 2) {
    const groups: SubProjectGroup[] = distinctSubPaths.map((sp) => {
      const folderName = sp.split('/').pop() || sp;
      return {
        repoName: folderName,
        subPath: sp,
        files: []
      };
    });

    const rootFiles: File[] = [];

    files.forEach((file) => {
      const rawPath = (file as any).webkitRelativePath || file.name;
      const normalizedPath = rawPath.replace(/\\/g, '/');
      if (IGNORED_PATH_REGEX.test(normalizedPath)) return;

      const parts = normalizedPath.split('/').filter(Boolean);
      const relativeSubPath = parts.slice(1).join('/');

      const matchedGroup = groups.find((g) => relativeSubPath.startsWith(`${g.subPath}/`));
      if (matchedGroup) {
        matchedGroup.files.push(file);
      } else {
        rootFiles.push(file);
      }
    });

    if (rootFiles.length > 0) {
      groups.push({
        repoName: rootName || 'Root Project',
        subPath: '',
        files: rootFiles
      });
    }

    return groups.filter((g) => g.files.length > 0);
  }

  return [
    {
      repoName: rootName || 'Repository',
      subPath: '',
      files
    }
  ];
};

export const shouldProcessTopologyFile = (path: string, size: number): boolean => {
  const normalizedPath = path.replace(/\\/g, '/');
  if (IGNORED_PATH_REGEX.test(normalizedPath)) return false;

  const filename = (normalizedPath.split('/').pop() || '').toLowerCase();
  if (!filename || (TOPOLOGY_ANALYSIS_RULES.ignoredFiles as readonly string[]).includes(filename)) return false;

  const ext = `.${filename.split('.').pop()?.toLowerCase() || ''}`;
  if (!TOPOLOGY_ANALYSIS_RULES.allowedExtensions.includes(ext as any)) return false;
  if (size > TOPOLOGY_ANALYSIS_RULES.maxFileSizeBytes) return false;

  return true;
};

export const isRealProjectDirectory = (files: File[]): boolean => {
  if (files.length === 0) return false;

  const hasSignature = files.some((file) => {
    const filename = (file.name || '').toLowerCase();
    return PROJECT_SIGNATURE_FILES.has(filename);
  });

  if (hasSignature) return true;

  const validCodeCount = files.filter((f) => {
    const path = (f as any).webkitRelativePath || f.name;
    return shouldProcessTopologyFile(path, f.size);
  }).length;

  return validCodeCount > 2;
};

export const detectRepoType = (files: string[], extractedEndpointsCount = 0): Repository['type'] => {
  const paths = files.map((f) => f.toLowerCase());

  const hasPhp = paths.some((p) => p.endsWith('.php') || p.includes('artisan') || p.includes('composer.json'));
  const hasPython = paths.some((p) => p.endsWith('.py') || p.includes('requirements.txt') || p.includes('pipfile') || p.includes('pyproject.toml'));
  const hasJava = paths.some((p) => p.endsWith('.java') || p.includes('pom.xml') || p.includes('build.gradle'));
  const hasCs = paths.some((p) => p.endsWith('.cs') || p.endsWith('.csproj') || p.includes('appsettings.json'));
  const hasGo = paths.some((p) => p.endsWith('.go') || p.includes('go.mod'));

  const hasBackendStructure = extractedEndpointsCount > 0 || paths.some((p) =>
    p.includes('/controller') || p.includes('/controllers') ||
    p.includes('/routes') || p.includes('/api/') ||
    p.includes('/services/') || p.includes('server.ts') ||
    p.includes('server.js') || p.includes('app.module.ts') || p.includes('nest-cli.json')
  );

  const hasFrontendStructure = paths.some((p) =>
    p.includes('angular.json') || p.endsWith('.vue') ||
    p.includes('/components/') || p.includes('/pages/') ||
    p.includes('/views/') || p.includes('index.html') ||
    p.endsWith('.tsx') || p.endsWith('.jsx')
  );

  if (hasPhp || hasPython || hasJava || hasCs || hasGo || hasBackendStructure) {
    if (!hasFrontendStructure || extractedEndpointsCount > 0) return 'backend';
  }

  const hasSql = paths.some((p) => p.endsWith('.sql') || p.includes('migration'));
  if (hasSql && !hasFrontendStructure) return 'database';

  if (hasFrontendStructure) return 'frontend';

  return 'backend';
};

export const extractBackendEndpoints = (file: ProjectFile): ApiEndpoint[] => {
  const endpoints: ApiEndpoint[] = [];
  const content = file.content;

  const pushEndpoint = (method: ApiEndpoint['method'], path: string, matchIdx: number) => {
    const cleanPath = path.trim().replace(/^['"`]|['"`]$/g, '');
    if (!cleanPath) return;
    const lineNum = content.slice(0, matchIdx).split('\n').length;
    endpoints.push({
      id: `${file.repoId}_${method}_${cleanPath}`,
      repoId: file.repoId,
      repoName: file.repoName,
      method,
      path: cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`,
      fileId: file.id,
      lineNumber: lineNum
    });
  };

  let match: RegExpExecArray | null;

  const laravelRouteRegex = /Route::(get|post|put|delete|patch|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((match = laravelRouteRegex.exec(content)) !== null) {
    pushEndpoint(match[1].toUpperCase() as ApiEndpoint['method'], match[2], match.index);
  }

  const expressRegex = /(?:app|router)\.(get|post|put|delete|patch|options)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((match = expressRegex.exec(content)) !== null) {
    pushEndpoint(match[1].toUpperCase() as ApiEndpoint['method'], match[2], match.index);
  }

  const pythonRouteRegex = /@(?:app|router|api)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/gi;
  while ((match = pythonRouteRegex.exec(content)) !== null) {
    pushEndpoint(match[1].toUpperCase() as ApiEndpoint['method'], match[2], match.index);
  }

  const nestJsRegex = /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]([^'"]*)['"]\s*\)/gi;
  while ((match = nestJsRegex.exec(content)) !== null) {
    pushEndpoint(match[1].toUpperCase() as ApiEndpoint['method'], match[2] || '/', match.index);
  }

  const springBootRegex = /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/gi;
  while ((match = springBootRegex.exec(content)) !== null) {
    pushEndpoint(match[1].toUpperCase() as ApiEndpoint['method'], match[2], match.index);
  }

  const djangoRegex = /path\s*\(\s*["']([^"']+)["']/gi;
  while ((match = djangoRegex.exec(content)) !== null) {
    pushEndpoint('GET', match[1], match.index);
  }

  return endpoints;
};

export const extractFrontendApiCalls = (file: ProjectFile): FrontendApiCall[] => {
  const apiCalls: FrontendApiCall[] = [];
  const content = file.content;

  const pushCall = (method: string, rawUrl: string, matchIdx: number) => {
    const cleanUrl = rawUrl.trim().replace(/^['"`]|['"`]$/g, '');
    if (!cleanUrl || cleanUrl.startsWith('#') || cleanUrl.startsWith('data:')) return;

    const lineNum = content.slice(0, matchIdx).split('\n').length;
    apiCalls.push({
      id: `${file.repoId}_${method}_${cleanUrl}`,
      repoId: file.repoId,
      repoName: file.repoName,
      method,
      urlPattern: cleanUrl,
      fileId: file.id,
      lineNumber: lineNum
    });
  };

  let match: RegExpExecArray | null;

  const clientCallRegex = /(?:this\.http|axios|http|api|client|apiClient|service)\.(get|post|put|delete|patch)\s*(?:<[^>]+>)?\s*\(\s*[`'"]([^`'"]+)[`'"]/gi;
  while ((match = clientCallRegex.exec(content)) !== null) {
    pushCall(match[1].toUpperCase(), match[2], match.index);
  }

  const fetchRegex = /fetch\s*\(\s*[`'"]([^`'"]+)[`'"](?:\s*,\s*\{\s*method:\s*['"]([a-zA-Z]+)['"])?/gi;
  while ((match = fetchRegex.exec(content)) !== null) {
    const url = match[1];
    const method = (match[2] || 'GET').toUpperCase();
    pushCall(method, url, match.index);
  }

  return apiCalls;
};
