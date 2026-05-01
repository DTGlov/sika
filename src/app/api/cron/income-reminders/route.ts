import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { sendPushToUser } from '@/lib/push-sender';
import { getDueIncomeNudges } from '@/lib/income-nudges';
import type { IncomeSource } from '@/types';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const today = new Date();

  const { data: sources, error } = await supabase
    .from('income_sources')
    .select('*')
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byUser = new Map<string, IncomeSource[]>();
  for (const source of (sources ?? []) as IncomeSource[]) {
    const existing = byUser.get(source.user_id);
    if (existing) existing.push(source);
    else byUser.set(source.user_id, [source]);
  }

  const results = {
    users: byUser.size,
    notified: 0,
    sent: 0,
    failed: 0,
  };

  for (const [userId, userSources] of byUser) {
    const dueNudges = await getDueIncomeNudges(supabase, userId, userSources, today);
    if (dueNudges.length === 0) continue;

    const names = dueNudges.map((n) => n.incomeSource.name);
    const title =
      dueNudges.length === 1
        ? `${names[0]} expected today`
        : `${dueNudges.length} income sources expected today`;
    const body =
      dueNudges.length === 1
        ? `Did you receive your ${names[0].toLowerCase()}? Tap to confirm.`
        : `${names.join(', ')} — tap to log them.`;

    const result = await sendPushToUser(supabase, userId, {
      title,
      body,
      url: '/dashboard',
      tag: 'income-reminder',
    });

    if (result.sent > 0) results.notified++;
    results.sent += result.sent;
    results.failed += result.failed;
  }

  return NextResponse.json({ ok: true, ...results });
}
