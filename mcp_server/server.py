"""
ProjectGrapher MCP Server
=========================

Expone el grafo de dependencias que ya calcula el frontend (el archivo
`_architecture_map.json` que se descarga desde "Exportes Base" en la app) como
herramientas MCP que un agente (Claude Code, Cursor, etc.) puede consultar en
vivo, en vez de que un humano tenga que descargar y pegar documentos .md.

No re-analiza el proyecto: consume el grafo ya construido por el motor
determinista en TypeScript (src/utils/analysis.ts). Si el mapa cambia,
recárgalo con la tool `reload_map`.

Uso:
    PROJECTGRAPHER_MAP=contexto/MiProyecto_architecture_map.json python mcp_server/server.py

Config para Claude Code (.mcp.json en la raíz del repo target):
    {
      "mcpServers": {
        "projectgrapher": {
          "command": "python",
          "args": ["/ruta/a/ProjectGrapher-/mcp_server/server.py"],
          "env": { "PROJECTGRAPHER_MAP": "/ruta/a/tu_proyecto_architecture_map.json" }
        }
      }
    }
"""

import json
import os
from collections import deque
from pathlib import Path
from typing import Any, Optional

from mcp.server.fastmcp import FastMCP

# Mismas listas que usa el generador determinista en TS (projectExports.ts)
# para que "entry point" y "lenguaje" signifiquen lo mismo en ambos lados.
ENTRY_FILE_NAMES = {
    "main.tsx", "main.jsx", "app.tsx", "app.jsx", "main.py", "server.js",
    "index.js", "index.ts", "main.dart", "index.php", "artisan", "server.php",
}

LANGUAGE_MAP = {
    ".ts": "TypeScript", ".tsx": "TypeScript/React", ".js": "JavaScript",
    ".jsx": "JavaScript/React", ".py": "Python", ".go": "Go", ".java": "Java",
    ".cs": "C#", ".php": "PHP", ".rb": "Ruby", ".rs": "Rust", ".html": "HTML",
    ".css": "CSS", ".scss": "SCSS", ".vue": "Vue", ".svelte": "Svelte", ".dart": "Dart",
}

mcp = FastMCP(
    name="projectgrapher",
    instructions=(
        "Consulta el grafo de dependencias de un proyecto ya analizado por ProjectGrapher "
        "(hotspots, entry points, quien-usa-a-quien, impacto de cambios) sin leer el codigo completo. "
        "Empieza por get_overview() para orientarte."
    ),
)


class ProjectGraph:
    """Índice en memoria de un _architecture_map.json ya exportado."""

    def __init__(self, json_path: Optional[str] = None):
        self.source_path: Optional[str] = None
        self.files: dict[str, dict[str, Any]] = {}
        self.forward: dict[str, set[str]] = {}   # a -> archivos que a usa
        self.backward: dict[str, set[str]] = {}  # a -> archivos que usan a
        if json_path:
            self.load(json_path)

    def load(self, json_path: str) -> None:
        path = Path(json_path).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"No existe el archivo: {path}")
        data = json.loads(path.read_text(encoding="utf-8"))

        files = {f["path"]: f for f in data.get("files", [])}
        forward: dict[str, set[str]] = {p: set() for p in files}
        backward: dict[str, set[str]] = {p: set() for p in files}

        for link in data.get("links", []):
            source = link["source"] if isinstance(link["source"], str) else link["source"].get("id")
            target = link["target"] if isinstance(link["target"], str) else link["target"].get("id")
            if source in files and target in files:
                forward[source].add(target)
                backward[target].add(source)

        self.source_path = str(path)
        self.files = files
        self.forward = forward
        self.backward = backward

    def resolve(self, path_or_name: str) -> Optional[str]:
        """Encuentra el path real del proyecto a partir de un match exacto,
        de sufijo de ruta, o de nombre de archivo (evita que el agente tenga
        que adivinar la ruta exacta con el prefijo del proyecto)."""
        if not self.files:
            return None
        if path_or_name in self.files:
            return path_or_name

        needle = path_or_name.replace("\\", "/").lstrip("/")
        suffix_matches = [p for p in self.files if p.replace("\\", "/").endswith(needle)]
        if len(suffix_matches) == 1:
            return suffix_matches[0]

        name_matches = [p for p in self.files if Path(p).name == Path(needle).name]
        if len(name_matches) == 1:
            return name_matches[0]

        # Ambiguo o no encontrado: si hay varios candidatos, preferimos no adivinar mal.
        return suffix_matches[0] if suffix_matches else (name_matches[0] if name_matches else None)


