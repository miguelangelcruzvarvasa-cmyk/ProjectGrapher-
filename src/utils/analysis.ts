
import { PROJECT_ANALYSIS_RULES } from '../config/projectContext';
import { ProjectFile, TreeNode, GraphLink } from '../types';

const IGNORED_FILES_SET = new Set<string>(PROJECT_ANALYSIS_RULES.ignoredFiles);
const IGNORED_DIRS_SET = new Set<string>(PROJECT_ANALYSIS_RULES.ignoredDirectories);
const ALLOWED_EXTS_SET = new Set<string>(PROJECT_ANALYSIS_RULES.allowedExtensions);

export type FileSemanticSummary = {
  lines: number;
  nonEmptyLines: number;
  exports: string[];
  role: string;
  confidence: 'high' | 'medium';
  complexity: 'low' | 'medium' | 'high';
  evidence: 'code' | 'path+code' | 'path';
};

export const getExtension = (filename: string) => {
  const parts = filename.split('.');
  return parts.length > 1 ? `.${parts.pop()?.toLowerCase()}` : '';
};

export const normalizeProjectPath = (value: string) =>
  value
    .replace(/\\/g, '/')
    .replace(/^[a-z]:\//i, '')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .toLowerCase();

export const stripKnownExtension = (value: string) =>
  value.replace(/\.(blade\.php|js|jsx|ts|tsx|mjs|cjs|py|go|rs|java|cs|php|rb|vue|svelte|html|css|scss|sass|less|dart|c|cpp|h)$/i, '');

const createLookupAliases = (file: ProjectFile) => {
  const normalizedPath = normalizeProjectPath(file.path);
  const withoutExt = stripKnownExtension(normalizedPath);
  const parts = withoutExt.split('/').filter(Boolean);
  const basename = parts[parts.length - 1] || withoutExt;
  const parentAndBase = parts.slice(-2).join('/');

  const cleanBasename = basename.replace(/^_+/, '');
  const cleanWithoutExt = withoutExt.replace(/\/_+/g, '/');

  return [
    normalizedPath,
    withoutExt,
    cleanWithoutExt,
    basename,
    cleanBasename,
    parentAndBase
  ].filter(Boolean);
};

export const createProjectFileResolver = (files: ProjectFile[]) => {
  const aliasMap = new Map<string, ProjectFile[]>();

  files.forEach((file) => {
    createLookupAliases(file).forEach((alias) => {
      const current = aliasMap.get(alias) || [];
      current.push(file);
      aliasMap.set(alias, current);
    });
  });

  return (rawDependency: string, sourcePath?: string) => {
    const normalizedDep = stripKnownExtension(
      normalizeProjectPath(rawDependency.split('?')[0].split('#')[0])
    );

    if (!normalizedDep || normalizedDep.startsWith('@') || normalizedDep.includes('node_modules')) {
      return null;
    }

    const candidates = new Set<ProjectFile>();
    const depParts = normalizedDep.split('/').filter(Boolean);
    const depBase = depParts[depParts.length - 1] || normalizedDep;
    const cleanDepBase = depBase.replace(/^_+/, '');
    const depParentAndBase = depParts.slice(-2).join('/');

    [
      normalizedDep,
      depBase,
      cleanDepBase,
      depParentAndBase
    ].filter(Boolean).forEach((key) => {
      (aliasMap.get(key) || []).forEach((file) => candidates.add(file));
    });

    const sourceDir = sourcePath
      ? normalizeProjectPath(sourcePath).split('/').slice(0, -1).join('/')
      : '';

    let bestMatch: ProjectFile | null = null;
    let bestScore = -1;

    candidates.forEach((candidate) => {
      let score = 0;
      const candidatePath = normalizeProjectPath(candidate.path);
      const candidateWithoutExt = stripKnownExtension(candidatePath);
      const candidateBasename = candidate.name.toLowerCase().replace(/^_+/, '');

      if (candidateWithoutExt === normalizedDep) score += 6;
      if (candidatePath.endsWith(`${normalizedDep}${candidate.ext}`)) score += 5;
      if (candidateWithoutExt.endsWith(normalizedDep)) score += 4;
      if (candidateBasename === cleanDepBase.toLowerCase() || candidateBasename.startsWith(`${cleanDepBase.toLowerCase()}.`)) score += 3;
      if (depParentAndBase && candidateWithoutExt.endsWith(depParentAndBase)) score += 3;
      if (sourceDir && candidatePath.startsWith(sourceDir)) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    });

    return bestScore > 0 ? bestMatch : null;
  };
};

export const findDependencies = (content: string, filename: string): string[] => {
  const deps: string[] = [];
  const ext = getExtension(filename);
  const lowerName = filename.toLowerCase();

  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
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
  } else if (['.scss', '.sass', '.less', '.css'].includes(ext)) {
    // SCSS / SASS / LESS / CSS imports, uses, forwards, and composes
    const scssImport = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?/g;
    const scssUse = /@use\s+['"]([^'"]+)['"]/g;
    const scssForward = /@forward\s+['"]([^'"]+)['"]/g;
    const composesFrom = /composes:\s*[\w-]+\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = scssImport.exec(content)) !== null) {
      deps.push(match[1]);
    }
    while ((match = scssUse.exec(content)) !== null) {
      deps.push(match[1]);
    }
    while ((match = scssForward.exec(content)) !== null) {
      deps.push(match[1]);
    }
    while ((match = composesFrom.exec(content)) !== null) {
      deps.push(match[1]);
    }
  } else if (['.vue', '.svelte', '.html'].includes(ext)) {
    // Vue / Svelte / HTML script & style imports
    const scriptSrc = /<script\b[^>]*src=['"]([^'"]+)['"]/gi;
    const linkHref = /<link\b[^>]*href=['"]([^'"]+)['"]/gi;
    const styleSrc = /<style\b[^>]*src=['"]([^'"]+)['"]/gi;
    const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const scssUse = /@(import|use|forward)\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = scriptSrc.exec(content)) !== null) deps.push(match[1]);
    while ((match = linkHref.exec(content)) !== null) deps.push(match[1]);
    while ((match = styleSrc.exec(content)) !== null) deps.push(match[1]);
    while ((match = importRegex.exec(content)) !== null) deps.push(match[1]);
    while ((match = scssUse.exec(content)) !== null) deps.push(match[2]);
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
  } else if (ext === '.dart') {
    const importDart = /^(?:import|export)\s+['"]([^'"]+)['"]/gm;
    let match;
    while ((match = importDart.exec(content)) !== null) {
      const depPath = match[1];
      if (!depPath.startsWith('package:') && !depPath.startsWith('dart:')) {
        deps.push(depPath);
      }
    }
  } else if (ext === '.php' || lowerName.endsWith('.blade.php')) {
    // 1. PHP use, extends, implements, new, type hints, static calls
    const usePhp = /^use\s+([A-Za-z0-9_\\]+)(?:\s+as\s+[A-Za-z0-9_]+)?;?/gm;
    const extendsPhp = /\bextends\s+([A-Za-z0-9_\\]+)/g;
    const implementsPhp = /\bimplements\s+([A-Za-z0-9_\\,\s]+)/g;
    const newPhp = /\bnew\s+([A-Za-z0-9_\\]+)\s*\(/g;
    const typeHintPhp = /\b([A-Z][A-Za-z0-9_\\]+)\s+\$[a-zA-Z0-9_]+/g;
    const staticPhp = /\b([A-Z][A-Za-z0-9_\\]+)::[a-zA-Z0-9_]+/g;

    // 2. Blade directives: @include('view.name'), @extends('layouts.app'), @component('components.card')
    const bladeInclude = /@(include|extends|component|each)\(['"]([^'"]+)['"]/g;

    let match;
    while ((match = usePhp.exec(content)) !== null) {
      const raw = match[1].replace(/\\/g, '/');
      const parts = raw.split('/');
      deps.push(parts[parts.length - 1]);
      deps.push(raw);
    }
    while ((match = extendsPhp.exec(content)) !== null) {
      const raw = match[1].replace(/\\/g, '/');
      const parts = raw.split('/');
      deps.push(parts[parts.length - 1]);
    }
    while ((match = implementsPhp.exec(content)) !== null) {
      match[1].split(',').forEach((item) => {
        const raw = item.trim().replace(/\\/g, '/');
        const parts = raw.split('/');
        if (parts.length) deps.push(parts[parts.length - 1]);
      });
    }
    while ((match = newPhp.exec(content)) !== null) {
      const raw = match[1].replace(/\\/g, '/');
      const parts = raw.split('/');
      deps.push(parts[parts.length - 1]);
    }
    while ((match = typeHintPhp.exec(content)) !== null) {
      const raw = match[1].replace(/\\/g, '/');
      const parts = raw.split('/');
      deps.push(parts[parts.length - 1]);
    }
    while ((match = staticPhp.exec(content)) !== null) {
      const raw = match[1].replace(/\\/g, '/');
      const parts = raw.split('/');
      deps.push(parts[parts.length - 1]);
    }
    while ((match = bladeInclude.exec(content)) !== null) {
      const viewPath = match[2].replace(/\./g, '/');
      deps.push(viewPath);
      const parts = viewPath.split('/');
      deps.push(parts[parts.length - 1]);
    }
  } else if (ext === '.cs') {
    // C# using and inheritance
    const usingCs = /^using\s+([A-Za-z0-9_.]+);/gm;
    const extendsCs = /:\s*([A-Z][A-Za-z0-9_]+)/g;
    let match;
    while ((match = usingCs.exec(content)) !== null) {
      const parts = match[1].split('.');
      deps.push(parts[parts.length - 1]);
      deps.push(match[1].replace(/\./g, '/'));
    }
    while ((match = extendsCs.exec(content)) !== null) {
      deps.push(match[1]);
    }
  } else if (ext === '.java') {
    // Java import and inheritance
    const importJava = /^import\s+([A-Za-z0-9_.]+);/gm;
    const extendsJava = /\b(extends|implements)\s+([A-Z][A-Za-z0-9_]+)/g;
    let match;
    while ((match = importJava.exec(content)) !== null) {
      const parts = match[1].split('.');
      deps.push(parts[parts.length - 1]);
    }
    while ((match = extendsJava.exec(content)) !== null) {
      deps.push(match[2]);
    }
  } else if (ext === '.go') {
    const importGo = /import\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importGo.exec(content)) !== null) {
      const parts = match[1].split('/');
      deps.push(parts[parts.length - 1]);
    }
  } else if (ext === '.rs') {
    const useRs = /use\s+([A-Za-z0-9_:]+);/g;
    const modRs = /mod\s+([A-Za-z0-9_]+);/g;
    let match;
    while ((match = useRs.exec(content)) !== null) {
      const parts = match[1].split('::');
      deps.push(parts[parts.length - 1]);
    }
    while ((match = modRs.exec(content)) !== null) {
      deps.push(match[1]);
    }
  } else if (ext === '.rb') {
    const requireRb = /require(?:_relative)?\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = requireRb.exec(content)) !== null) {
      const parts = match[1].split('/');
      deps.push(parts[parts.length - 1]);
    }
  } else if (['.c', '.cpp', '.h', '.hpp'].includes(ext)) {
    const includeC = /#include\s+["<]([^">]+)[">]/g;
    let match;
    while ((match = includeC.exec(content)) !== null) {
      const parts = match[1].split('/');
      deps.push(parts[parts.length - 1]);
    }
  }

  return [...new Set(deps)];
};

