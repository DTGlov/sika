import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedUser } from '@/lib/auth/get-authed-user';

export async function DELETE(request: Request) {
  const user = await getAuthedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createServiceClient();
  const uid = user.id;

  // Verified user-scoped tables (FK-safe order: dependents first)
  // Do NOT include shared tables: badges, sika_daily_digests, sika_daily_sources
  const tables = [
    'transactions',
    'recurring_transactions',
    'purchase_decisions',
    'daily_insights',
    'monthly_recaps',
    'user_daily_reads',
    'momentum_events',
    'user_badges',
    'streaks',
    'income_nudge_dismissals',
    'dismissed_hints',
    'income_sources',
    'goals',
    'categories',
    'accounts',
    'budget_buckets',
    'momentum',
  ];

  const tableErrors: string[] = [];

  for (const table of tables) {
    try {
      const { error } = await svc.from(table).delete().eq('user_id', uid);
      if (error) {
        console.error(`Failed to delete ${table}:`, error.message);
        tableErrors.push(table);
      }
    } catch (err) {
      console.error(`Exception deleting ${table}:`, err);
      tableErrors.push(table);
    }
  }

  if (tableErrors.length > 0) {
    console.warn(`Non-fatal table errors during account deletion for ${uid}:`, tableErrors);
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
