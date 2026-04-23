import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createServiceClient();
  const uid = user.id;

  // Delete in FK-safe order: leaf tables first, then referenced tables
  const tables = [
    'transactions',
    'recurring_transactions',
    'purchase_decisions',
    'daily_insights',
    'monthly_recaps',
    'weekly_recaps',
    'user_daily_reads',
    'user_badges',
    'streaks',
    'income_nudge_dismissals',
    'dismissed_hints',
    'income_sources',
    'goals',
    'categories',
    'accounts',
    'budget_buckets',
  ] as const;

  for (const table of tables) {
    const { error } = await svc.from(table).delete().eq('user_id', uid);
    if (error && error.code !== 'PGRST116') {
      console.error(`Delete failed for ${table}:`, error.message);
      return NextResponse.json({ error: `Failed to delete ${table}` }, { status: 500 });
    }
  }

  const { error: profileErr } = await svc.from('profiles').delete().eq('id', uid);
  if (profileErr) {
    console.error('Delete failed for profiles:', profileErr.message);
    return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 });
  }

  const { error: authErr } = await svc.auth.admin.deleteUser(uid);
  if (authErr) {
    console.error('Delete failed for auth user:', authErr.message);
    return NextResponse.json({ error: 'Failed to delete auth user' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
