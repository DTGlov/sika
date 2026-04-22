import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/app-shell';
import { ThemeSync } from '@/components/theme-sync';

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

  const themePreference = (profile?.theme_preference as 'light' | 'dark' | undefined) ?? 'dark';

  return (
    <>
      <ThemeSync theme={themePreference} />
      <AppShell user={user}>{children}</AppShell>
    </>
  );
}
