
export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  content: string;
  ext: string;
  size: number;
  importance: number; // Degree centrality or similar
}

export interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  group: string;
  cluster?: string;
  size: number;
  data: ProjectFile;
}

export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
  fileData?: ProjectFile;
}

export interface ProjectData {
  files: ProjectFile[];
  nodes: GraphNode[];
  links: GraphLink[];
}
