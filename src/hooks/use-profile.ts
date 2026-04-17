import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';

export function useProfile() {
  const { user, profile, setProfile, setIncomeSources, setAccounts } = useAuthStore();
  const supabase = createClient();

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const [profileRes, sourcesRes, accountsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase
        .from('income_sources')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('sort_order'),
    ]);
    if (profileRes.data) setProfile(profileRes.data);
    if (sourcesRes.data) setIncomeSources(sourcesRes.data);
    if (accountsRes.data) setAccounts(accountsRes.data);
  }, [user, supabase, setProfile, setIncomeSources, setAccounts]);

  useEffect(() => {
    if (user && !profile) {
      fetchProfile();
    }
  }, [user, profile, fetchProfile]);

  return { profile, refetch: fetchProfile };
}
