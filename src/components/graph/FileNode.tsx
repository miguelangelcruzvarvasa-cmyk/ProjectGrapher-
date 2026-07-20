import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ProjectFile } from '../../types';

// Colour palette (mirrors D3 canvas colours)
const EXT_COLORS: Record<string, string> = {
  '.js': '#f59e0b',
  '.jsx': '#f59e0b',
  '.ts': '#3b82f6',
  '.tsx': '#3b82f6',
  '.py': '#10b981',
  '.html': '#ec4899',
  '.css': '#06b6d4',
  '.scss': '#06b6d4',
  '.json': '#8b5cf6',
  '.md': '#94a3b8',
  '.rs': '#f97316',
  '.go': '#06b6d4',
  '.cs': '#a78bfa',
};

const FALLBACK_COLOR = '#6366f1';

function getColor(ext: string): string {
  return EXT_COLORS[ext] ?? FALLBACK_COLOR;
}

export type FileNodeData = {
  projectFile: ProjectFile;
  size: number;           // radius in px
  importance: number;
  isHighImportance: boolean;
  isMediumImportance: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  isFocusMode: boolean;
};

const FileNodeComponent: React.FC<NodeProps> = ({ data: rawData }) => {
  const data = rawData as FileNodeData;
  const {
    projectFile,
    size,
    isHighImportance,
    isSelected,
    isDimmed,
    isFocusMode,
  } = data;

  const color = getColor(projectFile.ext);
  const r = size; // radius

  const containerSize = r * 2 + 20; // add room for glow / aura
  const center = containerSize / 2;

  // Colours
  const fillColor = isSelected
    ? '#6366f1'
    : isHighImportance
    ? '#f59e0b'
    : color;

  const strokeColor = isSelected
    ? '#c4b5fd'
    : isHighImportance
    ? '#fde68a'
    : '#1f2937';

  const strokeWidth = isSelected ? 3 : isHighImportance ? 2.6 : 2;

  const glowFilter = isSelected
    ? 'drop-shadow(0 0 10px rgba(99,102,241,0.75))'
    : isHighImportance
    ? 'drop-shadow(0 0 7px rgba(245,158,11,0.5))'
    : 'drop-shadow(0 2px 5px rgba(0,0,0,0.3))';

  const opacity = isDimmed ? (isFocusMode ? 0.05 : 0.1) : 1;

  const labelColor = isSelected
    ? '#fff'
    : isHighImportance
    ? '#e8eef9'
    : '#9ca3af';

  return (
    <div
      style={{
        width: containerSize,
        height: containerSize,
        opacity,
        transition: 'opacity 180ms ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        pointerEvents: isDimmed && isFocusMode ? 'none' : 'all',
        position: 'relative',
      }}
    >
      {/* Invisible Handles so React Flow can route connections */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          opacity: 0,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          opacity: 0,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* SVG node circle */}
      <div
        style={{
          width: r * 2,
          height: r * 2,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width={containerSize}
          height={containerSize}
          style={{
            position: 'absolute',
            top: -(containerSize - r * 2) / 2,
            left: -(containerSize - r * 2) / 2,
            overflow: 'visible',
            filter: glowFilter,
            transition: 'filter 180ms ease',
          }}
        >
          {/* Halo */}
          <circle
            cx={center}
            cy={center}
            r={r + (isHighImportance ? 6 : 4)}
            fill={fillColor}
            fillOpacity={isSelected ? 0.18 : isHighImportance ? 0.12 : 0.06}
          />
          {/* Highlight specular */}
          <circle
            cx={center}
            cy={center - r * 0.18}
            r={Math.max(2, r - 1.8)}
            fill="white"
            fillOpacity={isSelected ? 0.2 : isHighImportance ? 0.12 : 0.05}
          />
          {/* Main circle */}
          <circle
            cx={center}
            cy={center}
            r={r}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
          {/* Aura ring for high-importance nodes */}
          {isHighImportance && (
            <circle
              cx={center}
              cy={center}
              r={r + 4}
              fill="none"
              stroke={strokeColor}
              strokeOpacity={0.28}
              strokeWidth={1.2}
            />
          )}
        </svg>
      </div>

      {/* Label below */}
      <span
        style={{
          marginTop: 6,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 9,
          fontWeight: isSelected || isHighImportance ? 700 : 400,
          color: labelColor,
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          whiteSpace: 'nowrap',
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          pointerEvents: 'none',
          position: 'absolute',
          top: r * 2 + 10,
        }}
      >
        {projectFile.name}
      </span>
    </div>
  );
};

export const FileNode = memo(FileNodeComponent);
