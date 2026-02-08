'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, isAdmin } from '@/lib/auth';
import {
  listUsers, createUser, updateUser, deleteUser,
  listUserAccess, revokeUserAccess, resetPassword,
  listUserGroups, listUserGroupMembers,
  type UserInfo, type UserAccessGrant, type UserGroup, type UserGroupMember,
} from '@/lib/api';

// Avatar color palette based on first letter
function getAvatarColor(name: string): { bg: string; text: string } {
  const letter = (name || '?')[0].toUpperCase();
  const code = letter.charCodeAt(0);
  if (code <= 68) return { bg: 'bg-blue-600/20', text: 'text-blue-400' };
  if (code <= 72) return { bg: 'bg-green-600/20', text: 'text-green-400' };
  if (code <= 76) return { bg: 'bg-purple-600/20', text: 'text-purple-400' };
  if (code <= 80) return { bg: 'bg-orange-600/20', text: 'text-orange-400' };
  if (code <= 84) return { bg: 'bg-cyan-600/20', text: 'text-cyan-400' };
  return { bg: 'bg-pink-600/20', text: 'text-pink-400' };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function roleBadgeClass(role: string): string {
  if (role === 'admin') return 'bg-red-900/30 text-red-400';
  if (role === 'operator') return 'bg-blue-900/30 text-blue-400';
  return 'bg-gray-800 text-gray-400';
}

function permissionBadgeClass(perm: string): string {
  if (perm === 'manage') return 'bg-red-900/30 text-red-400';
  if (perm === 'control') return 'bg-blue-900/30 text-blue-400';
  return 'bg-gray-800 text-gray-400';
}

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const XIcon = () => (
  <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

type Tab = 'details' | 'access' | 'settings';

interface TeamMembership {
  teamId: string;
  teamName: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [error, setError] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('details');

  // Expanded user data
  const [userGrants, setUserGrants] = useState<UserAccessGrant[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);

  // Details tab
  const [editRole, setEditRole] = useState('');
  const [detailsSaved, setDetailsSaved] = useState('');

  // Settings tab
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    if (!isAdmin()) { router.replace('/dashboard'); return; }
  }, [router]);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await listUsers();
      setUsers(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    setError('');
    try {
      await createUser(newUsername, newPassword, newRole);
      setNewUsername('');
      setNewPassword('');
      setNewRole('viewer');
      setShowCreate(false);
      fetchUsers();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create user');
    }
  };

  const toggleExpand = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    setActiveTab('details');
    setConfirmDelete(false);
    setDeleteError('');
    setPwError('');
    setPwSuccess('');
    setNewPw('');

    const user = users.find(u => u.id === userId);
    if (user) setEditRole(user.role);

    loadUserDetails(userId);
  };

  const loadUserDetails = async (userId: string) => {
    try {
      const [grants, teams] = await Promise.all([
        listUserAccess(userId),
        loadTeamMemberships(userId),
      ]);
      setUserGrants(grants);
      setTeamMemberships(teams);
    } catch {
      setUserGrants([]);
      setTeamMemberships([]);
    }
  };

  const loadTeamMemberships = async (userId: string): Promise<TeamMembership[]> => {
    try {
      const teams = await listUserGroups();
      const memberships: TeamMembership[] = [];
      for (const team of teams) {
        const members = await listUserGroupMembers(team.id);
        if (members.some(m => m.user_id === userId)) {
          memberships.push({ teamId: team.id, teamName: team.name });
        }
      }
      return memberships;
    } catch {
      return [];
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUser(userId, { role: newRole });
      setEditRole(newRole);
      setDetailsSaved('Role updated');
      fetchUsers();
      setTimeout(() => setDetailsSaved(''), 2000);
    } catch { /* ignore */ }
  };

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      await updateUser(userId, { is_active: !isActive });
      setDetailsSaved(isActive ? 'Disabled' : 'Enabled');
      fetchUsers();
      setTimeout(() => setDetailsSaved(''), 2000);
    } catch { /* ignore */ }
  };

  const handleRevokeAccess = async (userId: string, accessId: string) => {
    await revokeUserAccess(userId, accessId);
    loadUserDetails(userId);
  };

  const handleResetPassword = async (userId: string) => {
    setPwError('');
    setPwSuccess('');
    try {
      await resetPassword(userId, newPw);
      setNewPw('');
      setPwSuccess('Password reset successfully');
      setTimeout(() => setPwSuccess(''), 3000);
    } catch (e: unknown) {
      setPwError(e instanceof Error ? e.message : 'Failed to reset password');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setDeleteError('');
    try {
      await deleteUser(userId);
      setExpandedUser(null);
      fetchUsers();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete user');
    }
  };

  const getExpandedUser = () => users.find(u => u.id === expandedUser);

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h2 className="text-lg font-semibold text-white">Users</h2>
          <p className="text-xs text-gray-500">{users.length} user{users.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
        >
          New User
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-4">
          {showCreate && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Username"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
                autoFocus
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Password (min 8 chars)"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white"
              >
                <option value="viewer">Viewer (watch only)</option>
                <option value="operator">Operator (view + control)</option>
                <option value="admin">Admin (full access)</option>
              </select>
              {error && <div className="text-red-400 text-xs">{error}</div>}
              <div className="flex gap-2">
                <button onClick={handleCreate} className="px-3 py-2 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg">Create</button>
                <button onClick={() => { setShowCreate(false); setError(''); }} className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {users.length === 0 && !showCreate && (
            <div className="text-center py-12 text-gray-500 text-sm">No users found.</div>
          )}

          {users.map(user => {
            const isExpanded = expandedUser === user.id;
            const colors = getAvatarColor(user.display_name || user.username);

            return (
              <div key={user.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                {/* Card header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-800/30"
                  onClick={() => toggleExpand(user.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-9 w-9 rounded-full ${colors.bg} flex items-center justify-center ${colors.text} font-bold text-sm`}>
                      {getInitials(user.display_name || user.username)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{user.display_name || user.username}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${roleBadgeClass(user.role)}`}>{user.role}</span>
                      </div>
                      <div className="text-xs text-gray-500">@{user.username}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-green-500' : 'bg-gray-600'}`} />
                      <span className="text-[10px] text-gray-500">{user.is_active ? 'Active' : 'Disabled'}</span>
                    </div>
                    <span className="text-[10px] text-gray-500">
                      {user.last_login_at ? `Last login ${new Date(user.last_login_at).toLocaleDateString()}` : 'Never logged in'}
                    </span>
                    <ChevronIcon expanded={isExpanded} />
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <>
                    {/* Tabs */}
                    <div className="flex border-t border-b border-gray-800 bg-gray-950/50">
                      {(['details', 'access', 'settings'] as Tab[]).map(tab => (
                        <button
                          key={tab}
                          onClick={() => { setActiveTab(tab); setConfirmDelete(false); }}
                          className={`px-5 py-2.5 text-xs font-medium border-b-2 ${
                            activeTab === tab
                              ? 'text-brand-400 border-brand-500'
                              : 'text-gray-500 hover:text-gray-300 border-transparent'
                          }`}
                        >
                          {tab === 'details' ? 'Details' : tab === 'access' ? 'Access' : 'Settings'}
                        </button>
                      ))}
                    </div>

                    {/* Tab content */}
                    <div className="p-5">
                      {activeTab === 'details' && (() => {
                        const u = getExpandedUser();
                        if (!u) return null;
                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Role</label>
                                <select
                                  value={editRole}
                                  onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                  className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white"
                                >
                                  <option value="viewer">Viewer</option>
                                  <option value="operator">Operator</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 mb-1">Status</label>
                                <button
                                  onClick={() => handleToggleActive(u.id, u.is_active)}
                                  className={`w-full px-3 py-2 rounded-lg text-xs text-left border ${
                                    u.is_active
                                      ? 'bg-green-900/10 border-green-800/30 text-green-400'
                                      : 'bg-gray-950 border-gray-800 text-gray-400'
                                  }`}
                                >
                                  {u.is_active ? 'Active (click to disable)' : 'Disabled (click to enable)'}
                                </button>
                              </div>
                            </div>
                            {detailsSaved && <span className="text-xs text-green-400">{detailsSaved}</span>}

                            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800/50">
                              <div>
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Last Login</span>
                                <div className="text-sm text-gray-300 mt-0.5">
                                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                                </div>
                              </div>
                              <div>
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Created</span>
                                <div className="text-sm text-gray-300 mt-0.5">
                                  {new Date(u.created_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {activeTab === 'access' && (
                        <div className="space-y-4">
                          {/* Direct access grants */}
                          <div>
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Direct Access</h4>
                            {userGrants.length === 0 ? (
                              <p className="text-xs text-gray-500">No direct access grants.</p>
                            ) : (
                              <div className="space-y-1">
                                {userGrants.map(grant => (
                                  <div key={grant.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-800/40 group">
                                    <div className="flex items-center gap-3">
                                      <div className="text-gray-500">
                                        {grant.device_serial ? (
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                        ) : (
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                        )}
                                      </div>
                                      <div>
                                        <div className="text-sm text-white">
                                          {grant.device_serial || grant.group_name || grant.group_id}
                                        </div>
                                        <div className="text-[10px] text-gray-500">
                                          {grant.device_serial ? 'Device' : 'Device Group'}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${permissionBadgeClass(grant.permission)}`}>{grant.permission}</span>
                                      <button
                                        onClick={() => handleRevokeAccess(expandedUser!, grant.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/20 transition-opacity"
                                      >
                                        <XIcon />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Team memberships */}
                          <div className="pt-2 border-t border-gray-800/50">
                            <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Team Memberships</h4>
                            {teamMemberships.length === 0 ? (
                              <p className="text-xs text-gray-500">Not a member of any team.</p>
                            ) : (
                              <div className="space-y-1">
                                {teamMemberships.map(tm => (
                                  <div key={tm.teamId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-800/20">
                                    <div className="text-gray-500">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                    </div>
                                    <span className="text-sm text-gray-300">{tm.teamName}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {activeTab === 'settings' && (
                        <div className="space-y-4">
                          {/* Reset password */}
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Reset Password</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="password"
                                value={newPw}
                                onChange={(e) => setNewPw(e.target.value)}
                                placeholder="New password (min 8 chars)"
                                className="flex-1 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
                              />
                              <button
                                onClick={() => handleResetPassword(expandedUser!)}
                                disabled={!newPw || newPw.length < 8}
                                className="px-3 py-2 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50"
                              >
                                Reset
                              </button>
                            </div>
                            {pwError && <div className="text-red-400 text-xs mt-1">{pwError}</div>}
                            {pwSuccess && <div className="text-green-400 text-xs mt-1">{pwSuccess}</div>}
                          </div>

                          {/* Delete user */}
                          <div className="pt-4 border-t border-gray-800">
                            {!confirmDelete ? (
                              <button
                                onClick={() => setConfirmDelete(true)}
                                className="px-3 py-2 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg"
                              >
                                Delete User
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-400">Are you sure? This cannot be undone.</span>
                                <button
                                  onClick={() => handleDeleteUser(expandedUser!)}
                                  className="px-3 py-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg"
                                >
                                  Yes, Delete
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(false)}
                                  className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                            {deleteError && <div className="text-red-400 text-xs mt-1">{deleteError}</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
