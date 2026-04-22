'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
          className="fixed inset-0 z-[100] bg-[#0A0A0B] flex items-center justify-center"
          style={{ pointerEvents: 'none' }}
        >
          <div className="relative flex items-center justify-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 1.05, 1], opacity: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="absolute rounded-full blur-3xl"
              style={{
                background: 'radial-gradient(circle, rgba(0, 217, 163, 0.4) 0%, transparent 70%)',
                width: '200px',
                height: '200px',
                left: '-100px',
                top: '-100px',
              }}
            />
            <motion.h1
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
              className="relative text-[#00D9A3] text-6xl font-bold tracking-tight"
              style={{
                fontFamily: 'var(--font-geist-sans)',
                textShadow: '0 0 40px rgba(0, 217, 163, 0.5)',
              }}
            >
              Sika
            </motion.h1>
          </div>

          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.1, 0.3],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute w-40 h-40 rounded-full border-2 border-[#00D9A3]"
            style={{ pointerEvents: 'none' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
