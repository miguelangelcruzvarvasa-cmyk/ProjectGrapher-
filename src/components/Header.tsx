import React from 'react';
import { useTopologyStore } from '../store/useTopologyStore';
import { Shield, Layers, FileCode, AlertTriangle, Cpu, Play, Download, Trash2 } from 'lucide-react';

export const Header: React.FC = () => {
  const { activeTab, setActiveTab, repositories, loadDemoData, generateShield, clearWorkspace, exportTopologyJson } = useTopologyStore();

  const handleExport = () => {
    const json = exportTopologyJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent_topology_${Date.now()}.json`;
    a.click();
  };

  return (
    <header className="w-full bg-gray-900 border-b border-gray-800 py-3.5 px-6 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50 backdrop-blur-lg bg-gray-900/90 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-black text-white tracking-tight font-display flex items-center gap-2">
            Agent Topology Shield
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-normal">
              v1.0 Pro
            </span>
          </h1>
          <p className="text-xs text-gray-400">Gobernanza de Contratos y Topología Multi-Repositorio para Agentes IA</p>
        </div>
      </div>

      <nav className="flex items-center gap-1.5 bg-gray-950 p-1 rounded-xl border border-gray-800">
        <button
          onClick={() => setActiveTab('topology')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'topology' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Topología
        </button>

        <button
          onClick={() => setActiveTab('contracts')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'contracts' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" /> Contratos API
        </button>

        <button
          onClick={() => setActiveTab('risk')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'risk' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Matriz de Riesgo
        </button>

        <button
          onClick={() => {
            generateShield();
            setActiveTab('shield');
          }}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'shield' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" /> Shield Pack (IA)
        </button>
      </nav>

      <div className="flex items-center gap-2">
        {repositories.length === 0 ? (
          <button
            onClick={loadDemoData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-all"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" /> Cargar Demo
          </button>
        ) : (
          <>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-all"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" /> Exportar JSON
            </button>
            <button
              onClick={clearWorkspace}
              className="p-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-rose-900/40 text-gray-400 hover:text-rose-300 border border-gray-700 transition-all"
              title="Limpiar espacio de trabajo"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
};
