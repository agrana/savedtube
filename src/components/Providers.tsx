'use client';

import { SessionProvider } from 'next-auth/react';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchInterval={5 * 60} // Refetch session every 5 minutes instead of default
      refetchOnWindowFocus={false} // Don't refetch when window gains focus
    >
      {children}
    </SessionProvider>
  );
}
