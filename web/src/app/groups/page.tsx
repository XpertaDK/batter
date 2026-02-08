'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import {
  listGroups, createGroup, deleteGroup, listDevices,
  addDevicesToGroup, batchStartGroup, batchStopGroup,
  DeviceGroup, DeviceInfo
} from '@/lib/api';
import { getToken } from '@/lib/auth';

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    if (!getToken()) { router.replace('/login'); return; }
  }, [router]);

  const refresh = useCallback(async () => {
    const [g, d] = await Promise.all([listGroups(), listDevices()]);
    setGroups(g);
    setDevices(d);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createGroup(newName.trim(), newDesc.trim() || undefined);
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
    refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteGroup(id);
    refresh();
  };

  const handleBatchStart = async (id: string) => {
    await batchStartGroup(id, 360, 5);
    refresh();
  };

  const handleBatchStop = async (id: string) => {
    await batchStopGroup(id);
    refresh();
  };

  const handleAddAllDevices = async (id: string) => {
    const connected = devices.filter(d => d.state === 'device').map(d => d.serial);
    if (connected.length > 0) {
      await addDevicesToGroup(id, connected);
      refresh();
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Device Groups</h2>
            <p className="text-xs text-gray-500">{groups.length} groups</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
          >
            New Group
          </button>
        </div>

        <div className="p-6 space-y-4">
          {showCreate && (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Group name"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded text-sm text-white"
                autoFocus
              />
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2 bg-gray-950 border border-gray-800 rounded text-sm text-white"
              />
              <div className="flex gap-2">
                <button onClick={handleCreate} className="px-3 py-1.5 text-xs bg-brand-600 text-white rounded">Create</button>
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs bg-gray-800 text-gray-300 rounded">Cancel</button>
              </div>
            </div>
          )}

          {groups.length === 0 && !showCreate ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No groups yet. Create one to organize your devices.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                      <span className="text-sm font-medium text-white">{group.name}</span>
                      <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
                        {group.member_count} devices
                      </span>
                    </div>
                    {group.description && (
                      <p className="text-xs text-gray-500 mt-1">{group.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAddAllDevices(group.id)}
                      className="px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
                    >
                      Add All Connected
                    </button>
                    <button
                      onClick={() => handleBatchStart(group.id)}
                      className="px-2 py-1 text-[10px] bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded"
                    >
                      Start All
                    </button>
                    <button
                      onClick={() => handleBatchStop(group.id)}
                      className="px-2 py-1 text-[10px] bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 rounded"
                    >
                      Stop All
                    </button>
                    <button
                      onClick={() => handleDelete(group.id)}
                      className="px-2 py-1 text-[10px] bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
