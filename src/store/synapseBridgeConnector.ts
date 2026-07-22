import { ProjectFile, GraphNode, ProjectData } from '../types';
import { summarizeFileSemantics } from '../utils/analysis';
import { withProjectRoot } from './projectInsights';

const SYNAPSE_WS_URL = 'ws://127.0.0.1:9090/ws/live';
const SYNAPSE_HTTP_URL = 'http://127.0.0.1:9090/api/live/event';

let ws: WebSocket | null = null;
let wsConnected = false;

function getWebSocket(): WebSocket | null {
  if (typeof window === 'undefined') return null;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return ws;
  }

  try {
    ws = new WebSocket(SYNAPSE_WS_URL);
    ws.onopen = () => {
      wsConnected = true;
    };
    ws.onclose = () => {
      wsConnected = false;
      ws = null;
    };
    ws.onerror = () => {
      wsConnected = false;
    };
    return ws;
  } catch {
    return null;
  }
}

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

    // Try WebSocket first (bypasses HTTPS mixed content restrictions on Render)
    const socket = getWebSocket();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(liveEvent));
      return;
    }

    // Fallback HTTP POST
    fetch(SYNAPSE_HTTP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(liveEvent)
    }).catch(() => {});
  } catch {}
}

export function emitSaveContextFiles(projectName: string, files: Array<{ filename: string; content: string }>) {
  try {
    const payload = {
      type: 'context_save',
      projectName,
      files
    };

    // Try WebSocket first (bypasses HTTPS mixed content restrictions on Render)
    const socket = getWebSocket();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return;
    }

    // Fallback HTTP POST
    fetch('http://127.0.0.1:9090/api/context/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch {}
}
