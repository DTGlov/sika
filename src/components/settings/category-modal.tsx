'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BudgetBucket, Category, CategoryType } from '@/types';

export const ICON_OPTIONS: { key: string; emoji: string }[] = [
  { key: 'home', emoji: '🏠' },
  { key: 'shopping-cart', emoji: '🛒' },
  { key: 'zap', emoji: '⚡' },
  { key: 'droplet', emoji: '💧' },
  { key: 'wifi', emoji: '📶' },
  { key: 'car', emoji: '🚗' },
  { key: 'utensils', emoji: '🍽️' },
  { key: 'heart-pulse', emoji: '💊' },
  { key: 'pizza', emoji: '🍕' },
  { key: 'film', emoji: '🎬' },
  { key: 'shopping-bag', emoji: '🛍️' },
  { key: 'repeat', emoji: '🔄' },
  { key: 'dumbbell', emoji: '🏋️' },
  { key: 'sparkles', emoji: '✨' },
  { key: 'piggy-bank', emoji: '🐷' },
  { key: 'trending-up', emoji: '📈' },
  { key: 'shield', emoji: '🛡️' },
  { key: 'briefcase', emoji: '💼' },
  { key: 'gift', emoji: '🎁' },
  { key: 'scale', emoji: '⚖️' },
  { key: 'phone', emoji: '📞' },
  { key: 'book', emoji: '📚' },
  { key: 'music', emoji: '🎵' },
];

const BUCKET_COLORS: Record<string, string> = {
  needs: '#00D9A3',
  wants: '#FBBF24',
  future: '#60A5FA',
};

const TYPE_META: Record<string, { label: string; hint: string }> = {
  expense: { label: 'Expense', hint: 'Subtracts from your buckets' },
  income: { label: 'Income', hint: 'Adds to your available income' },
  adjustment: { label: 'Adjustment', hint: "For reconciling balances — doesn't affect buckets" },
};

const categorySchema = z
  .object({
    name: z.string().min(1, 'Required').max(40, 'Max 40 chars'),
    category_type: z.enum(['expense', 'income', 'adjustment']),
    bucket_id: z.string().nullable(),
    icon: z.string().nullable(),
  })
  .refine((d) => d.category_type !== 'expense' || d.bucket_id !== null, {
    message: 'Choose a bucket for this expense category',
    path: ['bucket_id'],
  });

type CategoryForm = z.infer<typeof categorySchema>;

interface CategoryModalProps {
  open: boolean;
  onClose: () => void;
  editCategory?: Category;
  onSaved: (cat: Category) => void;
}

export function CategoryModal({ open, onClose, editCategory, onSaved }: CategoryModalProps) {
  const { user } = useAuthStore();
  const supabase = createClient();
  const [buckets, setBuckets] = useState<BudgetBucket[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', category_type: 'expense', bucket_id: null, icon: null },
  });

  const categoryType = watch('category_type');
  const bucketId = watch('bucket_id');
  const icon = watch('icon');

  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from('budget_buckets')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order')
      .then(({ data }) => { if (data) setBuckets(data as BudgetBucket[]); });
  }, [open, user, supabase]);

  useEffect(() => {
    if (open) {
      reset(
        editCategory
          ? {
              name: editCategory.name,
              category_type: (editCategory.category_type as 'expense' | 'income' | 'adjustment') ?? 'expense',
              bucket_id: editCategory.bucket_id,
              icon: editCategory.icon,
            }
          : { name: '', category_type: 'expense', bucket_id: null, icon: null }
      );
    }
  }, [open, editCategory, reset]);

  useEffect(() => {
    if (categoryType !== 'expense') setValue('bucket_id', null);
  }, [categoryType, setValue]);

  async function onSubmit(values: CategoryForm) {
    if (!user) return;

    const payload = {
      user_id: user.id,
      name: values.name,
      category_type: values.category_type,
      bucket_id: values.category_type === 'expense' ? values.bucket_id : null,
      icon: values.icon,
      is_default: false,
      is_archived: false,
    };

    let result: Category;

    if (editCategory) {
      const { data, error } = await supabase
        .from('categories')
        .update(payload)
        .eq('id', editCategory.id)
        .select('*, bucket:budget_buckets(*)')
        .single();
      if (error) { toast.error('Failed to save'); return; }
      result = data as Category;
    } else {
      const { data, error } = await supabase
        .from('categories')
        .insert(payload)
        .select('*, bucket:budget_buckets(*)')
        .single();
      if (error) { toast.error('Failed to save'); return; }
      result = data as Category;
    }

    onSaved(result);
    reset();
    onClose();
    toast.success(editCategory ? 'Category updated' : 'Category created');
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="bg-card border-border text-foreground max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editCategory ? 'Edit category' : 'Add category'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Name</Label>
            <Input
              placeholder="e.g. Groceries, Salary"
              className="h-11 bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-accent"
              {...register('name')}
            />
            {errors.name && <p className="text-[#F43F5E] text-xs">{errors.name.message}</p>}
          </div>

          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Type</Label>
            <div className="flex gap-1.5">
              {(['expense', 'income', 'adjustment'] as const).map((t) => {
                const active = categoryType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setValue('category_type', t)}
                    className="flex-1 h-9 rounded-xl text-xs font-medium border transition-all"
                    style={{
                      borderColor: active ? '#00D9A3' : 'var(--border)',
                      backgroundColor: active ? '#00D9A3' + '18' : 'var(--input)',
                      color: active ? '#00D9A3' : 'var(--muted-foreground)',
                    }}
                  >
                    {TYPE_META[t].label}
                  </button>
                );
              })}
            </div>
            <p className="text-muted-foreground/70 text-[11px]">{TYPE_META[categoryType].hint}</p>
          </div>

          {/* Bucket — only for expense */}
          {categoryType === 'expense' && (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">Bucket</Label>
              <div className="flex gap-2">
                {buckets.map((b) => {
                  const color = BUCKET_COLORS[b.name] ?? 'var(--muted-foreground)';
                  const active = bucketId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setValue('bucket_id', b.id)}
                      className="flex-1 h-10 rounded-xl text-sm font-medium border transition-all"
                      style={{
                        borderColor: active ? color : 'var(--border)',
                        backgroundColor: active ? color + '18' : 'var(--input)',
                        color: active ? color : 'var(--muted-foreground)',
                      }}
                    >
                      {b.display_name}
                    </button>
                  );
                })}
              </div>
              {errors.bucket_id && <p className="text-[#F43F5E] text-xs">{errors.bucket_id.message}</p>}
            </div>
          )}

          {/* Icon picker */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-sm">Icon (optional)</Label>
            <div className="grid grid-cols-8 gap-1.5">
              {ICON_OPTIONS.map((opt) => {
                const active = icon === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setValue('icon', active ? null : opt.key)}
                    className="h-9 w-9 rounded-xl text-lg flex items-center justify-center border transition-all"
                    style={{
                      borderColor: active ? '#00D9A3' : 'var(--border)',
                      backgroundColor: active ? '#00D9A3' + '18' : 'var(--input)',
                    }}
                  >
                    {opt.emoji}
                  </button>
                );
              })}
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 bg-[#00D9A3] hover:bg-[#00B088] text-[#0A0A0B] font-semibold rounded-xl"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editCategory ? 'Save changes' : 'Add category'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
