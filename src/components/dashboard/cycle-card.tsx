'use client';

import { useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { formatGHS, formatGHSCompact } from '@/lib/utils';

interface CycleCardProps {
  cycleNet: number;
  cycleLabel: string;
  userName: string;
  received: number;
  spent: number;
  expected: number;
}

export function CycleCard({ cycleNet, cycleLabel, userName, received, spent, expected }: CycleCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 180, damping: 22 });
  const springY = useSpring(rotateY, { stiffness: 180, damping: 22 });

  // Suppress animation on initial mount; only animate on value changes
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const { left, top, width, height } = card.getBoundingClientRect();
    rotateY.set(((e.clientX - left) / width - 0.5) * 10);
    rotateX.set(((e.clientY - top) / height - 0.5) * -10);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  const isNegative = cycleNet < 0;
  const isZero = cycleNet === 0;
  const netColor = isNegative ? '#F43F5E' : isZero ? '#A1A1AA' : '#FAFAFA';
  const prefix = isNegative ? '−' : '';

  return (
    <div className="space-y-2">
      {/* Perspective wrapper */}
      <div style={{ perspective: '1200px' }}>
        <motion.div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileTap={{ scale: 0.985 }}
          style={{
            rotateX: springX,
            rotateY: springY,
            aspectRatio: '85.6 / 54',
            background: 'linear-gradient(135deg, #141416 0%, #191921 55%, #1C1C1F 100%)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
          className="relative w-full max-w-[440px] rounded-[20px] p-6 overflow-hidden select-none"
        >
          {/* Top-left accent glow */}
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              top: -50,
              left: -50,
              width: 180,
              height: 180,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,217,163,0.13) 0%, transparent 68%)',
            }}
          />

          {/* Holographic sheen — diagonal stripe */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)',
            }}
          />

          {/* Top inner shadow for depth */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-12 pointer-events-none"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, transparent 100%)',
            }}
          />

          {/* Card content */}
          <div className="relative h-full flex flex-col justify-between z-10">
            {/* Top row — branding + cycle label */}
            <div className="flex items-start justify-between">
              <span
                className="text-sm font-bold tracking-[0.18em] uppercase"
                style={{ color: '#00D9A3', fontFamily: 'var(--font-geist-sans)' }}
              >
                Sika
              </span>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: '#71717A' }}
              >
                {cycleLabel}
              </span>
            </div>

            {/* Center — cycle net amount */}
            <div className="flex items-center justify-center">
              <motion.div
                key={cycleNet}
                initial={mounted.current ? { opacity: 0.35, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <span
                  className="text-4xl font-bold tabular-nums"
                  style={{ color: netColor, fontFamily: 'var(--font-geist-mono)' }}
                >
                  {prefix}{formatGHS(Math.abs(cycleNet))}
                </span>
              </motion.div>
            </div>

            {/* Bottom row — user name + chip */}
            <div className="flex items-end justify-between">
              <span
                className="text-[11px] tracking-[0.12em] uppercase truncate max-w-[70%]"
                style={{ color: '#52525B', fontFamily: 'var(--font-geist-mono)' }}
              >
                {userName}
              </span>

              {/* Card chip */}
              <div
                className="w-7 h-5 rounded-[4px] shrink-0"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(0,217,163,0.55) 0%, rgba(0,144,108,0.4) 100%)',
                  border: '1px solid rgba(0,217,163,0.25)',
                }}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Supporting stats row */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#71717A] tabular-nums px-1">
        <span>
          Received{' '}
          <span className="text-[#A1A1AA]">{formatGHSCompact(received)}</span>
        </span>
        <span className="text-[#3F3F46]">·</span>
        <span>
          Spent{' '}
          <span className="text-[#A1A1AA]">{formatGHSCompact(spent)}</span>
        </span>
        <span className="text-[#3F3F46]">·</span>
        <span>
          Expected{' '}
          <span className="text-[#A1A1AA]">{formatGHSCompact(expected)}/mo</span>
        </span>
      </div>
    </div>
  );
}
