import { GraphLink, GraphNode, ProjectData, ProjectFile } from '../types';
import { createProjectFileResolver, normalizeProjectPath, shouldProcessFile } from '../utils/analysis';

const MAX_GRAPH_FILES = 1500;
const SCAN_BATCH_SIZE = 500;

// Escala visual de nodos según su "importancia" (cantidad de links entrantes/salientes)
const NODE_MIN_SIZE = 12;
const NODE_MAX_SIZE = 32;
const NODE_BASE_SIZE = 10;
const NODE_IMPORTANCE_WEIGHT = 4;

const prioritizeFile = (path: string, name: string) => {
  const normalizedPath = path.toLowerCase();
  const normalizedName = name.toLowerCase();

  // Penalize worktrees, hidden folders, or cache artifacts if any slipped through
  if (
    normalizedPath.includes('worktree') ||
    normalizedPath.includes('.claude') ||
    normalizedPath.includes('.angular') ||
    normalizedPath.includes('.cache')
  ) {
    return 99;
  }

  if (
    normalizedName === 'main.tsx' ||
    normalizedName === 'main.jsx' ||
    normalizedName === 'app.tsx' ||
    normalizedName === 'app.jsx' ||
    normalizedName === 'main.py' ||
    normalizedName === 'server.js' ||
    normalizedName === 'index.ts' ||
    normalizedName === 'index.js' ||
    normalizedName === 'app.module.ts' ||
    normalizedName === 'routes.php' ||
    normalizedName === 'api.php' ||
    normalizedName === 'web.php'
  ) {
    return 0;
  }

  if (
    normalizedPath.startsWith('src/') ||
    normalizedPath.includes('/src/') ||
    normalizedPath.startsWith('app/') ||
    normalizedPath.includes('/app/') ||
    normalizedPath.startsWith('server/') ||
    normalizedPath.includes('/server/') ||
    normalizedPath.startsWith('backend/') ||
    normalizedPath.includes('/backend/') ||
    normalizedPath.startsWith('frontend/') ||
    normalizedPath.includes('/frontend/') ||
    normalizedPath.includes('/controllers/') ||
    normalizedPath.includes('/services/') ||
    normalizedPath.includes('/models/') ||
    normalizedPath.includes('/modules/') ||
    normalizedPath.includes('/routes/') ||
    normalizedPath.includes('/api/')
  ) {
    return 1;
  }

  if (
    normalizedPath.includes('/components/') ||
    normalizedPath.includes('/store/') ||
    normalizedPath.includes('/utils/') ||
    normalizedPath.includes('/hooks/') ||
    normalizedPath.includes('/views/') ||
    normalizedPath.includes('/pages/')
  ) {
    return 2;
  }

  return 3;
};

const yieldToBrowser = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });

const getProjectRelativePath = (rawPath: string) => {
  const normalized = rawPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return parts[0] || normalized;
  }
  return parts.slice(1).join('/');
};

// Extrae el id de un endpoint de link, que puede venir como string (id crudo)
// o como objeto GraphNode ya resuelto por la librería de fuerza dirigida.
const getLinkNodeId = (endpoint: GraphLink['source'] | GraphLink['target']): string =>
  typeof endpoint === 'object' ? (endpoint as any).id : (endpoint as unknown as string);

type WorkerInputFile = {
  path: string;
  name: string;
  size: number;
  lastModified?: number;
  file?: File;
  content?: string;
};

type ProgressPayload = {
  stage: 'scanning' | 'reading';
  message: string;
  current: number;
  total: number;
  ratio: number;
};

type DeepAnalysisResult = {
  path: string;
  dependencies: string[];
};

export const prepareProjectFilesForWorker = async (
  fileList: FileList | File[],
  onProgress?: (progress: ProgressPayload) => void
) => {
  const totalFiles = fileList.length;
  if (totalFiles === 0) {
    return {
      projectName: '',
      skippedCount: 0,
      workerInput: [] as WorkerInputFile[]
    };
  }

  const firstFile = fileList[0];
  const relativePath = (firstFile as any)?.webkitRelativePath as string | undefined;
  const projectName = relativePath?.split('/')[0] || 'Project';

  const candidateFiles: { file: File; path: string; name: string; size: number }[] = [];
  const BATCH_SIZE = 1000;

  for (let index = 0; index < totalFiles; index += BATCH_SIZE) {
    const limit = Math.min(index + BATCH_SIZE, totalFiles);

    for (let innerIndex = index; innerIndex < limit; innerIndex++) {
      const file = fileList[innerIndex];
      if (!file) continue;

      const rawPath = (file as any).webkitRelativePath || file.name;
      // Fast path check directly on rawPath before heavy string manipulation
      if (!shouldProcessFile(rawPath, file.size)) continue;

      const path = getProjectRelativePath(rawPath);

      candidateFiles.push({
        file,
        path,
        name: file.name,
        size: file.size
      });
    }

    onProgress?.({
      stage: 'scanning',
      message: 'Revisando estructura del proyecto y filtrando archivos relevantes...',
      current: limit,
      total: totalFiles,
      ratio: limit / totalFiles
    });

    await yieldToBrowser();
  }

  // Fast string comparison instead of heavy Intl localeCompare
  candidateFiles.sort((a, b) => {
    const priorityDiff = prioritizeFile(a.path, a.name) - prioritizeFile(b.path, b.name);
    if (priorityDiff !== 0) return priorityDiff;
    return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0);
  });

  const selectedCandidates = candidateFiles.slice(0, MAX_GRAPH_FILES);
  const skippedCount = candidateFiles.length - selectedCandidates.length;

  const workerInput: WorkerInputFile[] = selectedCandidates.map(({ file, path, name, size }) => ({
    path,
    name,
    size,
    lastModified: file.lastModified,
    file
  }));

  onProgress?.({
    stage: 'reading',
    message: 'Preparando envío de archivos en segundo plano...',
    current: workerInput.length,
    total: workerInput.length,
    ratio: 1.0
  });

  return {
    projectName,
    skippedCount,
    workerInput
  };
};

