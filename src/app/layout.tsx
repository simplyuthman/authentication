import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Authentication',
  description: 'Standalone authentication slice — create account, sign in, verify email, reset password.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
