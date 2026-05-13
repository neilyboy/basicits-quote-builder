import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScopeForge — Quote Builder',
  description: 'Professional quote builder for installation services',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
