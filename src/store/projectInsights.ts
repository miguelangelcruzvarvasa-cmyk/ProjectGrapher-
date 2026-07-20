import { ProjectFile, ProjectData } from '../types';
import { APP_CONFIG } from '../config/appConfig';
import { summarizeFileSemantics } from '../utils/analysis';
import {
  AgentTaskPackData,
  ErrorContextFileCandidate,
  ErrorContextPackData,
  ImpactAnalysisData,
  ImpactedFile,
  ProjectInsights,
  SemanticSearchResult,
  SmartDiffData,
  TaskPackFileCandidate
} from './projectStore.types';

export const getTopItems = (items: string[], limit: number) =>
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

export const withProjectRoot = (projectName: string, path: string) => {
  const normalizedProject = projectName.trim() || APP_CONFIG.projectFallbackName;
  const normalizedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalizedPath) return normalizedProject;
  if (normalizedPath === normalizedProject || normalizedPath.startsWith(`${normalizedProject}/`)) {
    return normalizedPath;
  }
  return `${normalizedProject}/${normalizedPath}`;
};

export const formatProjectPaths = (projectName: string, items: string[]) =>
  items.filter(Boolean).map((item) => withProjectRoot(projectName, item));

const detectByImport = (code: string, patterns: RegExp[]): boolean =>
  patterns.some(p => p.test(code));

