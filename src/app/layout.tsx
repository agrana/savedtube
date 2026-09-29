import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';
import Footer from '@/components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SavedTube - Learning Paths',
  description:
    'Turn a learning goal into a guided path of YouTube lessons and focused practice.',
  icons: {
    icon: [
      {
        url: '/savedtube-logo-mystic-256.png',
        type: 'image/png',
        sizes: '256x256',
      },
    ],
    shortcut: '/savedtube-logo-mystic-256.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.className} flex flex-col min-h-screen`}
        suppressHydrationWarning
      >
        <Providers>
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
