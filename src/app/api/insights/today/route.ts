import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('daily_insights')
    .select('*')
    .eq('user_id', user.id)
    .eq('insight_date', today)
    .maybeSingle();

  return NextResponse.json({ insight: data ?? null });
}
