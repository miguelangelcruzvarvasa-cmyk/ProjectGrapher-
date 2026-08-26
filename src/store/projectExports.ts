import { APP_CONFIG } from '../config/appConfig';
import { ProjectData } from '../types';
import { SNAPSHOT_EXPORT_CONFIG } from '../config/projectContext';
import { buildFileTree, generateTreeText, summarizeFileSemantics } from '../utils/analysis';
import { detectTechStackSignals, extractTargetProjectIdentity, formatProjectPaths, getTopItems, isEntryPointFile, withProjectRoot } from './projectInsights';

const TRIVIAL_FILE_PATTERNS = [
  /errorboundary/i,
  /filicon/i,
  /navitem/i,
  /loading/i,
  /spinner/i,
  /placeholder/i,
];

export const hashContext = (content: string): string => {
  let hash = 0;
  const len = content.length;
  const chunkSize = Math.max(1, Math.floor(len / 100));
  for (let i = 0; i < len; i += chunkSize) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

export const isContextDuplicate = (content: string, lastHash: string | null): boolean => {
  if (!lastHash) return false;
  return hashContext(content) === lastHash;
};

export const buildCompactDelta = (currentSnapshot: string, previousSnapshot: string | null): string => {
  if (!previousSnapshot) return currentSnapshot;

  const currentLines = currentSnapshot.split('\n');
  const previousLines = new Set(previousSnapshot.split('\n'));

  const newLines = currentLines.filter(line => !previousLines.has(line));
  if (newLines.length < currentLines.length * 0.3) {
    return `# Contexto Delta (solo cambios)\n\n${newLines.join('\n')}\n\n---\nSnapshot completo anterior disponible.`;
  }
  return currentSnapshot;
};

const isTrivialFile = (fileName: string, lineCount: number, exportCount: number): boolean => {
  if (lineCount < 40 && exportCount <= 2) return true;
  if (TRIVIAL_FILE_PATTERNS.some(p => p.test(fileName))) return true;
  return false;
};

const compressFileSummary = (fileName: string, semantics: { role: string; complexity: string; lines: number; exports: string[] }): string => {
  if (isTrivialFile(fileName, semantics.lines, semantics.exports.length)) {
    return `${semantics.role} trivial (${semantics.lines}L, ${semantics.exports.length || 1} export)`;
  }
  return `${semantics.role}; complejidad ${semantics.complexity}; ${semantics.lines} lineas; exports ${getTopItems(semantics.exports, 5)}`;
};

const ENTRY_FILE_NAMES = ['main.tsx', 'main.jsx', 'app.tsx', 'app.jsx', 'main.py', 'server.js', 'index.js', 'index.ts', 'main.dart', 'index.php', 'artisan', 'server.php'];

const LANGUAGE_MAP: Record<string, string> = {
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
  '.svelte': 'Svelte',
  '.dart': 'Dart'
};

const takeLimited = <T>(items: T[], limit: number) => items.slice(0, limit);

const buildHotspotConnectionProfiles = (
  projectData: ProjectData,
  projectName: string,
  hotspotNodeIds: string[]
) => {
  if (!hotspotNodeIds.length) return '';

  const rootPath = (path: string) => withProjectRoot(projectName, path);
  let text = '## Estructura de Conexiones por Nodo\n';
  text += 'Este bloque ayuda a explicar cómo se conecta cada archivo crítico dentro del grafo para que otro agente o persona entienda el mapa sin abrir el canvas.\n\n';

  hotspotNodeIds.forEach((nodeId) => {
    const node = projectData.nodes.find((item) => item.id === nodeId);
    const file = projectData.files.find((item) => item.id === nodeId);
    if (!node || !file) return;
    const semantic = summarizeFileSemantics(file);

    const directDependencies = projectData.links
      .filter((link) => {
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
        return sourceId === nodeId;
      })
      .map((link) => {
        const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
        const targetFile = projectData.files.find((item) => item.id === targetId);
        return targetFile ? rootPath(targetFile.path) : null;
      })
      .filter(Boolean) as string[];

    const directDependents = projectData.links
      .filter((link) => {
        const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
        return targetId === nodeId;
      })
      .map((link) => {
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
        const sourceFile = projectData.files.find((item) => item.id === sourceId);
        return sourceFile ? rootPath(sourceFile.path) : null;
      })
      .filter(Boolean) as string[];

    const secondaryImpact = new Set<string>();
    directDependents.forEach((dependentPath) => {
      const dependentFile = projectData.files.find((item) => rootPath(item.path) === dependentPath);
      if (!dependentFile) return;
      projectData.links.forEach((link) => {
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
        const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
        if (sourceId !== dependentFile.id || targetId === nodeId) return;
        const targetFile = projectData.files.find((item) => item.id === targetId);
        if (targetFile) {
          secondaryImpact.add(rootPath(targetFile.path));
        }
      });
    });

    text += `### ${node.label}\n`;
    text += `- Archivo: ${rootPath(file.path)}\n`;
    text += `- Centralidad: ${file.importance || 0}\n`;
    text += `- Rol inferido: ${semantic.role}\n`;
    text += `- Complejidad estimada: ${semantic.complexity}\n`;
    text += `- Lineas no vacias: ${semantic.nonEmptyLines || semantic.lines}\n`;
    text += `- Confianza de lectura: ${semantic.confidence} (${semantic.evidence})\n`;
    text += `- Contratos detectados: ${getTopItems(semantic.exports, 6)}\n`;
    text += `- Usa directamente: ${getTopItems(directDependencies, SNAPSHOT_EXPORT_CONFIG.maxNodeConnectionsPerHotspot)}\n`;
    text += `- Es usado por: ${getTopItems(directDependents, SNAPSHOT_EXPORT_CONFIG.maxNodeConnectionsPerHotspot)}\n`;
    text += `- Impacto secundario probable: ${getTopItems(Array.from(secondaryImpact), SNAPSHOT_EXPORT_CONFIG.maxNodeConnectionsPerHotspot)}\n\n`;
  });

  return text;
};

const getGeneratedAtLabel = () => new Date().toLocaleString();

const buildExportMetadataBlock = (projectName: string, fileLabel: string) => {
  const generatedAt = getGeneratedAtLabel();
  let text = `## Metadata\n`;
  text += `- Proyecto: ${projectName}\n`;
  text += `- Archivo: ${fileLabel}\n`;
  text += `- Generado en: ${generatedAt}\n`;
  text += `- Modo: deterministic local analysis\n\n`;
  text += `> [!NOTE]\n`;
  text += `> Úsalo como mapa de referencia y valida contra el código activo antes de tomar decisiones delicadas.\n\n`;
  return text;
};

const findProjectFile = (projectData: ProjectData, matcher: (normalizedPath: string) => boolean) =>
  projectData.files.find((file) => matcher(file.path.replace(/\\/g, '/').toLowerCase()));

const getSourceOfTruthCandidates = (projectData: ProjectData, projectName: string) => {
  const files = [...projectData.files].sort((a, b) => (b.importance || 0) - (a.importance || 0));
  const rootPath = (path: string) => withProjectRoot(projectName, path);
  const idToPath = new Map(projectData.files.map((file) => [file.id, rootPath(file.path)]));

  const candidatesByRole = new Map<string, { label: string; files: string[]; fileIds: string[] }>();

  files.forEach((file) => {
    const semantic = summarizeFileSemantics(file);
    const roleKey = semantic.role;

    if (!candidatesByRole.has(roleKey)) {
      candidatesByRole.set(roleKey, {
        label: roleKey.charAt(0).toUpperCase() + roleKey.slice(1),
        files: [],
        fileIds: []
      });
    }

    const current = candidatesByRole.get(roleKey)!;
    if (current.files.length < SNAPSHOT_EXPORT_CONFIG.maxFilesPerSourceGroup) {
      current.files.push(rootPath(file.path));
      current.fileIds.push(file.id);
    }
  });

  const groups = Array.from(candidatesByRole.values())
    .filter((group) => group.files.length > 0)
    .slice(0, SNAPSHOT_EXPORT_CONFIG.maxSourceGroups);

  // En vez de repetir el nombre de la categoria como "resumen", se calcula
  // quien usa realmente estos archivos y de que dependen, tomando las
  // relaciones del grafo. Asi el resumen responde la pregunta util: "si
  // toco esto, a quien afecto y que necesito revisar antes".
  return groups.map((group) => {
    const groupIds = new Set(group.fileIds);
    const usedBySet = new Set<string>();
    const dependsOnSet = new Set<string>();

    projectData.links.forEach((link) => {
      const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
      const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;

      if (groupIds.has(targetId) && !groupIds.has(sourceId)) {
        const path = idToPath.get(sourceId);
        if (path) usedBySet.add(path);
      }
      if (groupIds.has(sourceId) && !groupIds.has(targetId)) {
        const path = idToPath.get(targetId);
        if (path) dependsOnSet.add(path);
      }
    });

    const usedBy = Array.from(usedBySet);
    const dependsOn = Array.from(dependsOnSet);

    let summary: string;
    if (!usedBy.length && !dependsOn.length) {
      summary = 'Ningún otro módulo detectado los usa ni depende de ellos directamente según el grafo actual.';
    } else {
      const usedByText = usedBy.length
        ? `lo usan directamente ${usedBy.length} módulo(s) (${getTopItems(usedBy, 4)})`
        : 'ningún otro módulo los usa directamente';
      const dependsOnText = dependsOn.length
        ? `dependen de ${dependsOn.length} módulo(s) (${getTopItems(dependsOn, 4)})`
        : 'no dependen de otros módulos del proyecto';
      summary = `Si modificas alguno de estos archivos: ${usedByText}, y ${dependsOnText}.`;
    }

    return {
      label: group.label,
      summary,
      files: group.files
    };
  });
};

const buildSourcesOfTruthBlock = (projectData: ProjectData, projectName: string) => {
  const groups = getSourceOfTruthCandidates(projectData, projectName);
  if (!groups.length) return '';

  let text = '## Fuentes de Verdad\n\n';
  text += '> [!TIP]\n';
  text += '> Señala archivos donde habitan decisiones funcionales y arquitectónicas clave del sistema según ruta, nombre y análisis de dependencias.\n\n';
  takeLimited(groups, SNAPSHOT_EXPORT_CONFIG.maxSourceGroups).forEach((group) => {
    text += `- **${group.label}**: ${group.files.join(', ')}\n`;
    text += `  - *Resumen*: ${group.summary}\n`;
  });
  text += '\n';
  return text;
};

const getCriticalFlowCandidates = (projectData: ProjectData, projectName: string) => {
  const rootPath = (path: string) => withProjectRoot(projectName, path);
  const files = [...projectData.files].sort((a, b) => (b.importance || 0) - (a.importance || 0));

  const orchestrators = files.slice(0, 4).map((f) => rootPath(f.path));
  const entryPoints = files.filter((f) => isEntryPointFile(f.path, f.name)).map((f) => rootPath(f.path));
  const services = files.filter((f) => /service|domain|controller|manager|core/i.test(f.name) || /services|domain|controllers/i.test(f.path)).slice(0, 4).map((f) => rootPath(f.path));

  const flows = [];

  if (entryPoints.length) {
    flows.push({
      label: 'Punto de entrada y arranque del sistema',
      why: 'Constituye la inicialización y arranque primario de la aplicación.',
      files: entryPoints.slice(0, SNAPSHOT_EXPORT_CONFIG.maxFilesPerFlow)
    });
  }

  if (orchestrators.length) {
    flows.push({
      label: 'Orquestadores principales y alta acoplación',
      why: 'Archivos con mayor centralidad en el grafo que coordinan múltiples subsistemas.',
      files: orchestrators.slice(0, SNAPSHOT_EXPORT_CONFIG.maxFilesPerFlow)
    });
  }

  if (services.length) {
    flows.push({
      label: 'Servicios de dominio y procesamiento principal',
      why: 'Concentran las reglas funcionales, lógica de negocio y procesamiento de datos.',
      files: services.slice(0, SNAPSHOT_EXPORT_CONFIG.maxFilesPerFlow)
    });
  }

  return flows.filter((flow) => flow.files.length > 0);
};

const buildCriticalFlowsBlock = (projectData: ProjectData, projectName: string) => {
  const flows = getCriticalFlowCandidates(projectData, projectName);
  if (!flows.length) return '';

  let text = '## Flujos Críticos\n\n';
  text += '> [!IMPORTANT]\n';
  text += '> Rutas de lectura prioritarias que condicionan la arquitectura antes de editar código.\n\n';
  takeLimited(flows, SNAPSHOT_EXPORT_CONFIG.maxCriticalFlows).forEach((flow) => {
    text += `### ${flow.label}\n`;
    text += `- **Por qué importa**: ${flow.why}\n`;
    text += `- **Archivos guía**: ${flow.files.join(', ')}\n\n`;
  });
  text += '\n';
  return text;
};

export const generateAIContextExport = (projectData: ProjectData, projectName: string) => {
  const normalizedName = projectName || APP_CONFIG.projectFallbackName;
  const rootPath = (path: string) => withProjectRoot(normalizedName, path);
  const stack = new Set<string>();

  projectData.files.forEach((file) => {
    const signals = detectTechStackSignals(file);
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

    if (isEntryPointFile(file.path, file.name)) {
      entryPoints.push(file.path);
    }

    if (['.tsx', '.ts', '.jsx', '.js', '.html', '.css', '.scss', '.dart'].includes(file.ext)) {
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

  const connectionMap = new Map<string, { outgoing: string[]; incoming: string[] }>();

  projectData.nodes.forEach((node) => {
    connectionMap.set(node.id, { outgoing: [], incoming: [] });
  });

  projectData.links.forEach((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    const sourceNode = projectData.nodes.find((node) => node.id === sourceId);
    const targetNode = projectData.nodes.find((node) => node.id === targetId);
    const sourceLabel = sourceNode?.label || sourceId;
    const targetLabel = targetNode?.label || targetId;

    if (connectionMap.has(sourceId)) {
      connectionMap.get(sourceId)!.outgoing.push(targetLabel);
    }
    if (connectionMap.has(targetId)) {
      connectionMap.get(targetId)!.incoming.push(sourceLabel);
    }
  });

  const topNodes = [...projectData.nodes]
    .sort((a, b) => {
      const impA = a.data.importance || 0;
      const impB = b.data.importance || 0;
      if (impB !== impA) return impB - impA;

      const connA = connectionMap.get(a.id);
      const connB = connectionMap.get(b.id);
      const totalA = connA ? connA.outgoing.length + connA.incoming.length : 0;
      const totalB = connB ? connB.outgoing.length + connB.incoming.length : 0;
      if (totalB !== totalA) return totalB - totalA;

      const semA = summarizeFileSemantics(a.data);
      const semB = summarizeFileSemantics(b.data);
      const linesA = semA.nonEmptyLines || semA.lines || a.data.size || 0;
      const linesB = semB.nonEmptyLines || semB.lines || b.data.size || 0;
      if (linesB !== linesA) return linesB - linesA;

      return a.label.localeCompare(b.label);
    })
    .slice(0, SNAPSHOT_EXPORT_CONFIG.maxHotspots);

  const hotspotSemantics = topNodes.map((node) => summarizeFileSemantics(node.data));
  const topHotspots = topNodes.map((node) => `${node.label} (${rootPath(node.id)}) [${node.data.importance}]`);

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
    .slice(0, SNAPSHOT_EXPORT_CONFIG.maxGraphLeaders);

  const topRelations = projectData.links.slice(0, SNAPSHOT_EXPORT_CONFIG.maxGraphLeaders).map((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    const sourceNode = projectData.nodes.find((node) => node.id === sourceId);
    const targetNode = projectData.nodes.find((node) => node.id === targetId);
    return `${sourceNode?.label || sourceId} -> ${targetNode?.label || targetId}`;
  });

  const inferredPurpose = [
    frontendFiles.length > 0 ? `proveer interfaz de usuario (${frontendFiles.length} componentes)` : null,
    backendFiles.length > 0 ? `ejecutar servicios de backend (${backendFiles.length} módulos)` : null,
    stack.has('Database (ORM/ODM)') ? 'gestionar persistencia y modelos de datos' : null,
    projectData.links.length > 0 ? `orquestar flujos entre ${projectData.files.length} módulos analizados` : null
  ].filter(Boolean).join(', ');

  const architectureSummary = [
    frontendFiles.length > 0 ? `Frontend detectado con ${frontendFiles.length} archivos principales.` : null,
    backendFiles.length > 0 ? `Backend detectado con ${backendFiles.length} archivos de lógica y servicios.` : null,
    projectData.links.length > 0 ? `Se mapearon ${projectData.links.length} relaciones entre módulos.` : null,
    topHotspots.length > 0 ? `Los hotspots más conectados son ${getTopItems(topHotspots, 4)}.` : null
  ].filter(Boolean).join(' ');

  const layerEntries = Object.entries(
    projectData.files.reduce<Record<string, string[]>>((acc, file) => {
      const parts = file.path.split('/');
      const layer = parts.length > 1 ? parts[0] : 'root';
      if (!acc[layer]) {
        acc[layer] = [];
      }
      if (acc[layer].length < SNAPSHOT_EXPORT_CONFIG.maxLayerFiles) {
        acc[layer].push(file.name);
      }
      return acc;
    }, {})
  );

  const directorySummary = Array.from(directories)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, SNAPSHOT_EXPORT_CONFIG.maxDirectories)
    .map((directory) => `- ${directory}`)
    .join('\n');

  let context = '# Architectural Snapshot\n\n';
  context += `Project Context: ${normalizedName}\n`;
  context += `Tech Stack: ${Array.from(stack).join(', ') || 'Standard Web/App Stack'}\n`;
  context += `Scale: ${projectData.files.length} Analyzed Modules\n\n`;
  context += buildExportMetadataBlock(normalizedName, SNAPSHOT_EXPORT_CONFIG.deterministicExportName);

  context += '## Qué Pasarle A Un Agente\n';
  context += '- Instrucciones operativas de la tarea actual.\n';
  context += '- Este snapshot como contexto base del repositorio.\n';
  context += '- Los archivos concretos que el snapshot marca como hotspots o fuentes de verdad.\n';
  context += '- No le pases dumps largos de código salvo que la tarea ya esté localizada.\n\n';

  context += '## Lectura de Confianza\n';
  context += '- Hechos verificables: entry points detectados, tipos de archivo, relaciones del grafo, conexiones entrantes/salientes, contratos extraídos por regex y métricas de tamaño.\n';
  context += '- Heurísticas: fuentes de verdad, flujos críticos, rol inferido del archivo y complejidad estimada.\n\n';

  const explicitTargetIdentity = extractTargetProjectIdentity(projectData.files);

  context += '## Identidad del Proyecto\n';
  context += `- Descripción: ${explicitTargetIdentity ? `${normalizedName} (${explicitTargetIdentity})` : `${normalizedName} está orientado a ${inferredPurpose || 'ejecutar la lógica funcional del sistema analizado'}`}.\n`;
  context += `- Resumen arquitectónico: ${architectureSummary || 'No se pudo inferir un resumen arquitectónico fuerte con el conjunto actual de archivos.'}\n`;
  context += `- Entry points probables: ${getTopItems(formatProjectPaths(normalizedName, entryPoints), SNAPSHOT_EXPORT_CONFIG.maxEntryPoints)}\n`;
  context += `- Directorios principales: ${getTopItems(Array.from(directories), SNAPSHOT_EXPORT_CONFIG.maxDirectories)}\n`;
  context += `- Tipos de archivo dominantes: ${getTopItems(dominantExt, 5)}\n\n`;

  context += '## Capacidades Detectadas\n';
  context += `- Stack detectado: ${getTopItems(Array.from(stack), 8)}\n`;
  context += `- Entry points núcleo: ${getTopItems(formatProjectPaths(normalizedName, entryPoints), SNAPSHOT_EXPORT_CONFIG.maxEntryPoints)}\n`;
  context += '- Estrategia: análisis determinístico primero y enriquecimiento con IA solo como capa opcional.\n\n';

  context += '## Restricciones de Lectura\n';
  context += '- Modelo local-first: no asumir SaaS, multiusuario ni servicio remoto sin evidencia explícita.\n';
  context += '- Persistencia: la persistencia detectada es local; no afirmar nube o base de datos de usuarios sin evidencia.\n';
  context += '- Regla de inferencia: si una capacidad no aparece en archivos, rutas, dependencias o funciones detectadas, no la inventes.\n\n';

  context += buildSourcesOfTruthBlock(projectData, normalizedName);
  context += buildCriticalFlowsBlock(projectData, normalizedName);

  context += '## Prioridad de Lectura\n';
  context += `${topHotspots.map((hotspot, index) => `${index + 1}. ${hotspot}`).join('\n')}\n\n`;

  context += '## Hotspots con Contrato Corto\n';
  topNodes.forEach((node, index) => {
    const semantic = hotspotSemantics[index];
    const summary = compressFileSummary(node.label, {
      role: semantic.role,
      complexity: semantic.complexity,
      lines: semantic.nonEmptyLines || semantic.lines,
      exports: semantic.exports
    });
    context += `- ${node.label}: ${summary}\n`;
  });
  context += '\n';

  context += '## Capas y Directorios\n';
  context += `${directorySummary || '- Sin directorios principales detectables'}\n\n`;
  layerEntries.forEach(([layer, files]) => {
    context += `- [${layer.toUpperCase()}] ${files.join(', ')}\n`;
  });

  context += '\n## Relaciones Clave Del Grafo\n';
  context += `${getTopItems(topRelations, SNAPSHOT_EXPORT_CONFIG.maxGraphLeaders)}\n\n`;

  context += '## Lectura del Grafo\n';
  graphLeaders.forEach((leader) => {
    context += `- ${leader.label}: ${leader.total} conexiones totales (${leader.outgoing} salientes, ${leader.incoming} entrantes). `;
    context += `Usa -> ${getTopItems(leader.outgoingTargets, 4)}. `;
    context += `Es usado por -> ${getTopItems(leader.incomingSources, 4)}.\n`;
  });

  context += `\n${buildHotspotConnectionProfiles(projectData, normalizedName, topNodes.map((node) => node.id))}`;

  return context;
};

export const generateProjectBriefExport = (projectData: ProjectData, projectName: string) => {
  const languageCount = new Map<string, number>();
  const stack = new Set<string>();
  const dbSignals = new Set<string>();
  const runtimeSignals = new Set<string>();
  const uiSignals = new Set<string>();
  const entryPoints: string[] = [];
  const hotspotFiles = [...projectData.files]
    .sort((a, b) => {
      const impA = a.importance || 0;
      const impB = b.importance || 0;
      if (impB !== impA) return impB - impA;
      const semA = summarizeFileSemantics(a);
      const semB = summarizeFileSemantics(b);
      const linesA = semA.nonEmptyLines || semA.lines || a.size || 0;
      const linesB = semB.nonEmptyLines || semB.lines || b.size || 0;
      if (linesB !== linesA) return linesB - linesA;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 8);

  projectData.files.forEach((file) => {
    const signals = detectTechStackSignals(file);
    const language = LANGUAGE_MAP[file.ext] || file.ext || 'Unknown';
    languageCount.set(language, (languageCount.get(language) || 0) + 1);

    signals.stack.forEach((item) => stack.add(item));
    signals.databases.forEach((item) => dbSignals.add(item));
    signals.runtime.forEach((item) => runtimeSignals.add(item));
    signals.ui.forEach((item) => uiSignals.add(item));

    if (isEntryPointFile(file.path, file.name)) {
      entryPoints.push(file.path);
    }
  });

  const topLanguages = [...languageCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => `${language} (${count})`);

  const detectedPurpose = [
    uiSignals.size > 0 ? `proveer componentes de interfaz (${Array.from(uiSignals).join(', ')})` : null,
    runtimeSignals.size > 0 ? `ejecutar servicios backend (${Array.from(runtimeSignals).join(', ')})` : null,
    dbSignals.size > 0 ? `gestionar persistencia de datos (${Array.from(dbSignals).join(', ')})` : null,
    projectData.files.length > 0 ? `organizar la estructura técnica en ${projectData.files.length} módulos` : null
  ].filter(Boolean).join(', ');

  const explicitBriefIdentity = extractTargetProjectIdentity(projectData.files);

  let brief = `# Project Brief: ${projectName}\n\n`;
  brief += buildExportMetadataBlock(projectName, 'brief.md');
  brief += '## Qué Hace\n';
  brief += `${explicitBriefIdentity ? `${projectName}: ${explicitBriefIdentity}` : `${projectName} es un proyecto desarrollado para ${detectedPurpose || 'ejecutar la lógica funcional del sistema analizado'}.`}\n\n`;
  brief += '## Stack Detectado\n';
  brief += `- Frameworks y librerías: ${Array.from(stack).join(', ') || 'No detectado con alta confianza'}\n`;
  brief += `- Lenguajes principales: ${topLanguages.slice(0, 6).join(', ') || 'No detectado'}\n`;
  brief += `- Base de datos o persistencia: ${Array.from(dbSignals).join(', ') || 'No se detectó una base de datos clara'}\n`;
  brief += `- Runtime/capacidades: ${Array.from(new Set([...runtimeSignals, ...uiSignals])).join(', ') || 'No detectado'}\n\n`;
  brief += '## Arquitectura\n';
  brief += `- Archivos analizados: ${projectData.files.length}\n`;
  brief += `- Relaciones detectadas: ${projectData.links.length}\n`;
  brief += `- Entry points probables: ${formatProjectPaths(projectName, entryPoints).join(', ') || 'No detectados'}\n`;
  brief += `- Hotspots principales: ${hotspotFiles.map((file) => `${file.name} [${file.importance || 0}]`).join(', ') || 'No detectados'}\n\n`;
  brief += buildSourcesOfTruthBlock(projectData, projectName);
  brief += buildCriticalFlowsBlock(projectData, projectName);
  brief += '## Qué Pasarle A Otro Agente\n';
  brief += `- Este proyecto usa: ${topLanguages.slice(0, 4).join(', ') || 'lenguajes no detectados con claridad'}.\n`;
  brief += `- Componentes críticos: ${hotspotFiles.slice(0, 5).map((file) => withProjectRoot(projectName, file.path)).join(', ') || 'No detectados'}.\n`;
  brief += `- Resumen operativo: estructura con ${projectData.files.length} módulos y ${projectData.links.length} relaciones entre componentes en ${topLanguages.slice(0, 3).join(', ')}.\n`;

  return brief;
};

export const generateProjectMetadataExport = (projectData: ProjectData, projectName: string) => {
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
    const language = LANGUAGE_MAP[file.ext] || file.ext || 'Unknown';
    languages[language] = (languages[language] || 0) + 1;

    signals.stack.forEach((item) => technologies.add(item));
    signals.databases.forEach((item) => databases.add(item));

    if (['.tsx', '.jsx', '.vue', '.svelte', '.html', '.css', '.scss'].includes(file.ext)) layers.frontend++;
    if (['.py', '.go', '.java', '.cs', '.php', '.rb'].includes(file.ext) || file.path.toLowerCase().includes('server/')) layers.backend++;
    if (file.path.toLowerCase().includes('worker')) layers.workers++;
    if (code.includes('dexie') || code.includes('indexeddb') || code.includes('database')) layers.storage++;
  });

  const hotspots = [...projectData.files]
    .sort((a, b) => {
      const impA = a.importance || 0;
      const impB = b.importance || 0;
      if (impB !== impA) return impB - impA;
      const semA = summarizeFileSemantics(a);
      const semB = summarizeFileSemantics(b);
      const linesA = semA.nonEmptyLines || semA.lines || a.size || 0;
      const linesB = semB.nonEmptyLines || semB.lines || b.size || 0;
      if (linesB !== linesA) return linesB - linesA;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 10)
    .map((file) => ({
      path: withProjectRoot(projectName, file.path),
      importance: file.importance || 0,
      ext: file.ext
    }));

  return JSON.stringify({
    projectName,
    generatedBy: 'ProjectGrapher local deterministic analysis',
    generatedAt: getGeneratedAtLabel(),
    validityNote: 'Usa este archivo como referencia estructural y valida contra el código activo antes de cambiar reglas de negocio.',
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
      .filter((file) => isEntryPointFile(file.path, file.name))
      .map((file) => withProjectRoot(projectName, file.path)),
    hotspots,
    sourcesOfTruth: getSourceOfTruthCandidates(projectData, projectName),
    criticalFlows: getCriticalFlowCandidates(projectData, projectName),
    agentHint: {
      purpose: 'Usa este archivo para darle a otro agente una ficha técnica rápida y determinista del proyecto.',
      recommendedFiles: hotspots.slice(0, 5).map((file) => file.path)
    }
  }, null, 2);
};

export const generateGraphGuideExport = (projectData: ProjectData, projectName: string) => {
  const rootPath = (path: string) => withProjectRoot(projectName, path);
  const connectionMap = new Map<string, { outgoing: string[]; incoming: string[]; path: string }>();

  projectData.nodes.forEach((node) => {
    connectionMap.set(node.id, { outgoing: [], incoming: [], path: node.id });
  });

  projectData.links.forEach((link) => {
    const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
    const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
    const sourceNode = projectData.nodes.find((node) => node.id === sourceId);
    const targetNode = projectData.nodes.find((node) => node.id === targetId);

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

  const orchestrators = ranking.filter((node) => node.outgoing.length >= 2).slice(0, 12);
  const sharedCore = ranking.filter((node) => node.incoming.length >= 2).slice(0, 12);

  let guide = `# Graph Guide: ${projectName}\n\n`;
  guide += buildExportMetadataBlock(projectName, 'graph_guide.md');
  guide += '## Cómo Leer Este Archivo\n';
  guide += '- "Usa" significa que un archivo depende de otro.\n';
  guide += '- "Recibe uso de" significa que otros módulos dependen de ese archivo.\n';
  guide += '- Los módulos listados primero son los más relevantes para entender el flujo real del proyecto.\n\n';
  guide += '## Resumen del Grafo\n';
  guide += `- Nodos: ${projectData.nodes.length}\n`;
  guide += `- Relaciones: ${projectData.links.length}\n`;
  guide += `- Módulos más conectados: ${ranking.slice(0, 8).map((node) => `${node.label} (${node.total})`).join(', ') || 'N/A'}\n\n`;
  guide += buildSourcesOfTruthBlock(projectData, projectName);
  guide += '## Archivos Orquestadores\n';
  orchestrators.forEach((node) => {
    guide += `- ${node.label}\n`;
    guide += `  Path: ${rootPath(node.path)}\n`;
    guide += `  Usa: ${node.outgoing.slice(0, 8).join(', ') || 'Nadie'}\n`;
    guide += `  Recibe uso de: ${node.incoming.slice(0, 8).join(', ') || 'Nadie'}\n`;
  });
  guide += '\n## Núcleo Compartido\n';
  sharedCore.forEach((node) => {
    guide += `- ${node.label}\n`;
    guide += `  Path: ${rootPath(node.path)}\n`;
    guide += `  Recibe uso de: ${node.incoming.slice(0, 8).join(', ') || 'Nadie'}\n`;
    guide += `  Usa: ${node.outgoing.slice(0, 8).join(', ') || 'Nadie'}\n`;
  });
  guide += '\n## Recomendación Para Otro Agente\n';
  guide += 'Empieza por los archivos orquestadores, luego revisa el núcleo compartido y por último entra a archivos hoja. Este orden reduce tokens y acelera el entendimiento del sistema.\n';

  return guide;
};

export const generateCriticalFlowsExport = (projectData: ProjectData, projectName: string) => {
  let text = `# Critical Flows: ${projectName}\n\n`;
  text += buildExportMetadataBlock(projectName, 'critical_flows.md');
  text += '## Qué Es Este Archivo\n';
  text += 'Documento corto para separar flujos operativos y fuentes de verdad del resto del mapa técnico.\n\n';
  text += buildSourcesOfTruthBlock(projectData, projectName);
  text += buildCriticalFlowsBlock(projectData, projectName);
  text += '## Recomendación de Uso\n';
  text += '- Léelo antes de editar si la tarea toca reglas funcionales, contexto global o integraciones.\n';
  text += '- Cruza este archivo con snapshot y graph guide si necesitas más detalle estructural.\n';
  return text;
};

export const generateTreeOnlyExport = (projectData: ProjectData, projectName: string) => {
  const tree = buildFileTree(
    projectData.files.map((file) => ({
      ...file,
      path: withProjectRoot(projectName || APP_CONFIG.projectFallbackName, file.path)
    }))
  );

  return `### PROJECT STRUCTURE SNAPSHOT\n${generateTreeText(tree)}`;
};
