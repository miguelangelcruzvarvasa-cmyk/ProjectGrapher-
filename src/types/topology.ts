export interface Repository {
  id: string;
  name: string;
  type: 'frontend' | 'backend' | 'database' | 'microservice' | 'library' | 'unknown';
  path: string;
  fileCount: number;
  color: string;
}

export interface ProjectFile {
  id: string;
  repoId: string;
  repoName: string;
  name: string;
  path: string;
  content: string;
  ext: string;
  size: number;
  role: string;
  importance?: number;
}

export interface ApiEndpoint {
  id: string;
  repoId: string;
  repoName: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ALL';
  path: string;
  fileId: string;
  lineNumber: number;
  parameters?: string[];
  responseModel?: string;
}

export interface FrontendApiCall {
  id: string;
  repoId: string;
  repoName: string;
  method: string;
  urlPattern: string;
  fileId: string;
  lineNumber: number;
}

export interface ContractLink {
  id: string;
  sourceRepoId: string;
  targetRepoId: string;
  sourceFileId: string;
  targetFileId: string;
  endpointUrl: string;
  status: 'valid' | 'mismatch' | 'orphan_backend' | 'orphan_frontend';
  riskScore: 'low' | 'medium' | 'high' | 'critical';
  details: string;
}

export interface TopologyNode {
  id: string;
  label: string;
  repoId: string;
  repoName: string;
  group: 'repo' | 'endpoint' | 'service' | 'model' | 'db';
  color: string;
  fileId?: string;
  x?: number;
  y?: number;
}

export interface TopologyLink {
  source: string;
  target: string;
  type: 'http_call' | 'db_relation' | 'import' | 'contract';
  status?: 'valid' | 'mismatch' | 'warning';
}

export interface AgentShieldPack {
  taskDescription: string;
  affectedRepos: string[];
  targetFiles: string[];
  contractWarnings: string[];
  recommendedOrder: string[];
  shieldPromptMarkdown: string;
}
