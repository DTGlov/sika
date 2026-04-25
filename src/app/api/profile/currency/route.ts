import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ALL_CURRENCIES } from '@/lib/currencies';

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { currency_code } = await request.json();
  if (!ALL_CURRENCIES.some(c => c.code === currency_code)) {
    return NextResponse.json({ error: 'Invalid currency code' }, { status: 400 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ currency: currency_code })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
