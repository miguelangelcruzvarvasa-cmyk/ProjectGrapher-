import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ProjectFile, GraphNode, GraphLink, ProjectData, TreeNode } from '../types';
import { buildFileTree, generateTreeText, shouldProcessFile } from '../utils/analysis';
import { db } from '../db/projectDB';

const MAX_GRAPH_FILES = 1500;
const FILE_READ_BATCH_SIZE = 40;
const FILE_SCAN_BATCH_SIZE = 500;

const prioritizeFile = (path: string, name: string) => {
  const normalizedPath = path.toLowerCase();
  const normalizedName = name.toLowerCase();

  if (
    normalizedName === 'main.tsx' ||
    normalizedName === 'main.jsx' ||
    normalizedName === 'app.tsx' ||
    normalizedName === 'app.jsx' ||
    normalizedName === 'main.py' ||
    normalizedName === 'server.js' ||
    normalizedName === 'index.ts' ||
    normalizedName === 'index.js'
  ) {
    return 0;
  }

  if (normalizedPath.includes('/src/') || normalizedPath.includes('/server/')) return 1;
  if (normalizedPath.includes('/components/') || normalizedPath.includes('/store/') || normalizedPath.includes('/utils/')) return 2;
  return 3;
};

const readFileAsText = (file: File) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });

type ProjectInsights = {
  projectName: string;
  stack: string[];
  directories: string[];
  entryPoints: string[];
  dominantFileTypes: string[];
  topHotspots: { label: string; path: string; importance: number; ext: string }[];
  topRelations: string[];
  graphLeaders: {
    label: string;
    path: string;
    outgoing: number;
    incoming: number;
    total: number;
    outgoingTargets: string[];
    incomingSources: string[];
  }[];
  layerEntries: { layer: string; files: string[]; count: number }[];
};

type TaskPackFileCandidate = {
  path: string;
  importance: number;
  score: number;
  reasons: string[];
};

type AgentTaskPackData = {
  task: string;
  projectName: string;
  projectSummary: string;
  stack: string[];
  entryPoints: string[];
  primaryFiles: TaskPackFileCandidate[];
  relatedFiles: TaskPackFileCandidate[];
  readingOrder: string[];
  implementationFocus: string[];
};

type ErrorContextFileCandidate = {
  path: string;
  nodeId: string;
  importance: number;
  score: number;
  reasons: string[];
  relation: 'origin' | 'neighbor' | 'entry' | 'hotspot';
};

type ErrorContextPackData = {
  rawError: string;
  errorHeadline: string;
  summary: string;
  projectName: string;
  stack: string[];
  stackPaths: string[];
  matchedSignals: string[];
  probableOrigin: ErrorContextFileCandidate | null;
  relatedFiles: ErrorContextFileCandidate[];
  readingOrder: string[];
  implementationFocus: string[];
  modelPrompt: string;
};

type SemanticSearchResult = {
  query: string;
  summary: string;
  primaryFiles: TaskPackFileCandidate[];
  relatedFiles: TaskPackFileCandidate[];
};

type ImpactedFile = {
  path: string;
  relation: 'depends_on' | 'used_by' | 'second_order';
  importance: number;
  reasons: string[];
};

type ImpactAnalysisData = {
  targetPath: string;
  summary: string;
  directDependencies: ImpactedFile[];
  directDependents: ImpactedFile[];
  secondaryImpact: ImpactedFile[];
};

type SmartDiffData = {
  projectName: string;
  baselineLabel: string;
  currentLabel: string;
  addedFiles: string[];
  removedFiles: string[];
  addedRelations: string[];
  removedRelations: string[];
  summary: string;
};

const getTopItems = (items: string[], limit: number) =>
  items.filter(Boolean).slice(0, limit).join(', ') || 'N/A';

const TASK_STOPWORDS = new Set([
  'a', 'al', 'algo', 'alguna', 'alguno', 'analiza', 'analizar', 'and', 'como', 'con', 'cual', 'cuales',
  'de', 'del', 'donde', 'el', 'ella', 'ellas', 'ellos', 'en', 'encuentra', 'encuentre', 'entre', 'es',
  'esa', 'ese', 'eso', 'esta', 'este', 'esto', 'feature', 'for', 'hay', 'how', 'la', 'las', 'lo', 'los',
  'me', 'mi', 'modifica', 'modificar', 'necesito', 'or', 'otra', 'otro', 'para', 'pero', 'por', 'que',
  'quiero', 'revisa', 'revisar', 'se', 'si', 'sin', 'su', 'sus', 'tarea', 'task', 'the', 'this', 'to',
  'un', 'una', 'uno', 'use', 'ver', 'where', 'y'
]);

const TASK_TERM_ALIASES: Record<string, string[]> = {
  perfil: ['profile', 'profiles', 'account', 'cuenta', 'usuario', 'user', 'users'],
  usuario: ['user', 'users', 'account', 'cuenta', 'perfil', 'profile', 'auth', 'session', 'sesion'],
  auth: ['login', 'signin', 'signup', 'session', 'sesion', 'usuario', 'user', 'cuenta', 'account'],
  alumno: ['student', 'students', 'estudiante', 'estudiantes', 'usuario', 'user'],
  estudiante: ['student', 'students', 'alumno', 'alumnos', 'usuario', 'user'],
  asesor: ['advisor', 'teacher', 'coach', 'mentor'],
  admin: ['administrador', 'dashboard', 'panel', 'management'],
  pago: ['payment', 'payments', 'billing', 'checkout'],
  curso: ['course', 'courses', 'clase', 'clases', 'lesson'],
  configuracion: ['config', 'settings', 'preferences'],
  ajuste: ['update', 'edit', 'modify', 'patch', 'change'],
  error: ['bug', 'issue', 'fail', 'failure', 'crash'],
  api: ['endpoint', 'service', 'services', 'request', 'axios', 'fetch'],
  store: ['state', 'zustand', 'context', 'reducer'],
  dashboard: ['panel', 'home', 'overview'],
  componente: ['component', 'components', 'widget', 'view', 'screen'],
  pagina: ['page', 'pages', 'screen', 'route', 'view']
};

const SHORT_TASK_TERMS = new Set(['ai', 'db', 'ui', 'ux', 'id', 'qa']);

const normalizeTaskToken = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const simplifyTaskToken = (value: string) => {
  const normalized = normalizeTaskToken(value);
  if (normalized.endsWith('es') && normalized.length > 5) return normalized.slice(0, -2);
  if (normalized.endsWith('s') && normalized.length > 4) return normalized.slice(0, -1);
  return normalized;
};

const tokenizeTask = (task: string) =>
  task
    .split(/[^a-zA-Z0-9_]+/)
    .map((term) => simplifyTaskToken(term))
    .filter((term) => term && !TASK_STOPWORDS.has(term))
    .filter((term) => term.length >= 4 || SHORT_TASK_TERMS.has(term));

const expandTaskTerms = (terms: string[]) => {
  const expanded = new Set<string>();

  terms.forEach((term) => {
    expanded.add(term);

    const directAliases = TASK_TERM_ALIASES[term];
    if (directAliases) {
      directAliases.forEach((alias) => expanded.add(simplifyTaskToken(alias)));
    }

    Object.entries(TASK_TERM_ALIASES).forEach(([canonical, aliases]) => {
      const normalizedAliases = aliases.map((alias) => simplifyTaskToken(alias));
      if (canonical === term || normalizedAliases.includes(term)) {
        expanded.add(canonical);
        normalizedAliases.forEach((alias) => expanded.add(alias));
      }
    });
  });

  return Array.from(expanded).filter(Boolean);
};

const detectTaskIntents = (terms: string[]) => {
  const termSet = new Set(terms);
  const hasAny = (candidates: string[]) => candidates.some((candidate) => termSet.has(candidate));

  return {
    wantsUI: hasAny(['perfil', 'profile', 'componente', 'component', 'pagina', 'page', 'screen', 'view', 'dashboard']),
    wantsUserDomain: hasAny(['perfil', 'profile', 'usuario', 'user', 'auth', 'account', 'cuenta', 'student', 'alumno', 'estudiante']),
    wantsDataLayer: hasAny(['api', 'service', 'axios', 'fetch', 'store', 'state', 'context', 'zustand', 'db']),
    wantsBackend: hasAny(['backend', 'server', 'api', 'endpoint', 'route']),
    wantsBugFix: hasAny(['error', 'bug', 'issue', 'fail', 'failure', 'crash'])
  };
};

const getFileRoleHints = (file: ProjectFile) => {
  const lowerPath = file.path.toLowerCase();
  const lowerName = file.name.toLowerCase();

  return {
    isComponent: /\/components\/|\/pages\/|\/views\/|\/screens\//.test(lowerPath) || /(component|page|view|screen)/.test(lowerName),
    isApi: /\/api\/|\/services?\//.test(lowerPath) || /(api|service|axios|fetch)/.test(lowerName),
    isContext: /\/contexts?\//.test(lowerPath) || /context/.test(lowerName),
    isStore: /\/stores?\//.test(lowerPath) || /(store|zustand)/.test(lowerName),
    isHook: /\/hooks\//.test(lowerPath) || /^use[A-Z]/.test(file.name),
    isBackend: /\/server\/|\/backend\/|\/routes?\//.test(lowerPath) || /\.(py|php|rb|go)$/.test(lowerName),
    isEntryLike: /(app|main|index|router|layout)\.(t|j)sx?$/.test(lowerName)
  };
};

const scoreTermMatch = (haystack: string, term: string) => {
  if (!haystack.includes(term)) return 0;
  if (haystack === term) return 1;
  return 0.65;
};

const withProjectRoot = (projectName: string, path: string) => {
  const normalizedProject = projectName.trim() || 'Unknown Project';
  const normalizedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedPath) return normalizedProject;
  if (normalizedPath === normalizedProject || normalizedPath.startsWith(`${normalizedProject}/`)) {
    return normalizedPath;
  }
  return `${normalizedProject}/${normalizedPath}`;
};

const formatProjectPaths = (projectName: string, items: string[]) =>
  items.filter(Boolean).map((item) => withProjectRoot(projectName, item));

