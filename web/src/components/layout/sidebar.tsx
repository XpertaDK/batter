'use client';

import { usePathname, useRouter } from 'next/navigation';
import { getUser, isAdmin } from '@/lib/auth';
import { logout } from '@/lib/api';

const navItems = [
  { href: '/dashboard', label: 'Devices', icon: '📱' },
  { href: '/groups', label: 'Groups', icon: '📁' },
];

const adminItems = [
  { href: '/admin/users', label: 'Users', icon: '👤' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col h-screen">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">Batter</h1>
        <p className="text-[10px] text-gray-500">Remote Phone Management</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-brand-600/20 text-brand-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          );
        })}

        {isAdmin() && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-[10px] uppercase tracking-wider text-gray-600">Admin</span>
            </div>
            {adminItems.map((item) => {
              const active = pathname === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? 'bg-brand-600/20 text-brand-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </a>
              );
            })}
          </>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-200">{user?.display_name || user?.username}</div>
            <div className="text-[10px] text-gray-500 capitalize">{user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
