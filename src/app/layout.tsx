import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { PwaRegister } from '@/components/pwa-register';
import { createClient } from '@/lib/supabase/server';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Sika — Track Your Money',
  description: 'Bold personal finance for Ghana. Track spending, savings, and investments.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sika',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0A0A0B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let initialResolvedTheme: 'light' | 'dark' = 'dark';

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('theme_preference')
        .eq('id', user.id)
        .single();

      const pref = profile?.theme_preference;
      if (pref === 'light') initialResolvedTheme = 'light';
      else if (pref === 'dark') initialResolvedTheme = 'dark';
      // 'auto' or null stays 'dark' — client flips to OS preference on mount
    }
  } catch {
    // default to dark
  }

  return (
    <html
      lang="en"
      data-theme={initialResolvedTheme}
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased" style={{ background: 'var(--bg-page)', color: 'var(--text-fg)' }}>
        {children}
        <Toaster richColors position="top-center" />
        <PwaRegister />
      </body>
    </html>
  );
}