export type SyncInputResult = {
  workerInput: WorkerInputFile[];
  skippedCount: number;
  reusedCount: number;
  rereadCount: number;
  removedPaths: string[];
};

/**
 * Prepara el input del worker para una sincronización incremental: compara
 * los archivos frescos de un re-escaneo contra los ya conocidos y solo marca
 * para releer (I/O real) los que son nuevos o cambiaron de tamaño/fecha de
 * modificación. Los que no cambiaron viajan con su `content` ya en caché, así
 * el worker no vuelve a tocar el disco por ellos — solo recalcula el grafo
 * completo (rápido, es regex en memoria) sobre el conjunto combinado.
 */
export const prepareSyncInput = (
  freshFiles: File[],
  previousFiles: ProjectFile[]
): SyncInputResult => {
  const previousByPath = new Map(previousFiles.map((f) => [f.path, f]));
  const seenPaths = new Set<string>();

  const candidates: { file: File; path: string; name: string; size: number }[] = [];
  for (const file of freshFiles) {
    const rawPath = (file as any).webkitRelativePath || file.name;
    if (!shouldProcessFile(rawPath, file.size)) continue;
    candidates.push({ file, path: getProjectRelativePath(rawPath), name: file.name, size: file.size });
  }

  candidates.sort((a, b) => {
    const priorityDiff = prioritizeFile(a.path, a.name) - prioritizeFile(b.path, b.name);
    if (priorityDiff !== 0) return priorityDiff;
    return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0);
  });

  const selected = candidates.slice(0, MAX_GRAPH_FILES);
  const skippedCount = candidates.length - selected.length;

  let reusedCount = 0;
  let rereadCount = 0;
  const workerInput: WorkerInputFile[] = selected.map(({ file, path, name, size }) => {
    seenPaths.add(path);
    const previous = previousByPath.get(path);
    const unchanged = !!previous && previous.size === size && previous.lastModified === file.lastModified;

    if (unchanged) {
      reusedCount += 1;
      return { path, name, size, lastModified: file.lastModified, content: previous!.content };
    }

    rereadCount += 1;
    return { path, name, size, lastModified: file.lastModified, file };
  });

  const removedPaths = previousFiles.map((f) => f.path).filter((path) => !seenPaths.has(path));

  return { workerInput, skippedCount, reusedCount, rereadCount, removedPaths };
};

export const buildDeepAnalysisGraph = (projectData: ProjectData, analysisResults: DeepAnalysisResult[]) => {
  const newLinks: GraphLink[] = [...projectData.links];
  const seenLinks = new Set<string>(
    newLinks.map(link => {
      const sourceId = getLinkNodeId(link.source);
      const targetId = getLinkNodeId(link.target);
      return `${normalizeProjectPath(sourceId)}::${normalizeProjectPath(targetId)}`;
    })
  );

  const resolveProjectFile = createProjectFileResolver(projectData.files);

  analysisResults.forEach((result) => {
    const sourcePathNormalized = normalizeProjectPath(result.path);

    // Elimina los links salientes existentes de este archivo para sobreescribirlos
    for (let i = newLinks.length - 1; i >= 0; i--) {
      const link = newLinks[i];
      const sourceId = getLinkNodeId(link.source);
      if (normalizeProjectPath(sourceId) === sourcePathNormalized) {
        newLinks.splice(i, 1);
        const targetId = getLinkNodeId(link.target);
        seenLinks.delete(`${sourcePathNormalized}::${normalizeProjectPath(targetId)}`);
      }
    }

    result.dependencies.forEach((dep) => {
      const targetFile = resolveProjectFile(dep, result.path);

      if (targetFile && targetFile.id !== result.path) {
        const linkKey = `${sourcePathNormalized}::${normalizeProjectPath(targetFile.id)}`;
        if (seenLinks.has(linkKey)) return;
        seenLinks.add(linkKey);
        newLinks.push({ source: result.path, target: targetFile.id });
      }
    });
  });

  const importanceMap: Record<string, number> = {};
  newLinks.forEach((link) => {
    const sourceId = getLinkNodeId(link.source);
    const targetId = getLinkNodeId(link.target);
    importanceMap[sourceId] = (importanceMap[sourceId] || 0) + 1;
    importanceMap[targetId] = (importanceMap[targetId] || 0) + 1;
  });

  const newFiles = projectData.files.map((file) => ({
    ...file,
    importance: importanceMap[file.id] || 0
  }));

  const newNodes: GraphNode[] = projectData.nodes.map((node) => ({
    ...node,
    size: Math.max(
      NODE_MIN_SIZE,
      Math.min(NODE_MAX_SIZE, NODE_BASE_SIZE + (importanceMap[node.id] || 0) * NODE_IMPORTANCE_WEIGHT)
    ),
    data: {
      ...node.data,
      importance: importanceMap[node.id] || 0
    }
  }));

  return {
    links: newLinks,
    nodes: newNodes,
    files: newFiles
  };
};