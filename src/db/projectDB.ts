import Dexie, { Table } from 'dexie';
import { ProjectData } from '../types';
import type { Repository, ProjectFile, ApiEndpoint, FrontendApiCall, ContractLink, TopologyNode, TopologyLink } from '../types/topology';

export interface SavedProject {
  id?: number;
  name: string;
  data: ProjectData;
  timestamp: number;
}

export interface SavedTopologyWorkspace {
  id?: number;
  timestamp: number;
  repositories: Repository[];
  files: Omit<ProjectFile, 'content'>[];
  endpoints: ApiEndpoint[];
  apiCalls: FrontendApiCall[];
  contractLinks: ContractLink[];
  nodes: TopologyNode[];
  graphLinks: TopologyLink[];
  agentTask: string;
}

export class ProjectDatabase extends Dexie {
  projects!: Table<SavedProject>;
  topologyWorkspaces!: Table<SavedTopologyWorkspace>;

  constructor() {
    super('ProjectGrapherDB');
    this.version(1).stores({
      projects: '++id, name, timestamp'
    });
    this.version(2).stores({
      projects: '++id, name, timestamp',
      topologyWorkspaces: '++id, timestamp'
    });
  }
}

export const db = new ProjectDatabase();
