'use client';

import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatShortDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/use-currency';

interface WeeklyChartProps {
  data: { date: string; amount: number }[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  const { format } = useCurrency();
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2">
      <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
      <p className="amount text-[#D4A017] text-sm font-semibold">{format(payload[0].value)}</p>
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
      className="bg-card border border-border rounded-2xl p-5"
    >
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-4">7-Day Spend</p>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barSize={24} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--muted)' }} />
            <Bar dataKey="amount" fill="#00D9A3" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
