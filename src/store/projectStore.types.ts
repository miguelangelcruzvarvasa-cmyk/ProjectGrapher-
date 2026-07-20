import { GraphLink, GraphNode, ProjectData } from '../types';

export type ProjectInsights = {
  projectName: string;
  stack: string[];
  directories: string[];
  entryPoints: string[];
  dominantFileTypes: string[];
  topHotspots: {
    label: string;
    path: string;
    importance: number;
    ext: string;
    role: string;
    confidence: 'high' | 'medium';
    evidence: 'code' | 'path+code' | 'path';
    complexity: 'low' | 'medium' | 'high';
    lines: number;
    exports: string[];
  }[];
  topRelations: string[];
  graphLeaders: {
    label: string;
    path: string;
    outgoing: number;
    incoming: number;
    total: number;
    outgoingTargets: string[];
    incomingSources: string[];
  }[];
  layerEntries: { layer: string; files: string[]; count: number }[];
};

export type TaskPackFileCandidate = {
  path: string;
  importance: number;
  score: number;
  reasons: string[];
};

export type AgentTaskPackData = {
  task: string;
  projectName: string;
  projectSummary: string;
  stack: string[];
  entryPoints: string[];
  primaryFiles: TaskPackFileCandidate[];
  relatedFiles: TaskPackFileCandidate[];
  readingOrder: string[];
  implementationFocus: string[];
};

export type ErrorContextFileCandidate = {
  path: string;
  nodeId: string;
  importance: number;
  score: number;
  reasons: string[];
  relation: 'origin' | 'neighbor' | 'entry' | 'hotspot';
};

export type ErrorContextPackData = {
  rawError: string;
  errorHeadline: string;
  summary: string;
  projectName: string;
  stack: string[];
  stackPaths: string[];
  matchedSignals: string[];
  probableOrigin: ErrorContextFileCandidate | null;
  relatedFiles: ErrorContextFileCandidate[];
  readingOrder: string[];
  implementationFocus: string[];
  modelPrompt: string;
};

export type SemanticSearchResult = {
  query: string;
  summary: string;
  primaryFiles: TaskPackFileCandidate[];
  relatedFiles: TaskPackFileCandidate[];
};

export type ImpactedFile = {
  path: string;
  relation: 'depends_on' | 'used_by' | 'second_order';
  importance: number;
  reasons: string[];
};

export type ImpactAnalysisData = {
  targetPath: string;
  summary: string;
  directDependencies: ImpactedFile[];
  directDependents: ImpactedFile[];
  secondaryImpact: ImpactedFile[];
};

export type SmartDiffData = {
  projectName: string;
  baselineLabel: string;
  currentLabel: string;
  addedFiles: string[];
  removedFiles: string[];
  addedRelations: string[];
  removedRelations: string[];
  summary: string;
};

export type ProjectMemoryEntry = {
  globalNote: string;
  fileNotes: Record<string, string>;
};

export type ProcessingStage =
  | 'idle'
  | 'scanning'
  | 'reading'
  | 'graph'
  | 'persisting'
  | 'deep-analysis';

export type ProcessingProgress = {
  stage: ProcessingStage;
  message: string;
  current: number;
  total: number;
  ratio: number;
};

export interface ProjectState {
  projectData: ProjectData | null;
  projectName: string;
  skippedCount: number;
  selectedNode: GraphNode | null;
  smartDiffData: SmartDiffData | null;
  projectMemory: Record<string, ProjectMemoryEntry>;
  isProcessing: boolean;
  processingProgress: ProcessingProgress;
  isReviewing: boolean;
  searchQuery: string;
  treeSearch: string;
  activeTab: 'details' | 'context' | 'files' | 'ia' | 'settings';
  isFocusMode: boolean;
  aiReview: string | null;
  aiError: string | null;
  aiProvider: 'gemini' | 'openai' | 'groq' | 'deepseek' | 'ollama' | 'openrouter' | 'mistral' | 'custom';
  aiModel: string;
  customUrl: string;
  customKey: string;
  customKeys: Record<string, string>;
  useDeepAnalysis: boolean;
  showFileModal: boolean;
  showIAModal: boolean;
  envKeys: Record<string, boolean>;
  envKeyDetails: Record<string, { configured: boolean; envVar: string; source: 'env' | 'none' }>;
  lastContextHash: string | null;
  contextHistory: { hash: string; timestamp: number; task: string }[];
  setProjectData: (data: ProjectData | null) => void;
  setSkippedCount: (count: number) => void;
  setSelectedNode: (node: GraphNode | null) => void;
  setProcessingProgress: (progress: ProcessingProgress) => void;
  setSearchQuery: (query: string) => void;
  setTreeSearch: (query: string) => void;
  setActiveTab: (tab: 'details' | 'context' | 'files' | 'ia' | 'settings') => void;
  setIsFocusMode: (mode: boolean) => void;
  setProjectGlobalMemory: (note: string) => void;
  setProjectFileMemory: (filePath: string, note: string) => void;
  setAiProvider: (provider: 'gemini' | 'openai' | 'groq' | 'deepseek' | 'ollama' | 'openrouter' | 'mistral' | 'custom') => void;
  setAiModel: (model: string) => void;
  setCustomUrl: (url: string) => void;
  setCustomKey: (key: string) => void;
  setUseDeepAnalysis: (mode: boolean) => void;
  setShowFileModal: (show: boolean) => void;
  setShowIAModal: (show: boolean) => void;
  checkEnvKeys: () => Promise<void>;
  processFiles: (files: FileList) => Promise<void>;
  performDeepAnalysis: () => Promise<void>;
  loadLastProject: () => Promise<void>;
  generateAIReview: () => Promise<void>;
  generateAIContext: () => string;
  generateExecutiveView: () => string;
  generateSystemView: () => string;
  generateHotspotReport: () => string;
  generateTaskPackData: (task: string) => AgentTaskPackData | null;
  generateTaskPack: (task: string) => string;
  generateErrorContextPackData: (rawError: string) => ErrorContextPackData | null;
  generateErrorContextPack: (rawError: string) => string;
  generateSemanticSearchResults: (query: string) => SemanticSearchResult | null;
  generateImpactAnalysisData: (nodeId: string) => ImpactAnalysisData | null;
  generateProjectBrief: () => string;
  generateProjectMetadata: () => string;
  generateGraphGuide: () => string;
  generateCriticalFlows: () => string;
  generateTreeOnly: () => string;
  generateAIVisionDocument: () => string;
  generateAIArchitectureNarrative: () => string;
  generateAIRefactorPriorities: () => string;
  generateAIAgentHandoff: (task: string) => string;
  refreshSmartDiff: () => Promise<void>;
  closeProject: () => void;
  checkContextDuplicate: (content: string) => boolean;
  recordContextSent: (content: string, task: string) => void;
  getContextHistory: () => { hash: string; timestamp: number; task: string }[];
}
