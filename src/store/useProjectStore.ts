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

const extractAIHighlights = (aiReview: string | null, limit = 6) => {
  if (!aiReview) return [];

  return aiReview
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('```'))
    .filter((line) => !line.startsWith('#'))
    .filter((line) => !/^[-*]\s*$/.test(line))
    .filter((line) => !/^>\s*$/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))
    .filter((line) => line.length >= 24)
    .slice(0, limit);
};

const buildAIEnhancementBlock = (aiReview: string | null, title: string, intro: string) => {
  const highlights = extractAIHighlights(aiReview);
  if (!highlights.length) return '';

  let text = `\n## ${title}\n`;
  text += `${intro}\n`;
  highlights.forEach((item) => {
    text += `- ${item}\n`;
  });
  return text;
};

const buildAIVisionDocument = (projectName: string, aiReview: string, stack: string[], entryPoints: string[]) => {
  let text = `# AI Project Vision: ${projectName}\n\n`;
  text += `## Propósito Inferido\n`;
  text += `Este documento fue generado desde la auditoría IA activa combinada con el análisis estructural del grafo. Resume para qué existe el proyecto y qué debería entender otro agente antes de intervenir.\n\n`;
  text += `## Contexto Base\n`;
  text += `- Proyecto: ${projectName}\n`;
  text += `- Stack detectado: ${getTopItems(stack, 8)}\n`;
  text += `- Entry points principales: ${getTopItems(entryPoints, 6)}\n`;
  text += buildAIEnhancementBlock(
    aiReview,
    'Visión Interpretada por IA',
    'La revisión IA resumió estos puntos como la intención y dirección principal del sistema:'
  );
  text += `\n## Cómo Usar Este Documento\n`;
  text += `- Léelo primero si un agente necesita entender rápidamente el valor del proyecto.\n`;
  text += `- Complétalo con snapshot, system view y task pack antes de tocar código.\n`;
  return text;
};

const buildAIArchitectureNarrative = (projectName: string, aiReview: string, topRelations: string[], hotspots: { label: string; path: string; importance: number }[]) => {
  let text = `# AI Architecture Narrative: ${projectName}\n\n`;
  text += `## Narrativa del Sistema\n`;
  text += `Este documento traduce el grafo y la auditoría IA a una explicación más humana de cómo fluye el sistema.\n\n`;
  text += `## Relaciones Estructurales Clave\n`;
  topRelations.slice(0, 12).forEach((relation) => {
    text += `- ${relation}\n`;
  });
  text += `\n## Hotspots de Referencia\n`;
  hotspots.slice(0, 8).forEach((item) => {
    text += `- ${item.label} -> ${withProjectRoot(projectName, item.path)} [${item.importance}]\n`;
  });
  text += buildAIEnhancementBlock(
    aiReview,
    'Lectura Arquitectónica de IA',
    'La auditoría IA aporta esta interpretación sobre responsabilidades, flujo y tensiones del sistema:'
  );
  return text;
};

const buildAIRefactorPriorities = (projectName: string, aiReview: string, hotspots: { label: string; path: string; importance: number }[]) => {
  let text = `# AI Refactor Priorities: ${projectName}\n\n`;
  text += `## Prioridad Determinista Inicial\n`;
  hotspots.slice(0, 10).forEach((item, index) => {
    text += `${index + 1}. ${item.label} -> ${withProjectRoot(projectName, item.path)} [impacto ${item.importance}]\n`;
  });
  text += buildAIEnhancementBlock(
    aiReview,
    'Prioridades Sugeridas por IA',
    'Estos son los focos de refactor, consolidación o validación que resaltó la auditoría IA:'
  );
  text += `\n## Uso Recomendado\n`;
  text += `- Cruza estas prioridades con hotspots y graph guide antes de refactorizar.\n`;
  text += `- Si una prioridad toca estado compartido o auth, revisa también contextos y APIs conectadas.\n`;
  return text;
};