graph = ProjectGraph()

_default_map = os.environ.get("PROJECTGRAPHER_MAP")
if _default_map and Path(_default_map).expanduser().exists():
    graph.load(_default_map)


def _require_loaded() -> Optional[str]:
    if not graph.files:
        return (
            "No hay ningún mapa cargado todavía. Usa reload_map(json_path) con la ruta "
            "al '<proyecto>_architecture_map.json' exportado desde ProjectGrapher "
            "(botón 'Descargar todo el paquete base' en Exportes Base)."
        )
    return None


@mcp.tool()
def reload_map(json_path: str) -> dict[str, Any]:
    """Carga (o recarga) el grafo desde un '<proyecto>_architecture_map.json' exportado
    por ProjectGrapher. Úsalo primero si el servidor arrancó sin PROJECTGRAPHER_MAP,
    o para cambiar de proyecto sin reiniciar el servidor."""
    graph.load(json_path)
    return {
        "loaded": graph.source_path,
        "files": len(graph.files),
        "links": sum(len(v) for v in graph.forward.values()),
    }


@mcp.tool()
def get_overview() -> dict[str, Any]:
    """Resumen compacto del proyecto cargado: escala, lenguajes, entry points y
    los hotspots más conectados. Es el punto de partida recomendado antes de
    pedir detalle de un archivo concreto."""
    if (err := _require_loaded()):
        return {"error": err}

    lang_count: dict[str, int] = {}
    for f in graph.files.values():
        lang = LANGUAGE_MAP.get(f.get("ext", ""), f.get("ext") or "Unknown")
        lang_count[lang] = lang_count.get(lang, 0) + 1

    entry_points = [p for p in graph.files if Path(p).name.lower() in ENTRY_FILE_NAMES]
    hotspots = sorted(
        graph.files.values(),
        key=lambda f: f.get("importance", 0),
        reverse=True,
    )[:8]

    return {
        "source": graph.source_path,
        "total_files": len(graph.files),
        "total_relations": sum(len(v) for v in graph.forward.values()),
        "languages": dict(sorted(lang_count.items(), key=lambda kv: -kv[1])),
        "entry_points": entry_points,
        "top_hotspots": [
            {"path": f["path"], "importance": f.get("importance", 0), "ext": f.get("ext")}
            for f in hotspots
        ],
    }


@mcp.tool()
def list_hotspots(limit: int = 10) -> list[dict[str, Any]]:
    """Lista los archivos más conectados del grafo (mayor centralidad), ordenados
    de mayor a menor. Son los candidatos naturales a leer primero o a tratar
    con más cuidado antes de modificarlos."""
    if (err := _require_loaded()):
        return [{"error": err}]

    ranked = sorted(graph.files.values(), key=lambda f: f.get("importance", 0), reverse=True)
    return [
        {
            "path": f["path"],
            "importance": f.get("importance", 0),
            "ext": f.get("ext"),
            "size_bytes": f.get("size", 0),
            "incoming": len(graph.backward.get(f["path"], ())),
            "outgoing": len(graph.forward.get(f["path"], ())),
        }
        for f in ranked[:limit]
    ]


@mcp.tool()
def get_entry_points() -> list[str]:
    """Devuelve los archivos que probablemente son puntos de arranque del
    sistema (main.py, App.tsx, index.ts, etc.), detectados por nombre."""
    if (err := _require_loaded()):
        return [err]
    return [p for p in graph.files if Path(p).name.lower() in ENTRY_FILE_NAMES]


