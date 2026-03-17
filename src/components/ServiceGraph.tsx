import React, { useMemo } from 'react';
import { ReactFlow, Background, Controls, MarkerType, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ProcessedSpan } from '../types';
import { getServiceColor } from '../App';

interface ServiceGraphProps {
  spans: ProcessedSpan[];
}

export function ServiceGraph({ spans }: ServiceGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const serviceNodes = new Set<string>();
    const serviceEdges = new Map<string, { source: string; target: string; count: number }>();

    // Helper to traverse and build edges
    const traverse = (span: ProcessedSpan, parentService?: string) => {
      const currentService = span.serviceName || 'unknown';
      serviceNodes.add(currentService);

      if (parentService && parentService !== currentService) {
        const edgeId = `${parentService}->${currentService}`;
        const existing = serviceEdges.get(edgeId);
        if (existing) {
          existing.count += 1;
        } else {
          serviceEdges.set(edgeId, { source: parentService, target: currentService, count: 1 });
        }
      }

      span.children.forEach(child => traverse(child, currentService));
    };

    spans.forEach(root => traverse(root));

    // Simple layout: circle layout
    const nodeArray = Array.from(serviceNodes);
    const radius = Math.max(150, nodeArray.length * 30);
    const centerX = 300;
    const centerY = 300;

    const flowNodes: Node[] = nodeArray.map((service, index) => {
      const angle = (index / nodeArray.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      
      // Extract color from Tailwind class (e.g. 'bg-emerald-500')
      // For simplicity, we'll just use a default or map it if needed.
      // We can use a custom node or just standard node with style.
      return {
        id: service,
        position: { x, y },
        data: { label: service },
        style: {
          background: '#1e293b',
          color: '#f8fafc',
          border: '1px solid #475569',
          borderRadius: '8px',
          padding: '10px',
          fontWeight: 'bold',
        }
      };
    });

    const flowEdges: Edge[] = Array.from(serviceEdges.values()).map((edge, i) => ({
      id: `e${i}`,
      source: edge.source,
      target: edge.target,
      label: `${edge.count} calls`,
      labelStyle: { fill: '#94a3b8', fontSize: 10 },
      labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
      style: { stroke: '#64748b', strokeWidth: Math.min(edge.count, 5) },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#64748b',
      },
      animated: true,
    }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [spans]);

  return (
    <div className="w-full h-full bg-[#0B0C10]">
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        fitView
        colorMode="dark"
      >
        <Background color="#1e293b" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
