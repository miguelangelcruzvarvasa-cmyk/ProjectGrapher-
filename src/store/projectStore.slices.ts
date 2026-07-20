import type { StoreApi } from 'zustand';
import { db } from '../db/projectDB';
import { buildDeepAnalysisGraph, prepareProjectFilesForWorker } from './projectProcessing';
import type { ProjectState } from './projectStore.types';
import { generateAIContextExport, generateCriticalFlowsExport, generateGraphGuideExport, generateProjectBriefExport, generateProjectMetadataExport, generateTreeOnlyExport, hashContext } from './projectExports';
import { buildAIArchitectureNarrative, buildAIAgentHandoff, buildAIRefactorPriorities, buildAIVisionDocument, buildErrorContextPack, buildErrorContextPackData, buildExecutiveContext, buildHotspotReport, buildImpactAnalysisData, buildSemanticSearchResults, buildSmartDiffData, buildSystemView, buildTaskPack, buildTaskPackData, extractProjectInsights, formatProjectPaths } from './projectInsights';
import { DEFAULT_AI_PROVIDER, getDefaultAiModel } from '../config/aiDefaults';
import { APP_CONFIG } from '../config/appConfig';

type SetState = StoreApi<ProjectState>['setState'];
type GetState = StoreApi<ProjectState>['getState'];

let activeAnalysisRunId = 0;
let activeAnalysisWorker: Worker | null = null;
let activeDeepAnalysisController: AbortController | null = null;
const buildApiUrl = (path: string) => `${APP_CONFIG.apiBaseUrl}${path}`;

const getProjectInsights = (get: GetState) => {
  const state = get();
  if (!state.projectData) return null;

  const projectName = state.projectName || APP_CONFIG.projectFallbackName;
  return {
    projectData: state.projectData,
    projectName,
    aiReview: state.aiReview,
    insights: extractProjectInsights(state.projectData, projectName)
  };
};

export const createUiSlice = (set: SetState) => ({
  searchQuery: '',
  treeSearch: '',
  activeTab: 'details' as const,
  isFocusMode: false,
  showFileModal: false,
  showIAModal: false,
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setTreeSearch: (query: string) => set({ treeSearch: query }),
  setActiveTab: (tab: ProjectState['activeTab']) => set({ activeTab: tab }),
  setIsFocusMode: (mode: boolean) => set({ isFocusMode: mode }),
  setShowFileModal: (show: boolean) => set({ showFileModal: show }),
  setShowIAModal: (show: boolean) => set({ showIAModal: show })
});

