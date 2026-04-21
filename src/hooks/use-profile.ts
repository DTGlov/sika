import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { fetchDismissedHints } from '@/lib/hints';
import type { UserBadge } from '@/types/badge';

export function useProfile() {
  const {
    user, profile,
    setProfile, setIncomeSources, setAccounts, setDismissedHints,
    setStreaks, setMomentum, setUserBadges, enqueueBadgeCelebrations,
  } = useAuthStore();
  const supabase = createClient();

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const [profileRes, sourcesRes, accountsRes, hintsData, streaksRes, momentumRes, badgesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('income_sources').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('accounts').select('*').eq('user_id', user.id).eq('is_active', true).order('sort_order'),
      fetchDismissedHints(supabase, user.id),
      supabase.from('streaks').select('*').eq('user_id', user.id).single(),
      supabase.from('momentum').select('*').eq('user_id', user.id).single(),
      supabase.from('user_badges').select('*').eq('user_id', user.id).order('unlocked_at', { ascending: false }),
    ]);
    if (profileRes.data) setProfile(profileRes.data);
    if (sourcesRes.data) setIncomeSources(sourcesRes.data);
    if (accountsRes.data) setAccounts(accountsRes.data);
    setDismissedHints(hintsData);
    if (streaksRes.data) setStreaks(streaksRes.data);
    if (momentumRes.data) setMomentum(momentumRes.data);
    if (badgesRes.data) {
      const allBadges = badgesRes.data as UserBadge[];
      setUserBadges(allBadges);
      // Enqueue any that haven't had their celebration shown yet
      const pending = allBadges.filter(b => !b.celebration_shown);
      if (pending.length > 0) enqueueBadgeCelebrations(pending);
    }
  }, [user, supabase, setProfile, setIncomeSources, setAccounts, setDismissedHints, setStreaks, setMomentum, setUserBadges, enqueueBadgeCelebrations]);

  useEffect(() => {
    if (user && !profile) {
      fetchProfile();
    }
  }, [user, profile, fetchProfile]);

  return { profile, refetch: fetchProfile };
}
