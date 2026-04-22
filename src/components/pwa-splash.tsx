'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp } from 'lucide-react';

export function PwaSplash() {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;

    if (!isStandalone || !isMobile) return;

    const shown = sessionStorage.getItem('sika-splash-shown');
    if (shown) return;

    setShow(true);
    sessionStorage.setItem('sika-splash-shown', '1');

    const timer = setTimeout(() => {
      setShow(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{
            backgroundColor: '#00a87e',
            pointerEvents: 'none',
          }}
        >
          <div className="relative flex items-center justify-center">
            {/* Pulsing glow behind logo */}
            <motion.div
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.4, 0.7, 0.4],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute rounded-full blur-3xl"
              style={{
                backgroundColor: '#00D9A3',
                width: '180px',
                height: '180px',
                pointerEvents: 'none',
              }}
            />

            {/* Logo — 64px rounded square with trending-up icon */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: '#00D9A3',
                boxShadow: '0 8px 32px rgba(0, 217, 163, 0.4)',
              }}
            >
              <TrendingUp
                className="w-8 h-8"
                strokeWidth={2.5}
                style={{ color: '#0A0A0B' }}
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
