import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { computeInsightContext } from '@/lib/insights/compute-insight-context';
import { generateInsight } from '@/lib/insights/generate-insight';
import { sendPushToUser } from '@/lib/push-sender';

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const supabase = createServiceClient();

  const { data: profiles } = await supabase.from('profiles').select('id');

  const results = {
    total: (profiles ?? []).length,
    generated: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const profile of profiles ?? []) {
    try {
      const { data: existing } = await supabase
        .from('daily_insights')
        .select('id')
        .eq('user_id', profile.id)
        .eq('insight_date', today)
        .maybeSingle();

      if (existing) {
        results.skipped++;
        continue;
      }

      const ctx = await computeInsightContext(supabase, profile.id, now);
      const insight = await generateInsight(ctx);

      await supabase.from('daily_insights').insert({
        user_id: profile.id,
        insight_date: today,
        insight_data: insight,
      });

      results.generated++;

      await sendPushToUser(supabase, profile.id, {
        title: insight.headline || 'Sika has something for you today',
        body: insight.body || "Tap to see today's insight.",
        url: '/dashboard',
        tag: 'daily-insight',
      });
    } catch (err) {
      results.failed++;
      results.errors.push(`${profile.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return NextResponse.json(results);
}
