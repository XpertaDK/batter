import { getToken, getRefreshToken, setAuth, clearAuth } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

async function fetchWithAuth(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Try refresh on 401
  if (response.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${getToken()}`);
      response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    } else {
      clearAuth();
      window.location.href = '/login';
    }
  }

  return response;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    const user = JSON.parse(localStorage.getItem('batter_user') || '{}');
    setAuth(data.access_token, refreshToken, user);
    return true;
  } catch {
    return false;
  }
}

// Auth API
export async function login(username: string, password: string) {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }
  return res.json();
}

export async function checkNeedsSetup(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/api/v1/auth/needs-setup`);
  const data = await res.json();
  return data.needs_setup;
}

export async function setup(username: string, password: string, email?: string) {
  const res = await fetch(`${API_BASE}/api/v1/admin/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, email }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Setup failed');
  }
  return res.json();
}

export async function logout() {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    await fetch(`${API_BASE}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => {});
  }
  clearAuth();
}

// Device API
export interface DeviceInfo {
  serial: string;
  state: string;
  model: string;
  product: string;
  has_session: boolean;
  width?: number;
  height?: number;
  session_tier?: 'thumbnail' | 'full';
}

export async function listDevices(): Promise<DeviceInfo[]> {
  const res = await fetchWithAuth('/api/v1/devices');
  if (!res.ok) throw new Error('Failed to list devices');
  const data = await res.json();
  return data.devices;
}

export async function getDevice(serial: string): Promise<DeviceInfo> {
  const res = await fetchWithAuth(`/api/v1/devices/${encodeURIComponent(serial)}`);
  if (!res.ok) throw new Error('Failed to get device');
  return res.json();
}

export async function startSession(serial: string, maxSize?: number, maxFps?: number) {
  const res = await fetchWithAuth(`/api/v1/devices/${encodeURIComponent(serial)}/session/start`, {
    method: 'POST',
    body: JSON.stringify({ max_size: maxSize, max_fps: maxFps }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to start session');
  }
  return res.json();
}

export async function stopSession(serial: string) {
  const res = await fetchWithAuth(`/api/v1/devices/${encodeURIComponent(serial)}/session/stop`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to stop session');
  return res.json();
}

export async function upgradeSession(serial: string) {
  const res = await fetchWithAuth(`/api/v1/devices/${encodeURIComponent(serial)}/session/upgrade`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to upgrade session');
  return res.json();
}

export async function downgradeSession(serial: string) {
  const res = await fetchWithAuth(`/api/v1/devices/${encodeURIComponent(serial)}/session/downgrade`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to downgrade session');
  return res.json();
}

export async function wakeDevice(serial: string) {
  const res = await fetchWithAuth(`/api/v1/devices/${encodeURIComponent(serial)}/wake`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to wake device');
  return res.json();
}

export async function getDeviceHealth() {
  const res = await fetchWithAuth('/api/v1/devices/health');
  if (!res.ok) throw new Error('Failed to get health');
  return res.json();
}

// Group API
export interface DeviceGroup {
  id: string;
  name: string;
  description: string;
  color: string;
  member_count: number;
  created_at: string;
}

export async function listGroups(): Promise<DeviceGroup[]> {
  const res = await fetchWithAuth('/api/v1/groups');
  if (!res.ok) throw new Error('Failed to list groups');
  const data = await res.json();
  return data.groups;
}

export async function createGroup(name: string, description?: string, color?: string) {
  const res = await fetchWithAuth('/api/v1/groups', {
    method: 'POST',
    body: JSON.stringify({ name, description, color }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create group');
  }
  return res.json();
}

export async function deleteGroup(id: string) {
  const res = await fetchWithAuth(`/api/v1/groups/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete group');
  return res.json();
}

export async function getGroupDevices(id: string): Promise<string[]> {
  const res = await fetchWithAuth(`/api/v1/groups/${id}/devices`);
  if (!res.ok) throw new Error('Failed to get group devices');
  const data = await res.json();
  return data.serials;
}

export async function addDevicesToGroup(id: string, serials: string[]) {
  const res = await fetchWithAuth(`/api/v1/groups/${id}/devices`, {
    method: 'POST',
    body: JSON.stringify({ serials }),
  });
  if (!res.ok) throw new Error('Failed to add devices');
  return res.json();
}

export async function batchStartGroup(id: string, maxSize?: number, maxFps?: number) {
  const res = await fetchWithAuth(`/api/v1/groups/${id}/batch/start`, {
    method: 'POST',
    body: JSON.stringify({ max_size: maxSize, max_fps: maxFps }),
  });
  if (!res.ok) throw new Error('Failed to batch start');
  return res.json();
}

export async function batchStopGroup(id: string) {
  const res = await fetchWithAuth(`/api/v1/groups/${id}/batch/stop`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to batch stop');
  return res.json();
}
