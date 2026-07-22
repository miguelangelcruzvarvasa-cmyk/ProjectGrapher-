import { ProjectFile, GraphNode, ProjectData } from '../types';
import { summarizeFileSemantics } from '../utils/analysis';
import { withProjectRoot } from './projectInsights';

const SYNAPSE_BRIDGE_EVENT_URL = 'http://127.0.0.1:9090/api/live/event';

export function emitLiveNodeFocus(node: GraphNode, projectData: ProjectData, projectName: string) {
  try {
    const file = projectData.files.find((f) => f.id === node.id);
    if (!file) return;

    const semantic = summarizeFileSemantics(file);
    const rootPath = (path: string) => withProjectRoot(projectName, path);

    const directDependencies = projectData.links
      .filter((link) => {
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
        return sourceId === node.id;
      })
      .map((link) => {
        const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
        const targetFile = projectData.files.find((item) => item.id === targetId);
        return targetFile ? targetFile.name : null;
      })
      .filter(Boolean) as string[];

    const directDependents = projectData.links
      .filter((link) => {
        const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
        return targetId === node.id;
      })
      .map((link) => {
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
        const sourceFile = projectData.files.find((item) => item.id === sourceId);
        return sourceFile ? sourceFile.name : null;
      })
      .filter(Boolean) as string[];

    const liveEvent = {
      type: 'node_focus',
      timestamp: Date.now(),
      project: projectName,
      file: {
        path: rootPath(file.path),
        label: node.label,
        importance: file.importance || 0,
        role: semantic.role,
        complexity: semantic.complexity,
        lines: semantic.lines,
        exports: semantic.exports
      },
      relations: {
        uses: directDependencies,
        usedBy: directDependents
      }
    };

    fetch(SYNAPSE_BRIDGE_EVENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(liveEvent)
    }).catch(() => {
      // Daemon may be offline, fail silently without impacting UI performance
    });
  } catch (err) {
    // Ignore emission errors
  }
}
