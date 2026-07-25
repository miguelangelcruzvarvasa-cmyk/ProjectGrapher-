import React, { useState } from 'react';
import { useTopologyStore } from '../store/useTopologyStore';
import { AlertTriangle, CheckCircle2, ShieldAlert, ArrowRight, Search, AlertOctagon, Info } from 'lucide-react';

export const ContractPanel: React.FC = () => {
  const { contractLinks } = useTopologyStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'mismatch' | 'orphan_frontend' | 'orphan_backend'>('all');

  const orphanFrontendCount = contractLinks.filter((l) => l.status === 'orphan_frontend').length;
  const orphanBackendCount = contractLinks.filter((l) => l.status === 'orphan_backend').length;
  const mismatchCount = contractLinks.filter((l) => l.status === 'mismatch').length;
  const validContractsCount = contractLinks.filter((l) => l.status === 'valid').length;

  const filteredLinks = contractLinks.filter((link) => {
    const matchesSearch = link.endpointUrl.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          link.details.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || link.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="w-full space-y-6">
      {/* Resumen de Auditoría */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusFilter('valid')}
          className="cursor-pointer bg-gray-900/80 hover:bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-4 transition-all"
        >
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-2xl font-bold text-white">{validContractsCount}</h4>
            <p className="text-xs text-gray-400">Contratos Validados</p>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('mismatch')}
          className="cursor-pointer bg-gray-900/80 hover:bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-4 transition-all"
        >
          <div className="p-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-2xl font-bold text-white">{mismatchCount}</h4>
            <p className="text-xs text-gray-400">Desajustes de Método</p>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('orphan_frontend')}
          className="cursor-pointer bg-gray-900/80 hover:bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-4 transition-all"
        >
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-2xl font-bold text-white">{orphanFrontendCount}</h4>
            <p className="text-xs text-gray-400">Llamadas Frontend Huérfanas</p>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('orphan_backend')}
          className="cursor-pointer bg-gray-900/80 hover:bg-gray-900 border border-gray-800 rounded-2xl p-4 flex items-center gap-4 transition-all"
        >
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-2xl font-bold text-white">{orphanBackendCount}</h4>
            <p className="text-xs text-gray-400">Endpoints Backend Huérfanos</p>
          </div>
        </div>
      </div>

      {/* Lista de Contratos Inter-Servicio con Buscador y Filtros */}
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
            <ShieldAlert className="w-5 h-5 text-emerald-400" />
            Auditoría de Contratos de API (Cross-Repo)
          </h3>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar ruta o endpoint..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Filter Pills */}
            <select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Todos los Estados</option>
              <option value="valid">Solo Validados</option>
              <option value="mismatch">Desajuste de Método</option>
              <option value="orphan_frontend">Huérfano Frontend</option>
              <option value="orphan_backend">Huérfano Backend</option>
            </select>
          </div>
        </div>

        {filteredLinks.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-8 text-center">No se encontraron contratos que coincidan con los filtros seleccionados.</p>
        ) : (
          <div className="space-y-3">
            {filteredLinks.map((link) => (
              <div
                key={link.id}
                className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition-all ${
                  link.status === 'valid'
                    ? 'bg-gray-950/60 border-gray-800 text-gray-200'
                    : link.status === 'mismatch'
                    ? 'bg-red-950/20 border-red-900/50 text-red-200'
                    : link.status === 'orphan_frontend'
                    ? 'bg-amber-950/20 border-amber-900/50 text-amber-200'
                    : 'bg-cyan-950/20 border-cyan-900/50 text-cyan-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${
                      link.status === 'valid' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                      link.status === 'mismatch' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                      link.status === 'orphan_frontend' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                      'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    }`}>
                      {link.status === 'valid' ? 'VALIDADO' : link.status === 'mismatch' ? 'DESAJUSTE MÉTODO' : link.status === 'orphan_frontend' ? 'HUÉRFANO FRONTEND' : 'SIN CONSUMIDOR'}
                    </span>
                    <span className="text-sm font-mono font-semibold text-white">{link.endpointUrl}</span>
                  </div>
                  <p className="text-xs text-gray-400">{link.details}</p>
                </div>

                <div className="flex items-center gap-2 text-xs font-mono text-gray-400 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800">
                  <span>{link.sourceRepoId}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{link.targetRepoId}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
