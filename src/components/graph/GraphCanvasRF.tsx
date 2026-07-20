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

  const sourceRadius = (sourceNode.data as any).size || 12;
  const targetRadius = ((targetNode.data as any).size || 12) + 2;

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
};

const edgeTypes = {
  floating: FloatingEdge,
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
  const { fitView } = useReactFlow();

  // Run d3 force layout headlessly on initial mount / dataset changes
  useEffect(() => {
    if (!nodes.length) {
      setRfNodes([]);
      setRfEdges([]);
      return;
    }

    const width = 1200;
    const height = 900;

    // Headless simulation nodes
    const simNodes = nodes.map((n) => ({
      ...n,
      x: n.x ?? (width / 2 + (Math.random() - 0.5) * 200),
      y: n.y ?? (height / 2 + (Math.random() - 0.5) * 200),
    }));

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    const activeLinks = links.filter((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return nodeMap.has(sourceId) && nodeMap.has(targetId);
    });

    const simLinks = activeLinks.map((l) => ({
      source: typeof l.source === 'string' ? l.source : l.source.id,
      target: typeof l.target === 'string' ? l.target : l.target.id,
    }));

    // Orbit centers for clusters
    const clusterNames = Array.from(new Set(nodes.map((node) => node.cluster || 'root'))).sort();
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

    // Run the forces
    const simulation = d3.forceSimulation<any>(simNodes)
      .force('link', d3.forceLink<any, any>(simLinks)
        .id((d) => d.id)
        .distance((d) => {
          const s = nodeMap.get(d.source.id);
          const t = nodeMap.get(d.target.id);
          return s?.cluster === t?.cluster ? 110 : 250;
        })
        .strength((d) => {
          const s = nodeMap.get(d.source.id);
          const t = nodeMap.get(d.target.id);
          return s?.cluster === t?.cluster ? 0.9 : 0.2;
        })
      )
      .force('charge', d3.forceManyBody().strength(-350))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX((d: any) => clusterTargets.get(d.cluster || 'root')?.x ?? width / 2).strength(0.25))
      .force('y', d3.forceY((d: any) => clusterTargets.get(d.cluster || 'root')?.y ?? height / 2).strength(0.25))
      .force('collision', d3.forceCollide().radius((d: any) => d.size + 42));

    // Run ticks synchronously to avoid layout flicker
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
      activeLinks.forEach((l) => {
        const sId = typeof l.source === 'string' ? l.source : l.source.id;
        const tId = typeof l.target === 'string' ? l.target : l.target.id;
        if (sId === selectedNodeId) connectedNodes.add(tId);
        if (tId === selectedNodeId) connectedNodes.add(sId);
      });
    }

    const calculatedRfNodes: Node[] = simNodes.map((n) => {
      const isSelected = n.id === selectedNodeId;
      const isDimmed = selectedNodeId ? !connectedNodes.has(n.id) : false;

      return {
        id: n.id,
        type: 'file',
        // Center the node element around its calculated coordinate
        // Custom FileNodes are sized centered, but React Flow positions from top-left.
        // FileNode size is data.size * 2 + 20. Let's offset to align perfectly.
        position: {
          x: (n.x || 0) - n.size - 10,
          y: (n.y || 0) - n.size - 10,
        },
        data: {
          projectFile: n.data,
          size: n.size,
          importance: n.data.importance || 0,
          isHighImportance: n.data.importance >= highImportanceThreshold,
          isMediumImportance: n.data.importance >= mediumImportanceThreshold,
          isSelected,
          isDimmed,
          isFocusMode,
        },
      };
    });

    const calculatedRfEdges: Edge[] = activeLinks.map((l, index) => {
      const sId = typeof l.source === 'string' ? l.source : l.source.id;
      const tId = typeof l.target === 'string' ? l.target : l.target.id;
      const isConnected = selectedNodeId ? (sId === selectedNodeId || tId === selectedNodeId) : false;

      return {
        id: `e-${index}-${sId}-${tId}`,
        source: sId,
        target: tId,
        type: 'floating',
        animated: isConnected,
        style: {
          stroke: isConnected ? '#6366f1' : '#374151',
          strokeWidth: isConnected ? 2.2 : 0.9,
          opacity: selectedNodeId ? (isConnected ? 1 : 0.05) : 0.3,
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

  }, [nodes, links, selectedNodeId, isFocusMode, fitView, setRfNodes, setRfEdges]);

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
