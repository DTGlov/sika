'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { DEFAULT_MONTHLY_INCOME, CURRENCY_SYMBOL } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const schema = z.object({
  monthly_income: z.number().min(1, 'Enter a valid income'),
});

type FormValues = z.infer<typeof schema>;

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const { user, setProfile } = useAuthStore();
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { monthly_income: DEFAULT_MONTHLY_INCOME },
  });

  async function onSubmit(values: FormValues) {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .update({ monthly_income: values.monthly_income, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single();
    if (data) setProfile(data);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative z-10 bg-[#141416] border border-[#27272A] rounded-2xl p-6 w-full max-w-sm"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#00D9A3]/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#00D9A3]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#FAFAFA]">One quick thing</h2>
                <p className="text-[#A1A1AA] text-xs">What&apos;s your monthly income?</p>
              </div>
            </div>

            <p className="text-[#71717A] text-sm mb-5">
              This lets Sika calculate your 50/30/20 split and show how you&apos;re tracking.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A1A1AA] font-mono font-medium">
                  {CURRENCY_SYMBOL}
                </span>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  className="h-12 pl-8 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] focus-visible:ring-[#00D9A3] focus-visible:border-[#00D9A3] text-base amount"
                  {...register('monthly_income', { valueAsNumber: true })}
                />
              </div>
              {errors.monthly_income && (
                <p className="text-[#F43F5E] text-xs">{errors.monthly_income.message}</p>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold text-base rounded-xl"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Let's go →"}
              </Button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