export const createAiSlice = (set: SetState, get: GetState) => ({
  isReviewing: false,
  aiReview: null,
  aiError: null,
  aiProvider: DEFAULT_AI_PROVIDER as ProjectState['aiProvider'],
  aiModel: getDefaultAiModel(DEFAULT_AI_PROVIDER),
  customUrl: '',
  customKey: '',
  customKeys: {},
  envKeys: {},
  envKeyDetails: {},
  setAiProvider: (provider: ProjectState['aiProvider']) => {
    const { customKeys } = get();
    set({
      aiProvider: provider,
      aiModel: getDefaultAiModel(provider),
      customKey: customKeys[provider] || ''
    });
  },
  setAiModel: (model: string) => set({ aiModel: model }),
  setCustomUrl: (url: string) => set({ customUrl: url }),
  setCustomKey: (key: string) => {
    const { aiProvider, customKeys } = get();
    set({
      customKey: key,
      customKeys: {
        ...customKeys,
        [aiProvider]: key
      }
    });
  },
  checkEnvKeys: async () => {
    try {
      const res = await fetch(buildApiUrl('/api/ai/config'));
      if (!res.ok) {
        throw new Error(`No se pudo consultar la configuración AI del servidor (${res.status})`);
      }

      const raw = await res.text();
      if (!raw.trim()) {
        throw new Error('El servidor devolvió una respuesta vacía al consultar las llaves');
      }

      const data = JSON.parse(raw);
      set({
        envKeys: data.env_keys || {},
        envKeyDetails: data.providers || {}
      });
    } catch (err) {
      console.error('Error checking env keys:', err);
      set({
        envKeys: {},
        envKeyDetails: {}
      });
    }
  },
  generateAIReview: async () => {
    const { generateAIContext, isReviewing, projectData } = get();
    if (!projectData || isReviewing) return;

    set({ isReviewing: true, aiError: null, aiReview: null });

    try {
      const { aiProvider, aiModel, customUrl, customKey } = get();
      const context = generateAIContext();
      const response = await fetch(buildApiUrl('/api/ai/review'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context,
          provider: aiProvider,
          model: aiModel,
          customUrl,
          customKey
        })
      });

      const rawText = await response.text();
      let data: any = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = rawText ? { error: rawText } : {};
      }

      if (!response.ok) {
        const backendMessage = data.detail || data.error || 'Error en el servidor de IA';
        const normalizedProvider = aiProvider.toUpperCase();
        if (response.status === 401) {
          throw new Error(`${backendMessage} Verifica ${normalizedProvider}_API_KEY o la llave escrita en la configuracion.`);
        }
        if (response.status === 429) {
          throw new Error(`${backendMessage} Espera un momento o cambia de proveedor/modelo.`);
        }
        throw new Error(backendMessage);
      }

      if (!data.text) throw new Error('No se recibió respuesta del modelo');
      set({ aiReview: data.text });
    } catch (err: any) {
      console.error('AI Error:', err);
      const msg = err.message || '';
      let friendlyMessage = `Error: ${msg}`;
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_FAILED')) {
        friendlyMessage = 'Error: No se pudo conectar al backend. Asegurate de que el servidor Python esté corriendo (npm run server)';
      }
      set({ aiError: friendlyMessage });
    } finally {
      set({ isReviewing: false });
    }
  },
  generateAIVisionDocument: () => {
    const context = getProjectInsights(get);
    if (!context?.aiReview) return '';
    return buildAIVisionDocument(
      context.projectName,
      context.aiReview,
      context.insights.stack,
      formatProjectPaths(context.projectName, context.insights.entryPoints)
    );
  },
  generateAIArchitectureNarrative: () => {
    const context = getProjectInsights(get);
    if (!context?.aiReview) return '';
    return buildAIArchitectureNarrative(context.projectName, context.aiReview, context.insights.topRelations, context.insights.topHotspots);
  },
  generateAIRefactorPriorities: () => {
    const context = getProjectInsights(get);
    if (!context?.aiReview) return '';
    return buildAIRefactorPriorities(context.projectName, context.aiReview, context.insights.topHotspots);
  },
  generateAIAgentHandoff: (task: string) => {
    const context = getProjectInsights(get);
    if (!context?.aiReview) return '';
    const taskPack = buildTaskPack(context.projectData, context.insights, task, context.aiReview);
    return buildAIAgentHandoff(context.projectName, context.aiReview, taskPack);
  }
});

