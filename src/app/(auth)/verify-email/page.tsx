'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { MailCheck } from 'lucide-react';
import { SikaMark } from '@/components/brand/sika-mark';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const COOLDOWN_SECONDS = 60;

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const supabase = createClient();

  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    if (!email || cooldown > 0) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Verification email sent');
    setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-sm"
    >
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center">
            <SikaMark size={40} variant="gold-on-navy" />
          </div>
          <span className="text-2xl font-bold tracking-tight">Sika</span>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.1 }}
          className="w-16 h-16 rounded-2xl bg-[#D4A017]/10 border border-[#D4A017]/20 flex items-center justify-center mx-auto mb-4"
        >
          <MailCheck className="w-8 h-8 text-[#D4A017]" />
        </motion.div>

        <h1 className="text-xl font-bold text-foreground mb-2">Check your email</h1>

        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          We sent a verification link to{' '}
          {email ? (
            <span className="text-foreground font-medium">{email}</span>
          ) : (
            'your email address'
          )}
          . Click it to activate your Sika account and log in.
        </p>

        <Button
          onClick={handleResend}
          disabled={cooldown > 0 || !email}
          className="w-full h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}
        </Button>

        <p className="mt-4 text-sm text-muted-foreground">
          Wrong email?{' '}
          <Link href="/signup" className="text-[#D4A017] hover:text-[#E8B520] font-medium transition-colors">
            Sign up again
          </Link>
        </p>

        <p className="mt-5 text-xs text-muted-foreground">
          Check your spam folder if you don&apos;t see it within a minute.
        </p>
      </div>
    </motion.div>
  );
}

function VerifyEmailSkeleton() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center">
            <SikaMark size={40} variant="gold-on-navy" />
          </div>
          <span className="text-2xl font-bold tracking-tight">Sika</span>
        </div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-4">
        <Skeleton className="w-16 h-16 rounded-2xl mx-auto bg-muted" />
        <Skeleton className="h-6 w-40 rounded-lg mx-auto bg-muted" />
        <Skeleton className="h-4 w-64 rounded-lg mx-auto bg-muted" />
        <Skeleton className="h-12 w-full rounded-xl bg-muted" />
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailSkeleton />}>
      <VerifyEmailContent />
    </Suspense>
  );
}