const VIRTUALENV_DIR_PATTERN = /^(\.?(venv|env|virtualenv)\d*|site-packages|dist-packages|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache)$/i;

export const shouldProcessFile = (path: string, size: number): boolean => {
  const normalizedPath = path.replace(/\\/g, '/');
  const filename = normalizedPath.split('/').pop() || '';
  if (IGNORED_FILES_SET.has(filename.toLowerCase()) || IGNORED_FILES_SET.has(filename)) return false;

  const parts = normalizedPath.split('/');
  // Filter for common build, meta, virtualenv and dependency folders
  if (parts.some(part => {
    const lower = part.toLowerCase();
    return IGNORED_DIRS_SET.has(lower) || IGNORED_DIRS_SET.has(part) || VIRTUALENV_DIR_PATTERN.test(lower);
  })) return false;
  
  const ext = getExtension(normalizedPath);
  if (!ALLOWED_EXTS_SET.has(ext)) return false;
  if (size > PROJECT_ANALYSIS_RULES.maxFileSizeBytes) return false;
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

const truncateSignature = (value: string, maxLength = 88) => (
  value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value
);

const uniqueOrdered = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const extractJavaScriptExports = (content: string) => {
  const signatures: string[] = [];
  const patterns = [
    /export\s+async\s+function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/g,
    /export\s+function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/g,
    /export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
    /export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?function\s*\(([^)]*)\)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
    /export\s+interface\s+([A-Za-z0-9_$]+)/g,
    /export\s+type\s+([A-Za-z0-9_$]+)/g
  ];

  patterns.forEach((pattern, index) => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (index <= 3) {
        signatures.push(`${match[1]}(${(match[2] || '').replace(/\s+/g, ' ').trim()})`);
      } else if (index === 4) {
        signatures.push(`class ${match[1]}`);
      } else if (index === 5) {
        signatures.push(`interface ${match[1]}`);
      } else if (index === 6) {
        signatures.push(`type ${match[1]}`);
      } else {
        signatures.push(match[1]);
      }
    }
  });

  const defaultFunction = content.match(/export\s+default\s+function\s+([A-Za-z0-9_$]+)?\s*\(([^)]*)\)/);
  if (defaultFunction) {
    signatures.push(`default ${defaultFunction[1] || 'function'}(${(defaultFunction[2] || '').replace(/\s+/g, ' ').trim()})`);
  }

  const namedExportBlock = content.match(/export\s*\{\s*([^}]+)\s*\}/);
  if (namedExportBlock) {
    namedExportBlock[1]
      .split(',')
      .map((item) => item.trim().replace(/\s+as\s+.*/i, ''))
      .filter(Boolean)
      .forEach((item) => signatures.push(item));
  }

  return uniqueOrdered(signatures).map((item) => truncateSignature(item)).slice(0, 8);
};

