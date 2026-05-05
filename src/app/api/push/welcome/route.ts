import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push-sender';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await sendPushToUser(supabase, user.id, {
    title: 'Sika notifications are on',
    body: "You'll get reminders for income and a daily insight each morning.",
    url: '/dashboard',
    tag: 'welcome',
  });

  return NextResponse.json({ ok: true, ...result });
}
