import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';

export type FolderNodeData = {
  folderPath: string;
  folderName: string;
  fileCount: number;
  isExpanded: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onToggleExpand?: (path: string) => void;
};

const FolderNodeComponent: React.FC<NodeProps> = ({ data: rawData }) => {
  const data = rawData as FolderNodeData;
  const {
    folderPath,
    folderName,
    fileCount,
    isExpanded,
    isSelected,
    isDimmed,
    onToggleExpand,
  } = data;

  const opacity = isDimmed ? 0.2 : 1;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleExpand) {
      onToggleExpand(folderPath);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer select-none backdrop-blur-md ${
        isSelected
          ? 'bg-indigo-950/90 border-indigo-500 shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500/30'
          : isExpanded
          ? 'bg-slate-900/90 border-slate-700 hover:border-indigo-500/50 shadow-md'
          : 'bg-slate-950/90 border-slate-800 hover:border-indigo-500/60 shadow-md hover:shadow-indigo-500/10'
      }`}
      style={{
        opacity,
        minWidth: 160,
        maxWidth: 240,
        pointerEvents: isDimmed ? 'none' : 'all',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-slate-900"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-indigo-500 !border-2 !border-slate-900"
      />

      {/* Folder Icon */}
      <div className={`p-1.5 rounded-lg flex items-center justify-center transition-colors ${
        isExpanded ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-amber-400 group-hover:text-amber-300'
      }`}>
        {isExpanded ? (
          <FolderOpen className="w-4 h-4" />
        ) : (
          <Folder className="w-4 h-4" />
        )}
      </div>

      {/* Name and Count */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-slate-100 truncate tracking-tight font-mono">
            {folderName}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
          <span className="px-1.5 py-0.2 bg-slate-900 border border-slate-800 rounded text-[9px] text-indigo-300 font-bold">
            {fileCount} {fileCount === 1 ? 'archivo' : 'archivos'}
          </span>
        </span>
      </div>

      {/* Expand/Collapse Chevron Indicator */}
      <div className="text-slate-400 group-hover:text-slate-200 transition-colors pl-1">
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </div>
    </div>
  );
};

export const FolderNode = memo(FolderNodeComponent);
