import type { Repository, ApiEndpoint, FrontendApiCall, ContractLink, TopologyNode, TopologyLink } from '../types/topology';
import { REPO_TYPE_COLORS } from '../config/rules';

const normalizePath = (path: string): string => {
  return path
    .replace(/^[a-z]+:\/\/[^/]+/i, '') // Remove protocol and domain if present
    .split('?')[0]                       // Remove query params
    .replace(/\\/g, '/')                // Normalize backslashes
    .replace(/\/+/g, '/')               // Remove double slashes
    .replace(/\{[^}]+\}/g, ':param')    // OpenAPI / Spring {id} -> :param
    .replace(/\$\{[^}]+\}/g, ':param')  // Template literal ${id} -> :param
    .replace(/:[a-zA-Z0-9_]+/g, ':param') // Express/FastAPI :id -> :param
    .toLowerCase()
    .trim();
};

export const buildTopologyContracts = (
  repositories: Repository[],
  endpoints: ApiEndpoint[],
  apiCalls: FrontendApiCall[]
): { links: ContractLink[]; nodes: TopologyNode[]; graphLinks: TopologyLink[] } => {
  const contractLinks: ContractLink[] = [];
  const nodes: TopologyNode[] = [];
  const graphLinks: TopologyLink[] = [];
  const matchedEndpointIds = new Set<string>();

  // Add Repository Nodes
  repositories.forEach((repo) => {
    nodes.push({
      id: repo.id,
      label: repo.name,
      repoId: repo.id,
      repoName: repo.name,
      group: 'repo',
      color: REPO_TYPE_COLORS[repo.type] || '#6b7280'
    });
  });

  // Match Frontend API calls against Backend Endpoints across repos
  apiCalls.forEach((call) => {
    const normalizedCallPath = normalizePath(call.urlPattern);

    // Look for path matching endpoint across OTHER repositories
    const matchedEndpoint = endpoints.find((ep) => {
      if (ep.repoId === call.repoId) return false; // Cross-repo matching
      const normalizedEpPath = normalizePath(ep.path);

      return (
        normalizedEpPath === normalizedCallPath ||
        (normalizedCallPath.length > 3 && (normalizedCallPath.endsWith(normalizedEpPath) || normalizedEpPath.endsWith(normalizedCallPath)))
      );
    });

    if (matchedEndpoint) {
      matchedEndpointIds.add(matchedEndpoint.id);
      const isMethodMatched = call.method.toUpperCase() === matchedEndpoint.method.toUpperCase();

      if (isMethodMatched) {
        contractLinks.push({
          id: `${call.id}__${matchedEndpoint.id}`,
          sourceRepoId: call.repoId,
          targetRepoId: matchedEndpoint.repoId,
          sourceFileId: call.fileId,
          targetFileId: matchedEndpoint.fileId,
          endpointUrl: matchedEndpoint.path,
          status: 'valid',
          riskScore: 'low',
          details: `✅ Contrato Válido: ${call.repoName} [${call.method} ${call.urlPattern}] ➔ ${matchedEndpoint.repoName} [${matchedEndpoint.method} ${matchedEndpoint.path}]`
        });

        graphLinks.push({
          source: call.repoId,
          target: matchedEndpoint.repoId,
          type: 'contract',
          status: 'valid'
        });
      } else {
        // Method Mismatch (e.g. Frontend POST to a GET endpoint)
        contractLinks.push({
          id: `${call.id}__${matchedEndpoint.id}_mismatch`,
          sourceRepoId: call.repoId,
          targetRepoId: matchedEndpoint.repoId,
          sourceFileId: call.fileId,
          targetFileId: matchedEndpoint.fileId,
          endpointUrl: matchedEndpoint.path,
          status: 'mismatch',
          riskScore: 'critical',
          details: `⛔ DESAJUSTE DE MÉTODO: ${call.repoName} llama con HTTP ${call.method} a '${call.urlPattern}', pero ${matchedEndpoint.repoName} expone HTTP ${matchedEndpoint.method} en '${matchedEndpoint.path}'`
        });

        graphLinks.push({
          source: call.repoId,
          target: matchedEndpoint.repoId,
          type: 'contract',
          status: 'mismatch'
        });
      }
    } else {
      // Unmatched Frontend call (orphan frontend endpoint)
      contractLinks.push({
        id: `orphan_${call.id}`,
        sourceRepoId: call.repoId,
        targetRepoId: 'unknown',
        sourceFileId: call.fileId,
        targetFileId: '',
        endpointUrl: call.urlPattern,
        status: 'orphan_frontend',
        riskScore: 'high',
        details: `⚠️ RUTA HUÉRFANA (FRONTEND): ${call.repoName} llama a '${call.method} ${call.urlPattern}' pero ningún backend expone esta ruta.`
      });
    }
  });

  // Check for Backend endpoints that have no callers (orphan backend endpoints)
  endpoints.forEach((ep) => {
    if (!matchedEndpointIds.has(ep.id) && apiCalls.length > 0) {
      contractLinks.push({
        id: `orphan_backend_${ep.id}`,
        sourceRepoId: 'unknown',
        targetRepoId: ep.repoId,
        sourceFileId: '',
        targetFileId: ep.fileId,
        endpointUrl: ep.path,
        status: 'orphan_backend',
        riskScore: 'medium',
        details: `ℹ️ ENDPOINT SIN CONSUMIR (BACKEND): ${ep.repoName} expone '${ep.method} ${ep.path}' pero no fue detectado en los llamados frontend.`
      });
    }
  });

  return { links: contractLinks, nodes, graphLinks };
};
