import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { WeeklyRecap } from '@/components/weekly/weekly-recap';
import type { WeeklyRecap as WeeklyRecapType } from '@/types/weekly';

export default async function WeeklyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let recap: WeeklyRecapType | null = null;

  if (user) {
    const { data } = await supabase
      .from('weekly_recaps')
      .select('*')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
      .limit(1)
      .single();
    recap = data as WeeklyRecapType | null;
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
        <h1 className="text-xl font-bold text-[#FAFAFA]">Your Week</h1>
      </div>

      {recap ? (
        <WeeklyRecap
          cards={recap.recap_data}
          recapId={recap.id}
          weekStart={recap.week_start}
          weekEnd={recap.week_end}
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <div className="text-4xl">🔥</div>
          <p className="text-[#FAFAFA] font-semibold">Your first recap drops Friday</p>
          <p className="text-[#71717A] text-sm max-w-xs">
            Log your transactions this week and Sika will write your money story. Check back Friday evening.
          </p>
        </div>
      )}
    </div>
  );
}