const buildAIAgentHandoff = (projectName: string, aiReview: string, taskPack: string) => {
  let text = `# AI Agent Handoff: ${projectName}\n\n`;
  text += `## Instrucción de Uso\n`;
  text += `Este documento sirve para entregarle a otro agente una mezcla de lectura estratégica y archivos sugeridos.\n`;
  text += `Úsalo junto con el task pack para reducir onboarding y evitar exploración innecesaria.\n`;
  text += buildAIEnhancementBlock(
    aiReview,
    'Notas Estratégicas de IA',
    'Antes de tocar código, la auditoría IA recomienda prestar atención a lo siguiente:'
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
    const code = file.content.toLowerCase();
    fileExtCount.set(file.ext || 'no-ext', (fileExtCount.get(file.ext || 'no-ext') || 0) + 1);

    if (code.includes('react')) stack.add('React');
    if (code.includes('vite')) stack.add('Vite');
    if (code.includes('fastapi')) stack.add('FastAPI');
    if (code.includes('express')) stack.add('Express.js');
    if (code.includes('tailwind')) stack.add('Tailwind CSS');
    if (code.includes('zustand')) stack.add('Zustand');
    if (code.includes('dexie')) stack.add('Dexie');
    if (code.includes('firebase')) stack.add('Firebase');
    if (code.includes('socket.io')) stack.add('WebSockets');
    if (code.includes('vite-plugin-pwa') || code.includes('manifest')) stack.add('PWA');

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
    aiReview || null,
    'Capa IA',
    'Hallazgos resumidos a partir de la auditoría IA actual para complementar la lectura ejecutiva:'
  );
  return text;
};

const buildSystemView = (insights: ProjectInsights, aiReview?: string | null) => {
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
    aiReview || null,
    'AI Layer',
    'Estos puntos condensan hallazgos de la revisión IA para enriquecer la vista sistémica:'
  );
  return text;
};

const buildHotspotReport = (insights: ProjectInsights, aiReview?: string | null) => {
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
    aiReview || null,
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
    aiReview || null,
    'AI Handoff Notes',
    'Si ya existe auditoría IA, usa estas notas como segunda capa antes de editar archivos:'
  );
  return text;
};

