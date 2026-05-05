export type PwaMode = 'standalone' | 'browser';
export type Platform = 'ios-safari' | 'android-chrome' | 'desktop' | 'other';

/** Returns true if the app is running as an installed PWA. */
export function isInPWA(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Detects the user's browser/platform for tailored install instructions. */
export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'other';

  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream;
  const isAndroid = /Android/.test(ua);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
  const isMobile = isIOS || isAndroid;

  if (isIOS && isSafari) return 'ios-safari';
  if (isAndroid && isChrome) return 'android-chrome';
  if (!isMobile) return 'desktop';
  return 'other';
}

/** True if user is on a platform that supports PWA install. */
export function canInstallPWA(): boolean {
  const platform = detectPlatform();
  return platform === 'ios-safari' || platform === 'android-chrome';
}
