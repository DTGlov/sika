import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeMonthContext } from '@/lib/monthly/compute-month-context';
import { generateRecapCards } from '@/lib/monthly/generate-recap';
import { getCycleMonthBounds, isCycleEndDate } from '@/lib/monthly/dates';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date();
  const supabase = createServiceClient();

  // Find all users whose cycle ends today
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, cycle_start_day');

  const eligibleProfiles = (profiles ?? []).filter(
    (p) => p.cycle_start_day && isCycleEndDate(today, p.cycle_start_day),
  );

  const results = {
    eligible: eligibleProfiles.length,
    generated: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  // isCycleEndDate detects today as the cycle's last day (e.g., Apr 27 when
  // cycle_start_day=28), but getCycleMonthBounds expects today to be the
  // first day of the new cycle (Apr 28). Pass tomorrow so they align.
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  for (const profile of eligibleProfiles) {
    try {
      const { start: monthStart, end: monthEnd } = getCycleMonthBounds(tomorrow, profile.cycle_start_day);

      const { data: existing } = await supabase
        .from('monthly_recaps')
        .select('id')
        .eq('user_id', profile.id)
        .eq('month_start', monthStart.toISOString().split('T')[0])
        .maybeSingle();

      if (existing) {
        results.skipped++;
        continue;
      }

      const ctx = await computeMonthContext(supabase, profile.id, monthStart, monthEnd);

      if (ctx.month.transaction_count === 0) {
        results.skipped++;
        continue;
      }

      const cards = await generateRecapCards(ctx);

      await supabase.from('monthly_recaps').insert({
        user_id: profile.id,
        month_start: monthStart.toISOString().split('T')[0],
        month_end: monthEnd.toISOString().split('T')[0],
        recap_data: cards,
      });

      results.generated++;
    } catch (err) {
      results.failed++;
      results.errors.push(`${profile.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return NextResponse.json(results);
}
