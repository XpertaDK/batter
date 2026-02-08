'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { getToken, isAdmin } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface UserInfo {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    if (!isAdmin()) { router.replace('/dashboard'); return; }
  }, [router]);

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/v1/users`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    setError('');
    const res = await fetch(`${API_BASE}/api/v1/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        username: newUsername,
        password: newPassword,
        role: newRole,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      setError(err.error || 'Failed to create user');
      return;
    }
    setNewUsername('');
    setNewPassword('');
    setNewRole('viewer');
    setShowCreate(false);
    fetchUsers();
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">User Management</h2>
            <p className="text-xs text-gray-500">{users.length} users</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
          >
            New User
          </button>
        </div>

        <div className="p-6 space-y-4">
          {showCreate && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Username"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded text-sm text-white"
                autoFocus
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password (min 8 chars)"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded text-sm text-white"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded text-sm text-white"
              >
                <option value="viewer">Viewer (watch only)</option>
                <option value="operator">Operator (view + control)</option>
                <option value="admin">Admin (full access)</option>
              </select>
              {error && <div className="text-red-400 text-xs">{error}</div>}
              <div className="flex gap-2">
                <button onClick={handleCreate} className="px-3 py-1.5 text-xs bg-brand-600 text-white rounded">Create</button>
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs bg-gray-800 text-gray-300 rounded">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  <th className="text-left px-4 py-2">Username</th>
                  <th className="text-left px-4 py-2">Role</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-800/50">
                    <td className="px-4 py-2">
                      <div className="text-white">{user.display_name}</div>
                      <div className="text-[10px] text-gray-500">@{user.username}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                        user.role === 'admin' ? 'bg-red-900/30 text-red-400' :
                        user.role === 'operator' ? 'bg-blue-900/30 text-blue-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs ${user.is_active ? 'text-green-400' : 'text-gray-500'}`}>
                        {user.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
