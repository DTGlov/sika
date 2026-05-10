import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAuthedUser } from '@/lib/auth/get-authed-user';
import { ALL_CURRENCIES } from '@/lib/currencies';

export async function PATCH(request: Request) {
  const user = await getAuthedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { currency_code } = await request.json();
  if (!ALL_CURRENCIES.some(c => c.code === currency_code)) {
    return NextResponse.json({ error: 'Invalid currency code' }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('profiles')
    .update({ currency: currency_code })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