export const createProjectSlice = (set: SetState, get: GetState) => ({
  projectData: null,
  projectName: '',
  skippedCount: 0,
  selectedNode: null,
  smartDiffData: null,
  projectMemory: {},
  isProcessing: false,
  processingProgress: {
    stage: 'idle',
    message: '',
    current: 0,
    total: 0,
    ratio: 0
  },
  useDeepAnalysis: true,
  lastContextHash: null,
  contextHistory: [],
  setProjectData: (data: ProjectState['projectData']) => set({ projectData: data }),
  setSkippedCount: (count: number) => set({ skippedCount: count }),
  setSelectedNode: (node: ProjectState['selectedNode']) => set({ selectedNode: node }),
  setProcessingProgress: (progress: ProjectState['processingProgress']) => set({ processingProgress: progress }),
  setProjectGlobalMemory: (note: string) => {
    const { projectName, projectMemory } = get();
    if (!projectName) return;
    const existing = projectMemory[projectName] || { globalNote: '', fileNotes: {} };
    set({
      projectMemory: {
        ...projectMemory,
        [projectName]: {
          ...existing,
          globalNote: note
        }
      }
    });
  },
  setProjectFileMemory: (filePath: string, note: string) => {
    const { projectName, projectMemory } = get();
    if (!projectName) return;
    const existing = projectMemory[projectName] || { globalNote: '', fileNotes: {} };
    set({
      projectMemory: {
        ...projectMemory,
        [projectName]: {
          ...existing,
          fileNotes: {
            ...existing.fileNotes,
            [filePath]: note
          }
        }
      }
    });
  },
  setUseDeepAnalysis: (mode: boolean) => set({ useDeepAnalysis: mode }),
  closeProject: async () => {
    activeAnalysisRunId += 1;
    activeAnalysisWorker?.terminate();
    activeAnalysisWorker = null;
    activeDeepAnalysisController?.abort();
    activeDeepAnalysisController = null;

    set({
      projectData: null,
      projectName: '',
      skippedCount: 0,
      selectedNode: null,
      smartDiffData: null,
      aiReview: null,
      aiError: null,
      processingProgress: {
        stage: 'idle',
        message: '',
        current: 0,
        total: 0,
        ratio: 0
      },
      activeTab: 'details'
    });
    await db.projects.clear();
  },
  checkContextDuplicate: (content: string) => {
    const { lastContextHash } = get();
    if (!lastContextHash) return false;
    return hashContext(content) === lastContextHash;
  },
  recordContextSent: (content: string, task: string) => {
    const { contextHistory } = get();
    const hash = hashContext(content);
    const newEntry = { hash, timestamp: Date.now(), task };
    const updatedHistory = [newEntry, ...contextHistory].slice(0, 20);
    set({ lastContextHash: hash, contextHistory: updatedHistory });
  },
  getContextHistory: () => {
    return get().contextHistory;
  },
  refreshSmartDiff: async () => {
    const { projectData, projectName } = get();
    if (!projectData || !projectName) {
      set({ smartDiffData: null });
      return;
    }

    const history = (await db.projects.orderBy('timestamp').reverse().toArray())
      .filter((item) => item.name === projectName);

    if (history.length < 2) {
      set({ smartDiffData: null });
      return;
    }

    const currentRecord = history[0];
    const previousRecord = history[1];
    const baselineLabel = new Date(previousRecord.timestamp).toLocaleString();
    const currentLabel = new Date(currentRecord.timestamp).toLocaleString();

    set({
      smartDiffData: buildSmartDiffData(previousRecord.data, currentRecord.data, projectName, baselineLabel, currentLabel)
    });
  },
  performDeepAnalysis: async () => {
    const { projectData } = get();
    if (!projectData || projectData.files.length === 0) return;

    const runId = activeAnalysisRunId;
    activeDeepAnalysisController?.abort();
    const controller = new AbortController();
    activeDeepAnalysisController = controller;

    // Filter files supported by the backend deep analysis (Python Jedi, etc.)
    const backendSupportedExtensions = ['py', 'cs', 'go', 'rs'];
    const filesToAnalyze = projectData.files
      .filter(file => backendSupportedExtensions.includes(file.ext.replace('.', '').toLowerCase()))
      .map((file) => ({
        path: file.path,
        content: file.content,
        ext: file.ext.replace('.', '')
      }));

    // If there are no files to analyze deep, skip HTTP request entirely and finish
    if (filesToAnalyze.length === 0) {
      if (runId === activeAnalysisRunId) {
        set({
          isProcessing: false,
          processingProgress: {
            stage: 'idle',
            message: '',
            current: 0,
            total: 0,
            ratio: 0
          }
        });
      }
      return;
    }

    set({
      isProcessing: true,
      processingProgress: {
        stage: 'deep-analysis',
        message: 'Refinando el grafo con el backend Python...',
        current: 0,
        total: filesToAnalyze.length,
        ratio: 0.85
      }
    });
    try {
      const response = await fetch(buildApiUrl('/api/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesToAnalyze }),
        signal: controller.signal
      });

      const data = await response.json();
      if (runId !== activeAnalysisRunId || controller !== activeDeepAnalysisController) {
        return;
      }

      const nextGraph = buildDeepAnalysisGraph(projectData, data.analysis);
      set({
        projectData: { ...projectData, nodes: nextGraph.nodes, links: nextGraph.links },
        processingProgress: {
          stage: 'deep-analysis',
          message: 'Aplicando refinamiento final y preparando la vista del proyecto...',
          current: filesToAnalyze.length,
          total: filesToAnalyze.length,
          ratio: 0.98
        }
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return;
      }
      console.error('Deep Analysis Error:', err);
    } finally {
      if (controller === activeDeepAnalysisController) {
        activeDeepAnalysisController = null;
      }
      if (runId === activeAnalysisRunId) {
        set({
          isProcessing: false,
          processingProgress: {
            stage: 'idle',
            message: '',
            current: 0,
            total: 0,
            ratio: 0
          }
        });
      }
    }
  },
  loadLastProject: async () => {
    const lastProject = await db.projects.orderBy('timestamp').last();
    if (!lastProject) return;
    set({ projectData: lastProject.data, projectName: lastProject.name || '' });
    await get().refreshSmartDiff();
  },
  processFiles: async (fileList: FileList) => {
    const runId = ++activeAnalysisRunId;
    activeAnalysisWorker?.terminate();
    activeAnalysisWorker = null;
    activeDeepAnalysisController?.abort();
    activeDeepAnalysisController = null;

    set({
      isProcessing: true,
      projectData: null,
      projectName: '',
      selectedNode: null,
      skippedCount: 0,
      smartDiffData: null,
      aiReview: null,
      aiError: null,
      processingProgress: {
        stage: 'scanning',
        message: 'Preparando la carga del proyecto...',
        current: 0,
        total: fileList.length,
        ratio: 0.02
      }
    });

    if (!fileList.length) {
      if (runId === activeAnalysisRunId) {
        set({
          isProcessing: false,
          processingProgress: {
            stage: 'idle',
            message: '',
            current: 0,
            total: 0,
            ratio: 0
          }
        });
      }
      return;
    }

    // Yield to the browser here to let React render the loading modal!
    await new Promise((resolve) => setTimeout(resolve, 80));

    const { projectName, skippedCount, workerInput } = await prepareProjectFilesForWorker(fileList, (progress) => {
      if (runId !== activeAnalysisRunId) return;
      set({ processingProgress: progress });
    });
    if (runId !== activeAnalysisRunId) {
      return;
    }

    if (!workerInput.length) {
      set({
        isProcessing: false,
        projectName,
        skippedCount,
        processingProgress: {
          stage: 'idle',
          message: '',
          current: 0,
          total: 0,
          ratio: 0
        }
      });
      return;
    }

    set({
      projectName,
      processingProgress: {
        stage: 'graph',
        message: 'Enviando archivos al motor determinístico del grafo...',
        current: 0,
        total: workerInput.length,
        ratio: 0.55
      }
    });

    const worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' });
    activeAnalysisWorker = worker;
    worker.postMessage({ files: workerInput });

    worker.onmessage = async (e) => {
      if (runId !== activeAnalysisRunId) {
        worker.terminate();
        if (activeAnalysisWorker === worker) {
          activeAnalysisWorker = null;
        }
        return;
      }

      if (e.data?.progress) {
        set({ processingProgress: e.data.progress });
        return;
      }

      const { projectData } = e.data;
      set({
        projectData,
        skippedCount,
        processingProgress: {
          stage: 'persisting',
          message: 'Guardando snapshot local y preparando comparación histórica...',
          current: 1,
          total: 2,
          ratio: 0.75
        }
      });

      await db.projects.add({
        name: projectName,
        data: projectData,
        timestamp: Date.now()
      });

      worker.terminate();
      if (activeAnalysisWorker === worker) {
        activeAnalysisWorker = null;
      }

      if (runId !== activeAnalysisRunId) {
        return;
      }

      await get().refreshSmartDiff();

      if (get().useDeepAnalysis) {
        await get().performDeepAnalysis();
        return;
      }

      if (runId === activeAnalysisRunId) {
        set({
          isProcessing: false,
          processingProgress: {
            stage: 'idle',
            message: '',
            current: 0,
            total: 0,
            ratio: 0
          }
        });
      }
    };

    worker.onerror = (err) => {
      console.error('Worker Error:', err);
      worker.terminate();
      if (activeAnalysisWorker === worker) {
        activeAnalysisWorker = null;
      }
      if (runId === activeAnalysisRunId) {
        set({
          isProcessing: false,
          processingProgress: {
            stage: 'idle',
            message: '',
            current: 0,
            total: 0,
            ratio: 0
          }
        });
      }
    };
  },
  generateAIContext: () => {
    const { projectData, projectName } = get();
    if (!projectData) return '';
    return generateAIContextExport(projectData, projectName || APP_CONFIG.projectFallbackName);
  },
  generateExecutiveView: () => {
    const context = getProjectInsights(get);
    if (!context) return '';
    return buildExecutiveContext(context.insights, context.projectData.files.length, context.projectData.links.length, context.aiReview);
  },
  generateSystemView: () => {
    const context = getProjectInsights(get);
    if (!context) return '';
    return buildSystemView(context.insights, context.aiReview);
  },
  generateHotspotReport: () => {
    const context = getProjectInsights(get);
    if (!context) return '';
    return buildHotspotReport(context.insights, context.aiReview);
  },
  generateTaskPackData: (task: string) => {
    const context = getProjectInsights(get);
    if (!context) return null;
    return buildTaskPackData(context.projectData, context.insights, task);
  },
  generateTaskPack: (task: string) => {
    const context = getProjectInsights(get);
    if (!context) return '';
    return buildTaskPack(context.projectData, context.insights, task, context.aiReview);
  },
  generateErrorContextPackData: (rawError: string) => {
    const context = getProjectInsights(get);
    if (!context) return null;
    return buildErrorContextPackData(context.projectData, context.insights, rawError);
  },
  generateErrorContextPack: (rawError: string) => {
    const context = getProjectInsights(get);
    if (!context) return '';
    return buildErrorContextPack(context.projectData, context.insights, rawError);
  },
  generateSemanticSearchResults: (query: string) => {
    const context = getProjectInsights(get);
    if (!context) return null;
    return buildSemanticSearchResults(context.projectData, context.projectName, query);
  },
  generateImpactAnalysisData: (nodeId: string) => {
    const context = getProjectInsights(get);
    if (!context) return null;
    return buildImpactAnalysisData(context.projectData, context.projectName, nodeId);
  },
  generateProjectBrief: () => {
    const { projectData, projectName } = get();
    if (!projectData) return '';
    return generateProjectBriefExport(projectData, projectName || APP_CONFIG.projectFallbackName);
  },
  generateProjectMetadata: () => {
    const { projectData, projectName } = get();
    if (!projectData) return '';
    return generateProjectMetadataExport(projectData, projectName || APP_CONFIG.projectFallbackName);
  },
  generateGraphGuide: () => {
    const { projectData, projectName } = get();
    if (!projectData) return '';
    return generateGraphGuideExport(projectData, projectName || APP_CONFIG.projectFallbackName);
  },
  generateCriticalFlows: () => {
    const { projectData, projectName } = get();
    if (!projectData) return '';
    return generateCriticalFlowsExport(projectData, projectName || APP_CONFIG.projectFallbackName);
  },
  generateTreeOnly: () => {
    const { projectData, projectName } = get();
    if (!projectData) return '';
    return generateTreeOnlyExport(projectData, projectName || APP_CONFIG.projectFallbackName);
  }
});
