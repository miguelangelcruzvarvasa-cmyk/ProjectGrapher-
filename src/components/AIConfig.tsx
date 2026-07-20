import React, { useEffect, useState } from 'react';
import { Info, Check, Save, ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { motion } from 'motion/react';
import { DEFAULT_AI_MODELS } from '../config/aiDefaults';
import { AI_PROVIDER_DICTIONARY, AI_PROVIDER_INPUTS, AI_PROVIDER_OPTIONS } from '../config/aiProviders';

export const AIConfig: React.FC = () => {
  const {
    aiProvider, aiModel, customUrl, customKey, envKeys, envKeyDetails,
    useDeepAnalysis,
    setAiProvider, setAiModel, setCustomUrl, setCustomKey, setUseDeepAnalysis, checkEnvKeys
  } = useProjectStore();

  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    void checkEnvKeys();
  }, []);

  const modelMap: Record<string, string> = DEFAULT_AI_MODELS;

  const handleSave = async () => {
    await checkEnvKeys();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const isEnvActive = envKeys[aiProvider] || false;
  const isSessionOverrideActive = customKey.trim().length > 0;
  const providerDetails = envKeyDetails[aiProvider];
  const envLabel = providerDetails?.envVar || `${aiProvider.toUpperCase()}_API_KEY`;
  const currentProviderName = AI_PROVIDER_DICTIONARY[aiProvider as keyof typeof AI_PROVIDER_DICTIONARY]?.shortLabel || aiProvider;

  return (
    <div className="space-y-6">
      <div className="space-y-4 bg-brand-bg/50 border border-gray-800 p-6 rounded-3xl relative overflow-hidden">
        <div>
          <div className="flex justify-between items-center mb-2 gap-3">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Proveedor</label>
            <div className="flex items-center gap-2">
              {aiProvider !== 'custom' && (
                <div className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter",
                  isEnvActive ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                )}>
                  {isEnvActive ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                  {isEnvActive ? "Llave en Servidor" : "Sin Llave en Servidor"}
                </div>
              )}
              {isSessionOverrideActive && aiProvider !== 'ollama' && (
                <div className="flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-tighter text-sky-300">
                  Override de sesion
                </div>
              )}
              <button
                type="button"
                onClick={() => void checkEnvKeys()}
                className="inline-flex items-center gap-1 rounded-full border border-gray-700 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
                title="Volver a consultar variables del servidor"
              >
                <RefreshCw className="h-3 w-3" />
                Refrescar
              </button>
            </div>
          </div>
          <select 
            value={aiProvider}
            onChange={(e) => {
              const p = e.target.value as any;
              setAiProvider(p);
              if (modelMap[p]) setAiModel(modelMap[p]);
              void checkEnvKeys();
            }}
            className="w-full bg-brand-bg border border-gray-700 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary transition-all"
          >
            {AI_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Modelo</label>
          <input 
            type="text"
            value={aiModel}
            onChange={(e) => setAiModel(e.target.value)}
            placeholder="Nombre del modelo..."
            className="w-full bg-brand-bg border border-gray-700 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary font-mono"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">API Key / Token (Opcional)</label>
          <input 
            type="password"
            value={customKey}
            onChange={(e) => setCustomKey(e.target.value)}
            placeholder={isEnvActive ? "••••••••••••••••" : AI_PROVIDER_INPUTS.keyPlaceholder}
            className="w-full bg-brand-bg border border-gray-700 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary font-mono"
          />
          <p className="text-[9px] text-gray-500 mt-2 italic">
            {isEnvActive 
              ? `Ya existe una llave de ${currentProviderName} en el servidor (.env). Puedes usarla tal cual, o escribir otra aquí para darle prioridad solo en esta sesión de ${currentProviderName}.` 
              : "No se detectó llave en el servidor. Debes proporcionarla aquí."}
          </p>
          {isSessionOverrideActive && aiProvider !== 'ollama' && (
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2">
              <p className="text-[10px] leading-relaxed text-sky-200">
                Esta sesion esta enviando una llave manual para <strong>{currentProviderName}</strong>. Esa llave tiene prioridad sobre el `.env`.
              </p>
              <button
                type="button"
                onClick={() => setCustomKey('')}
                className="shrink-0 rounded-lg border border-sky-400/30 px-2 py-1 text-[10px] font-bold text-sky-100 transition-colors hover:bg-sky-400/10"
              >
                Usar llave del servidor
              </button>
            </div>
          )}
          {aiProvider !== 'custom' && aiProvider !== 'ollama' && (
            <p className="text-[9px] text-gray-500 mt-1">
              Variable monitoreada: <span className="font-mono text-gray-300">{envLabel}</span>
            </p>
          )}
          {isEnvActive && aiProvider === 'groq' && (
            <p className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] leading-relaxed text-emerald-300">
              Groq ya est&aacute; disponible desde el servidor. Si dejas este campo vac&iacute;o, la app usar&aacute; la llave del `.env` con el modelo configurado arriba.
            </p>
          )}
        </div>

        {aiProvider === 'custom' && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Endpoint URL</label>
            <input 
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder={AI_PROVIDER_INPUTS.customUrlPlaceholder}
              className="w-full bg-brand-bg border border-gray-700 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary font-mono"
            />
          </motion.div>
        )}

        <div className="pt-2">
           <button
            onClick={handleSave}
            className="w-full py-3 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
           >
            {isSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isSaved ? "Configuración Aplicada" : "Guardar Configuración"}
           </button>
        </div>
      </div>

      <div className="bg-brand-primary/5 border border-brand-primary/20 p-4 rounded-2xl flex gap-3">
         <Info className="w-5 h-5 text-brand-primary shrink-0" />
         <div className="space-y-1">
            <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider block">Nota de Seguridad</span>
            <p className="text-[10px] text-gray-400 leading-tight">
               Las llaves configuradas aquí tienen prioridad sobre las del archivo .env del servidor. No se almacenan en bases de datos externas.
            </p>
         </div>
      </div>

      <div className="space-y-4 rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-6">
        <div className="space-y-2">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-cyan-400">Motor de Análisis</span>
          <h4 className="text-sm font-bold text-white">Análisis profundo con backend Python</h4>
          <p className="text-[11px] leading-relaxed text-gray-400">
            Activa el refinamiento por backend después del grafo rápido del navegador. Mejora la detección de dependencias, pero tarda más y necesita que `main.py` esté corriendo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setUseDeepAnalysis(!useDeepAnalysis)}
          className={cn(
            "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all",
            useDeepAnalysis
              ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
              : "border-gray-700 bg-brand-bg/70 text-gray-300"
          )}
        >
          <div>
            <div className="text-sm font-bold">{useDeepAnalysis ? 'Activado' : 'Desactivado'}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">
              {useDeepAnalysis ? 'Grafo refinado por backend' : 'Solo análisis local del navegador'}
            </div>
          </div>
          <div
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest",
              useDeepAnalysis ? "bg-cyan-400 text-black" : "bg-gray-800 text-gray-400"
            )}
          >
            {useDeepAnalysis ? 'On' : 'Off'}
          </div>
        </button>
      </div>
    </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
