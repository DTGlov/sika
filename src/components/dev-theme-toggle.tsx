'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function DevThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isLight = theme === 'light';

  return (
    <button
      onClick={() => setTheme(isLight ? 'dark' : 'light')}
      className="fixed top-4 right-4 z-[200] w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"
      style={{
        backgroundColor: isLight ? '#0A0A0B' : '#FAFAF7',
        color: isLight ? '#FAFAF7' : '#0A0A0B',
        border: '2px solid #00D9A3',
      }}
      aria-label="Toggle theme (dev)"
      title={`Switch to ${isLight ? 'dark' : 'light'}`}
    >
      {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
}
