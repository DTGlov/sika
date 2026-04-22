import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const { recap_id } = await request.json();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await supabase
    .from('weekly_recaps')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', recap_id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
