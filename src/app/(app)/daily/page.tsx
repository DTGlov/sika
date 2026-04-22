'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { revalidateForEntity } from '@/lib/revalidation';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/types/daily';
import type { DailyDigest, DailyStory } from '@/types/daily';

const AUTO_READ_DELAY_MS = 10_000;

function StoryCard({ story }: { story: DailyStory }) {
  const color = CATEGORY_COLORS[story.category];
  const label = CATEGORY_LABELS[story.category];

  return (
    <div className="bg-[#141416] border border-[#27272A] rounded-2xl px-4 py-4 space-y-2">
      <p
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color }}
      >
        {label}
      </p>
      <div className="flex items-start gap-2">
        <span className="text-xl leading-none mt-0.5 shrink-0">{story.emoji}</span>
        <h3 className="text-[#FAFAFA] font-semibold text-sm leading-snug">{story.title}</h3>
      </div>
      <p className="text-[#A1A1AA] text-sm leading-relaxed">{story.summary}</p>
      <p className="text-[#52525B] text-xs">— {story.source_name}</p>
    </div>
  );
}

export default function DailyPage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useAuthStore();
  useProfile();

  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRead, setIsRead] = useState(false);
  const autoReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    supabase
      .from('sika_daily_digests')
      .select('*')
      .eq('digest_date', today)
      .single()
      .then(({ data }) => {
        if (data) setDigest(data as DailyDigest);
        setIsLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check existing read status once we have user + digest
  useEffect(() => {
    if (!user || !digest) return;
    supabase
      .from('user_daily_reads')
      .select('id')
      .eq('user_id', user.id)
      .eq('digest_date', digest.digest_date)
      .single()
      .then(({ data }) => {
        if (data) setIsRead(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, digest]);

  // Auto-mark read after 10s
  useEffect(() => {
    if (!user || !digest || isRead) return;
    autoReadTimer.current = setTimeout(() => markRead(), AUTO_READ_DELAY_MS);
    return () => {
      if (autoReadTimer.current) clearTimeout(autoReadTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, digest, isRead]);

  async function markRead() {
    if (!user || !digest || isRead) return;
    await supabase
      .from('user_daily_reads')
      .insert({ user_id: user.id, digest_date: digest.digest_date })
      .select()
      .single();
    setIsRead(true);
    revalidateForEntity('digest_read');
  }

  const dateLabel = digest
    ? format(new Date(digest.digest_date + 'T00:00:00'), 'EEEE, MMMM d, yyyy')
    : '';

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0A0A0B] border-b border-[#141416]">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F] transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[#FAFAFA] font-semibold text-base">Sika Daily</h1>
        </div>
      </div>

      <div className="px-4 md:px-8 pt-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {/* Header skeleton */}
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-[#141416] animate-pulse" />
            </div>

            {/* Story card skeletons */}
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl bg-[#141416] border border-[#27272A] px-4 py-4 space-y-3">
                <div className="h-2.5 w-20 rounded bg-[#1C1C1F] animate-pulse" />
                <div className="h-4 w-3/4 rounded bg-[#1C1C1F] animate-pulse" />
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-[#1C1C1F] animate-pulse" />
                  <div className="h-3 w-5/6 rounded bg-[#1C1C1F] animate-pulse" />
                  <div className="h-3 w-2/3 rounded bg-[#1C1C1F] animate-pulse" />
                </div>
                <div className="h-2.5 w-24 rounded bg-[#1C1C1F] animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Date + fallback badge */}
            <div className="space-y-1">
              <p className="text-[#71717A] text-sm">{dateLabel}</p>
              {digest?.is_fallback && (
                <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FBBF24]/10 text-[#FBBF24] uppercase tracking-wider">
                  Catch up from yesterday
                </span>
              )}
            </div>

            {/* Stories */}
            {digest && (
              <div className="space-y-3">
                {digest.stories.map((story: DailyStory) => (
                  <StoryCard key={story.id} story={story} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Mark as read button */}
        {!isLoading && digest && !isRead && (
          <button
            onClick={markRead}
            className="w-full py-3 rounded-2xl border border-[#27272A] text-sm text-[#71717A] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
          >
            Mark as read
          </button>
        )}

        {!isLoading && digest && isRead && (
          <p className="text-center text-xs text-[#3F3F46] py-2">
            ✓ Read
          </p>
        )}
      </div>
    </div>
  );
}
