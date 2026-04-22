import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeWeekContext } from '@/lib/weekly/compute-week-context';
import { generateRecapCards } from '@/lib/weekly/generate-recap';
import { startOfFridayWeek, endOfFridayWeek } from '@/lib/weekly/dates';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const weekStart = startOfFridayWeek(now);
  const weekEnd = endOfFridayWeek(now);

  const service = createServiceClient();
  const ctx = await computeWeekContext(service, user.id, weekStart, weekEnd);
  const cards = await generateRecapCards(ctx);

  await service.from('weekly_recaps').upsert({
    user_id: user.id,
    week_start: weekStart.toISOString().split('T')[0],
    week_end: weekEnd.toISOString().split('T')[0],
    recap_data: cards,
  }, { onConflict: 'user_id,week_start' });

  return NextResponse.json({ success: true, cards });
}
