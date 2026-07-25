import React from 'react';
import { useTopologyStore } from '../store/useTopologyStore';
import { FileCode, AlertTriangle, CheckCircle, HelpCircle, FileSearch, ShieldAlert } from 'lucide-react';

export const ContractPanel: React.FC = () => {
  const { contractLinks, endpoints, apiCalls } = useTopologyStore();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> Válido
          </span>
        );
      case 'mismatch':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Desajuste HTTP
          </span>
        );
      case 'orphan_frontend':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" /> Frontend Huérfano
          </span>
        );
      case 'orphan_backend':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
            <FileSearch className="w-3.5 h-3.5" /> Endpoint Sin Consumo
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col space-y-6">
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
              <ShieldAlert className="w-5 h-5 text-emerald-400" />
              Auditoría de Contratos de API Cross-Repo
            </h3>
            <p className="text-xs text-gray-400">
              Analiza la coincidencia entre los endpoints backend y las llamadas frontend detectadas.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="bg-gray-950 px-3 py-1.5 rounded-lg border border-gray-800 text-gray-300">
              Backend Endpoints: <strong className="text-emerald-400 font-mono">{endpoints.length}</strong>
            </span>
            <span className="bg-gray-950 px-3 py-1.5 rounded-lg border border-gray-800 text-gray-300">
              Frontend Calls: <strong className="text-blue-400 font-mono">{apiCalls.length}</strong>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-950/50">
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Endpoint / URL</th>
                <th className="py-3 px-4">Detalles del Contrato</th>
                <th className="py-3 px-4 text-right font-mono">Riesgo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60 text-xs">
              {contractLinks.map((link) => (
                <tr key={link.id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 px-4">{getStatusBadge(link.status)}</td>
                  <td className="py-3 px-4 font-mono text-emerald-300 font-medium">{link.endpointUrl}</td>
                  <td className="py-3 px-4 text-gray-300">{link.details}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      link.riskScore === 'critical' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                      link.riskScore === 'high' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                      'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    }`}>
                      {link.riskScore}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
