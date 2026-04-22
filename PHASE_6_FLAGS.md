# Phase 6 — Flagged Shared Components

Components used across multiple pages. Skipped during per-page theming 
(would create churn). Will be themed in a dedicated PR near the end of 
Phase 6, before Phase 6.10.

## Flagged

| Component | Path | Used on pages | Flagged in phase |
|-----------|------|---------------|------------------|
| HintCard | src/components/hint-card.tsx | accounts, dashboard, settings, goals, recurring, transaction-sheet | 6.1 |
| NextCycleModal | src/components/goals/next-cycle-modal.tsx | goals, transaction-sheet | 6.3 |

## How to use this file

- When Phase 6.X audits a shared component, add a row here and SKIP in that phase
- Before Phase 6.10, create `feat/theming-shared-components` branch to theme all flagged items in one PR
- Delete this file after Phase 6.10 (temporary Phase-6 artifact)
