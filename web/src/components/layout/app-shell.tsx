'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';

const NO_SIDEBAR_ROUTES = ['/login', '/setup'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = !NO_SIDEBAR_ROUTES.some(r => pathname.startsWith(r));

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
