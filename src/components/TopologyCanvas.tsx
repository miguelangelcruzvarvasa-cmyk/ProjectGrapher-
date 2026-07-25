import React, { useEffect, useMemo } from 'react';
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
import { Globe, Server, Database, Cpu, Layers } from 'lucide-react';

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
  const { repositories, contractLinks } = useTopologyStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const nodeTypes = useMemo(() => ({
    repoNode: CustomRepoNode
  }), []);

  useEffect(() => {
    if (repositories.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const getRepoNodeId = (idOrName: string) => {
      const found = repositories.find((r) => r.id === idOrName || r.name === idOrName);
      return found ? found.id : idOrName;
    };

    const flowNodes = repositories.map((repo, i) => {
      const radius = Math.max(180, repositories.length * 60);
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
  }, [repositories, contractLinks, setNodes, setEdges]);

  return (
    <div className="w-full flex-1 flex flex-col space-y-4">
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex-1 flex flex-col space-y-4 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
              <Layers className="w-5 h-5 text-emerald-400" />
              Topología de Repositorios Auditados
            </h3>
            <p className="text-xs text-gray-400">
              Visualiza los repositorios de tu entorno y sus enlaces de contrato inter-servicio.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Frontend</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Backend</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Database</div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Microservice</div>
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
