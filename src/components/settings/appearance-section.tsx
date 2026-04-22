'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = async (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    try {
      await fetch('/api/profile/theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme }),
      });
    } catch {
      // silent fail — UI already updated
    }
  };

  if (!mounted) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-foreground font-semibold mb-1">Appearance</h2>
        <p className="text-muted-foreground text-xs mb-4">
          Choose your preferred colour scheme.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 rounded-xl bg-muted animate-pulse" />
          <div className="h-16 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  const isLight = theme === 'light';

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-4">
      <h2 className="text-foreground font-semibold mb-1">Appearance</h2>
      <p className="text-muted-foreground text-xs mb-4">
        Choose your preferred colour scheme.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleThemeChange('light')}
          className={`flex flex-col items-center gap-2 py-4 px-2 rounded-xl border transition-colors ${
            isLight
              ? 'border-accent bg-accent/10'
              : 'border-border bg-transparent hover:bg-muted/50'
          }`}
          aria-pressed={isLight}
        >
          <Sun className={`w-5 h-5 ${isLight ? 'text-accent' : 'text-muted-foreground'}`} />
          <span className={`text-xs font-medium ${isLight ? 'text-accent' : 'text-muted-foreground'}`}>
            Light
          </span>
        </button>
        <button
          onClick={() => handleThemeChange('dark')}
          className={`flex flex-col items-center gap-2 py-4 px-2 rounded-xl border transition-colors ${
            !isLight
              ? 'border-accent bg-accent/10'
              : 'border-border bg-transparent hover:bg-muted/50'
          }`}
          aria-pressed={!isLight}
        >
          <Moon className={`w-5 h-5 ${!isLight ? 'text-accent' : 'text-muted-foreground'}`} />
          <span className={`text-xs font-medium ${!isLight ? 'text-accent' : 'text-muted-foreground'}`}>
            Dark
          </span>
        </button>
      </div>
    </div>
  );
}
