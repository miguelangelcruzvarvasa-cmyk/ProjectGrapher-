import Dexie, { Table } from 'dexie';
import { ProjectData } from '../types';

export interface SavedProject {
  id?: number;
  name: string;
  data: ProjectData;
  timestamp: number;
}

export class ProjectDatabase extends Dexie {
  projects!: Table<SavedProject>;

  constructor() {
    super('ProjectGrapherDB');
    this.version(1).stores({
      projects: '++id, name, timestamp'
    });
    this.version(2).stores({
      projects: '++id, name, timestamp',
      topologyWorkspaces: '++id, timestamp'
    });
    // v3: se retiró el modo Topology Shield (multi-repo); se elimina su tabla.
    this.version(3).stores({
      topologyWorkspaces: null
    });
  }
}

export const db = new ProjectDatabase();
