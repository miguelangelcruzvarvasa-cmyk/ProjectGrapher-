import React, { useRef, useState } from 'react';
import { useTopologyStore } from '../store/useTopologyStore';
import { FolderPlus, Layers, Trash2, Cpu, CheckCircle2, ShieldCheck, Loader2, Search, X } from 'lucide-react';
import type { Repository } from '../types/topology';
import { TOPOLOGY_ANALYSIS_RULES } from '../config/rules';
import { pickProjectDirectory, supportsDirectoryPicker } from '../utils/directoryScan';

export const MultiRepoDropzone: React.FC = () => {
  const { repositories, addRepositoryFiles, removeRepository, updateRepoType, clearWorkspace, isScanning } = useTopologyStore();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [filterTerm, setFilterTerm] = useState('');
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  const handleAddRepository = async () => {
    if (supportsDirectoryPicker()) {
      setIsPickingFolder(true);
      try {
        const picked = await pickProjectDirectory(TOPOLOGY_ANALYSIS_RULES.ignoredDirectories);
        if (picked) await addRepositoryFiles(picked.rootName, picked.files);
      } finally {
        setIsPickingFolder(false);
      }
      return;
    }
    folderInputRef.current?.click();
  };

  const isBusy = isScanning || isPickingFolder;

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const firstFile = files[0];
    const relativePath = (firstFile as any)?.webkitRelativePath as string | undefined;
    const repoName = relativePath?.split('/')[0] || `Repo_${Date.now()}`;

    await addRepositoryFiles(repoName, files);

    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const filteredRepos = repositories.filter((r) =>
    r.name.toLowerCase().includes(filterTerm.toLowerCase()) ||
    r.type.toLowerCase().includes(filterTerm.toLowerCase())
  );

  return (
    <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-2xl space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2 font-display">
            <Layers className="w-5 h-5 text-emerald-400" />
            Entorno de Repositorios Auditados ({repositories.length})
          </h3>
          <p className="text-xs text-gray-400">
            Agrega directorios locales (Frontend, Backend, DB, Microservicios) para analizar sus conexiones e inferir contratos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {repositories.length > 5 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filtrar repositorios..."
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                className="bg-gray-950 border border-gray-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 w-44"
              />
              {filterTerm && (
                <button
                  onClick={() => setFilterTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFolderSelect}
            // @ts-ignore
            webkitdirectory="true"
            directory="true"
            multiple
            className="hidden"
          />

          <button
            disabled={isBusy}
            onClick={() => void handleAddRepository()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-gray-950 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
          >
            {isBusy ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> {isPickingFolder && !isScanning ? 'Leyendo carpeta...' : 'Escaneando Contratos...'}
              </>
            ) : (
              <>
                <FolderPlus className="w-4 h-4" /> Agregar Repositorio
              </>
            )}
          </button>

          {repositories.length > 0 && (
            <button
              onClick={clearWorkspace}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-gray-950 hover:bg-rose-950/40 text-gray-400 hover:text-rose-300 border border-gray-800 hover:border-rose-900/50 transition-colors flex items-center gap-1.5"
              title="Limpiar todos los repositorios auditados"
            >
              <Trash2 className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
        </div>
      </div>

      {repositories.length > 0 && (
        <div className="max-h-[340px] overflow-y-auto pr-1.5 space-y-2 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-950">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {filteredRepos.map((repo) => (
              <div
                key={repo.id}
                className="bg-gray-950/80 border border-gray-800/80 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-emerald-500/50 transition-all group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                    style={{ backgroundColor: repo.color }}
                  />
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-gray-100 truncate font-mono">{repo.name}</h4>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {repo.fileCount} archivos auditados
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    value={repo.type}
                    onChange={(e) => updateRepoType(repo.id, e.target.value as Repository['type'])}
                    className="bg-gray-900 border border-gray-800 text-[11px] text-gray-300 font-semibold rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="frontend">Frontend</option>
                    <option value="backend">Backend</option>
                    <option value="database">Database</option>
                    <option value="microservice">Microservice</option>
                    <option value="library">Library</option>
                  </select>

                  <button
                    onClick={() => removeRepository(repo.id)}
                    className="p-1 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                    title="Eliminar repositorio"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredRepos.length === 0 && filterTerm && (
            <p className="text-xs text-gray-500 italic py-4 text-center">
              No se encontraron repositorios con "{filterTerm}"
            </p>
          )}
        </div>
      )}
    </div>
  );
};
