'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Loader2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormValues = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError('');
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.full_name },
      },
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    if (data.user && !data.session) {
      toast.success('Account created — check your email');
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
      return;
    }
    router.push('/dashboard');
    router.refresh();
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
          <div className="w-10 h-10 rounded-xl bg-[#00D9A3] flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-[#0A0A0B]" />
          </div>
          <span className="text-2xl font-bold tracking-tight">Sika</span>
        </div>
        <h1 className="text-2xl font-bold text-[#FAFAFA] mb-1">Create your account</h1>
        <p className="text-[#A1A1AA] text-sm">Start tracking your money in seconds</p>
      </div>

      <div className="bg-[#141416] border border-[#27272A] rounded-2xl p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name" className="text-[#A1A1AA] text-sm">Full name</Label>
            <Input
              id="full_name"
              type="text"
              placeholder="Kofi Mensah"
              autoComplete="name"
              className="h-12 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#71717A] focus-visible:ring-[#00D9A3] focus-visible:border-[#00D9A3] text-base"
              {...register('full_name')}
            />
            {errors.full_name && (
              <p className="text-[#F43F5E] text-xs">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[#A1A1AA] text-sm">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="kofi@example.com"
              autoComplete="email"
              className="h-12 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#71717A] focus-visible:ring-[#00D9A3] focus-visible:border-[#00D9A3] text-base"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-[#F43F5E] text-xs">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[#A1A1AA] text-sm">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 6 characters"
              autoComplete="new-password"
              className="h-12 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#71717A] focus-visible:ring-[#00D9A3] focus-visible:border-[#00D9A3] text-base"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-[#F43F5E] text-xs">{errors.password.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-[#F43F5E] text-sm text-center">{serverError}</p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold text-base rounded-xl transition-colors"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create account'}
          </Button>
          <p className="text-center text-xs text-[#71717A]">
            We&apos;ll send you a verification email
          </p>
        </form>

        <p className="mt-4 text-center text-sm text-[#71717A]">
          Already have an account?{' '}
          <Link href="/login" className="text-[#00D9A3] hover:text-[#00F5B8] font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
