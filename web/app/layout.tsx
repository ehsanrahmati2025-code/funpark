import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';
import InstallPrompt from '@/components/InstallPrompt';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'فان‌پارک';

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} | خرید آنلاین بلیط`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'فان‌پارک — خرید آنلاین بلیط پارک تفریحی، پارک آبی و شهر کودکان با ورود سریع از طریق QR',
  manifest: '/manifest.json',
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#7c3aed',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="flex min-h-screen flex-col">
        <Header />

        <main className="flex-1 pb-16 pt-6">{children}</main>

        <footer className="no-print border-t border-slate-200 bg-white py-6">
          <div className="container-app flex flex-col items-center justify-between gap-3 text-xs text-slate-500 sm:flex-row">
            <p>© {new Date().getFullYear()} {APP_NAME} — همه حقوق محفوظ است.</p>
            <p>ساخته‌شده با Next.js و Google Apps Script</p>
          </div>
        </footer>

        <InstallPrompt />
      </body>
    </html>
  );
}
