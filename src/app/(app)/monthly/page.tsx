import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { MonthlyRecap } from '@/components/monthly/monthly-recap';
import type { MonthlyRecap as MonthlyRecapType } from '@/types/monthly';

export default async function MonthlyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let recap: MonthlyRecapType | null = null;

  if (user) {
    const { data } = await supabase
      .from('monthly_recaps')
      .select('*')
      .eq('user_id', user.id)
      .order('month_start', { ascending: false })
      .limit(1)
      .single();
    recap = data as MonthlyRecapType | null;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 pb-12">
      <div className="flex items-center gap-3 pt-6 mb-6">
        <Link
          href="/dashboard"
          className="w-9 h-9 rounded-xl bg-[#141416] border border-[#27272A] flex items-center justify-center text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <h1 className="text-xl font-bold text-[#FAFAFA]">Your Month</h1>
      </div>

      {recap ? (
        <MonthlyRecap
          cards={recap.recap_data}
          recapId={recap.id}
          monthStart={recap.month_start}
          monthEnd={recap.month_end}
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <div className="text-4xl">🔥</div>
          <p className="text-[#FAFAFA] font-semibold">Your first recap drops at cycle end</p>
          <p className="text-[#71717A] text-sm max-w-xs">
            Log your transactions this month and Sika will write your money story on the last day of your budget cycle.
          </p>
        </div>
      )}
    </div>
  );
}
