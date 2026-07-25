import React, { useState } from 'react';
import { useTopologyStore } from '../store/useTopologyStore';
import { Cpu, Copy, Check, Sparkles, Terminal } from 'lucide-react';

export const ShieldWorkbench: React.FC = () => {
  const { shieldPack, agentTask, setAgentTask, generateShield } = useTopologyStore();
  const [copied, setCopied] = useState(false);

  const handleCopyPrompt = () => {
    if (!shieldPack) return;
    navigator.clipboard.writeText(shieldPack.shieldPromptMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full flex-1 flex flex-col space-y-6">
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2 font-display">
              <Cpu className="w-5 h-5 text-emerald-400" />
              Generador de Agent Shield Pack (IA Prompting)
            </h3>
            <p className="text-xs text-gray-400">
              Inyecta estas reglas de gobernanza a tu asistente de IA (Cursor, Windsurf, Claude, Gemini) antes de asignarle tareas en tu arquitectura multi-repo.
            </p>
          </div>

          <button
            onClick={generateShield}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-gray-950 shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Sparkles className="w-4 h-4" /> Generar Shield Pack
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-300">
            Tarea o Refactorización Asignada al Agente IA:
          </label>
          <textarea
            rows={3}
            value={agentTask}
            onChange={(e) => setAgentTask(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-emerald-500 transition-colors"
            placeholder="Ejemplo: Modificar el DTO de respuesta del endpoint de autenticación y sincronizarlo en el frontend de React..."
          />
        </div>

        {shieldPack && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <Terminal className="w-4 h-4" /> Prompt de Gobernanza Generado
              </h4>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-all"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> ¡Copiado!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-gray-400" /> Copiar al Portapapeles
                  </>
                )}
              </button>
            </div>

            <pre className="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-xs font-mono text-gray-300 overflow-x-auto max-h-[500px] whitespace-pre-wrap leading-relaxed">
              {shieldPack.shieldPromptMarkdown}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
