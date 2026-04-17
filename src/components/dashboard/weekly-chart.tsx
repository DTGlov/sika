'use client';

import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatShortDate, formatGHS } from '@/lib/utils';

interface WeeklyChartProps {
  data: { date: string; amount: number }[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1C1C1F] border border-[#27272A] rounded-xl px-3 py-2">
      <p className="text-[#71717A] text-xs mb-0.5">{label}</p>
      <p className="amount text-[#00D9A3] text-sm font-semibold">{formatGHS(payload[0].value)}</p>
    </div>
  );
}

export function WeeklyChart({ data }: WeeklyChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatShortDate(d.date) }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.45, ease: 'easeOut' }}
      className="bg-[#141416] border border-[#27272A] rounded-2xl p-5"
    >
      <p className="text-[#71717A] text-xs font-medium uppercase tracking-wider mb-4">7-Day Spend</p>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barSize={24} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: '#71717A', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#71717A', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#1C1C1F' }} />
            <Bar dataKey="amount" fill="#00D9A3" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
