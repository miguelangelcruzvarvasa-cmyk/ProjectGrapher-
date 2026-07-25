import React from 'react';
import { Shield, Lock, Layers, RefreshCw, Sparkles, Activity, Download, Trash2, FolderGit2 } from 'lucide-react';
import { useTopologyStore } from '../store/useTopologyStore';

interface HeaderProps {
  appMode?: 'multi_repo_shield' | 'single_repo';
  setAppMode?: (mode: 'multi_repo_shield' | 'single_repo') => void;
}

export const Header: React.FC<HeaderProps> = ({ appMode = 'multi_repo_shield', setAppMode }) => {
  const { repositories, clearWorkspace, activeTab, setActiveTab, exportTopologyJson, loadDemoData } = useTopologyStore();

  const handleExportJson = () => {
    const jsonStr = exportTopologyJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topology-shield-contracts-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="w-full border-b border-gray-800/80 bg-gray-950/90 backdrop-blur-md px-4 sm:px-6 py-3.5 sticky top-0 z-50 transition-all">
      <div className="w-full flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Logo & Brand */}
        <div className="flex items-center gap-3.5 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 text-white shadow-lg shadow-emerald-500/20 shrink-0">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight font-display">
                  ProjectGrapher <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">Topology Shield</span>
                </h1>
                <span className="hidden sm:flex px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 items-center gap-1">
                  <Lock className="w-3 h-3" /> 100% LOCAL
                </span>
              </div>
              <p className="text-xs text-gray-400">Gobernanza de Topología Multi-Repositorio y Contratos de API</p>
            </div>
          </div>

          {/* Mode Switcher Pill */}
          {setAppMode && (
            <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-xl border border-gray-800 ml-2">
              <button
                onClick={() => setAppMode('multi_repo_shield')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  appMode === 'multi_repo_shield'
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-gray-950 shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" /> Topología Multi-Repo
              </button>
              <button
                onClick={() => setAppMode('single_repo')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  appMode === 'single_repo'
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-gray-950 shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <FolderGit2 className="w-3.5 h-3.5" /> Monorepo / Archivos
              </button>
            </div>
          )}
        </div>

        {/* Navigation Tabs (Topología Multi-Repo) */}
        {appMode === 'multi_repo_shield' && (
          <div className="w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            <div className="flex items-center gap-1 bg-gray-900/90 p-1.5 rounded-xl border border-gray-800/80 min-w-max">
              <button
                onClick={() => setActiveTab('topology')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'topology'
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Topología ({repositories.length})
              </button>

              <button
                onClick={() => setActiveTab('contracts')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'contracts'
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Auditoría de Contratos
              </button>

              <button
                onClick={() => setActiveTab('risk')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'risk'
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" /> Matriz de Riesgo
              </button>

              <button
                onClick={() => setActiveTab('shield')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
                  activeTab === 'shield'
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Agent Shield Pack
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {appMode === 'multi_repo_shield' && (
          <div className="hidden md:flex items-center gap-2 shrink-0">
            {repositories.length === 0 ? (
              <button
                onClick={loadDemoData}
                className="px-3.5 py-1.5 text-xs font-medium text-emerald-300 hover:text-white transition-all border border-emerald-500/30 hover:border-emerald-500/60 rounded-xl bg-emerald-500/10 flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Cargar Demo Multi-Repo
              </button>
            ) : (
              <>
                <button
                  onClick={handleExportJson}
                  title="Exportar JSON de Topología"
                  className="px-3.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white transition-all border border-gray-800 hover:border-emerald-500/40 rounded-xl bg-gray-900 flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" /> Exportar JSON
                </button>

                <button
                  onClick={clearWorkspace}
                  title="Limpiar Espacio"
                  className="px-3.5 py-1.5 text-xs font-medium text-gray-400 hover:text-red-400 transition-all border border-gray-800 hover:border-red-900/40 rounded-xl bg-gray-900/50 flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Limpiar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
