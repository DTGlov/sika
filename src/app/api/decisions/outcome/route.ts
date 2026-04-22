import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const outcomeSchema = z.object({
  decision_id: z.string().uuid(),
  outcome: z.enum(['bought', 'skipped']),
  transaction_id: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = outcomeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const update: Record<string, unknown> = { outcome: parsed.data.outcome };
  if (parsed.data.transaction_id) update.outcome_transaction_id = parsed.data.transaction_id;

  await supabase
    .from('purchase_decisions')
    .update(update)
    .eq('id', parsed.data.decision_id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
