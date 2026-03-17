import React, { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { OTLPTraceData, Span, ProcessedSpan } from './types';
import { Activity, Clock, Server, Play, RotateCcw, Trash2, AlertCircle, X, Search, Monitor, Cpu, Database, ArrowRightLeft, Layers, Share2, Flame, Download } from 'lucide-react';
import { ServiceGraph } from './components/ServiceGraph';
import { FlameGraph } from './components/FlameGraph';
import { TraceScatterPlot } from './components/TraceScatterPlot';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SERVICE_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // purple-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#84cc16', // lime-500
  '#14b8a6', // teal-500
  '#0ea5e9', // sky-500
  '#d946ef', // fuchsia-500
  '#f43f5e', // rose-500
];

export function getServiceColor(serviceName: string | undefined): string {
  if (!serviceName) return '#64748b'; // slate-500
  let hash = 0;
  for (let i = 0; i < serviceName.length; i++) {
    hash = serviceName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length];
}

// Tailind class mapping for the old components that still use it
const SERVICE_COLOR_CLASSES = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 
  'bg-pink-500', 'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500'
];

function getServiceColorClass(serviceName: string | undefined): string {
  if (!serviceName) return 'bg-slate-500';
  let hash = 0;
  for (let i = 0; i < serviceName.length; i++) {
    hash = serviceName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SERVICE_COLOR_CLASSES[Math.abs(hash) % SERVICE_COLOR_CLASSES.length];
}

// Helper to parse OTLP JSON into a flat list of spans
function extractSpans(traceData: OTLPTraceData): Span[] {
  const spans: Span[] = [];
  if (!traceData.resourceSpans) return spans;
  
  for (const rs of traceData.resourceSpans) {
    let serviceName = 'unknown-service';
    if (rs.resource?.attributes) {
      const svcAttr = rs.resource.attributes.find((a: any) => a.key === 'service.name');
      if (svcAttr) serviceName = String(svcAttr.value?.stringValue || svcAttr.value);
    }
    
    if (!rs.scopeSpans) continue;
    for (const ss of rs.scopeSpans) {
      if (!ss.spans) continue;
      // Inject service name into span attributes if not present
      const enrichedSpans = ss.spans.map(span => {
        const hasService = span.attributes?.some(a => a.key === 'service.name');
        if (!hasService) {
          return {
            ...span,
            attributes: [...(span.attributes || []), { key: 'service.name', value: serviceName }]
          };
        }
        return span;
      });
      spans.push(...enrichedSpans);
    }
  }
  return spans;
}

// Build a tree of spans
function buildSpanTree(spans: Span[]): ProcessedSpan[] {
  const spanMap = new Map<string, ProcessedSpan>();
  const roots: ProcessedSpan[] = [];

  // First pass: create ProcessedSpan objects
  for (const span of spans) {
    const startTimeMs = Number(BigInt(span.startTimeUnixNano) / 1000000n);
    const endTimeMs = Number(BigInt(span.endTimeUnixNano) / 1000000n);
    
    let serviceName = 'unknown-service';
    const svcAttr = span.attributes?.find(a => a.key === 'service.name');
    if (svcAttr) serviceName = String(svcAttr.value?.stringValue || svcAttr.value);
    
    spanMap.set(span.spanId, {
      ...span,
      children: [],
      startTimeMs,
      endTimeMs,
      durationMs: endTimeMs - startTimeMs,
      serviceName,
      hasErrorDescendant: false,
      isOnCriticalPath: false,
    });
  }

  // Second pass: build tree
  for (const span of spanMap.values()) {
    if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
      spanMap.get(span.parentSpanId)!.children.push(span);
    } else {
      roots.push(span);
    }
  }

  // Sort children by start time and compute hasErrorDescendant & isOnCriticalPath
  const processTree = (nodes: ProcessedSpan[]): boolean => {
    nodes.sort((a, b) => a.startTimeMs - b.startTimeMs);
    let anyError = false;
    
    // Find child with maximum duration to mark as critical path
    let maxDurChild: ProcessedSpan | null = null;
    let maxDur = -1;

    for (const node of nodes) {
      if (node.durationMs > maxDur) {
        maxDur = node.durationMs;
        maxDurChild = node;
      }
      
      const childrenHasError = processTree(node.children);
      node.hasErrorDescendant = childrenHasError;
      if (node.status?.code === 2 || childrenHasError) {
        anyError = true;
      }
    }
    
    if (maxDurChild) {
        maxDurChild.isOnCriticalPath = true;
    }

    return anyError;
  };
  
  processTree(roots);
  
  // Mark roots as critical path by default if they are the longest
  let maxRoot: ProcessedSpan | null = null;
  let maxRootDur = -1;
  roots.forEach(r => {
      if (r.durationMs > maxRootDur) {
          maxRootDur = r.durationMs;
          maxRoot = r;
      }
  });
  if (maxRoot) (maxRoot as ProcessedSpan).isOnCriticalPath = true;

  return roots;
}

