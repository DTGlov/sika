import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { ThemeProvider } from '@/components/theme-provider';
import type { Theme } from '@/components/theme-provider';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('theme_preference')
    .eq('id', user.id)
    .single();

  const themePreference = (profile?.theme_preference as Theme | undefined) ?? 'auto';

  return (
    <ThemeProvider initialTheme={themePreference}>
      <AppShell user={user}>{children}</AppShell>
    </ThemeProvider>
  );
}
