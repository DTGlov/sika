'use client';

import { detectPlatform, isInPWA, type Platform } from '@/lib/pwa';
import { useEffect, useState } from 'react';

export function PwaInstallGuide() {
  const [platform, setPlatform] = useState<Platform>('other');
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isInPWA());
  }, []);

  if (installed) {
    return (
      <div className="bg-accent/10 border border-accent/30 rounded-2xl p-4 text-center">
        <p className="text-accent font-medium">✓ Sika is installed on your home screen</p>
      </div>
    );
  }

  if (platform === 'ios-safari') return <IosSafariInstructions />;
  if (platform === 'android-chrome') return <AndroidChromeInstructions />;
  if (platform === 'desktop') return <DesktopInstructions />;
  return <GenericInstructions />;
}

function IosSafariInstructions() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add Sika to your home screen for the full experience including push notifications.
      </p>

      <ol className="space-y-4">
        <Step number={1} label="Tap the Share button at the bottom of Safari">
          <ShareIconSvg />
        </Step>

        <Step number={2} label='Scroll down and tap "Add to Home Screen"'>
          <AddToHomeScreenSvg />
        </Step>

        <Step number={3} label='Tap "Add" in the top right'>
          <AddConfirmSvg />
        </Step>

        <Step number={4} label="Open Sika from your home screen">
          <HomeScreenIconSvg />
        </Step>
      </ol>
    </div>
  );
}

function AndroidChromeInstructions() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Add Sika to your home screen for the full experience including push notifications.
      </p>

      <ol className="space-y-4">
        <Step number={1} label="Tap the menu (three dots) at the top right">
          <ChromeMenuSvg />
        </Step>

        <Step number={2} label='Tap "Install app" or "Add to Home Screen"'>
          <InstallAppSvg />
        </Step>

        <Step number={3} label='Confirm by tapping "Install"'>
          <InstallConfirmSvg />
        </Step>

        <Step number={4} label="Open Sika from your home screen">
          <HomeScreenIconSvg />
        </Step>
      </ol>
    </div>
  );
}

function DesktopInstructions() {
  return (
    <div className="bg-muted rounded-xl p-4 text-sm text-muted-foreground text-center">
      Open Sika on your phone (Safari on iOS, Chrome on Android) to install it and get the full experience.
    </div>
  );
}

function GenericInstructions() {
  return (
    <div className="bg-muted rounded-xl p-4 text-sm text-muted-foreground text-center">
      Look for &ldquo;Install app&rdquo; or &ldquo;Add to Home Screen&rdquo; in your browser menu.
    </div>
  );
}

function Step({
  number,
  label,
  children,
}: {
  number: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 items-start">
      <span className="bg-accent text-accent-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
        {number}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <div className="mt-2 bg-card border border-border rounded-lg p-3 inline-flex text-foreground">
          {children}
        </div>
      </div>
    </li>
  );
}

function ShareIconSvg() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="14" width="24" height="20" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M20 8 L20 24 M14 14 L20 8 L26 14"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AddToHomeScreenSvg() {
  return (
    <svg width="160" height="40" viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="156" height="36" rx="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="8" y="11" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <line x1="17" y1="14" x2="17" y2="26" stroke="currentColor" strokeWidth="1.5" />
      <line x1="11" y1="20" x2="23" y2="20" stroke="currentColor" strokeWidth="1.5" />
      <text x="32" y="24" fontSize="11" fill="currentColor" fontFamily="system-ui, sans-serif">
        Add to Home Screen
      </text>
    </svg>
  );
}

function AddConfirmSvg() {
  return (
    <svg width="60" height="30" viewBox="0 0 60 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="56" height="26" rx="13" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
      <text x="30" y="19" fontSize="11" fontWeight="600" fill="currentColor" textAnchor="middle" fontFamily="system-ui, sans-serif">
        Add
      </text>
    </svg>
  );
}

function HomeScreenIconSvg() {
  return (
    <svg width="44" height="50" viewBox="0 0 44 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="2" width="32" height="32" rx="8" fill="#0E1A2E" />
      <ellipse cx="22" cy="18" rx="8" ry="10" fill="#D4A017" />
      <line x1="22" y1="10" x2="22" y2="26" stroke="#0E1A2E" strokeWidth="1" />
      <text x="22" y="46" fontSize="9" fill="currentColor" textAnchor="middle" fontFamily="system-ui, sans-serif">
        Sika
      </text>
    </svg>
  );
}

function ChromeMenuSvg() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="10" r="2.5" fill="currentColor" />
      <circle cx="20" cy="20" r="2.5" fill="currentColor" />
      <circle cx="20" cy="30" r="2.5" fill="currentColor" />
    </svg>
  );
}

function InstallAppSvg() {
  return (
    <svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="116" height="36" rx="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path
        d="M14 14 L14 26 L8 20 M14 26 L20 20"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="28" y="24" fontSize="11" fill="currentColor" fontFamily="system-ui, sans-serif">
        Install app
      </text>
    </svg>
  );
}

function InstallConfirmSvg() {
  return (
    <svg width="72" height="30" viewBox="0 0 72 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="68" height="26" rx="6" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1.5" />
      <text x="36" y="19" fontSize="11" fontWeight="600" fill="currentColor" textAnchor="middle" fontFamily="system-ui, sans-serif">
        Install
      </text>
    </svg>
  );
}
