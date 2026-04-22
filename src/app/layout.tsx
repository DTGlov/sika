import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { PwaRegister } from '@/components/pwa-register';
import { PwaSplash } from '@/components/pwa-splash';
import { createClient } from '@/lib/supabase/server';
import { ProgressBarProvider } from '@/components/progress-bar';
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

async function getUserTheme(): Promise<'light' | 'dark'> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'dark';

    const { data: profile } = await supabase
      .from('profiles')
      .select('theme_preference')
      .eq('id', user.id)
      .maybeSingle();

    const pref = profile?.theme_preference;
    if (pref === 'light' || pref === 'dark') return pref;
    return 'dark';
  } catch {
    return 'dark';
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const userTheme = await getUserTheme();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme={userTheme}
          enableSystem={false}
          disableTransitionOnChange
          storageKey="sika-theme"
        >
          <ProgressBarProvider />
          <PwaSplash />
          {children}
          <Toaster richColors position="top-center" />
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
