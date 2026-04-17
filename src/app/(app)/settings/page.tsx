'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, LogOut, Plus, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { useProfile } from '@/hooks/use-profile';
import { useTransactionStore } from '@/stores/transaction-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CURRENCY_SYMBOL } from '@/lib/constants';
import type { Category } from '@/types';

const profileSchema = z.object({
  monthly_income: z.number().min(1, 'Required'),
  needs_percent: z.number().min(0).max(100),
  wants_percent: z.number().min(0).max(100),
  future_percent: z.number().min(0).max(100),
}).refine(
  (d) => d.needs_percent + d.wants_percent + d.future_percent === 100,
  { message: 'Percentages must sum to 100', path: ['needs_percent'] }
);

type ProfileForm = z.infer<typeof profileSchema>;

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, reset } = useAuthStore();
  const { setCategories, categories } = useTransactionStore();
  const { refetch } = useProfile();
  const supabase = createClient();
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    if (profile) {
      resetForm({
        monthly_income: profile.monthly_income,
        needs_percent: profile.needs_percent,
        wants_percent: profile.wants_percent,
        future_percent: profile.future_percent,
      });
    }
  }, [profile, resetForm]);

  async function onSaveProfile(values: ProfileForm) {
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) {
      toast.error('Failed to save');
      return;
    }
    await refetch();
    toast.success('Settings saved');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    reset();
    router.push('/login');
  }

  async function handleAddCategory() {
    if (!user || !newCatName.trim()) return;
    setAddingCat(true);
    const { data, error } = await supabase
      .from('categories')
      .insert({ user_id: user.id, name: newCatName.trim(), is_default: false })
      .select('*, bucket:budget_buckets(*)')
      .single();
    setAddingCat(false);
    if (error) { toast.error('Failed to add category'); return; }
    setCategories([...categories, data as Category]);
    setNewCatName('');
    toast.success('Category added');
  }

  async function handleArchiveCategory(id: string) {
    const { error } = await supabase
      .from('categories')
      .update({ is_archived: true })
      .eq('id', id);
    if (error) { toast.error('Failed to archive'); return; }
    setCategories(categories.map((c) => c.id === id ? { ...c, is_archived: true } : c));
    toast.success('Category archived');
  }

  const activeCats = categories.filter((c) => !c.is_archived);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="px-4 pt-6 md:px-8">
        <h1 className="text-2xl font-bold text-[#FAFAFA] mb-6">Settings</h1>

        <form onSubmit={handleSubmit(onSaveProfile)} className="space-y-6">
          {/* Income */}
          <div className="bg-[#141416] border border-[#27272A] rounded-2xl p-5">
            <h2 className="text-[#FAFAFA] font-semibold mb-4">Monthly Income</h2>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA] text-sm">Income ({CURRENCY_SYMBOL})</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A1A1AA] font-mono">{CURRENCY_SYMBOL}</span>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  className="h-12 pl-8 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] focus-visible:ring-[#00D9A3] amount"
                  {...register('monthly_income', { valueAsNumber: true })}
                />
              </div>
              {errors.monthly_income && <p className="text-[#F43F5E] text-xs">{errors.monthly_income.message}</p>}
            </div>
          </div>

          {/* Buckets */}
          <div className="bg-[#141416] border border-[#27272A] rounded-2xl p-5">
            <h2 className="text-[#FAFAFA] font-semibold mb-1">Budget Split (%)</h2>
            <p className="text-[#71717A] text-xs mb-4">Must add up to 100</p>
            <div className="grid grid-cols-3 gap-3">
              {(['needs', 'wants', 'future'] as const).map((bucket) => {
                const colors = { needs: '#00D9A3', wants: '#FBBF24', future: '#60A5FA' };
                const labels = { needs: 'Needs', wants: 'Wants', future: 'Future' };
                return (
                  <div key={bucket} className="space-y-1.5">
                    <Label className="text-xs" style={{ color: colors[bucket] }}>{labels[bucket]}</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="h-10 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] focus-visible:ring-[#00D9A3] text-center amount"
                      {...register(`${bucket}_percent`, { valueAsNumber: true })}
                    />
                  </div>
                );
              })}
            </div>
            {errors.needs_percent && <p className="text-[#F43F5E] text-xs mt-2">{errors.needs_percent.message}</p>}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="w-full h-12 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
          </Button>
        </form>

        {/* Categories */}
        <div className="bg-[#141416] border border-[#27272A] rounded-2xl p-5 mt-6">
          <h2 className="text-[#FAFAFA] font-semibold mb-4">Categories</h2>

          <div className="flex gap-2 mb-4">
            <Input
              placeholder="New category name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              className="h-10 bg-[#1C1C1F] border-[#27272A] text-[#FAFAFA] placeholder:text-[#71717A] focus-visible:ring-[#00D9A3]"
            />
            <Button
              onClick={handleAddCategory}
              disabled={addingCat || !newCatName.trim()}
              className="h-10 px-3 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] rounded-xl"
            >
              {addingCat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {activeCats.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between px-3 py-2.5 bg-[#1C1C1F] rounded-xl"
              >
                <span className="text-[#FAFAFA] text-sm">{cat.name}</span>
                <button
                  onClick={() => handleArchiveCategory(cat.id)}
                  className="w-7 h-7 rounded-lg text-[#71717A] hover:text-[#FBBF24] flex items-center justify-center transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sign out */}
        <div className="mt-6">
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="w-full h-12 border-[#27272A] text-[#F43F5E] hover:bg-[#F43F5E]/10 hover:border-[#F43F5E]/50 rounded-xl"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
