import { ProjectFile, GraphNode, GraphLink } from '../types';
import { getExtension, findDependencies, shouldProcessFile, createProjectFileResolver, normalizeProjectPath } from '../utils/analysis';

// Note: In a real Vite setup, you might need to import these differently if they are not worker-compatible.
// But since they are pure logic functions, they should be fine.

const getClusterName = (path: string) => {
  const parts = normalizeProjectPath(path).split('/').filter(Boolean);
  if (parts.length === 0) return 'root';

  const primary = parts[0];
  const secondary = parts[1];

  if (!primary) return 'root';
  if (['src', 'server'].includes(primary) && secondary) return `${primary}/${secondary}`;
  return primary;
};

self.onmessage = async (e: MessageEvent<{ files: { path: string, file: File, size: number, name: string }[] }>) => {
  const { files: rawFiles } = e.data;
  const validFiles: ProjectFile[] = [];
  let skippedCount = 0;
  const totalFiles = rawFiles.length;

  // 1. Filter and process content in batches asynchronously
  const BATCH_SIZE = 100;
  for (let index = 0; index < rawFiles.length; index += BATCH_SIZE) {
    const batch = rawFiles.slice(index, index + BATCH_SIZE);
    
    // Filter out invalid files first to avoid reading them
    const validBatch = batch.filter(item => shouldProcessFile(item.path, item.size));
    skippedCount += (batch.length - validBatch.length);

    if (validFiles.length >= 1500) {
      skippedCount += rawFiles.length - index;
      break;
    }

    // Read batch in parallel
    const readResults = await Promise.all(
      validBatch.map(async (item) => {
        try {
          const content = await item.file.text();
          return { ...item, content };
        } catch (err) {
          console.error(`Error reading ${item.path}:`, err);
          return { ...item, content: '' };
        }
      })
    );

    for (const item of readResults) {
      if (validFiles.length >= 1500) {
        skippedCount++;
        continue;
      }
      validFiles.push({
        id: item.path,
        name: item.name,
        path: item.path,
        content: item.content,
        ext: getExtension(item.name),
        size: item.size,
        importance: 0
      });
    }

    self.postMessage({
      progress: {
        stage: 'graph',
        message: 'Leyendo archivos y construyendo el grafo...',
        current: Math.min(index + batch.length, totalFiles),
        total: totalFiles,
        ratio: totalFiles ? Math.min(index + batch.length, totalFiles) / totalFiles : 0
      }
    });
  }

  // 2. Initial state (Calculamos links rápidos por Regex como base)
  const links: GraphLink[] = [];
  const importanceMap: Record<string, number> = {};
  const seenLinks = new Set<string>();
  const resolveProjectFile = createProjectFileResolver(validFiles);

  let processedFiles = 0;
  for (const file of validFiles) {
    const deps = findDependencies(file.content, file.name);
    for (const depName of deps) {
       const target = resolveProjectFile(depName, file.path);

       if (target && target.id !== file.id) {
          const sourceId = normalizeProjectPath(file.id);
          const targetId = normalizeProjectPath(target.id);
          const linkKey = `${sourceId}::${targetId}`;

          if (seenLinks.has(linkKey)) {
            continue;
          }

          seenLinks.add(linkKey);
          links.push({
             source: file.id,
             target: target.id
          });
          importanceMap[file.id] = (importanceMap[file.id] || 0) + 1;
          importanceMap[target.id] = (importanceMap[target.id] || 0) + 1;
       }
    }

    processedFiles += 1;
    if (processedFiles % 50 === 0 || processedFiles === validFiles.length) {
      self.postMessage({
        progress: {
          stage: 'graph',
          message: 'Calculando conexiones y centralidad del grafo...',
          current: processedFiles,
          total: Math.max(validFiles.length, 1),
          ratio: validFiles.length ? processedFiles / validFiles.length : 0
        }
      });
    }
  }

  // 3. Create Nodes
  const nodes: GraphNode[] = validFiles.map(f => {
    const cluster = getClusterName(f.path);
    
    let hash = 0;
    for (let i = 0; i < f.id.length; i++) {
      hash = ((hash << 5) - hash) + f.id.charCodeAt(i);
      hash |= 0; 
    }
    const posX = 400 + (hash % 200);
    const posY = 300 + ((hash >> 8) % 150);

    return {
      id: f.id,
      label: f.name,
      group: f.ext,
      cluster: cluster,
      size: Math.max(12, Math.min(32, 10 + (importanceMap[f.id] || 0) * 4)),
      data: { ...f, importance: importanceMap[f.id] || 0 },
      x: posX,
      y: posY
    };
  });

  self.postMessage({ projectData: { files: validFiles, nodes, links }, skippedCount });
};
