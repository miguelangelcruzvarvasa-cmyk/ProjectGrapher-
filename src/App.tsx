/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  Upload, Network, Code2, 
  Copy, FileText, CheckCircle2, 
  ChevronRight, X, Play, 
  Search, Info, Database, Download,
  LayoutDashboard, Share2, Folder, ChevronDown,
  Sparkles, AlertCircle, Loader2, BarChart3, Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GraphCanvas } from './components/GraphCanvas';
import { ProjectFile, GraphNode, GraphLink, ProjectData, TreeNode } from './types';
import { getExtension, findDependencies, shouldProcessFile, buildFileTree, generateTreeText, calculateAAMetrics } from './utils/analysis';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';

const hasAiKey = !!process.env.GEMINI_API_KEY;
const ai = hasAiKey ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const Modal = ({ isOpen, onClose, title, children }: { 
  isOpen: boolean, 
  onClose: () => void, 
  title: string, 
  children: React.ReactNode 
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-12">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 40 }}
            className="relative w-full max-w-5xl max-h-full bg-brand-bg border border-white/10 rounded-[32px] shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <h3 className="text-xl font-bold text-white font-display uppercase tracking-wider">{title}</h3>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-xl transition-colors text-gray-500 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const FileIcon = ({ ext, className }: { ext: string, className?: string }) => {
  if (['.js', '.ts', '.tsx', '.jsx'].includes(ext)) return <Code2 className={className} />;
  if (ext === '.json') return <Database className={className} />;
  if (['.css', '.scss', '.less'].includes(ext)) return <Share2 className={className} />;
  return <FileText className={className} />;
};

const TreeItem = ({ node, level, onFileSelect, selectedId }: { 
  node: TreeNode, 
  level: number, 
  onFileSelect: (f: ProjectFile) => void,
  selectedId: string | null 
}) => {
  const [isOpen, setIsOpen] = useState(level < 2); // Auto-open top levels

  return (
    <div>
      <button
        onClick={() => node.isFile ? (node.fileData && onFileSelect(node.fileData)) : setIsOpen(!isOpen)}
        className={cn(
          "w-full text-left p-1.5 rounded-lg hover:bg-white/5 transition-all group flex items-center gap-2",
          node.isFile && selectedId === node.path && "bg-brand-primary/10 border-brand-primary/20"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {node.isFile ? (
          <FileIcon ext={getExtension(node.name)} className="w-4 h-4 text-gray-500 group-hover:text-brand-primary shrink-0" />
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
             <ChevronDown className={cn("w-3 h-3 text-gray-600 transition-transform", !isOpen && "-rotate-90")} />
             <Folder className="w-4 h-4 text-brand-primary/60 fill-brand-primary/10" />
          </div>
        )}
        <span className={cn(
          "text-xs truncate transition-colors",
          node.isFile ? "text-gray-400 group-hover:text-gray-200" : "text-gray-200 font-medium",
          node.isFile && selectedId === node.path && "text-brand-primary"
        )}>
          {node.name}
        </span>
      </button>
      {!node.isFile && isOpen && node.children.map((child, i) => (
        <TreeItem 
          key={i} 
          node={child} 
          level={level + 1} 
          onFileSelect={onFileSelect}
          selectedId={selectedId}
        />
      ))}
    </div>
  );
};

// --- MAIN COMPONENT ---

export default function App() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [treeSearch, setTreeSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'context' | 'files' | 'ia'>('details');
  const [aiReview, setAiReview] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [showIAModal, setShowIAModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    setIsProcessing(true);
    setProjectData(null);
    setSelectedNode(null);

    const validFiles: ProjectFile[] = [];
    const fileList = Array.from(rawFiles) as File[];
    let localSkipped = 0;
    
    // Detect project name from the first file's path
    const firstPath = (fileList[0] as any).webkitRelativePath || '';
    const projectName = firstPath.split('/')[0] || "Project";

    // 1. Filter and read files
    for (const file of fileList) {
      const path = (file as any).webkitRelativePath || file.name;
      if (!shouldProcessFile(path, file.size)) {
        localSkipped++;
        continue;
      }
      
      if (validFiles.length >= 1500) {
        console.warn("Reached maximum file limit (1500). Skipping remaining files.");
        localSkipped += fileList.length - validFiles.length - localSkipped;
        break;
      }

      try {
        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string || '');
          reader.readAsText(file);
        });

        validFiles.push({
          id: path,
          name: file.name,
          path: path,
          content: text,
          ext: getExtension(file.name),
          size: file.size,
          importance: 0
        });
      } catch (err) {
        console.error("Error reading file:", path, err);
      }
    }

    // 2. Build Links and calculate initial importance
    const links: GraphLink[] = [];
    const importanceMap: Record<string, number> = {};

    validFiles.forEach(f => {
      const deps = findDependencies(f.content, f.name);
      deps.forEach(dep => {
        // More robust matching: handle relative paths and extensions
        // Remove trailing slashes and common relative path characters
        const cleanDep = dep.replace(/^(\.\/|\.\.\/)+/, '').split('/').pop()?.split('.')[0] || dep;
        
        // Exact name match or path contains the dependency name
        const targetFile = validFiles.find(vf => 
          vf.name.split('.')[0] === cleanDep || 
          vf.path.endsWith(`${cleanDep}${vf.ext}`)
        );
        
        if (targetFile && targetFile.id !== f.id) {
          links.push({ source: f.id, target: targetFile.id });
          importanceMap[targetFile.id] = (importanceMap[targetFile.id] || 0) + 1;
        }
      });
    });

    // 3. Create Nodes
    const nodes: GraphNode[] = validFiles.map(f => {
      const pathParts = f.path.split('/');
      const cluster = pathParts.length > 2 ? pathParts.slice(0, -1).join('/') : 'root';
      
      // Generate deterministic initial position based on file ID (path)
      let hash = 0;
      for (let i = 0; i < f.id.length; i++) {
        hash = ((hash << 5) - hash) + f.id.charCodeAt(i);
        hash |= 0; 
      }
      const posX = 400 + (hash % 200);
      const posY = 300 + ((hash >> 8) % 150);

      return {
        id: f.id,
        label: f.name,
        group: f.ext,
        cluster: cluster,
        size: Math.max(12, Math.min(32, 10 + (importanceMap[f.id] || 0) * 4)),
        data: { ...f, importance: importanceMap[f.id] || 0 },
        x: posX,
        y: posY
      };
    });

    setProjectData({ files: validFiles, nodes, links });
    setSkippedCount(localSkipped);
    setIsProcessing(false);
  };

  const handleDownloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAIReview = async () => {
    if (!projectData || isReviewing || !ai) return;
    setIsReviewing(true);
    setAiError(null);
    setShowIAModal(true);
    try {
      const context = generateAIContext();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Eres un Arquitecto de Software Senior nivel Staff. 
Analiza la siguiente arquitectura de proyecto y proporciona un reporte técnico de alta calidad en español.
Sigue este formato Markdown:
# 🏗️ Reporte Arquitectónico AI

## 🎯 Resumen Ejecutivo
(Breve descripción de qué hace el proyecto y cómo está organizado)

## 💎 Fortalezas
- (Puntos clave bien logrados)

## 🛠️ Oportunidades de Mejora / Deuda Técnica
- (Cosas que podrían romperse o escalar mal)

## 🚀 Hoja de Ruta para Escalamiento Enterprise
(Sugerencias de patrones de diseño, herramientas o infraestructura)

Contexto extraído del grafo:
${context}`,
      });
      
      if (!response.text) {
        throw new Error("No data received from API");
      }
      setAiReview(response.text);
    } catch (err: any) {
      console.error("AI Error:", err);
      if (err.message?.includes("429") || err.message?.toLowerCase().includes("quota")) {
        setAiError("Cuota de API excedida. Por favor, intenta de nuevo en un momento o usa una API Key con límites más altos.");
      } else if (err.message?.includes("403") || err.message?.includes("401")) {
        setAiError("Error de permisos: La API Key configurada no es válida o no tiene acceso a Gemini 3 Flash.");
      } else if (err.message?.includes("fetch") || !navigator.onLine) {
        setAiError("Error de conexión: No se pudo contactar con el servicio de IA. Revisa tu conexión a internet.");
      } else {
        setAiError("Ocurrió un error inesperado al procesar el análisis arquitectónico.");
      }
    } finally {
      setIsReviewing(false);
    }
  };

  const filteredNodes = useMemo(() => {
    if (!projectData) return [];
    let baseNodes = projectData.nodes;

    if (searchQuery) {
      baseNodes = baseNodes.filter(n => 
        n.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
        n.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (isFocusMode && selectedNode) {
      const neighbors = new Set<string>([selectedNode.id]);
      projectData.links.forEach((l: any) => {
        const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
        const tId = typeof l.target === 'string' ? l.target : (l.target as any).id;
        if (sId === selectedNode.id) neighbors.add(tId);
        if (tId === selectedNode.id) neighbors.add(sId);
      });
      return baseNodes.filter(n => neighbors.has(n.id));
    }

    return baseNodes;
  }, [projectData, searchQuery, isFocusMode, selectedNode]);

  const generateAIContext = () => {
    if (!projectData) return "";

    let context = "### ESTRUCTURA DE DIRECTORIOS\n";
    const tree = buildFileTree(projectData.files);
    context += generateTreeText(tree) + "\n";

    context += "### RESUMEN DE ARQUITECTURA\n";
    context += `Proyecto: ${projectData.files[0]?.path.split('/')[0] || 'Unknown'}\n`;
    context += `Archivos: ${projectData.files.length}, Relaciones Detectadas: ${projectData.links.length}\n\n`;
    
    context += "### GRAFO DE DEPENDENCIAS\n";
    projectData.nodes.forEach(n => {
      const deps = projectData.links
        .filter(l => {
          const sId = typeof l.source === 'object' ? (l.source as any).id : l.source;
          return sId === n.id;
        })
        .map(l => {
          const tId = typeof l.target === 'object' ? (l.target as any).id : l.target;
          const targetNode = projectData.nodes.find(node => node.id === tId);
          return targetNode?.label || tId;
        });

      if (deps.length > 0) {
        context += `- [${n.label}] depends on: ${deps.join(', ')}\n`;
      }
    });

    context += "\n### KEY FILE SUMMARIES (TOP 15)\n";
    // Sort by importance to include most relevant first
    const keyFiles = [...projectData.files]
      .sort((a, b) => (b.importance || 0) - (a.importance || 0))
      .slice(0, 15);

    keyFiles.forEach(f => {
      const lines = f.content.split('\n');
      const preview = lines.slice(0, 100).join('\n');
      context += `\n--- FILE: ${f.path} ---\n\`\`\`${f.ext.replace('.', '')}\n${preview}${lines.length > 100 ? '\n// ... code continues' : ''}\n\`\`\`\n`;
    });

    return context;
  };

  const copyToClipboard = () => {
    const text = generateAIContext();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!projectData) {
    return (
      <div className="min-h-screen bg-brand-bg relative overflow-hidden flex items-center justify-center p-6">
        {/* Background Gradients */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-primary/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-secondary/10 blur-[120px] rounded-full" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl w-full text-center relative z-10"
        >
          <div className="mb-12 inline-block relative">
            <div className="absolute -inset-4 bg-brand-primary/20 blur-xl rounded-full animate-pulse" />
            <Network className="w-24 h-24 text-brand-primary animate-float" strokeWidth={1} />
            <div className="absolute -bottom-2 -right-2 p-3 bg-brand-surface border border-gray-800 rounded-2xl shadow-2xl">
              <Code2 className="w-8 h-8 text-brand-secondary" />
            </div>
          </div>

          <h1 className="text-6xl font-display font-bold tracking-tight text-white mb-6">
            ProjectGrapher <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-secondary">AI</span>
          </h1>
          
          <p className="text-xl text-gray-400 font-sans mb-12 max-w-xl mx-auto leading-relaxed">
            Analiza la arquitectura de tu proyecto localmente. Visualiza dependencias y genera prompts eficientes para tus agentes de IA.
          </p>

          <div className="relative max-w-sm ml-auto group mr-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500" />
            <label className={cn(
              "relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300",
              "bg-brand-surface/50 border-gray-800 hover:border-brand-primary/50 hover:bg-brand-surface/80",
              isProcessing && "pointer-events-none"
            )}>
              {isProcessing ? (
                <div className="flex flex-col items-center gap-4">
                  <Play className="w-12 h-12 text-brand-primary animate-spin" />
                  <p className="text-lg font-medium text-white">Indexando Carpeta...</p>
                  <p className="text-sm text-gray-500 text-center px-4">
                    Limpiando archivos de dependencias y analizando solo tu código fuente...
                  </p>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-gray-500 mb-4 group-hover:text-brand-primary transition-colors" />
                  <p className="text-lg font-medium text-white mb-2">Seleccionar Carpeta</p>
                  <p className="text-sm text-gray-400 text-center px-4 mb-4">
                    Ignora automáticamente node_modules, dist y builds.
                  </p>
                  <div className="flex flex-col items-center gap-2">
                    <div className="px-3 py-1.5 bg-gray-800 rounded-lg text-[10px] text-gray-500 font-mono flex items-center gap-2">
                      <Info className="w-3 h-3" />
                      PROCESAMIENTO LOCAL
                    </div>
                    <p className="text-[9px] text-amber-500/60 font-bold uppercase tracking-tighter">
                      * El navegador pedirá confirmación de seguridad
                    </p>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    // @ts-ignore
                    webkitdirectory="true" 
                    directory="true" 
                    multiple 
                    onChange={handleFileUpload} 
                  />
                </>
              )}
            </label>
          </div>

          <div className="mt-16 flex items-center justify-center gap-8 grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all">
             <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
               <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
               D3.js POWERED
             </div>
             <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
               <div className="w-1.5 h-1.5 rounded-full bg-brand-secondary" />
               TOKEN OPTIMIZED
             </div>
             <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
               <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
               CROSS-PLATFORM
             </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-brand-bg flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* Mobile Top Bar */}
      <div className="md:hidden h-16 border-b border-gray-800 bg-brand-bg/80 backdrop-blur-md flex items-center justify-between px-6 z-[60] shrink-0">
        <div className="flex items-center gap-2">
           <Network className="w-6 h-6 text-brand-primary" />
           <span className="font-display font-bold text-white tracking-widest text-[10px]">PROJECTGRAPHER</span>
        </div>
        <button 
           onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
           className="p-2 text-gray-500 hover:text-white"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <LayoutDashboard className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <nav className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-brand-surface border-r border-gray-800 flex flex-col py-6 gap-2 transform transition-transform duration-300 md:relative md:w-16 md:transform-none md:flex md:items-center",
        isMobileMenuOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="hidden md:block p-2 bg-brand-primary/10 rounded-xl mb-4">
          <Network className="w-8 h-8 text-brand-primary" />
        </div>
        
        <div className="flex flex-col gap-2 w-full px-4 md:px-0">
          <NavItem 
            active={activeTab === 'details'} 
            onClick={() => { setActiveTab('details'); setIsMobileMenuOpen(false); }}
            icon={<LayoutDashboard className="w-6 h-6" />}
            label="Dashboard"
            mobile={true}
          />
          <NavItem 
            active={activeTab === 'files'} 
            onClick={() => { setActiveTab('files'); setIsMobileMenuOpen(false); }}
            icon={<Folder className="w-6 h-6" />}
            label="Archivos"
            mobile={true}
          />
          <NavItem 
            active={activeTab === 'ia'} 
            onClick={() => { setActiveTab('ia'); setIsMobileMenuOpen(false); }}
            icon={<Sparkles className={cn("w-6 h-6", isReviewing && "animate-pulse")} />}
            label="Arquitectura AI"
            mobile={true}
            badge={isReviewing}
          />
          <NavItem 
            active={activeTab === 'context'} 
            onClick={() => { setActiveTab('context'); setIsMobileMenuOpen(false); }}
            icon={<Database className="w-6 h-6" />}
            label="Contexto AI"
            mobile={true}
          />
        </div>

        <div className="mt-auto flex flex-col gap-4 items-center w-full px-4 md:px-0">
          <button 
            onClick={handleAIReview}
            disabled={isReviewing}
            className={cn(
              "p-3 rounded-xl transition-all border border-gray-800 flex items-center justify-center gap-3 w-full md:w-auto",
              isReviewing ? "bg-gray-800 text-gray-400" : "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary hover:text-white"
            )}
          >
            {isReviewing ? <Loader2 className="w-6 h-6 animate-spin" /> : <BarChart3 className="w-6 h-6" />}
            <span className="md:hidden font-bold">Generar Reporte AI</span>
          </button>
          <button 
            onClick={() => setProjectData(null)}
            className="p-3 text-gray-500 hover:text-red-400 transition-colors flex items-center justify-center gap-3 w-full md:w-auto"
          >
            <X className="w-6 h-6" />
            <span className="md:hidden font-bold">Cerrar Proyecto</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden h-full">
        {/* Header Bar */}
        <header className="hidden md:flex h-16 border-b border-gray-800 items-center justify-between px-6 bg-brand-bg/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-display font-bold tracking-wider text-white uppercase opacity-70">
              Architectural Layer
            </h2>
            <div className="h-4 w-[1px] bg-gray-800" />
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-brand-secondary animate-pulse" />
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                  {projectData.files.length} Nodes Loaded
                </span>
                {skippedCount > 0 && (
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700/50">
                    {skippedCount.toLocaleString()} Ignored (Modules/Dist/Build)
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-all whitespace-nowrap",
                isFocusMode ? "bg-brand-primary text-white border-brand-primary" : "text-gray-500 border-gray-800 hover:border-gray-700"
              )}
            >
              <Network className="w-3 h-3" />
              FOCUS {isFocusMode ? 'ON' : 'OFF'}
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="Search nodes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-brand-surface border border-gray-800 rounded-full py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-primary transition-all w-64"
              />
            </div>
          </div>
        </header>

        {/* Graph Display */}
        <div className="flex-1 relative">
           <GraphCanvas 
             nodes={filteredNodes} 
             links={projectData.links} 
             onNodeClick={(node) => {
               setSelectedNode(node);
               setShowFileModal(true);
             }}
             selectedNodeId={selectedNode?.id || null}
             isFocusMode={isFocusMode}
           />
           
           {/* Graph Overlay UI */}
           <div className="absolute bottom-6 left-6 flex flex-col gap-2">
             <div className="bg-brand-surface/90 backdrop-blur-sm border border-gray-800 p-3 rounded-xl shadow-2xl flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                  <span className="text-[10px] uppercase font-mono text-gray-400">Logic</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#3b82f6]" />
                  <span className="text-[10px] uppercase font-mono text-gray-400">Static</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#10b981]" />
                  <span className="text-[10px] uppercase font-mono text-gray-400">Python</span>
                </div>
             </div>
           </div>
        </div>
      </main>

      {/* Right Intelligence Sidebar */}
      <aside className={cn(
         "w-full h-full md:w-[400px] border-l border-gray-800 bg-brand-surface flex flex-col z-20 absolute inset-0 md:relative md:inset-auto transform transition-transform duration-300 xl:translate-x-0 shrink-0",
         activeTab ? "translate-x-0" : "translate-x-full"
      )}>
        {/* Mobile Close Tab Button */}
        <div className="md:hidden flex p-4 border-b border-gray-800 bg-brand-bg items-center justify-between">
           <span className="font-bold text-white uppercase text-xs tracking-widest">{activeTab}</span>
           <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-gray-500"><X className="w-5 h-5" /></button>
        </div>
        <AnimatePresence mode="wait">
          {activeTab === 'details' && (
            <motion.div 
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col h-full"
            >
              {selectedNode ? (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <div className="p-6 border-b border-gray-800">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-brand-primary/10 rounded-lg">
                        <FileText className="w-5 h-5 text-brand-primary" />
                      </div>
                      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest bg-gray-800 px-2 py-0.5 rounded">
                        {(selectedNode.data.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-1 break-all">{selectedNode.label}</h3>
                    <p className="text-xs text-gray-500 font-mono opacity-50 truncate">{selectedNode.id}</p>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    {/* Architectural Role Stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-brand-bg/50 border border-gray-800 p-4 rounded-2xl group transition-all hover:border-brand-primary/30">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5 font-display">
                          <Network className="w-3 h-3" /> Centralidad
                        </div>
                        <div className="text-2xl font-mono font-bold text-brand-primary">
                          {selectedNode.data.importance}
                          <span className="text-xs text-gray-600 ml-1 font-normal">deps</span>
                        </div>
                      </div>
                      <div className="bg-brand-bg/50 border border-gray-800 p-4 rounded-2xl group transition-all hover:border-brand-secondary/30">
                        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5 font-display">
                          <Database className="w-3 h-3" /> Extensión
                        </div>
                        <div className="text-2xl font-mono font-bold text-brand-secondary lowercase">
                          {selectedNode.group}
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => setShowFileModal(true)}
                      className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                    >
                      <Info className="w-4 h-4 text-brand-primary" />
                      Ver Ficha Completa
                    </button>

                    <div>
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2 font-display">
                        <Share2 className="w-3 h-3 text-brand-primary" /> Referencias Directas
                      </h4>
                      <div className="space-y-2">
                        {projectData.links.filter(l => {
                          const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
                          return sId === selectedNode.id;
                        }).length === 0 ? (
                           <div className="text-sm text-gray-600 italic border border-dashed border-gray-800 p-4 rounded-2xl text-center flex flex-col items-center gap-2">
                             <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
                                <Info className="w-4 h-4" />
                             </div>
                             Nodo Terminal (Sin dependencias internas)
                           </div>
                        ) : (
                          projectData.links
                            .filter(l => {
                              const sId = typeof l.source === 'string' ? l.source : (l.source as any).id;
                              return sId === selectedNode.id;
                            })
                            .map((l, i) => {
                              const target = projectData.nodes.find(n => n.id === ((l.target as any).id || (l.target as any)));
                              return (
                                <button 
                                  key={i} 
                                  onClick={() => target && setSelectedNode(target)}
                                  className="w-full flex items-center justify-between gap-3 text-sm text-gray-300 bg-brand-bg/50 p-3 rounded-xl border border-gray-800/50 hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all text-left group/item"
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <ChevronRight className="w-3 h-3 text-brand-primary group-hover/item:translate-x-1 transition-transform" />
                                    <span className="truncate font-medium">{target?.label || 'Módulo Externo'}</span>
                                  </div>
                                  <div className="text-[10px] text-gray-600 font-mono opacity-0 group-hover/item:opacity-100 transition-opacity">
                                    VER NODO
                                  </div>
                                </button>
                              );
                            })
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                         <FileText className="w-3 h-3" /> Código Fuente
                      </h4>
                      <div className="bg-brand-bg rounded-xl border border-gray-800 p-4 font-mono text-[11px] text-gray-400 overflow-hidden relative group">
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           <div className="text-[8px] bg-gray-800 px-1.5 py-0.5 rounded text-gray-500">READONLY</div>
                        </div>
                        <pre className="whitespace-pre overflow-x-auto custom-scrollbar max-h-[400px] leading-relaxed">
                          {selectedNode.data.content.split('\n').slice(0, 100).join('\n')}
                          {selectedNode.data.content.split('\n').length > 100 && '\n\n// ... Código truncado por visualización'}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col p-8 overflow-y-auto custom-scrollbar">
                  <div className="mb-12">
                     <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-2xl font-bold text-white font-display">Dashboard Arquitectónico</h3>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 font-bold border border-green-500/20">LOCAL SCAN</span>
                     </div>
                     <p className="text-sm text-gray-500">Métricas clave procesadas localmente por el motor de análisis.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 mb-12">
                     <div className="bg-brand-bg/50 border border-gray-800 p-6 rounded-3xl group transition-all hover:border-brand-primary/30 relative overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                           <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                              <Activity className="w-5 h-5" />
                           </div>
                           <div className="text-[10px] font-mono text-gray-600">OVERALL HEALTH</div>
                        </div>
                        <div className="text-3xl font-bold text-white mb-1">
                           {calculateAAMetrics(projectData.files, projectData.links).architectureHealth}
                        </div>
                        <p className="text-xs text-gray-500">Estado basado en densidad de acoplamiento.</p>
                        <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-brand-primary/5 rounded-full blur-2xl group-hover:bg-brand-primary/10 transition-all" />
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-brand-bg/50 border border-gray-800 p-6 rounded-3xl">
                           <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Líneas de Código</div>
                           <div className="text-2xl font-mono font-bold text-white">
                              {calculateAAMetrics(projectData.files, projectData.links).totalLines.toLocaleString()}
                           </div>
                        </div>
                        <div className="bg-brand-bg/50 border border-gray-800 p-6 rounded-3xl">
                           <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Acoplamiento</div>
                           <div className="text-2xl font-mono font-bold text-brand-secondary">
                              {calculateAAMetrics(projectData.files, projectData.links).complexityAvg}
                           </div>
                        </div>
                     </div>
                  </div>

                  <div>
                     <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2 font-display">
                        <BarChart3 className="w-3 h-3" /> Distribución de Tipos
                     </h4>
                     <div className="space-y-3">
                        {Array.from(new Set(projectData.files.map(f => f.ext))).map((ext, i) => {
                           const count = projectData.files.filter(f => f.ext === ext).length;
                           const percentage = (count / projectData.files.length) * 100;
                           return (
                              <div key={i} className="space-y-1">
                                 <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-400 font-mono">{ext || 'other'}</span>
                                    <span className="text-gray-600">{count} archivos</span>
                                 </div>
                                 <div className="h-1.5 w-full bg-gray-900 rounded-full overflow-hidden">
                                    <div 
                                       className="h-full bg-brand-primary opacity-60 rounded-full"
                                       style={{ width: `${percentage}%` }}
                                    />
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'context' && (
            <motion.div 
              key="context"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 flex flex-col p-8 overflow-y-auto custom-scrollbar"
            >
              <div className="mb-12">
                <h3 className="text-2xl font-bold text-white mb-2 font-display">Centro de Exportación</h3>
                <p className="text-sm text-gray-400">Descarga los datos optimizados para otros agentes de IA.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 mb-12">
                <div className="bg-brand-surface/50 border border-gray-800 p-6 rounded-3xl group transition-all hover:border-brand-primary/30">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-primary/10 rounded-lg text-brand-primary">
                          <Database className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-white font-bold text-sm">Contexto de Arquitectura</h4>
                          <p className="text-[10px] text-gray-500">Prompt optimizado por tokens</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDownloadFile(generateAIContext(), "arquitectura_contexto.txt", "text/plain")}
                        className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                   </div>
                </div>

                <div className="bg-brand-surface/50 border border-gray-800 p-6 rounded-3xl group transition-all hover:border-brand-secondary/30">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-secondary/10 rounded-lg text-brand-secondary">
                          <Network className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-white font-bold text-sm">Grafo de Dependencias</h4>
                          <p className="text-[10px] text-gray-500">JSON estructural</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDownloadFile(JSON.stringify(projectData, null, 2), "proyecto_grafo.json", "application/json")}
                        className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                   </div>
                </div>

                {aiReview && (
                  <div className="bg-brand-surface/50 border border-brand-primary/20 p-6 rounded-3xl group transition-all hover:border-brand-primary/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-brand-primary/10 rounded-lg text-brand-primary">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-white font-bold text-sm">Reporte Auditoría Pro</h4>
                            <p className="text-[10px] text-gray-500">Markdown (.md)</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDownloadFile(aiReview, "auditoria_ia.md", "text/markdown")}
                          className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="bg-brand-primary/5 border border-brand-primary/20 p-5 rounded-3xl flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0">
                    <Code2 className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-brand-primary font-medium italic leading-relaxed">
                    "¡Exacto! Esto es lo que ocupábamos los desarrolladores para dar contexto real a nuestros agentes de IA."
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-display">Vista Previa Snapshot</h4>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => handleDownloadFile(generateAIContext(), "snapshot_completo.txt", "text/plain")}
                      className="text-[10px] font-bold text-brand-secondary hover:underline uppercase flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> Descargar
                    </button>
                    <button 
                      onClick={copyToClipboard}
                      className="text-[10px] font-bold text-brand-primary hover:underline uppercase"
                    >
                      {copied ? '¡Copiado!' : 'Copiar Portapapeles'}
                    </button>
                  </div>
                </div>
                <div className="bg-black/40 rounded-3xl border border-white/5 p-6 font-mono text-[11px] text-gray-400 leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar relative">
                   <div className="absolute top-4 right-4 text-[9px] text-gray-700 select-none">DATA_ORIGIN: LOCAL</div>
                   <pre className="whitespace-pre-wrap">{generateAIContext()}</pre>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'ia' && (
            <motion.div 
              key="ia"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 flex flex-col p-8 overflow-y-auto custom-scrollbar"
            >
              <div className="mb-12">
                <h3 className="text-2xl font-bold text-white mb-2 font-display">Inteligencia Arquitectónica</h3>
                <p className="text-sm text-gray-400">Reportes avanzados generados por modelos de lenguaje de última generación.</p>
              </div>

              <div className="bg-brand-surface/50 border border-gray-800 p-10 rounded-[40px] text-center flex flex-col items-center">
                <div className="w-20 h-20 rounded-3xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-8 animate-pulse">
                  <Sparkles className="w-10 h-10" />
                </div>
                <h4 className="text-xl font-bold text-white mb-3">Auditoría de Diseño AI</h4>
                <p className="text-sm text-gray-500 mb-10 max-w-sm">
                  Nuestro motor analiza el grafo de dependencias para encontrar cuellos de botella, lógica circular y sugerir optimizaciones de escalabilidad.
                </p>
                <button 
                  onClick={handleAIReview}
                  disabled={isReviewing}
                  className="w-full py-5 bg-brand-primary text-white rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl shadow-brand-primary/20"
                >
                  {isReviewing ? <Loader2 className="w-6 h-6 animate-spin" /> : <BarChart3 className="w-6 h-6" />}
                  {aiReview ? 'Abrir Reporte Detallado' : 'Generar Reporte Ahora'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'files' && (
            <motion.div 
              key="files"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 flex flex-col h-full overflow-hidden"
            >
              <div className="p-6 border-b border-gray-800 bg-brand-surface/50">
                <h3 className="text-xl font-bold text-white mb-2 font-display">Estructura del Proyecto</h3>
                <div className="flex items-center gap-3">
                   <div className="text-[10px] font-mono text-brand-primary bg-brand-primary/10 px-2 py-1 rounded">
                    {projectData.files.length} ARCHIVOS
                   </div>
                   <div className="text-[10px] font-mono text-brand-secondary bg-brand-secondary/10 px-2 py-1 rounded lowercase">
                    {projectData.files[0]?.path.split('/')[0]}
                   </div>
                </div>
              </div>

              <div className="p-4 border-b border-gray-800 bg-brand-surface/20">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type="text"
                    placeholder="Search folder or files..."
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                    className="w-full bg-brand-bg/50 border border-gray-800 rounded-xl py-2 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-brand-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 py-4">
                 {buildFileTree(projectData.files.filter(f => f.path.toLowerCase().includes(treeSearch.toLowerCase()))).length === 0 ? (
                    <div className="p-8 text-center text-gray-600 italic text-sm">No se encontraron archivos</div>
                 ) : (
                    buildFileTree(projectData.files.filter(f => f.path.toLowerCase().includes(treeSearch.toLowerCase()))).map((node, i) => (
                      <TreeItem 
                        key={i} 
                        node={node} 
                        level={0} 
                        onFileSelect={(file) => {
                          const node = projectData.nodes.find(n => n.id === file.id);
                          if (node) setSelectedNode(node);
                          setShowFileModal(true);
                        }}
                        selectedId={selectedNode?.id || null}
                      />
                    ))
                 )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* --- MODALS --- */}
      
      {/* IA Review Modal */}
      <Modal 
        isOpen={showIAModal} 
        onClose={() => setShowIAModal(false)} 
        title="Reporte Arquitectónico AI"
      >
        {!hasAiKey ? (
           <div className="py-20 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <AlertCircle className="w-10 h-10" />
              </div>
              <div className="max-w-md">
                <h4 className="text-2xl font-bold text-white mb-4">API Key Requerida</h4>
                <p className="text-gray-400 mb-8">Esta función requiere conectar con los modelos de Gemini. Configura tu API Key en los ajustes del entorno.</p>
              </div>
           </div>
        ) : isReviewing && !aiReview ? (
           <div className="py-20 flex flex-col items-center justify-center text-center space-y-8">
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-4 border-brand-primary/20 border-t-brand-primary animate-spin" />
                <Sparkles className="absolute inset-0 m-auto w-10 h-10 text-brand-primary animate-pulse" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Construyendo Inteligencia...</h3>
                <p className="text-gray-500">Estamos analizando {projectData.files.length} nodos y {projectData.links.length} dependencias.</p>
              </div>
           </div>
        ) : aiError ? (
           <div className="py-20 flex flex-col items-center justify-center text-center px-6">
              <div className="w-20 h-20 rounded-3xl bg-red-500/10 flex items-center justify-center text-red-500 mb-8">
                <AlertCircle className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Error de Análisis</h3>
              <p className="text-gray-400 mb-10 leading-relaxed">
                {aiError}
              </p>
              <button 
                onClick={handleAIReview}
                className="px-8 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all"
              >
                Reintentar Análisis
              </button>
           </div>
        ) : aiReview ? (
          <div className="prose prose-invert prose-brand max-w-none">
            <div className="markdown-body">
              <Markdown>{aiReview}</Markdown>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* File Details Modal */}
      <Modal 
        isOpen={showFileModal && !!selectedNode} 
        onClose={() => setShowFileModal(false)} 
        title={selectedNode?.label || "Detalles del Archivo"}
      >
        {selectedNode && (
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
               <div className="space-y-2">
                  <div className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">Ruta Completa</div>
                  <div className="text-xl font-mono text-white bg-white/5 p-4 rounded-2xl border border-white/5 break-all">
                    {selectedNode.id}
                  </div>
               </div>
               <div className="flex gap-4 shrink-0">
                  <div className="px-6 py-4 bg-brand-surface border border-gray-800 rounded-2xl text-center min-w-[120px]">
                    <div className="text-[9px] text-gray-500 uppercase mb-1">Tamaño</div>
                    <div className="text-lg font-bold text-white font-mono">{(selectedNode.data.size / 1024).toFixed(1)}k</div>
                  </div>
                  <div className="px-6 py-4 bg-brand-surface border border-gray-800 rounded-2xl text-center min-w-[120px]">
                    <div className="text-[9px] text-gray-500 uppercase mb-1">Impacto</div>
                    <div className="text-lg font-bold text-brand-secondary font-mono">{selectedNode.data.importance}</div>
                  </div>
               </div>
            </div>

            <div>
               <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                 <Code2 className="w-4 h-4 text-brand-primary" /> Contenido del Archivo
               </div>
               <div className="bg-[#0d1117] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
                  <div className="p-4 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-[10px] font-mono text-gray-600">
                     <span>{selectedNode.label}</span>
                     <span>{selectedNode.group.toUpperCase()}</span>
                  </div>
                  <div className="p-6 overflow-x-auto text-xs font-mono text-gray-400 custom-scrollbar leading-relaxed">
                    <pre>{selectedNode.data.content}</pre>
                  </div>
               </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}

function NavItem({ active, onClick, icon, label, mobile, badge }: { 
  active: boolean, 
  onClick: () => void, 
  icon: React.ReactNode, 
  label: string,
  mobile?: boolean,
  badge?: boolean
}) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl transition-all relative",
        active 
          ? "bg-brand-primary text-white" 
          : "text-gray-500 hover:text-white hover:bg-gray-800"
      )}
    >
      <div className="shrink-0">{icon}</div>
      {mobile && <span className="font-medium text-sm md:hidden">{label}</span>}
      {badge && <div className="absolute top-2 right-2 md:top-1 md:right-1 w-2 h-2 bg-brand-secondary rounded-full" />}
    </button>
  );
}
