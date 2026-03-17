import React, { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ProcessedSpan } from '../types';
import { format } from 'date-fns';
import { getServiceColor } from '../App';

interface TraceScatterPlotProps {
  traces: { traceId: string, roots: ProcessedSpan[], minStartTime: number }[];
  onSelectTrace: (traceId: string) => void;
}

export function TraceScatterPlot({ traces, onSelectTrace }: TraceScatterPlotProps) {
  const data = useMemo(() => {
    return traces.map(t => {
      const duration = Math.max(...t.roots.map(r => {
          let max = r.durationMs;
          const walk = (n: ProcessedSpan) => {
              const d = (n.startTimeMs - r.startTimeMs) + n.durationMs;
              if (d > max) max = d;
              n.children.forEach(walk);
          };
          walk(r);
          return max;
      }));

      return {
        time: t.minStartTime,
        duration: duration,
        traceId: t.traceId,
        service: t.roots[0]?.serviceName || 'unknown',
        name: t.roots[0]?.name || 'unknown'
      };
    }).sort((a, b) => a.time - b.time);
  }, [traces]);

  if (data.length === 0) return null;

  return (
    <div className="h-32 w-full bg-[#111218]/50 border-b border-slate-800 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis 
            dataKey="time" 
            type="number" 
            domain={['auto', 'auto']}
            tickFormatter={(unix) => format(new Date(unix), 'HH:mm')}
            stroke="#475569"
            fontSize={10}
            hide
          />
          <YAxis 
            dataKey="duration" 
            type="number" 
            stroke="#475569"
            fontSize={10}
            tickFormatter={(val) => `${val.toFixed(0)}ms`}
            width={40}
          />
          <ZAxis type="category" dataKey="traceId" />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload;
                return (
                  <div className="bg-[#111218] border border-slate-700 p-2 rounded shadow-xl text-xs">
                    <div className="font-bold text-slate-200">{d.name}</div>
                    <div className="text-slate-400">Duration: {d.duration.toFixed(2)}ms</div>
                    <div className="text-slate-500">{format(new Date(d.time), 'HH:mm:ss')}</div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Scatter 
            data={data} 
            onClick={(d: any) => onSelectTrace(d.traceId)}
            className="cursor-pointer"
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getServiceColor(entry.service)} 
                fillOpacity={0.6}
                stroke={getServiceColor(entry.service)}
                strokeWidth={1}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