const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  'React': [/\bfrom\s+['"]react['"]/i, /import\s+.*['"]react['"]/i, /require\s*\(\s*['"]react['"]\)/i],
  'Angular': [/from\s+['"]@angular\//i, /import\s+.*['"]@angular\//i, /angular\.json/],
  'Next.js': [/from\s+['"]next\//i, /import\s+.*['"]next\//i, /next\.config/],
  'Vue': [/from\s+['"]vue['"]/i, /import\s+.*['"]vue['"]/i, /Vue\.component\(/i, /createApp\(/i, /defineComponent\(/i],
  'Nuxt': [/from\s+['"]nuxt/i, /import\s+.*['"]nuxt/i, /nuxt\.config/],
  'Svelte': [/from\s+['"]svelte/i, /import\s+.*['"]svelte/i, /\.svelte$/i],
  'Vite': [/from\s+['"]vite['"]/i, /import\s+.*['"]vite['"]/i, /vite\.config/],
  'FastAPI': [/from\s+fastapi/i, /import\s+fastapi/i, /FastAPI\(/],
  'Flask': [/from\s+flask/i, /import\s+flask/i, /Flask\(/],
  'Django': [/from\s+django/i, /import\s+django/i, /django\.conf/i],
  'Express.js': [/require\s*\(\s*['"]express['"]\)/i, /from\s+['"]express['"]/i, /express\(\)/i],
  'NestJS': [/from\s+['"]@nestjs\//i, /import\s+.*['"]@nestjs\//i, /NestFactory/i],
  'Tailwind CSS': [/tailwind\.config/i, /@tailwind/i, /tailwindcss/i],
  'Zustand': [/from\s+['"]zustand/i, /import\s+.*['"]zustand/i, /create\s*\(\s*\(/],
  'Redux': [/from\s+['"]redux/i, /import\s+.*['"]redux/i, /from\s+['"]@reduxjs/i],
  'Dexie': [/from\s+['"]dexie['"]/i, /import\s+.*['"]dexie['"]/i, /new\s+Dexie\(/i],
  'Firebase': [/from\s+['"]firebase/i, /import\s+.*['"]firebase/i, /firebase.*\.initialize/i],
  'WebSockets': [/socket\.io/i, /WebSocket\(/i, /from\s+['"]ws['"]/i],
};

export const detectTechStackSignals = (file: ProjectFile) => {
  const code = file.content.toLowerCase();
  const path = file.path.toLowerCase();
  const ext = file.ext.toLowerCase();

  const stack = new Set<string>();
  const databases = new Set<string>();
  const runtime = new Set<string>();
  const ui = new Set<string>();

  for (const [tech, patterns] of Object.entries(IMPORT_PATTERNS)) {
    if (detectByImport(code, patterns)) stack.add(tech);
  }

  if (ext === '.scss' || ext === '.sass' || code.includes('@mixin')) stack.add('SCSS/Sass');
  if (ext === '.css') stack.add('CSS');
  if (ext === '.html') stack.add('HTML');
  if (ext === '.ts' || ext === '.tsx') stack.add('TypeScript');
  if (ext === '.js' || ext === '.jsx') stack.add('JavaScript');
  if (ext === '.py') stack.add('Python');
  if (ext === '.cs' || code.includes('<project sdk=')) stack.add('C#');
  if (ext === '.cs' || code.includes('microsoft.aspnetcore')) stack.add('.NET / ASP.NET');
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

  if (detectByImport(code, IMPORT_PATTERNS['FastAPI']) || detectByImport(code, IMPORT_PATTERNS['Flask']) || detectByImport(code, IMPORT_PATTERNS['Django'])) runtime.add('Backend Python');
  if (detectByImport(code, IMPORT_PATTERNS['Express.js']) || detectByImport(code, IMPORT_PATTERNS['NestJS'])) runtime.add('Backend Node');
  if (ext === '.cs' || code.includes('microsoft.aspnetcore')) runtime.add('Backend .NET');
  if (code.includes('worker') || path.includes('worker')) runtime.add('Background Worker');

  if (['.tsx', '.jsx', '.vue', '.svelte'].includes(ext) || detectByImport(code, IMPORT_PATTERNS['Angular'])) ui.add('SPA Frontend');
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

export const buildAIVisionDocument = (projectName: string, aiReview: string, stack: string[], entryPoints: string[]) => {
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

export const buildAIArchitectureNarrative = (projectName: string, aiReview: string, topRelations: string[], hotspots: { label: string; path: string; importance: number }[]) => {
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

export const buildAIRefactorPriorities = (projectName: string, aiReview: string, hotspots: { label: string; path: string; importance: number }[]) => {
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

export const buildAIAgentHandoff = (projectName: string, aiReview: string, taskPack: string) => {
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

export const extractProjectInsights = (projectData: ProjectData, projectName: string): ProjectInsights => {
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
    .map((node) => {
      const semantic = summarizeFileSemantics(node.data);
      return {
        label: node.label,
        path: node.id,
        importance: node.data.importance || 0,
        ext: node.group,
        role: semantic.role,
        confidence: semantic.confidence,
        evidence: semantic.evidence,
        complexity: semantic.complexity,
        lines: semantic.nonEmptyLines || semantic.lines,
        exports: semantic.exports
      };
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

export const buildExecutiveContext = (insights: ProjectInsights, filesCount: number, linksCount: number, aiReview?: string | null) => {
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

export const buildSystemView = (insights: ProjectInsights, aiReview?: string | null) => {
  const highlights = extractAIHighlightsForIntent(aiReview || null, 'architecture', 4);
  let text = `# System View: ${insights.projectName}\n\n`;
  text += `## Lectura de Confianza\n`;
  text += `- Hechos verificables: capas listadas desde rutas reales y relaciones extraídas del grafo.\n`;
  text += `- Heurísticas: roles inferidos y lecturas semánticas cortas para acelerar onboarding.\n\n`;
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

export const buildHotspotReport = (insights: ProjectInsights, aiReview?: string | null) => {
  const highlights = extractAIHighlightsForIntent(aiReview || null, 'refactor', 4);
  let text = `# Hotspots & Deuda Técnica: ${insights.projectName}\n\n`;
  text += `## Hotspots Prioritarios\n`;
  insights.topHotspots.forEach((item, index) => {
    text += `${index + 1}. ${item.label}\n`;
    text += `   Path: ${withProjectRoot(insights.projectName, item.path)}\n`;
    text += `   Importancia: ${item.importance}\n`;
    text += `   Tipo: ${item.ext}\n`;
    text += `   Rol: ${item.role}\n`;
    text += `   Complejidad estimada: ${item.complexity}\n`;
    text += `   Lineas no vacias: ${item.lines}\n`;
    text += `   Confianza: ${item.confidence} (${item.evidence})\n`;
    text += `   Contratos detectados: ${getTopItems(item.exports, 5)}\n`;
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

export const buildTaskPackData = (projectData: ProjectData, insights: ProjectInsights, task: string): AgentTaskPackData => {
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

export const buildTaskPack = (projectData: ProjectData, insights: ProjectInsights, task: string, aiReview?: string | null) => {
  const data = buildTaskPackData(projectData, insights, task);
  const highlights = extractAIHighlightsForIntent(aiReview || null, 'handoff', 4);
  const baseTerms = tokenizeTask(task.trim() || 'Analiza la tarea solicitada y ubica los archivos relevantes.');

  const primaryPaths = new Set(data.primaryFiles.map(f => f.path));
  const relatedPaths = new Set(data.relatedFiles.map(f => f.path));
  const irrelevantFiles = projectData.files
    .filter(f => {
      const fullPath = `${data.projectName}/${f.path}`;
      return !primaryPaths.has(fullPath) && !relatedPaths.has(fullPath) && !insights.entryPoints.includes(f.path);
    })
    .sort((a, b) => (a.importance || 0) - (b.importance || 0))
    .slice(0, 10)
    .map(f => f.path);

  const tokenEstimate = Math.round(
    (data.primaryFiles.length * 40) + (data.relatedFiles.length * 20) + 150
  );

  let text = `# Agent Task Pack: ${data.projectName}\n\n`;
  text += `## Tarea\n${data.task}\n\n`;
  text += `## Contexto Rápido\n`;
  text += `- Stack: ${getTopItems(data.stack, 6)}\n`;
  text += `- Entry points: ${getTopItems(data.entryPoints, 4)}\n`;
  text += `- ~${tokenEstimate} tokens estimados\n\n`;

  text += `## Archivos Primarios\n`;
  data.primaryFiles.forEach((file) => {
    text += `- \`${file.path}\`\n`;
    if (file.reasons.length) text += `  ${file.reasons[0]}\n`;
  });

  text += `\n## Archivos Relacionados\n`;
  if (data.relatedFiles.length) {
    data.relatedFiles.forEach((file) => {
      text += `- \`${file.path}\`\n`;
    });
  } else {
    text += `- Ninguno detectado\n`;
  }

  text += `\n## NO Tocar\n`;
  if (irrelevantFiles.length) {
    text += `- ${irrelevantFiles.join(', ')}\n`;
    text += `- Cualquier archivo no listado arriba es probablemente irrelevante para esta tarea\n`;
  } else {
    text += `- Todos los archivos parecen potencialmente relevantes\n`;
  }

  text += `\n## Orden\n`;
  data.readingOrder.forEach((path, index) => {
    text += `${index + 1}. \`${path}\`\n`;
  });

  text += `\n## Instrucciones\n`;
  text += `1. Lee los archivos primarios primero\n`;
  text += `2. Solo abre relacionados si necesitas dependencias\n`;
  text += `3. No modifiques archivos fuera de esta lista sin verificar impacto\n`;
  if (baseTerms.length) {
    text += `4. Términos guía: ${baseTerms.join(', ')}\n`;
  }

  text += buildAIEnhancementBlock(
    highlights,
    'AI Handoff Notes',
    'Si ya existe auditoría IA, usa estas notas como segunda capa antes de editar archivos:'
  );
  return text;
};

export const buildErrorContextPackData = (projectData: ProjectData, insights: ProjectInsights, rawErrorInput: string): ErrorContextPackData | null => {
  if (!rawErrorInput.trim()) {
    return null;
  }

  const rootPath = (path: string) => withProjectRoot(insights.projectName, path);
  const rawError = rawErrorInput.trim();
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

export const buildErrorContextPack = (projectData: ProjectData, insights: ProjectInsights, rawError: string) => {
  const data = buildErrorContextPackData(projectData, insights, rawError);
  if (!data) return '';
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

export const buildImpactAnalysisData = (projectData: ProjectData, projectName: string, nodeId: string): ImpactAnalysisData | null => {
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

export const buildSemanticSearchResults = (projectData: ProjectData, projectName: string, query: string): SemanticSearchResult => {
  const insights = extractProjectInsights(projectData, projectName);
  const pack = buildTaskPackData(projectData, insights, query);
  return {
    query: pack.task,
    summary: pack.projectSummary,
    primaryFiles: pack.primaryFiles,
    relatedFiles: pack.relatedFiles
  };
};

export const buildSmartDiffData = (previousProject: ProjectData, currentProject: ProjectData, projectName: string, baselineLabel: string, currentLabel: string): SmartDiffData => {
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

