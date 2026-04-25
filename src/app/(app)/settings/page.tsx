"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  LogOut,
  Plus,
  Archive,
  Pencil,
  ChevronDown,
  Briefcase,
  Tag,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/auth-store";
import { useProfile } from "@/hooks/use-profile";
import { useTransactionStore } from "@/stores/transaction-store";
import { totalMonthlyIncome } from "@/lib/income";
import { formatGHS } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IncomeSourcesSection } from "@/components/settings/income-sources-section";
import { HintCard } from "@/components/hint-card";
import {
  CategoryModal,
  ICON_OPTIONS,
} from "@/components/settings/category-modal";
import { CardThemePicker } from "@/components/settings/card-theme-picker";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { HapticsSection } from "@/components/settings/haptics-section";
import { DangerZone } from "@/components/settings/danger-zone";
import { resetAnalytics } from "@/lib/analytics/identify";
import type { Category } from "@/types";

const profileSchema = z
  .object({
    needs_percent: z.number().min(0).max(100),
    wants_percent: z.number().min(0).max(100),
    savings_percent: z.number().min(0).max(100),
    cycle_start_day: z.number().int().min(1).max(28),
  })
  .refine((d) => d.needs_percent + d.wants_percent + d.savings_percent === 100, {
    message: "Percentages must sum to 100",
    path: ["needs_percent"],
  });

type ProfileForm = z.infer<typeof profileSchema>;

const BUCKET_COLORS: Record<string, string> = {
  needs: "#00D9A3",
  wants: "#FBBF24",
  savings: "#60A5FA",
};

