import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeInsightContext } from '@/lib/insights/compute-insight-context';
import { generateInsight } from '@/lib/insights/generate-insight';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const service = createServiceClient();

  const ctx = await computeInsightContext(service, user.id, now);
  const insight = await generateInsight(ctx);

  await service.from('daily_insights').upsert({
    user_id: user.id,
    insight_date: today,
    insight_data: insight,
  }, { onConflict: 'user_id,insight_date' });

  return NextResponse.json({ success: true, insight });
}
