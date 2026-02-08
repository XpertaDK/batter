import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Batter - Remote Phone Management',
  description: 'Apache Guacamole-like remote Android device management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
