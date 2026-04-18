import type { SupabaseClient } from '@supabase/supabase-js';

export type HintId =
  | 'recurring_intro'
  | 'accounts_intro'
  | 'dashboard_buckets_intro'
  | 'settings_income_sources'
  | 'settings_categories'
  | 'transaction_sheet_reconcile'
  | 'goals_intro';

export async function dismissHint(
  supabase: SupabaseClient,
  userId: string,
  hintId: HintId
): Promise<void> {
  await supabase
    .from('dismissed_hints')
    .upsert({ user_id: userId, hint_id: hintId }, { onConflict: 'user_id,hint_id' });
}

export async function resetHints(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase.from('dismissed_hints').delete().eq('user_id', userId);
}

export async function fetchDismissedHints(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('dismissed_hints')
    .select('hint_id')
    .eq('user_id', userId);
  return (data ?? []).map((r: { hint_id: string }) => r.hint_id);
}