const extractPythonExports = (content: string) => {
  const signatures: string[] = [];
  const classRegex = /^class\s+([A-Za-z0-9_]+)/gm;
  const fnRegex = /^def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/gm;
  let match;

  while ((match = classRegex.exec(content)) !== null) {
    if (!match[1].startsWith('_')) signatures.push(match[1]);
  }
  while ((match = fnRegex.exec(content)) !== null) {
    if (!match[1].startsWith('_')) signatures.push(`${match[1]}(${(match[2] || '').replace(/\s+/g, ' ').trim()})`);
  }

  return uniqueOrdered(signatures).map((item) => truncateSignature(item)).slice(0, 8);
};

const extractDartExports = (content: string) => {
  const signatures: string[] = [];
  const classRegex = /^(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/gm;
  const mixinRegex = /^mixin\s+([A-Za-z0-9_$]+)/gm;
  const extensionRegex = /^extension\s+([A-Za-z0-9_$]+)/gm;
  const enumRegex = /^enum\s+([A-Za-z0-9_$]+)/gm;
  const fnRegex = /^(?:[A-Za-z0-9_$<>]+(?:\?\s*)?\s+)?([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*(?:async\s*)?\{/gm;

  let match;
  while ((match = classRegex.exec(content)) !== null) {
    if (!match[1].startsWith('_')) signatures.push(match[1]);
  }
  while ((match = mixinRegex.exec(content)) !== null) {
    if (!match[1].startsWith('_')) signatures.push(match[1]);
  }
  while ((match = enumRegex.exec(content)) !== null) {
    if (!match[1].startsWith('_')) signatures.push(match[1]);
  }
  while ((match = fnRegex.exec(content)) !== null) {
    const fnName = match[1];
    if (!['if', 'for', 'while', 'switch', 'catch', 'assert', 'class', 'mixin', 'enum', 'extension'].includes(fnName) && !fnName.startsWith('_')) {
      signatures.push(`${fnName}(${(match[2] || '').replace(/\s+/g, ' ').trim()})`);
    }
  }

  return uniqueOrdered(signatures).map((item) => truncateSignature(item)).slice(0, 8);
};

const extractPhpExports = (content: string) => {
  const signatures: string[] = [];
  const classRegex = /^(?:final\s+|abstract\s+)?class\s+([A-Za-z0-9_]+)/gm;
  const interfaceRegex = /^interface\s+([A-Za-z0-9_]+)/gm;
  const traitRegex = /^trait\s+([A-Za-z0-9_]+)/gm;
  const fnRegex = /public\s+function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/gm;

  let match;
  while ((match = classRegex.exec(content)) !== null) {
    signatures.push(`class ${match[1]}`);
  }
  while ((match = interfaceRegex.exec(content)) !== null) {
    signatures.push(`interface ${match[1]}`);
  }
  while ((match = traitRegex.exec(content)) !== null) {
    signatures.push(`trait ${match[1]}`);
  }
  while ((match = fnRegex.exec(content)) !== null) {
    if (!match[1].startsWith('__')) {
      signatures.push(`${match[1]}(${(match[2] || '').replace(/\s+/g, ' ').trim()})`);
    }
  }

  return uniqueOrdered(signatures).map((item) => truncateSignature(item)).slice(0, 8);
};

export const summarizeFileSemantics = (file: ProjectFile): FileSemanticSummary => {
  const ext = file.ext.toLowerCase();
  const normalizedPath = file.path.toLowerCase();
  const normalizedName = file.name.toLowerCase();
  const content = file.content;
  const lines = content ? content.split('\n').length : 0;
  const nonEmptyLines = content
    ? content.split('\n').map((line) => line.trim()).filter(Boolean).length
    : 0;
  const importMatches = content.match(/\b(import|from|require\(|using\s+|use\s+|from\s+[A-Za-z0-9_.]+\s+import)\b/g) || [];
  const branchMatches = content.match(/\b(if|else if|switch|case|try|catch|for|while)\b/g) || [];
  const definitionMatches = content.match(/\b(function|class|interface|type|def|trait)\b/g) || [];

  let role = 'módulo de soporte del proyecto';
  let confidence: FileSemanticSummary['confidence'] = 'medium';
  let evidence: FileSemanticSummary['evidence'] = 'path';

  if (normalizedName.endsWith('.blade.php')) {
    role = 'plantilla de vista Blade (Laravel)';
    confidence = 'high';
    evidence = 'path+code';
  } else if (ext === '.vue' || ext === '.svelte') {
    role = 'componente reactivo de interfaz (SPA)';
    confidence = 'high';
    evidence = 'path+code';
  } else if (/\/controllers?\//.test(normalizedPath) || /controller\.php$/i.test(file.name)) {
    role = 'controlador de backend / endpoint API';
    confidence = 'high';
    evidence = 'path+code';
  } else if (/\/models?\//.test(normalizedPath) || /model\.php$/i.test(file.name)) {
    role = 'modelo de datos / entidad ORM';
    confidence = 'high';
    evidence = 'path+code';
  } else if (/\/services?\//.test(normalizedPath) || /service\.php$/i.test(file.name)) {
    role = 'servicio de dominio o lógica de negocio';
    confidence = 'high';
    evidence = 'path+code';
  } else if (/\/migrations?\//.test(normalizedPath)) {
    role = 'migración de base de datos';
    confidence = 'high';
    evidence = 'path';
  } else if (/\/middleware\//.test(normalizedPath)) {
    role = 'middleware de autenticación / petición';
    confidence = 'high';
    evidence = 'path+code';
  } else if (/\/hooks\//.test(normalizedPath) || /^use[A-Z]/.test(file.name)) {
    role = 'hook personalizado que encapsula lógica reutilizable';
    confidence = 'high';
    evidence = 'path+code';
  } else if (/\/stores?\//.test(normalizedPath) || /(zustand|redux|createcontext|usecontext)/i.test(content)) {
    role = 'estado compartido o contexto global';
    confidence = 'high';
    evidence = 'path+code';
  } else if (/\/api\/|\/services?\//.test(normalizedPath) || /(axios|fetch|endpoint|router|express|fastapi)/i.test(content)) {
    role = 'integración, servicio o capa de acceso';
    confidence = 'high';
    evidence = 'path+code';
  } else if (/\/workers?\//.test(normalizedPath) || /\bself\.onmessage\b|\bpostMessage\b/.test(content)) {
    role = 'worker o procesamiento en segundo plano';
    confidence = 'high';
    evidence = 'path+code';
  } else if (/\/components\/|\/pages\/|\/views\/|\/screens\//.test(normalizedPath) || /return\s*\(|jsx|tsx|react/i.test(content)) {
    role = 'componente, pantalla u orquestador de interfaz';
    confidence = /\/components\/|\/pages\/|\/views\/|\/screens\//.test(normalizedPath) ? 'high' : 'medium';
    evidence = /\/components\/|\/pages\/|\/views\/|\/screens\//.test(normalizedPath) ? 'path+code' : 'code';
  } else if (/\.(css|scss|sass|less)$/.test(normalizedName)) {
    role = 'estilos o tokens visuales';
    confidence = 'high';
    evidence = 'path';
  } else if (/config|settings|env/.test(normalizedName)) {
    role = 'configuración compartida del proyecto';
    confidence = 'medium';
    evidence = 'path';
  } else if (/util|helper|format|parse/.test(normalizedName)) {
    role = 'utilidad o helper reusable';
    confidence = 'medium';
    evidence = 'path';
  } else if (/(app|main|index)\.(ts|tsx|js|jsx|py|php)$/i.test(file.name)) {
    role = 'punto de entrada u orquestador principal';
    confidence = 'high';
    evidence = 'path';
  }

  const exports = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)
    ? extractJavaScriptExports(content)
    : ext === '.py'
      ? extractPythonExports(content)
      : ext === '.dart'
        ? extractDartExports(content)
        : ext === '.php'
          ? extractPhpExports(content)
          : [];

  let complexity: FileSemanticSummary['complexity'] = 'low';
  const complexityScore = nonEmptyLines + (importMatches.length * 4) + (branchMatches.length * 6) + (definitionMatches.length * 5);
  if (complexityScore >= 320 || nonEmptyLines >= 220) {
    complexity = 'high';
  } else if (complexityScore >= 140 || nonEmptyLines >= 90) {
    complexity = 'medium';
  }

  return {
    lines,
    nonEmptyLines,
    exports,
    role,
    confidence,
    complexity,
    evidence
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
