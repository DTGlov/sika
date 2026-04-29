# Hooks

## Feature Flags

Feature flags are managed via PostHog and let us ship experimental features
to specific users only.

### Pattern

```tsx
import { useFeatureFlag } from '@/hooks/use-feature-flag';

function MyComponent() {
  const newFeatureEnabled = useFeatureFlag('experimental_my_feature');

  if (newFeatureEnabled) return <NewFeatureUI />;
  return <CurrentUI />;
}
```

For multi-variant tests use `useFeatureFlagVariant('flag_key')`, which
returns the variant string the user is bucketed into (or `null`).

### Setup in PostHog dashboard

1. Feature Flags → Create new flag → key e.g. `experimental_my_feature`
2. Targeting: User properties → `email = your-email@…`
3. Save. The flag is now active only for the targeted users.

### Conventions

- `experimental_*` for in-development features behind a personal/internal
  flag (one or two users).
- `beta_*` for pre-release features rolling out to a wider cohort.
- When a feature ships generally, **remove the flag entirely** and the
  surrounding `useFeatureFlag` call. Don't accumulate flag debt.
