import { ImageResponse } from 'next/og';
import { createServiceClient } from '@/lib/supabase/service';
import type { MonthlyCard } from '@/types/monthly';

export const runtime = 'nodejs';
export const alt = 'My Sika Month';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: recap } = await supabase
    .from('monthly_recaps')
    .select('recap_data, month_start, month_end')
    .eq('id', id)
    .single();

  const cards: MonthlyCard[] = recap?.recap_data ?? [];
  const headlineCard = cards.find((c) => c.type === 'headline') ?? cards[0];
  const winCard = cards.find((c) => c.type === 'win') ?? null;

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  };

  const weekLabel = recap
    ? `${formatDate(recap.month_start)} — ${formatDate(recap.month_end)}`
    : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          backgroundColor: '#0A0A0B',
          display: 'flex',
          flexDirection: 'column',
          padding: 64,
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Accent glow corner */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,217,163,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: '#00D9A3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0A0A0B',
                fontWeight: 800,
                fontSize: 20,
              }}
            >
              S
            </div>
            <span style={{ color: '#FAFAFA', fontSize: 24, fontWeight: 700 }}>Sika</span>
          </div>
          {weekLabel && (
            <span style={{ color: '#71717A', fontSize: 18 }}>{weekLabel}</span>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {headlineCard && (
            <>
              <div style={{ color: '#00D9A3', fontSize: 64, fontWeight: 800, lineHeight: 1.1, marginBottom: 24 }}>
                {headlineCard.headline}
              </div>
              <div style={{ color: '#A1A1AA', fontSize: 28, lineHeight: 1.5, maxWidth: 800 }}>
                {headlineCard.body}
              </div>
            </>
          )}
          {winCard && (
            <div
              style={{
                marginTop: 40,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                backgroundColor: 'rgba(0,217,163,0.08)',
                border: '1px solid rgba(0,217,163,0.2)',
                borderRadius: 20,
                padding: '20px 28px',
              }}
            >
              <span style={{ color: '#00D9A3', fontSize: 22, fontWeight: 700 }}>{winCard.headline}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 }}>
          <span style={{ color: '#52525B', fontSize: 16 }}>sika.app — track your money</span>
          <span style={{ color: '#27272A', fontSize: 16 }}>monthly recap</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