function getIconEmoji(icon: string | null): string {
  return ICON_OPTIONS.find((o) => o.key === icon)?.emoji ?? "💸";
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, incomeSources, reset } = useAuthStore();
  const { setCategories, categories, bumpMutation } = useTransactionStore();
  const { refetch } = useProfile();
  const supabase = createClient();

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | undefined>();
  const [showArchived, setShowArchived] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    if (profile) {
      resetForm({
        needs_percent: profile.needs_percent,
        wants_percent: profile.wants_percent,
        savings_percent: profile.savings_percent,
        cycle_start_day: profile.cycle_start_day ?? 1,
      });
    }
  }, [profile, resetForm]);

  async function onSaveProfile(values: ProfileForm) {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) {
      toast.error("Failed to save");
      return;
    }
    await refetch();
    bumpMutation();
    toast.success("Settings saved");
  }

  async function handleSignOut() {
    resetAnalytics();
    await supabase.auth.signOut();
    reset();
    router.push("/login");
  }

  function handleCategorySaved(cat: Category) {
    setCategories(
      editingCat
        ? categories.map((c) => (c.id === cat.id ? cat : c))
        : [...categories, cat],
    );
    bumpMutation();
    setCatModalOpen(false);
    setEditingCat(undefined);
  }

  async function handleArchiveCategory(id: string) {
    const { error } = await supabase
      .from("categories")
      .update({ is_archived: true })
      .eq("id", id);
    if (error) {
      toast.error("Failed to archive");
      return;
    }
    setCategories(
      categories.map((c) => (c.id === id ? { ...c, is_archived: true } : c)),
    );
    bumpMutation();
    toast.success("Category archived");
  }

  async function handleRestoreCategory(id: string) {
    const { error } = await supabase
      .from("categories")
      .update({ is_archived: false })
      .eq("id", id);
    if (error) {
      toast.error("Failed to restore");
      return;
    }
    setCategories(
      categories.map((c) => (c.id === id ? { ...c, is_archived: false } : c)),
    );
    toast.success("Category restored");
  }

  const activeCats = categories.filter((c) => !c.is_archived);
  const archivedCats = categories.filter((c) => c.is_archived);
  const totalIncome = totalMonthlyIncome(incomeSources);

  const hasNoIncomeSources = incomeSources.length === 0;
  const hasOnlyDefaultCats = activeCats.every(c => c.is_default || c.user_id === null);

  async function handleResetHints() {
    if (!user) return;
    const { setDismissedHints } = useAuthStore.getState();
    await supabase.from('dismissed_hints').delete().eq('user_id', user.id);
    setDismissedHints([]);
    toast.success('Hints will appear again');
  }

  const expenseCats = activeCats.filter((c) => {
    const ct = c.category_type ?? (c.bucket_id ? "expense" : "income");
    return ct === "expense";
  });
  const incomeCats = activeCats.filter((c) => {
    const ct = c.category_type ?? (c.bucket_id ? "expense" : "income");
    return ct === "income";
  });
  const adjustmentCats = activeCats.filter((c) => {
    const ct = c.category_type ?? (c.bucket_id ? "expense" : "income");
    return ct === "adjustment";
  });

  const expenseByBucket: Record<string, Category[]> = {};
  const expenseNoBucket: Category[] = [];
  for (const cat of expenseCats) {
    if (cat.bucket?.name) {
      expenseByBucket[cat.bucket.name] = [
        ...(expenseByBucket[cat.bucket.name] ?? []),
        cat,
      ];
    } else {
      expenseNoBucket.push(cat);
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-24">
      <div className="px-4 pt-6 md:px-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">Settings</h1>

        {/* Appearance */}
        <AppearanceSection />

        {/* Haptics */}
        <HapticsSection />

        {/* Income Sources */}
        <div className="mb-6">
          {hasNoIncomeSources && (
            <HintCard
              hintId="settings_income_sources"
              title="Income sources vs logged income"
              body="Income sources tell Sika what you expect to earn each month (salary, allowances, side hustles). They power your budget. Logged income transactions are the actual money that hits your account — those happen via the + button when income arrives."
              icon={Briefcase}
              variant="inline"
              className="mb-4"
            />
          )}
          <IncomeSourcesSection />
        </div>

        {/* Card Style picker */}
        <div className="mb-6">
          <HintCard
            hintId="card_theme_available"
            title="Customize your card"
            body="Choose from 7 heritage-themed card styles inspired by Adinkra symbols and Ghanaian craft. Tap 'Change card' to browse."
            className="mb-4"
          />
          <CardThemePicker />
        </div>

        <form onSubmit={handleSubmit(onSaveProfile)} className="space-y-6">
          {/* Total Monthly Income (read-only) */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-foreground font-semibold mb-1">
              Total Monthly Income
            </h2>
            <p className="text-muted-foreground text-xs mb-3">
              Computed from your active income sources above
            </p>
            <div className="h-12 px-4 bg-muted border border-border rounded-xl flex items-center">
              <span className="text-muted-foreground font-mono mr-2">₵</span>
              <span className="text-foreground font-semibold text-base">
                {totalIncome > 0
                  ? totalIncome.toLocaleString("en-GH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"}
              </span>
            </div>
          </div>

          {/* Budget Cycle */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-foreground font-semibold mb-1">Budget Month</h2>
            <p className="text-muted-foreground text-xs mb-4">
              Which day of the month does your month start? (1–28)
            </p>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-sm">Month start day</Label>
              <Input
                type="number"
                min="1"
                max="28"
                className="h-11 w-28 bg-input border-border text-foreground focus-visible:ring-accent amount"
                {...register("cycle_start_day", { valueAsNumber: true })}
              />
              <p className="text-muted-foreground/70 text-[11px]">
                Tip: set this to your salary day so your budget resets when you
                get paid.
              </p>
            </div>
          </div>

          {/* Budget Split */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-foreground font-semibold mb-1">
              Budget Split (%)
            </h2>
            <p className="text-muted-foreground text-xs mb-4">Must add up to 100</p>
            <div className="grid grid-cols-3 gap-3">
              {(["needs", "wants", "savings"] as const).map((bucket) => {
                const colors = {
                  needs: "#00D9A3",
                  wants: "#FBBF24",
                  savings: "#60A5FA",
                };
                const labels = {
                  needs: "Needs",
                  wants: "Wants",
                  savings: "Savings",
                };
                const pct = profile
                  ? (profile[`${bucket}_percent`] as number)
                  : 0;
                return (
                  <div key={bucket} className="space-y-1.5">
                    <Label
                      className="text-xs"
                      style={{ color: colors[bucket] }}
                    >
                      {labels[bucket]}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      className="h-10 bg-input border-border text-foreground focus-visible:ring-accent text-center amount"
                      {...register(`${bucket}_percent`, {
                        valueAsNumber: true,
                      })}
                    />
                    {totalIncome > 0 && (
                      <p className="text-muted-foreground/70 text-[10px] text-center">
                        {formatGHS((totalIncome * pct) / 100)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {errors.needs_percent && (
              <p className="text-[#F43F5E] text-xs mt-2">
                {errors.needs_percent.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="w-full h-12 bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-semibold rounded-xl"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Save changes"
            )}
          </Button>
        </form>

        {/* Categories */}
        {hasOnlyDefaultCats && (
          <HintCard
            hintId="settings_categories"
            title="Categories explained"
            body="Categories organize your transactions. Expense categories belong to a bucket (Needs/Wants/Savings). Income and adjustment categories don't — they exist outside the budget split."
            icon={Tag}
            variant="inline"
            className="mt-4"
          />
        )}
        <div className="bg-card border border-border rounded-2xl p-5 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-foreground font-semibold">Categories</h2>
            <Button
              onClick={() => {
                setEditingCat(undefined);
                setCatModalOpen(true);
              }}
              className="h-8 px-3 text-xs bg-[#D4A017] hover:bg-[#B8891A] text-[#0E1A2E] font-medium rounded-xl gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>

          <div className="space-y-5">
            {/* Spending categories grouped by bucket */}
            {(["needs", "wants", "savings"] as const).map((bName) => {
              const bCats = expenseByBucket[bName] ?? [];
              if (bCats.length === 0) return null;
              const color = BUCKET_COLORS[bName];
              const label = {
                needs: "Needs",
                wants: "Wants",
                savings: "Savings",
              }[bName];
              return (
                <div key={bName}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <p
                      className="text-xs font-medium uppercase tracking-wider"
                      style={{ color }}
                    >
                      {label}
                    </p>
                  </div>
                  <div className="space-y-1">
                    {bCats.map((cat) => (
                      <CategoryRow
                        key={cat.id}
                        cat={cat}
                        onEdit={() => {
                          setEditingCat(cat);
                          setCatModalOpen(true);
                        }}
                        onArchive={() => handleArchiveCategory(cat.id)}
                        getIconEmoji={getIconEmoji}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Expense categories without a bucket */}
            {expenseNoBucket.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                  Spending (no bucket)
                </p>
                <div className="space-y-1">
                  {expenseNoBucket.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      cat={cat}
                      onEdit={() => {
                        setEditingCat(cat);
                        setCatModalOpen(true);
                      }}
                      onArchive={() => handleArchiveCategory(cat.id)}
                      getIconEmoji={getIconEmoji}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Income categories */}
            {incomeCats.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[#D4A017] text-xs font-bold">+</span>
                  <p className="text-xs font-medium uppercase tracking-wider text-[#D4A017]">
                    Income
                  </p>
                </div>
                <div className="space-y-1">
                  {incomeCats.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      cat={cat}
                      onEdit={() => {
                        setEditingCat(cat);
                        setCatModalOpen(true);
                      }}
                      onArchive={() => handleArchiveCategory(cat.id)}
                      getIconEmoji={getIconEmoji}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Adjustment categories */}
            {adjustmentCats.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-muted-foreground text-xs">⚖️</span>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Adjustments
                  </p>
                </div>
                <div className="space-y-1">
                  {adjustmentCats.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      cat={cat}
                      onEdit={() => {
                        setEditingCat(cat);
                        setCatModalOpen(true);
                      }}
                      onArchive={() => handleArchiveCategory(cat.id)}
                      getIconEmoji={getIconEmoji}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Archived toggle */}
            {archivedCats.length > 0 && (
              <div>
                <button
                  onClick={() => setShowArchived((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                >
                  <ChevronDown
                    className="w-3.5 h-3.5 transition-transform"
                    style={{
                      transform: showArchived ? "rotate(180deg)" : "none",
                    }}
                  />
                  {archivedCats.length} archived
                </button>
                {showArchived && (
                  <div className="space-y-1 mt-2">
                    {archivedCats.map((cat) => (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between px-3 py-2 bg-muted rounded-xl opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {getIconEmoji(cat.icon)}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {cat.name}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRestoreCategory(cat.id)}
                          className="text-xs text-[#D4A017] hover:text-[#E8B520] transition-colors"
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* App preferences */}
        <div className="mt-6 bg-card border border-border rounded-2xl p-5">
          <h2 className="text-foreground font-semibold mb-1">App preferences</h2>
          <p className="text-muted-foreground text-xs mb-4">Show all dismissed hints again. Useful if you want a refresher.</p>
          <Button
            type="button"
            variant="outline"
            onClick={handleResetHints}
            className="h-10 px-4 border-border text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl text-sm gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset onboarding hints
          </Button>
        </div>

        {/* Sign out */}
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={handleSignOut}
            className="w-full h-12 border-border text-[#F43F5E] hover:bg-[#F43F5E]/10 hover:border-[#F43F5E]/50 rounded-xl"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>

        {/* Danger zone */}
        <DangerZone />

        {/* Privacy link */}
        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          <a href="/privacy" className="hover:text-muted-foreground transition-colors underline underline-offset-2">
            Privacy policy
          </a>
        </p>
      </div>

      <CategoryModal
        open={catModalOpen}
        onClose={() => {
          setCatModalOpen(false);
          setEditingCat(undefined);
        }}
        editCategory={editingCat}
        onSaved={handleCategorySaved}
      />
    </div>
  );
}

interface CategoryRowProps {
  cat: Category;
  onEdit: () => void;
  onArchive: () => void;
  getIconEmoji: (icon: string | null) => string;
}

function CategoryRow({
  cat,
  onEdit,
  onArchive,
  getIconEmoji,
}: CategoryRowProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-muted rounded-xl group">
      <div className="flex items-center gap-2">
        <span className="text-base">{getIconEmoji(cat.icon)}</span>
        <span className="text-foreground text-sm">{cat.name}</span>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="w-7 h-7 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onArchive}
          className="w-7 h-7 rounded-lg text-muted-foreground hover:text-[#FBBF24] flex items-center justify-center transition-colors"
        >
          <Archive className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
