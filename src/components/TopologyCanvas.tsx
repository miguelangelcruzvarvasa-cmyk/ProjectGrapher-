import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTopologyStore } from '../store/useTopologyStore';
import { Globe, Server, Database, Cpu, Layers, FolderTree, LayoutGrid } from 'lucide-react';
import { FolderNode } from './graph/FolderNode';

const CustomRepoNode = ({ data }: any) => {
  const getIcon = () => {
    if (data.type === 'frontend') return <Globe className="w-5 h-5 text-blue-400" />;
    if (data.type === 'backend') return <Server className="w-5 h-5 text-emerald-400" />;
    if (data.type === 'database') return <Database className="w-5 h-5 text-amber-400" />;
    return <Cpu className="w-5 h-5 text-purple-400" />;
  };

  return (
    <div className="bg-gray-900/95 border border-gray-700 hover:border-emerald-500/80 rounded-2xl p-4 shadow-2xl min-w-[220px] text-white transition-all backdrop-blur-md group">
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-gray-900" />
      
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gray-950 border border-gray-800 group-hover:border-emerald-500/50 transition-colors">
          {getIcon()}
        </div>
        <div>
          <h4 className="text-sm font-bold text-white tracking-tight font-display">{data.label}</h4>
          <span className="text-[10px] font-mono text-gray-400 bg-gray-950 px-2 py-0.5 rounded border border-gray-800 uppercase tracking-wider">
            {data.type} &bull; {data.fileCount || 0} archivos
          </span>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-emerald-400 !border-2 !border-gray-900" />
    </div>
  );
};

export const TopologyCanvas: React.FC = () => {
  const { repositories, contractLinks, files } = useTopologyStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [viewMode, setViewMode] = useState<'macro' | 'micro'>('macro');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const handleToggleFolder = useCallback((folderPath: string) => {
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

  const nodeTypes = useMemo(() => ({
    repoNode: CustomRepoNode,
    folderNode: FolderNode,
  }), []);

  useEffect(() => {
    if (repositories.length === 0) return;

    if (viewMode === 'macro') {
      const getRepoNodeId = (idOrName: string) => {
        const found = repositories.find((r) => r.id === idOrName || r.name === idOrName);
        return found ? found.id : idOrName;
      };

      const flowNodes = repositories.map((repo, i) => {
        const radius = 280;
        const angle = (i * 2 * Math.PI) / repositories.length - Math.PI / 2;
        const x = 500 + radius * Math.cos(angle);
        const y = 300 + radius * Math.sin(angle);

        return {
          id: repo.id,
          type: 'repoNode',
          position: { x, y },
          data: {
            label: repo.name,
            type: repo.type,
            fileCount: repo.fileCount
          }
        };
      });

      const flowEdges = contractLinks
        .filter((link) => link.sourceRepoId !== 'unknown' && link.targetRepoId !== 'unknown')
        .map((link) => {
          const isMismatch = link.status === 'mismatch';
          const sourceId = getRepoNodeId(link.sourceRepoId);
          const targetId = getRepoNodeId(link.targetRepoId);

          return {
            id: link.id,
            source: sourceId,
            target: targetId,
            animated: true,
            style: {
              stroke: isMismatch ? '#f43f5e' : '#10b981',
              strokeWidth: isMismatch ? 3 : 2
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isMismatch ? '#f43f5e' : '#10b981'
            },
            label: isMismatch ? '⛔ DESAJUSTE HTTP' : '✅ CONTRATO VÁLIDO',
            labelStyle: { fill: isMismatch ? '#f43f5e' : '#10b981', fontWeight: 700, fontSize: 10 },
            labelBgStyle: { fill: '#030712', fillOpacity: 0.95, rx: 6, ry: 6 }
          };
        });

      if (flowEdges.length === 0 && repositories.length > 1) {
        for (let i = 0; i < repositories.length - 1; i++) {
          flowEdges.push({
            id: `struct_edge_${i}`,
            source: repositories[i].id,
            target: repositories[i + 1].id,
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4,4' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
            label: '🔗 TOPOLOGÍA ENTORNO',
            labelStyle: { fill: '#3b82f6', fontWeight: 600, fontSize: 9 },
            labelBgStyle: { fill: '#030712', fillOpacity: 0.9, rx: 4, ry: 4 }
          } as any);
        }
      }

      setNodes(flowNodes as any);
      setEdges(flowEdges as any);
    } else {
      const folderGroups = new Map<string, typeof files>();
      files.forEach((f) => {
        const parts = f.path.split('/').filter(Boolean);
        const folderPath = parts.length > 1 ? `${f.repoName}/${parts.slice(0, Math.min(2, parts.length - 1)).join('/')}` : f.repoName;
        if (!folderGroups.has(folderPath)) {
          folderGroups.set(folderPath, []);
        }
        folderGroups.get(folderPath)!.push(f);
      });

      const folderNodesArr: any[] = [];
      let idx = 0;

      folderGroups.forEach((groupFiles, folderPath) => {
        const folderName = folderPath.split('/').slice(-1)[0] || folderPath;
        const cols = Math.ceil(Math.sqrt(folderGroups.size));
        const row = Math.floor(idx / cols);
        const col = idx % cols;

        folderNodesArr.push({
          id: `folder:${folderPath}`,
          type: 'folderNode',
          position: { x: col * 260 + 100, y: row * 160 + 100 },
          data: {
            folderPath,
            folderName,
            fileCount: groupFiles.length,
            isExpanded: expandedFolders.has(folderPath),
            isSelected: false,
            isDimmed: false,
            onToggleExpand: handleToggleFolder
          }
        });
        idx++;
      });

      setNodes(folderNodesArr);
      setEdges([]);
    }
  }, [repositories, contractLinks, files, viewMode, expandedFolders, handleToggleFolder, setNodes, setEdges]);

  return (
    <div className="w-full flex-1 flex flex-col space-y-4">
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex-1 flex flex-col space-y-4 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
              <Layers className="w-5 h-5 text-emerald-400" />
              Lienzo Interactivo de Topología Multi-Repo
            </h3>
            <p className="text-xs text-gray-400">
              Examina la arquitectura de repositorios, contratos de API e inspecciona carpetas sin congelamientos.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-gray-950 p-1 rounded-xl border border-gray-800 flex items-center gap-1">
              <button
                onClick={() => setViewMode('macro')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'macro'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Topología Repos (Macro)
              </button>
              <button
                onClick={() => setViewMode('micro')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'micro'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" /> Carpetas / Código (Micro)
              </button>
            </div>

            <div className="hidden lg:flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Frontend</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Backend</div>
              <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Microservice</div>
            </div>
          </div>
        </div>

        <div
          style={{ width: '100%', height: 'calc(100vh - 280px)', minHeight: '600px' }}
          className="bg-gray-950 rounded-xl border border-gray-800/80 overflow-hidden relative shadow-inner"
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            attributionPosition="bottom-right"
            className="bg-gray-950"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="#374151" />
            <Controls className="!bg-gray-900 !border-gray-800 !text-white !rounded-xl overflow-hidden shadow-xl" />
            <MiniMap
              nodeColor={(n: any) => {
                if (n.data?.type === 'frontend') return '#3b82f6';
                if (n.data?.type === 'backend') return '#10b981';
                if (n.data?.type === 'database') return '#f59e0b';
                return '#8b5cf6';
              }}
              maskColor="rgba(3, 7, 18, 0.8)"
              className="!bg-gray-950 !border-gray-800 !rounded-xl overflow-hidden shadow-xl"
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
};