interface ProjectState {
  projectData: ProjectData | null;
  projectName: string;
  skippedCount: number;
  selectedNode: GraphNode | null;
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
  generateProjectBrief: () => string;
  generateProjectMetadata: () => string;
  generateGraphGuide: () => string;
  generateTreeOnly: () => string;
  generateAIVisionDocument: () => string;
  generateAIArchitectureNarrative: () => string;
  generateAIRefactorPriorities: () => string;
  generateAIAgentHandoff: (task: string) => string;
  closeProject: () => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projectData: null,
      projectName: '',
      skippedCount: 0,
      selectedNode: null,
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
          aiReview: null,
          aiError: null,
          activeTab: 'details'
        });
        await db.projects.clear();
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
        }
      },

      processFiles: async (fileList: FileList) => {
        set({ isProcessing: true, projectData: null, selectedNode: null, skippedCount: 0 });

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
          const code = f.content.toLowerCase();
          if (code.includes('express')) stack.add('Express.js');
          if (code.includes('react')) stack.add('React');
          if (code.includes('mongoose') || code.includes('sequelize') || code.includes('prisma')) stack.add('Database (ORM/ODM)');
          if (code.includes('tailwind')) stack.add('Tailwind CSS');
          if (code.includes('typescript')) stack.add('TypeScript');
          if (code.includes('firebase')) stack.add('Firebase');
          if (code.includes('socket.io')) stack.add('WebSockets');
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
          stack.has('React') ? 'interfaz visual para explorar proyectos' : null,
          stack.has('Express.js') ? 'servicios Node/Express' : null,
          backendFiles.some(path => path.endsWith('main.py')) ? 'backend FastAPI para análisis y orquestación de IA' : null,
          stack.has('Tailwind CSS') ? 'UI estilizada con Tailwind' : null,
          stack.has('WebSockets') ? 'capacidades en tiempo real' : null
        ].filter(Boolean).join(', ');

        const architectureSummary = [
          frontendFiles.length > 0 ? `Frontend detectado con ${frontendFiles.length} archivos principales de interfaz.` : null,
          backendFiles.length > 0 ? `Backend detectado con ${backendFiles.length} archivos de lógica/servicio.` : null,
          projectData.links.length > 0 ? `Se mapearon ${projectData.links.length} relaciones entre módulos.` : null,
          topHotspots.length > 0 ? `Los hotspots más conectados son ${getTopItems(topHotspots, 4)}.` : null
        ].filter(Boolean).join(' ');

        let context = "### ARCHITECTURAL INTELLIGENCE SNAPSHOT\n";
        context += `Project Context: ${normalizedName}\n`;
        context += `Tech Stack: ${Array.from(stack).join(', ') || 'Standard Node.js/Web'}\n`;
        context += `Scale: ${projectData.files.length} Analyzed Modules\n\n`;

        context += "### PROJECT IDENTITY\n";
        context += `One-line Description: ${normalizedName} es un proyecto enfocado en ${inferredPurpose || 'análisis y visualización de arquitectura de software'}.\n`;
        context += `Architecture Summary: ${architectureSummary || 'No se pudo inferir un resumen arquitectónico fuerte con el conjunto actual de archivos.'}\n`;
        context += `Primary Entry Points: ${getTopItems(formatProjectPaths(normalizedName, entryPoints), 8)}\n`;
        context += `Main Directories: ${getTopItems(Array.from(directories), 10)}\n`;
        context += `Dominant File Types: ${getTopItems(dominantExt, 5)}\n\n`;

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
        context += `- Project Goal: ${normalizedName} centraliza información del código para resumir, describir y explicar la arquitectura del proyecto analizado.\n`;
        context += `- Key Flows: Carga de archivos -> análisis local -> enriquecimiento con backend -> exportación de snapshot/graph -> revisión con IA.\n`;
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
          const code = file.content.toLowerCase();
          const language = languageMap[file.ext] || file.ext || 'Unknown';
          languageCount.set(language, (languageCount.get(language) || 0) + 1);

          if (code.includes('react')) stack.add('React');
          if (code.includes('vite')) stack.add('Vite');
          if (code.includes('express')) stack.add('Express.js');
          if (code.includes('fastapi')) stack.add('FastAPI');
          if (code.includes('tailwind')) stack.add('Tailwind CSS');
          if (code.includes('zustand')) stack.add('Zustand');
          if (code.includes('dexie')) stack.add('Dexie');
          if (code.includes('firebase')) stack.add('Firebase');
          if (code.includes('socket.io')) stack.add('WebSockets');
          if (code.includes('vite-plugin-pwa') || code.includes('manifest')) stack.add('PWA');

          if (code.includes('prisma')) dbSignals.add('Prisma');
          if (code.includes('mongoose')) dbSignals.add('MongoDB/Mongoose');
          if (code.includes('sequelize')) dbSignals.add('Sequelize');
          if (code.includes('typeorm')) dbSignals.add('TypeORM');
          if (code.includes('dexie') || code.includes('indexeddb')) dbSignals.add('IndexedDB');
          if (code.includes('sqlite')) dbSignals.add('SQLite');
          if (code.includes('postgres')) dbSignals.add('PostgreSQL');
          if (code.includes('mysql')) dbSignals.add('MySQL');

          if (code.includes('fastapi')) runtimeSignals.add('Backend Python');
          if (code.includes('express')) runtimeSignals.add('Backend Node');
          if (['.tsx', '.jsx', '.vue', '.svelte'].includes(file.ext)) uiSignals.add('SPA Frontend');
          if (code.includes('worker') || file.path.toLowerCase().includes('worker')) runtimeSignals.add('Background Worker');

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
        brief += `- Componentes críticos: ${hotspotFiles.slice(0, 5).map(file => rootPath(file.path)).join(', ') || 'No detectados'}.\n`;
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
          const language = extToLanguage[file.ext] || file.ext || 'Unknown';
          languages[language] = (languages[language] || 0) + 1;

          if (code.includes('react')) technologies.add('React');
          if (code.includes('vite')) technologies.add('Vite');
          if (code.includes('tailwind')) technologies.add('Tailwind CSS');
          if (code.includes('zustand')) technologies.add('Zustand');
          if (code.includes('fastapi')) technologies.add('FastAPI');
          if (code.includes('express')) technologies.add('Express.js');
          if (code.includes('dexie')) technologies.add('Dexie');
          if (code.includes('firebase')) technologies.add('Firebase');
          if (code.includes('socket.io')) technologies.add('WebSockets');

          if (code.includes('dexie') || code.includes('indexeddb')) databases.add('IndexedDB');
          if (code.includes('mongoose')) databases.add('MongoDB/Mongoose');
          if (code.includes('sequelize')) databases.add('Sequelize');
          if (code.includes('prisma')) databases.add('Prisma');
          if (code.includes('mysql')) databases.add('MySQL');
          if (code.includes('postgres')) databases.add('PostgreSQL');

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
        useDeepAnalysis: state.useDeepAnalysis
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ProjectState>) || {};
        const provider = persisted.aiProvider || currentState.aiProvider;
        const persistedCustomKeys = persisted.customKeys || {};
        const resolvedCustomKeys = {
          ...currentState.customKeys,
          ...persistedCustomKeys
        };

        return {
          ...currentState,
          ...persisted,
          customKeys: resolvedCustomKeys,
          customKey: resolvedCustomKeys[provider] || ''
        };
      }
    }
  )
);
