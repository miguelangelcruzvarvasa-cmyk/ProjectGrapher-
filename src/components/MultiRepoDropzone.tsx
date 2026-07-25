import React, { useRef } from 'react';
import { useTopologyStore } from '../store/useTopologyStore';
import { FolderPlus, Layers, Trash2, Cpu, CheckCircle2, ShieldCheck, Loader2 } from 'lucide-react';
import type { Repository } from '../types/topology';

export const MultiRepoDropzone: React.FC = () => {
  const { repositories, addRepositoryFiles, removeRepository, updateRepoType, isScanning } = useTopologyStore();
  const folderInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-5 shadow-2xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2 font-display">
            <Layers className="w-5 h-5 text-emerald-400" />
            Entorno de Repositorios Auditados ({repositories.length})
          </h3>
          <p className="text-xs text-gray-400">
            Agrega directorios locales (Frontend, Backend, DB, Microservicios) para analizar sus conexiones e inferir contratos.
          </p>
        </div>

        <div>
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
            disabled={isScanning}
            onClick={() => folderInputRef.current?.click()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-gray-950 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Escaneando Contratos...
              </>
            ) : (
              <>
                <FolderPlus className="w-4 h-4" /> Agregar Repositorio
              </>
            )}
          </button>
        </div>
      </div>

      {repositories.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {repositories.map((repo) => (
            <div
              key={repo.id}
              className="bg-gray-950/80 border border-gray-800/80 rounded-xl p-3.5 flex items-center justify-between gap-3 hover:border-emerald-500/50 transition-all group"
            >
              <div className="flex items-center gap-3 min-w-0">
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

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={repo.type}
                  onChange={(e) => updateRepoType(repo.id, e.target.value as Repository['type'])}
                  className="bg-gray-900 border border-gray-800 text-[11px] text-gray-300 font-semibold rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500"
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
      )}
    </div>
  );
};
