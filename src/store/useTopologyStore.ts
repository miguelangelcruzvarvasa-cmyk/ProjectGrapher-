import { create } from 'zustand';
import type { Repository, ProjectFile, ApiEndpoint, FrontendApiCall, ContractLink, TopologyNode, TopologyLink, AgentShieldPack } from '../types/topology';
import { shouldProcessTopologyFile, detectRepoType, extractBackendEndpoints, extractFrontendApiCalls, isRealProjectDirectory, groupFilesBySubProjects } from '../utils/scanner';
import { buildTopologyContracts } from '../utils/topologyGraph';
import { generateAgentShieldPack } from '../utils/shieldGenerator';
import { DEMO_REPOSITORIES } from '../utils/demoData';
import { db } from '../db/projectDB';

// Se guarda siempre en el mismo registro (id fijo): el workspace multi-repo
// es una sola sesión de trabajo, no un historial de proyectos con nombre.
const TOPOLOGY_WORKSPACE_ID = 1;

const persistWorkspace = (state: {
  repositories: Repository[];
  files: ProjectFile[];
  endpoints: ApiEndpoint[];
  apiCalls: FrontendApiCall[];
  contractLinks: ContractLink[];
  nodes: TopologyNode[];
  graphLinks: TopologyLink[];
  agentTask: string;
}) => {
  void db.topologyWorkspaces.put({
    id: TOPOLOGY_WORKSPACE_ID,
    timestamp: Date.now(),
    repositories: state.repositories,
    // El contenido crudo no se usa después del escaneo inicial; no vale la pena
    // persistirlo (menos peso en IndexedDB, alineado con no guardar código fuente de más).
    files: state.files.map(({ content: _content, ...rest }) => rest),
    endpoints: state.endpoints,
    apiCalls: state.apiCalls,
    contractLinks: state.contractLinks,
    nodes: state.nodes,
    graphLinks: state.graphLinks,
    agentTask: state.agentTask
  });
};

interface TopologyState {
  repositories: Repository[];
  files: ProjectFile[];
  endpoints: ApiEndpoint[];
  apiCalls: FrontendApiCall[];
  contractLinks: ContractLink[];
  nodes: TopologyNode[];
  graphLinks: TopologyLink[];
  shieldPack: AgentShieldPack | null;
  agentTask: string;
  isScanning: boolean;
  activeTab: 'topology' | 'contracts' | 'shield' | 'risk';
  
  setAgentTask: (task: string) => void;
  setActiveTab: (tab: TopologyState['activeTab']) => void;
  addRepositoryFiles: (repoName: string, fileList: FileList | File[]) => Promise<void>;
  removeRepository: (repoId: string) => void;
  updateRepoType: (repoId: string, type: Repository['type']) => void;
  loadDemoData: () => void;
  loadLastTopology: () => Promise<void>;
  generateShield: () => void;
  clearWorkspace: () => void;
  exportTopologyJson: () => string;
}

