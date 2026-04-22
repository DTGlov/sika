import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeMonthContext } from '@/lib/monthly/compute-month-context';
import { generateRecapCards } from '@/lib/monthly/generate-recap';
import { getCycleMonthBounds } from '@/lib/monthly/dates';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('cycle_start_day')
    .eq('id', user.id)
    .single();

  if (!profile?.cycle_start_day) {
    return NextResponse.json({ error: 'No cycle configured' }, { status: 400 });
  }

  const today = new Date();
  const { start, end } = getCycleMonthBounds(today, profile.cycle_start_day);

  const service = createServiceClient();
  const ctx = await computeMonthContext(service, user.id, start, end);
  const cards = await generateRecapCards(ctx);

  await service.from('monthly_recaps').upsert({
    user_id: user.id,
    month_start: start.toISOString().split('T')[0],
    month_end: end.toISOString().split('T')[0],
    recap_data: cards,
  }, { onConflict: 'user_id,month_start' });

  return NextResponse.json({ success: true, cards, monthStart: start, monthEnd: end });
}
