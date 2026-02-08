'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { DeviceGrid } from '@/components/device/device-grid';
import { DeviceWizard } from '@/components/device/device-wizard';
import { DeviceEditModal } from '@/components/device/device-edit-modal';
import { listDevices, startSession, deleteDevice, DeviceInfo } from '@/lib/api';
import { getToken, getUser } from '@/lib/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [editSerial, setEditSerial] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
  }, [router]);

  const fetchDevices = useCallback(async () => {
    try {
      const data = await listDevices();
      setDevices(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const handleStartAll = async () => {
    const connected = devices.filter(d => d.status === 'connected' && !d.has_session);
    for (const d of connected) {
      try {
        await startSession(d.serial, 360, 5); // thumbnail tier
      } catch {
        // skip failed
      }
    }
    fetchDevices();
  };

  const handleDeviceClick = (serial: string) => {
    router.push(`/devices/${encodeURIComponent(serial)}`);
  };

  const handleEdit = (serial: string) => {
    setEditSerial(serial);
  };

  const handleDelete = async (serial: string) => {
    try {
      await deleteDevice(serial);
      fetchDevices();
    } catch {
      // ignore
    }
  };

  const [canAddDevice, setCanAddDevice] = useState(false);

  useEffect(() => {
    const u = getUser();
    setCanAddDevice(u?.role === 'admin' || u?.role === 'operator');
  }, []);

  const totalCount = devices.length;
  const connectedCount = devices.filter(d => d.status === 'connected').length;
  const sessionCount = devices.filter(d => d.has_session).length;

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Devices</h2>
            <p className="text-xs text-gray-500">
              {totalCount} registered, {connectedCount} connected, {sessionCount} streaming
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDevices}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg"
            >
              Refresh
            </button>
            {canAddDevice && (
              <button
                onClick={() => setShowWizard(true)}
                className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
              >
                Add Device
              </button>
            )}
            {connectedCount > sessionCount && (
              <button
                onClick={handleStartAll}
                className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg"
              >
                Start All Sessions
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-gray-500 text-sm">Loading devices...</div>
          ) : error ? (
            <div className="text-red-400 text-sm">{error}</div>
          ) : (
            <DeviceGrid
              devices={devices}
              onDeviceClick={handleDeviceClick}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>
      </div>

      {showWizard && (
        <DeviceWizard
          onClose={() => setShowWizard(false)}
          onComplete={() => {
            setShowWizard(false);
            fetchDevices();
          }}
        />
      )}

      {editSerial && (
        <DeviceEditModal
          device={devices.find(d => d.serial === editSerial) || null}
          onClose={() => setEditSerial(null)}
          onSaved={() => {
            setEditSerial(null);
            fetchDevices();
          }}
          onDeleted={() => {
            setEditSerial(null);
            fetchDevices();
          }}
        />
      )}
    </div>
  );
}
