import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { theme } = await request.json();
  if (theme !== 'light' && theme !== 'dark') {
    return NextResponse.json({ error: 'Invalid theme' }, { status: 400 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ theme_preference: theme })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
