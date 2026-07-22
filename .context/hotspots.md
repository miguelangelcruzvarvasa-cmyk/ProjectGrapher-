# Hotspots & Deuda Técnica: ProjectGrapher-

## Hotspots Prioritarios
1. **types.ts**
   - Path: ProjectGrapher-/src/types.ts
   - Importancia: 12 | Tipo: .ts
   - Rol: módulo de soporte del proyecto (Complejidad: low, 33 líneas)
   - Contratos: interface ProjectFile, interface GraphNode, interface GraphLink, interface TreeNode, interface ProjectData
2. **App.tsx**
   - Path: ProjectGrapher-/src/App.tsx
   - Importancia: 10 | Tipo: .tsx
   - Rol: componente, pantalla u orquestador de interfaz (Complejidad: high, 1437 líneas)
   - Contratos: default App()
3. **analysis.ts**
   - Path: ProjectGrapher-/src/utils/analysis.ts
   - Importancia: 10 | Tipo: .ts
   - Rol: estado compartido o contexto global (Complejidad: high, 569 líneas)
   - Contratos: getExtension(filename: string), normalizeProjectPath(value: string), stripKnownExtension(value: string), createProjectFileResolver(files: ProjectFile[]), calculateAAMetrics(files: ProjectFile[], links: GraphLink[])
4. **projectStore.slices.ts**
   - Path: ProjectGrapher-/src/store/projectStore.slices.ts
   - Importancia: 9 | Tipo: .ts
   - Rol: estado compartido o contexto global (Complejidad: high, 611 líneas)
   - Contratos: createUiSlice(set: SetState), createAiSlice(set: SetState, get: GetState), createProjectSlice(set: SetState, get: GetState)
5. **projectExports.ts**
   - Path: ProjectGrapher-/src/store/projectExports.ts
   - Importancia: 6 | Tipo: .ts
   - Rol: estado compartido o contexto global (Complejidad: high, 616 líneas)
   - Contratos: generateAIContextExport(projectData: ProjectData, projectName: string), generateProjectBriefExport(projectData: ProjectData, projectName: string), generateProjectMetadataExport(projectData: ProjectData, projectName: string), generateGraphGuideExport(projectData: ProjectData, projectName: string), generateCriticalFlowsExport(projectData: ProjectData, projectName: string)
6. **projectInsights.ts**
   - Path: ProjectGrapher-/src/store/projectInsights.ts
   - Importancia: 6 | Tipo: .ts
   - Rol: estado compartido o contexto global (Complejidad: high, 1110 líneas)
   - Contratos: getTopItems(items: string[], limit: number), withProjectRoot(projectName: string, path: string), formatProjectPaths(projectName: string, items: string[]), detectTechStackSignals(file: ProjectFile), buildAIVisionDocument(projectName: string, aiReview: string, stack: string[], entryPo...
7. **AppPanels.tsx**
   - Path: ProjectGrapher-/src/components/AppPanels.tsx
   - Importancia: 5 | Tipo: .tsx
   - Rol: componente, pantalla u orquestador de interfaz (Complejidad: high, 293 líneas)
   - Contratos: EmptyProjectState({ cn, isProcessing, processingProgress, onProcessFiles }: EmptyProj..., AITabPanel({ isReviewing, aiError, aiReview, hasEffectiveKey, aiProvider, aiReady, on..., SettingsTabPanel(), AppModals({ showFileModal, selectedNode, setShowFileModal, showIAModal, setShowIAModa...
8. **appConfig.ts**
   - Path: ProjectGrapher-/src/config/appConfig.ts
   - Importancia: 5 | Tipo: .ts
   - Rol: configuración compartida del proyecto (Complejidad: low, 18 líneas)
   - Contratos: resolveContextDirectoryLabel(projectName?: string | null)
9. **useAppController.ts**
   - Path: ProjectGrapher-/src/hooks/useAppController.ts
   - Importancia: 5 | Tipo: .ts
   - Rol: hook personalizado que encapsula lógica reutilizable (Complejidad: high, 371 líneas)
   - Contratos: useAppController()
10. **AIConfig.tsx**
    - Path: ProjectGrapher-/src/components/AIConfig.tsx
    - Importancia: 4 | Tipo: .tsx
    - Rol: integración, servicio o capa de acceso (Complejidad: medium, 194 líneas)
    - Contratos: N/A

## Recomendaciones de Acción

> [!IMPORTANT]
> - Revisa primero los archivos con más conexiones entrantes: suelen ser utilidades compartidas o núcleos frágiles.
> - Revisa luego los archivos con más conexiones salientes: suelen ser orquestadores o pantallas con demasiadas responsabilidades.
> - Antes de refactorizar, sigue las relaciones del grafo para evitar romper cadenas de dependencias ocultas.
