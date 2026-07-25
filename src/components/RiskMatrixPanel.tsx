import React from 'react';
import { useTopologyStore } from '../store/useTopologyStore';
import { AlertOctagon, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';

export const RiskMatrixPanel: React.FC = () => {
  const { contractLinks, repositories } = useTopologyStore();

  const criticalRisks = contractLinks.filter((l) => l.riskScore === 'critical');
  const highRisks = contractLinks.filter((l) => l.riskScore === 'high');
  const mediumRisks = contractLinks.filter((l) => l.riskScore === 'medium');
  const lowRisks = contractLinks.filter((l) => l.riskScore === 'low');

  return (
    <div className="w-full flex-1 flex flex-col space-y-6">
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-6">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
            <AlertOctagon className="w-5 h-5 text-rose-400" />
            Matriz de Riesgo Cross-Repo & Gobernanza
          </h3>
          <p className="text-xs text-gray-400">
            Resumen cualitativo y cuantitativo de discrepancias entre repositorios para prevenir fallos en producción al delegar tareas a agentes IA.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Riesgo Crítico</span>
              <h4 className="text-2xl font-black text-rose-400 font-mono">{criticalRisks.length}</h4>
            </div>
            <ShieldAlert className="w-8 h-8 text-rose-500/60" />
          </div>

          <div className="bg-amber-950/40 border border-amber-900/60 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Riesgo Alto</span>
              <h4 className="text-2xl font-black text-amber-400 font-mono">{highRisks.length}</h4>
            </div>
            <AlertTriangle className="w-8 h-8 text-amber-500/60" />
          </div>

          <div className="bg-blue-950/40 border border-blue-900/60 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Riesgo Medio</span>
              <h4 className="text-2xl font-black text-blue-400 font-mono">{mediumRisks.length}</h4>
            </div>
            <AlertTriangle className="w-8 h-8 text-blue-500/60" />
          </div>

          <div className="bg-emerald-950/40 border border-emerald-900/60 rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Sincronizados</span>
              <h4 className="text-2xl font-black text-emerald-400 font-mono">{lowRisks.length}</h4>
            </div>
            <ShieldCheck className="w-8 h-8 text-emerald-500/60" />
          </div>
        </div>

        {criticalRisks.length > 0 && (
          <div className="bg-rose-950/20 border border-rose-900/40 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
              <AlertOctagon className="w-4 h-4" /> Desajustes Críticos que Bloquearán a la IA
            </h4>
            <ul className="space-y-2 text-xs">
              {criticalRisks.map((risk) => (
                <li key={risk.id} className="bg-gray-950 p-3 rounded-lg border border-rose-900/30 text-gray-200">
                  {risk.details}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