const detectTechStackSignals = (file: ProjectFile) => {
  const code = file.content.toLowerCase();
  const path = file.path.toLowerCase();
  const ext = file.ext.toLowerCase();

  const stack = new Set<string>();
  const databases = new Set<string>();
  const runtime = new Set<string>();
  const ui = new Set<string>();

  if (code.includes('react')) stack.add('React');
  if (code.includes('@angular/') || code.includes('angular.json') || code.includes('@component(')) stack.add('Angular');
  if (code.includes('next/') || code.includes('next.config')) stack.add('Next.js');
  if (code.includes('vue')) stack.add('Vue');
  if (code.includes('nuxt')) stack.add('Nuxt');
  if (code.includes('svelte')) stack.add('Svelte');
  if (code.includes('vite')) stack.add('Vite');
  if (code.includes('fastapi')) stack.add('FastAPI');
  if (code.includes('flask')) stack.add('Flask');
  if (code.includes('django')) stack.add('Django');
  if (code.includes('express')) stack.add('Express.js');
  if (code.includes('@nestjs/') || code.includes('nestfactory')) stack.add('NestJS');
  if (code.includes('tailwind')) stack.add('Tailwind CSS');
  if (ext === '.scss' || ext === '.sass' || code.includes('@mixin') || code.includes('$')) stack.add('SCSS/Sass');
  if (ext === '.css') stack.add('CSS');
  if (ext === '.html') stack.add('HTML');
  if (ext === '.ts' || ext === '.tsx' || code.includes('typescript')) stack.add('TypeScript');
  if (ext === '.js' || ext === '.jsx') stack.add('JavaScript');
  if (ext === '.py') stack.add('Python');
  if (ext === '.cs' || code.includes('using system') || code.includes('<project sdk=')) stack.add('C#');
  if (ext === '.cs' || code.includes('asp.net') || code.includes('microsoft.aspnetcore')) stack.add('.NET / ASP.NET');
  if (code.includes('zustand')) stack.add('Zustand');
  if (code.includes('redux')) stack.add('Redux');
  if (code.includes('dexie')) stack.add('Dexie');
  if (code.includes('firebase')) stack.add('Firebase');
  if (code.includes('socket.io') || code.includes('websocket')) stack.add('WebSockets');
  if (code.includes('vite-plugin-pwa') || code.includes('manifest')) stack.add('PWA');

  if (code.includes('prisma')) databases.add('Prisma');
  if (code.includes('mongoose')) databases.add('MongoDB/Mongoose');
  if (code.includes('sequelize')) databases.add('Sequelize');
  if (code.includes('typeorm')) databases.add('TypeORM');
  if (code.includes('dexie') || code.includes('indexeddb')) databases.add('IndexedDB');
  if (code.includes('sqlite')) databases.add('SQLite');
  if (code.includes('postgres')) databases.add('PostgreSQL');
  if (code.includes('mysql')) databases.add('MySQL');
  if (code.includes('sqlserver') || code.includes('entityframework')) databases.add('SQL Server');

  if (code.includes('fastapi') || code.includes('flask') || code.includes('django')) runtime.add('Backend Python');
  if (code.includes('express') || code.includes('@nestjs/')) runtime.add('Backend Node');
  if (ext === '.cs' || code.includes('microsoft.aspnetcore')) runtime.add('Backend .NET');
  if (code.includes('worker') || path.includes('worker')) runtime.add('Background Worker');

  if (['.tsx', '.jsx', '.vue', '.svelte'].includes(ext) || code.includes('@angular/')) ui.add('SPA Frontend');
  if (ext === '.html' || ext === '.css' || ext === '.scss' || ext === '.sass') ui.add('Web UI');

  return {
    stack: Array.from(stack),
    databases: Array.from(databases),
    runtime: Array.from(runtime),
    ui: Array.from(ui)
  };
};

