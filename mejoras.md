# Mejoras Prioritarias de ProjectGrapher

La idea no es meter muchas funciones.

La idea es quedarnos con las que sí fortalecen el producto:

- dar mejor contexto,
- reducir exploración inútil,
- ayudar a encontrar dónde tocar,
- y anticipar riesgo antes de modificar código.

## 1. Error-to-Context Pack

Esta es de las mejoras más valiosas.

Flujo:

- pegas error o stack trace,
- ProjectGrapher detecta archivo origen probable,
- ubica vecinos relevantes en el grafo,
- arma un mini contexto,
- y te dice qué revisar primero.

Valor:

- menos ruido,
- menos tokens,
- mejor diagnóstico inicial,
- mejor handoff para otro agente.

Estado:

- ya existe una primera versión.

## 2. Predictive Impact Analysis

Si el usuario selecciona un archivo, ProjectGrapher debería responder algo como:

- si modificas `auth.ts`, podrías impactar:
- login,
- registro,
- sesión,
- recuperación,
- middleware.

Valor:

- anticipar regresiones,
- entender impacto antes de editar,
- bajar el riesgo de romper otras partes.

## 3. Smart Diff Context

Comparar snapshots o grafos entre dos estados del proyecto.

Ejemplo:

- antes había cierta cadena de dependencias,
- después apareció un módulo nuevo,
- cambió una relación,
- subió el riesgo en una zona.

Valor:

- revisar evolución del proyecto,
- detectar cambios estructurales,
- ayudar en revisiones antes/después.

## 4. Semantic Search

Buscar por intención, no solo por nombre.

Ejemplos:

- dónde vive autenticación
- qué toca pagos
- qué mueve sesión

Resultado esperado:

- archivos,
- stores,
- APIs,
- componentes,
- módulos relacionados.

Valor:

- encontrar rápido lo importante,
- mejorar exploración del proyecto,
- ayudar a humanos y agentes.

## 5. Project Memory

Guardar conocimiento persistente del proyecto.

Ejemplos:

- este archivo es crítico,
- este módulo es legacy,
- esto no tocar,
- esta carpeta suele romper integraciones.

Valor:

- conservar contexto útil entre sesiones,
- acelerar onboarding,
- evitar repetir descubrimientos.

## Qué No Priorizar Ahorita

Por ahora no conviene meter:

- Runtime Graph completo
- Hook Recorder
- AI Fix Loop
- Test Coverage Overlay

No porque sean malas ideas, sino porque aumentan mucho la complejidad y pueden sacar al producto de su enfoque actual.

## Enfoque Correcto

ProjectGrapher gana más valor cuando pasa de:

- “ver el repo”

a:

- “decir qué revisar”,
- “decir qué cambiar”,
- y “decir qué se puede romper”.

Ese debería ser el norte cercano del producto.
