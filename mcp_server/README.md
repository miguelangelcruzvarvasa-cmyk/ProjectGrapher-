# ProjectGrapher MCP Server

Expone el grafo que ProjectGrapher ya calculó (`_architecture_map.json`) como
herramientas MCP, para que un agente lo consulte en vivo en vez de que tengas
que descargar y pegar documentos `.md` cada vez.

No re-analiza el código: lee el JSON que ya exportaste desde la app
("Exportes Base" → "Descargar todo el paquete base").

## Setup

```bash
pip install -r requirements.txt
```

## Usar con Claude Code

Ya existe un `.mcp.json` en la raíz del repo apuntando a
`contexto/ProjectGrapher-_architecture_map.json` (el análisis de este mismo
proyecto). Al abrir Claude Code en esta carpeta, el servidor se activa solo.

Para apuntarlo a **otro** proyecto: exporta su `_architecture_map.json` desde
la app y cambia la ruta en `PROJECTGRAPHER_MAP` dentro de `.mcp.json`, o llama
a la tool `reload_map("/ruta/al/archivo.json")` en cualquier momento sin
reiniciar el servidor.

## Tools disponibles

| Tool | Para qué sirve |
|---|---|
| `get_overview()` | Escala, lenguajes, entry points y top hotspots — punto de partida |
| `list_hotspots(limit)` | Archivos más conectados, de mayor a menor centralidad |
| `get_entry_points()` | Puntos de arranque probables del sistema |
| `search_files(query, limit)` | Busca por path o contenido sin abrir archivo por archivo |
| `get_file_summary(path)` | Tamaño, líneas, centralidad y preview de un archivo, sin volcar todo su contenido |
| `get_callers(path)` | Quién usa este archivo |
| `get_callees(path)` | Qué usa este archivo |
| `impact_of_change(path, depth)` | Análisis de impacto en cascada antes de tocar un hotspot |
| `reload_map(json_path)` | Cambia de proyecto sin reiniciar el servidor |

## Limitación conocida

El JSON solo trae `path`, `ext`, `size`, `importance` y `content` por archivo
— no trae el rol semántico, complejidad ni contratos que sí calculan
`analysis.ts`/`projectInsights.ts` para los documentos `.md`. Ese
enriquecimiento (rol/complejidad/contratos por archivo) sería el siguiente
paso natural para que estas tools sean tan ricas como los exports actuales.
