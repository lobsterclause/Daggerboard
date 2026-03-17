import { describe, it, expect } from 'vitest';
import { extractSpans, buildSpanTree } from './utils';
import { OTLPTraceData } from './types';

describe('extractSpans', () => {
  it('should extract spans from OTLP data', () => {
    const mockData: OTLPTraceData = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }]
          },
          scopeSpans: [
            {
              scope: {},
              spans: [
                {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  name: 'span-one',
                  kind: 1,
                  startTimeUnixNano: '1600000000000000000',
                  endTimeUnixNano: '1600000001000000000',
                  attributes: [],
                  events: [],
                  status: { code: 1 }
                }
              ]
            }
          ]
        }
      ]
    };

    const spans = extractSpans(mockData);
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('span-one');
    // Service name should be injected
    const svcAttr = spans[0].attributes?.find(a => a.key === 'service.name');
    expect(svcAttr?.value).toBeDefined();
  });

  it('should return empty array if no resourceSpans', () => {
    const spans = extractSpans({} as any);
    expect(spans).toEqual([]);
  });
});

describe('buildSpanTree', () => {
  it('should build a tree from a flat list of spans', () => {
    const spans = [
      {
        traceId: 't1',
        spanId: 's1',
        name: 'root',
        kind: 1,
        startTimeUnixNano: '1000000',
        endTimeUnixNano: '5000000',
        attributes: [{ key: 'service.name', value: 'svc' }],
        events: [],
        status: { code: 1 }
      },
      {
        traceId: 't1',
        spanId: 's2',
        parentSpanId: 's1',
        name: 'child',
        kind: 1,
        startTimeUnixNano: '2000000',
        endTimeUnixNano: '4000000',
        attributes: [{ key: 'service.name', value: 'svc' }],
        events: [],
        status: { code: 1 }
      }
    ];

    const tree = buildSpanTree(spans as any);
    expect(tree).toHaveLength(1);
    expect(tree[0].spanId).toBe('s1');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].spanId).toBe('s2');
    expect(tree[0].durationMs).toBe(4);
    expect(tree[0].isOnCriticalPath).toBe(true);
  });
});
