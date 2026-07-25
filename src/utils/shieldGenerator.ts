import type { Repository, ContractLink, ApiEndpoint, FrontendApiCall, AgentShieldPack } from '../types/topology';

export const generateAgentShieldPack = (
  taskDescription: string,
  repositories: Repository[],
  contractLinks: ContractLink[],
  endpoints: ApiEndpoint[],
  apiCalls: FrontendApiCall[]
): AgentShieldPack => {
  const affectedRepos = repositories.map((r) => r.name);
  const contractWarnings: string[] = [];
  const targetFiles: string[] = [];

  contractLinks.forEach((link) => {
    if (link.status === 'orphan_frontend') {
      contractWarnings.push(`⚠️ ALERTA DE RUPTURA: La llamada frontend '${link.endpointUrl}' no tiene backend correspondiente.`);
    } else if (link.status === 'mismatch') {
      contractWarnings.push(`⛔ DESAJUSTE CRÍTICO DE MÉTODO HTTP: ${link.details}`);
    } else if (link.status === 'orphan_backend') {
      contractWarnings.push(`ℹ️ ENDPOINT SIN CONSUMIDOR: '${link.endpointUrl}' no tiene consumo detectado en frontend.`);
    }
  });

  endpoints.forEach((ep) => targetFiles.push(`${ep.repoName} -> [${ep.method}] ${ep.path}`));

  const recommendedOrder = [...repositories]
    .sort((a, b) => {
      const order = { database: 1, backend: 2, microservice: 3, library: 4, frontend: 5, unknown: 6 };
      return (order[a.type] || 6) - (order[b.type] || 6);
    })
    .map((r) => r.name);

  const shieldPromptMarkdown = `# 🛡️ AGENT TOPOLOGY SHIELD - REGLAS DE GOBERNANZA MULTI-REPOSITORIO

> [!IMPORTANT]
> **POLÍTICA DE PRIVACIDAD LOCAL Y SEGURIDAD CROSS-REPO**:
> Este entorno de trabajo comprende **${repositories.length} repositorios interconectados** (${endpoints.length} endpoints backend y ${apiCalls.length} llamadas frontend auditadas). 
> Cualquier modificación en endpoints, esquemas de BD o contratos JSON impactará directamente a los demás repositorios.

---

## 🎯 Tarea Asignada al Agente de IA
\`\`\`text
${taskDescription || 'Análisis e implementación de cambio arquitectónico multi-repositorio.'}
\`\`\`

---

## 🌐 Topología de Repositorios en este Entorno
${repositories.map((r) => `- **[${r.type.toUpperCase()}]** \`${r.name}\` (${r.fileCount} archivos de código auditados)`).join('\n')}

---

## 🔗 Mapa de Contratos Inter-Servicios (Cross-Repo Contracts)
${contractLinks.length > 0 ? contractLinks.map((l) => `- ${l.details}`).join('\n') : '*No se detectaron conflictos de contrato en el escaneo.*'}

---

## ⚠️ Advertencias de Riesgo e Inconsistencias Detectadas
${contractWarnings.length > 0 ? contractWarnings.map((w) => `- ${w}`).join('\n') : '✅ *Todos los endpoints y llamadas HTTP están sincronizados sin conflictos conocidos.*'}

---

## 🚦 Orden Sugerido de Implementación (Cross-Repo Pipeline)
${recommendedOrder.map((repoName, idx) => `${idx + 1}. \`${repoName}\``).join('\n')}

---

## 📋 Instrucciones Estrictas de Seguridad para el Agente IA:
1. **Gobernanza de API**: Si modificas un endpoint en un backend, DEBES actualizar las interfaces/tipos y llamadas en el frontend correspondiente.
2. **Respetar Métodos y DTOs**: No cambies métodos HTTP (GET ➔ POST) ni nombres de campos JSON sin actualizar ambos lados del contrato.
3. **Seguridad Local & Credenciales**: No introduzcas claves API ni credenciales expuestas en controladores, componentes o migraciones.
4. **Verificación Paso a Paso**: Valida siempre la firma de los métodos y DTOs antes de declarar la tarea como completada.
`;

  return {
    taskDescription,
    affectedRepos,
    targetFiles,
    contractWarnings,
    recommendedOrder,
    shieldPromptMarkdown
  };
};
