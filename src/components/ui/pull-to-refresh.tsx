'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useHaptics } from '@/hooks/use-haptics';

const TRIGGER_DISTANCE = 80;
const MAX_PULL = 120;

export function PullToRefresh({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const { medium } = useHaptics();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;

      if (diff > 0 && window.scrollY === 0) {
        const dampened = Math.min(diff * 0.5, MAX_PULL);
        setDragY(dampened);
        if (diff > 10) e.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      if (startY.current === null) return;

      const shouldRefresh = dragY >= TRIGGER_DISTANCE;
      startY.current = null;

      if (shouldRefresh && !refreshing) {
        setRefreshing(true);
        medium();
        setDragY(TRIGGER_DISTANCE);

        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setDragY(0);
        }
      } else {
        setDragY(0);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragY, refreshing, onRefresh, medium]);

  const progress = Math.min(dragY / TRIGGER_DISTANCE, 1);
  const iconRotation = progress * 180;
  const iconOpacity = Math.min(progress * 1.5, 1);

  return (
    <div ref={containerRef} style={{ position: 'relative', minHeight: '100%' }}>
      <motion.div
        animate={{ y: dragY }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          position: 'absolute',
          top: -40,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: 40,
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <div
          className="bg-card border border-border rounded-full w-10 h-10 flex items-center justify-center shadow-sm"
          style={{ opacity: iconOpacity }}
        >
          <RefreshCw
            className="w-4 h-4 text-accent"
            style={{
              transform: refreshing ? 'rotate(0deg)' : `rotate(${iconRotation}deg)`,
              animation: refreshing ? 'spin 0.8s linear infinite' : undefined,
            }}
          />
        </div>
      </motion.div>

      <motion.div
        animate={{ y: dragY }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
