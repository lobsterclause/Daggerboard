import { OTLPTraceData, Span, ProcessedSpan } from './types';

// Helper to parse OTLP JSON into a flat list of spans
export function extractSpans(traceData: OTLPTraceData): Span[] {
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
export function buildSpanTree(spans: Span[]): ProcessedSpan[] {
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
