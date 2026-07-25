import type { Repository, ApiEndpoint, FrontendApiCall, ContractLink, TopologyNode, TopologyLink } from '../types/topology';

export const buildTopologyContracts = (
  repositories: Repository[],
  endpoints: ApiEndpoint[],
  apiCalls: FrontendApiCall[]
) => {
  const links: ContractLink[] = [];
  const nodes: TopologyNode[] = [];
  const graphLinks: TopologyLink[] = [];

  repositories.forEach((repo) => {
    nodes.push({
      id: repo.id,
      label: repo.name,
      repoId: repo.id,
      repoName: repo.name,
      group: 'repo',
      color: repo.color
    });
  });

  const matchedCallIds = new Set<string>();
  const matchedEndpointIds = new Set<string>();

  apiCalls.forEach((call) => {
    let matchedEndpoint: ApiEndpoint | null = null;

    for (const ep of endpoints) {
      if (ep.repoId === call.repoId) continue;

      const callUrl = call.urlPattern.toLowerCase().replace(/['"`]/g, '');
      const epPath = ep.path.toLowerCase();

      if (
        callUrl === epPath ||
        callUrl.endsWith(epPath) ||
        epPath.endsWith(callUrl) ||
        (callUrl.includes('/api/') && epPath.includes('/api/'))
      ) {
        matchedEndpoint = ep;
        break;
      }
    }

    if (matchedEndpoint) {
      matchedCallIds.add(call.id);
      matchedEndpointIds.add(matchedEndpoint.id);

      const methodMatch = call.method === 'ALL' || call.method === matchedEndpoint.method;
      const status = methodMatch ? 'valid' : 'mismatch';

      links.push({
        id: `contract_${call.id}_${matchedEndpoint.id}`,
        sourceRepoId: call.repoId,
        targetRepoId: matchedEndpoint.repoId,
        sourceFileId: call.fileId,
        targetFileId: matchedEndpoint.fileId,
        endpointUrl: matchedEndpoint.path,
        status,
        riskScore: methodMatch ? 'low' : 'critical',
        details: methodMatch
          ? `[${call.repoName}] llama a [${matchedEndpoint.repoName}] -> ${call.method} ${matchedEndpoint.path}`
          : `[${call.repoName}] usa ${call.method} pero [${matchedEndpoint.repoName}] espera ${matchedEndpoint.method} en ${matchedEndpoint.path}`
      });

      graphLinks.push({
        source: call.repoId,
        target: matchedEndpoint.repoId,
        type: 'contract',
        status
      });
    } else {
      links.push({
        id: `orphan_call_${call.id}`,
        sourceRepoId: call.repoId,
        targetRepoId: 'unknown',
        sourceFileId: call.fileId,
        targetFileId: '',
        endpointUrl: call.urlPattern,
        status: 'orphan_frontend',
        riskScore: 'high',
        details: `Llamada HTTP sin backend en [${call.repoName}]: ${call.method} ${call.urlPattern}`
      });
    }
  });

  endpoints.forEach((ep) => {
    if (!matchedEndpointIds.has(ep.id)) {
      links.push({
        id: `orphan_ep_${ep.id}`,
        sourceRepoId: 'unknown',
        targetRepoId: ep.repoId,
        sourceFileId: '',
        targetFileId: ep.fileId,
        endpointUrl: ep.path,
        status: 'orphan_backend',
        riskScore: 'medium',
        details: `Endpoint sin consumidor en [${ep.repoName}]: ${ep.method} ${ep.path}`
      });
    }
  });

  return { links, nodes, graphLinks };
};
