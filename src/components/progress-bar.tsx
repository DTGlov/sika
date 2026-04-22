'use client';

import { AppProgressBar as ProgressBar } from 'next-nprogress-bar';

export function ProgressBarProvider() {
  return (
    <ProgressBar
      height="2px"
      color="#00D9A3"
      options={{ showSpinner: false }}
      shallowRouting
    />
  );
}
