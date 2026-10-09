import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SentimentPieProps {
  positive: number;
  neutral: number;
  negative: number;
  title?: string;
  height?: number;
  subtitle?: string;
}

const COLORS = {
  Positive: '#059669', // emerald-600
  Neutral: '#d4d4d8', // zinc-300
  Negative: '#e11d48', // rose-600
};

interface Slice {
  name: 'Positive' | 'Neutral' | 'Negative';
  value: number;
}

export const SentimentPie: React.FC<SentimentPieProps> = ({
  positive,
  neutral,
  negative,
  title,
  height = 220,
  subtitle,
}) => {
  const [hovered, setHovered] = useState<Slice | null>(null);

  const data: Slice[] = (
    [
      { name: 'Positive', value: positive },
      { name: 'Neutral', value: neutral },
      { name: 'Negative', value: negative },
    ] as Slice[]
  ).filter(d => d.value > 0);

  const total = positive + neutral + negative;

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">{title}</h3>
          {subtitle && <span className="text-2xs text-zinc-500">{subtitle}</span>}
        </div>
      )}

      {total === 0 ? (
        <div
          className="flex items-center justify-center text-2xs text-zinc-400 italic border border-dashed border-zinc-200 rounded-lg"
          style={{ height }}
        >
          No data yet
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="85%"
                paddingAngle={2}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
                onMouseEnter={(_sector, index) => setHovered(data[index] ?? null)}
                onMouseLeave={() => setHovered(null)}
              >
                {data.map(entry => (
                  <Cell key={entry.name} fill={COLORS[entry.name]} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => {
                  const v = Number(value ?? 0);
                  const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                  return [`${v} (${pct}%)`, name];
                }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-2xs text-zinc-600">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {hovered && (
        <div className="text-center text-2xs font-mono text-zinc-600 tabular-nums">
          {hovered.name}: {hovered.value} ({total > 0 ? Math.round((hovered.value / total) * 100) : 0}%)
        </div>
      )}
    </div>
  );
};
