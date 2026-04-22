'use client';

import { useTheme } from 'next-themes';
import { useEffect } from 'react';

export function ThemeSync({ theme }: { theme: 'light' | 'dark' }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}
