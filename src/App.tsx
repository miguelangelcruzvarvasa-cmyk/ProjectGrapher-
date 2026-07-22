/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Network, FileText, ChevronRight, X, Play,
  Search, Info, Database, Download,
  LayoutDashboard, Share2, Folder,
  Sparkles, Loader2, BarChart3, Activity, Settings, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { GraphCanvas } from './components/GraphCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Modal } from './components/Modal';
import { TreeItem } from './components/TreeItem';
import { NavItem } from './components/NavItem';
import { AITabPanel, AppModals, EmptyProjectState, SettingsTabPanel } from './components/AppPanels';
import { useAppController } from './hooks/useAppController';
import { buildFileTree } from './utils/analysis';
import { cn } from './utils/cn';
import Markdown from 'react-markdown';

export default function App() {
  const {
    projectData, skippedCount, selectedNode, smartDiffData, projectMemory, isProcessing, isReviewing,
    processingProgress,
    searchQuery, treeSearch, activeTab, isFocusMode, aiReview, aiError,
    showFileModal, showIAModal,
    setProjectData, setSelectedNode, setSearchQuery, setTreeSearch,
    setActiveTab, setIsFocusMode, processFiles,
    generateAIReview, generateAIContext, generateExecutiveView, generateSystemView, generateHotspotReport, generateProjectBrief, generateProjectMetadata, generateGraphGuide, generateCriticalFlows, generateTreeOnly, setShowFileModal, setShowIAModal,
    generateAIVisionDocument, generateAIArchitectureNarrative, generateAIRefactorPriorities, generateAIAgentHandoff,
    aiProvider, aiModel, customUrl, customKey,
    setAiProvider, setAiModel, setCustomUrl, setCustomKey, setProjectGlobalMemory, setProjectFileMemory, projectName,
    closeProject,
    copied,
    showSettingsModal,
    setShowSettingsModal,
    isDesktopLayout,
    showMobilePanel,
    setShowMobilePanel,
    graphDensityMode,
    setGraphDensityMode,
    agentTask,
    setAgentTask,
    errorTraceInput,
    setErrorTraceInput,
    semanticQuery,
    setSemanticQuery,
    exportSection,
    setExportSection,
    isSavingAIDocs,
    aiDocsSaveStatus,
    setAIDocsSaveStatus,
    hasEffectiveKey,
    aiReady,
    filteredNodes,
    architectureMetrics,
    handleGraphNodeClick,
    saveFilesToContext,
    getDeterministicContextExports,
    getAIDocumentExports,
    handleDownloadFile,
    copyToClipboard,
    openPanelTab,
    taskPackData,
    taskPackPreview,
    errorContextPackData,
    errorContextPackPreview,
    semanticSearchResults,
    impactAnalysisData,
    architectureSnapshot,
    architectureSnapshotPreview,
    architectureSnapshotTokenEstimate,
    activeProjectMemory,
    selectedNodeMemory,
    focusNodeByProjectPath
  } = useAppController();
  const [exportAssetTab, setExportAssetTab] = React.useState<'snapshot' | 'brief' | 'technical' | 'guide' | 'raw'>('snapshot');
  const mostCriticalFile = React.useMemo(() => {
    if (!projectData?.files || projectData.files.length === 0) return null;
    return [...projectData.files].sort((a, b) => (b.importance || 0) - (a.importance || 0))[0];
  }, [projectData]);

  const downloadFileBatch = React.useCallback((files: { filename: string; content: string; type: string }[]) => {
    files.forEach((file, index) => {
      window.setTimeout(() => {
        handleDownloadFile(file.content, file.filename, file.type);
      }, index * 120);
    });
  }, [handleDownloadFile]);
  const exportAssetOptions = [
    {
      id: 'snapshot' as const,
      label: 'Snapshot',
      eyebrow: 'Principal',
      accent: 'brand-primary',
      description: 'Foto arquitectónica completa para sesiones nuevas, handoff o archivo base.'
    },
    {
      id: 'brief' as const,
      label: 'Brief',
      eyebrow: 'Humano',
      accent: 'sky-500',
      description: 'Versión corta para onboarding rápido y lectura de alto nivel.'
    },
    {
      id: 'technical' as const,
      label: 'Technical JSON',
      eyebrow: 'Scriptable',
      accent: 'amber-500',
      description: 'Resumen compacto para integraciones, automatización o agentes técnicos.'
    },
    {
      id: 'guide' as const,
      label: 'Graph Guide',
      eyebrow: 'Lectura',
      accent: 'emerald-500',
      description: 'Guía textual para entender el mapa sin entrar al canvas.'
    },
    {
      id: 'raw' as const,
      label: 'Raw Graph',
      eyebrow: 'Interno',
      accent: 'brand-secondary',
      description: 'Dump del grafo completo para depuración o reutilización avanzada.'
    }
  ];

  if (!projectData) {
    return (
      <EmptyProjectState
        cn={cn}
        isProcessing={isProcessing}
        processingProgress={processingProgress}
        onProcessFiles={processFiles}
      />
    );
  }


  return (
    <div className="flex w-full min-h-screen flex-col overflow-x-hidden bg-brand-bg font-sans pb-[calc(env(safe-area-inset-bottom)+4.5rem)] lg:h-screen lg:flex-row lg:overflow-hidden lg:pb-0">

      {/* Compact Top Bar */}
      <div className="sticky top-0 z-40 flex h-16 w-full shrink-0 items-center justify-between border-b border-gray-800 bg-brand-bg/90 px-4 backdrop-blur-md sm:px-6 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Network className="w-6 h-6 text-brand-primary" />
          <div className="min-w-0">
            <span className="block truncate text-[10px] font-bold tracking-widest text-white font-display">PROJECTGRAPHER</span>
            <span className="block truncate text-[10px] text-gray-500">{projectName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGraphDensityMode(graphDensityMode === 'focused' ? 'auto' : 'focused')}
            className={cn(
              "rounded-xl border px-3 py-2 text-[10px] font-bold transition-all",
              graphDensityMode === 'focused' ? "border-cyan-400 bg-cyan-400 text-black" : "border-gray-800 text-gray-400"
            )}
          >
            {graphDensityMode === 'focused' ? 'Focus View' : 'Auto View'}
          </button>
          <button
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={cn(
              "rounded-xl border px-3 py-2 text-[10px] font-bold transition-all",
              isFocusMode ? "border-brand-primary bg-brand-primary text-white" : "border-gray-800 text-gray-400"
            )}
          >
            Focus {isFocusMode ? 'On' : 'Off'}
          </button>
          <button
            onClick={generateAIReview}
            disabled={isReviewing || !aiReady}
            className={cn(
              "rounded-xl px-3 py-2 text-[10px] font-bold transition-all",
              isReviewing || !aiReady
                ? "bg-gray-800 text-gray-500"
                : "bg-brand-primary text-white"
            )}
            title={!projectData ? 'Carga un proyecto para usar la auditoría IA' : !hasEffectiveKey ? 'Configura una llave o usa Ollama para habilitar la auditoría IA' : 'Generar auditoría IA'}
          >
            IA
          </button>
        </div>
      </div>

      {/* Sidebar Navigation */}
      <nav className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex w-full items-center gap-2 border-t border-gray-800 bg-brand-surface/95 px-2 py-2 backdrop-blur-xl lg:relative lg:inset-auto lg:w-20 lg:flex-col lg:justify-start lg:gap-2 lg:border-r lg:border-t-0 lg:bg-brand-surface lg:px-4 lg:py-6"
      )}>
        <div className="hidden rounded-xl bg-brand-primary/10 p-2 lg:mb-4 lg:block">
          <Network className="w-8 h-8 text-brand-primary" />
        </div>

        <div className="flex w-full min-w-0 flex-row gap-1 overflow-x-auto pb-[env(safe-area-inset-bottom)] lg:flex-col lg:gap-2 lg:overflow-visible lg:px-0 lg:pb-0">
          <NavItem
            active={activeTab === 'details'}
            onClick={() => openPanelTab('details')}
            icon={<LayoutDashboard className="w-6 h-6" />}
            label="Dashboard"
            mobile={true}
          />
          <NavItem
            active={activeTab === 'files'}
            onClick={() => openPanelTab('files')}
            icon={<Folder className="w-6 h-6" />}
            label="Archivos"
            mobile={true}
          />
          <NavItem
            active={activeTab === 'ia'}
            onClick={() => openPanelTab('ia')}
            icon={<Sparkles className={cn("w-6 h-6", isReviewing && "animate-pulse")} />}
            label="Arquitectura AI"
            mobile={true}
            badge={isReviewing}
          />
          <NavItem
            active={activeTab === 'context'}
            onClick={() => openPanelTab('context')}
            icon={<Database className="w-6 h-6" />}
            label="Contexto Prompt"
            mobile={true}
          />
          <NavItem
            active={activeTab === 'settings'}
            onClick={() => openPanelTab('settings')}
            icon={<Settings className="w-6 h-6" />}
            label="Configuración"
            mobile={true}
          />
        </div>

        <div className="mt-auto hidden w-full flex-col items-center gap-4 px-4 lg:flex lg:px-0">
          <button
            onClick={() => { generateAIReview(); setShowIAModal(true); }}
            disabled={isReviewing || !aiReady}
            className={cn(
              "p-3 rounded-xl transition-all border border-gray-800 flex items-center justify-center gap-3 w-full md:w-auto",
              isReviewing || !aiReady ? "bg-gray-800 text-gray-400" : "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white"
            )}
            title={!projectData ? 'Carga un proyecto para usar la auditoría IA' : !hasEffectiveKey ? 'Configura una llave o usa Ollama para habilitar la auditoría IA' : 'Generar reporte IA'}
          >
            {isReviewing ? <Loader2 className="w-6 h-6 animate-spin" /> : <BarChart3 className="w-6 h-6" />}
            <span className="md:hidden font-bold">Generar Reporte AI</span>
          </button>
          <button
            onClick={async () => await closeProject()}
            className="p-3 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all flex items-center justify-center gap-3 w-full md:w-auto"
            title="Cerrar Proyecto"
          >
            <LogOut className="w-6 h-6" />
            <span className="md:hidden font-bold">Salir del Proyecto</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex w-full min-w-0 min-h-0 flex-1 flex-col lg:pb-0 lg:overflow-hidden">
        <header className="hidden h-16 shrink-0 items-center justify-between border-b border-gray-800 bg-brand-bg/80 px-6 backdrop-blur-md lg:flex">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-display font-bold tracking-wider text-white uppercase opacity-70">
              Architectural Layer
            </h2>
            <div className="h-4 w-[1px] bg-gray-800" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                  {projectData.files.length} Nodes Loaded
                </span>
                {skippedCount > 0 && (
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700/50">
                    {skippedCount.toLocaleString()} Ignored
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 rounded-full border border-gray-800 bg-brand-surface/60 p-1">
              {(['auto', 'focused', 'expanded'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setGraphDensityMode(mode)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-all",
                    graphDensityMode === mode
                      ? "bg-cyan-400 text-black"
                      : "text-gray-500 hover:text-white"
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all whitespace-nowrap",
                isFocusMode ? "bg-brand-primary text-white border-brand-primary" : "text-gray-500 border-gray-800 hover:border-gray-700"
              )}
            >
              <Network className="w-3 h-3" />
              FOCUS {isFocusMode ? 'ON' : 'OFF'}
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-brand-surface border border-gray-800 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-primary transition-all w-64"
              />
            </div>
          </div>
        </header>

        <div className="w-full border-b border-gray-800 px-4 py-2.5 sm:px-5 lg:hidden">
          <div className="mb-2.5 flex flex-col gap-2.5">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-white sm:text-lg">{projectName || 'Dashboard'}</h2>
              <p className="text-[10px] uppercase tracking-[0.16em] text-gray-500">
                {projectData.files.length} nodos cargados{skippedCount > 0 ? ` • ${skippedCount.toLocaleString()} ignorados` : ''}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
              <div className="rounded-2xl border border-gray-800 bg-brand-surface/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Archivos</div>
                <div className="text-base font-bold text-white">{projectData.files.length}</div>
              </div>
              <div className="rounded-2xl border border-gray-800 bg-brand-surface/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-500">Relaciones</div>
                <div className="text-base font-bold text-white">{projectData.links.length}</div>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Buscar nodos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-gray-800 bg-brand-surface py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-brand-primary"
              />
            </div>
            <button
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={cn(
                "rounded-2xl border px-4 py-2.5 text-sm font-bold transition-all sm:min-w-[150px]",
                isFocusMode ? "border-brand-primary bg-brand-primary text-white" : "border-gray-800 text-gray-400"
              )}
            >
              Focus {isFocusMode ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <div className="relative h-[calc(100svh-11.5rem)] w-full min-w-0 flex-none md:h-[calc(100svh-11rem)] lg:h-auto lg:min-h-0 lg:flex-1">
          <ErrorBoundary category="Grafo Interactivo">
            <GraphCanvas
              nodes={filteredNodes}
              links={projectData.links}
              onNodeClick={handleGraphNodeClick}
              selectedNodeId={selectedNode?.id || null}
              isFocusMode={isFocusMode}
              graphDensityMode={graphDensityMode}
            />
          </ErrorBoundary>
        </div>
      </main>

      {/* Right Sidebar */}
      <aside
        className={cn(
          "fixed inset-x-0 top-16 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-30 flex min-w-0 flex-col border-t border-gray-800 bg-brand-surface transition-transform duration-300 lg:relative lg:inset-auto lg:top-auto lg:bottom-auto lg:z-auto lg:min-h-0 lg:w-[360px] lg:shrink-0 lg:border-l lg:border-t-0 xl:w-[400px] 2xl:w-[440px]",
          isDesktopLayout ? "translate-y-0" : (showMobilePanel ? "translate-y-0" : "translate-y-[105%]")
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-800 bg-brand-bg px-4 py-4 sm:px-6 lg:hidden">
          <span className="text-xs font-bold uppercase tracking-widest text-white">{activeTab}</span>
          <button
            onClick={() => setShowMobilePanel(false)}
            className="rounded-xl border border-gray-800 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400"
          >
            Cerrar
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'details' && (
            <motion.div key="details" className="flex-1 flex flex-col h-full overflow-hidden">
              {selectedNode ? (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="border-b border-gray-800 p-4 sm:p-6">
                    <h3 className="text-xl font-bold text-white mb-1 break-all">{selectedNode.label}</h3>
                    <p className="text-xs text-gray-500 font-mono opacity-50 truncate">{selectedNode.id}</p>
                  </div>
                  <div className="custom-scrollbar flex-1 overflow-y-auto space-y-6 p-4 sm:p-6">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="bg-brand-bg/50 border border-gray-800 p-4 rounded-2xl">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Centralidad</div>
                        <div className="text-2xl font-mono font-bold text-brand-primary">{selectedNode.data.importance}</div>
                      </div>
                      <div className="bg-brand-bg/50 border border-gray-800 p-4 rounded-2xl">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Tipo</div>
                        <div className="text-2xl font-mono font-bold text-brand-secondary lowercase">{selectedNode.group}</div>
                      </div>
                    </div>

                    {impactAnalysisData && (
                      <div className="space-y-4 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-4">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Predictive Impact</div>
                          <p className="mt-2 text-sm text-gray-300">{impactAnalysisData.summary}</p>
                        </div>

                        {mostCriticalFile && (
                          <div className="rounded-2xl bg-red-950/30 border border-red-500/20 p-3">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-red-400 flex items-center gap-1">
                              ⚠️ Nodo Crítico Principal
                            </div>
                            <p className="mt-1 text-[11px] text-gray-400 leading-relaxed">
                              El archivo más conectado del proyecto es <strong className="text-white font-mono">{mostCriticalFile.path}</strong> (centralidad: {mostCriticalFile.importance}). Modificarlo conlleva un alto riesgo de fallos en cascada.
                            </p>
                            {selectedNode?.id !== mostCriticalFile.id && (
                              <button
                                onClick={() => focusNodeByProjectPath(mostCriticalFile.path)}
                                className="mt-2 text-[10px] font-bold text-red-400 hover:text-red-300 underline"
                              >
                                Enfocar nodo crítico
                              </button>
                            )}
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Consumidores directos</div>
                          {impactAnalysisData.directDependents.length ? impactAnalysisData.directDependents.slice(0, 4).map((item) => (
                            <button
                              key={item.path}
                              onClick={() => focusNodeByProjectPath(item.path)}
                              className="block w-full rounded-2xl border border-white/6 bg-black/20 p-3 text-left transition-colors hover:border-amber-500/40"
                            >
                              <div className="break-all font-mono text-xs text-white">{item.path}</div>
                              <div className="mt-1 text-[11px] text-gray-500">{item.reasons[0]}</div>
                            </button>
                          )) : (
                            <div className="text-xs text-gray-500">No se detectaron consumidores directos.</div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Dependencias directas</div>
                          {impactAnalysisData.directDependencies.length ? impactAnalysisData.directDependencies.slice(0, 4).map((item) => (
                            <button
                              key={item.path}
                              onClick={() => focusNodeByProjectPath(item.path)}
                              className="block w-full rounded-2xl border border-white/6 bg-black/20 p-3 text-left transition-colors hover:border-amber-500/40"
                            >
                              <div className="break-all font-mono text-xs text-white">{item.path}</div>
                              <div className="mt-1 text-[11px] text-gray-500">{item.reasons[0]}</div>
                            </button>
                          )) : (
                            <div className="text-xs text-gray-500">No se detectaron dependencias directas.</div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3 rounded-3xl border border-emerald-500/15 bg-emerald-500/5 p-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Project Memory</div>
                      <p className="text-xs leading-relaxed text-gray-400">Guarda notas locales sobre este archivo para futuras sesiones.</p>
                      <textarea
                        value={selectedNodeMemory}
                        onChange={(e) => setProjectFileMemory(selectedNode.id, e.target.value)}
                        rows={4}
                        placeholder="Ejemplo: este archivo es crítico, no tocar el flujo de sesión sin revisar auth y middleware."
                        className="w-full rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald-500"
                      />
                    </div>

                    <button
                      onClick={() => setShowFileModal(true)}
                      className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                    >
                      <Info className="w-4 h-4 text-brand-primary" /> Ver Ficha Completa
                    </button>
                  </div>
                </div>
              ) : (
                <div className="custom-scrollbar flex-1 overflow-y-auto space-y-6 p-4 sm:p-6 lg:p-7 xl:p-8">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-2xl font-bold text-white">{projectName || 'Dashboard'}</h3>
                    <div className="px-3 py-1 bg-brand-secondary/20 text-brand-secondary text-[10px] font-bold rounded-full uppercase">
                      Graph Engine Active
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="bg-brand-bg/50 border border-gray-800 p-6 rounded-3xl">
                      <div className="text-xs text-gray-500 mb-1">Salud Arquitectónica</div>
                      <div className="mb-2 text-2xl font-bold text-white sm:text-3xl">
                        {architectureMetrics?.architectureHealth}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                        <Activity className="w-3 h-3" />
                        COMPLEXITY INDEX: {architectureMetrics?.complexityAvg}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="bg-brand-bg/50 border border-gray-800 p-4 rounded-2xl text-center">
                        <div className="text-[10px] text-gray-500 uppercase mb-1">Archivos</div>
                        <div className="text-xl font-bold text-white">{projectData.files.length}</div>
                      </div>
                      <div className="bg-brand-bg/50 border border-gray-800 p-4 rounded-2xl text-center">
                        <div className="text-[10px] text-gray-500 uppercase mb-1">Relaciones</div>
                        <div className="text-xl font-bold text-white">{projectData.links.length}</div>
                      </div>
                    </div>

                    {mostCriticalFile && (
                      <button
                        onClick={() => focusNodeByProjectPath(mostCriticalFile.path)}
                        className="w-full text-left bg-brand-bg/50 border border-gray-800 p-6 rounded-3xl hover:border-red-500/30 transition-all group"
                      >
                        <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <span className="text-red-400">⚠️</span> Nodo Más Crítico del Proyecto
                        </div>
                        <div className="text-sm font-mono font-bold text-white truncate group-hover:text-red-400 transition-colors">
                          {mostCriticalFile.path}
                        </div>
                        <div className="mt-1 text-[10px] text-gray-500 uppercase tracking-wider">
                          Centralidad de Conexiones: {mostCriticalFile.importance}
                        </div>
                      </button>
                    )}
                  </div>

                  <div className="bg-brand-bg/50 border border-gray-800 p-6 rounded-3xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Database className="w-12 h-12 text-brand-primary" />
                    </div>
                    <h4 className="text-sm font-bold text-brand-primary mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Análisis Arquitectónico Local
                    </h4>
                    <p className="text-xs text-gray-400 leading-relaxed relative z-10">
                      Estás viendo un mapeo <strong className="font-semibold text-white">100% determinista</strong> generado mediante el análisis estático de dependencias (AST). Este proceso no utiliza IA, garantizando precisión técnica absoluta en la estructura del grafo.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-3xl border border-cyan-500/15 bg-cyan-500/5 p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-400">Graph Reading Mode</div>
                        <h4 className="mt-2 text-lg font-bold text-white">Modo actual: {graphDensityMode}</h4>
                      </div>
                      <div className="rounded-full border border-cyan-500/20 bg-black/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                        adaptive
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/6 bg-black/20 p-3 text-xs text-gray-300">
                        <span className="font-bold text-white">Auto</span>: balancea rendimiento y contexto.
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 p-3 text-xs text-gray-300">
                        <span className="font-bold text-white">Focused</span>: menos ruido, mejor lectura.
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 p-3 text-xs text-gray-300">
                        <span className="font-bold text-white">Expanded</span>: muestra más etiquetas y conexiones.
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/6 bg-black/20 p-3 text-xs text-gray-300">
                        <span className="inline-block h-3 w-3 rounded-full bg-violet-400 mr-2 align-middle" />
                        Seleccionado
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 p-3 text-xs text-gray-300">
                        <span className="inline-block h-3 w-3 rounded-full bg-amber-400 mr-2 align-middle" />
                        Hotspot importante
                      </div>
                      <div className="rounded-2xl border border-white/6 bg-black/20 p-3 text-xs text-gray-300">
                        <span className="inline-block h-3 w-3 rounded-full bg-sky-500 mr-2 align-middle" />
                        Nodo normal por tipo
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-3xl border border-cyan-500/15 bg-cyan-500/5 p-6">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-400">Semantic Search</div>
                      <h4 className="mt-2 text-lg font-bold text-white">Busca por intención</h4>
                      <p className="mt-1 text-xs leading-relaxed text-gray-400">No solo por nombre de archivo. Usa el scoring semántico del proyecto para encontrar módulos relevantes.</p>
                    </div>
                    <input
                      type="text"
                      value={semanticQuery}
                      onChange={(e) => setSemanticQuery(e.target.value)}
                      placeholder="Ejemplo: dónde vive autenticación"
                      className="w-full rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-500"
                    />
                    {semanticSearchResults && (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-300">{semanticSearchResults.summary}</p>
                        <div className="space-y-2">
                          {semanticSearchResults.primaryFiles.slice(0, 5).map((file) => (
                            <button
                              key={file.path}
                              onClick={() => focusNodeByProjectPath(file.path)}
                              className="block w-full rounded-2xl border border-white/6 bg-black/20 p-3 text-left transition-colors hover:border-cyan-500/40"
                            >
                              <div className="break-all font-mono text-xs text-white">{file.path}</div>
                              <div className="mt-1 text-[11px] text-gray-500">{file.reasons[0]}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 rounded-3xl border border-violet-500/15 bg-violet-500/5 p-6">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-400">Smart Diff Context</div>
                      <h4 className="mt-2 text-lg font-bold text-white">Comparación contra la corrida anterior</h4>
                    </div>
                    {smartDiffData ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-300">{smartDiffData.summary}</p>
                        <div className="grid grid-cols-1 gap-3">
                          <div className="rounded-2xl border border-white/6 bg-black/20 p-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Archivos nuevos</div>
                            <div className="mt-2 space-y-1">
                              {smartDiffData.addedFiles.length ? smartDiffData.addedFiles.slice(0, 5).map((path) => (
                                <button
                                  key={path}
                                  onClick={() => focusNodeByProjectPath(path)}
                                  className="block w-full break-all rounded-lg px-2 py-1 text-left font-mono text-xs text-white transition-colors hover:bg-white/5 hover:text-violet-200"
                                >
                                  {path}
                                </button>
                              )) : <div className="text-xs text-gray-500">Sin cambios nuevos detectados.</div>}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-white/6 bg-black/20 p-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Relaciones nuevas</div>
                            <div className="mt-2 space-y-1">
                              {smartDiffData.addedRelations.length ? smartDiffData.addedRelations.slice(0, 5).map((relation) => (
                                <div key={relation} className="break-all font-mono text-xs text-white">{relation}</div>
                              )) : <div className="text-xs text-gray-500">No se detectaron relaciones nuevas.</div>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs leading-relaxed text-gray-500">Todavía no hay una corrida previa del mismo proyecto para comparar. Cuando cargues una nueva versión local, aquí aparecerá el diff estructural.</p>
                    )}
                  </div>

                  <div className="space-y-3 rounded-3xl border border-emerald-500/15 bg-emerald-500/5 p-6">
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-400">Project Memory</div>
                    <p className="text-xs leading-relaxed text-gray-400">Notas persistentes del proyecto completas, no ligadas a un archivo concreto.</p>
                    <textarea
                      value={activeProjectMemory.globalNote}
                      onChange={(e) => setProjectGlobalMemory(e.target.value)}
                      rows={4}
                      placeholder="Ejemplo: módulo legacy, revisar auth antes de tocar login, evitar cambiar el flujo de sesiones sin validar middleware."
                      className="w-full rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'files' && (
            <motion.div key="files" className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="border-b border-gray-800 p-4 sm:p-6">
                <input
                  type="text"
                  placeholder="Buscar archivos..."
                  value={treeSearch}
                  onChange={(e) => setTreeSearch(e.target.value)}
                  className="w-full bg-brand-bg/50 border border-gray-800 rounded-xl py-2 px-4 text-xs text-white"
                />
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {buildFileTree(projectData.files.filter(f => f.path.toLowerCase().includes(treeSearch.toLowerCase()))).map((node, i) => (
                  <TreeItem
                    key={i}
                    node={node}
                    level={0}
                    onFileSelect={(file) => {
                      const node = projectData.nodes.find(n => n.id === file.id);
                      if (node) setSelectedNode(node);
                      setShowFileModal(true);
                    }}
                    selectedId={selectedNode?.id || null}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'context' && (
            <motion.div key="context" className="flex-1 flex flex-col h-full overflow-hidden bg-brand-surface">
              <div className="border-b border-gray-800 p-4 sm:p-6 lg:p-7 xl:p-8">
                <h3 className="mb-2 text-2xl font-bold text-white font-display sm:text-3xl">Centro de Exportación</h3>
                <p className="text-sm text-gray-500">Organiza los exports por intención: entender, delegar, depurar, enriquecer con IA o descargar artefactos base.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => setExportSection('guided')}
                    className={cn(
                      "rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all",
                      exportSection === 'guided' ? "border-brand-primary bg-brand-primary text-black" : "border-gray-800 bg-black/20 text-gray-400 hover:border-brand-primary/40 hover:text-white"
                    )}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setExportSection('task')}
                    className={cn(
                      "rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all",
                      exportSection === 'task' ? "border-emerald-500 bg-emerald-500 text-black" : "border-gray-800 bg-black/20 text-gray-400 hover:border-emerald-500/40 hover:text-white"
                    )}
                  >
                    Task Pack
                  </button>
                  <button
                    onClick={() => setExportSection('errors')}
                    className={cn(
                      "rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all",
                      exportSection === 'errors' ? "border-rose-500 bg-rose-500 text-black" : "border-gray-800 bg-black/20 text-gray-400 hover:border-rose-500/40 hover:text-white"
                    )}
                  >
                    Error Pack
                  </button>
                  {aiReview && (
                    <button
                      onClick={() => setExportSection('ai')}
                      className={cn(
                        "rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all",
                        exportSection === 'ai' ? "border-fuchsia-500 bg-fuchsia-500 text-black" : "border-gray-800 bg-black/20 text-gray-400 hover:border-fuchsia-500/40 hover:text-white"
                      )}
                    >
                      Documentos IA
                    </button>
                  )}
                  <button
                    onClick={() => setExportSection('exports')}
                    className={cn(
                      "rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all",
                      exportSection === 'exports' ? "border-sky-500 bg-sky-500 text-black" : "border-gray-800 bg-black/20 text-gray-400 hover:border-sky-500/40 hover:text-white"
                    )}
                  >
                    Exportes Base
                  </button>
                </div>
              </div>

              <div className="custom-scrollbar flex-1 overflow-y-auto space-y-8 p-4 sm:p-6 lg:p-7 xl:p-8">
                {exportSection === 'guided' && (
                <div className="space-y-6">
                  <div className="flex flex-col gap-4 rounded-[2rem] border border-brand-primary/10 bg-black/15 p-4">
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-brand-primary">Agent Workbench</div>
                      <h4 className="text-xl font-bold text-white font-display sm:text-2xl">Contexto preciso para programadores y agentes</h4>
                      <p className="text-sm leading-relaxed text-gray-400">
                        La meta es que otro agente entienda qu&eacute; hace el proyecto, d&oacute;nde vive cada parte y qu&eacute; archivos tocar para una tarea concreta, sin desperdiciar tokens.
                      </p>
                      <p className="text-xs font-medium text-brand-primary/90">
                        Menos ruido, mejor contexto, decisiones m&aacute;s r&aacute;pidas.
                      </p>
                    </div>
                    <button
                      onClick={() => downloadFileBatch([
                      { filename: `${projectName}_executive_view.md`, content: generateExecutiveView(), type: 'text/markdown' },
                      { filename: `${projectName}_system_view.md`, content: generateSystemView(), type: 'text/markdown' },
                      { filename: `${projectName}_hotspots.md`, content: generateHotspotReport(), type: 'text/markdown' },
                      { filename: `${projectName}_critical_flows.md`, content: generateCriticalFlows(), type: 'text/markdown' }
                    ])}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-black text-black transition-all hover:brightness-110"
                    >
                      <Download className="h-4 w-4" />
                      Descargar overview completo
                    </button>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={() => handleDownloadFile(generateExecutiveView(), `${projectName}_executive_view.md`, 'text/markdown')}
                      className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-brand-bg/30 px-4 py-3 text-left transition-colors hover:border-sky-500/40"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">Executive View</div>
                        <div className="text-xs text-gray-500">Qu&eacute; hace el proyecto y por d&oacute;nde empezar</div>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-sky-400">Descargar</span>
                    </button>

                    <button
                      onClick={() => handleDownloadFile(generateSystemView(), `${projectName}_system_view.md`, 'text/markdown')}
                      className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-brand-bg/30 px-4 py-3 text-left transition-colors hover:border-violet-500/40"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">System View</div>
                        <div className="text-xs text-gray-500">Capas, m&oacute;dulos y relaciones clave</div>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-violet-400">Descargar</span>
                    </button>

                    <button
                      onClick={() => handleDownloadFile(generateHotspotReport(), `${projectName}_hotspots.md`, 'text/markdown')}
                      className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-brand-bg/30 px-4 py-3 text-left transition-colors hover:border-amber-500/40"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">Hotspots Report</div>
                        <div className="text-xs text-gray-500">Archivos cr&iacute;ticos y deuda t&eacute;cnica visible</div>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-amber-400">Descargar</span>
                    </button>

                    <button
                      onClick={() => handleDownloadFile(generateCriticalFlows(), `${projectName}_critical_flows.md`, 'text/markdown')}
                      className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-brand-bg/30 px-4 py-3 text-left transition-colors hover:border-emerald-500/40"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">Critical Flows</div>
                        <div className="text-xs text-gray-500">Fuentes de verdad y rutas operativas del negocio</div>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-emerald-400">Descargar</span>
                    </button>
                  </div>
                </div>
                )}

                {exportSection === 'ai' && aiReview && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.24em] text-fuchsia-400">Documentos IA</div>
                      <h4 className="text-lg font-bold text-white sm:text-xl">Lecturas automáticas para handoff</h4>
                      <p className="text-sm leading-relaxed text-gray-400">
                        Estos documentos aparecen cuando ya existe auditor&iacute;a IA. Mezclan la lectura del modelo con el grafo y el contexto local para producir handoffs m&aacute;s humanos.
                      </p>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-fuchsia-500/15 bg-fuchsia-500/5 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-relaxed text-gray-300">
                          Cuando se genera la auditor&iacute;a IA, estos archivos tambi&eacute;n se guardan autom&aacute;ticamente en <span className="font-mono text-fuchsia-300">contexto/{projectName || 'Proyecto'}</span>.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <button
                          onClick={() => downloadFileBatch(
                            getAIDocumentExports().map((file) => ({
                              ...file,
                              type: 'text/markdown'
                            }))
                          )}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-4 py-3 text-sm font-bold text-fuchsia-200 transition-all hover:bg-fuchsia-500 hover:text-black"
                        >
                          <Download className="h-4 w-4" />
                          Descargar todo
                        </button>
                        <button
                          onClick={() => void saveFilesToContext(getAIDocumentExports(), 'manual')}
                          disabled={isSavingAIDocs}
                          className={cn(
                            "rounded-2xl px-4 py-3 text-sm font-bold transition-all",
                            isSavingAIDocs ? "bg-gray-800 text-gray-500" : "bg-fuchsia-500 text-black hover:brightness-110"
                          )}
                        >
                          {isSavingAIDocs ? 'Guardando...' : 'Guardar todos en contexto/'}
                        </button>
                      </div>
                      {aiDocsSaveStatus && (
                        <div className="text-[11px] text-fuchsia-200">{aiDocsSaveStatus}</div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <button
                        onClick={() => handleDownloadFile(generateAIVisionDocument(), `${projectName}_vision_ai.md`, 'text/markdown')}
                        className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-brand-bg/30 px-4 py-3 text-left transition-colors hover:border-fuchsia-500/40"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white">AI Vision</div>
                          <div className="text-xs text-gray-500">Para qu&eacute; existe el sistema y qu&eacute; deber&iacute;a entender otro agente</div>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-fuchsia-400">Descargar</span>
                      </button>

                      <button
                        onClick={() => handleDownloadFile(generateAIArchitectureNarrative(), `${projectName}_architecture_narrative_ai.md`, 'text/markdown')}
                        className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-brand-bg/30 px-4 py-3 text-left transition-colors hover:border-cyan-500/40"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white">AI Architecture Narrative</div>
                          <div className="text-xs text-gray-500">Explicaci&oacute;n m&aacute;s humana del flujo y las tensiones del sistema</div>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-cyan-400">Descargar</span>
                      </button>

                      <button
                        onClick={() => handleDownloadFile(generateAIRefactorPriorities(), `${projectName}_refactor_priorities_ai.md`, 'text/markdown')}
                        className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-brand-bg/30 px-4 py-3 text-left transition-colors hover:border-rose-500/40"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white">AI Refactor Priorities</div>
                          <div className="text-xs text-gray-500">Focos de riesgo, consolidaci&oacute;n y deuda seg&uacute;n la auditor&iacute;a IA</div>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-rose-400">Descargar</span>
                      </button>

                      <button
                        onClick={() => handleDownloadFile(generateAIAgentHandoff(agentTask), `${projectName}_agent_handoff_ai.md`, 'text/markdown')}
                        className="flex w-full items-center justify-between rounded-2xl border border-gray-800 bg-brand-bg/30 px-4 py-3 text-left transition-colors hover:border-emerald-500/40"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white">AI Agent Handoff</div>
                          <div className="text-xs text-gray-500">Entrega lista para otro agente, con lectura estrat&eacute;gica y task pack</div>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-emerald-400">Descargar</span>
                      </button>
                    </div>
                  </div>
                )}

                {exportSection === 'task' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-400">Task Pack Builder</div>
                    <h4 className="text-lg font-bold text-white sm:text-xl">Paquete corto para una tarea concreta</h4>
                    <p className="text-sm leading-relaxed text-gray-400">
                      Escribe la tarea como se la pedir&iacute;as a un agente. ProjectGrapher arma contexto corto, archivos candidatos y relaciones para empezar r&aacute;pido.
                    </p>
                  </div>

                  <textarea
                    value={agentTask}
                    onChange={(e) => setAgentTask(e.target.value)}
                    rows={3}
                    placeholder="Ejemplo: ajusta el perfil del usuario y dime qué archivos tocar"
                    className="w-full rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald-500"
                  />

                  <p className="text-xs leading-relaxed text-gray-500">
                    Este pack intenta reducir tokens y priorizar archivos con mayor probabilidad de impacto.
                  </p>

                  <button
                    onClick={() => handleDownloadFile(taskPackPreview, `${projectName}_task_pack.md`, 'text/markdown')}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black transition-all hover:brightness-110"
                  >
                    <Download className="h-4 w-4" />
                    Descargar Task Pack
                  </button>

                  <div className="space-y-4 rounded-2xl border border-white/6 bg-black/40 p-4">
                    {taskPackData && (
                      <>
                        <div className="space-y-1">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Resumen del Pack</div>
                          <p className="text-sm text-gray-300">{taskPackData.projectSummary}</p>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Archivos primarios</div>
                          <div className="space-y-2">
                            {taskPackData.primaryFiles.slice(0, 5).map((file) => (
                              <button
                                key={file.path}
                                onClick={() => focusNodeByProjectPath(file.path)}
                                className="block w-full rounded-xl border border-white/6 bg-white/[0.03] p-3 text-left transition-colors hover:border-emerald-500/40"
                              >
                                <div className="break-all font-mono text-xs text-white">{file.path}</div>
                                <div className="mt-1 text-[11px] text-gray-400">Impacto: {file.importance} · Score: {file.score}</div>
                                <div className="mt-2 space-y-1">
                                  {file.reasons.map((reason) => (
                                    <div key={reason} className="text-[11px] text-gray-500">- {reason}</div>
                                  ))}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Archivos relacionados</div>
                          <div className="space-y-2">
                            {taskPackData.relatedFiles.slice(0, 4).map((file) => (
                              <button
                                key={file.path}
                                onClick={() => focusNodeByProjectPath(file.path)}
                                className="block w-full rounded-xl border border-white/6 bg-white/[0.03] p-3 text-left transition-colors hover:border-emerald-500/40"
                              >
                                <div className="break-all font-mono text-xs text-white">{file.path}</div>
                                <div className="mt-1 text-[11px] text-gray-500">{file.reasons[0]}</div>
                              </button>
                            ))}
                            {!taskPackData.relatedFiles.length && (
                              <div className="text-xs text-gray-500">No se detectaron relacionados claros en el subgrafo inicial.</div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Orden de lectura</div>
                          <div className="space-y-1">
                            {taskPackData.readingOrder.map((path, index) => (
                              <div key={path} className="text-xs text-gray-300">
                                <span className="mr-2 text-emerald-400">{index + 1}.</span>
                                <span className="break-all font-mono">{path}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="border-t border-white/6 pt-4">
                      <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Markdown exportable</div>
                      <div className="max-h-[220px] overflow-auto custom-scrollbar">
                        <div className="prose prose-invert prose-sm max-w-none break-words prose-headings:mb-3 prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white prose-code:text-emerald-300">
                          <Markdown>{taskPackPreview}</Markdown>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {exportSection === 'errors' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-400">Error-to-Context Pack</div>
                    <h4 className="text-lg font-bold text-white sm:text-xl">Contexto corto para depurar un error local</h4>
                    <p className="text-sm leading-relaxed text-gray-400">
                      Pega el error o stack trace de tu proyecto local. ProjectGrapher intenta ubicar el archivo origen en el grafo, resaltar vecinos relevantes y generar un mini pack en vez de mandar medio proyecto.
                    </p>
                  </div>

                  <textarea
                    value={errorTraceInput}
                    onChange={(e) => setErrorTraceInput(e.target.value)}
                    rows={5}
                    placeholder="Ejemplo: TypeError: Cannot read properties of undefined at src/components/UserCard.tsx:42:11"
                    className="w-full rounded-2xl border border-gray-800 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-rose-500"
                  />

                  <p className="text-xs leading-relaxed text-gray-500">
                    Este pack es determinístico: usa el grafo local, los nombres de archivo, las rutas del stack y las conexiones entre módulos. Si luego quieres usar IA, este markdown ya queda mucho más enfocado.
                  </p>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={() => handleDownloadFile(errorContextPackPreview, `${projectName}_error_context_pack.md`, 'text/markdown')}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-black transition-all hover:brightness-110"
                    >
                      <Download className="h-4 w-4" />
                      Descargar Error Pack
                    </button>
                    <button
                      onClick={() => errorContextPackData?.probableOrigin && focusNodeByProjectPath(errorContextPackData.probableOrigin.path)}
                      disabled={!errorContextPackData?.probableOrigin}
                      className={cn(
                        "inline-flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition-all",
                        errorContextPackData?.probableOrigin
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                          : "border-gray-800 bg-gray-900 text-gray-500"
                      )}
                    >
                      <Search className="h-4 w-4" />
                      Enfocar Origen en el Grafo
                    </button>
                  </div>

                  <div className="space-y-4 rounded-2xl border border-white/6 bg-black/40 p-4">
                    {errorContextPackData && (
                      <>
                        <div className="space-y-1">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-400">Resumen del Error Pack</div>
                          <p className="text-sm text-gray-300">{errorContextPackData.summary}</p>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Origen probable</div>
                          {errorContextPackData.probableOrigin ? (
                            <button
                              onClick={() => focusNodeByProjectPath(errorContextPackData.probableOrigin!.path)}
                              className="block w-full rounded-xl border border-white/6 bg-white/[0.03] p-3 text-left transition-colors hover:border-rose-500/40"
                            >
                              <div className="break-all font-mono text-xs text-white">{errorContextPackData.probableOrigin.path}</div>
                              <div className="mt-1 text-[11px] text-gray-400">Impacto: {errorContextPackData.probableOrigin.importance} · Score: {errorContextPackData.probableOrigin.score}</div>
                              <div className="mt-2 space-y-1">
                                {errorContextPackData.probableOrigin.reasons.map((reason) => (
                                  <div key={reason} className="text-[11px] text-gray-500">- {reason}</div>
                                ))}
                              </div>
                            </button>
                          ) : (
                            <div className="text-xs text-gray-500">No se detectó un origen con alta confianza.</div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Vecinos relevantes</div>
                          <div className="space-y-2">
                            {errorContextPackData.relatedFiles.slice(0, 5).map((file) => (
                              <button
                                key={file.path}
                                onClick={() => focusNodeByProjectPath(file.path)}
                                className="block w-full rounded-xl border border-white/6 bg-white/[0.03] p-3 text-left transition-colors hover:border-rose-500/40"
                              >
                                <div className="break-all font-mono text-xs text-white">{file.path}</div>
                                <div className="mt-1 text-[11px] text-gray-500">{file.reasons[0]}</div>
                              </button>
                            ))}
                            {!errorContextPackData.relatedFiles.length && (
                              <div className="text-xs text-gray-500">No se detectaron vecinos claros a partir del nodo origen.</div>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Orden de revisión</div>
                          <div className="space-y-1">
                            {errorContextPackData.readingOrder.map((path, index) => (
                              <div key={path} className="text-xs text-gray-300">
                                <span className="mr-2 text-rose-400">{index + 1}.</span>
                                <span className="break-all font-mono">{path}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <div className="border-t border-white/6 pt-4">
                      <div className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Markdown exportable</div>
                      <div className="max-h-[220px] overflow-auto custom-scrollbar">
                        <div className="prose prose-invert prose-sm max-w-none break-words prose-headings:mb-3 prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300 prose-strong:text-white prose-code:text-rose-300">
                          <Markdown>{errorContextPackPreview}</Markdown>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {exportSection === 'exports' && (
                <>
                <div className="space-y-4 rounded-3xl border border-white/6 bg-black/20 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-400">Centro de Exportacion</div>
                  <p className="text-sm leading-relaxed text-gray-400">
                    Exportes determinísticos para trabajar solo con tu proyecto local. La idea aquí no es depender de IA, sino darte salidas claras para leer, compartir o automatizar sin adivinar qué hace cada botón.
                  </p>
                  <button
                    onClick={() => downloadFileBatch([
                      { filename: `${projectName}_snapshot.md`, content: architectureSnapshot, type: 'text/markdown' },
                      { filename: `${projectName}_brief.md`, content: generateProjectBrief(), type: 'text/markdown' },
                      { filename: `${projectName}_project_summary.json`, content: generateProjectMetadata(), type: 'application/json' },
                      { filename: `${projectName}_graph_guide.md`, content: generateGraphGuide(), type: 'text/markdown' },
                      { filename: `${projectName}_critical_flows.md`, content: generateCriticalFlows(), type: 'text/markdown' },
                      { filename: `${projectName}_architecture_map.json`, content: JSON.stringify(projectData, null, 2), type: 'application/json' }
                    ])}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-sm font-black text-black transition-all hover:brightness-110"
                  >
                    <Download className="h-4 w-4" />
                    Descargar todo el paquete base
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                    {exportAssetOptions.map((option) => {
                      const isActive = exportAssetTab === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => setExportAssetTab(option.id)}
                          className={cn(
                            "group relative overflow-hidden rounded-[1.6rem] border p-4 text-left transition-all duration-300",
                            isActive
                              ? option.id === 'snapshot'
                                ? "border-brand-primary/35 bg-brand-primary/[0.08] shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
                                : option.id === 'brief'
                                  ? "border-sky-500/35 bg-sky-500/[0.08] shadow-[0_0_0_1px_rgba(14,165,233,0.15)]"
                                  : option.id === 'technical'
                                    ? "border-amber-500/35 bg-amber-500/[0.08] shadow-[0_0_0_1px_rgba(245,158,11,0.15)]"
                                    : option.id === 'guide'
                                      ? "border-emerald-500/35 bg-emerald-500/[0.08] shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                                      : "border-brand-secondary/35 bg-brand-secondary/[0.08] shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                              : "border-white/6 bg-black/20 hover:border-white/15 hover:bg-white/[0.03]"
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                              <div className={cn(
                                "text-[10px] font-black uppercase tracking-[0.22em]",
                                isActive
                                  ? option.id === 'snapshot'
                                    ? "text-brand-primary"
                                    : option.id === 'brief'
                                      ? "text-sky-400"
                                      : option.id === 'technical'
                                        ? "text-amber-400"
                                        : option.id === 'guide'
                                          ? "text-emerald-400"
                                          : "text-brand-secondary"
                                  : "text-gray-500"
                              )}>
                                {option.eyebrow}
                              </div>
                              <div className="text-sm font-bold text-white">{option.label}</div>
                              <p className="text-xs leading-relaxed text-gray-400">{option.description}</p>
                            </div>
                            <div className={cn(
                              "rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-all",
                              isActive
                                ? option.id === 'snapshot'
                                  ? "border-brand-primary/30 bg-brand-primary text-black"
                                  : option.id === 'brief'
                                    ? "border-sky-500/30 bg-sky-500 text-black"
                                    : option.id === 'technical'
                                      ? "border-amber-500/30 bg-amber-500 text-black"
                                      : option.id === 'guide'
                                        ? "border-emerald-500/30 bg-emerald-500 text-black"
                                        : "border-brand-secondary/30 bg-brand-secondary text-black"
                                : "border-white/8 bg-black/30 text-gray-500 group-hover:text-gray-300"
                            )}>
                              {isActive ? 'Activo' : 'Abrir'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {exportAssetTab === 'snapshot' && (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[2rem] border border-brand-primary/20 bg-[linear-gradient(145deg,rgba(99,102,241,0.15),rgba(3,7,18,0.92)_55%)] p-5 sm:p-6">
                        <div className="flex flex-col gap-5">
                          <div className="flex items-start gap-4">
                            <div className="rounded-[1.4rem] border border-brand-primary/20 bg-brand-primary/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                              <Database className="h-6 w-6 text-brand-primary" />
                            </div>
                            <div className="space-y-2">
                              <div>
                                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.24em] text-brand-primary">Export principal</div>
                                <h4 className="text-xl font-bold text-white">Snapshot Arquitectónico</h4>
                                <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-300">Resume estructura, hotspots, stack, relaciones y contexto útil del proyecto en un solo artefacto base.</p>
                              </div>
                              <div className="max-w-xl text-[12px] leading-relaxed text-gray-400">
                                Úsalo cuando quieras pasarle el proyecto a otra persona, abrir una nueva sesión o guardar una foto técnica del estado actual sin depender de una auditoría IA.
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="rounded-full border border-brand-primary/20 bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand-primary">
                              Markdown base
                            </div>
                            <button
                              onClick={() => handleDownloadFile(architectureSnapshot, `${projectName}_snapshot.md`, 'text/markdown')}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary px-4 py-3 text-sm font-black text-black transition-all hover:brightness-110 sm:w-auto"
                            >
                              <Download className="h-4 w-4 shrink-0" />
                              Descargar snapshot
                            </button>
                          </div>
                        </div>
                        <div className="mt-5 space-y-4 rounded-[1.8rem] border border-white/6 bg-black/25 p-4">
                          <div className="space-y-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Persistencia local</div>
                            <p className="text-sm leading-relaxed text-gray-300">
                              Guarda tambi&eacute;n snapshot, brief, graph guide y JSON t&eacute;cnico en <span className="break-all font-mono text-brand-primary">contexto/{projectName || 'Proyecto'}</span>.
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => void saveFilesToContext(getDeterministicContextExports(), 'manual')}
                              disabled={isSavingAIDocs}
                              className={cn(
                                "inline-flex w-full items-center justify-center rounded-[1.4rem] px-4 py-3 text-sm font-black transition-all",
                                isSavingAIDocs
                                  ? "bg-gray-800 text-gray-500"
                                  : "bg-white text-black hover:bg-brand-primary hover:text-black"
                              )}
                            >
                              {isSavingAIDocs ? 'Guardando exportes...' : 'Guardar paquete base'}
                            </button>
                            <div className="text-[11px] leading-relaxed text-gray-500">Incluye 6 artefactos determinísticos: snapshot, brief, graph guide, critical flows y JSON técnico.</div>
                          </div>
                        </div>
                        {aiDocsSaveStatus && (
                          <div className="mt-3 rounded-2xl border border-brand-primary/15 bg-brand-primary/[0.08] px-4 py-3 text-[11px] leading-relaxed text-brand-primary/90">{aiDocsSaveStatus}</div>
                        )}
                      </div>

                      <div className="space-y-4 pt-1">
                        <div className="flex flex-col gap-4 rounded-3xl border border-white/5 bg-brand-bg/20 p-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-center gap-4">
                             <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] w-24 leading-tight">Vista Previa</h5>
                             <div className="px-4 py-2 bg-brand-primary/10 text-brand-primary text-[10px] font-black rounded-full border border-brand-primary/20 flex flex-col items-center justify-center min-w-[80px]">
                                <span className="opacity-60 text-[8px]">~{architectureSnapshotTokenEstimate.toLocaleString()}</span>
                                <span>TOKENS</span>
                             </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                             <button
                               onClick={copyToClipboard}
                               className="flex items-center gap-2 text-[10px] font-black text-sky-400 hover:text-sky-300 transition-colors uppercase tracking-widest"
                             >
                               <span>{copied ? 'Copiado' : 'Copiar Snapshot'}</span>
                             </button>
                          </div>
                        </div>
                        
                        <div className="group relative max-h-[400px] overflow-auto rounded-[2rem] border border-white/5 bg-black/40 p-4 font-mono text-[10px] text-gray-400 custom-scrollbar sm:p-6 lg:p-7 xl:p-8">
                          <pre className="whitespace-pre leading-relaxed">{architectureSnapshotPreview}</pre>
                          {architectureSnapshotPreview !== architectureSnapshot && (
                            <div className="mt-4 border-t border-white/6 pt-4 text-[10px] uppercase tracking-[0.2em] text-gray-500">
                              Vista recortada. El archivo descargado incluye el snapshot completo.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {exportAssetTab === 'brief' && (
                    <div className="rounded-[2rem] border border-sky-500/20 bg-sky-500/[0.05] p-5 sm:p-6">
                      <div className="space-y-5">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-4">
                              <div className="rounded-2xl bg-sky-500/10 p-4">
                                <FileText className="h-6 w-6 text-sky-400" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-white font-bold">Project Brief</h4>
                                <p className="mt-1 text-sm text-gray-400">Versión corta para humanos.</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleDownloadFile(generateProjectBrief(), `${projectName}_brief.md`, 'text/markdown')}
                              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-300 transition-all hover:bg-sky-500 hover:text-black"
                            >
                              <Download className="h-4 w-4" />
                              Descargar
                            </button>
                          </div>
                        </div>
                        <div className="rounded-[1.6rem] border border-white/6 bg-black/20 p-4">
                          <div className="max-w-none space-y-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-400">Resumen</div>
                            <p className="text-sm leading-relaxed text-gray-300">
                              Bueno para ubicarse rápido: qué hace el proyecto, qué stack usa y por dónde empezar. Es el archivo más simple para onboarding.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {exportAssetTab === 'technical' && (
                    <div className="rounded-[2rem] border border-amber-500/20 bg-amber-500/[0.05] p-5 sm:p-6">
                      <div className="space-y-5">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start gap-4">
                            <div className="rounded-2xl bg-amber-500/10 p-4">
                              <Activity className="h-6 w-6 text-amber-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-white font-bold">Technical Summary JSON</h4>
                              <p className="mt-1 text-sm text-gray-400">Ficha compacta y determinista.</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadFile(generateProjectMetadata(), `${projectName}_project_summary.json`, 'application/json')}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-300 transition-all hover:bg-amber-500 hover:text-black"
                          >
                            <Download className="h-4 w-4" />
                            Descargar
                          </button>
                        </div>
                        <div className="rounded-[1.6rem] border border-white/6 bg-black/20 p-4">
                          <div className="max-w-none space-y-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-400">Uso técnico</div>
                            <p className="text-sm leading-relaxed text-gray-300">
                              Sirve para scripts, integraciones futuras o agentes que necesitan estructura clara sin leer markdown largo.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {exportAssetTab === 'guide' && (
                    <div className="rounded-[2rem] border border-emerald-500/20 bg-emerald-500/[0.05] p-5 sm:p-6">
                      <div className="space-y-5">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start gap-4">
                            <div className="rounded-2xl bg-emerald-500/10 p-4">
                              <Share2 className="h-6 w-6 text-emerald-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-white font-bold">Graph Guide</h4>
                              <p className="mt-1 text-sm text-gray-400">Guía textual para leer el grafo.</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadFile(generateGraphGuide(), `${projectName}_graph_guide.md`, 'text/markdown')}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300 transition-all hover:bg-emerald-500 hover:text-black"
                          >
                            <Download className="h-4 w-4" />
                            Descargar
                          </button>
                        </div>
                        <div className="rounded-[1.6rem] border border-white/6 bg-black/20 p-4">
                          <div className="max-w-none space-y-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-400">Lectura del mapa</div>
                            <p className="text-sm leading-relaxed text-gray-300">
                              Úsalo si quieres entender orquestadores, núcleo compartido y orden de lectura del mapa sin abrir el canvas.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {exportAssetTab === 'raw' && (
                    <div className="rounded-[2rem] border border-brand-secondary/20 bg-brand-secondary/[0.05] p-5 sm:p-6">
                      <div className="space-y-5">
                        <div className="flex flex-col gap-4">
                          <div className="flex items-start gap-4">
                            <div className="rounded-2xl bg-brand-secondary/10 p-4">
                              <Network className="h-6 w-6 text-brand-secondary" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="text-white font-bold">Raw Graph JSON</h4>
                              <p className="mt-1 text-sm text-gray-400">Dump técnico del grafo completo.</p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDownloadFile(JSON.stringify(projectData, null, 2), `${projectName}_architecture_map.json`, 'application/json')}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-secondary/30 bg-brand-secondary/10 px-4 py-3 text-sm font-bold text-brand-secondary transition-all hover:bg-brand-secondary hover:text-black"
                          >
                            <Download className="h-4 w-4" />
                            Descargar
                          </button>
                        </div>
                        <div className="rounded-[1.6rem] border border-white/6 bg-black/20 p-4">
                          <div className="max-w-none space-y-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-brand-secondary">Capa interna</div>
                            <p className="text-sm leading-relaxed text-gray-300">
                              Esto ya es más interno: útil para depurar, reusar datos o construir otra vista encima del grafo.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                </>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'ia' && (
            <AITabPanel
              isReviewing={isReviewing}
              aiError={aiError}
              aiReview={aiReview}
              hasEffectiveKey={hasEffectiveKey}
              aiProvider={aiProvider}
              aiReady={aiReady}
              onOpenSettings={() => setActiveTab('settings')}
              onGenerateReview={generateAIReview}
              cn={cn}
            />
          )}

          {activeTab === 'settings' && <SettingsTabPanel />}
        </AnimatePresence>
      </aside>

      <AppModals
        showFileModal={showFileModal}
        selectedNode={selectedNode}
        setShowFileModal={setShowFileModal}
        showIAModal={showIAModal}
        setShowIAModal={setShowIAModal}
        isReviewing={isReviewing}
        aiError={aiError}
        aiReview={aiReview}
      />

    </div>
  );
}
