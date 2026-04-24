'use client';

import posthog from 'posthog-js';

export function identifyUser(
  userId: string,
  properties?: { name?: string; email?: string }
) {
  if (typeof window === 'undefined') return;
  posthog.identify(userId, properties);
}

export function resetAnalytics() {
  if (typeof window === 'undefined') return;
  posthog.reset();
}

export const analytics = {
  // Lifecycle
  signedUp: () => posthog.capture('signed_up'),
  onboardingCompleted: (properties?: { stepsCompleted: number }) =>
    posthog.capture('onboarding_completed', properties),

  // Transactions
  transactionLogged: (properties: {
    type: 'income' | 'expense' | 'transfer' | 'adjustment';
    bucket?: string;
  }) => posthog.capture('transaction_logged', properties),

  // Should I Buy It
  decisionOpened: () => posthog.capture('decision_opened'),
  decisionVerdictReceived: (properties: { verdict: string }) =>
    posthog.capture('decision_verdict_received', properties),

  // Monthly recap
  monthlyRecapViewed: () => posthog.capture('monthly_recap_viewed'),
  monthlyRecapShared: () => posthog.capture('monthly_recap_shared'),
};
