import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Inside · Company Intranet', description: 'Internal company community' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
