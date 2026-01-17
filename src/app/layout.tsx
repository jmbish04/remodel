import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ultimate AI Architect',
  description: 'AI-powered floor plan digitization, 3D visualization, and interior design',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