const normalizeComparablePath = (value: string) =>
  normalizeTaskToken(value)
    .replace(/\\/g, '/')
    .replace(/^[a-z]:\//, '')
    .replace(/^\/+/, '')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/');

const stripLineSuffix = (value: string) => value.replace(/:\d+(?::\d+)?$/, '');

const getPathBasename = (value: string) => {
  const normalized = normalizeComparablePath(stripLineSuffix(value));
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
};

const uniqueStrings = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

const extractStackPathHints = (errorText: string) => {
  const matches = errorText.match(/(?:[A-Za-z]:)?[^\s()'"`]+?\.(?:tsx?|jsx?|py|go|java|cs|php|rb|rs|vue|svelte|html|css|scss|json)(?::\d+(?::\d+)?)?/g) || [];
  return uniqueStrings(
    matches
      .map((match) => stripLineSuffix(match.trim().replace(/[),.;]+$/, '')))
      .map((match) => normalizeComparablePath(match))
      .filter((match) => match.length > 2)
  );
};

const GENERIC_AI_PHRASES = [
  'en este análisis',
  'las responsabilidades del proyecto se pueden resumir',
  'la auditoría ia',
  'la revisión ia',
  'este documento fue generado',
  'se identificarán las responsabilidades'
];

const sanitizeAIHighlights = (aiReview: string | null) => {
  if (!aiReview) return [];

  const seen = new Set<string>();

  return aiReview
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('```'))
    .filter((line) => !line.startsWith('#'))
    .filter((line) => !/^[-*=\s]+$/.test(line))
    .filter((line) => !/^>\s*$/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter((line) => line.length >= 24)
    .filter((line) => !GENERIC_AI_PHRASES.some((phrase) => line.toLowerCase().includes(phrase)))
    .filter((line) => {
      const normalized = line.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
};

const scoreAIHighlightForIntent = (line: string, intent: 'vision' | 'architecture' | 'refactor' | 'handoff') => {
  const normalized = line.toLowerCase();
  const keywordsByIntent = {
    vision: ['contexto', 'valor', 'agentes', 'desarrolladores', 'handoff', 'task', 'error', 'semantic', 'impacto', 'memoria'],
    architecture: ['arquitect', 'flujo', 'módulo', 'modulo', 'depend', 'capa', 'grafo', 'store', 'frontend', 'backend', 'hotspot'],
    refactor: ['refactor', 'riesgo', 'deuda', 'cuello', 'mejora', 'valid', 'complej', 'acopla', 'impacto', 'hotspot'],
    handoff: ['revis', 'archivo', 'antes de', 'cambiar', 'editar', 'valid', 'prior', 'cuidado', 'flujo', 'depend']
  } as const;

  return keywordsByIntent[intent].reduce((score, keyword) => (
    normalized.includes(keyword) ? score + 2 : score
  ), 0);
};

const extractAIHighlightsForIntent = (aiReview: string | null, intent: 'vision' | 'architecture' | 'refactor' | 'handoff', limit = 4) => {
  const highlights = sanitizeAIHighlights(aiReview);

  return highlights
    .map((line) => ({ line, score: scoreAIHighlightForIntent(line, intent) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.line.length - a.line.length;
    })
    .filter((item, index, items) => item.score > 0 || index < Math.min(limit, items.length))
    .slice(0, limit)
    .map((item) => item.line);
};

const buildAIEnhancementBlock = (highlights: string[], title: string, intro: string) => {
  if (!highlights.length) return '';

  let text = `\n## ${title}\n`;
  text += `${intro}\n`;
  highlights.forEach((item) => {
    text += `- ${item}\n`;
  });
  return text;
};

const buildAIVisionDocument = (projectName: string, aiReview: string, stack: string[], entryPoints: string[]) => {
  const highlights = extractAIHighlightsForIntent(aiReview, 'vision', 4);
  let text = `# AI Project Vision: ${projectName}\n\n`;
  text += `## Propósito Inferido\n`;
  text += `Resumen corto para entender por qué existe el proyecto y qué valor entrega antes de entrar al detalle técnico.\n\n`;
  text += `## Contexto Base\n`;
  text += `- Proyecto: ${projectName}\n`;
  text += `- Stack detectado: ${getTopItems(stack, 8)}\n`;
  text += `- Entry points principales: ${getTopItems(entryPoints, 6)}\n`;
  text += buildAIEnhancementBlock(
    highlights,
    'Lectura de Valor',
    'Señales útiles para explicar rápido qué resuelve el producto y por qué no es solo visualización:'
  );
  text += `\n## Cómo Usar Este Documento\n`;
  text += `- Léelo primero si alguien necesita ubicarse rápido en el producto.\n`;
  text += `- Complétalo con snapshot, task pack y graph guide si ya vas a editar código.\n`;
  return text;
};

const buildAIArchitectureNarrative = (projectName: string, aiReview: string, topRelations: string[], hotspots: { label: string; path: string; importance: number }[]) => {
  const highlights = extractAIHighlightsForIntent(aiReview, 'architecture', 5);
  let text = `# AI Architecture Narrative: ${projectName}\n\n`;
  text += `## Narrativa del Sistema\n`;
  text += `Traducción corta del grafo a una lectura más humana de flujos, piezas centrales y tensiones del sistema.\n\n`;
  text += `## Relaciones Estructurales Clave\n`;
  topRelations.slice(0, 12).forEach((relation) => {
    text += `- ${relation}\n`;
  });
  text += `\n## Hotspots de Referencia\n`;
  hotspots.slice(0, 8).forEach((item) => {
    text += `- ${item.label} -> ${withProjectRoot(projectName, item.path)} [${item.importance}]\n`;
  });
  text += buildAIEnhancementBlock(
    highlights,
    'Lectura Arquitectónica de IA',
    'Observaciones de arquitectura que sí vale la pena cruzar con el grafo antes de tocar módulos centrales:'
  );
  return text;
};

const buildAIRefactorPriorities = (projectName: string, aiReview: string, hotspots: { label: string; path: string; importance: number }[]) => {
  const highlights = extractAIHighlightsForIntent(aiReview, 'refactor', 5);
  let text = `# AI Refactor Priorities: ${projectName}\n\n`;
  text += `## Prioridad Determinista Inicial\n`;
  hotspots.slice(0, 10).forEach((item, index) => {
    text += `${index + 1}. ${item.label} -> ${withProjectRoot(projectName, item.path)} [impacto ${item.importance}]\n`;
  });
  text += buildAIEnhancementBlock(
    highlights,
    'Prioridades Sugeridas por IA',
    'Zonas donde la IA ve más riesgo, deuda o valor potencial de simplificación:'
  );
  text += `\n## Uso Recomendado\n`;
  text += `- Cruza estas prioridades con hotspots y graph guide antes de refactorizar.\n`;
  text += `- Si una prioridad toca estado compartido o integraciones clave, valida también stores, utilidades y puntos de entrada conectados.\n`;
  return text;
};

const buildAIAgentHandoff = (projectName: string, aiReview: string, taskPack: string) => {
  const highlights = extractAIHighlightsForIntent(aiReview, 'handoff', 4);
  let text = `# AI Agent Handoff: ${projectName}\n\n`;
  text += `## Instrucción de Uso\n`;
  text += `Documento corto para pasarle a otro agente lo mínimo útil sin convertir esto en una wiki eterna.\n`;
  text += `Úsalo junto con el task pack para reducir onboarding y evitar exploración innecesaria.\n`;
  text += buildAIEnhancementBlock(
    highlights,
    'Notas Estratégicas de IA',
    'Pistas rápidas para decidir por dónde entrar y qué validar antes de editar:'
  );
  text += `\n## Task Pack Base\n`;
  text += `${taskPack}\n`;
  return text;
};

const extractProjectInsights = (projectData: ProjectData, projectName: string): ProjectInsights => {
  const stack = new Set<string>();
  const directories = new Set<string>();
  const entryPoints: string[] = [];
  const fileExtCount = new Map<string, number>();
  const connectionMap = new Map<string, { outgoing: string[]; incoming: string[] }>();
  const layerMap = new Map<string, string[]>();

  projectData.nodes.forEach((node) => {
    connectionMap.set(node.id, { outgoing: [], incoming: [] });
  });

  projectData.files.forEach((file) => {
    const signals = detectTechStackSignals(file);
    fileExtCount.set(file.ext || 'no-ext', (fileExtCount.get(file.ext || 'no-ext') || 0) + 1);

    signals.stack.forEach((item) => stack.add(item));

    const parts = file.path.split('/');
    if (parts.length > 1) directories.add(parts[0]);

    const layer = parts.length > 1 ? parts.slice(0, Math.min(parts.length - 1, 2)).join('/') : 'root';
    if (!layerMap.has(layer)) layerMap.set(layer, []);
    if (layerMap.get(layer)!.length < 12) layerMap.get(layer)!.push(file.name);

    const lowerName = file.name.toLowerCase();
    if (['main.tsx', 'main.jsx', 'app.tsx', 'app.jsx', 'main.py', 'server.js', 'index.js', 'index.ts'].includes(lowerName)) {
      entryPoints.push(file.path);
    }
  });

  projectData.links.forEach((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    const sourceNode = projectData.nodes.find((node) => node.id === sourceId);
    const targetNode = projectData.nodes.find((node) => node.id === targetId);
    const sourceLabel = sourceNode?.label || sourceId;
    const targetLabel = targetNode?.label || targetId;

    if (connectionMap.has(sourceId)) connectionMap.get(sourceId)!.outgoing.push(targetLabel);
    if (connectionMap.has(targetId)) connectionMap.get(targetId)!.incoming.push(sourceLabel);
  });

  const topHotspots = [...projectData.nodes]
    .sort((a, b) => (b.data.importance || 0) - (a.data.importance || 0))
    .slice(0, 10)
    .map((node) => ({
      label: node.label,
      path: node.id,
      importance: node.data.importance || 0,
      ext: node.group
    }));

  const graphLeaders = [...projectData.nodes]
    .map((node) => {
      const connections = connectionMap.get(node.id) || { outgoing: [], incoming: [] };
      return {
        label: node.label,
        path: node.id,
        outgoing: connections.outgoing.length,
        incoming: connections.incoming.length,
        total: connections.outgoing.length + connections.incoming.length,
        outgoingTargets: connections.outgoing.slice(0, 6),
        incomingSources: connections.incoming.slice(0, 6)
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const topRelations = projectData.links.slice(0, 20).map((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    const sourceNode = projectData.nodes.find((node) => node.id === sourceId);
    const targetNode = projectData.nodes.find((node) => node.id === targetId);
    return `${sourceNode?.label || sourceId} -> ${targetNode?.label || targetId}`;
  });

  const dominantFileTypes = [...fileExtCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([ext, count]) => `${ext} (${count})`);

  const layerEntries = [...layerMap.entries()]
    .map(([layer, files]) => ({ layer, files, count: files.length }))
    .sort((a, b) => a.layer.localeCompare(b.layer));

  return {
    projectName,
    stack: Array.from(stack),
    directories: Array.from(directories),
    entryPoints,
    dominantFileTypes,
    topHotspots,
    topRelations,
    graphLeaders,
    layerEntries
  };
};

const buildExecutiveContext = (insights: ProjectInsights, filesCount: number, linksCount: number, aiReview?: string | null) => {
  const highlights = extractAIHighlightsForIntent(aiReview || null, 'vision', 4);
  let text = `# Executive View: ${insights.projectName}\n\n`;
  text += `## Qué Hace\n`;
  text += `${insights.projectName} es un proyecto orientado a entregar contexto arquitectónico accionable para desarrolladores y agentes de programación.\n\n`;
  text += `## Resumen Rápido\n`;
  text += `- Archivos analizados: ${filesCount}\n`;
  text += `- Relaciones detectadas: ${linksCount}\n`;
  text += `- Stack principal: ${getTopItems(insights.stack, 8)}\n`;
  text += `- Entry points: ${getTopItems(insights.entryPoints, 8)}\n`;
  text += `- Directorios principales: ${getTopItems(insights.directories, 10)}\n`;
  text += `- Hotspots principales: ${insights.topHotspots.slice(0, 6).map((item) => `${item.label} [${item.importance}]`).join(', ') || 'N/A'}\n\n`;
  text += `## Qué Debe Entender Otro Agente\n`;
  text += `- Empieza por los entry points para entender el flujo base.\n`;
  text += `- Revisa los hotspots porque suelen orquestar pantallas, estado o integración.\n`;
  text += `- Sigue las relaciones principales para ubicar rápido dónde tocar cuando te pidan una funcionalidad.\n`;
  text += buildAIEnhancementBlock(
    highlights,
    'Capa IA',
    'Hallazgos resumidos a partir de la auditoría IA actual para complementar la lectura ejecutiva:'
  );
  return text;
};

const buildSystemView = (insights: ProjectInsights, aiReview?: string | null) => {
  const highlights = extractAIHighlightsForIntent(aiReview || null, 'architecture', 4);
  let text = `# System View: ${insights.projectName}\n\n`;
  text += `## Capas Detectadas\n`;
  insights.layerEntries.forEach((entry) => {
    text += `- [${entry.layer}]: ${entry.files.join(', ')}${entry.count >= 12 ? '...' : ''}\n`;
  });
  text += `\n## Módulos Más Conectados\n`;
  insights.graphLeaders.slice(0, 10).forEach((leader) => {
    text += `- ${leader.label}: ${leader.total} conexiones (${leader.outgoing} salientes, ${leader.incoming} entrantes)\n`;
    text += `  Usa -> ${getTopItems(leader.outgoingTargets, 4)}\n`;
    text += `  Es usado por -> ${getTopItems(leader.incomingSources, 4)}\n`;
  });
  text += `\n## Flujos de Dependencia\n`;
  insights.topRelations.forEach((relation) => {
    text += `- ${relation}\n`;
  });
  text += buildAIEnhancementBlock(
    highlights,
    'AI Layer',
    'Estos puntos condensan hallazgos de la revisión IA para enriquecer la vista sistémica:'
  );
  return text;
};

const buildHotspotReport = (insights: ProjectInsights, aiReview?: string | null) => {
  const highlights = extractAIHighlightsForIntent(aiReview || null, 'refactor', 4);
  let text = `# Hotspots & Deuda Técnica: ${insights.projectName}\n\n`;
  text += `## Hotspots Prioritarios\n`;
  insights.topHotspots.forEach((item, index) => {
    text += `${index + 1}. ${item.label}\n`;
    text += `   Path: ${withProjectRoot(insights.projectName, item.path)}\n`;
    text += `   Importancia: ${item.importance}\n`;
    text += `   Tipo: ${item.ext}\n`;
  });
  text += `\n## Recomendaciones de Acción\n`;
  text += `- Revisa primero los archivos con más conexiones entrantes: suelen ser utilidades compartidas o núcleos frágiles.\n`;
  text += `- Revisa luego los archivos con más conexiones salientes: suelen ser orquestadores o pantallas con demasiadas responsabilidades.\n`;
  text += `- Antes de refactorizar, sigue las relaciones del grafo para evitar romper cadenas de dependencias ocultas.\n`;
  text += buildAIEnhancementBlock(
    highlights,
    'Señales IA Sobre Riesgo',
    'La auditoría IA detectó estos focos de atención que conviene validar junto al ranking determinista:'
  );
  return text;
};

const buildTaskPackData = (projectData: ProjectData, insights: ProjectInsights, task: string): AgentTaskPackData => {
  const rootPath = (path: string) => withProjectRoot(insights.projectName, path);
  const normalizedTask = task.trim() || 'Analiza la tarea solicitada y ubica los archivos relevantes.';
  const baseTerms = tokenizeTask(normalizedTask);
  const expandedTerms = expandTaskTerms(baseTerms);
  const intents = detectTaskIntents(expandedTerms);

  const scoredFiles = projectData.files.map((file) => {
    const lowerPath = file.path.toLowerCase();
    const lowerName = file.name.toLowerCase();
    const lowerContent = file.content.toLowerCase();
    const pathPartSet = new Set(lowerPath.split(/[\/._-]+/).filter(Boolean));
    const roleHints = getFileRoleHints(file);
    let score = Math.min(file.importance || 0, 10);
    const reasons = new Set<string>();
    let matchedBaseTerms = 0;
    let matchedExpandedTerms = 0;

    baseTerms.forEach((term) => {
      const exactPathTokenMatch = pathPartSet.has(term);
      const nameMatch = scoreTermMatch(lowerName, term);
      const pathMatch = exactPathTokenMatch ? 1 : scoreTermMatch(lowerPath, term);

      if (nameMatch > 0) {
        score += exactPathTokenMatch ? 24 : Math.round(18 * nameMatch);
        matchedBaseTerms += 1;
        reasons.add(`El archivo parece vivir la tarea por "${term}"`);
      }
      if (pathMatch > 0) {
        score += exactPathTokenMatch ? 18 : Math.round(12 * pathMatch);
        if (exactPathTokenMatch) matchedBaseTerms += 1;
        reasons.add(`La ruta apunta al dominio "${term}"`);
      }
      if (term.length >= 5 && lowerContent.includes(term)) {
        score += 2;
        reasons.add(`El contenido menciona "${term}"`);
      }
    });

    expandedTerms
      .filter((term) => !baseTerms.includes(term))
      .forEach((term) => {
        const exactPathTokenMatch = pathPartSet.has(term);
        const nameMatch = scoreTermMatch(lowerName, term);
        const pathMatch = exactPathTokenMatch ? 1 : scoreTermMatch(lowerPath, term);

        if (nameMatch > 0) {
          score += exactPathTokenMatch ? 14 : Math.round(10 * nameMatch);
          matchedExpandedTerms += 1;
          reasons.add(`Se alinea semánticamente con "${term}"`);
        }
        if (pathMatch > 0) {
          score += exactPathTokenMatch ? 10 : Math.round(6 * pathMatch);
          if (exactPathTokenMatch) matchedExpandedTerms += 1;
          reasons.add(`La ruta sugiere relación con "${term}"`);
        }
        if (term.length >= 6 && lowerContent.includes(term)) {
          score += 1;
        }
      });

    if (intents.wantsUI && roleHints.isComponent) {
      score += 8;
      reasons.add('Es un componente o pantalla de UI relevante para la tarea');
    }

    if (intents.wantsUserDomain && roleHints.isContext) {
      score += 8;
      reasons.add('Es un contexto relacionado con sesión, usuario o estado compartido');
    }

    if (intents.wantsUserDomain && roleHints.isStore) {
      score += 7;
      reasons.add('Gestiona estado que probablemente impacta la funcionalidad pedida');
    }

    if (intents.wantsDataLayer && roleHints.isApi) {
      score += 9;
      reasons.add('Pertenece a la capa de API o servicios conectada con la tarea');
    }

    if (intents.wantsBackend && roleHints.isBackend) {
      score += 8;
      reasons.add('Está del lado servidor o backend, útil para seguir la cadena de impacto');
    }

    if (roleHints.isHook && (intents.wantsUI || intents.wantsUserDomain)) {
      score += 5;
      reasons.add('Puede encapsular lógica reutilizable vinculada con la tarea');
    }

    if (insights.entryPoints.includes(file.path)) {
      score += matchedBaseTerms > 0 || matchedExpandedTerms > 1 ? 4 : 2;
      reasons.add('Es un entry point del proyecto');
    }

    if (roleHints.isEntryLike && (matchedBaseTerms > 0 || matchedExpandedTerms > 0)) {
      score += 4;
      reasons.add('Orquesta flujo o navegación relacionada con la tarea');
    }

    if ((file.importance || 0) >= 6) {
      score += 4;
      reasons.add(`Tiene impacto arquitectónico ${file.importance || 0}`);
    } else if ((file.importance || 0) > 0) {
      reasons.add(`Tiene impacto arquitectónico ${file.importance || 0}`);
    }

    if (intents.wantsBugFix && (file.importance || 0) >= 8) {
      score += 3;
      reasons.add('Es un hotspot; conviene validar si la falla pasa por aquí');
    }

    if (matchedBaseTerms === 0 && matchedExpandedTerms === 0 && (file.importance || 0) < 7) {
      score = Math.min(score, file.importance || 0);
    }

    return { file, score, reasons: Array.from(reasons), matchedBaseTerms, matchedExpandedTerms };
  });

  const primaryFiles = scoredFiles
    .filter((item) => item.score >= 12 || item.matchedBaseTerms > 0 || item.matchedExpandedTerms >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => ({
      path: rootPath(item.file.path),
      importance: item.file.importance || 0,
      score: item.score,
      reasons: item.reasons.length ? item.reasons.slice(0, 3) : ['Archivo priorizado por relevancia estructural']
    }));

  const primaryIds = new Set(primaryFiles.map((file) => file.path));
  const relatedMap = new Map<string, TaskPackFileCandidate>();
  projectData.links.forEach((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    if (primaryIds.has(sourceId) && !primaryIds.has(targetId)) {
      const targetFile = projectData.files.find((file) => file.id === targetId);
      if (targetFile) {
        const roleHints = getFileRoleHints(targetFile);
        const relationReasons = ['Está conectado por dependencia con un archivo primario'];
        if (roleHints.isApi) relationReasons.push('Puede resolver la capa de integración o datos');
        if (roleHints.isContext || roleHints.isStore) relationReasons.push('Puede propagar estado o contexto relacionado');
        relatedMap.set(targetId, {
          path: rootPath(targetFile.path),
          importance: targetFile.importance || 0,
          score: (targetFile.importance || 0) + (roleHints.isApi || roleHints.isContext || roleHints.isStore ? 4 : 0),
          reasons: relationReasons
        });
      }
    }
    if (primaryIds.has(targetId) && !primaryIds.has(sourceId)) {
      const sourceFile = projectData.files.find((file) => file.id === sourceId);
      if (sourceFile) {
        const roleHints = getFileRoleHints(sourceFile);
        const relationReasons = ['Está conectado por dependencia con un archivo primario'];
        if (roleHints.isApi) relationReasons.push('Puede resolver la capa de integración o datos');
        if (roleHints.isContext || roleHints.isStore) relationReasons.push('Puede propagar estado o contexto relacionado');
        relatedMap.set(sourceId, {
          path: rootPath(sourceFile.path),
          importance: sourceFile.importance || 0,
          score: (sourceFile.importance || 0) + (roleHints.isApi || roleHints.isContext || roleHints.isStore ? 4 : 0),
          reasons: relationReasons
        });
      }
    }
  });

  const relatedFiles = Array.from(relatedMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const fallbackFiles = insights.topHotspots.slice(0, 5).map((item) => ({
    path: rootPath(item.path),
    importance: item.importance,
    score: item.importance,
    reasons: ['Hotspot arquitectónico del proyecto']
  }));

  const finalPrimaryFiles = primaryFiles.length ? primaryFiles : fallbackFiles;
  const readingOrder = [
    ...formatProjectPaths(insights.projectName, insights.entryPoints.slice(0, 3)),
    ...finalPrimaryFiles.slice(0, 4).map((file) => file.path),
    ...relatedFiles.slice(0, 3).map((file) => file.path)
  ].filter((path, index, array) => path && array.indexOf(path) === index);

  const implementationFocus = [
    'Empieza por los archivos primarios y confirma si contienen la UI, lógica o integración principal de la tarea.',
    'Después revisa archivos relacionados para detectar dependencias laterales, estado compartido y posibles regresiones.',
    'Si modificas un hotspot, valida entradas y salidas del módulo antes de aplicar cambios.',
    baseTerms.length
      ? `Términos guía detectados: ${baseTerms.join(', ')}. Usa esos conceptos para seguir componentes, stores, contextos y APIs.`
      : 'No hubo términos fuertes en la tarea; apóyate más en entry points, hotspots y relaciones del grafo.'
  ];

  return {
    task: normalizedTask,
    projectName: insights.projectName,
    projectSummary: `${insights.projectName} usa ${getTopItems(insights.stack, 6)} y tiene como entry points ${getTopItems(formatProjectPaths(insights.projectName, insights.entryPoints), 4)}.`,
    stack: insights.stack,
    entryPoints: formatProjectPaths(insights.projectName, insights.entryPoints),
    primaryFiles: finalPrimaryFiles,
    relatedFiles,
    readingOrder,
    implementationFocus
  };
};

const buildTaskPack = (projectData: ProjectData, insights: ProjectInsights, task: string, aiReview?: string | null) => {
  const data = buildTaskPackData(projectData, insights, task);
  const highlights = extractAIHighlightsForIntent(aiReview || null, 'handoff', 4);
  let text = `# Agent Task Pack: ${data.projectName}\n\n`;
  text += `## Tarea Solicitada\n`;
  text += `${data.task}\n\n`;
  text += `## Qué Hace el Proyecto\n`;
  text += `- Resumen: ${data.projectSummary}\n`;
  text += `- Stack: ${getTopItems(data.stack, 8)}\n`;
  text += `- Entry points: ${getTopItems(data.entryPoints, 6)}\n\n`;
  text += `## Archivos Primarios a Revisar\n`;
  data.primaryFiles.forEach((file) => {
    text += `- \`${file.path}\` (impacto: ${file.importance}, score: ${file.score})\n`;
    file.reasons.forEach((reason) => {
      text += `  - ${reason}\n`;
    });
  });
  text += `\n## Archivos Relacionados\n`;
  if (!data.relatedFiles.length) {
    text += `- No se detectaron relacionados claros en el subgrafo inicial.\n`;
  } else {
    data.relatedFiles.forEach((file) => {
      text += `- \`${file.path}\`\n`;
      file.reasons.forEach((reason) => {
        text += `  - ${reason}\n`;
      });
    });
  }
  text += `\n## Orden de Lectura Recomendado\n`;
  data.readingOrder.forEach((path, index) => {
    text += `${index + 1}. \`${path}\`\n`;
  });
  text += `\n## Instrucciones para el Agente\n`;
  data.implementationFocus.forEach((item, index) => {
    text += `${index + 1}. ${item}\n`;
  });
  text += buildAIEnhancementBlock(
    highlights,
    'AI Handoff Notes',
    'Si ya existe auditoría IA, usa estas notas como segunda capa antes de editar archivos:'
  );
  return text;
};

const buildErrorContextPackData = (projectData: ProjectData, insights: ProjectInsights, rawErrorInput: string): ErrorContextPackData => {
  const rootPath = (path: string) => withProjectRoot(insights.projectName, path);
  const rawError = rawErrorInput.trim() || 'Error no especificado. Pega aquí el mensaje o stack trace para generar contexto.';
  const errorHeadline = rawError
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 180) || 'Error no especificado';

  const stackPaths = extractStackPathHints(rawError);
  const stackBasenames = uniqueStrings(stackPaths.map((item) => getPathBasename(item)));
  const baseTerms = tokenizeTask(rawError);
  const expandedTerms = uniqueStrings(expandTaskTerms([...baseTerms, ...stackBasenames.map((item) => item.replace(/\.[^.]+$/, ''))]));
  const matchedSignals = uniqueStrings([
    ...stackPaths.map((item) => `stack:${item}`),
    ...expandedTerms.slice(0, 10).map((item) => `term:${item}`)
  ]);

  const scoredFiles = projectData.files.map((file) => {
    const comparablePath = normalizeComparablePath(file.path);
    const comparableName = normalizeComparablePath(file.name);
    const lowerContent = normalizeTaskToken(file.content);
    const roleHints = getFileRoleHints(file);
    let score = Math.min(file.importance || 0, 10);
    const reasons = new Set<string>();

    const directPathMatches = stackPaths.filter((hint) =>
      comparablePath === hint ||
      comparablePath.endsWith(`/${hint}`) ||
      hint.endsWith(`/${comparablePath}`)
    );

    const basenameMatches = stackBasenames.filter((basename) => comparableName === basename);

    if (directPathMatches.length) {
      score += 42 + (directPathMatches.length - 1) * 6;
      reasons.add(`El stack trace apunta directamente a ${directPathMatches[0]}`);
    } else if (basenameMatches.length) {
      score += 28;
      reasons.add(`El nombre del archivo coincide con el stack trace (${basenameMatches[0]})`);
    }

    expandedTerms.forEach((term) => {
      const pathMatch = scoreTermMatch(comparablePath, term);
      const nameMatch = scoreTermMatch(comparableName, term);
      if (nameMatch > 0) {
        score += Math.round(10 * nameMatch);
        reasons.add(`El archivo se alinea con la señal "${term}"`);
      }
      if (pathMatch > 0) {
        score += Math.round(8 * pathMatch);
        reasons.add(`La ruta sugiere relación con "${term}"`);
      }
      if (term.length >= 5 && lowerContent.includes(term)) {
        score += 1;
      }
    });

    if (roleHints.isHook) {
      score += 4;
      reasons.add('Puede encapsular la lógica donde explotó el flujo');
    }

    if (roleHints.isContext || roleHints.isStore) {
      score += 4;
      reasons.add('Puede propagar estado que explique el error');
    }

    if (roleHints.isApi || roleHints.isBackend) {
      score += 3;
      reasons.add('Puede estar involucrado en la integración o respuesta que detonó la falla');
    }

    if (insights.entryPoints.includes(file.path)) {
      score += 2;
      reasons.add('Es un entry point útil para reconstruir el flujo');
    }

    if ((file.importance || 0) >= 7) {
      score += 3;
      reasons.add(`Es un hotspot arquitectónico (${file.importance || 0})`);
    }

    return {
      file,
      score,
      reasons: Array.from(reasons)
    };
  });

  const rankedFiles = scoredFiles.sort((a, b) => b.score - a.score);
  const bestMatch = rankedFiles[0];
  const probableOrigin: ErrorContextFileCandidate | null = bestMatch
    ? {
        path: rootPath(bestMatch.file.path),
        nodeId: bestMatch.file.id,
        importance: bestMatch.file.importance || 0,
        score: bestMatch.score,
        reasons: bestMatch.reasons.slice(0, 4).length ? bestMatch.reasons.slice(0, 4) : ['Archivo priorizado por relevancia estructural'],
        relation: stackPaths.length || expandedTerms.length ? 'origin' : 'hotspot'
      }
    : null;

  const relatedFiles: ErrorContextFileCandidate[] = [];
  if (probableOrigin) {
    const neighborMap = new Map<string, ErrorContextFileCandidate>();
    projectData.links.forEach((link) => {
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
      let neighborId: string | null = null;

      if (sourceId === probableOrigin.nodeId && targetId !== probableOrigin.nodeId) neighborId = targetId;
      if (targetId === probableOrigin.nodeId && sourceId !== probableOrigin.nodeId) neighborId = sourceId;
      if (!neighborId) return;

      const neighborFile = projectData.files.find((file) => file.id === neighborId);
      if (!neighborFile) return;

      const roleHints = getFileRoleHints(neighborFile);
      const reasons = ['Está conectado en el grafo con el archivo origen probable'];
      let score = neighborFile.importance || 0;

      if (roleHints.isApi) {
        score += 4;
        reasons.push('Puede intervenir en la capa de integración');
      }
      if (roleHints.isContext || roleHints.isStore) {
        score += 4;
        reasons.push('Puede propagar estado o contexto relacionado');
      }
      if (roleHints.isHook) {
        score += 3;
        reasons.push('Puede encapsular el comportamiento donde se disparó la falla');
      }
      if (roleHints.isEntryLike) {
        score += 2;
        reasons.push('Ayuda a reconstruir el flujo desde el punto de entrada');
      }

      neighborMap.set(neighborId, {
        path: rootPath(neighborFile.path),
        nodeId: neighborFile.id,
        importance: neighborFile.importance || 0,
        score,
        reasons,
        relation: 'neighbor'
      });
    });

    relatedFiles.push(
      ...Array.from(neighborMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    );
  }

  const readingOrder = uniqueStrings([
    probableOrigin?.path || '',
    ...relatedFiles.slice(0, 4).map((item) => item.path),
    ...formatProjectPaths(insights.projectName, insights.entryPoints.slice(0, 3))
  ]);

  const implementationFocus = [
    'Empieza por el archivo origen probable y confirma si el stack trace realmente cae ahí o si solo es el último nodo visible.',
    'Después sigue los vecinos del grafo para revisar dependencias, hooks, stores o servicios que alimentan ese punto.',
    stackPaths.length
      ? `Usa estas rutas detectadas como pista fuerte: ${stackPaths.slice(0, 4).join(', ')}.`
      : 'No se detectó una ruta fuerte en el stack; apóyate más en el mensaje del error y en los hotspots conectados.',
    expandedTerms.length
      ? `Señales semánticas detectadas: ${expandedTerms.slice(0, 8).join(', ')}. Úsalas para filtrar archivos y validar supuestos.`
      : 'Si el mensaje es muy genérico, vuelve a pegar el stack completo para mejorar la precisión del pack.'
  ];

  const summary = probableOrigin
    ? `ProjectGrapher detectó como origen probable ${probableOrigin.path} y encontró ${relatedFiles.length} vecinos relevantes en el grafo local.`
    : `ProjectGrapher no detectó un archivo origen fuerte, pero preparó un set mínimo de pistas para revisar el flujo.`;

  const modelPrompt = [
    `Analiza este Error-to-Context Pack de un proyecto local cargado en ProjectGrapher.`,
    `No tienes acceso al repositorio completo ni a un remoto; trabaja solo con este contexto resumido.`,
    `Prioriza el archivo origen probable, luego los vecinos del grafo y por último los entry points si necesitas reconstruir el flujo.`,
    `Explica qué revisar primero, hipótesis más probables y cambios mínimos sugeridos para confirmar la causa.`
  ].join(' ');

  return {
    rawError,
    errorHeadline,
    summary,
    projectName: insights.projectName,
    stack: insights.stack,
    stackPaths,
    matchedSignals,
    probableOrigin,
    relatedFiles,
    readingOrder,
    implementationFocus,
    modelPrompt
  };
};

const buildErrorContextPack = (projectData: ProjectData, insights: ProjectInsights, rawError: string) => {
  const data = buildErrorContextPackData(projectData, insights, rawError);
  let text = `# Error-to-Context Pack: ${data.projectName}\n\n`;
  text += `## Error Capturado\n`;
  text += `${data.errorHeadline}\n\n`;
  text += `## Resumen Operativo\n`;
  text += `- ${data.summary}\n`;
  text += `- Stack detectado en el proyecto: ${getTopItems(data.stack, 8)}\n`;
  text += `- Señales detectadas: ${getTopItems(data.matchedSignals, 10)}\n\n`;
  text += `## Stack Trace o Mensaje Base\n`;
  text += '```text\n';
  text += `${data.rawError}\n`;
  text += '```\n\n';
  text += `## Archivo Origen Probable\n`;
  if (data.probableOrigin) {
    text += `- \`${data.probableOrigin.path}\` (impacto: ${data.probableOrigin.importance}, score: ${data.probableOrigin.score})\n`;
    data.probableOrigin.reasons.forEach((reason) => {
      text += `  - ${reason}\n`;
    });
  } else {
    text += `- No se detectó un origen con alta confianza.\n`;
  }
  text += `\n## Vecinos Relevantes del Grafo\n`;
  if (!data.relatedFiles.length) {
    text += `- No se detectaron vecinos claros para el origen probable.\n`;
  } else {
    data.relatedFiles.forEach((file) => {
      text += `- \`${file.path}\`\n`;
      file.reasons.forEach((reason) => {
        text += `  - ${reason}\n`;
      });
    });
  }
  text += `\n## Orden de Revisión Recomendada\n`;
  data.readingOrder.forEach((path, index) => {
    text += `${index + 1}. \`${path}\`\n`;
  });
  text += `\n## Qué Revisar Primero\n`;
  data.implementationFocus.forEach((item, index) => {
    text += `${index + 1}. ${item}\n`;
  });
  text += `\n## Prompt Corto Para IA\n`;
  text += `${data.modelPrompt}\n`;
  return text;
};

const buildImpactAnalysisData = (projectData: ProjectData, projectName: string, nodeId: string): ImpactAnalysisData | null => {
  const node = projectData.nodes.find((item) => item.id === nodeId);
  const file = projectData.files.find((item) => item.id === nodeId);
  if (!node || !file) return null;

  const rootPath = (path: string) => withProjectRoot(projectName, path);
  const directDependencies: ImpactedFile[] = [];
  const directDependents: ImpactedFile[] = [];
  const secondaryMap = new Map<string, ImpactedFile>();

  const outgoing = projectData.links.filter((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    return sourceId === nodeId;
  });

  const incoming = projectData.links.filter((link) => {
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    return targetId === nodeId;
  });

  outgoing.forEach((link) => {
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    const targetFile = projectData.files.find((item) => item.id === targetId);
    if (!targetFile) return;
    directDependencies.push({
      path: rootPath(targetFile.path),
      relation: 'depends_on',
      importance: targetFile.importance || 0,
      reasons: ['El archivo seleccionado depende directamente de este módulo']
    });
  });

  const dependentIds: string[] = [];
  incoming.forEach((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const sourceFile = projectData.files.find((item) => item.id === sourceId);
    if (!sourceFile) return;
    dependentIds.push(sourceId);
    directDependents.push({
      path: rootPath(sourceFile.path),
      relation: 'used_by',
      importance: sourceFile.importance || 0,
      reasons: ['Este módulo consume o invoca al archivo seleccionado']
    });
  });

  dependentIds.forEach((dependentId) => {
    projectData.links.forEach((link) => {
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
      if (sourceId !== dependentId || targetId === nodeId) return;
      const targetFile = projectData.files.find((item) => item.id === targetId);
      if (!targetFile) return;
      if (!secondaryMap.has(targetId)) {
        secondaryMap.set(targetId, {
          path: rootPath(targetFile.path),
          relation: 'second_order',
          importance: targetFile.importance || 0,
          reasons: ['Podría verse afectado en cascada por un consumidor directo del archivo']
        });
      }
    });
  });

  const summary = `${rootPath(file.path)} tiene ${directDependencies.length} dependencias directas, ${directDependents.length} consumidores directos y ${secondaryMap.size} posibles impactos secundarios.`;

  return {
    targetPath: rootPath(file.path),
    summary,
    directDependencies: directDependencies.sort((a, b) => b.importance - a.importance).slice(0, 8),
    directDependents: directDependents.sort((a, b) => b.importance - a.importance).slice(0, 8),
    secondaryImpact: Array.from(secondaryMap.values()).sort((a, b) => b.importance - a.importance).slice(0, 8)
  };
};

const buildSemanticSearchResults = (projectData: ProjectData, projectName: string, query: string): SemanticSearchResult => {
  const insights = extractProjectInsights(projectData, projectName);
  const pack = buildTaskPackData(projectData, insights, query);
  return {
    query: pack.task,
    summary: pack.projectSummary,
    primaryFiles: pack.primaryFiles,
    relatedFiles: pack.relatedFiles
  };
};

const buildSmartDiffData = (previousProject: ProjectData, currentProject: ProjectData, projectName: string, baselineLabel: string, currentLabel: string): SmartDiffData => {
  const previousFiles = new Set(previousProject.files.map((file) => file.path));
  const currentFiles = new Set(currentProject.files.map((file) => file.path));
  const previousRelations = new Set(previousProject.links.map((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    return `${sourceId} -> ${targetId}`;
  }));
  const currentRelations = new Set(currentProject.links.map((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    return `${sourceId} -> ${targetId}`;
  }));

  const addedFiles = Array.from(currentFiles).filter((path) => !previousFiles.has(path)).map((path) => withProjectRoot(projectName, path));
  const removedFiles = Array.from(previousFiles).filter((path) => !currentFiles.has(path)).map((path) => withProjectRoot(projectName, path));
  const addedRelations = Array.from(currentRelations).filter((item) => !previousRelations.has(item)).slice(0, 12);
  const removedRelations = Array.from(previousRelations).filter((item) => !currentRelations.has(item)).slice(0, 12);

  return {
    projectName,
    baselineLabel,
    currentLabel,
    addedFiles: addedFiles.slice(0, 12),
    removedFiles: removedFiles.slice(0, 12),
    addedRelations,
    removedRelations,
    summary: `Comparación contra ${baselineLabel}: ${addedFiles.length} archivos nuevos, ${removedFiles.length} archivos removidos, ${addedRelations.length} relaciones nuevas y ${removedRelations.length} relaciones removidas.`
  };
};

interface ProjectState {
  projectData: ProjectData | null;
  projectName: string;
  skippedCount: number;
  selectedNode: GraphNode | null;
  smartDiffData: SmartDiffData | null;
  projectMemory: Record<string, { globalNote: string; fileNotes: Record<string, string> }>;
  isProcessing: boolean;
  isReviewing: boolean;
  searchQuery: string;
  treeSearch: string;
  activeTab: 'details' | 'context' | 'files' | 'ia' | 'settings';
  isFocusMode: boolean;
  aiReview: string | null;
  aiError: string | null;
  aiProvider: 'gemini' | 'openai' | 'groq' | 'deepseek' | 'ollama' | 'openrouter' | 'mistral' | 'custom';
  aiModel: string;
  customUrl: string;
  customKey: string;
  customKeys: Record<string, string>;
  useDeepAnalysis: boolean;
  showFileModal: boolean;
  showIAModal: boolean;
  envKeys: Record<string, boolean>;
  envKeyDetails: Record<string, { configured: boolean; envVar: string; source: 'env' | 'none' }>;
  
  setProjectData: (data: ProjectData | null) => void;
  setSkippedCount: (count: number) => void;
  setSelectedNode: (node: GraphNode | null) => void;
  setSearchQuery: (query: string) => void;
  setTreeSearch: (query: string) => void;
  setActiveTab: (tab: 'details' | 'context' | 'files' | 'ia' | 'settings') => void;
  setIsFocusMode: (mode: boolean) => void;
  setProjectGlobalMemory: (note: string) => void;
  setProjectFileMemory: (filePath: string, note: string) => void;
  setAiProvider: (provider: 'gemini' | 'openai' | 'groq' | 'deepseek' | 'ollama' | 'openrouter' | 'mistral' | 'custom') => void;
  setAiModel: (model: string) => void;
  setCustomUrl: (url: string) => void;
  setCustomKey: (key: string) => void;
  setUseDeepAnalysis: (mode: boolean) => void;
  setShowFileModal: (show: boolean) => void;
  setShowIAModal: (show: boolean) => void;
  checkEnvKeys: () => Promise<void>;
  
  processFiles: (files: FileList) => Promise<void>;
  performDeepAnalysis: () => Promise<void>;
  loadLastProject: () => Promise<void>;
  generateAIReview: () => Promise<void>;
  generateAIContext: () => string;
  generateExecutiveView: () => string;
  generateSystemView: () => string;
  generateHotspotReport: () => string;
  generateTaskPackData: (task: string) => AgentTaskPackData | null;
  generateTaskPack: (task: string) => string;
  generateErrorContextPackData: (rawError: string) => ErrorContextPackData | null;
  generateErrorContextPack: (rawError: string) => string;
  generateSemanticSearchResults: (query: string) => SemanticSearchResult | null;
  generateImpactAnalysisData: (nodeId: string) => ImpactAnalysisData | null;
  generateProjectBrief: () => string;
  generateProjectMetadata: () => string;
  generateGraphGuide: () => string;
  generateTreeOnly: () => string;
  generateAIVisionDocument: () => string;
  generateAIArchitectureNarrative: () => string;
  generateAIRefactorPriorities: () => string;
  generateAIAgentHandoff: (task: string) => string;
  refreshSmartDiff: () => Promise<void>;
  closeProject: () => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projectData: null,
      projectName: '',
      skippedCount: 0,
      selectedNode: null,
      smartDiffData: null,
      projectMemory: {},
      isProcessing: false,
      isReviewing: false,
      searchQuery: '',
      treeSearch: '',
      activeTab: 'details',
      isFocusMode: false,
      aiReview: null,
      aiError: null,
      aiProvider: 'gemini',
      aiModel: 'gemini-1.5-flash',
      customUrl: '',
      customKey: '',
      customKeys: {},
      useDeepAnalysis: true,
      showFileModal: false,
      showIAModal: false,
      envKeys: {},
      envKeyDetails: {},

      setProjectData: (data) => set({ projectData: data }),
      setSkippedCount: (count) => set({ skippedCount: count }),
      setSelectedNode: (node) => set({ selectedNode: node }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setTreeSearch: (query) => set({ treeSearch: query }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setIsFocusMode: (mode) => set({ isFocusMode: mode }),
      setProjectGlobalMemory: (note) => {
        const { projectName, projectMemory } = get();
        if (!projectName) return;
        const existing = projectMemory[projectName] || { globalNote: '', fileNotes: {} };
        set({
          projectMemory: {
            ...projectMemory,
            [projectName]: {
              ...existing,
              globalNote: note
            }
          }
        });
      },
      setProjectFileMemory: (filePath, note) => {
        const { projectName, projectMemory } = get();
        if (!projectName) return;
        const existing = projectMemory[projectName] || { globalNote: '', fileNotes: {} };
        set({
          projectMemory: {
            ...projectMemory,
            [projectName]: {
              ...existing,
              fileNotes: {
                ...existing.fileNotes,
                [filePath]: note
              }
            }
          }
        });
      },
      setAiProvider: (provider) => {
        const { customKeys } = get();
        set({
          aiProvider: provider,
          customKey: customKeys[provider] || ''
        });
      },
      setAiModel: (model) => set({ aiModel: model }),
      setCustomUrl: (url) => set({ customUrl: url }),
      setCustomKey: (key) => {
        const { aiProvider, customKeys } = get();
        set({
          customKey: key,
          customKeys: {
            ...customKeys,
            [aiProvider]: key
          }
        });
      },
      setUseDeepAnalysis: (mode) => set({ useDeepAnalysis: mode }),
      setShowFileModal: (show) => set({ showFileModal: show }),
      setShowIAModal: (show) => set({ showIAModal: show }),

      checkEnvKeys: async () => {
        try {
          const res = await fetch('/api/ai/config');
          if (!res.ok) {
            throw new Error(`No se pudo consultar la configuración AI del servidor (${res.status})`);
          }

          const raw = await res.text();
          if (!raw.trim()) {
            throw new Error('El servidor devolvió una respuesta vacía al consultar las llaves');
          }

          const data = JSON.parse(raw);
          set({ 
            envKeys: data.env_keys || {},
            envKeyDetails: data.providers || {}
          });
        } catch (err) {
          console.error("Error checking env keys:", err);
          set({
            envKeys: {},
            envKeyDetails: {}
          });
        }
      },

      closeProject: async () => {
        set({ 
          projectData: null, 
          projectName: '', 
          skippedCount: 0, 
          selectedNode: null,
          smartDiffData: null,
          aiReview: null,
          aiError: null,
          activeTab: 'details'
        });
        await db.projects.clear();
      },

      refreshSmartDiff: async () => {
        const { projectData, projectName } = get();
        if (!projectData || !projectName) {
          set({ smartDiffData: null });
          return;
        }

        const history = (await db.projects.orderBy('timestamp').reverse().toArray())
          .filter((item) => item.name === projectName);

        if (history.length < 2) {
          set({ smartDiffData: null });
          return;
        }

        const currentRecord = history[0];
        const previousRecord = history[1];
        const baselineLabel = new Date(previousRecord.timestamp).toLocaleString();
        const currentLabel = new Date(currentRecord.timestamp).toLocaleString();
        set({
          smartDiffData: buildSmartDiffData(previousRecord.data, currentRecord.data, projectName, baselineLabel, currentLabel)
        });
      },

      performDeepAnalysis: async () => {
        const { projectData } = get();
        if (!projectData || projectData.files.length === 0) return;

        set({ isProcessing: true });
        try {
          const filesToAnalyze = projectData.files.map(f => ({
            path: f.path,
            content: f.content,
            ext: f.ext.replace('.', '')
          }));

          const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: filesToAnalyze })
          });

          const data = await response.json();
          const analysisResults = data.analysis;

          const newLinks: GraphLink[] = [];
          const importanceMap: Record<string, number> = {};

          analysisResults.forEach((result: any) => {
            result.dependencies.forEach((dep: string) => {
              const cleanDep = dep.split('/').pop()?.split('.')[0] || dep;
              const targetFile = projectData.files.find(vf => 
                vf.name.split('.')[0] === cleanDep || 
                vf.path.endsWith(`${cleanDep}${vf.ext}`)
              );

              if (targetFile && targetFile.id !== result.path) {
                newLinks.push({ source: result.path, target: targetFile.id });
                importanceMap[targetFile.id] = (importanceMap[targetFile.id] || 0) + 1;
              }
            });
          });

          const newNodes = projectData.nodes.map(node => ({
            ...node,
            size: Math.max(12, Math.min(32, 10 + (importanceMap[node.id] || 0) * 4)),
            data: { ...node.data, importance: importanceMap[node.id] || 0 }
          }));

          set({ projectData: { ...projectData, nodes: newNodes, links: newLinks } });
        } catch (err) {
          console.error("Deep Analysis Error:", err);
        } finally {
          set({ isProcessing: false });
        }
      },

      loadLastProject: async () => {
        const lastProject = await db.projects.orderBy('timestamp').last();
        if (lastProject) {
          set({ projectData: lastProject.data, projectName: lastProject.name || '' });
          await get().refreshSmartDiff();
        }
      },

      processFiles: async (fileList: FileList) => {
        set({ isProcessing: true, projectData: null, selectedNode: null, skippedCount: 0, smartDiffData: null });

        const firstFile = fileList.item(0);
        if (!firstFile) {
          set({ isProcessing: false });
          return;
        }

        const projectName = (firstFile as any).webkitRelativePath.split('/')[0] || "Project";
        set({ projectName });

        const candidateFiles: { file: File; path: string; name: string; size: number }[] = [];

        for (let index = 0; index < fileList.length; index += FILE_SCAN_BATCH_SIZE) {
          const limit = Math.min(index + FILE_SCAN_BATCH_SIZE, fileList.length);

          for (let innerIndex = index; innerIndex < limit; innerIndex++) {
            const file = fileList.item(innerIndex);
            if (!file) continue;

            const path = (file as any).webkitRelativePath || file.name;
            if (!shouldProcessFile(path, file.size)) continue;

            candidateFiles.push({
              file,
              path,
              name: file.name,
              size: file.size
            });
          }

          await yieldToBrowser();
        }

        candidateFiles.sort((a, b) => {
          const priorityDiff = prioritizeFile(a.path, a.name) - prioritizeFile(b.path, b.name);
          if (priorityDiff !== 0) return priorityDiff;
          return a.path.localeCompare(b.path);
        });

        const selectedCandidates = candidateFiles.slice(0, MAX_GRAPH_FILES);
        const skippedCount = fileList.length - selectedCandidates.length;

        const workerInput: { path: string; name: string; size: number; content: string }[] = [];

        for (let index = 0; index < selectedCandidates.length; index += FILE_READ_BATCH_SIZE) {
          const batch = selectedCandidates.slice(index, index + FILE_READ_BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map(async ({ file, path, name, size }) => ({
              path,
              name,
              size,
              content: await readFileAsText(file)
            }))
          );

          workerInput.push(...batchResults);

          await yieldToBrowser();
        }

        const worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
        worker.postMessage({ files: workerInput });

        worker.onmessage = async (e) => {
          const { projectData } = e.data;
          set({ projectData, skippedCount });
          
          await db.projects.add({
            name: projectName,
            data: projectData,
            timestamp: Date.now()
          });
          
          worker.terminate();
          await get().refreshSmartDiff();
          await get().performDeepAnalysis();
        };

        worker.onerror = (err) => {
          console.error("Worker Error:", err);
          set({ isProcessing: false });
          worker.terminate();
        };
      },

      generateAIContext: () => {
        const { projectData } = get();
        if (!projectData) return "";

        const getTopItems = (items: string[], limit: number) =>
          items.filter(Boolean).slice(0, limit).join(', ') || 'N/A';

        const normalizedName = get().projectName || 'Unknown Project';
        const rootPath = (path: string) => withProjectRoot(normalizedName, path);
        const filesWithRoot = projectData.files.map((file) => ({
          ...file,
          path: rootPath(file.path)
        }));
        const stack = new Set<string>();
        projectData.files.forEach(f => {
          const signals = detectTechStackSignals(f);
          signals.stack.forEach((item) => stack.add(item));
          if (signals.databases.length) stack.add('Database (ORM/ODM)');
        });

        const fileExtCount = new Map<string, number>();
        const directories = new Set<string>();
        const entryPoints: string[] = [];
        const backendFiles: string[] = [];
        const frontendFiles: string[] = [];

        projectData.files.forEach((file) => {
          fileExtCount.set(file.ext || 'no-ext', (fileExtCount.get(file.ext || 'no-ext') || 0) + 1);

          const parts = file.path.split('/');
          if (parts.length > 1) {
            directories.add(parts[0]);
          }

          const lowerPath = file.path.toLowerCase();
          const lowerName = file.name.toLowerCase();
          if (
            lowerName === 'main.tsx' ||
            lowerName === 'main.jsx' ||
            lowerName === 'app.tsx' ||
            lowerName === 'app.jsx' ||
            lowerName === 'index.js' ||
            lowerName === 'index.ts' ||
            lowerName === 'main.py' ||
            lowerName === 'server.js'
          ) {
            entryPoints.push(file.path);
          }

          if (['.tsx', '.ts', '.jsx', '.js', '.html', '.css', '.scss'].includes(file.ext)) {
            frontendFiles.push(file.path);
          }

          if (['.py', '.go', '.rb', '.php', '.java', '.cs'].includes(file.ext) || lowerPath.includes('server/')) {
            backendFiles.push(file.path);
          }
        });

        const dominantExt = [...fileExtCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([ext, count]) => `${ext} (${count})`);

        const detectedCapabilities = new Set<string>();
        projectData.files.forEach((file) => {
          const code = file.content.toLowerCase();
          if (code.includes('generateerrorcontextpack') || code.includes('error-to-context')) detectedCapabilities.add('Error-to-Context Pack');
          if (code.includes('generatetaskpack') || code.includes('task pack')) detectedCapabilities.add('Task Pack Builder');
          if (code.includes('generatesemanticsearchresults') || code.includes('semantic search')) detectedCapabilities.add('Semantic Search');
          if (code.includes('generateimpactanalysisdata') || code.includes('predictive impact')) detectedCapabilities.add('Predictive Impact Analysis');
          if (code.includes('buildsmartdiffdata') || code.includes('smart diff')) detectedCapabilities.add('Smart Diff Context');
          if (code.includes('projectmemory') || code.includes('setprojectglobalmemory') || code.includes('setprojectfilememory')) detectedCapabilities.add('Project Memory');
          if (code.includes('generateaivisiondocument') || code.includes('generateaiarchitecturenarrative') || code.includes('generateairefactorpriorities')) detectedCapabilities.add('AI Handoff Documents');
          if (code.includes('generateaicontext')) detectedCapabilities.add('Architectural Snapshot Export');
        });

        const capabilityList = Array.from(detectedCapabilities);

        const productCoreFiles = projectData.files.filter((file) => {
          const lowerPath = file.path.toLowerCase();
          return (
            lowerPath.endsWith('src/app.tsx') ||
            lowerPath.endsWith('src/store/useprojectstore.ts') ||
            lowerPath.endsWith('src/utils/analysis.ts') ||
            lowerPath.endsWith('main.py') ||
            lowerPath.endsWith('server/index.js')
          );
        });
        const productCoreFileList = productCoreFiles.map((file) => rootPath(file.path));

        const topNodes = [...projectData.nodes]
          .sort((a, b) => (b.data.importance || 0) - (a.data.importance || 0))
          .slice(0, 8);

        const topHotspots = topNodes.map((node) => `${node.label} [${node.data.importance}]`);
        const connectionMap = new Map<string, { outgoing: string[]; incoming: string[] }>();

        projectData.nodes.forEach((node) => {
          connectionMap.set(node.id, { outgoing: [], incoming: [] });
        });

        projectData.links.forEach((link) => {
          const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
          const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
          const sourceNode = projectData.nodes.find(node => node.id === sourceId);
          const targetNode = projectData.nodes.find(node => node.id === targetId);
          const sourceLabel = sourceNode?.label || sourceId;
          const targetLabel = targetNode?.label || targetId;

          if (connectionMap.has(sourceId)) {
            connectionMap.get(sourceId)!.outgoing.push(targetLabel);
          }
          if (connectionMap.has(targetId)) {
            connectionMap.get(targetId)!.incoming.push(sourceLabel);
          }
        });

        const graphLeaders = [...projectData.nodes]
          .map((node) => {
            const connections = connectionMap.get(node.id) || { outgoing: [], incoming: [] };
            return {
              label: node.label,
              path: node.id,
              outgoing: connections.outgoing.length,
              incoming: connections.incoming.length,
              total: connections.outgoing.length + connections.incoming.length,
              outgoingTargets: connections.outgoing.slice(0, 6),
              incomingSources: connections.incoming.slice(0, 6)
            };
          })
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        const topRelations = projectData.links
          .slice(0, 20)
          .map((link) => {
            const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
            const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
            const sourceNode = projectData.nodes.find(node => node.id === sourceId);
            const targetNode = projectData.nodes.find(node => node.id === targetId);
            return `${sourceNode?.label || sourceId} -> ${targetNode?.label || targetId}`;
          });

        const inferredPurpose = [
          capabilityList.length > 0 ? 'extraer contexto arquitectónico accionable para desarrolladores y agentes' : null,
          capabilityList.includes('Task Pack Builder') ? 'armar handoffs cortos y task packs por intención' : null,
          capabilityList.includes('Error-to-Context Pack') ? 'convertir errores en contexto corto de depuración' : null,
          capabilityList.includes('Semantic Search') ? 'ubicar módulos por propósito y no solo por nombre' : null,
          capabilityList.includes('Predictive Impact Analysis') ? 'anticipar impacto antes de modificar archivos' : null,
          backendFiles.some(path => path.endsWith('main.py')) ? 'backend FastAPI para análisis y orquestación de IA' : null
        ].filter(Boolean).join(', ');

        const architectureSummary = [
          frontendFiles.length > 0 ? `Frontend detectado con ${frontendFiles.length} archivos principales de interfaz.` : null,
          backendFiles.length > 0 ? `Backend detectado con ${backendFiles.length} archivos de lógica/servicio.` : null,
          projectData.links.length > 0 ? `Se mapearon ${projectData.links.length} relaciones entre módulos.` : null,
          topHotspots.length > 0 ? `Los hotspots más conectados son ${getTopItems(topHotspots, 4)}.` : null,
          capabilityList.length > 0 ? `Las capacidades detectadas del producto son ${getTopItems(capabilityList, 8)}.` : null
        ].filter(Boolean).join(' ');

        let context = "### ARCHITECTURAL INTELLIGENCE SNAPSHOT\n";
        context += `Project Context: ${normalizedName}\n`;
        context += `Tech Stack: ${Array.from(stack).join(', ') || 'Standard Web/App Stack'}\n`;
        context += `Scale: ${projectData.files.length} Analyzed Modules\n\n`;

        context += "### PROJECT IDENTITY\n";
        context += `One-line Description: ${normalizedName} es un proyecto enfocado en ${inferredPurpose || 'análisis y visualización de arquitectura de software'}.\n`;
        context += `Architecture Summary: ${architectureSummary || 'No se pudo inferir un resumen arquitectónico fuerte con el conjunto actual de archivos.'}\n`;
        context += `Primary Entry Points: ${getTopItems(formatProjectPaths(normalizedName, entryPoints), 8)}\n`;
        context += `Main Directories: ${getTopItems(Array.from(directories), 10)}\n`;
        context += `Dominant File Types: ${getTopItems(dominantExt, 5)}\n\n`;

        context += "### PRODUCT CAPABILITIES\n";
        context += `Core Product Capabilities: ${getTopItems(capabilityList, 10)}\n`;
        context += `Core Product Files: ${getTopItems(productCoreFileList, 8)}\n`;
        context += `Analysis Mode Split: Deterministic local analysis first, optional AI enrichment second.\n`;
        context += `Important Framing: No describas este proyecto solo como visualizador de grafo si las capacidades detectadas muestran handoff, task packs, error packs, impacto, búsqueda semántica o memoria de proyecto.\n\n`;

        context += "### EXPLICIT CONSTRAINTS\n";
        context += `Deployment Model: local-first tool. No asumir SaaS, multiusuario ni servicio remoto salvo evidencia explícita.\n`;
        context += `Authentication: no se detectó autenticación, cuentas de usuario ni login como capacidad central del producto.\n`;
        context += `Persistence Model: la persistencia detectada es local. No afirmar almacenamiento en nube, base de datos de usuarios ni sincronización remota sin evidencia explícita.\n`;
        context += `Inference Rule: si una capacidad no aparece en archivos, rutas, dependencias o funciones detectadas, no la inventes.\n\n`;

        context += "### ESTRUCTURA DE DIRECTORIOS\n";
        const tree = buildFileTree(filesWithRoot);
        context += generateTreeText(tree) + "\n";

        context += "### MODULE LAYER OVERVIEW\n";
        const layers: Record<string, string[]> = {};
        projectData.files.forEach(f => {
          const parts = f.path.split('/');
          const layer = parts.length > 1 ? parts[0] : 'root';
          if (!layers[layer]) layers[layer] = [];
          if (layers[layer].length < 10) layers[layer].push(f.name);
        });
        
        Object.entries(layers).forEach(([layer, files]) => {
          context += `- [${layer.toUpperCase()}]: ${files.join(', ')}${files.length >= 10 ? '...' : ''}\n`;
        });

        context += "\n### EXECUTIVE SUMMARY FOR AGENTS\n";
        context += `- Project Goal: ${normalizedName} centraliza información del código para convertir un proyecto local en contexto accionable para humanos y agentes.\n`;
        context += `- Key Flows: Carga de archivos -> análisis local -> grafo y hotspots -> task packs / error packs / semantic search / impact analysis -> exportación de artefactos -> revisión con IA opcional.\n`;
        context += `- Product Differentiators: ${getTopItems(capabilityList, 8)}\n`;
        context += `- Critical Hotspots: ${getTopItems(topHotspots, 6)}\n`;
        context += `- Sample Dependency Paths: ${getTopItems(topRelations, 8)}\n`;

        context += "\n### GRAPH INTERPRETATION GUIDE\n";
        context += `Este grafo representa dependencias entre archivos. Si un archivo A apunta a B, normalmente significa que A importa, usa o depende de B.\n`;
        context += `Los nodos con muchas conexiones entrantes suelen ser piezas centrales o utilidades compartidas. Los nodos con muchas conexiones salientes suelen ser orquestadores, pantallas principales o servicios que coordinan otros módulos.\n`;
        graphLeaders.forEach((leader) => {
          context += `- ${leader.label}: ${leader.total} conexiones totales (${leader.outgoing} salientes, ${leader.incoming} entrantes). `;
          context += `Usa -> ${getTopItems(leader.outgoingTargets, 4)}. `;
          context += `Es usado por -> ${getTopItems(leader.incomingSources, 4)}.\n`;
        });

        context += "\n### STRATEGIC CLASS/FILE RELATIONSHIPS\n";
        projectData.nodes.forEach(n => {
          const deps = projectData.links
            .filter(l => {
              const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
              return sId === n.id;
            })
            .map(l => {
              const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
              const targetNode = projectData.nodes.find(node => node.id === tId);
              return targetNode?.label || tId;
            });

          if (deps.length > 0) {
            context += `[${n.label}] calls -> (${deps.join(', ')})\n`;
          }
        });

        context += "\n### KEY SOURCE CODE (COMPRESSED TOP 12)\n";
        const keyFiles = [...projectData.files]
          .sort((a, b) => (b.importance || 0) - (a.importance || 0))
          .slice(0, 12);

        keyFiles.forEach(f => {
          const lines = f.content.split('\n');
          const compressedCode = lines
            .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('/*'))
            .slice(0, 80)
            .join('\n');
            
          context += `\n--- SOURCE: ${rootPath(f.path)} ---\n\`\`\`${f.ext.replace('.', '')}\n${compressedCode}${lines.length > 80 ? '\n// ... code continues (truncated for efficiency)' : ''}\n\`\`\`\n`;
        });

        return context;
      },

      generateExecutiveView: () => {
        const { projectData, aiReview } = get();
        if (!projectData) return "";
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildExecutiveContext(insights, projectData.files.length, projectData.links.length, aiReview);
      },

      generateSystemView: () => {
        const { projectData, aiReview } = get();
        if (!projectData) return "";
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildSystemView(insights, aiReview);
      },

      generateHotspotReport: () => {
        const { projectData, aiReview } = get();
        if (!projectData) return "";
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildHotspotReport(insights, aiReview);
      },

      generateTaskPackData: (task: string) => {
        const { projectData } = get();
        if (!projectData) return null;
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildTaskPackData(projectData, insights, task);
      },

      generateTaskPack: (task: string) => {
        const { projectData, aiReview } = get();
        if (!projectData) return "";
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildTaskPack(projectData, insights, task, aiReview);
      },

      generateErrorContextPackData: (rawError: string) => {
        const { projectData } = get();
        if (!projectData) return null;
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildErrorContextPackData(projectData, insights, rawError);
      },

      generateErrorContextPack: (rawError: string) => {
        const { projectData } = get();
        if (!projectData) return "";
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildErrorContextPack(projectData, insights, rawError);
      },

      generateSemanticSearchResults: (query: string) => {
        const { projectData } = get();
        if (!projectData) return null;
        const projectName = get().projectName || 'Unknown Project';
        return buildSemanticSearchResults(projectData, projectName, query);
      },

      generateImpactAnalysisData: (nodeId: string) => {
        const { projectData } = get();
        if (!projectData) return null;
        const projectName = get().projectName || 'Unknown Project';
        return buildImpactAnalysisData(projectData, projectName, nodeId);
      },

      generateProjectBrief: () => {
        const { projectData } = get();
        if (!projectData) return "";

        const projectName = get().projectName || 'Unknown Project';
        const languageCount = new Map<string, number>();
        const stack = new Set<string>();
        const dbSignals = new Set<string>();
        const runtimeSignals = new Set<string>();
        const uiSignals = new Set<string>();
        const entryPoints: string[] = [];
        const hotspotFiles = [...projectData.files]
          .sort((a, b) => (b.importance || 0) - (a.importance || 0))
          .slice(0, 8);

        const languageMap: Record<string, string> = {
          '.ts': 'TypeScript',
          '.tsx': 'TypeScript/React',
          '.js': 'JavaScript',
          '.jsx': 'JavaScript/React',
          '.py': 'Python',
          '.go': 'Go',
          '.java': 'Java',
          '.cs': 'C#',
          '.php': 'PHP',
          '.rb': 'Ruby',
          '.rs': 'Rust',
          '.html': 'HTML',
          '.css': 'CSS',
          '.scss': 'SCSS',
          '.vue': 'Vue',
          '.svelte': 'Svelte'
        };

        projectData.files.forEach((file) => {
          const signals = detectTechStackSignals(file);
          const language = languageMap[file.ext] || file.ext || 'Unknown';
          languageCount.set(language, (languageCount.get(language) || 0) + 1);

          signals.stack.forEach((item) => stack.add(item));
          signals.databases.forEach((item) => dbSignals.add(item));
          signals.runtime.forEach((item) => runtimeSignals.add(item));
          signals.ui.forEach((item) => uiSignals.add(item));

          const lowerName = file.name.toLowerCase();
          if (['main.tsx', 'main.jsx', 'app.tsx', 'app.jsx', 'main.py', 'server.js', 'index.js', 'index.ts'].includes(lowerName)) {
            entryPoints.push(file.path);
          }
        });

        const topLanguages = [...languageCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([language, count]) => `${language} (${count})`);

        const detectedPurpose = [
          uiSignals.has('SPA Frontend') ? 'explorar visualmente la estructura de proyectos' : null,
          runtimeSignals.has('Backend Python') || runtimeSignals.has('Backend Node') ? 'procesar y enriquecer el análisis con servicios locales' : null,
          projectData.links.length > 0 ? 'mapear relaciones entre módulos' : null,
          stack.has('PWA') ? 'funcionar como aplicación instalable' : null
        ].filter(Boolean).join(', ');

        let brief = `# Project Brief: ${projectName}\n\n`;
        brief += `## Qué Hace\n`;
        brief += `${projectName} parece estar diseñado para ${detectedPurpose || 'analizar código fuente y generar contexto reutilizable para agentes de programación'}.\n\n`;

        brief += `## Stack Detectado\n`;
        brief += `- Frameworks y librerías: ${Array.from(stack).join(', ') || 'No detectado con alta confianza'}\n`;
        brief += `- Lenguajes principales: ${topLanguages.slice(0, 6).join(', ') || 'No detectado'}\n`;
        brief += `- Base de datos o persistencia: ${Array.from(dbSignals).join(', ') || 'No se detectó una base de datos clara'}\n`;
        brief += `- Runtime/capacidades: ${Array.from(new Set([...runtimeSignals, ...uiSignals])).join(', ') || 'No detectado'}\n\n`;

        brief += `## Arquitectura\n`;
        brief += `- Archivos analizados: ${projectData.files.length}\n`;
        brief += `- Relaciones detectadas: ${projectData.links.length}\n`;
        brief += `- Entry points probables: ${formatProjectPaths(projectName, entryPoints).join(', ') || 'No detectados'}\n`;
        brief += `- Hotspots principales: ${hotspotFiles.map(file => `${file.name} [${file.importance || 0}]`).join(', ') || 'No detectados'}\n\n`;

        brief += `## Qué Pasarle A Otro Agente\n`;
        brief += `- Este proyecto usa: ${topLanguages.slice(0, 4).join(', ') || 'lenguajes no detectados con claridad'}.\n`;
        brief += `- Componentes críticos: ${hotspotFiles.slice(0, 5).map(file => withProjectRoot(projectName, file.path)).join(', ') || 'No detectados'}.\n`;
        brief += `- Resumen operativo: carga archivos del proyecto, detecta dependencias, construye un grafo, genera snapshots y puede pedir una auditoría con IA si hay proveedor configurado.\n`;

        return brief;
      },

      generateProjectMetadata: () => {
        const { projectData } = get();
        if (!projectData) return "";

        const extToLanguage: Record<string, string> = {
          '.ts': 'TypeScript',
          '.tsx': 'TypeScript/React',
          '.js': 'JavaScript',
          '.jsx': 'JavaScript/React',
          '.py': 'Python',
          '.go': 'Go',
          '.java': 'Java',
          '.cs': 'C#',
          '.php': 'PHP',
          '.rb': 'Ruby',
          '.rs': 'Rust',
          '.html': 'HTML',
          '.css': 'CSS',
          '.scss': 'SCSS',
          '.vue': 'Vue',
          '.svelte': 'Svelte'
        };

        const languages: Record<string, number> = {};
        const technologies = new Set<string>();
        const databases = new Set<string>();
        const layers = {
          frontend: 0,
          backend: 0,
          workers: 0,
          storage: 0
        };

        projectData.files.forEach((file) => {
          const code = file.content.toLowerCase();
          const signals = detectTechStackSignals(file);
          const language = extToLanguage[file.ext] || file.ext || 'Unknown';
          languages[language] = (languages[language] || 0) + 1;

          signals.stack.forEach((item) => technologies.add(item));
          signals.databases.forEach((item) => databases.add(item));

          if (['.tsx', '.jsx', '.vue', '.svelte', '.html', '.css', '.scss'].includes(file.ext)) layers.frontend++;
          if (['.py', '.go', '.java', '.cs', '.php', '.rb'].includes(file.ext) || file.path.toLowerCase().includes('server/')) layers.backend++;
          if (file.path.toLowerCase().includes('worker')) layers.workers++;
          if (code.includes('dexie') || code.includes('indexeddb') || code.includes('database')) layers.storage++;
        });

        const hotspots = [...projectData.files]
          .sort((a, b) => (b.importance || 0) - (a.importance || 0))
          .slice(0, 10)
          .map(file => ({
            path: withProjectRoot(get().projectName || 'Unknown Project', file.path),
            importance: file.importance || 0,
            ext: file.ext
          }));

        const metadata = {
          projectName: get().projectName || 'Unknown Project',
          generatedBy: 'ProjectGrapher local deterministic analysis',
          summary: {
            files: projectData.files.length,
            links: projectData.links.length,
            nodes: projectData.nodes.length
          },
          languages,
          technologies: Array.from(technologies),
          databases: Array.from(databases),
          layers,
          entryPoints: projectData.files
            .filter(file => ['main.tsx', 'main.jsx', 'app.tsx', 'app.jsx', 'main.py', 'server.js', 'index.js', 'index.ts'].includes(file.name.toLowerCase()))
            .map(file => withProjectRoot(get().projectName || 'Unknown Project', file.path)),
          hotspots,
          agentHint: {
            purpose: 'Usa este archivo para darle a otro agente una ficha técnica rápida y determinista del proyecto.',
            recommendedFiles: hotspots.slice(0, 5).map(file => file.path)
          }
        };

        return JSON.stringify(metadata, null, 2);
      },

      generateGraphGuide: () => {
        const { projectData } = get();
        if (!projectData) return "";

        const projectName = get().projectName || 'Unknown Project';
        const rootPath = (path: string) => withProjectRoot(projectName, path);
        const connectionMap = new Map<string, { outgoing: string[]; incoming: string[]; path: string }>();

        projectData.nodes.forEach((node) => {
          connectionMap.set(node.id, {
            outgoing: [],
            incoming: [],
            path: node.id
          });
        });

        projectData.links.forEach((link) => {
          const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
          const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
          const sourceNode = projectData.nodes.find(node => node.id === sourceId);
          const targetNode = projectData.nodes.find(node => node.id === targetId);

          if (connectionMap.has(sourceId)) {
            connectionMap.get(sourceId)!.outgoing.push(targetNode?.label || targetId);
          }
          if (connectionMap.has(targetId)) {
            connectionMap.get(targetId)!.incoming.push(sourceNode?.label || sourceId);
          }
        });

        const ranking = [...projectData.nodes]
          .map((node) => {
            const current = connectionMap.get(node.id)!;
            return {
              label: node.label,
              path: node.id,
              outgoing: current.outgoing,
              incoming: current.incoming,
              total: current.outgoing.length + current.incoming.length
            };
          })
          .sort((a, b) => b.total - a.total);

        const orchestrators = ranking.filter(node => node.outgoing.length >= 2).slice(0, 12);
        const sharedCore = ranking.filter(node => node.incoming.length >= 2).slice(0, 12);

        let guide = `# Graph Guide: ${projectName}\n\n`;
        guide += `## Cómo Leer Este Archivo\n`;
        guide += `- "Usa" significa que un archivo depende de otro.\n`;
        guide += `- "Recibe uso de" significa que otros módulos dependen de ese archivo.\n`;
        guide += `- Los módulos listados primero son los más relevantes para entender el flujo real del proyecto.\n\n`;

        guide += `## Resumen del Grafo\n`;
        guide += `- Nodos: ${projectData.nodes.length}\n`;
        guide += `- Relaciones: ${projectData.links.length}\n`;
        guide += `- Módulos más conectados: ${ranking.slice(0, 8).map(node => `${node.label} (${node.total})`).join(', ') || 'N/A'}\n\n`;

        guide += `## Archivos Orquestadores\n`;
        orchestrators.forEach((node) => {
          guide += `- ${node.label}\n`;
          guide += `  Path: ${rootPath(node.path)}\n`;
          guide += `  Usa: ${node.outgoing.slice(0, 8).join(', ') || 'Nadie'}\n`;
          guide += `  Recibe uso de: ${node.incoming.slice(0, 8).join(', ') || 'Nadie'}\n`;
        });

        guide += `\n## Núcleo Compartido\n`;
        sharedCore.forEach((node) => {
          guide += `- ${node.label}\n`;
          guide += `  Path: ${rootPath(node.path)}\n`;
          guide += `  Recibe uso de: ${node.incoming.slice(0, 8).join(', ') || 'Nadie'}\n`;
          guide += `  Usa: ${node.outgoing.slice(0, 8).join(', ') || 'Nadie'}\n`;
        });

        guide += `\n## Recomendación Para Otro Agente\n`;
        guide += `Empieza por los archivos orquestadores, luego revisa el núcleo compartido y por último entra a archivos hoja. Este orden reduce tokens y acelera el entendimiento del sistema.\n`;

        return guide;
      },

      generateTreeOnly: () => {
        const { projectData, projectName } = get();
        if (!projectData) return "";
        const tree = buildFileTree(
          projectData.files.map((file) => ({
            ...file,
            path: withProjectRoot(projectName || 'Unknown Project', file.path)
          }))
        );
        return `### PROJECT STRUCTURE SNAPSHOT\n${generateTreeText(tree)}`;
      },

      generateAIVisionDocument: () => {
        const { projectData, aiReview } = get();
        if (!projectData || !aiReview) return '';
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildAIVisionDocument(projectName, aiReview, insights.stack, formatProjectPaths(projectName, insights.entryPoints));
      },

      generateAIArchitectureNarrative: () => {
        const { projectData, aiReview } = get();
        if (!projectData || !aiReview) return '';
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildAIArchitectureNarrative(projectName, aiReview, insights.topRelations, insights.topHotspots);
      },

      generateAIRefactorPriorities: () => {
        const { projectData, aiReview } = get();
        if (!projectData || !aiReview) return '';
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        return buildAIRefactorPriorities(projectName, aiReview, insights.topHotspots);
      },

      generateAIAgentHandoff: (task: string) => {
        const { projectData, aiReview } = get();
        if (!projectData || !aiReview) return '';
        const projectName = get().projectName || 'Unknown Project';
        const insights = extractProjectInsights(projectData, projectName);
        const taskPack = buildTaskPack(projectData, insights, task, aiReview);
        return buildAIAgentHandoff(projectName, aiReview, taskPack);
      },

      generateAIReview: async () => {
        const { generateAIContext, isReviewing, projectData } = get();
        if (!projectData || isReviewing) return;

        set({ isReviewing: true, aiError: null, aiReview: null });
        
        try {
          const { aiProvider, aiModel, customUrl, customKey } = get();
          const context = generateAIContext();
          const response = await fetch('/api/ai/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              context, 
              provider: aiProvider, 
              model: aiModel,
              customUrl,
              customKey
            })
          });

          const rawText = await response.text();
          let data: any = {};
          try {
            data = rawText ? JSON.parse(rawText) : {};
          } catch {
            data = rawText ? { error: rawText } : {};
          }
          if (!response.ok) {
            const backendMessage = data.detail || data.error || "Error en el servidor de IA";
            const normalizedProvider = aiProvider.toUpperCase();
            if (response.status === 401) {
              throw new Error(`${backendMessage} Verifica ${normalizedProvider}_API_KEY o la llave escrita en la configuracion.`);
            }
            if (response.status === 429) {
              throw new Error(`${backendMessage} Espera un momento o cambia de proveedor/modelo.`);
            }
            throw new Error(backendMessage);
          }
          
          if (!data.text) throw new Error("No se recibió respuesta del modelo");
          set({ aiReview: data.text });
        } catch (err: any) {
          console.error("AI Error:", err);
          set({ aiError: `Error: ${err.message}` });
        } finally {
          set({ isReviewing: false });
        }
      }
    }),
    {
      name: 'project-grapher-settings',
      partialize: (state) => ({
        aiProvider: state.aiProvider,
        aiModel: state.aiModel,
        customUrl: state.customUrl,
        customKey: state.customKey,
        customKeys: state.customKeys,
        useDeepAnalysis: state.useDeepAnalysis,
        projectMemory: state.projectMemory
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ProjectState>) || {};
        const provider = persisted.aiProvider || currentState.aiProvider;
        const persistedCustomKeys = persisted.customKeys || {};
        const persistedProjectMemory = persisted.projectMemory || {};
        const resolvedCustomKeys = {
          ...currentState.customKeys,
          ...persistedCustomKeys
        };

        return {
          ...currentState,
          ...persisted,
          projectMemory: {
            ...currentState.projectMemory,
            ...persistedProjectMemory
          },
          customKeys: resolvedCustomKeys,
          customKey: resolvedCustomKeys[provider] || ''
        };
      }
    }
  )
);
