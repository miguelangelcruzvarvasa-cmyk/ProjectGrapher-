import React, { useState } from 'react';
import { useTopologyStore } from '../store/useTopologyStore';
import { Sparkles, Copy, Check, ShieldCheck, FileText, Download, Code2, Bot, Terminal } from 'lucide-react';

export const ShieldWorkbench: React.FC = () => {
  const { agentTask, setAgentTask, generateShield, shieldPack, repositories } = useTopologyStore();
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'agents_md' | 'cursorrules' | 'system_prompt' | 'json'>('agents_md');

  const handleGenerate = () => {
    generateShield();
  };

  const getFormattedContent = () => {
    if (!shieldPack) return '';
    if (format === 'cursorrules') {
      return `# .cursorrules - MULTI-REPO TOPOLOGY RULES\n\n${shieldPack.shieldPromptMarkdown}`;
    }
    if (format === 'system_prompt') {
      return `<SYSTEM_PROMPT>\n${shieldPack.shieldPromptMarkdown}\n</SYSTEM_PROMPT>`;
    }
    if (format === 'json') {
      return JSON.stringify(shieldPack, null, 2);
    }
    return shieldPack.shieldPromptMarkdown;
  };

  const handleCopy = () => {
    const text = getFormattedContent();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = () => {
    const text = getFormattedContent();
    if (!text) return;
    const filename = format === 'cursorrules' ? '.cursorrules' : format === 'json' ? 'agent-shield.json' : 'AGENTS.md';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-6">
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white font-display">Generador de Escudo de Gobernanza para Agentes IA</h3>
            <p className="text-xs text-gray-400">Define las tareas para tu agente de IA (Antigravity, Cursor, Claude, Devin) y genera reglas de blindaje multi-repo instantáneas.</p>
          </div>
        </div>

        <textarea
          rows={3}
          placeholder="Ej: Agregar el campo temperatura_molienda en el reporte del backend Laravel y actualizar el componente de Angular..."
          value={agentTask}
          onChange={(e) => setAgentTask(e.target.value)}
          className="w-full bg-gray-950 border border-gray-800 rounded-xl p-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors font-sans"
        />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-xs text-gray-400">
            Repositorios Auditados: <strong className="text-emerald-400 font-semibold">{repositories.length} repos activos</strong>
          </div>

          <button
            onClick={handleGenerate}
            disabled={repositories.length === 0}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-white font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" />
            Generar Escudo Multi-Repo
          </button>
        </div>
      </div>

      {/* Reporte Generado con Formatos */}
      {shieldPack && (
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-800/80 pb-4">
            <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2 uppercase tracking-wider font-display">
              <FileText className="w-4 h-4" /> Context Pack Listo para Inyectar
            </h4>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Formats Selector */}
              <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
                <button
                  onClick={() => setFormat('agents_md')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    format === 'agents_md' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Bot className="w-3 h-3" /> AGENTS.md
                </button>
                <button
                  onClick={() => setFormat('cursorrules')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    format === 'cursorrules' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Code2 className="w-3 h-3" /> .cursorrules
                </button>
                <button
                  onClick={() => setFormat('system_prompt')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                    format === 'system_prompt' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Terminal className="w-3 h-3" /> System Prompt
                </button>
              </div>

              {/* Action Buttons */}
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>

              <button
                onClick={handleDownloadFile}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" /> Descargar
              </button>
            </div>
          </div>

          <pre className="w-full max-h-[500px] overflow-y-auto bg-gray-950 p-4 rounded-xl text-xs font-mono text-gray-300 border border-gray-800/80 whitespace-pre-wrap leading-relaxed">
            {getFormattedContent()}
          </pre>
        </div>
      )}
    </div>
  );
};
