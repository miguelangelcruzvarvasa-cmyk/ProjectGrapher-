import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useInternalNode,
  EdgeProps,
  BaseEdge,
  getStraightPath,
  ReactFlowProvider,
  useReactFlow,
  Node,
  Edge
} from '@xyflow/react';
import * as d3 from 'd3';
import { GraphNode, GraphLink } from '../../types';
import { FileNode } from './FileNode';
import { FolderNode } from './FolderNode';
import '@xyflow/react/dist/style.css';

// ─── Custom Floating Edge Component ──────────────────────────────────────────
const FloatingEdge: React.FC<EdgeProps> = ({
  id,
  source,
  target,
  style,
  markerEnd,
}) => {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) return null;

  // Node centers
  const sourceWidth = sourceNode.measured.width ?? 50;
  const sourceHeight = sourceNode.measured.height ?? 50;
  const targetWidth = targetNode.measured.width ?? 50;
  const targetHeight = targetNode.measured.height ?? 50;

  const sourceX = sourceNode.internals.positionAbsolute.x + sourceWidth / 2;
  const sourceY = sourceNode.internals.positionAbsolute.y + sourceHeight / 2;
  const targetX = targetNode.internals.positionAbsolute.x + targetWidth / 2;
  const targetY = targetNode.internals.positionAbsolute.y + targetHeight / 2;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  const sourceRadius = (sourceNode.data as any).size || 16;
  const targetRadius = ((targetNode.data as any).size || 16) + 2;

  const sx = sourceX + (dx / dist) * sourceRadius;
  const sy = sourceY + (dy / dist) * sourceRadius;
  const tx = targetX - (dx / dist) * targetRadius;
  const ty = targetY - (dy / dist) * targetRadius;

  const [edgePath] = getStraightPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      markerEnd={markerEnd}
    />
  );
};

// ─── React Flow Canvas Inner Component ────────────────────────────────────────
interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeClick: (node: GraphNode) => void;
  selectedNodeId: string | null;
  isFocusMode: boolean;
  graphDensityMode: 'auto' | 'focused' | 'expanded';
}

const nodeTypes = {
  file: FileNode,
  folder: FolderNode,
};

const edgeTypes = {
  floating: FloatingEdge,
};

// Helper: Extraer ruta de carpeta contenedora para un archivo
const getFolderPathForNode = (node: GraphNode): string => {
  const filePath = node.data?.path || node.id;
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 1) return 'root';
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/');
};

