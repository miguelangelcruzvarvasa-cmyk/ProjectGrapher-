# Critical Flows: ProjectGrapher-

## Metadata
- Proyecto: ProjectGrapher-
- Archivo: critical_flows.md
- Generado en: 22/7/2026, 4:40:33 p.m.
- Modo: deterministic local analysis

> [!NOTE]
> Úsalo como mapa de referencia y valida contra el código activo antes de tomar decisiones delicadas.

## Qué Es Este Archivo
Documento corto para separar flujos operativos y fuentes de verdad del resto del mapa técnico.

## Fuentes de Verdad

> [!TIP]
> Señala archivos donde habitan decisiones funcionales y arquitectónicas clave del sistema según ruta, nombre y análisis de dependencias.

- **Integración, servicio o capa de acceso**: ProjectGrapher-/main.py, ProjectGrapher-/server/index.js, ProjectGrapher-/src/components/AIConfig.tsx
  - *Resumen*: Módulos priorizados clasificados como integración, servicio o capa de acceso.
- **Componente, pantalla u orquestador de interfaz**: ProjectGrapher-/src/App.tsx, ProjectGrapher-/src/main.tsx, ProjectGrapher-/src/components/AppPanels.tsx
  - *Resumen*: Módulos priorizados clasificados como componente, pantalla u orquestador de interfaz.
- **Estado compartido o contexto global**: ProjectGrapher-/src/store/projectExports.ts, ProjectGrapher-/src/store/projectInsights.ts, ProjectGrapher-/src/store/projectProcessing.ts
  - *Resumen*: Módulos priorizados clasificados como estado compartido o contexto global.
- **Hook personalizado que encapsula lógica reutilizable**: ProjectGrapher-/src/store/useProjectStore.ts, ProjectGrapher-/src/hooks/useAppController.ts
  - *Resumen*: Módulos priorizados clasificados como hook personalizado que encapsula lógica reutilizable.
- **Módulo de soporte del proyecto**: ProjectGrapher-/src/utils/cn.ts, ProjectGrapher-/src/config/aiDefaults.ts, ProjectGrapher-/src/db/projectDB.ts
  - *Resumen*: Módulos priorizados clasificados como módulo de soporte del proyecto.

## Flujos Críticos

> [!IMPORTANT]
> Rutas de lectura prioritarias que condicionan la arquitectura antes de editar código.

### Punto de entrada y arranque del sistema
- **Por qué importa**: Constituye la inicialización y arranque primario de la aplicación.
- **Archivos guía**: ProjectGrapher-/main.py, ProjectGrapher-/server/index.js, ProjectGrapher-/src/App.tsx, ProjectGrapher-/src/main.tsx

### Orquestadores principales y alta acoplación
- **Por qué importa**: Archivos con mayor centralidad en el grafo que coordinan múltiples subsistemas.
- **Archivos guía**: ProjectGrapher-/main.py, ProjectGrapher-/server/index.js, ProjectGrapher-/src/App.tsx, ProjectGrapher-/src/main.tsx

### Servicios de dominio y procesamiento principal
- **Por qué importa**: Concentran las reglas funcionales, lógica de negocio y procesamiento de datos.
- **Archivos guía**: ProjectGrapher-/src/hooks/useAppController.ts


## Recomendación de Uso
- Léelo antes de editar si la tarea toca reglas funcionales, contexto global o integraciones.
- Cruza este archivo con snapshot y graph guide si necesitas más detalle estructural.
