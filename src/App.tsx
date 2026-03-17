import React, { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { OTLPTraceData, Span, ProcessedSpan } from './types';
import { Activity, Clock, Server, Play, RotateCcw, Trash2, AlertCircle, X, Search, Monitor, Cpu, Database, ArrowRightLeft, Layers, Share2, Flame, Download, Terminal, ChevronDown, ChevronUp, LayoutGrid, BarChart3, Settings } from 'lucide-react';
import { ServiceGraph } from './components/ServiceGraph';
import { FlameGraph } from './components/FlameGraph';
import { TraceScatterPlot } from './components/TraceScatterPlot';
import { DaggerSetup } from './components/DaggerSetup';
import { format } from 'date-fns';
import { extractSpans, buildSpanTree } from './utils';
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

// getServiceColor is exported for use in components

function SpanNode({ span, depth, selectedSpanId, onSelect, traceDurationMs, traceStartTimeMs }: { span: ProcessedSpan, depth: number, selectedSpanId: string | null, onSelect: (span: ProcessedSpan) => void, traceDurationMs: number, traceStartTimeMs: number, key?: string }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = span.children.length > 0;
  
  const isSelected = selectedSpanId === span.spanId;
  const isError = span.status?.code === 2;
  const hasErrorDescendant = span.hasErrorDescendant;

  const getKindDetails = (kind: number) => {
    switch (kind) {
      case 2: // SERVER
        return { icon: <Server size={14} />, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" };
      case 3: // CLIENT
        return { icon: <Monitor size={14} />, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" };
      case 4: // PRODUCER
        return { icon: <ArrowRightLeft size={14} />, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" };
      case 5: // CONSUMER
        return { icon: <Database size={14} />, color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" };
      default:
        return { icon: <Cpu size={14} />, color: "text-slate-400", bg: "bg-white/5 border-white/10" };
    }
  };

  const kindDetails = getKindDetails(span.kind);

  const inlineAttributes = [];
  if (span.attributes) {
    const httpMethod = span.attributes.find(a => a.key === 'http.method')?.value?.stringValue || span.attributes.find(a => a.key === 'http.method')?.value;
    const httpStatus = span.attributes.find(a => a.key === 'http.status_code')?.value?.intValue || span.attributes.find(a => a.key === 'http.status_code')?.value;
    const httpTarget = span.attributes.find(a => a.key === 'http.target' || a.key === 'url.path')?.value?.stringValue || span.attributes.find(a => a.key === 'http.target' || a.key === 'url.path')?.value;

    if (httpMethod) inlineAttributes.push({ label: httpMethod, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' });
    if (httpStatus) {
      const statusNum = Number(httpStatus);
      const statusColor = statusNum >= 500 ? 'text-red-400 bg-red-500/5 border-red-500/20' : 
                          statusNum >= 400 ? 'text-orange-400 bg-orange-500/5 border-orange-500/20' : 
                          'text-emerald-400 bg-emerald-500/5 border-emerald-500/20';
      inlineAttributes.push({ label: httpStatus, color: statusColor });
    }
    if (httpTarget && typeof httpTarget === 'string') {
      const shortTarget = httpTarget.length > 20 ? '...' + httpTarget.slice(-20) : httpTarget;
      inlineAttributes.push({ label: shortTarget, color: 'text-slate-400 bg-white/5 border-white/10' });
    }
  }

  const leftPercent = traceDurationMs > 0 ? ((span.startTimeMs - traceStartTimeMs) / traceDurationMs) * 100 : 0;
  const widthPercent = traceDurationMs > 0 ? Math.max((span.durationMs / traceDurationMs) * 100, 0.5) : 100;

  return (
    <div className="font-sans text-sm relative">
      <div 
        className={cn(
          "flex items-center py-2 px-3 cursor-pointer transition-all border-l-2 group relative overflow-hidden my-0.5 rounded-sm",
          isSelected ? "bg-white/10 border-cyan-vibrant shadow-sm" : "border-transparent hover:bg-white/5",
          isError && !isSelected ? "border-red-500/50" : "",
          !isError && hasErrorDescendant && !isSelected ? "border-red-500/30 border-dashed" : "",
          span.isOnCriticalPath && !isSelected ? "border-blue-500/30" : ""
        )}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => onSelect(span)}
      >
        {/* Background duration indicators */}
        <div 
          className="absolute inset-y-0 bg-white/5 pointer-events-none"
          style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
        />
        
        <div className="w-4 h-4 mr-2 flex items-center justify-center transition-transform hover:scale-125 relative z-10" onClick={(e) => {
          if (hasChildren) {
            e.stopPropagation();
            setExpanded(!expanded);
          }
        }}>
          {hasChildren && (
            <span className={cn("text-[8px] transition-transform duration-300", expanded ? "rotate-90" : "")}>▶</span>
          )}
        </div>
        
        <div className={cn(
          "flex items-center justify-center w-6 h-6 rounded-lg border mr-3 shrink-0 relative z-10 transition-transform group-hover:scale-110",
          kindDetails.bg,
          kindDetails.color
        )}>
          {kindDetails.icon}
        </div>

        <div className={cn(
          "flex-1 flex items-center gap-2 min-w-0 relative z-10",
          isError ? "text-red-400" : "text-white"
        )}>
          <span className="truncate font-bold tracking-tight">{span.name}</span>
          
          <div className="flex gap-1.5 overflow-hidden">
            {inlineAttributes.map((attr, i) => (
              <span key={i} className={cn("px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border shrink-0", attr.color)}>
                {String(attr.label)}
              </span>
            ))}
          </div>
        </div>
        
        <div className="text-slate-500 text-[10px] font-black ml-4 whitespace-nowrap tabular-nums relative z-10 opacity-60 group-hover:opacity-100 transition-opacity">
          {span.durationMs < 1 ? '<1ms' : `${span.durationMs.toFixed(1)}ms`}
        </div>
      </div>
      
      {expanded && hasChildren && (
        <div className="relative">
          {/* Vertical line connector */}
          <div className="absolute left-[21px] top-0 bottom-1 w-px bg-white/5 pointer-events-none" style={{ left: `${depth * 20 + 20}px` }} />
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
  
  const flatNodes: { span: ProcessedSpan, depth: number }[] = [];
  const flatten = (nodes: ProcessedSpan[], depth: number) => {
    for (const node of nodes) {
      flatNodes.push({ span: node, depth });
      flatten(node.children, depth + 1);
    }
  };
  flatten(roots, 0);

  if (flatNodes.length === 0) return <EmptyState />;

  return (
    <div className="p-6">
      <div className="min-w-full">
        <div className="flex border-b border-white/5 pb-4 mb-6 text-[10px] font-black uppercase tracking-widest text-slate-500 relative h-8">
          <div className="absolute left-0">Start</div>
          <div className="absolute left-1/4">25%</div>
          <div className="absolute left-1/2 -translate-x-1/2">50%</div>
          <div className="absolute left-3/4">75%</div>
          <div className="absolute right-0">{totalDuration.toFixed(1)}ms</div>
          
          {[0.25, 0.5, 0.75].map(p => (
            <div key={p} className="absolute top-6 bottom-0 w-px bg-white/5" style={{ left: `${p * 100}%`, height: '1000%' }} />
          ))}
        </div>
        
        <div className="space-y-2">
          {flatNodes.map(({ span, depth }) => {
            const leftPercent = totalDuration > 0 ? ((span.startTimeMs - minTime) / totalDuration) * 100 : 0;
            const widthPercent = totalDuration > 0 ? Math.max((span.durationMs / totalDuration) * 100, 0.3) : 100;
            const isError = span.status?.code === 2;
            const isSelected = selectedSpanId === span.spanId;
            const color = isError ? '#f87171' : getServiceColor(span.serviceName);
            
            return (
              <div 
                key={span.spanId} 
                className={cn(
                  "relative h-8 flex items-center group cursor-pointer transition-all",
                  isSelected ? "bg-white/5 rounded-xl shadow-inner shadow-black/20" : "hover:bg-white/5 rounded-xl"
                )}
                onClick={() => onSelect(span)}
              >
                <div 
                  className={cn(
                    "absolute h-1.5 rounded-full transition-all group-hover:h-3 shadow-lg",
                    isSelected ? "ring-2 ring-white/20" : ""
                  )}
                  style={{ 
                    left: `${leftPercent}%`, 
                    width: `${widthPercent}%`,
                    backgroundColor: color,
                    boxShadow: `0 0 12px ${color}40`
                  }}
                />
                
                <div 
                  className="absolute text-[10px] font-bold text-white px-2 truncate pointer-events-none z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${leftPercent}%`, marginLeft: widthPercent > 10 ? '4px' : 'calc(100% + 8px)' }}
                >
                  {span.name} <span className="opacity-50 ml-1">{span.durationMs.toFixed(1)}ms</span>
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
  if (!span) return null;

  const isError = span.status?.code === 2;

  return (
    <div className="h-full flex flex-col font-sans">
      <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0 bg-white/5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
             <div className={cn("w-2 h-2 rounded-full animate-pulse", isError ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "bg-cyan-vibrant shadow-[0_0_8px_rgba(102,252,241,0.5)]")} />
             <h2 className="text-xl font-black tracking-tight text-white uppercase">{span.name}</h2>
          </div>
          <span className="text-[10px] font-mono text-slate-500 flex items-center gap-2">
             {span.spanId} <span className="opacity-30">|</span> {span.traceId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl transition-all active:scale-90">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
        <div className="grid grid-cols-2 gap-6">
          <div className="glass p-6 rounded-3xl border border-white/10">
            <div className="text-[10px] text-slate-500 mb-2 uppercase font-black tracking-widest">Duration</div>
            <div className="text-2xl text-cyan-vibrant font-black tracking-tighter">
              {span.durationMs.toFixed(3)} <span className="text-xs font-normal opacity-50">ms</span>
            </div>
          </div>
          <div className="glass p-6 rounded-3xl border border-white/10">
            <div className="text-[10px] text-slate-500 mb-2 uppercase font-black tracking-widest">Timestamp</div>
            <div className="text-lg text-white font-bold tracking-tight">
              {format(new Date(span.startTimeMs), 'HH:mm:ss.SSS')}
            </div>
          </div>
        </div>

        {span.attributes && span.attributes.length > 0 && (
          <div>
            <h3 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
               <Layers size={14}/> Attributes
            </h3>
            <div className="glass rounded-3xl border border-white/5 overflow-hidden">
               {span.attributes.map((attr, i) => (
                  <div key={i} className="flex px-5 py-3.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group">
                     <div className="w-1/3 font-mono text-[11px] text-slate-500 break-all">{attr.key}</div>
                     <div className="flex-1 font-mono text-xs text-white break-all bg-black/20 p-2 rounded-lg border border-white/5 group-hover:border-white/10 transition-colors">
                        {typeof attr.value === 'object' ? JSON.stringify(attr.value, null, 2) : String(attr.value)}
                     </div>
                  </div>
               ))}
            </div>
          </div>
        )}

        {span.events && span.events.length > 0 && (
          <div>
            <h3 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
               <Activity size={14}/> Events
            </h3>
            <div className="space-y-4">
              {span.events.map((event, i) => {
                const eventTimeMs = Number(BigInt(event.timeUnixNano) / 1000000n);
                return (
                  <div key={i} className="glass p-5 rounded-3xl border border-white/5 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                       <span className="text-[10px] font-black text-cyan-vibrant/60 uppercase tracking-widest">{event.name}</span>
                       <span className="text-[10px] font-mono text-slate-500">{format(new Date(eventTimeMs), 'HH:mm:ss.SSS')}</span>
                    </div>
                    {event.attributes && event.attributes.length > 0 && (
                      <div className="space-y-2 mt-4 pl-4 border-l-2 border-white/5">
                        {event.attributes.map((attr, j) => (
                          <div key={j} className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold">{attr.key}</span>
                            <span className="text-xs text-slate-300 font-mono bg-black/40 p-2 rounded-xl">{String(attr.value)}</span>
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
  const rootName = roots.length > 0 ? roots[0].name : 'Unknown Operation';
  
  let serviceName = 'unknown-service';
  if (roots.length > 0 && roots[0].attributes) {
    const svcAttr = roots[0].attributes.find(a => a.key === 'service.name');
    if (svcAttr) serviceName = String(svcAttr.value);
  }

  return (
    <div className={cn(
      "mb-6 glass rounded-[2.5rem] border border-white/5 overflow-hidden transition-all duration-500",
      expanded ? "shadow-2xl shadow-black/40" : "hover:border-white/10"
    )}>
      <div 
        className={cn(
          "flex items-center justify-between p-5 cursor-pointer transition-colors relative",
          hasError ? "bg-red-500/5" : "bg-white/5"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-5">
          <div className={cn("transition-transform duration-300", expanded ? "rotate-180" : "")}>
            <ChevronDown size={18} className="text-slate-500" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="font-black text-white text-base tracking-tight">{rootName}</span>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-vibrant/10 text-cyan-vibrant text-[9px] font-black uppercase tracking-tighter border border-cyan-vibrant/20">
                {serviceName}
              </span>
              {hasError && (
                <span className="px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[9px] font-black uppercase tracking-tighter border border-red-500/20 flex items-center gap-1">
                  <AlertCircle size={10} />
                  {errorCount} {errorCount > 1 ? 'Errors' : 'Error'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-black uppercase tracking-widest">
              <span>{traceId.substring(0, 12)}</span>
              <span className="w-1 h-1 rounded-full bg-slate-700" />
              <span>{minStartTime !== Infinity ? format(new Date(minStartTime), 'MMM d, HH:mm:ss.SSS') : 'Unknown'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-3">
             <div className="text-right">
                <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">Duration</div>
                <div className="text-sm font-black text-cyan-vibrant tabular-nums">{durationMs.toFixed(2)}ms</div>
             </div>
             <div className="h-8 w-px bg-white/5 mx-2" />
             <div className="text-right">
                <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">Spans</div>
                <div className="text-sm font-black text-white tabular-nums">{spanCount}</div>
             </div>
          </div>
        </div>
      </div>
      
      {expanded && (
        <div className="p-4 border-t border-white/5 bg-black/20">
          {activeTab === 'tree' ? (
            <div className="space-y-1">
              {roots.map(root => (
                <SpanNode 
                  key={root.spanId} 
                  span={root} 
                  depth={0} 
                  selectedSpanId={selectedSpanId}
                  onSelect={onSelect}
                  traceDurationMs={durationMs}
                  traceStartTimeMs={minStartTime}
                />
              ))}
            </div>
          ) : (
            <div className="h-[400px] overflow-y-auto custom-scrollbar">
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
  const [activeTab, setActiveTab] = useState<'tree' | 'timeline' | 'topology' | 'flame' | 'setup' | 'inventory'>('tree');
  
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

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      socket.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []); // Remove selectedSpanId and groupedTraces from deps to avoid re-renders

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === 'j') {
      navigateSelection(1);
    } else if (e.key === 'k') {
      navigateSelection(-1);
    } else if (e.key === 'Escape') {
      setSelectedSpanId(null);
    } else if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      document.getElementById('global-search')?.focus();
    }
  };

  const navigateSelection = (direction: number) => {
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
          isHighlighted: isSearchHighlight
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
    <div className="h-screen w-full bg-obsidian text-slate-light flex font-inter overflow-hidden">
      {/* Premium Sidebar */}
      <aside className="w-16 flex flex-col items-center py-6 bg-black/20 border-r border-white/5 shrink-0 z-20 overflow-visible">
        <div className="w-10 h-10 rounded-xl bg-cyan-vibrant/10 flex items-center justify-center text-cyan-vibrant shadow-lg shadow-cyan-vibrant/20 border border-cyan-vibrant/30 mb-8 animate-pulse-glow">
          <Activity size={24} strokeWidth={2.5} />
        </div>
        
        <nav className="flex-1 flex flex-col gap-4">
          <SidebarItem 
            icon={<Layers size={20} />} 
            active={activeTab === 'tree'} 
            onClick={() => setActiveTab('tree')} 
            label="Traces" 
          />
          <SidebarItem 
            icon={<Database size={20} />} 
            active={activeTab === 'inventory'} 
            onClick={() => setActiveTab('inventory')} 
            label="Inventory" 
          />
          <SidebarItem 
            icon={<Activity size={20} />} 
            active={activeTab === 'timeline'} 
            onClick={() => setActiveTab('timeline')} 
            label="Timeline" 
          />
          <SidebarItem 
            icon={<Share2 size={20} />} 
            active={activeTab === 'topology'} 
            onClick={() => setActiveTab('topology')} 
            label="Topology" 
          />
          <SidebarItem 
            icon={<Flame size={20} />} 
            active={activeTab === 'flame'} 
            onClick={() => setActiveTab('flame')} 
            label="Flame Graph" 
          />
          <div className="h-px w-6 bg-white/10 my-2" />
          <SidebarItem 
            icon={<Terminal size={20} />} 
            active={activeTab === 'setup'} 
            onClick={() => setActiveTab('setup')} 
            label="Setup" 
          />
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <button 
            onClick={clearTraces}
            className="p-3 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
            title="Clear All Traces"
          >
            <Trash2 size={20} />
          </button>
          <div className={cn(
            "w-3 h-3 rounded-full border-2 border-obsidian ring-2",
            isConnected ? "bg-emerald-500 ring-emerald-500/20" : "bg-red-500 ring-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
          )} title={isConnected ? 'Server Connected' : 'Server Disconnected'} />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Floating Glass Header */}
        <header className="h-16 flex items-center justify-between px-6 shrink-0 relative z-10 glass-dark border-b-0">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-3">
              Daggerboard
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-vibrant/10 text-cyan-vibrant border border-cyan-vibrant/30">v1.2.0</span>
            </h1>
          </div>

          <div className="flex-1 max-w-2xl mx-12">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-vibrant transition-colors" size={18} />
              <input
                id="global-search"
                type="text"
                placeholder="Search traces, services, attributes... (Press '/' to focus)"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-full pl-12 pr-6 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-vibrant/50 focus:ring-4 focus:ring-cyan-vibrant/10 transition-all backdrop-blur-md"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end mr-4">
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Live Load</span>
              <span className="text-sm font-mono text-cyan-vibrant">{rawSpans.length} events</span>
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
                          traceId: 'mock-trace-' + Math.random().toString(36).substr(2, 6),
                          spanId: 'span-1',
                          name: 'dagger call check',
                          kind: 1,
                          startTimeUnixNano: String(now),
                          endTimeUnixNano: String(now + 5000 * 1000000),
                          attributes: [{ key: 'dagger.module', value: 'test' }],
                          events: [],
                          status: { code: 1 }
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
              className="px-4 py-2 bg-slate-100 text-obsidian rounded-full text-xs font-bold hover:bg-white transition-all shadow-xl shadow-white/5 active:scale-95"
            >
              Inject Mock
            </button>
          </div>
        </header>

        {/* Dashboard Grid Content */}
        <div className="flex-1 flex overflow-hidden p-6 gap-6">
          {/* Left Data Column */}
          <div className={cn(
            "flex flex-col gap-6 transition-all duration-500",
            selectedSpan ? "w-[45%]" : "w-full"
          )}>
             {/* Performance Cards */}
             {performanceMetrics && (
              <div className="grid grid-cols-4 gap-4">
                <MetricCard title="Total" value={performanceMetrics.count} unit="Traces" icon={<Server size={14}/>} color="cyan" />
                <MetricCard title="P50" value={performanceMetrics.p50.toFixed(1)} unit="ms" icon={<Clock size={14}/>} color="blue" />
                <MetricCard title="P90" value={performanceMetrics.p90.toFixed(1)} unit="ms" icon={<AlertCircle size={14}/>} color="orange" />
                <MetricCard title="ERR %" value={((groupedTraces.filter(t => t.roots.some(r => r.status?.code === 2)).length / groupedTraces.length) * 100 || 0).toFixed(1)} unit="%" icon={<X size={14}/>} color="red" />
              </div>
            )}

            {/* Main Visualizer Panel */}
            <div className="flex-1 glass-dark rounded-3xl overflow-hidden border border-white/5 flex flex-col">
              <div className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-white/5 shrink-0">
                <div className="flex items-center gap-6">
                   <TabButton active={activeTab === 'tree'} onClick={() => setActiveTab('tree')}>Structure</TabButton>
                   <TabButton active={activeTab === 'timeline'} onClick={() => setActiveTab('timeline')}>Flow</TabButton>
                   <TabButton active={activeTab === 'topology'} onClick={() => setActiveTab('topology')}>Mesh</TabButton>
                   <TabButton active={activeTab === 'flame'} onClick={() => setActiveTab('flame')}>Intensity</TabButton>
                </div>

                <div className="flex items-center gap-3">
                   <div className="flex items-center bg-black/40 rounded-lg p-1 border border-white/5">
                      <FilterToggle active={groupByTrace} onClick={() => setGroupByTrace(!groupByTrace)}>Grouped</FilterToggle>
                      <FilterToggle active={!groupByTrace} onClick={() => setGroupByTrace(!groupByTrace)}>Flat</FilterToggle>
                   </div>
                </div>
              </div>

              <div className="flex-1 overflow-hidden relative">
                {activeTab === 'setup' ? (
                  <div className="h-full overflow-auto custom-scrollbar p-6"><DaggerSetup /></div>
                ) : rawSpans.length === 0 ? (
                  <EmptyState />
                ) : (
                  <div className="h-full w-full">
                     {activeTab === 'topology' ? (
                        <div className="h-full w-full relative"><ServiceGraph spans={filteredSpanTree} /></div>
                     ) : activeTab === 'flame' ? (
                        <div className="h-full w-full relative"><FlameGraph roots={filteredSpanTree} selectedSpanId={selectedSpanId} onSelect={(s) => setSelectedSpanId(s.spanId)} /></div>
                     ) : activeTab === 'inventory' ? (
                        <div className="h-full overflow-auto custom-scrollbar p-6">
                           <InventoryView spans={rawSpans} />
                        </div>
                     ) : (
                        <div className="h-full flex flex-col">
                           {activeTab === 'tree' && (
                              <TraceScatterPlot 
                                 traces={groupedTraces.map(t => ({ 
                                    traceId: t.traceId, 
                                    roots: t.roots, 
                                    minStartTime: Math.min(...t.roots.map(r => r.startTimeMs)) 
                                 }))} 
                                 onSelectTrace={(id) => {
                                    const span = rawSpans.find(s => s.traceId === id);
                                    if (span) setSelectedSpanId(span.spanId);
                                 }}
                              />
                           )}
                           <div className="flex-1 overflow-auto custom-scrollbar p-4">
                              {groupByTrace ? (
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
                                   {filteredSpanTree.map(root => (
                                     <SpanNode 
                                       key={root.spanId} 
                                       span={root} 
                                       depth={0} 
                                       selectedSpanId={selectedSpanId}
                                       onSelect={(s) => setSelectedSpanId(s.spanId)}
                                       traceDurationMs={root.durationMs}
                                       traceStartTimeMs={root.startTimeMs}
                                     />
                                   ))}
                                </div>
                              ) : (
                                <Timeline 
                                  roots={filteredSpanTree} 
                                  selectedSpanId={selectedSpanId}
                                  onSelect={(s) => setSelectedSpanId(s.spanId)}
                                />
                              )
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Detail Panel */}
          {selectedSpan && (
            <div className="w-[55%] glass-dark rounded-3xl border border-white/10 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
               <SpanDetails span={selectedSpan} onClose={() => setSelectedSpanId(null)} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Sub-components for cleaned up JSX

function SidebarItem({ icon, active, onClick, label }: { icon: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
  return (
    <div className="relative flex items-center group">
      <button 
        onClick={onClick}
        className={cn(
          "w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-300 relative z-10",
          active 
            ? "bg-cyan-vibrant text-obsidian shadow-lg shadow-cyan-vibrant/40 scale-105" 
            : "text-slate-500 hover:text-white hover:bg-white/5"
        )}
      >
        {icon}
      </button>
      <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-900 border border-slate-800 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
         {label}
      </div>
    </div>
  );
}

function MetricCard({ title, value, unit, icon, color }: { title: string, value: string | number, unit: string, icon: React.ReactNode, color: 'cyan' | 'blue' | 'orange' | 'red' }) {
  const colors = {
    cyan: "text-cyan-vibrant border-cyan-vibrant/20 bg-cyan-vibrant/5 shadow-cyan-vibrant/5",
    blue: "text-blue-400 border-blue-400/20 bg-blue-400/5 shadow-blue-400/5",
    orange: "text-orange-400 border-orange-400/20 bg-orange-400/5 shadow-orange-400/5",
    red: "text-red-400 border-red-400/20 bg-red-400/5 shadow-red-400/5"
  };

  return (
    <div className={cn("glass p-4 rounded-3xl border flex flex-col gap-2 relative overflow-hidden group hover:scale-[1.02] transition-transform", colors[color])}>
       <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-black tracking-widest opacity-60">{title}</span>
          <div className="opacity-40">{icon}</div>
       </div>
       <div className="flex items-baseline gap-1">
          <span className="text-2xl font-mono font-bold">{value}</span>
          <span className="text-xs opacity-50">{unit}</span>
       </div>
       <div className="absolute -bottom-2 -right-2 opacity-[0.03] rotate-12 transition-transform group-hover:scale-125 group-hover:-rotate-12 duration-700">
          {icon}
       </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "relative py-1 text-sm font-bold transition-all",
        active ? "text-white" : "text-slate-500 hover:text-slate-300"
      )}
    >
       {children}
       {active && (
         <div className="absolute -bottom-[14px] left-0 right-0 h-0.5 bg-cyan-vibrant shadow-[0_0_8px_rgba(102,252,241,0.5)] rounded-full" />
       )}
    </button>
  );
}

function FilterToggle({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all",
        active ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-400"
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-6 py-20">
      <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center border border-white/5 animate-pulse">
        <Activity size={48} className="text-slate-600" />
      </div>
      <div className="text-center max-w-sm">
        <h3 className="text-lg font-bold text-slate-300 mb-2">No trace data detected</h3>
        <p className="text-sm text-slate-500 mb-8 leading-relaxed">
          Waiting for OTLP spans on <span className="text-cyan-vibrant/60">localhost:4318</span>. Use Dagger or any OpenTelemetry SDK to start visualizing.
        </p>
        <div className="bg-black/40 p-4 rounded-3xl border border-white/5 text-left font-mono text-xs overflow-hidden">
          <div className="text-slate-600 mb-1">// Quick start</div>
          <div className="text-emerald-400">export <span className="text-slate-400">OTEL_EXPORTER_OTLP_ENDPOINT</span>=http://localhost:4318</div>
          <div className="text-cyan-vibrant mt-2">dagger <span className="text-slate-200">call check</span></div>
        </div>
      </div>
    </div>
  );
}

function InventoryView({ spans }: { spans: Span[] }) {
  const stats = useMemo(() => {
    const services = new Map<string, { count: number; errors: number; lastSeen: number }>();
    spans.forEach(s => {
      const svcAttr = s.attributes?.find(a => a.key === 'service.name');
      const name = String(svcAttr?.value?.stringValue || svcAttr?.value || 'unknown-service');
      const curr = services.get(name) || { count: 0, errors: 0, lastSeen: 0 };
      curr.count++;
      if (s.status?.code === 2) curr.errors++;
      const time = Number(BigInt(s.startTimeUnixNano) / 1000000n);
      if (time > curr.lastSeen) curr.lastSeen = time;
      services.set(name, curr);
    });
    return Array.from(services.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [spans]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Service Inventory</h2>
        <div className="text-sm text-slate-400">{stats.length} Services Discovered</div>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {stats.map(([name, data]) => (
          <div key={name} className="glass-dark border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn("w-3 h-3 rounded-full", getServiceColor(name).replace('text-', 'bg-'))} />
                <span className="text-lg font-semibold text-white">{name}</span>
              </div>
              <div className="text-xs font-mono text-slate-500">
                Last activity: {format(new Date(data.lastSeen), 'HH:mm:ss')}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-8">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Total Spans</div>
                <div className="text-2xl font-bold text-slate-200">{data.count}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Errors</div>
                <div className="text-2xl font-bold text-red-400">{data.errors}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Error Rate</div>
                <div className="text-2xl font-bold text-slate-200">
                  {((data.errors / data.count) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
