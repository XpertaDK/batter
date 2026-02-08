'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, isAdmin } from '@/lib/auth';
import {
  listUserGroups, createUserGroup, updateUserGroup, deleteUserGroup,
  listUserGroupMembers, addUserGroupMember, removeUserGroupMember,
  listUserGroupAccess, grantUserGroupAccess, revokeUserGroupAccess,
  listUsers, listGroups, listDevices,
  type UserGroup, type UserGroupMember, type UserGroupAccessGrant,
  type UserInfo, type DeviceGroup, type DeviceInfo,
} from '@/lib/api';

// Avatar color palette based on first letter
function getAvatarColor(name: string): { bg: string; text: string; border: string } {
  const letter = (name || '?')[0].toUpperCase();
  const code = letter.charCodeAt(0);
  if (code <= 68) return { bg: 'bg-blue-600/20', text: 'text-blue-400', border: 'border-blue-600/30' };
  if (code <= 72) return { bg: 'bg-green-600/20', text: 'text-green-400', border: 'border-green-600/30' };
  if (code <= 76) return { bg: 'bg-purple-600/20', text: 'text-purple-400', border: 'border-purple-600/30' };
  if (code <= 80) return { bg: 'bg-orange-600/20', text: 'text-orange-400', border: 'border-orange-600/30' };
  if (code <= 84) return { bg: 'bg-cyan-600/20', text: 'text-cyan-400', border: 'border-cyan-600/30' };
  return { bg: 'bg-pink-600/20', text: 'text-pink-400', border: 'border-pink-600/30' };
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

// SVG Icons
const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const SearchIcon = () => (
  <svg className="absolute left-2.5 top-2.5 w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const XIcon = () => (
  <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

type Tab = 'members' | 'access' | 'settings';

export default function UserGroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('members');

  // Data for expanded group
  const [members, setMembers] = useState<UserGroupMember[]>([]);
  const [grants, setGrants] = useState<UserGroupAccessGrant[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [allDeviceGroups, setAllDeviceGroups] = useState<DeviceGroup[]>([]);
  const [allDevices, setAllDevices] = useState<DeviceInfo[]>([]);

  // Search-to-add member
  const [memberSearch, setMemberSearch] = useState('');
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const memberSearchRef = useRef<HTMLDivElement>(null);

  // Add access form
  const [accessTarget, setAccessTarget] = useState<'device' | 'group'>('device');
  const [accessSerial, setAccessSerial] = useState('');
  const [accessGroupId, setAccessGroupId] = useState('');
  const [accessPermission, setAccessPermission] = useState('view');

  // Settings form
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
    if (!isAdmin()) { router.replace('/dashboard'); return; }
  }, [router]);

  const fetchGroups = useCallback(async () => {
    try {
      const data = await listUserGroups();
      setGroups(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (memberSearchRef.current && !memberSearchRef.current.contains(e.target as Node)) {
        setShowMemberDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleCreate = async () => {
    setError('');
    try {
      await createUserGroup(newName, newDescription);
      setNewName('');
      setNewDescription('');
      setShowCreate(false);
      fetchGroups();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create team');
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedGroup === id) {
      setExpandedGroup(null);
      return;
    }
    setExpandedGroup(id);
    setActiveTab('members');
    setConfirmDelete(false);
    loadGroupDetails(id);

    // Pre-fill settings
    const group = groups.find(g => g.id === id);
    if (group) {
      setEditName(group.name);
      setEditDescription(group.description || '');
    }
  };

  const loadGroupDetails = async (id: string) => {
    const [m, g, u, dg, d] = await Promise.all([
      listUserGroupMembers(id),
      listUserGroupAccess(id),
      listUsers(),
      listGroups(),
      listDevices(),
    ]);
    setMembers(m);
    setGrants(g);
    setAllUsers(u);
    setAllDeviceGroups(dg);
    setAllDevices(d);
    setMemberSearch('');
    setAccessSerial('');
    setAccessGroupId('');
    setAccessPermission('view');
  };

  const handleAddMember = async (groupId: string, userId: string) => {
    await addUserGroupMember(groupId, userId);
    setMemberSearch('');
    setShowMemberDropdown(false);
    loadGroupDetails(groupId);
    fetchGroups();
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    await removeUserGroupMember(groupId, userId);
    loadGroupDetails(groupId);
    fetchGroups();
  };

  const handleGrantAccess = async (groupId: string) => {
    const body: { device_serial?: string; group_id?: string; permission: string } = {
      permission: accessPermission,
    };
    if (accessTarget === 'device') {
      if (!accessSerial) return;
      body.device_serial = accessSerial;
    } else {
      if (!accessGroupId) return;
      body.group_id = accessGroupId;
    }
    await grantUserGroupAccess(groupId, body);
    loadGroupDetails(groupId);
  };

  const handleRevokeAccess = async (groupId: string, accessId: string) => {
    await revokeUserGroupAccess(groupId, accessId);
    loadGroupDetails(groupId);
  };

  const handleUpdateSettings = async (groupId: string) => {
    setSettingsError('');
    setSettingsSuccess('');
    try {
      await updateUserGroup(groupId, { name: editName, description: editDescription });
      setSettingsSuccess('Saved');
      fetchGroups();
      setTimeout(() => setSettingsSuccess(''), 2000);
    } catch (e: unknown) {
      setSettingsError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUserGroup(id);
      if (expandedGroup === id) setExpandedGroup(null);
      fetchGroups();
    } catch { /* ignore */ }
  };

  // Users not already in the group, filtered by search
  const availableUsers = allUsers
    .filter(u => !members.some(m => m.user_id === u.id))
    .filter(u => {
      if (!memberSearch) return true;
      const q = memberSearch.toLowerCase();
      return u.username.toLowerCase().includes(q) || (u.display_name || '').toLowerCase().includes(q);
    });

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h2 className="text-lg font-semibold text-white">Teams</h2>
          <p className="text-xs text-gray-500">{groups.length} team{groups.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
        >
          New Team
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-4">
          {showCreate && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Team name"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
                autoFocus
              />
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
              />
              {error && <div className="text-red-400 text-xs">{error}</div>}
              <div className="flex gap-2">
                <button onClick={handleCreate} className="px-3 py-2 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg">Create</button>
                <button onClick={() => { setShowCreate(false); setError(''); }} className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {groups.length === 0 && !showCreate && (
            <div className="text-center py-12 text-gray-500 text-sm">
              No teams yet. Create one to grant device access to groups of users.
            </div>
          )}

          {groups.map((group) => {
            const isExpanded = expandedGroup === group.id;
            const colors = getAvatarColor(group.name);
            const accessCount = isExpanded ? grants.length : 0;

            return (
              <div key={group.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                {/* Card header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-800/30"
                  onClick={() => toggleExpand(group.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-9 w-9 rounded-lg ${colors.bg} flex items-center justify-center ${colors.text} font-bold`}>
                      {group.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-medium">{group.name}</div>
                      {group.description && (
                        <div className="text-xs text-gray-500">{group.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Avatar stack for members (show when we have member data or from count) */}
                    {isExpanded && members.length > 0 && (
                      <div className="flex -space-x-2">
                        {members.slice(0, 3).map(m => {
                          const mc = getAvatarColor(m.display_name || m.username);
                          return (
                            <div key={m.user_id} className={`h-6 w-6 rounded-full ${mc.bg} border-2 border-gray-900 flex items-center justify-center text-[9px] ${mc.text} font-medium`}>
                              {getInitials(m.display_name || m.username)}
                            </div>
                          );
                        })}
                        {members.length > 3 && (
                          <div className="h-6 w-6 rounded-full bg-gray-800 border-2 border-gray-900 flex items-center justify-center text-[9px] text-gray-400 font-medium">
                            +{members.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <span>{group.member_count} member{group.member_count !== 1 ? 's' : ''}</span>
                      {isExpanded && (
                        <>
                          <span>&middot;</span>
                          <span>{accessCount} grant{accessCount !== 1 ? 's' : ''}</span>
                        </>
                      )}
                    </div>
                    <ChevronIcon expanded={isExpanded} />
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <>
                    {/* Tabs */}
                    <div className="flex border-t border-b border-gray-800 bg-gray-950/50">
                      {(['members', 'access', 'settings'] as Tab[]).map(tab => (
                        <button
                          key={tab}
                          onClick={() => { setActiveTab(tab); setConfirmDelete(false); }}
                          className={`px-5 py-2.5 text-xs font-medium border-b-2 ${
                            activeTab === tab
                              ? 'text-brand-400 border-brand-500'
                              : 'text-gray-500 hover:text-gray-300 border-transparent'
                          }`}
                        >
                          {tab === 'members' ? 'Members' : tab === 'access' ? 'Device Access' : 'Settings'}
                        </button>
                      ))}
                    </div>

                    {/* Tab content */}
                    <div className="p-5">
                      {activeTab === 'members' && (
                        <>
                          {/* Search to add */}
                          <div ref={memberSearchRef} className="relative mb-4">
                            <div className="relative">
                              <input
                                type="text"
                                value={memberSearch}
                                onChange={(e) => { setMemberSearch(e.target.value); setShowMemberDropdown(true); }}
                                onFocus={() => setShowMemberDropdown(true)}
                                placeholder="Search users to add..."
                                className="w-full pl-8 pr-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-600"
                              />
                              <SearchIcon />
                            </div>
                            {showMemberDropdown && memberSearch && availableUsers.length > 0 && (
                              <div className="absolute z-10 w-full mt-1 bg-gray-950 border border-gray-800 rounded-lg shadow-lg max-h-48 overflow-auto">
                                {availableUsers.slice(0, 8).map(u => {
                                  const uc = getAvatarColor(u.display_name || u.username);
                                  return (
                                    <button
                                      key={u.id}
                                      onClick={() => handleAddMember(group.id, u.id)}
                                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800/50 text-left"
                                    >
                                      <div className={`h-7 w-7 rounded-full ${uc.bg} flex items-center justify-center text-[10px] ${uc.text} font-medium`}>
                                        {getInitials(u.display_name || u.username)}
                                      </div>
                                      <div>
                                        <div className="text-sm text-white">{u.display_name || u.username}</div>
                                        <div className="text-[10px] text-gray-500">@{u.username}</div>
                                      </div>
                                      <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] ${roleBadgeClass(u.role)}`}>{u.role}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Member list */}
                          {members.length === 0 ? (
                            <p className="text-xs text-gray-500">No members yet. Search above to add users.</p>
                          ) : (
                            <div className="space-y-1">
                              {members.map(member => {
                                const mc = getAvatarColor(member.display_name || member.username);
                                return (
                                  <div key={member.user_id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-800/40 group">
                                    <div className="flex items-center gap-3">
                                      <div className={`h-8 w-8 rounded-full ${mc.bg} flex items-center justify-center ${mc.text} text-xs font-medium`}>
                                        {getInitials(member.display_name || member.username)}
                                      </div>
                                      <div>
                                        <div className="text-sm text-white">{member.display_name || member.username}</div>
                                        <div className="text-[10px] text-gray-500">@{member.username}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${roleBadgeClass(member.role)}`}>{member.role}</span>
                                      <button
                                        onClick={() => handleRemoveMember(group.id, member.user_id)}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/20 transition-opacity"
                                      >
                                        <XIcon />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}

                      {activeTab === 'access' && (
                        <>
                          {/* Access grants table */}
                          {grants.length === 0 ? (
                            <p className="text-xs text-gray-500 mb-4">No access grants yet.</p>
                          ) : (
                            <div className="space-y-1 mb-4">
                              {grants.map(grant => (
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
                                      onClick={() => handleRevokeAccess(group.id, grant.id)}
                                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/20 transition-opacity"
                                    >
                                      <XIcon />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add grant row */}
                          <div className="flex items-center gap-2 pt-2 border-t border-gray-800/50">
                            <select
                              value={accessTarget}
                              onChange={(e) => setAccessTarget(e.target.value as 'device' | 'group')}
                              className="px-2 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white"
                            >
                              <option value="device">Device</option>
                              <option value="group">Device Group</option>
                            </select>
                            {accessTarget === 'device' ? (
                              <select
                                value={accessSerial}
                                onChange={(e) => setAccessSerial(e.target.value)}
                                className="flex-1 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white"
                              >
                                <option value="">Select device...</option>
                                {allDevices.map(d => (
                                  <option key={d.serial} value={d.serial}>
                                    {d.nickname || d.model || d.serial}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                value={accessGroupId}
                                onChange={(e) => setAccessGroupId(e.target.value)}
                                className="flex-1 px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white"
                              >
                                <option value="">Select device group...</option>
                                {allDeviceGroups.map(g => (
                                  <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                              </select>
                            )}
                            <select
                              value={accessPermission}
                              onChange={(e) => setAccessPermission(e.target.value)}
                              className="px-2 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white"
                            >
                              <option value="view">view</option>
                              <option value="control">control</option>
                              <option value="manage">manage</option>
                            </select>
                            <button
                              onClick={() => handleGrantAccess(group.id)}
                              className="px-3 py-2 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
                            >
                              Grant
                            </button>
                          </div>
                        </>
                      )}

                      {activeTab === 'settings' && (
                        <div className="space-y-4">
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Team Name</label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white focus:outline-none focus:border-brand-600"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">Description</label>
                            <input
                              type="text"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded-lg text-xs text-white focus:outline-none focus:border-brand-600"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleUpdateSettings(group.id)}
                              className="px-3 py-2 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
                            >
                              Save Changes
                            </button>
                            {settingsSuccess && <span className="text-xs text-green-400">{settingsSuccess}</span>}
                            {settingsError && <span className="text-xs text-red-400">{settingsError}</span>}
                          </div>

                          <div className="pt-4 border-t border-gray-800">
                            {!confirmDelete ? (
                              <button
                                onClick={() => setConfirmDelete(true)}
                                className="px-3 py-2 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg"
                              >
                                Delete Team
                              </button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-400">Are you sure?</span>
                                <button
                                  onClick={() => handleDelete(group.id)}
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
