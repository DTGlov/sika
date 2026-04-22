'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';

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
      toast.error('Failed to save theme preference');
    }
  };

  if (!mounted) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <h2 className="text-foreground font-semibold mb-1">Appearance</h2>
        <p className="text-muted-foreground text-xs mb-4">Choose your preferred colour scheme.</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 rounded-xl bg-muted animate-pulse" />
          <div className="h-16 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-6">
      <h2 className="text-foreground font-semibold mb-1">Appearance</h2>
      <p className="text-muted-foreground text-xs mb-4">Choose your preferred colour scheme.</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleThemeChange('light')}
          className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border transition-colors ${
            theme === 'light'
              ? 'border-accent bg-accent/10'
              : 'border-border bg-transparent'
          }`}
        >
          <Sun className={`w-4 h-4 ${theme === 'light' ? 'text-accent' : 'text-muted-foreground'}`} />
          <span className={`text-xs font-medium ${theme === 'light' ? 'text-accent' : 'text-muted-foreground'}`}>
            Light
          </span>
        </button>
        <button
          onClick={() => handleThemeChange('dark')}
          className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl border transition-colors ${
            theme === 'dark'
              ? 'border-accent bg-accent/10'
              : 'border-border bg-transparent'
          }`}
        >
          <Moon className={`w-4 h-4 ${theme === 'dark' ? 'text-accent' : 'text-muted-foreground'}`} />
          <span className={`text-xs font-medium ${theme === 'dark' ? 'text-accent' : 'text-muted-foreground'}`}>
            Dark
          </span>
        </button>
      </div>
    </div>
  );
}