function SpanNode({ span, depth, selectedSpanId, onSelect, traceDurationMs, traceStartTimeMs }: { key?: string | number, span: ProcessedSpan, depth: number, selectedSpanId: string | null, onSelect: (span: ProcessedSpan) => void, traceDurationMs: number, traceStartTimeMs: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = span.children.length > 0;
  
  const isSelected = selectedSpanId === span.spanId;
  const isError = span.status?.code === 2; // OTLP Error code is 2
  const hasErrorDescendant = span.hasErrorDescendant;

  // Map OTLP SpanKind to icons and colors
  // 1: INTERNAL, 2: SERVER, 3: CLIENT, 4: PRODUCER, 5: CONSUMER
  const getKindDetails = (kind: number) => {
    switch (kind) {
      case 2: // SERVER
        return { icon: <Server size={14} />, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" };
      case 3: // CLIENT
        return { icon: <Monitor size={14} />, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" };
      case 4: // PRODUCER
        return { icon: <ArrowRightLeft size={14} />, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" };
      case 5: // CONSUMER
        return { icon: <Database size={14} />, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" };
      case 1: // INTERNAL
      default:
        return { icon: <Cpu size={14} />, color: "text-slate-400", bg: "bg-slate-800/50 border-slate-700/50" };
    }
  };

  const kindDetails = getKindDetails(span.kind);

  // Extract key attributes for inline badges
  const inlineAttributes = [];
  if (span.attributes) {
    const httpMethod = span.attributes.find(a => a.key === 'http.method')?.value?.stringValue || span.attributes.find(a => a.key === 'http.method')?.value;
    const httpStatus = span.attributes.find(a => a.key === 'http.status_code')?.value?.intValue || span.attributes.find(a => a.key === 'http.status_code')?.value;
    const httpTarget = span.attributes.find(a => a.key === 'http.target' || a.key === 'url.path')?.value?.stringValue || span.attributes.find(a => a.key === 'http.target' || a.key === 'url.path')?.value;
    const rpcMethod = span.attributes.find(a => a.key === 'rpc.method')?.value?.stringValue || span.attributes.find(a => a.key === 'rpc.method')?.value;
    const dbSystem = span.attributes.find(a => a.key === 'db.system')?.value?.stringValue || span.attributes.find(a => a.key === 'db.system')?.value;
    const messagingSystem = span.attributes.find(a => a.key === 'messaging.system')?.value?.stringValue || span.attributes.find(a => a.key === 'messaging.system')?.value;

    if (httpMethod) inlineAttributes.push({ label: httpMethod, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' });
    if (httpStatus) {
      const statusNum = Number(httpStatus);
      const statusColor = statusNum >= 500 ? 'text-red-400 bg-red-500/10 border-red-500/20' : 
                          statusNum >= 400 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 
                          'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      inlineAttributes.push({ label: httpStatus, color: statusColor });
    }
    if (httpTarget) inlineAttributes.push({ label: httpTarget, color: 'text-slate-400 bg-slate-800/30 border-slate-700/30' });
    if (rpcMethod) inlineAttributes.push({ label: rpcMethod, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' });
    if (dbSystem) inlineAttributes.push({ label: dbSystem, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' });
    if (messagingSystem) inlineAttributes.push({ label: messagingSystem, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' });
  }

  // Calculate proportional bar
  const leftPercent = traceDurationMs > 0 ? ((span.startTimeMs - traceStartTimeMs) / traceDurationMs) * 100 : 0;
  const widthPercent = traceDurationMs > 0 ? Math.max((span.durationMs / traceDurationMs) * 100, 0.5) : 100;

  return (
    <div className="font-mono text-sm relative">
      <div 
        className={cn(
          "flex items-center py-1.5 px-2 cursor-pointer hover:bg-slate-800/50 transition-colors border-l-2 group relative overflow-hidden",
          isSelected ? "bg-slate-800 border-blue-500" : "border-transparent",
          isError && !isSelected ? "border-red-500/50" : "",
          !isError && hasErrorDescendant && !isSelected ? "border-red-500/30 border-dashed" : "", // Error propagation trail
          span.isOnCriticalPath && !isSelected ? "shadow-[0_0_15px_rgba(59,130,246,0.1)] border-blue-500/30" : "",
          (span as any).isHighlighted ? "bg-blue-500/10 ring-1 ring-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]" : ""
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(span)}
      >
        {/* Proportional Duration Bar */}
        <div 
          className="absolute inset-y-0 bg-white/5 pointer-events-none"
          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
        />
        <div 
          className="absolute bottom-0 h-0.5 bg-blue-500/30 pointer-events-none"
          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
        />

        <div className="w-4 h-4 mr-1 flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity relative z-10" onClick={(e) => {
          if (hasChildren) {
            e.stopPropagation();
            setExpanded(!expanded);
          }
        }}>
          {hasChildren && (
            <span className="text-xs">{expanded ? '▼' : '▶'}</span>
          )}
        </div>
        
        <div className={cn(
          "flex items-center justify-center w-5 h-5 rounded border mr-2 shrink-0 relative z-10",
          kindDetails.bg,
          kindDetails.color
        )} title={`Kind: ${span.kind}`}>
          {kindDetails.icon}
        </div>

        <div className={cn(
          "flex-1 flex items-center gap-1.5 min-w-0 relative z-10",
          isError ? "text-red-400" : "text-slate-200"
        )}>
          {isError && <AlertCircle size={14} className="text-red-500 shrink-0" />}
          <span className="truncate font-medium">{span.name}</span>
          
          {/* Inline Attribute Badges */}
          {inlineAttributes.map((attr, i) => (
            <span key={i} className={cn("px-1.5 py-0.5 rounded text-[10px] border shrink-0", attr.color)}>
              {String(attr.label)}
            </span>
          ))}
        </div>
        
        <div className="text-slate-500 text-xs ml-4 whitespace-nowrap tabular-nums relative z-10">
          {span.durationMs < 1 ? '<1ms' : `${span.durationMs.toFixed(0)}ms`}
        </div>
      </div>
      
      {expanded && hasChildren && (
        <div>
          {span.children.map(child => (
            <SpanNode 
              key={child.spanId} 
              span={child} 
              depth={depth + 1} 
              selectedSpanId={selectedSpanId}
              onSelect={onSelect}
              traceDurationMs={traceDurationMs}
              traceStartTimeMs={traceStartTimeMs}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Timeline({ roots, selectedSpanId, onSelect }: { roots: ProcessedSpan[], selectedSpanId: string | null, onSelect: (span: ProcessedSpan) => void }) {
  // Find global min/max time
  let minTime = Infinity;
  let maxTime = 0;
  
  const findBounds = (nodes: ProcessedSpan[]) => {
    for (const node of nodes) {
      if (node.startTimeMs < minTime) minTime = node.startTimeMs;
      if (node.endTimeMs > maxTime) maxTime = node.endTimeMs;
      findBounds(node.children);
    }
  };
  findBounds(roots);
  
  const totalDuration = maxTime - minTime;
  
  // Flatten tree for timeline
  const flatNodes: { span: ProcessedSpan, depth: number }[] = [];
  const flatten = (nodes: ProcessedSpan[], depth: number) => {
    for (const node of nodes) {
      flatNodes.push({ span: node, depth });
      flatten(node.children, depth + 1);
    }
  };
  flatten(roots, 0);

  if (flatNodes.length === 0) return <div className="p-4 text-slate-500">No timeline data</div>;

  return (
    <div className="overflow-x-auto overflow-y-auto h-full bg-slate-900/50 p-4">
      <div className="min-w-[800px]">
        {/* Header / Ruler */}
        <div className="flex border-b border-slate-800 pb-2 mb-2 text-xs text-slate-500 relative h-6">
          <div className="absolute left-0">0ms</div>
          <div className="absolute right-0">{totalDuration.toFixed(0)}ms</div>
        </div>
        
        {/* Rows */}
        <div className="space-y-1">
          {flatNodes.map(({ span, depth }) => {
            const leftPercent = totalDuration > 0 ? ((span.startTimeMs - minTime) / totalDuration) * 100 : 0;
            const widthPercent = totalDuration > 0 ? Math.max((span.durationMs / totalDuration) * 100, 0.5) : 100;
            const isError = span.status?.code === 2;
            const isSelected = selectedSpanId === span.spanId;
            
            return (
              <div 
                key={span.spanId} 
                className={cn(
                  "relative h-6 flex items-center group cursor-pointer rounded",
                  isSelected ? "bg-slate-800" : "hover:bg-slate-800/50"
                )}
                onClick={() => onSelect(span)}
              >
                {/* Timeline Bar */}
                <div 
                  className={cn(
                    "absolute h-4 rounded-sm transition-all group/bar",
                    isError ? "bg-red-500/80" : "",
                    isSelected ? "ring-1 ring-white" : ""
                  )}
                  style={{ 
                    left: `${leftPercent}%`, 
                    width: `${widthPercent}%`,
                    minWidth: '2px',
                    opacity: isError ? 1 : 0.8,
                    backgroundColor: isError ? undefined : getServiceColor(span.serviceName)
                  }}
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover/bar:flex flex-col items-center z-50 pointer-events-none">
                    <div className="bg-[#111218] text-slate-200 text-xs rounded py-1.5 px-2.5 shadow-xl border border-slate-800 whitespace-nowrap">
                      <div className="font-medium text-slate-100 flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", isError ? "bg-red-500" : "")} style={{ backgroundColor: isError ? undefined : getServiceColor(span.serviceName) }} />
                        {span.name}
                      </div>
                      <div className="text-slate-400 mt-1 flex items-center justify-between gap-4">
                        <span>{span.serviceName || 'unknown'}</span>
                      </div>
                      <div className="text-slate-400 mt-1 flex items-center justify-between gap-4">
                        <span>{span.durationMs < 1 ? '<1ms' : `${span.durationMs.toFixed(2)} ms`}</span>
                        <span className={isError ? "text-red-400" : "text-emerald-400"}>{isError ? 'Error' : 'Success'}</span>
                      </div>
                    </div>
                    <div className="w-2 h-2 bg-[#111218] border-r border-b border-slate-800 rotate-45 -mt-1.5"></div>
                  </div>
                </div>
                
                {/* Label (shows on hover or if enough space) */}
                <div 
                  className="absolute text-xs text-white px-2 truncate pointer-events-none z-10 drop-shadow-md"
                  style={{ left: `${leftPercent}%`, paddingLeft: widthPercent > 10 ? '4px' : 'calc(100% + 4px)' }}
                >
                  {span.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SpanDetails({ span, onClose }: { span: ProcessedSpan | null, onClose: () => void }) {
  if (!span) {
    return null;
  }

  const isError = span.status?.code === 2;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          {isError && <span className="w-2 h-2 rounded-full bg-red-500" />}
          {span.name}
        </h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              const blob = new Blob([JSON.stringify(span, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `trace-${span.traceId}-span-${span.spanId}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Download Span JSON"
          >
            <Download size={18} />
          </button>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Close details"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <div className="text-sm text-slate-400 font-mono">
            ID: {span.spanId}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
          <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Duration</div>
          <div className="text-lg text-slate-200 font-mono">
            {span.durationMs.toFixed(2)} ms
          </div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800">
          <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Start Time</div>
          <div className="text-sm text-slate-200 font-mono">
            {format(new Date(span.startTimeMs), 'HH:mm:ss.SSS')}
          </div>
        </div>
      </div>

      {span.attributes && span.attributes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-2 uppercase tracking-wider">Attributes</h3>
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full text-sm text-left">
              <tbody className="divide-y divide-slate-800/50">
                {span.attributes.map((attr, i) => (
                  <tr key={i} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-mono text-slate-400 w-1/3 break-all">{attr.key}</td>
                    <td className="py-2 px-3 font-mono text-slate-200 break-all">
                      {typeof attr.value === 'object' ? JSON.stringify(attr.value) : String(attr.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {span.events && span.events.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-slate-300 mb-2 uppercase tracking-wider">Logs / Events</h3>
          <div className="space-y-2">
            {span.events.map((event, i) => {
              const eventTimeMs = Number(BigInt(event.timeUnixNano) / 1000000n);
              return (
                <div key={i} className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 font-mono text-sm">
                  <div className="text-slate-500 text-xs mb-1">
                    {format(new Date(eventTimeMs), 'HH:mm:ss.SSS')}
                  </div>
                  <div className="text-slate-200 mb-2">{event.name}</div>
                  {event.attributes && event.attributes.length > 0 && (
                    <div className="pl-4 border-l-2 border-slate-800 space-y-1 mt-2">
                      {event.attributes.map((attr, j) => (
                        <div key={j} className="flex text-xs">
                          <span className="text-slate-500 mr-2">{attr.key}:</span>
                          <span className="text-slate-300">{typeof attr.value === 'object' ? JSON.stringify(attr.value) : String(attr.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function TraceGroup({ traceId, roots, activeTab, selectedSpanId, onSelect }: { traceId: string, roots: ProcessedSpan[], activeTab: string, selectedSpanId: string | null, onSelect: (span: ProcessedSpan) => void }) {
  const [expanded, setExpanded] = useState(true);

  // Calculate summary
  let minStartTime = Infinity;
  let maxEndTime = -Infinity;
  let hasError = false;
  let spanCount = 0;
  let errorCount = 0;
  const allSpans: ProcessedSpan[] = [];

  const traverse = (node: ProcessedSpan) => {
    spanCount++;
    allSpans.push(node);
    if (node.startTimeMs < minStartTime) minStartTime = node.startTimeMs;
    const endTimeMs = node.startTimeMs + node.durationMs;
    if (endTimeMs > maxEndTime) maxEndTime = endTimeMs;
    if (node.status?.code === 2) {
      hasError = true;
      errorCount++;
    }
    node.children.forEach(traverse);
  };

  roots.forEach(traverse);
  const durationMs = maxEndTime === -Infinity ? 0 : maxEndTime - minStartTime;

  // Find primary root name
  const rootName = roots.length > 0 ? roots[0].name : 'Unknown Operation';
  
  // Try to find service name
  let serviceName = 'unknown-service';
  if (roots.length > 0 && roots[0].attributes) {
    const svcAttr = roots[0].attributes.find(a => a.key === 'service.name');
    if (svcAttr) serviceName = String(svcAttr.value);
  }

  return (
    <div className={cn(
      "mb-4 border rounded-lg overflow-hidden bg-[#111218]/30 transition-colors",
      hasError ? "border-red-500/30" : "border-slate-800"
    )}>
      <div 
        className={cn(
          "flex items-center justify-between p-3 cursor-pointer hover:bg-slate-800/50 transition-colors border-b",
          hasError ? "bg-red-500/5 border-red-500/20" : "bg-[#111218] border-slate-800"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="text-slate-400 text-xs w-4 text-center">
            {expanded ? '▼' : '▶'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-200">{rootName}</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono border border-slate-700">
                {serviceName}
              </span>
              {hasError && (
                <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle size={10} />
                  {errorCount} Error{errorCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 font-mono">
              <span>{traceId.substring(0, 8)}...</span>
              <span className="text-slate-600">•</span>
              <span>{minStartTime !== Infinity ? format(new Date(minStartTime), 'MMM d, HH:mm:ss.SSS') : 'Unknown time'}</span>
            </div>
          </div>
        </div>
        
        {/* Sparkline */}
        <div className="flex-1 max-w-[120px] mx-4 h-6 relative opacity-60 hidden sm:block">
          {durationMs > 0 && allSpans.map((s, i) => {
            const left = ((s.startTimeMs - minStartTime) / durationMs) * 100;
            const width = Math.max((s.durationMs / durationMs) * 100, 1);
            const isErr = s.status?.code === 2;
            return (
              <div 
                key={i} 
                className={cn("absolute h-1 rounded-full top-1/2 -translate-y-1/2", isErr ? "bg-red-500" : "bg-blue-400")}
                style={{ left: `${left}%`, width: `${width}%`, opacity: 0.3 + (0.7 * (1 - (i / allSpans.length))) }}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-slate-400 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/50">
            <Layers size={12} />
            <span>{spanCount} spans</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/50">
            <Clock size={12} />
            <span>{durationMs < 1 ? '<1' : durationMs.toFixed(2)} ms</span>
          </div>
        </div>
      </div>
      
      {expanded && (
        <div className="p-2">
          {activeTab === 'tree' ? (
            roots.map(root => (
              <SpanNode 
                key={root.spanId} 
                span={root} 
                depth={0} 
                selectedSpanId={selectedSpanId}
                onSelect={onSelect}
                traceDurationMs={durationMs}
                traceStartTimeMs={minStartTime}
              />
            ))
          ) : (
            <div className="h-64">
              <Timeline 
                roots={roots} 
                selectedSpanId={selectedSpanId}
                onSelect={onSelect}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [rawSpans, setRawSpans] = useState<Span[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tree' | 'timeline' | 'topology' | 'flame'>('tree');
  
  const [filterName, setFilterName] = useState('');
  const [filterTraceId, setFilterTraceId] = useState('');
  const [filterMinDuration, setFilterMinDuration] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'error'>('all');
  const [groupByTrace, setGroupByTrace] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchHighlightOnly, setSearchHighlightOnly] = useState(true);

  useEffect(() => {
    // Fetch existing traces
    fetch('/api/traces')
      .then(res => res.json())
      .then((data: OTLPTraceData[]) => {
        const allSpans = data.flatMap(extractSpans);
        setRawSpans(allSpans);
      })
      .catch(err => console.error('Failed to fetch initial traces:', err));

    // Connect WebSocket
    const socket = io();
    
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('new_trace', (traceData: OTLPTraceData) => {
      const newSpans = extractSpans(traceData);
      setRawSpans(prev => [...prev, ...newSpans]);
    });

    socket.on('clear_traces', () => {
      setRawSpans([]);
      setSelectedSpanId(null);
    });

    return () => {
      socket.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedSpanId, groupedTraces]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === 'j') {
      // Find next trace/span
      navigateSelection(1);
    } else if (e.key === 'k') {
      navigateSelection(-1);
    } else if (e.key === 'Escape') {
      setSelectedSpanId(null);
    }
  };

  const navigateSelection = (direction: number) => {
    // Basic trace navigation for now
    if (groupedTraces.length === 0) return;
    const currentIndex = selectedSpanId 
      ? groupedTraces.findIndex(g => g.roots.some(r => r.spanId === selectedSpanId || findInTree(r, selectedSpanId)))
      : -1;
    
    const nextIndex = Math.max(0, Math.min(groupedTraces.length - 1, currentIndex + direction));
    const nextTrace = groupedTraces[nextIndex];
    if (nextTrace && nextTrace.roots.length > 0) {
      setSelectedSpanId(nextTrace.roots[0].spanId);
    }
  };

  const findInTree = (node: ProcessedSpan, id: string): ProcessedSpan | null => {
    if (node.spanId === id) return node;
    for (const child of node.children) {
      const found = findInTree(child, id);
      if (found) return found;
    }
    return null;
  };

  const clearTraces = () => {
    fetch('/api/clear', { method: 'POST' });
  };

  const spanTree = useMemo(() => buildSpanTree(rawSpans), [rawSpans]);
  
  const filteredSpanTree = useMemo(() => {
    const isSearching = !!globalSearch;
    const searchLower = globalSearch.toLowerCase();
    
    if (!filterName && !filterMinDuration && filterStatus === 'all' && !filterTraceId && !isSearching) {
      return spanTree;
    }

    const minDur = filterMinDuration ? parseFloat(filterMinDuration) : 0;
    const nameLower = filterName.toLowerCase();
    const traceIdLower = filterTraceId.toLowerCase();

    const filterNode = (node: ProcessedSpan): ProcessedSpan | null => {
      const children = node.children
        .map(filterNode)
        .filter((c): c is ProcessedSpan => c !== null);

      const isError = node.status?.code === 2;
      const matchesStatus = filterStatus === 'all' 
        ? true 
        : filterStatus === 'error' ? isError : !isError;
      
      const matchesName = !nameLower || node.name.toLowerCase().includes(nameLower);
      const matchesDuration = !minDur || node.durationMs >= minDur;
      const matchesTraceId = !traceIdLower || node.traceId.toLowerCase().includes(traceIdLower);
      
      let matchesGlobal = true;
      let isSearchHighlight = false;

      if (isSearching) {
        const inName = node.name.toLowerCase().includes(searchLower);
        const inTraceId = node.traceId.toLowerCase().includes(searchLower);
        const inAttributes = node.attributes?.some(attr => 
          attr.key.toLowerCase().includes(searchLower) || 
          String(attr.value).toLowerCase().includes(searchLower)
        ) || false;
        
        isSearchHighlight = inName || inTraceId || inAttributes;
        matchesGlobal = isSearchHighlight;
      }

      const matchesSelf = matchesStatus && matchesName && matchesDuration && matchesTraceId && (searchHighlightOnly ? true : matchesGlobal);

      if (matchesSelf || children.length > 0) {
        return { 
          ...node, 
          children,
          // Store highlight state in the node for UI rendering
          ...(isSearching ? { isHighlighted: isSearchHighlight } : {})
        } as any;
      }

      return null;
    };

    return spanTree.map(filterNode).filter((n): n is ProcessedSpan => n !== null);
  }, [spanTree, filterName, filterMinDuration, filterStatus, filterTraceId, globalSearch, searchHighlightOnly]);
  
  const groupedTraces = useMemo(() => {
    const groups = new Map<string, ProcessedSpan[]>();
    for (const root of filteredSpanTree) {
      if (!groups.has(root.traceId)) {
        groups.set(root.traceId, []);
      }
      groups.get(root.traceId)!.push(root);
    }
    
    return Array.from(groups.entries()).map(([traceId, roots]) => {
      const minStartTime = Math.min(...roots.map(r => r.startTimeMs));
      return { traceId, roots, minStartTime };
    }).sort((a, b) => b.minStartTime - a.minStartTime);
  }, [filteredSpanTree]);
  const performanceMetrics = useMemo(() => {
    if (groupedTraces.length === 0) return null;
    const durations = groupedTraces.map(g => {
        let maxEnd = -Infinity;
        let minStart = Infinity;
        const traverse = (n: ProcessedSpan) => {
            if (n.startTimeMs < minStart) minStart = n.startTimeMs;
            const end = n.startTimeMs + n.durationMs;
            if (end > maxEnd) maxEnd = end;
            n.children.forEach(traverse);
        };
        g.roots.forEach(traverse);
        return maxEnd - minStart;
    }).sort((a, b) => a - b);

    const getP = (p: number) => {
        const idx = Math.floor(durations.length * p);
        return durations[idx] || 0;
    };

    return {
        p50: getP(0.5),
        p90: getP(0.9),
        p99: getP(0.99),
        count: durations.length
    };
  }, [groupedTraces]);

  const selectedSpan = useMemo(() => {
    if (!selectedSpanId) return null;
    const findSpan = (nodes: ProcessedSpan[]): ProcessedSpan | null => {
      for (const node of nodes) {
        if (node.spanId === selectedSpanId) return node;
        const found = findSpan(node.children);
        if (found) return found;
      }
      return null;
    };
    return findSpan(spanTree);
  }, [selectedSpanId, spanTree]);

  return (
    <div className="h-screen w-full bg-[#0B0C10] text-slate-300 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 bg-[#111218] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
            D
          </div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Daggerboard</h1>
          <div className="ml-4 flex items-center gap-2 text-xs font-mono px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50">
            <div className={cn("w-2 h-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-red-500")} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        <div className="flex-1 max-w-xl mx-8 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Search across traces, spans, and attributes..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full bg-[#0B0C10] border border-slate-700/50 rounded-md pl-10 pr-4 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
            />
          </div>
          <button 
            onClick={() => setSearchHighlightOnly(!searchHighlightOnly)}
            className={cn(
              "p-1.5 rounded border text-[10px] font-bold uppercase transition-all whitespace-nowrap",
              searchHighlightOnly ? "bg-blue-600/20 border-blue-500/50 text-blue-400" : "bg-slate-800 border-slate-700 text-slate-500"
            )}
            title="Toggle between filtering out non-matches and just highlighting them"
          >
            {searchHighlightOnly ? "Highlight Mode" : "Filter Mode"}
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-500 font-mono mr-4">
            {rawSpans.length} spans
          </div>
          <button 
            onClick={() => {
              const now = Date.now() * 1000000;
              const mockTrace: OTLPTraceData = {
                resourceSpans: [{
                  resource: {},
                  scopeSpans: [{
                    scope: {},
                    spans: [
                      {
                        traceId: 'mock-trace-1',
                        spanId: 'span-1',
                        name: 'dagger call check',
                        kind: 1,
                        startTimeUnixNano: String(now),
                        endTimeUnixNano: String(now + 5000 * 1000000),
                        attributes: [{ key: 'dagger.module', value: 'test' }],
                        events: [],
                        status: { code: 1 }
                      },
                      {
                        traceId: 'mock-trace-1',
                        spanId: 'span-2',
                        parentSpanId: 'span-1',
                        name: 'build container',
                        kind: 1,
                        startTimeUnixNano: String(now + 100 * 1000000),
                        endTimeUnixNano: String(now + 2000 * 1000000),
                        attributes: [],
                        events: [{ timeUnixNano: String(now + 150 * 1000000), name: 'pulling image', attributes: [] }],
                        status: { code: 1 }
                      },
                      {
                        traceId: 'mock-trace-1',
                        spanId: 'span-3',
                        parentSpanId: 'span-1',
                        name: 'run tests',
                        kind: 1,
                        startTimeUnixNano: String(now + 2100 * 1000000),
                        endTimeUnixNano: String(now + 4900 * 1000000),
                        attributes: [],
                        events: [],
                        status: { code: 2 } // Error
                      }
                    ]
                  }]
                }]
              };
              fetch('/v1/traces', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(mockTrace)
              });
            }}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Inject Mock Trace"
          >
            <Play size={16} />
          </button>
          <button 
            onClick={clearTraces}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Clear Traces"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Tree / Timeline */}
        <div className={cn(
          "border-slate-800 flex flex-col bg-[#0B0C10] transition-all duration-300",
          selectedSpan ? "w-1/2 border-r" : "w-full"
        )}>
          <div className="h-10 border-b border-slate-800 flex items-center px-2 shrink-0 bg-[#111218]/50 justify-between">
            <div className="flex items-center">
              <button 
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2",
                  activeTab === 'tree' ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                )}
                onClick={() => setActiveTab('tree')}
              >
                <Server size={14} />
                Trace Tree
              </button>
              <button 
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ml-1",
                  activeTab === 'timeline' ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                )}
                onClick={() => setActiveTab('timeline')}
              >
                <Activity size={14} />
                Timeline
              </button>
              <button 
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ml-1",
                  activeTab === 'topology' ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                )}
                onClick={() => setActiveTab('topology')}
              >
                <Share2 size={14} />
                Topology
              </button>
              <button 
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ml-1",
                  activeTab === 'flame' ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                )}
                onClick={() => setActiveTab('flame')}
              >
                <Flame size={14} />
                Flame Graph
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer hover:text-white mr-2">
                <input 
                  type="checkbox" 
                  checked={groupByTrace}
                  onChange={(e) => setGroupByTrace(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500/20"
                />
                Group by Trace
              </label>
              <input 
                type="text" 
                placeholder="Filter by trace ID..." 
                value={filterTraceId}
                onChange={(e) => setFilterTraceId(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-32"
              />
              <input 
                type="text" 
                placeholder="Filter by name..." 
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-32"
              />
              <input 
                type="number" 
                placeholder="Min ms" 
                value={filterMinDuration}
                onChange={(e) => setFilterMinDuration(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-20"
              />
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </select>
            </div>
          </div>
          
          <TraceScatterPlot 
            traces={groupedTraces} 
            onSelectTrace={(traceId) => {
              setFilterTraceId(traceId);
              // Find the first span of this trace to select it
              const trace = groupedTraces.find(t => t.traceId === traceId);
              if (trace && trace.roots.length > 0) {
                  setSelectedSpanId(trace.roots[0].spanId);
              }
            }} 
          />
          
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">
            {/* Metrics Dashboard */}
            {performanceMetrics && (
              <div className="mb-6 grid grid-cols-4 gap-3">
                <div className="bg-[#111218] border border-slate-800 rounded-lg p-3 shadow-inner">
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter mb-1">Total Traces</div>
                  <div className="text-xl font-mono text-slate-300">{performanceMetrics.count}</div>
                </div>
                <div className="bg-[#111218] border border-slate-800 rounded-lg p-3 shadow-inner border-l-blue-500/50">
                  <div className="text-[10px] text-blue-500/70 uppercase font-bold tracking-tighter mb-1">P50 Latency</div>
                  <div className="text-xl font-mono text-slate-300">{performanceMetrics.p50.toFixed(1)}ms</div>
                </div>
                <div className="bg-[#111218] border border-slate-800 rounded-lg p-3 shadow-inner border-l-amber-500/50">
                  <div className="text-[10px] text-amber-500/70 uppercase font-bold tracking-tighter mb-1">P90 Latency</div>
                  <div className="text-xl font-mono text-slate-300">{performanceMetrics.p90.toFixed(1)}ms</div>
                </div>
                <div className="bg-[#111218] border border-slate-800 rounded-lg p-3 shadow-inner border-l-red-500/50">
                  <div className="text-[10px] text-red-500/70 uppercase font-bold tracking-tighter mb-1">P99 Latency</div>
                  <div className="text-xl font-mono text-slate-300">{performanceMetrics.p99.toFixed(1)}ms</div>
                </div>
              </div>
            )}

            {rawSpans.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                <Activity size={48} className="opacity-20" />
                <div className="text-center">
                  <p className="mb-2">Waiting for Dagger traces...</p>
                  <code className="block text-xs bg-slate-900 px-3 py-2 rounded border border-slate-800 text-left">
                    export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318<br/>
                    export OTEL_EXPORTER_OTLP_PROTOCOL=http/json<br/>
                    dagger call check
                  </code>
                </div>
              </div>
            ) : (
              groupByTrace ? (
                groupedTraces.map(group => (
                  <TraceGroup
                    key={group.traceId}
                    traceId={group.traceId}
                    roots={group.roots}
                    activeTab={activeTab}
                    selectedSpanId={selectedSpanId}
                    onSelect={(s) => setSelectedSpanId(s.spanId)}
                  />
                ))
              ) : (
                activeTab === 'tree' ? (
                  <div className="py-2">
                    {filteredSpanTree.map(root => {
                      // Need to calculate duration for root if not grouped
                      let minTime = root.startTimeMs;
                      let maxTime = root.startTimeMs + root.durationMs;
                      const findBounds = (n: ProcessedSpan) => {
                        if (n.startTimeMs < minTime) minTime = n.startTimeMs;
                        if (n.startTimeMs + n.durationMs > maxTime) maxTime = n.startTimeMs + n.durationMs;
                        n.children.forEach(findBounds);
                      };
                      findBounds(root);
                      const dur = maxTime - minTime;

                      return (
                        <SpanNode 
                          key={root.spanId} 
                          span={root} 
                          depth={0} 
                          selectedSpanId={selectedSpanId}
                          onSelect={(s) => setSelectedSpanId(s.spanId)}
                          traceDurationMs={dur}
                          traceStartTimeMs={minTime}
                        />
                      );
                    })}
                  </div>
                ) : activeTab === 'timeline' ? (
                  <Timeline 
                    roots={filteredSpanTree} 
                    selectedSpanId={selectedSpanId}
                    onSelect={(s) => setSelectedSpanId(s.spanId)}
                  />
                ) : activeTab === 'topology' ? (
                  <ServiceGraph spans={filteredSpanTree} />
                ) : (
                  <FlameGraph 
                    roots={filteredSpanTree} 
                    selectedSpanId={selectedSpanId}
                    onSelect={(s) => setSelectedSpanId(s.spanId)}
                  />
                )
              )
            )}
            {filteredSpanTree.length === 0 && rawSpans.length > 0 && (
              <div className="p-4 text-slate-500 text-center text-sm">No traces match the current filters.</div>
            )}
          </div>
        </div>

        {/* Right Panel: Details */}
        {selectedSpan && (
          <div className="w-1/2 bg-[#111218] flex flex-col border-l border-slate-800">
            <SpanDetails span={selectedSpan} onClose={() => setSelectedSpanId(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
