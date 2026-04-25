import Link from 'next/link';
import { SikaMark } from '@/components/brand/sika-mark';

export const metadata = {
  title: 'Privacy Policy — Sika',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-12 md:py-16">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center">
            <SikaMark size={36} variant="gold-on-navy" />
          </div>
          <Link href="/" className="text-xl font-bold tracking-tight">Sika</Link>
        </div>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: April 2025</p>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">1. What Sika is</h2>
            <p>Sika is a personal finance app that helps you track income, spending, and savings goals. It is intended for personal use and is not a bank, financial advisor, or payment processor.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">2. What we collect</h2>
            <p className="mb-2">When you use Sika, we store the following data on your behalf:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your name and email address (used for login and display)</li>
              <li>Financial data you enter: transactions, accounts, income sources, savings goals, recurring items</li>
              <li>Preferences you configure: budget split, cycle start day, card theme, notification settings</li>
              <li>Usage signals: streaks, badge progress, monthly recaps generated from your data</li>
            </ul>
            <p className="mt-2">We do not collect your bank credentials, payment card numbers, or link to external financial accounts.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">3. How we use your data</h2>
            <p className="mb-2">Your data is used solely to power the features of the app:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Displaying your dashboard, transaction history, and goals</li>
              <li>Computing budget breakdowns and cycle net figures</li>
              <li>Generating AI-powered insights and purchase decisions via Anthropic Claude</li>
              <li>Sending optional daily digest emails if you have opted in</li>
            </ul>
            <p className="mt-2">We do not sell your data, share it with advertisers, or use it to train AI models.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">4. AI features</h2>
            <p>Sika uses Anthropic Claude to generate budget insights, purchase decisions, and daily digests. When these features are used, relevant financial summary data (totals, category breakdowns, goal progress) is sent to Anthropic's API. Individual transaction descriptions may be included. This data is processed by Anthropic under their API terms and is not used to train their models.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">5. Usage analytics</h2>
            <p className="mb-2">Sika uses PostHog to understand how features are used — which screens get engagement, where users get stuck, and which actions flow naturally. This includes session replay, which records the structure of your interactions (which screens you visit, which buttons you tap) to help us debug issues and improve the app.</p>
            <p className="mb-2">When you sign up, your name and email are associated with your activity in our analytics. This is used internally to understand user experience and debug issues. We do not share this information with any party other than PostHog, our analytics provider.</p>
            <p>All financial data — transaction amounts, account balances, goal values, notes, and anything you type — is automatically masked and never captured in session replays. We see your navigation patterns, not your money. You can read PostHog&apos;s privacy policy at <a href="https://posthog.com/privacy" className="text-[#D4A017] hover:text-[#E8B520] transition-colors">posthog.com/privacy</a>.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">6. Data storage and security</h2>
            <p>Your data is stored in Supabase, a cloud database platform hosted on AWS. All data is encrypted at rest and in transit. Access is restricted to authenticated users — you can only see your own data. We use Supabase row-level security policies to enforce this at the database level.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">7. Your rights</h2>
            <p className="mb-2">You have full control over your data:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-foreground">Export:</strong> Contact us and we can export all your data in JSON format.</li>
              <li><strong className="text-foreground">Delete:</strong> You can permanently delete your account and all associated data at any time from Settings → Danger Zone. This is irreversible.</li>
              <li><strong className="text-foreground">Correction:</strong> You can edit or delete any transaction, account, or goal at any time within the app.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">8. Cookies and tracking</h2>
            <p>Sika uses a session cookie to keep you logged in. We do not use analytics trackers, advertising pixels, or third-party cookies. No data is shared with ad networks.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">9. Children</h2>
            <p>Sika is not directed at children under 13. If you believe a child has created an account, contact us and we will delete it promptly.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">10. Changes to this policy</h2>
            <p>If we make material changes to how we handle your data, we will notify you by email or via an in-app notice before the changes take effect.</p>
          </section>

          <section>
            <h2 className="text-foreground font-semibold text-base mb-2">11. Contact</h2>
            <p>Questions about this policy or your data? Email us at <span className="text-foreground">dtglover21@gmail.com</span>.</p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <Link href="/login" className="text-sm text-[#D4A017] hover:text-[#E8B520] transition-colors">
            ← Back to app
          </Link>
        </div>
      </div>
    </div>
  );
}
