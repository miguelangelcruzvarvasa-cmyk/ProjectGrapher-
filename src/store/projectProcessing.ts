import { GraphLink, GraphNode, ProjectData } from '../types';
import { createProjectFileResolver, normalizeProjectPath, shouldProcessFile } from '../utils/analysis';

const MAX_GRAPH_FILES = 1500;
const SCAN_BATCH_SIZE = 2000;

// Escala visual de nodos según su "importancia" (cantidad de links entrantes/salientes)
const NODE_MIN_SIZE = 12;
const NODE_MAX_SIZE = 32;
const NODE_BASE_SIZE = 10;
const NODE_IMPORTANCE_WEIGHT = 4;

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
  file: File;
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
  fileList: FileList,
  onProgress?: (progress: ProgressPayload) => void
) => {
  const filesArray = Array.from(fileList);
  const firstFile = filesArray[0];
  if (!firstFile) {
    return {
      projectName: '',
      skippedCount: 0,
      workerInput: [] as WorkerInputFile[]
    };
  }

  const relativePath = (firstFile as any).webkitRelativePath as string | undefined;
  const projectName = relativePath?.split('/')[0] || 'Project';

  const candidateFiles: { file: File; path: string; name: string; size: number }[] = [];

  for (let index = 0; index < filesArray.length; index += SCAN_BATCH_SIZE) {
    const limit = Math.min(index + SCAN_BATCH_SIZE, filesArray.length);

    for (let innerIndex = index; innerIndex < limit; innerIndex++) {
      const file = filesArray[innerIndex];
      if (!file) continue;

      const rawPath = (file as any).webkitRelativePath || file.name;
      const path = getProjectRelativePath(rawPath);
      if (!shouldProcessFile(path, file.size)) continue;

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
      total: filesArray.length,
      ratio: filesArray.length ? limit / filesArray.length : 0
    });
    await yieldToBrowser();
  }

  candidateFiles.sort((a, b) => {
    const priorityDiff = prioritizeFile(a.path, a.name) - prioritizeFile(b.path, b.name);
    if (priorityDiff !== 0) return priorityDiff;
    return a.path.localeCompare(b.path);
  });

  const selectedCandidates = candidateFiles.slice(0, MAX_GRAPH_FILES);

  // Importante: skippedCount cuenta solo los candidatos válidos que se
  // quedaron fuera por el límite MAX_GRAPH_FILES, no los archivos ya
  // descartados por shouldProcessFile (node_modules, binarios, etc).
  const skippedCount = candidateFiles.length - selectedCandidates.length;

  const workerInput: WorkerInputFile[] = selectedCandidates.map(({ file, path, name, size }) => ({
    path,
    name,
    size,
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

  const newNodes: GraphNode[] = projectData.nodes.map((node) => ({
    ...node,
    size: Math.max(
      NODE_MIN_SIZE,
      Math.min(NODE_MAX_SIZE, NODE_BASE_SIZE + (importanceMap[node.id] || 0) * NODE_IMPORTANCE_WEIGHT)
    ),
    data: { ...node.data, importance: importanceMap[node.id] || 0 }
  }));

  return {
    links: newLinks,
    nodes: newNodes
  };
};