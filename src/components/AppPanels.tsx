import React from 'react';
import { AlertCircle, ChevronRight, Code2, Database, Loader2, Network, Sparkles, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import { AIConfig } from './AIConfig';
import { Modal } from './Modal';
import { GraphNode } from '../types';
import { ProcessingProgress } from '../store/projectStore.types';

type EmptyProjectStateProps = {
  cn: (...inputs: any[]) => string;
  isProcessing: boolean;
  processingProgress: ProcessingProgress;
  onProcessFiles: (files: FileList) => void;
};

const PROCESSING_STAGE_LABELS: Record<ProcessingProgress['stage'], string> = {
  idle: 'En espera',
  scanning: 'Escaneando estructura',
  reading: 'Leyendo archivos',
  graph: 'Construyendo grafo',
  persisting: 'Guardando snapshot',
  'deep-analysis': 'Refinando arquitectura'
};

export function EmptyProjectState({
  cn,
  isProcessing,
  processingProgress,
  onProcessFiles
}: EmptyProjectStateProps) {
  const progressPercent = Math.min(100, Math.max(6, Math.round((processingProgress.ratio || 0) * 100)));
  const progressStageLabel = PROCESSING_STAGE_LABELS[processingProgress.stage] || 'Procesando';

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-bg p-4 sm:p-6">
      <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-brand-primary/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-brand-secondary/10 blur-[120px]" />

      {isProcessing && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-brand-bg/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] border border-brand-primary/20 bg-[#07101d]/95 p-6 text-left shadow-[0_30px_100px_rgba(0,0,0,0.45)] sm:p-7">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-brand-primary/25 bg-brand-primary/10 p-3">
                <Loader2 className="h-7 w-7 animate-spin text-brand-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-brand-primary">Motor Local Activo</div>
                <h2 className="mt-2 text-2xl font-bold text-white">Analizando proyecto...</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-300">
                  {processingProgress.message || 'Procesando estructura, dependencias y contexto del proyecto.'}
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.18em]">
                <span className="font-black text-cyan-300">{progressStageLabel}</span>
                <span className="font-mono text-gray-400">{progressPercent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full border border-white/8 bg-black/35">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-primary via-cyan-400 to-brand-secondary transition-all duration-200 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>{progressStageLabel}</span>
                <span className="font-mono">{processingProgress.current.toLocaleString()} / {processingProgress.total.toLocaleString()}</span>
              </div>
              {processingProgress.total > 0 && (
                <div className="flex items-center justify-between gap-3 text-xs text-gray-400">
                  <span className="font-mono">{processingProgress.current.toLocaleString()} / {processingProgress.total.toLocaleString()} archivos</span>
                  <span className="text-gray-500">{progressPercent}% completado</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-3xl text-center"
      >
        <div className="mb-12 inline-block relative">
          <div className="absolute -inset-4 bg-brand-primary/20 blur-xl rounded-full animate-pulse" />
          <Network className="h-16 w-16 text-brand-primary animate-float sm:h-20 sm:w-20 lg:h-24 lg:w-24" strokeWidth={1} />
          <div className="absolute -bottom-2 -right-2 rounded-2xl border border-gray-800 bg-brand-surface p-2 shadow-2xl sm:p-3">
            <Code2 className="h-6 w-6 text-brand-secondary sm:h-8 sm:w-8" />
          </div>
        </div>

        <h1 className="mb-6 text-4xl font-bold tracking-tight text-white font-display sm:text-5xl lg:text-6xl">
          ProjectGrapher <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-secondary">AI</span>
        </h1>

        <p className="mx-auto mb-6 max-w-2xl text-base leading-relaxed text-gray-400 font-sans sm:text-lg lg:text-xl">
          Convierte tu proyecto en contexto arquitectónico utilizable antes de pedirle algo a una IA. La meta no es mandar el repo completo: es darle al agente una lectura más corta, más precisa y con menos desperdicio de tokens.
        </p>

        <div className="mx-auto mb-10 grid max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-3 lg:mb-12">
          <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-primary">Estructura</div>
            <div className="mt-2 text-sm text-gray-300">Cuenta archivos, dibuja relaciones y ubica hotspots reales del proyecto.</div>
          </div>
          <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-secondary">Prioridad</div>
            <div className="mt-2 text-sm text-gray-300">Te dice qué revisar primero, qué puede romperse y qué contexto exportar.</div>
          </div>
          <div className="rounded-2xl border border-white/6 bg-black/20 px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">Handoff</div>
            <div className="mt-2 text-sm text-gray-300">Genera snapshots, task packs y artefactos listos para otra sesión o para otro agente.</div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6">
          <div className="relative max-w-sm group w-full">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500" />
            <label
              className={cn(
                'relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all duration-300 sm:p-10 lg:p-12',
                'bg-brand-surface/50 border-gray-800 hover:border-brand-primary/50 hover:bg-brand-surface/80',
                isProcessing && 'pointer-events-none'
              )}
            >
              {isProcessing ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
                  <p className="text-lg font-medium text-white">Indexando Carpeta...</p>
                  <div className="flex items-center gap-2 px-3 py-1 bg-brand-primary/10 border border-brand-primary/20 rounded-full">
                    <Database className="w-3 h-3 text-brand-primary" />
                    <span className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">Motor Local Activo (Sin IA)</span>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-500 mb-4 group-hover:text-brand-primary transition-colors" />
                  <p className="mb-2 text-base font-medium text-white sm:text-lg">Seleccionar Carpeta</p>
                  <input
                    type="file"
                    className="hidden"
                    // @ts-ignore
                    webkitdirectory="true"
                    directory="true"
                    multiple
                    onChange={(e) => e.target.files && onProcessFiles(e.target.files)}
                  />
                </>
              )}
            </label>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

type AITabPanelProps = {
  isReviewing: boolean;
  aiError: string | null;
  aiReview: string | null;
  hasEffectiveKey: boolean;
  aiProvider: string;
  aiReady: boolean;
  onOpenSettings: () => void;
  onGenerateReview: () => void;
  cn: (...inputs: any[]) => string;
};

export function AITabPanel({
  isReviewing,
  aiError,
  aiReview,
  hasEffectiveKey,
  aiProvider,
  aiReady,
  onOpenSettings,
  onGenerateReview,
  cn
}: AITabPanelProps) {
  return (
    <motion.div key="ia" className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="border-b border-gray-800 p-4 sm:p-6 lg:p-7 xl:p-8">
        <h3 className="text-2xl font-bold text-white mb-2">Auditoría de IA</h3>
        <p className="text-xs text-gray-500">Resultados del análisis arquitectónico basado en el modelo seleccionado.</p>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-6 lg:p-7 xl:p-8">
        {isReviewing ? (
          <div className="py-20 flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
            <p className="text-white font-bold">Generando reporte...</p>
          </div>
        ) : aiError ? (
          <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm">
            {aiError}
          </div>
        ) : aiReview ? (
          <div className="prose prose-invert prose-sm max-w-none">
            <Markdown>{aiReview}</Markdown>
          </div>
        ) : (
          <div className="text-center py-10 space-y-8">
            {!hasEffectiveKey && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-3xl text-left space-y-3">
                <div className="flex items-center gap-2 text-amber-500">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm font-bold uppercase tracking-wider">Configuración Requerida</span>
                </div>
                <p className="text-xs text-amber-200/70 leading-relaxed">
                  No has configurado una API Key para <strong>{aiProvider.toUpperCase()}</strong>. Para generar reportes automáticos, necesitas añadir tu llave en los ajustes.
                </p>
                <p className="text-[11px] text-amber-100/60 leading-relaxed">
                  El análisis del grafo, snapshots, task packs y vistas determinísticas siguen disponibles sin IA. Esta pestaña solo habilita el enriquecimiento con modelo.
                </p>
                <button
                  onClick={onOpenSettings}
                  className="text-[10px] font-bold text-amber-500 hover:underline flex items-center gap-1"
                >
                  Ir a Configuración <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="py-10">
              <Sparkles className="w-12 h-12 text-gray-800 mx-auto mb-4" />
              <p className="text-gray-500 text-sm mb-6">No hay reportes generados aún.</p>
              <button
                onClick={onGenerateReview}
                disabled={!aiReady}
                className={cn(
                  'px-8 py-3 rounded-2xl text-sm font-bold transition-all',
                  !aiReady
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-brand-primary text-white hover:brightness-110 shadow-lg shadow-brand-primary/20'
                )}
              >
                Generar Auditoría Ahora
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function SettingsTabPanel() {
  return (
    <motion.div key="settings" className="custom-scrollbar h-full space-y-6 overflow-y-auto p-4 sm:p-6 lg:p-7 xl:p-8">
      <h3 className="text-2xl font-bold text-white">Configuración AI</h3>
      <AIConfig />
    </motion.div>
  );
}

type AppModalsProps = {
  showFileModal: boolean;
  selectedNode: GraphNode | null;
  setShowFileModal: (show: boolean) => void;
  showIAModal: boolean;
  setShowIAModal: (show: boolean) => void;
  isReviewing: boolean;
  aiError: string | null;
  aiReview: string | null;
};

export function AppModals({
  showFileModal,
  selectedNode,
  setShowFileModal,
  showIAModal,
  setShowIAModal,
  isReviewing,
  aiError,
  aiReview
}: AppModalsProps) {
  return (
    <>
      <Modal isOpen={showFileModal && !!selectedNode} onClose={() => setShowFileModal(false)} title={selectedNode?.label || ''}>
        {selectedNode && (
          <div className="space-y-8">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 font-mono text-sm text-white break-all">
              {selectedNode.id}
            </div>
            <div className="bg-brand-bg rounded-3xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5 text-[10px] text-gray-500 uppercase">Contenido del Archivo</div>
              <pre className="p-6 text-xs text-gray-400 font-mono overflow-x-auto">{selectedNode.data.content}</pre>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showIAModal} onClose={() => setShowIAModal(false)} title="Auditoría Arquitectónica">
        {isReviewing ? (
          <div className="py-20 flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
            <p className="text-white font-bold">Analizando Grafo...</p>
          </div>
        ) : aiError ? (
          <div className="py-20 text-center text-red-400">{aiError}</div>
        ) : aiReview ? (
          <div className="prose prose-invert max-w-none prose-sm md:prose-base">
            <Markdown>{aiReview}</Markdown>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
