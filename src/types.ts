export interface OTLPTraceData {
  resourceSpans: ResourceSpan[];
}

export interface ResourceSpan {
  resource: any;
  scopeSpans: ScopeSpan[];
}

export interface ScopeSpan {
  scope: any;
  spans: Span[];
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Attribute[];
  events: Event[];
  status: any;
}

export interface Attribute {
  key: string;
  value: any;
}

export interface Event {
  timeUnixNano: string;
  name: string;
  attributes: Attribute[];
}

export interface ProcessedSpan extends Span {
  children: ProcessedSpan[];
  durationMs: number;
  startTimeMs: number;
  endTimeMs: number;
  hasErrorDescendant?: boolean;
  serviceName?: string;
  isOnCriticalPath?: boolean;
}

export interface SetupInfo {
  installed: boolean;
  version: string | null;
  shell: string;
  profilePath: string;
  alreadyConfigured: boolean;
  snippetApplied: boolean;
  snippet: string;
}
