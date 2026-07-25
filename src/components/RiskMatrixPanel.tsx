import React from 'react';
import { useTopologyStore } from '../store/useTopologyStore';
import { ShieldAlert, AlertOctagon, AlertTriangle, Info, CheckCircle2, Layers } from 'lucide-react';

export const RiskMatrixPanel: React.FC = () => {
  const { contractLinks, repositories } = useTopologyStore();

  const mismatches = contractLinks.filter((l) => l.status === 'mismatch');
  const orphanFrontends = contractLinks.filter((l) => l.status === 'orphan_frontend');
  const orphanBackends = contractLinks.filter((l) => l.status === 'orphan_backend');
  const validContracts = contractLinks.filter((l) => l.status === 'valid');

  // Compute Risk Index (0 - 100%)
  const totalIssues = mismatches.length * 3 + orphanFrontends.length * 2 + orphanBackends.length * 1;
  const maxPossibleScore = Math.max(1, (contractLinks.length || 1) * 3);
  const riskIndexPercent = Math.min(100, Math.round((totalIssues / maxPossibleScore) * 100));

  const getRiskColor = (score: number) => {
    if (score > 60) return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', label: 'RIESGO ALTO' };
    if (score > 30) return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30', label: 'RIESGO MODERADO' };
    return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'SISTEMA ESTABLE' };
  };

  const riskInfo = getRiskColor(riskIndexPercent);

  return (
    <div className="w-full space-y-6">
      {/* Target Heatmap Score */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <div className="flex items-center gap-2 justify-center md:justify-start">
            <ShieldAlert className="w-6 h-6 text-emerald-400" />
            <h3 className="text-xl font-bold text-white tracking-tight font-display">Índice de Riesgo de Impacto Cross-Repo</h3>
          </div>
          <p className="text-xs text-gray-400 max-w-lg">
            Calculado evaluando discrepancias de métodos HTTP, llamadas huérfanas en el frontend y endpoints expuestos sin consumo.
          </p>
        </div>

        <div className={`p-6 rounded-2xl border ${riskInfo.bg} ${riskInfo.border} flex items-center gap-6 shadow-inner`}>
          <div className="text-center">
            <span className={`text-4xl font-extrabold ${riskInfo.text}`}>{riskIndexPercent}%</span>
            <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400 mt-1">Índice de Vulnerabilidad</p>
          </div>

          <div className="h-10 w-px bg-gray-800 hidden sm:block"></div>

          <div>
            <span className={`px-2.5 py-1 text-xs font-bold rounded-lg border ${riskInfo.bg} ${riskInfo.text} ${riskInfo.border}`}>
              {riskInfo.label}
            </span>
            <p className="text-xs text-gray-400 mt-2">{contractLinks.length} enlaces de contratos evaluados</p>
          </div>
        </div>
      </div>

      {/* Grid de Métricas de Vulnerabilidad */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xl font-bold text-white">{mismatches.length}</h4>
            <p className="text-xs text-gray-400">Desajustes de Método</p>
          </div>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xl font-bold text-white">{orphanFrontends.length}</h4>
            <p className="text-xs text-gray-400">Llamadas Frontend Huérfanas</p>
          </div>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xl font-bold text-white">{orphanBackends.length}</h4>
            <p className="text-xs text-gray-400">Endpoints Backend Huérfanos</p>
          </div>
        </div>

        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xl font-bold text-white">{validContracts.length}</h4>
            <p className="text-xs text-gray-400">Contratos Sincronizados</p>
          </div>
        </div>
      </div>

      {/* Desglose por Repositorio */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
          <Layers className="w-5 h-5 text-emerald-400" />
          Matriz de Estado por Repositorio
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repositories.map((repo) => {
            const repoLinks = contractLinks.filter((l) => l.sourceRepoId === repo.name || l.targetRepoId === repo.name);
            const repoMismatches = repoLinks.filter((l) => l.status === 'mismatch').length;
            const repoOrphans = repoLinks.filter((l) => l.status === 'orphan_frontend').length;

            return (
              <div key={repo.id} className="bg-gray-950/80 border border-gray-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: repo.color }} />
                    <h4 className="text-sm font-bold text-white">{repo.name}</h4>
                  </div>
                  <span className="text-xs text-gray-400 font-mono bg-gray-900 px-2 py-0.5 rounded border border-gray-800">
                    {repo.type.toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-900">
                  <span>Archivos: <strong className="text-white">{repo.fileCount}</strong></span>
                  <span>Conflictos: <strong className={repoMismatches + repoOrphans > 0 ? 'text-red-400' : 'text-emerald-400'}>{repoMismatches + repoOrphans}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