export const useTopologyStore = create<TopologyState>((set, get) => ({
  repositories: [],
  files: [],
  endpoints: [],
  apiCalls: [],
  contractLinks: [],
  nodes: [],
  graphLinks: [],
  shieldPack: null,
  agentTask: 'Implementar autenticación OAuth2 multi-repo y actualizar los DTOs de orden en el frontend y backend...',
  isScanning: false,
  activeTab: 'topology',

  setAgentTask: (agentTask) => set({ agentTask }),
  setActiveTab: (activeTab) => set({ activeTab }),

  clearWorkspace: () => {
    void db.topologyWorkspaces.delete(TOPOLOGY_WORKSPACE_ID);
    set({
      repositories: [],
      files: [],
      endpoints: [],
      apiCalls: [],
      contractLinks: [],
      nodes: [],
      graphLinks: [],
      shieldPack: null
    });
  },

  loadLastTopology: async () => {
    const saved = await db.topologyWorkspaces.get(TOPOLOGY_WORKSPACE_ID);
    if (!saved) return;
    set({
      repositories: saved.repositories,
      files: saved.files.map((f) => ({ ...f, content: '' })),
      endpoints: saved.endpoints,
      apiCalls: saved.apiCalls,
      contractLinks: saved.contractLinks,
      nodes: saved.nodes,
      graphLinks: saved.graphLinks,
      agentTask: saved.agentTask || get().agentTask
    });
  },

  updateRepoType: (repoId, type) => {
    const colorMap: Record<Repository['type'], string> = {
      frontend: '#3b82f6',
      backend: '#10b981',
      database: '#f59e0b',
      microservice: '#8b5cf6',
      library: '#ec4899',
      unknown: '#6b7280'
    };

    const updatedRepos = get().repositories.map((r) =>
      r.id === repoId ? { ...r, type, color: colorMap[type] || '#10b981' } : r
    );

    const { links, nodes, graphLinks } = buildTopologyContracts(updatedRepos, get().endpoints, get().apiCalls);
    set({ repositories: updatedRepos, contractLinks: links, nodes, graphLinks });
    persistWorkspace(get());
  },

  loadDemoData: () => {
    const allRepos: Repository[] = [];
    const allFiles: ProjectFile[] = [];
    const allEndpoints: ApiEndpoint[] = [];
    const allApiCalls: FrontendApiCall[] = [];

    DEMO_REPOSITORIES.forEach(({ repo, files }) => {
      allRepos.push(repo);
      files.forEach((file) => {
        allFiles.push(file);
        allEndpoints.push(...extractBackendEndpoints(file));
        allApiCalls.push(...extractFrontendApiCalls(file));
      });
    });

    const { links, nodes, graphLinks } = buildTopologyContracts(allRepos, allEndpoints, allApiCalls);

    set({
      repositories: allRepos,
      files: allFiles,
      endpoints: allEndpoints,
      apiCalls: allApiCalls,
      contractLinks: links,
      nodes,
      graphLinks,
      activeTab: 'topology'
    });
  },

  removeRepository: (repoId: string) => {
    const updatedRepos = get().repositories.filter((r) => r.id !== repoId);
    const updatedFiles = get().files.filter((f) => f.repoId !== repoId);
    const updatedEndpoints = get().endpoints.filter((e) => e.repoId !== repoId);
    const updatedApiCalls = get().apiCalls.filter((c) => c.repoId !== repoId);

    const { links, nodes, graphLinks } = buildTopologyContracts(updatedRepos, updatedEndpoints, updatedApiCalls);

    set({
      repositories: updatedRepos,
      files: updatedFiles,
      endpoints: updatedEndpoints,
      apiCalls: updatedApiCalls,
      contractLinks: links,
      nodes,
      graphLinks
    });
    persistWorkspace(get());
  },

  addRepositoryFiles: async (rawRepoName, fileList) => {
    set({ isScanning: true });
    const fileArray = Array.from(fileList);

    if (!isRealProjectDirectory(fileArray)) {
      set({ isScanning: false });
      alert(`⚠️ La carpeta '${rawRepoName}' no parece ser un proyecto o repositorio válido.`);
      return;
    }

    const subGroups = groupFilesBySubProjects(rawRepoName, fileArray);

    let currentRepos = [...get().repositories];
    let currentFiles = [...get().files];
    let currentEndpoints = [...get().endpoints];
    let currentApiCalls = [...get().apiCalls];

    for (const group of subGroups) {
      const repoName = group.repoName || rawRepoName || `Repository ${currentRepos.length + 1}`;
      const existingRepo = currentRepos.find((r) => r.name.toLowerCase() === repoName.toLowerCase());
      const repoId = existingRepo ? existingRepo.id : `repo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      currentRepos = currentRepos.filter((r) => r.id !== repoId);
      currentFiles = currentFiles.filter((f) => f.repoId !== repoId);
      currentEndpoints = currentEndpoints.filter((e) => e.repoId !== repoId);
      currentApiCalls = currentApiCalls.filter((c) => c.repoId !== repoId);

      const newFiles: ProjectFile[] = [];
      const newEndpoints: ApiEndpoint[] = [];
      const newApiCalls: FrontendApiCall[] = [];
      const filePaths: string[] = [];

      const BATCH_SIZE = 50;

      for (let i = 0; i < group.files.length; i += BATCH_SIZE) {
        const batch = group.files.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (file: File) => {
            const rawPath = (file as any).webkitRelativePath || file.name;
            if (!shouldProcessTopologyFile(rawPath, file.size)) return;

            filePaths.push(rawPath);
            let content = '';
            try {
              content = await file.text();
            } catch {
              content = '';
            }

            const projectFile: ProjectFile = {
              id: `${repoId}_${rawPath}`,
              repoId,
              repoName,
              name: file.name,
              path: rawPath,
              content,
              ext: `.${file.name.split('.').pop()?.toLowerCase() || ''}`,
              size: file.size,
              role: 'source'
            };

            newFiles.push(projectFile);

            const eps = extractBackendEndpoints(projectFile);
            newEndpoints.push(...eps);

            const calls = extractFrontendApiCalls(projectFile);
            newApiCalls.push(...calls);
          })
        );
      }

      if (newFiles.length === 0) continue;

      const repoType = detectRepoType(filePaths, newEndpoints.length);
      const newRepo: Repository = {
        id: repoId,
        name: repoName,
        type: repoType,
        path: group.subPath ? `${rawRepoName}/${group.subPath}` : repoName,
        fileCount: newFiles.length,
        color: repoType === 'frontend' ? '#3b82f6' : repoType === 'backend' ? '#10b981' : repoType === 'database' ? '#f59e0b' : '#8b5cf6'
      };

      currentRepos.push(newRepo);
      currentFiles.push(...newFiles);
      currentEndpoints.push(...newEndpoints);
      currentApiCalls.push(...newApiCalls);
    }

    const { links, nodes, graphLinks } = buildTopologyContracts(currentRepos, currentEndpoints, currentApiCalls);

    set({
      repositories: currentRepos,
      files: currentFiles,
      endpoints: currentEndpoints,
      apiCalls: currentApiCalls,
      contractLinks: links,
      nodes,
      graphLinks,
      isScanning: false
    });
    persistWorkspace(get());
  },

  generateShield: () => {
    const { agentTask, repositories, contractLinks, endpoints, apiCalls } = get();
    const pack = generateAgentShieldPack(agentTask, repositories, contractLinks, endpoints, apiCalls);
    set({ shieldPack: pack });
  },

  exportTopologyJson: () => {
    const state = get();
    const exportData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      summary: {
        totalRepositories: state.repositories.length,
        totalFiles: state.files.length,
        totalEndpoints: state.endpoints.length,
        totalApiCalls: state.apiCalls.length,
        totalContractLinks: state.contractLinks.length
      },
      repositories: state.repositories,
      contractLinks: state.contractLinks,
      endpoints: state.endpoints,
      apiCalls: state.apiCalls
    };
    return JSON.stringify(exportData, null, 2);
  }
}));
