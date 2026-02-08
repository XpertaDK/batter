'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { DeviceGrid } from '@/components/device/device-grid';
import { listDevices, startSession, DeviceInfo } from '@/lib/api';
import { getToken } from '@/lib/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    const connected = devices.filter(d => d.state === 'device' && !d.has_session);
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

  const connectedCount = devices.filter(d => d.state === 'device').length;
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
              {connectedCount} connected, {sessionCount} streaming
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDevices}
              className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg"
            >
              Refresh
            </button>
            {connectedCount > sessionCount && (
              <button
                onClick={handleStartAll}
                className="px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-700 text-white rounded-lg"
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
            <DeviceGrid devices={devices} onDeviceClick={handleDeviceClick} />
          )}
        </div>
      </div>
    </div>
  );
}