const GraphCanvasInner: React.FC<GraphCanvasProps> = ({
  nodes,
  links,
  onNodeClick,
  selectedNodeId,
  isFocusMode,
  graphDensityMode,
}) => {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const { fitView } = useReactFlow();

  const handleToggleExpand = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  // Run d3 force layout headlessly on initial mount / dataset changes or when folder expansion toggles
  useEffect(() => {
    if (!nodes.length) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }

    const width = 1200;
    const height = 900;

    // 1. Clasificar nodos en carpetas y archivos visibles
    const folderMap = new Map<string, GraphNode[]>();
    const rootFiles: GraphNode[] = [];

    nodes.forEach((n) => {
      const folderPath = getFolderPathForNode(n);
      if (folderPath === 'root') {
        rootFiles.push(n);
      } else {
        if (!folderMap.has(folderPath)) {
          folderMap.set(folderPath, []);
        }
        folderMap.get(folderPath)!.push(n);
      }
    });

    const visibleNodes: (GraphNode & { isFolder?: boolean; folderPath?: string; fileCount?: number })[] = [];
    const nodeToVisibleIdMap = new Map<string, string>();

    // Agregar archivos raíz
    rootFiles.forEach((f) => {
      visibleNodes.push(f);
      nodeToVisibleIdMap.set(f.id, f.id);
    });

    // Procesar cada carpeta
    const shouldAutoCluster = nodes.length > 50;

    folderMap.forEach((filesInFolder, folderPath) => {
      const isExpanded = expandedFolders.has(folderPath);

      if (shouldAutoCluster && !isExpanded) {
        // Carpeta colapsada: representar como un único nodo de carpeta
        const folderNodeId = `folder:${folderPath}`;
        const folderName = folderPath.split('/').pop() || folderPath;

        visibleNodes.push({
          id: folderNodeId,
          label: folderName,
          group: folderPath,
          cluster: folderPath,
          size: Math.min(45, 20 + Math.sqrt(filesInFolder.length) * 3),
          isFolder: true,
          folderPath,
          fileCount: filesInFolder.length,
          data: {
            id: folderNodeId,
            name: folderName,
            path: folderPath,
            content: '',
            ext: '',
            size: filesInFolder.reduce((sum, f) => sum + (f.data?.size || 0), 0),
            importance: 0,
          },
        });

        // Todos los archivos dentro de esta carpeta redirigen su ID al ID del nodo carpeta
        filesInFolder.forEach((f) => {
          nodeToVisibleIdMap.set(f.id, folderNodeId);
        });
      } else {
        // Carpeta expandida o proyecto pequeño: mostrar archivos individuales
        filesInFolder.forEach((f) => {
          visibleNodes.push(f);
          nodeToVisibleIdMap.set(f.id, f.id);
        });
      }
    });

    // 2. Headless simulation nodes para los nodos visibles
    const simNodes = visibleNodes.map((n) => ({
      ...n,
      x: n.x ?? (width / 2 + (Math.random() - 0.5) * 250),
      y: n.y ?? (height / 2 + (Math.random() - 0.5) * 250),
    }));

    const visibleNodeMap = new Map(simNodes.map((n) => [n.id, n]));

    // 3. Mapear y consolidar enlaces para nodos visibles
    const rawLinksMap = new Map<string, { source: string; target: string; count: number }>();

    links.forEach((link) => {
      const origSource = typeof link.source === 'string' ? link.source : link.source.id;
      const origTarget = typeof link.target === 'string' ? link.target : link.target.id;

      const visibleSource = nodeToVisibleIdMap.get(origSource) || origSource;
      const visibleTarget = nodeToVisibleIdMap.get(origTarget) || origTarget;

      if (visibleSource && visibleTarget && visibleSource !== visibleTarget) {
        if (visibleNodeMap.has(visibleSource) && visibleNodeMap.has(visibleTarget)) {
          const key = `${visibleSource}::${visibleTarget}`;
          const existing = rawLinksMap.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            rawLinksMap.set(key, { source: visibleSource, target: visibleTarget, count: 1 });
          }
        }
      }
    });

    const simLinks = Array.from(rawLinksMap.values());

    // Orbit centers for clusters
    const clusterNames = Array.from(new Set(simNodes.map((node) => node.cluster || 'root'))).sort();
    const clusterTargets = new Map<string, { x: number; y: number }>();
    const effectiveClusterCount = Math.max(clusterNames.length, 1);
    const orbitRadiusX = width * 0.32;
    const orbitRadiusY = height * 0.28;

    clusterNames.forEach((clusterName, index) => {
      if (clusterName === 'root') {
        clusterTargets.set(clusterName, { x: width / 2, y: height / 2 });
        return;
      }
      const angle = (-Math.PI / 2) + ((Math.PI * 2) * index) / effectiveClusterCount;
      clusterTargets.set(clusterName, {
        x: width / 2 + Math.cos(angle) * orbitRadiusX,
        y: height / 2 + Math.sin(angle) * orbitRadiusY,
      });
    });

    // Run the D3 force simulation on visible nodes only
    const simulation = d3.forceSimulation<any>(simNodes)
      .force('link', d3.forceLink<any, any>(simLinks)
        .id((d) => d.id)
        .distance((d) => {
          const s = visibleNodeMap.get(d.source.id);
          const t = visibleNodeMap.get(d.target.id);
          return s?.cluster === t?.cluster ? 130 : 280;
        })
        .strength((d) => {
          const s = visibleNodeMap.get(d.source.id);
          const t = visibleNodeMap.get(d.target.id);
          return s?.cluster === t?.cluster ? 0.8 : 0.25;
        })
      )
      .force('charge', d3.forceManyBody().strength((d: any) => (d.isFolder ? -500 : -300)))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX((d: any) => clusterTargets.get(d.cluster || 'root')?.x ?? width / 2).strength(0.25))
      .force('y', d3.forceY((d: any) => clusterTargets.get(d.cluster || 'root')?.y ?? height / 2).strength(0.25))
      .force('collision', d3.forceCollide().radius((d: any) => (d.isFolder ? 80 : d.size + 42)));

    // Run ticks synchronously
    for (let i = 0; i < 180; ++i) {
      simulation.tick();
    }
    simulation.stop();

    // Map to React Flow Nodes
    const importanceValues = nodes.map((n) => n.data.importance || 0);
    const maxImportance = Math.max(...importanceValues, 1);
    const highImportanceThreshold = Math.max(5, Math.ceil(maxImportance * 0.45));
    const mediumImportanceThreshold = Math.max(2, Math.ceil(maxImportance * 0.2));

    const connectedNodes = new Set<string>();
    if (selectedNodeId) {
      connectedNodes.add(selectedNodeId);
      simLinks.forEach((l) => {
        const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
        const tId = typeof l.target === 'string' ? l.target : (l.target as any).id;
        if (sId === selectedNodeId) connectedNodes.add(tId);
        if (tId === selectedNodeId) connectedNodes.add(sId);
      });
    }

    const calculatedRfNodes: Node[] = simNodes.map((n) => {
      const isSelected = n.id === selectedNodeId;
      const isDimmed = selectedNodeId ? !connectedNodes.has(n.id) : false;

      if (n.isFolder) {
        return {
          id: n.id,
          type: 'folder',
          position: {
            x: (n.x || 0) - 80,
            y: (n.y || 0) - 25,
          },
          data: {
            folderPath: n.folderPath || n.id,
            folderName: n.label,
            fileCount: n.fileCount || 0,
            isExpanded: expandedFolders.has(n.folderPath || ''),
            isSelected,
            isDimmed,
            onToggleExpand: handleToggleExpand,
          },
        };
      }

      return {
        id: n.id,
        type: 'file',
        position: {
          x: (n.x || 0) - n.size - 10,
          y: (n.y || 0) - n.size - 10,
        },
        data: {
          projectFile: n.data,
          size: n.size,
          importance: n.data.importance || 0,
          isHighImportance: (n.data.importance || 0) >= highImportanceThreshold,
          isMediumImportance: (n.data.importance || 0) >= mediumImportanceThreshold,
          isSelected,
          isDimmed,
          isFocusMode,
        },
      };
    });

    const calculatedRfEdges: Edge[] = simLinks.map((l, index) => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as any).id;
      const isConnected = selectedNodeId ? (sId === selectedNodeId || tId === selectedNodeId) : false;

      return {
        id: `e-${index}-${sId}-${tId}`,
        source: sId,
        target: tId,
        type: 'floating',
        animated: isConnected,
        style: {
          stroke: isConnected ? '#6366f1' : '#374151',
          strokeWidth: isConnected ? 2.2 : (l.count > 1 ? 1.8 : 0.9),
          opacity: selectedNodeId ? (isConnected ? 1 : 0.05) : 0.35,
          transition: 'stroke 180ms ease, opacity 180ms ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConnected ? '#6366f1' : '#4b5563',
          width: 12,
          height: 12,
        },
      };
    });

    setRfNodes(calculatedRfNodes);
    setRfEdges(calculatedRfEdges);

    // Fit view to calculated layout
    setTimeout(() => {
      fitView({ padding: 0.15, duration: 400 });
    }, 50);

  }, [nodes, links, selectedNodeId, isFocusMode, expandedFolders, handleToggleExpand, fitView, setRfNodes, setRfEdges]);

  // Handle Node clicks
  const onNodeClickCallback = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const graphNode = nodes.find((n) => n.id === node.id);
      if (graphNode) {
        onNodeClick(graphNode);
      }
    },
    [nodes, onNodeClick]
  );

  return (
    <div className="w-full h-full bg-brand-bg relative overflow-hidden select-none">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClickCallback}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        minZoom={0.1}
        maxZoom={4}
        fitView
      >
        <Background color="#1f2937" gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node: any) => {
            if (node.id === selectedNodeId) return '#6366f1';
            if (node.data?.isHighImportance) return '#f59e0b';
            const extColors: Record<string, string> = {
              '.js': '#f59e0b',
              '.jsx': '#f59e0b',
              '.ts': '#3b82f6',
              '.tsx': '#3b82f6',
              '.py': '#10b981',
              '.html': '#ec4899',
              '.css': '#06b6d4',
              '.json': '#8b5cf6',
            };
            return extColors[node.data?.projectFile?.ext] || '#4b5563';
          }}
          maskColor="rgba(99, 102, 241, 0.08)"
          nodeStrokeWidth={0}
          nodeBorderRadius={2}
        />
      </ReactFlow>
    </div>
  );
};

export const GraphCanvas: React.FC<GraphCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
};
