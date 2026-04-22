import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeWeekContext } from '@/lib/weekly/compute-week-context';
import { generateRecapCards } from '@/lib/weekly/generate-recap';
import { startOfFridayWeek, endOfFridayWeek } from '@/lib/weekly/dates';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const weekStart = startOfFridayWeek(now);
  const weekEnd = endOfFridayWeek(now);

  const supabase = createServiceClient();

  const { data: activeUserRows } = await supabase
    .from('transactions')
    .select('user_id')
    .gte('transaction_date', weekStart.toISOString().split('T')[0])
    .lte('transaction_date', weekEnd.toISOString().split('T')[0]);

  const uniqueUserIds = [...new Set(activeUserRows?.map((r) => r.user_id) ?? [])];

  const results = { generated: 0, skipped: 0, failed: 0, errors: [] as string[] };

  for (const userId of uniqueUserIds) {
    try {
      const { data: existing } = await supabase
        .from('weekly_recaps')
        .select('id')
        .eq('user_id', userId)
        .eq('week_start', weekStart.toISOString().split('T')[0])
        .single();

      if (existing) {
        results.skipped++;
        continue;
      }

      const ctx = await computeWeekContext(supabase, userId, weekStart, weekEnd);
      const cards = await generateRecapCards(ctx);

      await supabase.from('weekly_recaps').insert({
        user_id: userId,
        week_start: weekStart.toISOString().split('T')[0],
        week_end: weekEnd.toISOString().split('T')[0],
        recap_data: cards,
      });

      results.generated++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${userId}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return NextResponse.json(results);
}
