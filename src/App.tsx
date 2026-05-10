/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import {
  Upload, Network, Code2,
  FileText, ChevronRight, X, Play,
  Search, Info, Database, Download,
  LayoutDashboard, Share2, Folder,
  Sparkles, AlertCircle, Loader2, BarChart3, Activity, Settings, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { GraphCanvas } from './components/GraphCanvas';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Modal } from './components/Modal';
import { TreeItem } from './components/TreeItem';
import { NavItem } from './components/NavItem';
import { AIConfig } from './components/AIConfig';

import { useProjectStore } from './store/useProjectStore';
import { buildFileTree, calculateAAMetrics } from './utils/analysis';
import Markdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const {
    projectData, skippedCount, selectedNode, smartDiffData, projectMemory, isProcessing, isReviewing,
    searchQuery, treeSearch, activeTab, isFocusMode, aiReview, aiError,
    showFileModal, showIAModal,
    setProjectData, setSelectedNode, setSearchQuery, setTreeSearch,
    setActiveTab, setIsFocusMode, processFiles, loadLastProject,
    generateAIReview, generateAIContext, generateExecutiveView, generateSystemView, generateHotspotReport, generateTaskPackData, generateTaskPack, generateErrorContextPackData, generateErrorContextPack, generateSemanticSearchResults, generateImpactAnalysisData, generateProjectBrief, generateProjectMetadata, generateGraphGuide, generateTreeOnly, setShowFileModal, setShowIAModal,
    generateAIVisionDocument, generateAIArchitectureNarrative, generateAIRefactorPriorities, generateAIAgentHandoff,
    aiProvider, aiModel, customUrl, customKey, envKeys, checkEnvKeys,
    setAiProvider, setAiModel, setCustomUrl, setCustomKey, setProjectGlobalMemory, setProjectFileMemory, projectName,
    closeProject
  } = useProjectStore();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [agentTask, setAgentTask] = useState('Ajusta el perfil del usuario y encuentra los archivos que debo modificar.');
  const [errorTraceInput, setErrorTraceInput] = useState('TypeError: Cannot read properties of undefined (reading \'map\')\n    at src/components/GraphCanvas.tsx:128:18\n    at src/App.tsx:512:7');
  const [semanticQuery, setSemanticQuery] = useState('dónde vive autenticación');
  const [exportSection, setExportSection] = useState<'guided' | 'task' | 'errors' | 'ai' | 'exports'>('guided');
  const [isSavingAIDocs, setIsSavingAIDocs] = useState(false);
  const [aiDocsSaveStatus, setAIDocsSaveStatus] = useState<string | null>(null);
  const lastAutoSavedReviewRef = useRef<string | null>(null);

  useEffect(() => {
    loadLastProject();
    checkEnvKeys();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const updateLayout = () => {
      const desktop = media.matches;
      setIsDesktopLayout(desktop);
      if (desktop) {
        setShowMobilePanel(false);
      }
    };

    updateLayout();
    media.addEventListener('change', updateLayout);
    return () => media.removeEventListener('change', updateLayout);
  }, []);

  const hasServerKey = !!envKeys[aiProvider];
  const hasEffectiveKey = aiProvider === 'ollama' || !!customKey || hasServerKey;
  const aiReady = hasEffectiveKey && !!projectData;

  // Manejar Escape para quitar foco de nodos
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNode(null);
        setIsFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [setSelectedNode, setIsFocusMode]);

  const filteredNodes = useMemo(() => {
    if (!projectData) return [];
    let baseNodes = projectData.nodes;

    if (searchQuery) {
      baseNodes = baseNodes.filter(n =>
        n.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (isFocusMode && selectedNode) {
      const neighbors = new Set<string>([selectedNode.id]);
      projectData.links.forEach((l: any) => {
        const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
        const tId = typeof l.target === 'string' ? l.target : (l.target as any).id;
        if (sId === selectedNode.id) neighbors.add(tId);
        if (tId === selectedNode.id) neighbors.add(sId);
      });
      return baseNodes.filter(n => neighbors.has(n.id));
    }

    return baseNodes;
  }, [projectData, searchQuery, isFocusMode, selectedNode]);

  const architectureMetrics = useMemo(() => {
    if (!projectData) return null;
    return calculateAAMetrics(projectData.files, projectData.links);
  }, [projectData]);

  const handleGraphNodeClick = useCallback((node: any) => {
    setSelectedNode(node);
    setShowFileModal(true);
  }, [setSelectedNode, setShowFileModal]);

  const getAIDocumentExports = useCallback(() => {
    if (!aiReview) return [];

    return [
      { filename: `${projectName}_vision_ai.md`, content: generateAIVisionDocument() },
      { filename: `${projectName}_architecture_narrative_ai.md`, content: generateAIArchitectureNarrative() },
      { filename: `${projectName}_refactor_priorities_ai.md`, content: generateAIRefactorPriorities() },
      { filename: `${projectName}_agent_handoff_ai.md`, content: generateAIAgentHandoff(agentTask) }
    ].filter((file) => file.content.trim().length > 0);
  }, [
    aiReview,
    projectName,
    agentTask,
    generateAIVisionDocument,
    generateAIArchitectureNarrative,
    generateAIRefactorPriorities,
    generateAIAgentHandoff
  ]);

  const saveFilesToContext = useCallback(async (files: { filename: string; content: string }[], mode: 'auto' | 'manual' = 'manual') => {
    if (!files.length) return;

    setIsSavingAIDocs(true);
    if (mode === 'manual') {
      setAIDocsSaveStatus(null);
    }

    try {
      const response = await fetch('/api/context/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, files })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || 'No se pudieron guardar los documentos IA en contexto/');
      }

      const targetDirectory = payload.relative_directory || 'contexto/';
      setAIDocsSaveStatus(`Guardados en ${targetDirectory}: ${payload.saved.join(', ')}`);
    } catch (error: any) {
      console.error('Error saving AI docs to contexto:', error);
      setAIDocsSaveStatus(error.message || 'No se pudieron guardar los documentos IA en contexto/');
    } finally {
      setIsSavingAIDocs(false);
    }
  }, [projectName]);

  useEffect(() => {
    if (!aiReview) {
      lastAutoSavedReviewRef.current = null;
      return;
    }

    if (lastAutoSavedReviewRef.current === aiReview) {
      return;
    }

    const files = getAIDocumentExports();
    if (!files.length) return;

    lastAutoSavedReviewRef.current = aiReview;
    void saveFilesToContext(files, 'auto');
  }, [aiReview, getAIDocumentExports, saveFilesToContext]);

  const handleDownloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    const text = generateAIContext();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openPanelTab = (tab: 'details' | 'context' | 'files' | 'ia' | 'settings') => {
    setActiveTab(tab);
    if (!isDesktopLayout) {
      setShowMobilePanel(true);
    }
  };

  const taskPackData = generateTaskPackData(agentTask);
  const taskPackPreview = generateTaskPack(agentTask);
  const errorContextPackData = generateErrorContextPackData(errorTraceInput);
  const errorContextPackPreview = generateErrorContextPack(errorTraceInput);
  const semanticSearchResults = generateSemanticSearchResults(semanticQuery);
  const impactAnalysisData = selectedNode ? generateImpactAnalysisData(selectedNode.id) : null;
  const activeProjectMemory = projectMemory[projectName || ''] || { globalNote: '', fileNotes: {} };
  const selectedNodeMemory = selectedNode ? (activeProjectMemory.fileNotes[selectedNode.id] || '') : '';

  const focusNodeByProjectPath = useCallback((projectPath: string) => {
    if (!projectData || !projectPath) return;

    const normalized = projectPath.replace(/\\/g, '/').toLowerCase();
    const projectPrefix = `${(projectName || '').replace(/\\/g, '/').toLowerCase()}/`;
    const relativePath = normalized.startsWith(projectPrefix) ? normalized.slice(projectPrefix.length) : normalized;

    const node = projectData.nodes.find((item) => {
      const nodePath = item.id.replace(/\\/g, '/').toLowerCase();
      return nodePath === relativePath || nodePath === normalized || normalized.endsWith(`/${nodePath}`);
    });

    if (!node) return;
    setSelectedNode(node);
    setIsFocusMode(true);
    setActiveTab('details');
  }, [projectData, projectName, setActiveTab, setIsFocusMode, setSelectedNode]);

  if (!projectData) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-bg p-4 sm:p-6">
        <div className="absolute left-[-10%] top-[-10%] h-[40%] w-[40%] rounded-full bg-brand-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-brand-secondary/10 blur-[120px]" />

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

          <p className="mx-auto mb-10 max-w-xl text-base leading-relaxed text-gray-400 font-sans sm:text-lg lg:mb-12 lg:text-xl">
            Analiza la arquitectura de tu proyecto localmente. Visualiza dependencias y genera prompts eficientes para tus agentes de IA.
          </p>

          <div className="flex flex-col items-center gap-6">
            <div className="relative max-w-sm group w-full">
              <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500" />
              <label className={cn(
                "relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all duration-300 sm:p-10 lg:p-12",
                "bg-brand-surface/50 border-gray-800 hover:border-brand-primary/50 hover:bg-brand-surface/80",
                isProcessing && "pointer-events-none"
              )}>
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
                      onChange={(e) => e.target.files && processFiles(e.target.files)}
                    />
                  </>
                )}
              </label>
            </div>

            <button
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm font-medium"
            >
              <Sparkles className="w-4 h-4" /> Configurar Proveedor de IA
            </button>
          </div>

          <Modal isOpen={showSettingsModal} onClose={() => setShowSettingsModal(false)} title="Configuración de IA">
            <div className="space-y-6">
              <AIConfig />
              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-full py-4 bg-brand-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all"
              >
                Guardar y Cerrar
              </button>
            </div>
          </Modal>
        </motion.div>
      </div>
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

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Consumidores directos</div>
                          {impactAnalysisData.directDependents.length ? impactAnalysisData.directDependents.slice(0, 4).map((item) => (
                            <div key={item.path} className="rounded-2xl border border-white/6 bg-black/20 p-3">
                              <div className="break-all font-mono text-xs text-white">{item.path}</div>
                              <div className="mt-1 text-[11px] text-gray-500">{item.reasons[0]}</div>
                            </div>
                          )) : (
                            <div className="text-xs text-gray-500">No se detectaron consumidores directos.</div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Dependencias directas</div>
                          {impactAnalysisData.directDependencies.length ? impactAnalysisData.directDependencies.slice(0, 4).map((item) => (
                            <div key={item.path} className="rounded-2xl border border-white/6 bg-black/20 p-3">
                              <div className="break-all font-mono text-xs text-white">{item.path}</div>
                              <div className="mt-1 text-[11px] text-gray-500">{item.reasons[0]}</div>
                            </div>
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
                                <div key={path} className="break-all font-mono text-xs text-white">{path}</div>
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
                        <button
                          onClick={() => void saveFilesToContext(getAIDocumentExports(), 'manual')}
                          disabled={isSavingAIDocs}
                          className={cn(
                            "rounded-2xl px-4 py-2 text-xs font-bold transition-all",
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
                              <div key={file.path} className="rounded-xl border border-white/6 bg-white/[0.03] p-3">
                                <div className="break-all font-mono text-xs text-white">{file.path}</div>
                                <div className="mt-1 text-[11px] text-gray-400">Impacto: {file.importance} · Score: {file.score}</div>
                                <div className="mt-2 space-y-1">
                                  {file.reasons.map((reason) => (
                                    <div key={reason} className="text-[11px] text-gray-500">- {reason}</div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Archivos relacionados</div>
                          <div className="space-y-2">
                            {taskPackData.relatedFiles.slice(0, 4).map((file) => (
                              <div key={file.path} className="rounded-xl border border-white/6 bg-white/[0.03] p-3">
                                <div className="break-all font-mono text-xs text-white">{file.path}</div>
                                <div className="mt-1 text-[11px] text-gray-500">{file.reasons[0]}</div>
                              </div>
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
                            <div className="rounded-xl border border-white/6 bg-white/[0.03] p-3">
                              <div className="break-all font-mono text-xs text-white">{errorContextPackData.probableOrigin.path}</div>
                              <div className="mt-1 text-[11px] text-gray-400">Impacto: {errorContextPackData.probableOrigin.importance} · Score: {errorContextPackData.probableOrigin.score}</div>
                              <div className="mt-2 space-y-1">
                                {errorContextPackData.probableOrigin.reasons.map((reason) => (
                                  <div key={reason} className="text-[11px] text-gray-500">- {reason}</div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-500">No se detectó un origen con alta confianza.</div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Vecinos relevantes</div>
                          <div className="space-y-2">
                            {errorContextPackData.relatedFiles.slice(0, 5).map((file) => (
                              <div key={file.path} className="rounded-xl border border-white/6 bg-white/[0.03] p-3">
                                <div className="break-all font-mono text-xs text-white">{file.path}</div>
                                <div className="mt-1 text-[11px] text-gray-500">{file.reasons[0]}</div>
                              </div>
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
                <div className="space-y-3 rounded-3xl border border-white/6 bg-black/20 p-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-400">Exportes Base</div>
                  <p className="text-sm leading-relaxed text-gray-400">
                    Artefactos determinísticos para compartir, archivar o pasar a otro agente sin depender de una auditoría IA.
                  </p>
                </div>

                <div className="space-y-4">
                   <div className="group flex flex-col gap-4 rounded-[2rem] border border-gray-800 bg-brand-bg/40 p-5 transition-all hover:border-brand-primary/50 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="flex items-center gap-5">
                         <div className="p-4 bg-brand-primary/10 rounded-2xl group-hover:bg-brand-primary/20 transition-colors">
                            <Database className="w-6 h-6 text-brand-primary" />
                         </div>
                         <div>
                            <h4 className="text-white font-bold">Contexto de Arquitectura</h4>
                            <p className="text-xs text-gray-500">Prompt optimizado por tokens</p>
                         </div>
                      </div>
                      <button 
                        onClick={() => handleDownloadFile(generateAIContext(), `${projectName}_snapshot.md`, 'text/markdown')}
                        className="p-3 text-gray-500 hover:text-white transition-colors"
                      >
                         <Download className="w-6 h-6" />
                      </button>
                   </div>

                   <div className="group flex flex-col gap-4 rounded-[2rem] border border-gray-800 bg-brand-bg/40 p-5 transition-all hover:border-sky-500/50 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="flex items-center gap-5">
                         <div className="p-4 bg-sky-500/10 rounded-2xl group-hover:bg-sky-500/20 transition-colors">
                            <FileText className="w-6 h-6 text-sky-400" />
                         </div>
                         <div>
                            <h4 className="text-white font-bold">Resumen Ejecutivo</h4>
                            <p className="text-xs text-gray-500">Brief local para otros agentes</p>
                         </div>
                      </div>
                      <button 
                        onClick={() => handleDownloadFile(generateProjectBrief(), `${projectName}_brief.md`, 'text/markdown')}
                        className="p-3 text-gray-500 hover:text-white transition-colors"
                      >
                         <Download className="w-6 h-6" />
                      </button>
                   </div>

                   <div className="group flex flex-col gap-4 rounded-[2rem] border border-gray-800 bg-brand-bg/40 p-5 transition-all hover:border-amber-500/50 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="flex items-center gap-5">
                         <div className="p-4 bg-amber-500/10 rounded-2xl group-hover:bg-amber-500/20 transition-colors">
                            <Code2 className="w-6 h-6 text-amber-400" />
                         </div>
                         <div>
                            <h4 className="text-white font-bold">Resumen Técnico JSON</h4>
                            <p className="text-xs text-gray-500">Ficha local de stack, capas y hotspots</p>
                         </div>
                      </div>
                      <button 
                        onClick={() => handleDownloadFile(generateProjectMetadata(), `${projectName}_project_summary.json`, 'application/json')}
                        className="p-3 text-gray-500 hover:text-white transition-colors"
                      >
                         <Download className="w-6 h-6" />
                      </button>
                   </div>

                   <div className="group flex flex-col gap-4 rounded-[2rem] border border-gray-800 bg-brand-bg/40 p-5 transition-all hover:border-emerald-500/50 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="flex items-center gap-5">
                         <div className="p-4 bg-emerald-500/10 rounded-2xl group-hover:bg-emerald-500/20 transition-colors">
                            <Share2 className="w-6 h-6 text-emerald-400" />
                         </div>
                         <div>
                            <h4 className="text-white font-bold">Guía del Grafo</h4>
                            <p className="text-xs text-gray-500">Explica conexiones útiles para otro agente</p>
                         </div>
                      </div>
                      <button 
                        onClick={() => handleDownloadFile(generateGraphGuide(), `${projectName}_graph_guide.md`, 'text/markdown')}
                        className="p-3 text-gray-500 hover:text-white transition-colors"
                      >
                         <Download className="w-6 h-6" />
                      </button>
                   </div>

                   <div className="group flex flex-col gap-4 rounded-[2rem] border border-gray-800 bg-brand-bg/40 p-5 transition-all hover:border-brand-secondary/50 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="flex items-center gap-5">
                         <div className="p-4 bg-brand-secondary/10 rounded-2xl group-hover:bg-brand-secondary/20 transition-colors">
                            <Network className="w-6 h-6 text-brand-secondary" />
                         </div>
                         <div>
                            <h4 className="text-white font-bold">Mapa Arquitectónico JSON</h4>
                            <p className="text-xs text-gray-500">Relaciones locales entre archivos</p>
                         </div>
                      </div>
                      <button 
                        onClick={() => handleDownloadFile(JSON.stringify(projectData, null, 2), `${projectName}_architecture_map.json`, 'application/json')}
                        className="p-3 text-gray-500 hover:text-white transition-colors"
                      >
                         <Download className="w-6 h-6" />
                      </button>
                   </div>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="flex flex-col gap-4 rounded-3xl border border-white/5 bg-brand-bg/20 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4">
                       <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] w-24 leading-tight">Vista Previa Snapshot</h5>
                       <div className="px-4 py-2 bg-brand-primary/10 text-brand-primary text-[10px] font-black rounded-full border border-brand-primary/20 flex flex-col items-center justify-center min-w-[80px]">
                          <span className="opacity-60 text-[8px]">~{Math.round(generateAIContext().length / 4).toLocaleString()}</span>
                          <span>TOKENS</span>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-6">
                       <button 
                         onClick={() => handleDownloadFile(generateAIContext(), `${projectName}_snapshot.md`, 'text/markdown')}
                         className="flex items-center gap-2 text-[10px] font-black text-emerald-500 hover:text-emerald-400 transition-colors uppercase tracking-widest group"
                       >
                         <Download className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" />
                         <span>Descargar Snapshot</span>
                       </button>
                    </div>
                  </div>
                  
                  <div className="group relative max-h-[400px] overflow-auto rounded-[2rem] border border-white/5 bg-black/40 p-4 font-mono text-[10px] text-gray-400 custom-scrollbar sm:p-6 lg:p-7 xl:p-8">
                    <pre className="whitespace-pre leading-relaxed">{generateAIContext()}</pre>
                  </div>
                </div>
                </>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'ia' && (
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
                           onClick={() => setActiveTab('settings')}
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
                        onClick={generateAIReview}
                        disabled={!aiReady}
                        className={cn(
                          "px-8 py-3 rounded-2xl text-sm font-bold transition-all",
                          (!aiReady)
                            ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                            : "bg-brand-primary text-white hover:brightness-110 shadow-lg shadow-brand-primary/20"
                        )}
                      >
                        Generar Auditoría Ahora
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div key="settings" className="custom-scrollbar h-full space-y-6 overflow-y-auto p-4 sm:p-6 lg:p-7 xl:p-8">
              <h3 className="text-2xl font-bold text-white">Configuración AI</h3>
              <AIConfig />
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* --- MODALS --- */}

      <Modal isOpen={showFileModal && !!selectedNode} onClose={() => setShowFileModal(false)} title={selectedNode?.label || ""}>
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

    </div>
  );
}