@mcp.tool()
def search_files(query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Busca archivos cuyo path o contenido contenga `query` (sin distinguir
    mayúsculas/minúsculas). Útil para preguntas como '¿dónde vive la
    autenticación?' sin tener que abrir cada archivo a mano."""
    if (err := _require_loaded()):
        return [{"error": err}]

    needle = query.lower()
    matches = []
    for path, f in graph.files.items():
        in_path = needle in path.lower()
        content = f.get("content", "") or ""
        idx = content.lower().find(needle)
        if in_path or idx != -1:
            snippet = None
            if idx != -1:
                start = max(0, idx - 60)
                snippet = content[start:idx + len(query) + 60].replace("\n", " ")
            matches.append({
                "path": path,
                "importance": f.get("importance", 0),
                "matched_in": "path" if in_path else "content",
                "snippet": snippet,
            })
    matches.sort(key=lambda m: m["importance"], reverse=True)
    return matches[:limit]


@mcp.tool()
def get_file_summary(path: str) -> dict[str, Any]:
    """Datos básicos de un archivo (tamaño, extensión, centralidad, cuántos
    archivos lo usan/usa) sin volcar su contenido completo. Usa esto antes de
    pedir el archivo entero para no gastar tokens de más."""
    if (err := _require_loaded()):
        return {"error": err}

    resolved = graph.resolve(path)
    if not resolved:
        return {"error": f"No se encontró un archivo que coincida con '{path}'"}

    f = graph.files[resolved]
    content = f.get("content", "") or ""
    lines = content.splitlines()
    return {
        "path": resolved,
        "ext": f.get("ext"),
        "size_bytes": f.get("size", 0),
        "line_count": len(lines),
        "importance": f.get("importance", 0),
        "incoming": sorted(graph.backward.get(resolved, ())),
        "outgoing": sorted(graph.forward.get(resolved, ())),
        "preview": "\n".join(lines[:15]),
    }


@mcp.tool()
def get_callers(path: str) -> dict[str, Any]:
    """Quién usa (importa/depende de) el archivo dado. Revísalo antes de
    cambiar la forma pública de un archivo para saber a quién puedes romper."""
    if (err := _require_loaded()):
        return {"error": err}
    resolved = graph.resolve(path)
    if not resolved:
        return {"error": f"No se encontró un archivo que coincida con '{path}'"}
    return {"path": resolved, "callers": sorted(graph.backward.get(resolved, ()))}


@mcp.tool()
def get_callees(path: str) -> dict[str, Any]:
    """Qué archivos usa (importa/depende de) el archivo dado."""
    if (err := _require_loaded()):
        return {"error": err}
    resolved = graph.resolve(path)
    if not resolved:
        return {"error": f"No se encontró un archivo que coincida con '{path}'"}
    return {"path": resolved, "callees": sorted(graph.forward.get(resolved, ()))}


@mcp.tool()
def impact_of_change(path: str, depth: int = 2) -> dict[str, Any]:
    """Análisis de impacto: qué archivos podrían verse afectados si modificas
    `path`, recorriendo la cadena de 'quién lo usa' hasta `depth` saltos.
    Úsalo antes de tocar un hotspot para anticipar qué más hay que revisar."""
    if (err := _require_loaded()):
        return {"error": err}
    resolved = graph.resolve(path)
    if not resolved:
        return {"error": f"No se encontró un archivo que coincida con '{path}'"}

    visited = {resolved: 0}
    order = [resolved]
    queue = deque([(resolved, 0)])
    while queue:
        current, dist = queue.popleft()
        if dist >= depth:
            continue
        for dependent in graph.backward.get(current, ()):
            if dependent not in visited:
                visited[dependent] = dist + 1
                order.append(dependent)
                queue.append((dependent, dist + 1))

    by_hop: dict[int, list[str]] = {}
    for p in order[1:]:
        by_hop.setdefault(visited[p], []).append(p)

    return {
        "path": resolved,
        "directly_affected": sorted(graph.backward.get(resolved, ())),
        "affected_by_hop": {str(k): sorted(v) for k, v in sorted(by_hop.items())},
        "total_affected": len(order) - 1,
    }


if __name__ == "__main__":
    mcp.run()
