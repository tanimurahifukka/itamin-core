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

export interface EventFormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface AvailableEvent {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  remaining: number;
  price: number | null;
  image_url: string | null;
  form_schema: EventFormField[];
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

  getHaccpMonthlySubmissions: (storeId: string, year: number, month: number) =>
    kioskRequest<{
      days: Record<string, Record<string, { submitted: boolean; all_passed?: boolean; count?: number }>>;
      year: number;
      month: number;
    }>(`/kiosk/${storeId}/haccp/submissions/monthly?year=${year}&month=${month}`),

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

  getReservations: (storeId: string, date?: string) =>
    kioskRequest<{ reservations: Array<{
      id: string;
      reservation_type: string;
      status: string;
      starts_at: string;
      ends_at: string;
      party_size: number;
      customer_name: string;
      customer_phone: string | null;
      notes: string | null;
      confirmation_code: string;
      metadata: Record<string, unknown>;
      resource_ref: string | null;
    }> }>(`/kiosk/${storeId}/reservations${date ? `?date=${date}` : ''}`),

  getReservationsMonthly: (storeId: string, year: number, month: number) =>
    kioskRequest<{ days: Record<string, { count: number; types: string[] }> }>(
      `/kiosk/${storeId}/reservations/monthly?year=${year}&month=${month}`
    ),

  getEvents: (storeId: string) =>
    kioskRequest<{ events: Array<{
      id: string; store_id: string; title: string; description: string | null;
      starts_at: string; ends_at: string; capacity: number; price: number | null;
      image_url: string | null; status: string; sort_order: number;
      form_schema: EventFormField[];
    }> }>(`/kiosk/${storeId}/events`),

  createEvent: (storeId: string, data: {
    title: string; description?: string | null; starts_at: string; ends_at: string;
    capacity: number; price?: number | null; status?: string;
    form_schema?: EventFormField[];
  }) => kioskRequest<{ event: Record<string, unknown> }>(`/kiosk/${storeId}/events`, {
    method: 'POST', body: JSON.stringify(data),
  }),

  updateEvent: (storeId: string, eventId: string, patch: Record<string, unknown>) =>
    kioskRequest<{ event: Record<string, unknown> }>(`/kiosk/${storeId}/events/${eventId}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }),

  deleteEvent: (storeId: string, eventId: string) =>
    kioskRequest<{ ok: boolean }>(`/kiosk/${storeId}/events/${eventId}`, { method: 'DELETE' }),

  getAvailableEvents: (storeId: string) =>
    kioskRequest<{ events: AvailableEvent[] }>(`/kiosk/${storeId}/events/available`),

  bookEvent: (storeId: string, eventId: string, data: { responses: Record<string, unknown> }) =>
    kioskRequest<{ reservation: {
      id: string; confirmation_code: string;
      starts_at: string; ends_at: string; party_size: number;
    } }>(`/kiosk/${storeId}/events/${eventId}/book`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  updateReservationStatus: (storeId: string, reservationId: string, status: string) =>
    kioskRequest<{ ok: boolean }>(`/kiosk/${storeId}/reservations/${reservationId}/status`, {
      method: 'POST', body: JSON.stringify({ status }),
    }),

  getNfcLocationStatus: (storeId: string, locationId: string, date: string) =>
    kioskRequest<{ done: boolean; submitted_at?: string; staff_name?: string }>(
      `/kiosk/${storeId}/nfc-location-status?location_id=${locationId}&date=${date}`
    ),

  punch: (storeId: string, staffId: string, action: 'clock-in' | 'clock-out') =>
    kioskRequest<{ ok: boolean; action: string; clockIn?: string; clockOut?: string }>(
      `/kiosk/${storeId}/punch`,
      { method: 'POST', body: JSON.stringify({ staffId, action }) }
    ),
};
