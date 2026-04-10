const API_BASE = '/api';
const TOKEN_KEY = 'itamin_kiosk_token';
const STORE_KEY = 'itamin_kiosk_store';

export function getKioskToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getKioskStore(): { storeId: string; storeName: string } | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveKioskSession(token: string, storeId: string, storeName: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(STORE_KEY, JSON.stringify({ storeId, storeName }));
}

export function clearKioskSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(STORE_KEY);
}

async function kioskRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getKioskToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    const err = Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
    throw err;
  }
  return res.json();
}

export const kioskApi = {
  login: (storeId: string, pin: string) =>
    kioskRequest<{ token: string; storeName: string; storeId: string }>(
      `/kiosk/${storeId}/login`,
      { method: 'POST', body: JSON.stringify({ pin }) }
    ),

  getStaff: (storeId: string) =>
    kioskRequest<{
      staff: Array<{
        id: string;
        name: string;
        role: string;
        clockedIn: boolean;
        openRecordId: string | null;
        clockInTime: string | null;
      }>;
    }>(`/kiosk/${storeId}/staff`),

  getShifts: (storeId: string, date?: string) =>
    kioskRequest<{
      shifts: Array<{ id: string; staffId: string; date: string; startTime: string; endTime: string; breakMinutes: number; staffName: string }>;
      date?: string;
    }>(`/kiosk/${storeId}/shifts${date ? `?date=${date}` : ''}`),

  getShiftRange: (storeId: string, startDate: string, endDate: string) =>
    kioskRequest<{
      shifts: Array<{ id: string; staffId: string; date: string; startTime: string; endTime: string; breakMinutes: number; staffName: string }>;
      startDate: string; endDate: string;
    }>(`/kiosk/${storeId}/shifts?startDate=${startDate}&endDate=${endDate}`),

  getShiftRequests: (storeId: string, startDate: string, endDate: string) =>
    kioskRequest<{
      requests: Array<{ id: string; staffId: string; staffName: string; date: string; requestType: string; startTime?: string; endTime?: string; note?: string }>;
    }>(`/kiosk/${storeId}/shift-requests?startDate=${startDate}&endDate=${endDate}`),

  createShift: (storeId: string, data: { staffId: string; date: string; startTime: string; endTime: string; breakMinutes?: number }) =>
    kioskRequest<{ ok: boolean }>(
      `/kiosk/${storeId}/shifts`,
      { method: 'POST', body: JSON.stringify(data) }
    ),

  deleteShift: (storeId: string, shiftId: string) =>
    kioskRequest<{ ok: boolean }>(
      `/kiosk/${storeId}/shifts/${shiftId}`,
      { method: 'DELETE' }
    ),

  getEnabledPlugins: (storeId: string) =>
    kioskRequest<{ plugins: string[] }>(`/kiosk/${storeId}/enabled-plugins`),

  getHaccpTemplates: (storeId: string, timing?: string) =>
    kioskRequest<{ templates: Array<{
      id: string; name: string; timing: string; description?: string;
      items: Array<{ id: string; label: string; item_type: string; required: boolean; min_value?: number; max_value?: number; unit?: string; options?: string[] }>;
    }> }>(`/kiosk/${storeId}/haccp/templates${timing ? `?timing=${timing}` : ''}`),

  submitHaccp: (storeId: string, data: { template_id: string; membership_id: string; timing: string; items: Record<string, unknown>[] }) =>
    kioskRequest<{ ok: boolean; submissionId: string }>(
      `/kiosk/${storeId}/haccp/submissions`,
      { method: 'POST', body: JSON.stringify(data) }
    ),

  getHaccpSubmissions: (storeId: string, date?: string) =>
    kioskRequest<{ submissions: Array<{ id: string; templateId: string; templateName: string; timing: string; submittedAt: string; submittedBy: string }> }>(
      `/kiosk/${storeId}/haccp/submissions${date ? `?date=${date}` : ''}`
    ),

  getSwitchBotDevices: (storeId: string) =>
    kioskRequest<{ devices: Array<{ deviceId: string; deviceName: string; deviceType: string }> }>(
      `/kiosk/${storeId}/switchbot`
    ),

  getSwitchBotStatus: (storeId: string, deviceId: string) =>
    kioskRequest<{ temperature: number | null; humidity: number | null; battery: number | null }>(
      `/kiosk/${storeId}/switchbot/${deviceId}`
    ),

  getSwitchBotReadings: (storeId: string, date: string) =>
    kioskRequest<{
      devices: Array<{
        deviceId: string;
        deviceName: string;
        readings: Array<{
          temperature: number | null;
          humidity: number | null;
          battery: number | null;
          recordedAt: string;
        }>;
      }>;
    }>(`/kiosk/${storeId}/switchbot/readings?date=${date}`),

  punch: (storeId: string, staffId: string, action: 'clock-in' | 'clock-out') =>
    kioskRequest<{ ok: boolean; action: string; clockIn?: string; clockOut?: string }>(
      `/kiosk/${storeId}/punch`,
      { method: 'POST', body: JSON.stringify({ staffId, action }) }
    ),
};
