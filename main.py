import os
import logging
import re
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# SDKs de IA y Análisis
from google import genai
from openai import AsyncOpenAI, AuthenticationError, BadRequestError, RateLimitError, APIConnectionError
import jedi

# --- CONFIGURACIÓN DE LOGS ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))
logger.info(f"Archivo .env cargado desde: {os.path.abspath('.env')}")

PROVIDER_ENV_MAP = {
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "groq": "GROQ_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}


def has_valid_api_key(env_var_name: str) -> bool:
    value = os.getenv(env_var_name, "").strip()
    return bool(value and not value.startswith("TU_"))


def get_provider_config_state() -> Dict[str, Dict[str, Any]]:
    config: Dict[str, Dict[str, Any]] = {}
    for provider, env_var in PROVIDER_ENV_MAP.items():
        configured = has_valid_api_key(env_var)
        config[provider] = {
            "configured": configured,
            "envVar": env_var,
            "source": "env" if configured else "none"
        }
    config["ollama"] = {
        "configured": True,
        "envVar": "",
        "source": "env"
    }
    config["custom"] = {
        "configured": False,
        "envVar": "CUSTOM_PROVIDER_KEY",
        "source": "none"
    }
    return config

# --- ANALIZADOR PROFUNDO (ESTABLE PARA WINDOWS) ---
class DeepAnalyzer:
    def __init__(self):
        logger.info("DeepAnalyzer inicializado con motores estables (Jedi + Regex Semántico)")

    def extract_dependencies(self, content: str, ext: str, path: str = "") -> List[str]:
        deps = []
        try:
            # Normalizar extensión
            ext = ext.lower().strip('.')
            
            if ext == 'py':
                # Motor Jedi para Python (AST Real)
                script = jedi.Script(content, path=path if path else None)
                for imp in script.get_names(all_scopes=True, definitions=False):
                    if imp.type == 'module':
                        deps.append(imp.full_name)
            
            elif ext in ['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs']:
                # Motor Multicapa para JS/TS/React/Node
                patterns = [
                    r'from\s+[\'"](.+?)[\'"]',          # ESM: import ... from 'path'
                    r'import\s+[\'"](.+?)[\'"]',        # ESM Side-effect: import 'path'
                    r'require\s*\(\s*[\'"](.+?)[\'"]\s*\)',  # CommonJS: require('path')
                    r'import\s*\(\s*[\'"](.+?)[\'"]\s*\)',  # Dynamic: import('path')
                ]
                for pattern in patterns:
                    matches = re.findall(pattern, content)
                    for m in matches:
                        # Normalizar paths de JS/TS: quitamos ./ y extensiones básicas, pero mantenemos el nombre
                        # Esto permite que el frontend lo encuentre por nombre o por fragmento de path
                        clean_m = m
                        if m.startswith('.'):
                            clean_m = m.split('/')[-1].split('?')[0]
                        
                        # Quitar extensiones comunes para búsqueda elástica
                        clean_m = re.sub(r'\.(js|ts|jsx|tsx)$', '', clean_m)
                        deps.append(clean_m)
            
            elif ext in ['cs']:
                # C# / .NET
                matches = re.findall(r'using\s+([\w\.]+);', content)
                deps.extend(matches)
                
            elif ext in ['go']:
                # Go Language
                matches = re.findall(r'import\s+[\'"](.+?)[\'"]', content)
                deps.extend(matches)
                
            elif ext in ['rs']:
                # Rust
                matches = re.findall(r'use\s+([\w\:]+);', content)
                deps.extend(matches)

            # Limpiar y deduplicar
            return list(set([d.strip() for d in deps if d and len(d) > 1]))
        except Exception as e:
            logger.error(f"Error analizando {ext}: {str(e)}")
            return []

# --- MODELOS Y ENUMS ---
class AIProvider(str, Enum):
    GEMINI = "gemini"
    OPENAI = "openai"
    GROQ = "groq"
    DEEPSEEK = "deepseek"
    OLLAMA = "ollama"
    OPENROUTER = "openrouter"
    MISTRAL = "mistral"
    CUSTOM = "custom"


class AIReviewRequest(BaseModel):
    context: str = Field(..., description="Contexto del grafo")
    provider: AIProvider = Field(default=AIProvider.GEMINI)
    model: Optional[str] = None
    customUrl: Optional[str] = None
    customKey: Optional[str] = None

class AnalyzeRequest(BaseModel):
    files: List[Dict[str, str]]


class ContextExportFile(BaseModel):
    filename: str = Field(..., description="Nombre del archivo a guardar")
    content: str = Field(..., description="Contenido del archivo")


class ContextExportRequest(BaseModel):
    projectName: Optional[str] = Field(default=None, description="Nombre del proyecto analizado")
    files: List[ContextExportFile]


def sanitize_context_segment(value: Optional[str]) -> str:
    raw = (value or "").strip()
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", raw).strip("._")
    return safe or "Unknown_Project"

app = FastAPI(title="ProjectGrapher AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- LÓGICA DE IA ---
class AIEngine:
    SYSTEM_PROMPT = """Eres un Arquitecto de Software Senior nivel Staff.
Analiza la arquitectura y genera un reporte Markdown profesional y exhaustivo.
Identifica responsabilidades, flujos, cuellos de botella, patrones de diseño y sugerencias de mejora.

Reglas importantes para este análisis:
- No des una descripción genérica si el contexto trae capacidades concretas del producto.
- Distingue entre análisis determinístico local y enriquecimiento opcional con IA cuando ambos existan.
- Si el proyecto genera handoffs, task packs, error context packs, diff contextual, semantic search o memoria de proyecto, menciónalo como parte central del producto.
- No reduzcas el sistema a "visualizador de grafo" si el contexto muestra funciones de diagnóstico, priorización, exportación o coordinación para agentes.
- Prioriza describir el valor del producto, sus capacidades principales y la diferencia entre infraestructura base y features de usuario.
- No inventes autenticación, cuentas, multiusuario, terceros (Google/GitHub), almacenamiento en la nube, dashboards administrativos ni base de datos de usuarios si el contexto no los muestra explícitamente.
- Si una capacidad no está respaldada por el contexto, dilo como incertidumbre o no la menciones.
- Prefiere afirmaciones conservadoras y ancladas al contexto sobre suposiciones de producto.
"""

    @staticmethod
    def _get_base_url(provider: AIProvider, custom_url: Optional[str]) -> Optional[str]:
        if custom_url and provider == AIProvider.CUSTOM: return custom_url
        urls = {
            AIProvider.GROQ: "https://api.groq.com/openai/v1",
            AIProvider.DEEPSEEK: "https://api.deepseek.com",
            AIProvider.OLLAMA: "http://localhost:11434/v1",
            AIProvider.OPENROUTER: "https://openrouter.ai/api/v1",
            AIProvider.OPENAI: "https://api.openai.com/v1",
            AIProvider.MISTRAL: "https://api.mistral.ai/v1"
        }
        return urls.get(provider)

    async def generate_review(self, request: AIReviewRequest) -> str:
        logger.info(f"Iniciando review con proveedor: {request.provider} y modelo: {request.model}")
        full_prompt = f"{self.SYSTEM_PROMPT}\n{request.context}"
        
        if request.provider == AIProvider.GEMINI:
            api_key = request.customKey or os.getenv("GEMINI_API_KEY")
            if not api_key or api_key == "TU_GEMINI_API_KEY":
                raise HTTPException(status_code=400, detail="API Key de Gemini no configurada correctamente")
            
            client = genai.Client(api_key=api_key)
            try:
                response = client.models.generate_content(model=request.model or "gemini-1.5-flash", contents=full_prompt)
                return response.text
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error en Gemini: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Error en Gemini: {str(e)}")

        base_url = self._get_base_url(request.provider, request.customUrl)
        env_key_name = f"{request.provider.upper()}_API_KEY"
        api_key = request.customKey or os.getenv(env_key_name)
        
        # Validar si la llave es un placeholder o está vacía
        if not api_key or api_key.startswith("TU_"):
            if request.provider != AIProvider.OLLAMA:
                logger.warning(f"No se encontró API Key válida para {request.provider} (usando {env_key_name} o CustomKey)")
                # Si no hay llave, intentamos usar 'ollama' solo si es ollama, de lo contrario fallar temprano
                if request.provider != AIProvider.OLLAMA:
                    raise HTTPException(status_code=401, detail=f"API Key faltante o inválida para {request.provider}")

        client = AsyncOpenAI(api_key=api_key or "ollama", base_url=base_url)
        
        selected_model = request.model or "gpt-3.5-turbo"
        try:
            logger.info(f"Enviando solicitud a {request.provider} ({base_url})")
            response = await client.chat.completions.create(
                model=selected_model, 
                messages=[{"role": "user", "content": full_prompt}]
            )
            return response.choices[0].message.content
        except HTTPException:
            raise
        except AuthenticationError as e:
            logger.error(f"Auth error en proxy de IA ({request.provider}): {str(e)}")
            raise HTTPException(
                status_code=401,
                detail=f"API Key invalida para {request.provider}. Revisa la llave configurada en el servidor o en la sesion actual."
            )
        except BadRequestError as e:
            logger.error(f"Bad request en proxy de IA ({request.provider}): {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))
        except RateLimitError as e:
            logger.error(f"Rate limit en proxy de IA ({request.provider}): {str(e)}")
            raise HTTPException(status_code=429, detail=f"Limite de uso alcanzado para {request.provider}.")
        except APIConnectionError as e:
            logger.error(f"Connection error en proxy de IA ({request.provider}): {str(e)}")
            raise HTTPException(status_code=503, detail=f"No se pudo conectar con {request.provider}.")
        except Exception as e:
            logger.error(f"Error en proxy de IA ({request.provider}): {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))

# --- ENDPOINTS ---
ai_engine = AIEngine()
deep_analyzer = DeepAnalyzer()
CONTEXT_DIR = Path(__file__).resolve().parent / "contexto"

@app.post("/api/analyze")
async def analyze_project(request: AnalyzeRequest):
    results = []
    for file in request.files:
        deps = deep_analyzer.extract_dependencies(file['content'], file.get('ext', ''), file.get('path', ''))
        results.append({"path": file['path'], "dependencies": deps})
    return {"analysis": results}

@app.post("/api/ai/review")
async def ai_review(request: AIReviewRequest):
    text = await ai_engine.generate_review(request)
    return {"text": text}

@app.get("/api/ai/config")
async def get_ai_config():
    provider_state = get_provider_config_state()
    return {
        "env_keys": {provider: data["configured"] for provider, data in provider_state.items()},
        "providers": provider_state
    }


@app.post("/api/context/export")
async def export_context_files(request: ContextExportRequest):
    if not request.files:
        raise HTTPException(status_code=400, detail="No se recibieron archivos para exportar")

    project_segment = sanitize_context_segment(request.projectName)
    project_context_dir = CONTEXT_DIR / project_segment
    project_context_dir.mkdir(parents=True, exist_ok=True)
    saved_files: List[str] = []

    for file in request.files:
        safe_name = re.sub(r"[^a-zA-Z0-9._-]+", "_", os.path.basename(file.filename)).strip("._")
        if not safe_name:
            raise HTTPException(status_code=400, detail="Nombre de archivo inválido para exportación")

        target = project_context_dir / safe_name
        target.write_text(file.content, encoding="utf-8")
        saved_files.append(str(target.name))

    return {
        "saved": saved_files,
        "directory": str(project_context_dir),
        "relative_directory": f"contexto/{project_segment}"
    }

@app.get("/health")
async def health():
    return {"status": "online", "backend": "Python/FastAPI (Stable)"}

if __name__ == "__main__":
    import uvicorn
    # Cambiamos al puerto 8080 para evitar conflictos WinError 10013
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
