'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SikaMark } from '@/components/brand/sika-mark';

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
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          style={{ backgroundColor: '#0E1A2E', pointerEvents: 'none' }}
        >
          {/* Subtle glow behind cowrie */}
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute rounded-full blur-3xl"
            style={{ backgroundColor: '#D4A017', width: '180px', height: '180px', pointerEvents: 'none' }}
          />

          {/* Cowrie mark */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="relative"
          >
            <SikaMark size={96} variant="gold-on-navy" />
          </motion.div>

          {/* Wordmark */}
          <p style={{ marginTop: 24, color: '#F8ECC2', fontSize: 14, letterSpacing: '0.2em', fontWeight: 500 }}>
            SIKA
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
