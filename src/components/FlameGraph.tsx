import React, { useMemo, useState } from 'react';
import { ProcessedSpan } from '../types';
import { getServiceColor } from '../App';
import { cn } from './utils'; // Assuming cn utility is extracted or available

interface FlameGraphProps {
  roots: ProcessedSpan[];
  onSelect: (span: ProcessedSpan) => void;
  selectedSpanId: string | null;
}

export function FlameGraph({ roots, onSelect, selectedSpanId }: FlameGraphProps) {
  // Find global min/max time
  const { minTime, maxTime, totalDuration } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    
    const findBounds = (nodes: ProcessedSpan[]) => {
      for (const node of nodes) {
        if (node.startTimeMs < min) min = node.startTimeMs;
        if (node.endTimeMs > max) max = node.endTimeMs;
        findBounds(node.children);
      }
    };
    findBounds(roots);
    return { minTime: min, maxTime: max, totalDuration: max - min };
  }, [roots]);

  const renderLevel = (nodes: ProcessedSpan[], depth: number) => {
    return nodes.map((span) => {
      const leftPercent = totalDuration > 0 ? ((span.startTimeMs - minTime) / totalDuration) * 100 : 0;
      const widthPercent = totalDuration > 0 ? Math.max((span.durationMs / totalDuration) * 100, 0.1) : 100;
      const isSelected = selectedSpanId === span.spanId;
      const isError = span.status?.code === 2;

      return (
        <React.Fragment key={span.spanId}>
          <div
            className={cn(
              "absolute h-6 border-[0.5px] border-[#0B0C10] cursor-pointer transition-all hover:brightness-125 flex items-center px-1 overflow-hidden group",
              isSelected ? "ring-2 ring-white z-10" : "z-0"
            )}
            style={{
              left: `${leftPercent}%`,
              width: `${widthPercent}%`,
              top: `${depth * 24}px`,
              backgroundColor: isError ? '#ef4444' : getServiceColor(span.serviceName),
            }}
            onClick={() => onSelect(span)}
          >
            <span className="text-[10px] text-white font-mono truncate pointer-events-none drop-shadow-sm">
              {widthPercent > 2 ? span.name : ''}
            </span>
            
            {/* Tooltip */}
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-[100] pointer-events-none">
                <div className="bg-[#111218] text-slate-200 text-xs rounded py-1.5 px-2.5 shadow-xl border border-slate-800 whitespace-nowrap">
                    <div className="font-bold">{span.name}</div>
                    <div>{span.serviceName} • {span.durationMs.toFixed(2)}ms</div>
                </div>
            </div>
          </div>
          {renderLevel(span.children, depth + 1)}
        </React.Fragment>
      );
    });
  };

  if (roots.length === 0) return <div className="p-4 text-slate-500">No data for Flame Graph</div>;

  const maxDepth = useMemo(() => {
    let max = 0;
    const findMaxDepth = (nodes: ProcessedSpan[], depth: number) => {
      nodes.forEach(n => {
        if (depth > max) max = depth;
        findMaxDepth(n.children, depth + 1);
      });
    };
    findMaxDepth(roots, 1);
    return max;
  }, [roots]);

  return (
    <div className="w-full h-full overflow-auto bg-slate-900/30 p-4 relative">
      <div 
        className="relative min-w-full" 
        style={{ height: `${maxDepth * 24}px`, minHeight: '100%' }}
      >
        {renderLevel(roots, 0)}
      </div>
    </div>
  );
}
